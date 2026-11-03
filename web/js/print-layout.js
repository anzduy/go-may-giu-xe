// Chia phiếu thành trang A4 (mặc định 24 phiếu/trang: 3 cột × 8 hàng), mỗi trang là các số liên tiếp.
export const PER_PAGE = 24;

export function paginate(tickets, perPage = PER_PAGE) {
  const pages = [];
  for (let i = 0; i < tickets.length; i += perPage) pages.push(tickets.slice(i, i + perPage));
  return pages;
}
