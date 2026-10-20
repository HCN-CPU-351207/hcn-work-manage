// Nhắc việc: tính các mốc báo cho từng việc (mục 12 mở rộng).
// Tháng/Tuần: trước hạn N ngày, sáng ngày đến hạn, sáng hôm sau nếu chưa xong (trễ hạn).
// Ngày: trước giờ bắt đầu dự kiến, và khi quá giờ kết thúc mà chưa xong.
// Mốc rơi vào giờ yên lặng được dời tới lúc hết giờ yên lặng.
import { addDays, toDateStr } from './dates.ts';
import type { Data, Level, Settings } from './model.ts';
import { derive } from './status.ts';
import { hmToMin } from './time.ts';

export type RemKind = 'soon' | 'due' | 'over' | 'start' | 'late';

export interface Reminder {
  key: string;
  at: number;
  kind: RemKind;
  level: Level;
  id: string;
  ma: string;
  ten: string;
  /** hạn (YYYY-MM-DD) hoặc giờ (HH:MM) để ghi trong nội dung */
  when: string;
}

export type ReminderSettings = Pick<
  Settings,
  | 'notificationsEnabled'
  | 'notifyDaysBefore'
  | 'notifySoon'
  | 'notifyDue'
  | 'notifyOverdue'
  | 'notifyDayStart'
  | 'notifyDayLeadMin'
  | 'notifyDayLate'
  | 'notifyMorning'
  | 'quietStart'
  | 'quietEnd'
>;

/** thời điểm cục bộ của ngày + giờ */
export function localMs(day: string, hm: string): number {
  const [y, m, d] = day.split('-').map(Number);
  const [h, mi] = hm.split(':').map(Number);
  return new Date(y, m - 1, d, h, mi, 0, 0).getTime();
}

const validHm = (s: string | undefined, dflt: string) => (s && /^\d{1,2}:\d{2}$/.test(s) ? s : dflt);

/** Dời mốc ra khỏi giờ yên lặng (hỗ trợ khoảng qua nửa đêm, vd. 22:00–07:00) */
export function shiftQuiet(at: number, quietStart: string, quietEnd: string): number {
  const qs = hmToMin(quietStart);
  const qe = hmToMin(quietEnd);
  if (qs === qe) return at;
  const d = new Date(at);
  const min = d.getHours() * 60 + d.getMinutes();
  const inQuiet = qs < qe ? min >= qs && min < qe : min >= qs || min < qe;
  if (!inQuiet) return at;
  const day = toDateStr(d);
  const endDay = qs < qe || min < qe ? day : addDays(day, 1);
  return localMs(endDay, quietEnd);
}

export function computeReminders(data: Data, s: ReminderSettings, now: number): Reminder[] {
  if (!s.notificationsEnabled) return [];
  const morning = validHm(s.notifyMorning, '08:00');
  const qs = validHm(s.quietStart, '22:00');
  const qe = validHm(s.quietEnd, '07:00');
  const today = toDateStr(new Date(now));
  const d = derive(data, today);
  const out: Reminder[] = [];
  const push = (r: Omit<Reminder, 'at'> & { at: number }) => out.push({ ...r, at: shiftQuiet(r.at, qs, qe) });

  const range = (level: 'thang' | 'tuan', x: { id: string; ma: string; ten: string; dl: string | null }, raw: string) => {
    if (!x.dl || raw === 'Hoàn thành' || (x as { huy?: unknown }).huy) return;
    const base = { level, id: x.id, ma: x.ma, ten: x.ten, when: x.dl };
    const n = Math.max(0, Math.round(s.notifyDaysBefore || 0));
    if (s.notifySoon && n > 0) push({ ...base, kind: 'soon', key: `${level}:${x.id}:soon:${x.dl}:${n}`, at: localMs(addDays(x.dl, -n), morning) });
    if (s.notifyDue) push({ ...base, kind: 'due', key: `${level}:${x.id}:due:${x.dl}`, at: localMs(x.dl, morning) });
    if (s.notifyOverdue) push({ ...base, kind: 'over', key: `${level}:${x.id}:over:${x.dl}`, at: localMs(addDays(x.dl, 1), morning) });
  };
  for (const m of data.thang) range('thang', m, d.thang.get(m.id)!.raw);
  for (const w of data.tuan) range('tuan', w, d.tuan.get(w.id)!.raw);

  const lead = Math.max(0, Math.round(s.notifyDayLeadMin || 0));
  for (const n of data.ngay) {
    if (!n.ngay || n.tt === 'Hoàn thành' || n.huy) continue;
    const base = { level: 'ngay' as const, id: n.id, ma: n.ma, ten: n.ten };
    if (s.notifyDayStart && n.g1 && n.tt === 'Chưa làm')
      push({ ...base, kind: 'start', when: n.g1, key: `ngay:${n.id}:start:${n.ngay}T${n.g1}:${lead}`, at: localMs(n.ngay, n.g1) - lead * 60_000 });
    if (s.notifyDayLate && n.g2) push({ ...base, kind: 'late', when: n.g2, key: `ngay:${n.id}:late:${n.ngay}T${n.g2}`, at: localMs(n.ngay, n.g2) });
  }
  return out.sort((a, b) => a.at - b.at);
}

/** Mốc đã tới (trong 24 giờ qua) mà chưa báo */
export function dueReminders(list: Reminder[], now: number, reminded: Record<string, number> | undefined, windowMs = 24 * 3600_000): Reminder[] {
  return list.filter((r) => r.at <= now && r.at > now - windowMs && !reminded?.[r.key]);
}

/** Mốc sắp tới, để hẹn giờ trên hệ thống (Android) */
export function upcomingReminders(list: Reminder[], now: number, max = 60): Reminder[] {
  return list.filter((r) => r.at > now).slice(0, max);
}

/** Số nguyên dương ổn định cho mỗi khóa (id thông báo của Android) */
export function reminderNumId(key: string): number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 1) % 2_000_000_000 || 1;
}

/** Gộp danh sách đã báo của hai máy; bỏ khóa cũ hơn 60 ngày */
export function mergeReminded(a: Record<string, number> | undefined, b: Record<string, number> | undefined, now: number): Record<string, number> | undefined {
  if (!a && !b) return undefined;
  const out: Record<string, number> = {};
  for (const src of [a, b]) for (const [k, v] of Object.entries(src ?? {})) if (now - v < 60 * 24 * 3600_000) out[k] = Math.max(out[k] ?? 0, v);
  return out;
}
