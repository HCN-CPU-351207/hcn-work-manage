import { describe, it, expect } from 'vitest';
import { applyColFilters, distinctValues, setColFilter, sortRows } from '../src/core/colFilter.ts';
import type { CellVal } from '../src/core/colFilter.ts';

type R = { id: string; st: string; d: string; n: number };
const rows: R[] = [
  { id: 'a', st: 'Đang làm', d: '2026-10-20', n: 10 },
  { id: 'b', st: 'Hoàn thành', d: '', n: 2 },
  { id: 'c', st: 'Đang làm', d: '2026-10-05', n: 30 },
  { id: 'd', st: 'Chưa làm', d: '2026-10-05', n: 2 }
];
const val = (r: R, c: string): CellVal =>
  c === 'st' ? { key: r.st, label: r.st, sort: r.st } : c === 'd' ? { key: r.d, label: r.d || '(trống)', sort: r.d } : { key: String(r.n), label: `${r.n}%`, sort: r.n };

describe('lọc theo cột', () => {
  it('không có lọc → giữ nguyên', () => {
    expect(applyColFilters(rows, undefined, val)).toBe(rows);
  });
  it('giữ dòng thỏa mọi cột đang lọc', () => {
    expect(applyColFilters(rows, { st: ['Đang làm'], d: ['2026-10-05'] }, val).map((r) => r.id)).toEqual(['c']);
  });
  it('lọc ô trống bằng khóa rỗng', () => {
    expect(applyColFilters(rows, { d: [''] }, val).map((r) => r.id)).toEqual(['b']);
  });
  it('bỏ qua cột đang mở (để liệt kê giá trị như Excel)', () => {
    expect(applyColFilters(rows, { st: ['Đang làm'], d: ['2026-10-05'] }, val, 'd').map((r) => r.id)).toEqual(['a', 'c']);
  });
});

describe('sắp xếp theo cột', () => {
  it('số tăng/giảm, giữ thứ tự gốc khi bằng nhau', () => {
    expect(sortRows(rows, { key: 'n', dir: 1 }, val).map((r) => r.id)).toEqual(['b', 'd', 'a', 'c']);
    expect(sortRows(rows, { key: 'n', dir: -1 }, val).map((r) => r.id)).toEqual(['c', 'a', 'b', 'd']);
  });
  it('ô trống luôn ở cuối, cả khi giảm dần', () => {
    expect(sortRows(rows, { key: 'd', dir: 1 }, val).map((r) => r.id)).toEqual(['c', 'd', 'a', 'b']);
    expect(sortRows(rows, { key: 'd', dir: -1 }, val).map((r) => r.id)).toEqual(['a', 'c', 'd', 'b']);
  });
  it('chữ tiếng Việt theo thứ tự chữ cái', () => {
    expect(sortRows(rows, { key: 'st', dir: 1 }, val).map((r) => r.st)).toEqual(['Chưa làm', 'Đang làm', 'Đang làm', 'Hoàn thành']);
  });
});

describe('danh sách giá trị và cập nhật lọc', () => {
  it('giá trị khác nhau kèm số lượng, ô trống cuối', () => {
    expect(distinctValues(rows, 'd', val).map((v) => [v.key, v.count])).toEqual([['2026-10-05', 2], ['2026-10-20', 1], ['', 1]]);
  });
  it('chọn đủ mọi giá trị = bỏ lọc cột; hết cột thì bỏ hẳn', () => {
    const all = ['A', 'B'];
    expect(setColFilter({ x: ['A'] }, 'x', ['A', 'B'], all)).toBe(undefined);
    expect(setColFilter({ x: ['A'], y: ['1'] }, 'x', null, all)).toEqual({ y: ['1'] });
    expect(setColFilter(undefined, 'x', ['B'], all)).toEqual({ x: ['B'] });
    expect(setColFilter(undefined, 'x', [], all)).toEqual({ x: [] });
  });
});
