import { test, expect } from '@playwright/test';
import { createMock, login, today } from './fixtures/mock-api.js';

let mock;
test.beforeEach(async ({ context }) => {
  mock = createMock();
  await mock.attach(context);
  mock.seedBatch(today(), 1, 200);
});

async function checkinN(page, n) {
  for (let i = 1; i <= n; i++) {
    await page.click('#capture');
    await expect(page.locator('#toast')).toContainText(`phiếu ${String(i).padStart(3, '0')}`);
  }
}
async function checkout(page, no) {
  await page.fill('#typed-no', String(no));
  await page.click('#find-btn');
  await page.click('#checkout-btn');
  await expect(page.locator('#toast')).toContainText(`Đã trả xe phiếu ${String(no).padStart(3, '0')}`);
}

test('US5: chốt ca — tiền cần nộp khớp tính tay, máy chủ xác nhận', async ({ page }) => {
  await login(page);
  await checkinN(page, 4);
  await page.click('#nav a[href="#checkout"]');
  await page.locator('#typed-no').waitFor();
  for (const no of [1, 2, 3]) await checkout(page, no);
  await page.click('#nav a[href="#shift"]');
  await expect(page.locator('#shift-revenue')).toHaveText('Tiền cần nộp: 15.000đ');
  await expect(page.locator('#shift-summary')).toContainText('Gửi xe: 4 lượt');
  await expect(page.locator('#shift-summary')).toContainText('Xe còn trong bãi: 1');
  page.once('dialog', (d) => d.accept());
  await page.click('#close-shift');
  await expect(page.locator('#toast')).toContainText('Đã chốt ca · nộp 15.000đ');
  await expect(page.locator('#shift-confirm')).toHaveText('✓ Máy chủ đã xác nhận', { timeout: 10000 });
  await expect(page.locator('#shift-revenue').first()).toHaveText('Tiền cần nộp: 0đ'); // ca mới bắt đầu từ 0
  const shift = [...mock.state.shifts.values()][0];
  expect(shift.summary).toMatchObject({ revenue: 15000, count: 3, checkins: 4, inLot: 1 });
});

test('US5: nhân viên không vào được Quản lý', async ({ page }) => {
  await login(page);
  await expect(page.locator('#nav a[href="#admin"]')).toHaveCount(0);
  await page.goto('/#admin');
  await expect(page.locator('#capture')).toBeVisible();
});

test('US5: quản lý xem báo cáo theo ngày và theo ca, đổi giá, thêm/khóa nhân viên, hủy lượt xung đột', async ({ page }) => {
  // dữ liệu: Tuấn gửi 2 xe, trả 1 xe rồi chốt ca
  await login(page, 'Tuấn', '1234');
  await checkinN(page, 2);
  await page.click('#nav a[href="#checkout"]');
  await page.locator('#typed-no').waitFor();
  await checkout(page, 1);
  await page.click('#nav a[href="#shift"]');
  page.once('dialog', (d) => d.accept());
  await page.click('#close-shift');
  await expect(page.locator('#shift-confirm')).toHaveText('✓ Máy chủ đã xác nhận', { timeout: 10000 });
  // một lượt bị trùng số do máy khác gửi offline
  mock.seedSession({ id: 'dup', ticketDate: today(), ticketNo: 2, inAt: new Date().toISOString(), inStaffId: 'st_b', inPhotoId: 'px', conflict: 'duplicate_ticket' });
  await expect(page.locator('#count-pending')).toHaveText('Chờ đồng bộ: 0');
  await page.click('#nav a:has-text("Thoát")');
  await page.locator('#staff-name').waitFor(); // chờ app lưu xong trạng thái đăng xuất

  await login(page, 'Quản lý', '111111');
  await page.click('#nav a[href="#admin"]');
  await expect(page.locator('#report-total')).toHaveText('Tổng: 5.000đ');
  await page.selectOption('#report-group', 'shift');
  await expect(page.locator('#report-rows .item')).toHaveCount(1);
  await expect(page.locator('#report-rows .item')).toContainText('Tuấn');

  // Giá
  await page.click('#admin-tabs [data-tab="prices"]');
  await expect(page.locator('#price-motorbike')).toHaveValue('5000');
  await page.fill('#price-lostFee', '15000');
  await page.click('#price-save');
  await expect(page.locator('#price-msg')).toHaveText('✓ Đã lưu bảng giá mới');
  expect(mock.state.prices.at(-1)).toMatchObject({ lostFee: 15000, motorbike: 5000 });

  // Nhân viên
  await page.click('#admin-tabs [data-tab="staff"]');
  await page.fill('#new-staff-name', 'Lan');
  await page.fill('#new-staff-pin', '4321');
  await page.click('#add-staff');
  await expect(page.locator('#staff-list [data-staff="Lan"]')).toBeVisible();
  await page.locator('#staff-list [data-staff="Hùng"] button', { hasText: 'Khóa' }).click();
  await expect(page.locator('#staff-list [data-staff="Hùng"]')).toContainText('ĐÃ KHÓA');
  expect(mock.staff.find((s) => s.name === 'Hùng').active).toBe(false);

  // Xung đột → hủy lượt
  await page.click('#admin-tabs [data-tab="conflicts"]');
  await expect(page.locator('#conflict-list .item')).toHaveCount(1);
  await expect(page.locator('#conflict-list .item')).toContainText('Trùng số phiếu');
  page.once('dialog', (d) => d.accept('Máy B gửi trùng, xe thật là phiếu 002'));
  await page.locator('#conflict-list button', { hasText: 'Hủy lượt' }).click();
  await expect(page.locator('#toast')).toContainText('Đã hủy lượt phiếu 002');
  await expect.poll(() => mock.session('dup').status, { timeout: 5000 }).toBe('cancelled');
});
