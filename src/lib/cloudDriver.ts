// Điều phối đồng bộ Google Drive trên một máy (PC hoặc Android): đăng nhập, lịch tự đồng bộ,
// hỏi cách đồng bộ khi rủi ro, sao lưu trên Drive, sửa lệch giờ. Chạy song song với đồng bộ Wi-Fi/cáp.
import type { Data } from '../core/model.ts';
import type { SyncMeta, SyncMode, SyncStats } from '../core/sync.ts';
import { clockOffset, CloudError, cloudSync, initCloudState, listCloudBackups, readCloudBackup } from '../core/cloudSync.ts';
import type { CloudBackup, CloudDeviceFile, CloudLocalState, CloudStore } from '../core/cloudSync.ts';
import { clockNow, setClockOffset } from '../core/clock.ts';
import type { GoogleAuth } from './googleAuth.ts';

export interface CloudInfo {
  /** bản này đã có mã dự án Google chưa */
  configured: boolean;
  signedIn: boolean;
  /** email đang đăng nhập */
  email: string | null;
  /** email chủ kho đã liên kết */
  vaultEmail: string | null;
  /** tài khoản đang đăng nhập khác chủ kho → bị chặn */
  wrongOwner: string | null;
  auto: boolean;
  lastSync: string | null;
  lastError: string | null;
  busy: boolean;
  signingIn: boolean;
  choice: SyncStats | null;
  /** số máy khác đang dùng chung kho */
  devices: number;
  /** giờ máy lệch giờ Google (phút, 0 nếu không đáng kể) */
  skewMin: number;
}
export type CloudAction =
  | { type: 'signIn' }
  | { type: 'signOut' }
  | { type: 'syncNow' }
  | { type: 'preview' }
  | { type: 'resolve'; mode: SyncMode }
  | { type: 'dismiss' }
  | { type: 'setAuto'; on: boolean }
  | { type: 'listBackups' }
  | { type: 'readBackup'; id: string };
export type CloudActionResult = CloudInfo & { error?: string; backups?: CloudBackup[]; backupData?: Data };

export const emptyCloudInfo = (configured = false): CloudInfo => ({
  configured,
  signedIn: false,
  email: null,
  vaultEmail: null,
  wrongOwner: null,
  auto: true,
  lastSync: null,
  lastError: null,
  busy: false,
  signingIn: false,
  choice: null,
  devices: 0,
  skewMin: 0
});

interface Persist extends CloudLocalState {
  auto: boolean;
}

export interface CloudDriverDeps {
  configured: boolean;
  auth: GoogleAuth | null;
  makeStore(): CloudStore;
  loadState(): Promise<Persist | null>;
  saveState(s: Persist): Promise<void>;
  /** dữ liệu mới nhất trên máy (sau khi giao diện ghi nốt) */
  getLocal(): Promise<{ data: Data; meta: SyncMeta }>;
  /** áp kết quả: pull → thay toàn bộ; còn lại → gộp với thay đổi phát sinh trong lúc chờ */
  applyResult(data: Data, meta: SyncMeta, mode: SyncMode): Promise<void>;
  backupLocal(data: Data, reason: string): Promise<void>;
  deviceName: string;
  platform: string;
  newId(): string;
  log?: { info(m: string): void; warn(m: string): void };
  /** chu kỳ tự đồng bộ (mặc định 2 phút) */
  intervalMs?: number;
}

export function createCloudDriver(d: CloudDriverDeps) {
  let st: Persist = { ...initCloudState(d.newId()), auto: true };
  let loaded = false;
  let busy: Promise<string | undefined> | null = null;
  let signingIn = false;
  let lastError: string | null = null;
  let choice: SyncStats | null = null;
  let choiceIsPreview = false;
  let wrongOwner: string | null = null;
  let devices = 0;
  let skew = 0;
  let timer: ReturnType<typeof setInterval> | undefined;
  let soon: ReturnType<typeof setTimeout> | undefined;
  const cache = new Map<string, { modifiedTime: string; file: CloudDeviceFile | null }>();
  const save = () => d.saveState(st).catch(() => undefined);

  async function init(): Promise<void> {
    if (loaded) return;
    const s = await d.loadState().catch(() => null);
    if (s?.deviceId) st = { ...st, ...s };
    else await save();
    await d.auth?.init();
    loaded = true;
  }

  function info(): CloudInfo {
    return {
      configured: d.configured,
      signedIn: !!d.auth?.signedIn(),
      email: d.auth?.email() ?? null,
      vaultEmail: st.email,
      wrongOwner,
      auto: st.auto,
      lastSync: st.lastSync,
      lastError,
      busy: !!busy,
      signingIn,
      choice,
      devices,
      skewMin: Math.round(skew / 60_000)
    };
  }

  const codeOf = (e: unknown) => (e instanceof CloudError ? e.code : 'server');

  async function run(opts: { mode?: SyncMode; preview?: boolean }): Promise<string | undefined> {
    if (!d.configured || !d.auth?.signedIn()) return 'relogin';
    const email = d.auth.email()!;
    try {
      const store = d.makeStore();
      const local = await d.getLocal();
      const r = await cloudSync(store, {
        local,
        state: st,
        email,
        deviceName: d.deviceName,
        platform: d.platform,
        mode: opts.mode,
        preview: opts.preview,
        now: clockNow,
        backupLocal: (data, reason) => d.backupLocal(data, reason),
        newId: d.newId,
        cache
      });
      // lệch giờ: lấy giờ Google làm chuẩn cho dấu giờ sửa
      skew = clockOffset(store.serverTime(), Date.now());
      setClockOffset(skew);
      st = { ...st, ...r.state };
      const o = r.outcome;
      if (o.kind === 'wrongAccount') {
        wrongOwner = o.owner;
        lastError = 'wrongAccount';
        await save();
        return 'wrongAccount';
      }
      wrongOwner = null;
      if (o.kind === 'choice') {
        choice = o.stats;
        choiceIsPreview = !!opts.preview;
        lastError = null;
        await save();
        return 'choice';
      }
      devices = o.devices;
      if (o.changed || o.mode === 'pull') await d.applyResult(o.data, o.meta, o.mode);
      choice = null;
      lastError = null;
      if (o.recreated) d.log?.warn('Kho dữ liệu trên Drive đã bị xóa; đã tạo lại từ máy này');
      await save();
      return undefined;
    } catch (e) {
      lastError = codeOf(e);
      d.log?.warn(`Đồng bộ Drive lỗi: ${(e as Error).message}`);
      return lastError;
    }
  }

  /** chạy tuần tự: không bao giờ hai lần đồng bộ Drive chen nhau */
  function exclusive(fn: () => Promise<string | undefined>): Promise<string | undefined> {
    const prev = busy ?? Promise.resolve(undefined);
    const p = prev.catch(() => undefined).then(fn);
    busy = p.finally(() => {
      if (busy === p) busy = null;
    }) as Promise<string | undefined>;
    return p;
  }

  async function autoSync(): Promise<void> {
    if (!loaded || !st.auto || busy || choice || wrongOwner || !d.auth?.signedIn()) return;
    await exclusive(() => run({}));
  }

  return {
    init,
    info,
    /** máy này vừa có thay đổi → đồng bộ sau ít giây (gom nhiều lần sửa liên tiếp) */
    localChanged(delayMs = 15_000): void {
      clearTimeout(soon);
      soon = setTimeout(() => void autoSync(), delayMs);
    },
    /** mở app / quay lại app */
    resume(): void {
      clearTimeout(soon);
      soon = setTimeout(() => void autoSync(), 1500);
    },
    start(): void {
      clearInterval(timer);
      timer = setInterval(() => void autoSync(), d.intervalMs ?? 120_000);
      this.resume();
    },
    stop(): void {
      clearInterval(timer);
      clearTimeout(soon);
    },
    async action(a: CloudAction): Promise<CloudActionResult> {
      await init();
      switch (a.type) {
        case 'signIn': {
          if (!d.configured || !d.auth) return { ...info(), error: 'config' };
          signingIn = true;
          try {
            await d.auth.signIn();
            lastError = null;
            // máy đã liên kết tài khoản khác → không tự đổi: lần đồng bộ sẽ báo "khác tài khoản"
            // (muốn đổi: Hủy liên kết rồi đăng nhập tài khoản mới)
            await save();
          } catch (e) {
            return { ...info(), error: codeOf(e) };
          } finally {
            signingIn = false;
          }
          const err = await exclusive(() => run({}));
          return { ...info(), error: err === 'choice' ? undefined : err };
        }
        case 'signOut':
          await d.auth?.signOut();
          // hủy liên kết: quên kho; dữ liệu trên máy và trên Drive giữ nguyên
          st = { ...st, vaultId: null, email: null, firstDone: false, uploadedSum: null, lastSync: null };
          choice = null;
          wrongOwner = null;
          lastError = null;
          cache.clear();
          await save();
          return info();
        case 'syncNow': {
          const err = await exclusive(() => run({}));
          return { ...info(), error: err === 'choice' ? undefined : err };
        }
        case 'preview': {
          const err = await exclusive(() => run({ preview: true }));
          return { ...info(), error: err === 'choice' ? undefined : err };
        }
        case 'resolve': {
          const err = await exclusive(() => run({ mode: a.mode }));
          return { ...info(), error: err };
        }
        case 'dismiss':
          if (choiceIsPreview) choice = null;
          return info();
        case 'setAuto':
          st = { ...st, auto: a.on };
          await save();
          if (a.on) this.resume();
          return info();
        case 'listBackups':
          try {
            if (!d.auth?.signedIn()) return { ...info(), error: 'relogin' };
            if (wrongOwner) return { ...info(), error: 'wrongAccount' };
            return { ...info(), backups: await listCloudBackups(d.makeStore()) };
          } catch (e) {
            return { ...info(), error: codeOf(e) };
          }
        case 'readBackup':
          try {
            if (wrongOwner) return { ...info(), error: 'wrongAccount' };
            return { ...info(), backupData: await readCloudBackup(d.makeStore(), a.id) };
          } catch (e) {
            return { ...info(), error: codeOf(e) };
          }
      }
    }
  };
}
export type CloudDriver = ReturnType<typeof createCloudDriver>;
