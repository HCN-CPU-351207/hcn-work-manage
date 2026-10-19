import { describe, it, expect } from 'vitest';
import {
  startNgay, endNgay, resetNgay, applyActualEdit, normalizeNewNgay, startRange, endRange, resetRange,
  runningDays, canEditStatus, completeTree
} from '../src/core/actions.ts';
import { derive } from '../src/core/status.ts';
import { emptyData } from '../src/core/model.ts';
import { mkNgay, mkThang, mkTuan } from './helpers.ts';

const NOW = '2026-10-19T08:32:10';
describe('CV Ngày: Bắt đầu / Kết thúc / Reset (6.4)', () => {
  it('Bắt đầu', () => expect(startNgay(mkNgay({ a2: '2026-10-19T07:00:00' }), NOW)).toEqual({ ...mkNgay(), a1: NOW, a2: null, tt: 'Đang làm' }));
  it('Kết thúc khi đã có a1 giữ nguyên a1', () => {
    const r = endNgay(mkNgay({ a1: '2026-10-19T08:00:00', tt: 'Đang làm' }), NOW);
    expect(r.a1).toBe('2026-10-19T08:00:00');
    expect(r.a2).toBe(NOW);
    expect(r.tt).toBe('Hoàn thành');
  });
  it('Kết thúc khi a1 rỗng: lấy g1 ghép ngày', () => expect(endNgay(mkNgay({ g1: '07:45', g2: '09:00' }), NOW).a1).toBe('2026-10-19T07:45:00'));
  it('Kết thúc khi a1 rỗng và không có g1: lấy now', () => expect(endNgay(mkNgay(), NOW).a1).toBe(NOW));
  it('Reset', () => expect(resetNgay(mkNgay({ a1: NOW, a2: NOW, tt: 'Hoàn thành' }))).toEqual(mkNgay()));
  it('Sửa a1/a2 trong form quyết định trạng thái', () => {
    expect(applyActualEdit(mkNgay({ a1: NOW, a2: NOW })).tt).toBe('Hoàn thành');
    expect(applyActualEdit(mkNgay({ a1: NOW })).tt).toBe('Đang làm');
    expect(applyActualEdit(mkNgay({ tt: 'Hoàn thành' })).tt).toBe('Chưa làm');
  });
  it('Thêm mới có a2 thì thành Hoàn thành', () => {
    expect(normalizeNewNgay(mkNgay({ a2: NOW, tt: 'Chưa làm' })).tt).toBe('Hoàn thành');
    expect(normalizeNewNgay(mkNgay({ tt: 'Đang làm' })).tt).toBe('Đang làm');
  });
});

describe('CV Tháng / Tuần (theo ngày)', () => {
  const today = '2026-10-19';
  it('Bắt đầu đặt bdtt', () => expect(startRange(mkThang(), today).bdtt).toBe(today));
  it('Kết thúc đặt kttt và điền bdtt nếu rỗng', () => {
    const r = endRange(mkTuan(), today);
    expect(r.kttt).toBe(today);
    expect(r.bdtt).toBe(today);
    expect(endRange(mkTuan({ bdtt: '2026-10-01' }), today).bdtt).toBe('2026-10-01');
  });
  it('Reset', () => expect(resetRange(mkThang({ bdtt: today, kttt: today }))).toEqual(mkThang()));
  it('đang chạy N ngày', () => {
    expect(runningDays({ bdtt: '2026-10-17', kttt: null }, today)).toBe(3);
    expect(runningDays({ bdtt: today, kttt: null }, today)).toBe(1);
    expect(runningDays({ bdtt: today, kttt: today }, today)).toBeNull();
    expect(runningDays({ bdtt: null, kttt: null }, today)).toBeNull();
  });
  it('khóa sửa trạng thái khi có việc con (X19)', () => {
    expect(canEditStatus(0)).toBe(true);
    expect(canEditStatus(2)).toBe(false);
  });
});

describe('Hoàn thành tất cả việc con (vuốt phải mobile)', () => {
  const data = {
    ...emptyData(),
    thang: [mkThang({ id: 't1', ma: 'M001' }), mkThang({ id: 't2', ma: 'M002' })],
    tuan: [mkTuan({ id: 'w1', parentMa: 'M001' }), mkTuan({ id: 'w2', ma: 'W002', parentMa: 'M001' }), mkTuan({ id: 'w3', ma: 'W003', parentMa: 'M002' })],
    ngay: [mkNgay({ id: 'd1', parentId: 'w1' }), mkNgay({ id: 'd2', ma: 'D002', parentId: 'w3' })]
  };
  it('tháng cha trở thành Hoàn thành, tháng khác không đổi', () => {
    const r = completeTree(data, 'thang', 't1');
    const d = derive(r, '2026-10-19');
    expect(d.thang.get('t1')!.raw).toBe('Hoàn thành');
    expect(d.thang.get('t2')!.raw).toBe('Chưa làm');
    expect(r.ngay.find((n) => n.id === 'd2')!.tt).toBe('Chưa làm');
  });
  it('tuần cha', () => {
    const r = completeTree(data, 'tuan', 'w1');
    expect(derive(r, '2026-10-19').tuan.get('w1')!.raw).toBe('Hoàn thành');
  });
});
