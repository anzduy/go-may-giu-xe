// Trạng thái dùng chung của app (nhân viên đang đăng nhập, máy, giờ đã hiệu chỉnh theo máy chủ).
import { dateKey } from '../shared/ticket.js';

export const ctx = {
  staff: null,
  deviceId: null,
  qrSecret: '',
  clockOffset: 0,
  audio: null,
  /** Giờ đã hiệu chỉnh theo máy chủ (ms). */
  now() { return Date.now() + this.clockOffset; },
  nowIso() { return new Date(this.now()).toISOString(); },
  today() { return dateKey(this.now()); },
  isManager() { return !!(this.staff && this.staff.role === 'manager'); },
  navigate(hash) { if (location.hash === hash) window.dispatchEvent(new HashChangeEvent('hashchange')); else location.hash = hash; },
  /** Báo cho thanh trên cùng cập nhật số liệu. */
  changed() { window.dispatchEvent(new CustomEvent('local:changed')); },
};

export function hashParams() {
  const q = location.hash.split('?')[1] || '';
  return Object.fromEntries(new URLSearchParams(q));
}
