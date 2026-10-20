// PC: đồng bộ Google Drive. Đăng nhập bằng trình duyệt mặc định + máy chủ tạm trên 127.0.0.1 (cổng ngẫu nhiên)
// để nhận kết quả; mã gia hạn được mã hóa bằng cơ chế bảo vệ của Windows (safeStorage / DPAPI).
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { GOOGLE_CONFIG } from '../src/config/google.ts';
import { CloudError } from '../src/core/cloudSync.ts';
import type { Data } from '../src/core/model.ts';
import type { SyncMeta, SyncMode } from '../src/core/sync.ts';
import { createCloudDriver } from '../src/lib/cloudDriver.ts';
import { createDriveStore } from '../src/lib/drive.ts';
import { createGoogleAuth } from '../src/lib/googleAuth.ts';
import type { StoredGoogle } from '../src/lib/googleAuth.ts';

export interface Secrets {
  isEncryptionAvailable(): boolean;
  encryptString(s: string): Buffer;
  decryptString(b: Buffer): string;
}

const PAGE = (ok: boolean) => `<!doctype html><meta charset="utf-8"><title>HCN Work Manage</title>
<body style="font-family:system-ui,Segoe UI,sans-serif;background:#121614;color:#e5e7eb;display:grid;place-items:center;height:100vh;margin:0">
<div style="text-align:center"><h2 style="color:${ok ? '#34d399' : '#f87171'}">${ok ? 'Đã đăng nhập Google' : 'Chưa đăng nhập được'}</h2>
<p>${ok ? 'Bạn có thể đóng tab này và quay lại HCN Work Manage.' : 'Hãy quay lại HCN Work Manage và thử lại.'}</p></div></body>`;

/** Mở trình duyệt, chờ Google gọi về http://127.0.0.1:<cổng> (tối đa 10 phút) */
export function loopbackLogin(openExternal: (url: string) => Promise<void> | void, timeoutMs = 10 * 60_000) {
  return (buildUrl: (redirectUri: string) => string): Promise<{ callbackUrl: string; redirectUri: string }> =>
    new Promise((resolve, reject) => {
      let done = false;
      const server = http.createServer((req, res) => {
        const url = req.url ?? '/';
        if (!/[?&](code|error)=/.test(url)) {
          res.writeHead(404).end();
          return;
        }
        const ok = /[?&]code=/.test(url);
        // đóng máy chủ tạm sau khi trang báo kết quả đã gửi xong cho trình duyệt
        res.on('finish', () => finish(() => resolve({ callbackUrl: `${redirectUri}${url.startsWith('/') ? url.slice(1) : url}`, redirectUri })));
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', Connection: 'close' }).end(PAGE(ok));
      });
      let redirectUri = '';
      const timer = setTimeout(() => finish(() => reject(new CloudError('cancel', 'timeout'))), timeoutMs);
      const finish = (fn: () => void) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        server.close();
        setTimeout(() => server.closeAllConnections?.(), 1000);
        fn();
      };
      server.on('error', (e) => finish(() => reject(new CloudError('network', e.message))));
      server.listen(0, '127.0.0.1', () => {
        const port = (server.address() as { port: number }).port;
        redirectUri = `http://127.0.0.1:${port}/`;
        Promise.resolve(openExternal(buildUrl(redirectUri))).catch((e: Error) => finish(() => reject(new CloudError('network', e.message))));
      });
    });
}

export async function postFormNode(url: string, fields: Record<string, string>) {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(fields).toString() });
  let json: Record<string, unknown> | null = null;
  try {
    json = (await res.json()) as Record<string, unknown>;
  } catch {
    json = null;
  }
  return { status: res.status, json };
}

export function createPcCloud(o: {
  dataDir: string;
  secrets: Secrets;
  openExternal(url: string): Promise<void> | void;
  snapshot(): Promise<{ data: Data; meta: SyncMeta }>;
  apply(data: Data, meta: SyncMeta, mode: SyncMode): Promise<void>;
  backupLocal(data: Data, reason: string): void;
  requestFlush(): Promise<void>;
  log: { info(m: string): void; warn(m: string): void };
}) {
  const tokenFile = path.join(o.dataDir, 'google.dat');
  const stateFile = path.join(o.dataDir, 'cloud.json');
  const writeAtomic = (file: string, buf: Buffer | string) => {
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, buf);
    fs.renameSync(tmp, file);
  };
  const configured = !!(GOOGLE_CONFIG.desktopClientId && GOOGLE_CONFIG.desktopClientSecret);
  const auth = configured
    ? createGoogleAuth({
        clientId: GOOGLE_CONFIG.desktopClientId,
        clientSecret: GOOGLE_CONFIG.desktopClientSecret,
        postForm: postFormNode,
        interactive: loopbackLogin(o.openExternal),
        async load(): Promise<StoredGoogle | null> {
          if (!fs.existsSync(tokenFile)) return null;
          const buf = fs.readFileSync(tokenFile);
          const text = buf[0] === 0x7b ? buf.toString('utf8') : o.secrets.decryptString(buf);
          return JSON.parse(text) as StoredGoogle;
        },
        async save(s) {
          if (!s) {
            fs.rmSync(tokenFile, { force: true });
            return;
          }
          const text = JSON.stringify(s);
          // mã hóa bằng tài khoản Windows; máy không hỗ trợ thì lưu thường (cảnh báo trong log)
          if (o.secrets.isEncryptionAvailable()) writeAtomic(tokenFile, o.secrets.encryptString(text));
          else {
            o.log.warn('Không mã hóa được mã đăng nhập Google (safeStorage không khả dụng)');
            writeAtomic(tokenFile, text);
          }
        }
      })
    : null;

  const driver = createCloudDriver({
    configured,
    auth,
    makeStore: () => createDriveStore({ fetchFn: fetch, accessToken: (f) => auth!.accessToken(f) }),
    loadState: async () => (fs.existsSync(stateFile) ? JSON.parse(fs.readFileSync(stateFile, 'utf8')) : null),
    saveState: async (s) => writeAtomic(stateFile, JSON.stringify(s)),
    getLocal: async () => {
      await o.requestFlush().catch(() => undefined);
      return o.snapshot();
    },
    applyResult: (d, m, mode) => o.apply(d, m, mode),
    backupLocal: async (d, reason) => o.backupLocal(d, reason),
    deviceName: os.hostname(),
    platform: 'pc',
    newId: () => crypto.randomBytes(8).toString('hex'),
    log: o.log
  });
  return driver;
}
