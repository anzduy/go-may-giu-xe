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

// In trên phiếu gửi xe.
export const VENUE_NAME = 'Sân Bóng Đá Gò Mây Arena';
export const BOOKING_PHONE = '070 330 3535';
export const TICKET_NOTICE = 'Quý khách vui lòng tự bảo quản nón bảo hiểm và tài sản để trên xe. '
  + 'Sân chỉ nhận giữ xe, không chịu trách nhiệm khi các vật dụng này bị mất.';
export const APP_VERSION = '1.0.0';
