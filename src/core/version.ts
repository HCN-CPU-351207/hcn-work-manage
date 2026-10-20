// So sánh phiên bản và đọc bản phát hành trên GitHub (dùng cho tự cập nhật trên Android)
export const RELEASES_API = 'https://api.github.com/repos/HCN-CPU-351207/hcn-work-manage/releases/latest';

/** 'v1.10.2' → [1, 10, 2]; phần không phải số bỏ qua */
export function parseVer(v: string): number[] {
  return v
    .trim()
    .replace(/^v/i, '')
    .split(/[.+-]/)
    .slice(0, 3)
    .map((x) => Number.parseInt(x, 10) || 0);
}

/** b mới hơn a? */
export function isNewer(a: string, b: string): boolean {
  const x = parseVer(a);
  const y = parseVer(b);
  for (let i = 0; i < 3; i++) {
    if ((y[i] ?? 0) !== (x[i] ?? 0)) return (y[i] ?? 0) > (x[i] ?? 0);
  }
  return false;
}

export interface ReleaseInfo {
  version: string;
  apkUrl: string | null;
  pageUrl: string;
}

/** Đọc JSON của /releases/latest: bỏ qua bản nháp / thử nghiệm, tìm file .apk */
export function parseRelease(json: unknown): ReleaseInfo | null {
  if (!json || typeof json !== 'object') return null;
  const r = json as { tag_name?: unknown; html_url?: unknown; draft?: unknown; prerelease?: unknown; assets?: unknown };
  if (typeof r.tag_name !== 'string' || r.draft || r.prerelease) return null;
  const assets = Array.isArray(r.assets) ? (r.assets as { name?: unknown; browser_download_url?: unknown }[]) : [];
  const apk = assets.find((a) => typeof a.name === 'string' && a.name.toLowerCase().endsWith('.apk') && typeof a.browser_download_url === 'string');
  return {
    version: r.tag_name.replace(/^v/i, ''),
    apkUrl: apk ? (apk.browser_download_url as string) : null,
    pageUrl: typeof r.html_url === 'string' ? r.html_url : 'https://github.com/HCN-CPU-351207/hcn-work-manage/releases/latest'
  };
}
