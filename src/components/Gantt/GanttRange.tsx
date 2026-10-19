// Gantt theo ngày: dùng cho Gantt Tháng (mỗi ngày một cột) và Gantt Tuần (7 cột) - mục 8.5.1, 8.5.2
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { diffDays, isoWeek, weekdayMon0 } from '../../core/dates.ts';
import { actualTone } from '../../core/status.ts';
import { useApp } from '../../store/app.ts';
import { useNow } from '../../lib/hooks.ts';
import { cx } from '../../lib/labels.ts';
import type { ThangRow, TuanRow } from '../../lib/rows.ts';
import { tipFromRow } from '../../lib/tip.ts';
import { runningDays } from '../../core/actions.ts';
import { TaskBar } from './TaskBar.tsx';

const ROW_H = 56; // thanh 44 px + đệm
const BAR_TOP = 6;

export function GanttRange({
  days,
  rows,
  today,
  compact,
  selectedDay,
  onDayHeader,
  minCol,
  emptyText
}: {
  days: string[];
  rows: (ThangRow | TuanRow)[];
  today: string;
  compact?: boolean;
  selectedDay?: string | null;
  onDayHeader?: (day: string) => void;
  minCol?: number;
  emptyText: string;
}) {
  const { t } = useTranslation();
  const lang = useApp((s) => s.settings.language);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const now = useNow(30_000); // đường hiện tại cập nhật mỗi 30 giây
  const labelW = compact ? 56 : 72;

  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const min = minCol ?? (compact ? 22 : days.length > 7 ? 34 : 90);
  const colW = Math.max(min, width ? (width - labelW) / days.length : min);
  const trackW = colW * days.length;
  const first = days[0];
  const last = days[days.length - 1];

  const weeks = useMemo(() => {
    const out: { w: number; start: number; span: number }[] = [];
    days.forEach((d, i) => {
      const w = isoWeek(d);
      const lastW = out[out.length - 1];
      if (lastW && lastW.w === w) lastW.span++;
      else out.push({ w, start: i, span: 1 });
    });
    return out;
  }, [days]);

  const nowDate = new Date(now);
  const todayIdx = days.indexOf(today);
  const nowLeft = todayIdx >= 0 ? labelW + (todayIdx + (nowDate.getHours() * 60 + nowDate.getMinutes()) / 1440) * colW : null;

  // cuộn tới hôm nay khi mở tháng có hôm nay
  useEffect(() => {
    const el = wrapRef.current;
    if (!el || todayIdx < 0 || !width) return;
    const x = labelW + todayIdx * colW - el.clientWidth / 3;
    if (x > 0) el.scrollLeft = x;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [first, todayIdx >= 0, width > 0]);

  const idx = (d: string) => diffDays(first, d);
  const span = (a: string | null, b: string | null): [number, number] | null => {
    const s = a ?? b;
    const e = b ?? a;
    if (!s || !e) return null;
    const lo = s < e ? s : e;
    const hi = s < e ? e : s;
    if (hi < first || lo > last) return null;
    const i0 = Math.max(0, idx(lo));
    const i1 = Math.min(days.length - 1, idx(hi));
    return [i0, i1];
  };

  return (
    <div className={cx('gantt', compact && 'gantt-compact')} ref={wrapRef}>
      <div className="gantt-inner" style={{ width: labelW + trackW }}>
        <div className="g-head" style={{ gridTemplateColumns: `${labelW}px ${trackW}px` }}>
          <div className="g-corner">{t('gantt.code')}</div>
          <div className="g-scale">
            <div className="g-weeks">
              {weeks.map((w) => (
                <div key={`${w.w}-${w.start}`} className="g-week" style={{ left: w.start * colW, width: w.span * colW }}>
                  {`W${String(w.w).padStart(2, '0')}`}
                </div>
              ))}
            </div>
            <div className="g-days">
              {days.map((d, i) => {
                const wd = weekdayMon0(d);
                return (
                  <button
                    key={d}
                    className={cx('g-day', wd >= 5 && 'weekend', d === today && 'today', d === selectedDay && 'selected')}
                    style={{ left: i * colW, width: colW }}
                    onClick={() => onDayHeader?.(d)}
                    title={t('gantt.openDay')}
                    aria-pressed={d === selectedDay}
                  >
                    <span className="g-dd">{d.slice(8)}</span>
                    <span className="g-wd">{t(`weekday.${wd}`)}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="g-body" style={{ height: Math.max(rows.length, 1) * ROW_H }}>
          {/* nền cột: cuối tuần + hôm nay */}
          <div className="g-cols" style={{ left: labelW, width: trackW }} aria-hidden>
            {days.map((d, i) => {
              const wd = weekdayMon0(d);
              return wd >= 5 || d === today || d === selectedDay ? (
                <div key={d} className={cx('g-col', wd >= 5 && 'weekend', d === today && 'today', d === selectedDay && 'selected')} style={{ left: i * colW, width: colW }} />
              ) : null;
            })}
          </div>
          {rows.length === 0 && <div className="g-empty">{emptyText}</div>}
          {rows.map((r, ri) => {
            const plan = span(r.item.bd, r.item.dl);
            const runN = runningDays(r.item, today);
            const actEnd = r.actualEnd ?? (r.actualStart ? today : null);
            const act = r.actualStart ? span(r.actualStart, actEnd) : null;
            const tone = actualTone({ start: r.actualStart, end: r.actualEnd }, r.item.dl, today);
            const top = ri * ROW_H;
            const personLabel = r.person?.name ?? t('person.unassigned');
            return (
              <div key={r.id} className="g-row" style={{ top, height: ROW_H }}>
                <div className="g-label" style={{ width: labelW }} title={`${r.ma} · ${r.ten}`}>
                  <span className="code-tag">{r.ma}</span>
                </div>
                <div className="g-track" style={{ left: labelW, width: trackW }}>
                  {plan && (
                    <TaskBar
                      left={plan[0] * colW + 1}
                      width={(plan[1] - plan[0] + 1) * colW - 2}
                      top={BAR_TOP}
                      display={r.display}
                      person={r.person}
                      personLabel={personLabel}
                      title={r.ten || t('common.untitled')}
                      code={r.ma}
                      ariaLabel={`${r.ma} ${r.ten}`}
                      tip={() => tipFromRow(r, t, lang, Date.now())}
                      extra={runN ? <span className="tb-run">{t('grid.runningDays', { n: runN })}</span> : null}
                    />
                  )}
                  {!plan && !r.item.bd && !r.item.dl && <span className="g-noplan">{t('gantt.noPlan')}</span>}
                  {act && (
                    <div
                      className={cx('g-actual', `g-actual-${tone}`)}
                      style={{ left: act[0] * colW + 1, width: Math.max(6, (act[1] - act[0] + 1) * colW - 2), top: BAR_TOP + 44 - 4 }}
                      aria-hidden
                    />
                  )}
                </div>
              </div>
            );
          })}
          {nowLeft !== null && <div className="now-line" style={{ left: nowLeft }} aria-hidden />}
        </div>
      </div>
    </div>
  );
}
