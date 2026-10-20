// Cài đặt > Đồng bộ > Online – Google Drive: đăng nhập, cùng tài khoản, tự đồng bộ, bản sao lưu trên Drive.
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { CloudAction, CloudActionResult, CloudInfo } from '../../lib/cloudDriver.ts';
import type { CloudBackup } from '../../core/cloudSync.ts';
import { api } from '../../lib/devApi.ts';
import { confirmRestoreData } from '../../lib/flows.ts';
import { cx } from '../../lib/labels.ts';
import { useApp } from '../../store/app.ts';
import { IWarn } from '../Common/Icons.tsx';
import { openSyncChoice } from './SyncChoiceDialog.tsx';

function when(iso: string | null, lang: string): string {
  return iso ? new Date(iso).toLocaleString(lang) : '—';
}
const kb = (n?: number) => (n === undefined ? '' : n < 1024 ? `${n} B` : `${Math.round(n / 1024)} KB`);

export function CloudSection() {
  const { t } = useTranslation();
  const lang = useApp((s) => s.settings.language);
  const toast = useApp((s) => s.toast);
  const askConfirm = useApp((s) => s.askConfirm);
  const [info, setInfo] = useState<CloudInfo | null>(null);
  const [busy, setBusy] = useState<CloudAction['type'] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [backups, setBackups] = useState<CloudBackup[] | null>(null);

  const refresh = useCallback(() => {
    void api()
      .cloudInfo()
      .then(setInfo)
      .catch(() => undefined);
  }, []);
  useEffect(() => {
    refresh();
    const id = window.setInterval(refresh, 2000);
    return () => window.clearInterval(id);
  }, [refresh]);

  const run = async (a: CloudAction): Promise<CloudActionResult | null> => {
    setBusy(a.type);
    setErr(null);
    try {
      const r = await api().cloudAction(a);
      setInfo(r);
      if (r.error && r.error !== 'cancel') setErr(r.error);
      if (r.choice) openSyncChoice();
      return r;
    } finally {
      setBusy(null);
    }
  };

  if (!info) return null;
  const shownErr = err ?? (info.lastError && info.lastError !== 'choice' ? info.lastError : null);
  const errText = (code: string) => t(`cloud.err.${code}`, { defaultValue: t('cloud.err.server'), owner: info.wrongOwner ?? info.vaultEmail ?? '', email: info.email ?? '' });

  return (
    <div className="set-block cloud-block">
      <h4>{t('cloud.title')}</h4>
      <p className="set-hint">{t('cloud.hint')}</p>
      {!info.configured ? (
        <p className="set-status warn-text">{t('cloud.notConfigured')}</p>
      ) : !info.signedIn ? (
        <>
          {info.lastError === 'relogin' && <p className="set-status err">{t('cloud.err.relogin')}</p>}
          <div className="btn-row">
            <button className="btn btn-primary" disabled={!!busy} onClick={() => void run({ type: 'signIn' })}>
              {busy === 'signIn' ? t('cloud.signingIn') : t('cloud.signIn')}
            </button>
          </div>
          {busy === 'signIn' && <p className="set-hint">{t('cloud.signInWait')}</p>}
          <p className="set-hint">{t('cloud.signInNote')}</p>
          {shownErr && shownErr !== 'relogin' && <p className="set-status err">{errText(shownErr)}</p>}
        </>
      ) : (
        <>
          <dl className="kv">
            <dt>{t('cloud.account')}</dt>
            <dd>
              <b>{info.email}</b>
            </dd>
            {info.vaultEmail && (
              <>
                <dt>{t('cloud.vault')}</dt>
                <dd className={cx(info.wrongOwner && 'err-text')}>{info.vaultEmail}</dd>
              </>
            )}
            <dt>{t('wifi.lastSync')}</dt>
            <dd>{when(info.lastSync, lang)}</dd>
            <dt>{t('cloud.devices')}</dt>
            <dd>{t('cloud.devicesN', { n: info.devices })}</dd>
          </dl>
          {info.wrongOwner && (
            <div className="choice-banner bad">
              <IWarn size={16} />
              <span>{t('cloud.wrongOwner', { owner: info.wrongOwner, email: info.email ?? '' })}</span>
            </div>
          )}
          {info.choice && (
            <div className="choice-banner">
              <IWarn size={16} />
              <span>{t('choice.paused')}</span>
              <button className="btn btn-sm btn-primary" onClick={openSyncChoice}>
                {t('choice.open')}
              </button>
            </div>
          )}
          {info.skewMin !== 0 && <p className="set-hint warn-text">{t('cloud.skew', { n: Math.abs(info.skewMin) })}</p>}
          {shownErr && !info.wrongOwner && <p className="set-status err">{errText(shownErr)}</p>}
          <label className="toggle">
            <span>{t('cloud.auto')}</span>
            <button role="switch" aria-checked={info.auto} className={cx('switch', info.auto && 'on')} onClick={() => void run({ type: 'setAuto', on: !info.auto })}>
              <span className="switch-knob" />
            </button>
          </label>
          <div className="btn-row">
            <button
              className="btn btn-primary"
              disabled={!!busy || info.busy || !!info.wrongOwner}
              onClick={async () => {
                const r = await run({ type: 'syncNow' });
                if (r && !r.error && !r.choice) toast(t('cloud.synced'), 'ok');
              }}
            >
              {busy === 'syncNow' || info.busy ? t('wifi.syncing') : t('wifi.now')}
            </button>
            <button className="btn" disabled={!!busy || info.busy || !!info.wrongOwner} onClick={() => void run({ type: 'preview' })}>
              {t('choice.pick')}
            </button>
            <button
              className="btn"
              disabled={!!busy || !!info.wrongOwner}
              onClick={async () => {
                if (backups) return setBackups(null);
                const r = await run({ type: 'listBackups' });
                if (r?.backups) setBackups(r.backups);
              }}
            >
              {backups ? t('cloud.hideBackups') : t('cloud.backups')}
            </button>
            {info.wrongOwner && (
              <button className="btn" disabled={!!busy} onClick={() => void run({ type: 'signIn' })}>
                {t('cloud.signInAgain')}
              </button>
            )}
            <button
              className="btn"
              onClick={() =>
                askConfirm({
                  title: t('cloud.unlink'),
                  message: t('cloud.unlinkMsg', { email: info.vaultEmail ?? info.email ?? '' }),
                  confirmLabel: t('cloud.unlink'),
                  danger: true,
                  onConfirm: () => void run({ type: 'signOut' }).then(() => setBackups(null))
                })
              }
            >
              {t('cloud.unlink')}
            </button>
          </div>
          {backups && (
            <div className="cloud-backups">
              {backups.length === 0 ? (
                <p className="set-hint">{t('cloud.noBackups')}</p>
              ) : (
                <ul className="people-list">
                  {backups.map((b) => (
                    <li key={b.id} className="person-row">
                      <span className="person-name">
                        {b.kind === 'day' ? t('cloud.backupDay') : t('cloud.backupPre')} · {when(b.at, lang)}
                      </span>
                      <span className="person-count">{kb(b.size)}</span>
                      <button
                        className="btn btn-sm"
                        disabled={!!busy}
                        onClick={async () => {
                          const r = await run({ type: 'readBackup', id: b.id });
                          if (r?.backupData) confirmRestoreData(r.backupData);
                        }}
                      >
                        {t('cloud.restore')}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <p className="set-hint">{t('cloud.backupsHint')}</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
