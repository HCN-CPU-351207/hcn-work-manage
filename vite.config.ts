import { defineConfig } from 'vite';
import type { Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };

// CSP chặt khi build; nới cho Vite HMR khi chạy dev.
// Bản Android cần gọi tới PC trong mạng Wi-Fi (http://192.168.x.x) để đồng bộ.
const csp = (dev: boolean, android: boolean) =>
  [
    "default-src 'self'",
    `script-src 'self'${dev ? " 'unsafe-inline'" : ''}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    `connect-src 'self'${dev ? ' ws://localhost:5173 http://localhost:5173' : ''}${android ? ' http: https:' : ''}`,
    "object-src 'none'",
    "base-uri 'none'"
  ].join('; ');

const cspPlugin = (android: boolean): Plugin => ({
  name: 'hcn-csp',
  transformIndexHtml(html, ctx) {
    return html.replace('<!--CSP-->', `<meta http-equiv="Content-Security-Policy" content="${csp(!!ctx.server, android)}" />`);
  }
});

export default defineConfig(({ mode }) => ({
  base: './',
  plugins: [react(), tailwindcss(), cspPlugin(mode === 'android')],
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  // Android: WebView hệ thống có thể cũ hơn Chromium của Electron
  build: { outDir: 'dist', emptyOutDir: true, target: mode === 'android' ? 'chrome100' : 'chrome130', chunkSizeWarningLimit: 1500 },
  server: { port: 5173, strictPort: true }
}));
