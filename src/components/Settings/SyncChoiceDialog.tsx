// Hỏi cách đồng bộ khi hai bên khác nhau nhiều (lần đầu, hoặc sắp xóa nhiều việc) — dùng chung cho
// đồng bộ Wi-Fi/cáp (PC ↔ điện thoại) và Google Drive (Drive ↔ máy này).
// Tự động theo giờ sửa · bên này ghi đè bên kia. Hiện số việc mỗi bên sẽ thêm / sửa / xóa.
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { SyncMode, SyncStats } from '../../core/sync.ts';
import { isRisky, lossOf, suggestMode } from '../../core/sync.ts';
import { api } from '../../lib/devApi.ts';
import { useApp } from '../../store/app.ts';
import { cx } from '../../lib/labels.ts';

/** Mở lại hộp thoại từ chỗ khác (Cài đặt > Đồng bộ) */
export const openSyncChoice = () => window.dispatchEvent(new Event('hcn:sync-choice'));

export function SyncChoiceDialog() {
  const { t } = useTranslation();
  const toast = useApp((s) => s.toast);
  const [stats, setStats] = useState<SyncStats | null>(null);
  const [via, setVia] = useState<'lan' | 'cloud'>('lan');
  const [email, setEmail] = useState<string | null>(null);
  const [hidden, setHidden] = useState<SyncStats | null>(null);
  const [mode, setMode] = useState<SyncMode>('merge');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const plat = api().platform;
    if (plat !== 'android' && plat !== 'electron') return;
    let alive = true;
    const poll = () =>
      void Promise.all([plat === 'android' ? api().syncInfo().catch(() => null) : null, api().cloudInfo().catch(() => null)]).then(([lan, cl]) => {
        if (!alive) return;
        // Drive trước (cả PC và điện thoại), rồi tới Wi-Fi/cáp (điện thoại)
        if (cl?.choice) {
          setVia('cloud');
          setEmail(cl.vaultEmail);
          setStats(cl.choice);
        } else {
          setVia('lan');
          setStats(lan?.choice ?? null);
        }
      });
    poll();
    const id = window.setInterval(poll, 2500);
    const reopen = () => {
      setHidden(null);
      poll();
    };
    window.addEventListener('hcn:sync-choice', reopen);
    return () => {
      alive = false;
      window.clearInterval(id);
      window.removeEventListener('hcn:sync-choice', reopen);
    };
  }, []);
  const key = stats ? JSON.stringify(stats) : '';
  useEffect(() => {
    if (stats) setMode(suggestMode(stats));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  if (!stats || (hidden && JSON.stringify(hidden) === key)) return null;
  const s = stats;
  const risky = isRisky(s.pc) || isRisky(s.phone);
  const loss = lossOf(s, mode);
  const go = async () => {
    setBusy(true);
    try {
      if (via === 'cloud') {
        const r = await api().cloudAction({ type: 'resolve', mode });
        if (r.error) toast(t(`cloud.err.${r.error}`, { defaultValue: t('cloud.err.server') }), 'error');
        else toast(t('cloud.synced'), 'ok');
        setStats(r.choice ?? null);
      } else {
        const r = await api().syncAction({ type: 'resolve', mode });
        if (r.error) toast(t(`wifi.err.${r.error === 'too-many' ? 'tooMany' : r.error}`, { defaultValue: t('wifi.err.server') }), 'error');
        else toast(t('choice.done', { n: r.lastChanges ?? 0 }), 'ok');
        setStats(r.choice ?? null);
      }
    } finally {
      setBusy(false);
    }
  };
  const later = () => {
    setHidden(s);
    if (via === 'cloud') void api().cloudAction({ type: 'dismiss' });
    else void api().syncAction({ type: 'dismiss' });
  };
  // nhãn theo đường đồng bộ: Wi-Fi (PC / Điện thoại) hoặc Drive (Drive / Máy này)
  const c = via === 'cloud';
  const k = (key: string) => (c ? `choice.c_${key}` : `choice.${key}`);
  const pcLabel = c ? t('choice.drive') : 'PC';
  const phoneLabel = c ? t('choice.thisDevice') : t('choice.phone');
  const side = (x: SyncStats['pc']) => (
    <>
      <span>+{x.add}</span>
      <span>{t('choice.upd', { n: x.upd })}</span>
      <span className={cx(x.del > 0 && 'ch-del')}>{t('choice.del', { n: x.del })}</span>
    </>
  );
  const opts: { m: SyncMode; title: string; desc: string; result: ReactNode }[] = [
    {
      m: 'merge',
      title: t('choice.merge'),
      desc: t('choice.mergeDesc'),
      result: (
        <div className="ch-res">
          <b>{pcLabel}</b>
          {side(s.pc)}
          <b>{phoneLabel}</b>
          {side(s.phone)}
        </div>
      )
    },
    {
      m: 'pull',
      title: t(k('pull')),
      desc: t(k('pullDesc'), { n: s.pc.total }),
      result: <div className={cx('ch-res', s.phoneOnly > 0 && 'warn')}>{t(k('pullRes'), { lost: s.phoneOnly, rep: s.differ })}</div>
    },
    {
      m: 'push',
      title: t(k('push')),
      desc: t(k('pushDesc'), { n: s.phone.total }),
      result: <div className={cx('ch-res', s.pcOnly > 0 && 'warn')}>{t(k('pushRes'), { lost: s.pcOnly, rep: s.differ })}</div>
    }
  ];
  return (
    <div className="modal-backdrop">
      <div className="confirm sync-choice" role="dialog" aria-modal="true" aria-labelledby="sc-title">
        <h2 id="sc-title">{t('choice.title')}</h2>
        <p>{risky ? t(k(isRisky(s.pc) ? 'riskPc' : 'riskPhone'), { n: isRisky(s.pc) ? s.pc.del : s.phone.del }) : t(k('first'))}</p>
        {c && email && <p className="set-hint">{t('choice.account', { email })}</p>}
        <div className="ch-sides">
          <div>
            <span>{pcLabel}</span>
            <b>{t('choice.tasks', { n: s.pc.total })}</b>
          </div>
          <div>
            <span>{phoneLabel}</span>
            <b>{t('choice.tasks', { n: s.phone.total })}</b>
          </div>
        </div>
        <div className="ch-opts" role="radiogroup">
          {opts.map((o) => (
            <button key={o.m} role="radio" aria-checked={mode === o.m} className={cx('ch-opt', mode === o.m && 'on')} onClick={() => setMode(o.m)}>
              <span className="ch-dot" aria-hidden />
              <span className="ch-body">
                <b>
                  {o.title}
                  {o.m === suggestMode(s) && <em className="ch-tag">{t('choice.suggest')}</em>}
                </b>
                <span>{o.desc}</span>
                {o.result}
              </span>
            </button>
          ))}
        </div>
        <p className="set-hint">{t(k('backupNote'))}</p>
        <div className="confirm-actions">
          <button className="btn" disabled={busy} onClick={later}>
            {t('choice.later')}
          </button>
          <button className={cx('btn', loss >= 3 ? 'btn-danger' : 'btn-primary')} disabled={busy} onClick={() => void go()}>
            {busy ? t('wifi.syncing') : loss > 0 ? t('choice.goLoss', { n: loss }) : t('choice.go')}
          </button>
        </div>
      </div>
    </div>
  );
}
