// Cập nhật tự động qua electron-updater (mục 4)
import { autoUpdater } from 'electron-updater';
import type { UpdateEvent } from '../src/core/api.ts';
import type { Logger } from './logger.ts';

export interface UpdaterDeps {
  isPackaged: boolean;
  log: Logger;
  send: (e: UpdateEvent) => void;
  autoDownload: boolean;
  /** tạo bản sao lưu pre-update trước khi cài */
  beforeInstall: (version: string) => void;
  onChecked: (iso: string) => void;
}

export function createUpdater(deps: UpdaterDeps) {
  const { log, send } = deps;
  let manual = false;
  let downloadedVersion: string | null = null;
  let timer: ReturnType<typeof setInterval> | null = null;
  let first: ReturnType<typeof setTimeout> | null = null;

  autoUpdater.autoDownload = deps.autoDownload;
  autoUpdater.autoInstallOnAppQuit = true; // [Để sau] → cài khi thoát app lần sau
  autoUpdater.allowPrerelease = false; // kênh V1: chỉ stable
  autoUpdater.allowDowngrade = false; // không tự hạ phiên bản
  autoUpdater.logger = {
    info: (m: unknown) => log.info(`[updater] ${String(m)}`),
    warn: (m: unknown) => log.warn(`[updater] ${String(m)}`),
    error: (m: unknown) => log.error(`[updater] ${String(m)}`),
    debug: () => {}
  };

  autoUpdater.on('checking-for-update', () => send({ type: 'checking' }));
  autoUpdater.on('update-available', (info) => send({ type: 'available', version: info.version }));
  autoUpdater.on('update-not-available', () => {
    send({ type: 'not-available', manual });
    manual = false;
  });
  autoUpdater.on('download-progress', (p) => send({ type: 'progress', percent: Math.round(p.percent) }));
  autoUpdater.on('update-downloaded', (info) => {
    downloadedVersion = info.version;
    send({ type: 'downloaded', version: info.version });
  });
  autoUpdater.on('error', (err) => {
    // Không có mạng / server lỗi: im lặng, chỉ ghi log; chỉ báo khi người dùng bấm kiểm tra thủ công
    log.warn(`Lỗi cập nhật: ${err?.message ?? err}`);
    send({ type: 'error', message: String(err?.message ?? err), manual });
    manual = false;
  });

  async function check(isManual: boolean): Promise<void> {
    manual = isManual;
    if (!deps.isPackaged) {
      if (isManual) send({ type: 'not-available', manual: true });
      manual = false;
      return;
    }
    deps.onChecked(new Date().toISOString());
    try {
      await autoUpdater.checkForUpdates();
    } catch (e) {
      log.warn(`checkForUpdates: ${(e as Error).message}`);
      send({ type: 'error', message: (e as Error).message, manual: isManual });
      manual = false;
    }
  }

  return {
    /** 10 giây sau khi mở app kiểm tra một lần, sau đó cứ 6 giờ */
    start(): void {
      if (!deps.isPackaged) return;
      first = setTimeout(() => void check(false), 10_000);
      timer = setInterval(() => void check(false), 6 * 60 * 60 * 1000);
    },
    stop(): void {
      if (first) clearTimeout(first);
      if (timer) clearInterval(timer);
    },
    check,
    setAutoDownload(v: boolean): void {
      autoUpdater.autoDownload = v;
    },
    install(): void {
      if (!downloadedVersion) return;
      deps.beforeInstall(downloadedVersion);
      autoUpdater.quitAndInstall(true, true); // cài im lặng, chạy lại app sau khi cài
    }
  };
}
