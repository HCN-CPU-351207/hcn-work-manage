// Khung ứng dụng: Toolbar, Sub-Nav, trang theo tab, lớp phủ; phím tắt, thông báo, cập nhật
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Capacitor, SystemBars, SystemBarsStyle } from '@capacitor/core';
import i18n from './i18n/index.ts';
import { useApp } from './store/app.ts';
import { api } from './lib/devApi.ts';
import { startReminders } from './lib/reminderRunner.ts';
import { isTyping } from './lib/hooks.ts';
import { cx } from './lib/labels.ts';
import { Toolbar } from './components/Toolbar/Toolbar.tsx';
import { SubNav } from './components/SubNav/SubNav.tsx';
import { LevelPage, OverviewPage } from './pages/Pages.tsx';
import { FloatingBulkBar } from './components/BulkBar/FloatingBulkBar.tsx';
import { DetailDrawer } from './components/Drawer/DetailDrawer.tsx';
import { ProjectPanel } from './components/Panel/ProjectPanel.tsx';
import { SettingsDialog } from './components/Settings/SettingsDialog.tsx';
import { TaskTooltip } from './components/Tooltip/TaskTooltip.tsx';
import { ConfirmDialog, Toasts, UpdateToast } from './components/Common/Overlays.tsx';
import type { Tab } from './core/model.ts';

const TABS: Tab[] = ['overview', 'thang', 'tuan', 'ngay'];
const t = (k: string, o?: Record<string, unknown>) => i18n.t(k, o) as string;

/** Focus ô tìm kiếm ngay trong sự kiện phím (không chờ render) để không lọt ký tự gõ nhanh */
function focusSearchNow() {
  const st = useApp.getState();
  st.openSettings(null);
  const el = document.querySelector<HTMLInputElement>('.search-pill input');
  if (el) {
    el.focus();
    el.select();
  } else st.focusSearch(); // mobile: ô đang thu thành icon → mở rộng rồi focus
}

/** Đóng lớp trên cùng (Esc trên PC, nút Back trên Android). Trả false nếu không còn gì để đóng */
function closeTopLayer(): boolean {
  const st = useApp.getState();
  if (st.confirm) st.askConfirm(null);
  else if (st.tip?.pinned) st.setTip(null);
  else if (st.drawer) st.openDrawer(null);
  else if (st.settingsOpen) st.openSettings(null);
  else if (st.quickOpen) st.setQuickOpen(false);
  else if (st.splitDay) st.setSplitDay(null);
  else if (st.panel) st.openPanel(null);
  else return false;
  return true;
}

export function App() {
  const { t: tr } = useTranslation();
  const ready = useApp((s) => s.ready);
  const loadError = useApp((s) => s.loadError);
  const tab = useApp((s) => s.tab);
  const theme = useApp((s) => s.settings.theme);
  const lang = useApp((s) => s.settings.language);
  const panelOpen = useApp((s) => !!s.panel && s.tab === s.panel.level);

  useEffect(() => {
    void useApp.getState().init().then(() => {
      const st = useApp.getState();
      const n = st.notice;
      if (n?.kind === 'restored-from-backup') st.toast(t('notice.restored', { file: n.backup }), 'info', { ttl: 9000 });
      if (n?.kind === 'corrupt-no-backup') st.toast(t('notice.corrupt', { file: n.corruptFile }), 'error', { ttl: 12000 });
      if (n?.kind === 'migrated') st.toast(t('notice.migrated', { v: n.from }), 'info');
    });
    const offUpdate = api().onUpdate((e) => useApp.getState().onUpdateEvent(e));
    const offFlush = api().onFlush(async () => {
      await useApp.getState().flush();
    });
    // dữ liệu đổi do đồng bộ Wi-Fi
    const offExternal = api().onExternalData((d, rev) => useApp.getState().applyExternal(d, rev));
    // nút Back của Android: đóng lớp trên cùng → về Tổng quan → thu nhỏ app
    const offBack = api().onBackButton(() => {
      if (closeTopLayer()) return true;
      const st = useApp.getState();
      if (st.tab !== 'overview') {
        st.setTab('overview');
        return true;
      }
      return false;
    });
    const stopReminders = startReminders();
    const onUnload = () => void useApp.getState().flush();
    window.addEventListener('beforeunload', onUnload);
    return () => {
      offUpdate();
      offFlush();
      offExternal();
      offBack();
      stopReminders();
      window.removeEventListener('beforeunload', onUnload);
    };
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    // Android: chữ/biểu tượng thanh trạng thái sáng trên nền tối và ngược lại
    if (Capacitor.isNativePlatform()) void SystemBars.setStyle({ style: theme === 'dark' ? SystemBarsStyle.Dark : SystemBarsStyle.Light }).catch(() => undefined);
  }, [theme]);
  useEffect(() => {
    void i18n.changeLanguage(lang);
    document.documentElement.lang = lang;
  }, [lang]);

  // Phím tắt (mục 9.1)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const st = useApp.getState();
      const mod = e.ctrlKey || e.metaKey;
      const typing = isTyping(e);
      if (mod && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        focusSearchNow();
      } else if (e.key === '/' && !typing && !mod) {
        e.preventDefault();
        focusSearchNow();
      } else if (mod && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        st.openSettings(null);
        st.setQuickOpen(true);
      } else if (mod && e.key === ',') {
        e.preventDefault();
        st.openSettings(st.settingsOpen ? null : 'language');
      } else if (mod && e.key.toLowerCase() === 's') {
        e.preventDefault();
        void st.flush().then((ok) => st.toast(ok ? t('sync.saved') : t('sync.error'), ok ? 'ok' : 'error'));
      } else if (mod && e.key.toLowerCase() === 'z' && !typing) {
        if (st.undo && Date.now() <= st.undo.until) {
          e.preventDefault();
          st.undoNow();
          st.toast(t('toast.undone'), 'ok');
        }
      } else if (e.key === 'Escape') {
        closeTopLayer();
      } else if (!typing && !mod && !e.altKey && ['1', '2', '3', '4'].includes(e.key) && !st.drawer && !st.settingsOpen && !st.confirm) {
        st.setTab(TABS[Number(e.key) - 1]);
      }
    };
    const onDown = (e: MouseEvent) => {
      const st = useApp.getState();
      if (st.tip?.pinned && !(e.target as HTMLElement).closest('.tooltip, .tb')) st.setTip(null);
    };
    window.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDown);
    };
  }, []);

  if (!ready) return <div className="boot">{tr('app.loading')}</div>;
  if (loadError)
    return (
      <div className="boot boot-error" role="alert">
        <strong>{tr('app.loadError')}</strong>
        <code>{loadError}</code>
      </div>
    );

  return (
    <div className="app">
      <Toolbar />
      <SubNav />
      <main className={cx('main', panelOpen && 'with-panel')}>{tab === 'overview' ? <OverviewPage /> : <LevelPage key={tab} level={tab} />}</main>
      {panelOpen && <ProjectPanel />}
      <FloatingBulkBar />
      <DetailDrawer />
      <SettingsDialog />
      <TaskTooltip />
      <ConfirmDialog />
      <UpdateToast />
      <Toasts />
    </div>
  );
}
