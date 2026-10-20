// Máy con (điện thoại) nói chuyện với trạm PC qua HTTP trong mạng nội bộ (Wi-Fi, cáp USB, Bluetooth).
//
// Vì sao lần sau hay không kết nối được (và cách xử lý ở đây):
// - IP của PC đổi sau mỗi lần nối lại (DHCP), dải mạng chia sẻ USB/Bluetooth của Android 11+ là ngẫu nhiên
//   → khi mọi địa chỉ đã biết đều hỏng, quét lại chính dải mạng điện thoại đang dùng (lấy từ hệ điều hành).
// - Một PC khác (cũng chạy HCN) có thể nhận đúng IP cũ → mỗi trạm có mã nhận dạng (hubId), không nhầm trạm,
//   và không coi câu trả lời "chưa ghép đôi" của PC lạ là bị gỡ ghép đôi.
import type { Data } from '../core/model.ts';
import type { SyncGuard, SyncMeta, SyncMode, SyncStats } from '../core/sync.ts';

export const DEFAULT_PORT = 47821;

export class SyncHttpError extends Error {
  code: 'code' | 'unpaired' | 'too-many' | 'network' | 'timeout' | 'schema' | 'server' | 'notFound';
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
/** Thời gian chờ được gửi kèm để lớp mạng gốc của Android tự hủy kết nối treo (fetch thường bỏ qua khóa này) */
export type TimedInit = RequestInit & { hcnTimeout?: number };

async function call(fetchFn: FetchFn, url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const ctl = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let timedOut = false;
  // Promise.race: fetch gốc của Android (CapacitorHttp) có thể bỏ qua signal, nên tự đặt hạn chờ
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      timedOut = true;
      ctl.abort();
      reject(new Error('timeout'));
    }, timeoutMs);
  });
  try {
    const timed: TimedInit = { ...init, signal: ctl.signal, hcnTimeout: timeoutMs };
    return await Promise.race([fetchFn(url, timed), timeout]);
  } catch (e) {
    const msg = (e as Error).message ?? '';
    throw new SyncHttpError(timedOut || /timed?\s?out/i.test(msg) ? 'timeout' : 'network', msg);
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

const isNetErr = (e: unknown): e is SyncHttpError => e instanceof SyncHttpError && (e.code === 'network' || e.code === 'timeout');

// ---------- Hỏi thăm một địa chỉ ----------

export interface ProbeResult {
  addr: string;
  ok: boolean;
  /** ok · timeout: không phản hồi (thường do tường lửa / khác mạng) · network: bị từ chối hoặc không tới được · not-hcn: máy khác */
  reason: 'ok' | 'timeout' | 'network' | 'not-hcn';
  ms: number;
  name?: string;
  id?: string;
  addresses?: string[];
}

export async function probeHub(fetchFn: FetchFn, addr: string, timeoutMs = 1500): Promise<ProbeResult> {
  const t0 = Date.now();
  try {
    const res = await call(fetchFn, `http://${addr}/hcn/ping`, { method: 'GET' }, timeoutMs);
    const ms = Date.now() - t0;
    if (!res.ok) return { addr, ok: false, reason: 'not-hcn', ms };
    const j = (await res.json()) as { app?: string; name?: string; id?: string; addresses?: string[] };
    if (j.app !== 'HCN') return { addr, ok: false, reason: 'not-hcn', ms };
    return { addr, ok: true, reason: 'ok', ms, name: j.name ?? '', id: j.id || undefined, addresses: j.addresses ?? [] };
  } catch (e) {
    return { addr, ok: false, reason: e instanceof SyncHttpError && e.code === 'timeout' ? 'timeout' : 'network', ms: Date.now() - t0 };
  }
}

/** Hỏi một địa chỉ có phải PC chạy HCN không */
export async function pingHub(fetchFn: FetchFn, addr: string, timeoutMs = 1500): Promise<{ name: string; id?: string; addresses: string[] } | null> {
  const r = await probeHub(fetchFn, addr, timeoutMs);
  return r.ok ? { name: r.name ?? '', id: r.id, addresses: r.addresses ?? [] } : null;
}

// ---------- Mạng của chính điện thoại ----------

/** Một card mạng của điện thoại (đọc từ Android) */
export interface LocalNet {
  name: string;
  address: string;
  prefix?: number;
}
export type LocalKind = 'wifi' | 'usb' | 'bluetooth' | 'hotspot' | 'cellular' | 'vpn' | 'other';

/** Đoán loại kết nối từ tên card mạng của Android */
export function classifyLocal(name: string): LocalKind {
  const n = name.toLowerCase();
  if (/^(rmnet|ccmni|pdp|v4-|clat|seth|rev_rmnet|wwan|dummy|ifb|sit|ip6tnl)/.test(n)) return 'cellular';
  if (/^(tun|ppp|ipsec|wg|tap)/.test(n)) return 'vpn';
  if (/^(rndis|usb|ncm)/.test(n)) return 'usb';
  if (/^(bt-pan|bnep|bt)/.test(n)) return 'bluetooth';
  if (/^(ap|swlan|softap|wlan[1-9]|p2p|wifi-aware)/.test(n)) return 'hotspot';
  if (/^(wlan|wl)/.test(n)) return 'wifi';
  return 'other';
}

/** Card mạng có thể dẫn tới PC (bỏ 4G/5G, VPN, địa chỉ tự cấp 169.254) */
export function usableNets(list: LocalNet[]): (LocalNet & { kind: LocalKind })[] {
  return list
    .filter((n) => /^\d+\.\d+\.\d+\.\d+$/.test(n.address) && !n.address.startsWith('127.') && !n.address.startsWith('169.254.'))
    .map((n) => ({ ...n, kind: classifyLocal(n.name) }))
    .filter((n) => n.kind !== 'cellular' && n.kind !== 'vpn');
}

const prefix24 = (addr: string): string | null => /^(\d+\.\d+\.\d+)\.\d+/.exec(addr)?.[1] ?? null;
const portOf = (addr: string): number | null => {
  const m = /:(\d+)$/.exec(addr);
  return m ? Number(m[1]) : null;
};

/** Dải /24 của các mạng điện thoại đang dùng — nơi PC chắc chắn nằm nếu hai máy nối với nhau */
export function localPrefixes(list: LocalNet[]): string[] {
  return [...new Set(usableNets(list).map((n) => prefix24(n.address)).filter((x): x is string => !!x))];
}

/** Địa chỉ PC này đi qua mạng nào của điện thoại (cùng dải /24) */
export function routeKind(addr: string, list: LocalNet[] | null): LocalKind | null {
  if (!list) return null;
  const p = prefix24(addr);
  return usableNets(list).find((n) => prefix24(n.address) === p)?.kind ?? null;
}

/**
 * Dải mạng hay gặp khi không cùng Wi-Fi: chia sẻ qua USB (42), Bluetooth (44), điểm phát của điện thoại (43),
 * Wi-Fi Direct (49), điểm phát di động của Windows (137), điểm phát iPhone (172.20.10).
 * Android 11+ chọn dải ngẫu nhiên cho USB/Bluetooth nên quét dải thật của điện thoại vẫn là chính.
 */
export const TETHER_PREFIXES = ['192.168.42', '192.168.44', '192.168.43', '192.168.49', '192.168.137', '172.20.10'];

export interface FoundHubResult {
  addr: string;
  name: string;
  id?: string;
}

export interface DiscoverOpts {
  port?: number;
  /** dải dự phòng (mặc định TETHER_PREFIXES) */
  prefixes?: string[];
  /** dải của chính điện thoại: quét trước tiên */
  localPrefixes?: string[];
  /** chỉ nhận đúng PC này */
  hubId?: string | null;
  /** địa chỉ đã biết chỉ dùng để suy ra dải và cổng, không hỏi lại */
  skipKnown?: boolean;
  concurrency?: number;
  timeoutMs?: number;
}

/**
 * Tìm PC: thử các địa chỉ đã biết, rồi quét dải mạng của chính điện thoại, dải của địa chỉ cũ, các dải chia sẻ mạng.
 * Có hubId: dừng ngay khi gặp đúng PC đó. Không có: quét hết dải đầu tiên có PC để liệt kê đủ các PC.
 */
export async function discoverHubs(fetchFn: FetchFn, known: string[], opts: DiscoverOpts = {}): Promise<FoundHubResult[]> {
  const hubId = opts.hubId ?? null;
  const found: FoundHubResult[] = [];
  const seen = new Set<string>();
  const matches = (r: ProbeResult) => !hubId || !r.id || r.id === hubId;
  const done = () => !!hubId && found.length > 0;
  const probe = async (addr: string, timeoutMs: number) => {
    if (seen.has(addr)) return;
    seen.add(addr);
    const r = await probeHub(fetchFn, addr, timeoutMs);
    if (r.ok && matches(r) && !found.some((f) => f.addr === addr)) found.push({ addr, name: r.name ?? '', id: r.id });
  };
  const knownList = [...new Set(known.filter(Boolean))];
  if (opts.skipKnown) knownList.forEach((a) => seen.add(a));
  else {
    await Promise.all(knownList.map((a) => probe(a, Math.max(opts.timeoutMs ?? 1200, 1500))));
    if (found.length) return found;
  }
  const prefixes: string[] = [];
  const add = (p: string | null) => p && !prefixes.includes(p) && prefixes.push(p);
  (opts.localPrefixes ?? []).forEach(add);
  knownList.forEach((k) => add(prefix24(k)));
  (opts.prefixes ?? TETHER_PREFIXES).forEach(add);
  const ports = [...new Set([opts.port ?? DEFAULT_PORT, ...knownList.map(portOf).filter((x): x is number => !!x)])];
  const conc = opts.concurrency ?? 48;
  for (const pre of prefixes) {
    const queue: string[] = [];
    for (const port of ports) for (let i = 1; i <= 254; i++) queue.push(`${pre}.${i}:${port}`);
    const before = found.length;
    await Promise.all(
      Array.from({ length: conc }, async () => {
        while (queue.length && !done()) await probe(queue.shift()!, opts.timeoutMs ?? 1200);
      })
    );
    if (done() || (!hubId && found.length > before)) break;
  }
  return found;
}

// ---------- Ghép đôi và đồng bộ ----------

export interface PairResult {
  token: string;
  hubName: string;
  hubId: string | null;
  addresses: string[];
}

export async function pairWithHub(fetchFn: FetchFn, addr: string, code: string, name: string): Promise<PairResult> {
  const res = await call(
    fetchFn,
    `http://${addr}/hcn/pair`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: code.trim(), name }) },
    8000
  );
  if (!res.ok) throw await errorOf(res);
  const j = (await res.json()) as { token: string; hubName: string; hubId?: string; addresses?: string[] };
  return { token: j.token, hubName: j.hubName, hubId: j.hubId ?? null, addresses: j.addresses ?? [] };
}

export interface SyncResult {
  data: Data;
  meta: SyncMeta;
  changes: number;
  hubName: string;
  hubId?: string;
  addresses?: string[];
  /** PC chưa ghi gì: cần người dùng chọn cách đồng bộ (data/meta không có) */
  needsChoice?: SyncStats;
  mode?: SyncMode;
}
export interface SyncOpts {
  mode?: SyncMode;
  guard?: SyncGuard;
}

export async function syncWithHub(fetchFn: FetchFn, addr: string, token: string, data: Data, meta: SyncMeta, opts: SyncOpts = {}): Promise<SyncResult> {
  const res = await call(
    fetchFn,
    `http://${addr}/hcn/sync`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ schemaVersion: 1, data, meta, mode: opts.mode ?? 'merge', guard: opts.guard ?? 'normal' })
    },
    20000
  );
  if (!res.ok) throw await errorOf(res);
  return (await res.json()) as SyncResult;
}

export interface SmartArgs {
  primary: string;
  hosts: string[];
  token: string;
  hubId?: string | null;
  data: Data;
  meta: SyncMeta;
  opts?: SyncOpts;
  /** quét tìm lại PC khi mọi địa chỉ đã biết đều hỏng; null = không quét */
  scan?: { localPrefixes: string[]; tether: boolean; port?: number } | null;
}

/**
 * Đồng bộ, tự tìm đường:
 * 1) địa chỉ đang dùng → 2) các địa chỉ khác đã biết của PC (Wi-Fi ↔ USB ↔ Bluetooth) →
 * 3) quét lại dải mạng của điện thoại (PC đổi IP, dải chia sẻ mới). Chỉ nhận đúng PC đã ghép đôi.
 */
export async function syncSmart(fetchFn: FetchFn, a: SmartArgs): Promise<{ addr: string; result: SyncResult; hubId: string | null }> {
  const tryHost = async (addr: string, isPrimary: boolean): Promise<SyncResult> => {
    try {
      return await syncWithHub(fetchFn, addr, a.token, a.data, a.meta, a.opts);
    } catch (e) {
      if (e instanceof SyncHttpError && e.code === 'unpaired') {
        // IP có thể đã thuộc về PC khác: chỉ coi là bị gỡ khi chắc đây đúng là PC đã ghép đôi
        if (a.hubId) {
          const p = await probeHub(fetchFn, addr, 2000);
          if (p.ok && p.id && p.id !== a.hubId) throw new SyncHttpError('network', 'other-hub');
        } else if (!isPrimary) throw new SyncHttpError('network', 'other-hub');
      }
      throw e;
    }
  };
  const ok = (addr: string, result: SyncResult) => ({ addr, result, hubId: result.hubId ?? a.hubId ?? null });
  let lastErr: unknown;
  try {
    return ok(a.primary, await tryHost(a.primary, true));
  } catch (e) {
    if (!isNetErr(e)) throw e;
    lastErr = e;
  }
  const tried = new Set([a.primary]);
  const others = [...new Set(a.hosts)].filter((h) => !tried.has(h));
  if (others.length) {
    const probes = await Promise.all(others.map((h) => probeHub(fetchFn, h, 2500)));
    const alive = probes.filter((p) => p.ok && (!a.hubId || !p.id || p.id === a.hubId)).sort((x, y) => x.ms - y.ms);
    for (const p of alive) {
      tried.add(p.addr);
      try {
        return ok(p.addr, await tryHost(p.addr, false));
      } catch (e) {
        if (!isNetErr(e)) throw e;
        lastErr = e;
      }
    }
    others.forEach((h) => tried.add(h));
  }
  if (a.scan) {
    const found = await discoverHubs(fetchFn, [...tried], {
      skipKnown: true,
      localPrefixes: a.scan.localPrefixes,
      prefixes: a.scan.tether ? TETHER_PREFIXES : [],
      hubId: a.hubId,
      port: a.scan.port
    });
    for (const f of found) {
      try {
        return ok(f.addr, await tryHost(f.addr, false));
      } catch (e) {
        if (!isNetErr(e)) throw e;
        lastErr = e;
      }
    }
  }
  throw lastErr;
}

/** Bản cũ: chỉ đổi giữa các địa chỉ đã biết, không quét */
export async function syncWithFailover(
  fetchFn: FetchFn,
  primary: string,
  hosts: string[],
  token: string,
  data: Data,
  meta: SyncMeta,
  hubId?: string | null,
  opts?: SyncOpts
): Promise<{ addr: string; result: SyncResult }> {
  const r = await syncSmart(fetchFn, { primary, hosts, token, data, meta, hubId, opts });
  return { addr: r.addr, result: r.result };
}

/**
 * Ghép đôi: có địa chỉ thì thử địa chỉ đó; không có (hoặc không tới được) thì tự tìm PC
 * rồi thử mã trên từng PC tìm thấy (PC nào đúng mã thì ghép với PC đó).
 */
export async function pairAuto(
  fetchFn: FetchFn,
  args: { addr?: string; code: string; name: string; localPrefixes: string[]; prefixes?: string[]; port?: number }
): Promise<PairResult & { addr: string }> {
  const addr = args.addr ? normalizeAddr(args.addr) : '';
  if (addr) {
    try {
      return { addr, ...(await pairWithHub(fetchFn, addr, args.code, args.name)) };
    } catch (e) {
      if (!isNetErr(e)) throw e;
    }
  }
  const found = await discoverHubs(fetchFn, addr ? [addr] : [], { skipKnown: !!addr, localPrefixes: args.localPrefixes, prefixes: args.prefixes, port: args.port });
  if (!found.length) throw new SyncHttpError('notFound');
  let lastErr: unknown = new SyncHttpError('notFound');
  const ids = new Set<string>();
  for (const f of found) {
    // cùng một PC thấy ở nhiều địa chỉ: chỉ thử mã một lần
    if (f.id && ids.has(f.id)) continue;
    if (f.id) ids.add(f.id);
    try {
      return { addr: f.addr, ...(await pairWithHub(fetchFn, f.addr, args.code, args.name)) };
    } catch (e) {
      lastErr = e;
      if (e instanceof SyncHttpError && (e.code === 'code' || isNetErr(e))) continue;
      throw e;
    }
  }
  throw lastErr;
}

// ---------- Kiểm tra kết nối ----------

export type DiagHint =
  | 'ok'
  | 'addrChanged'
  | 'noLocalNet'
  | 'diffNet'
  | 'firewall'
  | 'hubOff'
  | 'otherHub'
  | 'notFound';

export interface DiagReport {
  nets: (LocalNet & { kind: LocalKind })[] | null;
  probes: ProbeResult[];
  found: FoundHubResult[];
  hints: DiagHint[];
}

/** Kết luận nguyên nhân từ kết quả đo (thuần, để test) */
export function diagHints(nets: LocalNet[] | null, probes: ProbeResult[], found: FoundHubResult[], hubId: string | null): DiagHint[] {
  const mine = (r: { id?: string }) => !hubId || !r.id || r.id === hubId;
  if (probes.some((p) => p.ok && mine(p))) return ['ok'];
  if (found.some(mine)) return ['addrChanged'];
  const hints: DiagHint[] = [];
  const usable = nets ? usableNets(nets) : null;
  if (usable && usable.length === 0) hints.push('noLocalNet');
  if (probes.some((p) => p.ok && !mine(p))) hints.push('otherHub');
  const pre = usable ? new Set(usable.map((n) => prefix24(n.address))) : null;
  const same = probes.filter((p) => !pre || pre.has(prefix24(p.addr)));
  if (same.some((p) => p.reason === 'timeout')) hints.push('firewall');
  if (same.some((p) => p.reason === 'network')) hints.push('hubOff');
  if (usable && usable.length && probes.length && !same.length) hints.push('diffNet');
  if (!probes.length && !hints.includes('noLocalNet')) hints.push('notFound');
  if (!hints.length) hints.push('notFound');
  return hints;
}

export async function diagnose(
  fetchFn: FetchFn,
  args: { nets: LocalNet[] | null; hosts: string[]; hubId: string | null; port?: number }
): Promise<DiagReport> {
  const hosts = [...new Set(args.hosts.filter(Boolean))];
  const probes = await Promise.all(hosts.map((h) => probeHub(fetchFn, h, 3000)));
  let found: FoundHubResult[] = [];
  if (!probes.some((p) => p.ok && (!args.hubId || !p.id || p.id === args.hubId))) {
    // biết mạng thật của điện thoại thì PC chỉ có thể nằm trong các dải đó; không biết thì thử cả dải chia sẻ mạng
    found = await discoverHubs(fetchFn, hosts, {
      skipKnown: true,
      localPrefixes: args.nets ? localPrefixes(args.nets) : [],
      prefixes: args.nets ? [] : TETHER_PREFIXES,
      hubId: args.hubId,
      port: args.port
    });
  }
  return { nets: args.nets ? usableNets(args.nets) : null, probes, found, hints: diagHints(args.nets, probes, found, args.hubId) };
}
