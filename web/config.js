// Cấu hình. Địa chỉ máy chủ (URL /exec của Apps Script) có thể dán ngay trên màn hình đăng nhập —
// được lưu trong máy (localStorage), không cần sửa file này.
export const DEFAULT_API_URL = 'https://script.google.com/macros/s/REPLACE_WITH_DEPLOYMENT_ID/exec';

export function getApiUrl() {
  try {
    return localStorage.getItem('gomay.apiUrl') || DEFAULT_API_URL;
  } catch {
    return DEFAULT_API_URL;
  }
}

export function setApiUrl(url) {
  try { localStorage.setItem('gomay.apiUrl', url); } catch { /* bỏ qua */ }
}

export const POLL_MS = 3000;
export const APP_VERSION = '1.0.0';
