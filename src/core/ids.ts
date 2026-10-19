// Sinh id ngắn, không trùng trong một phiên
let seq = 0;
export function newId(prefix: string): string {
  const r = Math.random().toString(36).slice(2, 8);
  const s = (seq++).toString(36);
  return `${prefix}_${Date.now().toString(36)}${s}${r}`;
}
