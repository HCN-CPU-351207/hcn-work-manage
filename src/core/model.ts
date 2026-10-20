// Kiểu dữ liệu (schemaVersion 1) theo mục 5 của CVKT_Spec.md
export const SCHEMA_VERSION = 1;

export type Status = 'Chưa làm' | 'Đang làm' | 'Hoàn thành'; // lưu trong DB
export type Display = Status | 'Quá hạn' | 'Đã hủy'; // chỉ hiển thị
export type Loai =
  | 'Gấp-Quan trọng'
  | 'Gấp-Không quan trọng'
  | 'Không gấp-Quan trọng'
  | 'Không gấp-Không quan trọng';

export const STATUSES: Status[] = ['Chưa làm', 'Đang làm', 'Hoàn thành'];
export const DISPLAYS: Display[] = ['Chưa làm', 'Đang làm', 'Quá hạn', 'Hoàn thành', 'Đã hủy'];
export const LOAI_LIST: Loai[] = [
  'Gấp-Quan trọng',
  'Gấp-Không quan trọng',
  'Không gấp-Quan trọng',
  'Không gấp-Không quan trọng'
];

export type Level = 'thang' | 'tuan' | 'ngay';
export type Tab = 'overview' | Level;

export interface Person {
  id: string;
  name: string;
  color: string;
  photo: string | null;
}

/** Mục trong danh mục tự sửa được (Phân loại, Vị trí). name rỗng = tên mặc định theo ngôn ngữ */
export interface Opt {
  id: string;
  name: string;
  color: string;
  hidden?: boolean;
}
export type OptKind = 'cats' | 'places';

export const DEFAULT_CATS: Opt[] = [
  { id: 'c-chuyenmon', name: '', color: '#60A5FA' },
  { id: 'c-thuongnhat', name: '', color: '#34D399' },
  { id: 'c-dotxuat', name: '', color: '#F87171' },
  { id: 'c-hanhchinh', name: '', color: '#A78BFA' },
  { id: 'c-hop', name: '', color: '#F59E0B' },
  { id: 'c-daotao', name: '', color: '#2DD4BF' },
  { id: 'c-hotro', name: '', color: '#F472B6' },
  { id: 'c-khac', name: '', color: '#94A3B8' }
];
export const DEFAULT_PLACES: Opt[] = [
  { id: 'pl-congty', name: '', color: '#60A5FA' },
  { id: 'pl-nha', name: '', color: '#34D399' },
  { id: 'pl-congtruong', name: '', color: '#F59E0B' },
  { id: 'pl-nhamay', name: '', color: '#A78BFA' },
  { id: 'pl-khac', name: '', color: '#94A3B8' }
];
/** danh mục đang dùng: chưa sửa lần nào thì lấy mặc định */
export const optsOf = (d: { cats?: Opt[]; places?: Opt[] }, k: OptKind): Opt[] => d[k] ?? (k === 'cats' ? DEFAULT_CATS : DEFAULT_PLACES);

/** Dấu "đã hủy": không ghi đè trạng thái / ngày thực tế để vẫn xem được việc đã làm.
 * root = id việc cha đã hủy kéo theo việc này (khôi phục cha thì khôi phục theo). */
export interface Cancel {
  at: string; // 'YYYY-MM-DDTHH:mm:ss'
  reason?: string;
  root?: string;
}

export interface Thang {
  id: string;
  ma: string; // M001...
  loai: Loai;
  /** Phân loại công việc (id trong danh mục cats) */
  cat?: string | null;
  ten: string;
  personId: string | null;
  bd: string | null;
  dl: string | null;
  tt: Status;
  bdtt: string | null;
  kttt: string | null;
  gc: string;
  huy?: Cancel | null;
}

export interface Tuan {
  id: string;
  ma: string; // W001...
  parentMa: string; // mã tháng cha, ví dụ 'M001'
  cat?: string | null;
  ten: string;
  personId: string | null;
  bd: string | null;
  dl: string | null;
  tt: Status;
  bdtt: string | null;
  kttt: string | null;
  gc: string;
  huy?: Cancel | null;
}

export interface Ngay {
  id: string;
  ma: string; // D001...
  ngay: string; // 'YYYY-MM-DD'
  parentId: string; // id của Tuan cha
  cat?: string | null;
  /** Vị trí (id trong danh mục places) + ghi rõ địa điểm */
  place?: string | null;
  placeNote?: string;
  ten: string;
  personId: string | null;
  g1: string | null; // 'HH:MM'
  g2: string | null;
  a1: string | null; // ISO datetime cục bộ 'YYYY-MM-DDTHH:mm:ss'
  a2: string | null;
  tt: Status;
  gc: string;
  huy?: Cancel | null;
}

export type Item = Thang | Tuan | Ngay;

// Bộ đếm mã: bổ sung kỹ thuật để mã không bị tái sử dụng sau khi xóa (mục 5.3)
export interface Counters {
  M: number;
  W: number;
  D: number;
}

export interface Data {
  schemaVersion: number;
  people: Person[];
  thang: Thang[];
  tuan: Tuan[];
  ngay: Ngay[];
  counters?: Counters;
  /** danh mục Phân loại / Vị trí (dùng chung giữa các máy); thiếu = mặc định */
  cats?: Opt[];
  places?: Opt[];
  /** nhắc việc đã báo: khóa mốc → thời điểm báo (ms); gộp khi đồng bộ để máy kia không báo lặp */
  reminded?: Record<string, number>;
}

export type Quick = 'today' | 'overdue' | 'duesoon' | 'mine';

export interface ViewFilter {
  q?: string;
  status?: Display | '';
  personId?: string;
  /** chọn nhiều; NONE_OPT = chưa có */
  cats?: string[];
  places?: string[];
  /** lọc theo cột kiểu Excel: khóa cột → các giá trị được giữ ('' = ô trống) */
  cols?: Record<string, string[]>;
  /** sắp xếp theo cột */
  sort?: { key: string; dir: 1 | -1 };
  from?: string;
  to?: string;
  quick?: Quick | null;
}

export interface SavedView {
  id: string;
  name: string;
  tab: Tab;
  filter: ViewFilter;
}

export type ThemeName = 'dark' | 'light';
export type LangCode = 'vi' | 'en' | 'zh' | 'pt' | 'fr' | 'de' | 'ja';
export const LANGS: LangCode[] = ['vi', 'en', 'zh', 'pt', 'fr', 'de', 'ja'];

export interface Settings {
  schemaVersion: number;
  language: LangCode;
  theme: ThemeName;
  currentPersonId: string | null;
  notifyDaysBefore: number;
  notificationsEnabled: boolean;
  autoDownloadUpdates: boolean;
  lastUpdateCheck: string | null;
  savedViews: SavedView[];
  // kỹ thuật: các việc đã báo trong ngày (để không báo lặp)
  notified?: { date: string; ids: string[] };
  /** Thông báo chi tiết */
  notifySoon: boolean;
  notifyDue: boolean;
  notifyOverdue: boolean;
  notifyDayStart: boolean;
  notifyDayLeadMin: number;
  notifyDayLate: boolean;
  /** giờ báo các mốc theo ngày (HH:MM) */
  notifyMorning: string;
  quietStart: string;
  quietEnd: string;
  /** PC: đóng cửa sổ thì chạy nền ở khay hệ thống; tự mở cùng Windows */
  runInBackground: boolean;
  launchAtLogin: boolean;
  /** mục chuông đã xem trên máy này: khóa `${level}:${id}:${kind}:${dl}` → ngày xem */
  bellSeen?: Record<string, string>;
  /** cột đang ẩn theo từng bảng (máy nào nhớ máy đó) */
  hiddenCols?: Partial<Record<Level, string[]>>;
}

export interface BackupFile {
  app: 'HCN';
  schemaVersion: number;
  exportedAt: string;
  data: { people: Person[]; thang: Thang[]; tuan: Tuan[]; ngay: Ngay[]; counters?: Counters; cats?: Opt[]; places?: Opt[] };
}

export function emptyData(): Data {
  return {
    schemaVersion: SCHEMA_VERSION,
    people: [],
    thang: [],
    tuan: [],
    ngay: [],
    counters: { M: 0, W: 0, D: 0 }
  };
}

export function defaultSettings(): Settings {
  return {
    schemaVersion: SCHEMA_VERSION,
    language: 'vi',
    theme: 'dark',
    currentPersonId: null,
    notifyDaysBefore: 3,
    notificationsEnabled: true,
    autoDownloadUpdates: true,
    lastUpdateCheck: null,
    savedViews: [],
    notifySoon: true,
    notifyDue: true,
    notifyOverdue: true,
    notifyDayStart: true,
    notifyDayLeadMin: 10,
    notifyDayLate: true,
    notifyMorning: '08:00',
    quietStart: '22:00',
    quietEnd: '07:00',
    runInBackground: true,
    launchAtLogin: false
  };
}

export function toBackup(data: Data, exportedAt: string): BackupFile {
  return {
    app: 'HCN',
    schemaVersion: SCHEMA_VERSION,
    exportedAt,
    data: {
      people: data.people,
      thang: data.thang,
      tuan: data.tuan,
      ngay: data.ngay,
      counters: data.counters
    }
  };
}
