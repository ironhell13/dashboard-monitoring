import { isGasEnvironment } from './spreadsheetService';
import { apiGet, apiPost, isBackendConfigured } from './apiClient';

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
  comment?: string;
  keterangan?: string;
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
 */
function unpackCompactTabular(res: any): any[] {
  if (res && res.data && res.headers && (!res.rows || res.rows.length === 0)) {
    const h = res.headers;
    return res.data.map((r: any[]) => {
      const obj: any = {};
      for (let i = 0; i < h.length; i++) {
        obj[h[i]] = r[i];
      }
      return obj;
    });
  }
  return res.rows || [];
}

/**
 * 1. Ka Ops Auth
 */
export const loginKaOpsApi = async (password: string): Promise<{
  success: boolean;
  token?: string;
  isLocked?: boolean;
  remainingAttempts?: number;
  message?: string;
}> => {
  if (isGasEnvironment()) {
    return new Promise((resolve) => {
      (window as any).google.script.run
        .withSuccessHandler((res: any) => resolve(res || { success: false, message: 'Respon server kosong.' }))
        .withFailureHandler((err: any) => resolve({ success: false, message: err?.message || String(err) }))
        .loginKaOps(password);
    });
  }

  if (isBackendConfigured()) {
    try {
      const res = await apiPost('loginKaOps', { password });
      if (res && res.success !== undefined) {
        if (res.success && res.token) {
          sessionStorage.setItem('KAOPS_TOKEN', res.token);
        }
        return res;
      }
    } catch (err: any) {
      console.warn('API loginKaOps failed, falling back to local:', err);
    }
  }

  // Local development fallback
  if (password && password.length >= 6) {
    const token = 'LOCAL_KAOPS_' + Date.now();
    sessionStorage.setItem('KAOPS_TOKEN', token);
    return { success: true, token, message: 'Login Ka Ops berhasil (Local Dev).' };
  }
  return { success: false, message: 'Password salah (minimal 6 karakter untuk local dev)!' };
};

export const logoutKaOpsApi = async (token?: string): Promise<{ success: boolean }> => {
  try {
    sessionStorage.removeItem('KAOPS_TOKEN');
  } catch (e) {}

  if (isGasEnvironment() && token) {
    return new Promise((resolve) => {
      (window as any).google.script.run
        .withSuccessHandler(() => resolve({ success: true }))
        .withFailureHandler(() => resolve({ success: true }))
        .logoutKaOps(token);
    });
  }

  if (isBackendConfigured() && token) {
    try {
      await apiPost('logoutKaOps', { token });
    } catch (e) {}
  }

  return { success: true };
};

/**
 * 1B. Ka Wil Auth
 */
export const loginKaWilApi = async (password: string): Promise<{
  success: boolean;
  token?: string;
  role?: string;
  isLocked?: boolean;
  remainingAttempts?: number;
  message?: string;
}> => {
  if (isGasEnvironment()) {
    return new Promise((resolve) => {
      (window as any).google.script.run
        .withSuccessHandler((res: any) => resolve(res || { success: false, message: 'Respon server kosong.' }))
        .withFailureHandler((err: any) => resolve({ success: false, message: err?.message || String(err) }))
        .loginKaWil(password);
    });
  }

  if (isBackendConfigured()) {
    try {
      const res = await apiPost('loginKaWil', { password });
      if (res && res.success !== undefined) {
        if (res.success && res.token) {
          sessionStorage.setItem('KAWIL_TOKEN', res.token);
        }
        return res;
      }
    } catch (err: any) {
      console.warn('API loginKaWil failed, falling back to local:', err);
    }
  }

  // Local development fallback
  if (password === 'kawilacjk' || (password && password.length >= 6)) {
    const token = 'LOCAL_KAWIL_' + Date.now();
    sessionStorage.setItem('KAWIL_TOKEN', token);
    return { success: true, token, role: 'KAWIL', message: 'Login Ka Wil berhasil (Local Dev).' };
  }
  return { success: false, message: 'Password salah (gunakan kawilacjk)!' };
};

export const logoutKaWilApi = async (token?: string): Promise<{ success: boolean }> => {
  try {
    sessionStorage.removeItem('KAWIL_TOKEN');
  } catch (e) {}

  if (isGasEnvironment() && token) {
    return new Promise((resolve) => {
      (window as any).google.script.run
        .withSuccessHandler(() => resolve({ success: true }))
        .withFailureHandler(() => resolve({ success: true }))
        .logoutKaWil(token);
    });
  }

  if (isBackendConfigured() && token) {
    try {
      await apiPost('logoutKaWil', { token });
    } catch (e) {}
  }

  return { success: true };
};

/**
 * 2. Database Insiden Spreadsheet ID Management
 */
export const getIncidentDbIdApi = async (): Promise<{
  success: boolean;
  id: string;
  name?: string;
  error?: string;
}> => {
  if (isGasEnvironment()) {
    return new Promise((resolve) => {
      (window as any).google.script.run
        .withSuccessHandler((res: any) => resolve(res || { success: true, id: '' }))
        .withFailureHandler((err: any) => resolve({ success: false, id: '', error: err?.message || String(err) }))
        .getIncidentDbId();
    });
  }

  if (isBackendConfigured()) {
    try {
      const res = await apiGet('getIncidentDbId');
      if (res && res.success !== undefined) return res;
    } catch (err) {}
  }

  const id = localStorage.getItem('INCIDENT_DB_SPREADSHEET_ID') || '';
  return { success: true, id, name: id ? 'Database Insiden' : '' };
};

export const setIncidentDbIdApi = async (
  idOrUrl: string,
  token?: string
): Promise<{
  success: boolean;
  id?: string;
  name?: string;
  message?: string;
}> => {
  if (isGasEnvironment()) {
    return new Promise((resolve) => {
      (window as any).google.script.run
        .withSuccessHandler((res: any) => resolve(res || { success: true }))
        .withFailureHandler((err: any) => resolve({ success: false, message: err?.message || String(err) }))
        .setIncidentDbId(idOrUrl, token);
    });
  }

  if (isBackendConfigured()) {
    try {
      const res = await apiPost('setIncidentDbId', { idOrUrl, token });
      if (res && res.success !== undefined) return res;
    } catch (err) {}
  }

  localStorage.setItem('INCIDENT_DB_SPREADSHEET_ID', idOrUrl);
  return {
    success: true,
    id: idOrUrl,
    name: 'Database Insiden Lokal',
    message: 'ID Spreadsheet berhasil disimpan di penyimpanan lokal.'
  };
};

/**
 * 3. Monitoring Problem Open
 */
export const getOpenIncidentsApi = async (filters?: { forceSync?: boolean }): Promise<{
  success: boolean;
  incidents: OpenIncidentItem[];
  totalOpen?: number;
  message?: string;
}> => {
  if (isGasEnvironment()) {
    return new Promise((resolve) => {
      (window as any).google.script.run
        .withSuccessHandler((res: any) => resolve(res || { success: true, incidents: [] }))
        .withFailureHandler((err: any) => resolve({ success: false, incidents: [], message: err?.message || String(err) }))
        .getOpenIncidents(filters || {});
    });
  }

  if (isBackendConfigured()) {
    try {
      const res = await apiGet('getOpenIncidents', filters || {});
      if (res && res.success !== undefined) {
        return {
          success: true,
          incidents: res.incidents || [],
          totalOpen: res.totalOpen || (res.incidents ? res.incidents.length : 0),
          message: res.message
        };
      }
    } catch (err: any) {
      console.warn('API getOpenIncidents failed, falling back to local storage:', err);
    }
  }

  // Local fallback
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_INCIDENTS);
    const list: OpenIncidentItem[] = raw ? JSON.parse(raw) : [];
    const openList = list.filter((r) => r.status === 'OPEN');
    return { success: true, incidents: openList, totalOpen: openList.length };
  } catch (e: any) {
    return { success: false, incidents: [], message: e.message };
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
  if (isGasEnvironment()) {
    return new Promise((resolve) => {
      (window as any).google.script.run
        .withSuccessHandler((res: any) => resolve(res || { success: true, history: [] }))
        .withFailureHandler((err: any) => resolve({ success: false, history: [], message: err?.message || String(err) }))
        .getIncidentHistory(incidentKey, monthStr);
    });
  }

  if (isBackendConfigured()) {
    try {
      const res = await apiGet('getIncidentHistory', { incidentKey, monthStr });
      if (res && res.success !== undefined) {
        return { success: true, history: res.history || [] };
      }
    } catch (err: any) {
      console.warn('API getIncidentHistory failed, falling back to local:', err);
    }
  }

  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_ACTIONS);
    const list: IncidentHistoryItem[] = raw ? JSON.parse(raw) : [];
    const filtered = list.filter((a) => a.incidentKey === incidentKey);
    return { success: true, history: filtered };
  } catch (e: any) {
    return { success: false, history: [], message: e.message };
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
  if (isGasEnvironment()) {
    return new Promise((resolve) => {
      (window as any).google.script.run
        .withSuccessHandler((res: any) => resolve(res || { success: true }))
        .withFailureHandler((err: any) => resolve({ success: false, message: err?.message || String(err) }))
        .saveIncidentAction(payload);
    });
  }

  if (isBackendConfigured()) {
    try {
      const res = await apiPost('saveIncidentAction', payload);
      if (res && res.success !== undefined) {
        return res;
      }
    } catch (err: any) {
      console.warn('API saveIncidentAction failed, falling back to local:', err);
    }
  }

  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_ACTIONS);
    const list: IncidentHistoryItem[] = raw ? JSON.parse(raw) : [];
    const kategori = payload.kategori || 'UPDATE';
    const formattedAction = payload.isiAction.startsWith('[') ? payload.isiAction : `[${kategori}] ${payload.isiAction}`;

    const newAction: IncidentHistoryItem = {
      logId: 'ACT_' + Date.now(),
      waktu: new Date().toISOString().replace('T', ' ').slice(0, 19),
      incidentKey: payload.incidentKey,
      wsid: payload.wsid,
      eventCodeDesc: payload.eventCodeDesc,
      tipe: kategori,
      isiAction: payload.isiAction,
      namaPetugas: payload.namaPetugas,
      statusSebelum: 'OPEN',
      statusSesudah: 'OPEN',
      catatan: '-'
    };
    list.unshift(newAction);
    localStorage.setItem(LOCAL_STORAGE_ACTIONS, JSON.stringify(list));

    // Update incident in local
    const rawInc = localStorage.getItem(LOCAL_STORAGE_INCIDENTS);
    if (rawInc) {
      const incList: OpenIncidentItem[] = JSON.parse(rawInc);
      const found = incList.find((r) => r.incidentKey === payload.incidentKey);
      if (found) {
        found.actionTerakhir = formattedAction;
        found.actionTerakhirOleh = payload.namaPetugas;
        found.actionTerakhirWaktu = newAction.waktu;
        found.jumlahAction = (found.jumlahAction || 0) + 1;
        localStorage.setItem(LOCAL_STORAGE_INCIDENTS, JSON.stringify(incList));
      }
    }

    return { success: true, message: 'Action berhasil disimpan (Local).' };
  } catch (e: any) {
    return { success: false, message: e.message };
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
  if (isGasEnvironment()) {
    return new Promise((resolve) => {
      (window as any).google.script.run
        .withSuccessHandler((res: any) => resolve(res || { success: true }))
        .withFailureHandler((err: any) => resolve({ success: false, message: err?.message || String(err) }))
        .bulkSaveIncidentAction(payload);
    });
  }

  if (isBackendConfigured()) {
    try {
      const res = await apiPost('bulkSaveIncidentAction', payload);
      if (res && res.success !== undefined) {
        return res;
      }
    } catch (err: any) {
      console.warn('API bulkSaveIncidentAction failed, falling back to local:', err);
    }
  }

  try {
    const nowWib = new Date().toISOString().replace('T', ' ').slice(0, 19);
    const raw = localStorage.getItem(LOCAL_STORAGE_ACTIONS);
    const list: IncidentHistoryItem[] = raw ? JSON.parse(raw) : [];
    const kategori = payload.kategori || 'UPDATE';

    payload.items.forEach((it, idx) => {
      list.unshift({
        logId: 'BULK_' + Date.now() + '_' + idx,
        waktu: nowWib,
        incidentKey: it.incidentKey,
        wsid: it.wsid,
        eventCodeDesc: it.eventCodeDesc,
        tipe: kategori,
        isiAction: payload.isiAction,
        namaPetugas: payload.namaPetugas,
        statusSebelum: 'OPEN',
        statusSesudah: 'OPEN',
        catatan: '-'
      });
    });
    localStorage.setItem(LOCAL_STORAGE_ACTIONS, JSON.stringify(list));

    return {
      success: true,
      updatedCount: payload.items.length,
      message: `Berhasil update ${payload.items.length} insiden (Local).`
    };
  } catch (e: any) {
    return { success: false, message: e.message };
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
  if (isGasEnvironment()) {
    return new Promise((resolve) => {
      (window as any).google.script.run
        .withSuccessHandler((res: any) => resolve(res || { success: true, history: [] }))
        .withFailureHandler((err: any) => resolve({ success: false, history: [], message: err?.message || String(err) }))
        .getWsidPenangananHistory(wsid, monthStr || 'ALL');
    });
  }

  if (isBackendConfigured()) {
    try {
      const res = await apiGet('getWsidPenangananHistory', { wsid, monthStr: monthStr || 'ALL' });
      if (res && res.success !== undefined) {
        return { success: true, history: res.history || [] };
      }
    } catch (err: any) {
      console.warn('API getWsidPenangananHistory failed, falling back to local:', err);
    }
  }

  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_ACTIONS);
    const list: IncidentHistoryItem[] = raw ? JSON.parse(raw) : [];
    const targetWsid = wsid.trim().toUpperCase();
    const filtered = list.filter((a) => (a.wsid || '').trim().toUpperCase() === targetWsid);
    return { success: true, history: filtered };
  } catch (e: any) {
    return { success: false, history: [], message: e.message };
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
}): Promise<{
  success: boolean;
  incidents: OpenIncidentItem[];
  totalCount?: number;
  message?: string;
}> => {
  if (isGasEnvironment()) {
    return new Promise((resolve) => {
      (window as any).google.script.run
        .withSuccessHandler((res: any) => resolve(res || { success: true, incidents: [] }))
        .withFailureHandler((err: any) => resolve({ success: false, incidents: [], message: err?.message || String(err) }))
        .searchIncidents(filters);
    });
  }

  if (isBackendConfigured()) {
    try {
      const res = await apiGet('searchIncidents', filters);
      if (res && res.success !== undefined) {
        return {
          success: true,
          incidents: res.incidents || [],
          totalCount: res.totalCount || (res.incidents ? res.incidents.length : 0),
          message: res.message
        };
      }
    } catch (err: any) {
      console.warn('API searchIncidents failed, falling back to local:', err);
    }
  }

  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_INCIDENTS);
    let list: OpenIncidentItem[] = raw ? JSON.parse(raw) : [];

    if (filters.status && filters.status !== 'ALL') {
      list = list.filter((r) => r.status === filters.status);
    }
    if (filters.eventCodeDesc && filters.eventCodeDesc !== 'ALL') {
      list = list.filter((r) => r.eventCodeDesc === filters.eventCodeDesc);
    }
    if (filters.query) {
      const q = filters.query.toLowerCase();
      list = list.filter(
        (r) =>
          r.wsid.toLowerCase().includes(q) ||
          r.lokasi.toLowerCase().includes(q) ||
          r.eventCodeDesc.toLowerCase().includes(q)
      );
    }

    return { success: true, incidents: list, totalCount: list.length };
  } catch (e: any) {
    return { success: false, incidents: [], message: e.message };
  }
};

/**
 * 6. Upload CSV Chunks ke Database
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
  if (isGasEnvironment()) {
    return new Promise((resolve) => {
      (window as any).google.script.run
        .withSuccessHandler((res: any) => resolve(res || { success: true }))
        .withFailureHandler((err: any) => resolve({ success: false, message: err?.message || String(err) }))
        .uploadIncidentChunk(payload);
    });
  }

  if (isBackendConfigured()) {
    try {
      const res = await apiPost('uploadIncidentChunk', payload);
      if (res && res.success !== undefined) {
        return res;
      }
    } catch (err: any) {
      console.error('API uploadIncidentChunk failed:', err);
      return {
        success: false,
        message: 'Gagal mengirim data ke database server: ' + (err.message || String(err))
      };
    }
  }

  // Local fallback
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_INCIDENTS);
    const existing: OpenIncidentItem[] = raw ? JSON.parse(raw) : [];
    const map = new Map<string, OpenIncidentItem>();
    existing.forEach((r) => map.set(r.incidentKey, r));

    let newCount = 0;
    let updatedCount = 0;
    let unchangedCount = 0;

    payload.rows.forEach((r) => {
      const key = r.incidentNumber || `${r.wsid}|${r.eventCodeDesc}|${r.startTime}`;
      if (!map.has(key)) {
        map.set(key, {
          incidentKey: key,
          incidentNumber: r.incidentNumber || '-',
          wsid: r.wsid,
          lokasi: r.lokasi || '-',
          servicePoint: r.servicePoint || '-',
          sektor: r.sektor || '-',
          typeMesin: r.typeMesin || '-',
          vendor: r.vendorMesin || '-',
          eventCode: r.eventCode || '-',
          eventCodeDesc: r.eventCodeDesc,
          detail: r.detail || '-',
          startTime: r.startTime,
          endTime: r.endTime || '-',
          tanggal: r.dateStr || '-',
          jam: r.hourStr || '00:00',
          durationRaw: r.rawDuration || 0,
          durasiOpr: r.durasi || 0,
          status: r.endTime && r.endTime !== '-' ? 'CLOSED' : 'OPEN',
          actionTerakhir: '-',
          actionTerakhirOleh: '-',
          actionTerakhirWaktu: '-',
          jumlahAction: 0,
          monthStr: '2026-10'
        });
        newCount++;
      } else {
        const item = map.get(key)!;
        if (r.endTime && r.endTime !== '-' && item.endTime === '-') {
          item.endTime = r.endTime;
          item.status = 'CLOSED';
          updatedCount++;
        } else {
          unchangedCount++;
        }
      }
    });

    localStorage.setItem(LOCAL_STORAGE_INCIDENTS, JSON.stringify(Array.from(map.values())));

    return {
      success: true,
      stats: {
        totalLines: payload.totalCsvLines,
        matched: payload.rows.length,
        newCount,
        updatedCount,
        unchangedCount,
        skippedCount: payload.totalCsvLines - payload.rows.length
      }
    };
  } catch (e: any) {
    return { success: false, message: e.message };
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
  if (isGasEnvironment()) {
    return new Promise((resolve) => {
      (window as any).google.script.run
        .withSuccessHandler((res: any) => resolve(res || { success: true, logs: [] }))
        .withFailureHandler((err: any) => resolve({ success: false, logs: [], message: err?.message || String(err) }))
        .getUploadLog();
    });
  }

  if (isBackendConfigured()) {
    try {
      const res = await apiGet('getUploadLog');
      if (res && res.success !== undefined) {
        return { success: true, logs: res.logs || [] };
      }
    } catch (err: any) {
      console.warn('API getUploadLog failed, falling back to local:', err);
    }
  }

  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_UPLOAD_LOGS);
    const list: UploadLogItem[] = raw ? JSON.parse(raw) : [];
    return { success: true, logs: list };
  } catch (e: any) {
    return { success: false, logs: [], message: e.message };
  }
};

/**
 * 8. Ka Ops Cek Daily - Read from Database
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
  if (isGasEnvironment()) {
    return new Promise((resolve) => {
      (window as any).google.script.run
        .withSuccessHandler((res: any) => {
          if (!res) {
            resolve({ success: true, rows: [] });
            return;
          }
          const unpacked = unpackCompactTabular(res);
          resolve({
            ...res,
            rows: unpacked.length > 0 ? unpacked : (res.rows || [])
          });
        })
        .withFailureHandler((err: any) => resolve({ success: false, rows: [], message: err?.message || String(err) }))
        .getDailyIncidentsFromDb(payload);
    });
  }

  if (isBackendConfigured()) {
    try {
      const sanitizedPayload = {
        limit: 60000,
        ...payload
      };
      const res = await apiGet('getDailyIncidentsFromDb', sanitizedPayload);
      if (res && res.success !== undefined) {
        const unpacked = unpackCompactTabular(res);
        return {
          ...res,
          rows: unpacked.length > 0 ? unpacked : (res.rows || [])
        };
      }
    } catch (err: any) {
      console.warn('API getDailyIncidentsFromDb failed, falling back to local:', err);
    }
  }

  try {
    const rawActive = localStorage.getItem('MONITORING_ACTIVE_DATASET');
    if (rawActive) {
      try {
        const parsed = JSON.parse(rawActive);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return {
            success: true,
            rows: parsed,
            totalCount: parsed.length,
            lastUploadInfo: {
              waktu: new Date().toISOString().replace('T', ' ').slice(0, 19),
              uploader: 'Ka Ops',
              sumber: 'Monitoring Dataset',
              namaFile: 'Active_Incidents.csv'
            }
          };
        }
      } catch (e) {}
    }

    const raw = localStorage.getItem(LOCAL_STORAGE_INCIDENTS);
    const list: OpenIncidentItem[] = raw ? JSON.parse(raw) : [];
    return {
      success: true,
      rows: list.map((r) => ({
        ...r,
        vendorMesin: r.vendor,
        dateStr: r.tanggal,
        hourStr: r.jam,
        durasi: r.durasiOpr
      })),
      totalCount: list.length,
      lastUploadInfo: {
        waktu: new Date().toISOString().replace('T', ' ').slice(0, 19),
        uploader: 'Ka Ops',
        sumber: 'Monitoring',
        namaFile: 'Report_Incident.csv'
      }
    };
  } catch (e: any) {
    return { success: false, rows: [], message: e.message };
  }
};
