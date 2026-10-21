// Bảng chỉ số bên phải cho một CV Ngày (biểu đồ A): checklist, thời gian làm so với dự kiến,
// dòng thời gian kế hoạch / thực tế, các bước đã tích (bước lâu nhất), checklist sửa trực tiếp.
import { useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { nowIso } from '../../core/dates.ts';
import { ngayStats } from '../../core/dayStats.ts';
import type { NgayStats } from '../../core/dayStats.ts';
import type { Ngay } from '../../core/model.ts';
import { durationLabel } from '../../core/time.ts';
import { useApp } from '../../store/app.ts';
import { cancelFlow, ckDo, quickAction, restoreCancelled } from '../../lib/flows.ts';
import { fmtDate, hhmm } from '../../lib/fmt.ts';
import { useNow, usePeopleMap } from '../../lib/hooks.ts';
import { cx } from '../../lib/labels.ts';
import { optMap, useOpts } from '../../lib/opts.ts';
import { Avatar, LiveClock, StatusChip } from '../Common/bits.tsx';
import { CatChip, PlaceChip } from '../Common/OptChip.tsx';
import { IBan, IEdit, IPlay, IReset, IStop, IUndo, IX } from '../Common/Icons.tsx';
import { Ring } from '../Charts/Charts.tsx';
import { ChecklistEditor } from '../Checklist/ChecklistEditor.tsx';
import { Card } from './ProjectPanel.tsx';

const H = (m: number) => durationLabel(m);
const signed = (m: number) => (m > 0 ? `+${H(m)}` : m < 0 ? `−${H(-m)}` : '0p');

export function NgayPanel({ id }: { id: string }) {
  const { t } = useTranslation();
  const n = useApp((s) => s.data.ngay.find((x) => x.id === id));
  const tuan = useApp((s) => (n ? s.data.tuan.find((w) => w.id === n.parentId) : undefined));
  const thang = useApp((s) => (tuan ? s.data.thang.find((m) => m.ma === tuan.parentMa) : undefined));
  const lang = useApp((s) => s.settings.language);
  const openPanel = useApp((s) => s.openPanel);
  const openDrawer = useApp((s) => s.openDrawer);
  const navigateTo = useApp((s) => s.navigateTo);
  const people = usePeopleMap();
  const cats = optMap(useOpts('cats'));
  const places = optMap(useOpts('places'));
  const ref = useRef<HTMLElement>(null);
  const running = !!n?.a1 && !n.a2 && !n.huy;
  const tick = useNow(running ? 30_000 : 3_600_000);
  const now = useMemo(() => nowIso(new Date(tick)), [tick]);
  const st = useMemo(() => (n ? ngayStats(n, now) : null), [n, now]);

  useEffect(() => {
    if (!n) openPanel(null); // việc đã bị xóa
  }, [n, openPanel]);
  useEffect(() => {
    ref.current?.scrollTo({ top: 0 });
  }, [id]);
  if (!n || !st) return null;

  const close = () => openPanel(null);
  const person = n.personId ? people.get(n.personId) : undefined;
  const display = n.huy ? 'Đã hủy' : n.tt;
  const done = n.tt === 'Hoàn thành';

  return (
    <aside className="ppanel npanel" ref={ref} role="complementary" aria-label={t('np.title')}>
      <header className="pp-head">
        <div className="pp-top">
          <span className="code-tag">{n.ma}</span>
          <span>
            {t('level.ngay')} · {t('np.title')}
          </span>
          <button className="icon-btn sm pp-x" aria-label={t('common.close')} title={`${t('common.close')} (Esc)`} onClick={close}>
            <IX size={16} />
          </button>
        </div>
        <h2>{n.ten || t('common.untitled')}</h2>
        <div className="pp-tags">
          <StatusChip value={display} locked={false} />
          {n.cat && <CatChip opt={cats.get(n.cat)} />}
          {(n.place || n.placeNote) && <PlaceChip opt={n.place ? places.get(n.place) : undefined} note={n.placeNote} />}
          <span className="pp-person">
            <Avatar person={person} size={20} />
            {person?.name ?? t('person.unassigned')}
          </span>
        </div>
        <div className="pp-acts">
          <button className="btn btn-sm btn-primary" onClick={() => openDrawer({ level: 'ngay', id })}>
            <IEdit size={13} />
            {t('qa.edit')}
          </button>
          {!n.huy && !done && (
            <button className="btn btn-sm" onClick={() => quickAction('ngay', id, running ? 'end' : 'start')}>
              {running ? <IStop size={12} /> : <IPlay size={12} />}
              {running ? t('qa.end') : t('qa.start')}
            </button>
          )}
          {running && <LiveClock since={n.a1!} className="qa-clock" />}
          {!n.huy && (n.a1 || done) && (
            <button className="btn btn-sm" onClick={() => quickAction('ngay', id, 'reset')} title={t('qa.reset')}>
              <IReset size={13} />
              {t('qa.reset')}
            </button>
          )}
          {n.huy ? (
            <button className="btn btn-sm" onClick={() => restoreCancelled('ngay', [id])}>
              <IUndo size={13} />
              {t('cancel.restore')}
            </button>
          ) : (
            <button className="btn btn-sm danger-text" onClick={() => cancelFlow('ngay', [id])}>
              <IBan size={13} />
              {t('cancel.button')}
            </button>
          )}
        </div>
      </header>

      <div className="pp-body">
        <Card title={t('np.kpi')} sub={n.ngay ? fmtDate(n.ngay, lang) : undefined}>
          <div className="pp-rings">
            <Ring
              value={st.ck.total ? st.ck.done / st.ck.total : 0}
              color={st.ck.total && st.ck.done === st.ck.total ? 'var(--ok)' : 'var(--accent)'}
              big={st.ck.total ? `${Math.round((st.ck.done / st.ck.total) * 100)}%` : '—'}
              small={st.ck.total ? t('np.steps', { a: st.ck.done, b: st.ck.total }) : t('np.noCk')}
              label={t('ck.title')}
            />
            <Ring
              value={st.workedMin !== null && st.planMin ? Math.min(1, st.workedMin / st.planMin) : 0}
              color={st.workedMin !== null && st.planMin && st.workedMin > st.planMin ? 'var(--bad)' : 'var(--info)'}
              big={st.workedMin !== null ? H(st.workedMin) : '—'}
              small={st.planMin ? t('np.ofPlan', { p: H(st.planMin) }) : t('np.noPlan')}
              label={t('np.worked')}
            />
          </div>
          <Verdict n={n} st={st} />
        </Card>

        <Card title={t('np.timeline')} sub={n.g1 && n.g2 ? `${n.g1}–${n.g2}` : t('timeline.unscheduled')}>
          <TimeBars n={n} st={st} now={now} />
        </Card>

        <Card title={t('np.stepsTitle')} sub={st.steps.length ? t('np.stepsSub', { n: st.steps.length, p: st.pending }) : undefined}>
          {st.steps.length === 0 ? (
            <p className="pp-empty">{st.ck.total ? t('np.noTicks') : t('np.noCkHint')}</p>
          ) : (
            <ol className="np-steps">
              {n.a1 && (
                <li className="np-step start">
                  <span className="np-at">{hhmm(n.a1)}</span>
                  <span className="np-dot" />
                  <span className="np-t">{t('np.started')}</span>
                </li>
              )}
              {st.steps.map((s) => (
                <li key={s.id} className={cx('np-step', s.longest && 'longest')}>
                  <span className="np-at">{hhmm(s.at)}</span>
                  <span className="np-dot" />
                  <span className="np-t">{s.text}</span>
                  {s.gap !== null && (
                    <span className="np-gap" title={s.longest ? t('np.longest') : undefined}>
                      {s.longest && '⏱ '}
                      {H(s.gap)}
                    </span>
                  )}
                </li>
              ))}
            </ol>
          )}
        </Card>

        <section className="pp-card">
          <ChecklistEditor ck={n.ck ?? []} run={(fn) => ckDo(id, fn)} disabled={!!n.huy} compact />
        </section>

        <Card title={t('np.info')}>
          <dl className="np-info">
            {thang && (
              <>
                <dt>{t('level.thang')}</dt>
                <dd>
                  <button className="link" onClick={() => navigateTo('thang', thang.id)}>
                    {thang.ma} · {thang.ten || t('common.untitled')}
                  </button>
                </dd>
              </>
            )}
            {tuan && (
              <>
                <dt>{t('level.tuan')}</dt>
                <dd>
                  <button className="link" onClick={() => navigateTo('tuan', tuan.id)}>
                    {tuan.ma} · {tuan.ten || t('common.untitled')}
                  </button>
                </dd>
              </>
            )}
            <dt>{t('col.planTime')}</dt>
            <dd>{n.g1 && n.g2 ? `${n.g1}–${n.g2}` : '—'}</dd>
            <dt>{t('col.actualTime')}</dt>
            <dd>{n.a1 ? `${hhmm(n.a1)}–${n.a2 ? hhmm(n.a2) : '…'}` : '—'}</dd>
            {n.gc && (
              <>
                <dt>{t('col.note')}</dt>
                <dd className="np-note">{n.gc}</dd>
              </>
            )}
          </dl>
        </Card>
      </div>
    </aside>
  );
}

function Verdict({ n, st }: { n: Ngay; st: NgayStats }) {
  const { t } = useTranslation();
  const parts: string[] = [];
  let cls = 'idle';
  if (n.huy) {
    cls = 'cancel';
    parts.push(t('status.cancel'));
  } else if (n.tt === 'Hoàn thành') {
    cls = st.endDelta !== null && st.endDelta > 5 ? 'warn' : 'ok';
    parts.push(st.endDelta === null ? t('np.v.done') : st.endDelta > 5 ? t('np.v.doneLate', { m: H(st.endDelta) }) : st.endDelta < -5 ? t('np.v.doneEarly', { m: H(-st.endDelta) }) : t('np.v.doneOnTime'));
  } else if (st.running) {
    cls = st.leftMin !== null && st.leftMin < 0 ? 'bad' : 'ok';
    if (st.startDelta !== null && Math.abs(st.startDelta) > 5) parts.push(st.startDelta > 0 ? t('np.v.startLate', { m: H(st.startDelta) }) : t('np.v.startEarly', { m: H(-st.startDelta) }));
    if (st.leftMin !== null) parts.push(st.leftMin >= 0 ? t('np.v.left', { m: H(st.leftMin) }) : t('np.v.over', { m: H(-st.leftMin) }));
    if (st.pending) parts.push(t('np.v.pending', { n: st.pending }));
    if (!parts.length) parts.push(t('np.v.running'));
  } else {
    parts.push(st.ck.done ? t('np.v.notStartedTicks') : t('np.v.notStarted'));
  }
  return <div className={cx('pp-verdict', cls)}>{parts.join(' · ')}</div>;
}

/** Hai thanh ngang: kế hoạch và thực tế trên cùng trục giờ, kèm vạch mỗi lần tích */
function TimeBars({ n, st, now }: { n: Ngay; st: NgayStats; now: string }) {
  const { t } = useTranslation();
  const day = n.ngay;
  const ps = n.g1 ? Date.parse(`${day}T${n.g1}:00`) : null;
  const pe = n.g2 ? Date.parse(`${day}T${n.g2}:00`) : null;
  const as = n.a1 ? Date.parse(n.a1) : null;
  const ae = n.a1 ? Date.parse(n.a2 ?? now) : null;
  const ticks = st.steps.map((s) => ({ id: s.id, ms: Date.parse(s.at), text: s.text, longest: s.longest }));
  const pts = [ps, pe, as, ae, ...ticks.map((x) => x.ms)].filter((x): x is number => x !== null && !Number.isNaN(x));
  if (!pts.length) return <p className="pp-empty">{t('np.noTimes')}</p>;
  // trục: làm tròn ra giờ chẵn
  const lo = Math.floor(Math.min(...pts) / 3600_000) * 3600_000;
  const hi = Math.max(lo + 3600_000, Math.ceil(Math.max(...pts) / 3600_000) * 3600_000);
  const pct = (v: number) => `${((v - lo) / (hi - lo)) * 100}%`;
  const w = (a: number, b: number) => `${(Math.max(0, b - a) / (hi - lo)) * 100}%`;
  const hours: number[] = [];
  const stepH = Math.max(1, Math.ceil((hi - lo) / 3600_000 / 8)); // tối đa ~8 nhãn giờ
  for (let x = lo; x <= hi; x += stepH * 3600_000) hours.push(x);
  const multiDay = hi - lo > 24 * 3600_000 || new Date(lo).getDate() !== new Date(hi - 1).getDate();
  const hLabel = (x: number) => {
    const d = new Date(x);
    return multiDay && d.getHours() < stepH ? `${d.getDate()}/${d.getMonth() + 1}` : `${d.getHours()}h`;
  };
  const late = pe !== null && ae !== null && ae > pe;
  return (
    <div className="np-tl">
      <div className="np-tl-row">
        <span className="np-tl-lbl">{t('pp.plan')}</span>
        <div className="np-tl-track">
          {ps !== null && pe !== null && <span className="np-tl-bar plan" style={{ left: pct(ps), width: w(ps, pe) }} />}
        </div>
      </div>
      <div className="np-tl-row">
        <span className="np-tl-lbl">{t('pp.actual')}</span>
        <div className="np-tl-track">
          {as !== null && ae !== null && (
            <>
              <span className={cx('np-tl-bar', 'actual', st.running && 'running')} style={{ left: pct(as), width: w(as, Math.min(ae, pe ?? ae)) }} />
              {late && <span className="np-tl-bar over" style={{ left: pct(Math.max(as, pe!)), width: w(Math.max(as, pe!), ae) }} />}
            </>
          )}
          {ticks.map((k) => (
            <span key={k.id} className={cx('np-tl-tick', k.longest && 'longest')} style={{ left: pct(k.ms) }} title={`${new Date(k.ms).toTimeString().slice(0, 5)} · ${k.text}`} />
          ))}
        </div>
      </div>
      <div className="np-tl-axis">
        {hours.map((x) => (
          <span key={x} style={{ left: pct(x) }}>
            {hLabel(x)}
          </span>
        ))}
      </div>
    </div>
  );
}
