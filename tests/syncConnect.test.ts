// Kết nối điện thoại ↔ PC: nhận đúng PC (hubId), tự tìm lại khi đổi IP, chẩn đoán nguyên nhân, tường lửa Windows
import { describe, it, expect } from 'vitest';
import { createHubController } from '../electron/hub.ts';
import type { HubDeps, HubFile } from '../electron/hub.ts';
import { classifyLink } from '../electron/syncServer.ts';
import { fixScript, parseQuery, queryScript } from '../electron/winNet.ts';
import { emptyData } from '../src/core/model.ts';
import { emptyMeta } from '../src/core/sync.ts';
import {
  classifyLocal,
  diagHints,
  diagnose,
  localPrefixes,
  pairAuto,
  pairWithHub,
  probeHub,
  routeKind,
  syncSmart,
  SyncHttpError,
  usableNets
} from '../src/lib/syncClient.ts';
import type { LocalNet, ProbeResult } from '../src/lib/syncClient.ts';
import { mkThang } from './helpers.ts';

async function mkHub(name: string, extra: Partial<HubDeps> = {}, file: { f: HubFile | null } = { f: null }) {
  const hub = createHubController({ ...emptyData(), thang: [mkThang({ id: `t-${name}`, ma: 'M001', ten: name })] }, {
    loadSync: () => file.f,
    saveSync: (f) => (file.f = structuredClone(f)),
    saveData: () => {},
    version: 'test',
    hubName: name,
    log: { info() {}, warn() {}, error() {} },
    onExternal: () => {},
    requestFlush: async () => {},
    ...extra
  });
  const info = await hub.action({ type: 'enable' });
  return { hub, info, addr: `127.0.0.1:${info.port}`, file };
}
const errCode = async (p: Promise<unknown>) => {
  try {
    await p;
    return 'none';
  } catch (e) {
    return e instanceof SyncHttpError ? `${e.code}${e.message === 'other-hub' ? ':other' : ''}` : 'other';
  }
};
const args = (primary: string, token: string, extra: object = {}) => ({ primary, hosts: [], token, data: emptyData(), meta: emptyMeta(), ...extra });

describe('nhận đúng PC đã ghép đôi', () => {
  it('ping trả mã nhận dạng cố định, giữ nguyên sau khi mở lại app', async () => {
    const file = { f: null as HubFile | null };
    const a = await mkHub('PC-A', {}, file);
    const p1 = await probeHub(fetch, a.addr);
    expect(p1.ok).toBe(true);
    expect(p1.id).toMatch(/^[0-9a-f]{16}$/);
    await a.hub.stop();
    const again = await mkHub('PC-A', {}, file);
    expect((await probeHub(fetch, again.addr)).id).toBe(p1.id);
    await again.hub.stop();
  });

  it('IP cũ giờ là PC khác: không coi là bị gỡ ghép đôi, tự chuyển sang địa chỉ khác của đúng PC', async () => {
    const a = await mkHub('PC-A');
    const b = await mkHub('PC-B');
    try {
      const pr = await pairWithHub(fetch, a.addr, a.info.pairCode!, 'ĐT');
      expect(pr.hubId).toMatch(/^[0-9a-f]{16}$/);
      // chỉ còn địa chỉ (nay thuộc PC-B) → lỗi mạng, KHÔNG phải "đã gỡ" (không xóa ghép đôi)
      expect(await errCode(syncSmart(fetch, args(b.addr, pr.token, { hubId: pr.hubId })))).toBe('network:other');
      // có thêm đường khác của PC-A → đồng bộ được
      const r = await syncSmart(fetch, args(b.addr, pr.token, { hubId: pr.hubId, hosts: [b.addr, a.addr] }));
      expect(r.addr).toBe(a.addr);
      expect(r.hubId).toBe(pr.hubId);
      expect(r.result.hubName).toBe('PC-A');
    } finally {
      await a.hub.stop();
      await b.hub.stop();
    }
  });

  it('đúng PC báo chưa ghép đôi (đã gỡ điện thoại) → unpaired', async () => {
    const a = await mkHub('PC-A');
    try {
      const pr = await pairWithHub(fetch, a.addr, a.info.pairCode!, 'ĐT');
      const id = a.hub.info().devices[0].id;
      await a.hub.action({ type: 'removeDevice', id });
      expect(await errCode(syncSmart(fetch, args(a.addr, pr.token, { hubId: pr.hubId })))).toBe('unpaired');
    } finally {
      await a.hub.stop();
    }
  });
});

describe('PC đổi IP: tự quét lại dải mạng', () => {
  it('mọi địa chỉ cũ hỏng → quét thấy đúng PC và đồng bộ', async () => {
    const a = await mkHub('PC-A');
    try {
      const pr = await pairWithHub(fetch, a.addr, a.info.pairCode!, 'ĐT');
      const dead = '127.0.0.1:1';
      expect(await errCode(syncSmart(fetch, args(dead, pr.token, { hubId: pr.hubId })))).toBe('network'); // không quét
      const r = await syncSmart(fetch, args(dead, pr.token, { hubId: pr.hubId, scan: { localPrefixes: [], tether: false, port: a.info.port! } }));
      expect(r.result.hubName).toBe('PC-A');
      expect(r.addr.endsWith(`:${a.info.port}`)).toBe(true);
    } finally {
      await a.hub.stop();
    }
  });

  it('ghép đôi không cần nhập địa chỉ: tự tìm PC rồi thử mã', async () => {
    const a = await mkHub('PC-A');
    try {
      const r = await pairAuto(fetch, { code: a.info.pairCode!, name: 'ĐT', localPrefixes: ['127.0.0'], prefixes: [], port: a.info.port! });
      expect(r.hubName).toBe('PC-A');
      expect(r.token).toMatch(/^[0-9a-f]+$/);
      // địa chỉ gõ sai (không tới được) → vẫn tự tìm
      const code2 = a.hub.info().pairCode!;
      const r2 = await pairAuto(fetch, { addr: '127.0.0.1:1', code: code2, name: 'ĐT2', localPrefixes: ['127.0.0'], prefixes: [], port: a.info.port! });
      expect(r2.hubName).toBe('PC-A');
      // không có PC nào trong dải → notFound
      expect(await errCode(pairAuto(fetch, { code: '123456', name: 'x', localPrefixes: ['198.51.100'], prefixes: [] }))).toBe('notFound');
    } finally {
      await a.hub.stop();
    }
  });
});

describe('mạng của điện thoại', () => {
  const nets: LocalNet[] = [
    { name: 'rmnet_data0', address: '10.12.0.5' },
    { name: 'wlan0', address: '192.168.1.20', prefix: 24 },
    { name: 'rndis0', address: '192.168.231.94', prefix: 24 },
    { name: 'bt-pan', address: '192.168.44.1' },
    { name: 'tun0', address: '10.8.0.2' },
    { name: 'ap0', address: '10.96.17.1' },
    { name: 'wlan0', address: '169.254.3.3' }
  ];
  it('phân loại card mạng Android, bỏ 4G / VPN / địa chỉ tự cấp', () => {
    expect(classifyLocal('wlan0')).toBe('wifi');
    expect(classifyLocal('rndis0')).toBe('usb');
    expect(classifyLocal('ncm0')).toBe('usb');
    expect(classifyLocal('bt-pan')).toBe('bluetooth');
    expect(classifyLocal('swlan0')).toBe('hotspot');
    expect(classifyLocal('rmnet_data1')).toBe('cellular');
    expect(usableNets(nets).map((n) => n.kind)).toEqual(['wifi', 'usb', 'bluetooth', 'hotspot']);
    expect(localPrefixes(nets)).toEqual(['192.168.1', '192.168.231', '192.168.44', '10.96.17']);
  });
  it('biết đang đi qua đường nào', () => {
    expect(routeKind('192.168.231.20:47821', nets)).toBe('usb');
    expect(routeKind('192.168.1.5:47821', nets)).toBe('wifi');
    expect(routeKind('192.168.9.5:47821', nets)).toBe(null);
    expect(routeKind('192.168.1.5:47821', null)).toBe(null);
  });
});

describe('kiểm tra kết nối: kết luận nguyên nhân', () => {
  const wifi: LocalNet[] = [{ name: 'wlan0', address: '192.168.1.20' }];
  const pr = (addr: string, reason: ProbeResult['reason'], id?: string): ProbeResult => ({ addr, ok: reason === 'ok', reason, ms: 10, id });
  it('các trường hợp', () => {
    expect(diagHints(wifi, [pr('192.168.1.5:47821', 'ok', 'A')], [], 'A')).toEqual(['ok']);
    expect(diagHints(wifi, [pr('192.168.1.5:47821', 'timeout')], [], 'A')).toEqual(['firewall']);
    expect(diagHints(wifi, [pr('192.168.1.5:47821', 'network')], [], 'A')).toEqual(['hubOff']);
    expect(diagHints(wifi, [pr('192.168.8.5:47821', 'timeout')], [], 'A')).toEqual(['diffNet']);
    expect(diagHints(wifi, [pr('192.168.8.5:47821', 'timeout')], [{ addr: '192.168.1.9:47821', name: 'PC', id: 'A' }], 'A')).toEqual(['addrChanged']);
    expect(diagHints(wifi, [pr('192.168.1.5:47821', 'ok', 'B')], [], 'A')).toEqual(['otherHub']);
    expect(diagHints([{ name: 'rmnet0', address: '10.0.0.2' }], [pr('192.168.1.5:47821', 'timeout')], [], 'A')).toEqual(['noLocalNet']);
    expect(diagHints(wifi, [], [], null)).toEqual(['notFound']);
  });
  it('đo thật: địa chỉ cũ hỏng, quét ra PC ở địa chỉ mới', async () => {
    const a = await mkHub('PC-A');
    try {
      const id = (await probeHub(fetch, a.addr)).id!;
      const rep = await diagnose(fetch, { nets: null, hosts: ['127.0.0.1:1'], hubId: id, port: a.info.port! });
      expect(rep.probes[0].reason).toBe('network');
      expect(rep.found[0].id).toBe(id);
      expect(rep.hints).toEqual(['addrChanged']);
    } finally {
      await a.hub.stop();
    }
  });
});

describe('PC: loại mạng và tường lửa Windows', () => {
  it('phân loại card theo mô tả phần cứng', () => {
    expect(classifyLink('Ethernet 3', '192.168.97.20', 'Remote NDIS based Internet Sharing Device')).toBe('usb');
    expect(classifyLink('Kết nối mạng Bluetooth', '10.1.1.2', 'Bluetooth Device (Personal Area Network)')).toBe('bluetooth');
    expect(classifyLink('Local Area Connection* 2', '192.168.137.1', 'Microsoft Wi-Fi Direct Virtual Adapter #2')).toBe('hotspot');
    expect(classifyLink('Wi-Fi', '192.168.1.5', 'Intel(R) Wi-Fi 6 AX201')).toBe('wifi');
    expect(classifyLink('Ethernet', '192.168.1.6', 'Realtek PCIe GbE')).toBe('lan');
  });
  it('đọc kết quả PowerShell', () => {
    const base = { ad: [{ n: 'Wi-Fi', d: 'Intel' }, { n: 'Ethernet 3', d: 'Remote NDIS' }], pr: [{ n: 'Wi-Fi', c: 'Private' }, { n: 'Ethernet 3', c: 'Public' }], rule: 0, block: 0, allow: [], on: 3 };
    const s = parseQuery(JSON.stringify(base));
    expect(s.firewall).toBe('missing');
    expect(s.adapters['Ethernet 3']).toEqual({ desc: 'Remote NDIS', profile: 'public' });
    expect(s.adapters['Wi-Fi'].profile).toBe('private');
    expect(parseQuery(JSON.stringify({ ...base, allow: 'Private' })).firewall).toBe('missing');
    expect(parseQuery(JSON.stringify({ ...base, allow: ['Private, Public'] })).firewall).toBe('ok');
    expect(parseQuery(JSON.stringify({ ...base, rule: 1 })).firewall).toBe('ok');
    expect(parseQuery(JSON.stringify({ ...base, rule: 1, block: 2 })).firewall).toBe('blocked');
    expect(parseQuery(JSON.stringify({ ...base, on: 0, block: 2 })).firewall).toBe('ok');
    expect(parseQuery(JSON.stringify({ ad: { n: 'Wi-Fi', d: 'x' }, pr: { n: 'Wi-Fi', c: 'DomainAuthenticated' } })).adapters['Wi-Fi'].profile).toBe('domain');
  });
  it('lệnh PowerShell thoát đúng dấu nháy trong đường dẫn', () => {
    const exe = "C:\\Users\\O'Neil\\AppData\\Local\\Programs\\HCN Work Manage\\HCN Work Manage.exe";
    expect(queryScript(exe)).toContain("Get-NetFirewallRule -DisplayName 'HCN Work Manage*'");
    expect(queryScript(exe)).not.toContain('Get-NetFirewallApplicationFilter'); // không duyệt toàn bộ quy tắc (chậm)
    const fix = fixScript(exe, [47821, 47830]);
    expect(fix).toContain("-LocalPort '47821-47830'");
    expect(fix).toContain('-Profile Any');
    expect(fix).toContain("O''Neil");
  });
  it('trạm gắn loại mạng / tường lửa vào thông tin, nút mở tường lửa', async () => {
    const os = await import('node:os');
    const ifname = Object.entries(os.networkInterfaces()).find(([, l]) => l?.some((x) => x.family === 'IPv4' && !x.internal))?.[0];
    let asked: [number, number] | null = null;
    let fixOk = false;
    const a = await mkHub('PC-A', {
      netInfo: () => ({ adapters: ifname ? { [ifname]: { desc: 'Remote NDIS based Internet Sharing Device', profile: 'public' } } : {}, firewall: 'missing' }),
      fixFirewall: async (p) => {
        asked = p;
        return fixOk;
      },
      keepsRunning: () => true
    });
    try {
      const info = a.hub.info();
      expect(info.firewall).toBe('missing');
      expect(info.keepsRunning).toBe(true);
      if (ifname) {
        const l = info.links.find((x) => x.name === ifname)!;
        expect(l.kind).toBe('usb');
        expect(l.profile).toBe('public');
      }
      expect((await a.hub.action({ type: 'fixFirewall' })).error).toBe('firewall');
      expect(asked).toEqual([47821, 47830]);
      fixOk = true;
      expect((await a.hub.action({ type: 'fixFirewall' })).error).toBeUndefined();
    } finally {
      await a.hub.stop();
    }
  });
});
