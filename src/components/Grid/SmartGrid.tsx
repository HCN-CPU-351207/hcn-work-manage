// Smart Data Grid (mục 8.6): header sticky, chip trạng thái, tiến độ mini, sửa trực tiếp,
// cột thao tác nhanh ghim phải, chọn nhiều dòng.
import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { runningDays } from '../../core/actions.ts';
import { STATUSES } from '../../core/model.ts';
import type { Level, Status } from '../../core/model.ts';
import { actualMinutes, diffLabel, diffMinutes, diffTone, plannedMinutes } from '../../core/time.ts';
import { DEFAULT_HIDDEN, useApp } from '../../store/app.ts';
import { applyColFilters } from '../../core/colFilter.ts';
import { useColValue } from '../../lib/colValues.ts';
import { ColFilterButton } from './ColumnFilter.tsx';
import { optMap, useOpts } from '../../lib/opts.ts';
import { CatChip, PlaceChip } from '../Common/OptChip.tsx';
import { confirmDelete, quickAction, setStatusInline } from '../../lib/flows.ts';
import { fmtDay, hhmm } from '../../lib/fmt.ts';
import { useIsTablet } from '../../lib/hooks.ts';
import { LOAI_KEY, STATUS_KEY, cx } from '../../lib/labels.ts';
import type { NgayRow, Row, ThangRow, TuanRow } from '../../lib/rows.ts';
import { Avatar, LiveClock, MiniProgress, StatusChip } from '../Common/bits.tsx';
import { IEdit, IPlay, IReset, IStop, ITrash, IWarn } from '../Common/Icons.tsx';

export function useRowHighlight(level: Level) {
  const hl = useApp((s) => s.highlight);
  const nonce = useApp((s) => s.scrollNonce);
  const [active, setActive] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!hl || hl.level !== level) return;
    setActive(hl.id);
    const raf = requestAnimationFrame(() => {
      const el = containerRef.current?.querySelector<HTMLElement>(`[data-id="${CSS.escape(hl.id)}"]`);
      el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    });
    const tm = window.setTimeout(() => setActive(null), 2000);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(tm);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nonce]);
  return { active, containerRef };
}

export interface GridCol {
  key: string;
  label: string;
  cls?: string;
  /** cột bắt buộc, không ẩn được */
  fixed?: boolean;
}
type T = (k: string) => string;
export function gridCols(level: Level, t: T): GridCol[] {
  const ma = { key: 'ma', label: t('col.ma'), fixed: true };
  const cat = { key: 'cat', label: t('col.cat'), cls: 'col-cat' };
  const tail = [
    { key: 'person', label: t('col.person') }, { key: 'bd', label: t('col.planStart') }, { key: 'dl', label: t('col.planDeadline') },
    { key: 'as', label: t('col.actualStart') }, { key: 'ae', label: t('col.actualEnd') }, { key: 'st', label: t('col.status') },
    { key: 'pg', label: t('col.progress'), cls: 'col-progress' }, { key: 'gc', label: t('col.note'), cls: 'col-note' }
  ];
  if (level === 'thang')
    return [ma, { key: 'loai', label: t('col.loai'), cls: 'col-loai' }, cat, { key: 'task', label: t('col.task'), cls: 'col-task', fixed: true }, ...tail];
  if (level === 'tuan') return [ma, { key: 'parent', label: t('col.parentThang') }, cat, { key: 'task', label: t('col.task'), cls: 'col-task', fixed: true }, ...tail];
  return [
    ma, { key: 'parent', label: t('col.parentTuan') }, { key: 'task', label: t('col.content'), cls: 'col-task', fixed: true },
    cat, { key: 'place', label: t('col.place'), cls: 'col-place' },
    { key: 'person', label: t('col.person') }, { key: 'gdk', label: t('col.planTime') }, { key: 'gtt', label: t('col.actualTime') },
    { key: 'st', label: t('col.status') }, { key: 'gc', label: t('col.note'), cls: 'col-note' }
  ];
}

export function SmartGrid({ level, rows, pool, today, emptyText }: { level: Level; rows: Row[]; pool?: Row[]; today: string; emptyText: ReactNode }) {
  const { t } = useTranslation();
  const tablet = useIsTablet();
  const selected = useApp((s) => s.selected[level]);
  const setSelection = useApp((s) => s.setSelection);
  const { active, containerRef } = useRowHighlight(level);
  const ids = rows.map((r) => r.id);
  const allOn = rows.length > 0 && ids.every((id) => selected.includes(id));
  const someOn = !allOn && ids.some((id) => selected.includes(id));

  const cols = gridCols(level, t);
  const val = useColValue();
  const f = useApp((st) => st.filters[level]);
  /** danh sách giá trị của mỗi cột tính trên các dòng đã qua bộ lọc khác (giống Excel) */
  const poolFor = (col: string) => applyColFilters(pool ?? rows, f.cols, val, col);
  const hidden = useApp((st) => st.settings.hiddenCols?.[level] ?? DEFAULT_HIDDEN[level]);
  const visible = cols.filter((c) => !hidden.includes(c.key) && !(tablet && (c.key === 'gc' || c.key === 'pg')));

  return (
    <div className="grid-wrap" ref={containerRef}>
      <table className="data-grid">
        <thead>
          <tr>
            <th className="col-check">
              <input
                type="checkbox"
                aria-label={t('grid.selectAll')}
                checked={allOn}
                ref={(el) => {
                  if (el) el.indeterminate = someOn;
                }}
                onChange={() => setSelection(level, allOn ? selected.filter((x) => !ids.includes(x)) : Array.from(new Set([...selected, ...ids])))}
              />
            </th>
            {visible.map((c) => (
              <th key={c.key} className={cx(c.cls, 'th-f', (f.cols?.[c.key] || f.sort?.key === c.key) && 'th-on')}>
                <span className="th-in">
                  <span className="th-label">{c.label}</span>
                  <ColFilterButton level={level} col={c.key} label={c.label} pool={poolFor(c.key)} val={val} />
                </span>
              </th>
            ))}
            <th className="col-actions" aria-label={t('grid.actions')} />
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr className="grid-empty-row">
              <td colSpan={visible.length + 2}>{emptyText}</td>
            </tr>
          )}
          {rows.map((r) => (
            <GridRow key={r.id} row={r} today={today} visible={visible.map((c) => c.key)} hl={active === r.id} checked={selected.includes(r.id)} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function GridRow({ row, today, visible, hl, checked }: { row: Row; today: string; visible: string[]; hl: boolean; checked: boolean }) {
  const { t } = useTranslation();
  const lang = useApp((s) => s.settings.language);
  const toggle = useApp((s) => s.toggleSelect);
  const openDrawer = useApp((s) => s.openDrawer);
  const openPanel = useApp((s) => s.openPanel);
  const active = useApp((s) => s.panel?.id === row.id);
  const year = today.slice(0, 4);
  const d = (s: string | null) => fmtDay(s, lang, year);
  const cats = optMap(useOpts('cats'));
  const places = optMap(useOpts('places'));

  const cell = (key: string): ReactNode => {
    switch (key) {
      case 'ma':
        return <span className="code-tag">{row.ma}</span>;
      case 'loai':
        return row.level === 'thang' ? <span className={cx('loai', `loai-${LOAI_KEY[row.item.loai]}`)}>{t(`loai.${LOAI_KEY[row.item.loai]}`)}</span> : null;
      case 'cat':
        return <CatChip opt={row.item.cat ? cats.get(row.item.cat) : undefined} />;
      case 'place':
        return row.level === 'ngay' ? <PlaceChip opt={row.item.place ? places.get(row.item.place) : undefined} note={row.item.placeNote} /> : null;
      case 'parent':
        return row.level === 'tuan' ? (
          <span className="code-tag dim" title={(row as TuanRow).parentTen}>{row.item.parentMa}</span>
        ) : row.level === 'ngay' ? (
          <span className="code-tag dim">{(row as NgayRow).parentMa}</span>
        ) : null;
      case 'task':
        return <span className="cell-task">{row.ten || <em className="dim">{t('common.untitled')}</em>}</span>;
      case 'person':
        return (
          <span className="cell-person">
            <Avatar person={row.person} size={22} />
            <span>{row.person?.name ?? t('person.unassigned')}</span>
          </span>
        );
      case 'bd':
        return row.level !== 'ngay' ? d(row.item.bd) : null;
      case 'dl':
        return row.level !== 'ngay' ? <DeadlineCell row={row as ThangRow | TuanRow} label={d(row.item.dl)} /> : null;
      case 'as': {
        if (row.level === 'ngay') return null;
        const n = runningDays(row.item, today);
        return (
          <span className="cell-stack">
            <span>{d(row.actualStart)}</span>
            {n && <span className="running">{t('grid.runningDays', { n })}</span>}
          </span>
        );
      }
      case 'ae':
        return row.level !== 'ngay' ? d(row.actualEnd) : null;
      case 'st':
        return <StatusCell row={row} />;
      case 'pg':
        return row.progress !== null ? <MiniProgress value={row.progress} /> : null;
      case 'gc':
        return <span className="cell-note" title={row.level === 'ngay' ? row.item.gc : row.item.gc}>{row.item.gc}</span>;
      case 'gdk': {
        if (row.level !== 'ngay') return null;
        const n = row.item;
        return (
          <span className="cell-stack">
            <span className="dim small">{d(n.ngay)}</span>
            <span className="cell-time">
              {n.g1 && n.g2 ? `${n.g1}–${n.g2}` : <em className="dim">{t('timeline.unscheduled')}</em>}
              {(row as NgayRow).conflict && (
                <span className="conflict" title={t('tip.conflict')}>
                  <IWarn size={13} />
                </span>
              )}
            </span>
          </span>
        );
      }
      case 'gtt': {
        if (row.level !== 'ngay') return null;
        const n = row.item;
        if (!n.a1) return <span className="dim">—</span>;
        const diff = n.a2 ? diffMinutes(actualMinutes(n), plannedMinutes(n)) : null;
        return (
          <span className="cell-time">
            {hhmm(n.a1)}–{n.a2 ? hhmm(n.a2) : '…'}
            {diff !== null && diff !== 0 && <span className={cx('diff', `diff-${diffTone(diff)}`)}>{diffLabel(diff)}</span>}
          </span>
        );
      }
      default:
        return null;
    }
  };

  const cls: Record<string, string> = { task: 'col-task', pg: 'col-progress', gc: 'col-note', loai: 'col-loai', cat: 'col-cat', place: 'col-place' };
  return (
    <tr
      data-id={row.id}
      className={cx('grid-row', hl && 'row-hl', checked && 'row-checked', active && 'row-active', row.level !== 'ngay' && 'row-click')}
      onClick={(e) => {
        // CV Tháng / Tuần: bấm 1 lần mở Tổng quan dự án (bỏ qua ô tích, nút, ô sửa nhanh)
        if (row.level === 'ngay' || (e.target as HTMLElement).closest('input, button, select, a, [data-inline], .qa')) return;
        if (e.detail > 1) return;
        openPanel(active ? null : { level: row.level, id: row.id });
      }}
      onDoubleClick={(e) => {
        if ((e.target as HTMLElement).closest('[data-inline]')) return;
        openDrawer({ level: row.level, id: row.id });
      }}
    >
      <td className="col-check">
        <input type="checkbox" aria-label={t('grid.selectRow', { ma: row.ma })} checked={checked} onChange={() => toggle(row.level, row.id)} />
      </td>
      {visible.map((k) => (
        <td key={k} className={cls[k]}>
          {cell(k)}
        </td>
      ))}
      <td className="col-actions">
        <QuickActions row={row} today={today} />
      </td>
    </tr>
  );
}

/** Double-click → input date; Enter lưu, Esc hủy (mục 8.6.3) */
function DeadlineCell({ row, label }: { row: ThangRow | TuanRow; label: string }) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(row.item.dl ?? '');
  const update = useApp((s) => s.updateItem);
  const toast = useApp((s) => s.toast);
  const commit = () => {
    const v = val || null;
    if (v && row.item.bd && v < row.item.bd) {
      toast(t('form.errDeadline'), 'error');
      return;
    }
    if (v !== row.item.dl) update(row.level, row.id, { dl: v });
    setEditing(false);
  };
  if (editing)
    return (
      <input
        data-inline
        className="inline-input"
        type="date"
        autoFocus
        value={val}
        min={row.item.bd ?? undefined}
        onChange={(e) => setVal(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
          if (e.key === 'Escape') {
            e.stopPropagation();
            setVal(row.item.dl ?? '');
            setEditing(false);
          }
        }}
        onBlur={() => setEditing(false)}
      />
    );
  return (
    <span
      data-inline
      className={cx('inline-cell', row.display === 'Quá hạn' && 'txt-over')}
      title={t('grid.dblEdit')}
      onDoubleClick={() => {
        setVal(row.item.dl ?? '');
        setEditing(true);
      }}
    >
      {label || <span className="dim">—</span>}
    </span>
  );
}

/** Double-click → dropdown 3 trạng thái; khóa khi có việc con (mục 6.9) */
function StatusCell({ row }: { row: Row }) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const toast = useApp((s) => s.toast);
  if (editing && !row.locked) {
    const cur = row.level === 'ngay' ? row.item.tt : row.item.tt;
    return (
      <select
        data-inline
        className="inline-input"
        autoFocus
        value={cur}
        onChange={(e) => {
          setStatusInline(row.level, row.id, e.target.value as Status);
          setEditing(false);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.stopPropagation();
            setEditing(false);
          }
        }}
        onBlur={() => setEditing(false)}
      >
        {STATUSES.map((s) => (
          <option key={s} value={s}>
            {t(`status.${STATUS_KEY[s]}`)}
          </option>
        ))}
      </select>
    );
  }
  return (
    <span
      data-inline
      className="inline-cell"
      title={row.locked ? t('grid.autoStatus') : t('grid.dblEdit')}
      onDoubleClick={() => (row.locked ? toast(t('grid.autoStatus'), 'info') : setEditing(true))}
    >
      <StatusChip value={row.display} locked={row.locked} />
    </span>
  );
}

/** ▶ ■ ↺ ✎ 🗑 (mục 8.6.4) */
export function QuickActions({ row, today }: { row: Row; today: string }) {
  const { t } = useTranslation();
  const openDrawer = useApp((s) => s.openDrawer);
  const running = row.level === 'ngay' ? !!row.item.a1 && !row.item.a2 : !!row.item.bdtt && !row.item.kttt;
  const done = row.level === 'ngay' ? !!row.item.a2 : !!row.item.kttt;
  const clock =
    row.level === 'ngay' && running ? (
      row.item.ngay === today ? <LiveClock since={row.item.a1!} className="qa-clock" /> : <span className="qa-clock dim">{hhmm(row.item.a1)}</span>
    ) : null;
  return (
    <div className="qa-wrap">
    {clock}
    <div className="qa">
      {clock ? null : (
        <button className="icon-btn sm qa-start" title={t('qa.start')} aria-label={t('qa.start')} onClick={() => quickAction(row.level, row.id, 'start')} disabled={running && row.level !== 'ngay'}>
          <IPlay size={13} />
        </button>
      )}
      <button className="icon-btn sm qa-end" title={t('qa.end')} aria-label={t('qa.end')} onClick={() => quickAction(row.level, row.id, 'end')} disabled={done && !running}>
        <IStop size={13} />
      </button>
      <button className="icon-btn sm" title={t('qa.reset')} aria-label={t('qa.reset')} onClick={() => quickAction(row.level, row.id, 'reset')}>
        <IReset size={14} />
      </button>
      <button className="icon-btn sm" title={t('qa.edit')} aria-label={t('qa.edit')} onClick={() => openDrawer({ level: row.level, id: row.id })}>
        <IEdit size={14} />
      </button>
      <button className="icon-btn sm qa-del" title={t('qa.delete')} aria-label={t('qa.delete')} onClick={() => confirmDelete(row.level, [row.id])}>
        <ITrash size={14} />
      </button>
    </div>
    </div>
  );
}
