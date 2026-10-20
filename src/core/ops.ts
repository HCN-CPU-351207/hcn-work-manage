// Thao tác dữ liệu: xóa dây chuyền, hàng loạt, gán lại (mục 6.9, 6.10, 8.6.5)
import { syncCounters } from './codes.ts';
import { rawTuan } from './status.ts';
import type { Cancel, Data, Level, Status } from './model.ts';

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
    return data.ngay.some((n) => n.parentId === id);
  }
  const m = data.thang.find((x) => x.id === id);
  return !!m && data.tuan.some((t) => t.parentMa === m.ma);
};

/**
 * Hủy việc: đặt dấu hủy, giữ nguyên trạng thái / ngày / giờ thực tế (để vẫn xem được việc đã làm).
 * Việc con CHƯA XONG và chưa hủy bị hủy theo (root = id việc cha); việc con đã xong giữ nguyên.
 * Việc đã hủy rồi thì bỏ qua. Trả về số việc bị hủy (gồm việc con).
 */
export function cancelItems(data: Data, level: Level, ids: string[], at: string, reason?: string): { data: Data; count: number } {
  const set = new Set(ids);
  const why = reason?.trim() ? reason.trim().slice(0, 200) : undefined;
  const mk = (root?: string): Cancel => ({ at, ...(why ? { reason: why } : {}), ...(root ? { root } : {}) });
  let count = 0;
  const thangHit = new Map<string, string>(); // ma → id
  const tuanHit = new Map<string, string>(); // id tuần → root
  const thang = data.thang.map((m) => {
    if (level !== 'thang' || !set.has(m.id) || m.huy) return m;
    count++;
    thangHit.set(m.ma, m.id);
    return { ...m, huy: mk() };
  });
  const tuan = data.tuan.map((t) => {
    if (t.huy) return t;
    if (level === 'tuan' && set.has(t.id)) {
      count++;
      tuanHit.set(t.id, t.id);
      return { ...t, huy: mk() };
    }
    const root = thangHit.get(t.parentMa);
    if (root && rawTuan(t, data.ngay) !== 'Hoàn thành') {
      count++;
      tuanHit.set(t.id, root);
      return { ...t, huy: mk(root) };
    }
    return t;
  });
  const ngay = data.ngay.map((n) => {
    if (n.huy) return n;
    if (level === 'ngay' && set.has(n.id)) {
      count++;
      return { ...n, huy: mk() };
    }
    const root = tuanHit.get(n.parentId);
    if (root && n.tt !== 'Hoàn thành') {
      count++;
      return { ...n, huy: mk(root) };
    }
    return n;
  });
  return { data: { ...data, thang, tuan, ngay }, count };
}

/** Khôi phục: bỏ dấu hủy của việc được chọn và các việc con bị hủy theo nó */
export function restoreItems(data: Data, level: Level, ids: string[]): { data: Data; count: number } {
  const set = new Set(ids);
  let count = 0;
  const clear = <T extends { id: string; huy?: Cancel | null }>(x: T, self: boolean): T => {
    if (!x.huy) return x;
    if ((self && set.has(x.id)) || (x.huy.root && set.has(x.huy.root))) {
      count++;
      return { ...x, huy: null };
    }
    return x;
  };
  const thang = data.thang.map((m) => clear(m, level === 'thang'));
  const tuan = data.tuan.map((t) => clear(t, level === 'tuan'));
  const ngay = data.ngay.map((n) => clear(n, level === 'ngay'));
  return { data: { ...data, thang, tuan, ngay }, count };
}

/** Đổi trạng thái hàng loạt: bỏ qua việc cha (có việc con) */
export function bulkSetStatus(data: Data, level: Level, ids: string[], status: Status): { data: Data; skipped: number } {
  // việc đã hủy: không đổi trạng thái (khôi phục trước)
  let skipped = 0;
  const okIds = new Set<string>();
  const pool: { id: string; huy?: unknown }[] = level === 'thang' ? data.thang : level === 'tuan' ? data.tuan : data.ngay;
  const cancelled = new Set(pool.filter((x) => x.huy).map((x) => x.id));
  for (const id of new Set(ids)) {
    if (hasKids(data, level, id) || cancelled.has(id)) skipped++;
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
