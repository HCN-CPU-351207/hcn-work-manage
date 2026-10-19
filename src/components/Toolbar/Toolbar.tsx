// Global Top Toolbar kính mờ (Module 3, mục 1)
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { bellItems, bellKey } from '../../core/status.ts';
import { useApp } from '../../store/app.ts';
import { useDerived } from '../../lib/hooks.ts';
import { fmtDate } from '../../lib/fmt.ts';
import { cx } from '../../lib/labels.ts';
import { IBell, ICloud, ICloudErr, ICloudOk, IGear } from '../Common/Icons.tsx';
import { QuickCreate } from './QuickCreate.tsx';
import { SearchPill } from './SearchPill.tsx';

export function Toolbar() {
  const { t } = useTranslation();
  const openSettings = useApp((s) => s.openSettings);
  return (
    <header className="toolbar">
      <div className="brand">
        <img src="./logo.png" alt="" width={26} height={26} />
        <span className="brand-name">{t('app.name')}</span>
      </div>
      <SearchPill />
      <div className="toolbar-actions">
        <QuickCreate />
        <SyncStatus />
        <NotifyBell />
        <button className="icon-btn" aria-label={t('settings.title')} title={`${t('settings.title')} (Ctrl+,)`} onClick={() => openSettings('language')}>
          <IGear size={18} />
        </button>
      </div>
    </header>
  );
}

function SyncStatus() {
  const { t } = useTranslation();
  const sync = useApp((s) => s.sync);
  const err = useApp((s) => s.syncError);
  const flush = useApp((s) => s.flush);
  const toast = useApp((s) => s.toast);
  const label = sync === 'saved' ? t('sync.saved') : sync === 'pending' ? t('sync.pending') : t('sync.error');
  return (
    <button
      className={cx('icon-btn', 'sync', `sync-${sync}`)}
      aria-label={label}
      title={sync === 'error' ? t('sync.errorDetail', { msg: err ?? '' }) : label}
      onClick={async () => {
        if (sync !== 'error') return;
        toast(t('sync.errorDetail', { msg: err ?? '' }), 'error');
        const ok = await flush();
        if (ok) toast(t('sync.saved'), 'ok');
      }}
    >
      {sync === 'saved' ? <ICloudOk size={18} /> : sync === 'pending' ? <ICloud size={18} /> : <ICloudErr size={18} />}
    </button>
  );
}

function NotifyBell() {
  const { t, i18n } = useTranslation();
  const { data, derived, today } = useDerived();
  const days = useApp((s) => s.settings.notifyDaysBefore);
  const navigateTo = useApp((s) => s.navigateTo);
  const lang = useApp((s) => s.settings.language);
  const all = useMemo(() => bellItems(data, derived, today, days), [data, derived, today, days]);
  const seen = useApp((s) => s.settings.bellSeen);
  const setSettings = useApp((s) => s.setSettings);
  const [showSeen, setShowSeen] = useState(false);
  const unseen = useMemo(() => all.filter((i) => !seen?.[bellKey(i)]), [all, seen]);
  const items = showSeen ? all : unseen;
  const seenCount = all.length - unseen.length;
  /** đánh dấu đã xem; chỉ giữ khóa của các mục còn trong danh sách để không phình dữ liệu */
  const markSeen = (list: typeof all) => {
    const live = new Set(all.map(bellKey));
    const next: Record<string, string> = {};
    for (const [k, v] of Object.entries(seen ?? {})) if (live.has(k)) next[k] = v;
    for (const i of list) next[bellKey(i)] = today;
    setSettings({ bellSeen: next });
  };
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    const k = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', h);
    document.addEventListener('keydown', k);
    return () => {
      document.removeEventListener('mousedown', h);
      document.removeEventListener('keydown', k);
    };
  }, [open]);
  const over = items.filter((i) => i.kind === 'overdue');
  const soon = items.filter((i) => i.kind === 'soon');
  void i18n;
  return (
    <div className="bell-wrap" ref={ref}>
      <button className="icon-btn bell" aria-label={t('bell.title')} aria-expanded={open} title={t('bell.title')} onClick={() => setOpen(!open)}>
        <IBell size={18} />
        {unseen.length > 0 && <span className="bell-dot">{unseen.length > 99 ? '99+' : unseen.length}</span>}
      </button>
      {open && (
        <div className="bell-drop" role="menu">
          <div className="bell-head">
            <span>{t('bell.title')}</span>
            {unseen.length > 0 && (
              <button className="link-btn" onClick={() => markSeen(all)}>
                {t('bell.markAll')}
              </button>
            )}
          </div>
          {items.length === 0 && <div className="drop-empty">{all.length ? t('bell.allSeen') : t('bell.empty')}</div>}
          {[
            { key: 'overdue', list: over },
            { key: 'soon', list: soon }
          ].map((g) =>
            g.list.length ? (
              <div key={g.key}>
                <div className={cx('drop-head', g.key === 'overdue' && 'warn')}>{t(`bell.${g.key}`, { n: g.list.length, d: days })}</div>
                {g.list.map((i) => (
                  <button
                    key={i.id}
                    role="menuitem"
                    className={cx('drop-item', !!seen?.[bellKey(i)] && 'seen')}
                    onClick={() => {
                      setOpen(false);
                      markSeen([i]);
                      navigateTo(i.level, i.id);
                    }}
                  >
                    <span className="code-tag">{i.ma}</span>
                    <span className="drop-main">{i.ten || t('common.untitled')}</span>
                    <span className={cx('drop-sub', g.key === 'overdue' && 'warn')}>{t('bell.due', { date: fmtDate(i.dl, lang) })}</span>
                  </button>
                ))}
              </div>
            ) : null
          )}
          {seenCount > 0 && (
            <button className="bell-foot link-btn" onClick={() => setShowSeen(!showSeen)}>
              {showSeen ? t('bell.hideSeen') : t('bell.showSeen', { n: seenCount })}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
