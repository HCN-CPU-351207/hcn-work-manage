// Dải biểu đồ tổng quan đầu trang CV Tuần (theo tuần đang xem) và CV Tháng (theo tháng đang xem):
// số việc xong, đúng hạn, sắp đến hạn, giờ CV Ngày con theo ngày / theo tuần, thanh trạng thái;
// góc phải: số việc xong trong tháng (CV Tuần) hoặc trong năm (CV Tháng).
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { addDays, isoWeek, shiftMonth, startOfWeek, weekDays, ymOf } from '../../core/dates.ts';
import type { Ngay } from '../../core/model.ts';
import { doneIn, monthBuckets, periodOverview, weekBuckets } from '../../core/periodStats.ts';
import type { PItem } from '../../core/periodStats.ts';
import { durationLabel } from '../../core/time.ts';
import { useApp } from '../../store/app.ts';
import { fmtDate, fmtMonth } from '../../lib/fmt.ts';
import { useNow } from '../../lib/hooks.ts';
import { cx } from '../../lib/labels.ts';
import type { ThangRow, TuanRow } from '../../lib/rows.ts';
import { Nav } from '../Gantt/Charts.tsx';
import { IChart, IChevR } from '../Common/Icons.tsx';
import { PairBars, StackBar } from './Charts.tsx';

const H = (m: number) => durationLabel(m);
const pctOf = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);
const keyOf = (level: string) => `hcn.periodStrip.${level}`;
function readOpen(level: string): boolean {
  try {
    const v = localStorage.getItem(keyOf(level));
    if (v !== null) return v !== '0';
  } catch {
    /* bỏ qua */
  }
  return !window.matchMedia?.('(max-width: 767px)').matches; // điện thoại: mặc định thu gọn
}

export function PeriodStrip({ level, rows, ngays, today, showNav }: { level: 'thang' | 'tuan'; rows: (ThangRow | TuanRow)[]; ngays: Ngay[]; today: string; showNav: boolean }) {
  const { t } = useTranslation();
  const lang = useApp((s) => s.settings.language);
  const anchor = useApp((s) => s.weekAnchor) || today;
  const setAnchor = useApp((s) => s.setWeekAnchor);
  const month = useApp((s) => s.month) || ymOf(today);
  const setMonth = useApp((s) => s.setMonth);
  const [open, setOpen] = useState(() => readOpen(level));
  const tick = useNow(60_000);

  const items: PItem[] = useMemo(() => rows.map((r) => ({ id: r.id, bd: r.item.bd, dl: r.item.dl, display: r.display, actualEnd: r.actualEnd })), [rows]);
  const week = useMemo(() => weekDays(anchor), [anchor]);
  const buckets = useMemo(
    () => (level === 'tuan' ? weekBuckets(anchor, (i) => `${t(`weekday.${i}`)} ${week[i].slice(8, 10)}`) : monthBuckets(month, (n) => `W${String(n).padStart(2, '0')}`)),
    [level, anchor, month, week, t]
  );
  const ov = useMemo(() => periodOverview(items, ngays, buckets, today, tick), [items, ngays, buckets, today, tick]);
  // dòng phụ: CV Tuần → cả tháng chứa tuần đang xem; CV Tháng → cả năm của tháng đang xem
  const refYm = level === 'tuan' ? ymOf(addDays(week[0], 3)) : month;
  const side = useMemo(() => {
    if (level === 'tuan') {
      const [y, m] = refYm.split('-');
      return { label: t('ps.inMonth', { m: `${m}/${y}` }), ...doneIn(items, `${refYm}-01`, `${refYm}-31`) };
    }
    const y = month.slice(0, 4);
    return { label: t('ps.inYear', { y }), ...doneIn(items, `${y}-01-01`, `${y}-12-31`) };
  }, [level, refYm, month, items, t]);

  const toggle = () =>
    setOpen((v) => {
      try {
        localStorage.setItem(keyOf(level), v ? '0' : '1');
      } catch {
        /* bỏ qua */
      }
      return !v;
    });
  const live = ov.total - ov.counts.cancel;
  const periodLabel =
    level === 'tuan' ? `W${String(isoWeek(week[0])).padStart(2, '0')} · ${week[0].slice(8, 10)}/${week[0].slice(5, 7)} – ${fmtDate(week[6], lang)}` : fmtMonth(month, lang);
  const nav =
    level === 'tuan' ? (
      <Nav label={periodLabel} onPrev={() => setAnchor(addDays(week[0], -7))} onNext={() => setAnchor(addDays(week[0], 7))} onToday={() => setAnchor(startOfWeek(today))} todayLabel={t('common.thisWeek')} />
    ) : (
      <Nav label={periodLabel} onPrev={() => setMonth(shiftMonth(month, -1))} onNext={() => setMonth(shiftMonth(month, 1))} onToday={() => setMonth(ymOf(today))} todayLabel={t('common.thisMonth')} />
    );

  return (
    <section className={cx('day-strip', 'period-strip', !open && 'is-closed')}>
      <div className="ds-head">
        <button className="ds-toggle" onClick={toggle} aria-expanded={open} title={open ? t('ds.hide') : t('ds.show')}>
          <IChevR size={14} className="ds-chev" />
          <IChart size={14} />
          <span>{t(level === 'tuan' ? 'ps.titleWeek' : 'ps.titleMonth')}</span>
        </button>
        {showNav ? nav : <strong className="ds-day">{periodLabel}</strong>}
        {!open && (
          <span className="ds-mini">
            {t('ds.doneOf', { a: ov.counts.done, b: live })}
            {ov.counts.over ? ` · ${t('ps.overN', { n: ov.counts.over })}` : ''} · {H(ov.actualMin)}/{H(ov.planMin)}
          </span>
        )}
        <span className="ds-period">
          <span>
            {side.label} <b>{side.done}/{side.total}</b> ({pctOf(side.done, side.total)}%)
          </span>
        </span>
      </div>
      {open && (
        <div className="ds-body">
          <div className="ds-kpis">
            <div className="ds-kpi">
              <b>
                {ov.counts.done}/{live}
              </b>
              <span>{t(level === 'tuan' ? 'ps.doneTuan' : 'ps.doneThang')}</span>
            </div>
            <div className="ds-kpi">
              <b className={ov.onTime.measured ? (ov.onTime.ontime === ov.onTime.measured ? 'ok' : 'warn') : undefined}>{ov.onTime.measured ? `${pctOf(ov.onTime.ontime, ov.onTime.measured)}%` : '—'}</b>
              <span>{t('ps.onTime', { a: ov.onTime.ontime, b: ov.onTime.measured })}</span>
            </div>
            <div className="ds-kpi">
              <b className={ov.dueSoon ? 'warn' : undefined}>{ov.dueSoon}</b>
              <span>{t('ps.dueSoon')}</span>
            </div>
            <div className="ds-kpi">
              <b className={ov.planMin && ov.actualMin > ov.planMin ? 'bad' : undefined}>{H(ov.actualMin)}</b>
              <span>{t('ds.hours', { p: H(ov.planMin) })}</span>
            </div>
          </div>
          <div className="ds-chart">
            {ov.planMin || ov.actualMin ? (
              <PairBars buckets={ov.buckets} fmtH={H} labels={{ plan: t('pp.plan'), actual: t('pp.actual'), over: t('pp.over'), now: t('pp.now') }} />
            ) : (
              <p className="pp-empty">{t(level === 'tuan' ? 'ps.noHoursWeek' : 'ps.noHoursMonth')}</p>
            )}
          </div>
          <div className="ds-status">
            {ov.total ? (
              <StackBar
                parts={[
                  { key: 'done', value: ov.counts.done, cls: 'sb-done', label: t('status.done') },
                  { key: 'doing', value: ov.counts.doing, cls: 'sb-doing', label: t('status.doing') },
                  { key: 'over', value: ov.counts.over, cls: 'sb-over', label: t('status.overdue') },
                  { key: 'todo', value: ov.counts.todo, cls: 'sb-todo', label: t('status.todo') },
                  ...(ov.counts.cancel ? [{ key: 'cancel', value: ov.counts.cancel, cls: 'sb-cancel', label: t('status.cancel') }] : [])
                ]}
              />
            ) : (
              <p className="pp-empty">{t(level === 'tuan' ? 'ps.noTuan' : 'ps.noThang')}</p>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
