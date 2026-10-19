// Các trang: Tổng quan (4 thẻ + Gantt Tháng), CV Tháng / Tuần / Ngày (Bảng mặc định, công tắc sang Gantt)
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { Level } from '../core/model.ts';
import type { FilterCtx } from '../core/search.ts';
import { useApp } from '../store/app.ts';
import { useDerived, useIsMobile, usePeopleMap } from '../lib/hooks.ts';
import { buildRows, filterRows } from '../lib/rows.ts';
import { DayChart, MonthChart, WeekChart } from '../components/Gantt/Charts.tsx';
import { FilterBar } from '../components/Grid/FilterBar.tsx';
import { SmartGrid } from '../components/Grid/SmartGrid.tsx';
import { TaskCards } from '../components/Mobile/TaskCards.tsx';
import { MetricGrid } from '../components/Overview/MetricGrid.tsx';
import { IPlus } from '../components/Common/Icons.tsx';

function useCtx(level: Level): FilterCtx {
  const me = useApp((s) => s.settings.currentPersonId);
  const days = useApp((s) => s.settings.notifyDaysBefore);
  const { today } = useDerived();
  return useMemo(() => ({ today, currentPersonId: me, dueDays: days, level }), [today, me, days, level]);
}

export function OverviewPage() {
  const { data, derived, today } = useDerived();
  const people = usePeopleMap();
  const query = useApp((s) => s.query);
  const ctxT = useCtx('thang');
  const ctxN = useCtx('ngay');
  const thang = useMemo(() => filterRows(buildRows('thang', data, derived, people), {}, query, ctxT), [data, derived, people, query, ctxT]);
  const ngay = useMemo(() => filterRows(buildRows('ngay', data, derived, people), {}, query, ctxN), [data, derived, people, query, ctxN]);
  return (
    <div className="page page-overview">
      <MetricGrid />
      <MonthChart rows={thang} ngayRows={ngay} today={today} />
    </div>
  );
}

export function LevelPage({ level }: { level: Level }) {
  const { t } = useTranslation();
  const { data, derived, today } = useDerived();
  const people = usePeopleMap();
  const query = useApp((s) => s.query);
  const filter = useApp((s) => s.filters[level]);
  const mode = useApp((s) => s.modes[level]);
  const setQuickOpen = useApp((s) => s.setQuickOpen);
  const mobile = useIsMobile();
  const ctx = useCtx(level);
  const ctxN = useCtx('ngay');

  const all = useMemo(() => buildRows(level, data, derived, people), [level, data, derived, people]);
  const rows = useMemo(() => filterRows(all, filter, query, ctx), [all, filter, query, ctx]);
  // biểu đồ Tuần/Tháng cần CV Ngày để mở Timeline khi chia đôi
  const ngayRows = useMemo(
    () => (level === 'ngay' ? rows : filterRows(buildRows('ngay', data, derived, people), {}, query, ctxN)),
    [level, rows, data, derived, people, query, ctxN]
  );

  const empty =
    all.length === 0 ? (
      <span className="empty-cta">
        {t(`empty.${level}`)}
        <button className="btn btn-sm btn-primary" onClick={() => setQuickOpen(true)}>
          <IPlus size={14} />
          {t('toolbar.quick')}
        </button>
      </span>
    ) : (
      t('empty.filtered')
    );

  return (
    <div className="page page-level">
      <FilterBar level={level} count={rows.length} total={all.length} />
      {mode === 'chart' ? (
        <div className="page-chart">
          {level === 'thang' && <MonthChart rows={rows as never} ngayRows={ngayRows as never} today={today} />}
          {level === 'tuan' && <WeekChart rows={rows as never} ngayRows={ngayRows as never} today={today} />}
          {level === 'ngay' && <DayChart ngayRows={rows as never} today={today} />}
        </div>
      ) : mobile ? (
        <TaskCards level={level} rows={rows} today={today} emptyText={empty} />
      ) : (
        <SmartGrid level={level} rows={rows} today={today} emptyText={empty} />
      )}
    </div>
  );
}
