// Thông báo Windows. Giữ tham chiếu đến khi đóng để sự kiện bấm không bị mất.
import { Notification } from 'electron';

const live = new Set<Notification>();

export function showNotification(title: string, body: string, onClick?: () => void): void {
  if (!Notification.isSupported()) return;
  const n = new Notification({ title, body, silent: false });
  live.add(n);
  const drop = () => live.delete(n);
  n.on('click', () => {
    drop();
    onClick?.();
  });
  n.on('close', drop);
  n.on('failed', drop);
  n.show();
}
