// Đọc biển số + màu TRÊN ĐIỆN THOẠI (web/js/plate-reader.js), không cần AI trên mạng.
// Bộ đọc thật được kiểm ở plate-reader.spec.js; ở đây thay bằng window.__gomayAnalyzer để kiểm luồng app.
import { test, expect } from '@playwright/test';
import { createMock, login, today } from './fixtures/mock-api.js';

let mock;
test.beforeEach(async ({ context }) => {
  mock = createMock(); // máy chủ KHÔNG có khóa AI (setAnalyze không gọi)
  await mock.attach(context);
  mock.seedBatch(today(), 1, 200);
});
test.setTimeout(90000);

// Lần đọc thứ 1 (ảnh vào) → biển A màu đen; lần 2 (ảnh ra) → biển B màu đen.
const fakeReader = () => {
  window.__reads = 0;
  window.__gomayAnalyzer = async () => {
    window.__reads++;
    const plate = window.__reads === 1 ? '77-C1 399.97' : '59X1-123.45';
    return { plate, color: 'đen', vehicleType: 'motorbike', helmetsOnVehicle: 0, helmetsWorn: 0, otherItems: [],
      confidence: { plate: 0.95, color: 0.8, helmets: 0 }, status: 'done', source: 'device', region: 'Vietnam' };
  };
};

test('Điện thoại tự đọc biển số: hiện ngay trên máy, gửi kèm ảnh lên máy chủ, trả xe khác biển → cảnh báo', async ({ page }) => {
  await page.addInitScript(fakeReader);
  await login(page);
  await page.click('#capture');
  await expect(page.locator('#toast')).toContainText('phiếu 001');
  // biển số có ngay trên máy (không chờ máy chủ)
  await expect.poll(() => page.evaluate(async () => (await window.__gomay.db.allSessions())[0].plate), { timeout: 10000 }).toBe('77-C1 399.97');
  await page.click('#nav a[href="#lot"]');
  await expect(page.locator('#lot-grid .tile')).toContainText('77-C1 399.97');
  await page.fill('#lot-search', '39997');
  await expect(page.locator('#lot-grid .tile')).toHaveCount(1);

  // ảnh lên máy chủ kèm kết quả đọc → máy chủ gắn biển số (không gọi AI)
  await expect.poll(() => mock.deviceReports.length, { timeout: 15000 }).toBe(1);
  expect(mock.deviceReports[0]).toMatchObject({ action: 'uploadPhoto', analysis: { plate: '77-C1 399.97', source: 'device' } });
  await expect.poll(() => mock.sessions()[0].plate).toBe('77-C1 399.97');

  // trả xe: ảnh ra đọc ra biển khác → cảnh báo khác biển số, không cảnh báo mũ
  await page.click('#nav a[href="#checkout"]');
  await page.fill('#typed-no', '1');
  await page.click('#find-btn');
  await page.click('#checkout-btn');
  await expect(page.locator('#alert-float .alert-card')).toBeVisible({ timeout: 20000 });
  expect(mock.alerts().map((a) => a.kind)).toEqual(['plate_mismatch']);

  // chi tiết lượt: hiện kết quả đọc, ghi rõ không đếm mũ
  await page.goto(`/#session?id=${mock.sessions()[0].id}`);
  await expect(page.locator('#analysis-card')).toContainText('Biển số: 77-C1 399.97');
  await expect(page.locator('#analysis-card')).toContainText('Biển số: 59X1-123.45');
  await expect(page.locator('#analysis-card')).toContainText('Mũ: không đếm');
});

test('Xe đã gửi từ trước (bản app cũ, chưa đọc biển số) → điện thoại tải ảnh về, tự đọc rồi báo lên máy chủ', async ({ page }) => {
  const inAt = new Date(Date.now() - 3600000).toISOString();
  mock.seedSession({ id: 'OLD1', ticketDate: today(), ticketNo: 5, noTicket: false, inAt, inPhotoId: 'OLDin', inStaffId: 'st_a', inDeviceId: 'dev_cu' });
  mock.photos.set('OLDin', { photoId: 'OLDin', sessionId: 'OLD1', kind: 'in', takenAt: inAt, jpegBase64: Buffer.from('anh-cu').toString('base64') });
  await page.addInitScript(fakeReader);
  await login(page);
  await expect.poll(() => mock.deviceReports.length, { timeout: 20000 }).toBe(1);
  expect(mock.deviceReports[0]).toMatchObject({ action: 'reportAnalysis', photoId: 'OLDin', analysis: { plate: '77-C1 399.97' } });
  await expect.poll(() => mock.session('OLD1').plate).toBe('77-C1 399.97');
  await page.click('#nav a[href="#lot"]');
  await expect(page.locator('#lot-grid .tile')).toContainText('77-C1 399.97', { timeout: 10000 });
  await page.waitForTimeout(7000);
  expect(mock.deviceReports).toHaveLength(1); // không báo lặp
});
