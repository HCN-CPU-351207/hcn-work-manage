// Đọc/ghi data.json, settings.json, sao lưu, migration (mục 3.3, 3.4, 4.3)
import fs from 'node:fs';
import path from 'node:path';
import { defaultSettings, emptyData, toBackup } from '../src/core/model.ts';
import type { Data, Settings } from '../src/core/model.ts';
import { MigrationError, parseImport } from '../src/core/migrate.ts';
import type { LoadNotice } from '../src/core/api.ts';
import type { Logger } from './logger.ts';

export interface StorageOptions {
  fsImpl?: typeof fs;
  log?: Pick<Logger, 'info' | 'warn' | 'error'>;
  /** số lần thử lại khi rename lỗi (Windows hay khóa file tạm thời do antivirus) */
  renameRetries?: number;
  now?: () => Date;
}

const p2 = (n: number) => String(n).padStart(2, '0');
export const stamp = (d: Date): string =>
  `${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}-${p2(d.getHours())}${p2(d.getMinutes())}${p2(d.getSeconds())}`;

export function createStorage(dir: string, opts: StorageOptions = {}) {
  const f = opts.fsImpl ?? fs;
  const log = opts.log ?? { info() {}, warn() {}, error() {} };
  const now = opts.now ?? (() => new Date());
  const retries = opts.renameRetries ?? 3;
  const dataFile = path.join(dir, 'data.json');
  const settingsFile = path.join(dir, 'settings.json');
  const syncFile = path.join(dir, 'sync.json');
  const backupsDir = path.join(dir, 'backups');
  const tmpDir = path.join(dir, 'tmp');

  const sleep = (ms: number) => {
    try {
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
    } catch {
      /* bỏ qua */
    }
  };

  /** Ghi nguyên tử: ghi ra tmp\<tên>.part rồi rename. Không bao giờ ghi đè trực tiếp. */
  function writeAtomic(file: string, content: string): void {
    f.mkdirSync(tmpDir, { recursive: true });
    const part = path.join(tmpDir, `${path.basename(file)}.part`);
    const fd = f.openSync(part, 'w');
    try {
      f.writeSync(fd, content, 0, 'utf8');
      try {
        f.fsyncSync(fd);
      } catch {
        /* một số hệ thống không hỗ trợ fsync */
      }
    } finally {
      f.closeSync(fd);
    }
    let lastErr: unknown;
    for (let i = 0; i <= retries; i++) {
      try {
        f.renameSync(part, file);
        return;
      } catch (e) {
        lastErr = e;
        if (i < retries) sleep(40 * (i + 1));
      }
    }
    try {
      f.rmSync(part, { force: true });
    } catch {
      /* bỏ qua */
    }
    throw lastErr;
  }

  function init(): void {
    f.mkdirSync(dir, { recursive: true });
    f.mkdirSync(backupsDir, { recursive: true });
    f.mkdirSync(tmpDir, { recursive: true });
    for (const name of f.readdirSync(tmpDir)) {
      try {
        f.rmSync(path.join(tmpDir, name), { force: true });
      } catch {
        /* bỏ qua */
      }
    }
  }

  const listBackups = (prefix: string): string[] =>
    f.existsSync(backupsDir)
      ? f.readdirSync(backupsDir).filter((n) => n.startsWith(prefix) && n.endsWith('.json')).sort()
      : [];

  function rotate(prefix: string, keep: number): void {
    const all = listBackups(prefix);
    for (const old of all.slice(0, Math.max(0, all.length - keep))) {
      try {
        f.rmSync(path.join(backupsDir, old), { force: true });
      } catch {
        /* bỏ qua */
      }
    }
  }

  function writeBackup(name: string, data: Data): string {
    const file = path.join(backupsDir, name);
    writeAtomic(file, JSON.stringify(toBackup(data, now().toISOString()), null, 2));
    return file;
  }

  function saveData(data: Data): void {
    writeAtomic(dataFile, JSON.stringify(data, null, 2));
  }

  function loadData(): { data: Data; notice: LoadNotice } {
    if (!f.existsSync(dataFile)) {
      const d = emptyData();
      saveData(d);
      log.info('Tạo data.json mới');
      return { data: d, notice: { kind: 'fresh' } };
    }
    const text = f.readFileSync(dataFile, 'utf8');
    let parsed: ReturnType<typeof parseImport> | null = null;
    try {
      parsed = parseImport(JSON.parse(text));
    } catch (e) {
      if (e instanceof MigrationError && (e.code === 'FUTURE_SCHEMA' || e.code === 'MIGRATION_FAILED')) {
        log.error(`Không thể nạp data.json (${e.code}); giữ nguyên file gốc`, e);
        throw e; // giữ nguyên file gốc, không ghi đè
      }
      log.warn(`data.json hỏng: ${(e as Error).message}`);
    }

    if (parsed) {
      if (parsed.migratedFrom !== null) {
        f.mkdirSync(backupsDir, { recursive: true });
        writeAtomic(path.join(backupsDir, `hcn-pre-migrate-${stamp(now())}.json`), text);
        saveData(parsed.data);
        log.info(`Migration schema ${parsed.migratedFrom} → ${parsed.data.schemaVersion}`);
        return { data: parsed.data, notice: { kind: 'migrated', from: parsed.migratedFrom } };
      }
      if (parsed.dropped.length) log.info(`Bỏ qua khóa không còn hỗ trợ: ${parsed.dropped.join(', ')}`);
      return { data: parsed.data, notice: { kind: 'ok' } };
    }

    // data.json hỏng: đổi tên, khôi phục bản auto mới nhất
    const corruptName = `data.corrupt-${stamp(now())}.json`;
    try {
      f.renameSync(dataFile, path.join(dir, corruptName));
    } catch {
      f.copyFileSync(dataFile, path.join(dir, corruptName));
    }
    for (const name of listBackups('hcn-auto-').reverse()) {
      try {
        const r = parseImport(JSON.parse(f.readFileSync(path.join(backupsDir, name), 'utf8')));
        saveData(r.data);
        log.warn(`Đã khôi phục từ ${name}`);
        return { data: r.data, notice: { kind: 'restored-from-backup', backup: name, corruptFile: corruptName } };
      } catch {
        /* thử bản kế tiếp */
      }
    }
    const d = emptyData();
    saveData(d);
    return { data: d, notice: { kind: 'corrupt-no-backup', corruptFile: corruptName } };
  }

  /** sync.json: dấu đồng bộ + cấu hình trạm (danh sách điện thoại đã ghép đôi, chỉ lưu mã băm của token) */
  function loadSync<T>(): T | null {
    try {
      if (f.existsSync(syncFile)) return JSON.parse(f.readFileSync(syncFile, 'utf8')) as T;
    } catch (e) {
      log.warn(`sync.json hỏng, tạo lại: ${(e as Error).message}`);
    }
    return null;
  }
  function saveSync(v: unknown): void {
    writeAtomic(syncFile, JSON.stringify(v));
  }

  function loadSettings(): Settings {
    try {
      if (f.existsSync(settingsFile)) {
        const raw = JSON.parse(f.readFileSync(settingsFile, 'utf8'));
        return { ...defaultSettings(), ...raw };
      }
    } catch (e) {
      log.warn(`settings.json hỏng, dùng mặc định: ${(e as Error).message}`);
    }
    return defaultSettings();
  }
  function saveSettings(s: Settings): void {
    writeAtomic(settingsFile, JSON.stringify(s, null, 2));
  }

  /** Mỗi lần mở app, nếu chưa có bản auto trong ngày thì tạo một bản; giữ 7 bản */
  function autoBackupIfNeeded(data: Data): string | null {
    const d = now();
    const day = stamp(d).slice(0, 8);
    if (listBackups(`hcn-auto-${day}`).length) return null;
    const file = writeBackup(`hcn-auto-${stamp(d)}.json`, data);
    rotate('hcn-auto-', 7);
    return file;
  }
  function preUpdateBackup(version: string, data: Data): string {
    const file = writeBackup(`hcn-pre-update-v${version}.json`, data);
    rotate('hcn-pre-update-', 3);
    return file;
  }
  function preRestoreBackup(data: Data): string {
    const file = writeBackup(`hcn-pre-restore-${stamp(now())}.json`, data);
    rotate('hcn-pre-restore-', 5);
    return file;
  }
  /** Trước khi đồng bộ xóa việc hoặc điện thoại ghi đè PC (giữ 10 bản gần nhất) */
  function preSyncBackup(data: Data, reason = 'sync'): string {
    const file = writeBackup(`hcn-pre-sync-${stamp(now())}-${reason}.json`, data);
    rotate('hcn-pre-sync-', 10);
    return file;
  }
  function crashBackup(): string | null {
    try {
      if (!f.existsSync(dataFile)) return null;
      const target = path.join(backupsDir, `hcn-crash-${stamp(now())}.json`);
      f.mkdirSync(backupsDir, { recursive: true });
      f.copyFileSync(dataFile, target);
      rotate('hcn-crash-', 3);
      return target;
    } catch {
      return null;
    }
  }

  return {
    paths: { dir, dataFile, settingsFile, backupsDir, tmpDir },
    init,
    writeAtomic,
    saveData,
    loadData,
    loadSettings,
    saveSettings,
    loadSync,
    saveSync,
    autoBackupIfNeeded,
    preUpdateBackup,
    preRestoreBackup,
    preSyncBackup,
    crashBackup,
    listBackups
  };
}
export type Storage = ReturnType<typeof createStorage>;
