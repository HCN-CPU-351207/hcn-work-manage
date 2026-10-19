// Thanh công việc dùng chung cho Gantt và Timeline (mục 8.5.2, 8.5.3)
// Cao 44 px, bo 6 px (không pill). Nội dung co giãn bằng CSS container query trên chính thanh.
import type { CSSProperties, MouseEvent, ReactNode } from 'react';
import type { Display, Person } from '../../core/model.ts';
import type { TipData } from '../../store/app.ts';
import { useBarEvents } from '../../lib/useBarEvents.ts';
import { STATUS_KEY, cx } from '../../lib/labels.ts';
import { Avatar } from '../Common/bits.tsx';
import { IWarn } from '../Common/Icons.tsx';

export function TaskBar({
  left,
  width,
  top,
  display,
  person,
  personLabel,
  title,
  code,
  tip,
  extra,
  warn,
  tone,
  ariaLabel,
  dim
}: {
  left: number;
  width: number;
  top?: number;
  display: Display;
  person: Person | undefined;
  personLabel: string;
  title: string;
  code: string;
  tip: () => TipData;
  extra?: ReactNode;
  warn?: boolean;
  tone?: 'good' | 'bad' | null;
  ariaLabel: string;
  dim?: boolean;
}) {
  const ev = useBarEvents(tip);
  const style: CSSProperties = { left, width: Math.max(44, width), top };
  return (
    <div
      className={cx('tb', `tb-${STATUS_KEY[display]}`, warn && 'tb-warn', tone && `tb-tone-${tone}`, dim && 'tb-dim')}
      style={style}
      role="button"
      tabIndex={0}
      aria-label={ariaLabel}
      data-code={code}
      onKeyDown={(e) => {
        if (e.key === 'Enter') ev.onDoubleClick(e as unknown as MouseEvent);
      }}
      {...ev}
    >
      <div className="tb-inner">
        <Avatar person={person} size={24} />
        <span className="tb-person">{personLabel}</span>
        <span className="tb-title">{title}</span>
        {extra}
        {warn && <IWarn size={14} className="tb-warn-icon" />}
      </div>
    </div>
  );
}
