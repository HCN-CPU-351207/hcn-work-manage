// Hộp xác nhận, thông báo nổi (toast) và toast cập nhật
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useApp } from '../../store/app.ts';
import { cx } from '../../lib/labels.ts';
import { api } from '../../lib/devApi.ts';
import { IX } from './Icons.tsx';

export function ConfirmDialog() {
  const { t } = useTranslation();
  const c = useApp((s) => s.confirm);
  const ask = useApp((s) => s.askConfirm);
  const okRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (c) okRef.current?.focus();
  }, [c]);
  if (!c) return null;
  const close = () => ask(null);
  return (
    <div className="modal-backdrop" onMouseDown={close}>
      <div className="confirm" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" onMouseDown={(e) => e.stopPropagation()}>
        <h2 id="confirm-title">{c.title}</h2>
        <p>{c.message}</p>
        <div className="confirm-actions">
          <button className="btn" onClick={close}>
            {t('common.cancel')}
          </button>
          <button
            ref={okRef}
            className={cx('btn', c.danger ? 'btn-danger' : 'btn-primary')}
            onClick={async () => {
              close();
              await c.onConfirm();
            }}
          >
            {c.confirmLabel ?? t('common.ok')}
          </button>
        </div>
      </div>
    </div>
  );
}

export function Toasts() {
  const { t } = useTranslation();
  const toasts = useApp((s) => s.toasts);
  const dismiss = useApp((s) => s.dismissToast);
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((x) => (
        <div key={x.id} className={cx('toast', `toast-${x.kind}`)}>
          <span className="toast-text">{x.text}</span>
          {x.action && (
            <button
              className="toast-action"
              onClick={() => {
                x.action!.run();
                dismiss(x.id);
              }}
            >
              {t(x.action.label)}
            </button>
          )}
          {x.undo && <span className="toast-timer" style={{ animationDuration: `${x.ttl}ms` }} />}
          <button className="icon-btn toast-x" aria-label={t('common.close')} onClick={() => dismiss(x.id)}>
            <IX size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}

/** "Có bản cập nhật vX.Y.Z. [Cài và khởi động lại] [Để sau]" (mục 4.2) */
export function UpdateToast() {
  const { t } = useTranslation();
  const u = useApp((s) => s.update);
  const dismiss = useApp((s) => s.dismissUpdate);
  const flush = useApp((s) => s.flush);
  if (u.status !== 'ready' || u.dismissed) return null;
  return (
    <div className="update-toast" role="status">
      <span>{t('update.ready', { v: u.version })}</span>
      <button
        className="btn btn-primary btn-sm"
        onClick={async () => {
          await flush();
          await api().installUpdate();
        }}
      >
        {t('update.installNow')}
      </button>
      <button className="btn btn-sm" onClick={dismiss}>
        {t('update.later')}
      </button>
    </div>
  );
}
