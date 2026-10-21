// Đồng bộ online qua Google Drive (thư mục ẩn của app). Không phụ thuộc nền tảng: nhận một CloudStore.
//
// Cấu trúc trên Drive (cùng một tài khoản Google):
//   hcn-vault.json                    kho: mã kho + email chủ tài khoản (máy nào khác email → bị chặn)
//   hcn-dev-<deviceId>.json           dữ liệu + dấu đồng bộ của TỪNG máy (máy chỉ ghi file của mình → không ghi đè nhau)
//   hcn-backup-day-YYYYMMDD.json      sao lưu hằng ngày (giữ 14 bản)
//   hcn-backup-pre-<stamp>.json       sao lưu trước khi ghi đè / xóa (giữ 10 bản)
// Gộp: dữ liệu các máy khác gộp lại = "Drive"; máy này gộp với "Drive" bằng cùng thuật toán như đồng bộ Wi-Fi
// (bản sửa sau cùng thắng, dấu xóa, hỏi khi sắp xóa nhiều).
import type { Data } from './model.ts';
import { emptyData } from './model.ts';
import { emptyMeta, isMeta, mergeData, needsChoice, sameData, stampChanges, syncStats } from './sync.ts';
import type { SyncGuard, SyncMeta, SyncMode, SyncStats } from './sync.ts';
import { normalizeData } from './migrate.ts';

export interface CloudFile {
  id: string;
  name: string;
  modifiedTime: string;
  size?: number;
}

/** Thao tác tối thiểu trên thư mục ẩn của app (Drive thật hoặc bản giả để test) */
export interface CloudStore {
  list(): Promise<CloudFile[]>;
  read(id: string): Promise<string>;
  create(name: string, text: string): Promise<CloudFile>;
  update(id: string, text: string): Promise<CloudFile>;
  remove(id: string): Promise<void>;
  /** giờ máy chủ (ms) theo phản hồi gần nhất, nếu biết */
  serverTime(): number | null;
}

export class CloudError extends Error {
  code: 'relogin' | 'network' | 'full' | 'rate' | 'server' | 'config' | 'cancel' | 'scope';
  constructor(code: CloudError['code'], message?: string) {
    super(message ?? code);
    this.code = code;
  }
}

/** Hạn chờ cho một thao tác mạng: quá hạn → lỗi mạng (thao tác treo không được giữ khóa đồng bộ mãi) */
export function withTimeout<T>(p: Promise<T>, ms: number, what = 'timeout'): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const t = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new CloudError('network', what)), ms);
  });
  return Promise.race([p, t]).finally(() => clearTimeout(timer));
}

export const VAULT_NAME = 'hcn-vault.json';
export const devName = (id: string) => `hcn-dev-${id}.json`;
const DEV_RE = /^hcn-dev-([\w-]+)\.json$/;
const DAY_PREFIX = 'hcn-backup-day-';
const PRE_PREFIX = 'hcn-backup-pre-';
export const KEEP_DAY = 14;
export const KEEP_PRE = 10;
/** file của máy lâu không đồng bộ (gần hạn xóa dấu xóa 180 ngày) thì bỏ qua để việc đã xóa không sống lại */
export const STALE_DEVICE_MS = 150 * 24 * 3600 * 1000;

export interface CloudVault {
  v: 1;
  vaultId: string;
  ownerEmail: string;
  createdAt: number;
}
export interface CloudDeviceFile {
  v: 1;
  deviceId: string;
  deviceName: string;
  platform: string;
  at: number;
  sum: string;
  data: Data;
  meta: SyncMeta;
}

/** Trạng thái lưu trên máy (không chứa mã đăng nhập) */
export interface CloudLocalState {
  deviceId: string;
  vaultId: string | null;
  /** email của kho đã liên kết */
  email: string | null;
  firstDone: boolean;
  lastSync: string | null;
  /** tổng kiểm tra của lần tải lên gần nhất (không đổi thì không tải lại) */
  uploadedSum: string | null;
}
export const initCloudState = (deviceId: string): CloudLocalState => ({ deviceId, vaultId: null, email: null, firstDone: false, lastSync: null, uploadedSum: null });

/** Mã kiểm tra nhanh (cyrb53) để phát hiện file hỏng / tải lên dở */
export function checksum(s: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < s.length; i++) {
    const ch = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16);
}
const body = (data: Data, meta: SyncMeta) => JSON.stringify({ data, meta });

export function encodeDevice(f: Omit<CloudDeviceFile, 'sum' | 'v'>): string {
  return JSON.stringify({ v: 1, ...f, sum: checksum(body(f.data, f.meta)) });
}
/** Đọc file của một máy; hỏng / sai tổng kiểm tra → null (bỏ qua, dùng bản đọc được trước đó) */
export function decodeDevice(text: string): CloudDeviceFile | null {
  try {
    const j = JSON.parse(text) as CloudDeviceFile;
    if (j?.v !== 1 || !j.data || !isMeta(j.meta) || typeof j.sum !== 'string') return null;
    if (checksum(body(j.data, j.meta)) !== j.sum) return null;
    return { ...j, data: normalizeData(j.data as unknown as Record<string, unknown>) };
  } catch {
    return null;
  }
}

const p2 = (n: number) => String(n).padStart(2, '0');
const ymd = (t: number) => {
  const d = new Date(t);
  return `${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}`;
};
const stamp = (t: number) => {
  const d = new Date(t);
  return `${ymd(t)}-${p2(d.getHours())}${p2(d.getMinutes())}${p2(d.getSeconds())}`;
};

export type CloudOutcome =
  | { kind: 'ok'; data: Data; meta: SyncMeta; mode: SyncMode; changed: boolean; recreated: boolean; devices: number }
  | { kind: 'choice'; stats: SyncStats }
  | { kind: 'wrongAccount'; owner: string };

export interface CloudSyncArgs {
  local: { data: Data; meta: SyncMeta };
  state: CloudLocalState;
  /** email tài khoản Google đang đăng nhập trên máy này */
  email: string;
  deviceName: string;
  platform: string;
  /** người dùng đã chọn cách; không có = tự động (gộp, hỏi khi rủi ro) */
  mode?: SyncMode;
  /** chỉ xem trước (luôn trả `choice`, không ghi gì) */
  preview?: boolean;
  now: () => number;
  /** sao lưu dữ liệu trên máy trước khi bị thay / xóa */
  backupLocal?: (data: Data, reason: string) => Promise<void> | void;
  newId?: () => string;
  /** bộ nhớ đệm file các máy khác (đọc lại chỉ khi Drive báo file đổi) */
  cache?: Map<string, { modifiedTime: string; file: CloudDeviceFile | null }>;
}

const sameEmail = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * Một lần đồng bộ với Drive. Trả kết quả + trạng thái mới (người gọi lưu lại).
 * Không bao giờ ghi file của máy khác; chỉ ghi kho (lần đầu), file của máy này và bản sao lưu.
 */
export async function cloudSync(store: CloudStore, a: CloudSyncArgs): Promise<{ outcome: CloudOutcome; state: CloudLocalState }> {
  const now = a.now;
  const newId = a.newId ?? (() => Math.random().toString(16).slice(2, 10) + Date.now().toString(16));
  let state = { ...a.state };
  // máy đã liên kết một tài khoản → chỉ đồng bộ đúng tài khoản đó (đăng nhập nhầm tài khoản khác thì chặn hẳn)
  if (state.email && !sameEmail(state.email, a.email)) return { outcome: { kind: 'wrongAccount', owner: state.email }, state };
  const files = await store.list();
  const byName = new Map(files.map((f) => [f.name, f]));

  // 1) Kho + kiểm tra cùng tài khoản
  let recreated = false;
  // hai máy cùng liên kết lần đầu có thể tạo hai kho: mọi máy cùng chọn kho tạo sớm nhất
  const vfs = files.filter((f) => f.name === VAULT_NAME);
  let vf: CloudFile | undefined;
  let vault: CloudVault | null = null;
  for (const f of vfs) {
    try {
      const v = JSON.parse(await store.read(f.id)) as CloudVault;
      if (!v?.vaultId || !v.ownerEmail) continue;
      if (!vault || v.createdAt < vault.createdAt || (v.createdAt === vault.createdAt && v.vaultId < vault.vaultId)) {
        vault = v;
        vf = f;
      }
    } catch (e) {
      if (e instanceof CloudError) throw e;
    }
  }
  vf = vf ?? vfs[0];
  if (!vault || !vault.vaultId || !vault.ownerEmail) {
    // chưa có kho (lần đầu) hoặc kho bị xóa: tạo lại từ máy này (Drive trống nên không xóa gì trên máy)
    recreated = !!state.vaultId;
    vault = { v: 1, vaultId: newId(), ownerEmail: a.email, createdAt: now() };
    const text = JSON.stringify(vault);
    if (vf) await store.update(vf.id, text);
    else await store.create(VAULT_NAME, text);
  }
  if (!sameEmail(vault.ownerEmail, a.email)) return { outcome: { kind: 'wrongAccount', owner: vault.ownerEmail }, state };
  if (state.vaultId !== vault.vaultId) {
    // liên kết lần đầu / kho mới: lần đồng bộ đầu sẽ hỏi nếu hai bên khác nhau
    state = { ...state, vaultId: vault.vaultId, email: vault.ownerEmail, firstDone: false, uploadedSum: null };
  }

  // 2) Gộp dữ liệu các máy khác thành "Drive"
  const t = now();
  let remote = emptyData();
  let remoteMeta = emptyMeta();
  let devices = 0;
  for (const f of files) {
    const m = DEV_RE.exec(f.name);
    if (!m || m[1] === state.deviceId) continue;
    let dev: CloudDeviceFile | null;
    const c = a.cache?.get(f.id);
    if (c && c.modifiedTime === f.modifiedTime) dev = c.file;
    else {
      try {
        dev = decodeDevice(await store.read(f.id));
      } catch (e) {
        if (e instanceof CloudError) throw e;
        dev = null;
      }
      // file hỏng: giữ bản đọc được lần trước (nếu có)
      if (!dev && c?.file) dev = c.file;
      a.cache?.set(f.id, { modifiedTime: f.modifiedTime, file: dev });
    }
    if (!dev || t - dev.at > STALE_DEVICE_MS) continue;
    const r = mergeData(remote, remoteMeta, dev.data, dev.meta, t);
    remote = r.data;
    remoteMeta = r.meta;
    devices++;
  }

  // 3) Có cần hỏi?
  const guard: SyncGuard = a.preview ? 'preview' : a.mode ? 'off' : state.firstDone ? 'normal' : 'first';
  const stats = syncStats(remote, remoteMeta, a.local.data, a.local.meta, t);
  if (needsChoice(stats, guard)) return { outcome: { kind: 'choice', stats }, state };

  // 4) Kết quả theo cách chọn
  const mode: SyncMode = a.mode ?? 'merge';
  let data: Data;
  let meta: SyncMeta;
  if (mode === 'pull') {
    data = remote;
    meta = remoteMeta;
  } else if (mode === 'push') {
    const base = mergeData(remote, remoteMeta, a.local.data, a.local.meta, t).meta;
    data = a.local.data;
    meta = stampChanges(remote, a.local.data, base, t);
  } else {
    const r = mergeData(remote, remoteMeta, a.local.data, a.local.meta, t);
    data = r.data;
    meta = r.meta;
  }

  // 5) Sao lưu trước khi thay / xóa
  const localLoses = mode === 'pull' ? stats.phoneOnly + stats.differ > 0 : mode === 'merge' && stats.phone.del > 0;
  const driveLoses = mode === 'push' ? stats.pcOnly + stats.differ > 0 : mode === 'merge' && stats.pc.del > 0;
  if (localLoses) await a.backupLocal?.(a.local.data, 'cloud');
  if (driveLoses && devices > 0) {
    await store.create(`${PRE_PREFIX}${stamp(t)}-${state.deviceId}.json`, JSON.stringify({ v: 1, at: t, data: remote }));
  }

  // 6) Ghi file của máy này (chỉ khi đổi)
  const text = encodeDevice({ deviceId: state.deviceId, deviceName: a.deviceName, platform: a.platform, at: t, data, meta });
  const sum = checksum(body(data, meta));
  const own = byName.get(devName(state.deviceId));
  // ghi lại ít nhất mỗi ngày để file không bị coi là "lâu không đồng bộ"
  if (sum !== state.uploadedSum || !own || t - Date.parse(own.modifiedTime) > 24 * 3600 * 1000) {
    if (own) await store.update(own.id, text);
    else await store.create(devName(state.deviceId), text);
  }

  // 7) Sao lưu hằng ngày + dọn bớt
  const dayName = `${DAY_PREFIX}${ymd(t)}.json`;
  if (!byName.has(dayName)) await store.create(dayName, JSON.stringify({ v: 1, at: t, data }));
  const prune = async (prefix: string, keep: number, extra = 0) => {
    const list = files.filter((f) => f.name.startsWith(prefix)).sort((x, y) => (x.name < y.name ? 1 : -1));
    for (const f of list.slice(Math.max(0, keep - extra))) await store.remove(f.id).catch(() => undefined);
  };
  await prune(DAY_PREFIX, KEEP_DAY, byName.has(dayName) ? 0 : 1);
  await prune(PRE_PREFIX, KEEP_PRE, driveLoses && devices > 0 ? 1 : 0);

  state = { ...state, firstDone: true, uploadedSum: sum, lastSync: new Date(t).toISOString() };
  return { outcome: { kind: 'ok', data, meta, mode, changed: !sameData(data, a.local.data), recreated, devices }, state };
}

// ---------- Bản sao lưu trên Drive ----------

export interface CloudBackup {
  id: string;
  name: string;
  kind: 'day' | 'pre';
  at: string;
  size?: number;
}

export async function listCloudBackups(store: CloudStore): Promise<CloudBackup[]> {
  const files = await store.list();
  return files
    .filter((f) => f.name.startsWith(DAY_PREFIX) || f.name.startsWith(PRE_PREFIX))
    .map((f) => ({ id: f.id, name: f.name, kind: (f.name.startsWith(DAY_PREFIX) ? 'day' : 'pre') as CloudBackup['kind'], at: f.modifiedTime, size: f.size }))
    .sort((x, y) => (x.at < y.at ? 1 : -1));
}

export async function readCloudBackup(store: CloudStore, id: string): Promise<Data> {
  const j = JSON.parse(await store.read(id)) as { data?: unknown };
  if (!j || typeof j.data !== 'object' || !j.data) throw new CloudError('server', 'bad-backup');
  return normalizeData(j.data as Record<string, unknown>);
}

// ---------- Lệch giờ ----------

/** Giờ máy lệch giờ Google quá 2 phút → dùng giờ Google để đóng dấu sửa */
export const SKEW_LIMIT = 2 * 60 * 1000;
export function clockOffset(serverMs: number | null, localMs: number): number {
  if (serverMs === null) return 0;
  const d = serverMs - localMs;
  return Math.abs(d) > SKEW_LIMIT ? d : 0;
}
