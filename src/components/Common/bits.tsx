// Thành phần nhỏ dùng chung: Avatar, chip trạng thái, thanh tiến độ mini, đồng hồ đang chạy
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import type { Display, Person } from '../../core/model.ts';
import { elapsedSeconds, formatClock } from '../../core/time.ts';
import { useNow } from '../../lib/hooks.ts';
import { STATUS_KEY, cx } from '../../lib/labels.ts';
import { ILock } from './Icons.tsx';

export function Avatar({ person, size = 24 }: { person: Person | null | undefined; size?: number }) {
  const { t } = useTranslation();
  const name = person?.name ?? t('person.unassigned');
  const style = { width: size, height: size, fontSize: Math.round(size * 0.46) };
  if (person?.photo) return <img className="avatar" src={person.photo} alt={name} title={name} style={style} />;
  const initial = person ? person.name.trim().split(/\s+/).pop()?.charAt(0).toUpperCase() ?? '?' : '–';
  return (
    <span className={cx('avatar', !person && 'avatar-none')} title={name} style={{ ...style, background: person?.color }}>
      {initial}
    </span>
  );
}

export function StatusChip({ value, locked }: { value: Display; locked?: boolean }) {
  const { t } = useTranslation();
  const key = STATUS_KEY[value];
  return (
    <span className={cx('chip', `chip-${key}`)} title={locked ? t('grid.autoStatus') : undefined}>
      {t(`status.${key}`)}
      {locked && <ILock size={11} className="chip-lock" />}
    </span>
  );
}

export function MiniProgress({ value }: { value: number }) {
  const p = Math.round(value * 100);
  return (
    <span className="mini-progress">
      <span className="mini-track">
        <span className="mini-fill" style={{ width: `${p}%` }} />
      </span>
      <span className="mini-label">{p}%</span>
    </span>
  );
}

/** Đồng hồ hh:mm:ss tăng theo thời gian thực (mục 6.5) */
export function LiveClock({ since, className }: { since: string; className?: string }) {
  const now = useNow(1000);
  return <span className={cx('live-clock', className)}>{formatClock(elapsedSeconds(since, now))}</span>;
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label
}: {
  value: T;
  options: { value: T; label: string; icon?: ReactElement }[];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div className="seg-small" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} role="radio" aria-checked={o.value === value} className={cx(o.value === value && 'on')} onClick={() => onChange(o.value)}>
          {o.icon}
          <span>{o.label}</span>
        </button>
      ))}
    </div>
  );
}

/** "☑ 3/5" + thanh nhỏ: tiến độ checklist của CV Ngày */
export function CkChip({ done, total }: { done: number; total: number }) {
  const full = total > 0 && done === total;
  return (
    <span className={full ? 'ck-chip full' : 'ck-chip'} title={`Checklist ${done}/${total}`}>
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <rect x="3" y="3" width="18" height="18" rx="4" />
        <path d="m8 12 3 3 5-6" />
      </svg>
      {done}/{total}
      <i>
        <b style={{ width: `${total ? (done / total) * 100 : 0}%` }} />
      </i>
    </span>
  );
}
