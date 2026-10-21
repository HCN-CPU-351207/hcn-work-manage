// Ba biểu đồ ghép sẵn: Gantt Tháng (Overview + tab Tháng), Gantt Tuần (tab Tuần), Gantt Ngày (tab Ngày)
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { addDays, monthDays, shiftMonth, startOfWeek, weekDays, ymOf, isoWeek } from '../../core/dates.ts';
import { useApp } from '../../store/app.ts';
import { fmtDate, fmtMonth } from '../../lib/fmt.ts';
import type { NgayRow, ThangRow, TuanRow } from '../../lib/rows.ts';
import { IChevL, IChevR } from '../Common/Icons.tsx';
import { DayTimeline } from './DayTimeline.tsx';
import { GanttRange } from './GanttRange.tsx';
import { SplitView } from './SplitView.tsx';

export function Nav({ label, onPrev, onNext, onToday, todayLabel }: { label: string; onPrev: () => void; onNext: () => void; onToday: () => void; todayLabel: string }) {
  const { t } = useTranslation();
  return (
    <div className="chart-nav">
      <button className="icon-btn sm" onClick={onPrev} aria-label={t('common.prev')}>
        <IChevL size={16} />
      </button>
      <strong className="chart-title">{label}</strong>
      <button className="icon-btn sm" onClick={onNext} aria-label={t('common.next')}>
        <IChevR size={16} />
      </button>
      <button className="btn btn-sm btn-ghost" onClick={onToday}>
        {todayLabel}
      </button>
    </div>
  );
}

/** Gantt Tháng: CV Tháng của tháng đang xem, có Split-View theo ngày */
export function MonthChart({ rows, ngayRows, today }: { rows: ThangRow[]; ngayRows: NgayRow[]; today: string }) {
  const { t } = useTranslation();
  const month = useApp((s) => s.month);
  const setMonth = useApp((s) => s.setMonth);
  const splitDay = useApp((s) => s.splitDay);
  const setSplitDay = useApp((s) => s.setSplitDay);
  const lang = useApp((s) => s.settings.language);
  const days = useMemo(() => monthDays(month), [month]);
  const first = days[0];
  const last = days[days.length - 1];
  const inMonth = useMemo(
    () => rows.filter((r) => {
      const s = r.item.bd ?? r.item.dl;
      const e = r.item.dl ?? r.item.bd;
      const as = r.actualStart;
      const ae = r.actualEnd ?? (as ? today : null);
      const hit = (a: string | null, b: string | null) => !!a && !!b && a <= last && b >= first;
      return hit(s, e) || hit(as, ae);
    }),
    [rows, first, last, today]
  );
  return (
    <section className="chart-card">
      <div className="chart-head">
        <Nav label={fmtMonth(month, lang)} onPrev={() => setMonth(shiftMonth(month, -1))} onNext={() => setMonth(shiftMonth(month, 1))} onToday={() => setMonth(ymOf(today))} todayLabel={t('common.thisMonth')} />
        <span className="chart-hint">{t('gantt.hint')}</span>
      </div>
      <SplitView
        today={today}
        ngayRows={ngayRows}
        backLabel={t('gantt.backMonth')}
        renderLeft={(compact) => (
          <GanttRange days={days} rows={inMonth} today={today} compact={compact} selectedDay={splitDay} onDayHeader={(d) => setSplitDay(splitDay === d ? null : d)} emptyText={t('gantt.emptyMonth')} />
        )}
      />
    </section>
  );
}

/** Gantt Tuần: 7 cột, CV Tuần giao với tuần đang xem */
export function WeekChart({ rows, ngayRows, today }: { rows: TuanRow[]; ngayRows: NgayRow[]; today: string }) {
  const { t } = useTranslation();
  const anchor = useApp((s) => s.weekAnchor);
  const setAnchor = useApp((s) => s.setWeekAnchor);
  const splitDay = useApp((s) => s.splitDay);
  const setSplitDay = useApp((s) => s.setSplitDay);
  const lang = useApp((s) => s.settings.language);
  const days = useMemo(() => weekDays(anchor), [anchor]);
  const first = days[0];
  const last = days[6];
  const inWeek = useMemo(
    () => rows.filter((r) => {
      const s = r.item.bd ?? r.item.dl;
      const e = r.item.dl ?? r.item.bd;
      return !!s && !!e && s <= last && e >= first;
    }),
    [rows, first, last]
  );
  const label = `W${String(isoWeek(first)).padStart(2, '0')} · ${fmtDate(first, lang)} – ${fmtDate(last, lang)}`;
  return (
    <section className="chart-card">
      <div className="chart-head">
        <Nav label={label} onPrev={() => setAnchor(addDays(first, -7))} onNext={() => setAnchor(addDays(first, 7))} onToday={() => setAnchor(startOfWeek(today))} todayLabel={t('common.thisWeek')} />
        <span className="chart-hint">{t('gantt.hint')}</span>
      </div>
      <SplitView
        today={today}
        ngayRows={ngayRows}
        backLabel={t('gantt.backWeek')}
        renderLeft={(compact) => (
          <GanttRange days={days} rows={inWeek} today={today} compact={compact} selectedDay={splitDay} onDayHeader={(d) => setSplitDay(splitDay === d ? null : d)} emptyText={t('gantt.emptyWeek')} />
        )}
      />
    </section>
  );
}

/** Gantt Ngày: timeline 24 giờ cho ngày đang xem */
export function DayChart({ ngayRows, today }: { ngayRows: NgayRow[]; today: string }) {
  const { t } = useTranslation();
  const day = useApp((s) => s.dayDate);
  const setDay = useApp((s) => s.setDayDate);
  const lang = useApp((s) => s.settings.language);
  const rows = useMemo(() => ngayRows.filter((r) => r.item.ngay === day), [ngayRows, day]);
  return (
    <section className="chart-card">
      <DayTimeline
        day={day}
        rows={rows}
        today={today}
        header={
          <Nav
            label={fmtDate(day, lang)}
            onPrev={() => setDay(addDays(day, -1))}
            onNext={() => setDay(addDays(day, 1))}
            onToday={() => setDay(today)}
            todayLabel={t('common.today')}
          />
        }
      />
    </section>
  );
}
