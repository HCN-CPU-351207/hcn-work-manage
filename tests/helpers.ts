import type { Ngay, Thang, Tuan } from '../src/core/model.ts';

export const mkThang = (o: Partial<Thang> = {}): Thang => ({
  id: 't1', ma: 'M001', loai: 'Gấp-Quan trọng', ten: 'Tháng 1', personId: null,
  bd: null, dl: null, tt: 'Chưa làm', bdtt: null, kttt: null, gc: '', ...o
});
export const mkTuan = (o: Partial<Tuan> = {}): Tuan => ({
  id: 'w1', ma: 'W001', parentMa: 'M001', ten: 'Tuần 1', personId: null,
  bd: null, dl: null, tt: 'Chưa làm', bdtt: null, kttt: null, gc: '', ...o
});
export const mkNgay = (o: Partial<Ngay> = {}): Ngay => ({
  id: 'd1', ma: 'D001', ngay: '2026-10-19', parentId: 'w1', ten: 'Ngày 1', personId: null,
  g1: null, g2: null, a1: null, a2: null, tt: 'Chưa làm', gc: '', ...o
});
