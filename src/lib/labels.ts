// Ánh xạ giá trị lưu trong DB (tiếng Việt) sang khóa i18n
import type { Display, Level, Loai } from '../core/model.ts';

export const STATUS_KEY: Record<Display, 'todo' | 'doing' | 'done' | 'overdue'> = {
  'Chưa làm': 'todo',
  'Đang làm': 'doing',
  'Hoàn thành': 'done',
  'Quá hạn': 'overdue'
};

export const LOAI_KEY: Record<Loai, 'ui' | 'un' | 'ni' | 'nn'> = {
  'Gấp-Quan trọng': 'ui',
  'Gấp-Không quan trọng': 'un',
  'Không gấp-Quan trọng': 'ni',
  'Không gấp-Không quan trọng': 'nn'
};

export const LEVEL_PREFIX: Record<Level, 'M' | 'W' | 'D'> = { thang: 'M', tuan: 'W', ngay: 'D' };

export const LEVEL_FROM_CODE = (ma: string): Level | null => {
  const c = ma.trim().charAt(0).toUpperCase();
  return c === 'M' ? 'thang' : c === 'W' ? 'tuan' : c === 'D' ? 'ngay' : null;
};

export const cx = (...parts: (string | false | null | undefined)[]): string => parts.filter(Boolean).join(' ');

export const ISSUE_URL = 'https://github.com/HCN-CPU-351207/hcn-work-manage/issues';
