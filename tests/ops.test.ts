import { describe, it, expect } from 'vitest';
import { cascadeCounts, removeItems, bulkSetStatus, bulkAssign, removePerson, sortByPlan, countAssigned } from '../src/core/ops.ts';
import { emptyData } from '../src/core/model.ts';
import type { Data } from '../src/core/model.ts';
import { mkNgay, mkThang, mkTuan } from './helpers.ts';

const base = (): Data => ({
  ...emptyData(),
  people: [{ id: 'p1', name: 'A', color: '#fff', photo: null }],
  thang: [mkThang({ id: 't1', ma: 'M001', personId: 'p1' }), mkThang({ id: 't2', ma: 'M002' })],
  tuan: [
    mkTuan({ id: 'w1', ma: 'W001', parentMa: 'M001', personId: 'p1' }),
    mkTuan({ id: 'w2', ma: 'W002', parentMa: 'M001' }),
    mkTuan({ id: 'w3', ma: 'W003', parentMa: 'M002' })
  ],
  ngay: [mkNgay({ id: 'd1', parentId: 'w1', personId: 'p1' }), mkNgay({ id: 'd2', ma: 'D002', parentId: 'w1' }), mkNgay({ id: 'd3', ma: 'D003', parentId: 'w3' })]
});

describe('xóa dây chuyền (6.10)', () => {
  it('đếm việc con trước khi xóa', () => {
    expect(cascadeCounts(base(), 'thang', ['t1'])).toEqual({ tuan: 2, ngay: 2 });
    expect(cascadeCounts(base(), 'tuan', ['w1'])).toEqual({ tuan: 0, ngay: 2 });
    expect(cascadeCounts(base(), 'ngay', ['d1'])).toEqual({ tuan: 0, ngay: 0 });
  });
  it('xóa Tháng → xóa Tuần và Ngày con', () => {
    const { data, removed } = removeItems(base(), 'thang', ['t1']);
    expect(removed).toEqual({ thang: 1, tuan: 2, ngay: 2 });
    expect(data.thang.map((x) => x.id)).toEqual(['t2']);
    expect(data.tuan.map((x) => x.id)).toEqual(['w3']);
    expect(data.ngay.map((x) => x.id)).toEqual(['d3']);
  });
  it('xóa Tuần → xóa Ngày con, giữ Tháng', () => {
    const { data, removed } = removeItems(base(), 'tuan', ['w1']);
    expect(removed).toEqual({ thang: 0, tuan: 1, ngay: 2 });
    expect(data.thang).toHaveLength(2);
    expect(data.ngay.map((x) => x.id)).toEqual(['d3']);
  });
  it('xóa Ngày', () => expect(removeItems(base(), 'ngay', ['d1', 'd2']).data.ngay).toHaveLength(1));
  it('xóa nhiều tháng cùng lúc đếm đúng', () => expect(removeItems(base(), 'thang', ['t1', 't2']).removed).toEqual({ thang: 2, tuan: 3, ngay: 3 }));
  it('snapshot gốc không bị thay đổi (dùng cho Hoàn tác)', () => {
    const d = base();
    removeItems(d, 'thang', ['t1']);
    expect(d.thang).toHaveLength(2);
    expect(d.ngay).toHaveLength(3);
  });
});

describe('hàng loạt (8.6.5)', () => {
  it('đổi trạng thái bỏ qua việc cha', () => {
    const { data, skipped } = bulkSetStatus(base(), 'tuan', ['w1', 'w2', 'w3'], 'Hoàn thành');
    expect(skipped).toBe(2); // w1 và w3 có việc ngày
    expect(data.tuan.find((t) => t.id === 'w2')!.tt).toBe('Hoàn thành');
    expect(data.tuan.find((t) => t.id === 'w1')!.tt).toBe('Chưa làm');
  });
  it('Ngày không có việc con nên không bị bỏ qua', () => {
    const { data, skipped } = bulkSetStatus(base(), 'ngay', ['d1', 'd2'], 'Đang làm');
    expect(skipped).toBe(0);
    expect(data.ngay.filter((n) => n.tt === 'Đang làm')).toHaveLength(2);
  });
  it('phân công lại', () => {
    expect(bulkAssign(base(), 'thang', ['t2'], 'p1').thang[1].personId).toBe('p1');
    expect(bulkAssign(base(), 'thang', ['t1'], null).thang[0].personId).toBeNull();
  });
});

describe('nhân sự', () => {
  it('xóa người → việc chuyển về Chưa gán', () => {
    const d = base();
    expect(countAssigned(d, 'p1')).toBe(3);
    const r = removePerson(d, 'p1');
    expect(r.people).toHaveLength(0);
    expect([...r.thang, ...r.tuan, ...r.ngay].every((x) => x.personId === null)).toBe(true);
  });
});

describe('sắp xếp (X10)', () => {
  it('theo bd rồi dl, rỗng xuống cuối', () => {
    const list = [
      mkThang({ id: 'a', ma: 'M001', bd: '2026-10-05', dl: '2026-10-20' }),
      mkThang({ id: 'b', ma: 'M002', bd: '2026-10-01', dl: '2026-10-30' }),
      mkThang({ id: 'c', ma: 'M003', bd: '2026-10-05', dl: '2026-10-10' }),
      mkThang({ id: 'd', ma: 'M004' })
    ];
    expect(sortByPlan(list).map((x) => x.id)).toEqual(['b', 'c', 'a', 'd']);
  });
});
