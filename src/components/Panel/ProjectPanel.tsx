// Bảng "Tổng quan dự án" bên phải (CV Tháng / CV Tuần): chỉ số, đường tiến độ, giờ làm, phân bổ, việc con,
// độ chính xác kế hoạch, sắp tới. Mở bằng 1 lần bấm vào dòng; trên điện thoại hiện toàn màn hình.
import { useEffect, useMemo, useRef } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { projectStats } from '../../core/projectStats.ts';
import type { ProjectStats, Slice } from '../../core/projectStats.ts';
import { durationLabel } from '../../core/time.ts';
import { useApp } from '../../store/app.ts';
import { cancelFlow, quickAction, restoreCancelled } from '../../lib/flows.ts';
import { fmtDate } from '../../lib/fmt.ts';
import { useDerived, usePeopleMap } from '../../lib/hooks.ts';
import { LOAI_KEY, cx } from '../../lib/labels.ts';
import { optLabel, optMap, useOpts } from '../../lib/opts.ts';
import { Avatar, StatusChip } from '../Common/bits.tsx';
import { CatChip } from '../Common/OptChip.tsx';
import { IBan, IEdit, IGantt, IPlay, IStop, IUndo, IX } from '../Common/Icons.tsx';
import { BurnChart, Donut, PairBars, Ring, StackBar } from '../Charts/Charts.tsx';

const ddmm = (d: string | null) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}` : '—');
const PERSON_FALLBACK = '#94A3B8';

export function ProjectPanel() {
  const panel = useApp((s) => s.panel);
  if (!panel) return null;
  return <PanelInner key={`${panel.level}:${panel.id}`} level={panel.level} id={panel.id} />;
}

function PanelInner({ level, id }: { level: 'thang' | 'tuan'; id: string }) {
  const { t } = useTranslation();
  const { data, derived, today } = useDerived();
  const lang = useApp((s) => s.settings.language);
  const openPanel = useApp((s) => s.openPanel);
  const openDrawer = useApp((s) => s.openDrawer);
  const navigateTo = useApp((s) => s.navigateTo);
  const setMode = useApp((s) => s.setMode);
  const people = usePeopleMap();
  const cats = optMap(useOpts('cats'));
  const places = optMap(useOpts('places'));
  const ref = useRef<HTMLElement>(null);
  const st = useMemo(() => projectStats(data, derived, level, id, today), [data, derived, level, id, today]);
  const item = level === 'thang' ? data.thang.find((x) => x.id === id) : data.tuan.find((x) => x.id === id);
  const info = (level === 'thang' ? derived.thang : derived.tuan).get(id);

  useEffect(() => {
    if (!st) openPanel(null); // việc đã bị xóa
  }, [st, openPanel]);
  useEffect(() => {
    ref.current?.scrollTo({ top: 0 });
  }, [id]);

  if (!st || !item || !info) return null;
  const close = () => openPanel(null);
  const H = (m: number) => durationLabel(m);
  const running = !!item.bdtt && !item.kttt;
  const person = item.personId ? people.get(item.personId) : undefined;
  const childUnit = t(level === 'thang' ? 'pp.unitTuan' : 'pp.unitNgay');

  return (
    <aside className="ppanel" ref={ref} role="complementary" aria-label={t('pp.title')}>
      <header className="pp-head">
        <div className="pp-top">
          <span className="code-tag">{item.ma}</span>
          <span>
            {t(`level.${level}`)} · {t('pp.title')}
          </span>
          <button className="icon-btn sm pp-x" aria-label={t('common.close')} title={`${t('common.close')} (Esc)`} onClick={close}>
            <IX size={16} />
          </button>
        </div>
        <h2>{item.ten || t('common.untitled')}</h2>
        <div className="pp-tags">
          {level === 'thang' && <span className={cx('loai', `loai-${LOAI_KEY[(item as { loai: keyof typeof LOAI_KEY }).loai]}`)}>{t(`loai.${LOAI_KEY[(item as { loai: keyof typeof LOAI_KEY }).loai]}`)}</span>}
          {item.cat && <CatChip opt={cats.get(item.cat)} />}
          <StatusChip value={info.display} locked={info.childCount > 0} />
          <span className="pp-person">
            <Avatar person={person} size={20} />
            {person?.name ?? t('person.unassigned')}
          </span>
        </div>
        <div className="pp-acts">
          <button className="btn btn-sm btn-primary" onClick={() => openDrawer({ level, id })}>
            <IEdit size={13} />
            {t('qa.edit')}
          </button>
          {!item.kttt && !item.huy && (
            <button className="btn btn-sm" onClick={() => quickAction(level, id, running ? 'end' : 'start')}>
              {running ? <IStop size={12} /> : <IPlay size={12} />}
              {running ? t('qa.end') : t('qa.start')}
            </button>
          )}
          <button className="btn btn-sm" onClick={() => setMode(level, 'chart')}>
            <IGantt size={13} />
            {t('pp.openGantt')}
          </button>
          {item.huy ? (
            <button className="btn btn-sm" onClick={() => restoreCancelled(level, [id])}>
              <IUndo size={13} />
              {t('cancel.restore')}
            </button>
          ) : (
            <button className="btn btn-sm danger-text" onClick={() => cancelFlow(level, [id])}>
              <IBan size={13} />
              {t('cancel.button')}
            </button>
          )}
        </div>
      </header>

      <div className="pp-body">
        <Card title={t('pp.kpi')} sub={st.start && st.end ? `${fmtDate(st.start, lang)} → ${fmtDate(st.end, lang)}` : t('pp.noDates')}>
          <div className="pp-rings">
            <Ring value={st.progress} color="var(--accent)" big={`${Math.round(st.progress * 100)}%`} small={st.childTotal ? `${st.childDone}/${st.childTotal} ${childUnit}` : undefined} label={t('pp.progress')} />
            <Ring
              value={st.elapsed ?? 0}
              color="var(--info)"
              big={st.elapsed === null ? '—' : `${Math.round(st.elapsed * 100)}%`}
              small={st.totalDays ? t('pp.daysOf', { a: st.elapsedDays, b: st.totalDays }) : undefined}
              label={t('pp.elapsed')}
            />
            <Ring
              value={item.huy || st.daysLeft === null || !st.totalDays ? 0 : st.daysLeft < 0 ? 1 : Math.min(1, st.daysLeft / st.totalDays)}
              color={st.daysLeft !== null && st.daysLeft < 0 ? 'var(--bad)' : 'var(--warn)'}
              big={item.huy || st.daysLeft === null ? '—' : String(Math.abs(st.daysLeft))}
              small={item.huy || st.daysLeft === null ? undefined : t('pp.days')}
              label={st.daysLeft !== null && st.daysLeft < 0 ? t('pp.lateBy') : t('pp.left')}
            />
          </div>
          <VerdictLine st={st} unit={childUnit} />
        </Card>

        <Card title={t('pp.burn')} sub={t('pp.burnSub', { n: st.burnTotal })}>
          {st.burn.length > 1 ? (
            <>
              <BurnChart points={st.burn} today={today} fmt={ddmm} labels={{ actual: t('pp.actual'), plan: t('pp.plan'), today: t('pp.today') }} />
              <div className="ch-legend">
                <span>
                  <i className="lg-actual" />
                  {t('pp.actual')}
                </span>
                <span>
                  <i className="lg-plan" />
                  {t('pp.planSched')}
                </span>
              </div>
            </>
          ) : (
            <p className="pp-empty">{t('pp.noNgay')}</p>
          )}
        </Card>

        <Card title={t(level === 'thang' ? 'pp.hoursWeek' : 'pp.hoursDay')} sub={t('pp.hoursSub', { a: H(st.actualMin), p: H(st.planMin) })}>
          {st.buckets.length && (st.planMin || st.actualMin) ? (
            <>
              <PairBars buckets={st.buckets} fmtH={H} labels={{ plan: t('pp.plan'), actual: t('pp.actual'), over: t('pp.over'), now: t('pp.now') }} />
              <div className="ch-legend">
                <span>
                  <i className="lg-bar-plan" />
                  {t('pp.plan')}
                </span>
                <span>
                  <i className="lg-bar-actual" />
                  {t('pp.actual')}
                </span>
                <span>
                  <i className="lg-bar-over" />
                  {t('pp.over')}
                </span>
              </div>
            </>
          ) : (
            <p className="pp-empty">{t('pp.noHours')}</p>
          )}
        </Card>

        <Card title={t('pp.alloc')} sub={st.workMin ? t('pp.allocSub', { h: H(st.workMin) }) : undefined}>
          {st.workMin ? (
            <div className="pp-donuts">
              <Donut center={t('col.cat')} total={st.workMin} fmt={H} items={sliceItems(st.byCat, (sid) => (sid ? cats.get(sid) : undefined), t('opt.noneCat'))} />
              <Donut center={t('col.place')} total={st.workMin} fmt={H} items={sliceItems(st.byPlace, (sid) => (sid ? places.get(sid) : undefined), t('opt.nonePlace'))} />
              {st.byPerson.length > 1 && (
                <Donut
                  center={t('col.person')}
                  total={st.workMin}
                  fmt={H}
                  items={st.byPerson.map((x) => {
                    const p = x.id ? people.get(x.id) : undefined;
                    return { key: x.id ?? 'none', label: p?.name ?? t('person.unassigned'), value: x.min, color: p?.color ?? PERSON_FALLBACK };
                  })}
                />
              )}
            </div>
          ) : (
            <p className="pp-empty">{t('pp.noHours')}</p>
          )}
        </Card>

        <Card title={t(level === 'thang' ? 'pp.kidsTuan' : 'pp.kidsNgay')} sub={t('pp.count', { n: st.childTotal })}>
          <StackBar
            parts={[
              { key: 'done', value: st.counts.done, cls: 'sb-done', label: t('status.done') },
              { key: 'doing', value: st.counts.doing, cls: 'sb-doing', label: t('status.doing') },
              { key: 'over', value: st.counts.overdue, cls: 'sb-over', label: t(level === 'thang' ? 'status.overdue' : 'pp.lateNgay') },
              { key: 'todo', value: st.counts.todo, cls: 'sb-todo', label: t('status.todo') },
              ...(st.counts.cancel ? [{ key: 'cancel', value: st.counts.cancel, cls: 'sb-cancel', label: t('status.cancel') }] : [])
            ]}
          />
          {st.children.length === 0 ? (
            <p className="pp-empty">{t('pp.noKids')}</p>
          ) : (
            <ul className="pp-kids">
              {st.children.slice(0, 40).map((c) => {
                const late = c.status === 'Quá hạn' || (c.level === 'ngay' && c.status !== 'Hoàn thành' && c.status !== 'Đã hủy' && !!c.dl && c.dl < today);
                const cancelled = c.status === 'Đã hủy';
                return (
                  <li key={c.id}>
                    <button className={cx('pp-kid', cancelled && 'is-cancel')} onClick={() => navigateTo(c.level, c.id)} title={t('pp.goto')}>
                      <span className="code-tag">{c.ma}</span>
                      <span className="pp-kid-t">{c.ten || t('common.untitled')}</span>
                      {c.progress !== null ? (
                        <span className="pp-kid-p">
                          <span className="pp-mini">
                            <b className={late ? 'late' : undefined} style={{ width: `${Math.round(c.progress * 100)}%` }} />
                          </span>
                          {Math.round(c.progress * 100)}%
                        </span>
                      ) : (
                        <span className="pp-kid-p dim">{c.time ?? ''}</span>
                      )}
                      <span className={cx('chip-s', cancelled ? 'cancel' : c.status === 'Hoàn thành' ? 'ok' : late ? 'bad' : c.status === 'Đang làm' ? 'info' : 'idle')}>
                        {cancelled
                          ? t('status.cancel')
                          : c.status === 'Hoàn thành'
                          ? t('pp.doneOn', { d: ddmm(c.doneOn ?? c.dl) })
                          : late && c.level === 'tuan' && c.dl
                            ? t('pp.lateDays', { n: Math.max(1, Math.round((Date.parse(today) - Date.parse(c.dl)) / 86400000)) })
                            : c.level === 'tuan'
                              ? t('pp.due', { d: ddmm(c.dl) })
                              : ddmm(c.dl)}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card title={t('pp.acc')} sub={t('pp.accSub', { n: st.accuracy.doneCount })}>
          {st.accuracy.measured ? (
            <>
              <div className="pp-kpis">
                <div className="pp-kpi">
                  <b className="ok">{Math.round((st.accuracy.onTime / st.accuracy.measured) * 100)}%</b>
                  <span>{t('pp.onTime', { a: st.accuracy.onTime, b: st.accuracy.measured })}</span>
                </div>
                <div className="pp-kpi">
                  {(() => {
                    const d = st.accuracy.planMin ? Math.round(((st.accuracy.actualMin - st.accuracy.planMin) / st.accuracy.planMin) * 100) : 0;
                    return <b className={d > 0 ? 'bad' : 'ok'}>{d > 0 ? `+${d}%` : `${d}%`}</b>;
                  })()}
                  <span>{t('pp.vsPlan', { a: H(st.accuracy.actualMin), p: H(st.accuracy.planMin) })}</span>
                </div>
              </div>
              {st.accuracy.top.length > 0 && (
                <>
                  <div className="pp-sub">{t('pp.topDev')}</div>
                  {st.accuracy.top.map((x) => (
                    <button key={x.id} className="pp-row" onClick={() => navigateTo('ngay', x.id)}>
                      <span className="code-tag">{x.ma}</span>
                      <span className="pp-row-t">{x.ten || t('common.untitled')}</span>
                      <b className={x.diff > 0 ? 'bad' : 'ok'}>{x.diff > 0 ? `+${x.diff}p` : `−${-x.diff}p`}</b>
                    </button>
                  ))}
                </>
              )}
            </>
          ) : (
            <p className="pp-empty">{t('pp.noAcc')}</p>
          )}
        </Card>

        <Card title={t('pp.next')}>
          {st.upcoming.length === 0 ? (
            <p className="pp-empty">{t('pp.noNext')}</p>
          ) : (
            st.upcoming.map((u) => (
              <button key={`${u.kind}:${u.id}`} className="pp-row" onClick={() => navigateTo(u.level, u.id)}>
                <span className={cx('chip-s', u.kind === 'late' || u.kind === 'missed' ? 'bad' : u.kind === 'later' ? 'idle' : 'info')}>
                  {u.kind === 'later' ? ddmm(u.day) : t(`pp.k.${u.kind}`)}
                </span>
                <span className="pp-row-t">
                  {u.ma} · {u.ten || t('common.untitled')}
                </span>
                <span className={cx('pp-row-s', (u.kind === 'late' || u.kind === 'missed') && 'bad')}>
                  {u.kind === 'late' ? t('pp.due', { d: ddmm(u.day) }) : u.kind === 'missed' ? ddmm(u.day) : u.time ?? ''}
                </span>
              </button>
            ))
          )}
        </Card>
      </div>
    </aside>
  );
}

function sliceItems(list: Slice[], get: (id: string | null) => { id: string; name: string; color: string } | undefined, none: string) {
  return list.map((x) => {
    const o = get(x.id);
    return { key: x.id ?? 'none', label: o ? optLabel(o as never) : none, value: x.min, color: o?.color ?? PERSON_FALLBACK };
  });
}

function Card({ title, sub, children }: { title: string; sub?: string; children: ReactNode }) {
  return (
    <section className="pp-card">
      <h4>
        <span>{title}</span>
        {sub && <small>{sub}</small>}
      </h4>
      {children}
    </section>
  );
}

function VerdictLine({ st, unit }: { st: ProjectStats; unit: string }) {
  const { t } = useTranslation();
  const v = st.verdict;
  const [cls, text] =
    v.kind === 'done'
      ? v.lateDays > 0
        ? ['warn', t('pp.v.doneLate', { n: v.lateDays })]
        : ['ok', t('pp.v.done')]
      : v.kind === 'late'
        ? ['bad', t('pp.v.late', { n: v.days })]
        : v.kind === 'ahead'
          ? ['ok', t('pp.v.ahead', { p: v.pct })]
          : v.kind === 'ontrack'
            ? ['ok', t('pp.v.ontrack')]
            : v.kind === 'behind'
              ? ['warn', t('pp.v.behind', { p: v.pct, n: v.need, unit })]
              : v.kind === 'cancelled'
                ? ['cancel', `${t('pp.v.cancelled', { d: `${v.at.slice(8, 10)}/${v.at.slice(5, 7)}/${v.at.slice(0, 4)}`, p: Math.round(st.progress * 100) })}${v.reason ? ` · ${v.reason}` : ''}`]
                : ['idle', t('pp.v.nodates')];
  return <div className={cx('pp-verdict', cls)}>{text}</div>;
}
