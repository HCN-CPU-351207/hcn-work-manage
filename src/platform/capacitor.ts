// Nền tảng Android (Capacitor): lưu dữ liệu trong bộ nhớ của app, đồng bộ với PC qua Wi-Fi,
// xuất file qua menu Chia sẻ, thông báo cục bộ, nút Back.
import { App } from '@capacitor/app';
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import { LocalNotifications } from '@capacitor/local-notifications';
import { Share } from '@capacitor/share';
import type { HcnApi, LoadNotice, SyncActionResult, SyncInfo, UpdateEvent } from '../core/api.ts';
import { emptySyncInfo } from '../core/api.ts';
import { RELEASES_API, isNewer, parseRelease } from '../core/version.ts';
import { createDataHub } from '../core/dataHub.ts';
import type { DataHub } from '../core/dataHub.ts';
import { parseImport } from '../core/migrate.ts';
import { defaultSettings, emptyData, toBackup } from '../core/model.ts';
import type { Data, Level, Settings } from '../core/model.ts';
import { initMeta, isMeta } from '../core/sync.ts';
import type { SyncGuard, SyncMeta, SyncMode, SyncStats } from '../core/sync.ts';
import { diagnose, discoverHubs, localPrefixes, pairAuto, routeKind, SyncHttpError, syncSmart } from '../lib/syncClient.ts';
import type { LocalNet } from '../lib/syncClient.ts';
import { localNets, syncFetch } from './netInfo.ts';
import { androidLogin, postFormAndroid } from './cloudAndroid.ts';
import { GOOGLE_CONFIG } from '../config/google.ts';
import { createCloudDriver } from '../lib/cloudDriver.ts';
import type { CloudDriver } from '../lib/cloudDriver.ts';
import { createDriveStore } from '../lib/drive.ts';
import { createGoogleAuth, randomString } from '../lib/googleAuth.ts';
import type { StoredGoogle } from '../lib/googleAuth.ts';
import { clockNow } from '../core/clock.ts';
import { fillWorkbook } from '../lib/xlsxBuild.ts';

const DIR = Directory.Data;
const ROOT = 'hcn';
const p2 = (n: number) => String(n).padStart(2, '0');
const stamp = (d = new Date()) => `${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}-${p2(d.getHours())}${p2(d.getMinutes())}${p2(d.getSeconds())}`;
const ymd = (d = new Date()) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;

interface ClientState {
  addr: string | null;
  token: string | null;
  hubName: string | null;
  lastSync: string | null;
  lastError: string | null;
  lastChanges: number | null;
  /** mọi địa chỉ đã biết của PC (Wi-Fi, USB, Bluetooth) */
  hosts?: string[];
  /** mã nhận dạng của PC đã ghép đôi (không nhầm sang PC khác cùng IP) */
  hubId?: string | null;
  /** false: vừa ghép đôi, lần đồng bộ đầu sẽ hỏi lấy dữ liệu bên nào nếu hai bên khác nhau */
  firstDone?: boolean;
}
interface SyncFile {
  v: 1;
  meta: SyncMeta;
  client: ClientState;
}

async function readText(path: string): Promise<string | null> {
  try {
    const r = await Filesystem.readFile({ path: `${ROOT}/${path}`, directory: DIR, encoding: Encoding.UTF8 });
    return typeof r.data === 'string' ? r.data : await r.data.text();
  } catch {
    return null;
  }
}

/** Ghi an toàn: ghi ra .new, xóa bản cũ, đổi tên. Lúc đọc, thiếu bản chính thì dùng .new */
async function writeAtomic(path: string, text: string): Promise<void> {
  const full = `${ROOT}/${path}`;
  await Filesystem.writeFile({ path: `${full}.new`, data: text, directory: DIR, encoding: Encoding.UTF8, recursive: true });
  try {
    await Filesystem.deleteFile({ path: full, directory: DIR });
  } catch {
    /* chưa có file */
  }
  await Filesystem.rename({ from: `${full}.new`, to: full, directory: DIR, toDirectory: DIR });
}

async function readWithFallback(path: string): Promise<string | null> {
  return (await readText(path)) ?? (await readText(`${path}.new`));
}

async function listDir(path: string): Promise<string[]> {
  try {
    const r = await Filesystem.readdir({ path: `${ROOT}/${path}`, directory: DIR });
    return r.files.map((f) => (typeof f === 'string' ? f : f.name));
  } catch {
    return [];
  }
}

let permOk: boolean | null = null;
async function notifyPermission(): Promise<boolean> {
  if (permOk) return true;
  let perm = await LocalNotifications.checkPermissions();
  if (perm.display !== 'granted') perm = await LocalNotifications.requestPermissions();
  permOk = perm.display === 'granted';
  return permOk;
}

function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

/** Ghi file vào bộ nhớ tạm rồi mở menu Chia sẻ (Lưu vào Drive, Gửi Zalo, Gmail…) */
async function shareFile(name: string, data: string, base64: boolean): Promise<{ ok: boolean; canceled?: boolean; error?: string; path?: string }> {
  try {
    await Filesystem.writeFile({ path: name, data, directory: Directory.Cache, ...(base64 ? {} : { encoding: Encoding.UTF8 }) });
    const { uri } = await Filesystem.getUri({ path: name, directory: Directory.Cache });
    await Share.share({ title: name, url: uri, dialogTitle: name });
    return { ok: true, path: name };
  } catch (e) {
    const msg = (e as Error)?.message ?? String(e);
    if (/cancel/i.test(msg)) return { ok: false, canceled: true };
    return { ok: false, error: msg };
  }
}

/** Chọn file .json bằng hộp chọn file của Android */
function pickJsonFile(): Promise<{ name: string; text: string } | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    let settled = false;
    const done = (v: { name: string; text: string } | null) => {
      if (settled) return;
      settled = true;
      window.removeEventListener('focus', onFocus);
      resolve(v);
    };
    // người dùng bấm Hủy: không có sự kiện change, nên chờ cửa sổ có lại focus
    const onFocus = () => setTimeout(() => !input.files?.length && done(null), 1200);
    input.onchange = async () => {
      const f = input.files?.[0];
      if (!f) return done(null);
      done({ name: f.name, text: await f.text() });
    };
    window.addEventListener('focus', onFocus);
    input.click();
  });
}

export function createCapacitorApi(): HcnApi {
  let hub: DataHub | null = null;
  let client: ClientState = { addr: null, token: null, hubName: null, lastSync: null, lastError: null, lastChanges: null };
  let writes: Promise<unknown> = Promise.resolve();
  let flushCb: (() => Promise<void> | void) | null = null;
  const externalCbs = new Set<(d: Data, rev: number) => void>();
  const updateCbs = new Set<(e: UpdateEvent) => void>();
  const emitUpd = (e: UpdateEvent) => {
    for (const cb of updateCbs) cb(e);
  };
  // Tự cập nhật: hỏi GitHub bản phát hành mới nhất; có bản mới thì hiện nút tải file .apk
  let updUrl: string | null = null;
  let updChecking = false;
  const UPD_KEY = 'hcn.updCheckedAt';
  const UPD_EVERY = 6 * 3600_000;
  async function checkUpdate(manual: boolean): Promise<void> {
    if (updChecking) return;
    updChecking = true;
    if (manual) emitUpd({ type: 'checking' });
    try {
      try {
        localStorage.setItem(UPD_KEY, String(Date.now()));
      } catch {
        /* bỏ qua */
      }
      const res = await fetch(RELEASES_API, { headers: { Accept: 'application/vnd.github+json' } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const rel = parseRelease(await res.json());
      const cur = (await App.getInfo()).version;
      if (rel && rel.apkUrl && isNewer(cur, rel.version)) {
        updUrl = rel.apkUrl;
        emitUpd({ type: 'downloaded', version: rel.version });
      } else emitUpd({ type: 'not-available', manual });
    } catch (e) {
      emitUpd({ type: 'error', message: (e as Error).message, manual });
    } finally {
      updChecking = false;
    }
  }
  function maybeCheckUpdate(): void {
    let last = 0;
    try {
      last = Number(localStorage.getItem(UPD_KEY) ?? 0);
    } catch {
      /* bỏ qua */
    }
    if (Date.now() - last >= UPD_EVERY) void checkUpdate(false);
  }
  let syncTimer: ReturnType<typeof setTimeout> | undefined;
  let inflight: Promise<string | undefined> | null = null;
  /** mạng của điện thoại đọc gần nhất (để biết đang đi qua Wi-Fi hay USB / Bluetooth) */
  let lastNets: LocalNet[] | null = null;
  /** lần tự quét tìm PC gần nhất (quét tự động tối đa 2 phút một lần cho đỡ tốn pin) */
  let lastAutoScan = 0;
  /** dải mạng lúc quét gần nhất / lần đồng bộ đang chạy */
  let lastScanSig = '';
  let scanSig = '';
  /** đồng bộ đang chờ người dùng chọn cách (tự đồng bộ tạm dừng cho tới khi chọn) */
  let choice: SyncStats | null = null;
  /** choice đến từ nút "Chọn chiều đồng bộ" (chỉ xem) chứ không phải do bị chặn */
  let choiceIsPreview = false;
  const readNets = async () => {
    lastNets = await localNets();
    return lastNets;
  };

  /** ghi tuần tự để các lần ghi không chen nhau */
  const queue = (fn: () => Promise<void>) => {
    writes = writes.then(fn, fn).catch(() => undefined);
    return writes;
  };
  const persistData = () => {
    const d = hub!.state.data;
    return queue(() => writeAtomic('data.json', JSON.stringify(d)));
  };
  const persistSync = () => {
    const f: SyncFile = { v: 1, meta: hub!.state.meta, client };
    return queue(() => writeAtomic('sync.json', JSON.stringify(f)));
  };
  // ---------- Đồng bộ online qua Google Drive (song song với Wi-Fi / cáp) ----------
  const googleOn = !!GOOGLE_CONFIG.androidClientId;
  const auth = googleOn
    ? createGoogleAuth({
        clientId: GOOGLE_CONFIG.androidClientId,
        postForm: postFormAndroid,
        interactive: androidLogin(),
        async load(): Promise<StoredGoogle | null> {
          const t = await readText('google.json');
          return t ? (JSON.parse(t) as StoredGoogle) : null;
        },
        async save(v) {
          if (v) await writeAtomic('google.json', JSON.stringify(v));
          else await Filesystem.deleteFile({ path: `${ROOT}/google.json`, directory: DIR }).catch(() => undefined);
        }
      })
    : null;
  const cloud: CloudDriver = createCloudDriver({
    configured: googleOn,
    auth,
    makeStore: () => createDriveStore({ fetchFn: (u, i) => fetch(u, i), accessToken: (f) => auth!.accessToken(f) }),
    loadState: async () => JSON.parse((await readText('cloud.json')) ?? 'null'),
    saveState: async (st) => {
      await queue(() => writeAtomic('cloud.json', JSON.stringify(st)));
    },
    getLocal: async () => {
      await flushCb?.();
      await writes;
      return { data: hub!.state.data, meta: hub!.state.meta };
    },
    applyResult: async (d, m, mode) => {
      let changed = true;
      let rev: number;
      if (mode === 'pull') rev = hub!.reset(d, m);
      else {
        const a = hub!.adoptFromHub(d, m, clockNow());
        changed = a.changed;
        rev = a.rev;
        if (a.needsResync) cloud.localChanged(3000);
      }
      if (changed) {
        void persistData();
        for (const cb of externalCbs) cb(hub!.state.data, rev);
        scheduleSync(2000); // báo tiếp cho PC qua Wi-Fi nếu đang nối
      }
      void persistSync();
    },
    backupLocal: async (d) => {
      await writeAtomic(`backups/hcn-pre-sync-${stamp()}-cloud.json`, JSON.stringify(toBackup(d, new Date().toISOString())));
    },
    deviceName: 'Android',
    platform: 'android',
    newId: () => randomString(9).replace(/[^\w-]/g, 'x')
  });


  async function autoBackup(data: Data): Promise<void> {
    const today = stamp().slice(0, 8);
    const files = (await listDir('backups')).filter((n) => n.startsWith('hcn-auto-')).sort();
    if (files.some((n) => n.startsWith(`hcn-auto-${today}`))) return;
    await writeAtomic(`backups/hcn-auto-${stamp()}.json`, JSON.stringify(toBackup(data, new Date().toISOString())));
    for (const old of files.slice(0, Math.max(0, files.length + 1 - 7))) {
      try {
        await Filesystem.deleteFile({ path: `${ROOT}/backups/${old}`, directory: DIR });
      } catch {
        /* bỏ qua */
      }
    }
  }

  function info(): SyncInfo {
    return {
      ...emptySyncInfo('client'),
      enabled: !!client.token,
      hubAddr: client.addr,
      hubHosts: client.hosts ?? [],
      hubName: client.hubName,
      lastSync: client.lastSync,
      lastError: client.lastError,
      lastChanges: client.lastChanges,
      busy: !!inflight,
      route: client.addr ? routeKind(client.addr, lastNets) : null,
      choice
    };
  }

  function scheduleSync(ms: number): void {
    if (!client.token) return;
    clearTimeout(syncTimer);
    syncTimer = setTimeout(() => void syncNow(), ms);
  }

  async function doSync(manual: boolean, mode?: SyncMode, preview = false): Promise<string | undefined> {
    if (!hub || !client.token || !client.addr) return 'unpaired';
    // đang chờ chọn cách đồng bộ: tự động thì không gửi gì
    if (choice && !mode && !manual && !preview) return 'choice';
    let scanned = false;
    try {
      await flushCb?.();
      await writes;
      const nets = await readNets();
      const lp = nets ? localPrefixes(nets) : [];
      // Quét lại khi mọi địa chỉ cũ đều hỏng: bấm tay thì quét cả các dải chia sẻ mạng;
      // tự động thì chỉ quét dải điện thoại đang dùng, và chỉ khi có Wi-Fi / USB / Bluetooth (không quét trên 4G)
      // tự quét (tốn pin, CPU): chỉ khi mạng của điện thoại vừa đổi, hoặc 15 phút một lần
      const sig = lp.join(',');
      const auto = (nets === null || lp.length > 0) && (sig !== lastScanSig || Date.now() - lastAutoScan > 15 * 60_000);
      // dải chia sẻ mạng đoán sẵn chỉ cần khi không đọc được mạng thật của điện thoại
      const scan = manual ? { localPrefixes: lp, tether: nets === null } : auto ? { localPrefixes: lp, tether: false } : null;
      scanned = !!scan;
      scanSig = sig;
      const { data, meta } = hub.state;
      // bản cũ (đã đồng bộ trước đây) coi như đã qua lần đầu
      const first = client.firstDone === false || (client.firstDone === undefined && !client.lastSync);
      const guard: SyncGuard = preview ? 'preview' : mode ? 'off' : first ? 'first' : 'normal';
      const { addr, result: r, hubId } = await syncSmart(syncFetch, {
        primary: client.addr,
        hosts: client.hosts ?? [],
        token: client.token,
        hubId: client.hubId,
        data,
        meta,
        scan,
        opts: { mode: mode ?? 'merge', guard, cloudEmail: cloud.info().vaultEmail }
      });
      const hosts = [...new Set([addr, ...(r.addresses ?? []), ...(client.hosts ?? [])])].slice(0, 12);
      if (r.needsChoice) {
        choice = r.needsChoice;
        choiceIsPreview = preview;
        client = { ...client, addr, hosts, hubId, hubName: r.hubName ?? client.hubName, lastError: null };
        void persistSync();
        return 'choice';
      }
      let a: { changed: boolean; needsResync: boolean; data: Data; rev: number };
      if (mode === 'pull') {
        // lấy PC ghi đè điện thoại: sao lưu dữ liệu điện thoại rồi thay toàn bộ (cả dấu đồng bộ)
        await writeAtomic(`backups/hcn-pre-sync-${stamp()}.json`, JSON.stringify(toBackup(hub.state.data, new Date().toISOString()))).catch(() => undefined);
        const rev = hub.reset(r.data, r.meta);
        a = { changed: true, needsResync: false, data: r.data, rev };
      } else a = hub.adoptFromHub(r.data, r.meta, clockNow());
      choice = null;
      client = { ...client, addr, hosts, hubId, firstDone: true, hubName: r.hubName ?? client.hubName, lastSync: new Date().toISOString(), lastError: null, lastChanges: r.changes ?? null };
      if (a.changed) {
        void persistData();
        for (const cb of externalCbs) cb(a.data, a.rev);
        cloud.localChanged();
      }
      void persistSync();
      if (a.needsResync) scheduleSync(1500);
      return undefined;
    } catch (e) {
      const code = e instanceof SyncHttpError ? e.code : 'server';
      if (scanned && !manual && (code === 'network' || code === 'timeout')) {
        lastAutoScan = Date.now();
        lastScanSig = scanSig;
      }
      client = { ...client, lastError: code, ...(code === 'unpaired' ? { token: null } : {}) };
      void persistSync();
      return code;
    }
  }

  /** chạy sau lần đồng bộ đang dở (nếu có) — dùng cho các lệnh người dùng chọn */
  async function runExclusive(fn: () => Promise<string | undefined>): Promise<string | undefined> {
    if (inflight) await inflight.catch(() => undefined);
    inflight = fn().finally(() => {
      inflight = null;
    });
    return inflight;
  }

  function syncNow(manual = false): Promise<string | undefined> {
    // bấm tay đúng lúc lần tự động đang chạy mà lần đó hỏng → chạy thêm một lần đầy đủ
    if (inflight) return manual ? inflight.then((err) => (err && err !== 'unpaired' && err !== 'choice' ? syncNow(true) : err)) : inflight;
    inflight = doSync(manual).finally(() => {
      inflight = null;
    });
    return inflight;
  }

  function startScheduler(): void {
    setInterval(() => {
      if (document.visibilityState === 'visible') void syncNow();
    }, 30_000);
    void App.addListener('appStateChange', ({ isActive }) => {
      if (isActive) {
        cloud.resume();
        scheduleSync(300);
        maybeCheckUpdate();
      }
    });
    scheduleSync(800);
    setTimeout(maybeCheckUpdate, 10_000);
  }

  return {
    platform: 'android',

    async loadAll() {
      let notice: LoadNotice = { kind: 'ok' };
      let data: Data;
      const text = await readWithFallback('data.json');
      if (text === null) {
        data = emptyData();
        notice = { kind: 'fresh' };
        await writeAtomic('data.json', JSON.stringify(data));
      } else {
        try {
          const r = parseImport(JSON.parse(text));
          data = r.data;
          if (r.migratedFrom !== null) notice = { kind: 'migrated', from: r.migratedFrom };
        } catch {
          const corrupt = `data.corrupt-${stamp()}.json`;
          await writeAtomic(corrupt, text);
          const autos = (await listDir('backups')).filter((n) => n.startsWith('hcn-auto-')).sort().reverse();
          data = emptyData();
          notice = { kind: 'corrupt-no-backup', corruptFile: corrupt };
          for (const name of autos) {
            try {
              data = parseImport(JSON.parse((await readText(`backups/${name}`)) ?? '')).data;
              notice = { kind: 'restored-from-backup', backup: name, corruptFile: corrupt };
              break;
            } catch {
              /* thử bản kế */
            }
          }
          await writeAtomic('data.json', JSON.stringify(data));
        }
      }
      let settings: Settings = defaultSettings();
      try {
        const s = await readWithFallback('settings.json');
        if (s) settings = { ...settings, ...JSON.parse(s) };
      } catch {
        /* dùng mặc định */
      }
      let meta: SyncMeta = initMeta(data, 1);
      try {
        const sf = JSON.parse((await readWithFallback('sync.json')) ?? 'null') as SyncFile | null;
        if (sf && isMeta(sf.meta)) meta = sf.meta;
        if (sf?.client) client = { ...client, ...sf.client };
      } catch {
        /* tạo lại */
      }
      hub = createDataHub({ data, meta });
      void autoBackup(data).catch(() => undefined);
      startScheduler();
      void cloud.init().then(() => cloud.start());
      return {
        data,
        settings,
        notice,
        rev: hub.state.rev,
        info: { dataPath: 'Android', logPath: '', version: __APP_VERSION__, packaged: true }
      };
    },

    async saveData(data, baseRev) {
      try {
        const r = hub!.save(data, baseRev, clockNow());
        await persistData();
        await persistSync();
        scheduleSync(3000);
        cloud.localChanged();
        return { ok: true, rev: r.rev, data: r.patched ? r.data : undefined };
      } catch (e) {
        return { ok: false, error: (e as Error).message };
      }
    },
    async saveSettings(s) {
      try {
        await queue(() => writeAtomic('settings.json', JSON.stringify(s)));
        return { ok: true };
      } catch (e) {
        return { ok: false, error: (e as Error).message };
      }
    },
    async backupJson(data) {
      return shareFile(`hcn-backup-${ymd()}.json`, JSON.stringify(toBackup(data, new Date().toISOString()), null, 2), false);
    },
    async pickRestore() {
      const f = await pickJsonFile();
      if (!f) return { canceled: true };
      try {
        return { name: f.name, raw: JSON.parse(f.text.replace(/^﻿/, '')) };
      } catch {
        return { error: 'invalid' };
      }
    },
    async restore(data) {
      try {
        await writeAtomic(`backups/hcn-pre-restore-${stamp()}.json`, JSON.stringify(toBackup(hub!.state.data, new Date().toISOString())));
        const rev = hub!.replace(data, clockNow());
        await persistData();
        await persistSync();
        scheduleSync(1000);
        cloud.localChanged(3000);
        return { ok: true, rev };
      } catch (e) {
        return { ok: false, error: (e as Error).message };
      }
    },
    async exportExcel({ defaultName, sheets }) {
      try {
        const mod = await import('exceljs');
        const ExcelJS = ((mod as unknown as { default?: typeof mod }).default ?? mod) as typeof import('exceljs');
        const wb = new ExcelJS.Workbook();
        fillWorkbook(wb, sheets);
        const buf = (await wb.xlsx.writeBuffer()) as ArrayBuffer;
        return shareFile(defaultName, toBase64(buf), true);
      } catch (e) {
        return { ok: false, error: (e as Error).message };
      }
    },
    async openDataFolder() {},
    async openLog() {},
    async openExternal(url) {
      window.open(url, '_blank');
    },
    async notify({ title, body, level, id }) {
      try {
        if (!(await notifyPermission())) return;
        await LocalNotifications.schedule({
          notifications: [{ id: Math.floor(Date.now() % 2_000_000_000), title, body, extra: { hcn: 1, level, id } }]
        });
      } catch {
        /* thiết bị không hỗ trợ */
      }
    },
    /** Hẹn giờ bằng hệ thống Android: báo đúng giờ kể cả khi app đã tắt hoặc máy khởi động lại */
    async scheduleReminders(items) {
      try {
        if (!(await notifyPermission())) return;
        const pending = await LocalNotifications.getPending();
        const old = pending.notifications.filter((n) => (n.extra as { hcnRem?: number } | undefined)?.hcnRem).map((n) => ({ id: n.id }));
        if (old.length) await LocalNotifications.cancel({ notifications: old });
        if (!items.length) return;
        await LocalNotifications.schedule({
          notifications: items.map((r) => ({
            id: r.nid,
            title: r.title,
            body: r.body,
            schedule: { at: new Date(r.at), allowWhileIdle: true },
            extra: { hcn: 1, hcnRem: 1, level: r.level, id: r.id }
          }))
        });
      } catch {
        /* bỏ qua: lần chạy sau sẽ hẹn lại */
      }
    },
    onOpenTask(cb) {
      const h = LocalNotifications.addListener('localNotificationActionPerformed', (a) => {
        const x = a.notification.extra as { level?: Level; id?: string } | undefined;
        if (x?.level && x.id) cb(x.level, x.id);
      });
      return () => void h.then((l) => l.remove());
    },
    async checkUpdates() {
      await checkUpdate(true);
    },
    async installUpdate() {
      // mở link .apk bằng trình duyệt: tải về rồi chạm vào thông báo tải xong để cài đè (dữ liệu giữ nguyên)
      if (updUrl) window.open(updUrl, '_blank');
    },
    async setAutoDownload() {},
    onUpdate(cb) {
      updateCbs.add(cb);
      return () => updateCbs.delete(cb);
    },
    onFlush(cb) {
      flushCb = cb;
      return () => {
        if (flushCb === cb) flushCb = null;
      };
    },
    async syncInfo() {
      return info();
    },
    async cloudInfo() {
      await cloud.init();
      return cloud.info();
    },
    cloudAction: (a) => cloud.action(a),
    async syncAction(a): Promise<SyncActionResult> {
      if (a.type === 'pair') {
        try {
          const nets = await readNets();
          const r = await pairAuto(syncFetch, { addr: a.addr, code: a.code, name: a.name.trim() || 'Android', localPrefixes: nets ? localPrefixes(nets) : [], prefixes: nets ? [] : undefined });
          choice = null;
          client = { addr: r.addr, token: r.token, hubName: r.hubName, hubId: r.hubId, firstDone: false, lastSync: null, lastError: null, lastChanges: null, hosts: [...new Set([r.addr, ...r.addresses])] };
          lastAutoScan = 0;
          await persistSync();
          const err = await syncNow();
          return { ...info(), error: err };
        } catch (e) {
          return { ...info(), error: e instanceof SyncHttpError ? e.code : 'server' };
        }
      }
      if (a.type === 'discover') {
        const nets = await readNets();
        const found = await discoverHubs(syncFetch, [client.addr, ...(client.hosts ?? [])].filter((x): x is string => !!x), { localPrefixes: nets ? localPrefixes(nets) : [], prefixes: nets ? [] : undefined });
        return { ...info(), found, error: found.length ? undefined : 'notFound' };
      }
      if (a.type === 'diagnose') {
        const nets = await readNets();
        const hosts = client.token ? [client.addr, ...(client.hosts ?? [])].filter((x): x is string => !!x) : [];
        const report = await diagnose(syncFetch, { nets, hosts, hubId: client.token ? (client.hubId ?? null) : null });
        // tìm thấy PC ở địa chỉ mới → dùng luôn và đồng bộ
        const f = report.found[0];
        if (client.token && report.hints[0] === 'addrChanged' && f) {
          client = { ...client, addr: f.addr, hosts: [...new Set([f.addr, ...(client.hosts ?? [])])].slice(0, 12) };
          await persistSync();
          const err = await syncNow();
          return { ...info(), report, error: err };
        }
        return { ...info(), report, found: client.token ? undefined : report.found };
      }
      if (a.type === 'preview') {
        const err = await runExclusive(() => doSync(true, undefined, true));
        return { ...info(), error: err === 'choice' ? undefined : err };
      }
      if (a.type === 'dismiss') {
        if (choiceIsPreview) choice = null;
        return info();
      }
      if (a.type === 'resolve') {
        const err = await runExclusive(() => doSync(true, a.mode));
        return { ...info(), error: err };
      }
      if (a.type === 'syncNow') {
        const err = await syncNow(true);
        return { ...info(), error: err };
      }
      if (a.type === 'unpair') {
        choice = null;
        client = { addr: client.addr, token: null, hubName: null, hubId: null, lastSync: null, lastError: null, lastChanges: null };
        await persistSync();
      }
      return info();
    },
    onExternalData(cb) {
      externalCbs.add(cb);
      return () => externalCbs.delete(cb);
    },
    onBackButton(cb) {
      const h = App.addListener('backButton', () => {
        if (!cb()) void App.minimizeApp();
      });
      return () => void h.then((x) => x.remove());
    }
  };
}
