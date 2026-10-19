// Tìm kiếm real-time, lệnh "/" và bộ lọc (mục 8.2, 8.3, 8.6)
import { addDays } from './dates.ts';
import { isDueSoon } from './status.ts';
import type { Data, Display, Level, Quick, Status, ViewFilter } from './model.ts';

/** bỏ dấu tiếng Việt, hạ chữ thường */
export const fold = (s: string): string =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'd').toLowerCase().trim();

export function matchesQuery(parts: { ma: string; ten: string; person: string }, q: string): boolean {
  const f = fold(q);
  if (!f) return true;
  return fold(parts.ma).includes(f) || fold(parts.ten).includes(f) || fold(parts.person).includes(f);
}

export interface Hit {
  level: Level;
  id: string;
  ma: string;
  ten: string;
  person: string;
}

export function searchAll(data: Data, q: string, limit = 24): Hit[] {
  if (!fold(q)) return [];
  const pn = new Map(data.people.map((p) => [p.id, p.name]));
  const hits: Hit[] = [];
  const add = (level: Level, x: { id: string; ma: string; ten: string; personId: string | null }) => {
    const person = x.personId ? pn.get(x.personId) ?? '' : '';
    if (matchesQuery({ ma: x.ma, ten: x.ten, person }, q)) hits.push({ level, id: x.id, ma: x.ma, ten: x.ten, person });
  };
  data.thang.forEach((x) => add('thang', x));
  data.tuan.forEach((x) => add('tuan', x));
  data.ngay.forEach((x) => add('ngay', x));
  return hits.slice(0, limit);
}

export type CommandId =
  | 'create'
  | 'today'
  | 'overdue'
  | 'duesoon'
  | 'mine'
  | 'export'
  | 'backup'
  | 'restore'
  | 'theme'
  | 'language'
  | 'settings';

export interface CommandDef {
  id: CommandId;
  keys: string[]; // không có dấu "/"
}

export const COMMANDS: CommandDef[] = [
  { id: 'create', keys: ['tạo', 'create', 'new'] },
  { id: 'today', keys: ['hôm nay', 'today'] },
  { id: 'overdue', keys: ['quá hạn', 'overdue'] },
  { id: 'duesoon', keys: ['sắp đến hạn', 'due soon', 'duesoon'] },
  { id: 'mine', keys: ['việc của tôi', 'mine', 'my tasks'] },
  { id: 'export', keys: ['xuất excel', 'export'] },
  { id: 'backup', keys: ['sao lưu', 'backup'] },
  { id: 'restore', keys: ['khôi phục', 'restore'] },
  { id: 'theme', keys: ['giao diện', 'theme'] },
  { id: 'language', keys: ['ngôn ngữ', 'language'] },
  { id: 'settings', keys: ['cài đặt', 'settings'] }
];

/** input bắt đầu bằng "/": trả các lệnh khớp tiền tố (không phân biệt dấu) */
export function matchCommands(input: string): CommandDef[] {
  if (!input.startsWith('/')) return [];
  const f = fold(input.slice(1));
  if (!f) return COMMANDS;
  return COMMANDS.filter((c) => c.keys.some((k) => fold(k).startsWith(f)));
}

/** Lệnh khớp chính xác (khi nhấn Enter) */
export function exactCommand(input: string): CommandDef | null {
  const f = fold(input.replace(/^\//, ''));
  return COMMANDS.find((c) => c.keys.some((k) => fold(k) === f)) ?? matchCommands(input)[0] ?? null;
}

export interface RowFacts {
  ma: string;
  ten: string;
  person: string;
  personId: string | null;
  display: Display;
  raw: Status;
  start: string | null; // bd hoặc ngay
  end: string | null; // dl hoặc ngay
}
export interface FilterCtx {
  today: string;
  currentPersonId: string | null;
  dueDays: number;
  level: Level;
}

export const NONE_PERSON = '__none__';

export function rowMatches(r: RowFacts, f: ViewFilter, ctx: FilterCtx): boolean {
  if (f.q && !matchesQuery(r, f.q)) return false;
  if (f.status && r.display !== f.status) return false;
  if (f.personId) {
    if (f.personId === NONE_PERSON ? r.personId !== null : r.personId !== f.personId) return false;
  }
  if (f.from || f.to) {
    const s = r.start ?? r.end;
    const e = r.end ?? r.start;
    if (!s || !e) return false;
    if (f.from && e < f.from) return false;
    if (f.to && s > f.to) return false;
  }
  return quickMatches(r, f.quick ?? null, ctx);
}

function quickMatches(r: RowFacts, quick: Quick | null, ctx: FilterCtx): boolean {
  if (!quick) return true;
  const isNgay = ctx.level === 'ngay';
  switch (quick) {
    case 'today': {
      const s = r.start ?? r.end;
      const e = r.end ?? r.start;
      return !!s && !!e && s <= ctx.today && ctx.today <= e;
    }
    case 'overdue':
      return !isNgay && r.display === 'Quá hạn';
    case 'duesoon':
      return isNgay
        ? !!r.start && r.raw !== 'Hoàn thành' && r.start >= ctx.today && r.start <= addDays(ctx.today, ctx.dueDays)
        : isDueSoon(r.end, r.raw, ctx.today, ctx.dueDays);
    case 'mine':
      return !!ctx.currentPersonId && r.personId === ctx.currentPersonId;
  }
}

export const isFilterEmpty = (f: ViewFilter | undefined): boolean =>
  !f || (!f.q && !f.status && !f.personId && !f.from && !f.to && !f.quick);

