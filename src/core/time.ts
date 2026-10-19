// Giờ, phút, ô 10 phút, trùng giờ, làn (mục 6.5 - 6.7, 8.5.5)
import { isoMs } from './dates.ts';
import type { Ngay } from './model.ts';

export const SLOT_MIN = 10;

export const hmToMin = (hm: string): number => {
  const [h, m] = hm.split(':').map(Number);
  return h * 60 + m;
};
export const minToHm = (min: number): string => {
  const t = Math.max(0, Math.round(min));
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
};

/** Việc đã xếp giờ = có đủ g1, g2 và g2 > g1 */
export const isScheduled = (n: Pick<Ngay, 'g1' | 'g2'>): boolean =>
  !!n.g1 && !!n.g2 && hmToMin(n.g2) > hmToMin(n.g1);

export function plannedMinutes(n: Pick<Ngay, 'g1' | 'g2'>): number | null {
  return isScheduled(n) ? hmToMin(n.g2!) - hmToMin(n.g1!) : null;
}

/** phút thực tế; nếu đang chạy (a2 rỗng) thì tính đến nowMs */
export function actualMinutes(n: Pick<Ngay, 'a1' | 'a2'>, nowMs?: number): number | null {
  if (!n.a1) return null;
  const end = n.a2 ? isoMs(n.a2) : nowMs;
  if (end === undefined) return null;
  return Math.max(0, Math.round((end - isoMs(n.a1)) / 60000));
}

/** diff = da - dp */
export const diffMinutes = (da: number | null, dp: number | null): number | null =>
  da === null || dp === null ? null : da - dp;

export const diffLabel = (d: number): string => (d > 0 ? `+${d}p` : d < 0 ? `−${-d}p` : '0p');
export const diffTone = (d: number): 'bad' | 'good' | 'zero' => (d > 0 ? 'bad' : d < 0 ? 'good' : 'zero');

type Span = Pick<Ngay, 'ngay' | 'g1' | 'g2'>;

/** Hai việc cùng ngày có [g1,g2) giao nhau */
export function overlaps(a: Span, b: Span): boolean {
  if (a.ngay !== b.ngay || !isScheduled(a) || !isScheduled(b)) return false;
  return hmToMin(a.g1!) < hmToMin(b.g2!) && hmToMin(b.g1!) < hmToMin(a.g2!);
}

export function conflictIds(list: Ngay[]): Set<string> {
  const out = new Set<string>();
  const byDay = new Map<string, Ngay[]>();
  for (const n of list) {
    if (!isScheduled(n)) continue;
    const arr = byDay.get(n.ngay) ?? [];
    arr.push(n);
    byDay.set(n.ngay, arr);
  }
  for (const arr of byDay.values()) {
    for (let i = 0; i < arr.length; i++)
      for (let j = i + 1; j < arr.length; j++)
        if (overlaps(arr[i], arr[j])) {
          out.add(arr[i].id);
          out.add(arr[j].id);
        }
  }
  return out;
}

export interface LaneItem {
  id: string;
  start: number;
  end: number;
}

/** Xếp việc vào các làn: việc giao nhau không cùng làn */
export function assignLanes(items: LaneItem[]): { lanes: Map<string, number>; count: number } {
  const sorted = [...items].sort((a, b) => a.start - b.start || a.end - b.end || a.id.localeCompare(b.id));
  const laneEnd: number[] = [];
  const lanes = new Map<string, number>();
  for (const it of sorted) {
    let k = laneEnd.findIndex((e) => e <= it.start);
    if (k === -1) {
      k = laneEnd.length;
      laneEnd.push(it.end);
    } else laneEnd[k] = it.end;
    lanes.set(it.id, k);
  }
  return { lanes, count: laneEnd.length };
}

export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(Math.floor(s / 3600))}:${p(Math.floor((s % 3600) / 60))}:${p(s % 60)}`;
}

export const elapsedSeconds = (a1: string, nowMs: number): number => Math.max(0, (nowMs - isoMs(a1)) / 1000);

/** "1g 30p" kiểu ngắn gọn cho tổng thời lượng */
export function durationLabel(min: number): string {
  const m = Math.max(0, Math.round(min));
  const h = Math.floor(m / 60);
  return h ? `${h}h${String(m % 60).padStart(2, '0')}` : `${m}p`;
}
