// Các trang: Tổng quan (4 thẻ + Gantt Tháng), CV Tháng / Tuần / Ngày (Bảng mặc định, công tắc sang Gantt)
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { Level } from '../core/model.ts';
import type { FilterCtx } from '../core/search.ts';
import { useApp } from '../store/app.ts';
import { useDerived, useIsMobile, usePeopleMap } from '../lib/hooks.ts';
import { buildRows, filterRows } from '../lib/rows.ts';
import { useOptName } from '../lib/opts.ts';
import { useColValue } from '../lib/colValues.ts';
import { applyColFilters, sortRows } from '../core/colFilter.ts';
import { DayChart, MonthChart, WeekChart } from '../components/Gantt/Charts.tsx';
import { FilterBar } from '../components/Grid/FilterBar.tsx';
import { SmartGrid } from '../components/Grid/SmartGrid.tsx';
import { TaskCards } from '../components/Mobile/TaskCards.tsx';
import { MetricGrid } from '../components/Overview/MetricGrid.tsx';
import { HoursPanel } from '../components/Overview/HoursPanel.tsx';
import { IPlus } from '../components/Common/Icons.tsx';
import { DayStrip } from '../components/Charts/DayStrip.tsx';
import type { NgayRow } from '../lib/rows.ts';

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
      <HoursPanel />
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

  const optName = useOptName();
  const all = useMemo(() => buildRows(level, data, derived, people, optName), [level, data, derived, people, optName]);
  const val = useColValue();
  /** pool = sau bộ lọc chung; rows = thêm lọc + sắp xếp theo cột */
  const pool = useMemo(() => filterRows(all, filter, query, ctx), [all, filter, query, ctx]);
  const rows = useMemo(() => sortRows(applyColFilters(pool, filter.cols, val), filter.sort, val), [pool, filter.cols, filter.sort, val]);
  // biểu đồ Tuần/Tháng cần CV Ngày để mở Timeline khi chia đôi
  const ngayRows = useMemo(
    () => (level === 'ngay' ? rows : filterRows(buildRows('ngay', data, derived, people, optName), {}, query, ctxN)),
    [level, rows, data, derived, people, query, ctxN, optName]
  );

  // dải biểu đồ CV Ngày: theo người / phân loại / vị trí / tìm kiếm đang lọc, không theo lọc ngày-trạng thái
  const stripRows = useMemo(
    () => (level === 'ngay' ? filterRows(all, { personId: filter.personId, cats: filter.cats, places: filter.places }, query, ctx) : []),
    [level, all, filter.personId, filter.cats, filter.places, query, ctx]
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
      {level === 'ngay' && <DayStrip rows={stripRows as NgayRow[]} today={today} showNav={mode !== 'chart'} />}
      {mode === 'chart' ? (
        <div className="page-chart">
          {level === 'thang' && <MonthChart rows={rows as never} ngayRows={ngayRows as never} today={today} />}
          {level === 'tuan' && <WeekChart rows={rows as never} ngayRows={ngayRows as never} today={today} />}
          {level === 'ngay' && <DayChart ngayRows={rows as never} today={today} />}
        </div>
      ) : mobile ? (
        <TaskCards level={level} rows={rows} today={today} emptyText={empty} />
      ) : (
        <SmartGrid level={level} rows={rows} pool={pool} today={today} emptyText={empty} />
      )}
    </div>
  );
}
