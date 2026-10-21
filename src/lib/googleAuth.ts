// Đăng nhập Google (OAuth 2.0 cho app cài trên máy, có PKCE). Dùng chung cho PC (Electron) và Android.
// Chỉ xin: email (để kiểm tra cùng tài khoản) + thư mục ẩn của app trên Drive (drive.appdata).
// Mã gia hạn (refresh token) dùng lâu dài khi dự án Google đã "Publish" (Production); app tự gia hạn mỗi lần đồng bộ.
import { CloudError, withTimeout } from '../core/cloudSync.ts';

export const SCOPES = 'openid email https://www.googleapis.com/auth/drive.appdata';
export const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
export const TOKEN_URL = 'https://oauth2.googleapis.com/token';
export const REVOKE_URL = 'https://oauth2.googleapis.com/revoke';

export interface StoredGoogle {
  refresh: string;
  email: string;
}
/** Gửi form tới máy chủ Google (mỗi nền tảng tự cài đặt) */
export type PostForm = (url: string, fields: Record<string, string>) => Promise<{ status: number; json: Record<string, unknown> | null }>;

export function b64url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export function randomString(n = 32): string {
  const a = new Uint8Array(n);
  globalThis.crypto.getRandomValues(a);
  return b64url(a);
}
export async function makePkce(): Promise<{ verifier: string; challenge: string }> {
  const verifier = randomString(48);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return { verifier, challenge: b64url(new Uint8Array(digest)) };
}

export function buildAuthUrl(p: { clientId: string; redirectUri: string; challenge: string; state: string; loginHint?: string | null }): string {
  const q = new URLSearchParams({
    client_id: p.clientId,
    redirect_uri: p.redirectUri,
    response_type: 'code',
    scope: SCOPES,
    code_challenge: p.challenge,
    code_challenge_method: 'S256',
    state: p.state,
    // offline + consent: luôn nhận mã gia hạn dùng lâu dài
    access_type: 'offline',
    prompt: 'consent select_account',
    include_granted_scopes: 'true'
  });
  if (p.loginHint) q.set('login_hint', p.loginHint);
  return `${AUTH_URL}?${q.toString()}`;
}

export function emailFromIdToken(idToken: string | undefined | null): string | null {
  if (!idToken) return null;
  try {
    const part = idToken.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const json = decodeURIComponent(
      Array.from(atob(part + '='.repeat((4 - (part.length % 4)) % 4)))
        .map((c) => `%${c.charCodeAt(0).toString(16).padStart(2, '0')}`)
        .join('')
    );
    const p = JSON.parse(json) as { email?: string; email_verified?: boolean };
    return p.email ?? null;
  } catch {
    return null;
  }
}

/** Đọc kết quả gọi lại: ?code=…&state=… hoặc ?error=access_denied */
export function parseCallback(url: string): { code?: string; state?: string; error?: string } {
  const q = url.includes('?') ? url.slice(url.indexOf('?') + 1).split('#')[0] : '';
  const p = new URLSearchParams(q);
  return { code: p.get('code') ?? undefined, state: p.get('state') ?? undefined, error: p.get('error') ?? undefined };
}

function tokenError(status: number, json: Record<string, unknown> | null): CloudError {
  const err = String(json?.error ?? '');
  if (err === 'invalid_grant') return new CloudError('relogin', 'invalid_grant');
  if (err === 'invalid_client' || err === 'unauthorized_client' || err === 'redirect_uri_mismatch') return new CloudError('config', err);
  if (status === 429 || status >= 500) return new CloudError('server', `token ${status}`);
  return new CloudError('server', err || `token ${status}`);
}

export interface GoogleAuthDeps {
  clientId: string;
  clientSecret?: string;
  postForm: PostForm;
  load(): Promise<StoredGoogle | null>;
  save(s: StoredGoogle | null): Promise<void>;
  /** mở trình duyệt cho người dùng đăng nhập, chờ Google gọi lại; trả url gọi lại đầy đủ */
  interactive(buildUrl: (redirectUri: string) => string): Promise<{ callbackUrl: string; redirectUri: string }>;
  now?: () => number;
}

export function createGoogleAuth(d: GoogleAuthDeps) {
  const now = d.now ?? (() => Date.now());
  let stored: StoredGoogle | null = null;
  let loaded = false;
  let access: { token: string; exp: number } | null = null;
  let refreshing: Promise<string> | null = null;
  const ensure = async () => {
    if (!loaded) {
      stored = await d.load().catch(() => null);
      loaded = true;
    }
    return stored;
  };
  const withSecret = (f: Record<string, string>) => (d.clientSecret ? { ...f, client_secret: d.clientSecret } : f);

  async function post(fields: Record<string, string>) {
    try {
      return await withTimeout(d.postForm(TOKEN_URL, withSecret(fields)), 30_000, 'token-timeout');
    } catch (e) {
      throw new CloudError('network', (e as Error).message);
    }
  }

  return {
    async init(): Promise<void> {
      await ensure();
    },
    email(): string | null {
      return stored?.email ?? null;
    },
    signedIn(): boolean {
      return !!stored?.refresh;
    },
    async signIn(): Promise<string> {
      await ensure();
      const { verifier, challenge } = await makePkce();
      const state = randomString(16);
      const r = await d.interactive((redirectUri) => buildAuthUrl({ clientId: d.clientId, redirectUri, challenge, state, loginHint: stored?.email }));
      const cb = parseCallback(r.callbackUrl);
      if (cb.error) throw new CloudError('cancel', cb.error);
      if (!cb.code || cb.state !== state) throw new CloudError('cancel', 'bad-state');
      const res = await post({ grant_type: 'authorization_code', code: cb.code, code_verifier: verifier, client_id: d.clientId, redirect_uri: r.redirectUri });
      if (res.status !== 200 || !res.json) throw tokenError(res.status, res.json);
      const refresh = String(res.json.refresh_token ?? '');
      const email = emailFromIdToken(res.json.id_token as string | undefined);
      if (!refresh || !email) throw new CloudError('server', 'no-refresh-token');
      // Google cho bỏ tích từng quyền: thiếu quyền thư mục ứng dụng trên Drive thì không đồng bộ được
      const granted = String(res.json.scope ?? '');
      if (granted && !granted.includes('drive.appdata')) throw new CloudError('scope', granted);
      stored = { refresh, email };
      access = { token: String(res.json.access_token), exp: now() + (Number(res.json.expires_in) || 3600) * 1000 - 60_000 };
      await d.save(stored);
      return email;
    },
    /** mã truy cập (1 giờ); hết hạn thì tự gia hạn bằng mã gia hạn */
    async accessToken(force = false): Promise<string> {
      await ensure();
      if (!stored) throw new CloudError('relogin', 'signed-out');
      if (!force && access && access.exp > now()) return access.token;
      if (refreshing) return refreshing;
      const rt = stored.refresh;
      refreshing = (async () => {
        const res = await post({ grant_type: 'refresh_token', refresh_token: rt, client_id: d.clientId });
        if (res.status !== 200 || !res.json?.access_token) {
          const e = tokenError(res.status, res.json);
          // chỉ bỏ đăng nhập khi Google báo rõ mã đã bị thu hồi / hết hạn
          if (e.code === 'relogin') {
            stored = null;
            access = null;
            await d.save(null);
          }
          throw e;
        }
        access = { token: String(res.json.access_token), exp: now() + (Number(res.json.expires_in) || 3600) * 1000 - 60_000 };
        return access.token;
      })().finally(() => {
        refreshing = null;
      });
      return refreshing;
    },
    async signOut(): Promise<void> {
      await ensure();
      const rt = stored?.refresh;
      stored = null;
      access = null;
      await d.save(null);
      if (rt) await d.postForm(REVOKE_URL, { token: rt }).catch(() => undefined);
    }
  };
}
export type GoogleAuth = ReturnType<typeof createGoogleAuth>;
