// Tiện ích ngày giờ thuần chuỗi 'YYYY-MM-DD' (tính theo UTC nên không lệch múi giờ)
export const pad2 = (n: number): string => String(n).padStart(2, '0');

const utc = (s: string): number => {
  const [y, m, d] = s.slice(0, 10).split('-').map(Number);
  return Date.UTC(y, m - 1, d);
};

export function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
export const todayStr = (now: Date = new Date()): string => toDateStr(now);

export function nowIso(now: Date = new Date()): string {
  return `${toDateStr(now)}T${pad2(now.getHours())}:${pad2(now.getMinutes())}:${pad2(now.getSeconds())}`;
}

export function parseDate(s: string): Date {
  const [y, m, d] = s.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(s: string, n: number): string {
  return new Date(utc(s) + n * 86400000).toISOString().slice(0, 10);
}

/** b - a (số ngày) */
export function diffDays(a: string, b: string): number {
  return Math.round((utc(b) - utc(a)) / 86400000);
}

/** 0 = Thứ Hai ... 6 = Chủ Nhật */
export function weekdayMon0(s: string): number {
  return (new Date(utc(s)).getUTCDay() + 6) % 7;
}

export function startOfWeek(s: string): string {
  return addDays(s, -weekdayMon0(s));
}

/** Tuần ISO 8601 */
export function isoWeek(s: string): number {
  const d = new Date(utc(s));
  const day = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - day + 3); // Thứ Năm của tuần
  const firstThu = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const fDay = (firstThu.getUTCDay() + 6) % 7;
  firstThu.setUTCDate(firstThu.getUTCDate() - fDay + 3);
  return 1 + Math.round((d.getTime() - firstThu.getTime()) / (7 * 86400000));
}

export const ymOf = (s: string): string => s.slice(0, 7);

export function daysInMonth(ym: string): number {
  const [y, m] = ym.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export function monthDays(ym: string): string[] {
  const n = daysInMonth(ym);
  return Array.from({ length: n }, (_, i) => `${ym}-${pad2(i + 1)}`);
}

export function weekDays(anyDay: string): string[] {
  const s = startOfWeek(anyDay);
  return Array.from({ length: 7 }, (_, i) => addDays(s, i));
}

export function shiftMonth(ym: string, delta: number): string {
  const [y, m] = ym.split('-').map(Number);
  const t = y * 12 + (m - 1) + delta;
  return `${Math.floor(t / 12)}-${pad2((t % 12) + 1)}`;
}

/** phút trong ngày (có phần lẻ giây) của chuỗi ISO 'YYYY-MM-DDTHH:mm:ss' */
export function isoMinutes(iso: string): number {
  const h = Number(iso.slice(11, 13));
  const m = Number(iso.slice(14, 16));
  const s = Number(iso.slice(17, 19) || 0);
  return h * 60 + m + s / 60;
}

/** số phút kể từ 00:00 của ngày `day` (có thể > 1440 hoặc âm) */
export function minutesSinceDay(iso: string, day: string): number {
  return diffDays(day, iso.slice(0, 10)) * 1440 + isoMinutes(iso);
}

/** mili-giây (giờ cục bộ) của chuỗi ISO không có múi giờ */
export function isoMs(iso: string): number {
  const [y, mo, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(y, mo - 1, d, Number(iso.slice(11, 13)), Number(iso.slice(14, 16)), Number(iso.slice(17, 19) || 0)).getTime();
}

export const isDate = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
