import { describe, it, expect } from 'vitest';
import { minutesBy, workMinutes } from '../src/core/stats.ts';
import { emptyData } from '../src/core/model.ts';
import type { Data, Ngay } from '../src/core/model.ts';

const N = (o: Partial<Ngay>): Ngay => ({ id: 'x', ma: 'D1', ngay: '2026-10-20', parentId: 'w', ten: '', personId: null, g1: null, g2: null, a1: null, a2: null, tt: 'Chưa làm', gc: '', ...o });

describe('workMinutes', () => {
  it('ưu tiên giờ thực tế', () => {
    expect(workMinutes(N({ g1: '08:00', g2: '09:00', a1: '2026-10-20T08:00:00', a2: '2026-10-20T10:30:00' }))).toEqual({ min: 150, actual: true });
  });
  it('chưa có thực tế thì lấy kế hoạch', () => {
    expect(workMinutes(N({ g1: '08:00', g2: '09:00' }))).toEqual({ min: 60, actual: false });
  });
  it('đang chạy (chưa kết thúc) thì lấy kế hoạch', () => {
    expect(workMinutes(N({ g1: '08:00', g2: '09:00', a1: '2026-10-20T08:00:00' })).min).toBe(60);
  });
  it('không có giờ nào → 0', () => {
    expect(workMinutes(N({})).min).toBe(0);
  });
});

describe('minutesBy', () => {
  const d: Data = {
    ...emptyData(),
    ngay: [
      N({ id: 'a', cat: 'c-dotxuat', place: 'pl-congtruong', g1: '08:00', g2: '10:00' }),
      N({ id: 'b', cat: 'c-dotxuat', g1: '10:00', g2: '11:00', personId: 'p1' }),
      N({ id: 'c', cat: 'c-chuyenmon', place: 'pl-congty', a1: '2026-10-20T13:00:00', a2: '2026-10-20T17:00:00' }),
      N({ id: 'd', g1: '08:00', g2: '08:30' }),
      N({ id: 'e', ngay: '2026-11-01', cat: 'c-dotxuat', g1: '08:00', g2: '12:00' }),
      N({ id: 'f', cat: 'c-hop' })
    ]
  };
  it('cộng theo phân loại trong khoảng ngày, sắp giảm dần, chưa phân loại để riêng', () => {
    const r = minutesBy(d, 'cats', '2026-10-01', '2026-10-31');
    expect(r.rows).toEqual([
      { id: 'c-chuyenmon', min: 240, count: 1 },
      { id: 'c-dotxuat', min: 180, count: 2 },
      { id: null, min: 30, count: 1 }
    ]);
    expect(r.total).toBe(450);
    expect(r.planOnly).toBe(210);
  });
  it('theo vị trí', () => {
    const r = minutesBy(d, 'places', '2026-10-01', '2026-10-31');
    expect(r.rows.map((x) => [x.id, x.min])).toEqual([['pl-congty', 240], ['pl-congtruong', 120], [null, 90]]);
  });
  it('lọc theo người', () => {
    expect(minutesBy(d, 'cats', '2026-10-01', '2026-10-31', 'p1').total).toBe(60);
  });
});
