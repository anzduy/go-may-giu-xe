// Tiện ích giao diện nhỏ: tạo phần tử, thông báo, định dạng giờ.

export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === false || v == null) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'html') el.innerHTML = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) if (c != null && c !== false) el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  return el;
}

let toastTimer = null;

/** Thông báo ở đáy màn hình. actions: [{label, onClick}] */
export function toast(message, { actions = [], ms = 3000, error = false } = {}) {
  const t = document.getElementById('toast');
  clearTimeout(toastTimer);
  t.className = `show${error ? ' error' : ''}`;
  t.replaceChildren(h('div', { class: 'msg' }, message));
  if (actions.length) {
    t.append(h('div', { class: 'actions' }, actions.map((a) => h('button', { type: 'button', onclick: () => { hideToast(); a.onClick(); } }, a.label))));
  }
  toastTimer = setTimeout(hideToast, ms);
}

export function hideToast() {
  const t = document.getElementById('toast');
  t.className = '';
  t.replaceChildren();
}

const VN = 7 * 3600 * 1000;

/** "2026-11-03T12:42:00Z" → "19:42" (giờ Việt Nam) */
export function timeVN(iso) {
  if (!iso) return '';
  const d = new Date(Date.parse(iso) + VN);
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
}

/** "20261103" → "03/11/2026" */
export function dateVN(key) {
  return key ? `${key.slice(6, 8)}/${key.slice(4, 6)}/${key.slice(0, 4)}` : '';
}

export function uuid() {
  return crypto.randomUUID ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
    });
}

/** Ảnh từ Blob → <img>. zoom=false cho ảnh nhỏ trong lưới/danh sách (chạm vào là chọn xe, không phóng to). */
export function photoEl(blob, alt, cls = 'photo', zoom = true) {
  if (!blob) return h('div', { class: 'photo-missing' }, 'Chưa xem được ảnh (máy đã chụp chưa sao lưu, đang mất mạng, hoặc ảnh đã quá 30 ngày)');
  const url = URL.createObjectURL(blob);
  const img = h('img', { class: cls, src: url, alt });
  img.addEventListener('load', () => setTimeout(() => URL.revokeObjectURL(url), 60000), { once: true });
  if (zoom) img.addEventListener('click', () => {
    const big = URL.createObjectURL(blob);
    const ov = h('div', { class: 'zoom-overlay', onclick: () => { URL.revokeObjectURL(big); ov.remove(); } }, h('img', { src: big, alt }));
    document.body.append(ov);
  });
  return img;
}

/**
 * Ảnh theo photoId: hiện ngay nếu có trên máy, không thì "Đang tải ảnh…" rồi tự thay khi tải xong từ cloud.
 * `load` = db.getPhotoBlob (truyền vào để ui.js không phụ thuộc db.js).
 */
export function asyncPhoto(photoId, alt, load, { cls = 'photo', zoom = true } = {}) {
  if (!photoId) return photoEl(null, alt, cls, zoom);
  const holder = h('div', { class: 'photo-missing' }, 'Đang tải ảnh…');
  load(photoId).then((blob) => holder.replaceWith(photoEl(blob, alt, cls, zoom))).catch(() => holder.replaceWith(photoEl(null, alt, cls, zoom)));
  return holder;
}
