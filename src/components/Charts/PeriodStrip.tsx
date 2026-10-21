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
import { ngayInsights } from '../../core/insights.ts';
import { overlaps } from '../../core/periodStats.ts';
import { diffDays } from '../../core/dates.ts';
import { AccuracyBox, AllocDonut, AttentionList, CountBars, MiniCard, PeopleBars, PeriodToggle, Stat } from './StripParts.tsx';
import type { AttnRow } from './StripParts.tsx';

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

  // chi tiết thêm: các việc trong kỳ, CV Ngày trong kỳ, việc cần chú ý
  const from = buckets[0].from;
  const to = buckets[buckets.length - 1].to;
  const nowHm = new Date(tick).toTimeString().slice(0, 5);
  const inRows = useMemo(() => rows.filter((r) => overlaps(r.item, from, to)), [rows, from, to]);
  const liveRows = inRows.filter((r) => r.display !== 'Đã hủy');
  const avgPg = liveRows.length ? Math.round((liveRows.reduce((s, r) => s + (r.progress ?? 0), 0) / liveRows.length) * 100) : null;
  const noPerson = liveRows.filter((r) => !r.item.personId).length;
  const inNgays = useMemo(() => ngays.filter((n) => n.ngay >= from && n.ngay <= to), [ngays, from, to]);
  const ins = useMemo(() => ngayInsights(inNgays, { today, nowHm, buckets }), [inNgays, today, nowHm, buckets]);
  const attn: AttnRow[] = useMemo(() => {
    const out: AttnRow[] = [];
    const soon = addDays(today, 3);
    for (const r of [...inRows].sort((a, b) => (a.item.dl ?? '').localeCompare(b.item.dl ?? ''))) {
      const dl = r.item.dl;
      if (r.display === 'Quá hạn' && dl) out.push({ level, id: r.id, ma: r.ma, ten: r.ten, tag: t('xs.lateDays', { n: Math.max(1, diffDays(dl, today)) }), tone: 'bad' });
      else if ((r.display === 'Đang làm' || r.display === 'Chưa làm') && dl && dl >= today && dl <= soon)
        out.push({ level, id: r.id, ma: r.ma, ten: r.ten, tag: t('xs.dueOn', { d: `${dl.slice(8, 10)}/${dl.slice(5, 7)}` }), tone: 'warn' });
    }
    for (const n of inNgays) {
      if (n.huy || n.tt === 'Hoàn thành' || n.ngay !== today) continue;
      if (!n.a1 && n.g1 && n.g1 < nowHm) out.push({ level: 'ngay', id: n.id, ma: n.ma, ten: n.ten, tag: t('xs.lateStart', { h: n.g1 }), tone: 'warn' });
      else if (n.a1 && !n.a2 && n.g2 && n.g2 < nowHm) out.push({ level: 'ngay', id: n.id, ma: n.ma, ten: n.ten, tag: t('xs.overrun', { h: n.g2 }), tone: 'bad' });
    }
    return out;
  }, [inRows, inNgays, level, today, nowHm, t]);

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
        {showNav && <PeriodToggle unit={level} />}
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
      {open && (
        <div className="ds-more">
          <MiniCard title={t('xs.quick')}>
            <div className="xs-stats">
              <Stat value={avgPg === null ? '—' : `${avgPg}%`} label={t('xs.avgProgress')} tone={avgPg !== null && avgPg >= 70 ? 'ok' : undefined} />
              <Stat value={`${ins.done}/${ins.total}`} label={t('xs.ngayDone')} />
              <Stat value={ins.running} label={t('xs.running')} tone={ins.running ? 'info' : undefined} />
              <Stat value={ov.counts.over} label={t('status.overdue')} tone={ov.counts.over ? 'bad' : undefined} />
              <Stat value={ins.unscheduled} label={t('xs.unscheduled')} tone={ins.unscheduled ? 'warn' : undefined} />
              <Stat value={noPerson} label={t('xs.noPerson')} tone={noPerson ? 'warn' : undefined} />
            </div>
          </MiniCard>
          <MiniCard title={t(level === 'tuan' ? 'xs.ngayByDay' : 'xs.ngayByWeek')} sub={`${ins.done}/${ins.total}`}>
            <CountBars buckets={ins.perBucket} />
          </MiniCard>
          <MiniCard title={t('xs.byCat')} sub={ins.workMin ? H(ins.workMin) : undefined}>
            <AllocDonut kind="cats" slices={ins.byCat} total={ins.workMin} />
          </MiniCard>
          <MiniCard title={t('xs.byPlace')}>
            <AllocDonut kind="places" slices={ins.byPlace} total={ins.workMin} />
          </MiniCard>
          <MiniCard title={t('xs.byPerson')} sub={t('xs.byPersonSub')}>
            <PeopleBars people={ins.people} />
          </MiniCard>
          <MiniCard title={t('xs.accuracy')}>
            <AccuracyBox acc={ins.accuracy} />
          </MiniCard>
          <MiniCard title={t('xs.attention')} sub={attn.length ? String(attn.length) : undefined} wide>
            <AttentionList rows={attn} empty={t('xs.allGood')} />
          </MiniCard>
        </div>
      )}
    </section>
  );
}
