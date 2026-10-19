// Cấu hình app Android (Capacitor). Dùng chung giao diện với bản PC (thư mục dist).
import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.hcn.workmanage',
  appName: 'HCN Work Manage',
  webDir: 'dist',
  // cho phép gọi http:// tới PC trong mạng Wi-Fi để đồng bộ
  server: { androidScheme: 'https', cleartext: true },
  android: { allowMixedContent: true },
  plugins: {
    // fetch đi qua lớp mạng gốc của Android (không vướng CORS / mixed content)
    CapacitorHttp: { enabled: true },
    LocalNotifications: { iconColor: '#059669' },
    // Android 15+ vẽ app tràn dưới thanh trạng thái; tiêm biến --safe-area-inset-* để CSS chừa đúng khoảng
    SystemBars: { insetsHandling: 'css', style: 'DARK' }
  }
};

export default config;
