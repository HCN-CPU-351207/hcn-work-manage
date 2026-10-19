// Xuất Excel bằng exceljs (chạy ở main process)
import ExcelJS from 'exceljs';
import type { SheetSpec } from '../src/core/api.ts';
import { fillWorkbook } from '../src/lib/xlsxBuild.ts';

export async function writeWorkbook(file: string, sheets: SheetSpec[]): Promise<void> {
  const wb = new ExcelJS.Workbook();
  fillWorkbook(wb, sheets);
  await wb.xlsx.writeFile(file);
}
