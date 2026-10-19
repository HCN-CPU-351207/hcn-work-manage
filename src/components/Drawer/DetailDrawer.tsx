// Ngăn chi tiết bên phải (BỔ SUNG, mục 8.7): 420 px trên PC, toàn màn hình trên mobile
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { applyActualEdit, normalizeNewNgay } from '../../core/actions.ts';
import { LOAI_LIST, STATUSES } from '../../core/model.ts';
import type { Level, Loai, Ngay, Status, Thang, Tuan } from '../../core/model.ts';
import { hasKids } from '../../core/ops.ts';
import { hmToMin } from '../../core/time.ts';
import { useApp } from '../../store/app.ts';
import { useToday } from '../../lib/hooks.ts';
import { hhmm } from '../../lib/fmt.ts';
import { LOAI_KEY, STATUS_KEY } from '../../lib/labels.ts';
import { ILock, IX } from '../Common/Icons.tsx';
import { optLabel, useOpts } from '../../lib/opts.ts';

type Form = Record<string, string>;

const s = (v: string | null | undefined) => v ?? '';
const n = (v: string) => (v.trim() ? v : null);

function initForm(level: Level, item: Thang | Tuan | Ngay | undefined, draft: Record<string, unknown> | undefined, today: string, me: string | null): Form {
  const d = (draft ?? {}) as Record<string, string | null>;
  if (level === 'thang') {
    const x = item as Thang | undefined;
    return {
      loai: x?.loai ?? 'Không gấp-Quan trọng', ten: x?.ten ?? s(d.ten), personId: s(x ? x.personId : d.personId ?? me),
      bd: s(x ? x.bd : d.bd), dl: s(x ? x.dl : d.dl), tt: x?.tt ?? 'Chưa làm', bdtt: s(x?.bdtt), kttt: s(x?.kttt), gc: x?.gc ?? '',
      cat: s(x ? x.cat : d.cat)
    };
  }
  if (level === 'tuan') {
    const x = item as Tuan | undefined;
    return {
      parentMa: x?.parentMa ?? s(d.parentMa), ten: x?.ten ?? s(d.ten), personId: s(x ? x.personId : d.personId ?? me),
      bd: s(x ? x.bd : d.bd), dl: s(x ? x.dl : d.dl), tt: x?.tt ?? 'Chưa làm', bdtt: s(x?.bdtt), kttt: s(x?.kttt), gc: x?.gc ?? '',
      cat: s(x ? x.cat : d.cat)
    };
  }
  const x = item as Ngay | undefined;
  return {
    ngay: x?.ngay ?? (s(d.ngay) || today), parentId: x?.parentId ?? s(d.parentId), ten: x?.ten ?? s(d.ten),
    personId: s(x ? x.personId : d.personId), g1: s(x?.g1), g2: s(x?.g2), a1: hhmm(x?.a1), a2: hhmm(x?.a2),
    a1date: x?.a1 ? x.a1.slice(0, 10) : '', a2date: x?.a2 ? x.a2.slice(0, 10) : '', tt: x?.tt ?? 'Chưa làm', gc: x?.gc ?? '',
    cat: s(x ? x.cat : d.cat), place: s(x ? x.place : (d.place as string | null | undefined)), placeNote: x?.placeNote ?? s(d.placeNote as string | undefined)
  };
}

export function DetailDrawer() {
  const dr = useApp((st) => st.drawer);
  if (!dr) return null;
  return <DrawerInner key={`${dr.level}:${dr.id ?? 'new'}`} />;
}

function DrawerInner() {
  const { t } = useTranslation();
  const today = useToday();
  const dr = useApp((st) => st.drawer)!;
  const data = useApp((st) => st.data);
  const me = useApp((st) => st.settings.currentPersonId);
  const st = useApp.getState;
  const level = dr.level;
  const item = useMemo(
    () => (dr.id ? (level === 'thang' ? data.thang : level === 'tuan' ? data.tuan : data.ngay).find((x) => x.id === dr.id) : undefined),
    // chỉ lấy một lần khi mở để không ghi đè khi đang sửa
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dr.id, level]
  );
  const [f, setF] = useState<Form>(() => initForm(level, item, dr.draft, today, me));
  const [touchedPerson, setTouchedPerson] = useState(!!item);
  const [touchedCat, setTouchedCat] = useState(!!item || !!(dr.draft as { cat?: string } | undefined)?.cat);
  const cats = useOpts('cats');
  const places = useOpts('places');
  const [err, setErr] = useState('');
  const firstRef = useRef<HTMLInputElement>(null);
  const kids = dr.id ? hasKids(data, level, dr.id) : false;
  const original = useRef(f);

  useEffect(() => {
    firstRef.current?.focus();
  }, []);

  // CV Ngày: người mặc định lấy từ tuần cha (X13)
  useEffect(() => {
    if (level !== 'ngay' || touchedPerson) return;
    const p = data.tuan.find((w) => w.id === f.parentId)?.personId ?? '';
    setF((x) => ({ ...x, personId: p }));
  }, [f.parentId, level, touchedPerson, data.tuan]);

  // Phân loại mặc định lấy từ việc cha (sửa tay thì thôi)
  useEffect(() => {
    if (touchedCat || level === 'thang') return;
    const c = level === 'tuan' ? data.thang.find((m) => m.ma === f.parentMa)?.cat : data.tuan.find((w) => w.id === f.parentId)?.cat;
    setF((x) => ({ ...x, cat: c ?? '' }));
  }, [f.parentMa, f.parentId, level, touchedCat, data.thang, data.tuan]);

  if (dr.id && !item) return null; // đã bị xóa
  const set = (k: string) => (v: string) => setF((x) => ({ ...x, [k]: v }));
  const close = () => st().openDrawer(null);

  const validate = (): string => {
    if (!f.ten.trim()) return t('form.errName');
    if (level === 'tuan' && !f.parentMa) return t('form.errParentThang');
    if (level === 'ngay' && !f.parentId) return t('form.errParentTuan');
    if (level === 'ngay' && !f.ngay) return t('form.errDate');
    if (level !== 'ngay') {
      if (f.bd && f.dl && f.dl < f.bd) return t('form.errDeadline');
      if (f.bdtt && f.kttt && f.kttt < f.bdtt) return t('form.errActualEnd');
    } else {
      if ((f.g1 && !f.g2) || (!f.g1 && f.g2)) return t('form.errBothTimes');
      if (f.g1 && f.g2 && hmToMin(f.g2) <= hmToMin(f.g1)) return t('form.errTimeOrder');
      if (!f.a1 && f.a2) return t('form.errActualStartFirst');
      if (f.a1 && f.a2 && hmToMin(f.a2) < hmToMin(f.a1) && (f.a2date || f.ngay) === (f.a1date || f.ngay)) return t('form.errTimeOrder');
    }
    return '';
  };

  const save = () => {
    const e = validate();
    if (e) {
      setErr(e);
      return;
    }
    const S = st();
    const personId = n(f.personId);
    if (level === 'thang') {
      const patch: Partial<Thang> = { cat: n(f.cat), loai: f.loai as Loai, ten: f.ten.trim(), personId, bd: n(f.bd), dl: n(f.dl), bdtt: n(f.bdtt), kttt: n(f.kttt), gc: f.gc, ...(kids ? {} : { tt: f.tt as Status }) };
      if (dr.id) S.updateItem('thang', dr.id, patch);
      else S.toast(t('toast.created', { ma: S.createThang(patch).ma }), 'ok');
    } else if (level === 'tuan') {
      const patch: Partial<Tuan> = { cat: n(f.cat), parentMa: f.parentMa, ten: f.ten.trim(), personId, bd: n(f.bd), dl: n(f.dl), bdtt: n(f.bdtt), kttt: n(f.kttt), gc: f.gc, ...(kids ? {} : { tt: f.tt as Status }) };
      if (dr.id) S.updateItem('tuan', dr.id, patch);
      else S.toast(t('toast.created', { ma: S.createTuan(patch as Partial<Tuan> & { parentMa: string }).ma }), 'ok');
    } else {
      const iso = (date: string, hm: string) => (hm ? `${date || f.ngay}T${hm}:00` : null);
      const base = {
        ngay: f.ngay, parentId: f.parentId, ten: f.ten.trim(), personId, g1: n(f.g1), g2: n(f.g2),
        a1: iso(f.a1date, f.a1), a2: iso(f.a2date, f.a2), tt: f.tt as Status, gc: f.gc,
        cat: n(f.cat), place: n(f.place), placeNote: f.placeNote.trim()
      };
      const actualChanged = f.a1 !== original.current.a1 || f.a2 !== original.current.a2;
      if (dr.id) {
        const prev = item as Ngay;
        let next: Ngay = { ...prev, ...base };
        if (actualChanged) next = applyActualEdit(next); // a2 → Hoàn thành; chỉ a1 → Đang làm; rỗng → Chưa làm
        S.updateItem('ngay', dr.id, next);
      } else {
        const tmp = normalizeNewNgay({ id: '', ma: '', ...base } as Ngay);
        S.toast(t('toast.created', { ma: S.createNgay({ ...base, tt: tmp.tt }).ma }), 'ok');
      }
    }
    if (dr.id) S.toast(t('toast.saved'), 'ok');
    close();
  };

  const title = dr.id ? `${(item as { ma: string }).ma}` : t(`drawer.new.${level}`);
  const thangOpts = [...data.thang].sort((a, b) => b.ma.localeCompare(a.ma));
  const tuanOpts = [...data.tuan].sort((a, b) => b.ma.localeCompare(a.ma));

  const statusField = (
    <Field label={t('col.status')}>
      {kids ? (
        <span className="locked-field" title={t('grid.autoStatus')}>
          <ILock size={13} />
          {t('grid.autoStatus')}
        </span>
      ) : (
        <select value={f.tt} onChange={(e) => set('tt')(e.target.value)}>
          {STATUSES.map((x) => (
            <option key={x} value={x}>
              {t(`status.${STATUS_KEY[x]}`)}
            </option>
          ))}
        </select>
      )}
    </Field>
  );
  const optSelect = (kind: 'cats' | 'places', key: 'cat' | 'place', none: string) => (
    <select
      value={f[key]}
      onChange={(e) => {
        set(key)(e.target.value);
        if (key === 'cat') setTouchedCat(true);
      }}
    >
      <option value="">{none}</option>
      {(kind === 'cats' ? cats : places)
        .filter((o) => !o.hidden || o.id === f[key])
        .map((o) => (
          <option key={o.id} value={o.id}>
            {optLabel(o)}
          </option>
        ))}
    </select>
  );
  const catField = <Field label={t('col.cat')}>{optSelect('cats', 'cat', t('opt.noneCat'))}</Field>;
  const personField = (
    <Field label={t('col.person')}>
      <select value={f.personId} onChange={(e) => { set('personId')(e.target.value); setTouchedPerson(true); }}>
        <option value="">{t('person.unassigned')}</option>
        {data.people.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
    </Field>
  );

  return (
    <div className="drawer-backdrop" onMouseDown={close}>
      <aside className="drawer" role="dialog" aria-modal="true" aria-labelledby="drawer-title" onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) save();
        }}
      >
        <header className="drawer-head">
          <div>
            <div className="drawer-level">{t(`level.${level}`)}</div>
            <h2 id="drawer-title">{title}</h2>
          </div>
          <button className="icon-btn" onClick={close} aria-label={t('common.close')}>
            <IX size={18} />
          </button>
        </header>
        <div className="drawer-body">
          {level === 'thang' && (
            <>
              <Field label={t('col.loai')}>
                <select value={f.loai} onChange={(e) => set('loai')(e.target.value)}>
                  {LOAI_LIST.map((l) => (
                    <option key={l} value={l}>
                      {t(`loai.${LOAI_KEY[l]}`)}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={t('col.task')}>
                <input ref={firstRef} value={f.ten} onChange={(e) => set('ten')(e.target.value)} />
              </Field>
              <Row2>
                {catField}
                {personField}
              </Row2>
              <Row2>
                <Field label={t('col.planStart')}><input type="date" value={f.bd} onChange={(e) => set('bd')(e.target.value)} /></Field>
                <Field label={t('col.planDeadline')}><input type="date" value={f.dl} min={f.bd || undefined} onChange={(e) => set('dl')(e.target.value)} /></Field>
              </Row2>
              {statusField}
              <Row2>
                <Field label={t('col.actualStart')}><input type="date" value={f.bdtt} onChange={(e) => set('bdtt')(e.target.value)} /></Field>
                <Field label={t('col.actualEnd')}><input type="date" value={f.kttt} min={f.bdtt || undefined} onChange={(e) => set('kttt')(e.target.value)} /></Field>
              </Row2>
              <p className="field-hint">{t('drawer.actualHint')}</p>
            </>
          )}
          {level === 'tuan' && (
            <>
              <Field label={t('col.parentThang')}>
                <select value={f.parentMa} onChange={(e) => set('parentMa')(e.target.value)}>
                  <option value="">{t('form.choose')}</option>
                  {thangOpts.map((m) => (
                    <option key={m.id} value={m.ma}>{`${m.ma} · ${m.ten}`}</option>
                  ))}
                </select>
              </Field>
              <Field label={t('col.task')}>
                <input ref={firstRef} value={f.ten} onChange={(e) => set('ten')(e.target.value)} />
              </Field>
              <Row2>
                {catField}
                {personField}
              </Row2>
              <Row2>
                <Field label={t('col.planStart')}><input type="date" value={f.bd} onChange={(e) => set('bd')(e.target.value)} /></Field>
                <Field label={t('col.planDeadline')}><input type="date" value={f.dl} min={f.bd || undefined} onChange={(e) => set('dl')(e.target.value)} /></Field>
              </Row2>
              {statusField}
              <Row2>
                <Field label={t('col.actualStart')}><input type="date" value={f.bdtt} onChange={(e) => set('bdtt')(e.target.value)} /></Field>
                <Field label={t('col.actualEnd')}><input type="date" value={f.kttt} min={f.bdtt || undefined} onChange={(e) => set('kttt')(e.target.value)} /></Field>
              </Row2>
              <p className="field-hint">{t('drawer.actualHint')}</p>
            </>
          )}
          {level === 'ngay' && (
            <>
              <Row2>
                <Field label={t('col.date')}><input type="date" value={f.ngay} onChange={(e) => set('ngay')(e.target.value)} /></Field>
                <Field label={t('col.parentTuan')}>
                  <select value={f.parentId} onChange={(e) => set('parentId')(e.target.value)}>
                    <option value="">{t('form.choose')}</option>
                    {tuanOpts.map((w) => (
                      <option key={w.id} value={w.id}>{`${w.ma} · ${w.ten}`}</option>
                    ))}
                  </select>
                </Field>
              </Row2>
              <Field label={t('col.content')}>
                <input ref={firstRef} value={f.ten} onChange={(e) => set('ten')(e.target.value)} />
              </Field>
              <Row2>
                {catField}
                {personField}
              </Row2>
              <Row2>
                <Field label={t('col.place')}>{optSelect('places', 'place', t('opt.nonePlace'))}</Field>
                <Field label={t('drawer.placeNote')}>
                  <input value={f.placeNote} maxLength={120} placeholder={t('drawer.placeNotePh')} onChange={(e) => set('placeNote')(e.target.value)} />
                </Field>
              </Row2>
              <Row2>
                <Field label={t('drawer.planFrom')}><input type="time" step={600} value={f.g1} onChange={(e) => set('g1')(e.target.value)} /></Field>
                <Field label={t('drawer.planTo')}><input type="time" step={600} value={f.g2} min={f.g1 || undefined} onChange={(e) => set('g2')(e.target.value)} /></Field>
              </Row2>
              <Row2>
                <Field label={t('drawer.actualFrom')}><input type="time" value={f.a1} onChange={(e) => set('a1')(e.target.value)} /></Field>
                <Field label={t('drawer.actualTo')}><input type="time" value={f.a2} onChange={(e) => set('a2')(e.target.value)} /></Field>
              </Row2>
              <p className="field-hint">{t('drawer.ngayHint')}</p>
              {statusField}
            </>
          )}
          <Field label={t('col.note')}>
            <textarea rows={3} value={f.gc} onChange={(e) => set('gc')(e.target.value)} />
          </Field>
          {err && (
            <div className="form-err" role="alert">
              {err}
            </div>
          )}
        </div>
        <footer className="drawer-foot">
          <button className="btn" onClick={close}>
            {t('common.cancel')}
          </button>
          <button className="btn btn-primary" onClick={save}>
            {t('common.save')}
          </button>
        </footer>
      </aside>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}
function Row2({ children }: { children: ReactNode }) {
  return <div className="field-row">{children}</div>;
}
