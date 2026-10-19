// Cài đặt > Đồng bộ: PC là trạm (bật trạm, địa chỉ, mã ghép đôi, danh sách điện thoại);
// điện thoại là máy con (nhập địa chỉ + mã, đồng bộ ngay, ngắt kết nối).
import { useCallback, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { SyncAction, SyncInfo } from '../../core/api.ts';
import { useApp } from '../../store/app.ts';
import { api } from '../../lib/devApi.ts';
import { cx } from '../../lib/labels.ts';
import { ITrash } from '../Common/Icons.tsx';

const ERR_KEY: Record<string, string> = {
  code: 'wifi.err.code',
  unpaired: 'wifi.err.unpaired',
  'too-many': 'wifi.err.tooMany',
  network: 'wifi.err.network',
  timeout: 'wifi.err.timeout',
  schema: 'wifi.err.schema',
  server: 'wifi.err.server',
  addr: 'wifi.err.addr'
};

function useSyncInfo() {
  const [info, setInfo] = useState<SyncInfo | null>(null);
  const refresh = useCallback(() => {
    void api().syncInfo().then(setInfo);
  }, []);
  useEffect(() => {
    refresh();
    const id = window.setInterval(refresh, 2000);
    return () => window.clearInterval(id);
  }, [refresh]);
  return { info, setInfo, refresh };
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

export function SyncSection() {
  const { t } = useTranslation();
  const { info, setInfo } = useSyncInfo();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const run = async (a: SyncAction) => {
    setBusy(true);
    setErr(null);
    try {
      const r = await api().syncAction(a);
      setInfo(r);
      if (r.error) setErr(r.error);
      return r;
    } finally {
      setBusy(false);
    }
  };
  if (!info) return null;
  if (info.role === 'none') return <Block hint={t('wifi.unavailable')} />;
  return info.role === 'hub' ? <HubView info={info} busy={busy} err={err} run={run} /> : <ClientView info={info} busy={busy} err={err} run={run} />;
}

type ViewProps = { info: SyncInfo; busy: boolean; err: string | null; run: (a: SyncAction) => Promise<SyncInfo & { error?: string }> };

function when(iso: string | null, lang: string, never: string): string {
  return iso ? new Date(iso).toLocaleString(lang) : never;
}

function HubView({ info, busy, err, run }: ViewProps) {
  const { t } = useTranslation();
  const lang = useApp((s) => s.settings.language);
  const askConfirm = useApp((s) => s.askConfirm);
  return (
    <>
      <Block hint={t('wifi.hubHint')}>
        <label className="toggle">
          <span>{t('wifi.enable')}</span>
          <button role="switch" aria-checked={info.enabled} disabled={busy} className={cx('switch', info.enabled && 'on')} onClick={() => void run({ type: info.enabled ? 'disable' : 'enable' })}>
            <span className="switch-knob" />
          </button>
        </label>
        {err && <p className="set-status err">{t(ERR_KEY[err] ?? 'wifi.err.server')}</p>}
      </Block>
      {info.enabled && (
        <>
          <Block title={t('wifi.addresses')} hint={t('wifi.addressesHint')}>
            {info.addresses.length ? (
              <div className="wifi-addrs">
                {info.addresses.map((a) => (
                  <code key={a} className="wifi-big">{`${a}:${info.port}`}</code>
                ))}
              </div>
            ) : (
              <p className="set-status err">{t('wifi.noAddress')}</p>
            )}
          </Block>
          <Block title={t('wifi.code')} hint={t('wifi.codeHint')}>
            <div className="path-row">
              <code className="wifi-big wifi-code">{info.pairCode}</code>
              <button className="btn btn-sm" disabled={busy} onClick={() => void run({ type: 'regen' })}>
                {t('wifi.regen')}
              </button>
            </div>
          </Block>
          <Block title={t('wifi.devices')}>
            {info.devices.length === 0 ? (
              <p className="set-hint">{t('wifi.noDevices')}</p>
            ) : (
              <ul className="people-list">
                {info.devices.map((d) => (
                  <li key={d.id} className="person-row">
                    <span className="person-name">{d.name}</span>
                    <span className="person-count">{t('wifi.lastSeen', { time: when(d.lastSeen, lang, t('wifi.never')) })}</span>
                    <button
                      className="icon-btn sm qa-del"
                      aria-label={t('wifi.remove')}
                      title={t('wifi.remove')}
                      onClick={() =>
                        askConfirm({
                          title: t('wifi.removeTitle'),
                          message: t('wifi.removeMsg', { name: d.name }),
                          confirmLabel: t('wifi.remove'),
                          danger: true,
                          onConfirm: () => void run({ type: 'removeDevice', id: d.id })
                        })
                      }
                    >
                      <ITrash size={14} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {info.lastSync && <p className="set-hint">{t('wifi.lastSyncLine', { time: when(info.lastSync, lang, ''), n: info.lastChanges ?? 0 })}</p>}
          </Block>
          <Block hint={t('wifi.firewall')} />
        </>
      )}
    </>
  );
}

function ClientView({ info, busy, err, run }: ViewProps) {
  const { t } = useTranslation();
  const lang = useApp((s) => s.settings.language);
  const askConfirm = useApp((s) => s.askConfirm);
  const toast = useApp((s) => s.toast);
  const [addr, setAddr] = useState(info.hubAddr ?? '');
  const [code, setCode] = useState('');
  const [name, setName] = useState('Android');
  const shownErr = err ?? info.lastError;

  if (!info.enabled) {
    return (
      <Block hint={t('wifi.clientHint')}>
        <label className="field narrow">
          <span>{t('wifi.addr')}</span>
          <input value={addr} inputMode="decimal" placeholder={t('wifi.addrPlaceholder')} onChange={(e) => setAddr(e.target.value)} />
        </label>
        <label className="field narrow">
          <span>{t('wifi.pairCode')}</span>
          <input value={code} inputMode="numeric" maxLength={6} placeholder="123456" onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} />
        </label>
        <label className="field narrow">
          <span>{t('wifi.deviceName')}</span>
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <div className="btn-row">
          <button
            className="btn btn-primary"
            disabled={busy || !addr.trim() || code.length !== 6}
            onClick={async () => {
              const r = await run({ type: 'pair', addr, code, name });
              if (r.enabled && !r.error) toast(t('wifi.connected', { name: r.hubName ?? '' }), 'ok');
            }}
          >
            {busy ? t('wifi.connecting') : t('wifi.connect')}
          </button>
        </div>
        {shownErr && <p className="set-status err">{t(ERR_KEY[shownErr] ?? 'wifi.err.server')}</p>}
      </Block>
    );
  }
  return (
    <>
      <Block hint={t('wifi.auto')}>
        <dl className="kv">
          <dt>{t('wifi.hub')}</dt>
          <dd>{info.hubName ?? '—'}</dd>
          <dt>{t('wifi.addr')}</dt>
          <dd>
            <code>{info.hubAddr}</code>
          </dd>
          <dt>{t('wifi.lastSync')}</dt>
          <dd>{when(info.lastSync, lang, t('wifi.never'))}</dd>
        </dl>
        {shownErr && <p className="set-status err">{t(ERR_KEY[shownErr] ?? 'wifi.err.server')}</p>}
        <div className="btn-row">
          <button
            className="btn btn-primary"
            disabled={busy || info.busy}
            onClick={async () => {
              const r = await run({ type: 'syncNow' });
              if (!r.error) toast(t('wifi.done', { n: r.lastChanges ?? 0 }), 'ok');
            }}
          >
            {busy || info.busy ? t('wifi.syncing') : t('wifi.now')}
          </button>
          <button
            className="btn"
            onClick={() =>
              askConfirm({
                title: t('wifi.unpair'),
                message: t('wifi.unpairMsg'),
                confirmLabel: t('wifi.unpair'),
                danger: true,
                onConfirm: () => void run({ type: 'unpair' })
              })
            }
          >
            {t('wifi.unpair')}
          </button>
        </div>
      </Block>
    </>
  );
}
