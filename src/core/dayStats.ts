// Chỉ số cho CV Ngày: (A) một việc cụ thể — checklist, thời gian, các bước; (B) tổng quan một ngày.
import type { Display, Ngay } from './model.ts';
import { addDays, startOfWeek } from './dates.ts';
import { ckOf, ckProgress } from './checklist.ts';

const ms = (iso: string) => Date.parse(iso);
const minBetween = (a: string, b: string) => Math.round((ms(b) - ms(a)) / 60000);
const planAt = (n: Ngay, hm: string | null) => (hm ? `${n.ngay}T${hm}:00` : null);

export interface StepInfo {
  id: string;
  text: string;
  at: string;
  /** phút kể từ bước trước (hoặc từ lúc bấm Bắt đầu); null nếu không biết mốc trước */
  gap: number | null;
  longest: boolean;
}
export interface NgayStats {
  ck: { done: number; total: number };
  planMin: number | null;
  /** phút đã làm: từ lúc bấm Bắt đầu tới lúc kết thúc (hoặc tới bây giờ nếu đang làm) */
  workedMin: number | null;
  running: boolean;
  /** bắt đầu muộn (+) / sớm (−) so với dự kiến, phút */
  startDelta: number | null;
  /** kết thúc muộn (+) / sớm (−) so với dự kiến, phút */
  endDelta: number | null;
  /** còn bao nhiêu phút tới giờ kết thúc dự kiến (đang làm) */
  leftMin: number | null;
  steps: StepInfo[];
  pending: number;
}

export function ngayStats(n: Ngay, nowIso: string): NgayStats {
  const ps = planAt(n, n.g1);
  const pe = planAt(n, n.g2);
  const planMin = ps && pe ? Math.max(0, minBetween(ps, pe)) : null;
  const running = !!n.a1 && !n.a2;
  const workedMin = n.a1 ? Math.max(0, minBetween(n.a1, n.a2 ?? nowIso)) : null;
  const startDelta = n.a1 && ps ? minBetween(ps, n.a1) : null;
  const endDelta = n.a2 && pe ? minBetween(pe, n.a2) : null;
  const leftMin = running && pe ? minBetween(nowIso, pe) : null;
  const done = ckOf(n)
    .filter((c) => c.done && c.at)
    .sort((a, b) => (a.at! < b.at! ? -1 : a.at! > b.at! ? 1 : 0));
  let prev: string | null = n.a1;
  const steps: StepInfo[] = done.map((c) => {
    const gap = prev && c.at! >= prev ? minBetween(prev, c.at!) : null;
    prev = c.at!;
    return { id: c.id, text: c.text, at: c.at!, gap, longest: false };
  });
  const max = Math.max(0, ...steps.map((s) => s.gap ?? 0));
  if (max > 0 && steps.length > 1) {
    const i = steps.findIndex((s) => s.gap === max);
    if (i >= 0) steps[i].longest = true;
  }
  const p = ckProgress(n);
  return { ck: p, planMin, workedMin, running, startDelta, endDelta, leftMin, steps, pending: p.total - p.done };
}

// ---------- (B) Tổng quan một ngày ----------

export interface DayItem {
  n: Ngay;
  display: Display;
}
export interface HourBucket {
  h: number;
  plan: number;
  actual: number;
}
export interface DayOverview {
  day: string;
  total: number;
  hours: HourBucket[];
  counts: { done: number; doing: number; over: number; todo: number; cancel: number };
  /** việc đã xong có giờ dự kiến: bao nhiêu xong trước giờ kết thúc dự kiến (+5 phút) */
  onTime: { measured: number; ontime: number };
  planMin: number;
  actualMin: number;
}

/** cộng phần giao của [s, e) với từng giờ của ngày */
function addSpan(buckets: Map<number, HourBucket>, day: string, s: string, e: string, key: 'plan' | 'actual'): number {
  const d0 = ms(`${day}T00:00:00`);
  const a = Math.max(ms(s), d0);
  const b = Math.min(ms(e), d0 + 24 * 3600_000);
  if (b <= a) return 0;
  let total = 0;
  for (let h = Math.floor((a - d0) / 3600_000); h < 24 && d0 + h * 3600_000 < b; h++) {
    const hs = d0 + h * 3600_000;
    const part = Math.max(0, Math.min(b, hs + 3600_000) - Math.max(a, hs)) / 60000;
    if (part <= 0) continue;
    const bk = buckets.get(h) ?? { h, plan: 0, actual: 0 };
    bk[key] += part;
    buckets.set(h, bk);
    total += part;
  }
  return total;
}

export function dayOverview(items: DayItem[], day: string, nowIso: string): DayOverview {
  const list = items.filter((x) => x.n.ngay === day);
  const buckets = new Map<number, HourBucket>();
  const counts = { done: 0, doing: 0, over: 0, todo: 0, cancel: 0 };
  let planMin = 0;
  let actualMin = 0;
  let measured = 0;
  let ontime = 0;
  for (const { n, display } of list) {
    if (display === 'Hoàn thành') counts.done++;
    else if (display === 'Đang làm') counts.doing++;
    else if (display === 'Quá hạn') counts.over++;
    else if (display === 'Đã hủy') counts.cancel++;
    else counts.todo++;
    if (display === 'Đã hủy') continue;
    const ps = planAt(n, n.g1);
    const pe = planAt(n, n.g2);
    if (ps && pe) planMin += addSpan(buckets, day, ps, pe, 'plan');
    if (n.a1) actualMin += addSpan(buckets, day, n.a1, n.a2 ?? (nowIso > n.a1 ? nowIso : n.a1), 'actual');
    if (n.a2 && pe) {
      measured++;
      if (ms(n.a2) <= ms(pe) + 5 * 60_000) ontime++;
    }
  }
  // khung giờ hiển thị: ít nhất 7h–18h, mở rộng theo dữ liệu
  const used = [...buckets.keys()];
  const lo = Math.min(7, ...used);
  const hi = Math.max(18, ...used.map((h) => h + 1));
  const hours: HourBucket[] = [];
  for (let h = lo; h < hi; h++) {
    const b = buckets.get(h);
    hours.push({ h, plan: Math.round(b?.plan ?? 0), actual: Math.round(b?.actual ?? 0) });
  }
  return { day, total: list.length, hours, counts, onTime: { measured, ontime }, planMin: Math.round(planMin), actualMin: Math.round(actualMin) };
}

/** số CV Ngày đã xong / tổng (bỏ việc đã hủy) trong tuần và tháng chứa ngày đang xem */
export function periodDone(items: DayItem[], day: string): { week: { done: number; total: number }; month: { done: number; total: number } } {
  const ws = startOfWeek(day);
  const we = addDays(ws, 6);
  const ym = day.slice(0, 7);
  const week = { done: 0, total: 0 };
  const month = { done: 0, total: 0 };
  for (const { n, display } of items) {
    if (display === 'Đã hủy' || !n.ngay) continue;
    const done = display === 'Hoàn thành';
    if (n.ngay >= ws && n.ngay <= we) {
      week.total++;
      if (done) week.done++;
    }
    if (n.ngay.slice(0, 7) === ym) {
      month.total++;
      if (done) month.done++;
    }
  }
  return { week, month };
}
