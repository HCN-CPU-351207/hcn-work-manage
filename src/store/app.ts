// Zustand store: dữ liệu + trạng thái giao diện. Ghi qua IPC (debounce 300 ms, mục 3.4)
import { create } from 'zustand';
import { nextCode } from '../core/codes.ts';
import { todayStr, ymOf } from '../core/dates.ts';
import { newId } from '../core/ids.ts';
import { defaultSettings, emptyData } from '../core/model.ts';
import type { Data, Display, Level, Ngay, SavedView, Settings, Status, Tab, Thang, Tuan, ViewFilter } from '../core/model.ts';
import type { AppInfo, LoadNotice, UpdateEvent } from '../core/api.ts';
import { bulkAssign, bulkSetStatus, removeItems } from '../core/ops.ts';
import { api } from '../lib/devApi.ts';

export type SyncState = 'saved' | 'pending' | 'error';
export type SettingsSection = 'language' | 'appearance' | 'people' | 'personal' | 'data' | 'sync' | 'update' | 'notify' | 'about';
export type ViewMode = 'table' | 'chart';

export interface DrawerState {
  level: Level;
  id: string | null; // null = tạo mới
  draft?: Record<string, unknown>;
}
export interface Toast {
  id: number;
  text: string;
  kind: 'info' | 'ok' | 'error';
  action?: { label: string; run: () => void };
  ttl: number;
  undo?: boolean;
}
export interface ConfirmState {
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => void | Promise<void>;
}
export interface TipData {
  level: Level;
  id: string;
  ma: string;
  ten: string;
  person: string;
  display: Display;
  plan: string;
  actual: string;
  progress: number | null;
  extra?: string;
}
export interface TipState {
  data: TipData;
  x: number;
  y: number;
  pinned: boolean;
}
export interface UpdateState {
  status: 'idle' | 'checking' | 'available' | 'downloading' | 'ready' | 'latest' | 'error';
  version?: string;
  percent?: number;
  error?: string;
  dismissed?: boolean;
}

const EMPTY_FILTERS: Record<Level, ViewFilter> = { thang: {}, tuan: {}, ngay: {} };
const EMPTY_SEL: Record<Level, string[]> = { thang: [], tuan: [], ngay: [] };

export interface AppState {
  ready: boolean;
  loadError: string | null;
  data: Data;
  settings: Settings;
  info: AppInfo;
  notice: LoadNotice | null;
  sync: SyncState;
  syncError: string | null;
  /** phiên bản dữ liệu mà giao diện đang dựa vào (để gộp đúng khi vừa đồng bộ) */
  rev: number;

  tab: Tab;
  query: string;
  filters: Record<Level, ViewFilter>;
  modes: Record<Level, ViewMode>;
  month: string; // tháng đang xem trên Gantt (YYYY-MM)
  weekAnchor: string; // một ngày bất kỳ trong tuần đang xem
  dayDate: string; // ngày đang xem trên timeline tab Ngày
  splitDay: string | null;
  selected: Record<Level, string[]>;
  drawer: DrawerState | null;
  quickOpen: boolean;
  settingsOpen: SettingsSection | null;
  highlight: { level: Level; id: string; until: number } | null;
  scrollNonce: number;
  searchFocusNonce: number;
  confirm: ConfirmState | null;
  toasts: Toast[];
  undo: { data: Data; until: number } | null;
  tip: TipState | null;
  update: UpdateState;

  init(): Promise<void>;
  mutate(fn: (d: Data) => Data): void;
  replaceData(d: Data, rev?: number): void;
  /** dữ liệu mới từ đồng bộ; bỏ qua nếu giao diện còn thay đổi chưa lưu (lần lưu sau sẽ tự gộp) */
  applyExternal(d: Data, rev: number): void;
  flush(): Promise<boolean>;
  setSettings(patch: Partial<Settings>): void;

  createThang(f: Partial<Thang>): Thang;
  createTuan(f: Partial<Tuan> & { parentMa: string }): Tuan;
  createNgay(f: Partial<Ngay> & { parentId: string; ngay: string }): Ngay;
  updateItem(level: Level, id: string, patch: Partial<Thang> | Partial<Tuan> | Partial<Ngay>): void;
  removeWithUndo(level: Level, ids: string[], label: string): void;
  undoNow(): void;
  bulkStatus(level: Level, ids: string[], status: Status): number;
  bulkPerson(level: Level, ids: string[], personId: string | null): void;

  setTab(tab: Tab): void;
  setQuery(q: string): void;
  setFilter(level: Level, patch: Partial<ViewFilter>): void;
  clearFilter(level: Level): void;
  setMode(level: Level, mode: ViewMode): void;
  setMonth(ym: string): void;
  setWeekAnchor(d: string): void;
  setDayDate(d: string): void;
  setSplitDay(d: string | null): void;
  toggleSelect(level: Level, id: string): void;
  setSelection(level: Level, ids: string[]): void;
  openDrawer(d: DrawerState | null): void;
  setQuickOpen(v: boolean): void;
  openSettings(s: SettingsSection | null): void;
  navigateTo(level: Level, id: string, openDrawer?: boolean): void;
  focusSearch(): void;
  askConfirm(c: ConfirmState | null): void;
  toast(text: string, kind?: Toast['kind'], opts?: { action?: Toast['action']; ttl?: number; undo?: boolean }): number;
  dismissToast(id: number): void;
  setTip(t: TipState | null): void;
  applyView(v: SavedView): void;
  saveView(name: string): void;
  removeView(id: string): void;
  onUpdateEvent(e: UpdateEvent): void;
  dismissUpdate(): void;
}

let saveTimer: number | undefined;
let retryTimer: number | undefined;
let settingsTimer: number | undefined;
let saving: Promise<boolean> | null = null;
let toastSeq = 1;

export const useApp = create<AppState>()((set, get) => {
  async function doSave(): Promise<boolean> {
    window.clearTimeout(saveTimer);
    saveTimer = undefined;
    window.clearTimeout(retryTimer);
    if (saving) await saving;
    const snapshot = get().data;
    const baseRev = get().rev;
    saving = (async () => {
      try {
        const r = await api().saveData(snapshot, baseRev);
        if (!r.ok) throw new Error(r.error ?? 'write failed');
        if (get().data === snapshot) {
          // r.data: dữ liệu đã được gộp với thay đổi vừa đồng bộ về
          set({ data: r.data ?? snapshot, rev: r.rev ?? baseRev, sync: 'saved', syncError: null });
        } else if (!r.data) {
          set({ rev: r.rev ?? baseRev });
        }
        // nếu đã gộp mà người dùng vẫn đang sửa: giữ baseRev cũ, lần lưu kế tiếp sẽ gộp lại đúng
        return true;
      } catch (e) {
        set({ sync: 'error', syncError: (e as Error).message });
        // Lỗi ghi: dữ liệu vẫn trong bộ nhớ, thử lại mỗi 10 giây (mục 12)
        retryTimer = window.setTimeout(() => void doSave(), 10_000);
        return false;
      } finally {
        saving = null;
      }
    })();
    return saving;
  }
  const scheduleSave = () => {
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => void doSave(), 300);
  };
  const saveSettingsSoon = () => {
    window.clearTimeout(settingsTimer);
    settingsTimer = window.setTimeout(() => {
      void api()
        .saveSettings(get().settings)
        .catch(() => undefined);
    }, 150);
  };

  const today = todayStr();

  return {
    ready: false,
    loadError: null,
    data: emptyData(),
    settings: defaultSettings(),
    info: { dataPath: '', logPath: '', version: '', packaged: false },
    notice: null,
    sync: 'saved',
    syncError: null,
    rev: 0,

    tab: 'overview',
    query: '',
    filters: EMPTY_FILTERS,
    modes: { thang: 'table', tuan: 'table', ngay: 'table' },
    month: ymOf(today),
    weekAnchor: today,
    dayDate: today,
    splitDay: null,
    selected: EMPTY_SEL,
    drawer: null,
    quickOpen: false,
    settingsOpen: null,
    highlight: null,
    scrollNonce: 0,
    searchFocusNonce: 0,
    confirm: null,
    toasts: [],
    undo: null,
    tip: null,
    update: { status: 'idle' },

    async init() {
      try {
        const r = await api().loadAll();
        set({ data: r.data, settings: { ...defaultSettings(), ...r.settings }, info: r.info, notice: r.notice, rev: r.rev ?? 0, ready: true });
      } catch (e) {
        set({ loadError: (e as Error).message, ready: true });
      }
    },

    mutate(fn) {
      const prev = get().data;
      const next = fn(prev);
      if (next === prev) return;
      set({ data: next, sync: 'pending' });
      scheduleSave();
    },
    replaceData(d, rev) {
      window.clearTimeout(saveTimer);
      saveTimer = undefined;
      set({ data: d, rev: rev ?? get().rev, sync: 'saved', syncError: null, selected: EMPTY_SEL, undo: null, drawer: null, splitDay: null });
    },
    applyExternal(d, rev) {
      if (get().sync !== 'saved' || saveTimer || saving) return;
      const sel = get().selected;
      const has = (arr: { id: string }[]) => new Set(arr.map((x) => x.id));
      const ids = { thang: has(d.thang), tuan: has(d.tuan), ngay: has(d.ngay) };
      set({
        data: d,
        rev,
        undo: null,
        selected: { thang: sel.thang.filter((x) => ids.thang.has(x)), tuan: sel.tuan.filter((x) => ids.tuan.has(x)), ngay: sel.ngay.filter((x) => ids.ngay.has(x)) }
      });
    },
    async flush() {
      if (get().sync === 'saved' && !saveTimer) return true;
      return doSave();
    },
    setSettings(patch) {
      set({ settings: { ...get().settings, ...patch } });
      saveSettingsSoon();
    },

    createThang(f) {
      const { code, counters } = nextCode('M', get().data);
      const item: Thang = {
        loai: 'Không gấp-Quan trọng', ten: '', personId: null, bd: null, dl: null, tt: 'Chưa làm',
        bdtt: null, kttt: null, gc: '', ...f, id: newId('t'), ma: code
      };
      get().mutate((d) => ({ ...d, thang: [...d.thang, item], counters }));
      return item;
    },
    createTuan(f) {
      const { code, counters } = nextCode('W', get().data);
      const item: Tuan = {
        ten: '', personId: null, bd: null, dl: null, tt: 'Chưa làm', bdtt: null, kttt: null, gc: '',
        ...f, id: newId('w'), ma: code
      };
      get().mutate((d) => ({ ...d, tuan: [...d.tuan, item], counters }));
      return item;
    },
    createNgay(f) {
      const { code, counters } = nextCode('D', get().data);
      const parent = get().data.tuan.find((t) => t.id === f.parentId);
      const item: Ngay = {
        ten: '', personId: parent?.personId ?? null, g1: null, g2: null, a1: null, a2: null, tt: 'Chưa làm', gc: '',
        ...f, id: newId('d'), ma: code
      };
      get().mutate((d) => ({ ...d, ngay: [...d.ngay, item], counters }));
      return item;
    },
    updateItem(level, id, patch) {
      get().mutate((d) => {
        if (level === 'thang') return { ...d, thang: d.thang.map((x) => (x.id === id ? { ...x, ...(patch as Partial<Thang>) } : x)) };
        if (level === 'tuan') return { ...d, tuan: d.tuan.map((x) => (x.id === id ? { ...x, ...(patch as Partial<Tuan>) } : x)) };
        return { ...d, ngay: d.ngay.map((x) => (x.id === id ? { ...x, ...(patch as Partial<Ngay>) } : x)) };
      });
    },
    removeWithUndo(level, ids, label) {
      const before = get().data;
      const { data } = removeItems(before, level, ids);
      const until = Date.now() + 8000;
      set({
        undo: { data: before, until },
        selected: { ...get().selected, [level]: get().selected[level].filter((x) => !ids.includes(x)) },
        drawer: get().drawer && ids.includes(get().drawer!.id ?? '') ? null : get().drawer
      });
      get().mutate(() => data);
      get().toast(label, 'info', { ttl: 8000, undo: true, action: { label: 'common.undo', run: () => get().undoNow() } });
    },
    undoNow() {
      const u = get().undo;
      if (!u || Date.now() > u.until) return;
      set({ undo: null, toasts: get().toasts.filter((t) => !t.undo) });
      get().mutate(() => u.data);
    },
    bulkStatus(level, ids, status) {
      const r = bulkSetStatus(get().data, level, ids, status);
      get().mutate(() => r.data);
      return r.skipped;
    },
    bulkPerson(level, ids, personId) {
      get().mutate((d) => bulkAssign(d, level, ids, personId));
    },

    setTab(tab) {
      set({ tab, tip: null });
    },
    setQuery(q) {
      set({ query: q });
    },
    setFilter(level, patch) {
      set({ filters: { ...get().filters, [level]: { ...get().filters[level], ...patch } } });
    },
    clearFilter(level) {
      set({ filters: { ...get().filters, [level]: {} }, query: '' });
    },
    setMode(level, mode) {
      set({ modes: { ...get().modes, [level]: mode }, splitDay: null, tip: null });
    },
    setMonth(ym) {
      set({ month: ym, splitDay: null });
    },
    setWeekAnchor(d) {
      set({ weekAnchor: d, splitDay: null });
    },
    setDayDate(d) {
      set({ dayDate: d });
    },
    setSplitDay(d) {
      set({ splitDay: d, tip: null });
    },
    toggleSelect(level, id) {
      const cur = get().selected[level];
      set({ selected: { ...get().selected, [level]: cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id] } });
    },
    setSelection(level, ids) {
      set({ selected: { ...get().selected, [level]: ids } });
    },
    openDrawer(d) {
      set({ drawer: d, quickOpen: false, tip: d ? null : get().tip });
    },
    setQuickOpen(v) {
      set({ quickOpen: v });
    },
    openSettings(s) {
      set({ settingsOpen: s, quickOpen: false });
    },
    navigateTo(level, id, openDrawer = false) {
      set({
        tab: level,
        query: '',
        filters: { ...get().filters, [level]: {} },
        modes: { ...get().modes, [level]: 'table' },
        splitDay: null,
        highlight: { level, id, until: Date.now() + 2000 },
        scrollNonce: get().scrollNonce + 1,
        drawer: openDrawer ? { level, id } : get().drawer,
        tip: null,
        quickOpen: false
      });
    },
    focusSearch() {
      set({ searchFocusNonce: get().searchFocusNonce + 1 });
    },
    askConfirm(c) {
      set({ confirm: c });
    },
    toast(text, kind = 'info', opts = {}) {
      const id = toastSeq++;
      const ttl = opts.ttl ?? (kind === 'error' ? 6000 : 3500);
      const t: Toast = { id, text, kind, ttl, action: opts.action, undo: opts.undo };
      set({ toasts: [...get().toasts.filter((x) => !(opts.undo && x.undo)), t] });
      window.setTimeout(() => get().dismissToast(id), ttl);
      return id;
    },
    dismissToast(id) {
      set({ toasts: get().toasts.filter((t) => t.id !== id) });
    },
    setTip(t) {
      set({ tip: t });
    },
    applyView(v) {
      const { q, ...rest } = v.filter;
      if (v.tab === 'overview') {
        set({ tab: 'overview', query: q ?? '' });
        return;
      }
      set({ tab: v.tab, query: q ?? '', filters: { ...get().filters, [v.tab]: rest }, modes: { ...get().modes, [v.tab]: 'table' } });
    },
    saveView(name) {
      const { tab, query, filters, settings } = get();
      if (tab === 'overview') return;
      const v: SavedView = { id: newId('v'), name, tab, filter: { ...filters[tab], q: query || undefined } };
      get().setSettings({ savedViews: [...settings.savedViews, v] });
    },
    removeView(id) {
      get().setSettings({ savedViews: get().settings.savedViews.filter((v) => v.id !== id) });
    },
    onUpdateEvent(e) {
      const u = get().update;
      switch (e.type) {
        case 'checking':
          set({ update: { ...u, status: 'checking', error: undefined } });
          break;
        case 'available':
          set({ update: { status: get().settings.autoDownloadUpdates ? 'downloading' : 'available', version: e.version, percent: 0 } });
          break;
        case 'progress':
          set({ update: { ...u, status: 'downloading', percent: e.percent } });
          break;
        case 'downloaded':
          set({ update: { status: 'ready', version: e.version, dismissed: false } });
          break;
        case 'not-available':
          set({ update: { status: e.manual ? 'latest' : 'idle' } });
          set({ settings: { ...get().settings, lastUpdateCheck: new Date().toISOString() } });
          break;
        case 'error':
          // Lỗi mạng khi kiểm tra tự động: im lặng (mục 4.2)
          set({ update: e.manual ? { status: 'error', error: e.message } : { ...u, status: u.status === 'ready' ? 'ready' : 'idle' } });
          break;
      }
    },
    dismissUpdate() {
      set({ update: { ...get().update, dismissed: true } });
    }
  };
});
