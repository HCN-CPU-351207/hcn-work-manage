// Nút mở danh sách tích chọn nhiều (bộ lọc Phân loại / Vị trí, chọn cột hiển thị)
import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { cx } from '../../lib/labels.ts';

export interface PickItem {
  value: string;
  label: ReactNode;
  disabled?: boolean;
}

export function MultiPick({
  label,
  icon,
  items,
  value,
  onChange,
  align,
  showCount = true,
  resetLabel
}: {
  label: string;
  icon?: ReactNode;
  items: PickItem[];
  value: string[];
  onChange: (v: string[]) => void;
  align?: 'right';
  showCount?: boolean;
  resetLabel?: string;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    const k = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', h);
    document.addEventListener('keydown', k, true);
    return () => {
      document.removeEventListener('mousedown', h);
      document.removeEventListener('keydown', k, true);
    };
  }, [open]);
  const on = showCount && value.length > 0;
  return (
    <div className="mpick" ref={ref}>
      <button type="button" className={cx('mpick-btn', on && 'on')} aria-expanded={open} aria-label={label} title={label} onClick={() => setOpen(!open)}>
        {icon}
        <span>{label}</span>
        {on && <span className="mpick-count">{value.length}</span>}
      </button>
      {open && (
        <div className={cx('mpick-pop', align === 'right' && 'right')} role="listbox" aria-multiselectable>
          {items.map((it) => (
            <label key={it.value} className={cx('mpick-item', it.disabled && 'disabled')}>
              <input
                type="checkbox"
                disabled={it.disabled}
                checked={value.includes(it.value)}
                onChange={() => onChange(value.includes(it.value) ? value.filter((x) => x !== it.value) : [...value, it.value])}
              />
              {it.label}
            </label>
          ))}
          {value.length > 0 && (
            <div className="mpick-foot">
              <button type="button" className="link-btn" onClick={() => onChange([])}>
                {resetLabel ?? t('filter.clearPick')}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
