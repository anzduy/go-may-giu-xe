import { test, expect } from '@playwright/test';
import { createMock, login, today } from './fixtures/mock-api.js';

let mock;
test.beforeEach(async ({ context }) => {
  mock = createMock();
  await mock.attach(context);
  mock.seedBatch(today(), 1, 200);
});

const ctxOpts = { permissions: ['camera'], serviceWorkers: 'block', viewport: { width: 390, height: 844 } };

async function checkinN(page, n) {
  for (let i = 1; i <= n; i++) {
    await page.click('#capture');
    await expect(page.locator('#toast')).toContainText(`phiếu ${String(i).padStart(3, '0')}`);
  }
}

test('US6: mất mạng gửi 10 xe — ảnh xem được ngay; có mạng lại ảnh tự lên cloud', async ({ page, context }) => {
  await login(page);
  await context.setOffline(true);
  await checkinN(page, 10);
  await expect(page.locator('#count-photos')).toHaveText('Ảnh chờ sao lưu: 10');
  await page.click('#nav a[href="#lot"]');
  await expect(page.locator('#lot-grid .tile img')).toHaveCount(10); // ảnh trên máy, không cần mạng
  expect(mock.photos.size).toBe(0);

  await context.setOffline(false);
  await expect.poll(() => mock.photos.size, { timeout: 30000 }).toBe(10);
  await expect(page.locator('#count-photos')).toHaveText('Ảnh chờ sao lưu: 0', { timeout: 10000 });
  expect([...mock.photos.values()].every((p) => p.kind === 'in' && p.jpegBase64.length > 100)).toBe(true);
});

test('US6: ảnh lúc ra được tải lên trước ảnh lúc vào', async ({ page, context }) => {
  await login(page);
  await context.setOffline(true);
  await checkinN(page, 3);
  await page.click('#nav a[href="#checkout"]');
  await page.fill('#typed-no', '2');
  await page.click('#find-btn');
  await page.click('#checkout-btn');
  await expect(page.locator('#toast')).toContainText('Đã trả xe phiếu 002');
  await context.setOffline(false);
  await expect.poll(() => mock.photos.size, { timeout: 30000 }).toBe(4);
  const order = mock.requests.filter((r) => r.action === 'uploadPhoto').map((r) => r.data.kind);
  expect(order[0]).toBe('out');
});

test('US6: máy khác (cổng ra) xem được ảnh lúc vào tải từ cloud; AI đọc biển số → tìm được bằng "345"', async ({ browser }) => {
  mock.setAnalyze((photo, session) => (session.ticketNo === 2
    ? { plate: '59X1-123.45', color: 'đỏ', vehicleType: 'motorbike', helmetsOnVehicle: 2, helmetsWorn: 0, otherItems: [], confidence: { plate: 0.95, color: 0.9, helmets: 0.9 }, status: 'done' }
    : null));
  const gateIn = await browser.newContext(ctxOpts);
  const gateOut = await browser.newContext(ctxOpts);
  await mock.attach(gateIn);
  await mock.attach(gateOut);
  const a = await gateIn.newPage();
  const b = await gateOut.newPage();
  await login(a, 'Tuấn', '1234');
  await checkinN(a, 3);
  await expect.poll(() => mock.photos.size, { timeout: 20000 }).toBe(3);

  await login(b, 'Hùng', '5678');
  await b.click('#nav a[href="#checkout"]');
  await expect.poll(() => b.evaluate(async () => (await window.__gomay.db.allSessions()).length), { timeout: 10000 }).toBe(3);
  await b.fill('#typed-no', '2');
  await b.click('#find-btn');
  await expect(b.locator('#checkout-view img.photo')).toHaveCount(1, { timeout: 10000 }); // ảnh tải từ cloud
  await expect(b.locator('#confirm-info')).toContainText('59X1-123.45');
  await expect(b.locator('#in-summary')).toHaveText('Xe máy màu đỏ · 2 mũ');

  await b.click('#nav a[href="#lot"]');
  await b.fill('#lot-search', '345');
  await expect(b.locator('#lot-grid .tile')).toHaveCount(1);
  await expect(b.locator('#lot-grid .tile')).toContainText('Phiếu 002');
  await gateIn.close();
  await gateOut.close();
});

test('US6: sửa tay biển số ở chi tiết lượt → đồng bộ lên máy chủ', async ({ page }) => {
  await login(page);
  await checkinN(page, 1);
  await expect.poll(() => mock.sessions().length).toBe(1);
  const id = mock.sessions()[0].id;
  await page.goto(`/#session?id=${id}`);
  await page.fill('#plate-input', '59x1-999.99');
  await page.click('#plate-save');
  await expect(page.locator('#plate-status')).toHaveText('Biển số: nhập tay');
  await expect.poll(() => mock.session(id).plate, { timeout: 5000 }).toBe('59X1-999.99');
  expect(mock.session(id).plateStatus).toBe('manual');
});

test('US6: dọn ảnh trên máy chỉ bỏ ảnh đã sao lưu > 7 ngày; ảnh chưa sao lưu không bao giờ bị dọn', async ({ page, context }) => {
  await login(page);
  await context.setOffline(true);
  await checkinN(page, 2);
  const r = await page.evaluate(async () => {
    const { db } = window.__gomay;
    const sessions = await db.allSessions();
    const [p1] = await db.photosBySession(sessions[0].id);
    const [p2] = await db.photosBySession(sessions[1].id);
    const old = new Date(Date.now() - 8 * 86400000).toISOString();
    await db.putPhoto({ ...p1, takenAt: old, uploadState: 'done' }); // đã sao lưu, cũ
    await db.putPhoto({ ...p2, takenAt: old }); // CHƯA sao lưu, cũ
    const n = await db.prunePhotos();
    return { n, p1: !!(await db.getPhoto(p1.id)).blob, p2: !!(await db.getPhoto(p2.id)).blob };
  });
  expect(r).toEqual({ n: 1, p1: false, p2: true });
});
