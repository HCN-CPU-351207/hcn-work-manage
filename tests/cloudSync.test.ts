// Đồng bộ online qua Google Drive: chạy với một "Drive giả" trong bộ nhớ
import { describe, it, expect } from 'vitest';
import {
  checksum,
  clockOffset,
  cloudSync,
  decodeDevice,
  devName,
  encodeDevice,
  initCloudState,
  KEEP_DAY,
  listCloudBackups,
  readCloudBackup,
  VAULT_NAME
} from '../src/core/cloudSync.ts';
import type { CloudFile, CloudLocalState, CloudStore, CloudSyncArgs } from '../src/core/cloudSync.ts';
import { createDataHub } from '../src/core/dataHub.ts';
import { emptyData } from '../src/core/model.ts';
import type { Data } from '../src/core/model.ts';
import { emptyMeta, initMeta } from '../src/core/sync.ts';
import { mkNgay, mkThang, mkTuan } from './helpers.ts';

let clock = Date.parse('2026-10-20T08:00:00Z');
const tick = (ms = 1000) => (clock += ms);

function fakeDrive() {
  const files = new Map<string, { name: string; text: string; modifiedTime: string }>();
  let n = 0;
  const meta = (id: string): CloudFile => ({ id, name: files.get(id)!.name, modifiedTime: files.get(id)!.modifiedTime, size: files.get(id)!.text.length });
  const store: CloudStore & { files: typeof files; writes: string[] } = {
    files,
    writes: [],
    async list() {
      return [...files.keys()].map(meta);
    },
    async read(id) {
      const f = files.get(id);
      if (!f) throw new Error('404');
      return f.text;
    },
    async create(name, text) {
      const id = `f${++n}`;
      files.set(id, { name, text, modifiedTime: new Date(tick(1)).toISOString() });
      store.writes.push(name);
      return meta(id);
    },
    async update(id, text) {
      const f = files.get(id)!;
      files.set(id, { ...f, text, modifiedTime: new Date(tick(1)).toISOString() });
      store.writes.push(f.name);
      return meta(id);
    },
    async remove(id) {
      files.delete(id);
    },
    serverTime: () => clock
  };
  return store;
}

const seed = (): Data => ({
  ...emptyData(),
  thang: [mkThang({ id: 't1', ma: 'M001' }), mkThang({ id: 't2', ma: 'M002' })],
  tuan: [mkTuan({ id: 'w1', ma: 'W001', parentMa: 'M001' }), mkTuan({ id: 'w2', ma: 'W002', parentMa: 'M002' })],
  ngay: [mkNgay({ id: 'd1', ma: 'D001', parentId: 'w1' }), mkNgay({ id: 'd2', ma: 'D002', parentId: 'w2' })],
  counters: { M: 2, W: 2, D: 2 }
});

/** Một máy: dữ liệu + trạng thái đồng bộ Drive */
function device(id: string, data: Data, email = 'an@gmail.com') {
  const hub = createDataHub({ data, meta: initMeta(data, 1) });
  let state: CloudLocalState = initCloudState(id);
  const cache = new Map();
  const backups: number[] = [];
  return {
    hub,
    get state() {
      return state;
    },
    backups,
    async sync(store: CloudStore, extra: Partial<CloudSyncArgs> = {}) {
      const r = await cloudSync(store, {
        local: { data: hub.state.data, meta: hub.state.meta },
        state,
        email,
        deviceName: id,
        platform: 'test',
        now: () => tick(),
        cache,
        backupLocal: (d) => {
          backups.push(d.thang.length + d.tuan.length + d.ngay.length);
        },
        ...extra
      });
      state = r.state;
      if (r.outcome.kind === 'ok') {
        if (r.outcome.mode === 'pull') hub.reset(r.outcome.data, r.outcome.meta);
        else hub.adoptFromHub(r.outcome.data, r.outcome.meta, tick());
      }
      return r.outcome;
    }
  };
}

describe('liên kết và cùng tài khoản', () => {
  it('máy đầu tiên tạo kho, file của mình và bản sao lưu ngày', async () => {
    const drive = fakeDrive();
    const pc = device('pc', seed());
    const o = await pc.sync(drive);
    expect(o.kind).toBe('ok');
    const names = [...drive.files.values()].map((f) => f.name).sort();
    expect(names).toContain(VAULT_NAME);
    expect(names).toContain(devName('pc'));
    expect(names.some((n) => n.startsWith('hcn-backup-day-'))).toBe(true);
    expect(pc.state.email).toBe('an@gmail.com');
    expect(pc.state.vaultId).toBeTruthy();
  });

  it('điện thoại trống cùng tài khoản → nhận dữ liệu, không hỏi', async () => {
    const drive = fakeDrive();
    const pc = device('pc', seed());
    await pc.sync(drive);
    const phone = device('phone', emptyData());
    const o = await phone.sync(drive);
    expect(o.kind).toBe('ok');
    expect(phone.hub.state.data.ngay).toHaveLength(2);
  });

  it('khác tài khoản Google → chặn, không ghi gì lên Drive', async () => {
    const drive = fakeDrive();
    await device('pc', seed()).sync(drive);
    const before = drive.writes.length;
    const other = device('x', seed(), 'binh@gmail.com');
    const o = await other.sync(drive);
    expect(o).toEqual({ kind: 'wrongAccount', owner: 'an@gmail.com' });
    expect(drive.writes.length).toBe(before);
    expect(other.hub.state.data.thang).toHaveLength(2);
  });

  it('máy đã liên kết a@ mà đăng nhập b@ → chặn trước khi đụng tới Drive', async () => {
    const driveA = fakeDrive();
    const pc = device('pc', seed());
    await pc.sync(driveA);
    const driveB = fakeDrive(); // Drive của tài khoản khác
    const r = await cloudSync(driveB, { local: { data: seed(), meta: emptyMeta() }, state: pc.state, email: 'binh@gmail.com', deviceName: 'pc', platform: 't', now: () => tick() });
    expect(r.outcome).toEqual({ kind: 'wrongAccount', owner: 'an@gmail.com' });
    expect(driveB.writes).toEqual([]);
  });

  it('email khác hoa/thường vẫn là cùng tài khoản', async () => {
    const drive = fakeDrive();
    await device('pc', seed()).sync(drive);
    expect((await device('p', emptyData(), ' An@Gmail.com ').sync(drive)).kind).toBe('ok');
  });

  it('hai máy cùng tạo kho một lúc → cả hai chọn kho tạo sớm nhất', async () => {
    const drive = fakeDrive();
    await drive.create(VAULT_NAME, JSON.stringify({ v: 1, vaultId: 'B', ownerEmail: 'an@gmail.com', createdAt: 20 }));
    await drive.create(VAULT_NAME, JSON.stringify({ v: 1, vaultId: 'A', ownerEmail: 'an@gmail.com', createdAt: 10 }));
    const pc = device('pc', seed());
    await pc.sync(drive);
    expect(pc.state.vaultId).toBe('A');
  });
});

describe('đồng bộ hai chiều qua Drive', () => {
  it('sửa trên điện thoại → PC nhận; sửa trên PC → điện thoại nhận', async () => {
    const drive = fakeDrive();
    const pc = device('pc', seed());
    const phone = device('phone', emptyData());
    await pc.sync(drive);
    await phone.sync(drive);
    const d = phone.hub.state.data;
    phone.hub.save({ ...d, thang: d.thang.map((x) => (x.id === 't1' ? { ...x, ten: 'Sửa trên ĐT' } : x)) }, phone.hub.state.rev, tick());
    await phone.sync(drive);
    await pc.sync(drive);
    expect(pc.hub.state.data.thang.find((x) => x.id === 't1')!.ten).toBe('Sửa trên ĐT');
    const p = pc.hub.state.data;
    pc.hub.save({ ...p, ngay: p.ngay.filter((x) => x.id !== 'd2') }, pc.hub.state.rev, tick());
    await pc.sync(drive);
    await phone.sync(drive);
    expect(phone.hub.state.data.ngay.map((x) => x.id)).toEqual(['d1']);
  });

  it('không đổi gì thì không tải file của máy mình lên lại', async () => {
    const drive = fakeDrive();
    const pc = device('pc', seed());
    await pc.sync(drive);
    const n = drive.writes.filter((w) => w === devName('pc')).length;
    await pc.sync(drive);
    await pc.sync(drive);
    expect(drive.writes.filter((w) => w === devName('pc')).length).toBe(n);
  });
});

describe('không tự xóa hàng loạt', () => {
  async function phoneDeletedAll() {
    const drive = fakeDrive();
    const pc = device('pc', seed());
    const phone = device('phone', emptyData());
    await pc.sync(drive);
    await phone.sync(drive);
    phone.hub.save(emptyData(), phone.hub.state.rev, tick());
    return { drive, pc, phone };
  }

  it('điện thoại xóa hết → điện thoại bị hỏi trước khi đẩy lên', async () => {
    const { drive, phone } = await phoneDeletedAll();
    const o = await phone.sync(drive);
    expect(o.kind).toBe('choice');
    if (o.kind === 'choice') expect(o.stats.pc.del).toBe(6);
  });

  it('chọn "Drive → máy này": điện thoại lấy lại đủ', async () => {
    const { drive, phone } = await phoneDeletedAll();
    const o = await phone.sync(drive, { mode: 'pull' });
    expect(o.kind).toBe('ok');
    expect(phone.hub.state.data.thang).toHaveLength(2);
    expect((await phone.sync(drive)).kind).toBe('ok'); // lần sau không hỏi nữa
  });

  it('cố tình gộp (xóa) → PC cũng được hỏi, không tự xóa', async () => {
    const { drive, pc, phone } = await phoneDeletedAll();
    expect((await phone.sync(drive, { mode: 'merge' })).kind).toBe('ok');
    const o = await pc.sync(drive);
    expect(o.kind).toBe('choice');
    expect(pc.hub.state.data.thang).toHaveLength(2);
    // PC chọn "máy này → Drive": giữ dữ liệu PC; có bản sao lưu dữ liệu Drive trước khi ghi đè
    expect((await pc.sync(drive, { mode: 'push' })).kind).toBe('ok');
    expect([...drive.files.values()].some((f) => f.name.startsWith('hcn-backup-pre-'))).toBe(true);
    const o2 = await phone.sync(drive);
    // điện thoại sẽ nhận lại 6 việc (thêm, không xóa) → không hỏi
    expect(o2.kind).toBe('ok');
    expect(phone.hub.state.data.ngay).toHaveLength(2);
  });

  it('chọn "Drive → máy này" khi máy có việc riêng → sao lưu dữ liệu máy trước', async () => {
    const drive = fakeDrive();
    await device('pc', seed()).sync(drive);
    const phone = device('phone', { ...emptyData(), thang: [mkThang({ id: 'own', ma: 'M001' })], counters: { M: 1, W: 0, D: 0 } });
    const first = await phone.sync(drive);
    expect(first.kind).toBe('choice'); // lần đầu, hai bên khác nhau
    await phone.sync(drive, { mode: 'pull' });
    expect(phone.backups).toEqual([1]);
    expect(phone.hub.state.data.thang.map((x) => x.id)).toEqual(['t1', 't2']);
  });

  it('xem trước luôn trả số liệu, không ghi', async () => {
    const drive = fakeDrive();
    const pc = device('pc', seed());
    await pc.sync(drive);
    const before = drive.writes.length;
    expect((await pc.sync(drive, { preview: true })).kind).toBe('choice');
    expect(drive.writes.length).toBe(before);
  });
});

describe('rủi ro trên Drive', () => {
  it('file của máy khác bị hỏng → bỏ qua, dùng bản đọc được trước đó', async () => {
    const drive = fakeDrive();
    const pc = device('pc', seed());
    const phone = device('phone', emptyData());
    await pc.sync(drive);
    await phone.sync(drive);
    const [id, f] = [...drive.files.entries()].find(([, x]) => x.name === devName('pc'))!;
    drive.files.set(id, { ...f, text: f.text.slice(0, 50), modifiedTime: new Date(tick()).toISOString() });
    const o = await phone.sync(drive);
    expect(o.kind).toBe('ok');
    expect(phone.hub.state.data.thang).toHaveLength(2);
  });

  it('file sai tổng kiểm tra bị loại', () => {
    const text = encodeDevice({ deviceId: 'a', deviceName: 'a', platform: 't', at: 1, data: seed(), meta: emptyMeta() });
    expect(decodeDevice(text)?.deviceId).toBe('a');
    const bad = JSON.parse(text);
    bad.data.thang = [];
    expect(decodeDevice(JSON.stringify(bad))).toBe(null);
    expect(decodeDevice('{oops')).toBe(null);
    expect(checksum('abc')).toBe(checksum('abc'));
    expect(checksum('abc')).not.toBe(checksum('abd'));
  });

  it('máy lâu không đồng bộ (>150 ngày) bị bỏ qua để việc đã xóa không sống lại', async () => {
    const drive = fakeDrive();
    const old = device('old', seed());
    await old.sync(drive);
    tick(160 * 24 * 3600 * 1000);
    const phone = device('phone', emptyData());
    expect((await phone.sync(drive)).kind).toBe('ok');
    expect(phone.hub.state.data.thang).toHaveLength(0);
  });

  it('kho trên Drive bị xóa → tạo lại từ máy này, không xóa gì trên máy', async () => {
    const drive = fakeDrive();
    const pc = device('pc', seed());
    await pc.sync(drive);
    drive.files.clear();
    const o = await pc.sync(drive);
    expect(o.kind === 'ok' && o.recreated).toBe(true);
    expect(pc.hub.state.data.thang).toHaveLength(2);
    expect([...drive.files.values()].some((f) => f.name === devName('pc'))).toBe(true);
  });

  it('sao lưu ngày giữ tối đa 14 bản; đọc lại được bản sao lưu', async () => {
    const drive = fakeDrive();
    const pc = device('pc', seed());
    for (let i = 0; i < 20; i++) {
      await pc.sync(drive);
      tick(24 * 3600 * 1000);
    }
    const list = await listCloudBackups(drive);
    expect(list.filter((b) => b.kind === 'day').length).toBe(KEEP_DAY);
    const data = await readCloudBackup(drive, list[0].id);
    expect(data.thang).toHaveLength(2);
  });

  it('lệch giờ: chỉ sửa khi lệch quá 2 phút', () => {
    expect(clockOffset(null, 1000)).toBe(0);
    expect(clockOffset(1000 + 60_000, 1000)).toBe(0);
    expect(clockOffset(1000 + 5 * 60_000, 1000)).toBe(5 * 60_000);
    expect(clockOffset(1000 - 10 * 60_000, 1000)).toBe(-10 * 60_000);
  });
});
