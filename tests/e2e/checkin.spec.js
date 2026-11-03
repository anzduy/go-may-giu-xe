import { test, expect } from '@playwright/test';
import { createMock, login, scan, today, SECRET } from './fixtures/mock-api.js';
import { computeSkipped, encodeQr, dateKey } from '../../web/shared/ticket.js';

let mock;
test.beforeEach(async ({ context }) => {
  mock = createMock();
  await mock.attach(context);
});

const toast = (page) => page.locator('#toast');

async function captureAndWait(page, no) {
  const t0 = Date.now();
  await page.click('#capture');
  await expect(toast(page)).toContainText(`phiếu ${no}`);
  return Date.now() - t0;
}

test('US1: số tự nhảy, chụp 1 chạm, sửa số, chặn số đang có xe', async ({ page }) => {
  mock.seedBatch(today(), 1, 200);
  await login(page);
  await expect(page.locator('#ticket-no')).toHaveValue('001');
  await expect(page.locator('#stock-banner')).toContainText('Còn 200 phiếu');

  for (let i = 1; i <= 5; i++) {
    const ms = await captureAndWait(page, String(i).padStart(3, '0'));
    expect(ms).toBeLessThan(5000); // SC-001
  }
  await expect(page.locator('#ticket-no')).toHaveValue('006');

  // Phiếu trên tay là 009 → sửa số; lượt sau tự đề xuất 010
  await page.fill('#ticket-no', '9');
  await page.press('#ticket-no', 'Enter');
  await captureAndWait(page, '009');
  await expect(page.locator('#ticket-no')).toHaveValue('010');

  await expect.poll(() => mock.sessions().length, { timeout: 5000 }).toBe(6);
  expect(mock.sessions().map((s) => s.ticketNo).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 9]);
  expect(computeSkipped(mock.sessions(), today())).toEqual([6, 7, 8]);
  expect(mock.sessions().every((s) => s.status === 'in_lot' && s.priceAtIn === 5000 && s.inPhotoId)).toBe(true);

  // Sửa thành số đang có xe → báo lỗi và không cho chụp
  await page.fill('#ticket-no', '3');
  await expect(page.locator('#checkin-error')).toHaveText('Phiếu 003 đang có xe trong bãi');
  await expect(page.locator('#capture')).toBeDisabled();
  await page.fill('#ticket-no', '11');
  await expect(page.locator('#capture')).toBeEnabled();
});

test('US1: hết phiếu thì báo, nhưng vẫn gửi được (chỉ cảnh báo)', async ({ page }) => {
  mock.seedBatch(today(), 1, 3);
  await login(page);
  for (const no of ['001', '002', '003']) await captureAndWait(page, no);
  await expect(page.locator('#stock-banner')).toContainText('Đã hết phiếu hôm nay');
  await expect(page.locator('#checkin-warn')).toContainText('vượt quá số phiếu');
  await expect(page.locator('#capture')).toBeEnabled();
  await captureAndWait(page, '004');
  await expect.poll(() => mock.sessions().find((s) => s.ticketNo === 4)?.conflict).toBe('out_of_range');
});

test('US1: hoàn tác trong 10 giây trả lại số cũ', async ({ page }) => {
  mock.seedBatch(today(), 1, 200);
  await login(page);
  await captureAndWait(page, '001');
  await expect(page.locator('#ticket-no')).toHaveValue('002');
  await page.getByRole('button', { name: /Hoàn tác/ }).click();
  await expect(page.locator('#ticket-no')).toHaveValue('001');
  await expect.poll(() => mock.sessions()[0]?.status, { timeout: 5000 }).toBe('cancelled');
  // Gửi lại bằng đúng số 001
  await captureAndWait(page, '001');
  await expect.poll(() => mock.sessions().filter((s) => s.status === 'in_lot').length).toBe(1);
});

test('US1: chụp lại ảnh giữ nguyên số phiếu', async ({ page }) => {
  mock.seedBatch(today(), 1, 200);
  await login(page);
  await captureAndWait(page, '001');
  await page.getByRole('button', { name: /Chụp lại/ }).click();
  await expect(toast(page)).toContainText('Đã chụp lại ảnh phiếu 001');
  await expect(page.locator('#ticket-no')).toHaveValue('002');
  const photos = await page.evaluate(async () => {
    const all = await window.__gomay.db.allSessions();
    return (await window.__gomay.db.photosBySession(all[0].id)).length;
  });
  expect(photos).toBe(1);
});

test('US1: quét QR lấy số; phiếu ngày khác bị từ chối', async ({ page }) => {
  mock.seedBatch(today(), 1, 200);
  await login(page);
  await page.click('#scan-btn');
  await scan(page, encodeQr(dateKey(Date.now() - 86400000), 7, SECRET));
  await expect(toast(page)).toContainText('Phiếu của ngày khác');
  await scan(page, encodeQr(today(), 7, SECRET));
  await expect(page.locator('#ticket-no')).toHaveValue('007');
});

test('US1: mất mạng vẫn gửi xe, có mạng lại tự đồng bộ', async ({ page, context }) => {
  mock.seedBatch(today(), 1, 200);
  await login(page);
  await context.setOffline(true);
  await captureAndWait(page, '001');
  await captureAndWait(page, '002');
  await expect(page.locator('#count-pending')).toHaveText('Chờ đồng bộ: 2');
  expect(mock.pushedOps().filter((o) => o.type === 'createSession')).toHaveLength(0);
  await context.setOffline(false);
  await expect.poll(() => mock.sessions().length, { timeout: 10000 }).toBe(2);
  await expect(page.locator('#count-pending')).toHaveText('Chờ đồng bộ: 0');
});

test('US1: gửi xe không phiếu', async ({ page }) => {
  mock.seedBatch(today(), 1, 200);
  await login(page);
  await page.click('#no-ticket-btn');
  await expect(page.locator('#ticket-no')).toHaveClass(/huge/);
  await captureAndWait(page, '001');
  await expect.poll(() => mock.sessions()[0]?.noTicket).toBe(true);
  await expect(page.locator('#ticket-no')).not.toHaveClass(/huge/);
});
