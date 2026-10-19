// Thao tác dữ liệu: xóa dây chuyền, hàng loạt, gán lại (mục 6.9, 6.10, 8.6.5)
import { syncCounters } from './codes.ts';
import { tuansOf, ngaysOf } from './status.ts';
import type { Data, Level, Status } from './model.ts';

export interface Removed {
  thang: number;
  tuan: number;
  ngay: number;
}

/** Đếm số việc con sẽ bị xóa cùng */
export function cascadeCounts(data: Data, level: Level, ids: string[]): { tuan: number; ngay: number } {
  const set = new Set(ids);
  if (level === 'ngay') return { tuan: 0, ngay: 0 };
  if (level === 'tuan') return { tuan: 0, ngay: data.ngay.filter((n) => set.has(n.parentId)).length };
  const maSet = new Set(data.thang.filter((m) => set.has(m.id)).map((m) => m.ma));
  const tuans = data.tuan.filter((t) => maSet.has(t.parentMa));
  const tIds = new Set(tuans.map((t) => t.id));
  return { tuan: tuans.length, ngay: data.ngay.filter((n) => tIds.has(n.parentId)).length };
}

export function removeItems(data: Data, level: Level, ids: string[]): { data: Data; removed: Removed } {
  const set = new Set(ids);
  const counters = syncCounters(data); // giữ bộ đếm để mã không bị dùng lại
  if (level === 'ngay') {
    const next = data.ngay.filter((n) => !set.has(n.id));
    return { data: { ...data, ngay: next, counters }, removed: { thang: 0, tuan: 0, ngay: data.ngay.length - next.length } };
  }
  if (level === 'tuan') {
    const ngay = data.ngay.filter((n) => !set.has(n.parentId));
    const tuan = data.tuan.filter((t) => !set.has(t.id));
    return {
      data: { ...data, tuan, ngay, counters },
      removed: { thang: 0, tuan: data.tuan.length - tuan.length, ngay: data.ngay.length - ngay.length }
    };
  }
  const maSet = new Set(data.thang.filter((m) => set.has(m.id)).map((m) => m.ma));
  const tuanGone = new Set(data.tuan.filter((t) => maSet.has(t.parentMa)).map((t) => t.id));
  const thang = data.thang.filter((m) => !set.has(m.id));
  const tuan = data.tuan.filter((t) => !tuanGone.has(t.id));
  const ngay = data.ngay.filter((n) => !tuanGone.has(n.parentId));
  return {
    data: { ...data, thang, tuan, ngay, counters },
    removed: { thang: data.thang.length - thang.length, tuan: data.tuan.length - tuan.length, ngay: data.ngay.length - ngay.length }
  };
}

export const hasKids = (data: Data, level: Level, id: string): boolean => {
  if (level === 'ngay') return false;
  if (level === 'tuan') {
    const t = data.tuan.find((x) => x.id === id);
    return !!t && ngaysOf(t, data.ngay).length > 0;
  }
  const m = data.thang.find((x) => x.id === id);
  return !!m && tuansOf(m, data.tuan).length > 0;
};

/** Đổi trạng thái hàng loạt: bỏ qua việc cha (có việc con) */
export function bulkSetStatus(data: Data, level: Level, ids: string[], status: Status): { data: Data; skipped: number } {
  let skipped = 0;
  const okIds = new Set<string>();
  for (const id of new Set(ids)) {
    if (hasKids(data, level, id)) skipped++;
    else okIds.add(id);
  }
  const map = <T extends { id: string; tt: Status }>(arr: T[]): T[] => arr.map((x) => (okIds.has(x.id) ? { ...x, tt: status } : x));
  return {
    data: {
      ...data,
      thang: level === 'thang' ? map(data.thang) : data.thang,
      tuan: level === 'tuan' ? map(data.tuan) : data.tuan,
      ngay: level === 'ngay' ? map(data.ngay) : data.ngay
    },
    skipped
  };
}

export function bulkAssign(data: Data, level: Level, ids: string[], personId: string | null): Data {
  const set = new Set(ids);
  const map = <T extends { id: string; personId: string | null }>(arr: T[]): T[] => arr.map((x) => (set.has(x.id) ? { ...x, personId } : x));
  return {
    ...data,
    thang: level === 'thang' ? map(data.thang) : data.thang,
    tuan: level === 'tuan' ? map(data.tuan) : data.tuan,
    ngay: level === 'ngay' ? map(data.ngay) : data.ngay
  };
}

/** Xóa người: mọi việc đang gán chuyển về "Chưa gán" */
export function removePerson(data: Data, personId: string): Data {
  const un = <T extends { personId: string | null }>(arr: T[]): T[] => arr.map((x) => (x.personId === personId ? { ...x, personId: null } : x));
  return { ...data, people: data.people.filter((p) => p.id !== personId), thang: un(data.thang), tuan: un(data.tuan), ngay: un(data.ngay) };
}

export const countAssigned = (data: Data, personId: string): number =>
  [...data.thang, ...data.tuan, ...data.ngay].filter((x) => x.personId === personId).length;

/** Sắp theo bd, rồi dl (X10); giá trị rỗng xuống cuối */
export function sortByPlan<T extends { bd: string | null; dl: string | null; ma: string }>(list: T[]): T[] {
  const k = (s: string | null) => s ?? '9999-99-99';
  return [...list].sort((a, b) => k(a.bd).localeCompare(k(b.bd)) || k(a.dl).localeCompare(k(b.dl)) || a.ma.localeCompare(b.ma));
}

/** CV Ngày: sắp theo ngày, rồi giờ bắt đầu dự kiến; chưa xếp giờ xuống cuối ngày */
export function sortNgay<T extends { ngay: string; g1: string | null; ma: string }>(list: T[]): T[] {
  return [...list].sort((a, b) => a.ngay.localeCompare(b.ngay) || (a.g1 ?? '99:99').localeCompare(b.g1 ?? '99:99') || a.ma.localeCompare(b.ma));
}
