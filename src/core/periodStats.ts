// Tổng quan một tuần (trang CV Tuần) hoặc một tháng (trang CV Tháng): số việc, trạng thái, đúng hạn,
// giờ kế hoạch / thực tế của CV Ngày con theo từng ngày (tuần) hoặc từng tuần (tháng).
import type { Display, Ngay } from './model.ts';
import { addDays, isoMs, isoWeek, monthDays, startOfWeek, weekDays } from './dates.ts';
import { actualMinutes, plannedMinutes } from './time.ts';

export interface PItem {
  id: string;
  bd: string | null;
  dl: string | null;
  display: Display;
  /** ngày kết thúc thực tế (đã suy ra từ việc con nếu cần) */
  actualEnd: string | null;
}
export interface PBucket {
  key: string;
  from: string;
  to: string;
  label: string;
}
export interface PeriodOverview {
  total: number;
  counts: { done: number; doing: number; over: number; todo: number; cancel: number };
  /** việc đã xong có hạn chót: bao nhiêu xong trước hoặc đúng hạn */
  onTime: { measured: number; ontime: number };
  /** việc chưa xong có hạn trong 3 ngày tới (tính từ hôm nay) */
  dueSoon: number;
  planMin: number;
  actualMin: number;
  buckets: { key: string; label: string; plan: number; actual: number; current: boolean }[];
}

/** việc có khoảng kế hoạch giao với [from, to] (giống Gantt: cần có ngày) */
export function overlaps(x: Pick<PItem, 'bd' | 'dl'>, from: string, to: string): boolean {
  const s = x.bd ?? x.dl;
  const e = x.dl ?? x.bd;
  return !!s && !!e && s <= to && e >= from;
}

export function weekBuckets(anyDay: string, dayLabel: (i: number) => string): PBucket[] {
  return weekDays(anyDay).map((d, i) => ({ key: d, from: d, to: d, label: dayLabel(i) }));
}
/** các tuần (T2–CN) chạm vào tháng, cắt theo biên tháng */
export function monthBuckets(ym: string, weekLabel: (n: number) => string): PBucket[] {
  const days = monthDays(ym);
  const first = days[0];
  const last = days[days.length - 1];
  const out: PBucket[] = [];
  for (let s = startOfWeek(first); s <= last; s = addDays(s, 7)) {
    const e = addDays(s, 6);
    out.push({ key: s, from: s < first ? first : s, to: e > last ? last : e, label: weekLabel(isoWeek(s)) });
  }
  return out;
}

export function periodOverview(items: PItem[], ngays: Ngay[], buckets: PBucket[], today: string, nowMs: number): PeriodOverview {
  const from = buckets[0].from;
  const to = buckets[buckets.length - 1].to;
  const list = items.filter((x) => overlaps(x, from, to));
  const counts = { done: 0, doing: 0, over: 0, todo: 0, cancel: 0 };
  let measured = 0;
  let ontime = 0;
  let dueSoon = 0;
  const soon = addDays(today, 3);
  for (const x of list) {
    if (x.display === 'Hoàn thành') counts.done++;
    else if (x.display === 'Đang làm') counts.doing++;
    else if (x.display === 'Quá hạn') counts.over++;
    else if (x.display === 'Đã hủy') counts.cancel++;
    else counts.todo++;
    if (x.display === 'Hoàn thành' && x.dl && x.actualEnd) {
      measured++;
      if (x.actualEnd <= x.dl) ontime++;
    }
    if ((x.display === 'Đang làm' || x.display === 'Chưa làm') && x.dl && x.dl >= today && x.dl <= soon) dueSoon++;
  }
  const bk = buckets.map((b) => ({ key: b.key, label: b.label, plan: 0, actual: 0, current: today >= b.from && today <= b.to }));
  let planMin = 0;
  let actualMin = 0;
  for (const n of ngays) {
    if (n.huy || !n.ngay || n.ngay < from || n.ngay > to) continue;
    const i = buckets.findIndex((b) => n.ngay >= b.from && n.ngay <= b.to);
    if (i < 0) continue;
    const p = plannedMinutes(n) ?? 0;
    const a = n.a1 && isoMs(n.a1) <= nowMs ? actualMinutes(n, nowMs) ?? 0 : 0;
    bk[i].plan += p;
    bk[i].actual += a;
    planMin += p;
    actualMin += a;
  }
  return { total: list.length, counts, onTime: { measured, ontime }, dueSoon, planMin, actualMin, buckets: bk };
}

/** số việc xong / tổng (bỏ đã hủy) có kế hoạch giao với [from, to] */
export function doneIn(items: PItem[], from: string, to: string): { done: number; total: number } {
  const r = { done: 0, total: 0 };
  for (const x of items) {
    if (x.display === 'Đã hủy' || !overlaps(x, from, to)) continue;
    r.total++;
    if (x.display === 'Hoàn thành') r.done++;
  }
  return r;
}
