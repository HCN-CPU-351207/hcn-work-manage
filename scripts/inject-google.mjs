// Chạy trên máy build (GitHub Actions): ghi mã dự án Google từ GitHub Secrets vào src/config/google.ts.
// Mã không nằm trong repo công khai. Thiếu secret → để trống (mục Google Drive hiện "chưa cấu hình").
import fs from 'node:fs';
import path from 'node:path';

const file = path.join(process.cwd(), 'src/config/google.ts');
const env = {
  desktopClientId: process.env.HCN_GOOGLE_DESKTOP_ID ?? '',
  desktopClientSecret: process.env.HCN_GOOGLE_DESKTOP_SECRET ?? '',
  androidClientId: process.env.HCN_GOOGLE_ANDROID_ID ?? ''
};
let s = fs.readFileSync(file, 'utf8');
for (const [k, v] of Object.entries(env)) {
  if (!/^[\w.-]*$/.test(v)) {
    console.error(`Giá trị ${k} không hợp lệ`);
    process.exit(1);
  }
  s = s.replace(new RegExp(`(${k}: )'[^']*'`), `$1'${v.trim()}'`);
}
fs.writeFileSync(file, s);
const set = Object.entries(env).filter(([, v]) => v).map(([k]) => k);
console.log(set.length === 3 ? 'Đã gắn mã dự án Google' : `Thiếu mã Google (${3 - set.length}); Google Drive sẽ hiện "chưa cấu hình"`);
