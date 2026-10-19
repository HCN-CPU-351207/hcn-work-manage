// Bulk Action Bar (mục 8.6.5): hiện khi chọn ≥ 2 dòng, trượt từ đáy (250 ms)
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { STATUSES } from '../../core/model.ts';
import type { Level, Status } from '../../core/model.ts';
import { useApp } from '../../store/app.ts';
import { confirmDelete, exportSelected } from '../../lib/flows.ts';
import { STATUS_KEY, cx } from '../../lib/labels.ts';
import { IX } from '../Common/Icons.tsx';

const NONE: string[] = [];

export function FloatingBulkBar() {
  const { t } = useTranslation();
  const tab = useApp((s) => s.tab);
  const level: Level | null = tab === 'overview' ? null : tab;
  const selected = useApp((s) => (level ? s.selected[level] : NONE));
  const data = useApp((s) => s.data);
  const people = data.people;
  const setSelection = useApp((s) => s.setSelection);
  const bulkStatus = useApp((s) => s.bulkStatus);
  const bulkPerson = useApp((s) => s.bulkPerson);
  const toast = useApp((s) => s.toast);
  const [menu, setMenu] = useState<'status' | 'person' | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  // chỉ đếm các id còn tồn tại
  const pool = level === 'thang' ? data.thang : level === 'tuan' ? data.tuan : data.ngay;
  const ids = selected.filter((id) => pool.some((x) => x.id === id));
  const show = !!level && ids.length >= 2;

  useEffect(() => {
    if (!menu) return;
    const h = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setMenu(null);
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [menu]);
  useEffect(() => {
    if (!show) setMenu(null);
  }, [show]);

  return (
    <div ref={ref} className={cx('bulkbar', show && 'show')} role="toolbar" aria-label={t('bulk.label')} aria-hidden={!show}>
      <span className="bulk-count">{t('bulk.selected', { n: ids.length })}</span>
      <div className="bulk-menu-wrap">
        <button className="btn btn-sm" tabIndex={show ? 0 : -1} onClick={() => setMenu(menu === 'status' ? null : 'status')} aria-expanded={menu === 'status'}>
          {t('bulk.status')}
        </button>
        {menu === 'status' && (
          <div className="bulk-menu" role="menu">
            {STATUSES.map((s) => (
              <button
                key={s}
                role="menuitem"
                className="drop-item"
                onClick={() => {
                  setMenu(null);
                  const skipped = bulkStatus(level!, ids, s as Status);
                  toast(skipped ? t('bulk.skipped', { n: skipped }) : t('bulk.statusDone', { n: ids.length }), skipped ? 'info' : 'ok');
                }}
              >
                {t(`status.${STATUS_KEY[s]}`)}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="bulk-menu-wrap">
        <button className="btn btn-sm" tabIndex={show ? 0 : -1} onClick={() => setMenu(menu === 'person' ? null : 'person')} aria-expanded={menu === 'person'}>
          {t('bulk.assign')}
        </button>
        {menu === 'person' && (
          <div className="bulk-menu" role="menu">
            <button role="menuitem" className="drop-item" onClick={() => { setMenu(null); bulkPerson(level!, ids, null); toast(t('bulk.assigned', { n: ids.length }), 'ok'); }}>
              {t('person.unassigned')}
            </button>
            {people.map((p) => (
              <button key={p.id} role="menuitem" className="drop-item" onClick={() => { setMenu(null); bulkPerson(level!, ids, p.id); toast(t('bulk.assigned', { n: ids.length }), 'ok'); }}>
                <span className="dot" style={{ background: p.color }} />
                {p.name}
              </button>
            ))}
          </div>
        )}
      </div>
      <button className="btn btn-sm" tabIndex={show ? 0 : -1} onClick={() => level && void exportSelected(level, ids)}>
        {t('bulk.export')}
      </button>
      <button className="btn btn-sm btn-danger" tabIndex={show ? 0 : -1} onClick={() => level && confirmDelete(level, ids)}>
        {t('bulk.delete')}
      </button>
      <button className="icon-btn sm" tabIndex={show ? 0 : -1} aria-label={t('bulk.clear')} title={t('bulk.clear')} onClick={() => level && setSelection(level, [])}>
        <IX size={14} />
      </button>
    </div>
  );
}
