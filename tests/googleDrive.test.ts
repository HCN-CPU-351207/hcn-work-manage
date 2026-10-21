// Đăng nhập Google (PKCE), Drive REST (thử lại, lỗi), bộ điều phối đồng bộ Drive
import { describe, it, expect } from 'vitest';
import { buildAuthUrl, createGoogleAuth, emailFromIdToken, makePkce, parseCallback, b64url } from '../src/lib/googleAuth.ts';
import type { StoredGoogle } from '../src/lib/googleAuth.ts';
import { createDriveStore } from '../src/lib/drive.ts';
import { createCloudDriver } from '../src/lib/cloudDriver.ts';
import { CloudError } from '../src/core/cloudSync.ts';
import type { CloudFile, CloudStore } from '../src/core/cloudSync.ts';
import { createDataHub } from '../src/core/dataHub.ts';
import { emptyData } from '../src/core/model.ts';
import { initMeta } from '../src/core/sync.ts';
import { clockOffset as currentOffset, setClockOffset } from '../src/core/clock.ts';
import { mkThang } from './helpers.ts';

const jwt = (payload: object) => `x.${b64url(new TextEncoder().encode(JSON.stringify(payload)))}.y`;

describe('đăng nhập Google', () => {
  it('đường dẫn đăng nhập có PKCE S256, offline, đúng quyền tối thiểu', async () => {
    const { verifier, challenge } = await makePkce();
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
    expect(challenge).toBe(b64url(digest));
    const u = new URL(buildAuthUrl({ clientId: 'cid', redirectUri: 'http://127.0.0.1:5000', challenge, state: 's1', loginHint: 'an@gmail.com' }));
    expect(u.searchParams.get('scope')).toBe('openid email https://www.googleapis.com/auth/drive.appdata');
    expect(u.searchParams.get('access_type')).toBe('offline');
    expect(u.searchParams.get('code_challenge_method')).toBe('S256');
    expect(u.searchParams.get('login_hint')).toBe('an@gmail.com');
  });
  it('đọc email từ id_token (cả chữ có dấu) và kết quả gọi lại', () => {
    expect(emailFromIdToken(jwt({ email: 'an@gmail.com', name: 'Nguyễn An' }))).toBe('an@gmail.com');
    expect(emailFromIdToken('bad')).toBe(null);
    expect(parseCallback('com.hcn.workmanage:/oauth2redirect?code=abc&state=xyz')).toEqual({ code: 'abc', state: 'xyz', error: undefined });
    expect(parseCallback('http://127.0.0.1:5000/?error=access_denied').error).toBe('access_denied');
  });

  function mkAuth(responses: ((f: Record<string, string>) => { status: number; json: Record<string, unknown> | null } | Error)[], cb?: (state: string) => string) {
    let saved: StoredGoogle | null = null;
    const posts: Record<string, string>[] = [];
    let t = 0;
    const auth = createGoogleAuth({
      clientId: 'cid',
      clientSecret: 'sec',
      postForm: async (_url, f) => {
        posts.push(f);
        const r = responses.shift()!(f);
        if (r instanceof Error) throw r;
        return r;
      },
      load: async () => saved,
      save: async (s) => {
        saved = s;
      },
      interactive: async (build) => {
        const url = new URL(build('http://127.0.0.1:5000'));
        const st = url.searchParams.get('state')!;
        return { callbackUrl: cb ? cb(st) : `http://127.0.0.1:5000/?code=CODE&state=${st}`, redirectUri: 'http://127.0.0.1:5000' };
      },
      now: () => t
    });
    return { auth, posts, saved: () => saved, advance: (ms: number) => (t += ms) };
  }
  const tokenOk = () => ({ status: 200, json: { access_token: 'A1', refresh_token: 'R1', expires_in: 3600, id_token: jwt({ email: 'an@gmail.com' }) } });

  it('đăng nhập: đổi mã lấy mã gia hạn, lưu lại; mã truy cập dùng lại tới khi hết hạn rồi tự gia hạn', async () => {
    const m = mkAuth([tokenOk, () => ({ status: 200, json: { access_token: 'A2', expires_in: 3600 } })]);
    expect(await m.auth.signIn()).toBe('an@gmail.com');
    expect(m.saved()).toEqual({ refresh: 'R1', email: 'an@gmail.com' });
    expect(m.posts[0]).toEqual({ grant_type: 'authorization_code', code: 'CODE', code_verifier: m.posts[0].code_verifier, client_id: 'cid', redirect_uri: 'http://127.0.0.1:5000', client_secret: 'sec' });
    expect(await m.auth.accessToken()).toBe('A1');
    m.advance(3600_000);
    expect(await m.auth.accessToken()).toBe('A2');
    expect(m.posts[1].grant_type).toBe('refresh_token');
  });
  it('Google báo mã gia hạn bị thu hồi → bỏ đăng nhập, báo đăng nhập lại', async () => {
    const m = mkAuth([tokenOk, () => ({ status: 400, json: { error: 'invalid_grant' } })]);
    await m.auth.signIn();
    let err: unknown;
    try {
      await m.auth.accessToken(true);
    } catch (e) {
      err = e;
    }
    expect((err as CloudError).code).toBe('relogin');
    expect(m.auth.signedIn()).toBe(false);
    expect(m.saved()).toBe(null);
  });
  it('mất mạng khi gia hạn → KHÔNG bỏ đăng nhập', async () => {
    const m = mkAuth([tokenOk, () => new Error('offline')]);
    await m.auth.signIn();
    let err: unknown;
    try {
      await m.auth.accessToken(true);
    } catch (e) {
      err = e;
    }
    expect((err as CloudError).code).toBe('network');
    expect(m.auth.signedIn()).toBe(true);
  });
  it('người dùng bấm Hủy / sai state → cancel, không lưu gì', async () => {
    const m = mkAuth([], () => 'http://127.0.0.1:5000/?error=access_denied');
    let err: unknown;
    try {
      await m.auth.signIn();
    } catch (e) {
      err = e;
    }
    expect((err as CloudError).code).toBe('cancel');
    const m2 = mkAuth([], () => 'http://127.0.0.1:5000/?code=X&state=khac');
    try {
      await m2.auth.signIn();
    } catch (e) {
      err = e;
    }
    expect((err as CloudError).code).toBe('cancel');
    expect(m2.saved()).toBe(null);
  });
});

describe('Drive REST', () => {
  const json = (status: number, body: unknown, date?: string) =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...(date ? { date } : {}) } });
  function mk(responses: (Response | Error)[]) {
    const calls: { method: string; url: string; auth: string; body?: string }[] = [];
    let forced = 0;
    const store = createDriveStore({
      fetchFn: (async (url: string, init: RequestInit) => {
        calls.push({ method: String(init.method), url, auth: String((init.headers as Record<string, string>).Authorization), body: init.body as string | undefined });
        const r = responses.shift()!;
        if (r instanceof Error) throw r;
        return r;
      }) as unknown as typeof fetch,
      accessToken: async (force) => {
        if (force) forced++;
        return force ? 'T2' : 'T1';
      },
      sleep: async () => {}
    });
    return { store, calls, forced: () => forced };
  }
  it('liệt kê nhiều trang trong thư mục ẩn, ghi nhận giờ máy chủ', async () => {
    const m = mk([
      json(200, { files: [{ id: '1', name: 'a', modifiedTime: 't', size: '5' }], nextPageToken: 'p2' }, 'Tue, 20 Oct 2026 08:00:00 GMT'),
      json(200, { files: [{ id: '2', name: 'b', modifiedTime: 't' }] })
    ]);
    const list = await m.store.list();
    expect(list.map((f: CloudFile) => f.id)).toEqual(['1', '2']);
    expect(list[0].size).toBe(5);
    expect(m.calls[0].url).toContain('spaces=appDataFolder');
    expect(m.calls[1].url).toContain('pageToken=p2');
    expect(Math.abs(m.store.serverTime()! - Date.parse('2026-10-20T08:00:00Z'))).toBeLessThan(5000);
  });
  it('401 → gia hạn mã và thử lại ngay', async () => {
    const m = mk([json(401, {}), new Response('nội dung', { status: 200 })]);
    expect(await m.store.read('x')).toBe('nội dung');
    expect(m.forced()).toBe(1);
    expect(m.calls[1].auth).toBe('Bearer T2');
  });
  it('429 / quá tải / mất mạng → chờ rồi thử lại', async () => {
    const m = mk([json(429, {}), json(403, { error: { errors: [{ reason: 'userRateLimitExceeded' }] } }), new Error('reset'), json(503, {}), json(200, { files: [] })]);
    expect(await m.store.list()).toEqual([]);
    expect(m.calls.length).toBe(5);
  });
  it('Drive đầy → báo full; API chưa bật → config; mất mạng mãi → network', async () => {
    const codeOf = async (p: Promise<unknown>) => {
      try {
        await p;
      } catch (e) {
        return (e as CloudError).code;
      }
      return 'none';
    };
    expect(await codeOf(mk([json(403, { error: { errors: [{ reason: 'storageQuotaExceeded' }] } })]).store.update('x', 't'))).toBe('full');
    expect(await codeOf(mk([json(403, { error: { errors: [{ reason: 'accessNotConfigured' }] } })]).store.list())).toBe('config');
    expect(await codeOf(mk(Array.from({ length: 5 }, () => new Error('off'))).store.list())).toBe('network');
  });
  it('tạo file: tạo trong thư mục ẩn rồi ghi nội dung', async () => {
    const m = mk([json(200, { id: 'n1', name: 'f', modifiedTime: 't' }), json(200, { id: 'n1', name: 'f', modifiedTime: 't2' })]);
    const f = await m.store.create('f', '{"a":1}');
    expect(f.modifiedTime).toBe('t2');
    expect(JSON.parse(m.calls[0].body!)).toEqual({ name: 'f', parents: ['appDataFolder'], mimeType: 'text/plain' });
    expect(m.calls[1].method).toBe('POST');
    expect(m.calls[1].url).toContain('/upload/drive/v3/files/n1?uploadType=media');
    expect(m.calls[1].body).toBe('{"a":1}');
  });
});

describe('bộ điều phối đồng bộ Drive', () => {
  function memStore(): CloudStore {
    const files = new Map<string, { name: string; text: string; mt: string }>();
    let n = 0;
    let t = Date.parse('2026-10-20T00:00:00Z');
    const meta = (id: string): CloudFile => ({ id, name: files.get(id)!.name, modifiedTime: files.get(id)!.mt });
    return {
      list: async () => [...files.keys()].map(meta),
      read: async (id) => files.get(id)!.text,
      create: async (name, text) => {
        const id = `f${++n}`;
        files.set(id, { name, text, mt: new Date(++t).toISOString() });
        return meta(id);
      },
      update: async (id, text) => {
        files.set(id, { ...files.get(id)!, text, mt: new Date(++t).toISOString() });
        return meta(id);
      },
      remove: async (id) => void files.delete(id),
      serverTime: () => Date.now() + 10 * 60_000 // giờ máy chậm 10 phút
    };
  }
  function mkDevice(store: CloudStore | { s: CloudStore }, email: { v: string }, data = emptyData()) {
    const ref = 's' in store ? store : { s: store };
    const hub = createDataHub({ data, meta: initMeta(data, 1) });
    let signed = false;
    let state: unknown = null;
    const auth = {
      init: async () => {},
      email: () => (signed ? email.v : null),
      signedIn: () => signed,
      signIn: async () => {
        signed = true;
        return email.v;
      },
      signOut: async () => {
        signed = false;
      },
      accessToken: async () => 'T'
    };
    let id = 0;
    const drv = createCloudDriver({
      configured: true,
      auth: auth as never,
      makeStore: () => ref.s,
      loadState: async () => state as never,
      saveState: async (s) => {
        state = s;
      },
      getLocal: async () => hub.state,
      applyResult: async (d, m, mode) => {
        if (mode === 'pull') hub.reset(d, m);
        else hub.adoptFromHub(d, m, Date.now());
      },
      backupLocal: async () => {},
      deviceName: 'x',
      platform: 'test',
      newId: () => `id${Math.random().toString(16).slice(2)}${++id}`
    });
    return { hub, drv };
  }

  it('đăng nhập → tự đồng bộ; máy thứ hai cùng tài khoản nhận dữ liệu; sửa lệch giờ', async () => {
    const store = memStore();
    const pc = mkDevice(store, { v: 'an@gmail.com' }, { ...emptyData(), thang: [mkThang({ id: 't1', ma: 'M001' })], counters: { M: 1, W: 0, D: 0 } });
    const r = await pc.drv.action({ type: 'signIn' });
    expect(r.error).toBeUndefined();
    expect(r.vaultEmail).toBe('an@gmail.com');
    expect(r.skewMin).toBe(10);
    expect(Math.round(currentOffset() / 60_000)).toBe(10);
    setClockOffset(0);
    const phone = mkDevice(store, { v: 'an@gmail.com' });
    const r2 = await phone.drv.action({ type: 'signIn' });
    expect(r2.devices).toBe(1);
    expect(phone.hub.state.data.thang).toHaveLength(1);
    const b = await phone.drv.action({ type: 'listBackups' });
    expect(b.backups!.length).toBeGreaterThan(0);
    const data = await phone.drv.action({ type: 'readBackup', id: b.backups![0].id });
    expect(data.backupData!.thang).toHaveLength(1);
  });

  it('đăng nhập nhầm tài khoản khác trên máy đã liên kết → chặn, phải Hủy liên kết mới đổi được', async () => {
    const ref = { s: memStore() };
    const email = { v: 'an@gmail.com' };
    const pc = mkDevice(ref, email);
    await pc.drv.action({ type: 'signIn' });
    await pc.drv.action({ type: 'signOut' });
    // Hủy liên kết xong thì đăng nhập tài khoản khác (Drive khác) được
    email.v = 'binh@gmail.com';
    ref.s = memStore();
    const r = await pc.drv.action({ type: 'signIn' });
    expect(r.error).toBeUndefined();
    expect(r.vaultEmail).toBe('binh@gmail.com');
  });

  it('đang liên kết mà token đổi sang tài khoản khác → wrongAccount', async () => {
    const store = memStore();
    const email = { v: 'an@gmail.com' };
    const pc = mkDevice(store, email);
    await pc.drv.action({ type: 'signIn' });
    email.v = 'binh@gmail.com';
    const r = await pc.drv.action({ type: 'syncNow' });
    expect(r.error).toBe('wrongAccount');
    expect(r.wrongOwner).toBe('an@gmail.com');
    expect((await pc.drv.action({ type: 'listBackups' })).error).toBe('wrongAccount');
  });

  it('hỏi cách đồng bộ, chọn rồi đồng bộ; xem trước rồi "Để sau" thì bỏ', async () => {
    const store = memStore();
    const pc = mkDevice(store, { v: 'an@gmail.com' }, { ...emptyData(), thang: [mkThang({ id: 't1', ma: 'M001' })], counters: { M: 1, W: 0, D: 0 } });
    await pc.drv.action({ type: 'signIn' });
    const phone = mkDevice(store, { v: 'an@gmail.com' }, { ...emptyData(), thang: [mkThang({ id: 'p1', ma: 'M001' })], counters: { M: 1, W: 0, D: 0 } });
    const r = await phone.drv.action({ type: 'signIn' });
    expect(r.choice?.pc.total).toBe(1);
    const r2 = await phone.drv.action({ type: 'resolve', mode: 'pull' });
    expect(r2.choice).toBe(null);
    expect(phone.hub.state.data.thang.map((x) => x.id)).toEqual(['t1']);
    const p = await phone.drv.action({ type: 'preview' });
    expect(p.choice).toBeTruthy();
    expect((await phone.drv.action({ type: 'dismiss' })).choice).toBe(null);
  });

  it('chưa có mã dự án Google → báo config, không làm gì', async () => {
    const drv = createCloudDriver({
      configured: false,
      auth: null,
      makeStore: () => {
        throw new Error('no');
      },
      loadState: async () => null,
      saveState: async () => {},
      getLocal: async () => ({ data: emptyData(), meta: initMeta(emptyData()) }),
      applyResult: async () => {},
      backupLocal: async () => {},
      deviceName: 'x',
      platform: 't',
      newId: () => 'd'
    });
    expect((await drv.action({ type: 'signIn' })).error).toBe('config');
    expect(drv.info().configured).toBe(false);
  });
});

import { loopbackLogin } from '../electron/cloudPc.ts';
describe('đăng nhập trên PC qua 127.0.0.1', () => {
  it('mở trình duyệt, nhận mã gọi lại, trả trang báo thành công', async () => {
    let page: Promise<string> = Promise.resolve('');
    const login = loopbackLogin((url) => {
      const redirect = new URL(url).searchParams.get('redirect_uri')!;
      expect(redirect).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/$/);
      page = fetch(`${redirect}?code=C1&state=S1`).then((r) => r.text());
    });
    const r = await login((ru) => buildAuthUrl({ clientId: 'c', redirectUri: ru, challenge: 'x', state: 'S1' }));
    expect(parseCallback(r.callbackUrl)).toEqual({ code: 'C1', state: 'S1', error: undefined });
    expect(r.callbackUrl.startsWith(r.redirectUri)).toBe(true);
    expect(await page).toContain('Đã đăng nhập Google');
  });
  it('hết thời gian chờ → cancel', async () => {
    const login = loopbackLogin(() => {}, 50);
    let err: unknown;
    try {
      await login((ru) => ru);
    } catch (e) {
      err = e;
    }
    expect((err as CloudError).code).toBe('cancel');
  });
});

describe('không treo "đang đồng bộ"', () => {
  function mem(): CloudStore {
    const files = new Map<string, { name: string; text: string; mt: string }>();
    let n = 0;
    let t = 0;
    const meta = (id: string): CloudFile => ({ id, name: files.get(id)!.name, modifiedTime: new Date(1_800_000_000_000 + Number(files.get(id)!.mt)).toISOString() });
    return {
      list: async () => [...files.keys()].map(meta),
      read: async (id) => files.get(id)!.text,
      create: async (name, text) => {
        const id = `f${++n}`;
        files.set(id, { name, text, mt: String(++t) });
        return meta(id);
      },
      update: async (id, text) => {
        files.set(id, { ...files.get(id)!, text, mt: String(++t) });
        return meta(id);
      },
      remove: async (id) => void files.delete(id),
      serverTime: () => null
    };
  }
  function drv(store: () => CloudStore, extra: object = {}) {
    let state: unknown = null;
    let syncs = 0;
    const hub = createDataHub({ data: emptyData(), meta: initMeta(emptyData()) });
    const d = createCloudDriver({
      configured: true,
      auth: { init: async () => {}, email: () => 'an@gmail.com', signedIn: () => true, signIn: async () => 'an@gmail.com', signOut: async () => {}, accessToken: async () => 'T' } as never,
      makeStore: () => {
        syncs++;
        return store();
      },
      loadState: async () => state as never,
      saveState: async (s) => {
        state = s;
      },
      getLocal: async () => hub.state,
      applyResult: async () => {},
      backupLocal: async () => {},
      deviceName: 'x',
      platform: 't',
      newId: () => `d${Math.random().toString(16).slice(2)}`,
      ...extra
    });
    return { d, syncs: () => syncs };
  }
  it('đồng bộ xong thì hết trạng thái "đang đồng bộ" và lần tự động sau vẫn chạy', async () => {
    const s = mem();
    const { d, syncs } = drv(() => s);
    await d.action({ type: 'syncNow' });
    expect(d.info().busy).toBe(false);
    await d.action({ type: 'syncNow' });
    expect(d.info().busy).toBe(false);
    const before = syncs();
    d.localChanged(5);
    await new Promise((r) => setTimeout(r, 60));
    expect(syncs()).toBe(before + 1);
    expect(d.info().busy).toBe(false);
  });
  it('Drive treo không trả lời → quá hạn thì nhả, báo lỗi mạng', async () => {
    const hang: CloudStore = { ...mem(), list: () => new Promise(() => {}) };
    const { d } = drv(() => hang, { runTimeoutMs: 50 });
    const r = await d.action({ type: 'syncNow' });
    expect(r.error).toBe('network');
    expect(d.info().busy).toBe(false);
  });
  it('một yêu cầu Drive treo → hạn chờ từng yêu cầu rồi thử lại', async () => {
    let n = 0;
    const store = createDriveStore({
      fetchFn: (async () => {
        n++;
        if (n === 1) return new Promise(() => {});
        return new Response(JSON.stringify({ files: [] }), { status: 200, headers: { 'content-type': 'application/json' } });
      }) as unknown as typeof fetch,
      accessToken: async () => 'T',
      sleep: async () => {},
      timeoutMs: 30
    });
    expect(await store.list()).toEqual([]);
    expect(n).toBe(2);
  });
});

describe('PC + điện thoại qua Drive: nhiều vòng đồng bộ', () => {
  it('hai máy hội tụ cùng dữ liệu, không tải lên lặp vô hạn', async () => {
    const files = new Map<string, { name: string; text: string; mt: number }>();
    let n = 0;
    let t = 0;
    let writes = 0;
    const meta = (id: string): CloudFile => ({ id, name: files.get(id)!.name, modifiedTime: new Date(Date.now() + files.get(id)!.mt).toISOString() });
    const store: CloudStore = {
      list: async () => [...files.keys()].map(meta),
      read: async (id) => files.get(id)!.text,
      create: async (name, text) => {
        writes++;
        const id = `f${++n}`;
        files.set(id, { name, text, mt: ++t });
        return meta(id);
      },
      update: async (id, text) => {
        writes++;
        files.set(id, { ...files.get(id)!, text, mt: ++t });
        return meta(id);
      },
      remove: async (id) => void files.delete(id),
      serverTime: () => null
    };
    const mk = (seed: ReturnType<typeof emptyData>) => {
      const hub = createDataHub({ data: seed, meta: initMeta(seed, 1) });
      let state: unknown = null;
      let applied = 0;
      const d = createCloudDriver({
        configured: true,
        auth: { init: async () => {}, email: () => 'an@gmail.com', signedIn: () => true, signIn: async () => 'an@gmail.com', signOut: async () => {}, accessToken: async () => 'T' } as never,
        makeStore: () => store,
        loadState: async () => state as never,
        saveState: async (s) => {
          state = s;
        },
        getLocal: async () => hub.state,
        applyResult: async (dd, m, mode) => {
          applied++;
          if (mode === 'pull') hub.reset(dd, m);
          else hub.adoptFromHub(dd, m, Date.now());
        },
        backupLocal: async () => {},
        deviceName: 'x',
        platform: 't',
        newId: () => `id${Math.random().toString(16).slice(2)}`
      });
      return { hub, d, applied: () => applied };
    };
    const pc = mk({ ...emptyData(), thang: [mkThang({ id: 't1', ma: 'M001', ten: 'PC' })], counters: { M: 1, W: 0, D: 0 } });
    const phone = mk(emptyData());
    await pc.d.action({ type: 'syncNow' });
    await phone.d.action({ type: 'syncNow' });
    expect(phone.hub.state.data.thang.map((x) => x.ten)).toEqual(['PC']);
    // điện thoại sửa, PC sửa việc khác
    const pd = phone.hub.state.data;
    phone.hub.save({ ...pd, thang: [...pd.thang, mkThang({ id: 't2', ma: 'M002', ten: 'ĐT' })], counters: { M: 2, W: 0, D: 0 } }, phone.hub.state.rev, Date.now());
    const cd = pc.hub.state.data;
    pc.hub.save({ ...cd, thang: cd.thang.map((x) => ({ ...x, ten: 'PC sửa' })) }, pc.hub.state.rev, Date.now() + 1);
    for (let i = 0; i < 3; i++) {
      await phone.d.action({ type: 'syncNow' });
      await pc.d.action({ type: 'syncNow' });
    }
    const names = (h: typeof pc) => h.hub.state.data.thang.map((x) => x.ten).sort();
    expect(names(pc)).toEqual(['PC sửa', 'ĐT']);
    expect(names(phone)).toEqual(['PC sửa', 'ĐT']);
    // đã hội tụ: thêm nhiều vòng không ghi gì lên Drive, không áp gì
    const w = writes;
    const ap = pc.applied() + phone.applied();
    for (let i = 0; i < 5; i++) {
      await phone.d.action({ type: 'syncNow' });
      await pc.d.action({ type: 'syncNow' });
    }
    expect(writes).toBe(w);
    expect(pc.applied() + phone.applied()).toBe(ap);
    expect(pc.d.info().busy || phone.d.info().busy).toBe(false);
  });
});
