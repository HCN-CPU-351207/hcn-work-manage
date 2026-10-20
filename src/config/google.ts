// Mã dự án Google Cloud cho đồng bộ Google Drive (tạo theo hướng dẫn trong README > "Đồng bộ online qua Google Drive").
// Các mã này không phải mật khẩu: Google coi mã của app cài trên máy là công khai (bảo vệ bằng PKCE + email người dùng).
// Để trống → mục Google Drive hiện "chưa cấu hình", các cách đồng bộ khác vẫn chạy bình thường.
export const GOOGLE_CONFIG = {
  /** Client "Desktop app" (bản PC) */
  desktopClientId: '',
  desktopClientSecret: '',
  /** Client "Android" (package com.hcn.workmanage + SHA-1 khóa ký; bật "custom URI scheme" trong Advanced settings) */
  androidClientId: ''
};

/** Địa chỉ Google gọi lại app Android sau khi đăng nhập (scheme = tên gói) */
export const ANDROID_REDIRECT = 'com.hcn.workmanage:/oauth2redirect';
