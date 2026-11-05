// Chia phiếu thành trang A4 (mặc định 12 phiếu/trang: 2 cột × 6 hàng, mỗi phiếu ~97 × 47 mm — gấp đôi diện tích
// bản cũ 24 phiếu/trang), mỗi trang là các số liên tiếp.
export const PER_PAGE = 12;

export function paginate(tickets, perPage = PER_PAGE) {
  const pages = [];
  for (let i = 0; i < tickets.length; i += perPage) pages.push(tickets.slice(i, i + perPage));
  return pages;
}
