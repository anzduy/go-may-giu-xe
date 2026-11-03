import { test, expect } from '@playwright/test';
import { createMock, login, scan, today, SECRET } from './fixtures/mock-api.js';
import { encodeQr, dateKey } from '../../web/shared/ticket.js';

let mock;
test.beforeEach(async ({ context }) => {
  mock = createMock();
  await mock.attach(context);
  mock.seedBatch(today(), 1, 200);
});

const toast = (page) => page.locator('#toast');

async function checkinN(page, n) {
  for (let i = 1; i <= n; i++) {
    await page.click('#capture');
    await expect(toast(page)).toContainText(`phiếu ${String(i).padStart(3, '0')}`);
  }
}

async function typeNo(page, no) {
  await page.fill('#typed-no', String(no));
  await page.click('#find-btn');
}

test('US2: trả xe bằng quét QR và gõ số, tự chụp ảnh ra, ảnh vào/ra cạnh nhau', async ({ page }) => {
  await login(page);
  await checkinN(page, 3);
  await page.click('#nav a[href="#checkout"]');
  await page.locator('#typed-no').waitFor();

  // Quét QR phiếu 001
  const t0 = Date.now();
  await scan(page, encodeQr(today(), 1, SECRET));
  await expect(page.locator('#confirm-info')).toContainText('Phiếu 001');
  await expect(page.locator('#confirm-info')).toContainText('Thu 5.000đ');
  await expect(page.locator('#checkout-view img.photo')).toHaveCount(1); // ảnh lúc vào
  await page.click('#checkout-btn');
  await expect(toast(page)).toContainText('Đã trả xe phiếu 001 · Thu 5.000đ');
  expect(Date.now() - t0).toBeLessThan(8000); // SC-008

  // Gõ "2" (không cần số 0 ở đầu)
  await typeNo(page, '2');
  await expect(page.locator('#confirm-info')).toContainText('Phiếu 002');
  await page.click('#checkout-btn');
  await expect(toast(page)).toContainText('Đã trả xe phiếu 002');

  // Quét lại phiếu đã trả
  await scan(page, encodeQr(today(), 1, SECRET));
  await expect(page.locator('#checkout-msg')).toContainText('Phiếu đã trả xe lúc');
  // Phiếu chưa dùng
  await typeNo(page, '50');
  await expect(page.locator('#checkout-msg')).toHaveText('Phiếu này chưa gửi xe nào');

  // Không khớp → không trả xe, chuyển sang tìm xe trong bãi
  await typeNo(page, '3');
  await page.click('#mismatch-btn');
  await expect(page).toHaveURL(/#lot\?mode=lost/);
  await expect(page.locator('#lot-grid .tile')).toHaveCount(1);

  await expect.poll(() => mock.sessions().filter((s) => s.status === 'returned').length, { timeout: 5000 }).toBe(2);
  const s1 = mock.sessions().find((s) => s.ticketNo === 1);
  expect(s1).toMatchObject({ status: 'returned', fee: 5000 });
  expect(s1.outPhotoId).toBeTruthy();
  expect(mock.sessions().find((s) => s.ticketNo === 3).status).toBe('in_lot');

  // Chi tiết lượt: 2 ảnh cạnh nhau
  await page.goto(`/#session?id=${s1.id}`);
  await expect(page.locator('#photo-pair img')).toHaveCount(2);
  await expect(page.locator('.timeline')).toContainText('Trả xe');
});

test('US2: hai lượt cùng số (hôm qua chưa lấy + hôm nay) → chọn theo ảnh và ngày', async ({ page }) => {
  const yesterday = dateKey(Date.now() - 86400000);
  mock.seedSession({ id: 'y37', ticketDate: yesterday, ticketNo: 37, inAt: new Date(Date.now() - 86400000).toISOString(), inStaffId: 'st_a', inPhotoId: 'p-y' });
  mock.seedSession({ id: 't37', ticketDate: today(), ticketNo: 37, inAt: new Date().toISOString(), inStaffId: 'st_a', inPhotoId: 'p-t' });
  await login(page);
  await page.click('#nav a[href="#checkout"]');
  await page.locator('#typed-no').waitFor();
  await expect.poll(() => page.evaluate(async () => (await window.__gomay.db.allSessions()).length)).toBe(2);
  await typeNo(page, '37');
  await expect(page.locator('#choose-list .item')).toHaveCount(2);
  // QR có ngày → ra thẳng đúng lượt
  await page.getByRole('button', { name: '← Quay lại' }).click();
  await scan(page, encodeQr(yesterday, 37, SECRET));
  await expect(page.locator('#confirm-info')).toContainText('phiếu ngày');
});

test('US2 + FR-014: máy cổng vào gửi xe, máy cổng ra thấy trong 5 giây và trả xe', async ({ browser }) => {
  const gateIn = await browser.newContext({ permissions: ['camera'], serviceWorkers: 'block', viewport: { width: 390, height: 844 } });
  const gateOut = await browser.newContext({ permissions: ['camera'], serviceWorkers: 'block', viewport: { width: 390, height: 844 } });
  await mock.attach(gateIn);
  await mock.attach(gateOut);
  const a = await gateIn.newPage();
  const b = await gateOut.newPage();
  await login(a, 'Tuấn', '1234');
  await login(b, 'Hùng', '5678');
  await b.click('#nav a[href="#checkout"]');
  await b.locator('#typed-no').waitFor();

  await a.click('#capture');
  await expect(a.locator('#toast')).toContainText('phiếu 001');
  const t0 = Date.now();
  await expect.poll(() => b.evaluate(async () => (await window.__gomay.db.allSessions()).filter((s) => s.status === 'in_lot').length), { timeout: 5000, intervals: [200] }).toBe(1);
  expect(Date.now() - t0).toBeLessThan(5000);

  await typeNo(b, '1');
  await expect(b.locator('#confirm-info')).toContainText('Tuấn nhận');
  await b.click('#checkout-btn');
  await expect(b.locator('#toast')).toContainText('Đã trả xe phiếu 001');
  await expect.poll(() => mock.sessions()[0].status, { timeout: 5000 }).toBe('returned');
  expect(mock.sessions()[0].outStaffId).toBe('st_b');
  await gateIn.close();
  await gateOut.close();
});

test('US2: trả xe tạm khi máy chưa có dữ liệu phiếu, rồi tự ghép khi lượt gửi đến', async ({ page }) => {
  await login(page, 'Hùng', '5678');
  await page.click('#nav a[href="#checkout"]');
  await page.locator('#typed-no').waitFor(); // chờ bộ quét bật xong
  await scan(page, encodeQr(today(), 12, SECRET));
  await expect(page.locator('#checkout-msg')).toHaveText('Phiếu này chưa gửi xe nào');
  await page.click('#provisional-btn');
  await page.click('#provisional-go');
  await expect(page.locator('.error-text').last()).toHaveText('Bắt buộc ghi chú lý do');
  await page.fill('#provisional-note', 'Máy cổng vào mất mạng, đã xem cà vẹt');
  await page.click('#provisional-go');
  await expect(page.locator('#toast')).toContainText('Đã trả xe tạm phiếu 012');
  await expect.poll(() => mock.sessions()[0]?.status, { timeout: 5000 }).toBe('provisional');

  // Máy cổng vào đồng bộ lượt gửi phiếu 012 → máy chủ ghép
  const { applyPush } = await import('../../web/shared/server-ops.js');
  applyPush(mock.state, [{ opId: 'late', type: 'createSession', staffId: 'st_a', deviceId: 'dA', createdAt: new Date().toISOString(),
    payload: { id: 'late12', ticketDate: today(), ticketNo: 12, noTicket: false, vehicleType: 'motorbike', inAt: new Date(Date.now() - 600000).toISOString(), inPhotoId: 'px' } }]);
  expect(mock.session('late12')).toMatchObject({ status: 'returned', fee: 5000, outStaffId: 'st_b' });
});
