// Chuyển đổi dữ liệu cũ (HTML, localStorage cvkt_v1) và nâng cấp schema (mục 4.3, 7)
import { syncCounters, formatCode } from './codes.ts';
import { isDate } from './dates.ts';
import { newId } from './ids.ts';
import { LOAI_LIST, SCHEMA_VERSION, STATUSES } from './model.ts';
import type { Cancel, Counters, Data, Loai, Ngay, Opt, Person, Status, Thang, Tuan } from './model.ts';

export type MigrationErrorCode = 'INVALID_FILE' | 'FUTURE_SCHEMA' | 'MIGRATION_FAILED';
export class MigrationError extends Error {
  code: MigrationErrorCode;
  constructor(code: MigrationErrorCode, message: string) {
    super(message);
    this.code = code;
    this.name = 'MigrationError';
  }
}

export const CURRENT_SCHEMA = SCHEMA_VERSION;
/** Chuỗi migration từng bước: khóa là phiên bản nguồn (v → v+1). V1 chưa cần bước nào. */
export const MIGRATIONS: Record<number, (d: Record<string, unknown>) => Record<string, unknown>> = {};

export const DROPPED_KEYS = ['thuchi', 'cpcd', 'vay'] as const;
export const PERSON_COLORS = ['#34D399', '#60A5FA', '#F59E0B', '#F472B6', '#A78BFA', '#F87171', '#2DD4BF', '#FB923C'];

type Obj = Record<string, unknown>;
const isObj = (x: unknown): x is Obj => typeof x === 'object' && x !== null && !Array.isArray(x);
const str = (x: unknown): string => (typeof x === 'string' ? x : x == null ? '' : String(x));
const asDate = (x: unknown): string | null => (typeof x === 'string' && isDate(x.slice(0, 10)) ? x.slice(0, 10) : null);
const asStatus = (x: unknown): Status => (STATUSES.includes(x as Status) ? (x as Status) : 'Chưa làm');
const asLoai = (x: unknown): Loai => (LOAI_LIST.includes(x as Loai) ? (x as Loai) : 'Không gấp-Quan trọng');
const asHm = (x: unknown): string | null => {
  if (typeof x !== 'string') return null;
  const m = /^(\d{1,2}):(\d{2})/.exec(x.trim());
  if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) return null;
  return `${m[1].padStart(2, '0')}:${m[2]}`;
};

export interface ImportResult {
  data: Data;
  legacy: boolean;
  dropped: string[];
  migratedFrom: number | null;
  summary: { thang: number; tuan: number; ngay: number; people: number };
}

export function parseImport(raw: unknown): ImportResult {
  if (!isObj(raw)) throw new MigrationError('INVALID_FILE', 'File không hợp lệ');
  const payload: Obj = isObj(raw.data) && Array.isArray((raw.data as Obj).thang) ? (raw.data as Obj) : raw;
  if (!Array.isArray(payload.thang)) throw new MigrationError('INVALID_FILE', 'File không hợp lệ');

  const dropped = DROPPED_KEYS.filter((k) => k in payload || k in raw);
  const hasVersion = typeof raw.schemaVersion === 'number' || typeof payload.schemaVersion === 'number';
  const legacy = raw.app !== 'HCN' && !hasVersion;

  let data: Data;
  let migratedFrom: number | null = null;
  if (legacy) {
    data = fromLegacy(payload);
  } else {
    let version = Number(raw.schemaVersion ?? payload.schemaVersion ?? 1);
    if (version > CURRENT_SCHEMA) throw new MigrationError('FUTURE_SCHEMA', `Dữ liệu thuộc phiên bản mới hơn (schema ${version})`);
    let cur: Obj = { ...payload };
    if (version < CURRENT_SCHEMA) migratedFrom = version;
    try {
      while (version < CURRENT_SCHEMA) {
        const step = MIGRATIONS[version];
        if (!step) throw new Error(`Thiếu bước migration ${version} → ${version + 1}`);
        cur = step(cur);
        version++;
      }
    } catch (e) {
      throw new MigrationError('MIGRATION_FAILED', (e as Error).message);
    }
    data = normalizeData(cur);
  }
  return {
    data,
    legacy,
    dropped: [...dropped],
    migratedFrom,
    summary: { thang: data.thang.length, tuan: data.tuan.length, ngay: data.ngay.length, people: data.people.length }
  };
}

function normPerson(x: unknown, i: number): Person | null {
  if (!isObj(x)) return null;
  const name = str(x.name).trim();
  if (!name) return null;
  return {
    id: str(x.id) || newId('p'),
    name,
    color: typeof x.color === 'string' && x.color ? x.color : PERSON_COLORS[i % PERSON_COLORS.length],
    photo: typeof x.photo === 'string' && x.photo ? x.photo : null
  };
}

const optRef = (x: unknown): string | null => (typeof x === 'string' && x ? x : null);
/** chỉ thêm trường khi có giá trị (giữ dữ liệu cũ y nguyên) */
const asCancel = (x: unknown): Cancel | null => {
  if (!isObj(x) || typeof x.at !== 'string' || !x.at) return null;
  const c: Cancel = { at: x.at.slice(0, 19) };
  if (typeof x.reason === 'string' && x.reason.trim()) c.reason = x.reason.trim().slice(0, 200);
  if (typeof x.root === 'string' && x.root) c.root = x.root;
  return c;
};
const extra = (x: Obj, ngay: boolean): Record<string, unknown> => {
  const o: Record<string, unknown> = {};
  const h = asCancel(x.huy);
  if (h) o.huy = h;
  const c = optRef(x.cat);
  if (c) o.cat = c;
  if (ngay) {
    const p = optRef(x.place);
    if (p) o.place = p;
    const note = str(x.placeNote).trim();
    if (note) o.placeNote = note.slice(0, 120);
  }
  return o;
};
function normOpts(x: unknown): Opt[] | undefined {
  if (!Array.isArray(x)) return undefined;
  const seen = new Set<string>();
  const out: Opt[] = [];
  for (const o of x) {
    if (!isObj(o)) continue;
    const id = str(o.id);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push({ id, name: str(o.name).slice(0, 60), color: typeof o.color === 'string' && o.color ? o.color : '#94A3B8', ...(o.hidden ? { hidden: true } : {}) });
  }
  return out;
}

const asIso = (x: unknown): string | null =>
  typeof x === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(x) ? (x.length === 16 ? `${x}:00` : x.slice(0, 19)) : null;

/** Dữ liệu định dạng mới: chuẩn hóa trường, điền mã còn thiếu, đồng bộ bộ đếm */
export function normalizeData(d: Obj): Data {
  const people = (Array.isArray(d.people) ? d.people : []).map(normPerson).filter((p): p is Person => !!p);
  const pIds = new Set(people.map((p) => p.id));
  const pid = (x: unknown): string | null => {
    const s = str(x);
    return s && pIds.has(s) ? s : null;
  };
  const thang: Thang[] = (Array.isArray(d.thang) ? d.thang : []).filter(isObj).map((x) => ({
    id: str(x.id) || newId('t'),
    ma: str(x.ma),
    loai: asLoai(x.loai),
    ten: str(x.ten),
    personId: pid(x.personId),
    bd: asDate(x.bd),
    dl: asDate(x.dl),
    tt: asStatus(x.tt),
    bdtt: asDate(x.bdtt),
    kttt: asDate(x.kttt),
    gc: str(x.gc),
    ...extra(x, false)
  }));
  const tuan: Tuan[] = (Array.isArray(d.tuan) ? d.tuan : []).filter(isObj).map((x) => ({
    id: str(x.id) || newId('w'),
    ma: str(x.ma),
    parentMa: str(x.parentMa),
    ten: str(x.ten),
    personId: pid(x.personId),
    bd: asDate(x.bd),
    dl: asDate(x.dl),
    tt: asStatus(x.tt),
    bdtt: asDate(x.bdtt),
    kttt: asDate(x.kttt),
    gc: str(x.gc),
    ...extra(x, false)
  }));
  const ngay: Ngay[] = (Array.isArray(d.ngay) ? d.ngay : []).filter(isObj).map((x) => ({
    id: str(x.id) || newId('d'),
    ma: str(x.ma),
    ngay: asDate(x.ngay) ?? '',
    parentId: str(x.parentId),
    ten: str(x.ten),
    personId: pid(x.personId),
    g1: asHm(x.g1),
    g2: asHm(x.g2),
    a1: asIso(x.a1),
    a2: asIso(x.a2),
    tt: asStatus(x.tt),
    gc: str(x.gc),
    ...extra(x, true)
  }));
  const reminded: Record<string, number> = {};
  if (isObj(d.reminded)) for (const [k, v] of Object.entries(d.reminded)) if (typeof v === 'number') reminded[k] = v;
  const data: Data = {
    schemaVersion: CURRENT_SCHEMA,
    people,
    thang,
    tuan,
    ngay,
    counters: isObj(d.counters) ? (d.counters as unknown as Counters) : undefined,
    ...(normOpts(d.cats) ? { cats: normOpts(d.cats) } : {}),
    ...(normOpts(d.places) ? { places: normOpts(d.places) } : {}),
    ...(Object.keys(reminded).length ? { reminded } : {})
  };
  fillCodes(data);
  return data;
}

/** điền mã còn thiếu theo thứ tự, không trùng */
function fillCodes(data: Data): void {
  const c = syncCounters(data);
  const fill = <T extends { ma: string }>(arr: T[], p: 'M' | 'W' | 'D') => {
    for (const x of arr) if (!x.ma) x.ma = formatCode(p, ++c[p]);
  };
  fill(data.thang, 'M');
  fill(data.tuan, 'W');
  fill(data.ngay, 'D');
  data.counters = c;
}

/** HTML cũ (cvkt_v1) → schema mới (mục 7.2) */
function fromLegacy(p: Obj): Data {
  const people: Person[] = (Array.isArray(p.people) ? p.people : []).map(normPerson).filter((x): x is Person => !!x);
  const personFor = (v: unknown): string | null => {
    const raw = str(v).trim();
    if (!raw) return null;
    const byId = people.find((x) => x.id === raw);
    if (byId) return byId.id;
    const hit = people.find((x) => x.name.toLowerCase() === raw.toLowerCase());
    if (hit) return hit.id;
    const np: Person = { id: newId('p'), name: raw, color: PERSON_COLORS[people.length % PERSON_COLORS.length], photo: null };
    people.push(np);
    return np.id;
  };

  const thang: Thang[] = (p.thang as unknown[]).filter(isObj).map((x) => ({
    id: str(x.id) || newId('t'),
    ma: str(x.ma),
    loai: asLoai(x.loai),
    ten: str(x.ten),
    personId: personFor(x.personId ?? x.nguoi),
    bd: asDate(x.bd),
    dl: asDate(x.dl),
    tt: asStatus(x.tt),
    bdtt: asDate(x.bdtt),
    kttt: asDate(x.kttt),
    gc: str(x.gc)
  }));

  const tuan: Tuan[] = (Array.isArray(p.tuan) ? p.tuan : []).filter(isObj).map((x) => {
    const maLooksNew = /^W\d+$/i.test(str(x.ma)) && !!x.parentMa;
    return {
      id: str(x.id) || newId('w'),
      ma: maLooksNew ? str(x.ma) : '', // bản cũ: x.ma là mã tháng cha → sinh W###
      parentMa: str(x.parentMa) || str(x.ma),
      ten: str(x.ten),
      personId: personFor(x.personId ?? x.nguoi),
      bd: asDate(x.bd),
      dl: asDate(x.dl),
      tt: asStatus(x.tt),
      bdtt: asDate(x.bdtt),
      kttt: asDate(x.kttt),
      gc: str(x.gc)
    };
  });
  const tuanById = new Map(tuan.map((t) => [t.id, t]));

  const ngay: Ngay[] = (Array.isArray(p.ngay) ? p.ngay : []).filter(isObj).map((x) => {
    const day = asDate(x.ngay) ?? '';
    const parentId = str(x.parentId) || str(x.tuan);
    const iso = (v: unknown): string | null => {
      if (typeof v !== 'string' || !v) return null;
      const full = asIso(v);
      if (full) return full;
      const hm = asHm(v);
      return hm && day ? `${day}T${hm}:00` : null;
    };
    const own = personFor(x.personId ?? x.nguoi);
    return {
      id: str(x.id) || newId('d'),
      ma: str(x.ma),
      ngay: day,
      parentId,
      ten: str(x.ten),
      personId: own ?? tuanById.get(parentId)?.personId ?? null,
      g1: asHm(x.g1),
      g2: asHm(x.g2),
      a1: iso(x.a1),
      a2: iso(x.a2),
      tt: asStatus(x.tt),
      gc: str(x.gc)
    };
  });

  const data: Data = { schemaVersion: CURRENT_SCHEMA, people, thang, tuan, ngay, counters: undefined };
  fillCodes(data);
  return data;
}
