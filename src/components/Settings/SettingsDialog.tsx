// Cài đặt: dialog toàn màn hình, menu trái (mục 3.5, 3.6)
import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { LangCode, Person } from '../../core/model.ts';
import { newId } from '../../core/ids.ts';
import { PERSON_COLORS } from '../../core/migrate.ts';
import { countAssigned, removePerson } from '../../core/ops.ts';
import { LANG_META } from '../../i18n/index.ts';
import { useApp } from '../../store/app.ts';
import type { SettingsSection } from '../../store/app.ts';
import { api } from '../../lib/devApi.ts';
import { backupNow, exportAll, restoreFlow } from '../../lib/flows.ts';
import { ISSUE_URL, cx } from '../../lib/labels.ts';
import { Avatar } from '../Common/bits.tsx';
import { SyncSection } from './SyncSection.tsx';
import { ListsSection } from './ListsSection.tsx';
import { IDownload, IFolder, IPlus, ISheet, ITrash, IUpload, IX } from '../Common/Icons.tsx';

const SECTIONS: SettingsSection[] = ['language', 'appearance', 'people', 'lists', 'personal', 'data', 'sync', 'update', 'notify', 'about'];
const isAndroid = () => api().platform === 'android';

export function SettingsDialog() {
  const { t } = useTranslation();
  const open = useApp((s) => s.settingsOpen);
  const setOpen = useApp((s) => s.openSettings);
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (open) closeRef.current?.focus();
  }, [open !== null]); // eslint-disable-line react-hooks/exhaustive-deps
  // điện thoại: menu mục cuộn ngang → đưa mục đang chọn vào giữa
  useEffect(() => {
    if (open) document.querySelector('.settings-link.on')?.scrollIntoView({ block: 'nearest', inline: 'center' });
  }, [open]);
  if (!open) return null;
  return (
    <div className="settings" role="dialog" aria-modal="true" aria-labelledby="settings-title">
      <aside className="settings-nav">
        <h2 id="settings-title">{t('settings.title')}</h2>
        <nav>
          {SECTIONS.map((s) => (
            <button key={s} className={cx('settings-link', open === s && 'on')} aria-current={open === s} onClick={() => setOpen(s)}>
              {t(`settings.${s}`)}
            </button>
          ))}
        </nav>
      </aside>
      <section className="settings-main">
        <header className="settings-head">
          <h3>{t(`settings.${open}`)}</h3>
          <button ref={closeRef} className="icon-btn" aria-label={t('common.close')} title={`${t('common.close')} (Esc)`} onClick={() => setOpen(null)}>
            <IX size={20} />
          </button>
        </header>
        <div className="settings-body">
          {open === 'language' && <LanguageSection />}
          {open === 'appearance' && <AppearanceSection />}
          {open === 'people' && <PeopleSection />}
          {open === 'lists' && <ListsSection />}
          {open === 'personal' && <PersonalSection />}
          {open === 'data' && <DataSection />}
          {open === 'sync' && <SyncSection />}
          {open === 'update' && <UpdateSection />}
          {open === 'notify' && <NotifySection />}
          {open === 'about' && <AboutSection />}
        </div>
      </section>
    </div>
  );
}

function Block({ title, hint, children }: { title?: string; hint?: ReactNode; children?: ReactNode }) {
  return (
    <div className="set-block">
      {title && <h4>{title}</h4>}
      {hint && <p className="set-hint">{hint}</p>}
      {children}
    </div>
  );
}

function LanguageSection() {
  const lang = useApp((s) => s.settings.language);
  const setSettings = useApp((s) => s.setSettings);
  return (
    <div className="lang-list" role="radiogroup">
      {LANG_META.map((l) => (
        <button key={l.code} role="radio" aria-checked={lang === l.code} className={cx('lang-item', lang === l.code && 'on')} onClick={() => setSettings({ language: l.code as LangCode })}>
          <span className="lang-badge">{l.badge}</span>
          <span>{l.name}</span>
        </button>
      ))}
    </div>
  );
}

function AppearanceSection() {
  const { t } = useTranslation();
  const theme = useApp((s) => s.settings.theme);
  const setSettings = useApp((s) => s.setSettings);
  const dark = theme === 'dark';
  return (
    <Block hint={t('settings.themeHint')}>
      <div className="theme-row">
        <span className={cx('theme-label', !dark && 'on')}>{t('settings.light')}</span>
        <button role="switch" aria-checked={dark} aria-label={t('settings.darkMode')} className={cx('switch3d', dark && 'on')} onClick={() => setSettings({ theme: dark ? 'light' : 'dark' })}>
          <span className="switch3d-knob" />
        </button>
        <span className={cx('theme-label', dark && 'on')}>{t('settings.dark')}</span>
      </div>
    </Block>
  );
}

async function fileToAvatar(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    await new Promise<void>((ok, bad) => {
      img.onload = () => ok();
      img.onerror = () => bad(new Error('image'));
      img.src = url;
    });
    const size = 96;
    const c = document.createElement('canvas');
    c.width = size;
    c.height = size;
    const ctx = c.getContext('2d')!;
    const s = Math.min(img.width, img.height);
    ctx.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, size, size);
    return c.toDataURL('image/jpeg', 0.85);
  } finally {
    URL.revokeObjectURL(url);
  }
}

function PeopleSection() {
  const { t } = useTranslation();
  const people = useApp((s) => s.data.people);
  const data = useApp((s) => s.data);
  const mutate = useApp((s) => s.mutate);
  const askConfirm = useApp((s) => s.askConfirm);
  const toast = useApp((s) => s.toast);
  const me = useApp((s) => s.settings.currentPersonId);
  const setSettings = useApp((s) => s.setSettings);
  const [name, setName] = useState('');

  const add = () => {
    const n = name.trim();
    if (!n) return;
    if (people.some((p) => p.name.toLowerCase() === n.toLowerCase())) {
      toast(t('people.duplicate'), 'error');
      return;
    }
    const p: Person = { id: newId('p'), name: n, color: PERSON_COLORS[people.length % PERSON_COLORS.length], photo: null };
    mutate((d) => ({ ...d, people: [...d.people, p] }));
    setName('');
  };
  const patch = (id: string, v: Partial<Person>) => mutate((d) => ({ ...d, people: d.people.map((p) => (p.id === id ? { ...p, ...v } : p)) }));
  const del = (p: Person) => {
    const n = countAssigned(data, p.id);
    const run = () => {
      mutate((d) => removePerson(d, p.id));
      if (me === p.id) setSettings({ currentPersonId: null });
    };
    if (n === 0) run();
    else askConfirm({ title: t('people.deleteTitle'), message: t('people.deleteAssigned', { name: p.name, n }), confirmLabel: t('people.delete'), danger: true, onConfirm: run });
  };

  return (
    <Block hint={t('people.hint')}>
      <div className="people-add">
        <input value={name} placeholder={t('people.namePlaceholder')} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} aria-label={t('people.name')} />
        <button className="btn btn-primary" onClick={add} disabled={!name.trim()}>
          <IPlus size={14} />
          {t('people.add')}
        </button>
      </div>
      {people.length === 0 && <p className="set-hint">{t('people.empty')}</p>}
      <ul className="people-list">
        {people.map((p) => (
          <li key={p.id} className="person-row">
            <Avatar person={p} size={34} />
            <input className="person-name" value={p.name} aria-label={t('people.name')} onChange={(e) => patch(p.id, { name: e.target.value })} onBlur={(e) => !e.target.value.trim() && patch(p.id, { name: t('people.unnamed') })} />
            <label className="color-pick" title={t('people.color')}>
              <input type="color" value={p.color} onChange={(e) => patch(p.id, { color: e.target.value })} aria-label={t('people.color')} />
            </label>
            <label className="btn btn-sm" title={t('people.photo')}>
              {t('people.photo')}
              <input
                type="file"
                accept="image/*"
                hidden
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  e.target.value = '';
                  if (!file) return;
                  try {
                    patch(p.id, { photo: await fileToAvatar(file) });
                  } catch {
                    toast(t('people.photoFail'), 'error');
                  }
                }}
              />
            </label>
            {p.photo && (
              <button className="btn btn-sm btn-ghost" onClick={() => patch(p.id, { photo: null })}>
                {t('people.removePhoto')}
              </button>
            )}
            <span className="person-count">{t('people.tasks', { n: countAssigned(data, p.id) })}</span>
            <button className="icon-btn sm qa-del" aria-label={t('people.delete')} title={t('people.delete')} onClick={() => del(p)}>
              <ITrash size={14} />
            </button>
          </li>
        ))}
      </ul>
    </Block>
  );
}

function PersonalSection() {
  const { t } = useTranslation();
  const people = useApp((s) => s.data.people);
  const me = useApp((s) => s.settings.currentPersonId);
  const setSettings = useApp((s) => s.setSettings);
  const openSettings = useApp((s) => s.openSettings);
  return (
    <Block hint={t('personal.hint')}>
      <label className="field narrow">
        <span>{t('personal.iam')}</span>
        <select value={me ?? ''} onChange={(e) => setSettings({ currentPersonId: e.target.value || null })}>
          <option value="">{t('personal.none')}</option>
          {people.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>
      {people.length === 0 && (
        <button className="btn btn-sm" onClick={() => openSettings('people')}>
          {t('personal.addPeople')}
        </button>
      )}
    </Block>
  );
}

function DataSection() {
  const { t } = useTranslation();
  const info = useApp((s) => s.info);
  return (
    <>
      <Block title={t('data.backupTitle')} hint={t('data.backupHint')}>
        <div className="btn-row">
          <button className="btn" onClick={() => void backupNow()}>
            <IDownload size={15} />
            {t('data.backup')}
          </button>
          <button className="btn" onClick={() => void restoreFlow()}>
            <IUpload size={15} />
            {t('data.restore')}
          </button>
          <button className="btn" onClick={() => void exportAll()}>
            <ISheet size={15} />
            {t('data.export')}
          </button>
        </div>
      </Block>
      {isAndroid() ? (
        <Block title={t('data.location')} hint={t('data.androidLocation')}>
          {null}
        </Block>
      ) : (
        <Block title={t('data.location')} hint={t('data.locationHint')}>
          <div className="path-row">
            <code className="path">{info.dataPath}</code>
            <button className="btn btn-sm" onClick={() => void api().openDataFolder()}>
              <IFolder size={14} />
              {t('data.openFolder')}
            </button>
          </div>
        </Block>
      )}
      <Block title={t('data.legacyTitle')} hint={t('data.legacyHint')}>
        {null}
      </Block>
    </>
  );
}

function UpdateSection() {
  const { t } = useTranslation();
  const info = useApp((s) => s.info);
  const u = useApp((s) => s.update);
  const auto = useApp((s) => s.settings.autoDownloadUpdates);
  const last = useApp((s) => s.settings.lastUpdateCheck);
  const setSettings = useApp((s) => s.setSettings);
  const lang = useApp((s) => s.settings.language);
  const status =
    u.status === 'checking' ? t('update.checking')
    : u.status === 'latest' ? t('update.latest')
    : u.status === 'downloading' ? t('update.downloading', { v: u.version, p: u.percent ?? 0 })
    : u.status === 'available' ? t('update.available', { v: u.version })
    : u.status === 'ready' ? t('update.ready', { v: u.version })
    : u.status === 'error' ? t('update.error', { msg: u.error })
    : '';
  if (isAndroid())
    return (
      <Block hint={t('update.androidHint')}>
        <dl className="kv">
          <dt>{t('update.current')}</dt>
          <dd>{`v${info.version}`}</dd>
        </dl>
        <div className="btn-row">
          <button className="btn" disabled={u.status === 'checking'} onClick={() => void api().checkUpdates()}>
            {t('update.check')}
          </button>
          {u.status === 'ready' && (
            <button className="btn btn-primary" onClick={() => void api().installUpdate()}>
              {t('update.androidGet')}
            </button>
          )}
        </div>
        {status && <p className={cx('set-status', u.status === 'error' && 'err')} role="status">{status}</p>}
      </Block>
    );
  return (
    <>
      <Block>
        <dl className="kv">
          <dt>{t('update.current')}</dt>
          <dd>{`v${info.version}`}</dd>
          <dt>{t('update.lastCheck')}</dt>
          <dd>{last ? new Date(last).toLocaleString(lang) : t('update.never')}</dd>
        </dl>
        <div className="btn-row">
          <button className="btn" disabled={u.status === 'checking' || u.status === 'downloading'} onClick={() => void api().checkUpdates()}>
            {t('update.check')}
          </button>
          {u.status === 'ready' && (
            <button className="btn btn-primary" onClick={async () => { await useApp.getState().flush(); await api().installUpdate(); }}>
              {t('update.installNow')}
            </button>
          )}
        </div>
        {status && <p className={cx('set-status', u.status === 'error' && 'err')} role="status">{status}</p>}
        {!info.packaged && <p className="set-hint">{t('update.devNote')}</p>}
      </Block>
      <Block>
        <Toggle label={t('update.auto')} checked={auto} onChange={(v) => { setSettings({ autoDownloadUpdates: v }); void api().setAutoDownload(v); }} />
      </Block>
    </>
  );
}

function NotifySection() {
  const { t } = useTranslation();
  const s = useApp((st) => st.settings);
  const setSettings = useApp((st) => st.setSettings);
  const toast = useApp((st) => st.toast);
  const off = !s.notificationsEnabled;
  return (
    <>
      <Block hint={t('notify.hint2')}>
        <Toggle label={isAndroid() ? t('notify.enableMobile') : t('notify.enable')} checked={s.notificationsEnabled} onChange={(v) => setSettings({ notificationsEnabled: v })} />
        <div className="btn-row">
          <button
            className="btn btn-sm"
            disabled={off}
            onClick={() => {
              void api().notify({ title: t('notify.testTitle'), body: t('notify.testBody') });
              toast(t('notify.testSent'), 'ok');
            }}
          >
            {t('notify.test')}
          </button>
        </div>
      </Block>
      <fieldset className="set-group" disabled={off}>
        <Block title={t('notify.rangeTitle')}>
          <div className="toggle-num">
            <Toggle label={t('notify.soon')} checked={s.notifySoon} onChange={(v) => setSettings({ notifySoon: v })} />
            <NumInput min={1} max={30} value={s.notifyDaysBefore} label={t('notify.days')} onChange={(v) => setSettings({ notifyDaysBefore: v })} />
            <span className="unit">{t('notify.daysUnit')}</span>
          </div>
          <Toggle label={t('notify.due')} checked={s.notifyDue} onChange={(v) => setSettings({ notifyDue: v })} />
          <Toggle label={t('notify.over')} checked={s.notifyOverdue} onChange={(v) => setSettings({ notifyOverdue: v })} />
        </Block>
        <Block title={t('notify.dayTitle')}>
          <div className="toggle-num">
            <Toggle label={t('notify.dayStart')} checked={s.notifyDayStart} onChange={(v) => setSettings({ notifyDayStart: v })} />
            <NumInput min={0} max={240} value={s.notifyDayLeadMin} label={t('notify.leadUnit')} onChange={(v) => setSettings({ notifyDayLeadMin: v })} />
            <span className="unit">{t('notify.leadUnit')}</span>
          </div>
          <Toggle label={t('notify.dayLate')} checked={s.notifyDayLate} onChange={(v) => setSettings({ notifyDayLate: v })} />
        </Block>
        <Block title={t('notify.timeTitle')} hint={t('notify.timeHint')}>
          <div className="field-row narrow-row">
            <label className="field">
              <span>{t('notify.morning')}</span>
              <input type="time" value={s.notifyMorning} onChange={(e) => e.target.value && setSettings({ notifyMorning: e.target.value })} />
            </label>
            <label className="field">
              <span>{t('notify.quietStart')}</span>
              <input type="time" value={s.quietStart} onChange={(e) => e.target.value && setSettings({ quietStart: e.target.value })} />
            </label>
            <label className="field">
              <span>{t('notify.quietEnd')}</span>
              <input type="time" value={s.quietEnd} onChange={(e) => e.target.value && setSettings({ quietEnd: e.target.value })} />
            </label>
          </div>
        </Block>
      </fieldset>
      {api().platform === 'electron' && (
        <Block title={t('notify.bgTitle')} hint={t('notify.bgHint')}>
          <Toggle label={t('notify.background')} checked={s.runInBackground} onChange={(v) => setSettings({ runInBackground: v })} />
          <Toggle label={t('notify.login')} checked={s.launchAtLogin} onChange={(v) => setSettings({ launchAtLogin: v })} />
        </Block>
      )}
      {api().platform === 'android' && <Block hint={t('notify.androidHint')} />}
    </>
  );
}

function AboutSection() {
  const { t } = useTranslation();
  const info = useApp((s) => s.info);
  return (
    <Block>
      <div className="about">
        <img src="./logo.png" alt="" width={56} height={56} />
        <div>
          <div className="about-name">HCN Work Manage</div>
          <div className="set-hint">{`v${info.version}`}</div>
        </div>
      </div>
      <dl className="kv">
        {!isAndroid() && (
          <>
            <dt>{t('about.log')}</dt>
            <dd className="path-row">
              <code className="path">{info.logPath}</code>
              <button className="btn btn-sm" onClick={() => void api().openLog()}>
                {t('about.openLog')}
              </button>
            </dd>
          </>
        )}
        <dt>{t('about.report')}</dt>
        <dd>
          <button className="link" onClick={() => void api().openExternal(ISSUE_URL)}>
            {ISSUE_URL}
          </button>
        </dd>
      </dl>
    </Block>
  );
}

/**
 * Ô nhập số: cho xóa trắng và gõ lại tự do (không bật về giá trị mặc định giữa chừng);
 * số hợp lệ được lưu ngay, rời ô thì đưa về trong khoảng [min, max].
 */
export function NumInput({ value, min, max, label, onChange }: { value: number; min: number; max: number; label: string; onChange: (v: number) => void }) {
  const [text, setText] = useState(String(value));
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) setText(String(value));
  }, [value, focused]);
  const clamp = (n: number) => Math.max(min, Math.min(max, Math.round(n)));
  return (
    <input
      type="number"
      inputMode="numeric"
      min={min}
      max={max}
      value={text}
      aria-label={label}
      onFocus={(e) => {
        setFocused(true);
        e.currentTarget.select();
      }}
      onChange={(e) => {
        const v = e.target.value;
        setText(v);
        if (v.trim() === '') return;
        const n = Number(v);
        if (Number.isFinite(n) && n >= min && n <= max) onChange(Math.round(n));
      }}
      onBlur={() => {
        setFocused(false);
        const n = Number(text);
        const v = text.trim() === '' || !Number.isFinite(n) ? value : clamp(n);
        setText(String(v));
        if (v !== value) onChange(v);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
      }}
    />
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="toggle">
      <span>{label}</span>
      <button role="switch" aria-checked={checked} className={cx('switch', checked && 'on')} onClick={() => onChange(!checked)}>
        <span className="switch-knob" />
      </button>
    </label>
  );
}
