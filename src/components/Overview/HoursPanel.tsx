// Tổng quan: thời gian làm việc (CV Ngày) theo Phân loại và theo Vị trí, tuần này / tháng này
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { addDays, daysInMonth, startOfWeek, ymOf } from '../../core/dates.ts';
import type { OptKind } from '../../core/model.ts';
import { NONE_OPT } from '../../core/search.ts';
import { minutesBy } from '../../core/stats.ts';
import { durationLabel } from '../../core/time.ts';
import { useApp } from '../../store/app.ts';
import { useDerived } from '../../lib/hooks.ts';
import { optLabel, optMap, placeIcon, useOpts } from '../../lib/opts.ts';
import { Segmented } from '../Common/bits.tsx';

type Range = 'week' | 'month';

export function HoursPanel() {
  const { t } = useTranslation();
  const { data, today } = useDerived();
  const people = data.people;
  const [range, setRange] = useState<Range>('week');
  const [person, setPerson] = useState('');
  const from = range === 'week' ? startOfWeek(today) : `${ymOf(today)}-01`;
  const to = range === 'week' ? addDays(from, 6) : `${ymOf(today)}-${String(daysInMonth(ymOf(today))).padStart(2, '0')}`;
  return (
    <section className="hours-panel" aria-label={t('stats.title')}>
      <header className="hours-head">
        <h3>{t('stats.title')}</h3>
        <span className="hours-tools">
          <select aria-label={t('filter.person')} value={person} onChange={(e) => setPerson(e.target.value)}>
            <option value="">{t('filter.allPeople')}</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <Segmented<Range>
            label={t('stats.range')}
            value={range}
            onChange={setRange}
            options={[
              { value: 'week', label: t('stats.week') },
              { value: 'month', label: t('stats.month') }
            ]}
          />
        </span>
      </header>
      <div className="hours-grid">
        <HoursList kind="cats" from={from} to={to} person={person || null} />
        <HoursList kind="places" from={from} to={to} person={person || null} />
      </div>
      <p className="set-hint">{t('stats.hint')}</p>
    </section>
  );
}

function HoursList({ kind, from, to, person }: { kind: OptKind; from: string; to: string; person: string | null }) {
  const { t } = useTranslation();
  const data = useApp((s) => s.data);
  const opts = optMap(useOpts(kind));
  const res = useMemo(() => minutesBy(data, kind, from, to, person), [data, kind, from, to, person]);
  const max = res.rows[0]?.min ?? 0;
  /** bấm một dòng → mở CV Ngày đã lọc sẵn */
  const open = (id: string | null) => {
    const st = useApp.getState();
    useApp.setState({
      tab: 'ngay',
      query: '',
      filters: { ...st.filters, ngay: { [kind]: [id ?? NONE_OPT], from, to, ...(person ? { personId: person } : {}) } },
      modes: { ...st.modes, ngay: 'table' }
    });
  };
  return (
    <div className="hours-card">
      <div className="hours-card-head">
        <h4>{t(kind === 'cats' ? 'stats.byCat' : 'stats.byPlace')}</h4>
        <span className="hours-total">{t('stats.total', { h: durationLabel(res.total) })}</span>
      </div>
      {res.rows.length === 0 ? (
        <p className="set-hint">{t('stats.empty')}</p>
      ) : (
        <ul className="hours-list">
          {res.rows.map((r) => {
            const o = r.id ? opts.get(r.id) : undefined;
            const color = o?.color ?? '#94A3B8';
            const Icon = kind === 'places' && o ? placeIcon(o.id) : null;
            const name = o ? optLabel(o) : t(kind === 'cats' ? 'opt.noneCat' : 'opt.nonePlace');
            const pct = res.total ? Math.round((r.min / res.total) * 100) : 0;
            return (
              <li key={r.id ?? 'none'}>
                <button className="hours-row" onClick={() => open(r.id)} title={t('stats.rowTip', { name, h: durationLabel(r.min), n: r.count, p: pct })}>
                  <span className="hours-name">
                    {Icon ? <Icon size={14} style={{ color }} /> : <span className="opt-dot" style={{ background: color }} />}
                    <span>{name}</span>
                  </span>
                  <span className="hours-track">
                    <span className="hours-bar" style={{ width: `${max ? Math.max(2, (r.min / max) * 100) : 0}%`, background: color }} />
                  </span>
                  <span className="hours-val">{durationLabel(r.min)}</span>
                  <span className="hours-pct">{pct}%</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
