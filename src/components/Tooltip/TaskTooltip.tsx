// Tooltip công việc (mục 8.5.6): hiện gần con trỏ, tự đổi vị trí để không tràn màn hình; ghim được.
import { useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useApp } from '../../store/app.ts';
import { cx } from '../../lib/labels.ts';
import { MiniProgress, StatusChip } from '../Common/bits.tsx';
import { IX } from '../Common/Icons.tsx';

export function TaskTooltip() {
  const { t } = useTranslation();
  const tip = useApp((s) => s.tip);
  const setTip = useApp((s) => s.setTip);
  const navigateTo = useApp((s) => s.navigateTo);
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: 0, top: 0 });

  useLayoutEffect(() => {
    if (!tip || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    const pad = 12;
    let left = tip.x + 14;
    let top = tip.y + 16;
    if (left + r.width > window.innerWidth - pad) left = tip.x - r.width - 14;
    if (top + r.height > window.innerHeight - pad) top = tip.y - r.height - 12;
    setPos({ left: Math.max(pad, left), top: Math.max(pad, top) });
  }, [tip]);

  if (!tip) return null;
  const d = tip.data;
  return (
    <div
      ref={ref}
      className={cx('tooltip', tip.pinned && 'pinned')}
      style={{ left: pos.left, top: pos.top }}
      role={tip.pinned ? 'dialog' : 'tooltip'}
      aria-label={d.ten}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="tt-head">
        <span className="code-tag">{d.ma}</span>
        <StatusChip value={d.display} />
        {tip.pinned && (
          <button className="icon-btn sm tt-x" aria-label={t('common.close')} onClick={() => setTip(null)}>
            <IX size={14} />
          </button>
        )}
      </div>
      <div className="tt-title">{d.ten || t('common.untitled')}</div>
      <dl className="tt-grid">
        <dt>{t('tip.plan')}</dt>
        <dd>{d.plan}</dd>
        <dt>{t('tip.actual')}</dt>
        <dd>{d.actual}</dd>
        <dt>{t('col.person')}</dt>
        <dd>{d.person}</dd>
        {d.progress !== null && (
          <>
            <dt>{t('col.progress')}</dt>
            <dd>
              <MiniProgress value={d.progress} />
            </dd>
          </>
        )}
      </dl>
      {d.extra && <div className="tt-extra">{d.extra}</div>}
      {tip.pinned ? (
        <button className="btn btn-sm tt-open" onClick={() => { setTip(null); navigateTo(d.level, d.id, true); }}>
          {t('tip.open')}
        </button>
      ) : (
        <div className="tt-hint">{t('tip.hint')}</div>
      )}
    </div>
  );
}
