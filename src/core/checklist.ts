// Checklist của CV Ngày + mẫu checklist.
// Quy tắc trạng thái (chỉ áp khi checklist thay đổi):
//   - Giờ bắt đầu thực tế CHỈ ghi khi bấm Bắt đầu (Play); tích checklist không ghi giờ bắt đầu.
//   - Tích một bước → ghi giờ tích của bước đó (sửa tay được); bỏ tích → xóa giờ; tích lại → giờ mới.
//   - Tích bước đầu khi việc còn "Chưa làm" → "Đang làm".
//   - Tích hết → "Hoàn thành", giờ kết thúc thực tế = giờ tích muộn nhất.
//   - Đã "Hoàn thành" mà thêm bước / bỏ tích → về "Đang làm", xóa giờ kết thúc.
//   - Việc đã hủy: không đổi gì.
import type { CheckItem, CkTemplate, Data, Ngay } from './model.ts';
import { newId } from './ids.ts';

export const ckOf = (n: Pick<Ngay, 'ck'>): CheckItem[] => n.ck ?? [];
export function ckProgress(n: Pick<Ngay, 'ck'>): { done: number; total: number } {
  const ck = ckOf(n);
  return { done: ck.filter((c) => c.done).length, total: ck.length };
}
/** giờ tích muộn nhất trong các bước đã xong */
export function lastTick(ck: CheckItem[]): string | null {
  let m: string | null = null;
  for (const c of ck) if (c.done && c.at && (!m || c.at > m)) m = c.at;
  return m;
}

export type CkOp = 'add' | 'tick' | 'untick' | 'remove' | 'edit';

/** Áp quy tắc trạng thái sau khi checklist đổi */
export function applyCkStatus(n: Ngay, op: CkOp): Ngay {
  const ck = ckOf(n);
  const all = ck.length > 0 && ck.every((c) => c.done);
  if (op === 'add' || op === 'untick') {
    // việc đã xong mà thêm bước / bỏ tích → làm tiếp
    return n.tt === 'Hoàn thành' ? { ...n, tt: 'Đang làm', a2: null } : n;
  }
  if (op === 'tick') {
    if (all) return { ...n, tt: 'Hoàn thành', a2: lastTick(ck) ?? n.a2 };
    return n.tt === 'Chưa làm' ? { ...n, tt: 'Đang làm' } : n;
  }
  if (op === 'remove') return all && n.tt !== 'Hoàn thành' ? { ...n, tt: 'Hoàn thành', a2: lastTick(ck) ?? n.a2 } : n;
  // sửa giờ tích của việc đã xong nhờ checklist: giờ kết thúc theo giờ tích muộn nhất
  if (op === 'edit' && all && n.tt === 'Hoàn thành') return { ...n, a2: lastTick(ck) ?? n.a2 };
  return n;
}

const edit = (n: Ngay, ck: CheckItem[], op: CkOp): Ngay => (n.huy ? n : applyCkStatus({ ...n, ck }, op));

export function addCheck(n: Ngay, text: string): Ngay {
  const tx = text.trim().slice(0, 300);
  if (!tx || n.huy) return n;
  return edit(n, [...ckOf(n), { id: newId('c'), text: tx, done: false, at: null }], 'add');
}
export function addChecks(n: Ngay, texts: string[]): Ngay {
  const items = texts.map((x) => x.trim().slice(0, 300)).filter(Boolean);
  if (!items.length || n.huy) return n;
  return edit(n, [...ckOf(n), ...items.map((text) => ({ id: newId('c'), text, done: false, at: null }))], 'add');
}
/** tích / bỏ tích: tích → ghi giờ lúc tích; bỏ tích → xóa giờ */
export function toggleCheck(n: Ngay, id: string, nowIso: string): Ngay {
  const cur = ckOf(n).find((c) => c.id === id);
  if (!cur) return n;
  return edit(
    n,
    ckOf(n).map((c) => (c.id !== id ? c : c.done ? { ...c, done: false, at: null } : { ...c, done: true, at: nowIso })),
    cur.done ? 'untick' : 'tick'
  );
}
export function removeCheck(n: Ngay, id: string): Ngay {
  return edit(n, ckOf(n).filter((c) => c.id !== id), 'remove');
}
/** sửa nội dung / ghi chú / giờ tích (giờ chỉ sửa được với bước đã tích) */
export function editCheck(n: Ngay, id: string, patch: { text?: string; note?: string; at?: string | null }): Ngay {
  return edit(
    n,
    ckOf(n).map((c) => {
      if (c.id !== id) return c;
      const next: CheckItem = { ...c };
      if (patch.text !== undefined && patch.text.trim()) next.text = patch.text.trim().slice(0, 300);
      if (patch.note !== undefined) {
        const v = patch.note.trim().slice(0, 300);
        if (v) next.note = v;
        else delete next.note;
      }
      if (patch.at !== undefined && c.done && patch.at) next.at = patch.at;
      return next;
    }),
    'edit'
  );
}
export function moveCheck(n: Ngay, from: number, to: number): Ngay {
  const ck = [...ckOf(n)];
  if (from < 0 || from >= ck.length || to < 0 || to >= ck.length || from === to || n.huy) return n;
  const [x] = ck.splice(from, 1);
  ck.splice(to, 0, x);
  return { ...n, ck };
}
export function applyTemplate(n: Ngay, tpl: CkTemplate): Ngay {
  return addChecks(n, tpl.items);
}

// ---------- Mẫu ----------
export const tplsOf = (d: Pick<Data, 'tpls'>): CkTemplate[] => d.tpls ?? [];
export function saveTemplate(d: Data, name: string, items: string[]): { data: Data; tpl: CkTemplate } {
  const tpl: CkTemplate = { id: newId('t'), name: name.trim().slice(0, 80) || 'Mẫu', items: items.map((x) => x.trim()).filter(Boolean).slice(0, 200) };
  return { data: { ...d, tpls: [...tplsOf(d), tpl] }, tpl };
}
export function updateTemplate(d: Data, id: string, patch: { name?: string; items?: string[] }): Data {
  return {
    ...d,
    tpls: tplsOf(d).map((x) =>
      x.id !== id
        ? x
        : {
            ...x,
            ...(patch.name !== undefined && patch.name.trim() ? { name: patch.name.trim().slice(0, 80) } : {}),
            ...(patch.items ? { items: patch.items.map((v) => v.trim()).filter(Boolean).slice(0, 200) } : {})
          }
    )
  };
}
export function deleteTemplate(d: Data, id: string): Data {
  return { ...d, tpls: tplsOf(d).filter((x) => x.id !== id) };
}
