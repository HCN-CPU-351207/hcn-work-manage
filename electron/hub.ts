// Phía PC: dữ liệu + phiên bản + trạm đồng bộ Wi-Fi. Không phụ thuộc Electron (test được bằng Node).
import { createDataHub } from '../src/core/dataHub.ts';
import type { Data } from '../src/core/model.ts';
import { countDiff, initMeta, isMeta } from '../src/core/sync.ts';
import type { SyncMeta } from '../src/core/sync.ts';
import type { SaveResult, SyncAction, SyncActionResult, SyncInfo } from '../src/core/api.ts';
import { emptySyncInfo } from '../src/core/api.ts';
import { createSyncServer, DEFAULT_PORT, lanLinks } from './syncServer.ts';
import type { SyncDevice } from './syncServer.ts';

export interface HubFile {
  v: 1;
  meta: SyncMeta;
  hub: { enabled: boolean; port: number; devices: SyncDevice[] };
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
}

export function createHubController(initialData: Data, deps: HubDeps) {
  const now = deps.now ?? (() => Date.now());
  const saved = deps.loadSync();
  let file: HubFile = {
    v: 1,
    meta: saved && isMeta(saved.meta) ? saved.meta : initMeta(initialData, 1),
    hub: { enabled: !!saved?.hub?.enabled, port: saved?.hub?.port ?? DEFAULT_PORT, devices: saved?.hub?.devices ?? [] }
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
    log: deps.log,
    getDevices: () => file.hub.devices,
    setDevices: (list) => {
      file = { ...file, hub: { ...file.hub, devices: list } };
      persistMeta();
    },
    handleSync: async (data, meta) => {
      await deps.requestFlush().catch(() => undefined);
      return serial(() => {
        const before = hub.state.data;
        const r = hub.mergeRemote(data, meta, now());
        if (r.changed) {
          deps.saveData(r.data);
          deps.onExternal(r.data, r.rev);
        }
        persistMeta();
        lastSync = new Date(now()).toISOString();
        lastChanges = countDiff(before, r.data) + countDiff(data, r.data);
        lastError = null;
        return { data: r.data, meta: r.meta, changes: lastChanges };
      });
    }
  });

  const info = (): SyncInfo => ({
    ...emptySyncInfo('hub'),
    enabled: file.hub.enabled && server.running,
    port: server.port,
    addresses: server.running ? lanLinks().map((l) => l.address) : [],
    links: server.running ? lanLinks() : [],
    pairCode: server.running ? server.pairCode : null,
    devices: file.hub.devices.map(({ id, name, pairedAt, lastSeen }) => ({ id, name, pairedAt, lastSeen })),
    lastSync,
    lastError,
    lastChanges
  });

  async function enable(): Promise<void> {
    const port = await server.start(file.hub.port);
    file = { ...file, hub: { ...file.hub, enabled: true, port } };
    persistMeta();
  }

  return {
    get rev() {
      return hub.state.rev;
    },
    get data() {
      return hub.state.data;
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
            break;
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
