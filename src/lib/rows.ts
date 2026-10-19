// Dựng "dòng hiển thị" cho bảng/thẻ/Gantt từ dữ liệu + trạng thái tính ra, kèm bộ lọc
import type { Data, Display, Level, Ngay, Person, Status, Thang, Tuan, ViewFilter } from '../core/model.ts';
import { sortByPlan, sortNgay } from '../core/ops.ts';
import { rowMatches } from '../core/search.ts';
import type { FilterCtx, RowFacts } from '../core/search.ts';
import type { Derived } from '../core/status.ts';

export interface RowBase {
  level: Level;
  id: string;
  ma: string;
  ten: string;
  personId: string | null;
  person: Person | undefined;
  display: Display;
  raw: Status;
  progress: number | null; // null với CV Ngày
  childCount: number;
  locked: boolean; // có việc con → không sửa trạng thái tay (X19)
  facts: RowFacts;
}
export interface ThangRow extends RowBase {
  level: 'thang';
  item: Thang;
  actualStart: string | null;
  actualEnd: string | null;
}
export interface TuanRow extends RowBase {
  level: 'tuan';
  item: Tuan;
  actualStart: string | null;
  actualEnd: string | null;
  parentTen: string;
}
export interface NgayRow extends RowBase {
  level: 'ngay';
  item: Ngay;
  parentMa: string;
  conflict: boolean;
}
export type Row = ThangRow | TuanRow | NgayRow;

type OptName = (k: 'cats' | 'places', id: string | null | undefined) => string;
export function buildRows(level: 'thang', data: Data, d: Derived, people: Map<string, Person>, optName?: OptName): ThangRow[];
export function buildRows(level: 'tuan', data: Data, d: Derived, people: Map<string, Person>, optName?: OptName): TuanRow[];
export function buildRows(level: 'ngay', data: Data, d: Derived, people: Map<string, Person>, optName?: OptName): NgayRow[];
export function buildRows(level: Level, data: Data, d: Derived, people: Map<string, Person>, optName?: OptName): Row[];
export function buildRows(level: Level, data: Data, d: Derived, people: Map<string, Person>, optName?: (k: 'cats' | 'places', id: string | null | undefined) => string): Row[] {
  const pname = (id: string | null) => (id ? people.get(id)?.name ?? '' : '');
  const on = optName ?? (() => '');
  const ex = (x: { cat?: string | null; place?: string | null; placeNote?: string }) =>
    ({ cat: x.cat ?? null, place: x.place ?? null, extra: [on('cats', x.cat), on('places', x.place), x.placeNote ?? ''].filter(Boolean).join(' ') });
  if (level === 'thang') {
    return sortByPlan(data.thang).map((x): ThangRow => {
      const i = d.thang.get(x.id)!;
      return {
        level: 'thang', id: x.id, ma: x.ma, ten: x.ten, personId: x.personId, person: x.personId ? people.get(x.personId) : undefined,
        display: i.display, raw: i.raw, progress: i.progress, childCount: i.childCount, locked: i.childCount > 0,
        item: x, actualStart: i.actual.start, actualEnd: i.actual.end,
        facts: { ma: x.ma, ten: x.ten, person: pname(x.personId), personId: x.personId, display: i.display, raw: i.raw, start: x.bd, end: x.dl, ...ex(x) }
      };
    });
  }
  if (level === 'tuan') {
    const thangTen = new Map(data.thang.map((m) => [m.ma, m.ten]));
    return sortByPlan(data.tuan).map((x): TuanRow => {
      const i = d.tuan.get(x.id)!;
      return {
        level: 'tuan', id: x.id, ma: x.ma, ten: x.ten, personId: x.personId, person: x.personId ? people.get(x.personId) : undefined,
        display: i.display, raw: i.raw, progress: i.progress, childCount: i.childCount, locked: i.childCount > 0,
        item: x, actualStart: i.actual.start, actualEnd: i.actual.end, parentTen: thangTen.get(x.parentMa) ?? '',
        facts: { ma: x.ma, ten: x.ten, person: pname(x.personId), personId: x.personId, display: i.display, raw: i.raw, start: x.bd, end: x.dl, ...ex(x) }
      };
    });
  }
  const wMa = new Map(data.tuan.map((w) => [w.id, w.ma]));
  return sortNgay(data.ngay).map((x): NgayRow => ({
    level: 'ngay', id: x.id, ma: x.ma, ten: x.ten, personId: x.personId, person: x.personId ? people.get(x.personId) : undefined,
    display: x.tt, raw: x.tt, progress: null, childCount: 0, locked: false,
    item: x, parentMa: wMa.get(x.parentId) ?? '', conflict: d.conflicts.has(x.id),
    facts: { ma: x.ma, ten: x.ten, person: pname(x.personId), personId: x.personId, display: x.tt, raw: x.tt, start: x.ngay || null, end: x.ngay || null, ...ex(x) }
  }));
}

export function filterRows<T extends Row>(rows: T[], filter: ViewFilter, query: string, ctx: FilterCtx): T[] {
  const f: ViewFilter = { ...filter, q: query || filter.q };
  return rows.filter((r) => rowMatches(r.facts, f, ctx));
}
