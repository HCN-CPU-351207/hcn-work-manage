import { describe, it, expect } from 'vitest';
import {
  agg, over, progress, rawTuan, rawThang, pTuan, pThang, actualTuan, actualThang,
  derive, metrics, bellItems, isDueSoon, actualTone
} from '../src/core/status.ts';
import { emptyData } from '../src/core/model.ts';
import { mkNgay, mkThang, mkTuan } from './helpers.ts';

describe('agg', () => {
  it('rỗng → trả manual', () => expect(agg([], 'Đang làm')).toBe('Đang làm'));
  it('toàn Hoàn thành', () => expect(agg(['Hoàn thành', 'Hoàn thành'], 'Chưa làm')).toBe('Hoàn thành'));
  it('toàn Chưa làm', () => expect(agg(['Chưa làm', 'Chưa làm'], 'Hoàn thành')).toBe('Chưa làm'));
  it('hỗn hợp → Đang làm', () => expect(agg(['Hoàn thành', 'Chưa làm'], 'Chưa làm')).toBe('Đang làm'));
  it('toàn Đang làm', () => expect(agg(['Đang làm'], 'Chưa làm')).toBe('Đang làm'));
});

describe('rawTuan / rawThang', () => {
  it('không có việc con dùng tt của tuần', () => expect(rawTuan(mkTuan({ tt: 'Đang làm' }), [])).toBe('Đang làm'));
  it('có việc con thì bỏ qua tt thủ công', () =>
    expect(rawTuan(mkTuan({ tt: 'Hoàn thành' }), [mkNgay({ tt: 'Chưa làm' })])).toBe('Chưa làm'));
  it('chỉ tính ngày thuộc đúng tuần', () =>
    expect(rawTuan(mkTuan(), [mkNgay({ parentId: 'khac', tt: 'Hoàn thành' })])).toBe('Chưa làm'));
  it('tháng gộp từ rawTuan của tuần con', () => {
    const t1 = mkTuan({ id: 'w1' });
    const t2 = mkTuan({ id: 'w2', ma: 'W002' });
    const ngays = [mkNgay({ id: 'd1', parentId: 'w1', tt: 'Hoàn thành' }), mkNgay({ id: 'd2', parentId: 'w2', tt: 'Hoàn thành' })];
    expect(rawThang(mkThang(), [t1, t2], ngays)).toBe('Hoàn thành');
    ngays[1] = { ...ngays[1], tt: 'Chưa làm' };
    expect(rawThang(mkThang(), [t1, t2], ngays)).toBe('Đang làm');
  });
  it('tháng có tuần con nhưng tuần chưa có ngày: dùng tt tuần', () =>
    expect(rawThang(mkThang(), [mkTuan({ tt: 'Hoàn thành' })], [])).toBe('Hoàn thành'));
});

describe('over (quá hạn)', () => {
  it('chưa xong và dl < today → Quá hạn', () => expect(over('Đang làm', '2026-10-18', '2026-10-19')).toBe('Quá hạn'));
  it('dl = today chưa quá hạn', () => expect(over('Đang làm', '2026-10-19', '2026-10-19')).toBe('Đang làm'));
  it('Hoàn thành không bao giờ quá hạn', () => expect(over('Hoàn thành', '2020-01-01', '2026-10-19')).toBe('Hoàn thành'));
  it('không có dl', () => expect(over('Chưa làm', null, '2026-10-19')).toBe('Chưa làm'));
  it('Chưa làm vẫn có thể quá hạn', () => expect(over('Chưa làm', '2026-01-01', '2026-10-19')).toBe('Quá hạn'));
});

describe('progress', () => {
  it('rỗng và chưa xong → 0', () => expect(progress([], 'Đang làm')).toBe(0));
  it('rỗng và hoàn thành → 1', () => expect(progress([], 'Hoàn thành')).toBe(1));
  it('có con → tỉ lệ hoàn thành', () => expect(progress(['Hoàn thành', 'Chưa làm', 'Đang làm', 'Hoàn thành'], 'Đang làm')).toBe(0.5));
  it('toàn Chưa làm → 0', () => expect(progress(['Chưa làm', 'Chưa làm'], 'Chưa làm')).toBe(0));
  it('pTuan / pThang', () => {
    const t = mkTuan();
    expect(pTuan(t, [mkNgay({ tt: 'Hoàn thành' }), mkNgay({ id: 'd2', tt: 'Chưa làm' })])).toBe(0.5);
    const t2 = mkTuan({ id: 'w2', ma: 'W002', tt: 'Hoàn thành' });
    expect(pThang(mkThang(), [t, t2], [])).toBe(0.5);
  });
});

describe('ngày thực tế', () => {
  it('actualTuan: bdtt/kttt ghi đè', () =>
    expect(actualTuan(mkTuan({ bdtt: '2026-10-01', kttt: '2026-10-09' }), [mkNgay({ tt: 'Hoàn thành' })])).toEqual({
      start: '2026-10-01',
      end: '2026-10-09'
    }));
  it('actualTuan: tự tính từ ngày con', () => {
    const ngays = [
      mkNgay({ id: 'd1', ngay: '2026-10-20', tt: 'Hoàn thành' }),
      mkNgay({ id: 'd2', ngay: '2026-10-19', tt: 'Đang làm' }),
      mkNgay({ id: 'd3', ngay: '2026-10-18', tt: 'Chưa làm' })
    ];
    expect(actualTuan(mkTuan(), ngays)).toEqual({ start: '2026-10-19', end: null });
    const done = ngays.map((n) => ({ ...n, tt: 'Hoàn thành' as const }));
    expect(actualTuan(mkTuan(), done)).toEqual({ start: '2026-10-18', end: '2026-10-20' });
  });
  it('actualTuan: không có ngày con → null', () => expect(actualTuan(mkTuan(), [])).toEqual({ start: null, end: null }));
  it('actualThang: tự tính từ tuần con', () => {
    const t1 = mkTuan({ id: 'w1', bdtt: '2026-10-05', kttt: '2026-10-09' });
    const t2 = mkTuan({ id: 'w2', ma: 'W002', bdtt: '2026-10-12', kttt: '2026-10-16' });
    const ngays = [mkNgay({ id: 'd1', parentId: 'w1', tt: 'Hoàn thành' }), mkNgay({ id: 'd2', parentId: 'w2', tt: 'Hoàn thành' })];
    expect(actualThang(mkThang(), [t1, t2], ngays)).toEqual({ start: '2026-10-05', end: '2026-10-16' });
  });
  it('actualThang: chưa hoàn thành thì không có ngày kết thúc', () =>
    expect(actualThang(mkThang(), [mkTuan({ bdtt: '2026-10-05', kttt: '2026-10-09', tt: 'Đang làm' })], []).end).toBeNull());
  it('actualThang: ghi đè bởi bdtt/kttt của tháng', () =>
    expect(actualThang(mkThang({ bdtt: '2026-09-30', kttt: '2026-10-30' }), [], [])).toEqual({ start: '2026-09-30', end: '2026-10-30' }));
  it('màu dải thực tế', () => {
    expect(actualTone({ start: '2026-10-01', end: '2026-10-09' }, '2026-10-10', '2026-10-19')).toBe('ok');
    expect(actualTone({ start: '2026-10-01', end: '2026-10-12' }, '2026-10-10', '2026-10-19')).toBe('late');
    expect(actualTone({ start: '2026-10-01', end: null }, '2026-10-25', '2026-10-19')).toBe('doing');
    expect(actualTone({ start: '2026-10-01', end: null }, '2026-10-18', '2026-10-19')).toBe('late');
  });
});

describe('derive / metrics / bell', () => {
  const data = {
    ...emptyData(),
    thang: [
      mkThang({ id: 't1', ma: 'M001', dl: '2026-10-10' }),
      mkThang({ id: 't2', ma: 'M002', tt: 'Hoàn thành', dl: '2026-01-01' }),
      mkThang({ id: 't3', ma: 'M003', tt: 'Đang làm', dl: '2026-10-21' })
    ],
    tuan: [mkTuan({ id: 'w1', parentMa: 'M001', dl: '2026-10-20' })],
    ngay: [mkNgay({ parentId: 'w1', tt: 'Đang làm' })]
  };
  const d = derive(data, '2026-10-19');
  it('derive khớp các hàm gốc', () => {
    expect(d.thang.get('t1')!.display).toBe('Quá hạn');
    expect(d.thang.get('t1')!.raw).toBe(rawThang(data.thang[0], data.tuan, data.ngay));
    expect(d.tuan.get('w1')!.display).toBe('Đang làm');
    expect(d.tuan.get('w1')!.progress).toBe(0);
    expect(d.thang.get('t1')!.childCount).toBe(1);
  });
  it('metrics dùng displayThang', () => expect(metrics(data, d)).toEqual({ total: 3, doing: 1, overdue: 1, done: 1 }));
  it('bell: quá hạn + sắp đến hạn (≤3 ngày) trên Tháng và Tuần', () => {
    const items = bellItems(data, d, '2026-10-19', 3);
    expect(items.map((i) => `${i.ma}:${i.kind}`).sort()).toEqual(['M001:overdue', 'M003:soon', 'W001:soon']);
  });
  it('isDueSoon biên', () => {
    expect(isDueSoon('2026-10-22', 'Đang làm', '2026-10-19', 3)).toBe(true);
    expect(isDueSoon('2026-10-23', 'Đang làm', '2026-10-19', 3)).toBe(false);
    expect(isDueSoon('2026-10-18', 'Đang làm', '2026-10-19', 3)).toBe(false);
    expect(isDueSoon('2026-10-20', 'Hoàn thành', '2026-10-19', 3)).toBe(false);
  });
});
