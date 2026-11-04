// Thanh toán: thu lúc GỬI xe (mặc định) hoặc lúc TRẢ xe; tiền mặt hoặc chuyển khoản.
// Lượt gửi lưu: inPaid / inPayMethod (thu lúc vào), outPaid / outPayMethod (thu lúc ra), fee = tổng đã thu.
// Lượt từ bản app cũ (chưa có các trường này) = thu hết lúc ra bằng tiền mặt.

export const PAY_METHODS = { cash: 'Tiền mặt', transfer: 'Chuyển khoản' };
/** Lựa chọn lúc gửi xe: thu ngay (tiền mặt / chuyển khoản) hoặc để khách trả lúc ra. */
export const PAY_IN_OPTIONS = { cash: 'Tiền mặt', transfer: 'Chuyển khoản', later: 'Trả lúc ra' };

export const payMethod = (m) => (m === 'transfer' ? 'transfer' : 'cash');

/** Đã thu lúc vào. */
export const inAmount = (s) => Number(s && s.inPaid) || 0;

/** Đã thu lúc ra (lượt cũ chưa có outPaid: toàn bộ phí). */
export function outAmount(s) {
  if (!s) return 0;
  if (s.outPaid != null && s.outPaid !== '') return Number(s.outPaid) || 0;
  return Math.max(0, (Number(s.fee) || 0) - inAmount(s));
}

export const outMethod = (s) => payMethod(s && s.outPayMethod);
export const inMethod = (s) => payMethod(s && s.inPayMethod);

/** Số còn phải thu khi trả xe = tổng phí − đã thu lúc vào. */
export const dueAtOut = (total, s) => Math.max(0, (Number(total) || 0) - inAmount(s));

/** Trường thanh toán lúc gửi xe. payIn: 'cash' | 'transfer' | 'later' (không có = bản app cũ = trả lúc ra). */
export function checkinPayment(payIn, price) {
  if (payIn === 'cash' || payIn === 'transfer') return { inPaid: Number(price) || 0, inPayMethod: payIn };
  return { inPaid: 0 };
}

/** Trường thanh toán lúc trả xe: tổng phí `total`, cách trả `method`. */
export function checkoutPayment(session, total, method) {
  const outPaid = dueAtOut(total, session);
  return { outPaid, outPayMethod: outPaid ? payMethod(method) : '', fee: inAmount(session) + outPaid };
}
