import { describe, it, expect } from 'vitest';
import { ngayInsights } from '../src/core/insights.ts';
import { weekBuckets } from '../src/core/periodStats.ts';
import { mkNgay } from './helpers.ts';

describe('chỉ số phụ của nhóm CV Ngày', () => {
  it('phân bổ, người, độ chính xác, cần chú ý, theo ngày', () => {
    const T = (d: string, hm: string) => `2026-10-${d}T${hm}:00`;
    const list = [
      mkNgay({ id: '1', ma: 'D1', ngay: '2026-10-19', g1: '08:00', g2: '10:00', a1: T('19', '08:00'), a2: T('19', '10:30'), tt: 'Hoàn thành', cat: 'c1', personId: 'p1' }),
      mkNgay({ id: '2', ma: 'D2', ngay: '2026-10-20', g1: '08:00', g2: '09:00', a1: T('20', '08:00'), a2: T('20', '08:40'), tt: 'Hoàn thành', cat: 'c2', personId: 'p1' }),
      mkNgay({ id: '3', ma: 'D3', ngay: '2026-10-21', g1: '08:00', g2: '09:00', tt: 'Chưa làm', cat: 'c1', personId: 'p2' }), // trễ bắt đầu
      mkNgay({ id: '4', ma: 'D4', ngay: '2026-10-21', g1: '09:00', g2: '10:00', a1: T('21', '09:00'), tt: 'Đang làm', personId: 'p2' }), // quá giờ
      mkNgay({ id: '5', ma: 'D5', ngay: '2026-10-21', tt: 'Chưa làm' }), // chưa xếp giờ
      mkNgay({ id: '6', ma: 'D6', ngay: '2026-10-22', g1: '08:00', g2: '09:00', tt: 'Chưa làm', huy: { at: T('20', '07:00') } })
    ];
    const r = ngayInsights(list, { today: '2026-10-21', nowHm: '11:00', conflicts: new Set(['3']), buckets: weekBuckets('2026-10-21', String) });
    expect(r.total).toBe(5);
    expect([r.done, r.running, r.unscheduled, r.lateStart, r.overrun, r.conflicts]).toEqual([2, 1, 1, 1, 1, 1]);
    expect(r.byCat[0]).toEqual({ id: 'c1', min: 150 + 60 });
    expect(r.people[0]).toEqual({ id: 'p1', total: 2, done: 2, min: 190 });
    expect([r.accuracy.measured, r.accuracy.ontime, r.accuracy.avgDev]).toEqual([2, 1, 5]);
    expect(r.accuracy.top.map((x) => x.diff)).toEqual([30, -20]);
    expect(r.perBucket.slice(0, 4).map((b) => `${b.done}/${b.total}`)).toEqual(['1/1', '1/1', '0/3', '0/0']);
    expect(r.perBucket[2].current).toBe(true);
  });
});
