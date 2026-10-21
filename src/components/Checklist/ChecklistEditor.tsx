// Checklist của CV Ngày: tích (ghi giờ tích, sửa được), sửa chữ, ghi chú, xóa, kéo đổi thứ tự, thêm, mẫu.
// Chế độ "live": mọi thao tác lưu ngay vào việc (qua ckDo). Chế độ nháp (việc mới): chỉ soạn danh sách bước.
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { addCheck, applyTemplate, ckProgress, editCheck, moveCheck, removeCheck, saveTemplate, toggleCheck } from '../../core/checklist.ts';
import type { CheckItem, CkTemplate, Ngay } from '../../core/model.ts';
import { useApp } from '../../store/app.ts';
import { cx } from '../../lib/labels.ts';
import { ICheck, IGrip, IList, INote, IPlus, ITrash } from '../Common/Icons.tsx';

export type CkRun = (fn: (n: Ngay, now: string) => Ngay) => void;

const NO_TPLS: CkTemplate[] = [];

export function ChecklistEditor({ ck, run, disabled, draft, compact }: { ck: CheckItem[]; run: CkRun; disabled?: boolean; draft?: boolean; compact?: boolean }) {
  const { t } = useTranslation();
  const [text, setText] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [noteOpen, setNoteOpen] = useState<string | null>(null);
  const [timeEdit, setTimeEdit] = useState<string | null>(null);
  const [menu, setMenu] = useState(false);
  const [drag, setDrag] = useState<number | null>(null);
  const [over, setOver] = useState<number | null>(null);
  const tpls = useApp((s) => s.data.tpls) ?? NO_TPLS;
  const menuRef = useRef<HTMLDivElement>(null);
  const p = ckProgress({ ck });

  useEffect(() => {
    if (!menu) return;
    const off = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenu(false);
    };
    document.addEventListener('mousedown', off);
    return () => document.removeEventListener('mousedown', off);
  }, [menu]);

  const add = () => {
    const v = text.trim();
    if (!v) return;
    run((n) => addCheck(n, v));
    setText('');
  };
  const saveTpl = () => {
    setMenu(false);
    if (!ck.length) {
      useApp.getState().toast(t('ck.tplEmpty'), 'info');
      return;
    }
    useApp.getState().askConfirm({
      title: t('ck.saveTpl'),
      message: t('ck.saveTplMsg', { n: ck.length }),
      confirmLabel: t('common.save'),
      input: { label: t('ck.tplName'), placeholder: t('ck.tplNamePh') },
      onConfirm: (name) => {
        const st = useApp.getState();
        st.mutate((d) => saveTemplate(d, name || t('ck.tplDefault'), ck.map((c) => c.text)).data);
        st.toast(t('ck.tplSaved'), 'ok');
      }
    });
  };

  return (
    <section className={cx('ck', compact && 'ck-compact', disabled && 'is-disabled')}>
      <div className="ck-head">
        <span className="ck-title">
          <IList size={14} />
          {t('ck.title')}
        </span>
        {p.total > 0 && (
          <span className="ck-count">
            <span className="ck-bar">
              <b className={p.done === p.total ? 'full' : undefined} style={{ width: `${(p.done / p.total) * 100}%` }} />
            </span>
            {p.done}/{p.total}
          </span>
        )}
        <div className="ck-tpl" ref={menuRef}>
          <button type="button" className="btn btn-xs" disabled={disabled} onClick={() => setMenu((v) => !v)} aria-expanded={menu}>
            {t('ck.templates')} ▾
          </button>
          {menu && (
            <div className="ck-menu" role="menu">
              {tpls.length === 0 && <div className="ck-menu-empty">{t('ck.noTpl')}</div>}
              {tpls.map((x) => (
                <button
                  key={x.id}
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenu(false);
                    run((n) => applyTemplate(n, x));
                  }}
                >
                  <span>{x.name}</span>
                  <small>{t('ck.steps', { n: x.items.length })}</small>
                </button>
              ))}
              <hr />
              <button type="button" role="menuitem" onClick={saveTpl}>
                {t('ck.saveTpl')}
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenu(false);
                  useApp.getState().openSettings('lists');
                }}
              >
                {t('ck.manageTpl')}
              </button>
            </div>
          )}
        </div>
      </div>

      {ck.length === 0 && <p className="ck-empty">{t(draft ? 'ck.emptyDraft' : 'ck.empty')}</p>}
      <ul className="ck-list">
        {ck.map((c, i) => (
          <li
            key={c.id}
            className={cx('ck-item', c.done && 'done', over === i && drag !== null && drag !== i && 'drop')}
            draggable={!disabled && editing !== c.id}
            onDragStart={(e) => {
              setDrag(i);
              e.dataTransfer.effectAllowed = 'move';
            }}
            onDragOver={(e) => {
              if (drag === null) return;
              e.preventDefault();
              setOver(i);
            }}
            onDrop={(e) => {
              e.preventDefault();
              if (drag !== null && drag !== i) run((n) => moveCheck(n, drag, i));
              setDrag(null);
              setOver(null);
            }}
            onDragEnd={() => {
              setDrag(null);
              setOver(null);
            }}
          >
            <div className="ck-row">
              <span className="ck-grip" aria-hidden>
                <IGrip size={12} />
              </span>
              <button
                type="button"
                className={cx('ck-box', c.done && 'on')}
                role="checkbox"
                aria-checked={c.done}
                aria-label={c.text}
                disabled={disabled || draft}
                title={draft ? t('ck.tickAfterSave') : undefined}
                onClick={() => run((n, now) => toggleCheck(n, c.id, now))}
              >
                {c.done && <ICheck size={13} />}
              </button>
              {editing === c.id ? (
                <input
                  className="ck-edit"
                  autoFocus
                  defaultValue={c.text}
                  maxLength={300}
                  onBlur={(e) => {
                    const v = e.target.value.trim();
                    if (v && v !== c.text) run((n) => editCheck(n, c.id, { text: v }));
                    setEditing(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                    if (e.key === 'Escape') {
                      e.stopPropagation();
                      setEditing(null);
                    }
                  }}
                />
              ) : (
                <span className="ck-text" onClick={() => !disabled && setEditing(c.id)} title={disabled ? undefined : t('ck.clickEdit')}>
                  {c.text}
                </span>
              )}
              {c.done && c.at && (
                timeEdit === c.id ? (
                  <input
                    type="time"
                    className="ck-time-in"
                    autoFocus
                    defaultValue={c.at.slice(11, 16)}
                    onBlur={(e) => {
                      const v = e.target.value;
                      if (v && v !== c.at!.slice(11, 16)) run((n) => editCheck(n, c.id, { at: `${c.at!.slice(0, 10)}T${v}:00` }));
                      setTimeEdit(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                      if (e.key === 'Escape') {
                        e.stopPropagation();
                        setTimeEdit(null);
                      }
                    }}
                  />
                ) : (
                  <button type="button" className="ck-time" disabled={disabled} title={t('ck.editTime')} onClick={() => setTimeEdit(c.id)}>
                    {c.at.slice(11, 16)}
                  </button>
                )
              )}
              <button type="button" className={cx('icon-btn xs', (c.note || noteOpen === c.id) && 'on')} disabled={disabled} aria-label={t('ck.note')} title={t('ck.note')} onClick={() => setNoteOpen(noteOpen === c.id ? null : c.id)}>
                <INote size={13} />
              </button>
              <button type="button" className="icon-btn xs danger-text" disabled={disabled} aria-label={t('ck.del')} title={t('ck.del')} onClick={() => run((n) => removeCheck(n, c.id))}>
                <ITrash size={13} />
              </button>
            </div>
            {noteOpen === c.id ? (
              <input
                className="ck-note-in"
                autoFocus
                defaultValue={c.note ?? ''}
                maxLength={300}
                placeholder={t('ck.notePh')}
                onBlur={(e) => {
                  if (e.target.value.trim() !== (c.note ?? '')) run((n) => editCheck(n, c.id, { note: e.target.value }));
                  setNoteOpen(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                  if (e.key === 'Escape') {
                    e.stopPropagation();
                    setNoteOpen(null);
                  }
                }}
              />
            ) : (
              c.note && <div className="ck-note">{c.note}</div>
            )}
          </li>
        ))}
      </ul>
      {!disabled && (
        <div className="ck-add">
          <IPlus size={14} />
          <input
            value={text}
            maxLength={300}
            placeholder={t('ck.addPh')}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                e.stopPropagation();
                add();
              }
            }}
          />
          {text.trim() && (
            <button type="button" className="btn btn-xs btn-primary" onClick={add}>
              {t('ck.add')}
            </button>
          )}
        </div>
      )}
    </section>
  );
}
