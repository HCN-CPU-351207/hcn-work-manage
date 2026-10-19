// Định dạng ngày theo locale bằng date-fns (mục 11)
import { format } from 'date-fns';
import { de, enUS, fr, ja, pt, vi, zhCN } from 'date-fns/locale';
import type { Locale } from 'date-fns';
import { parseDate } from '../core/dates.ts';
import type { LangCode } from '../core/model.ts';

const LOCALES: Record<LangCode, Locale> = { vi, en: enUS, zh: zhCN, pt, fr, de, ja };

export const localeOf = (lang: LangCode): Locale => LOCALES[lang] ?? vi;

/** Ngày đầy đủ theo kiểu ngắn của locale (vi: 19/10/2026) */
export function fmtDate(s: string | null | undefined, lang: LangCode): string {
  if (!s) return '';
  return format(parseDate(s), 'P', { locale: localeOf(lang) });
}

/** Ngày gọn cho ô bảng: không có năm nếu cùng năm hiện tại */
export function fmtDay(s: string | null | undefined, lang: LangCode, thisYear: string): string {
  if (!s) return '';
  if (s.slice(0, 4) !== thisYear) return fmtDate(s, lang);
  const d = parseDate(s);
  const pattern = lang === 'en' ? 'MMM d' : lang === 'ja' || lang === 'zh' ? 'M/d' : lang === 'de' ? 'dd.MM.' : 'dd/MM';
  return format(d, pattern, { locale: localeOf(lang) });
}

/** Tiêu đề tháng, ví dụ "tháng 10 2026" */
export function fmtMonth(ym: string, lang: LangCode): string {
  return format(parseDate(`${ym}-01`), 'LLLL yyyy', { locale: localeOf(lang) });
}

/** 'YYYY-MM-DDTHH:mm:ss' → 'HH:mm' */
export const hhmm = (iso: string | null | undefined): string => (iso ? iso.slice(11, 16) : '');

export const pct = (p: number): string => `${Math.round(p * 100)}%`;
