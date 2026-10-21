import { describe, it, expect } from 'vitest';
import { addCheck, addChecks, applyTemplate, ckProgress, deleteTemplate, editCheck, moveCheck, removeCheck, saveTemplate, toggleCheck, updateTemplate } from '../src/core/checklist.ts';
import { dayOverview, ngayStats, periodDone } from '../src/core/dayStats.ts';
import { normalizeData } from '../src/core/migrate.ts';
import { emptyData, toBackup } from '../src/core/model.ts';
import type { Ngay } from '../src/core/model.ts';
import { initMeta, mergeData, stampChanges } from '../src/core/sync.ts';
import { startNgay } from '../src/core/actions.ts';
import { mkNgay } from './helpers.ts';

const base = (): Ngay => mkNgay({ id: 'd1', ma: 'D001', ngay: '2026-10-21', g1: '08:00', g2: '11:00', tt: 'Chưa làm' });
const T = (hm: string) => `2026-10-21T${hm}:00`;
/** chỉ so các khóa có trong mẫu */
const sub = (x: object, o: object) => Object.fromEntries(Object.keys(o).map((k) => [k, (x as Record<string, unknown>)[k]]));
const ids = (n: Ngay) => (n.ck ?? []).map((c) => c.id);

describe('checklist: quy tắc trạng thái', () => {
  it('tích bước đầu → Đang làm, KHÔNG ghi giờ bắt đầu; ghi giờ tích của bước', () => {
    let n = addChecks(base(), ['A', 'B', 'C']);
    expect(n.tt).toBe('Chưa làm');
    n = toggleCheck(n, ids(n)[0], T('08:20'));
    expect(n.tt).toBe('Đang làm');
    expect(n.a1).toBe(null);
    expect(sub(n.ck![0], { done: true, at: T('08:20') })).toEqual({ done: true, at: T('08:20') });
  });
  it('giờ bắt đầu chỉ do nút Bắt đầu (Play)', () => {
    let n = startNgay(addChecks(base(), ['A', 'B']), T('08:05'));
    n = toggleCheck(n, ids(n)[0], T('08:30'));
    expect(n.a1).toBe(T('08:05'));
  });
  it('tích hết → Hoàn thành, giờ kết thúc = lần tích muộn nhất', () => {
    let n = startNgay(addChecks(base(), ['A', 'B']), T('08:05'));
    n = toggleCheck(n, ids(n)[1], T('09:00'));
    n = toggleCheck(n, ids(n)[0], T('10:40'));
    expect(n.tt).toBe('Hoàn thành');
    expect(n.a2).toBe(T('10:40'));
    expect(ckProgress(n)).toEqual({ done: 2, total: 2 });
  });
  it('bỏ tích → xóa giờ; tích lại → giờ mới; việc đã xong quay về Đang làm', () => {
    let n = addChecks(base(), ['A', 'B']);
    n = toggleCheck(n, ids(n)[0], T('08:10'));
    n = toggleCheck(n, ids(n)[1], T('09:10'));
    expect(n.tt).toBe('Hoàn thành');
    n = toggleCheck(n, ids(n)[1], T('09:30'));
    expect(sub(n.ck![1], { done: false, at: null })).toEqual({ done: false, at: null });
    expect(n.tt).toBe('Đang làm');
    expect(n.a2).toBe(null);
    n = toggleCheck(n, ids(n)[1], T('09:45'));
    expect(n.ck![1].at).toBe(T('09:45'));
    expect(n.a2).toBe(T('09:45'));
  });
  it('đã xong mà thêm bước (hoặc áp mẫu) → về Đang làm', () => {
    let n = addChecks(base(), ['A']);
    n = toggleCheck(n, ids(n)[0], T('08:10'));
    expect(n.tt).toBe('Hoàn thành');
    n = addCheck(n, 'Bước mới');
    expect(n.tt).toBe('Đang làm');
    expect(n.a2).toBe(null);
    n = toggleCheck(n, ids(n)[1], T('09:00'));
    n = applyTemplate(n, { id: 't', name: 'x', items: ['C', ' ', 'D'] });
    expect(n.tt).toBe('Đang làm');
    expect(n.ck!.map((c) => c.text)).toEqual(['A', 'Bước mới', 'C', 'D']);
  });
  it('hoàn thành bằng nút Kết thúc khi checklist chưa xong: tích thêm một bước không lật trạng thái', () => {
    let n = addChecks(base(), ['A', 'B', 'C']);
    n = { ...n, tt: 'Hoàn thành', a1: T('08:00'), a2: T('10:00') };
    n = toggleCheck(n, ids(n)[0], T('10:05'));
    expect(n.tt).toBe('Hoàn thành');
    expect(n.a2).toBe(T('10:00'));
  });
  it('sửa giờ tích được; việc xong nhờ checklist thì giờ kết thúc đi theo', () => {
    let n = addChecks(base(), ['A', 'B']);
    n = toggleCheck(n, ids(n)[0], T('08:10'));
    n = toggleCheck(n, ids(n)[1], T('09:10'));
    n = editCheck(n, ids(n)[1], { at: T('09:55'), note: '  ghi chú ', text: 'B sửa' });
    expect(sub(n.ck![1], { at: T('09:55'), note: 'ghi chú', text: 'B sửa' })).toEqual({ at: T('09:55'), note: 'ghi chú', text: 'B sửa' });
    expect(n.a2).toBe(T('09:55'));
    // bước chưa tích không nhận giờ
    n = addCheck(n, 'C');
    n = editCheck(n, ids(n)[2], { at: T('10:00') });
    expect(n.ck![2].at).toBe(null);
  });
  it('xóa bước chưa xong cuối cùng → mọi bước còn lại đã xong → Hoàn thành', () => {
    let n = addChecks(base(), ['A', 'B']);
    n = toggleCheck(n, ids(n)[0], T('08:10'));
    n = removeCheck(n, ids(n)[1]);
    expect(n.tt).toBe('Hoàn thành');
    expect(n.a2).toBe(T('08:10'));
  });
  it('đổi thứ tự; việc đã hủy không đổi gì', () => {
    let n = addChecks(base(), ['A', 'B', 'C']);
    n = moveCheck(n, 2, 0);
    expect(n.ck!.map((c) => c.text)).toEqual(['C', 'A', 'B']);
    const h = { ...n, huy: { at: T('07:00') } };
    expect(toggleCheck(h, ids(h)[0], T('09:00'))).toBe(h);
    expect(addCheck(h, 'X')).toBe(h);
  });
});

describe('mẫu checklist, lưu trữ, đồng bộ', () => {
  it('lưu / sửa / xóa mẫu', () => {
    let { data, tpl } = saveTemplate(emptyData(), ' Nghiệm thu ', ['A', '', 'B']);
    expect(sub(tpl, { name: 'Nghiệm thu', items: ['A', 'B'] })).toEqual({ name: 'Nghiệm thu', items: ['A', 'B'] });
    data = updateTemplate(data, tpl.id, { name: 'NT', items: ['X'] });
    expect(sub(data.tpls![0], { name: 'NT', items: ['X'] })).toEqual({ name: 'NT', items: ['X'] });
    data = deleteTemplate(data, tpl.id);
    expect(data.tpls).toEqual([]);
  });
  it('checklist và mẫu được giữ khi chuẩn hóa, sao lưu', () => {
    let n = addChecks(base(), ['A', 'B']);
    n = toggleCheck(n, ids(n)[0], T('08:10'));
    const { data } = saveTemplate({ ...emptyData(), ngay: [n] }, 'M', ['A']);
    const back = normalizeData(JSON.parse(JSON.stringify(toBackup(data, 'x').data)));
    expect(back.ngay[0].ck).toEqual(n.ck);
    expect(back.tpls![0].name).toBe('M');
    // dữ liệu lỗi: bỏ giờ của bước chưa tích, đặt id thiếu
    const d2 = normalizeData({ ngay: [{ id: 'z', ngay: '2026-10-21', ck: [{ text: 'x', done: false, at: T('08:00') }, 'rác', { id: 'a', text: 'y', done: true, at: T('09:00') }] }] });
    expect(d2.ngay[0].ck!.length).toBe(2);
    expect(d2.ngay[0].ck![0].at).toBe(null);
    expect(d2.ngay[0].ck![0].id).toBeTruthy();
  });
  it('mẫu checklist đồng bộ giữa hai máy', () => {
    const a = emptyData();
    const b = saveTemplate(emptyData(), 'Mẫu ĐT', ['1']).data;
    const am = initMeta(a);
    const bm = stampChanges(emptyData(), b, initMeta(emptyData()), 100);
    const r = mergeData(a, am, b, bm, 200);
    expect(r.data.tpls!.map((t) => t.name)).toEqual(['Mẫu ĐT']);
  });
});

describe('chỉ số CV Ngày', () => {
  it('(A) thời gian, lệch giờ, các bước và bước lâu nhất', () => {
    let n = startNgay(addChecks(base(), ['A', 'B', 'C', 'D']), T('08:12'));
    n = toggleCheck(n, ids(n)[0], T('08:20'));
    n = toggleCheck(n, ids(n)[1], T('09:05'));
    n = toggleCheck(n, ids(n)[2], T('09:40'));
    const s = ngayStats(n, T('10:28'));
    expect(s.ck).toEqual({ done: 3, total: 4 });
    expect(s.planMin).toBe(180);
    expect(s.workedMin).toBe(136);
    expect(s.startDelta).toBe(12);
    expect(s.leftMin).toBe(32);
    expect(s.steps.map((x) => x.gap)).toEqual([8, 45, 35]);
    expect(s.steps.find((x) => x.longest)?.text).toBe('B');
    expect(s.pending).toBe(1);
  });
  it('(B) tổng quan ngày: giờ theo khung, trạng thái, đúng giờ; tuần / tháng', () => {
    const items = [
      { n: mkNgay({ id: '1', ngay: '2026-10-21', g1: '08:00', g2: '09:30', a1: T('08:00'), a2: T('09:20'), tt: 'Hoàn thành' }), display: 'Hoàn thành' as const },
      { n: mkNgay({ id: '2', ngay: '2026-10-21', g1: '09:00', g2: '10:00', a1: T('09:10'), a2: T('10:30'), tt: 'Hoàn thành' }), display: 'Hoàn thành' as const },
      { n: mkNgay({ id: '3', ngay: '2026-10-21', g1: '13:00', g2: '14:00', tt: 'Chưa làm' }), display: 'Chưa làm' as const },
      { n: mkNgay({ id: '4', ngay: '2026-10-21', g1: '07:00', g2: '07:30', tt: 'Chưa làm', huy: { at: T('06:00') } }), display: 'Đã hủy' as const },
      { n: mkNgay({ id: '5', ngay: '2026-10-20', g1: '08:00', g2: '09:00', tt: 'Hoàn thành' }), display: 'Hoàn thành' as const },
      { n: mkNgay({ id: '6', ngay: '2026-10-02', tt: 'Chưa làm' }), display: 'Chưa làm' as const }
    ];
    const o = dayOverview(items, '2026-10-21', T('12:00'));
    expect(o.total).toBe(4);
    expect(o.counts).toEqual({ done: 2, doing: 0, over: 0, todo: 1, cancel: 1 });
    expect(o.onTime).toEqual({ measured: 2, ontime: 1 });
    expect(o.planMin).toBe(90 + 60 + 60);
    expect(o.actualMin).toBe(80 + 80);
    const h9 = o.hours.find((x) => x.h === 9)!;
    expect(h9).toEqual({ h: 9, plan: 30 + 60, actual: 20 + 50 });
    expect(o.hours[0].h).toBe(7);
    const p = periodDone(items, '2026-10-21');
    expect(p.week).toEqual({ done: 3, total: 4 });
    expect(p.month).toEqual({ done: 3, total: 5 });
  });
});
