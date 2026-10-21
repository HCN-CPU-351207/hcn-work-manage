// Các thẻ nhỏ dùng chung cho dải biểu đồ (Tổng quan, CV Tháng / Tuần / Ngày):
// phân bổ giờ, tải theo người, số việc xong theo khung, độ chính xác kế hoạch, việc cần chú ý.
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { DevRow, PersonLoad, Slice } from '../../core/insights.ts';
import type { Level } from '../../core/model.ts';
import { durationLabel } from '../../core/time.ts';
import { useApp } from '../../store/app.ts';
import { usePeopleMap } from '../../lib/hooks.ts';
import { cx } from '../../lib/labels.ts';
import { optLabel, optMap, useOpts } from '../../lib/opts.ts';
import { Avatar } from '../Common/bits.tsx';
import { Donut } from './Charts.tsx';

const H = (m: number) => durationLabel(m);
const GREY = '#94A3B8';

export function MiniCard({ title, sub, children, wide }: { title: string; sub?: ReactNode; children: ReactNode; wide?: boolean }) {
  return (
    <section className={cx('ds-card', wide && 'wide')}>
      <h5>
        <span>{title}</span>
        {sub !== undefined && <small>{sub}</small>}
      </h5>
      {children}
    </section>
  );
}

/** vòng phân bổ giờ theo Phân loại hoặc Vị trí */
export function AllocDonut({ kind, slices, total }: { kind: 'cats' | 'places'; slices: Slice[]; total: number }) {
  const { t } = useTranslation();
  const opts = optMap(useOpts(kind));
  if (!total) return <p className="pp-empty">{t('pp.noHours')}</p>;
  const top = slices.slice(0, 5);
  const rest = slices.slice(5).reduce((s, x) => s + x.min, 0);
  const items = top.map((x) => {
    const o = x.id ? opts.get(x.id) : undefined;
    return { key: x.id ?? 'none', label: o ? optLabel(o) : t(kind === 'cats' ? 'opt.noneCat' : 'opt.nonePlace'), value: x.min, color: o?.color ?? GREY };
  });
  if (rest) items.push({ key: 'rest', label: t('xs.other'), value: rest, color: '#64748B' });
  return <Donut center={H(total)} total={total} fmt={H} items={items} />;
}

/** tải theo người: thanh việc xong / tổng + giờ */
export function PeopleBars({ people, max = 5 }: { people: PersonLoad[]; max?: number }) {
  const { t } = useTranslation();
  const pm = usePeopleMap();
  if (!people.length) return <p className="pp-empty">{t('xs.noPeople')}</p>;
  const maxMin = Math.max(1, ...people.map((p) => p.min));
  return (
    <ul className="xs-people">
      {people.slice(0, max).map((p) => {
        const person = p.id ? pm.get(p.id) : undefined;
        return (
          <li key={p.id ?? 'none'}>
            <Avatar person={person} size={20} />
            <span className="xs-name">{person?.name ?? t('person.unassigned')}</span>
            <span className="xs-bar" title={H(p.min)}>
              <b style={{ width: `${(p.min / maxMin) * 100}%`, background: person?.color ?? GREY }} />
            </span>
            <span className="xs-num">
              {p.done}/{p.total}
            </span>
            <span className="xs-h">{H(p.min)}</span>
          </li>
        );
      })}
    </ul>
  );
}

/** cột số việc xong / tổng theo từng ngày hoặc tuần */
export function CountBars({ buckets }: { buckets: { key: string; label: string; done: number; total: number; current: boolean }[] }) {
  const { t } = useTranslation();
  const max = Math.max(1, ...buckets.map((b) => b.total));
  if (!buckets.some((b) => b.total)) return <p className="pp-empty">{t('xs.noNgay')}</p>;
  return (
    <div className="xs-cols">
      {buckets.map((b) => (
        <div key={b.key} className={cx('xs-col', b.current && 'cur')} title={`${b.label}: ${b.done}/${b.total}`}>
          <span className="xs-col-n">{b.total ? `${b.done}/${b.total}` : ''}</span>
          <span className="xs-col-track">
            <i className="all" style={{ height: `${(b.total / max) * 100}%` }}>
              <i className="done" style={{ height: b.total ? `${(b.done / b.total) * 100}%` : 0 }} />
            </i>
          </span>
          <span className="xs-col-l">{b.label}</span>
        </div>
      ))}
    </div>
  );
}

/** độ chính xác kế hoạch của CV Ngày đã xong */
export function AccuracyBox({ acc }: { acc: { measured: number; ontime: number; planMin: number; actualMin: number; avgDev: number | null; top: DevRow[] } }) {
  const { t } = useTranslation();
  const openPanel = useApp((s) => s.openPanel);
  if (!acc.measured) return <p className="pp-empty">{t('pp.noAcc')}</p>;
  const pct = Math.round((acc.ontime / acc.measured) * 100);
  const dev = acc.planMin ? Math.round(((acc.actualMin - acc.planMin) / acc.planMin) * 100) : 0;
  return (
    <>
      <div className="xs-kpis">
        <div>
          <b className={pct >= 80 ? 'ok' : pct >= 50 ? 'warn' : 'bad'}>{pct}%</b>
          <span>{t('xs.ontime', { a: acc.ontime, b: acc.measured })}</span>
        </div>
        <div>
          <b className={dev > 10 ? 'bad' : dev < -10 ? 'warn' : 'ok'}>{dev > 0 ? `+${dev}%` : `${dev}%`}</b>
          <span>{t('xs.vsPlan', { a: H(acc.actualMin), p: H(acc.planMin) })}</span>
        </div>
      </div>
      {acc.top.length > 0 && (
        <ul className="xs-list">
          {acc.top.slice(0, 3).map((x) => (
            <li key={x.id}>
              <button onClick={() => openPanel({ level: 'ngay', id: x.id })}>
                <span className="code-tag">{x.ma}</span>
                <span className="xs-t">{x.ten || t('common.untitled')}</span>
                <b className={x.diff > 0 ? 'bad' : 'ok'}>{x.diff > 0 ? `+${H(x.diff)}` : `−${H(-x.diff)}`}</b>
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

export interface AttnRow {
  level: Level;
  id: string;
  ma: string;
  ten: string;
  tag: string;
  tone: 'bad' | 'warn' | 'info' | 'idle';
}
/** danh sách việc cần chú ý; bấm để mở bảng chỉ số của việc */
export function AttentionList({ rows, empty, max = 6 }: { rows: AttnRow[]; empty: string; max?: number }) {
  const { t } = useTranslation();
  const navigateTo = useApp((s) => s.navigateTo);
  const openPanel = useApp((s) => s.openPanel);
  const tab = useApp((s) => s.tab);
  // gộp nhiều lý do của cùng một việc thành một dòng
  const rank = { bad: 0, warn: 1, info: 2, idle: 3 } as const;
  const merged: AttnRow[] = [];
  const at = new Map<string, number>();
  for (const r of rows) {
    const k = `${r.level}:${r.id}`;
    const i = at.get(k);
    if (i === undefined) {
      at.set(k, merged.length);
      merged.push({ ...r });
    } else {
      const m = merged[i];
      m.tag = `${m.tag} · ${r.tag}`;
      if (rank[r.tone] < rank[m.tone]) m.tone = r.tone;
    }
  }
  rows = merged;
  if (!rows.length) return <p className="pp-empty ok">{empty}</p>;
  return (
    <ul className="xs-list">
      {rows.slice(0, max).map((r) => (
        <li key={`${r.level}:${r.id}`}>
          <button
            onClick={() => {
              if (tab !== r.level) navigateTo(r.level, r.id);
              openPanel({ level: r.level, id: r.id });
            }}
          >
            <span className="code-tag">{r.ma}</span>
            <span className="xs-t">{r.ten || t('common.untitled')}</span>
            <span className={cx('chip-s', r.tone)}>{r.tag}</span>
          </button>
        </li>
      ))}
      {rows.length > max && <li className="xs-more">{t('xs.more', { n: rows.length - max })}</li>}
    </ul>
  );
}

/** một dòng chỉ số nhỏ dạng "số + nhãn" */
export function Stat({ value, label, tone }: { value: ReactNode; label: string; tone?: 'ok' | 'warn' | 'bad' | 'info' }) {
  return (
    <div className="xs-stat">
      <b className={tone}>{value}</b>
      <span>{label}</span>
    </div>
  );
}
