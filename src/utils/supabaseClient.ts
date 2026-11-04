import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const STORAGE_URL_KEY = 'EMONS_CUSTOM_SUPABASE_URL';
const STORAGE_KEY_KEY = 'EMONS_CUSTOM_SUPABASE_ANON_KEY';

let cachedClient: SupabaseClient | null = null;
let lastUsedUrl = '';
let lastUsedKey = '';

/**
 * Mendapatkan Supabase URL yang aktif.
 * Prioritas Utama: Environment variable VITE_SUPABASE_URL (dari Vercel / .env)
 * Di mode produksi, kredensial env Vercel adalah Single Source of Truth mutlak.
 */
export function getSupabaseUrl(): string {
  const envUrl = (import.meta as any).env?.VITE_SUPABASE_URL;
  const isDev = Boolean((import.meta as any).env?.DEV);

  // Jika di produksi, bersihkan override localStorage lama agar tidak memecah koneksi
  if (!isDev) {
    try {
      if (localStorage.getItem(STORAGE_URL_KEY)) {
        console.warn('[SupabaseClient] Menghapus override custom URL lama di produksi.');
        localStorage.removeItem(STORAGE_URL_KEY);
      }
    } catch (_) {}
  }

  if (envUrl && envUrl.trim() !== '') return envUrl.trim();

  // Hanya izinkan custom URL jika di mode development (DEV)
  if (isDev) {
    try {
      const custom = localStorage.getItem(STORAGE_URL_KEY);
      if (custom && custom.trim() !== '') return custom.trim();
    } catch (_) {}
  }

  return '';
}

/**
 * Mendapatkan Supabase Anon/Public Key yang aktif.
 */
export function getSupabaseAnonKey(): string {
  const envKey = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY;
  const isDev = Boolean((import.meta as any).env?.DEV);

  // Jika di produksi, bersihkan override localStorage lama
  if (!isDev) {
    try {
      if (localStorage.getItem(STORAGE_KEY_KEY)) {
        localStorage.removeItem(STORAGE_KEY_KEY);
      }
    } catch (_) {}
  }

  if (envKey && envKey.trim() !== '') return envKey.trim();

  if (isDev) {
    try {
      const custom = localStorage.getItem(STORAGE_KEY_KEY);
      if (custom && custom.trim() !== '') return custom.trim();
    } catch (_) {}
  }

  return '';
}

/**
 * Menyimpan kredensial Supabase dari UI Dashboard (hanya berlaku jika mode DEV)
 */
export function setSupabaseCredentials(url: string, anonKey: string): void {
  try {
    if (!url || !url.trim()) {
      localStorage.removeItem(STORAGE_URL_KEY);
    } else {
      localStorage.setItem(STORAGE_URL_KEY, url.trim());
    }

    if (!anonKey || !anonKey.trim()) {
      localStorage.removeItem(STORAGE_KEY_KEY);
    } else {
      localStorage.setItem(STORAGE_KEY_KEY, anonKey.trim());
    }

    // Invalidate cached client
    cachedClient = null;
    lastUsedUrl = '';
    lastUsedKey = '';
  } catch (e) {}
}

/**
 * Informasi diagnostik koneksi Supabase untuk panel debug (?debug=1)
 */
export function getSupabaseInfo(): {
  url: string;
  projectRef: string;
  credentialSource: 'env' | 'localStorage' | 'none';
  isConfigured: boolean;
} {
  const envUrl = (import.meta as any).env?.VITE_SUPABASE_URL;
  const url = getSupabaseUrl();
  const key = getSupabaseAnonKey();

  let source: 'env' | 'localStorage' | 'none' = 'none';
  if (url) {
    source = (envUrl && url === envUrl.trim()) ? 'env' : 'localStorage';
  }

  let projectRef = 'none';
  try {
    if (url) {
      const parsed = new URL(url);
      projectRef = parsed.hostname.split('.')[0] || 'unknown';
    }
  } catch (_) {}

  return {
    url,
    projectRef,
    credentialSource: source,
    isConfigured: Boolean(url && key)
  };
}

/**
 * Memeriksa apakah koneksi Supabase sudah dikonfigurasi
 */
export function isSupabaseConfigured(): boolean {
  return Boolean(getSupabaseUrl() && getSupabaseAnonKey());
}

/**
 * Mendapatkan instance Supabase Client tunggal (Singleton)
 */
export function getSupabase(): SupabaseClient | null {
  const url = getSupabaseUrl();
  const anonKey = getSupabaseAnonKey();

  if (!url || !anonKey) return null;

  if (cachedClient && lastUsedUrl === url && lastUsedKey === anonKey) {
    return cachedClient;
  }

  try {
    cachedClient = createClient(url, anonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      },
      realtime: {
        params: {
          eventsPerSecond: 10
        }
      }
    });
    lastUsedUrl = url;
    lastUsedKey = anonKey;
    return cachedClient;
  } catch (err) {
    console.error('Gagal inisialisasi Supabase client:', err);
    return null;
  }
}

/**
 * Uji coba koneksi ke Supabase
 */
export async function testSupabaseConnection(): Promise<{
  success: boolean;
  message: string;
  tablesFound?: string[];
}> {
  const client = getSupabase();
  if (!client) {
    return {
      success: false,
      message: 'Kredensial Supabase belum diatur (URL dan Anon Key kosong).'
    };
  }

  try {
    // Coba query cepat ke tabel quick_chips atau machines
    const { data, error } = await client
      .from('quick_chips')
      .select('id')
      .limit(1);

    if (error) {
      if (error.code === '42P01') {
        return {
          success: false,
          message: 'Terkoneksi ke Supabase, namun tabel belum dibuat. Harap jalankan SQL Schema di SQL Editor Supabase terlebih dahulu.'
        };
      }
      return {
        success: false,
        message: `Koneksi gagal (${error.code}): ${error.message}`
      };
    }

    return {
      success: true,
      message: 'Koneksi ke database Supabase berhasil dan siap digunakan!'
    };
  } catch (err: any) {
    return {
      success: false,
      message: err.message || 'Gagal menghubungi server Supabase.'
    };
  }
}

