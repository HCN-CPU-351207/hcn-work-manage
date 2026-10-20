import { describe, it, expect } from 'vitest';
import { isNewer, parseRelease, parseVer } from '../src/core/version.ts';

describe('phiên bản', () => {
  it('đọc số phiên bản', () => {
    expect(parseVer('v1.3.0')).toEqual([1, 3, 0]);
    expect(parseVer('1.10')).toEqual([1, 10]);
    expect(parseVer('2.0.1-beta')).toEqual([2, 0, 1]);
  });
  it('so sánh theo số, không theo chữ', () => {
    expect(isNewer('1.3.0', '1.10.0')).toBe(true);
    expect(isNewer('1.3.0', '1.3.0')).toBe(false);
    expect(isNewer('1.3.0', 'v1.3.1')).toBe(true);
    expect(isNewer('1.3.0', '1.2.9')).toBe(false);
    expect(isNewer('1.3', '1.3.0')).toBe(false);
    expect(isNewer('1.9.9', '2.0.0')).toBe(true);
  });
});

describe('đọc bản phát hành GitHub', () => {
  it('lấy phiên bản và link .apk', () => {
    const r = parseRelease({
      tag_name: 'v1.4.0',
      html_url: 'https://github.com/x/y/releases/tag/v1.4.0',
      assets: [
        { name: 'HCN-Setup-1.4.0.exe', browser_download_url: 'https://a/exe' },
        { name: 'HCN-1.4.0.apk', browser_download_url: 'https://a/apk' }
      ]
    });
    expect(r).toEqual({ version: '1.4.0', apkUrl: 'https://a/apk', pageUrl: 'https://github.com/x/y/releases/tag/v1.4.0' });
  });
  it('bỏ qua bản nháp / thử nghiệm và dữ liệu lạ', () => {
    expect(parseRelease({ tag_name: 'v2.0.0', draft: true })).toBe(null);
    expect(parseRelease({ tag_name: 'v2.0.0', prerelease: true })).toBe(null);
    expect(parseRelease({ message: 'API rate limit exceeded' })).toBe(null);
    expect(parseRelease(null)).toBe(null);
  });
  it('chưa có file .apk thì apkUrl = null', () => {
    expect(parseRelease({ tag_name: 'v1.4.0', assets: [] })!.apkUrl).toBe(null);
  });
});
