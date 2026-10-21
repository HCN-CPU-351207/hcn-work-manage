// Dải biểu đồ (B) đầu trang CV Ngày cho ngày đang xem: giờ kế hoạch / thực tế theo khung giờ, trạng thái,
// tỉ lệ đúng giờ, tổng giờ; một dòng nhỏ số việc xong trong tuần / tháng. (Checklist chỉ xem ở bảng bên phải khi bấm một việc.)
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { addDays, nowIso } from '../../core/dates.ts';
import { dayOverview, periodDone } from '../../core/dayStats.ts';
import type { DayItem } from '../../core/dayStats.ts';
import type { Display } from '../../core/model.ts';
import { durationLabel } from '../../core/time.ts';
import { useApp } from '../../store/app.ts';
import { fmtDate } from '../../lib/fmt.ts';
import { useNow } from '../../lib/hooks.ts';
import { cx } from '../../lib/labels.ts';
import type { NgayRow } from '../../lib/rows.ts';
import { Nav } from '../Gantt/Charts.tsx';
import { IChart, IChevR } from '../Common/Icons.tsx';
import { PairBars, StackBar } from './Charts.tsx';

const KEY = 'hcn.dayStrip.open';
const read = () => {
  try {
    const v = localStorage.getItem(KEY);
    if (v !== null) return v !== '0';
  } catch {
    /* bỏ qua */
  }
  // điện thoại: mặc định thu gọn cho đỡ chiếm chỗ
  return !window.matchMedia?.('(max-width: 767px)').matches;
};
const H = (m: number) => durationLabel(m);
const pctOf = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);

export function DayStrip({ rows, today, showNav }: { rows: NgayRow[]; today: string; showNav: boolean }) {
  const { t } = useTranslation();
  const day = useApp((s) => s.dayDate) || today;
  const setDay = useApp((s) => s.setDayDate);
  const lang = useApp((s) => s.settings.language);
  const [open, setOpen] = useState(read);
  const tick = useNow(60_000);
  const now = useMemo(() => nowIso(new Date(tick)), [tick]);
  const nowHm = now.slice(11, 16);

  // CV Ngày chưa xong mà đã qua giờ kết thúc dự kiến (hoặc ngày đã qua) → tính là trễ
  const items: DayItem[] = useMemo(
    () =>
      rows.map((r) => {
        const n = r.item;
        let display: Display = r.display;
        if (display !== 'Hoàn thành' && display !== 'Đã hủy' && n.ngay && (n.ngay < today || (n.ngay === today && !!n.g2 && n.g2 < nowHm))) display = 'Quá hạn';
        return { n, display };
      }),
    [rows, today, nowHm]
  );
  const ov = useMemo(() => dayOverview(items, day, now), [items, day, now]);
  const pd = useMemo(() => periodDone(items, day), [items, day]);
  const toggle = () => {
    setOpen((v) => {
      try {
        localStorage.setItem(KEY, v ? '0' : '1');
      } catch {
        /* bỏ qua */
      }
      return !v;
    });
  };
  const curH = day === today ? Number(nowHm.slice(0, 2)) : -1;
  const live = ov.total - ov.counts.cancel;
  const period = (
    <span className="ds-period">
      <span>
        {t('ds.week')} <b>{pd.week.done}/{pd.week.total}</b> ({pctOf(pd.week.done, pd.week.total)}%)
      </span>
      <span>
        {t('ds.month')} <b>{pd.month.done}/{pd.month.total}</b> ({pctOf(pd.month.done, pd.month.total)}%)
      </span>
    </span>
  );

  return (
    <section className={cx('day-strip', !open && 'is-closed')}>
      <div className="ds-head">
        <button className="ds-toggle" onClick={toggle} aria-expanded={open} title={open ? t('ds.hide') : t('ds.show')}>
          <IChevR size={14} className="ds-chev" />
          <IChart size={14} />
          <span>{t('ds.title')}</span>
        </button>
        {showNav ? (
          <Nav label={fmtDate(day, lang)} onPrev={() => setDay(addDays(day, -1))} onNext={() => setDay(addDays(day, 1))} onToday={() => setDay(today)} todayLabel={t('common.today')} />
        ) : (
          <strong className="ds-day">{fmtDate(day, lang)}</strong>
        )}
        {!open && (
          <span className="ds-mini">
            {t('ds.doneOf', { a: ov.counts.done, b: live })} · {H(ov.actualMin)}/{H(ov.planMin)}
          </span>
        )}
        {period}
      </div>
      {open && (
        <div className="ds-body">
          <div className="ds-kpis">
            <div className="ds-kpi">
              <b>
                {ov.counts.done}/{live}
              </b>
              <span>{t('ds.done')}</span>
            </div>
            <div className="ds-kpi">
              <b className={ov.onTime.measured ? (ov.onTime.ontime === ov.onTime.measured ? 'ok' : 'warn') : undefined}>{ov.onTime.measured ? `${pctOf(ov.onTime.ontime, ov.onTime.measured)}%` : '—'}</b>
              <span>{t('ds.onTime', { a: ov.onTime.ontime, b: ov.onTime.measured })}</span>
            </div>
            <div className="ds-kpi">
              <b className={ov.planMin && ov.actualMin > ov.planMin ? 'bad' : undefined}>{H(ov.actualMin)}</b>
              <span>{t('ds.hours', { p: H(ov.planMin) })}</span>
            </div>
          </div>
          <div className="ds-chart">
            {ov.planMin || ov.actualMin ? (
              <PairBars
                buckets={ov.hours.map((b) => ({ key: String(b.h), label: `${b.h}h`, plan: b.plan, actual: b.actual, current: b.h === curH }))}
                fmtH={H}
                labels={{ plan: t('pp.plan'), actual: t('pp.actual'), over: t('pp.over'), now: t('pp.now') }}
              />
            ) : (
              <p className="pp-empty">{ov.total ? t('ds.noHours') : t('ds.noTasks')}</p>
            )}
          </div>
          <div className="ds-status">
            <StackBar
              parts={[
                { key: 'done', value: ov.counts.done, cls: 'sb-done', label: t('status.done') },
                { key: 'doing', value: ov.counts.doing, cls: 'sb-doing', label: t('status.doing') },
                { key: 'over', value: ov.counts.over, cls: 'sb-over', label: t('ds.late') },
                { key: 'todo', value: ov.counts.todo, cls: 'sb-todo', label: t('status.todo') },
                ...(ov.counts.cancel ? [{ key: 'cancel', value: ov.counts.cancel, cls: 'sb-cancel', label: t('status.cancel') }] : [])
              ]}
            />
          </div>
        </div>
      )}
    </section>
  );
}
