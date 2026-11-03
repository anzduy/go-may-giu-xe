// Gộp bản ghi từ máy chủ vào bản trên máy.

/**
 * Máy chủ thắng, trừ khi máy còn thao tác chưa gửi cho lượt này (giữ bản trên máy để không "nhảy ngược").
 * Cờ xung đột từ máy chủ luôn được giữ để nhân viên/quản lý thấy.
 */
export function mergeServerSession(local, server, pendingSessionIds) {
  if (!local) return server;
  if (pendingSessionIds && pendingSessionIds.has(server.id)) {
    return server.conflict ? { ...local, conflict: server.conflict } : local;
  }
  return server;
}
