// Phía PC: dữ liệu + phiên bản + trạm đồng bộ Wi-Fi. Không phụ thuộc Electron (test được bằng Node).
import crypto from 'node:crypto';
import { createDataHub } from '../src/core/dataHub.ts';
import type { Data } from '../src/core/model.ts';
import { countDiff, initMeta, isMeta, needsChoice } from '../src/core/sync.ts';
import type { SyncMeta } from '../src/core/sync.ts';
import type { SaveResult, SyncAction, SyncActionResult, SyncInfo } from '../src/core/api.ts';
import { emptySyncInfo } from '../src/core/api.ts';
import { createSyncServer, DEFAULT_PORT, lanLinks } from './syncServer.ts';
import type { SyncDevice } from './syncServer.ts';
import type { WinNetSnapshot } from './winNet.ts';

export interface HubFile {
  v: 1;
  meta: SyncMeta;
  hub: { enabled: boolean; port: number; devices: SyncDevice[]; id?: string };
}

export interface HubDeps {
  loadSync(): HubFile | null;
  saveSync(f: HubFile): void;
  saveData(d: Data): void;
  version: string;
  hubName?: string;
  log: { info(m: string): void; warn(m: string): void; error(m: string, e?: unknown): void };
  /** dữ liệu đổi do đồng bộ → báo giao diện */
  onExternal(data: Data, rev: number): void;
  /** nhờ giao diện ghi nốt thay đổi đang chờ trước khi gộp */
  requestFlush(): Promise<void>;
  now?: () => number;
  /** Windows: mô tả card mạng, loại mạng (Công cộng/Riêng tư), trạng thái tường lửa */
  netInfo?: () => WinNetSnapshot | null;
  /** Windows: mở tường lửa cho cổng đồng bộ (hỏi quyền quản trị) */
  fixFirewall?: (ports: [number, number]) => Promise<boolean>;
  /** sao lưu dữ liệu PC trước khi đồng bộ xóa / ghi đè */
  backup?: (data: Data, reason: string) => void;
  /** đóng cửa sổ thì app vẫn chạy ở khay */
  keepsRunning?: () => boolean;
  /** bật / tắt trạm → cập nhật khay hệ thống */
  onEnabledChange?: (enabled: boolean) => void;
}

export function createHubController(initialData: Data, deps: HubDeps) {
  const now = deps.now ?? (() => Date.now());
  const saved = deps.loadSync();
  let file: HubFile = {
    v: 1,
    meta: saved && isMeta(saved.meta) ? saved.meta : initMeta(initialData, 1),
    hub: {
      enabled: !!saved?.hub?.enabled,
      // luôn ưu tiên cổng mặc định: điện thoại tìm theo cổng này
      port: DEFAULT_PORT,
      devices: saved?.hub?.devices ?? [],
      id: saved?.hub?.id || crypto.randomBytes(8).toString('hex')
    }
  };
  const hub = createDataHub({ data: initialData, meta: file.meta });
  let lastSync: string | null = null;
  let lastChanges: number | null = null;
  let lastError: string | null = null;
  let queue: Promise<unknown> = Promise.resolve();
  /** chạy tuần tự: lưu từ giao diện và gộp đồng bộ không chen nhau */
  const serial = <T>(fn: () => Promise<T> | T): Promise<T> => {
    const p = queue.then(fn, fn);
    queue = p.catch(() => undefined);
    return p;
  };
  const persistMeta = () => {
    file = { ...file, meta: hub.state.meta };
    try {
      deps.saveSync(file);
    } catch (e) {
      deps.log.error('Lỗi ghi sync.json', e);
    }
  };

  const server = createSyncServer({
    version: deps.version,
    hubName: deps.hubName,
    hubId: file.hub.id,
    log: deps.log,
    getDevices: () => file.hub.devices,
    setDevices: (list) => {
      file = { ...file, hub: { ...file.hub, devices: list } };
      persistMeta();
    },
    handleSync: async (data, meta, device, opts) => {
      await deps.requestFlush().catch(() => undefined);
      return serial(() => {
        const before = hub.state.data;
        const t = now();
        // PC → điện thoại: không đụng dữ liệu PC, trả nguyên bản PC
        if (opts.mode === 'pull') {
          lastSync = new Date(t).toISOString();
          lastChanges = countDiff(data, before);
          lastError = null;
          deps.log.info(`${device.name}: lấy dữ liệu PC ghi đè điện thoại`);
          return { data: before, meta: hub.state.meta, changes: lastChanges };
        }
        if (opts.mode === 'merge') {
          const stats = hub.preview(data, meta, t);
          if (needsChoice(stats, opts.guard)) return { needsChoice: stats };
          if (stats.pc.del > 0) safeBackup(before, 'sync');
          const r = hub.mergeRemote(data, meta, t);
          if (r.changed) {
            deps.saveData(r.data);
            deps.onExternal(r.data, r.rev);
          }
          persistMeta();
          lastSync = new Date(t).toISOString();
          lastChanges = countDiff(before, r.data) + countDiff(data, r.data);
          lastError = null;
          if (stats.pc.del > 0) deps.log.info(`${device.name}: đồng bộ xóa ${stats.pc.del} việc trên PC (đã sao lưu trước)`);
          return { data: r.data, meta: r.meta, changes: lastChanges };
        }
        // điện thoại → PC: thay dữ liệu PC bằng dữ liệu điện thoại (đã sao lưu)
        safeBackup(before, 'push');
        const rev = hub.replace(data, t);
        deps.saveData(hub.state.data);
        deps.onExternal(hub.state.data, rev);
        persistMeta();
        lastSync = new Date(t).toISOString();
        lastChanges = countDiff(before, data);
        lastError = null;
        deps.log.info(`${device.name}: lấy dữ liệu điện thoại ghi đè PC (${lastChanges} thay đổi, đã sao lưu)`);
        return { data: hub.state.data, meta: hub.state.meta, changes: lastChanges };
      });
    }
  });
  function safeBackup(d: Data, reason: string): void {
    try {
      deps.backup?.(d, reason);
    } catch (e) {
      deps.log.error('Không sao lưu được trước khi đồng bộ', e);
    }
  }

  const info = (): SyncInfo => {
    const net = server.running ? (deps.netInfo?.() ?? null) : null;
    const links = server.running ? lanLinks((name) => net?.adapters[name]) : [];
    return {
    ...emptySyncInfo('hub'),
    enabled: file.hub.enabled && server.running,
    port: server.port,
    addresses: links.map((l) => l.address),
    links,
    firewall: net?.firewall ?? null,
    keepsRunning: deps.keepsRunning?.() ?? false,
    pairCode: server.running ? server.pairCode : null,
    devices: file.hub.devices.map(({ id, name, pairedAt, lastSeen }) => ({ id, name, pairedAt, lastSeen })),
    lastSync,
    lastError,
    lastChanges
    };
  };

  async function enable(): Promise<void> {
    await server.start(file.hub.port);
    file = { ...file, hub: { ...file.hub, enabled: true } };
    persistMeta();
    deps.onEnabledChange?.(true);
  }

  return {
    get rev() {
      return hub.state.rev;
    },
    get data() {
      return hub.state.data;
    },
    get enabled() {
      return file.hub.enabled && server.running;
    },
    /** mở trạm nếu lần trước đang bật */
    async startIfEnabled(): Promise<void> {
      if (!file.hub.enabled) return;
      try {
        await enable();
      } catch (e) {
        lastError = (e as Error).message;
        deps.log.error('Không mở được trạm đồng bộ', e);
      }
    },
    save(edited: Data, baseRev?: number): Promise<SaveResult> {
      return serial(() => {
        const r = hub.save(edited, baseRev, now());
        deps.saveData(r.data);
        persistMeta();
        return { ok: true, rev: r.rev, data: r.patched ? r.data : undefined };
      });
    },
    replace(next: Data): Promise<number> {
      return serial(() => {
        const rev = hub.replace(next, now());
        deps.saveData(next);
        persistMeta();
        return rev;
      });
    },
    info,
    async action(a: SyncAction): Promise<SyncActionResult> {
      try {
        switch (a.type) {
          case 'enable':
            await enable();
            break;
          case 'disable':
            await server.stop();
            file = { ...file, hub: { ...file.hub, enabled: false } };
            persistMeta();
            deps.onEnabledChange?.(false);
            break;
          case 'fixFirewall': {
            if (!deps.fixFirewall) break;
            const okFix = await deps.fixFirewall([DEFAULT_PORT, DEFAULT_PORT + 9]);
            if (!okFix) return { ...info(), error: 'firewall' };
            break;
          }
          case 'regen':
            server.regenCode();
            break;
          case 'removeDevice':
            file = { ...file, hub: { ...file.hub, devices: file.hub.devices.filter((d) => d.id !== a.id) } };
            persistMeta();
            break;
          default:
            break;
        }
        return info();
      } catch (e) {
        lastError = (e as Error).message;
        return { ...info(), error: lastError };
      }
    },
    stop: () => server.stop()
  };
}
export type HubController = ReturnType<typeof createHubController>;
