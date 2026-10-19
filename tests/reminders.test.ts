import { describe, it, expect } from 'vitest';
import { computeReminders, dueReminders, localMs, mergeReminded, reminderNumId, shiftQuiet, upcomingReminders } from '../src/core/reminders.ts';
import { defaultSettings, emptyData } from '../src/core/model.ts';
import type { Data } from '../src/core/model.ts';
import { mergeData, initMeta, stampChanges } from '../src/core/sync.ts';
import { mkNgay, mkThang, mkTuan } from './helpers.ts';

const S = defaultSettings();
const data = (): Data => ({
  ...emptyData(),
  thang: [mkThang({ id: 't1', ma: 'M001', dl: '2026-10-22' }), mkThang({ id: 't2', ma: 'M002', dl: '2026-10-20', tt: 'Hoàn thành' }), mkThang({ id: 't3', ma: 'M003' })],
  tuan: [mkTuan({ id: 'w1', parentMa: 'M003', dl: '2026-10-19' })],
  ngay: [
    mkNgay({ id: 'd1', parentId: 'w1', ngay: '2026-10-19', g1: '09:00', g2: '10:00' }),
    mkNgay({ id: 'd2', ma: 'D002', parentId: 'w1', ngay: '2026-10-19', g1: '13:00', g2: '14:00', tt: 'Đang làm', a1: '2026-10-19T13:00:00' }),
    mkNgay({ id: 'd3', ma: 'D003', parentId: 'w1', ngay: '2026-10-19', g1: '15:00', g2: '16:00', tt: 'Hoàn thành' })
  ]
});
const NOW = localMs('2026-10-19', '06:00');
const keys = (l: { key: string }[]) => l.map((r) => r.key.split(':').slice(0, 3).join(':'));

describe('mốc nhắc việc', () => {
  const list = computeReminders(data(), S, NOW);
  it('Tháng/Tuần: trước hạn, đến hạn, trễ hạn; bỏ qua việc xong hoặc không có hạn', () => {
    const t1 = list.filter((r) => r.id === 't1');
    expect(t1.map((r) => r.kind)).toEqual(['soon', 'due', 'over']);
    expect(t1[0].at).toBe(localMs('2026-10-19', '08:00')); // 22 − 3 ngày, 8:00
    expect(t1[2].at).toBe(localMs('2026-10-23', '08:00'));
    expect(list.some((r) => r.id === 't2' || r.id === 't3')).toBe(false);
  });
  it('Ngày: nhắc trước giờ bắt đầu khi chưa làm; trễ giờ khi chưa xong', () => {
    expect(keys(list.filter((r) => r.level === 'ngay')).sort()).toEqual(['ngay:d1:late', 'ngay:d1:start', 'ngay:d2:late']);
    expect(list.find((r) => r.key.startsWith('ngay:d1:start'))!.at).toBe(localMs('2026-10-19', '08:50'));
  });
  it('tắt từng loại', () => {
    const l = computeReminders(data(), { ...S, notifySoon: false, notifyDayStart: false, notifyDayLate: false }, NOW);
    expect(l.map((r) => r.kind).sort()).toEqual(['due', 'due', 'over', 'over']);
    expect(computeReminders(data(), { ...S, notificationsEnabled: false }, NOW)).toEqual([]);
  });
  it('đổi hạn → khóa đổi (báo lại theo hạn mới)', () => {
    const d = data();
    d.thang[0] = { ...d.thang[0], dl: '2026-10-25' };
    expect(computeReminders(d, S, NOW).find((r) => r.id === 't1' && r.kind === 'due')!.key).toBe('thang:t1:due:2026-10-25');
  });
  it('giờ yên lặng', () => {
    expect(shiftQuiet(localMs('2026-10-19', '23:30'), '22:00', '07:00')).toBe(localMs('2026-10-20', '07:00'));
    expect(shiftQuiet(localMs('2026-10-19', '05:00'), '22:00', '07:00')).toBe(localMs('2026-10-19', '07:00'));
    expect(shiftQuiet(localMs('2026-10-19', '12:00'), '22:00', '07:00')).toBe(localMs('2026-10-19', '12:00'));
    expect(shiftQuiet(localMs('2026-10-19', '13:00'), '12:00', '14:00')).toBe(localMs('2026-10-19', '14:00'));
    const late = computeReminders({ ...emptyData(), thang: [mkThang({ id: 'x', parentMa: '' } as never)], tuan: [], ngay: [] }, { ...S, notifyMorning: '23:00' }, NOW);
    expect(late).toEqual([]); // không có hạn
  });
  it('đã tới và chưa báo / sắp tới', () => {
    const at = localMs('2026-10-19', '09:05');
    const due = dueReminders(list, at, { [list.find((r) => r.key.startsWith('ngay:d1:start'))!.key]: 1 });
    expect(keys(due).sort()).toEqual(['thang:t1:soon', 'tuan:w1:due']);
    expect(upcomingReminders(list, at)[0].at).toBeGreaterThan(at);
    expect(dueReminders(list, localMs('2026-10-25', '09:00'), {}).every((r) => r.at > localMs('2026-10-24', '09:00'))).toBe(true);
  });
  it('id số ổn định', () => {
    expect(reminderNumId('a')).toBe(reminderNumId('a'));
    expect(reminderNumId('a')).not.toBe(reminderNumId('b'));
    expect(reminderNumId('x')).toBeGreaterThan(0);
  });
});

describe('đã báo được đồng bộ giữa hai máy', () => {
  it('gộp hợp nhất, bỏ khóa quá 60 ngày', () => {
    const now = 100 * 24 * 3600_000;
    expect(mergeReminded({ a: now - 10, old: 1 }, { b: now - 5, a: now - 2 }, now)).toEqual({ a: now - 2, b: now - 5 });
  });
  it('mergeData mang theo đã báo', () => {
    const a = data();
    const b = { ...data(), reminded: { 'thang:t1:due:2026-10-22': 1000 } };
    const r = mergeData(a, initMeta(a), b, stampChanges(a, b, initMeta(a), 5), 2000);
    expect(r.data.reminded).toEqual({ 'thang:t1:due:2026-10-22': 1000 });
  });
});
