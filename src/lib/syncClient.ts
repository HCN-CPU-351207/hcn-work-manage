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

/** Hỏi một địa chỉ có phải PC chạy HCN không */
export async function pingHub(fetchFn: FetchFn, addr: string, timeoutMs = 1500): Promise<{ name: string; addresses: string[] } | null> {
  try {
    const res = await call(fetchFn, `http://${addr}/hcn/ping`, { method: 'GET' }, timeoutMs);
    if (!res.ok) return null;
    const j = (await res.json()) as { app?: string; name?: string; addresses?: string[] };
    return j.app === 'HCN' ? { name: j.name ?? '', addresses: j.addresses ?? [] } : null;
  } catch {
    return null;
  }
}

/** Dải mạng thường gặp khi chia sẻ mạng trên Android: USB (42), điểm phát Wi-Fi (43), Bluetooth (44), Wi-Fi Direct (49) */
export const TETHER_PREFIXES = ['192.168.42', '192.168.44', '192.168.43', '192.168.49'];

/**
 * Tìm PC: thử các địa chỉ đã biết, rồi quét các dải mạng chia sẻ (USB/Bluetooth/điểm phát) và dải của địa chỉ cũ.
 * Dừng khi tìm thấy. Mỗi địa chỉ chờ tối đa ~0,8 giây, chạy song song.
 */
export async function discoverHubs(
  fetchFn: FetchFn,
  known: string[],
  opts: { port?: number; prefixes?: string[]; concurrency?: number; timeoutMs?: number } = {}
): Promise<{ addr: string; name: string }[]> {
  const port = opts.port ?? DEFAULT_PORT;
  const found: { addr: string; name: string }[] = [];
  const seen = new Set<string>();
  const probe = async (addr: string) => {
    if (seen.has(addr)) return;
    seen.add(addr);
    const r = await pingHub(fetchFn, addr, opts.timeoutMs ?? 800);
    if (r && !found.some((f) => f.addr === addr)) found.push({ addr, name: r.name });
  };
  await Promise.all(known.map((a) => probe(a)));
  if (found.length) return found;
  const prefixes = [...(opts.prefixes ?? TETHER_PREFIXES)];
  for (const k of known) {
    const m = /^(\d+\.\d+\.\d+)\.\d+/.exec(k);
    if (m && !prefixes.includes(m[1])) prefixes.push(m[1]);
  }
  const conc = opts.concurrency ?? 48;
  for (const pre of prefixes) {
    const queue = Array.from({ length: 254 }, (_, i) => `${pre}.${i + 1}:${port}`);
    await Promise.all(
      Array.from({ length: conc }, async () => {
        while (queue.length && !found.length) await probe(queue.shift()!);
      })
    );
    if (found.length) break;
  }
  return found;
}

export async function pairWithHub(fetchFn: FetchFn, addr: string, code: string, name: string): Promise<{ token: string; hubName: string; addresses: string[] }> {
  const res = await call(
    fetchFn,
    `http://${addr}/hcn/pair`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: code.trim(), name }) },
    8000
  );
  if (!res.ok) throw await errorOf(res);
  const j = (await res.json()) as { token: string; hubName: string; addresses?: string[] };
  return { token: j.token, hubName: j.hubName, addresses: j.addresses ?? [] };
}

export async function syncWithHub(
  fetchFn: FetchFn,
  addr: string,
  token: string,
  data: Data,
  meta: SyncMeta
): Promise<{ data: Data; meta: SyncMeta; changes: number; hubName: string; addresses?: string[] }> {
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
  return (await res.json()) as { data: Data; meta: SyncMeta; changes: number; hubName: string; addresses?: string[] };
}

/**
 * Đồng bộ, tự đổi đường: thử địa chỉ đang dùng; nếu không tới được (mất Wi-Fi, rút cáp…)
 * thì hỏi song song các địa chỉ khác của PC (USB, Bluetooth, Wi-Fi khác) và dùng địa chỉ trả lời đầu tiên.
 */
export async function syncWithFailover(
  fetchFn: FetchFn,
  primary: string,
  hosts: string[],
  token: string,
  data: Data,
  meta: SyncMeta
): Promise<{ addr: string; result: Awaited<ReturnType<typeof syncWithHub>> }> {
  try {
    return { addr: primary, result: await syncWithHub(fetchFn, primary, token, data, meta) };
  } catch (e) {
    if (!(e instanceof SyncHttpError) || (e.code !== 'network' && e.code !== 'timeout')) throw e;
    const others = [...new Set(hosts)].filter((h) => h !== primary);
    if (!others.length) throw e;
    const alive = await new Promise<string | null>((resolve) => {
      let left = others.length;
      for (const h of others)
        void pingHub(fetchFn, h, 2000).then((r) => {
          if (r) resolve(h);
          else if (--left === 0) resolve(null);
        });
    });
    if (!alive) throw e;
    return { addr: alive, result: await syncWithHub(fetchFn, alive, token, data, meta) };
  }
}
