// Timeline 24 giờ của một ngày (mục 8.5.5): ô 10 phút, zoom 16/24/36 px, khay "Chưa xếp giờ",
// việc trùng giờ xếp nhiều làn, dải thực tế 4 px, đồng hồ đang chạy, tổng DK/TT.
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { minutesSinceDay } from '../../core/dates.ts';
import { actualMinutes, assignLanes, diffMinutes, durationLabel, hmToMin, isScheduled, plannedMinutes, SLOT_MIN } from '../../core/time.ts';
import { useApp } from '../../store/app.ts';
import { useNow } from '../../lib/hooks.ts';
import { fmtDate } from '../../lib/fmt.ts';
import { cx } from '../../lib/labels.ts';
import type { NgayRow } from '../../lib/rows.ts';
import { tipFromRow } from '../../lib/tip.ts';
import { LiveClock } from '../Common/bits.tsx';
import { IMinus, IPlus } from '../Common/Icons.tsx';
import { TaskBar } from './TaskBar.tsx';

const ZOOMS = [16, 24, 36];
const LANE_H = 44;
const LANE_GAP = 6;

interface Cluster {
  rows: NgayRow[];
  lanes: Map<string, number>;
  count: number;
}

export function DayTimeline({ day, rows, today, header }: { day: string; rows: NgayRow[]; today: string; header?: ReactNode }) {
  const { t } = useTranslation();
  const lang = useApp((s) => s.settings.language);
  const openDrawer = useApp((s) => s.openDrawer);
  const [h0, setH0] = useState(5);
  const [h1, setH1] = useState(22);
  const [zi, setZi] = useState(1);
  const slotW = ZOOMS[zi];
  const now = useNow(30_000);
  const scrollRef = useRef<HTMLDivElement>(null);
  const labelW = 150;

  const scheduled = useMemo(() => rows.filter((r) => isScheduled(r.item)), [rows]);
  const tray = useMemo(() => rows.filter((r) => !isScheduled(r.item)), [rows]);

  // Gom các việc giao nhau thành cụm; mỗi cụm là một dòng, bên trong chia làn (X14)
  const clusters = useMemo(() => {
    const items = scheduled
      .map((r) => ({ r, s: hmToMin(r.item.g1!), e: hmToMin(r.item.g2!) }))
      .sort((a, b) => a.s - b.s || a.e - b.e);
    const out: Cluster[] = [];
    let cur: typeof items = [];
    let curEnd = -1;
    const flush = () => {
      if (!cur.length) return;
      const { lanes, count } = assignLanes(cur.map((x) => ({ id: x.r.id, start: x.s, end: x.e })));
      out.push({ rows: cur.map((x) => x.r), lanes, count });
      cur = [];
    };
    for (const it of items) {
      if (cur.length && it.s >= curEnd) flush();
      cur.push(it);
      curEnd = Math.max(curEnd, it.e);
      if (cur.length === 1) curEnd = it.e;
    }
    flush();
    return out;
  }, [scheduled]);

  const startMin = h0 * 60;
  const endMin = h1 * 60;
  const trackW = ((endMin - startMin) / SLOT_MIN) * slotW;
  const x = (min: number) => ((Math.min(Math.max(min, startMin), endMin) - startMin) / SLOT_MIN) * slotW;

  const nowD = new Date(now);
  const nowMin = nowD.getHours() * 60 + nowD.getMinutes() + nowD.getSeconds() / 60;
  const showNow = day === today && nowMin >= startMin && nowMin <= endMin;

  // cuộn tới giờ hiện tại (hoặc việc đầu tiên) khi mở
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    // ưu tiên thấy việc đầu tiên trong ngày; nếu là hôm nay thì vẫn giữ đường hiện tại trong khung
    const firstStart = scheduled.length ? Math.min(...scheduled.map((r) => hmToMin(r.item.g1!))) : null;
    const target = firstStart !== null ? (day === today ? Math.min(firstStart, nowMin) : firstStart) - 30 : day === today ? nowMin - 60 : startMin;
    el.scrollLeft = Math.max(0, x(target));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [day, slotW, h0]);

  const totals = useMemo(() => {
    let dp = 0;
    let da = 0;
    for (const r of rows) {
      dp += plannedMinutes(r.item) ?? 0;
      da += actualMinutes(r.item, r.item.a2 ? undefined : now) ?? 0;
    }
    return { dp, da };
  }, [rows, now]);

  const hours: number[] = [];
  for (let h = h0; h <= h1; h++) hours.push(h);
  const hourOpts = Array.from({ length: 25 }, (_, i) => i);
  let y = 0;

  return (
    <div className="timeline">
      <div className="tl-toolbar">
        {header ?? <strong className="tl-date">{fmtDate(day, lang)}</strong>}
        <span className="tl-totals">
          {t('timeline.totals', { p: durationLabel(totals.dp), a: durationLabel(totals.da) })}
        </span>
        <span className="tl-tools">
          <label className="tl-range">
            <span className="sr-only">{t('timeline.from')}</span>
            <select value={h0} onChange={(e) => setH0(Math.min(Number(e.target.value), h1 - 1))} aria-label={t('timeline.from')}>
              {hourOpts.slice(0, 24).map((h) => (
                <option key={h} value={h}>{`${String(h).padStart(2, '0')}:00`}</option>
              ))}
            </select>
            <span aria-hidden>–</span>
            <select value={h1} onChange={(e) => setH1(Math.max(Number(e.target.value), h0 + 1))} aria-label={t('timeline.to')}>
              {hourOpts.slice(1).map((h) => (
                <option key={h} value={h}>{`${String(h).padStart(2, '0')}:00`}</option>
              ))}
            </select>
          </label>
          <span className="zoom" role="group" aria-label={t('timeline.zoom')}>
            <button className="icon-btn sm" onClick={() => setZi(Math.max(0, zi - 1))} disabled={zi === 0} aria-label={t('timeline.zoomOut')}>
              <IMinus size={14} />
            </button>
            <span className="zoom-val">{slotW}px</span>
            <button className="icon-btn sm" onClick={() => setZi(Math.min(ZOOMS.length - 1, zi + 1))} disabled={zi === ZOOMS.length - 1} aria-label={t('timeline.zoomIn')}>
              <IPlus size={14} />
            </button>
          </span>
        </span>
      </div>

      <div className="tl-tray">
        <span className="tl-tray-title">{t('timeline.unscheduled')}</span>
        {tray.length === 0 ? (
          <span className="tl-tray-empty">{t('timeline.trayEmpty')}</span>
        ) : (
          tray.map((r) => (
            <button key={r.id} className="tray-chip" onClick={() => openDrawer({ level: 'ngay', id: r.id })} title={t('timeline.trayHint')}>
              <span className="code-tag">{r.ma}</span>
              <span>{r.ten || t('common.untitled')}</span>
            </button>
          ))
        )}
      </div>

      <div className="tl-scroll" ref={scrollRef}>
        <div className="tl-inner" style={{ width: labelW + trackW }}>
          <div className="tl-head">
            <div className="tl-corner" style={{ width: labelW }} aria-hidden />
            <div className="tl-hours" style={{ width: trackW }}>
              {hours.map((h) => (
                <span key={h} className="tl-hour" style={{ left: x(h * 60) }}>
                  {`${String(h).padStart(2, '0')}:00`}
                </span>
              ))}
            </div>
          </div>
          <div className="tl-body">
            <div
              className="tl-grid"
              style={{ left: labelW, width: trackW, ['--slot' as string]: `${slotW}px`, ['--hour' as string]: `${slotW * 6}px` }}
              aria-hidden
            />
            {clusters.length === 0 && <div className="g-empty">{t('timeline.empty')}</div>}
            {clusters.map((c, ci) => {
              const h = c.count * LANE_H + (c.count - 1) * LANE_GAP + 12;
              const top = y;
              y += h;
              return (
                <div key={ci} className="tl-row" style={{ top, height: h }}>
                  <div className="tl-label" style={{ width: labelW }}>
                    {Array.from({ length: c.count }, (_, lane) => {
                      const inLane = c.rows.filter((r) => (c.lanes.get(r.id) ?? 0) === lane);
                      const one = inLane.length === 1 ? inLane[0] : null;
                      return (
                        <div key={lane} className="tl-label-line" style={{ top: 6 + lane * (LANE_H + LANE_GAP), height: LANE_H }} title={inLane.map((r) => `${r.ma} · ${r.ten}`).join('\n')}>
                          <span className="tl-label-name">{one ? one.ten || one.ma : inLane.map((r) => r.ma).join(', ')}</span>
                          <span className="tl-label-person">{one ? one.person?.name ?? t('person.unassigned') : t('timeline.nTasks', { n: inLane.length })}</span>
                        </div>
                      );
                    })}
                  </div>
                  <div className="tl-track" style={{ left: labelW, width: trackW }}>
                    {c.rows.map((r) => {
                      const n = r.item;
                      const s = hmToMin(n.g1!);
                      const e = hmToMin(n.g2!);
                      const lane = c.lanes.get(r.id) ?? 0;
                      const barTop = 6 + lane * (LANE_H + LANE_GAP);
                      const running = !!n.a1 && !n.a2;
                      const dp = plannedMinutes(n);
                      const da = actualMinutes(n, running ? now : undefined);
                      const diff = n.a2 ? diffMinutes(da, dp) : null;
                      const tone = n.tt === 'Hoàn thành' && diff !== null ? (diff > 0 ? 'bad' : 'good') : null;
                      const a1 = n.a1 ? minutesSinceDay(n.a1, day) : null;
                      const a2 = n.a2 ? minutesSinceDay(n.a2, day) : running && day === today ? nowMin : null;
                      return (
                        <div key={r.id}>
                          <TaskBar
                            left={x(s)}
                            width={x(e) - x(s)}
                            top={barTop}
                            display={r.display}
                            person={r.person}
                            personLabel={r.person?.name ?? t('person.unassigned')}
                            title={r.ten || t('common.untitled')}
                            code={r.ma}
                            ariaLabel={`${r.ma} ${r.ten} ${n.g1}–${n.g2}`}
                            warn={r.conflict}
                            tone={tone}
                            tip={() => tipFromRow(r, t, lang, Date.now())}
                            extra={running && day === today ? <LiveClock since={n.a1!} className="tb-clock" /> : null}
                          />
                          {a1 !== null && a2 !== null && a2 > a1 && (
                            <div
                              className={cx('g-actual', running ? 'g-actual-doing' : tone === 'bad' ? 'g-actual-late' : 'g-actual-ok')}
                              style={{ left: x(a1), width: Math.max(4, x(a2) - x(a1)), top: barTop + LANE_H - 4 }}
                              aria-hidden
                            />
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
            <div style={{ height: Math.max(y, 120) }} />
            {showNow && <div className="now-line" style={{ left: labelW + x(nowMin) }} aria-hidden />}
          </div>
        </div>
      </div>
    </div>
  );
}

