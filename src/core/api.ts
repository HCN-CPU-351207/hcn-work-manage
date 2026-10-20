// Hợp đồng giữa renderer và main (preload expose đúng các hàm này, mục 2.2)
import type { Data, Level, Settings } from './model.ts';
import type { DiagReport, LocalKind } from '../lib/syncClient.ts';
import type { SyncMode, SyncStats } from './sync.ts';
import type { CloudAction, CloudActionResult, CloudInfo } from '../lib/cloudDriver.ts';

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

export interface NotifyArgs {
  title: string;
  body: string;
  level?: Level;
  id?: string;
}
export interface ScheduledNote extends NotifyArgs {
  nid: number;
  at: number;
}

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

export type LinkKind = 'wifi' | 'usb' | 'bluetooth' | 'lan' | 'hotspot';
export interface SyncLink {
  address: string;
  kind: LinkKind;
  /** tên card mạng trên PC (vd. "Wi-Fi", "Ethernet 3") */
  name?: string;
  /** Windows xếp mạng này vào Công cộng / Riêng tư / Miền */
  profile?: 'public' | 'private' | 'domain' | null;
}
export interface FoundHub {
  addr: string;
  name: string;
  id?: string;
}
/** PC Windows: tường lửa có cho điện thoại vào không */
export type FirewallState = 'ok' | 'missing' | 'blocked' | 'unknown';

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
  /** PC: địa chỉ theo loại kết nối (Wi-Fi, USB, Bluetooth, mạng dây) */
  links: SyncLink[];
  /** điện thoại: mọi địa chỉ đã biết của PC (tự thử lần lượt khi mất kết nối) */
  hubHosts: string[];
  pairCode: string | null;
  devices: SyncDeviceInfo[];
  hubAddr: string | null;
  hubName: string | null;
  lastSync: string | null;
  lastError: string | null;
  lastChanges: number | null;
  busy: boolean;
  /** PC: trạng thái tường lửa (null nếu không phải Windows / chưa kiểm tra) */
  firewall?: FirewallState | null;
  /** PC: app sẽ nằm ở khay khi đóng cửa sổ (để điện thoại vẫn đồng bộ được) */
  keepsRunning?: boolean;
  /** điện thoại: đang đi qua mạng nào để tới PC */
  route?: LocalKind | null;
  /** điện thoại: đồng bộ đang tạm dừng, chờ người dùng chọn cách (kèm số việc mỗi bên sẽ đổi) */
  choice?: SyncStats | null;
}
export type SyncAction =
  | { type: 'enable' }
  | { type: 'disable' }
  | { type: 'regen' }
  | { type: 'removeDevice'; id: string }
  | { type: 'pair'; addr: string; code: string; name: string }
  | { type: 'syncNow' }
  | { type: 'discover' }
  | { type: 'diagnose' }
  | { type: 'fixFirewall' }
  /** xem trước số việc mỗi bên sẽ đổi, rồi tự chọn chiều đồng bộ */
  | { type: 'preview' }
  | { type: 'resolve'; mode: SyncMode }
  /** "Để sau": bỏ bản xem trước (đồng bộ bị chặn vì rủi ro thì vẫn tạm dừng) */
  | { type: 'dismiss' }
  | { type: 'unpair' };
export type SyncActionResult = SyncInfo & { error?: string; found?: FoundHub[]; report?: DiagReport };

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
  /** thông báo ngay; bấm vào thì mở việc (level, id) */
  notify(args: NotifyArgs): Promise<void>;
  /** Android: hẹn giờ thông báo bằng hệ thống (báo cả khi app tắt). PC: không cần */
  scheduleReminders(items: ScheduledNote[]): Promise<void>;
  /** người dùng bấm vào thông báo */
  onOpenTask(cb: (level: Level, id: string) => void): () => void;
  checkUpdates(): Promise<void>;
  installUpdate(): Promise<void>;
  setAutoDownload(value: boolean): Promise<void>;
  onUpdate(cb: (e: UpdateEvent) => void): () => void;
  onFlush(cb: () => Promise<void> | void): () => void;
  syncInfo(): Promise<SyncInfo>;
  syncAction(a: SyncAction): Promise<SyncActionResult>;
  /** Đồng bộ online qua Google Drive */
  cloudInfo(): Promise<CloudInfo>;
  cloudAction(a: CloudAction): Promise<CloudActionResult>;
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
  links: [],
  hubHosts: [],
  pairCode: null,
  devices: [],
  hubAddr: null,
  hubName: null,
  lastSync: null,
  lastError: null,
  lastChanges: null,
  busy: false
});
