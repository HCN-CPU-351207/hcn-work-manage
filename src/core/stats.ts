// Thống kê thời gian CV Ngày theo Phân loại / Vị trí
import type { Data, Ngay, OptKind } from './model.ts';
import { actualMinutes, plannedMinutes } from './time.ts';

/** phút của một việc: giờ thực tế nếu đã có bắt đầu và kết thúc, chưa có thì lấy giờ kế hoạch */
export function workMinutes(n: Ngay): { min: number; actual: boolean } {
  // việc đã hủy: chỉ tính giờ đã thực sự làm
  if (n.huy && !(n.a1 && n.a2)) return { min: 0, actual: false };
  if (n.a1 && n.a2) {
    const a = actualMinutes(n);
    if (a !== null && a > 0) return { min: a, actual: true };
  }
  return { min: plannedMinutes(n) ?? 0, actual: false };
}

export interface StatRow {
  /** id mục; null = chưa phân loại / chưa có vị trí */
  id: string | null;
  min: number;
  count: number;
}

/** cộng phút theo danh mục trong khoảng ngày [from, to]; bỏ việc 0 phút; sắp giảm dần */
export function minutesBy(data: Data, kind: OptKind, from: string, to: string, personId?: string | null): { rows: StatRow[]; total: number; planOnly: number } {
  const acc = new Map<string | null, StatRow>();
  let total = 0;
  let planOnly = 0;
  for (const n of data.ngay) {
    if (!n.ngay || n.ngay < from || n.ngay > to) continue;
    if (personId && n.personId !== personId) continue;
    const w = workMinutes(n);
    if (w.min <= 0) continue;
    const id = (kind === 'cats' ? n.cat : n.place) || null;
    const r = acc.get(id) ?? { id, min: 0, count: 0 };
    r.min += w.min;
    r.count++;
    acc.set(id, r);
    total += w.min;
    if (!w.actual) planOnly += w.min;
  }
  const rows = [...acc.values()].sort((a, b) => b.min - a.min || (a.id === null ? 1 : b.id === null ? -1 : 0));
  return { rows, total, planOnly };
}
