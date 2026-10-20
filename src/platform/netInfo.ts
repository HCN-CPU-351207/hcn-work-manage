// Android: đọc địa chỉ mạng thật của điện thoại (Wi-Fi, chia sẻ qua USB / Bluetooth, điểm phát)
// qua plugin gốc HcnNet (scripts/android-prepare.mjs tạo), và lớp gọi mạng có hạn chờ kết nối cho việc dò PC.
import { Capacitor, CapacitorHttp, registerPlugin } from '@capacitor/core';
import type { LocalNet, TimedInit } from '../lib/syncClient.ts';

interface HcnNetPlugin {
  localAddresses(): Promise<{ list: LocalNet[] }>;
}
const HcnNet = registerPlugin<HcnNetPlugin>('HcnNet');

/** null: không đọc được (chạy trên web hoặc bản app cũ chưa có plugin) */
export async function localNets(): Promise<LocalNet[] | null> {
  if (!Capacitor.isNativePlatform()) return null;
  try {
    const r = await HcnNet.localAddresses();
    return Array.isArray(r?.list) ? r.list : [];
  } catch {
    return null;
  }
}

/**
 * fetch cho đồng bộ. Lệnh dò PC (GET có hạn chờ) đi thẳng lớp mạng gốc với connectTimeout,
 * để hàng trăm lần dò địa chỉ không có máy không treo luồng mạng tới vài phút.
 * Ghép đôi / gửi dữ liệu dùng fetch thường (đã đi qua CapacitorHttp).
 */
export const syncFetch: typeof fetch = async (input, init) => {
  const i = (init ?? {}) as TimedInit;
  if (Capacitor.getPlatform() === 'android' && (i.method ?? 'GET').toUpperCase() === 'GET' && i.hcnTimeout) {
    const r = await CapacitorHttp.request({ url: String(input), method: 'GET', connectTimeout: i.hcnTimeout, readTimeout: i.hcnTimeout });
    const status = r.status >= 200 && r.status <= 599 ? r.status : 502;
    const body = status === 204 || status === 304 ? null : typeof r.data === 'string' ? r.data : JSON.stringify(r.data ?? null);
    return new Response(body, { status, headers: { 'Content-Type': 'application/json' } });
  }
  return fetch(input, init);
};
