// Thanh bộ lọc trên bảng: trạng thái, người, khoảng ngày, lọc nhanh, công tắc Bảng/Gantt
import { useTranslation } from 'react-i18next';
import { DISPLAYS } from '../../core/model.ts';
import type { Display, Level } from '../../core/model.ts';
import { NONE_OPT, NONE_PERSON, isFilterEmpty } from '../../core/search.ts';
import { DEFAULT_HIDDEN, useApp } from '../../store/app.ts';
import { optLabel, placeIcon, useOpts } from '../../lib/opts.ts';
import { MultiPick } from '../Common/MultiPick.tsx';
import { gridCols } from './SmartGrid.tsx';
import type { ViewMode } from '../../store/app.ts';
import { useIsMobile } from '../../lib/hooks.ts';
import { STATUS_KEY } from '../../lib/labels.ts';
import { Segmented } from '../Common/bits.tsx';
import { IColumns, IGantt, ITable, IX } from '../Common/Icons.tsx';

export function FilterBar({ level, count, total }: { level: Level; count: number; total: number }) {
  const { t } = useTranslation();
  const f = useApp((s) => s.filters[level]);
  const query = useApp((s) => s.query);
  const people = useApp((s) => s.data.people);
  const setFilter = useApp((s) => s.setFilter);
  const clear = useApp((s) => s.clearFilter);
  const mode = useApp((s) => s.modes[level]);
  const setMode = useApp((s) => s.setMode);
  const mobile = useIsMobile();
  const statuses = level === 'ngay' ? DISPLAYS.filter((d) => d !== 'Quá hạn') : DISPLAYS;
  const empty = isFilterEmpty(f) && !query;
  const cats = useOpts('cats');
  const places = useOpts('places');
  const hiddenCols = useApp((s) => s.settings.hiddenCols);
  const setSettings = useApp((s) => s.setSettings);
  const cols = gridCols(level, t);
  const hidden = hiddenCols?.[level] ?? DEFAULT_HIDDEN[level];
  const optItems = (list: typeof cats, kind: 'cats' | 'places') => [
    ...list
      .filter((o) => !o.hidden || (f[kind] ?? []).includes(o.id))
      .map((o) => {
        const Icon = kind === 'places' ? placeIcon(o.id) : null;
        return {
          value: o.id,
          label: (
            <span className="opt-chip" style={{ ['--oc' as string]: o.color }}>
              {Icon ? <Icon size={13} /> : <span className="opt-dot" />}
              {optLabel(o)}
            </span>
          )
        };
      }),
    { value: NONE_OPT, label: <span className="dim">{t(kind === 'cats' ? 'opt.noneCat' : 'opt.nonePlace')}</span> }
  ];

  return (
    <div className="filterbar">
      <div className="fb-fields">
        <select aria-label={t('filter.status')} value={f.status ?? ''} onChange={(e) => setFilter(level, { status: e.target.value as Display | '' })}>
          <option value="">{t('filter.allStatus')}</option>
          {statuses.map((s) => (
            <option key={s} value={s}>
              {t(`status.${STATUS_KEY[s]}`)}
            </option>
          ))}
        </select>
        <select aria-label={t('filter.person')} value={f.personId ?? ''} onChange={(e) => setFilter(level, { personId: e.target.value || undefined })}>
          <option value="">{t('filter.allPeople')}</option>
          <option value={NONE_PERSON}>{t('person.unassigned')}</option>
          {people.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <MultiPick label={t('col.cat')} items={optItems(cats, 'cats')} value={f.cats ?? []} onChange={(v) => setFilter(level, { cats: v.length ? v : undefined })} />
        {level === 'ngay' && (
          <MultiPick label={t('col.place')} items={optItems(places, 'places')} value={f.places ?? []} onChange={(v) => setFilter(level, { places: v.length ? v : undefined })} />
        )}
        {!mobile && (
          <span className="fb-range">
            <input type="date" aria-label={t('filter.from')} value={f.from ?? ''} onChange={(e) => setFilter(level, { from: e.target.value || undefined })} />
            <span aria-hidden>→</span>
            <input type="date" aria-label={t('filter.to')} value={f.to ?? ''} min={f.from} onChange={(e) => setFilter(level, { to: e.target.value || undefined })} />
          </span>
        )}
        {f.quick && (
          <span className="quick-chip">
            {t(`quick.${f.quick}`)}
            <button aria-label={t('common.clear')} onClick={() => setFilter(level, { quick: null })}>
              <IX size={12} />
            </button>
          </span>
        )}
        {query && <span className="quick-chip dim">{`“${query}”`}</span>}
        {!empty && (
          <button className="btn btn-sm btn-ghost" onClick={() => clear(level)}>
            {t('filter.clear')}
          </button>
        )}
        <span className="fb-count">{count === total ? t('filter.count', { n: total }) : t('filter.countOf', { n: count, total })}</span>
      </div>
      <span className="fb-right">
      {!mobile && mode === 'table' && (
        <MultiPick
          label={t('filter.columns')}
          icon={<IColumns size={15} />}
          align="right"
          showCount={false}
          resetLabel={t('filter.showAllCols')}
          items={cols.map((c) => ({ value: c.key, label: c.label, disabled: c.fixed }))}
          value={cols.filter((c) => c.fixed || !hidden.includes(c.key)).map((c) => c.key)}
          onChange={(v) =>
            setSettings({ hiddenCols: { ...(hiddenCols ?? {}), [level]: v.length ? cols.filter((c) => !c.fixed && !v.includes(c.key)).map((c) => c.key) : [] } })
          }
        />
      )}
      <Segmented<ViewMode>
        label={t('filter.view')}
        value={mode}
        onChange={(m) => setMode(level, m)}
        options={[
          { value: 'table', label: t('filter.table'), icon: <ITable size={14} /> },
          { value: 'chart', label: t('filter.gantt'), icon: <IGantt size={14} /> }
        ]}
      />
      </span>
    </div>
  );
}
