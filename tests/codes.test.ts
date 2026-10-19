import { describe, it, expect } from 'vitest';
import { formatCode, parseCodeNum, nextCode, syncCounters, maxNum } from '../src/core/codes.ts';
import { emptyData } from '../src/core/model.ts';
import type { Data } from '../src/core/model.ts';
import { removeItems } from '../src/core/ops.ts';
import { mkNgay, mkThang, mkTuan } from './helpers.ts';

describe('sinh mã M/W/D', () => {
  it('định dạng 3 chữ số', () => {
    expect(formatCode('M', 1)).toBe('M001');
    expect(formatCode('D', 1234)).toBe('D1234');
  });
  it('parse không phân biệt hoa thường', () => {
    expect(parseCodeNum('m007', 'M')).toBe(7);
    expect(parseCodeNum('W007', 'M')).toBeNull();
    expect(parseCodeNum('Mabc', 'M')).toBeNull();
  });
  it('dữ liệu rỗng bắt đầu từ 001', () => expect(nextCode('M', emptyData()).code).toBe('M001'));
  it('tăng dần, không trùng', () => {
    let d: Data = emptyData();
    const seen = new Set<string>();
    for (let i = 0; i < 25; i++) {
      const { code, counters } = nextCode('W', d);
      expect(seen.has(code)).toBe(false);
      seen.add(code);
      d = { ...d, tuan: [...d.tuan, mkTuan({ id: `w${i}`, ma: code })], counters };
    }
    expect(maxNum('W', d.tuan.map((t) => t.ma))).toBe(25);
  });
  it('không tái sử dụng mã đã xóa (kể cả mã lớn nhất)', () => {
    let d: Data = { ...emptyData(), thang: [mkThang({ id: 'a', ma: 'M001' }), mkThang({ id: 'b', ma: 'M002' }), mkThang({ id: 'c', ma: 'M003' })] };
    d = { ...d, counters: syncCounters(d) };
    d = removeItems(d, 'thang', ['c']).data; // xóa M003
    expect(nextCode('M', d).code).toBe('M004');
  });
  it('bộ đếm lấy max(đã lưu, mã đang có)', () => {
    const d = { ...emptyData(), counters: { M: 2, W: 9, D: 0 }, thang: [mkThang({ ma: 'M005' })], ngay: [mkNgay({ ma: 'D010' })] };
    expect(syncCounters(d)).toEqual({ M: 5, W: 9, D: 10 });
  });
  it('mỗi tiền tố đếm riêng', () => {
    const d = { ...emptyData(), thang: [mkThang({ ma: 'M003' })] };
    expect(nextCode('W', d).code).toBe('W001');
    expect(nextCode('D', d).code).toBe('D001');
  });
});
