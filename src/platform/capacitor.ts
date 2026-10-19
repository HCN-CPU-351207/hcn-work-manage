// Nền tảng Android (Capacitor): lưu dữ liệu trong bộ nhớ của app, đồng bộ với PC qua Wi-Fi,
// xuất file qua menu Chia sẻ, thông báo cục bộ, nút Back.
import { App } from '@capacitor/app';
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import { LocalNotifications } from '@capacitor/local-notifications';
import { Share } from '@capacitor/share';
import type { HcnApi, LoadNotice, SyncActionResult, SyncInfo, UpdateEvent } from '../core/api.ts';
import { emptySyncInfo } from '../core/api.ts';
import { createDataHub } from '../core/dataHub.ts';
import type { DataHub } from '../core/dataHub.ts';
import { parseImport } from '../core/migrate.ts';
import { defaultSettings, emptyData, toBackup } from '../core/model.ts';
import type { Data, Settings } from '../core/model.ts';
import { initMeta, isMeta } from '../core/sync.ts';
import type { SyncMeta } from '../core/sync.ts';
import { normalizeAddr, pairWithHub, SyncHttpError, syncWithHub } from '../lib/syncClient.ts';
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
  let syncTimer: ReturnType<typeof setTimeout> | undefined;
  let inflight: Promise<string | undefined> | null = null;

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
      hubName: client.hubName,
      lastSync: client.lastSync,
      lastError: client.lastError,
      lastChanges: client.lastChanges,
      busy: !!inflight
    };
  }

  function scheduleSync(ms: number): void {
    if (!client.token) return;
    clearTimeout(syncTimer);
    syncTimer = setTimeout(() => void syncNow(), ms);
  }

  async function doSync(): Promise<string | undefined> {
    if (!hub || !client.token || !client.addr) return 'unpaired';
    try {
      await flushCb?.();
      await writes;
      const { data, meta } = hub.state;
      const r = await syncWithHub(fetch, client.addr, client.token, data, meta);
      const a = hub.adoptFromHub(r.data, r.meta, Date.now());
      client = { ...client, hubName: r.hubName ?? client.hubName, lastSync: new Date().toISOString(), lastError: null, lastChanges: r.changes ?? null };
      if (a.changed) {
        void persistData();
        for (const cb of externalCbs) cb(a.data, a.rev);
      }
      void persistSync();
      if (a.needsResync) scheduleSync(1500);
      return undefined;
    } catch (e) {
      const code = e instanceof SyncHttpError ? e.code : 'server';
      client = { ...client, lastError: code, ...(code === 'unpaired' ? { token: null } : {}) };
      void persistSync();
      return code;
    }
  }

  function syncNow(): Promise<string | undefined> {
    if (inflight) return inflight;
    inflight = doSync().finally(() => {
      inflight = null;
    });
    return inflight;
  }

  function startScheduler(): void {
    setInterval(() => {
      if (document.visibilityState === 'visible') void syncNow();
    }, 30_000);
    void App.addListener('appStateChange', ({ isActive }) => {
      if (isActive) scheduleSync(300);
    });
    scheduleSync(800);
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
        const r = hub!.save(data, baseRev, Date.now());
        await persistData();
        await persistSync();
        scheduleSync(3000);
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
        const rev = hub!.replace(data, Date.now());
        await persistData();
        await persistSync();
        scheduleSync(1000);
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
    async notify({ title, body }) {
      try {
        let perm = await LocalNotifications.checkPermissions();
        if (perm.display !== 'granted') perm = await LocalNotifications.requestPermissions();
        if (perm.display !== 'granted') return;
        await LocalNotifications.schedule({ notifications: [{ id: Math.floor(Date.now() % 2_000_000_000), title, body }] });
      } catch {
        /* thiết bị không hỗ trợ */
      }
    },
    async checkUpdates() {
      for (const cb of updateCbs) cb({ type: 'not-available', manual: true });
    },
    async installUpdate() {},
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
    async syncAction(a): Promise<SyncActionResult> {
      if (a.type === 'pair') {
        const addr = normalizeAddr(a.addr);
        if (!addr) return { ...info(), error: 'addr' };
        try {
          const r = await pairWithHub(fetch, addr, a.code, a.name.trim() || 'Android');
          client = { addr, token: r.token, hubName: r.hubName, lastSync: null, lastError: null, lastChanges: null };
          await persistSync();
          const err = await syncNow();
          return { ...info(), error: err };
        } catch (e) {
          return { ...info(), error: e instanceof SyncHttpError ? e.code : 'server' };
        }
      }
      if (a.type === 'syncNow') {
        const err = await syncNow();
        return { ...info(), error: err };
      }
      if (a.type === 'unpair') {
        client = { addr: client.addr, token: null, hubName: null, lastSync: null, lastError: null, lastChanges: null };
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
