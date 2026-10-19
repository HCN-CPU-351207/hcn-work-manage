// Chỉ số cho bảng "Tổng quan dự án" của một CV Tháng hoặc CV Tuần.
// Thuần dữ liệu (không phụ thuộc giao diện) để kiểm thử được.
import { addDays, diffDays, isoWeek, startOfWeek } from './dates.ts';
import type { Data, Display, Ngay, Status, Thang, Tuan } from './model.ts';
import type { Derived } from './status.ts';
import { workMinutes } from './stats.ts';
import { actualMinutes, hmToMin, plannedMinutes } from './time.ts';

export type PLevel = 'thang' | 'tuan';
export type Verdict =
  | { kind: 'done'; lateDays: number } // lateDays > 0 = xong trễ
  | { kind: 'late'; days: number } // quá hạn, chưa xong
  | { kind: 'ahead'; pct: number }
  | { kind: 'ontrack' }
  | { kind: 'behind'; pct: number; need: number }
  | { kind: 'nodates' };

export interface BurnPoint {
  day: string;
  actual: number | null; // null = tương lai
  plan: number;
}
export interface HourBucket {
  key: string; // ngày đầu tuần hoặc ngày
  label: string; // 'W43' hoặc 'DD/MM'
  plan: number; // phút
  actual: number; // phút
  current: boolean;
}
export interface Slice {
  id: string | null;
  min: number;
}
export interface ChildRow {
  level: 'tuan' | 'ngay';
  id: string;
  ma: string;
  ten: string;
  status: Display;
  progress: number | null;
  dl: string | null; // hạn (tuần) hoặc ngày làm (ngày)
  doneOn: string | null;
  time: string | null; // giờ kế hoạch của CV Ngày
}
export interface Deviation {
  id: string;
  ma: string;
  ten: string;
  diff: number; // phút, thực tế - kế hoạch
}
export interface UpcomingRow {
  kind: 'late' | 'missed' | 'today' | 'tomorrow' | 'later';
  level: 'tuan' | 'ngay';
  id: string;
  ma: string;
  ten: string;
  day: string | null;
  time: string | null;
}

export interface ProjectStats {
  level: PLevel;
  start: string | null;
  end: string | null;
  progress: number;
  childDone: number;
  childTotal: number;
  elapsed: number | null; // 0..1
  elapsedDays: number | null;
  totalDays: number | null;
  daysLeft: number | null; // âm = đã trễ
  verdict: Verdict;
  burn: BurnPoint[];
  burnTotal: number;
  buckets: HourBucket[];
  planMin: number;
  actualMin: number;
  byCat: Slice[];
  byPlace: Slice[];
  byPerson: Slice[];
  workMin: number;
  children: ChildRow[];
  counts: Record<'todo' | 'doing' | 'overdue' | 'done', number>;
  accuracy: { doneCount: number; onTime: number; measured: number; planMin: number; actualMin: number; top: Deviation[] };
  upcoming: UpcomingRow[];
}

const dayOf = (iso: string | null): string | null => (iso ? iso.slice(0, 10) : null);
const ddmm = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
const ngaySort = (a: Ngay, b: Ngay) => (a.ngay + (a.g1 ?? '99')).localeCompare(b.ngay + (b.g1 ?? '99'));

/** Ngày một CV Ngày được coi là xong (để vẽ đường cộng dồn) */
export function doneDay(n: Ngay): string | null {
  if (n.tt !== 'Hoàn thành') return null;
  return dayOf(n.a2) ?? (n.ngay || null);
}

function slices(list: Ngay[], key: (n: Ngay) => string | null | undefined): Slice[] {
  const m = new Map<string | null, number>();
  for (const n of list) {
    const w = workMinutes(n).min;
    if (w <= 0) continue;
    const k = key(n) || null;
    m.set(k, (m.get(k) ?? 0) + w);
  }
  return [...m.entries()].map(([id, min]) => ({ id, min })).sort((a, b) => b.min - a.min || (a.id === null ? 1 : -1));
}

export function projectStats(data: Data, d: Derived, level: PLevel, id: string, today: string): ProjectStats | null {
  const item: Thang | Tuan | undefined = level === 'thang' ? data.thang.find((x) => x.id === id) : data.tuan.find((x) => x.id === id);
  if (!item) return null;
  const info = (level === 'thang' ? d.thang : d.tuan).get(id);
  if (!info) return null;

  const tuans = level === 'thang' ? data.tuan.filter((t) => t.parentMa === (item as Thang).ma) : [item as Tuan];
  const tuanIds = new Set(tuans.map((t) => t.id));
  const ngays = data.ngay.filter((n) => tuanIds.has(n.parentId)).sort(ngaySort);

  // khoảng thời gian: ngày kế hoạch; thiếu thì lấy theo CV Ngày
  const days = ngays.map((n) => n.ngay).filter(Boolean).sort();
  const start = item.bd ?? days[0] ?? null;
  const end = item.dl ?? days[days.length - 1] ?? null;

  // việc con trực tiếp
  const children: ChildRow[] =
    level === 'thang'
      ? tuans
          .map((t) => {
            const i = d.tuan.get(t.id)!;
            return { level: 'tuan' as const, id: t.id, ma: t.ma, ten: t.ten, status: i.display, progress: i.progress, dl: t.dl, doneOn: i.actual.end, time: null };
          })
          .sort((a, b) => (a.dl ?? '9999').localeCompare(b.dl ?? '9999') || a.ma.localeCompare(b.ma))
      : ngays.map((n) => ({
          level: 'ngay' as const,
          id: n.id,
          ma: n.ma,
          ten: n.ten,
          status: n.tt as Display,
          progress: null,
          dl: n.ngay || null,
          doneOn: doneDay(n),
          time: n.g1 && n.g2 ? `${n.g1}–${n.g2}` : null
        }));
  const counts = { todo: 0, doing: 0, overdue: 0, done: 0 };
  for (const c of children) {
    const late = c.level === 'ngay' && c.status !== 'Hoàn thành' && !!c.dl && c.dl < today;
    if (c.status === 'Hoàn thành') counts.done++;
    else if (c.status === 'Quá hạn' || late) counts.overdue++;
    else if (c.status === 'Đang làm') counts.doing++;
    else counts.todo++;
  }
  const childTotal = children.length;
  const childDone = counts.done;

  // thời gian đã trôi
  let elapsed: number | null = null;
  let elapsedDays: number | null = null;
  let totalDays: number | null = null;
  let daysLeft: number | null = null;
  if (start && end && end >= start) {
    totalDays = diffDays(start, end) + 1;
    elapsedDays = Math.min(totalDays, Math.max(0, diffDays(start, today) + 1));
    elapsed = elapsedDays / totalDays;
    daysLeft = diffDays(today, end);
  }

  // kết luận
  const raw: Status = info.raw;
  let verdict: Verdict;
  if (raw === 'Hoàn thành') {
    const fin = info.actual.end;
    verdict = { kind: 'done', lateDays: fin && end && fin > end ? diffDays(end, fin) : 0 };
  } else if (end && today > end) verdict = { kind: 'late', days: diffDays(end, today) };
  else if (elapsed === null) verdict = { kind: 'nodates' };
  else {
    const gap = info.progress - elapsed;
    if (gap >= 0.1) verdict = { kind: 'ahead', pct: Math.round(gap * 100) };
    else if (gap >= -0.05) verdict = { kind: 'ontrack' };
    else {
      const unit = childTotal || 1;
      verdict = { kind: 'behind', pct: Math.round(-gap * 100), need: Math.max(1, Math.ceil(elapsed * unit - info.progress * unit)) };
    }
  }

  // đường cộng dồn CV Ngày: kế hoạch = theo ngày được xếp; thực tế = theo ngày xong
  const burn: BurnPoint[] = [];
  const bStart = start && days[0] ? (days[0] < start ? days[0] : start) : start ?? days[0];
  const bEnd = end && days.length ? (days[days.length - 1] > end ? days[days.length - 1] : end) : end ?? days[days.length - 1];
  if (bStart && bEnd && ngays.length && diffDays(bStart, bEnd) <= 400) {
    const doneDays = ngays.map(doneDay).filter((x): x is string => !!x).sort();
    let di = 0;
    let pi = 0;
    for (let day = bStart; day <= bEnd; day = addDays(day, 1)) {
      while (di < doneDays.length && doneDays[di] <= day) di++;
      while (pi < days.length && days[pi] <= day) pi++;
      burn.push({ day, actual: day <= today ? di : null, plan: pi });
    }
  }

  // giờ theo tuần (CV Tháng) hoặc theo ngày (CV Tuần)
  const bucketMap = new Map<string, HourBucket>();
  const keyOf = (day: string) => (level === 'thang' ? startOfWeek(day) : day);
  const curKey = keyOf(today);
  if (start && end && diffDays(start, end) <= 120) {
    for (let day = keyOf(start); day <= end; day = addDays(day, level === 'thang' ? 7 : 1))
      bucketMap.set(day, { key: day, label: level === 'thang' ? `W${isoWeek(day)}` : ddmm(day), plan: 0, actual: 0, current: day === curKey });
  }
  let planMin = 0;
  let actualMin = 0;
  for (const n of ngays) {
    if (!n.ngay) continue;
    const k = keyOf(n.ngay);
    const b = bucketMap.get(k) ?? { key: k, label: level === 'thang' ? `W${isoWeek(k)}` : ddmm(k), plan: 0, actual: 0, current: k === curKey };
    const p = plannedMinutes(n) ?? 0;
    const a = n.a2 ? actualMinutes(n) ?? 0 : 0;
    b.plan += p;
    b.actual += a;
    planMin += p;
    actualMin += a;
    bucketMap.set(k, b);
  }
  const buckets = [...bucketMap.values()].sort((a, b) => a.key.localeCompare(b.key));

  // phân bổ
  const byCat = slices(ngays, (n) => n.cat);
  const byPlace = slices(ngays, (n) => n.place);
  const byPerson = slices(ngays, (n) => n.personId);
  const workMin = byCat.reduce((s, x) => s + x.min, 0);

  // độ chính xác: CV Ngày đã xong, có cả giờ kế hoạch và thực tế
  const doneList = ngays.filter((n) => n.tt === 'Hoàn thành');
  let onTime = 0;
  let measured = 0;
  let accPlan = 0;
  let accAct = 0;
  const devs: Deviation[] = [];
  for (const n of doneList) {
    const p = plannedMinutes(n);
    const a = n.a1 && n.a2 ? actualMinutes(n) : null;
    if (p === null || a === null) continue;
    measured++;
    accPlan += p;
    accAct += a;
    const endOk = dayOf(n.a2)! < n.ngay || (dayOf(n.a2) === n.ngay && hmToMin(n.a2!.slice(11, 16)) <= hmToMin(n.g2!));
    if (endOk) onTime++;
    if (a !== p) devs.push({ id: n.id, ma: n.ma, ten: n.ten, diff: a - p });
  }
  devs.sort((x, y) => Math.abs(y.diff) - Math.abs(x.diff) || x.ma.localeCompare(y.ma));

  // sắp tới & cần chú ý
  const upcoming: UpcomingRow[] = [];
  if (level === 'thang') {
    for (const t of tuans) {
      const i = d.tuan.get(t.id)!;
      if (i.display === 'Quá hạn') upcoming.push({ kind: 'late', level: 'tuan', id: t.id, ma: t.ma, ten: t.ten, day: t.dl, time: null });
    }
  }
  for (const n of ngays) {
    if (n.tt === 'Hoàn thành' || !n.ngay) continue;
    const time = n.g1 && n.g2 ? `${n.g1}–${n.g2}` : null;
    if (n.ngay < today) upcoming.push({ kind: 'missed', level: 'ngay', id: n.id, ma: n.ma, ten: n.ten, day: n.ngay, time });
  }
  const next = ngays.filter((n) => n.tt !== 'Hoàn thành' && n.ngay >= today).slice(0, 5);
  for (const n of next) {
    const kind = n.ngay === today ? 'today' : n.ngay === addDays(today, 1) ? 'tomorrow' : 'later';
    upcoming.push({ kind, level: 'ngay', id: n.id, ma: n.ma, ten: n.ten, day: n.ngay, time: n.g1 && n.g2 ? `${n.g1}–${n.g2}` : null });
  }

  return {
    level,
    start,
    end,
    progress: info.progress,
    childDone,
    childTotal,
    elapsed,
    elapsedDays,
    totalDays,
    daysLeft,
    verdict,
    burn,
    burnTotal: ngays.length,
    buckets,
    planMin,
    actualMin,
    byCat,
    byPlace,
    byPerson,
    workMin,
    children,
    counts,
    accuracy: { doneCount: doneList.length, onTime, measured, planMin: accPlan, actualMin: accAct, top: devs.slice(0, 3) },
    upcoming: upcoming.slice(0, 8)
  };
}
