import { describe, it, expect } from 'vitest';
import { bulkSetStatus, cancelItems, restoreItems } from '../src/core/ops.ts';
import { bellItems, derive, metrics } from '../src/core/status.ts';
import { computeReminders } from '../src/core/reminders.ts';
import { projectStats } from '../src/core/projectStats.ts';
import { workMinutes } from '../src/core/stats.ts';
import { normalizeData } from '../src/core/migrate.ts';
import { defaultSettings, emptyData } from '../src/core/model.ts';
import type { Data } from '../src/core/model.ts';
import { mkNgay, mkThang, mkTuan } from './helpers.ts';

const AT = '2026-10-20T09:00:00';
const TODAY = '2026-10-20';
const base = (): Data => ({
  ...emptyData(),
  thang: [mkThang({ id: 't1', ma: 'M001', bd: '2026-10-01', dl: '2026-10-10' })],
  tuan: [
    mkTuan({ id: 'w1', ma: 'W001', parentMa: 'M001' }),
    mkTuan({ id: 'w2', ma: 'W002', parentMa: 'M001' }),
    mkTuan({ id: 'w3', ma: 'W003', parentMa: 'M001' })
  ],
  ngay: [
    mkNgay({ id: 'd1', ma: 'D001', parentId: 'w1', tt: 'Hoàn thành', g1: '08:00', g2: '10:00', a1: '2026-10-02T08:00:00', a2: '2026-10-02T10:30:00' }),
    mkNgay({ id: 'd2', ma: 'D002', parentId: 'w1', tt: 'Hoàn thành' }),
    mkNgay({ id: 'd3', ma: 'D003', parentId: 'w2', tt: 'Hoàn thành' }),
    mkNgay({ id: 'd4', ma: 'D004', parentId: 'w2', tt: 'Chưa làm', g1: '13:00', g2: '17:00' }),
    mkNgay({ id: 'd5', ma: 'D005', parentId: 'w3', tt: 'Đang làm', a1: '2026-10-05T08:00:00' })
  ]
});

describe('hủy việc', () => {
  it('hủy CV Tháng: việc con chưa xong bị hủy theo, việc con đã xong giữ nguyên; trạng thái gốc không đổi', () => {
    const r = cancelItems(base(), 'thang', ['t1'], AT, '  Khách hàng dừng dự án ');
    const d = r.data;
    expect(d.thang[0].huy).toEqual({ at: AT, reason: 'Khách hàng dừng dự án' });
    expect(d.thang[0].tt).toBe('Chưa làm');
    expect(d.tuan.find((t) => t.id === 'w1')!.huy).toBeFalsy(); // đã xong
    expect(d.tuan.find((t) => t.id === 'w2')!.huy?.root).toBe('t1');
    expect(d.tuan.find((t) => t.id === 'w3')!.huy?.root).toBe('t1');
    expect(d.ngay.find((n) => n.id === 'd3')!.huy).toBeFalsy(); // đã xong
    expect(d.ngay.find((n) => n.id === 'd4')!.huy?.root).toBe('t1');
    expect(d.ngay.find((n) => n.id === 'd5')!.huy?.root).toBe('t1');
    expect(d.ngay.find((n) => n.id === 'd5')!.a1).toBe('2026-10-05T08:00:00'); // giờ đã làm giữ nguyên
    expect(r.count).toBe(5);
  });
  it('việc đã hủy hiện "Đã hủy" và giữ đúng tiến độ lúc hủy (tính trên mọi việc con)', () => {
    const d = cancelItems(base(), 'thang', ['t1'], AT).data;
    const dv = derive(d, TODAY);
    expect(dv.thang.get('t1')!.display).toBe('Đã hủy');
    expect(dv.thang.get('t1')!.progress).toBeCloseTo(1 / 3);
    expect(dv.tuan.get('w2')!.progress).toBe(0.5);
    expect(dv.tuan.get('w2')!.display).toBe('Đã hủy');
  });
  it('việc cha đang chạy không tính việc con đã hủy', () => {
    const d = cancelItems(base(), 'tuan', ['w3'], AT).data;
    const dv = derive(d, TODAY);
    // còn w1 (xong) và w2 (đang làm 1/2): tiến độ 1/2
    expect(dv.thang.get('t1')!.progress).toBe(0.5);
    expect(dv.thang.get('t1')!.childCount).toBe(3); // vẫn khóa sửa trạng thái tay
    // hủy thêm w2 → mọi tuần còn lại đã xong → tháng hoàn thành
    const d2 = cancelItems(d, 'tuan', ['w2'], AT).data;
    expect(derive(d2, TODAY).thang.get('t1')!.raw).toBe('Hoàn thành');
  });
  it('không quá hạn, không nhắc việc, không vào chuông, không tính vào thẻ tổng', () => {
    const d = cancelItems(base(), 'thang', ['t1'], AT).data;
    const dv = derive(d, TODAY);
    expect(dv.thang.get('t1')!.display).not.toBe('Quá hạn');
    expect(bellItems(d, dv, TODAY, 3)).toEqual([]);
    expect(metrics(d, dv).total).toBe(0);
    const rem = computeReminders({ ...d, ngay: d.ngay.map((n) => ({ ...n, ngay: '2026-10-21', g1: '08:00', g2: '09:00' })) }, { ...defaultSettings(), notificationsEnabled: true }, Date.parse('2026-10-19T00:00:00'));
    expect(rem.filter((r) => r.level === 'ngay')).toEqual([]); // d1–d3 đã xong, d4–d5 đã hủy
    expect(rem.filter((r) => r.level !== 'ngay')).toEqual([]);
  });
  it('hủy lại việc đã hủy thì bỏ qua; đổi trạng thái hàng loạt bỏ qua việc đã hủy', () => {
    const d = cancelItems(base(), 'ngay', ['d4'], AT).data;
    expect(cancelItems(d, 'ngay', ['d4'], '2026-10-21T00:00:00').count).toBe(0);
    const r = bulkSetStatus(d, 'ngay', ['d4', 'd5'], 'Hoàn thành');
    expect(r.skipped).toBe(1);
    expect(r.data.ngay.find((n) => n.id === 'd4')!.tt).toBe('Chưa làm');
  });
});

describe('khôi phục', () => {
  it('khôi phục cha thì khôi phục cả việc con bị hủy theo, nhưng không động tới việc con hủy riêng', () => {
    let d = cancelItems(base(), 'ngay', ['d5'], AT).data; // hủy riêng
    d = cancelItems(d, 'thang', ['t1'], AT).data;
    const r = restoreItems(d, 'thang', ['t1']);
    expect(r.data.thang[0].huy).toBeFalsy();
    expect(r.data.tuan.every((t) => !t.huy)).toBe(true);
    expect(r.data.ngay.find((n) => n.id === 'd4')!.huy).toBeFalsy();
    expect(r.data.ngay.find((n) => n.id === 'd5')!.huy).toBeTruthy();
    expect(r.count).toBe(4);
  });
});

describe('thống kê và lưu trữ', () => {
  it('giờ của việc đã hủy: chỉ tính giờ thực tế đã làm', () => {
    expect(workMinutes(mkNgay({ g1: '08:00', g2: '12:00', huy: { at: AT } })).min).toBe(0);
    expect(workMinutes(mkNgay({ g1: '08:00', g2: '12:00', a1: '2026-10-01T08:00:00', a2: '2026-10-01T09:00:00', huy: { at: AT } })).min).toBe(60);
  });
  it('Tổng quan dự án của việc đã hủy: kết luận "đã hủy", vẫn có tiến độ và đếm riêng', () => {
    const d = cancelItems(base(), 'thang', ['t1'], AT, 'Dừng').data;
    const s = projectStats(d, derive(d, TODAY), 'thang', 't1', TODAY)!;
    expect(s.verdict).toEqual({ kind: 'cancelled', at: AT, reason: 'Dừng' });
    expect(s.counts.cancel).toBe(2);
    expect(s.childTotal).toBe(3);
    expect(s.childDone).toBe(1);
    expect(s.upcoming).toEqual([]);
  });
  it('dấu hủy được giữ khi chuẩn hóa dữ liệu (đồng bộ / khôi phục bản sao lưu)', () => {
    const d = normalizeData({ thang: [{ id: 't', ma: 'M1', huy: { at: AT, reason: ' x ', root: 'r' } }, { id: 'u', ma: 'M2', huy: { reason: 'thiếu at' } }], tuan: [], ngay: [] });
    expect(d.thang[0].huy).toEqual({ at: AT, reason: 'x', root: 'r' });
    expect('huy' in d.thang[1]).toBe(false);
  });
});
