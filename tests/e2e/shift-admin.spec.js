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
  await expect(page.locator('#checkout-done')).toContainText(`ĐÃ CHO XE RA — Phiếu ${String(no).padStart(3, '0')}`);
}

test('US5: chốt ca — tiền mặt cần nộp khớp tính tay, chuyển khoản tách riêng, máy chủ xác nhận', async ({ page }) => {
  await login(page);
  await checkinN(page, 2); // 001, 002: thu tiền mặt lúc gửi (mặc định)
  await page.click('#pay-in [data-pay="later"]'); // 003: khách trả lúc ra
  await expect(page.locator('#pay-label')).toHaveText('Khách trả 5.000đ lúc lấy xe');
  await page.click('#capture');
  await expect(page.locator('#toast')).toContainText('phiếu 003 · trả lúc ra');
  await expect(page.locator('#pay-in [data-pay="cash"]')).toHaveClass(/on/); // xe sau tự về tiền mặt
  await page.click('#pay-in [data-pay="transfer"]'); // 004: chuyển khoản lúc gửi
  await page.click('#capture');
  await expect(page.locator('#toast')).toContainText('phiếu 004 · đã thu 5.000đ (chuyển khoản)');
  await page.click('#nav a[href="#checkout"]');
  await page.locator('#typed-no').waitFor();
  for (const no of [1, 2]) await checkout(page, no);
  // 003 chưa trả → thu lúc ra, khách chuyển khoản
  await page.fill('#typed-no', '3');
  await page.click('#find-btn');
  await expect(page.locator('#fee-due')).toHaveText('Thu 5.000đ');
  await page.click('#pay-out [data-pay="transfer"]');
  await page.click('#checkout-btn');
  await expect(page.locator('#checkout-done')).toContainText('Phiếu 003');
  await expect(page.locator('#checkout-done')).toContainText('đã thu 5.000đ chuyển khoản');
  await page.click('#nav a[href="#shift"]');
  await expect(page.locator('#shift-revenue')).toHaveText('Tiền mặt cần nộp: 10.000đ');
  await expect(page.locator('#shift-transfer')).toContainText('Chuyển khoản: 10.000đ');
  await expect(page.locator('#shift-transfer')).toContainText('Tổng thu 20.000đ');
  await expect(page.locator('#shift-summary')).toContainText('Gửi xe: 4 lượt (thu ngay lúc gửi: 3)');
  await expect(page.locator('#shift-summary')).toContainText('Xe còn trong bãi: 1');
  page.once('dialog', (d) => d.accept());
  await page.click('#close-shift');
  await expect(page.locator('#toast')).toContainText('Đã chốt ca · nộp 10.000đ tiền mặt');
  await expect(page.locator('#shift-confirm')).toHaveText('✓ Máy chủ đã xác nhận', { timeout: 10000 });
  await expect(page.locator('#shift-revenue').first()).toHaveText('Tiền mặt cần nộp: 0đ'); // ca mới bắt đầu từ 0
  const shift = [...mock.state.shifts.values()][0];
  expect(shift.summary).toMatchObject({ revenue: 20000, cash: 10000, transfer: 10000, count: 3, checkins: 4, inLot: 1 });
  expect(mock.session(mock.sessions().find((s) => s.ticketNo === 3).id)).toMatchObject({ inPaid: 0, outPaid: 5000, outPayMethod: 'transfer' });
  await page.goto(`/#session?id=${mock.sessions().find((s) => s.ticketNo === 3).id}`);
  await expect(page.locator('#pay-info')).toHaveText('Thu lúc trả 5.000đ (chuyển khoản)');
  await page.goto(`/#session?id=${mock.sessions().find((s) => s.ticketNo === 4).id}`);
  await expect(page.locator('#pay-info')).toHaveText('Thu lúc gửi 5.000đ (chuyển khoản)');
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
  await expect(page.locator('#report-total')).toHaveText('Tổng: 10.000đ'); // 2 xe thu tiền mặt lúc gửi
  await expect(page.locator('#report-money')).toHaveText('Tiền mặt 10.000đ · Chuyển khoản 0đ');
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
