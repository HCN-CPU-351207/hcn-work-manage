// Dựng nội dung Tooltip (mục 8.5.6): Tên, Mã, Thời gian DK/TT, Người, Trạng thái, Tiến độ
import type { TFunction } from 'i18next';
import type { LangCode } from '../core/model.ts';
import type { TipData } from '../store/app.ts';
import { actualMinutes, diffLabel, diffMinutes, durationLabel, plannedMinutes } from '../core/time.ts';
import { fmtDate, hhmm } from './fmt.ts';
import type { Row } from './rows.ts';

export function tipFromRow(r: Row, t: TFunction, lang: LangCode, nowMs: number): TipData {
  const person = r.person?.name ?? t('person.unassigned');
  const range = (a: string | null, b: string | null) => (a || b ? `${fmtDate(a, lang) || '…'} → ${fmtDate(b, lang) || '…'}` : '—');
  if (r.level === 'ngay') {
    const n = r.item;
    const dp = plannedMinutes(n);
    const da = actualMinutes(n, n.a2 ? undefined : nowMs);
    const diff = n.a2 ? diffMinutes(da, dp) : null;
    const plan = n.g1 && n.g2 ? `${fmtDate(n.ngay, lang)} ${n.g1}–${n.g2}${dp !== null ? ` (${durationLabel(dp)})` : ''}` : `${fmtDate(n.ngay, lang)} · ${t('timeline.unscheduled')}`;
    const actual = n.a1 ? `${hhmm(n.a1)}–${n.a2 ? hhmm(n.a2) : t('tip.running')}${da !== null ? ` (${durationLabel(da)})` : ''}` : '—';
    return {
      level: 'ngay', id: r.id, ma: r.ma, ten: r.ten, person, display: r.display, plan, actual, progress: null,
      extra: diff !== null ? t('tip.diff', { v: diffLabel(diff) }) : r.conflict ? t('tip.conflict') : undefined
    };
  }
  return {
    level: r.level, id: r.id, ma: r.ma, ten: r.ten, person, display: r.display,
    plan: range(r.item.bd, r.item.dl),
    actual: range(r.actualStart, r.actualEnd),
    progress: r.progress
  };
}
