// Máy con (điện thoại) nói chuyện với trạm PC qua HTTP trong mạng Wi-Fi.
import type { Data } from '../core/model.ts';
import type { SyncMeta } from '../core/sync.ts';

export const DEFAULT_PORT = 47821;

export class SyncHttpError extends Error {
  code: 'code' | 'unpaired' | 'too-many' | 'network' | 'timeout' | 'schema' | 'server';
  constructor(code: SyncHttpError['code'], message?: string) {
    super(message ?? code);
    this.code = code;
  }
}

/** "192.168.1.5" → "192.168.1.5:47821"; bỏ http://, khoảng trắng, dấu / cuối */
export function normalizeAddr(input: string): string {
  let a = input.trim().replace(/^https?:\/\//i, '').replace(/\/.*$/, '');
  a = a.replace(/[,，]/g, '.');
  if (!a) return '';
  if (!/:\d+$/.test(a)) a = `${a}:${DEFAULT_PORT}`;
  return a;
}

type FetchFn = typeof fetch;

async function call(fetchFn: FetchFn, url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const ctl = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  // Promise.race: fetch gốc của Android (CapacitorHttp) có thể bỏ qua signal, nên tự đặt hạn chờ
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      ctl.abort();
      reject(new Error('timeout'));
    }, timeoutMs);
  });
  try {
    return await Promise.race([fetchFn(url, { ...init, signal: ctl.signal }), timeout]);
  } catch (e) {
    throw new SyncHttpError(ctl.signal.aborted ? 'timeout' : 'network', (e as Error).message);
  } finally {
    clearTimeout(timer);
  }
}

async function errorOf(res: Response): Promise<SyncHttpError> {
  let body: { error?: string } = {};
  try {
    body = (await res.json()) as { error?: string };
  } catch {
    /* bỏ qua */
  }
  if (res.status === 403 && body.error === 'code') return new SyncHttpError('code');
  if (res.status === 401) return new SyncHttpError('unpaired');
  if (res.status === 429) return new SyncHttpError('too-many');
  if (res.status === 409) return new SyncHttpError('schema');
  return new SyncHttpError('server', `HTTP ${res.status}`);
}

export async function pairWithHub(fetchFn: FetchFn, addr: string, code: string, name: string): Promise<{ token: string; hubName: string }> {
  const res = await call(
    fetchFn,
    `http://${addr}/hcn/pair`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: code.trim(), name }) },
    8000
  );
  if (!res.ok) throw await errorOf(res);
  const j = (await res.json()) as { token: string; hubName: string };
  return { token: j.token, hubName: j.hubName };
}

export async function syncWithHub(
  fetchFn: FetchFn,
  addr: string,
  token: string,
  data: Data,
  meta: SyncMeta
): Promise<{ data: Data; meta: SyncMeta; changes: number; hubName: string }> {
  const res = await call(
    fetchFn,
    `http://${addr}/hcn/sync`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ schemaVersion: 1, data, meta })
    },
    20000
  );
  if (!res.ok) throw await errorOf(res);
  return (await res.json()) as { data: Data; meta: SyncMeta; changes: number; hubName: string };
}
