import { describe, it, expect } from 'vitest';
import { parseImport, MigrationError } from '../src/core/migrate.ts';
import { toBackup, emptyData } from '../src/core/model.ts';
import { mkThang } from './helpers.ts';

const legacy = (): Record<string, unknown[]> => ({
  thang: [
    { id: 't1', ma: 'M001', loai: 'Gấp-Quan trọng', ten: 'Dự án A', nguoi: 'Nguyễn A', bd: '2026-09-01', dl: '2026-09-30', tt: 'Đang làm', bdtt: '2026-09-02', kttt: null, gc: 'ghi chú' },
    { id: 't2', ma: 'M002', loai: 'Không gấp-Không quan trọng', ten: 'Dự án B', nguoi: 'nguyễn a', bd: '2026-09-05', dl: '2026-10-05', tt: 'Chưa làm', gc: '' }
  ],
  tuan: [{ id: 'w1', ma: 'M001', ten: 'Tuần 1', nguoi: 'Trần B', bd: '2026-09-01', dl: '2026-09-07', tt: 'Đang làm', gc: '' }],
  ngay: [
    { id: 'd1', tuan: 'w1', ngay: '2026-09-03', ten: 'Việc 1', g1: '08:00', g2: '09:00', a1: '08:32', a2: '09:10', tt: 'Hoàn thành', gc: '' },
    { id: 'd2', tuan: 'w1', ngay: '2026-09-04', ten: 'Việc 2', nguoi: 'Lê C', g1: null, g2: null, a1: null, a2: null, tt: 'Chưa làm', gc: '' }
  ],
  thuchi: [{ id: 'x', so: 100 }],
  cpcd: [{ id: 'y' }],
  vay: [{ id: 'z' }]
});

describe('migration từ file backup cũ (mục 7)', () => {
  const r = parseImport(legacy());
  it('nhận diện bản cũ và bỏ qua thuchi/cpcd/vay', () => {
    expect(r.legacy).toBe(true);
    expect(r.dropped.sort()).toEqual(['cpcd', 'thuchi', 'vay']);
    const json = JSON.stringify(r.data);
    expect(json.includes('thuchi')).toBe(false);
    expect(json.includes('cpcd')).toBe(false);
    expect(json.includes('"vay"')).toBe(false);
    expect(Object.keys(r.data).sort()).toEqual(['counters', 'ngay', 'people', 'schemaVersion', 'thang', 'tuan']);
  });
  it('nguoi (chữ) ghép đúng người, không phân biệt hoa thường', () => {
    expect(r.data.people.map((p) => p.name)).toEqual(['Nguyễn A', 'Trần B', 'Lê C']);
    const idA = r.data.people[0].id;
    expect(r.data.thang[0].personId).toBe(idA);
    expect(r.data.thang[1].personId).toBe(idA);
    expect(r.data.people.every((p) => p.color.startsWith('#'))).toBe(true);
  });
  it('tuần: mã cũ là mã tháng cha → parentMa, sinh W###', () => {
    expect(r.data.tuan[0].parentMa).toBe('M001');
    expect(r.data.tuan[0].ma).toBe('W001');
  });
  it('ngày: tuan → parentId, sinh D###', () => expect(r.data.ngay.map((n) => [n.ma, n.parentId])).toEqual([['D001', 'w1'], ['D002', 'w1']]));
  it('a1/a2 HH:MM ghép đúng ngày thành ISO', () => {
    expect(r.data.ngay[0].a1).toBe('2026-09-03T08:32:00');
    expect(r.data.ngay[0].a2).toBe('2026-09-03T09:10:00');
    expect(r.data.ngay[1].a1).toBeNull();
  });
  it('ngày không có người lấy người của tuần cha', () => {
    expect(r.data.ngay[0].personId).toBe(r.data.people.find((p) => p.name === 'Trần B')!.id);
    expect(r.data.ngay[1].personId).toBe(r.data.people.find((p) => p.name === 'Lê C')!.id);
  });
  it('bộ đếm theo mã lớn nhất', () => expect(r.data.counters).toEqual({ M: 2, W: 1, D: 2 }));
  it('tóm tắt để xem trước', () => expect(r.summary).toEqual({ thang: 2, tuan: 1, ngay: 2, people: 3 }));
  it('bản cũ bọc trong "data" cũng đọc được', () => expect(parseImport({ data: legacy() }).summary.thang).toBe(2));
  it('mã tháng thiếu thì sinh tiếp, không trùng mã có sẵn', () => {
    const l = legacy();
    l.thang.push({ id: 't3', ten: 'Không mã', tt: 'Chưa làm' });
    expect(parseImport(l).data.thang[2].ma).toBe('M003');
  });
  it('giá trị lạ được chuẩn hóa', () => {
    const l = legacy();
    const t0 = l.thang[0] as Record<string, unknown>;
    t0.tt = 'Quá hạn';
    t0.loai = 'abc';
    t0.bd = '01/09/2026';
    const t = parseImport(l).data.thang[0];
    expect(t.tt).toBe('Chưa làm');
    expect(t.loai).toBe('Không gấp-Quan trọng');
    expect(t.bd).toBeNull();
  });
});

describe('file mới (HCN)', () => {
  it('backup 9.3 đọc lại đúng', () => {
    const d = { ...emptyData(), thang: [mkThang()] };
    const r = parseImport(JSON.parse(JSON.stringify(toBackup(d, '2026-10-19T00:00:00Z'))));
    expect(r.legacy).toBe(false);
    expect(r.migratedFrom).toBeNull();
    expect(r.data.thang[0].ma).toBe('M001');
    expect(r.data.counters).toEqual({ M: 1, W: 0, D: 0 });
  });
  it('data.json (schemaVersion ở gốc) đọc được', () => expect(parseImport({ ...emptyData(), thang: [mkThang()] }).summary.thang).toBe(1));
  it('personId trỏ tới người không tồn tại → Chưa gán', () =>
    expect(parseImport({ ...emptyData(), thang: [mkThang({ personId: 'p_mat' })] }).data.thang[0].personId).toBeNull());
  it('file mới có thuchi vẫn bị bỏ', () => {
    const r = parseImport({ ...emptyData(), thuchi: [1] });
    expect(r.dropped).toEqual(['thuchi']);
    expect('thuchi' in r.data).toBe(false);
  });
  it('không có khóa thang → File không hợp lệ', () => {
    for (const bad of [{}, { people: [] }, [], null, 'x', 5]) {
      let code = '';
      try {
        parseImport(bad);
      } catch (e) {
        code = e instanceof MigrationError ? e.code : 'other';
      }
      expect(code).toBe('INVALID_FILE');
    }
  });
  it('schema mới hơn → từ chối, không tự hạ phiên bản', () => {
    let code = '';
    try {
      parseImport({ ...emptyData(), schemaVersion: 99 });
    } catch (e) {
      code = (e as MigrationError).code;
    }
    expect(code).toBe('FUTURE_SCHEMA');
  });
});
