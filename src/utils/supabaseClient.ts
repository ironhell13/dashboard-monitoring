import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const STORAGE_URL_KEY = 'EMONS_CUSTOM_SUPABASE_URL';
const STORAGE_KEY_KEY = 'EMONS_CUSTOM_SUPABASE_ANON_KEY';

let cachedClient: SupabaseClient | null = null;
let lastUsedUrl = '';
let lastUsedKey = '';

/**
 * Mendapatkan Supabase URL yang aktif.
 * Prioritas:
 * 1. Custom URL di localStorage (dari modal setting di dashboard)
 * 2. Environment variable VITE_SUPABASE_URL (dari Vercel / .env)
 */
export function getSupabaseUrl(): string {
  try {
    const custom = localStorage.getItem(STORAGE_URL_KEY);
    if (custom && custom.trim() !== '') return custom.trim();
  } catch (e) {}

  const envUrl = (import.meta as any).env?.VITE_SUPABASE_URL;
  if (envUrl && envUrl.trim() !== '') return envUrl.trim();

  return '';
}

/**
 * Mendapatkan Supabase Anon/Public Key yang aktif.
 */
export function getSupabaseAnonKey(): string {
  try {
    const custom = localStorage.getItem(STORAGE_KEY_KEY);
    if (custom && custom.trim() !== '') return custom.trim();
  } catch (e) {}

  const envKey = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY;
  if (envKey && envKey.trim() !== '') return envKey.trim();

  return '';
}

/**
 * Menyimpan kredensial Supabase dari UI Dashboard
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

