// Bảng giá: đồng giá mỗi lượt theo loại xe, phí mất phiếu (tổng tiền, không cộng giá thường).

export const VEHICLE_TYPES = { motorbike: 'Xe máy', ebike: 'Xe điện', bicycle: 'Xe đạp' };
export const DEFAULT_PRICES = { motorbike: 5000, ebike: 5000, bicycle: 5000, lostFee: 10000 };

/** Bảng giá có hiệu lực tại thời điểm `at` (mới nhất có effectiveFrom ≤ at). */
export function priceRuleAt(rules, at) {
  let best = null;
  for (const r of rules || []) {
    if (String(r.effectiveFrom) <= String(at) && (!best || String(r.effectiveFrom) > String(best.effectiveFrom))) best = r;
  }
  return best || DEFAULT_PRICES;
}

export function priceFor(rules, vehicleType, at) {
  const rule = priceRuleAt(rules, at);
  const v = Number(rule[vehicleType]);
  return v > 0 ? v : DEFAULT_PRICES[vehicleType] || DEFAULT_PRICES.motorbike;
}

export function lostFee(rules, at) {
  const v = Number(priceRuleAt(rules, at).lostFee);
  return v > 0 ? v : DEFAULT_PRICES.lostFee;
}

/** 5000 → "5.000đ" */
export function formatMoney(v) {
  return `${String(Math.round(Number(v) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, '.')}đ`;
}
