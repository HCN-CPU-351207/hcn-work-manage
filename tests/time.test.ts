import { describe, it, expect } from 'vitest';
import {
  assignLanes, conflictIds, diffLabel, diffMinutes, diffTone, formatClock, hmToMin, minToHm,
  overlaps, plannedMinutes, actualMinutes, isScheduled
} from '../src/core/time.ts';
import { isoMs, addDays, diffDays, isoWeek, weekdayMon0, daysInMonth, shiftMonth, startOfWeek, weekDays } from '../src/core/dates.ts';
import { mkNgay } from './helpers.ts';

describe('giờ phút', () => {
  it('hm ↔ phút', () => {
    expect(hmToMin('08:30')).toBe(510);
    expect(minToHm(510)).toBe('08:30');
  });
  it('plannedMinutes', () => {
    expect(plannedMinutes({ g1: '08:00', g2: '09:30' })).toBe(90);
    expect(plannedMinutes({ g1: '08:00', g2: null })).toBeNull();
    expect(plannedMinutes({ g1: '09:00', g2: '08:00' })).toBeNull();
    expect(isScheduled({ g1: '09:00', g2: '09:00' })).toBe(false);
  });
  it('actualMinutes: hoàn thành và đang chạy', () => {
    expect(actualMinutes({ a1: '2026-10-19T08:00:00', a2: '2026-10-19T09:15:00' })).toBe(75);
    expect(actualMinutes({ a1: '2026-10-19T08:00:00', a2: null })).toBeNull();
    expect(actualMinutes({ a1: '2026-10-19T08:00:00', a2: null }, isoMs('2026-10-19T08:30:00'))).toBe(30);
    expect(actualMinutes({ a1: null, a2: null })).toBeNull();
  });
  it('diff, nhãn và màu', () => {
    expect(diffMinutes(75, 60)).toBe(15);
    expect(diffMinutes(null, 60)).toBeNull();
    expect(diffLabel(15)).toBe('+15p');
    expect(diffLabel(-5)).toBe('−5p');
    expect(diffTone(15)).toBe('bad');
    expect(diffTone(-5)).toBe('good');
    expect(diffTone(0)).toBe('zero');
  });
  it('đồng hồ hh:mm:ss', () => {
    expect(formatClock(0)).toBe('00:00:00');
    expect(formatClock(3725)).toBe('01:02:05');
  });
});

describe('trùng giờ', () => {
  const A = mkNgay({ id: 'a', g1: '08:00', g2: '09:00' });
  const B = mkNgay({ id: 'b', g1: '08:30', g2: '10:00' });
  const C = mkNgay({ id: 'c', g1: '09:00', g2: '10:00' });
  const D = mkNgay({ id: 'd', g1: '08:30', g2: '10:00', ngay: '2026-10-20' });
  it('giao nhau thì trùng', () => expect(overlaps(A, B)).toBe(true));
  it('chạm đầu mút [g1,g2) không trùng', () => expect(overlaps(A, C)).toBe(false));
  it('khác ngày không trùng', () => expect(overlaps(B, D)).toBe(false));
  it('chưa xếp giờ không trùng', () => expect(overlaps(A, mkNgay({ g1: null, g2: null }))).toBe(false));
  it('conflictIds', () => expect([...conflictIds([A, B, C, D])].sort()).toEqual(['a', 'b', 'c']));
  it('assignLanes: việc trùng ở làn khác nhau', () => {
    const { lanes, count } = assignLanes([
      { id: 'a', start: 480, end: 540 },
      { id: 'b', start: 510, end: 600 },
      { id: 'c', start: 540, end: 600 }
    ]);
    expect(count).toBe(2);
    expect(lanes.get('a')).toBe(0);
    expect(lanes.get('b')).toBe(1);
    expect(lanes.get('c')).toBe(0); // dùng lại làn 0 vì a đã kết thúc lúc 09:00
  });
  it('assignLanes: không việc nào → 0 làn', () => expect(assignLanes([]).count).toBe(0));
});

describe('ngày', () => {
  it('addDays / diffDays qua tháng và năm', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(diffDays('2026-10-01', '2026-10-19')).toBe(18);
  });
  it('thứ và tuần ISO', () => {
    expect(weekdayMon0('2026-10-19')).toBe(0); // Thứ Hai
    expect(weekdayMon0('2026-10-25')).toBe(6);
    expect(isoWeek('2026-01-01')).toBe(1);
    expect(isoWeek('2026-12-31')).toBe(53);
    expect(isoWeek('2026-10-19')).toBe(43);
    expect(isoWeek('2027-01-01')).toBe(53); // thuộc tuần 53 của 2026
    expect(isoWeek('2025-12-29')).toBe(1); // thuộc tuần 1 của 2026
    expect(startOfWeek('2026-10-21')).toBe('2026-10-19');
    expect(weekDays('2026-10-25')).toEqual(['2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24', '2026-10-25']);
  });
  it('tháng', () => {
    expect(daysInMonth('2028-02')).toBe(29);
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
  });
});
