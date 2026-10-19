// Trạm đồng bộ Wi-Fi nội bộ chạy trong app PC (Node http, không cần Electron để test).
// GET  /hcn/ping                     → thông tin trạm
// POST /hcn/pair  {code, name}       → ghép đôi bằng mã 6 số, trả token
// POST /hcn/sync  {data, meta}       → (Bearer token) gộp và trả kết quả
import crypto from 'node:crypto';
import http from 'node:http';
import os from 'node:os';
import type { Data } from '../src/core/model.ts';
import { normalizeData } from '../src/core/migrate.ts';
import { isMeta } from '../src/core/sync.ts';
import type { SyncMeta } from '../src/core/sync.ts';

export const DEFAULT_PORT = 47821;
const MAX_BODY = 25 * 1024 * 1024;

export interface SyncDevice {
  id: string;
  name: string;
  tokenHash: string;
  pairedAt: string;
  lastSeen: string | null;
}

export interface SyncServerDeps {
  hubName?: string;
  version: string;
  getDevices(): SyncDevice[];
  setDevices(list: SyncDevice[]): void;
  /** gộp dữ liệu máy con và trả kết quả cuối cùng */
  handleSync(data: Data, meta: SyncMeta, device: SyncDevice): Promise<{ data: Data; meta: SyncMeta; changes: number }>;
  onPaired?(device: SyncDevice): void;
  log?: { info(m: string): void; warn(m: string): void };
}

export const hashToken = (t: string): string => crypto.createHash('sha256').update(t).digest('hex');
const genCode = (): string => String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');

export function lanAddresses(): string[] {
  const out: string[] = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const ni of list ?? []) {
      if (ni.family === 'IPv4' && !ni.internal && !ni.address.startsWith('169.254.')) out.push(ni.address);
    }
  }
  return out;
}

export function createSyncServer(deps: SyncServerDeps) {
  let server: http.Server | null = null;
  let port: number | null = null;
  let pairCode = genCode();
  const attempts = new Map<string, number[]>();
  const hubName = deps.hubName ?? os.hostname();

  const send = (res: http.ServerResponse, status: number, body: unknown) => {
    res.writeHead(status, {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Cache-Control': 'no-store'
    });
    res.end(JSON.stringify(body));
  };

  const readJson = (req: http.IncomingMessage): Promise<unknown> =>
    new Promise((resolve, reject) => {
      let size = 0;
      const chunks: Buffer[] = [];
      req.on('data', (c: Buffer) => {
        size += c.length;
        if (size > MAX_BODY) {
          reject(new Error('too-large'));
          req.destroy();
          return;
        }
        chunks.push(c);
      });
      req.on('end', () => {
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'));
        } catch {
          reject(new Error('bad-json'));
        }
      });
      req.on('error', reject);
    });

  /** Chống dò mã: tối đa 8 lần sai mỗi phút cho mỗi IP */
  const limited = (ip: string): boolean => {
    const now = Date.now();
    const list = (attempts.get(ip) ?? []).filter((t) => now - t < 60_000);
    attempts.set(ip, list);
    return list.length >= 8;
  };

  const auth = (req: http.IncomingMessage): SyncDevice | null => {
    const h = req.headers.authorization ?? '';
    const token = h.startsWith('Bearer ') ? h.slice(7).trim() : '';
    if (!token) return null;
    const hash = hashToken(token);
    return deps.getDevices().find((d) => d.tokenHash === hash) ?? null;
  };

  async function handle(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const url = (req.url ?? '').split('?')[0];
    const ip = req.socket.remoteAddress ?? '?';
    if (req.method === 'OPTIONS') return send(res, 204, {});
    if (req.method === 'GET' && url === '/hcn/ping') return send(res, 200, { app: 'HCN', name: hubName, version: deps.version });

    if (req.method === 'POST' && url === '/hcn/pair') {
      if (limited(ip)) return send(res, 429, { error: 'too-many' });
      const body = (await readJson(req)) as { code?: string; name?: string };
      if (String(body.code ?? '').trim() !== pairCode) {
        attempts.get(ip)!.push(Date.now());
        deps.log?.warn(`Ghép đôi sai mã từ ${ip}`);
        return send(res, 403, { error: 'code' });
      }
      const token = crypto.randomBytes(24).toString('hex');
      const device: SyncDevice = {
        id: crypto.randomBytes(6).toString('hex'),
        name: String(body.name ?? 'Điện thoại').slice(0, 60) || 'Điện thoại',
        tokenHash: hashToken(token),
        pairedAt: new Date().toISOString(),
        lastSeen: null
      };
      deps.setDevices([...deps.getDevices(), device]);
      pairCode = genCode(); // mã chỉ dùng được một lần
      deps.log?.info(`Đã ghép đôi thiết bị ${device.id}`);
      deps.onPaired?.(device);
      return send(res, 200, { token, deviceId: device.id, hubName });
    }

    if (req.method === 'POST' && url === '/hcn/sync') {
      const device = auth(req);
      if (!device) return send(res, 401, { error: 'unpaired' });
      const body = (await readJson(req)) as { data?: unknown; meta?: unknown; schemaVersion?: number };
      if ((body.schemaVersion ?? 1) !== 1) return send(res, 409, { error: 'schema' });
      if (!body.data || typeof body.data !== 'object' || !isMeta(body.meta)) return send(res, 400, { error: 'bad-request' });
      const data = normalizeData(body.data as Record<string, unknown>);
      const result = await deps.handleSync(data, body.meta, device);
      deps.setDevices(deps.getDevices().map((d) => (d.id === device.id ? { ...d, lastSeen: new Date().toISOString() } : d)));
      return send(res, 200, { data: result.data, meta: result.meta, changes: result.changes, hubName });
    }
    return send(res, 404, { error: 'not-found' });
  }

  return {
    get port() {
      return port;
    },
    get running() {
      return !!server;
    },
    get pairCode() {
      return pairCode;
    },
    regenCode(): string {
      pairCode = genCode();
      return pairCode;
    },
    /** Lắng nghe trên mọi địa chỉ mạng; nếu cổng bận thì thử 9 cổng kế tiếp */
    async start(preferred = DEFAULT_PORT, host = '0.0.0.0'): Promise<number> {
      if (server) return port!;
      for (let p = preferred; p < preferred + 10; p++) {
        const s = http.createServer((req, res) => {
          handle(req, res).catch((e: Error) => {
            deps.log?.warn(`Lỗi đồng bộ: ${e.message}`);
            if (!res.headersSent) send(res, e.message === 'too-large' ? 413 : 400, { error: e.message });
          });
        });
        const ok = await new Promise<boolean>((resolve) => {
          s.once('error', () => resolve(false));
          s.listen(p, host, () => resolve(true));
        });
        if (ok) {
          server = s;
          port = p;
          deps.log?.info(`Trạm đồng bộ chạy ở cổng ${p}`);
          return p;
        }
      }
      throw new Error('Không mở được cổng đồng bộ');
    },
    async stop(): Promise<void> {
      const s = server;
      server = null;
      port = null;
      if (s) await new Promise<void>((r) => s.close(() => r()));
    }
  };
}
export type SyncServer = ReturnType<typeof createSyncServer>;
