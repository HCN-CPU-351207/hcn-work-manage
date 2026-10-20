// Android: đăng nhập Google bằng trình duyệt của máy, Google gọi lại app qua com.hcn.workmanage:/oauth2redirect
// (scripts/android-prepare.mjs đăng ký đường này); gửi form tới Google bằng lớp mạng gốc.
import { App } from '@capacitor/app';
import { CapacitorHttp } from '@capacitor/core';
import type { PluginListenerHandle } from '@capacitor/core';
import { ANDROID_REDIRECT } from '../config/google.ts';
import { CloudError } from '../core/cloudSync.ts';
import type { PostForm } from '../lib/googleAuth.ts';
import { HcnNet } from './netInfo.ts';

export function androidLogin(timeoutMs = 10 * 60_000) {
  return (buildUrl: (redirectUri: string) => string): Promise<{ callbackUrl: string; redirectUri: string }> =>
    new Promise((resolve, reject) => {
      let handle: PluginListenerHandle | null = null;
      let done = false;
      const finish = (fn: () => void) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        void handle?.remove();
        fn();
      };
      const timer = setTimeout(() => finish(() => reject(new CloudError('cancel', 'timeout'))), timeoutMs);
      void App.addListener('appUrlOpen', ({ url }) => {
        if (url.startsWith(ANDROID_REDIRECT.split(':')[0] + ':')) finish(() => resolve({ callbackUrl: url, redirectUri: ANDROID_REDIRECT }));
      }).then((h) => {
        handle = h;
        if (done) void h.remove();
      });
      HcnNet.openExternal({ url: buildUrl(ANDROID_REDIRECT) }).catch((e: Error) => finish(() => reject(new CloudError('network', e.message))));
    });
}

export const postFormAndroid: PostForm = async (url, fields) => {
  try {
    const r = await CapacitorHttp.request({ url, method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, data: fields });
    let json: Record<string, unknown> | null = null;
    if (r.data && typeof r.data === 'object') json = r.data as Record<string, unknown>;
    else if (typeof r.data === 'string') {
      try {
        json = JSON.parse(r.data) as Record<string, unknown>;
      } catch {
        json = null;
      }
    }
    return { status: r.status, json };
  } catch (e) {
    throw new CloudError('network', (e as Error).message);
  }
};
