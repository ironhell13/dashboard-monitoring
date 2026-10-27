import type { MasterRow, ParsedUptimeFile } from './excelParser';
import type { FollowUpTicket } from './spreadsheetService';

export interface CachedSnapshot {
  masterData: MasterRow[];
  parsedUptimeFiles: ParsedUptimeFile[];
  lockedPeriodes: string[];
  followUpTickets: FollowUpTicket[];
  lastUpdated: string | null;
  timestamp: number;
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
 * Menyimpan dataset insiden aktif ke IndexedDB (kapasitas puluhan MB, tanpa limit 5MB LocalStorage)
 */
export async function saveActiveIncidentDataset(rows: any[]): Promise<boolean> {
  try {
    const db = await openIndexedDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.put(rows, INCIDENT_DATASET_KEY);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
      tx.oncomplete = () => resolve();
    });
    return true;
  } catch (err) {
    console.warn('Gagal menyimpan incident dataset ke IndexedDB:', err);
    try {
      localStorage.setItem('MONITORING_ACTIVE_DATASET', JSON.stringify(rows.slice(0, 500)));
    } catch (e) {}
    return false;
  }
}

/**
 * Mengambil dataset insiden aktif dari IndexedDB secara instan (< 30ms)
 */
export async function loadActiveIncidentDataset(): Promise<any[]> {
  try {
    const db = await openIndexedDB();
    const rows = await new Promise<any[] | null>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(INCIDENT_DATASET_KEY);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
    if (rows && Array.isArray(rows) && rows.length > 0) {
      return rows;
    }
  } catch (err) {
    console.warn('Gagal membaca incident dataset dari IndexedDB:', err);
  }

  // Fallback ke LocalStorage
  try {
    const raw = localStorage.getItem('MONITORING_ACTIVE_DATASET');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch (e) {}

  return [];
}

/**
 * Menyimpan riwayat tindakan (action) insiden secara lokal di IndexedDB
 */
export async function saveLocalAction(action: any): Promise<boolean> {
  try {
    const db = await openIndexedDB();
    const existing: any[] = await new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(INCIDENT_ACTIONS_KEY);
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => resolve([]);
    });

    const updated = [action, ...existing.filter((a) => a.logId !== action.logId)];

    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.put(updated, INCIDENT_ACTIONS_KEY);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
      tx.oncomplete = () => resolve();
    });
    return true;
  } catch (err) {
    console.warn('Gagal menyimpan local action ke IndexedDB:', err);
    return false;
  }
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
export async function saveMonitoringSnapshot(snapshot: MonitoringSnapshot): Promise<boolean> {
  try {
    const db = await openIndexedDB();

    // Pastikan jika array di snapshot baru kosong, jangan menimpa data cache lama yang sudah ada
    const existing: MonitoringSnapshot | null = await new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const req = store.get(MONITORING_SNAPSHOT_KEY);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => resolve(null);
      } catch (e) {
        resolve(null);
      }
    });

    const safeSnapshot: MonitoringSnapshot = {
      openIncidents:
        snapshot.openIncidents && snapshot.openIncidents.length > 0
          ? snapshot.openIncidents
          : existing?.openIncidents || [],
      allDailyIncidents:
        snapshot.allDailyIncidents && snapshot.allDailyIncidents.length > 0
          ? snapshot.allDailyIncidents
          : existing?.allDailyIncidents || [],
      historyResults:
        snapshot.historyResults && snapshot.historyResults.length > 0
          ? snapshot.historyResults
          : existing?.historyResults || [],
      lastSyncTime: snapshot.lastSyncTime || Date.now()
    };

    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.put(safeSnapshot, MONITORING_SNAPSHOT_KEY);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
      tx.oncomplete = () => resolve();
    });
    return true;
  } catch (err) {
    console.warn('Gagal menyimpan monitoring snapshot ke IndexedDB:', err);
    try {
      localStorage.setItem(
        MONITORING_LS_SNAPSHOT,
        JSON.stringify({
          openIncidents: snapshot.openIncidents,
          allDailyIncidents: (snapshot.allDailyIncidents || []).slice(0, 500),
          lastSyncTime: snapshot.lastSyncTime
        })
      );
    } catch (e) {}
    return false;
  }
}

/**
 * Memuat snapshot monitoring dari IndexedDB secara instan (< 10ms)
 * Problem Open, History, dan Frekuensi langsung tampil tanpa menunggu Apps Script
 */
export async function loadMonitoringSnapshot(): Promise<MonitoringSnapshot | null> {
  try {
    const db = await openIndexedDB();
    const snapshot = await new Promise<MonitoringSnapshot | null>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(MONITORING_SNAPSHOT_KEY);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });

    if (snapshot && (snapshot.openIncidents?.length > 0 || snapshot.allDailyIncidents?.length > 0)) {
      return snapshot;
    }
  } catch (err) {
    console.warn('Gagal membaca monitoring snapshot dari IndexedDB:', err);
  }

  // Fallback ke LocalStorage
  try {
    const raw = localStorage.getItem(MONITORING_LS_SNAPSHOT);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && (parsed.openIncidents?.length > 0 || parsed.allDailyIncidents?.length > 0)) {
        return parsed as MonitoringSnapshot;
      }
    }
  } catch (e) {}

  return null;
}

