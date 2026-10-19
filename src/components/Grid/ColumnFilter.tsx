// Hộp lọc theo cột kiểu Excel: sắp xếp, tìm, tích chọn giá trị (kèm số lượng), Chọn tất cả, OK / Hủy / Xóa lọc
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { distinctValues, setColFilter } from '../../core/colFilter.ts';
import type { ValueFn } from '../../core/colFilter.ts';
import type { Level } from '../../core/model.ts';
import { fold } from '../../core/search.ts';
import { useApp } from '../../store/app.ts';
import { cx } from '../../lib/labels.ts';
import type { Row } from '../../lib/rows.ts';

export function ColFilterButton({ level, col, label, pool, val }: { level: Level; col: string; label: string; pool: Row[]; val: ValueFn<Row> }) {
  const { t } = useTranslation();
  const f = useApp((s) => s.filters[level]);
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const filtered = !!f.cols?.[col];
  const sorted = f.sort?.key === col ? f.sort.dir : 0;
  return (
    <>
      <button
        ref={btn}
        type="button"
        className={cx('colf-btn', (filtered || sorted !== 0) && 'on', open && 'open')}
        aria-label={t('colf.open', { col: label })}
        title={t('colf.open', { col: label })}
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation();
          setOpen(!open);
        }}
      >
        {sorted === 1 ? '↑' : sorted === -1 ? '↓' : ''}
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          {filtered ? <path d="M3 5h18l-7 8v6l-4-2v-4Z" fill="currentColor" /> : <path d="m6 9 6 6 6-6" />}
        </svg>
      </button>
      {open && <ColFilterPop level={level} col={col} pool={pool} val={val} anchor={btn.current} onClose={() => setOpen(false)} />}
    </>
  );
}

function ColFilterPop({ level, col, pool, val, anchor, onClose }: { level: Level; col: string; pool: Row[]; val: ValueFn<Row>; anchor: HTMLElement | null; onClose: () => void }) {
  const { t } = useTranslation();
  const f = useApp((s) => s.filters[level]);
  const setFilter = useApp((s) => s.setFilter);
  const ref = useRef<HTMLDivElement>(null);
  const [q, setQ] = useState('');
  const values = useMemo(() => distinctValues(pool, col, val), [pool, col, val]);
  const allKeys = useMemo(() => values.map((v) => v.key), [values]);
  const cur = f.cols?.[col];
  const [sel, setSel] = useState<Set<string>>(() => new Set(cur ?? allKeys));
  const [pos, setPos] = useState<{ left: number; top: number }>({ left: 0, top: 0 });

  useLayoutEffect(() => {
    if (!anchor) return;
    const r = anchor.getBoundingClientRect();
    const w = 280;
    setPos({ left: Math.max(8, Math.min(window.innerWidth - w - 8, r.right - w + 8)), top: Math.min(r.bottom + 6, window.innerHeight - 200) });
  }, [anchor]);
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current?.contains(e.target as Node) || anchor?.contains(e.target as Node)) return;
      onClose();
    };
    const k = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('mousedown', h);
    document.addEventListener('keydown', k, true);
    return () => {
      document.removeEventListener('mousedown', h);
      document.removeEventListener('keydown', k, true);
    };
  }, [anchor, onClose]);

  const shown = q ? values.filter((v) => fold(v.label).includes(fold(q))) : values;
  const allOn = shown.length > 0 && shown.every((v) => sel.has(v.key));
  const someOn = !allOn && shown.some((v) => sel.has(v.key));
  const toggle = (k: string) => {
    const n = new Set(sel);
    if (n.has(k)) n.delete(k);
    else n.add(k);
    setSel(n);
  };
  const apply = () => {
    // đang tìm: như Excel, chỉ giữ các giá trị khớp ô tìm và đang được tích
    const keep = q ? shown.filter((v) => sel.has(v.key)).map((v) => v.key) : [...sel].filter((k) => allKeys.includes(k));
    setFilter(level, { cols: setColFilter(f.cols, col, keep, q ? [...allKeys, '\u0000'] : allKeys) });
    onClose();
  };
  const sortBy = (dir: 1 | -1) => {
    setFilter(level, { sort: f.sort?.key === col && f.sort.dir === dir ? undefined : { key: col, dir } });
    onClose();
  };

  return (
    <div
      ref={ref}
      className="colf-pop"
      role="dialog"
      aria-label={t('colf.title')}
      style={{ left: pos.left, top: pos.top }}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && (e.target as HTMLElement).tagName !== 'BUTTON') apply();
      }}
    >
      <div className="colf-sort">
        <button type="button" className={cx('colf-sbtn', f.sort?.key === col && f.sort.dir === 1 && 'on')} onClick={() => sortBy(1)}>
          ↑ {t('colf.asc')}
        </button>
        <button type="button" className={cx('colf-sbtn', f.sort?.key === col && f.sort.dir === -1 && 'on')} onClick={() => sortBy(-1)}>
          ↓ {t('colf.desc')}
        </button>
      </div>
      <input className="colf-q" autoFocus placeholder={t('colf.search')} value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="colf-list">
        <label className="colf-item all">
          <input
            type="checkbox"
            checked={allOn}
            ref={(el) => {
              if (el) el.indeterminate = someOn;
            }}
            onChange={() => {
              const n = new Set(sel);
              for (const v of shown) {
                if (allOn) n.delete(v.key);
                else n.add(v.key);
              }
              setSel(n);
            }}
          />
          <span>{q ? t('colf.allShown') : t('colf.all')}</span>
        </label>
        {shown.map((v) => (
          <label key={v.key} className="colf-item">
            <input type="checkbox" checked={sel.has(v.key)} onChange={() => toggle(v.key)} />
            <span className={cx('colf-label', v.key === '' && 'dim')}>{v.label}</span>
            <span className="colf-n">{v.count}</span>
          </label>
        ))}
        {shown.length === 0 && <div className="colf-none">{t('colf.none')}</div>}
      </div>
      <div className="colf-foot">
        <button
          type="button"
          className="link-btn"
          disabled={!cur}
          onClick={() => {
            setFilter(level, { cols: setColFilter(f.cols, col, null, allKeys) });
            onClose();
          }}
        >
          {t('colf.clear')}
        </button>
        <span className="sp" />
        <button type="button" className="btn btn-sm" onClick={onClose}>
          {t('common.cancel')}
        </button>
        <button type="button" className="btn btn-sm btn-primary" disabled={sel.size === 0 && !q} onClick={apply}>
          {t('colf.ok')}
        </button>
      </div>
    </div>
  );
}
