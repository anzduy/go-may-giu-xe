import { describe, it, expect } from 'vitest';
import { mergeServerSession } from '../../web/shared/merge.js';

describe('gộp dữ liệu từ máy chủ', () => {
  const local = { id: 'a', status: 'returned', rev: 3 };
  const server = { id: 'a', status: 'in_lot', rev: 5 };
  it('không có bản trên máy → lấy bản máy chủ', () => expect(mergeServerSession(undefined, server, new Set())).toEqual(server));
  it('máy chủ thắng khi máy không còn thao tác chờ gửi', () => expect(mergeServerSession(local, server, new Set())).toEqual(server));
  it('máy còn thao tác chờ gửi → giữ bản trên máy', () => expect(mergeServerSession(local, server, new Set(['a'])).status).toBe('returned'));
  it('cờ xung đột từ máy chủ luôn được giữ', () =>
    expect(mergeServerSession(local, { ...server, conflict: 'duplicate_ticket' }, new Set(['a'])).conflict).toBe('duplicate_ticket'));
});
