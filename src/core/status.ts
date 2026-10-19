// Trạng thái, tiến độ, ngày thực tế, quá hạn (mục 6.1 - 6.3, 6.8)
import { addDays } from './dates.ts';
import { conflictIds } from './time.ts';
import type { Data, Display, Ngay, Status, Thang, Tuan } from './model.ts';

export function agg(list: Status[], manual: Status): Status {
  if (list.length === 0) return manual;
  if (list.every((s) => s === 'Hoàn thành')) return 'Hoàn thành';
  if (list.every((s) => s === 'Chưa làm')) return 'Chưa làm';
  return 'Đang làm';
}

export const rawNgay = (n: Ngay): Status => n.tt;
export const ngaysOf = (t: Tuan, ngays: Ngay[]): Ngay[] => ngays.filter((n) => n.parentId === t.id);
export const tuansOf = (m: Thang, tuans: Tuan[]): Tuan[] => tuans.filter((t) => t.parentMa === m.ma);

export const rawTuan = (t: Tuan, ngays: Ngay[]): Status => agg(ngaysOf(t, ngays).map((n) => n.tt), t.tt);
export const rawThang = (m: Thang, tuans: Tuan[], ngays: Ngay[]): Status =>
  agg(tuansOf(m, tuans).map((t) => rawTuan(t, ngays)), m.tt);

export function over(raw: Status, dl: string | null, today: string): Display {
  if (raw !== 'Hoàn thành' && dl && dl < today) return 'Quá hạn';
  return raw;
}
export const displayTuan = (t: Tuan, ngays: Ngay[], today: string): Display => over(rawTuan(t, ngays), t.dl, today);
export const displayThang = (m: Thang, tuans: Tuan[], ngays: Ngay[], today: string): Display =>
  over(rawThang(m, tuans, ngays), m.dl, today);

export function progress(list: Status[], raw: Status): number {
  if (list.length > 0) return list.filter((s) => s === 'Hoàn thành').length / list.length;
  return raw === 'Hoàn thành' ? 1 : 0;
}
export const pTuan = (t: Tuan, ngays: Ngay[]): number => progress(ngaysOf(t, ngays).map((n) => n.tt), rawTuan(t, ngays));
export const pThang = (m: Thang, tuans: Tuan[], ngays: Ngay[]): number =>
  progress(tuansOf(m, tuans).map((t) => rawTuan(t, ngays)), rawThang(m, tuans, ngays));

export interface Actual {
  start: string | null;
  end: string | null;
}

export function actualTuan(t: Tuan, ngays: Ngay[]): Actual {
  const kids = ngaysOf(t, ngays);
  const started = kids.filter((n) => n.tt !== 'Chưa làm').map((n) => n.ngay).sort();
  const all = kids.map((n) => n.ngay).sort();
  return {
    start: t.bdtt ?? (started.length ? started[0] : null),
    end: t.kttt ?? (rawTuan(t, ngays) === 'Hoàn thành' && all.length ? all[all.length - 1] : null)
  };
}

export function actualThang(m: Thang, tuans: Tuan[], ngays: Ngay[]): Actual {
  const acts = tuansOf(m, tuans).map((t) => actualTuan(t, ngays));
  const starts = acts.map((a) => a.start).filter((x): x is string => !!x).sort();
  const ends = acts.map((a) => a.end).filter((x): x is string => !!x).sort();
  return {
    start: m.bdtt ?? (starts.length ? starts[0] : null),
    end: m.kttt ?? (rawThang(m, tuans, ngays) === 'Hoàn thành' && ends.length ? ends[ends.length - 1] : null)
  };
}

export const isDueSoon = (dl: string | null, raw: Status, today: string, days: number): boolean =>
  raw !== 'Hoàn thành' && !!dl && dl >= today && dl <= addDays(today, days);

/** Màu dải thực tế (Gantt): xanh = xong đúng hạn, vàng = đang làm, đỏ = trễ hạn */
export type ActualTone = 'ok' | 'doing' | 'late';
export function actualTone(actual: Actual, dl: string | null, today: string): ActualTone {
  if (actual.end) return dl && actual.end > dl ? 'late' : 'ok';
  return dl && today > dl ? 'late' : 'doing';
}

export interface RowInfo {
  raw: Status;
  display: Display;
  progress: number;
  actual: Actual;
  childCount: number;
}
export interface Derived {
  thang: Map<string, RowInfo>;
  tuan: Map<string, RowInfo>;
  conflicts: Set<string>;
}

/** Tính một lần cho toàn bộ dữ liệu (nhóm con trước để không O(n^2)) */
export function derive(data: Data, today: string): Derived {
  const ngaysByTuan = new Map<string, Ngay[]>();
  for (const n of data.ngay) {
    const a = ngaysByTuan.get(n.parentId);
    if (a) a.push(n);
    else ngaysByTuan.set(n.parentId, [n]);
  }
  const tuansByMa = new Map<string, Tuan[]>();
  for (const t of data.tuan) {
    const a = tuansByMa.get(t.parentMa);
    if (a) a.push(t);
    else tuansByMa.set(t.parentMa, [t]);
  }
  const tuan = new Map<string, RowInfo>();
  for (const t of data.tuan) {
    const kids = ngaysByTuan.get(t.id) ?? [];
    const raw = agg(kids.map((n) => n.tt), t.tt);
    const sorted = kids.map((n) => n.ngay).sort();
    const started = kids.filter((n) => n.tt !== 'Chưa làm').map((n) => n.ngay).sort();
    tuan.set(t.id, {
      raw,
      display: over(raw, t.dl, today),
      progress: progress(kids.map((n) => n.tt), raw),
      actual: {
        start: t.bdtt ?? (started.length ? started[0] : null),
        end: t.kttt ?? (raw === 'Hoàn thành' && sorted.length ? sorted[sorted.length - 1] : null)
      },
      childCount: kids.length
    });
  }
  const thang = new Map<string, RowInfo>();
  for (const m of data.thang) {
    const kids = tuansByMa.get(m.ma) ?? [];
    const infos = kids.map((t) => tuan.get(t.id)!);
    const raw = agg(infos.map((i) => i.raw), m.tt);
    const starts = infos.map((i) => i.actual.start).filter((x): x is string => !!x).sort();
    const ends = infos.map((i) => i.actual.end).filter((x): x is string => !!x).sort();
    thang.set(m.id, {
      raw,
      display: over(raw, m.dl, today),
      progress: progress(infos.map((i) => i.raw), raw),
      actual: {
        start: m.bdtt ?? (starts.length ? starts[0] : null),
        end: m.kttt ?? (raw === 'Hoàn thành' && ends.length ? ends[ends.length - 1] : null)
      },
      childCount: kids.length
    });
  }
  return { thang, tuan, conflicts: conflictIds(data.ngay) };
}

export interface Metrics {
  total: number;
  doing: number;
  overdue: number;
  done: number;
}
/** Số liệu 4 thẻ Module 1, tính trên CV Tháng (displayThang) */
export function metrics(data: Data, d: Derived): Metrics {
  const m: Metrics = { total: data.thang.length, doing: 0, overdue: 0, done: 0 };
  for (const t of data.thang) {
    const s = d.thang.get(t.id)!.display;
    if (s === 'Đang làm') m.doing++;
    else if (s === 'Quá hạn') m.overdue++;
    else if (s === 'Hoàn thành') m.done++;
  }
  return m;
}

export interface BellItem {
  level: 'thang' | 'tuan';
  id: string;
  ma: string;
  ten: string;
  dl: string | null;
  kind: 'overdue' | 'soon';
}
/** khóa "đã xem": đổi hạn hoặc chuyển từ sắp đến hạn sang quá hạn thì hiện lại */
export const bellKey = (i: BellItem): string => `${i.level}:${i.id}:${i.kind}:${i.dl ?? ''}`;
/** Quá hạn + Sắp đến hạn trên CV Tháng và CV Tuần (mục 6.8) */
export function bellItems(data: Data, d: Derived, today: string, days: number): BellItem[] {
  const out: BellItem[] = [];
  const push = (level: 'thang' | 'tuan', x: Thang | Tuan, info: RowInfo) => {
    if (info.display === 'Quá hạn') out.push({ level, id: x.id, ma: x.ma, ten: x.ten, dl: x.dl, kind: 'overdue' });
    else if (isDueSoon(x.dl, info.raw, today, days)) out.push({ level, id: x.id, ma: x.ma, ten: x.ten, dl: x.dl, kind: 'soon' });
  };
  for (const m of data.thang) push('thang', m, d.thang.get(m.id)!);
  for (const t of data.tuan) push('tuan', t, d.tuan.get(t.id)!);
  return out;
}
