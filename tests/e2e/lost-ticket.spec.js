import { test, expect } from '@playwright/test';
import { createMock, login, scan, today, SECRET } from './fixtures/mock-api.js';
import { encodeQr } from '../../web/shared/ticket.js';

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

test('US4: lưới ảnh xe trong bãi, trả xe mất phiếu bắt buộc ghi chú, thu 10.000đ', async ({ page }) => {
  await login(page);
  await checkinN(page, 3);
  await page.click('#nav a[href="#lot"]');
  await expect(page.locator('#lot-grid .tile')).toHaveCount(3);
  await expect(page.locator('#lot-grid .tile').first()).toContainText('Phiếu 003'); // mới nhất trước

  await page.locator('#lot-grid .tile', { hasText: 'Phiếu 002' }).click();
  await page.click('#lost-btn');
  // phí mất phiếu 10.000đ là tổng; khách đã trả 5.000đ lúc gửi → thu thêm 5.000đ
  await expect(page.locator('#lost-go')).toContainText('thu 5.000đ');
  await expect(page.locator('#lot-panel')).toContainText('đã trả 5.000đ lúc gửi');
  await page.click('#lost-go');
  await expect(page.locator('#lost-error')).toHaveText('Bắt buộc ghi chú (đã kiểm tra giấy tờ gì)');
  await page.fill('#lost-note', 'Đã xem cà vẹt, tên Nguyễn Văn A');
  await page.click('#lost-go');
  await expect(page.locator('#toast')).toContainText('Đã trả xe mất phiếu 002 · thu 5.000đ');
  await expect(page.locator('#lot-grid .tile')).toHaveCount(2);

  await expect.poll(() => mock.sessions().find((s) => s.ticketNo === 2)?.status, { timeout: 5000 }).toBe('lost');
  const s2 = mock.sessions().find((s) => s.ticketNo === 2);
  expect(s2).toMatchObject({ fee: 10000, inPaid: 5000, outPaid: 5000, note: 'Đã xem cà vẹt, tên Nguyễn Văn A' });
  expect(s2.outPhotoId).toBeTruthy();

  // Sau đó có người cầm phiếu 002 tới → báo phiếu đã báo mất
  await page.click('#nav a[href="#checkout"]');
  await page.locator('#typed-no').waitFor();
  await scan(page, encodeQr(today(), 2, SECRET));
  await expect(page.locator('#checkout-msg')).toContainText('Phiếu đã báo mất, xe đã trả lúc');
});

test('US4: gán lại số phiếu — không trùng xe khác, đồng bộ lên máy chủ', async ({ page }) => {
  await login(page);
  await checkinN(page, 2);
  await page.click('#nav a[href="#lot"]');
  await page.locator('#lot-grid .tile', { hasText: 'Phiếu 002' }).click();
  await page.click('#reassign-btn');
  await page.fill('#reassign-no', '1');
  await page.fill('#reassign-note', 'đưa nhầm phiếu');
  await page.click('#reassign-go');
  await expect(page.locator('#reassign-error')).toHaveText('Phiếu 001 đang có xe khác trong bãi');
  await page.fill('#reassign-no', '7');
  await page.click('#reassign-go');
  await expect(page.locator('#toast')).toContainText('Đã gán lại phiếu 002 → 007');
  await expect(page.locator('#lot-grid .tile', { hasText: 'Phiếu 007' })).toHaveCount(1);
  await expect.poll(() => mock.sessions().map((s) => s.ticketNo).sort((a, b) => a - b), { timeout: 5000 }).toEqual([1, 7]);
});
