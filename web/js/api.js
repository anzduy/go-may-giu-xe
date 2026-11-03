// Gọi Apps Script. POST text/plain để không cần preflight CORS.
import { getApiUrl } from '../config.js';

const auth = { token: null, deviceId: null };

export function setAuth({ token, deviceId }) {
  if (token !== undefined) auth.token = token;
  if (deviceId !== undefined) auth.deviceId = deviceId;
}

/** @returns {Promise<{ok:boolean, data?:any, error?:{code:string,message?:string}}>} */
export async function call(action, data = {}, { timeoutMs = 20000 } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(getApiUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action, token: auth.token, deviceId: auth.deviceId, data }),
      signal: ctrl.signal,
      redirect: 'follow',
    });
    const json = await res.json();
    return json && typeof json.ok === 'boolean' ? json : { ok: false, error: { code: 'BAD_RESPONSE' } };
  } catch {
    return { ok: false, error: { code: 'OFFLINE', message: 'Không kết nối được máy chủ' } };
  } finally {
    clearTimeout(timer);
  }
}
