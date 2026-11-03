import { describe, it, expect } from 'vitest';
import { nextPhotoToUpload, shouldPrune, retryDelayMs } from '../../web/js/photo-queue.js';

const now = Date.parse('2026-11-03T12:00:00Z');
const p = (id, kind, takenAt, extra = {}) => ({ id, kind, takenAt, uploadState: 'pending', blob: {}, attempts: 0, ...extra });

describe('hàng đợi tải ảnh', () => {
  it('ảnh lúc ra được ưu tiên, sau đó ảnh vào cũ nhất', () => {
    const list = [p('a', 'in', '2026-11-03T10:00:00Z'), p('b', 'in', '2026-11-03T09:00:00Z'), p('c', 'out', '2026-11-03T11:00:00Z')];
    expect(nextPhotoToUpload(list, now).id).toBe('c');
    expect(nextPhotoToUpload(list.filter((x) => x.id !== 'c'), now).id).toBe('b');
  });
  it('ảnh lỗi chờ hết thời gian thử lại', () => {
    const list = [p('a', 'in', '2026-11-03T10:00:00Z', { uploadState: 'failed', nextAttemptAt: now + 5000 })];
    expect(nextPhotoToUpload(list, now)).toBeNull();
    expect(nextPhotoToUpload(list, now + 6000).id).toBe('a');
  });
  it('ảnh kẹt "đang tải" quá 2 phút được tải lại', () => {
    const list = [p('a', 'in', '2026-11-03T10:00:00Z', { uploadState: 'uploading', uploadingAt: now - 60000 })];
    expect(nextPhotoToUpload(list, now)).toBeNull();
    expect(nextPhotoToUpload(list, now + 70000).id).toBe('a');
  });
  it('bỏ qua ảnh đã xong hoặc không có dữ liệu ảnh', () => {
    expect(nextPhotoToUpload([p('a', 'in', 'x', { uploadState: 'done' }), p('b', 'in', 'x', { blob: null })], now)).toBeNull();
  });
  it('thời gian chờ tăng dần, tối đa 60 giây', () => {
    expect(retryDelayMs(1)).toBe(4000);
    expect(retryDelayMs(10)).toBe(60000);
  });
});

describe('dọn ảnh trên máy', () => {
  const old = '2026-10-25T10:00:00Z';
  it('chỉ dọn ảnh ĐÃ sao lưu và cũ hơn 7 ngày', () => {
    expect(shouldPrune(p('a', 'in', old, { uploadState: 'done' }), now)).toBe(true);
    expect(shouldPrune(p('a', 'in', '2026-11-01T10:00:00Z', { uploadState: 'done' }), now)).toBe(false);
  });
  it('KHÔNG BAO GIỜ dọn ảnh chưa sao lưu', () => {
    for (const st of ['pending', 'uploading', 'failed']) expect(shouldPrune(p('a', 'in', old, { uploadState: st }), now)).toBe(false);
  });
});
