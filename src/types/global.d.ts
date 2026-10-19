import type { HcnApi } from '../core/api.ts';

declare global {
  interface Window {
    hcn?: HcnApi;
  }
  /** phiên bản app, Vite chèn lúc build */
  const __APP_VERSION__: string;
}
export {};
