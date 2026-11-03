import { test, expect } from '@playwright/test';
import { createMock, login, SECRET } from './fixtures/mock-api.js';
import { parseQr, dateKey } from '../../web/shared/ticket.js';

test('US3: quản lý tạo 200 phiếu → 9 trang A4, tạo thêm 50 nối tiếp từ 201', async ({ page, context }) => {
  const mock = createMock();
  await mock.attach(context);
  await login(page, 'Quản lý', '111111');
  await page.click('#nav a[href="#print"]');
  const t0 = Date.now();
  await page.click('#create-batch');
  await expect(page.locator('#batch-msg')).toContainText('Phiếu 001–200');
  expect(Date.now() - t0).toBeLessThan(60000); // SC-003
  await expect(page.locator('.print-page')).toHaveCount(9);
  await expect(page.locator('.ticket')).toHaveCount(200);
  await expect(page.locator('.ticket .no').first()).toHaveText('001');
  await expect(page.locator('.ticket .qr svg').first()).toBeVisible();
  const tomorrow = dateKey(Date.now() + 86400000);
  expect(mock.state.batches[0]).toMatchObject({ date: tomorrow, fromNo: 1, toNo: 200 });

  await page.fill('#batch-count', '50');
  await page.click('#create-batch');
  await expect(page.locator('#batch-msg')).toContainText('Phiếu 201–250');
  await expect(page.locator('.ticket .no').first()).toHaveText('201');
  await expect(page.locator('#batch-list .item')).toHaveCount(2);
  expect(parseQr(mock.state.batches.length && (await import('../../web/shared/ticket.js')).encodeQr(tomorrow, 201, SECRET), SECRET)).toMatchObject({ ok: true, no: 201 });
});

test('US3: nhân viên không thấy và không mở được mục In phiếu', async ({ page, context }) => {
  const mock = createMock();
  await mock.attach(context);
  await login(page, 'Tuấn', '1234');
  await expect(page.locator('#nav a[href="#print"]')).toHaveCount(0);
  await page.goto('/#print');
  await expect(page.locator('#capture')).toBeVisible(); // bị đưa về màn hình gửi xe
});
