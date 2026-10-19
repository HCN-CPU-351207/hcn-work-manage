// Chạy nhắc việc: mỗi 30 giây kiểm tra mốc đã tới để báo; trên Android còn hẹn giờ
// các mốc sắp tới bằng hệ thống để báo cả khi app đã tắt.
import i18n from '../i18n/index.ts';
import type { ScheduledNote } from '../core/api.ts';
import { computeReminders, dueReminders, reminderNumId, upcomingReminders } from '../core/reminders.ts';
import type { Reminder } from '../core/reminders.ts';
import { useApp } from '../store/app.ts';
import { api } from './devApi.ts';
import { fmtDate } from './fmt.ts';

const t = (k: string, o?: Record<string, unknown>) => i18n.t(k, o) as string;

export function reminderText(r: Reminder): { title: string; body: string } {
  const lang = useApp.getState().settings.language;
  const when = r.level === 'ngay' ? r.when : fmtDate(r.when, lang);
  return {
    title: t(`rem.${r.kind}`, { ma: r.ma, when }),
    body: r.ten || t('common.untitled')
  };
}

export function startReminders(): () => void {
  const osScheduled = new Set<string>();
  let lastSig = '';
  let timer: number | undefined;

  const tick = () => {
    const st = useApp.getState();
    if (!st.ready) return;
    const now = Date.now();
    const list = computeReminders(st.data, st.settings, now);
    const due = dueReminders(list, now, st.data.reminded);
    // Android đã tự báo những mốc được hẹn giờ trước đó; chỉ cần đánh dấu "đã báo"
    const toShow = due.filter((r) => !osScheduled.has(r.key));
    if (toShow.length === 1 || toShow.length === 2) {
      for (const r of toShow) void api().notify({ ...reminderText(r), level: r.level, id: r.id });
    } else if (toShow.length > 2) {
      const first = toShow[0];
      void api().notify({
        title: t('rem.summary', { n: toShow.length }),
        body: toShow.slice(0, 4).map((r) => `${r.ma} ${r.ten}`).join(' · ') + (toShow.length > 4 ? ' …' : ''),
        level: first.level,
        id: first.id
      });
    }
    if (due.length) {
      const mark = Object.fromEntries(due.map((r) => [r.key, now]));
      st.mutate((d) => ({ ...d, reminded: { ...(d.reminded ?? {}), ...mark } }));
    }
    if (api().platform === 'android') {
      const up = upcomingReminders(list, now, 60);
      const sig = up.map((r) => `${r.key}@${r.at}`).join('|');
      if (sig !== lastSig) {
        lastSig = sig;
        const notes: ScheduledNote[] = up.map((r) => ({ nid: reminderNumId(r.key), at: r.at, level: r.level, id: r.id, ...reminderText(r) }));
        void api().scheduleReminders(notes);
        for (const r of up) osScheduled.add(r.key);
      }
    }
  };

  // dữ liệu hoặc cài đặt đổi → tính lại sau 2 giây
  const unsub = useApp.subscribe((s, p) => {
    if (s.data !== p.data || s.settings !== p.settings || s.ready !== p.ready) {
      window.clearTimeout(timer);
      timer = window.setTimeout(tick, 2000);
    }
  });
  const iv = window.setInterval(tick, 30_000);
  timer = window.setTimeout(tick, 3000);
  const offOpen = api().onOpenTask((level, id) => useApp.getState().navigateTo(level, id, true));
  return () => {
    unsub();
    offOpen();
    window.clearInterval(iv);
    window.clearTimeout(timer);
  };
}
