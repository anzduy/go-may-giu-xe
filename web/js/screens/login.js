// Màn hình đăng nhập: tên nhân viên + mã PIN. Lần đầu dán địa chỉ máy chủ (URL /exec của Apps Script).
import { call } from '../api.js';
import { getApiUrl, setApiUrl, DEFAULT_API_URL } from '../../config.js';
import { ctx } from '../ctx.js';
import { h, fill } from '../ui.js';

export function render(root, { onLogin }) {
  const needUrl = getApiUrl() === DEFAULT_API_URL;
  const url = h('input', { id: 'api-url', type: 'url', placeholder: 'https://script.google.com/macros/s/…/exec', value: needUrl ? '' : getApiUrl() });
  const name = h('input', { id: 'staff-name', autocomplete: 'username', placeholder: 'Ví dụ: Tuấn' });
  const pin = h('input', { id: 'pin', type: 'password', inputmode: 'numeric', pattern: '[0-9]*', maxlength: '6', autocomplete: 'current-password', placeholder: '4–6 số' });
  const msg = h('div', { class: 'error-text' });
  const btn = h('button', { class: 'primary', type: 'submit', style: 'width:100%;margin-top:16px' }, 'ĐĂNG NHẬP');
  const urlBox = h('details', { open: needUrl },
    h('summary', { class: 'muted' }, 'Địa chỉ máy chủ'),
    h('label', { for: 'api-url' }, 'Dán URL Apps Script (kết thúc bằng /exec)'), url);

  const form = h('form', { class: 'login card' },
    h('h1', {}, 'Giữ Xe Gò Mây'),
    h('p', { class: 'muted' }, 'Đăng nhập để bắt đầu ca'),
    urlBox,
    h('label', { for: 'staff-name' }, 'Tên nhân viên'), name,
    h('label', { for: 'pin' }, 'Mã PIN'), pin,
    msg, btn);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    msg.textContent = '';
    if (url.value.trim()) setApiUrl(url.value.trim());
    if (getApiUrl() === DEFAULT_API_URL) { msg.textContent = 'Cần dán địa chỉ máy chủ trước'; urlBox.open = true; return; }
    btn.disabled = true;
    btn.textContent = 'Đang đăng nhập…';
    const r = await call('login', { staffName: name.value, pin: pin.value, deviceId: ctx.deviceId });
    btn.disabled = false;
    btn.textContent = 'ĐĂNG NHẬP';
    if (!r.ok) {
      msg.textContent = r.error.code === 'OFFLINE' ? 'Không kết nối được máy chủ. Lần đăng nhập đầu cần có mạng.' : (r.error.message || 'Sai tên hoặc mã PIN');
      return;
    }
    onLogin(r.data);
  });
  fill(root, form);
  name.focus();
}
