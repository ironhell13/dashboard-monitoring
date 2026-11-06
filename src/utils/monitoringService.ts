import { authenticateUserSupabase } from './supabaseService';
import { cleanWsid } from './dailyIncidentParser';
import { isSupabaseConfigured } from './supabaseClient';
import {
  fetchOpenIncidentsSupabase,
  uploadIncidentsToSupabase,
  saveIncidentActionSupabase,
  bulkSaveIncidentActionSupabase,
  fetchIncidentHistorySupabase,
  fetchWsidPenangananHistorySupabase,
  searchIncidentsSupabase,
  fetchDailyIncidentsFromDbSupabase,
  fetchUploadLogsSupabase,
  subscribeActiveIncidentsSupabase,
  mapRowToOpenIncident,
  mapRowToDailyIncidentRow,
  extractDateStrFromRaw,
  getMachineMetadata,
  toWibDateTimeString,
  type RealtimeIncidentPayload
} from './supabaseService';

export {
  subscribeActiveIncidentsSupabase,
  mapRowToOpenIncident,
  mapRowToDailyIncidentRow,
  extractDateStrFromRaw,
  getMachineMetadata,
  toWibDateTimeString,
  type RealtimeIncidentPayload
};

export interface OpenIncidentItem {
  incidentKey: string;
  incidentNumber: string;
  wsid: string;
  lokasi: string;
  servicePoint: string;
  sektor: string;
  typeMesin: string;
  vendor: string;
  eventCode: string;
  eventCodeDesc: string;
  detail: string;
  startTime: string;
  endTime: string;
  tanggal: string;
  jam: string;
  durationRaw: number;
  durasiOpr: number;
  status: string;
  actionTerakhir: string;
  actionTerakhirOleh: string;
  actionTerakhirWaktu: string;
  jumlahAction: number;
  monthStr: string;
  jenisMesin?: 'ATM' | 'CRM' | string;
  hariOperasional?: string;
  jamOperasional?: string;
  comment?: string;
  keterangan?: string;
  closeSource?: 'OASE' | 'DASHBOARD' | '-';
}

export interface IncidentHistoryItem {
  logId: string;
  waktu: string;
  incidentKey: string;
  wsid: string;
  eventCodeDesc: string;
  tipe: string;
  isiAction: string;
  namaPetugas: string;
  statusSebelum: string;
  statusSesudah: string;
  catatan: string;
}

export interface UploadLogItem {
  waktu: string;
  uploader: string;
  sumber: string;
  namaFile: string;
  totalLines: number;
  lolosFilter: number;
  baru: number;
  diupdate: number;
  tanpaPerubahan: number;
  dilewati: number;
}

const LOCAL_STORAGE_INCIDENTS = 'MONITORING_INCIDENTS_LOCAL';
const LOCAL_STORAGE_ACTIONS = 'MONITORING_ACTIONS_LOCAL';
const LOCAL_STORAGE_UPLOAD_LOGS = 'MONITORING_UPLOAD_LOGS_LOCAL';

/**
 * Helper untuk memetakan format tabular compact array ke array of object
 * dengan normalisasi otomatis WSID dan pembersihan baris corrupt.
 */
export function unpackCompactTabular(res: any): any[] {
  if (res && res.data && res.headers && (!res.rows || res.rows.length === 0)) {
    const h = res.headers;
    const wsidIdx = h.indexOf('wsid');
    const result: any[] = [];
    for (let j = 0; j < res.data.length; j++) {
      const r = res.data[j];
      const rawW = wsidIdx !== -1 ? r[wsidIdx] : '';
      const cleanW = cleanWsid(rawW);
      if (!cleanW) continue; // skip baris WSID korup / bergeser

      const obj: any = {};
      for (let i = 0; i < h.length; i++) {
        if (i === wsidIdx) {
          obj[h[i]] = cleanW;
        } else {
          obj[h[i]] = r[i];
        }
      }
      result.push(obj);
    }
    return result;
  }
  if (res && res.rows && Array.isArray(res.rows)) {
    return res.rows
      .map((r: any) => ({ ...r, wsid: cleanWsid(r.wsid) }))
      .filter((r: any) => Boolean(r.wsid));
  }
  return [];
}

/**
 * 1. Ka Ops Auth - Instan melalui Supabase (~50ms)
 */
export const loginKaOpsApi = async (password: string): Promise<{
  success: boolean;
  token?: string;
  isLocked?: boolean;
  remainingAttempts?: number;
  message?: string;
}> => {
  const res = await authenticateUserSupabase('kaops', password);
  if (res.success && res.token) {
    sessionStorage.setItem('KAOPS_TOKEN', res.token);
  }
  return res;
};

export const logoutKaOpsApi = async (_token?: string): Promise<{ success: boolean }> => {
  try {
    sessionStorage.removeItem('KAOPS_TOKEN');
  } catch (e) { }
  return { success: true };
};

/**
 * 1B. Ka Wil Auth - Instan melalui Supabase (~50ms)
 */
export const loginKaWilApi = async (password: string): Promise<{
  success: boolean;
  token?: string;
  role?: string;
  isLocked?: boolean;
  remainingAttempts?: number;
  message?: string;
}> => {
  const res = await authenticateUserSupabase('kawil', password);
  if (res.success && res.token) {
    sessionStorage.setItem('KAWIL_TOKEN', res.token);
  }
  return res;
};

export const logoutKaWilApi = async (_token?: string): Promise<{ success: boolean }> => {
  try {
    sessionStorage.removeItem('KAWIL_TOKEN');
  } catch (e) { }
  return { success: true };
};

/**
 * 2. Database Insiden ID Management
 */
export const getIncidentDbIdApi = async (): Promise<{
  success: boolean;
  id: string;
  name?: string;
  error?: string;
}> => {
  const id = localStorage.getItem('INCIDENT_DB_SPREADSHEET_ID') || '';
  return { success: true, id, name: id ? 'Database Insiden' : 'Supabase Cloud Database' };
};

export const setIncidentDbIdApi = async (
  idOrUrl: string,
  _token?: string
): Promise<{
  success: boolean;
  id?: string;
  name?: string;
  message?: string;
}> => {
  localStorage.setItem('INCIDENT_DB_SPREADSHEET_ID', idOrUrl);
  return {
    success: true,
    id: idOrUrl,
    name: 'Database Insiden Lokal',
    message: 'ID Database berhasil disimpan di penyimpanan lokal.'
  };
};

/**
 * 3. Monitoring Problem Open (Single Source of Truth: Supabase)
 */
export const getOpenIncidentsApi = async (filters?: { forceSync?: boolean }): Promise<{
  success: boolean;
  incidents: OpenIncidentItem[];
  totalOpen?: number;
  message?: string;
}> => {
  if (!isSupabaseConfigured()) {
    return {
      success: false,
      incidents: [],
      totalOpen: 0,
      message: 'Supabase belum dikonfigurasi. Silakan atur URL dan Anon Key di menu Settings.'
    };
  }

  try {
    const res = await fetchOpenIncidentsSupabase(filters);
    return res;
  } catch (err: any) {
    console.error('Supabase getOpenIncidents failed:', err);
    return {
      success: false,
      incidents: [],
      totalOpen: 0,
      message: err.message || 'Gagal memuat insiden aktif dari Supabase.'
    };
  }
};

/**
 * 4. Monitoring Action & History
 */
export const getIncidentHistoryApi = async (
  incidentKey: string,
  monthStr: string
): Promise<{
  success: boolean;
  history: IncidentHistoryItem[];
  message?: string;
}> => {
  if (!isSupabaseConfigured()) {
    return { success: false, history: [], message: 'Supabase belum dikonfigurasi.' };
  }
  try {
    return await fetchIncidentHistorySupabase(incidentKey, monthStr);
  } catch (err: any) {
    return { success: false, history: [], message: err.message };
  }
};

export const saveIncidentActionApi = async (payload: {
  incidentKey: string;
  monthStr: string;
  wsid: string;
  eventCodeDesc: string;
  isiAction: string;
  namaPetugas: string;
  kategori?: 'UPDATE' | 'PENANGANAN';
}): Promise<{
  success: boolean;
  message?: string;
  action?: any;
}> => {
  if (!isSupabaseConfigured()) {
    return { success: false, message: 'Supabase belum dikonfigurasi.' };
  }
  try {
    return await saveIncidentActionSupabase(payload);
  } catch (err: any) {
    return { success: false, message: err.message };
  }
};

export const bulkSaveIncidentActionApi = async (payload: {
  items: { incidentKey: string; monthStr: string; wsid: string; eventCodeDesc: string }[];
  isiAction: string;
  namaPetugas: string;
  kategori?: 'UPDATE' | 'PENANGANAN';
}): Promise<{
  success: boolean;
  updatedCount?: number;
  message?: string;
}> => {
  if (!isSupabaseConfigured()) {
    return { success: false, message: 'Supabase belum dikonfigurasi.' };
  }
  try {
    const incidentKeys = payload.items.map((it) => it.incidentKey);
    const res = await bulkSaveIncidentActionSupabase({
      incidentKeys,
      items: payload.items,
      monthStr: payload.items[0]?.monthStr || '',
      isiAction: payload.isiAction,
      namaPetugas: payload.namaPetugas,
      kategori: payload.kategori
    });
    return {
      success: res.success,
      updatedCount: res.count || payload.items.length,
      message: res.message
    };
  } catch (err: any) {
    return { success: false, message: err.message };
  }
};

/**
 * 4.b Get WSID Penanganan History
 */
export const getWsidPenangananHistoryApi = async (
  wsid: string,
  monthStr?: string
): Promise<{
  success: boolean;
  history: IncidentHistoryItem[];
  message?: string;
}> => {
  if (!isSupabaseConfigured()) {
    return { success: false, history: [], message: 'Supabase belum dikonfigurasi.' };
  }
  try {
    return await fetchWsidPenangananHistorySupabase(wsid, monthStr);
  } catch (err: any) {
    return { success: false, history: [], message: err.message };
  }
};

/**
 * 5. Search Incidents (History)
 */
export const searchIncidentsApi = async (filters: {
  monthStr?: string;
  query?: string;
  status?: string;
  eventCodeDesc?: string;
  eventCodes?: string[];
}): Promise<{
  success: boolean;
  incidents: OpenIncidentItem[];
  totalCount?: number;
  message?: string;
}> => {
  if (!isSupabaseConfigured()) {
    return { success: false, incidents: [], message: 'Supabase belum dikonfigurasi.' };
  }
  try {
    const res = await searchIncidentsSupabase(filters);
    return {
      success: res.success,
      incidents: res.incidents,
      totalCount: res.totalCount,
      message: res.message
    };
  } catch (err: any) {
    return { success: false, incidents: [], message: err.message };
  }
};

/**
 * 6. Upload CSV Chunks ke Database (Supabase)
 */
export const uploadIncidentChunkApi = async (payload: {
  uploaderName: string;
  sumber: string;
  fileName: string;
  totalCsvLines: number;
  chunkIndex: number;
  totalChunks: number;
  rows: any[];
}): Promise<{
  success: boolean;
  stats?: {
    totalLines: number;
    matched: number;
    newCount: number;
    updatedCount: number;
    unchangedCount: number;
    skippedCount: number;
  };
  message?: string;
}> => {
  if (!isSupabaseConfigured()) {
    return { success: false, message: 'Supabase belum dikonfigurasi.' };
  }
  try {
    return await uploadIncidentsToSupabase(payload);
  } catch (err: any) {
    return { success: false, message: err.message };
  }
};

/**
 * 7. Upload Log History
 */
export const getUploadLogApi = async (): Promise<{
  success: boolean;
  logs: UploadLogItem[];
  message?: string;
}> => {
  if (!isSupabaseConfigured()) {
    return { success: false, logs: [], message: 'Supabase belum dikonfigurasi.' };
  }
  try {
    return await fetchUploadLogsSupabase();
  } catch (err: any) {
    return { success: false, logs: [], message: err.message };
  }
};

/**
 * 8. Ka Ops Cek Daily - Read from Database Supabase
 */
export const getDailyIncidentsFromDbApi = async (payload?: {
  token?: string;
  monthStr?: string;
  startMonth?: string;
  endMonth?: string;
  months?: string[];
  limit?: number;
}): Promise<{
  success: boolean;
  rows: any[];
  totalCount?: number;
  lastUploadInfo?: any;
  availableMonths?: string[];
  message?: string;
}> => {
  if (!isSupabaseConfigured()) {
    return {
      success: false,
      rows: [],
      totalCount: 0,
      message: 'Supabase belum dikonfigurasi.'
    };
  }

  try {
    const res = await fetchDailyIncidentsFromDbSupabase(payload);
    if (res && res.success) {
      return {
        success: true,
        rows: res.rows || [],
        totalCount: res.totalCount || 0,
        lastUploadInfo: {
          waktu: toWibDateTimeString(new Date()),
          uploader: 'Supabase Cloud DB',
          sumber: 'PostgreSQL',
          namaFile: 'incident_logs'
        }
      };
    }
    return {
      success: false,
      rows: [],
      totalCount: 0,
      message: res.message || 'Gagal memuat riwayat harian dari Supabase.'
    };
  } catch (err: any) {
    console.error('Supabase getDailyIncidentsFromDb failed:', err);
    return {
      success: false,
      rows: [],
      totalCount: 0,
      message: err.message || 'Gagal memuat insiden dari Supabase.'
    };
  }
};
