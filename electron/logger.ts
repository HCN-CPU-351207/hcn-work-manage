// Nhật ký: tối đa 5 MB, xoay vòng 3 file (app.log, app.log.1, app.log.2). Không ghi nội dung công việc.
import fs from 'node:fs';
import path from 'node:path';

export interface Logger {
  info(msg: string): void;
  warn(msg: string): void;
  error(msg: string, err?: unknown): void;
  file: string;
}

export function createLogger(dir: string, opts: { maxBytes?: number; fsImpl?: typeof fs } = {}): Logger {
  const maxBytes = opts.maxBytes ?? 5 * 1024 * 1024;
  const f = opts.fsImpl ?? fs;
  const file = path.join(dir, 'app.log');
  try {
    f.mkdirSync(dir, { recursive: true });
  } catch {
    /* bỏ qua */
  }

  const rotate = () => {
    try {
      if (!f.existsSync(file) || f.statSync(file).size < maxBytes) return;
      const p2 = `${file}.2`;
      const p1 = `${file}.1`;
      if (f.existsSync(p2)) f.rmSync(p2);
      if (f.existsSync(p1)) f.renameSync(p1, p2);
      f.renameSync(file, p1);
    } catch {
      /* log không được làm app lỗi */
    }
  };

  const write = (level: string, msg: string) => {
    try {
      rotate();
      f.appendFileSync(file, `${new Date().toISOString()} [${level}] ${msg}\n`, 'utf8');
    } catch {
      /* bỏ qua */
    }
  };

  return {
    file,
    info: (m) => write('INFO', m),
    warn: (m) => write('WARN', m),
    error: (m, err) => write('ERROR', err ? `${m}: ${(err as Error)?.message ?? String(err)}` : m)
  };
}
