// Nút Bắt đầu / Kết thúc / Reset và ràng buộc sửa trạng thái (mục 6.4, 6.9)
import { diffDays } from './dates.ts';
import type { Data, Ngay, Status, Thang, Tuan } from './model.ts';

/** CV Ngày: theo giờ (ISO datetime) */
export function startNgay(n: Ngay, nowIso: string): Ngay {
  return { ...n, a1: nowIso, a2: null, tt: 'Đang làm' };
}
export function endNgay(n: Ngay, nowIso: string): Ngay {
  const a1 = n.a1 ?? (n.g1 ? `${n.ngay}T${n.g1}:00` : nowIso);
  return { ...n, a1, a2: nowIso, tt: 'Hoàn thành' };
}
export function resetNgay(n: Ngay): Ngay {
  return { ...n, a1: null, a2: null, tt: 'Chưa làm' };
}
/** Sửa a1/a2 trong form: a2 → Hoàn thành; chỉ a1 → Đang làm; rỗng → Chưa làm */
export function applyActualEdit(n: Ngay): Ngay {
  const tt: Status = n.a2 ? 'Hoàn thành' : n.a1 ? 'Đang làm' : 'Chưa làm';
  return { ...n, tt };
}
/** Thêm mới: a2 có giá trị mà chưa Hoàn thành thì tự chuyển Hoàn thành */
export function normalizeNewNgay(n: Ngay): Ngay {
  return n.a2 && n.tt !== 'Hoàn thành' ? { ...n, tt: 'Hoàn thành' } : n;
}

/** CV Tháng / Tuần: theo ngày */
export function startRange<T extends Thang | Tuan>(x: T, today: string): T {
  return { ...x, bdtt: today };
}
export function endRange<T extends Thang | Tuan>(x: T, today: string): T {
  return { ...x, kttt: today, bdtt: x.bdtt ?? today };
}
export function resetRange<T extends Thang | Tuan>(x: T): T {
  return { ...x, bdtt: null, kttt: null };
}
/** "đang chạy N ngày" = today - bdtt + 1, chỉ khi có bdtt và chưa kttt */
export function runningDays(x: Pick<Thang, 'bdtt' | 'kttt'>, today: string): number | null {
  if (!x.bdtt || x.kttt) return null;
  return diffDays(x.bdtt, today) + 1;
}

/** Chỉ sửa tay trạng thái khi không có việc con (X19) */
export const canEditStatus = (childCount: number): boolean => childCount === 0;

/**
 * Vuốt phải trên mobile với việc cha: "Hoàn thành tất cả việc con".
 * Đặt Hoàn thành cho mọi việc lá (ngày, và tuần chưa có ngày), để trạng thái cha tự tính ra Hoàn thành.
 */
export function completeTree(data: Data, level: 'thang' | 'tuan' | 'ngay', id: string): Data {
  if (level === 'ngay') return { ...data, ngay: data.ngay.map((n) => (n.id === id ? { ...n, tt: 'Hoàn thành' } : n)) };
  let tuanIds: Set<string>;
  let thangId: string | null = null;
  if (level === 'tuan') tuanIds = new Set([id]);
  else {
    const m = data.thang.find((x) => x.id === id);
    if (!m) return data;
    thangId = m.id;
    tuanIds = new Set(data.tuan.filter((t) => t.parentMa === m.ma).map((t) => t.id));
  }
  return {
    ...data,
    thang: data.thang.map((m) => (m.id === thangId ? { ...m, tt: 'Hoàn thành' } : m)),
    tuan: data.tuan.map((t) => (tuanIds.has(t.id) ? { ...t, tt: 'Hoàn thành' } : t)),
    ngay: data.ngay.map((n) => (tuanIds.has(n.parentId) ? { ...n, tt: 'Hoàn thành' } : n))
  };
}

