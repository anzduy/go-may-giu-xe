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
const PHOTO_REASON = {
  NOT_UPLOADED: 'Máy chụp ảnh này CHƯA sao lưu ảnh lên (máy đó cần mở app và có mạng). Trên iPhone: Safari và app ở màn hình chính là 2 nơi riêng — hãy dùng cùng một nơi.',
  OFFLINE: 'Đang mất mạng nên chưa tải được ảnh từ máy chủ.',
  GONE: 'Ảnh đã quá 30 ngày nên đã được dọn khỏi Drive.',
  NO_PHOTO: 'Lượt này không có ảnh.',
};

/**
 * Ảnh theo photoId: hiện ngay nếu có trên máy; không thì "Đang tải ảnh…" rồi tải từ cloud.
 * Không xem được thì nói RÕ lý do và có nút "Thử lại".
 * `load` = db.getPhotoResult (trả { blob, error }) hoặc db.getPhotoBlob (trả Blob).
 */
export function asyncPhoto(photoId, alt, load, { cls = 'photo', zoom = true } = {}) {
  if (!photoId) return photoEl(null, alt, cls, zoom);
  const holder = h('div', { class: 'photo-missing' }, 'Đang tải ảnh…');
  const attempt = () => {
    holder.replaceChildren('Đang tải ảnh…');
    Promise.resolve(load(photoId)).then((res) => {
      const blob = res instanceof Blob ? res : res && res.blob;
      if (blob) { holder.replaceWith(photoEl(blob, alt, cls, zoom)); return; }
      const reason = (res && PHOTO_REASON[res.error]) || `Chưa xem được ảnh${res && res.message ? ` (${res.message})` : ''}.`;
      const retry = h('button', { type: 'button', class: 'small', style: 'margin-top:6px' }, '⟳ Thử lại');
      retry.addEventListener('click', (e) => { e.stopPropagation(); attempt(); });
      holder.replaceChildren(h('div', {}, h('div', { class: 'photo-reason' }, reason), retry));
    }).catch(() => holder.replaceChildren('Chưa xem được ảnh.'));
  };
  attempt();
  return holder;
}
