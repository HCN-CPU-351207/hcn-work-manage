// Chạy sau `npx cap add android`: cho phép http trong mạng Wi-Fi (đồng bộ với PC),
// đặt số phiên bản theo package.json (để cài đè được), và ký APK bằng keystore cố định.
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const [ma, mi, pa] = pkg.version.split('.').map((n) => parseInt(n, 10) || 0);
const versionCode = ma * 10000 + mi * 100 + pa;

// 1) AndroidManifest: usesCleartextTraffic
const manifestPath = path.join(root, 'android/app/src/main/AndroidManifest.xml');
let manifest = fs.readFileSync(manifestPath, 'utf8');
if (!manifest.includes('usesCleartextTraffic')) {
  manifest = manifest.replace('<application', '<application\n        android:usesCleartextTraffic="true"');
  fs.writeFileSync(manifestPath, manifest);
}
// Nhắc việc đúng giờ (Android 12+): quyền hẹn giờ chính xác
manifest = fs.readFileSync(manifestPath, 'utf8');
for (const perm of ['android.permission.SCHEDULE_EXACT_ALARM', 'android.permission.USE_EXACT_ALARM', 'android.permission.RECEIVE_BOOT_COMPLETED']) {
  if (!manifest.includes(perm)) manifest = manifest.replace('</manifest>', `    <uses-permission android:name="${perm}" />\n</manifest>`);
}
fs.writeFileSync(manifestPath, manifest);

// 2) build.gradle: phiên bản + ký
const gradlePath = path.join(root, 'android/app/build.gradle');
if (!fs.existsSync(gradlePath)) {
  console.error('Không thấy android/app/build.gradle (dự án Android dùng Kotlin DSL?). Hãy cấu hình ký APK thủ công.');
  process.exit(1);
}
let g = fs.readFileSync(gradlePath, 'utf8');
g = g.replace(/versionCode\s+\d+/, `versionCode ${versionCode}`).replace(/versionName\s+"[^"]*"/, `versionName "${pkg.version}"`);
if (!g.includes('signingConfigs.hcn')) {
  const signing = `
    signingConfigs {
        hcn {
            storeFile file(System.getenv("HCN_KEYSTORE") ?: "../../android-signing/hcn-release.jks")
            storePassword System.getenv("HCN_KEYSTORE_PASSWORD") ?: "hcn-work-manage"
            keyAlias System.getenv("HCN_KEY_ALIAS") ?: "hcn"
            keyPassword System.getenv("HCN_KEY_PASSWORD") ?: "hcn-work-manage"
        }
    }`;
  g = g.replace(/android\s*\{/, (m) => `${m}${signing}`);
  g = g.replace(/release\s*\{/, (m) => `${m}\n            signingConfig signingConfigs.hcn`);
}
fs.writeFileSync(gradlePath, g);
console.log(`Android đã sẵn sàng: v${pkg.version} (versionCode ${versionCode})`);
