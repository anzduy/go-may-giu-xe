// Camera sau: mở sẵn, chụp ngay từ khung hình video (không có độ trễ màn trập), nén JPEG.

const MAX_SIDE = 1280;
const QUALITY = 0.7;

/** Mở camera vào thẻ <video>. Trả về { stop, track, hasTorch } hoặc ném lỗi nếu bị từ chối quyền. */
export async function start(video) {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1440 } },
  });
  video.setAttribute('playsinline', '');
  video.muted = true;
  video.srcObject = stream;
  await video.play().catch(() => {});
  if (!video.videoWidth) await new Promise((r) => video.addEventListener('loadedmetadata', r, { once: true }));
  const track = stream.getVideoTracks()[0];
  let hasTorch = false;
  try { hasTorch = !!(track.getCapabilities && track.getCapabilities().torch); } catch { /* không hỗ trợ */ }
  return {
    track,
    hasTorch,
    stop() { stream.getTracks().forEach((t) => t.stop()); video.srcObject = null; },
    async setTorch(on) {
      if (hasTorch) await track.applyConstraints({ advanced: [{ torch: !!on }] }).catch(() => {});
    },
  };
}

/** Chụp khung hình hiện tại → Blob JPEG (cạnh dài tối đa 1280px, chất lượng 0.7). */
export function captureJpeg(video) {
  const w = video.videoWidth || 640;
  const h = video.videoHeight || 480;
  const scale = Math.min(1, MAX_SIDE / Math.max(w, h));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/jpeg', QUALITY));
}

/** Dự phòng khi không mở được camera trực tiếp: mở app camera của máy. */
export function captureViaInput() {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.capture = 'environment';
    input.onchange = async () => {
      const file = input.files && input.files[0];
      if (!file) return resolve(null);
      const img = await createImageBitmap(file);
      const scale = Math.min(1, MAX_SIDE / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((b) => resolve(b), 'image/jpeg', QUALITY);
    };
    input.click();
  });
}
