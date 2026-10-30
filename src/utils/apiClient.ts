/**
 * Client API Bridge: Komunikasi Frontend Vercel ke Google Apps Script REST API
 * Dilengkapi fallback cerdas, pencegahan CORS preflight, dan dukungan custom API URL.
 */

export const DEFAULT_GAS_API_URL = 'https://script.google.com/macros/s/AKfycbxNfS0X4VcyuZ8fLR8MTPC0IbkliMKakBWKrIZJhejovMNFGG1KKHK1beeeCxusufpx/exec';

const STORAGE_CUSTOM_URL_KEY = 'CUSTOM_GAS_API_URL';

/**
 * Mendapatkan URL Backend API Apps Script yang aktif.
 * Prioritas:
 * 1. Custom URL yang diisi user di modal pengaturan (tersimpan di localStorage)
 * 2. Environment variable VITE_GAS_API_URL dari Vercel
 * 3. Default Production Google Apps Script Web App URL
 */
export function getBackendApiUrl(): string {
  try {
    const custom = localStorage.getItem(STORAGE_CUSTOM_URL_KEY);
    if (custom && custom.trim() !== '') {
      return custom.trim();
    }
  } catch (e) {}

  const envUrl = (import.meta as any).env?.VITE_GAS_API_URL;
  if (envUrl && envUrl.trim() !== '') {
    return envUrl.trim();
  }

  return DEFAULT_GAS_API_URL;
}

/**
 * Menyimpan custom URL Backend dari modal pengaturan
 */
export function setBackendApiUrl(url: string): void {
  try {
    if (!url || url.trim() === '') {
      localStorage.removeItem(STORAGE_CUSTOM_URL_KEY);
    } else {
      localStorage.setItem(STORAGE_CUSTOM_URL_KEY, url.trim());
    }
  } catch (e) {}
}

/**
 * Memeriksa apakah backend API sudah terkonfigurasi
 */
export function isBackendConfigured(): boolean {
  return getBackendApiUrl() !== '';
}

/**
 * Melakukan HTTP GET request ke Backend API dengan proteksi timeout cerdas
 */
export async function apiGet<T = any>(
  action: string,
  params: Record<string, any> = {},
  timeoutMs: number = 35000
): Promise<T> {
  const baseUrl = getBackendApiUrl();
  if (!baseUrl) {
    throw new Error('URL Backend Google Apps Script belum dikonfigurasi.');
  }

  const queryParts: string[] = [`action=${encodeURIComponent(action)}`];
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) {
      queryParts.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
    }
  }

  const sep = baseUrl.includes('?') ? '&' : '?';
  const fullUrl = `${baseUrl}${sep}${queryParts.join('&')}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(fullUrl, {
      method: 'GET',
      redirect: 'follow',
      headers: {
        Accept: 'application/json'
      },
      signal: controller.signal
    });

    if (!res.ok) {
      throw new Error(`HTTP error ${res.status}: ${res.statusText}`);
    }

    return await res.json();
  } catch (err: any) {
    if (err.name === 'AbortError') {
      throw new Error(`Permintaan ke database melebihi batas waktu (${Math.round(timeoutMs / 1000)} detik). Server Google Apps Script sedang sibuk.`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Melakukan HTTP POST request ke Backend API
 * Menggunakan Content-Type: text/plain;charset=utf-8 untuk menghindari
 * browser CORS preflight (OPTIONS) saat memanggil langsung URL Apps Script.
 */
export async function apiPost<T = any>(
  action: string,
  body: Record<string, any> = {},
  timeoutMs: number = 60000
): Promise<T> {
  const baseUrl = getBackendApiUrl();
  if (!baseUrl) {
    throw new Error('URL Backend Google Apps Script belum dikonfigurasi.');
  }

  const payload = JSON.stringify({
    action,
    ...body
  });

  let lastErr: any = null;
  const maxRetries = 2;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(baseUrl, {
        method: 'POST',
        redirect: 'follow',
        headers: {
          'Content-Type': 'text/plain;charset=utf-8'
        },
        body: payload,
        signal: controller.signal
      });

      if (!res.ok) {
        throw new Error(`HTTP error ${res.status}: ${res.statusText}`);
      }

      return await res.json();
    } catch (err: any) {
      lastErr = err;
      if (err.name === 'AbortError') {
        lastErr = new Error(`POST request "${action}" melebihi batas waktu (${Math.round(timeoutMs / 1000)} detik).`);
      }
      console.warn(`apiPost attempt ${attempt + 1} failed for action "${action}":`, err);
      if (attempt < maxRetries && err.name !== 'AbortError') {
        await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));
      }
    } finally {
      clearTimeout(timer);
    }
  }

  throw lastErr;
}
