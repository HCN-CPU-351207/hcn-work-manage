// Lọc / sắp xếp theo từng cột kiểu Excel. Thuần dữ liệu: nhận hàm lấy giá trị ô để kiểm thử được.
export interface CellVal {
  /** giá trị gốc dùng để lọc (ổn định khi đổi ngôn ngữ); '' = ô trống */
  key: string;
  /** chữ hiển thị trong danh sách lọc */
  label: string;
  /** khóa sắp xếp */
  sort: string | number;
}
export type ValueFn<R> = (row: R, col: string) => CellVal;

/** giữ dòng có giá trị nằm trong danh sách được chọn ở MỌI cột đang lọc (trừ cột `except`) */
export function applyColFilters<R>(rows: R[], cols: Record<string, string[]> | undefined, val: ValueFn<R>, except?: string): R[] {
  const active = Object.entries(cols ?? {}).filter(([k]) => k !== except);
  if (!active.length) return rows;
  const sets = active.map(([k, v]) => [k, new Set(v)] as const);
  return rows.filter((r) => sets.every(([k, set]) => set.has(val(r, k).key)));
}

/** sắp xếp ổn định; ô trống luôn nằm cuối */
export function sortRows<R>(rows: R[], sort: { key: string; dir: 1 | -1 } | undefined, val: ValueFn<R>): R[] {
  if (!sort) return rows;
  const withIdx = rows.map((r, i) => ({ r, i, v: val(r, sort.key) }));
  withIdx.sort((a, b) => {
    const ea = a.v.key === '';
    const eb = b.v.key === '';
    if (ea !== eb) return ea ? 1 : -1;
    const x = a.v.sort;
    const y = b.v.sort;
    const c = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), undefined, { numeric: true, sensitivity: 'base' });
    return c * sort.dir || a.i - b.i;
  });
  return withIdx.map((x) => x.r);
}

export interface DistinctVal {
  key: string;
  label: string;
  count: number;
  sort: string | number;
}
/** danh sách giá trị khác nhau của một cột (ô trống cuối danh sách) */
export function distinctValues<R>(rows: R[], col: string, val: ValueFn<R>): DistinctVal[] {
  const m = new Map<string, DistinctVal>();
  for (const r of rows) {
    const v = val(r, col);
    const cur = m.get(v.key);
    if (cur) cur.count++;
    else m.set(v.key, { key: v.key, label: v.label, count: 1, sort: v.sort });
  }
  return [...m.values()].sort((a, b) => {
    if ((a.key === '') !== (b.key === '')) return a.key === '' ? 1 : -1;
    return typeof a.sort === 'number' && typeof b.sort === 'number'
      ? a.sort - b.sort
      : String(a.sort).localeCompare(String(b.sort), undefined, { numeric: true, sensitivity: 'base' });
  });
}

/** cập nhật lọc của một cột; chọn đủ mọi giá trị (hoặc không truyền) = bỏ lọc cột đó */
export function setColFilter(cols: Record<string, string[]> | undefined, col: string, keep: string[] | null, all: string[]): Record<string, string[]> | undefined {
  const next = { ...(cols ?? {}) };
  if (keep === null || (keep.length === all.length && all.every((k) => keep.includes(k)))) delete next[col];
  else next[col] = keep;
  return Object.keys(next).length ? next : undefined;
}
