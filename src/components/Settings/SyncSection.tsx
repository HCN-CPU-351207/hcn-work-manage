// Cài đặt > Đồng bộ: PC là trạm (bật trạm, tình trạng sẵn sàng + tường lửa, địa chỉ, mã ghép đôi, điện thoại);
// điện thoại là máy con (chỉ cần mã ghép đôi — tự tìm PC, đồng bộ ngay, kiểm tra kết nối, ngắt kết nối).
import { useCallback, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { SyncAction, SyncActionResult, SyncInfo } from '../../core/api.ts';
import type { DiagReport, ProbeResult } from '../../lib/syncClient.ts';
import { useApp } from '../../store/app.ts';
import { api } from '../../lib/devApi.ts';
import { cx } from '../../lib/labels.ts';
import { ICheck, ITrash, IWarn, IX } from '../Common/Icons.tsx';
import { openSyncChoice } from './SyncChoiceDialog.tsx';
import { CloudSection } from './CloudSection.tsx';

const ERR_KEY: Record<string, string> = {
  code: 'wifi.err.code',
  unpaired: 'wifi.err.unpaired',
  'too-many': 'wifi.err.tooMany',
  network: 'wifi.err.network',
  timeout: 'wifi.err.timeout',
  schema: 'wifi.err.schema',
  server: 'wifi.err.server',
  addr: 'wifi.err.addr',
  notFound: 'wifi.err.notFound',
  firewall: 'wifi.err.firewall',
  account: 'wifi.err.account'
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
  const [busy, setBusy] = useState<SyncAction['type'] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const run = async (a: SyncAction) => {
    setBusy(a.type);
    setErr(null);
    try {
      const r = await api().syncAction(a);
      setInfo(r);
      // 'choice': không phải lỗi — hộp thoại chọn cách đồng bộ sẽ hiện
      if (r.error === 'choice') openSyncChoice();
      else if (r.error) setErr(r.error);
      return r;
    } finally {
      setBusy(null);
    }
  };
  if (!info) return null;
  if (info.role === 'none') return <Block hint={t('wifi.unavailable')} />;
  return (
    <>
      <CloudSection />
      <div className="set-block sync-lan-head">
        <h4>{t('cloud.lanTitle')}</h4>
      </div>
      {info.role === 'hub' ? <HubView info={info} busy={busy} err={err} run={run} /> : <ClientView info={info} busy={busy} err={err} run={run} />}
    </>
  );
}

type ViewProps = { info: SyncInfo; busy: SyncAction['type'] | null; err: string | null; run: (a: SyncAction) => Promise<SyncActionResult> };

function when(iso: string | null, lang: string, never: string): string {
  return iso ? new Date(iso).toLocaleString(lang) : never;
}

/** Một dòng kiểm tra: dấu ✓ / ⚠ / ✗ + nội dung */
function Check({ state, children }: { state: 'ok' | 'warn' | 'bad' | 'wait'; children: ReactNode }) {
  return (
    <li className={cx('chk', `chk-${state}`)}>
      <span className="chk-ic" aria-hidden>
        {state === 'ok' ? <ICheck size={14} /> : state === 'bad' ? <IX size={14} /> : state === 'warn' ? <IWarn size={14} /> : '…'}
      </span>
      <div className="chk-body">{children}</div>
    </li>
  );
}

function HubView({ info, busy, err, run }: ViewProps) {
  const { t } = useTranslation();
  const lang = useApp((s) => s.settings.language);
  const loginOn = useApp((s) => !!s.settings.launchAtLogin);
  const setSettings = useApp((s) => s.setSettings);
  const askConfirm = useApp((s) => s.askConfirm);
  const toast = useApp((s) => s.toast);
  const fw = info.firewall;
  const anyPublic = info.links.some((l) => l.profile === 'public');
  return (
    <>
      <Block hint={t('wifi.hubHint')}>
        <label className="toggle">
          <span>{t('wifi.enable')}</span>
          <button role="switch" aria-checked={info.enabled} disabled={!!busy} className={cx('switch', info.enabled && 'on')} onClick={() => void run({ type: info.enabled ? 'disable' : 'enable' })}>
            <span className="switch-knob" />
          </button>
        </label>
        {err && <p className="set-status err">{t(ERR_KEY[err] ?? 'wifi.err.server')}</p>}
      </Block>
      {info.enabled && (
        <>
          <Block title={t('wifi.ready')}>
            <ul className="chk-list">
              <Check state="ok">{t('wifi.st.running', { port: info.port })}</Check>
              {fw !== undefined && (
                <Check state={fw === null ? 'wait' : fw === 'ok' ? 'ok' : fw === 'unknown' ? 'warn' : fw === 'blocked' ? 'bad' : 'warn'}>
                  <span>{t(fw === null ? 'wifi.st.fwChecking' : `wifi.st.fw_${fw}`)}</span>
                  {(fw === 'missing' || fw === 'blocked') && (
                    <div className="chk-act">
                      <button
                        className="btn btn-sm btn-primary"
                        disabled={!!busy}
                        onClick={async () => {
                          const r = await run({ type: 'fixFirewall' });
                          if (!r.error) toast(t('wifi.fwFixed'), 'ok');
                        }}
                      >
                        {busy === 'fixFirewall' ? t('wifi.fixingFw') : t('wifi.fixFw')}
                      </button>
                      <span className="set-hint">{t('wifi.fixFwHint')}</span>
                    </div>
                  )}
                </Check>
              )}
              {info.keepsRunning && <Check state="ok">{t('wifi.st.tray')}</Check>}
              <Check state={loginOn ? 'ok' : 'warn'}>
                <span>{t(loginOn ? 'wifi.st.loginOn' : 'wifi.st.loginOff')}</span>
                {!loginOn && (
                  <div className="chk-act">
                    <button className="btn btn-sm" onClick={() => setSettings({ launchAtLogin: true })}>
                      {t('wifi.st.loginBtn')}
                    </button>
                  </div>
                )}
              </Check>
            </ul>
          </Block>
          <Block title={t('wifi.addresses')} hint={t('wifi.addressesHint')}>
            {info.links.length ? (
              <div className="wifi-addrs">
                {info.links.map((l) => (
                  <div key={l.address} className="wifi-link">
                    <span className={cx('link-kind', `link-${l.kind}`)}>{t(`wifi.kind.${l.kind}`)}</span>
                    <code className="wifi-big">{`${l.address}:${info.port}`}</code>
                    {l.profile && <span className={cx('net-prof', l.profile === 'public' && 'warn')}>{t(`wifi.profile.${l.profile}`)}</span>}
                    {l.name && <span className="net-name">{l.name}</span>}
                  </div>
                ))}
              </div>
            ) : (
              <p className="set-status err">{t('wifi.noAddress')}</p>
            )}
            {anyPublic && fw !== 'ok' && <p className="set-hint warn-text">{t('wifi.publicWarn')}</p>}
          </Block>
          <Block title={t('wifi.code')} hint={t('wifi.codeHint')}>
            <div className="path-row">
              <code className="wifi-big wifi-code">{info.pairCode}</code>
              <button className="btn btn-sm" disabled={!!busy} onClick={() => void run({ type: 'regen' })}>
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
          <Block title={t('wifi.tetherTitle')} hint={t('wifi.tetherHint')}>
            <ol className="howto">
              <li>{t('wifi.tetherUsb')}</li>
              <li>{t('wifi.tetherBt')}</li>
              <li>{t('wifi.tetherThen')}</li>
            </ol>
            <p className="set-hint">{t('wifi.iphone')}</p>
          </Block>
        </>
      )}
    </>
  );
}

function probeText(p: ProbeResult, t: (k: string, o?: Record<string, unknown>) => string): string {
  if (p.ok) return t('wifi.diag.r.ok', { ms: p.ms, name: p.name || 'PC' });
  return t(`wifi.diag.r.${p.reason === 'not-hcn' ? 'notHcn' : p.reason}`);
}

/** Kết quả "Kiểm tra kết nối" trên điện thoại */
function DiagPanel({ report }: { report: DiagReport }) {
  const { t } = useTranslation();
  return (
    <div className="diag">
      <h5>{t('wifi.diag.nets')}</h5>
      {report.nets === null ? (
        <p className="set-hint">{t('wifi.diag.netsUnknown')}</p>
      ) : report.nets.length === 0 ? (
        <p className="set-hint warn-text">{t('wifi.diag.netsNone')}</p>
      ) : (
        <div className="diag-nets">
          {report.nets.map((n) => (
            <span key={`${n.name}-${n.address}`} className="diag-net">
              <span className={cx('link-kind', `link-${n.kind === 'other' ? 'lan' : n.kind}`)}>{t(`wifi.kind.${n.kind}`)}</span>
              <code>{n.address}</code>
            </span>
          ))}
        </div>
      )}
      <h5>{t('wifi.diag.probes')}</h5>
      {report.probes.length === 0 ? (
        <p className="set-hint">{t('wifi.diag.noProbes')}</p>
      ) : (
        <ul className="chk-list">
          {report.probes.map((p) => (
            <Check key={p.addr} state={p.ok ? 'ok' : 'bad'}>
              <code>{p.addr}</code> — {probeText(p, t)}
            </Check>
          ))}
        </ul>
      )}
      {report.found.length > 0 && (
        <>
          <h5>{t('wifi.diag.found')}</h5>
          <ul className="chk-list">
            {report.found.map((f) => (
              <Check key={f.addr} state="ok">
                <b>{f.name || 'PC'}</b> <code>{f.addr}</code>
              </Check>
            ))}
          </ul>
        </>
      )}
      <h5>{t('wifi.diag.cause')}</h5>
      <ul className="diag-hints">
        {report.hints.map((h) => (
          <li key={h} className={cx('diag-hint', (h === 'ok' || h === 'addrChanged') && 'good')}>
            <b>{t(`wifi.diag.h.${h}.t`)}</b>
            <span>{t(`wifi.diag.h.${h}.d`)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ClientView({ info, busy, err, run }: ViewProps) {
  const { t } = useTranslation();
  const lang = useApp((s) => s.settings.language);
  const askConfirm = useApp((s) => s.askConfirm);
  const toast = useApp((s) => s.toast);
  const [addr, setAddr] = useState(info.hubAddr ?? '');
  const [manual, setManual] = useState(false);
  const [code, setCode] = useState('');
  const [name, setName] = useState('Android');
  const [found, setFound] = useState<{ addr: string; name: string }[]>([]);
  const [report, setReport] = useState<DiagReport | null>(null);
  const shownErr = err ?? (info.lastError === 'choice' ? null : info.lastError);
  const check = async () => {
    setReport(null);
    const r = await run({ type: 'diagnose' });
    if (r.report) setReport(r.report);
    if (r.found?.length) setFound(r.found);
  };
  const discover = async () => {
    setFound([]);
    const r = await run({ type: 'discover' });
    setFound(r.found ?? []);
  };
  const checkBtn = (
    <button className="btn" disabled={!!busy || info.busy} onClick={() => void check()}>
      {busy === 'diagnose' ? t('wifi.checking') : t('wifi.check')}
    </button>
  );

  if (!info.enabled) {
    return (
      <>
        <Block hint={t('wifi.clientHint')}>
          <label className="field narrow">
            <span>{t('wifi.pairCode')}</span>
            <input value={code} inputMode="numeric" maxLength={6} placeholder="123456" onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} />
          </label>
          <label className="field narrow">
            <span>{t('wifi.deviceName')}</span>
            <input value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          {manual || addr ? (
            <label className="field narrow">
              <span>{t('wifi.addrOptional')}</span>
              <input value={addr} inputMode="decimal" placeholder={t('wifi.addrPlaceholder')} onChange={(e) => setAddr(e.target.value)} />
            </label>
          ) : (
            <button className="link-btn" onClick={() => setManual(true)}>
              {t('wifi.manualAddr')}
            </button>
          )}
          <div className="btn-row">
            <button
              className="btn btn-primary"
              disabled={!!busy || code.length !== 6}
              onClick={async () => {
                const r = await run({ type: 'pair', addr, code, name });
                if (r.enabled && (!r.error || r.error === 'choice')) toast(t('wifi.connected', { name: r.hubName ?? '' }), 'ok');
              }}
            >
              {busy === 'pair' ? (addr ? t('wifi.connecting') : t('wifi.connectingAuto')) : t('wifi.connect')}
            </button>
            <button className="btn" disabled={!!busy} onClick={() => void discover()}>
              {busy === 'discover' ? t('wifi.searching') : t('wifi.discover')}
            </button>
            {checkBtn}
          </div>
          {found.length > 0 && (
            <div className="found-list">
              <p className="set-status">{t('wifi.foundN', { n: found.length })}</p>
              {found.map((f) => (
                <button key={f.addr} className={cx('found-item', addr === f.addr && 'on')} onClick={() => setAddr(f.addr)}>
                  <b>{f.name || 'PC'}</b>
                  <code>{f.addr}</code>
                </button>
              ))}
            </div>
          )}
          {shownErr && <p className="set-status err">{t(ERR_KEY[shownErr] ?? 'wifi.err.server')}</p>}
          <p className="set-hint">{t('wifi.clientTether')}</p>
        </Block>
        {report && (
          <Block title={t('wifi.diag.title')}>
            <DiagPanel report={report} />
          </Block>
        )}
      </>
    );
  }
  return (
    <>
      <Block hint={t('wifi.auto')}>
        <dl className="kv">
          <dt>{t('wifi.hub')}</dt>
          <dd>{info.hubName ?? '—'}</dd>
          <dt>{t('wifi.route')}</dt>
          <dd className="route-dd">
            {info.route && <span className={cx('link-kind', `link-${info.route === 'other' ? 'lan' : info.route}`)}>{t(`wifi.kind.${info.route}`)}</span>}
            <code>{info.hubAddr}</code>
          </dd>
          <dt>{t('wifi.lastSync')}</dt>
          <dd>{when(info.lastSync, lang, t('wifi.never'))}</dd>
          {info.hubHosts.length > 1 && (
            <>
              <dt>{t('wifi.routes')}</dt>
              <dd className="small">{info.hubHosts.join(' · ')}</dd>
            </>
          )}
        </dl>
        {shownErr && <p className="set-status err">{t(ERR_KEY[shownErr] ?? 'wifi.err.server')}</p>}
        {info.choice && (
          <div className="choice-banner">
            <IWarn size={16} />
            <span>{t('choice.paused')}</span>
            <button className="btn btn-sm btn-primary" onClick={openSyncChoice}>
              {t('choice.open')}
            </button>
          </div>
        )}
        <div className="btn-row">
          <button
            className="btn btn-primary"
            disabled={!!busy || info.busy}
            onClick={async () => {
              const r = await run({ type: 'syncNow' });
              if (!r.error) toast(t('wifi.done', { n: r.lastChanges ?? 0 }), 'ok');
            }}
          >
            {busy === 'syncNow' || info.busy ? t('wifi.syncing') : t('wifi.now')}
          </button>
          <button className="btn" disabled={!!busy || info.busy} onClick={() => void run({ type: 'preview' }).then((r) => r.choice && openSyncChoice())}>
            {busy === 'preview' ? t('wifi.checking') : t('choice.pick')}
          </button>
          {checkBtn}
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
      {report && (
        <Block title={t('wifi.diag.title')}>
          <DiagPanel report={report} />
        </Block>
      )}
    </>
  );
}
