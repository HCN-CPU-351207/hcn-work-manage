import { describe, it, expect } from 'vitest';
import { fold, searchAll, matchCommands, exactCommand, rowMatches } from '../src/core/search.ts';
import { isFilterEmpty } from '../src/core/search.ts';
import type { RowFacts } from '../src/core/search.ts';
import { emptyData } from '../src/core/model.ts';
import { mkNgay, mkThang, mkTuan } from './helpers.ts';

const data = {
  ...emptyData(),
  people: [{ id: 'p1', name: 'Nguyễn Văn An', color: '#fff', photo: null }],
  thang: [mkThang({ id: 't1', ma: 'M001', ten: 'Họp khách hàng', personId: 'p1' })],
  tuan: [mkTuan({ id: 'w1', ma: 'W002', ten: 'Báo cáo' })],
  ngay: [mkNgay({ id: 'd1', ma: 'D003', ten: 'Gửi email' })]
};

describe('tìm kiếm', () => {
  it('bỏ dấu', () => expect(fold('Đặng Họp')).toBe('dang hop'));
  it('theo mã không phân biệt hoa thường', () => {
    expect(searchAll(data, 'm001').map((h) => h.ma)).toEqual(['M001']);
    expect(searchAll(data, 'W002')[0].level).toBe('tuan');
  });
  it('theo tên không dấu', () => expect(searchAll(data, 'hop khach')[0].ma).toBe('M001'));
  it('theo người phụ trách', () => expect(searchAll(data, 'van an')[0].ma).toBe('M001'));
  it('rỗng → không có kết quả', () => expect(searchAll(data, '  ')).toEqual([]));
});

describe('lệnh /', () => {
  it('gõ "/" liệt kê tất cả', () => expect(matchCommands('/')).toHaveLength(11));
  it('khớp tiền tố tiếng Việt không dấu', () => {
    expect(matchCommands('/qua').map((c) => c.id)).toEqual(['overdue']);
    expect(matchCommands('/sap').map((c) => c.id)).toEqual(['duesoon']);
    expect(matchCommands('/cài đặt').map((c) => c.id)).toEqual(['settings']);
  });
  it('alias tiếng Anh', () => expect(exactCommand('/settings')!.id).toBe('settings'));
  it('không phải lệnh', () => expect(matchCommands('abc')).toEqual([]));
});

describe('bộ lọc', () => {
  const ctx = { today: '2026-10-19', currentPersonId: 'p1', dueDays: 3, level: 'thang' as const };
  const row = (o: Partial<RowFacts> = {}): RowFacts => ({
    ma: 'M001', ten: 'Việc', person: 'An', personId: 'p1', display: 'Đang làm', raw: 'Đang làm',
    start: '2026-10-01', end: '2026-10-21', ...o
  });
  it('trạng thái', () => {
    expect(rowMatches(row(), { status: 'Đang làm' }, ctx)).toBe(true);
    expect(rowMatches(row(), { status: 'Hoàn thành' }, ctx)).toBe(false);
  });
  it('người, kể cả Chưa gán', () => {
    expect(rowMatches(row(), { personId: 'p2' }, ctx)).toBe(false);
    expect(rowMatches(row({ personId: null }), { personId: '__none__' }, ctx)).toBe(true);
  });
  it('khoảng ngày giao nhau', () => {
    expect(rowMatches(row(), { from: '2026-10-21', to: '2026-10-30' }, ctx)).toBe(true);
    expect(rowMatches(row(), { from: '2026-10-22' }, ctx)).toBe(false);
    expect(rowMatches(row({ start: null, end: null }), { from: '2026-10-01' }, ctx)).toBe(false);
  });
  it('quick: hôm nay / quá hạn / sắp đến hạn / của tôi', () => {
    expect(rowMatches(row(), { quick: 'today' }, ctx)).toBe(true);
    expect(rowMatches(row({ end: '2026-10-10' }), { quick: 'today' }, ctx)).toBe(false);
    expect(rowMatches(row({ display: 'Quá hạn' }), { quick: 'overdue' }, ctx)).toBe(true);
    expect(rowMatches(row(), { quick: 'duesoon' }, ctx)).toBe(true); // dl 21/10 ≤ 22/10
    expect(rowMatches(row({ end: '2026-10-30' }), { quick: 'duesoon' }, ctx)).toBe(false);
    expect(rowMatches(row(), { quick: 'mine' }, ctx)).toBe(true);
    expect(rowMatches(row(), { quick: 'mine' }, { ...ctx, currentPersonId: null })).toBe(false);
  });
});

describe('isFilterEmpty', () => {
  it('rỗng / có điều kiện', () => {
    expect(isFilterEmpty({})).toBe(true);
    expect(isFilterEmpty(undefined)).toBe(true);
    expect(isFilterEmpty({ status: '' })).toBe(true);
    expect(isFilterEmpty({ quick: 'today' })).toBe(false);
  });
});
