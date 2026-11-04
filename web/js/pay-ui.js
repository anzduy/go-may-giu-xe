// Nút chọn cách khách trả tiền lúc TRẢ xe: Tiền mặt (mặc định) / Chuyển khoản.
import { h } from './ui.js';
import { PAY_METHODS } from '../shared/payment.js';

export function methodPicker(id = 'pay-out') {
  let value = 'cash';
  const btns = Object.entries(PAY_METHODS).map(([k, name]) =>
    h('button', { type: 'button', 'data-pay': k, onclick: () => { value = k; paint(); } }, name));
  const paint = () => btns.forEach((b) => b.classList.toggle('on', b.dataset.pay === value));
  paint();
  return { el: h('div', { class: 'segmented pay', id }, btns), get value() { return value; } };
}
