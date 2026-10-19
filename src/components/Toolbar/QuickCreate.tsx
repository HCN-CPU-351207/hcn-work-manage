// [+ Tạo nhanh] - popover nhập liệu (BỔ SUNG, mục 8.2)
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Level } from '../../core/model.ts';
import { useApp } from '../../store/app.ts';
import { useToday } from '../../lib/hooks.ts';
import { cx } from '../../lib/labels.ts';
import { IPlus } from '../Common/Icons.tsx';

export function QuickCreate() {
  const { t } = useTranslation();
  const open = useApp((s) => s.quickOpen);
  const setOpen = useApp((s) => s.setQuickOpen);
  const tab = useApp((s) => s.tab);
  return (
    <div className="qc-wrap">
      <button className="btn-create" onClick={() => setOpen(!open)} aria-expanded={open} title={`${t('toolbar.quick')} (Ctrl+N)`}>
        <IPlus size={16} />
        <span className="btn-create-label">{t('toolbar.quick')}</span>
      </button>
      {open && <QuickPopover initialLevel={tab === 'overview' ? 'thang' : tab} onClose={() => setOpen(false)} />}
    </div>
  );
}

function QuickPopover({ initialLevel, onClose }: { initialLevel: Level; onClose: () => void }) {
  const { t } = useTranslation();
  const today = useToday();
  const data = useApp((s) => s.data);
  const me = useApp((s) => s.settings.currentPersonId);
  const dayDate = useApp((s) => s.dayDate);
  const st = useApp.getState;
  const [level, setLevel] = useState<Level>(initialLevel);
  const [ten, setTen] = useState('');
  const [personId, setPersonId] = useState<string>(me ?? '');
  const [personTouched, setPersonTouched] = useState(false);
  const [bd, setBd] = useState('');
  const [dl, setDl] = useState('');
  const [ngay, setNgay] = useState(dayDate || today);
  const [parentMa, setParentMa] = useState(data.thang[data.thang.length - 1]?.ma ?? '');
  const [parentId, setParentId] = useState(data.tuan[data.tuan.length - 1]?.id ?? '');
  const [err, setErr] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => nameRef.current?.focus(), [level]);
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      const el = e.target as HTMLElement;
      if (ref.current && !ref.current.contains(el) && !el.closest('.qc-wrap')) onClose();
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [onClose]);

  // CV Ngày: người mặc định lấy từ tuần cha (X13)
  useEffect(() => {
    if (level !== 'ngay' || personTouched) return;
    const p = data.tuan.find((w) => w.id === parentId)?.personId;
    setPersonId(p ?? me ?? '');
  }, [level, parentId, personTouched, data.tuan, me]);

  const tuanOptions = useMemo(() => [...data.tuan].sort((a, b) => b.ma.localeCompare(a.ma)), [data.tuan]);
  const thangOptions = useMemo(() => [...data.thang].sort((a, b) => b.ma.localeCompare(a.ma)), [data.thang]);

  const draft = () => {
    const pid = personId || null;
    if (level === 'thang') return { ten, personId: pid, bd: bd || null, dl: dl || null };
    if (level === 'tuan') return { ten, personId: pid, bd: bd || null, dl: dl || null, parentMa };
    return { ten, personId: pid, ngay, parentId };
  };

  const validate = (): string => {
    if (!ten.trim()) return t('form.errName');
    if (level === 'tuan' && !parentMa) return t('form.errParentThang');
    if (level === 'ngay' && !parentId) return t('form.errParentTuan');
    if (level === 'ngay' && !ngay) return t('form.errDate');
    if (level !== 'ngay' && bd && dl && dl < bd) return t('form.errDeadline');
    return '';
  };

  const save = () => {
    const e = validate();
    if (e) {
      setErr(e);
      return;
    }
    const d = draft();
    const s = st();
    const item =
      level === 'thang'
        ? s.createThang({ ...d, ten: ten.trim() } as Parameters<typeof s.createThang>[0])
        : level === 'tuan'
          ? s.createTuan({ ...(d as { parentMa: string }), ten: ten.trim() })
          : s.createNgay({ ...(d as { parentId: string; ngay: string }), ten: ten.trim() });
    s.toast(t('toast.created', { ma: item.ma }), 'ok');
    onClose();
  };

  const details = () => {
    st().openDrawer({ level, id: null, draft: draft() });
    onClose();
  };

  const levels: Level[] = ['thang', 'tuan', 'ngay'];
  return (
    <div
      ref={ref}
      className="qc-pop"
      role="dialog"
      aria-label={t('toolbar.quick')}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          onClose();
        }
        if (e.key === 'Enter' && (e.target as HTMLElement).tagName === 'INPUT') {
          e.preventDefault();
          save();
        }
      }}
    >
      <div className="qc-levels" role="radiogroup" aria-label={t('form.level')}>
        {levels.map((l) => (
          <button key={l} role="radio" aria-checked={level === l} className={cx(level === l && 'on')} onClick={() => { setLevel(l); setErr(''); }}>
            {t(`levelShort.${l}`)}
          </button>
        ))}
      </div>
      <label className="field">
        <span>{level === 'ngay' ? t('col.content') : t('col.task')}</span>
        <input ref={nameRef} value={ten} onChange={(e) => setTen(e.target.value)} placeholder={t('form.namePlaceholder')} />
      </label>
      {level === 'tuan' && (
        <label className="field">
          <span>{t('col.parentThang')}</span>
          <select value={parentMa} onChange={(e) => setParentMa(e.target.value)}>
            <option value="">{t('form.choose')}</option>
            {thangOptions.map((m) => (
              <option key={m.id} value={m.ma}>{`${m.ma} · ${m.ten}`}</option>
            ))}
          </select>
        </label>
      )}
      {level === 'ngay' && (
        <div className="field-row">
          <label className="field">
            <span>{t('col.date')}</span>
            <input type="date" value={ngay} onChange={(e) => setNgay(e.target.value)} />
          </label>
          <label className="field">
            <span>{t('col.parentTuan')}</span>
            <select value={parentId} onChange={(e) => setParentId(e.target.value)}>
              <option value="">{t('form.choose')}</option>
              {tuanOptions.map((w) => (
                <option key={w.id} value={w.id}>{`${w.ma} · ${w.ten}`}</option>
              ))}
            </select>
          </label>
        </div>
      )}
      <label className="field">
        <span>{t('col.person')}</span>
        <select value={personId} onChange={(e) => { setPersonId(e.target.value); setPersonTouched(true); }}>
          <option value="">{t('person.unassigned')}</option>
          {data.people.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      </label>
      {level !== 'ngay' && (
        <div className="field-row">
          <label className="field">
            <span>{t('col.planStart')}</span>
            <input type="date" value={bd} onChange={(e) => setBd(e.target.value)} />
          </label>
          <label className="field">
            <span>{t('col.planDeadline')}</span>
            <input type="date" value={dl} min={bd || undefined} onChange={(e) => setDl(e.target.value)} />
          </label>
        </div>
      )}
      {err && <div className="form-err" role="alert">{err}</div>}
      <div className="qc-actions">
        <button className="btn" onClick={details}>
          {t('form.details')}
        </button>
        <button className="btn btn-primary" onClick={save}>
          {t('common.save')}
        </button>
      </div>
    </div>
  );
}
