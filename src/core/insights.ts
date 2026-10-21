// Chỉ số phụ cho các dải biểu đồ (CV Tháng / Tuần / Ngày) tính trên một nhóm CV Ngày:
// phân bổ giờ theo Phân loại / Vị trí / người, độ chính xác kế hoạch, việc cần chú ý, số việc xong theo khung.
import type { Ngay } from './model.ts';
import type { PBucket } from './periodStats.ts';
import { workMinutes } from './stats.ts';
import { actualMinutes, plannedMinutes } from './time.ts';

export interface Slice {
  id: string | null;
  min: number;
}
export interface PersonLoad {
  id: string | null;
  total: number;
  done: number;
  min: number;
}
export interface DevRow {
  id: string;
  ma: string;
  ten: string;
  diff: number;
}
export interface NgayInsights {
  total: number;
  done: number;
  running: number;
  /** chưa có giờ dự kiến */
  unscheduled: number;
  /** quá giờ bắt đầu dự kiến mà chưa bắt đầu */
  lateStart: number;
  /** đang làm mà đã quá giờ kết thúc dự kiến */
  overrun: number;
  conflicts: number;
  workMin: number;
  byCat: Slice[];
  byPlace: Slice[];
  people: PersonLoad[];
  accuracy: { measured: number; ontime: number; planMin: number; actualMin: number; avgDev: number | null; top: DevRow[] };
  perBucket: { key: string; label: string; done: number; total: number; current: boolean }[];
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

export function ngayInsights(
  list: Ngay[],
  o: { today: string; nowHm: string; conflicts?: Set<string>; buckets?: PBucket[] }
): NgayInsights {
  const live = list.filter((n) => !n.huy);
  let done = 0;
  let running = 0;
  let unscheduled = 0;
  let lateStart = 0;
  let overrun = 0;
  let conflicts = 0;
  const pm = new Map<string | null, PersonLoad>();
  let measured = 0;
  let ontime = 0;
  let accPlan = 0;
  let accActual = 0;
  const devs: DevRow[] = [];
  const passed = (n: Ngay, hm: string | null) => !!hm && (n.ngay < o.today || (n.ngay === o.today && hm < o.nowHm));
  for (const n of live) {
    const isDone = n.tt === 'Hoàn thành';
    if (isDone) done++;
    if (n.a1 && !n.a2) running++;
    if (!n.g1 || !n.g2) unscheduled++;
    if (!isDone && !n.a1 && passed(n, n.g1)) lateStart++;
    if (!isDone && n.a1 && !n.a2 && passed(n, n.g2)) overrun++;
    if (o.conflicts?.has(n.id)) conflicts++;
    const k = n.personId ?? null;
    const p = pm.get(k) ?? { id: k, total: 0, done: 0, min: 0 };
    p.total++;
    if (isDone) p.done++;
    p.min += workMinutes(n).min;
    pm.set(k, p);
    const pl = plannedMinutes(n);
    const ac = n.a1 && n.a2 ? actualMinutes(n) : null;
    if (isDone && pl !== null && ac !== null) {
      measured++;
      const end = Date.parse(`${n.ngay}T${n.g2}:00`);
      if (Date.parse(n.a2!) <= end + 5 * 60_000) ontime++;
      accPlan += pl;
      accActual += ac;
      if (ac !== pl) devs.push({ id: n.id, ma: n.ma, ten: n.ten, diff: ac - pl });
    }
  }
  const people = [...pm.values()].sort((a, b) => b.min - a.min || b.total - a.total);
  const byCat = slices(list, (n) => n.cat);
  const byPlace = slices(list, (n) => n.place);
  const perBucket = (o.buckets ?? []).map((b) => {
    const inB = live.filter((n) => n.ngay >= b.from && n.ngay <= b.to);
    return { key: b.key, label: b.label, done: inB.filter((n) => n.tt === 'Hoàn thành').length, total: inB.length, current: o.today >= b.from && o.today <= b.to };
  });
  devs.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
  return {
    total: live.length,
    done,
    running,
    unscheduled,
    lateStart,
    overrun,
    conflicts,
    workMin: byCat.reduce((s, x) => s + x.min, 0),
    byCat,
    byPlace,
    people,
    accuracy: { measured, ontime, planMin: accPlan, actualMin: accActual, avgDev: measured ? Math.round((accActual - accPlan) / measured) : null, top: devs.slice(0, 4) },
    perBucket
  };
}
