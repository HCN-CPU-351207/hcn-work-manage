// Mobile (< 768 px): bảng chuyển thành thẻ; vuốt phải = Hoàn thành, vuốt trái = lộ [Sửa] [Xóa] (mục 8.6.6)
import { useRef, useState } from 'react';
import type { PointerEvent as RPointerEvent, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { Level } from '../../core/model.ts';
import { useApp } from '../../store/app.ts';
import { confirmDelete, swipeComplete } from '../../lib/flows.ts';
import { fmtDay, hhmm } from '../../lib/fmt.ts';
import { cx } from '../../lib/labels.ts';
import type { Row } from '../../lib/rows.ts';
import { useRowHighlight } from '../Grid/SmartGrid.tsx';
import { Avatar, LiveClock, MiniProgress, StatusChip } from '../Common/bits.tsx';
import { ICheck, IEdit, ITrash } from '../Common/Icons.tsx';
import { CatChip, PlaceChip } from '../Common/OptChip.tsx';
import { optMap, useOpts } from '../../lib/opts.ts';

const THRESHOLD = 60;
const REVEAL = 172;

export function TaskCards({ level, rows, today, emptyText }: { level: Level; rows: Row[]; today: string; emptyText: ReactNode }) {
  const { active, containerRef } = useRowHighlight(level);
  return (
    <div className="cards" ref={containerRef}>
      {rows.length === 0 && <div className="cards-empty">{emptyText}</div>}
      {rows.map((r) => (
        <SwipeCard key={r.id} row={r} today={today} hl={active === r.id} />
      ))}
    </div>
  );
}

function SwipeCard({ row, today, hl }: { row: Row; today: string; hl: boolean }) {
  const { t } = useTranslation();
  const lang = useApp((s) => s.settings.language);
  const openDrawer = useApp((s) => s.openDrawer);
  const selected = useApp((s) => s.selected[row.level].includes(row.id));
  const toggle = useApp((s) => s.toggleSelect);
  const [dx, setDx] = useState(0);
  const [open, setOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const start = useRef<{ x: number; y: number; base: number; axis: 'x' | 'y' | null } | null>(null);
  const year = today.slice(0, 4);
  const d = (s: string | null) => fmtDay(s, lang, year);

  const onDown = (e: RPointerEvent) => {
    if ((e.target as HTMLElement).closest('button, input')) return;
    start.current = { x: e.clientX, y: e.clientY, base: open ? -REVEAL : 0, axis: null };
  };
  const onMove = (e: RPointerEvent) => {
    const s = start.current;
    if (!s) return;
    const mx = e.clientX - s.x;
    const my = e.clientY - s.y;
    if (!s.axis) {
      if (Math.abs(mx) < 8 && Math.abs(my) < 8) return;
      s.axis = Math.abs(mx) > Math.abs(my) ? 'x' : 'y';
      if (s.axis === 'x') {
        try {
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        } catch {
          /* một số thiết bị không hỗ trợ capture: vẫn vuốt được */
        }
      }
    }
    if (s.axis !== 'x') return;
    setDragging(true);
    setDx(Math.max(-REVEAL - 30, Math.min(110, s.base + mx)));
  };
  const onUp = () => {
    const s = start.current;
    start.current = null;
    setDragging(false);
    if (!s || s.axis !== 'x') return;
    if (dx > THRESHOLD) {
      swipeComplete(row.level, row.id);
      setOpen(false);
      setDx(0);
    } else if (dx < -THRESHOLD) {
      setOpen(true);
      setDx(-REVEAL);
    } else {
      setOpen(false);
      setDx(0); // quay về nếu chưa đủ ngưỡng
    }
  };

  const meta: ReactNode =
    row.level === 'ngay' ? (
      <>
        <span>{d(row.item.ngay)}</span>
        <span>{row.item.g1 && row.item.g2 ? `${row.item.g1}–${row.item.g2}` : t('timeline.unscheduled')}</span>
        {row.item.a1 && <span>{`${t('card.actual')} ${hhmm(row.item.a1)}–${row.item.a2 ? hhmm(row.item.a2) : '…'}`}</span>}
      </>
    ) : (
      <>
        <span>{`${t('card.plan')} ${d(row.item.bd) || '…'} → ${d(row.item.dl) || '…'}`}</span>
        {(row.actualStart || row.actualEnd) && <span>{`${t('card.actual')} ${d(row.actualStart) || '…'} → ${d(row.actualEnd) || '…'}`}</span>}
      </>
    );

  const cats = optMap(useOpts('cats'));
  const places = optMap(useOpts('places'));
  const cat = row.item.cat ? cats.get(row.item.cat) : undefined;
  const place = row.level === 'ngay' && row.item.place ? places.get(row.item.place) : undefined;
  const placeNote = row.level === 'ngay' ? row.item.placeNote : undefined;
  const running = row.level === 'ngay' && !!row.item.a1 && !row.item.a2 && row.item.ngay === today;

  return (
    <div data-id={row.id} className={cx('swipe', hl && 'row-hl')}>
      {dx > 0 && (
        <div className="swipe-under swipe-left" aria-hidden>
          <ICheck size={18} />
          {t('status.done')}
        </div>
      )}
      <div className="swipe-under swipe-right" style={{ visibility: dx < 0 ? 'visible' : 'hidden' }}>
        <button className="btn btn-sm" onClick={() => { setOpen(false); setDx(0); openDrawer({ level: row.level, id: row.id }); }}>
          <IEdit size={14} />
          {t('qa.edit')}
        </button>
        <button className="btn btn-sm btn-danger" onClick={() => { setOpen(false); setDx(0); confirmDelete(row.level, [row.id]); }}>
          <ITrash size={14} />
          {t('qa.delete')}
        </button>
      </div>
      <article
        className={cx('task-card', dragging && 'dragging', selected && 'row-checked')}
        style={{ transform: `translateX(${dx}px)` }}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onClick={() => !open && !dragging && Math.abs(dx) < 4 && openDrawer({ level: row.level, id: row.id })}
      >
        <div className="tc-top">
          <input type="checkbox" checked={selected} aria-label={t('grid.selectRow', { ma: row.ma })} onChange={() => toggle(row.level, row.id)} onClick={(e) => e.stopPropagation()} />
          <span className="code-tag">{row.ma}</span>
          <StatusChip value={row.display} locked={row.locked} />
          {running && <LiveClock since={row.item.a1!} className="qa-clock" />}
        </div>
        <div className="tc-title">{row.ten || t('common.untitled')}</div>
        <div className="tc-person">
          <Avatar person={row.person} size={20} />
          <span>{row.person?.name ?? t('person.unassigned')}</span>
          {row.progress !== null && <MiniProgress value={row.progress} />}
        </div>
        {(cat || place || placeNote) && (
          <div className="tc-tags">
            {cat && <CatChip opt={cat} />}
            {(place || placeNote) && <PlaceChip opt={place} note={placeNote} />}
          </div>
        )}
        <div className="tc-meta">{meta}</div>
      </article>
    </div>
  );
}
