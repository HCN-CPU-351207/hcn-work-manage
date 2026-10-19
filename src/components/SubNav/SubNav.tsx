// Sub-Nav: Segmented control với "viên" trượt + Saved Views (Module 3, mục 2)
import { useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Tab } from '../../core/model.ts';
import { isFilterEmpty } from '../../core/search.ts';
import { useApp } from '../../store/app.ts';
import { cx } from '../../lib/labels.ts';
import { IBookmark, IPlus, IX } from '../Common/Icons.tsx';

const TABS: Tab[] = ['overview', 'thang', 'tuan', 'ngay'];

export function SubNav() {
  return (
    <nav className="subnav">
      <SegmentedTabs />
      <SavedViews />
    </nav>
  );
}

function SegmentedTabs() {
  const { t } = useTranslation();
  const tab = useApp((s) => s.tab);
  const setTab = useApp((s) => s.setTab);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const [pill, setPill] = useState({ x: 0, w: 0 });
  const lang = useApp((s) => s.settings.language);

  useLayoutEffect(() => {
    const measure = () => {
      const el = refs.current[TABS.indexOf(tab)];
      if (el) setPill({ x: el.offsetLeft, w: el.offsetWidth });
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [tab, lang]);

  return (
    <div className="seg" role="tablist" aria-label={t('tabs.label')}>
      <span className="seg-pill" style={{ transform: `translateX(${pill.x}px)`, width: pill.w }} aria-hidden />
      {TABS.map((k, i) => (
        <button
          key={k}
          ref={(el) => {
            refs.current[i] = el;
          }}
          role="tab"
          aria-selected={tab === k}
          className={cx('seg-btn', tab === k && 'on')}
          onClick={() => setTab(k)}
          title={`${t(`tabs.${k}`)} (${i + 1})`}
        >
          {t(`tabs.${k}`)}
        </button>
      ))}
    </div>
  );
}

function SavedViews() {
  const { t } = useTranslation();
  const views = useApp((s) => s.settings.savedViews);
  const tab = useApp((s) => s.tab);
  const query = useApp((s) => s.query);
  const filters = useApp((s) => s.filters);
  const applyView = useApp((s) => s.applyView);
  const saveView = useApp((s) => s.saveView);
  const removeView = useApp((s) => s.removeView);
  const toast = useApp((s) => s.toast);
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState('');
  const canSave = tab !== 'overview' && (!isFilterEmpty(filters[tab]) || !!query);

  const commit = () => {
    const n = name.trim();
    if (!n) return;
    saveView(n);
    toast(t('views.saved', { name: n }), 'ok');
    setName('');
    setNaming(false);
  };

  return (
    <div className="views">
      {views.map((v) => (
        <span key={v.id} className="view-chip">
          <button className="view-apply" onClick={() => applyView(v)} title={t(`tabs.${v.tab}`)}>
            <IBookmark size={12} />
            {v.name}
          </button>
          <button className="view-x" aria-label={t('views.remove', { name: v.name })} onClick={() => removeView(v.id)}>
            <IX size={12} />
          </button>
        </span>
      ))}
      {naming ? (
        <span className="view-new">
          <input
            autoFocus
            value={name}
            placeholder={t('views.namePlaceholder')}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commit();
              if (e.key === 'Escape') {
                e.stopPropagation();
                setNaming(false);
              }
            }}
            onBlur={() => !name.trim() && setNaming(false)}
          />
          <button className="btn btn-sm btn-primary" onMouseDown={(e) => e.preventDefault()} onClick={commit}>
            {t('common.save')}
          </button>
        </span>
      ) : (
        <button className="view-add" disabled={!canSave} title={canSave ? undefined : t('views.needFilter')} onClick={() => setNaming(true)}>
          <IPlus size={12} />
          {t('views.add')}
        </button>
      )}
    </div>
  );
}
