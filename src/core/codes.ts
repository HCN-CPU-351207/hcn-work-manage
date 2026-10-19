// Sinh mã M###, W###, D### không trùng, không tái sử dụng (mục 5.3)
import type { Counters, Data } from './model.ts';

export type Prefix = 'M' | 'W' | 'D';

export const formatCode = (p: Prefix, n: number): string => p + String(n).padStart(3, '0');

export function parseCodeNum(code: string, p: Prefix): number | null {
  const m = new RegExp(`^${p}(\\d+)$`, 'i').exec(code.trim());
  return m ? Number(m[1]) : null;
}

export function maxNum(p: Prefix, codes: string[]): number {
  let max = 0;
  for (const c of codes) {
    const n = parseCodeNum(c, p);
    if (n !== null && n > max) max = n;
  }
  return max;
}

/** bộ đếm = max(bộ đếm đã lưu, mã lớn nhất đang có) */
export function syncCounters(data: Pick<Data, 'thang' | 'tuan' | 'ngay' | 'counters'>): Counters {
  const c = data.counters ?? { M: 0, W: 0, D: 0 };
  return {
    M: Math.max(c.M ?? 0, maxNum('M', data.thang.map((x) => x.ma))),
    W: Math.max(c.W ?? 0, maxNum('W', data.tuan.map((x) => x.ma))),
    D: Math.max(c.D ?? 0, maxNum('D', data.ngay.map((x) => x.ma)))
  };
}

export function nextCode(
  p: Prefix,
  data: Pick<Data, 'thang' | 'tuan' | 'ngay' | 'counters'>
): { code: string; counters: Counters } {
  const counters = syncCounters(data);
  const n = counters[p] + 1;
  return { code: formatCode(p, n), counters: { ...counters, [p]: n } };
}
