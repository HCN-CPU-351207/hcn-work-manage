// Hỏi cách đồng bộ: không tự xóa hàng loạt, PC → điện thoại, điện thoại → PC, tự động theo giờ sửa
import { describe, it, expect } from 'vitest';
import { createHubController } from '../electron/hub.ts';
import type { HubFile } from '../electron/hub.ts';
import { createDataHub } from '../src/core/dataHub.ts';
import { emptyData } from '../src/core/model.ts';
import type { Data } from '../src/core/model.ts';
import { emptyMeta, isRisky, lossOf, needsChoice, suggestMode, syncStats } from '../src/core/sync.ts';
import { pairWithHub, syncWithHub, SyncHttpError } from '../src/lib/syncClient.ts';
import { mkNgay, mkThang, mkTuan } from './helpers.ts';

const pcSeed = (): Data => ({
  ...emptyData(),
  thang: [mkThang({ id: 't1', ma: 'M001' }), mkThang({ id: 't2', ma: 'M002' })],
  tuan: [mkTuan({ id: 'w1', ma: 'W001', parentMa: 'M001' }), mkTuan({ id: 'w2', ma: 'W002', parentMa: 'M002' })],
  ngay: [mkNgay({ id: 'd1', ma: 'D001', parentId: 'w1' }), mkNgay({ id: 'd2', ma: 'D002', parentId: 'w2' })],
  counters: { M: 2, W: 2, D: 2 }
});

async function setup() {
  let disk = pcSeed();
  let file: HubFile | null = null;
  const backups: { n: number; reason: string }[] = [];
  let t = 1_000_000;
  const hub = createHubController(disk, {
    loadSync: () => file,
    saveSync: (f) => (file = structuredClone(f)),
    saveData: (d) => (disk = d),
    version: 'test',
    hubName: 'PC',
    log: { info() {}, warn() {}, error() {} },
    onExternal: () => {},
    requestFlush: async () => {},
    backup: (d, reason) => backups.push({ n: d.thang.length + d.tuan.length + d.ngay.length, reason }),
    now: () => (t += 1000)
  });
  const info = await hub.action({ type: 'enable' });
  const addr = `127.0.0.1:${info.port}`;
  const { token } = await pairWithHub(fetch, addr, info.pairCode!, 'ĐT');
  return { hub, addr, token, backups, disk: () => disk, tick: () => (t += 1000) };
}

/** Điện thoại đã từng đồng bộ đủ dữ liệu, rồi xóa hết (để lại dấu "đã xóa") */
async function phoneThatDeletedAll(s: Awaited<ReturnType<typeof setup>>) {
  const phone = createDataHub({ data: emptyData(), meta: emptyMeta() });
  const r = await syncWithHub(fetch, s.addr, s.token, phone.state.data, phone.state.meta, { guard: 'first' });
  phone.adoptFromHub(r.data, r.meta, s.tick());
  expect(phone.state.data.thang).toHaveLength(2);
  phone.save(emptyData(), phone.state.rev, s.tick() + 100);
  expect(phone.state.data.thang).toHaveLength(0);
  return phone;
}

describe('không tự xóa hàng loạt trên PC', () => {
  it('điện thoại trống còn dấu "đã xóa" → PC không bị xóa, trả về yêu cầu chọn', async () => {
    const s = await setup();
    try {
      const phone = await phoneThatDeletedAll(s);
      const r = await syncWithHub(fetch, s.addr, s.token, phone.state.data, phone.state.meta, { guard: 'normal' });
      expect(r.needsChoice?.pc.del).toBe(6);
      expect(r.needsChoice?.pc.total).toBe(6);
      expect(s.disk().thang).toHaveLength(2); // PC còn nguyên
      expect(s.backups).toEqual([]);
    } finally {
      await s.hub.stop();
    }
  });

  it('app điện thoại đời cũ (không gửi guard) → PC từ chối 409, dữ liệu còn nguyên', async () => {
    const s = await setup();
    try {
      const phone = await phoneThatDeletedAll(s);
      const res = await fetch(`http://${s.addr}/hcn/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${s.token}` },
        body: JSON.stringify({ schemaVersion: 1, data: phone.state.data, meta: phone.state.meta })
      });
      expect(res.status).toBe(409);
      expect(s.disk().ngay).toHaveLength(2);
    } finally {
      await s.hub.stop();
    }
  });

  it('chọn PC → điện thoại: điện thoại nhận lại đủ, lần sau đồng bộ thường không hỏi nữa', async () => {
    const s = await setup();
    try {
      const phone = await phoneThatDeletedAll(s);
      const r = await syncWithHub(fetch, s.addr, s.token, phone.state.data, phone.state.meta, { mode: 'pull', guard: 'off' });
      phone.reset(r.data, r.meta);
      expect(phone.state.data.thang).toHaveLength(2);
      expect(s.disk().thang).toHaveLength(2);
      const again = await syncWithHub(fetch, s.addr, s.token, phone.state.data, phone.state.meta, { guard: 'normal' });
      expect(again.needsChoice).toBeUndefined();
      expect(again.data.ngay).toHaveLength(2);
    } finally {
      await s.hub.stop();
    }
  });

  it('chọn điện thoại → PC: PC thay bằng dữ liệu điện thoại, có sao lưu trước', async () => {
    const s = await setup();
    try {
      const phone = createDataHub({ data: emptyData(), meta: emptyMeta() });
      phone.save({ ...emptyData(), thang: [mkThang({ id: 'p1', ma: 'M001', ten: 'Từ điện thoại' })], counters: { M: 1, W: 0, D: 0 } }, phone.state.rev, s.tick());
      const r = await syncWithHub(fetch, s.addr, s.token, phone.state.data, phone.state.meta, { mode: 'push', guard: 'off' });
      expect(s.disk().thang.map((x) => x.id)).toEqual(['p1']);
      expect(s.disk().tuan).toHaveLength(0);
      expect(s.backups).toEqual([{ n: 6, reason: 'push' }]);
      phone.adoptFromHub(r.data, r.meta, s.tick());
      expect(phone.state.data.thang.map((x) => x.id)).toEqual(['p1']);
    } finally {
      await s.hub.stop();
    }
  });

  it('chọn tự động theo giờ sửa: xóa theo điện thoại nhưng PC sao lưu trước', async () => {
    const s = await setup();
    try {
      const phone = await phoneThatDeletedAll(s);
      await syncWithHub(fetch, s.addr, s.token, phone.state.data, phone.state.meta, { mode: 'merge', guard: 'off' });
      expect(s.disk().thang).toHaveLength(0);
      expect(s.backups).toEqual([{ n: 6, reason: 'sync' }]);
    } finally {
      await s.hub.stop();
    }
  });

  it('PC khôi phục từ bản sao lưu → bản khôi phục mới hơn dấu xóa cũ: điện thoại nhận lại, không hỏi', async () => {
    const s = await setup();
    try {
      const phone = await phoneThatDeletedAll(s);
      await syncWithHub(fetch, s.addr, s.token, phone.state.data, phone.state.meta, { mode: 'merge', guard: 'off' }); // bị xóa như sự cố
      await s.hub.replace(pcSeed()); // Cài đặt > Dữ liệu > Khôi phục
      const r = await syncWithHub(fetch, s.addr, s.token, phone.state.data, phone.state.meta, { guard: 'normal' });
      expect(r.needsChoice).toBeUndefined();
      expect(s.disk().thang).toHaveLength(2);
      phone.adoptFromHub(r.data, r.meta, s.tick());
      expect(phone.state.data.ngay).toHaveLength(2);
    } finally {
      await s.hub.stop();
    }
  });
});

describe('lần đồng bộ đầu sau ghép đôi', () => {
  it('điện thoại trống → không hỏi, nhận dữ liệu PC', async () => {
    const s = await setup();
    try {
      const r = await syncWithHub(fetch, s.addr, s.token, emptyData(), emptyMeta(), { guard: 'first' });
      expect(r.needsChoice).toBeUndefined();
      expect(r.data.thang).toHaveLength(2);
    } finally {
      await s.hub.stop();
    }
  });
  it('hai bên đều có việc khác nhau → hỏi', async () => {
    const s = await setup();
    try {
      const phone = createDataHub({ data: emptyData(), meta: emptyMeta() });
      phone.save({ ...emptyData(), thang: [mkThang({ id: 'p1', ma: 'M001' })], counters: { M: 1, W: 0, D: 0 } }, phone.state.rev, s.tick());
      const r = await syncWithHub(fetch, s.addr, s.token, phone.state.data, phone.state.meta, { guard: 'first' });
      expect(r.needsChoice).toEqual({ pc: { total: 6, add: 1, upd: 0, del: 0 }, phone: { total: 1, add: 6, upd: 1, del: 0 }, pcOnly: 6, phoneOnly: 1, differ: 0 });
      expect(s.disk().thang).toHaveLength(2);
    } finally {
      await s.hub.stop();
    }
  });
  it('xem trước (preview) luôn trả số liệu và không ghi', async () => {
    const s = await setup();
    try {
      const r = await syncWithHub(fetch, s.addr, s.token, emptyData(), emptyMeta(), { guard: 'preview' });
      expect(r.needsChoice?.phone.add).toBe(6);
      let err: unknown;
      try {
        await syncWithHub(fetch, s.addr, 'sai', emptyData(), emptyMeta());
      } catch (e) {
        err = e;
      }
      expect(err instanceof SyncHttpError && err.code === 'unpaired').toBe(true);
    } finally {
      await s.hub.stop();
    }
  });
});

describe('ngưỡng và gợi ý', () => {
  const side = (total: number, del: number) => ({ total, add: 0, upd: 0, del });
  it('rủi ro: từ 3 việc và từ 20%', () => {
    expect(isRisky(side(100, 2))).toBe(false);
    expect(isRisky(side(100, 10))).toBe(false);
    expect(isRisky(side(100, 20))).toBe(true);
    expect(isRisky(side(10, 3))).toBe(true);
    expect(isRisky(side(0, 0))).toBe(false);
  });
  it('xóa một dự án nhỏ trong nhiều dự án → không hỏi', () => {
    const pc = pcSeed();
    const st = syncStats(pc, { v: 1, stamps: Object.fromEntries(['thang:t1', 'thang:t2', 'tuan:w1', 'tuan:w2', 'ngay:d1', 'ngay:d2'].map((k) => [k, 5])), tomb: {} }, pc, { v: 1, stamps: {}, tomb: { 'ngay:d1': 9 } }, 10);
    expect(st.pc.del).toBe(1);
    expect(needsChoice(st, 'normal')).toBe(false);
    expect(needsChoice(st, 'preview')).toBe(true);
    expect(needsChoice(st, 'off')).toBe(false);
  });
  it('gợi ý cách mất ít việc nhất', () => {
    const base = { pc: side(6, 0), phone: side(0, 0), pcOnly: 6, phoneOnly: 0, differ: 0 };
    expect(suggestMode(base)).toBe('merge');
    const risky = { ...base, pc: side(6, 6) };
    expect(lossOf(risky, 'merge')).toBe(6);
    expect(suggestMode(risky)).toBe('pull');
    expect(suggestMode({ pc: side(2, 0), phone: side(8, 6), pcOnly: 0, phoneOnly: 8, differ: 0 })).toBe('push');
  });
});
