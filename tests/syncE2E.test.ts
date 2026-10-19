// Đầu-cuối: trạm PC (HTTP thật trên 127.0.0.1) ↔ điện thoại (DataHub + syncClient)
import { describe, it, expect } from 'vitest';
import { createHubController } from '../electron/hub.ts';
import type { HubFile } from '../electron/hub.ts';
import { createDataHub } from '../src/core/dataHub.ts';
import { emptyData } from '../src/core/model.ts';
import type { Data } from '../src/core/model.ts';
import { emptyMeta } from '../src/core/sync.ts';
import { pairWithHub, syncWithHub, normalizeAddr, SyncHttpError } from '../src/lib/syncClient.ts';
import { mkNgay, mkThang, mkTuan } from './helpers.ts';

const seed = (): Data => ({
  ...emptyData(),
  people: [{ id: 'p1', name: 'An', color: '#fff', photo: null }],
  thang: [mkThang({ id: 't1', ma: 'M001', ten: 'Dự án' })],
  tuan: [mkTuan({ id: 'w1', ma: 'W001', parentMa: 'M001' })],
  ngay: [],
  counters: { M: 1, W: 1, D: 0 }
});

async function setup() {
  let disk: Data = seed();
  let syncFile: HubFile | null = null;
  const external: Data[] = [];
  let flushes = 0;
  let t = 1000;
  const hub = createHubController(disk, {
    loadSync: () => syncFile,
    saveSync: (f) => (syncFile = structuredClone(f)),
    saveData: (d) => (disk = d),
    version: 'test',
    hubName: 'PC-TEST',
    log: { info() {}, warn() {}, error() {} },
    onExternal: (d) => external.push(d),
    requestFlush: async () => {
      flushes++;
    },
    now: () => (t += 10)
  });
  const info = await hub.action({ type: 'enable' });
  return { hub, info, getDisk: () => disk, getSyncFile: () => syncFile, external, flushes: () => flushes, tick: () => (t += 10) };
}

describe('đồng bộ Wi-Fi đầu-cuối', () => {
  it('ghép đôi, đồng bộ hai chiều, gỡ thiết bị', async () => {
    const s = await setup();
    expect(s.info.enabled).toBe(true);
    const addr = `127.0.0.1:${s.info.port}`;
    expect(s.info.pairCode).toMatch(/^\d{6}$/);

    // ping
    const ping = await (await fetch(`http://${addr}/hcn/ping`)).json();
    expect(ping.app).toBe('HCN');

    // sai mã
    let err: unknown;
    try { await pairWithHub(fetch, addr, '000000' === s.info.pairCode ? '111111' : '000000', 'ĐT'); } catch (e) { err = e; }
    expect(err instanceof SyncHttpError && err.code === 'code').toBe(true);

    // đúng mã → token; mã chỉ dùng một lần
    const code = s.info.pairCode!;
    const { token, hubName } = await pairWithHub(fetch, addr, code, 'Điện thoại An');
    expect(hubName).toBe('PC-TEST');
    expect(s.hub.info().pairCode).not.toBe(code);
    expect(s.hub.info().devices.map((d) => d.name)).toEqual(['Điện thoại An']);
    expect(JSON.stringify(s.getSyncFile())).not.toContain(token); // chỉ lưu mã băm

    // điện thoại mới: nhận toàn bộ dữ liệu PC
    const phone = createDataHub({ data: emptyData(), meta: emptyMeta() });
    let r = await syncWithHub(fetch, addr, token, phone.state.data, phone.state.meta);
    let a = phone.adoptFromHub(r.data, r.meta, 2000);
    expect(a.changed).toBe(true);
    expect(phone.state.data.thang[0].ten).toBe('Dự án');

    // PC sửa tên tháng; điện thoại thêm việc ngày và sửa tuần
    await s.hub.save({ ...s.hub.data, thang: [{ ...s.hub.data.thang[0], ten: 'Dự án (PC sửa)' }] }, s.hub.rev);
    const pd = phone.state.data;
    phone.save({ ...pd, ngay: [mkNgay({ id: 'dPH', ma: 'D001', parentId: 'w1', ten: 'Gọi khách' })], tuan: [{ ...pd.tuan[0], ten: 'Tuần (ĐT sửa)' }], counters: { M: 1, W: 1, D: 1 } }, phone.state.rev, 5000);

    r = await syncWithHub(fetch, addr, token, phone.state.data, phone.state.meta);
    a = phone.adoptFromHub(r.data, r.meta, 6000);
    expect(s.getDisk().ngay.map((n) => n.ten)).toEqual(['Gọi khách']); // PC đã ghi xuống đĩa
    expect(s.getDisk().tuan[0].ten).toBe('Tuần (ĐT sửa)');
    expect(phone.state.data.thang[0].ten).toBe('Dự án (PC sửa)');
    expect(s.external.length).toBeGreaterThan(0); // giao diện PC được báo
    expect(s.flushes()).toBeGreaterThan(0); // PC ghi nốt thay đổi trước khi gộp
    expect(a.needsResync).toBe(false);

    // đồng bộ lần nữa không đổi gì
    const extBefore = s.external.length;
    r = await syncWithHub(fetch, addr, token, phone.state.data, phone.state.meta);
    a = phone.adoptFromHub(r.data, r.meta, 7000);
    expect(a.changed).toBe(false);
    expect(s.external.length).toBe(extBefore);

    // PC gỡ thiết bị → token hết hiệu lực
    const devId = s.hub.info().devices[0].id;
    await s.hub.action({ type: 'removeDevice', id: devId });
    err = undefined;
    try { await syncWithHub(fetch, addr, token, phone.state.data, phone.state.meta); } catch (e) { err = e; }
    expect(err instanceof SyncHttpError && err.code === 'unpaired').toBe(true);

    await s.hub.action({ type: 'disable' });
    expect(s.hub.info().enabled).toBe(false);
    err = undefined;
    try { await pairWithHub(fetch, addr, '123456', 'x'); } catch (e) { err = e; }
    expect(err instanceof SyncHttpError && err.code === 'network').toBe(true);
  });

  it('PC lưu trên bản cũ trong lúc điện thoại vừa đồng bộ → không mất việc của điện thoại', async () => {
    const s = await setup();
    const addr = `127.0.0.1:${s.info.port}`;
    const { token } = await pairWithHub(fetch, addr, s.info.pairCode!, 'ĐT');
    const staleRev = s.hub.rev;
    const stale = s.hub.data; // giao diện PC đang giữ bản này
    const phone = createDataHub({ data: emptyData(), meta: emptyMeta() });
    let r = await syncWithHub(fetch, addr, token, phone.state.data, phone.state.meta);
    phone.adoptFromHub(r.data, r.meta, 2000);
    const pd = phone.state.data;
    phone.save({ ...pd, ngay: [mkNgay({ id: 'dX', ma: 'D001', parentId: 'w1' })] }, phone.state.rev, 3000);
    r = await syncWithHub(fetch, addr, token, phone.state.data, phone.state.meta);
    // giao diện PC lưu một sửa đổi dựa trên bản cũ (chưa nhận dữ liệu mới)
    const res = await s.hub.save({ ...stale, thang: [{ ...stale.thang[0], ten: 'PC' }] }, staleRev);
    expect(res.data).toBeDefined(); // giao diện nhận bản đã gộp
    expect(s.getDisk().ngay.map((n) => n.id)).toEqual(['dX']);
    expect(s.getDisk().thang[0].ten).toBe('PC');
    await s.hub.stop();
  });

  it('chuẩn hóa địa chỉ', () => {
    expect(normalizeAddr(' http://192.168.1.5/ ')).toBe('192.168.1.5:47821');
    expect(normalizeAddr('192,168,1,5:5000')).toBe('192.168.1.5:5000');
    expect(normalizeAddr('')).toBe('');
  });
});
