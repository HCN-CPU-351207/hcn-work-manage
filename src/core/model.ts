// Kiểu dữ liệu (schemaVersion 1) theo mục 5 của CVKT_Spec.md
export const SCHEMA_VERSION = 1;

export type Status = 'Chưa làm' | 'Đang làm' | 'Hoàn thành'; // lưu trong DB
export type Display = Status | 'Quá hạn'; // chỉ hiển thị
export type Loai =
  | 'Gấp-Quan trọng'
  | 'Gấp-Không quan trọng'
  | 'Không gấp-Quan trọng'
  | 'Không gấp-Không quan trọng';

export const STATUSES: Status[] = ['Chưa làm', 'Đang làm', 'Hoàn thành'];
export const DISPLAYS: Display[] = ['Chưa làm', 'Đang làm', 'Quá hạn', 'Hoàn thành'];
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

export interface Thang {
  id: string;
  ma: string; // M001...
  loai: Loai;
  ten: string;
  personId: string | null;
  bd: string | null;
  dl: string | null;
  tt: Status;
  bdtt: string | null;
  kttt: string | null;
  gc: string;
}

export interface Tuan {
  id: string;
  ma: string; // W001...
  parentMa: string; // mã tháng cha, ví dụ 'M001'
  ten: string;
  personId: string | null;
  bd: string | null;
  dl: string | null;
  tt: Status;
  bdtt: string | null;
  kttt: string | null;
  gc: string;
}

export interface Ngay {
  id: string;
  ma: string; // D001...
  ngay: string; // 'YYYY-MM-DD'
  parentId: string; // id của Tuan cha
  ten: string;
  personId: string | null;
  g1: string | null; // 'HH:MM'
  g2: string | null;
  a1: string | null; // ISO datetime cục bộ 'YYYY-MM-DDTHH:mm:ss'
  a2: string | null;
  tt: Status;
  gc: string;
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
}

export type Quick = 'today' | 'overdue' | 'duesoon' | 'mine';

export interface ViewFilter {
  q?: string;
  status?: Display | '';
  personId?: string;
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
}

export interface BackupFile {
  app: 'HCN';
  schemaVersion: number;
  exportedAt: string;
  data: { people: Person[]; thang: Thang[]; tuan: Tuan[]; ngay: Ngay[]; counters?: Counters };
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
    savedViews: []
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
