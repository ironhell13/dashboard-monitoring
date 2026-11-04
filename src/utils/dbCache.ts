import type { MasterRow, ParsedUptimeFile } from './excelParser';
import type { FollowUpTicket } from './spreadsheetService';

export interface CachedSnapshot {
  masterData: MasterRow[];
  parsedUptimeFiles: ParsedUptimeFile[];
  lockedPeriodes: string[];
  followUpTickets: FollowUpTicket[];
  lastUpdated: string | null;
  timestamp: number;
  matchedMachines?: any[];
}

const DB_NAME = 'DOWNTIME_BCA_CACHE_DB';
const DB_VERSION = 1;
const STORE_NAME = 'app_state';
const SNAPSHOT_KEY = 'latest_snapshot';
const FALLBACK_LS_KEY = 'DOWNTIME_BCA_SNAPSHOT_FALLBACK';

/**
 * Membuka koneksi IndexedDB dengan aman
 */
function openIndexedDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      reject(new Error('IndexedDB tidak didukung pada environment ini'));
      return;
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onerror = () => {
      reject(request.error || new Error('Gagal membuka IndexedDB'));
    };
  });
}

const MASTER_DATA_KEY = 'cached_master_data';
const UPTIME_FILES_KEY = 'cached_uptime_files';
const LOCKED_PERIODES_KEY = 'cached_locked_periodes';

/**
 * Menyimpan snapshot database ke IndexedDB (dan fallback LocalStorage jika muat)
 */
export async function saveDashboardSnapshot(snapshot: CachedSnapshot): Promise<boolean> {
  try {
    const db = await openIndexedDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.put(snapshot, SNAPSHOT_KEY);

      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
      tx.oncomplete = () => resolve();
    });
    return true;
  } catch (idbErr) {
    console.warn('Gagal menyimpan cache ke IndexedDB, mencoba LocalStorage fallback:', idbErr);
    try {
      localStorage.setItem(FALLBACK_LS_KEY, JSON.stringify(snapshot));
      return true;
    } catch (lsErr) {
      console.warn('LocalStorage juga gagal/penuh:', lsErr);
      return false;
    }
  }
}

/**
 * Menyimpan Master Data langsung ke IndexedDB tanpa batasan kuota LocalStorage 5MB
 */
export async function saveCachedMasterData(rows: MasterRow[]): Promise<boolean> {
  try {
    const db = await openIndexedDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.put(rows, MASTER_DATA_KEY);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
      tx.oncomplete = () => resolve();
    });
    return true;
  } catch (err) {
    console.warn('Gagal menyimpan master data ke IndexedDB:', err);
    return false;
  }
}

/**
 * Memuat Master Data dari IndexedDB secara instan
 */
export async function loadCachedMasterData(): Promise<MasterRow[]> {
  try {
    const db = await openIndexedDB();
    const rows = await new Promise<MasterRow[] | null>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(MASTER_DATA_KEY);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
    if (rows && Array.isArray(rows)) return rows;
  } catch (err) {
    console.warn('Gagal membaca master data dari IndexedDB:', err);
  }
  return [];
}

/**
 * Menyimpan seluruh file Uptime bulanan langsung ke IndexedDB tanpa batasan kuota 5MB
 */
export async function saveCachedUptimeFiles(files: ParsedUptimeFile[]): Promise<boolean> {
  try {
    const db = await openIndexedDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.put(files, UPTIME_FILES_KEY);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
      tx.oncomplete = () => resolve();
    });
    return true;
  } catch (err) {
    console.warn('Gagal menyimpan uptime files ke IndexedDB:', err);
    return false;
  }
}

/**
 * Memuat file Uptime bulanan dari IndexedDB secara instan
 */
export async function loadCachedUptimeFiles(): Promise<ParsedUptimeFile[]> {
  try {
    const db = await openIndexedDB();
    const files = await new Promise<ParsedUptimeFile[] | null>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(UPTIME_FILES_KEY);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
    if (files && Array.isArray(files)) return files;
  } catch (err) {
    console.warn('Gagal membaca uptime files dari IndexedDB:', err);
  }
  return [];
}

/**
 * Menyimpan daftar periode terkunci ke IndexedDB
 */
export async function saveCachedLockedPeriodes(locked: string[]): Promise<boolean> {
  try {
    const db = await openIndexedDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.put(locked, LOCKED_PERIODES_KEY);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
      tx.oncomplete = () => resolve();
    });
    return true;
  } catch (err) {
    return false;
  }
}

/**
 * Memuat daftar periode terkunci dari IndexedDB
 */
export async function loadCachedLockedPeriodes(): Promise<string[]> {
  try {
    const db = await openIndexedDB();
    const locked = await new Promise<string[] | null>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(LOCKED_PERIODES_KEY);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
    if (locked && Array.isArray(locked)) return locked;
  } catch (err) {}
  return [];
}

/**
 * Mengambil snapshot database yang tersimpan di cache lokal
 * Sangat cepat (< 30ms) sehingga dashboard bisa langsung tampil tanpa menunggu Apps Script
 */
export async function loadDashboardSnapshot(): Promise<CachedSnapshot | null> {
  try {
    const db = await openIndexedDB();
    const snapshot = await new Promise<CachedSnapshot | null>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(SNAPSHOT_KEY);

      req.onsuccess = () => {
        resolve(req.result || null);
      };
      req.onerror = () => {
        reject(req.error);
      };
    });

    if (snapshot && snapshot.masterData?.length > 0) {
      return snapshot;
    }
  } catch (err) {
    console.warn('Gagal membaca cache dari IndexedDB, mencoba fallback:', err);
  }

  // Fallback ke LocalStorage
  try {
    const raw = localStorage.getItem(FALLBACK_LS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.masterData?.length > 0) {
        return parsed as CachedSnapshot;
      }
    }
  } catch (e) {}

  return null;
}

/**
 * Menghapus cache lokal jika ingin melakukan reset data
 */
export async function clearDashboardSnapshot(): Promise<boolean> {
  try {
    const db = await openIndexedDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.delete(SNAPSHOT_KEY);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (e) {}

  try {
    localStorage.removeItem(FALLBACK_LS_KEY);
  } catch (e) {}

  return true;
}

// ==========================================
// MONITORING & DAILY INCIDENTS CACHE
// ==========================================
const INCIDENT_DATASET_KEY = 'incident_active_dataset';
const INCIDENT_ACTIONS_KEY = 'incident_actions_cache';

/**
 * Menyimpan dataset insiden aktif (No-op: Supabase Cloud DB sebagai Single Source of Truth)
 */
export async function saveActiveIncidentDataset(_rows: any[]): Promise<boolean> {
  return true;
}

/**
 * Mengambil dataset insiden aktif dari IndexedDB (Dinonaktifkan agar Supabase menjadi Single Source of Truth)
 */
export async function loadActiveIncidentDataset(): Promise<any[]> {
  return [];
}

/**
 * Menyimpan riwayat tindakan (action) insiden (No-op: langsung disimpan ke Supabase Cloud DB)
 */
export async function saveLocalAction(_action: any): Promise<boolean> {
  return true;
}

/**
 * Mengambil riwayat tindakan lokal dari IndexedDB
 */
export async function loadLocalActions(incidentKey?: string): Promise<any[]> {
  try {
    const db = await openIndexedDB();
    const actions: any[] = await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(INCIDENT_ACTIONS_KEY);
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });

    if (incidentKey) {
      return actions.filter((a) => a.incidentKey === incidentKey);
    }
    return actions;
  } catch (err) {
    return [];
  }
}

// ==========================================
// MONITORING SNAPSHOT CACHE (PERSIS SEPERTI KA OPS)
// ==========================================
export interface MonitoringSnapshot {
  openIncidents: any[];
  allDailyIncidents: any[];
  historyResults?: any[];
  lastSyncTime: number;
}

const MONITORING_SNAPSHOT_KEY = 'monitoring_full_snapshot';
const MONITORING_LS_SNAPSHOT = 'MONITORING_SNAPSHOT_FALLBACK';

/**
 * Menyimpan snapshot monitoring ke IndexedDB agar kunjungan berikutnya instan (< 10ms)
 */
export async function saveMonitoringSnapshot(_snapshot: MonitoringSnapshot): Promise<boolean> {
  return true;
}

/**
 * Membersihkan seluruh cache monitoring & incident dari IndexedDB dan LocalStorage
 */
export async function clearMonitoringCache(): Promise<boolean> {
  try {
    const db = await openIndexedDB();
    await new Promise<void>((resolve) => {
      try {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        store.delete(MONITORING_SNAPSHOT_KEY);
        store.delete(INCIDENT_DATASET_KEY);
        store.delete(INCIDENT_ACTIONS_KEY);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      } catch (_) {
        resolve();
      }
    });
  } catch (_) {}

  // Bersihkan key legacy dari LocalStorage
  const keysToRemove = [
    'MONITORING_ACTIVE_DATASET',
    'MONITORING_INCIDENTS_LOCAL',
    'MONITORING_OPEN_CACHE',
    'MONITORING_ACTIONS_LOCAL',
    'MONITORING_ACTIONS',
    'MONITORING_UPLOAD_LOGS',
    'MONITORING_DAILY_SNAPSHOT',
    'MONITORING_LAST_SYNC',
    'MONITORING_INCIDENTS',
    'MONITORING_SNAPSHOT_FALLBACK',
    'LOCAL_STORAGE_INCIDENTS',
    'LOCAL_STORAGE_ACTIONS',
    'LOCAL_STORAGE_OPEN_CACHE',
    'LOCAL_STORAGE_ACTIVE_DATA'
  ];
  for (const k of keysToRemove) {
    try {
      localStorage.removeItem(k);
    } catch (_) {}
  }

  return true;
}

/**
 * Memuat snapshot monitoring dari IndexedDB (Dinonaktifkan agar Supabase menjadi Single Source of Truth)
 */
export async function loadMonitoringSnapshot(): Promise<MonitoringSnapshot | null> {
  return null;
}

