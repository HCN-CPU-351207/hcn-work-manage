// Google Drive REST (v3), chỉ trong thư mục ẩn của app (appDataFolder). Dùng chung PC và Android.
// Lỗi: 401 → gia hạn mã rồi thử lại; 403/429 quá tải → chờ tăng dần rồi thử lại; Drive đầy → CloudError('full').
import { CloudError, withTimeout } from '../core/cloudSync.ts';
import type { CloudFile, CloudStore } from '../core/cloudSync.ts';

const API = 'https://www.googleapis.com/drive/v3/files';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';
const FIELDS = 'id,name,modifiedTime,size';

export interface DriveDeps {
  fetchFn: typeof fetch;
  accessToken(force?: boolean): Promise<string>;
  /** chờ trước khi thử lại (test thay bằng hàm không chờ) */
  sleep?: (ms: number) => Promise<void>;
  retries?: number;
  /** hạn chờ mỗi yêu cầu (mặc định 45 giây) */
  timeoutMs?: number;
}

const toFile = (j: { id: string; name: string; modifiedTime: string; size?: string | number }): CloudFile => ({
  id: j.id,
  name: j.name,
  modifiedTime: j.modifiedTime,
  size: j.size !== undefined ? Number(j.size) : undefined
});

export function createDriveStore(d: DriveDeps): CloudStore {
  const sleep = d.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const retries = d.retries ?? 4;
  let serverTime: number | null = null;
  let serverAt = 0;

  async function req(method: string, url: string, init: { body?: string; type?: string } = {}): Promise<Response> {
    let force = false;
    let lastErr: CloudError = new CloudError('network');
    for (let attempt = 0; attempt <= retries; attempt++) {
      if (attempt > 0 && !force) await sleep(Math.min(16_000, 500 * 2 ** (attempt - 1)));
      const token = await d.accessToken(force);
      force = false;
      let res: Response;
      try {
        const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
        if (init.type) headers['Content-Type'] = init.type;
        const ctl = new AbortController();
        res = await withTimeout(d.fetchFn(url, { method, headers, body: init.body, signal: ctl.signal }), d.timeoutMs ?? 45_000, 'request-timeout').catch((e: unknown) => {
          ctl.abort();
          throw e;
        });
      } catch (e) {
        lastErr = new CloudError('network', (e as Error).message);
        continue;
      }
      const date = res.headers.get('date');
      if (date && !Number.isNaN(Date.parse(date))) {
        serverTime = Date.parse(date);
        serverAt = Date.now();
      }
      if (res.ok) return res;
      let reason = '';
      try {
        const j = (await res.clone().json()) as { error?: { errors?: { reason?: string }[]; status?: string } };
        reason = j.error?.errors?.[0]?.reason ?? j.error?.status ?? '';
      } catch {
        /* không phải JSON */
      }
      if (res.status === 401 && attempt === 0) {
        force = true; // mã truy cập hết hạn sớm: gia hạn và thử lại ngay
        continue;
      }
      if (res.status === 401) throw new CloudError('relogin', 'unauthorized');
      if (/storageQuotaExceeded|quotaExceeded/i.test(reason)) throw new CloudError('full', reason);
      if (res.status === 429 || (res.status === 403 && /rateLimit|userRateLimit|RESOURCE_EXHAUSTED/i.test(reason)) || res.status >= 500) {
        lastErr = new CloudError(res.status >= 500 ? 'server' : 'rate', `${res.status} ${reason}`);
        continue;
      }
      if (res.status === 403 && /accessNotConfigured|SERVICE_DISABLED/i.test(reason)) throw new CloudError('config', reason);
      throw new CloudError('server', `${res.status} ${reason}`);
    }
    throw lastErr;
  }

  const store: CloudStore = {
    async list() {
      const out: CloudFile[] = [];
      let page: string | undefined;
      do {
        const q = new URLSearchParams({ spaces: 'appDataFolder', pageSize: '1000', fields: `nextPageToken,files(${FIELDS})` });
        if (page) q.set('pageToken', page);
        const j = (await (await req('GET', `${API}?${q}`)).json()) as { files?: { id: string; name: string; modifiedTime: string; size?: string }[]; nextPageToken?: string };
        out.push(...(j.files ?? []).map(toFile));
        page = j.nextPageToken;
      } while (page);
      return out;
    },
    async read(id) {
      return (await req('GET', `${API}/${encodeURIComponent(id)}?alt=media`)).text();
    },
    async create(name, text) {
      // tạo file rỗng trong thư mục ẩn, rồi ghi nội dung (hai bước đơn giản, chạy ổn trên cả Android)
      const meta = (await (
        await req('POST', `${API}?fields=${FIELDS}`, { body: JSON.stringify({ name, parents: ['appDataFolder'], mimeType: 'text/plain' }), type: 'application/json' })
      ).json()) as { id: string };
      return store.update(meta.id, text);
    },
    async update(id, text) {
      const j = await (await req('PATCH', `${UPLOAD}/${encodeURIComponent(id)}?uploadType=media&fields=${FIELDS}`, { body: text, type: 'text/plain' })).json();
      return toFile(j as { id: string; name: string; modifiedTime: string });
    },
    async remove(id) {
      await req('DELETE', `${API}/${encodeURIComponent(id)}`);
    },
    serverTime() {
      return serverTime === null ? null : serverTime + (Date.now() - serverAt);
    }
  };
  return store;
}
