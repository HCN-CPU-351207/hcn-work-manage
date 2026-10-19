// Hợp đồng giữa renderer và main (preload expose đúng các hàm này, mục 2.2)
import type { Data, Settings } from './model.ts';

export type LoadNotice =
  | { kind: 'fresh' }
  | { kind: 'ok' }
  | { kind: 'migrated'; from: number }
  | { kind: 'restored-from-backup'; backup: string; corruptFile: string }
  | { kind: 'corrupt-no-backup'; corruptFile: string };

export interface AppInfo {
  dataPath: string;
  logPath: string;
  version: string;
  packaged: boolean;
}
export type Platform = 'electron' | 'android' | 'web';

export interface LoadResult {
  data: Data;
  settings: Settings;
  info: AppInfo;
  notice: LoadNotice;
  /** phiên bản dữ liệu; tăng mỗi lần lưu hoặc đồng bộ */
  rev: number;
}
export interface Result {
  ok: boolean;
  canceled?: boolean;
  error?: string;
  path?: string;
}
/** Kết quả lưu dữ liệu: `data` có mặt khi dữ liệu đã được gộp với thay đổi từ đồng bộ */
export interface SaveResult extends Result {
  rev?: number;
  data?: Data;
}

export interface SyncDeviceInfo {
  id: string;
  name: string;
  pairedAt: string;
  lastSeen: string | null;
}
/** Trạng thái đồng bộ Wi-Fi: PC là trạm (hub), điện thoại là máy con (client) */
export interface SyncInfo {
  role: 'hub' | 'client' | 'none';
  enabled: boolean;
  port: number | null;
  addresses: string[];
  pairCode: string | null;
  devices: SyncDeviceInfo[];
  hubAddr: string | null;
  hubName: string | null;
  lastSync: string | null;
  lastError: string | null;
  lastChanges: number | null;
  busy: boolean;
}
export type SyncAction =
  | { type: 'enable' }
  | { type: 'disable' }
  | { type: 'regen' }
  | { type: 'removeDevice'; id: string }
  | { type: 'pair'; addr: string; code: string; name: string }
  | { type: 'syncNow' }
  | { type: 'unpair' };
export type SyncActionResult = SyncInfo & { error?: string };

export interface SheetSpec {
  name: string;
  columns: string[];
  rows: (string | number | null)[][];
}
export interface RestorePick {
  canceled?: boolean;
  error?: string;
  name?: string;
  raw?: unknown;
}
export type UpdateEvent =
  | { type: 'checking' }
  | { type: 'available'; version: string }
  | { type: 'not-available'; manual: boolean }
  | { type: 'progress'; percent: number }
  | { type: 'downloaded'; version: string }
  | { type: 'error'; message: string; manual: boolean };

export interface HcnApi {
  platform: Platform;
  loadAll(): Promise<LoadResult>;
  /** baseRev: phiên bản dữ liệu mà giao diện đang dựa vào */
  saveData(data: Data, baseRev?: number): Promise<SaveResult>;
  saveSettings(settings: Settings): Promise<Result>;
  backupJson(data: Data): Promise<Result>;
  pickRestore(): Promise<RestorePick>;
  restore(data: Data): Promise<SaveResult>;
  exportExcel(args: { defaultName: string; sheets: SheetSpec[] }): Promise<Result>;
  openDataFolder(): Promise<void>;
  openLog(): Promise<void>;
  openExternal(url: string): Promise<void>;
  notify(args: { title: string; body: string }): Promise<void>;
  checkUpdates(): Promise<void>;
  installUpdate(): Promise<void>;
  setAutoDownload(value: boolean): Promise<void>;
  onUpdate(cb: (e: UpdateEvent) => void): () => void;
  onFlush(cb: () => Promise<void> | void): () => void;
  syncInfo(): Promise<SyncInfo>;
  syncAction(a: SyncAction): Promise<SyncActionResult>;
  /** dữ liệu đổi từ bên ngoài (đồng bộ) */
  onExternalData(cb: (data: Data, rev: number) => void): () => void;
  /** nút Back của Android: trả true nếu đã xử lý (đóng một lớp); false để thu nhỏ app */
  onBackButton(cb: () => boolean): () => void;
}

export const emptySyncInfo = (role: SyncInfo['role']): SyncInfo => ({
  role,
  enabled: false,
  port: null,
  addresses: [],
  pairCode: null,
  devices: [],
  hubAddr: null,
  hubName: null,
  lastSync: null,
  lastError: null,
  lastChanges: null,
  busy: false
});
