// Đồng bộ dữ liệu giữa PC (trạm) và điện thoại qua Wi-Fi nội bộ.
// Nguyên tắc: mỗi bản ghi (người, việc tháng/tuần/ngày) có một "dấu thời gian sửa" riêng;
// khi gộp, bản sửa sau cùng thắng. Bản ghi bị xóa để lại "bia mộ" để không sống lại.
// Sau khi gộp: đánh số lại mã trùng, xóa việc mồ côi, bỏ gán người đã bị xóa.
import { formatCode, syncCounters } from './codes.ts';
import type { Prefix } from './codes.ts';
import type { Data, Ngay, Thang, Tuan } from './model.ts';
import { mergeReminded } from './reminders.ts';

export type Kind = 'people' | 'thang' | 'tuan' | 'ngay' | 'cats' | 'places';
export const KINDS: Kind[] = ['people', 'thang', 'tuan', 'ngay', 'cats', 'places'];
/** danh mục: máy chưa sửa lần nào không gửi gì (dùng mặc định) */
const OPT_KINDS: Kind[] = ['cats', 'places'];

export interface SyncMeta {
  v: 1;
  /** khóa `${kind}:${id}` → thời điểm sửa gần nhất (ms) */
  stamps: Record<string, number>;
  /** khóa `${kind}:${id}` → thời điểm xóa (ms) */
  tomb: Record<string, number>;
}

/** Bia mộ cũ hơn chừng này thì bỏ (thiết bị lâu không đồng bộ có thể làm việc đã xóa sống lại) */
export const TOMB_TTL = 180 * 24 * 3600 * 1000;

export const emptyMeta = (): SyncMeta => ({ v: 1, stamps: {}, tomb: {} });
export const skey = (k: Kind, id: string): string => `${k}:${id}`;

type Rec = { id: string };
const recs = (d: Data, k: Kind): Rec[] => (d[k] as Rec[] | undefined) ?? [];

export function isMeta(x: unknown): x is SyncMeta {
  return !!x && typeof x === 'object' && typeof (x as SyncMeta).stamps === 'object' && typeof (x as SyncMeta).tomb === 'object';
}

/** Dấu ban đầu cho dữ liệu đã có trước khi bật đồng bộ (ts thấp: mọi sửa đổi sau đều thắng) */
export function initMeta(d: Data, ts = 1): SyncMeta {
  const m = emptyMeta();
  for (const k of KINDS) for (const r of recs(d, k)) m.stamps[skey(k, r.id)] = ts;
  return m;
}

/** Đóng dấu các bản ghi khác nhau giữa prev và next */
export function stampChanges(prev: Data | null, next: Data, meta: SyncMeta, now: number): SyncMeta {
  const m: SyncMeta = { v: 1, stamps: { ...meta.stamps }, tomb: { ...meta.tomb } };
  for (const k of KINDS) {
    const before = new Map<string, string>();
    if (prev) for (const r of recs(prev, k)) before.set(r.id, JSON.stringify(r));
    const seen = new Set<string>();
    for (const r of recs(next, k)) {
      const key = skey(k, r.id);
      seen.add(r.id);
      if (before.get(r.id) !== JSON.stringify(r)) {
        m.stamps[key] = now;
        delete m.tomb[key];
      } else if (m.stamps[key] === undefined) m.stamps[key] = 1;
    }
    for (const id of before.keys()) {
      if (seen.has(id)) continue;
      const key = skey(k, id);
      m.tomb[key] = now;
      delete m.stamps[key];
    }
  }
  return m;
}

export function pruneTombs(meta: SyncMeta, now: number): SyncMeta {
  const tomb: Record<string, number> = {};
  for (const [k, t] of Object.entries(meta.tomb)) if (now - t < TOMB_TTL) tomb[k] = t;
  return { ...meta, tomb };
}

/** Hai bản có cùng nội dung (không xét thứ tự bản ghi; giao diện luôn tự sắp xếp) */
export function sameData(a: Data, b: Data): boolean {
  if (a === b) return true;
  const ra = Object.keys(a.reminded ?? {}).sort().join('|');
  const rb = Object.keys(b.reminded ?? {}).sort().join('|');
  if (ra !== rb) return false;
  return KINDS.every((k) => {
    const A = recs(a, k);
    const B = recs(b, k);
    if (A.length !== B.length) return false;
    const map = new Map(A.map((r) => [r.id, JSON.stringify(r)]));
    return B.every((r) => map.get(r.id) === JSON.stringify(r));
  });
}

function clone(d: Data): Data {
  return { ...d, people: [...d.people], thang: [...d.thang], tuan: [...d.tuan], ngay: [...d.ngay] };
}
/** danh mục rỗng sau gộp mà cả hai bên chưa từng có → để trống (dùng mặc định) */
function setRecs(out: Data, k: Kind, list: Rec[], had: boolean): void {
  if (OPT_KINDS.includes(k) && !had && !list.length) {
    delete (out as unknown as Record<string, unknown>)[k];
    return;
  }
  (out as unknown as Record<Kind, Rec[]>)[k] = list;
}

/**
 * Sửa dữ liệu sau khi gộp:
 * 1) mã trùng (hai máy cùng tạo M008): giữ bản cũ hơn (ưu tiên bản không thuộc `otherOnly`), đánh số lại bản kia;
 *    việc tuần mới tạo cùng phía với việc tháng bị đánh số lại thì đổi theo mã mới;
 * 2) việc tuần mất tháng cha / việc ngày mất tuần cha → xóa theo (giống xóa dây chuyền);
 * 3) gán cho người đã bị xóa → "Chưa gán".
 */
export function reconcile(input: Data, meta: SyncMeta, otherOnly: Set<string>): Data {
  const d = clone(input);
  let counters = syncCounters(d);
  const stampOf = (k: Kind, id: string) => meta.stamps[skey(k, id)] ?? 0;

  const fixCodes = <T extends { id: string; ma: string }>(k: Kind, p: Prefix, list: T[], onRenumber?: (old: string, next: string, rec: T) => void): T[] => {
    const groups = new Map<string, T[]>();
    for (const r of list) {
      const g = r.ma.trim().toUpperCase();
      const arr = groups.get(g);
      if (arr) arr.push(r);
      else groups.set(g, [r]);
    }
    const renumber = new Map<string, string>();
    for (const [, arr] of groups) {
      if (arr.length < 2) continue;
      const sorted = [...arr].sort(
        (a, b) =>
          Number(otherOnly.has(skey(k, a.id))) - Number(otherOnly.has(skey(k, b.id))) ||
          stampOf(k, a.id) - stampOf(k, b.id) ||
          a.id.localeCompare(b.id)
      );
      for (const r of sorted.slice(1)) {
        counters = { ...counters, [p]: counters[p] + 1 };
        renumber.set(r.id, formatCode(p, counters[p]));
      }
    }
    if (!renumber.size) return list;
    return list.map((r) => {
      const nm = renumber.get(r.id);
      if (!nm) return r;
      onRenumber?.(r.ma, nm, r);
      return { ...r, ma: nm };
    });
  };

  const remap: { old: string; next: string }[] = [];
  d.thang = fixCodes<Thang>('thang', 'M', d.thang, (old, next, rec) => {
    if (otherOnly.has(skey('thang', rec.id))) remap.push({ old, next });
  });
  if (remap.length) {
    d.tuan = d.tuan.map((t) => {
      const hit = remap.find((x) => x.old === t.parentMa);
      return hit && otherOnly.has(skey('tuan', t.id)) ? { ...t, parentMa: hit.next } : t;
    });
  }
  d.tuan = fixCodes<Tuan>('tuan', 'W', d.tuan);
  d.ngay = fixCodes<Ngay>('ngay', 'D', d.ngay);

  const maSet = new Set(d.thang.map((m) => m.ma));
  d.tuan = d.tuan.filter((t) => maSet.has(t.parentMa));
  const tuanIds = new Set(d.tuan.map((t) => t.id));
  d.ngay = d.ngay.filter((n) => tuanIds.has(n.parentId));

  const pids = new Set(d.people.map((p) => p.id));
  const unassign = <T extends { personId: string | null }>(arr: T[]): T[] =>
    arr.some((x) => x.personId && !pids.has(x.personId)) ? arr.map((x) => (x.personId && !pids.has(x.personId) ? { ...x, personId: null } : x)) : arr;
  d.thang = unassign(d.thang);
  d.tuan = unassign(d.tuan);
  d.ngay = unassign(d.ngay);

  // 4) Phân loại / Vị trí đã bị xóa khỏi danh mục → bỏ trống
  const catIds = d.cats ? new Set(d.cats.map((o) => o.id)) : null;
  const placeIds = d.places ? new Set(d.places.map((o) => o.id)) : null;
  const dropCat = <T extends { cat?: string | null }>(arr: T[]): T[] =>
    catIds && arr.some((x) => x.cat && !catIds.has(x.cat)) ? arr.map((x) => (x.cat && !catIds.has(x.cat) ? { ...x, cat: null } : x)) : arr;
  d.thang = dropCat(d.thang);
  d.tuan = dropCat(d.tuan);
  d.ngay = dropCat(d.ngay);
  if (placeIds && d.ngay.some((x) => x.place && !placeIds.has(x.place)))
    d.ngay = d.ngay.map((x) => (x.place && !placeIds.has(x.place) ? { ...x, place: null } : x));

  d.counters = syncCounters({ ...d, counters });
  return d;
}

export interface MergeResult {
  data: Data;
  meta: SyncMeta;
}

/**
 * Gộp dữ liệu hai thiết bị. `a` là trạm (PC), `b` là thiết bị gửi lên.
 * Kết quả xác định, không phụ thuộc thứ tự nhận; gộp lại lần nữa không đổi gì (idempotent).
 */
export function mergeData(a: Data, am: SyncMeta, b: Data, bm: SyncMeta, now: number): MergeResult {
  const out = clone(a);
  const stamps: Record<string, number> = {};
  const tomb: Record<string, number> = {};
  const bOnly = new Set<string>();

  for (const k of KINDS) {
    const A = new Map(recs(a, k).map((r) => [r.id, r]));
    const B = new Map(recs(b, k).map((r) => [r.id, r]));
    const order = [...A.keys(), ...[...B.keys()].filter((id) => !A.has(id))];
    const result: Rec[] = [];
    for (const id of order) {
      const key = skey(k, id);
      const ra = A.get(id);
      const rb = B.get(id);
      const sa = ra ? am.stamps[key] ?? 0 : -1;
      const sb = rb ? bm.stamps[key] ?? 0 : -1;
      let rec: Rec;
      let s: number;
      if (ra && rb) {
        if (sb > sa) {
          rec = rb;
          s = sb;
        } else {
          rec = ra;
          s = sa;
        }
      } else if (ra) {
        rec = ra;
        s = sa;
      } else {
        rec = rb!;
        s = sb;
        bOnly.add(key);
      }
      const t = Math.max(am.tomb[key] ?? -1, bm.tomb[key] ?? -1);
      if (t >= s && t >= 0) {
        tomb[key] = t;
        continue;
      }
      stamps[key] = s;
      result.push(rec);
    }
    setRecs(out, k, result, a[k] !== undefined || b[k] !== undefined);
  }
  for (const src of [am.tomb, bm.tomb])
    for (const [key, t] of Object.entries(src)) if (stamps[key] === undefined) tomb[key] = Math.max(tomb[key] ?? -1, t);

  out.counters = {
    M: Math.max(a.counters?.M ?? 0, b.counters?.M ?? 0),
    W: Math.max(a.counters?.W ?? 0, b.counters?.W ?? 0),
    D: Math.max(a.counters?.D ?? 0, b.counters?.D ?? 0)
  };
  out.reminded = mergeReminded(a.reminded, b.reminded, now);
  const merged: SyncMeta = { v: 1, stamps, tomb };
  const fixed = reconcile(out, merged, bOnly);
  const meta = pruneTombs(sameData(fixed, out) ? merged : stampChanges(out, fixed, merged, now), now);
  return { data: fixed, meta };
}

/**
 * Áp một lần lưu từ giao diện. `base` là dữ liệu giao diện đang dựa vào; `current` là dữ liệu mới nhất đã lưu.
 * Nếu trong lúc đó dữ liệu đã đổi (do đồng bộ), chỉ áp những bản ghi giao diện thực sự sửa lên `current`.
 */
export function applyEdit(base: Data, edited: Data, current: Data, meta: SyncMeta, now: number): MergeResult & { patched: boolean } {
  if (base === current || sameData(base, current)) {
    return { data: edited, meta: stampChanges(current, edited, meta, now), patched: false };
  }
  const out = clone(current);
  const localNew = new Set<string>();
  for (const k of KINDS) {
    const before = new Map(recs(base, k).map((r) => [r.id, JSON.stringify(r)]));
    const editedIds = new Set(recs(edited, k).map((r) => r.id));
    const changed = new Map<string, Rec>();
    for (const r of recs(edited, k)) if (before.get(r.id) !== JSON.stringify(r)) changed.set(r.id, r);
    const deleted = new Set([...before.keys()].filter((id) => !editedIds.has(id)));
    const cur = recs(current, k);
    const curIds = new Set(cur.map((r) => r.id));
    const list = cur.filter((r) => !deleted.has(r.id)).map((r) => changed.get(r.id) ?? r);
    for (const [id, r] of changed) {
      if (!curIds.has(id)) {
        list.push(r);
        localNew.add(skey(k, id));
      }
    }
    setRecs(out, k, list, current[k] !== undefined || edited[k] !== undefined);
  }
  out.counters = {
    M: Math.max(current.counters?.M ?? 0, edited.counters?.M ?? 0),
    W: Math.max(current.counters?.W ?? 0, edited.counters?.W ?? 0),
    D: Math.max(current.counters?.D ?? 0, edited.counters?.D ?? 0)
  };
  out.reminded = mergeReminded(current.reminded, edited.reminded, now);
  const stamped = stampChanges(current, out, meta, now);
  const fixed = reconcile(out, stamped, localNew);
  return { data: fixed, meta: stampChanges(out, fixed, stamped, now), patched: true };
}

/** Đếm nhanh thay đổi giữa hai bản (để hiện "Đã đồng bộ N thay đổi") */
export function countDiff(a: Data, b: Data): number {
  let n = 0;
  for (const k of KINDS) {
    const A = new Map(recs(a, k).map((r) => [r.id, JSON.stringify(r)]));
    const B = new Map(recs(b, k).map((r) => [r.id, JSON.stringify(r)]));
    for (const [id, s] of B) if (A.get(id) !== s) n++;
    for (const id of A.keys()) if (!B.has(id)) n++;
  }
  return n;
}

