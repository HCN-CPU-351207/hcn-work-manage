// Cài đặt > Danh mục: tự thêm / đổi tên / đổi màu / ẩn / xóa mục Phân loại và Vị trí (dùng chung giữa các máy)
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DEFAULT_CATS, DEFAULT_PLACES } from '../../core/model.ts';
import type { Data, Opt, OptKind } from '../../core/model.ts';
import { newId } from '../../core/ids.ts';
import { useApp } from '../../store/app.ts';
import { OPT_COLORS, optLabel, placeIcon, useOpts } from '../../lib/opts.ts';
import { cx } from '../../lib/labels.ts';
import { IPlus, ITrash } from '../Common/Icons.tsx';

function usageOf(d: Data, kind: OptKind, id: string): number {
  if (kind === 'places') return d.ngay.filter((x) => x.place === id).length;
  return d.thang.filter((x) => x.cat === id).length + d.tuan.filter((x) => x.cat === id).length + d.ngay.filter((x) => x.cat === id).length;
}

export function ListsSection() {
  return (
    <>
      <OptList kind="cats" />
      <OptList kind="places" />
    </>
  );
}

function OptList({ kind }: { kind: OptKind }) {
  const { t } = useTranslation();
  const list = useOpts(kind);
  const data = useApp((s) => s.data);
  const setOpts = useApp((s) => s.setOpts);
  const askConfirm = useApp((s) => s.askConfirm);
  const toast = useApp((s) => s.toast);
  const [name, setName] = useState('');
  const defaults = kind === 'cats' ? DEFAULT_CATS : DEFAULT_PLACES;
  const missing = defaults.filter((d) => !list.some((o) => o.id === d.id));

  const save = (next: Opt[]) => setOpts(kind, next);
  const patch = (id: string, v: Partial<Opt>) => save(list.map((o) => (o.id === id ? { ...o, ...v } : o)));
  const add = () => {
    const n = name.trim();
    if (!n) return;
    if (list.some((o) => optLabel(o).toLowerCase() === n.toLowerCase())) {
      toast(t('lists.duplicate'), 'error');
      return;
    }
    save([...list, { id: newId(kind === 'cats' ? 'c' : 'pl'), name: n.slice(0, 60), color: OPT_COLORS[list.length % OPT_COLORS.length] }]);
    setName('');
  };
  const del = (o: Opt) => {
    const n = usageOf(data, kind, o.id);
    const run = () => save(list.filter((x) => x.id !== o.id));
    if (!n) run();
    else
      askConfirm({
        title: t('lists.deleteTitle'),
        message: t('lists.deleteUsed', { name: optLabel(o), n }),
        confirmLabel: t('lists.delete'),
        danger: true,
        onConfirm: run
      });
  };

  return (
    <div className="set-block">
      <h4>{t(kind === 'cats' ? 'col.cat' : 'col.place')}</h4>
      <p className="set-hint">{t(kind === 'cats' ? 'lists.catsHint' : 'lists.placesHint')}</p>
      <div className="people-add">
        <input value={name} placeholder={t('lists.newPh')} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} aria-label={t('lists.name')} />
        <button className="btn btn-primary" onClick={add} disabled={!name.trim()}>
          <IPlus size={14} />
          {t('lists.add')}
        </button>
      </div>
      <ul className="people-list opt-list">
        {list.map((o) => {
          const Icon = kind === 'places' ? placeIcon(o.id) : null;
          const n = usageOf(data, kind, o.id);
          return (
            <li key={o.id} className={cx('person-row', o.hidden && 'opt-hidden')}>
              <span className="opt-swatch" style={{ ['--oc' as string]: o.color }}>
                {Icon ? <Icon size={16} /> : <span className="opt-dot" />}
              </span>
              <input
                className="person-name"
                value={o.name}
                placeholder={optLabel({ ...o, name: '' })}
                aria-label={t('lists.name')}
                maxLength={60}
                onChange={(e) => patch(o.id, { name: e.target.value })}
              />
              <label className="color-pick" title={t('people.color')}>
                <input type="color" value={o.color} onChange={(e) => patch(o.id, { color: e.target.value })} aria-label={t('people.color')} />
              </label>
              <button className="btn btn-sm btn-ghost" title={t('lists.hideHint')} onClick={() => patch(o.id, { hidden: !o.hidden || undefined })}>
                {o.hidden ? t('lists.show') : t('lists.hide')}
              </button>
              <span className="person-count">{t('people.tasks', { n })}</span>
              <button className="icon-btn sm qa-del" aria-label={t('lists.delete')} title={t('lists.delete')} onClick={() => del(o)}>
                <ITrash size={14} />
              </button>
            </li>
          );
        })}
      </ul>
      {missing.length > 0 && (
        <button className="btn btn-sm" onClick={() => save([...list, ...missing])}>
          {t('lists.restore', { n: missing.length })}
        </button>
      )}
    </div>
  );
}
