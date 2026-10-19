// Dựng workbook Excel từ danh sách sheet (dùng chung cho PC và Android)
import type ExcelJS from 'exceljs';
import type { SheetSpec } from '../core/api.ts';

const safeName = (n: string, used: Set<string>): string => {
  const base = n.replace(/[\\/?*[\]:]/g, ' ').trim().slice(0, 31) || 'Sheet';
  let name = base;
  let i = 2;
  while (used.has(name.toLowerCase())) name = `${base.slice(0, 28)} ${i++}`;
  used.add(name.toLowerCase());
  return name;
};

export function fillWorkbook(wb: ExcelJS.Workbook, sheets: SheetSpec[]): void {
  wb.creator = 'HCN Work Manage';
  wb.created = new Date();
  const used = new Set<string>();
  for (const s of sheets) {
    const ws = wb.addWorksheet(safeName(s.name, used));
    ws.addRow(s.columns);
    const head = ws.getRow(1);
    head.font = { bold: true };
    head.alignment = { vertical: 'middle' };
    head.eachCell((c) => {
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD1FAE5' } };
    });
    for (const r of s.rows) ws.addRow(r);
    ws.views = [{ state: 'frozen', ySplit: 1 }];
    s.columns.forEach((title, i) => {
      let w = String(title).length;
      for (const r of s.rows) w = Math.max(w, String(r[i] ?? '').length);
      ws.getColumn(i + 1).width = Math.min(48, Math.max(10, w + 2));
    });
  }
}
