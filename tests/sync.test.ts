import { describe, it, expect } from 'vitest';
import { applyEdit, countDiff, emptyMeta, initMeta, mergeData, sameData, stampChanges, TOMB_TTL } from '../src/core/sync.ts';
import { emptyData } from '../src/core/model.ts';
import type { Data } from '../src/core/model.ts';
import { mkNgay, mkThang, mkTuan } from './helpers.ts';

const base = (): Data => ({
  ...emptyData(),
  people: [{ id: 'p1', name: 'An', color: '#fff', photo: null }],
  thang: [mkThang({ id: 't1', ma: 'M001', ten: 'Gốc' })],
  tuan: [mkTuan({ id: 'w1', ma: 'W001', parentMa: 'M001' })],
  ngay: [mkNgay({ id: 'd1', ma: 'D001', parentId: 'w1' })],
  counters: { M: 1, W: 1, D: 1 }
});
const edit = (d: Data, f: (x: Data) => Data) => f(structuredClone(d));

describe('đóng dấu thay đổi', () => {
  it('chỉ bản ghi đổi mới được đóng dấu; xóa để lại bia mộ', () => {
    const a = base();
    const m0 = initMeta(a, 1);
    const b = edit(a, (x) => ({ ...x, thang: [{ ...x.thang[0], ten: 'Sửa' }], ngay: [] }));
    const m1 = stampChanges(a, b, m0, 500);
    expect(m1.stamps['thang:t1']).toBe(500);
    expect(m1.stamps['tuan:w1']).toBe(1);
    expect(m1.tomb['ngay:d1']).toBe(500);
    expect(m1.stamps['ngay:d1']).toBeUndefined();
  });
});

describe('gộp hai thiết bị', () => {
  const start = base();
  const m0 = initMeta(start, 1);

  it('mỗi bên sửa một việc khác nhau → giữ cả hai thay đổi', () => {
    const pc = edit(start, (x) => ({ ...x, thang: [{ ...x.thang[0], ten: 'PC sửa' }] }));
    const pcm = stampChanges(start, pc, m0, 100);
    const ph = edit(start, (x) => ({ ...x, ngay: [{ ...x.ngay[0], tt: 'Hoàn thành' }] }));
    const phm = stampChanges(start, ph, m0, 120);
    const r = mergeData(pc, pcm, ph, phm, 200);
    expect(r.data.thang[0].ten).toBe('PC sửa');
    expect(r.data.ngay[0].tt).toBe('Hoàn thành');
  });

  it('cùng sửa một việc → bản sửa sau cùng thắng', () => {
    const pc = edit(start, (x) => ({ ...x, thang: [{ ...x.thang[0], ten: 'PC' }] }));
    const ph = edit(start, (x) => ({ ...x, thang: [{ ...x.thang[0], ten: 'Điện thoại' }] }));
    const r1 = mergeData(pc, stampChanges(start, pc, m0, 300), ph, stampChanges(start, ph, m0, 200), 400);
    expect(r1.data.thang[0].ten).toBe('PC');
    const r2 = mergeData(pc, stampChanges(start, pc, m0, 200), ph, stampChanges(start, ph, m0, 300), 400);
    expect(r2.data.thang[0].ten).toBe('Điện thoại');
  });

  it('việc đã xóa không sống lại', () => {
    const pc = edit(start, (x) => ({ ...x, ngay: [] }));
    const pcm = stampChanges(start, pc, m0, 100);
    const r = mergeData(pc, pcm, start, m0, 200); // điện thoại vẫn còn bản cũ
    expect(r.data.ngay).toHaveLength(0);
    expect(r.meta.tomb['ngay:d1']).toBe(100);
    // điện thoại nhận kết quả, gộp lại lần nữa vẫn đã xóa
    const again = mergeData(start, m0, r.data, r.meta, 300);
    expect(again.data.ngay).toHaveLength(0);
  });

  it('sửa sau khi bên kia xóa → bản sửa thắng (không mất việc vừa làm)', () => {
    const pc = edit(start, (x) => ({ ...x, ngay: [] }));
    const ph = edit(start, (x) => ({ ...x, ngay: [{ ...x.ngay[0], ten: 'vẫn làm' }] }));
    const r = mergeData(pc, stampChanges(start, pc, m0, 100), ph, stampChanges(start, ph, m0, 150), 200);
    expect(r.data.ngay[0].ten).toBe('vẫn làm');
  });

  it('hai bên cùng tạo M002 → đánh số lại bản của điện thoại, tuần con đi theo', () => {
    const pc = edit(start, (x) => ({ ...x, thang: [...x.thang, mkThang({ id: 'tPC', ma: 'M002', ten: 'Của PC' })], counters: { M: 2, W: 1, D: 1 } }));
    const ph = edit(start, (x) => ({
      ...x,
      thang: [...x.thang, mkThang({ id: 'tPH', ma: 'M002', ten: 'Của ĐT' })],
      tuan: [...x.tuan, mkTuan({ id: 'wPH', ma: 'W002', parentMa: 'M002', ten: 'Tuần của ĐT' })],
      counters: { M: 2, W: 2, D: 1 }
    }));
    const r = mergeData(pc, stampChanges(start, pc, m0, 100), ph, stampChanges(start, ph, m0, 90), 200);
    const pcT = r.data.thang.find((t) => t.id === 'tPC')!;
    const phT = r.data.thang.find((t) => t.id === 'tPH')!;
    expect(pcT.ma).toBe('M002');
    expect(phT.ma).toBe('M003');
    expect(r.data.tuan.find((t) => t.id === 'wPH')!.parentMa).toBe('M003');
    expect(r.data.counters).toEqual({ M: 3, W: 2, D: 1 });
    expect(r.meta.stamps['thang:tPH']).toBe(200); // thay đổi do gộp cũng được đóng dấu để lan sang máy kia
    // điện thoại gộp lại kết quả: ổn định
    const again = mergeData(ph, stampChanges(start, ph, m0, 90), r.data, r.meta, 300);
    expect(sameData(again.data, r.data)).toBe(true);
  });

  it('việc ngày tạo dưới tuần mà máy kia đã xóa → xóa theo', () => {
    const pc = edit(start, (x) => ({ ...x, tuan: [], ngay: [] }));
    const ph = edit(start, (x) => ({ ...x, ngay: [...x.ngay, mkNgay({ id: 'd2', ma: 'D002', parentId: 'w1' })] }));
    const r = mergeData(pc, stampChanges(start, pc, m0, 100), ph, stampChanges(start, ph, m0, 90), 200);
    expect(r.data.tuan).toHaveLength(0);
    expect(r.data.ngay).toHaveLength(0);
  });

  it('người bị xóa ở máy này, máy kia vừa gán → chuyển về Chưa gán', () => {
    const pc = edit(start, (x) => ({ ...x, people: [] }));
    const ph = edit(start, (x) => ({ ...x, thang: [{ ...x.thang[0], personId: 'p1' }] }));
    const r = mergeData(pc, stampChanges(start, pc, m0, 200), ph, stampChanges(start, ph, m0, 100), 300);
    expect(r.data.people).toHaveLength(0);
    expect(r.data.thang[0].personId).toBeNull();
  });

  it('điện thoại mới, chưa có gì → nhận toàn bộ dữ liệu PC', () => {
    const r = mergeData(start, m0, emptyData(), emptyMeta(), 50);
    expect(sameData(r.data, start)).toBe(true);
  });

  it('gộp là idempotent', () => {
    const ph = edit(start, (x) => ({ ...x, thang: [...x.thang, mkThang({ id: 't9', ma: 'M002' })] }));
    const phm = stampChanges(start, ph, m0, 80);
    const r1 = mergeData(start, m0, ph, phm, 100);
    const r2 = mergeData(r1.data, r1.meta, ph, phm, 110);
    expect(sameData(r1.data, r2.data)).toBe(true);
  });

  it('bia mộ quá hạn được dọn', () => {
    const pc = edit(start, (x) => ({ ...x, ngay: [] }));
    const pcm = stampChanges(start, pc, m0, 100);
    const r = mergeData(pc, pcm, pc, pcm, 100 + TOMB_TTL + 1);
    expect(r.meta.tomb['ngay:d1']).toBeUndefined();
  });
});

describe('lưu từ giao diện khi dữ liệu vừa đồng bộ (applyEdit)', () => {
  const start = base();
  const m0 = initMeta(start, 1);
  it('không có đồng bộ chen giữa → lưu nguyên', () => {
    const ed = edit(start, (x) => ({ ...x, thang: [{ ...x.thang[0], ten: 'mới' }] }));
    const r = applyEdit(start, ed, start, m0, 10);
    expect(r.patched).toBe(false);
    expect(r.data).toBe(ed);
  });
  it('đồng bộ vừa thêm việc của điện thoại → lần lưu cũ của PC không xóa mất việc đó', () => {
    const current = edit(start, (x) => ({ ...x, ngay: [...x.ngay, mkNgay({ id: 'dPH', ma: 'D002', parentId: 'w1' })] }));
    const meta = stampChanges(start, current, m0, 50);
    const ed = edit(start, (x) => ({ ...x, thang: [{ ...x.thang[0], ten: 'PC sửa' }] })); // dựa trên bản cũ
    const r = applyEdit(start, ed, current, meta, 60);
    expect(r.patched).toBe(true);
    expect(r.data.thang[0].ten).toBe('PC sửa');
    expect(r.data.ngay.map((n) => n.id)).toEqual(['d1', 'dPH']);
    expect(r.meta.stamps['ngay:dPH']).toBe(50);
    expect(r.meta.stamps['thang:t1']).toBe(60);
  });
  it('xóa trên bản cũ vẫn áp lên bản mới', () => {
    const current = edit(start, (x) => ({ ...x, people: [...x.people, { id: 'p2', name: 'Bình', color: '#000', photo: null }] }));
    const ed = edit(start, (x) => ({ ...x, ngay: [] }));
    const r = applyEdit(start, ed, current, stampChanges(start, current, m0, 5), 9);
    expect(r.data.ngay).toHaveLength(0);
    expect(r.data.people).toHaveLength(2);
  });
  it('tạo M002 trên bản cũ trong khi đồng bộ đã có M002 → mã mới của PC được đánh lại', () => {
    const current = edit(start, (x) => ({ ...x, thang: [...x.thang, mkThang({ id: 'tR', ma: 'M002' })], counters: { M: 2, W: 1, D: 1 } }));
    const ed = edit(start, (x) => ({ ...x, thang: [...x.thang, mkThang({ id: 'tL', ma: 'M002' })], counters: { M: 2, W: 1, D: 1 } }));
    const r = applyEdit(start, ed, current, stampChanges(start, current, m0, 5), 9);
    expect(r.data.thang.find((t) => t.id === 'tR')!.ma).toBe('M002');
    expect(r.data.thang.find((t) => t.id === 'tL')!.ma).toBe('M003');
  });
  it('countDiff', () => {
    const ed = edit(start, (x) => ({ ...x, thang: [{ ...x.thang[0], ten: 'x' }], ngay: [] }));
    expect(countDiff(start, ed)).toBe(2);
  });
});

describe('danh mục Phân loại / Vị trí', () => {
  it('máy chưa sửa danh mục không xóa danh mục của máy kia; gộp giữ phân loại của việc', () => {
    const a = base();
    const am = initMeta(a, 1);
    const b0 = base();
    const b = edit(b0, (x) => ({
      ...x,
      cats: [{ id: 'c-dotxuat', name: 'Gấp ngoài kế hoạch', color: '#f00' }, { id: 'c-moi', name: 'Thiết kế', color: '#0f0' }],
      ngay: x.ngay.map((n) => ({ ...n, cat: 'c-moi', place: 'pl-congtruong', placeNote: 'Vĩnh Phúc' }))
    }));
    const bm = stampChanges(b0, b, initMeta(b0, 1), 100);
    const r = mergeData(a, am, b, bm, 200);
    expect(r.data.cats?.map((o) => o.id)).toEqual(['c-dotxuat', 'c-moi']);
    expect(r.data.ngay[0].cat).toBe('c-moi');
    expect(r.data.ngay[0].placeNote).toBe('Vĩnh Phúc');
    expect(r.data.places).toBe(undefined);
  });
  it('cả hai máy chưa sửa thì vẫn để trống (dùng mặc định)', () => {
    const a = base();
    const r = mergeData(a, initMeta(a, 1), base(), initMeta(base(), 1), 10);
    expect('cats' in r.data).toBe(false);
  });
  it('xóa mục ở một máy → việc đang dùng mục đó ở máy kia trở về trống', () => {
    const start = edit(base(), (x) => ({ ...x, cats: [{ id: 'c1', name: 'A', color: '#000' }, { id: 'c2', name: 'B', color: '#111' }] }));
    const m0 = initMeta(start, 1);
    const a = edit(start, (x) => ({ ...x, cats: x.cats!.filter((o) => o.id !== 'c2') }));
    const am = stampChanges(start, a, m0, 50);
    const b = edit(start, (x) => ({ ...x, thang: x.thang.map((t) => ({ ...t, cat: 'c2' })) }));
    const bm = stampChanges(start, b, m0, 60);
    const r = mergeData(a, am, b, bm, 100);
    expect(r.data.cats?.map((o) => o.id)).toEqual(['c1']);
    expect(r.data.thang[0].cat).toBe(null);
  });
});
