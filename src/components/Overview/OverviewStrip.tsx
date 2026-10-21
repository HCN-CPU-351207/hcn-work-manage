// Dải "Toàn cảnh" ở trang Tổng quan: CV Tháng (tháng này), CV Tuần (tuần này), CV Ngày (hôm nay) đang thế nào,
// đang làm gì ngay lúc này, việc tiếp theo, giờ làm trong tuần, phân bổ, tải theo người, độ chính xác, việc cần chú ý.
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { addDays, diffDays, isoWeek, nowIso, startOfWeek, ymOf } from '../../core/dates.ts';
import { dayOverview } from '../../core/dayStats.ts';
import { ngayInsights } from '../../core/insights.ts';
import type { Display, Level } from '../../core/model.ts';
import { monthBuckets, overlaps, periodOverview, weekBuckets } from '../../core/periodStats.ts';
import type { PeriodOverview, PItem } from '../../core/periodStats.ts';
import { durationLabel } from '../../core/time.ts';
import { useApp } from '../../store/app.ts';
import { fmtMonth } from '../../lib/fmt.ts';
import { useDerived, useNow, usePeopleMap } from '../../lib/hooks.ts';
import { cx } from '../../lib/labels.ts';
import { useOptName } from '../../lib/opts.ts';
import { buildRows } from '../../lib/rows.ts';
import type { NgayRow, ThangRow, TuanRow } from '../../lib/rows.ts';
import { Avatar, LiveClock } from '../Common/bits.tsx';
import { IChart, IChevR } from '../Common/Icons.tsx';
import { PairBars } from '../Charts/Charts.tsx';
import { AccuracyBox, AllocDonut, AttentionList, CountBars, MiniCard, PeopleBars } from '../Charts/StripParts.tsx';
import type { AttnRow } from '../Charts/StripParts.tsx';

const H = (m: number) => durationLabel(m);
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);
const KEY = 'hcn.overviewStrip.open';
const readOpen = () => {
  try {
    return localStorage.getItem(KEY) !== '0';
  } catch {
    return true;
  }
};
const toItem = (r: ThangRow | TuanRow): PItem => ({ id: r.id, bd: r.item.bd, dl: r.item.dl, display: r.display, actualEnd: r.actualEnd });

export function OverviewStrip() {
  const { t } = useTranslation();
  const { data, derived, today } = useDerived();
  const lang = useApp((s) => s.settings.language);
  const people = usePeopleMap();
  const optName = useOptName();
  const pm = usePeopleMap();
  const [open, setOpen] = useState(readOpen);
  const tick = useNow(60_000);
  const now = nowIso(new Date(tick));
  const nowHm = now.slice(11, 16);

  const thang = useMemo(() => buildRows('thang', data, derived, people, optName), [data, derived, people, optName]);
  const tuan = useMemo(() => buildRows('tuan', data, derived, people, optName), [data, derived, people, optName]);
  const ngay = useMemo(() => buildRows('ngay', data, derived, people, optName), [data, derived, people, optName]);
  const ym = ymOf(today);
  const ws = startOfWeek(today);
  const we = addDays(ws, 6);
  const mB = useMemo(() => monthBuckets(ym, (n) => `W${String(n).padStart(2, '0')}`), [ym]);
  const wB = useMemo(() => weekBuckets(today, (i) => t(`weekday.${i}`)), [today, t]);
  const mo = useMemo(() => periodOverview(thang.map(toItem), data.ngay, mB, today, tick), [thang, data.ngay, mB, today, tick]);
  const wo = useMemo(() => periodOverview(tuan.map(toItem), data.ngay, wB, today, tick), [tuan, data.ngay, wB, today, tick]);
  const dayItems = useMemo(
    () =>
      ngay.map((r) => {
        let display: Display = r.display;
        if (display !== 'Hoàn thành' && display !== 'Đã hủy' && r.item.ngay === today && r.item.g2 && r.item.g2 < nowHm) display = 'Quá hạn';
        return { n: r.item, display };
      }),
    [ngay, today, nowHm]
  );
  const dov = useMemo(() => dayOverview(dayItems, today, now), [dayItems, today, now]);
  const weekNgays = useMemo(() => data.ngay.filter((n) => n.ngay >= ws && n.ngay <= we), [data.ngay, ws, we]);
  const monthNgays = useMemo(() => data.ngay.filter((n) => n.ngay.startsWith(ym)), [data.ngay, ym]);
  const todayNgays = useMemo(() => data.ngay.filter((n) => n.ngay === today), [data.ngay, today]);
  const insW = useMemo(() => ngayInsights(weekNgays, { today, nowHm, buckets: wB }), [weekNgays, today, nowHm, wB]);
  const insM = useMemo(() => ngayInsights(monthNgays, { today, nowHm }), [monthNgays, today, nowHm]);
  const insD = useMemo(() => ngayInsights(todayNgays, { today, nowHm, conflicts: derived.conflicts }), [todayNgays, today, nowHm, derived.conflicts]);

  // đang làm ngay lúc này + tiếp theo hôm nay
  const running = useMemo(() => ngay.filter((r) => r.item.a1 && !r.item.a2 && !r.item.huy).sort((a, b) => (a.item.a1! < b.item.a1! ? -1 : 1)), [ngay]);
  const next = useMemo(
    () => ngay.filter((r) => r.item.ngay === today && !r.item.huy && !r.item.a1 && r.item.tt !== 'Hoàn thành').sort((a, b) => (a.item.g1 ?? '99').localeCompare(b.item.g1 ?? '99')).slice(0, 4),
    [ngay, today]
  );
  const doingBig = useMemo(
    () =>
      [...thang.filter((r) => overlaps(r.item, `${ym}-01`, `${ym}-31`)), ...tuan.filter((r) => overlaps(r.item, ws, we))]
        .filter((r) => r.display === 'Đang làm' || r.display === 'Quá hạn')
        .sort((a, b) => (a.item.dl ?? '9').localeCompare(b.item.dl ?? '9'))
        .slice(0, 6),
    [thang, tuan, ym, ws, we]
  );
  const attn: AttnRow[] = useMemo(() => {
    const out: AttnRow[] = [];
    const soon = addDays(today, 3);
    const add = (level: Level, r: ThangRow | TuanRow) => {
      const dl = r.item.dl;
      if (r.display === 'Quá hạn' && dl) out.push({ level, id: r.id, ma: r.ma, ten: r.ten, tag: t('xs.lateDays', { n: Math.max(1, diffDays(dl, today)) }), tone: 'bad' });
      else if ((r.display === 'Đang làm' || r.display === 'Chưa làm') && dl && dl >= today && dl <= soon)
        out.push({ level, id: r.id, ma: r.ma, ten: r.ten, tag: t('xs.dueOn', { d: `${dl.slice(8, 10)}/${dl.slice(5, 7)}` }), tone: 'warn' });
    };
    [...thang].sort((a, b) => (a.item.dl ?? '').localeCompare(b.item.dl ?? '')).forEach((r) => add('thang', r));
    [...tuan].sort((a, b) => (a.item.dl ?? '').localeCompare(b.item.dl ?? '')).forEach((r) => add('tuan', r));
    for (const r of ngay) {
      const n = r.item;
      if (n.huy || n.tt === 'Hoàn thành' || n.ngay !== today) continue;
      if (n.a1 && !n.a2 && n.g2 && n.g2 < nowHm) out.push({ level: 'ngay', id: n.id, ma: n.ma, ten: n.ten, tag: t('xs.overrun', { h: n.g2 }), tone: 'bad' });
      else if (!n.a1 && n.g1 && n.g1 < nowHm) out.push({ level: 'ngay', id: n.id, ma: n.ma, ten: n.ten, tag: t('xs.lateStart', { h: n.g1 }), tone: 'warn' });
    }
    return out;
  }, [thang, tuan, ngay, today, nowHm, t]);

  const go = (level: Level, id?: string) => {
    const st = useApp.getState();
    if (id) {
      st.navigateTo(level, id);
      st.openPanel({ level, id });
    } else st.setTab(level);
  };
  const toggle = () =>
    setOpen((v) => {
      try {
        localStorage.setItem(KEY, v ? '0' : '1');
      } catch {
        /* bỏ qua */
      }
      return !v;
    });
  const dLive = dov.total - dov.counts.cancel;
  const curD = wB.findIndex((b) => b.from === today);

  return (
    <section className={cx('day-strip', 'ov-strip', !open && 'is-closed')} aria-label={t('ov.title')}>
      <div className="ds-head">
        <button className="ds-toggle" onClick={toggle} aria-expanded={open}>
          <IChevR size={14} className="ds-chev" />
          <IChart size={14} />
          <span>{t('ov.title')}</span>
        </button>
        <span className="ds-mini">
          {t('ov.when', { d: `${today.slice(8, 10)}/${today.slice(5, 7)}`, w: String(isoWeek(today)).padStart(2, '0'), m: fmtMonth(ym, lang) })}
        </span>
        {!open && (
          <span className="ds-period">
            <span>
              {t('level.thang')} <b>{mo.counts.done}/{mo.total - mo.counts.cancel}</b>
            </span>
            <span>
              {t('level.tuan')} <b>{wo.counts.done}/{wo.total - wo.counts.cancel}</b>
            </span>
            <span>
              {t('level.ngay')} <b>{dov.counts.done}/{dLive}</b>
            </span>
          </span>
        )}
      </div>
      {open && (
        <>
          <div className="ov-levels">
            <LevelCard
              title={t('level.thang')}
              period={t('common.thisMonth')}
              ov={mo}
              onClick={() => go('thang')}
              stats={[
                { v: mo.counts.doing, l: t('status.doing'), tone: 'info' },
                { v: mo.counts.over, l: t('status.overdue'), tone: mo.counts.over ? 'bad' : undefined },
                { v: mo.dueSoon, l: t('xs.dueSoonShort'), tone: mo.dueSoon ? 'warn' : undefined },
                { v: mo.onTime.measured ? `${pct(mo.onTime.ontime, mo.onTime.measured)}%` : '—', l: t('xs.ontimeShort') }
              ]}
            />
            <LevelCard
              title={t('level.tuan')}
              period={`${t('common.thisWeek')} · W${String(isoWeek(today)).padStart(2, '0')}`}
              ov={wo}
              onClick={() => go('tuan')}
              stats={[
                { v: wo.counts.doing, l: t('status.doing'), tone: 'info' },
                { v: wo.counts.over, l: t('status.overdue'), tone: wo.counts.over ? 'bad' : undefined },
                { v: wo.dueSoon, l: t('xs.dueSoonShort'), tone: wo.dueSoon ? 'warn' : undefined },
                { v: `${H(wo.actualMin)}/${H(wo.planMin)}`, l: t('xs.hoursShort') }
              ]}
            />
            <LevelCard
              title={t('level.ngay')}
              period={t('common.today')}
              ov={{ total: dov.total, counts: dov.counts }}
              overLabel={t('ds.late')}
              onClick={() => go('ngay')}
              stats={[
                { v: insD.running, l: t('xs.running'), tone: insD.running ? 'info' : undefined },
                { v: insD.lateStart, l: t('xs.lateStartN'), tone: insD.lateStart ? 'warn' : undefined },
                { v: insD.conflicts, l: t('xs.conflictN'), tone: insD.conflicts ? 'warn' : undefined },
                { v: `${H(dov.actualMin)}/${H(dov.planMin)}`, l: t('xs.hoursShort') }
              ]}
            />
          </div>

          <div className="ds-more ov-more">
            <MiniCard title={t('ov.now')} sub={running.length ? String(running.length) : undefined} wide>
              {running.length === 0 && doingBig.length === 0 ? (
                <p className="pp-empty">{t('ov.nothing')}</p>
              ) : (
                <ul className="xs-list ov-now">
                  {running.slice(0, 5).map((r) => {
                    const p = r.item.personId ? pm.get(r.item.personId) : undefined;
                    return (
                      <li key={r.id}>
                        <button onClick={() => go('ngay', r.id)}>
                          <span className="ov-live" />
                          <span className="code-tag">{r.ma}</span>
                          <span className="xs-t">{r.ten || t('common.untitled')}</span>
                          <Avatar person={p} size={18} />
                          {r.item.ck?.length ? (
                            <span className="ck-chip">
                              ☑ {r.item.ck.filter((c) => c.done).length}/{r.item.ck.length}
                            </span>
                          ) : null}
                          <LiveClock since={r.item.a1!} className="qa-clock" />
                        </button>
                      </li>
                    );
                  })}
                  {doingBig.map((r) => (
                    <li key={r.id}>
                      <button onClick={() => go(r.level, r.id)}>
                        <span className={cx('chip-s', r.display === 'Quá hạn' ? 'bad' : 'info')}>{t(`levelShort.${r.level}`)}</span>
                        <span className="code-tag">{r.ma}</span>
                        <span className="xs-t">{r.ten || t('common.untitled')}</span>
                        <span className="pp-mini">
                          <b className={r.display === 'Quá hạn' ? 'late' : undefined} style={{ width: `${Math.round((r.progress ?? 0) * 100)}%` }} />
                        </span>
                        <span className="xs-num">{Math.round((r.progress ?? 0) * 100)}%</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </MiniCard>
            <MiniCard title={t('ov.next')} sub={next.length ? String(next.length) : undefined}>
              {next.length === 0 ? (
                <p className="pp-empty">{t('ov.noNext')}</p>
              ) : (
                <ul className="xs-list">
                  {next.map((r: NgayRow) => (
                    <li key={r.id}>
                      <button onClick={() => go('ngay', r.id)}>
                        <span className={cx('chip-s', r.item.g1 && r.item.g1 < nowHm ? 'warn' : 'idle')}>{r.item.g1 ?? '—'}</span>
                        <span className="xs-t">{r.ten || t('common.untitled')}</span>
                        <Avatar person={r.item.personId ? pm.get(r.item.personId) : undefined} size={18} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </MiniCard>
            <MiniCard title={t('ov.weekHours')} sub={`${H(wo.actualMin)} / ${H(wo.planMin)}`} wide>
              {wo.planMin || wo.actualMin ? (
                <PairBars
                  buckets={wo.buckets.map((b, i) => ({ ...b, current: i === curD }))}
                  fmtH={H}
                  labels={{ plan: t('pp.plan'), actual: t('pp.actual'), over: t('pp.over'), now: t('pp.now') }}
                />
              ) : (
                <p className="pp-empty">{t('ps.noHoursWeek')}</p>
              )}
            </MiniCard>
            <MiniCard title={t('xs.ngayByDay')} sub={`${insW.done}/${insW.total}`}>
              <CountBars buckets={insW.perBucket} />
            </MiniCard>
            <MiniCard title={t('ov.monthByWeek')} sub={`${H(mo.actualMin)} / ${H(mo.planMin)}`}>
              {mo.planMin || mo.actualMin ? (
                <PairBars buckets={mo.buckets} fmtH={H} labels={{ plan: t('pp.plan'), actual: t('pp.actual'), over: t('pp.over'), now: t('pp.now') }} />
              ) : (
                <p className="pp-empty">{t('ps.noHoursMonth')}</p>
              )}
            </MiniCard>
            <MiniCard title={t('ov.catWeek')} sub={insW.workMin ? H(insW.workMin) : undefined}>
              <AllocDonut kind="cats" slices={insW.byCat} total={insW.workMin} />
            </MiniCard>
            <MiniCard title={t('ov.placeWeek')}>
              <AllocDonut kind="places" slices={insW.byPlace} total={insW.workMin} />
            </MiniCard>
            <MiniCard title={t('ov.peopleWeek')} sub={t('xs.byPersonSub')}>
              <PeopleBars people={insW.people} />
            </MiniCard>
            <MiniCard title={t('ov.accMonth')}>
              <AccuracyBox acc={insM.accuracy} />
            </MiniCard>
            <MiniCard title={t('xs.attention')} sub={attn.length ? String(attn.length) : undefined} wide>
              <AttentionList rows={attn} empty={t('xs.allGood')} max={8} />
            </MiniCard>
          </div>
        </>
      )}
    </section>
  );
}

function LevelCard({
  title,
  period,
  ov,
  stats,
  onClick,
  overLabel
}: {
  title: string;
  period: string;
  ov: Pick<PeriodOverview, 'total' | 'counts'>;
  stats: { v: string | number; l: string; tone?: 'ok' | 'warn' | 'bad' | 'info' }[];
  onClick: () => void;
  overLabel?: string;
}) {
  const { t } = useTranslation();
  const live = ov.total - ov.counts.cancel;
  const p = pct(ov.counts.done, live);
  const parts = [
    { k: 'done', v: ov.counts.done, cls: 'sb-done', l: t('status.done') },
    { k: 'doing', v: ov.counts.doing, cls: 'sb-doing', l: t('status.doing') },
    { k: 'over', v: ov.counts.over, cls: 'sb-over', l: overLabel ?? t('status.overdue') },
    { k: 'todo', v: ov.counts.todo, cls: 'sb-todo', l: t('status.todo') }
  ];
  return (
    <button className="ov-level" onClick={onClick} title={t('metric.open')}>
      <div className="ov-lv-top">
        <b>{title}</b>
        <small>{period}</small>
      </div>
      <div className="ov-lv-main">
        <span className="ov-lv-big">
          {ov.counts.done}
          <small>/{live}</small>
        </span>
        <span className="ov-lv-pct">
          {p}% {t('xs.doneWord')}
        </span>
      </div>
      <div className="stackbar">
        {parts
          .filter((x) => x.v > 0)
          .map((x) => (
            <b key={x.k} className={x.cls} style={{ flex: x.v }} title={`${x.l}: ${x.v}`} />
          ))}
        {live === 0 && <b className="sb-empty" style={{ flex: 1 }} />}
      </div>
      <div className="ov-lv-stats">
        {stats.map((s) => (
          <span key={s.l}>
            <b className={s.tone}>{s.v}</b>
            {s.l}
          </span>
        ))}
      </div>
    </button>
  );
}
