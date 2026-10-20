import { describe, it, expect } from 'vitest';
import { projectStats, doneDay } from '../src/core/projectStats.ts';
import { derive } from '../src/core/status.ts';
import { emptyData } from '../src/core/model.ts';
import type { Data } from '../src/core/model.ts';
import { mkNgay, mkThang, mkTuan } from './helpers.ts';

const TODAY = '2026-10-20';
const data = (): Data => ({
  ...emptyData(),
  thang: [mkThang({ id: 't1', ma: 'M001', bd: '2026-10-06', dl: '2026-10-31' })],
  tuan: [
    mkTuan({ id: 'w1', ma: 'W001', parentMa: 'M001', bd: '2026-10-06', dl: '2026-10-12', tt: 'Hoàn thành' }),
    mkTuan({ id: 'w2', ma: 'W002', parentMa: 'M001', bd: '2026-10-13', dl: '2026-10-24' }),
    mkTuan({ id: 'w3', ma: 'W003', parentMa: 'M001', bd: '2026-10-13', dl: '2026-10-18' }),
    mkTuan({ id: 'w4', ma: 'W004', parentMa: 'M001', bd: '2026-10-25', dl: '2026-10-31' })
  ],
  ngay: [
    mkNgay({ id: 'd1', ma: 'D001', parentId: 'w1', ngay: '2026-10-07', g1: '08:00', g2: '10:00', a1: '2026-10-07T08:00:00', a2: '2026-10-07T11:00:00', tt: 'Hoàn thành', cat: 'c-chuyenmon', place: 'pl-congty' }),
    mkNgay({ id: 'd2', ma: 'D002', parentId: 'w1', ngay: '2026-10-08', g1: '08:00', g2: '09:00', a1: '2026-10-08T08:00:00', a2: '2026-10-08T08:40:00', tt: 'Hoàn thành', cat: 'c-hop' }),
    mkNgay({ id: 'd3', ma: 'D003', parentId: 'w2', ngay: '2026-10-14', g1: '13:00', g2: '15:00', a1: '2026-10-14T13:00:00', tt: 'Đang làm' }),
    mkNgay({ id: 'd4', ma: 'D004', parentId: 'w2', ngay: '2026-10-16', g1: '08:00', g2: '12:00', tt: 'Chưa làm' }),
    mkNgay({ id: 'd5', ma: 'D005', parentId: 'w2', ngay: '2026-10-21', g1: '08:00', g2: '15:00', tt: 'Chưa làm' }),
    mkNgay({ id: 'd6', ma: 'D006', parentId: 'w3', ngay: '2026-10-20', g1: '15:00', g2: '16:00', tt: 'Chưa làm' })
  ]
});

describe('projectStats – CV Tháng', () => {
  const d = data();
  const s = projectStats(d, derive(d, TODAY), 'thang', 't1', TODAY)!;
  it('tiến độ, thời gian đã trôi, ngày còn lại', () => {
    expect(s.childTotal).toBe(4);
    expect(s.childDone).toBe(1);
    expect(s.progress).toBe(0.25);
    expect(s.totalDays).toBe(26);
    expect(s.elapsedDays).toBe(15);
    expect(s.daysLeft).toBe(11);
  });
  it('kết luận: chậm so với kế hoạch, cần thêm việc', () => {
    expect(s.verdict.kind).toBe('behind');
    if (s.verdict.kind === 'behind') {
      expect(s.verdict.pct).toBe(Math.round((15 / 26 - 0.25) * 100));
      expect(s.verdict.need).toBe(2);
    }
  });
  it('đếm việc con theo trạng thái (tuần quá hạn tính riêng)', () => {
    expect(s.counts).toEqual({ todo: 1, doing: 1, overdue: 1, done: 1, cancel: 0 });
  });
  it('đường cộng dồn: kế hoạch theo ngày xếp lịch, thực tế theo ngày xong, tương lai để trống', () => {
    const at = (day: string) => s.burn.find((p) => p.day === day)!;
    expect(s.burn[0].day).toBe('2026-10-06');
    expect(s.burn[s.burn.length - 1].day).toBe('2026-10-31');
    expect(at('2026-10-08')).toEqual({ day: '2026-10-08', actual: 2, plan: 2 });
    expect(at('2026-10-20').plan).toBe(5);
    expect(at('2026-10-20').actual).toBe(2);
    expect(at('2026-10-21').actual).toBe(null);
    expect(s.burnTotal).toBe(6);
  });
  it('giờ theo tuần: kế hoạch và thực tế (chỉ tính việc đã kết thúc)', () => {
    const w41 = s.buckets.find((b) => b.label === 'W41')!;
    expect(w41.plan).toBe(180);
    expect(w41.actual).toBe(220);
    const w43 = s.buckets.find((b) => b.label === 'W43')!;
    expect(w43.current).toBe(true);
    expect(w43.plan).toBe(420 + 60);
    expect(s.buckets.map((b) => b.label)).toEqual(['W41', 'W42', 'W43', 'W44']);
  });
  it('phân bổ theo phân loại (chưa phân loại để riêng)', () => {
    expect(s.byCat[0]).toEqual({ id: null, min: 120 + 240 + 420 + 60 });
    expect(s.byCat.find((x) => x.id === 'c-chuyenmon')!.min).toBe(180);
  });
  it('độ chính xác: đúng giờ và lệch nhiều nhất', () => {
    expect(s.accuracy.doneCount).toBe(2);
    expect(s.accuracy.measured).toBe(2);
    expect(s.accuracy.onTime).toBe(1);
    expect(s.accuracy.planMin).toBe(180);
    expect(s.accuracy.actualMin).toBe(220);
    expect(s.accuracy.top.map((x) => [x.ma, x.diff])).toEqual([['D001', 60], ['D002', -20]]);
  });
  it('sắp tới: tuần trễ, ngày bỏ lỡ, hôm nay, ngày mai', () => {
    expect(s.upcoming.map((u) => [u.kind, u.ma])).toEqual([
      ['late', 'W003'],
      ['missed', 'D003'],
      ['missed', 'D004'],
      ['today', 'D006'],
      ['tomorrow', 'D005']
    ]);
  });
});

describe('projectStats – các trường hợp biên', () => {
  it('CV Tuần: giờ chia theo ngày, việc con là CV Ngày', () => {
    const d = data();
    const s = projectStats(d, derive(d, TODAY), 'tuan', 'w2', TODAY)!;
    expect(s.children.map((c) => c.ma)).toEqual(['D003', 'D004', 'D005']);
    expect(s.buckets[0].label).toBe('13/10');
    expect(s.buckets).toHaveLength(12);
    expect(s.counts.overdue).toBe(2); // ngày đã qua mà chưa xong
  });
  it('không có ngày kế hoạch và không có việc con → nodates, không vẽ đường', () => {
    const d: Data = { ...emptyData(), thang: [mkThang({ id: 't9', ma: 'M009' })] };
    const s = projectStats(d, derive(d, TODAY), 'thang', 't9', TODAY)!;
    expect(s.verdict.kind).toBe('nodates');
    expect(s.elapsed).toBe(null);
    expect(s.burn).toEqual([]);
    expect(s.buckets).toEqual([]);
  });
  it('quá hạn chưa xong → late; đã xong trễ → done kèm số ngày trễ', () => {
    const d: Data = { ...emptyData(), thang: [mkThang({ id: 'a', ma: 'M1', bd: '2026-10-01', dl: '2026-10-10' }), mkThang({ id: 'b', ma: 'M2', bd: '2026-10-01', dl: '2026-10-10', tt: 'Hoàn thành', kttt: '2026-10-13' })] };
    const dv = derive(d, TODAY);
    expect(projectStats(d, dv, 'thang', 'a', TODAY)!.verdict).toEqual({ kind: 'late', days: 10 });
    expect(projectStats(d, dv, 'thang', 'b', TODAY)!.verdict).toEqual({ kind: 'done', lateDays: 3 });
  });
  it('vượt tiến độ → ahead', () => {
    const d: Data = {
      ...emptyData(),
      thang: [mkThang({ id: 't', ma: 'M1', bd: '2026-10-15', dl: '2026-11-15' })],
      tuan: [mkTuan({ id: 'w', ma: 'W1', parentMa: 'M1', tt: 'Hoàn thành' }), mkTuan({ id: 'w2', ma: 'W2', parentMa: 'M1' })]
    };
    const s = projectStats(d, derive(d, TODAY), 'thang', 't', TODAY)!;
    expect(s.verdict.kind).toBe('ahead');
  });
  it('id không tồn tại → null', () => {
    const d = data();
    expect(projectStats(d, derive(d, TODAY), 'thang', 'x', TODAY)).toBe(null);
  });
  it('doneDay: lấy ngày kết thúc thực tế, thiếu thì ngày làm', () => {
    expect(doneDay(mkNgay({ tt: 'Hoàn thành', ngay: '2026-10-01', a2: '2026-10-02T01:00:00' }))).toBe('2026-10-02');
    expect(doneDay(mkNgay({ tt: 'Hoàn thành', ngay: '2026-10-01' }))).toBe('2026-10-01');
    expect(doneDay(mkNgay({ tt: 'Đang làm' }))).toBe(null);
  });
});
