// Các luồng thao tác dùng chung (lệnh "/", xuất, sao lưu, khôi phục, xóa có xác nhận, nút nhanh)
import i18n from '../i18n/index.ts';
import { completeTree, endNgay, endRange, resetNgay, resetRange, startNgay, startRange } from '../core/actions.ts';
import { nowIso, todayStr } from '../core/dates.ts';
import { MigrationError, parseImport } from '../core/migrate.ts';
import type { Level, Quick, Status } from '../core/model.ts';
import { cancelItems, cascadeCounts, hasKids, restoreItems } from '../core/ops.ts';
import type { CommandId } from '../core/search.ts';
import { derive } from '../core/status.ts';
import { useApp } from '../store/app.ts';
import { api } from './devApi.ts';
import { buildAll, buildSheet } from './excel.ts';

const t = (k: string, o?: Record<string, unknown>) => i18n.t(k, o) as string;
const S = () => useApp.getState();

export async function exportAll(): Promise<void> {
  const { data } = S();
  const r = await api().exportExcel({ defaultName: `hcn-export-${todayStr()}.xlsx`, sheets: buildAll(data, derive(data, todayStr()), i18n.t) });
  if (r.ok) S().toast(t('toast.exported'), 'ok');
  else if (!r.canceled) S().toast(t('toast.exportFail', { msg: r.error ?? '' }), 'error');
}

export async function exportSelected(level: Level, ids: string[]): Promise<void> {
  const { data } = S();
  const sheet = buildSheet(level, data, derive(data, todayStr()), i18n.t, new Set(ids));
  const r = await api().exportExcel({ defaultName: `hcn-${level}-${todayStr()}.xlsx`, sheets: [sheet] });
  if (r.ok) S().toast(t('toast.exported'), 'ok');
  else if (!r.canceled) S().toast(t('toast.exportFail', { msg: r.error ?? '' }), 'error');
}

export async function backupNow(): Promise<void> {
  await S().flush();
  const r = await api().backupJson(S().data);
  if (r.ok) S().toast(t('toast.backedUp'), 'ok');
  else if (!r.canceled) S().toast(t('toast.backupFail', { msg: r.error ?? '' }), 'error');
}

/** Khôi phục (mục 7.3): kiểm tra file, xem trước, sao lưu pre-restore, ghi đè */
export async function restoreFlow(): Promise<void> {
  const pick = await api().pickRestore();
  if (pick.canceled) return;
  if (pick.error || pick.raw === undefined) {
    S().toast(t('restore.invalid'), 'error');
    return;
  }
  let parsed;
  try {
    parsed = parseImport(pick.raw);
  } catch (e) {
    const code = e instanceof MigrationError ? e.code : 'INVALID_FILE';
    S().toast(code === 'FUTURE_SCHEMA' ? t('restore.future') : t('restore.invalid'), 'error');
    return;
  }
  const { summary } = parsed;
  S().askConfirm({
    title: t('restore.title'),
    message: t('restore.preview', { m: summary.thang, w: summary.tuan, d: summary.ngay, p: summary.people }),
    confirmLabel: t('restore.confirm'),
    onConfirm: async () => {
      await S().flush();
      const r = await api().restore(parsed.data);
      if (!r.ok) {
        S().toast(t('restore.fail', { msg: r.error ?? '' }), 'error');
        return;
      }
      const st = S();
      st.replaceData(parsed.data, r.rev);
      if (st.settings.currentPersonId && !parsed.data.people.some((p) => p.id === st.settings.currentPersonId)) {
        st.setSettings({ currentPersonId: null });
      }
      st.toast(t('restore.done'), 'ok');
    }
  });
}

/** Xóa có xác nhận + Hoàn tác 8 giây (mục 6.10, X21) */
export function confirmDelete(level: Level, ids: string[]): void {
  if (!ids.length) return;
  const { data } = S();
  const c = cascadeCounts(data, level, ids);
  const message =
    level === 'ngay'
      ? t('del.messageSimple', { n: ids.length })
      : level === 'tuan'
        ? t('del.messageTuan', { n: ids.length, d: c.ngay })
        : t('del.messageThang', { n: ids.length, w: c.tuan, d: c.ngay });
  S().askConfirm({
    title: t('del.title'),
    message,
    confirmLabel: t('del.confirm'),
    danger: true,
    onConfirm: () => S().removeWithUndo(level, ids, t('del.done', { n: ids.length + c.tuan + c.ngay }))
  });
}

/** Hủy việc (hỏi lý do, không bắt buộc). Việc con chưa xong bị hủy theo; việc đã làm vẫn giữ. */
export function cancelFlow(level: Level, ids: string[]): void {
  const st = S();
  const pool: { id: string; huy?: unknown }[] = level === 'thang' ? st.data.thang : level === 'tuan' ? st.data.tuan : st.data.ngay;
  const todo = ids.filter((id) => pool.some((x) => x.id === id && !x.huy));
  if (!todo.length) return;
  st.askConfirm({
    title: t('cancel.title', { n: todo.length }),
    message: level === 'ngay' ? t('cancel.msgNgay') : t('cancel.msgParent'),
    confirmLabel: t('cancel.confirm'),
    cancelLabel: t('cancel.keep'),
    danger: true,
    input: { label: t('cancel.reason'), placeholder: t('cancel.reasonPh') },
    onConfirm: (reason) => {
      let n = 0;
      st.mutate((d) => {
        const r = cancelItems(d, level, todo, nowIso(), reason);
        n = r.count;
        return r.data;
      });
      st.toast(t('cancel.done', { n }), 'ok', { action: { label: t('cancel.undo'), run: () => restoreNow(level, todo) } });
    }
  });
}

function restoreNow(level: Level, ids: string[]): number {
  let n = 0;
  S().mutate((d) => {
    const r = restoreItems(d, level, ids);
    n = r.count;
    return r.data;
  });
  return n;
}

/** Khôi phục việc đã hủy (kèm việc con bị hủy theo nó) */
export function restoreCancelled(level: Level, ids: string[]): void {
  const n = restoreNow(level, ids);
  if (n) S().toast(t('cancel.restored', { n }), 'ok');
}

const isCancelled = (level: Level, id: string): boolean => {
  const d = S().data;
  const pool: { id: string; huy?: unknown }[] = level === 'thang' ? d.thang : level === 'tuan' ? d.tuan : d.ngay;
  return !!pool.find((x) => x.id === id)?.huy;
};

/** ▶ Bắt đầu · ■ Kết thúc · ↺ Reset (mục 6.4) */
export function quickAction(level: Level, id: string, act: 'start' | 'end' | 'reset'): void {
  const st = S();
  if (isCancelled(level, id)) {
    st.toast(t('cancel.locked'), 'info');
    return;
  }
  const today = todayStr();
  st.mutate((d) => {
    if (level === 'ngay') {
      const now = nowIso();
      return { ...d, ngay: d.ngay.map((n) => (n.id !== id ? n : act === 'start' ? startNgay(n, now) : act === 'end' ? endNgay(n, now) : resetNgay(n))) };
    }
    const fn = <T extends Parameters<typeof resetRange>[0]>(x: T): T => (act === 'start' ? startRange(x, today) : act === 'end' ? endRange(x, today) : resetRange(x));
    if (level === 'thang') return { ...d, thang: d.thang.map((x) => (x.id === id ? fn(x) : x)) };
    return { ...d, tuan: d.tuan.map((x) => (x.id === id ? fn(x) : x)) };
  });
}

/** Vuốt phải trên mobile: Hoàn thành nhanh, xác nhận nếu là việc cha */
export function swipeComplete(level: Level, id: string): void {
  const st = S();
  if (isCancelled(level, id)) {
    st.toast(t('cancel.locked'), 'info');
    return;
  }
  if (hasKids(st.data, level, id)) {
    st.askConfirm({
      title: t('swipe.title'),
      message: t('swipe.completeAll'),
      confirmLabel: t('status.done'),
      onConfirm: () => st.mutate((d) => completeTree(d, level, id))
    });
  } else st.mutate((d) => completeTree(d, level, id));
}

export function setStatusInline(level: Level, id: string, status: Status): void {
  const st = S();
  if (isCancelled(level, id)) {
    st.toast(t('cancel.locked'), 'info');
    return;
  }
  if (hasKids(st.data, level, id)) {
    st.toast(t('grid.autoStatus'), 'info');
    return;
  }
  st.updateItem(level, id, { tt: status });
}

function applyQuick(quick: Quick, preferred: Level): void {
  const st = S();
  const tab = st.tab;
  let level: Level = tab === 'overview' ? preferred : tab;
  if (quick === 'overdue' && level === 'ngay') level = 'thang'; // "Quá hạn" không áp dụng cho CV Ngày
  useApp.setState({
    tab: level,
    query: '',
    filters: { ...st.filters, [level]: { quick } },
    modes: { ...st.modes, [level]: 'table' },
    splitDay: null
  });
}

export function runCommand(id: CommandId): void {
  const st = S();
  switch (id) {
    case 'create':
      st.setQuickOpen(true);
      break;
    case 'today':
      applyQuick('today', 'ngay');
      break;
    case 'overdue':
      applyQuick('overdue', 'thang');
      break;
    case 'duesoon':
      applyQuick('duesoon', 'thang');
      break;
    case 'mine':
      if (!st.settings.currentPersonId) {
        st.toast(t('toast.pickMe'), 'info');
        st.openSettings('personal');
        break;
      }
      applyQuick('mine', 'thang');
      break;
    case 'export':
      void exportAll();
      break;
    case 'backup':
      void backupNow();
      break;
    case 'restore':
      void restoreFlow();
      break;
    case 'theme':
      st.openSettings('appearance');
      break;
    case 'language':
      st.openSettings('language');
      break;
    case 'settings':
      st.openSettings('language');
      break;
  }
}
