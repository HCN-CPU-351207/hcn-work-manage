import { describe, it, expect } from 'vitest';
import { doneIn, monthBuckets, periodOverview, weekBuckets } from '../src/core/periodStats.ts';
import type { PItem } from '../src/core/periodStats.ts';
import { mkNgay } from './helpers.ts';

const P = (id: string, bd: string | null, dl: string | null, display: PItem['display'], actualEnd: string | null = null): PItem => ({ id, bd, dl, display, actualEnd });

describe('tổng quan tuần / tháng', () => {
  it('khung tuần 7 ngày, khung tháng theo tuần ISO cắt biên tháng', () => {
    const w = weekBuckets('2026-10-21', (i) => `d${i}`);
    expect(w.map((b) => b.from)).toEqual(['2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24', '2026-10-25']);
    const m = monthBuckets('2026-10', (n) => `W${n}`);
    expect(m[0]).toEqual({ key: '2026-09-28', from: '2026-10-01', to: '2026-10-04', label: 'W40' });
    expect(m[m.length - 1].to).toBe('2026-10-31');
    expect(m.length).toBe(5);
  });
  it('đếm trạng thái, đúng hạn, sắp đến hạn, giờ theo ngày', () => {
    const items = [
      P('a', '2026-10-19', '2026-10-21', 'Hoàn thành', '2026-10-20'),
      P('b', '2026-10-15', '2026-10-20', 'Hoàn thành', '2026-10-22'),
      P('c', '2026-10-20', '2026-10-23', 'Đang làm'),
      P('d', '2026-10-10', '2026-10-18', 'Quá hạn'), // ngoài tuần
      P('e', null, null, 'Chưa làm'), // không có ngày: bỏ
      P('f', '2026-10-25', '2026-10-30', 'Đã hủy')
    ];
    const ngays = [
      mkNgay({ id: '1', ngay: '2026-10-19', g1: '08:00', g2: '10:00', a1: '2026-10-19T08:00:00', a2: '2026-10-19T09:30:00' }),
      mkNgay({ id: '2', ngay: '2026-10-21', g1: '13:00', g2: '14:00', a1: '2026-10-21T13:00:00' }), // đang chạy
      mkNgay({ id: '3', ngay: '2026-10-26', g1: '08:00', g2: '09:00' }), // tuần sau
      mkNgay({ id: '4', ngay: '2026-10-20', g1: '08:00', g2: '09:00', huy: { at: '2026-10-20T07:00:00' } })
    ];
    const o = periodOverview(items, ngays, weekBuckets('2026-10-21', String), '2026-10-21', Date.parse('2026-10-21T13:40:00'));
    expect(o.total).toBe(4);
    expect(o.counts).toEqual({ done: 2, doing: 1, over: 0, todo: 0, cancel: 1 });
    expect(o.onTime).toEqual({ measured: 2, ontime: 1 });
    expect(o.dueSoon).toBe(1);
    expect(o.planMin).toBe(180);
    expect(o.actualMin).toBe(130);
    expect(o.buckets[2]).toEqual({ key: '2026-10-21', label: '2', plan: 60, actual: 40, current: true });
    expect(doneIn(items, '2026-10-01', '2026-10-31')).toEqual({ done: 2, total: 4 });
  });
});

import { inPeriod, periodRange } from '../src/core/periodStats.ts';
describe('lọc bảng theo kỳ', () => {
  it('khoảng kỳ và việc thuộc kỳ', () => {
    expect(periodRange('thang', '2026-02', '2026-10-21', '2026-10-21')).toEqual({ from: '2026-02-01', to: '2026-02-28' });
    expect(periodRange('tuan', '2026-10', '2026-10-21', '2026-10-21')).toEqual({ from: '2026-10-19', to: '2026-10-25' });
    expect(periodRange('ngay', '2026-10', '2026-10-21', '2026-10-20')).toEqual({ from: '2026-10-20', to: '2026-10-20' });
    expect(inPeriod({ ngay: '2026-10-20' }, '2026-10-20', '2026-10-20')).toBe(true);
    expect(inPeriod({ ngay: '2026-10-21' }, '2026-10-20', '2026-10-20')).toBe(false);
    expect(inPeriod({ bd: '2026-09-25', dl: '2026-10-02' }, '2026-10-01', '2026-10-31')).toBe(true);
    expect(inPeriod({ bd: '2026-09-01', dl: '2026-09-30' }, '2026-10-01', '2026-10-31')).toBe(false);
    expect(inPeriod({ bd: null, dl: '2026-10-15' }, '2026-10-01', '2026-10-31')).toBe(true);
    expect(inPeriod({ bd: null, dl: null }, '2026-10-01', '2026-10-31')).toBe(true);
  });
});
