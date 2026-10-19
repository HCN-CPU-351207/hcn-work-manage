// Thanh bộ lọc trên bảng: trạng thái, người, khoảng ngày, lọc nhanh, công tắc Bảng/Gantt
import { useTranslation } from 'react-i18next';
import { DISPLAYS } from '../../core/model.ts';
import type { Display, Level } from '../../core/model.ts';
import { NONE_PERSON, isFilterEmpty } from '../../core/search.ts';
import { useApp } from '../../store/app.ts';
import type { ViewMode } from '../../store/app.ts';
import { useIsMobile } from '../../lib/hooks.ts';
import { STATUS_KEY } from '../../lib/labels.ts';
import { Segmented } from '../Common/bits.tsx';
import { IGantt, ITable, IX } from '../Common/Icons.tsx';

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
      <Segmented<ViewMode>
        label={t('filter.view')}
        value={mode}
        onChange={(m) => setMode(level, m)}
        options={[
          { value: 'table', label: t('filter.table'), icon: <ITable size={14} /> },
          { value: 'chart', label: t('filter.gantt'), icon: <IGantt size={14} /> }
        ]}
      />
    </div>
  );
}
