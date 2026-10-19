// Tiến trình chính: cửa sổ, single-instance, menu, IPC, updater
import { app, BrowserWindow, dialog, ipcMain, Menu, shell } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import type { Data, Settings } from '../src/core/model.ts';
import { toBackup } from '../src/core/model.ts';
import type { LoadNotice, LoadResult, Result, SaveResult, SheetSpec, SyncAction, UpdateEvent } from '../src/core/api.ts';
import { MigrationError } from '../src/core/migrate.ts';
import { writeWorkbook } from './excel.ts';
import { createLogger } from './logger.ts';
import { showNotification } from './notify.ts';
import { createStorage } from './storage.ts';
import { createUpdater } from './updater.ts';
import { createHubController } from './hub.ts';
import type { HubController, HubFile } from './hub.ts';

// Đặt tường minh thư mục dữ liệu, không phụ thuộc tên package hay productName (mục 3.3)
app.setPath('userData', path.join(app.getPath('appData'), 'HCN'));
// Cache của Chromium để ở Local, không làm phình thư mục dữ liệu trong Roaming
app.setPath('sessionData', path.join(process.env.LOCALAPPDATA ?? app.getPath('temp'), 'HCN', 'session'));
app.setAppUserModelId('com.hcn.workmanage');

// Ô chọn ngày/giờ gốc của Chromium theo ngôn ngữ đã chọn (vd. vi: dd/mm/yyyy, 24 giờ). Có hiệu lực từ lần mở sau khi đổi.
try {
  const saved = JSON.parse(fs.readFileSync(path.join(app.getPath('userData'), 'settings.json'), 'utf8')) as { language?: string };
  const map: Record<string, string> = { vi: 'vi', en: 'en-GB', zh: 'zh-CN', pt: 'pt-PT', fr: 'fr', de: 'de', ja: 'ja' };
  app.commandLine.appendSwitch('lang', map[saved.language ?? 'vi'] ?? 'vi');
} catch {
  app.commandLine.appendSwitch('lang', 'vi');
}

const isDev = !app.isPackaged && process.env.NODE_ENV === 'development';
const dataDir = app.getPath('userData');
const log = createLogger(path.join(dataDir, 'logs'));
const storage = createStorage(dataDir, { log });

let win: BrowserWindow | null = null;
let settings: Settings;
let current: Data; // bản dữ liệu mới nhất đã ghi (dùng cho sao lưu trước cập nhật / khôi phục)
let notice: LoadNotice = { kind: 'ok' };
let updater: ReturnType<typeof createUpdater> | null = null;
let forceClose = false;
let hubCtl: HubController;

const send = (channel: string, payload?: unknown) => {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
};

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });
  app.whenReady().then(boot).catch((e) => fatal(e));
}

function fatal(e: unknown): void {
  log.error('Lỗi nghiêm trọng khi khởi động', e);
  const msg =
    e instanceof MigrationError && e.code === 'FUTURE_SCHEMA'
      ? 'Dữ liệu được tạo bởi phiên bản HCN mới hơn. Hãy cài phiên bản mới nhất. File dữ liệu được giữ nguyên.'
      : `Không thể khởi động: ${(e as Error)?.message ?? e}\nDữ liệu gốc được giữ nguyên tại ${dataDir}`;
  dialog.showErrorBox('HCN Work Manage', msg);
  app.exit(1);
}

function boot(): void {
  storage.init();
  log.info(`Khởi động HCN ${app.getVersion()} (${process.platform} ${process.arch})`);
  const loaded = storage.loadData();
  current = loaded.data;
  notice = loaded.notice;
  settings = storage.loadSettings();
  try {
    if (storage.autoBackupIfNeeded(current)) log.info('Đã tạo bản sao lưu tự động trong ngày');
  } catch (e) {
    log.error('Không tạo được bản sao lưu tự động', e);
  }

  process.on('uncaughtException', (err) => {
    log.error('uncaughtException', err);
    const p = storage.crashBackup();
    dialog.showErrorBox('HCN Work Manage', `Ứng dụng gặp lỗi. Dữ liệu đã được sao lưu tại ${p ?? dataDir}`);
    app.exit(1);
  });

  hubCtl = createHubController(current, {
    loadSync: () => storage.loadSync<HubFile>(),
    saveSync: (f) => storage.saveSync(f),
    saveData: (d) => {
      storage.saveData(d);
      current = d;
    },
    version: app.getVersion(),
    log,
    onExternal: (data, rev) => send('hcn:external', { data, rev }),
    requestFlush
  });

  buildMenu();
  registerIpc();
  createWindow();
  void hubCtl.startIfEnabled();

  updater = createUpdater({
    isPackaged: app.isPackaged,
    log,
    send: (e: UpdateEvent) => send('hcn:update', e),
    autoDownload: settings.autoDownloadUpdates,
    beforeInstall: (v) => {
      try {
        storage.preUpdateBackup(v, current);
        log.info(`Đã sao lưu trước khi cập nhật lên v${v}`);
      } catch (e) {
        log.error('Không tạo được bản sao lưu trước cập nhật', e);
      }
      forceClose = true;
    },
    onChecked: (iso) => {
      settings = { ...settings, lastUpdateCheck: iso };
      try {
        storage.saveSettings(settings);
      } catch {
        /* bỏ qua */
      }
    }
  });
  updater.start();

  app.on('window-all-closed', () => app.quit());
  app.on('before-quit', () => {
    updater?.stop();
    void hubCtl?.stop();
  });
}

function createWindow(): void {
  const iconPath = path.join(__dirname, '..', 'build', 'icon.png');
  win = new BrowserWindow({
    width: 1320,
    height: 840,
    minWidth: 360,
    minHeight: 560,
    title: 'HCN Work Manage',
    backgroundColor: settings.theme === 'light' ? '#F4F6F5' : '#121614',
    show: false,
    autoHideMenuBar: true,
    ...(fs.existsSync(iconPath) ? { icon: iconPath } : {}),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false
    }
  });
  win.once('ready-to-show', () => win?.show());
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith('file://') && !url.startsWith('http://localhost:5173')) e.preventDefault();
  });

  // Trước khi đóng: yêu cầu renderer ghi nốt dữ liệu đang chờ (tối đa 2 giây)
  win.on('close', (e) => {
    if (forceClose) return;
    e.preventDefault();
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      forceClose = true;
      win?.close();
    };
    ipcMain.once('hcn:flushDone', finish);
    setTimeout(finish, 2000);
    try {
      send('hcn:flush');
    } catch {
      finish();
    }
  });
  win.on('closed', () => {
    win = null;
  });

  if (isDev) void win.loadURL('http://localhost:5173');
  else void win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
}

/** Nhờ giao diện ghi nốt thay đổi đang chờ (dùng trước khi gộp dữ liệu đồng bộ) */
function requestFlush(): Promise<void> {
  return new Promise((resolve) => {
    if (!win || win.isDestroyed()) return resolve();
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      ipcMain.removeListener('hcn:flushDone', finish);
      resolve();
    };
    ipcMain.on('hcn:flushDone', finish);
    setTimeout(finish, 1500);
    send('hcn:flush');
  });
}

function buildMenu(): void {
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      {
        label: 'HCN',
        submenu: [
          { label: 'Mở thư mục dữ liệu', click: () => void shell.openPath(dataDir) },
          { label: 'Mở nhật ký', click: () => void shell.openPath(log.file) },
          { type: 'separator' },
          { role: 'quit', label: 'Thoát' }
        ]
      },
      {
        label: 'Xem',
        submenu: [
          { role: 'resetZoom', label: 'Cỡ chữ mặc định' },
          { role: 'zoomIn', label: 'Phóng to' },
          { role: 'zoomOut', label: 'Thu nhỏ' },
          { role: 'togglefullscreen', label: 'Toàn màn hình' },
          ...(isDev ? [{ type: 'separator' as const }, { role: 'toggleDevTools' as const }] : [])
        ]
      }
    ])
  );
}

const fail = (e: unknown): Result => ({ ok: false, error: (e as Error)?.message ?? String(e) });
const ymd = () => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

function registerIpc(): void {
  ipcMain.handle(
    'hcn:load',
    (): LoadResult => ({
      data: current,
      settings,
      notice,
      rev: hubCtl.rev,
      info: { dataPath: dataDir, logPath: log.file, version: app.getVersion(), packaged: app.isPackaged }
    })
  );

  ipcMain.handle('hcn:saveData', async (_e, data: Data, baseRev?: number): Promise<SaveResult> => {
    try {
      return await hubCtl.save(data, baseRev);
    } catch (e) {
      log.error('Lỗi ghi data.json', e);
      return fail(e);
    }
  });

  ipcMain.handle('hcn:saveSettings', (_e, s: Settings): Result => {
    try {
      storage.saveSettings(s);
      settings = s;
      return { ok: true };
    } catch (e) {
      log.error('Lỗi ghi settings.json', e);
      return fail(e);
    }
  });

  ipcMain.handle('hcn:backupJson', async (_e, data: Data): Promise<Result> => {
    if (!win) return { ok: false };
    const r = await dialog.showSaveDialog(win, {
      defaultPath: `hcn-backup-${ymd()}.json`,
      filters: [{ name: 'JSON', extensions: ['json'] }]
    });
    if (r.canceled || !r.filePath) return { ok: false, canceled: true };
    try {
      fs.writeFileSync(r.filePath, JSON.stringify(toBackup(data, new Date().toISOString()), null, 2), 'utf8');
      return { ok: true, path: r.filePath };
    } catch (e) {
      return fail(e);
    }
  });

  ipcMain.handle('hcn:pickRestore', async () => {
    if (!win) return { canceled: true };
    const r = await dialog.showOpenDialog(win, {
      defaultPath: storage.paths.backupsDir,
      properties: ['openFile'],
      filters: [{ name: 'JSON', extensions: ['json'] }]
    });
    if (r.canceled || !r.filePaths[0]) return { canceled: true };
    try {
      const raw = JSON.parse(fs.readFileSync(r.filePaths[0], 'utf8').replace(/^﻿/, ''));
      return { name: path.basename(r.filePaths[0]), raw };
    } catch {
      return { error: 'invalid' };
    }
  });

  ipcMain.handle('hcn:restore', async (_e, data: Data): Promise<SaveResult> => {
    try {
      storage.preRestoreBackup(current); // luôn sao lưu dữ liệu hiện tại trước khi thay thế
      const rev = await hubCtl.replace(data);
      log.info('Đã khôi phục dữ liệu từ file');
      return { ok: true, rev };
    } catch (e) {
      log.error('Lỗi khôi phục', e);
      return fail(e);
    }
  });

  ipcMain.handle('hcn:exportExcel', async (_e, args: { defaultName: string; sheets: SheetSpec[] }): Promise<Result> => {
    if (!win) return { ok: false };
    const r = await dialog.showSaveDialog(win, {
      defaultPath: args.defaultName,
      filters: [{ name: 'Excel', extensions: ['xlsx'] }]
    });
    if (r.canceled || !r.filePath) return { ok: false, canceled: true };
    try {
      await writeWorkbook(r.filePath, args.sheets);
      return { ok: true, path: r.filePath };
    } catch (e) {
      log.error('Lỗi xuất Excel', e);
      return fail(e);
    }
  });

  ipcMain.handle('hcn:openDataFolder', async () => {
    await shell.openPath(dataDir);
  });
  ipcMain.handle('hcn:openLog', async () => {
    await shell.openPath(log.file);
  });
  ipcMain.handle('hcn:openExternal', async (_e, url: string) => {
    if (/^https:\/\//.test(url)) await shell.openExternal(url);
  });
  ipcMain.handle('hcn:notify', (_e, a: { title: string; body: string }) => {
    showNotification(a.title, a.body, () => {
      if (win) {
        if (win.isMinimized()) win.restore();
        win.focus();
      }
    });
  });
  ipcMain.handle('hcn:syncInfo', () => hubCtl.info());
  ipcMain.handle('hcn:syncAction', (_e, a: SyncAction) => hubCtl.action(a));
  ipcMain.handle('hcn:checkUpdates', () => updater?.check(true));
  ipcMain.handle('hcn:installUpdate', () => updater?.install());
  ipcMain.handle('hcn:setAutoDownload', (_e, v: boolean) => updater?.setAutoDownload(!!v));
}
