import type { MasterRow, ParsedUptimeFile } from './excelParser';
import { normalizePeriode } from './comprehensiveExporter';
import { cleanWsid } from './dailyIncidentParser';
import { getSupabase, isSupabaseConfigured } from './supabaseClient';
import staticCatalogJson from '../data/staticMachineCatalog.json';
import {
  saveCachedMasterData,
  loadCachedMasterData,
  saveCachedUptimeFiles,
  loadCachedUptimeFiles,
  saveCachedLockedPeriodes,
  loadCachedLockedPeriodes,
  loadDashboardSnapshot,
  saveDashboardSnapshot,
  hasValidUptimeInDataset,
  hasIntactMasterFields,
  type CloudMetaSnapshot
} from './dbCache';
import {
  fetchDashboardMetaFromCloud,
  fetchDashboardFromCloud,
  saveMasterSnapshotToCloud,
  saveUptimePeriodSnapshotToCloud,
  unlockUptimePeriodInCloud,
  pickFieldIC,
  type CloudDashboardMeta
} from './supabaseService';

/**
 * Single Source of Truth katalog mesin statis (5.000+ mesin BCA terdaftar).
 * Berfungsi sebagai fallback instan saat IndexedDB belum terisi di browser client baru.
 */
export function getStaticMasterData(): any[] {
  const entries = Object.values(staticCatalogJson) as any[];
  return entries.map((entry) => {
    const cleanW = String(entry.wsid || '').trim().toUpperCase();
    const sek = entry.sektorBCA || '-';
    const wil = entry.wilayahOperasional || (sek.includes('-') ? sek.split('-')[0] : 'ABACUS JAKARTA');
    const jm = (entry.jenisMesin === 'CRM' ? 'CRM' : 'ATM');
    return {
      // MachineData properties
      wsid: cleanW,
      lokasi: entry.lokasi || '-',
      sektorBCA: sek,
      wilayahOperasional: wil,
      vendor: entry.vendor || '-',
      tipeMesin: entry.tipeMesin || '-',
      jenisMesin: jm,
      klienStatus: 'BCA',
      statusAktif: 'AKTIF',
      hari: entry.hari || 'MON-SUN',
      jam: entry.jam || '(00:00 - 23:59)',
      monthlyData: [],

      // MasterRow properties for compatibility
      WSID: cleanW,
      Klien: 'BCA',
      'Jenis Mesin': jm,
      'Tipe Mesin': entry.tipeMesin || '-',
      Status: 'AKTIF',
      Sektor: sek,
      Wilayah: wil,
      'Nama Lokasi': entry.lokasi || '-',
      Vendor: entry.vendor || '-',
      Hari: entry.hari || 'MON-SUN',
      Jam: entry.jam || '(00:00 - 23:59)'
    };
  });
}

export interface DashboardDbData {
  success: boolean;
  hasData: boolean;
  source?: 'cloud_snapshot' | 'cloud_relational' | 'local_cache' | 'none';
  needsCloudUpgrade?: boolean;
  isPartialFallback?: boolean;
  masterData: MasterRow[];
  parsedUptimeFiles: ParsedUptimeFile[];
  lockedPeriodes: string[];
  globalTrendData?: any[];
  lastUpdated: string | null;
  cloudMeta?: CloudDashboardMeta | CloudMetaSnapshot;
  tickets?: FollowUpTicket[];
  modernFollowUpTickets?: FollowUpTicketItem[];
  prematchedMachines?: any[];
  error?: string;
  message?: string;
}

export interface SavePeriodResult {
  success: boolean;
  skipped: boolean;
  periode: string;
  lockedPeriodes?: string[];
  rowCount?: number;
  message?: string;
  error?: string;
}

export interface SaveMasterResult {
  success: boolean;
  count?: number;
  message?: string;
  error?: string;
}

export interface ConnectionStatusResult {
  success: boolean;
  spreadsheetName?: string;
  spreadsheetId?: string;
  lockedPeriodes?: string[];
  lastUpdated?: string | null;
  message?: string;
}

const LOCAL_STORAGE_KEYS = {
  MASTER: 'DOWNTIME_BCA_DB_MASTER',
  UPTIME: 'DOWNTIME_BCA_DB_UPTIME',
  LOCKED: 'DOWNTIME_BCA_DB_LOCKED',
  LAST_SYNC: 'DOWNTIME_BCA_DB_LAST_SYNC',
};

/**
 * Mendeteksi apakah aplikasi sedang berjalan dalam Google Apps Script (Web App)
 * Dinonaktifkan permanen karena telah bermigrasi 100% ke arsitektur Supabase & Vercel.
 */
export const isGasEnvironment = (): boolean => {
  return false;
};

/**
 * Kompres satu baris uptime sebelum dikirim ke Google Apps Script
 * Mempertahankan seluruh detail persentase, frekuensi, durasi, dan sub-kategori HW
 */
const compactUptimeRow = (r: any) => {
  const wsid = String(r.WSID || '').trim();
  if (!wsid) return null;

  const num = (v: any) => {
    const n = Number(v);
    return isNaN(n) ? 0 : n;
  };

  const hwDetail: Record<string, number> = {};
  const hwSubCategories: Record<string, { frx: number; dur: number; pct: number }> = {};

  // Deteksi modul P01 s.d P10 secara komprehensif
  for (let p = 1; p <= 10; p++) {
    const pKey = `P${p < 10 ? '0' + p : p}`;
    
    // Cari key yang diawali dengan pKey (misal "P02 - Presenter_pct", "P02_pct", dll)
    let pPct = 0;
    let pFrx = 0;
    let pDur = 0;

    for (const k in r) {
      if (k.startsWith(pKey)) {
        if (k.endsWith('_pct') || k === `${pKey}_pct` || k === pKey) {
          pPct = num(r[k]);
        } else if (k.endsWith('_frx')) {
          pFrx = num(r[k]);
        } else if (k.endsWith('_dur')) {
          pDur = num(r[k]);
        }
      }
    }

    // Jika ada di r.hwDetail atau r.hwSubCategories yang sudah ada
    if (r.hwDetail && r.hwDetail[pKey]) {
      pPct = num(r.hwDetail[pKey]);
    }
    if (r.hwSubCategories && r.hwSubCategories[pKey]) {
      pFrx = num(r.hwSubCategories[pKey].frx);
      pDur = num(r.hwSubCategories[pKey].dur);
      pPct = num(r.hwSubCategories[pKey].pct);
    }

    if (pPct > 0) hwDetail[pKey] = pPct;
    if (pFrx > 0 || pDur > 0 || pPct > 0) {
      hwSubCategories[pKey] = { frx: pFrx, dur: pDur, pct: pPct };
    }
  }

  const getVal = (...keys: string[]) => {
    for (const k of keys) {
      if (r[k] !== undefined && r[k] !== null && r[k] !== '') {
        const n = Number(r[k]);
        if (!isNaN(n)) return n;
      }
    }
    return 0;
  };

  let hwFrxVal = getVal('H/W_frx', 'HW_frx');
  let hwDurVal = getVal('H/W_dur', 'HW_dur');
  if (hwFrxVal === 0 || hwDurVal === 0) {
    let subFrx = 0;
    let subDur = 0;
    ['P01', 'P02', 'P03', 'P04', 'P06', 'P09'].forEach(pk => {
      if (hwSubCategories[pk]) {
        subFrx += hwSubCategories[pk].frx || 0;
        subDur += hwSubCategories[pk].dur || 0;
      }
    });
    if (hwFrxVal === 0 && subFrx > 0) hwFrxVal = subFrx;
    if (hwDurVal === 0 && subDur > 0) hwDurVal = subDur;
  }

  const uhFrxVal = getVal('UH_frx', 'P07 - Uang Habis_frx', 'P07_frx') || (hwSubCategories.P07 ? hwSubCategories.P07.frx : 0);
  const uhDurVal = getVal('UH_dur', 'P07 - Uang Habis_dur', 'P07_dur') || (hwSubCategories.P07 ? hwSubCategories.P07.dur : 0);
  const komFrxVal = getVal('KOM_frx', 'P05 - Komunikasi_frx', 'P05_frx') || (hwSubCategories.P05 ? hwSubCategories.P05.frx : 0);
  const komDurVal = getVal('KOM_dur', 'P05 - Komunikasi_dur', 'P05_dur') || (hwSubCategories.P05 ? hwSubCategories.P05.dur : 0);
  const upFrxVal = getVal('UP_frx', 'P10 - Uang Penuh_frx', 'P10_frx') || (hwSubCategories.P10 ? hwSubCategories.P10.frx : 0);
  const upDurVal = getVal('UP_dur', 'P10 - Uang Penuh_dur', 'P10_dur') || (hwSubCategories.P10 ? hwSubCategories.P10.dur : 0);
  const llFrxVal = getVal('LL_frx', 'P08 - Replenishment_frx', 'P08_frx') || (hwSubCategories.P08 ? hwSubCategories.P08.frx : 0);
  const llDurVal = getVal('LL_dur', 'P08 - Replenishment_dur', 'P08_dur') || (hwSubCategories.P08 ? hwSubCategories.P08.dur : 0);

  return {
    WSID: cleanWsid(wsid) || wsid,
    LOKASI: String(r.LOKASI || '').trim(),
    DESCKCU: String(r.DESCKCU || '').trim(),
    ...(r.KWW !== undefined ? { KWW: String(r.KWW || '').trim() } : {}),
    VDR: String(r.VDR || r.Vendor || '').trim(),
    SEKTOR: String(r.SEKTOR || r.Sektor || '').trim(),
    Klien: String(r.Klien || '').trim(),
    'Tipe Mesin': r['Tipe Mesin'] || '',
    STATUS: r.STATUS || '',
    HARI: r.HARI || '',
    JAM: r.JAM || '',
    OPR: r.OPR || '',
    Total_pct: getVal('Total_pct', 'Total'),
    Total_frx: getVal('Total_frx'),
    Total_dur: getVal('Total_dur'),
    UH_pct: getVal('UH_pct', 'P07 - Uang Habis_pct', 'P07_pct'),
    UH_frx: uhFrxVal,
    UH_dur: uhDurVal,
    KOM_pct: getVal('KOM_pct', 'P05 - Komunikasi_pct', 'P05_pct'),
    KOM_frx: komFrxVal,
    KOM_dur: komDurVal,
    UP_pct: getVal('UP_pct', 'P10 - Uang Penuh_pct', 'P10_pct') || (hwDetail.P10 ? hwDetail.P10 : 0),
    UP_frx: upFrxVal,
    UP_dur: upDurVal,
    HW_pct: getVal('H/W_pct', 'HW_pct'),
    'H/W_pct': getVal('H/W_pct', 'HW_pct'),
    HW_frx: hwFrxVal,
    'H/W_frx': hwFrxVal,
    HW_dur: hwDurVal,
    'H/W_dur': hwDurVal,
    LL_pct: getVal('LL_pct', 'P08 - Replenishment_pct', 'P08_pct'),
    LL_frx: llFrxVal,
    LL_dur: llDurVal,
    hwDetail: Object.keys(hwDetail).length > 0 ? hwDetail : undefined,
    hwSubCategories: Object.keys(hwSubCategories).length > 0 ? hwSubCategories : undefined
  };
};

/**
 * Simpan Master Data ke Supabase Cloud / IndexedDB (~1 detik)
 */
export const saveMasterData = async (masterData: MasterRow[]): Promise<SaveMasterResult> => {
  // 1. Supabase Cloud (jika terkonfigurasi)
  if (isSupabaseConfigured()) {
    try {
      const client = getSupabase();
      if (client) {
        const chunk = masterData
          .map((m: any) => {
            const rawW = pickFieldIC(m, 'WSID', 'wsid');
            const w = cleanWsid(rawW) || String(rawW || '').trim().toUpperCase();
            if (!w) return null;
            return {
              wsid: w,
              jenis_mesin: pickFieldIC(m, 'Jenis Mesin', 'jenisMesin', 'jenis_mesin') || 'ATM',
              klien_status: pickFieldIC(m, 'Klien', 'klienStatus', 'klien_status') || 'BCA',
              sektor_bca: pickFieldIC(m, 'Sektor', 'Sektor BCA', 'sektorBCA', 'sektor_bca', 'sektor') || '',
              wilayah_operasional:
                pickFieldIC(m, 'Wilayah', 'Wilayah Operasional', 'wilayahOperasional', 'wilayah_operasional', 'Service Point') || '',
              lokasi: pickFieldIC(m, 'Nama Lokasi', 'Lokasi', 'lokasi', 'Alamat') || '',
              vendor: pickFieldIC(m, 'Vendor', 'vendor', 'VDR', 'Vendor Mesin') || '',
              tipe_mesin: pickFieldIC(m, 'Tipe Mesin', 'tipeMesin', 'tipe_mesin') || '',
              status_aktif: pickFieldIC(m, 'Status', 'Status Aktif', 'statusAktif', 'status_aktif') || 'AKTIF',
              jam_operasional: pickFieldIC(m, 'Jam', 'Jam Operasional', 'jam', 'jam_operasional') || '(00:00 - 24:00)',
              opr: Math.round(Number(pickFieldIC(m, 'OPR', 'opr')) || 43200),
              updated_at: new Date().toISOString()
            };
          })
          .filter((item): item is NonNullable<typeof item> => item !== null);

        for (let i = 0; i < chunk.length; i += 500) {
          const slice = chunk.slice(i, i + 500);
          const { error: uErr } = await client.from('machines').upsert(slice, { onConflict: 'wsid' });
          if (uErr) {
            console.warn('Supabase machines upsert error:', uErr.message);
            break;
          }
        }
      }
      await saveMasterSnapshotToCloud(masterData);
    } catch (sbErr) {
      console.warn('Supabase saveMasterData failed, fallback ke IndexedDB:', sbErr);
    }
  }

  // 2. Local IndexedDB storage (Instan)
  try {
    await saveCachedMasterData(masterData);
    try {
      localStorage.setItem(LOCAL_STORAGE_KEYS.LAST_SYNC, new Date().toISOString());
    } catch (e) {}
    return {
      success: true,
      count: masterData.length,
      message: `Master Data (${masterData.length} mesin) berhasil disimpan!`
    };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
};

/**
 * Simpan Uptime SATU BULAN ke Supabase Cloud / IndexedDB (~1 detik)
 */
export const saveUptimePeriod = async (file: ParsedUptimeFile, forceUpdate: boolean = true): Promise<SavePeriodResult> => {
  const normPeriode = normalizePeriode(file.periode);

  // Buat payload ringan terkompresi
  const isRelevant = (r: any) => {
    if (!r) return false;
    const desc = String(r.DESCKCU || r.KWW || '').trim().toUpperCase();
    const klien = String(r.Klien || '').trim().toUpperCase();
    return desc === 'ABACUS JAKARTA' || klien === 'BCA';
  };

  let compactAtmData = (file.atmData || []).map(compactUptimeRow).filter(Boolean);
  let compactAtsData = (file.atsData || []).map(compactUptimeRow).filter(Boolean);

  const filteredAtm = compactAtmData.filter(isRelevant);
  const filteredAts = compactAtsData.filter(isRelevant);
  if (filteredAtm.length > 0 || filteredAts.length > 0) {
    compactAtmData = filteredAtm;
    compactAtsData = filteredAts;
  }

  const compactedFile: ParsedUptimeFile = {
    ...file,
    periode: normPeriode,
    atmData: compactAtmData as any,
    atsData: compactAtsData as any
  };

  // 1. Supabase Cloud (Single Source of Truth untuk sinkronisasi lintas PC/Laptop)
  let latestCloudMeta: CloudDashboardMeta | undefined;
  if (isSupabaseConfigured()) {
    try {
      const snapRes = await saveUptimePeriodSnapshotToCloud(compactedFile);
      if (snapRes.success && snapRes.meta) {
        latestCloudMeta = snapRes.meta;
      }

      const client = getSupabase();
      if (client) {
        const rows: any[] = [];
        const all = [...compactAtmData, ...compactAtsData];
        all.forEach((r: any) => {
          const rawW = String(r.WSID ?? r.wsid ?? '').trim();
          const w = cleanWsid(rawW) || rawW;
          if (!w) return;
          rows.push({
            wsid: w,
            periode: normPeriode,
            uh: Number(r.UH_pct ?? r.uh) || 0,
            uh_frx: Math.round(Number(r.UH_frx ?? r.uhFrx) || 0),
            uh_dur: Math.round(Number(r.UH_dur ?? r.uhDur) || 0),
            um: Number(r.KOM_pct ?? r.um ?? r.kom) || 0,
            um_frx: Math.round(Number(r.KOM_frx ?? r.umFrx ?? r.komFrx) || 0),
            um_dur: Math.round(Number(r.KOM_dur ?? r.umDur ?? r.komDur) || 0),
            pm: Number(r.HW_pct ?? r['H/W_pct'] ?? r.pm ?? r.hw) || 0,
            pm_frx: Math.round(Number(r.HW_frx ?? r['H/W_frx'] ?? r.pmFrx ?? r.hwFrx) || 0),
            pm_dur: Math.round(Number(r.HW_dur ?? r['H/W_dur'] ?? r.pmDur ?? r.hwDur) || 0),
            total_downtime_dur: Math.round(Number(r.Total_dur ?? r.durTotal ?? r.totalDowntimeDur) || 0),
            target_sla: 98.50,
            target_vol: Math.round(Number(r.targetVol) || 0),
            is_locked: true,
            updated_at: new Date().toISOString()
          });
        });

        for (let i = 0; i < rows.length; i += 300) {
          const slice = rows.slice(i, i + 300);
          const { error: uErr } = await client.from('monthly_uptime').upsert(slice, { onConflict: 'wsid,periode' });
          if (uErr) {
            console.warn('Supabase monthly_uptime upsert error:', uErr.message);
            break;
          }
        }
      }
    } catch (sbErr) {
      console.warn('Supabase saveUptimePeriod failed, fallback ke IndexedDB:', sbErr);
    }
  }

  // 2. Local storage / IndexedDB cache
  try {
    let lockedPeriodes: string[] = await loadCachedLockedPeriodes();
    if (!lockedPeriodes || lockedPeriodes.length === 0) {
      const rawLocked = localStorage.getItem(LOCAL_STORAGE_KEYS.LOCKED);
      lockedPeriodes = rawLocked ? JSON.parse(rawLocked) : [];
    }
    lockedPeriodes = lockedPeriodes.map(normalizePeriode).filter(Boolean);

    if (!forceUpdate && lockedPeriodes.includes(normPeriode)) {
      return { success: true, skipped: true, periode: normPeriode, lockedPeriodes, message: `Periode ${normPeriode} sudah terkunci.` };
    }

    let existingUptime: ParsedUptimeFile[] = await loadCachedUptimeFiles();
    if (!existingUptime || existingUptime.length === 0) {
      const rawExistingUptime = localStorage.getItem(LOCAL_STORAGE_KEYS.UPTIME);
      if (rawExistingUptime) {
        try { existingUptime = JSON.parse(rawExistingUptime); } catch (e) {}
      }
    }

    existingUptime = existingUptime.filter(f => normalizePeriode(f.periode) !== normPeriode);
    existingUptime.push(compactedFile);

    if (!lockedPeriodes.includes(normPeriode)) {
      lockedPeriodes.push(normPeriode);
    }

    await saveCachedUptimeFiles(existingUptime);
    await saveCachedLockedPeriodes(lockedPeriodes);

    // Perbarui cloudMeta pada snapshot lokal jika tersedia
    if (latestCloudMeta) {
      try {
        const snap = await loadDashboardSnapshot();
        if (snap) {
          await saveDashboardSnapshot({
            ...snap,
            parsedUptimeFiles: existingUptime,
            lockedPeriodes,
            cloudMeta: {
              updatedAt: latestCloudMeta.updatedAt,
              masterUpdatedAt: latestCloudMeta.masterUpdatedAt,
              periodUpdatedAt: latestCloudMeta.periodUpdatedAt
            }
          });
        }
      } catch (_) {}
    }

    try {
      localStorage.setItem(LOCAL_STORAGE_KEYS.LOCKED, JSON.stringify(lockedPeriodes));
      localStorage.setItem(LOCAL_STORAGE_KEYS.LAST_SYNC, new Date().toISOString());
    } catch (e) {}

    return {
      success: true,
      skipped: false,
      periode: normPeriode,
      lockedPeriodes,
      rowCount: (compactAtmData.length + compactAtsData.length),
      message: `Periode ${normPeriode} berhasil disimpan.`
    };
  } catch (err: any) {
    return { success: false, skipped: false, periode: normPeriode, error: err.message };
  }
};

export interface DashboardSummaryData {
  success: boolean;
  globalTrendData: any[];
  availablePeriodes: string[];
  lockedPeriodes: string[];
  totalMachines: number;
  lastUpdated: string;
}

/**
 * Mengambil ringkasan data dashboard instan (~1.4 KB, < 20ms)
 * Digunakan untuk first-render instant pada Dashboard Overview tanpa perlu menunggu 10 MB detail mesin.
 */
export const fetchDashboardSummary = async (): Promise<DashboardSummaryData | null> => {
  // 1. Prioritas Utama: Ambil metadata ringkas langsung dari Supabase Cloud (~1.5 KB)
  if (isSupabaseConfigured()) {
    try {
      const cloudMeta = await fetchDashboardMetaFromCloud();
      if (cloudMeta && Array.isArray(cloudMeta.globalTrendData) && cloudMeta.globalTrendData.length > 0) {
        return {
          success: true,
          globalTrendData: cloudMeta.globalTrendData,
          availablePeriodes: (cloudMeta.availablePeriodes || []).map(normalizePeriode),
          lockedPeriodes: (cloudMeta.lockedPeriodes || []).map(normalizePeriode),
          totalMachines: cloudMeta.totalMachines || 0,
          lastUpdated: cloudMeta.updatedAt || new Date().toISOString()
        };
      }
    } catch (err) {
      console.warn('Gagal memuat dashboard_meta_v1 dari Supabase:', err);
    }
  }

  // 2. Fallback: file summary statis jika Cloud belum terisi atau offline
  try {
    const res = await fetch('/summary-data.json');
    if (res.ok) {
      const data = await res.json();
      return {
        success: true,
        globalTrendData: data.globalTrendData || [],
        availablePeriodes: (data.availablePeriodes || []).map(normalizePeriode),
        lockedPeriodes: (data.lockedPeriodes || []).map(normalizePeriode),
        totalMachines: data.totalMachines || 0,
        lastUpdated: data.lastUpdated || new Date().toISOString()
      };
    }
  } catch (err) {
    console.warn('Gagal memuat summary-data.json:', err);
  }
  return null;
};

/**
 * Mengambil data dashboard dengan prioritas Cloud Supabase (Single Source of Truth)
 * dan fallback ke cache lokal IndexedDB yang valid (wajib memiliki data uptime).
 */
export const fetchDashboardData = async (): Promise<DashboardDbData> => {
  // 0. Kumpulkan cache lokal yang valid terlebih dahulu untuk inkremental cloud sync & fallback offline
  let localSnapshotData: DashboardDbData | null = null;
  let localCloudMeta: CloudMetaSnapshot | undefined;

  try {
    const snapshot = await loadDashboardSnapshot();
    if (
      snapshot &&
      snapshot.masterData?.length > 0 &&
      hasValidUptimeInDataset(snapshot.parsedUptimeFiles, snapshot.matchedMachines)
    ) {
      localCloudMeta = snapshot.cloudMeta;
      localSnapshotData = {
        success: true,
        hasData: true,
        source: 'local_cache',
        masterData: snapshot.masterData,
        parsedUptimeFiles: (snapshot.parsedUptimeFiles || []).map((f) => ({
          ...f,
          periode: normalizePeriode(f.periode)
        })),
        lockedPeriodes: (snapshot.lockedPeriodes || []).map(normalizePeriode),
        lastUpdated: snapshot.lastUpdated,
        cloudMeta: snapshot.cloudMeta,
        tickets: snapshot.followUpTickets || [],
        prematchedMachines: snapshot.matchedMachines
      };
    }
  } catch (e) {
    console.warn('Gagal membaca snapshot lokal:', e);
  }

  if (!localSnapshotData) {
    try {
      const cachedMaster = await loadCachedMasterData();
      const cachedUptime = await loadCachedUptimeFiles();
      const cachedLocked = await loadCachedLockedPeriodes();

      if (
        cachedMaster &&
        cachedMaster.length > 0 &&
        cachedUptime &&
        cachedUptime.length > 0 &&
        hasIntactMasterFields(cachedMaster)
      ) {
        localSnapshotData = {
          success: true,
          hasData: true,
          source: 'local_cache',
          masterData: cachedMaster,
          parsedUptimeFiles: cachedUptime.map((f) => ({ ...f, periode: normalizePeriode(f.periode) })),
          lockedPeriodes: cachedLocked.map(normalizePeriode),
          lastUpdated: localStorage.getItem(LOCAL_STORAGE_KEYS.LAST_SYNC) || new Date().toISOString()
        };
      }
    } catch (idbErr) {
      console.warn('Gagal membaca IndexedDB cache:', idbErr);
    }
  }

  // 1. Prioritas Utama: Sinkronisasi dari Cloud Supabase (menjamin PC & Laptop 100% identik)
  if (isSupabaseConfigured()) {
    try {
      const cloudRes = await fetchDashboardFromCloud(
        localSnapshotData
          ? {
              masterData: localSnapshotData.masterData,
              parsedUptimeFiles: localSnapshotData.parsedUptimeFiles,
              cloudMeta: localCloudMeta
            }
          : null
      );

      if (cloudRes.success && cloudRes.hasData) {
        if (cloudRes.isUpToDate && localSnapshotData) {
          return {
            ...localSnapshotData,
            source: 'cloud_snapshot',
            cloudMeta: cloudRes.cloudMeta
          };
        }

        if (cloudRes.parsedUptimeFiles && cloudRes.parsedUptimeFiles.length > 0 && cloudRes.masterData) {
          // Hanya simpan ke cache lokal terpisah jika Cloud sudah format v2 yang utuh (bukan fallback v1)
          if (!cloudRes.isPartialFallback) {
            saveCachedMasterData(cloudRes.masterData).catch(() => {});
            saveCachedUptimeFiles(cloudRes.parsedUptimeFiles).catch(() => {});
            saveCachedLockedPeriodes(cloudRes.lockedPeriodes || []).catch(() => {});
          }

          return {
            success: true,
            hasData: true,
            source: 'cloud_snapshot',
            isPartialFallback: cloudRes.isPartialFallback,
            masterData: cloudRes.masterData,
            parsedUptimeFiles: cloudRes.parsedUptimeFiles,
            lockedPeriodes: cloudRes.lockedPeriodes || [],
            globalTrendData: cloudRes.globalTrendData || [],
            lastUpdated: cloudRes.lastUpdated || new Date().toISOString(),
            cloudMeta: cloudRes.cloudMeta
          };
        }

        if (
          cloudRes.source === 'cloud_relational' &&
          cloudRes.prematchedMachines &&
          cloudRes.prematchedMachines.length > 0 &&
          !localSnapshotData
        ) {
          return {
            success: true,
            hasData: true,
            source: 'cloud_relational',
            isPartialFallback: true,
            masterData: cloudRes.masterData || [],
            parsedUptimeFiles: [],
            lockedPeriodes: cloudRes.lockedPeriodes || [],
            prematchedMachines: cloudRes.prematchedMachines,
            lastUpdated: cloudRes.lastUpdated || new Date().toISOString()
          };
        }
      } else if (cloudRes.needsCloudUpgrade && localSnapshotData) {
        return {
          ...localSnapshotData,
          needsCloudUpgrade: true
        };
      }
    } catch (cloudErr) {
      console.warn('Sinkronisasi Cloud Supabase gagal, menggunakan cache lokal jika tersedia:', cloudErr);
    }
  }

  // 2. Gunakan cache lokal valid jika Cloud belum memiliki data atau sedang offline
  if (localSnapshotData) {
    return localSnapshotData;
  }

  // 3. Fallback: Katalog Master statis TANPA data uptime (hasData = false agar UI tidak menyangka 100% uptime valid)
  const fallbackMaster = getStaticMasterData();
  return {
    success: true,
    hasData: false,
    source: 'none',
    masterData: fallbackMaster as any,
    parsedUptimeFiles: [],
    lockedPeriodes: [],
    prematchedMachines: [],
    lastUpdated: null
  };
};

/**
 * Cek status koneksi spreadsheet / database
 */
export const checkSpreadsheetStatus = async (): Promise<ConnectionStatusResult> => {
  const rawLocked = localStorage.getItem(LOCAL_STORAGE_KEYS.LOCKED);
  const lastUpdated = localStorage.getItem(LOCAL_STORAGE_KEYS.LAST_SYNC);
  return {
    success: true,
    spreadsheetName: isSupabaseConfigured() ? 'Supabase PostgreSQL Cloud' : 'Local Storage Database (Dev Mode)',
    lockedPeriodes: rawLocked ? JSON.parse(rawLocked) : [],
    lastUpdated
  };
};

/**
 * Buka kunci periode tertentu (fitur admin perbaikan data)
 */
export const unlockPeriode = async (periode: string): Promise<{ success: boolean; message?: string }> => {
  const normPeriode = normalizePeriode(periode);

  try {
    let lockedPeriodes: string[] = await loadCachedLockedPeriodes();
    if (!lockedPeriodes || lockedPeriodes.length === 0) {
      const rawLocked = localStorage.getItem(LOCAL_STORAGE_KEYS.LOCKED);
      lockedPeriodes = rawLocked ? JSON.parse(rawLocked) : [];
    }
    lockedPeriodes = lockedPeriodes.map(normalizePeriode).filter((p) => p && p !== normPeriode);

    let uptimeFiles: ParsedUptimeFile[] = await loadCachedUptimeFiles();
    if (!uptimeFiles || uptimeFiles.length === 0) {
      const rawUptime = localStorage.getItem(LOCAL_STORAGE_KEYS.UPTIME);
      if (rawUptime) {
        try { uptimeFiles = JSON.parse(rawUptime); } catch (_) {}
      }
    }
    uptimeFiles = uptimeFiles.filter((f) => normalizePeriode(f.periode) !== normPeriode);

    if (isSupabaseConfigured()) {
      await unlockUptimePeriodInCloud(normPeriode, lockedPeriodes);
    }

    try {
      localStorage.setItem(LOCAL_STORAGE_KEYS.LOCKED, JSON.stringify(lockedPeriodes));
      localStorage.setItem(LOCAL_STORAGE_KEYS.UPTIME, JSON.stringify(uptimeFiles));
    } catch (_) {}

    await saveCachedLockedPeriodes(lockedPeriodes);
    await saveCachedUptimeFiles(uptimeFiles);

    const existingSnap = await loadDashboardSnapshot();
    if (existingSnap) {
      await saveDashboardSnapshot({
        ...existingSnap,
        parsedUptimeFiles: (existingSnap.parsedUptimeFiles || []).filter(
          (f) => normalizePeriode(f.periode) !== normPeriode
        ),
        lockedPeriodes
      });
    }

    return {
      success: true,
      message: `Periode ${normPeriode} berhasil dibuka kuncinya.`
    };
  } catch (err: any) {
    return { success: false, message: err.message };
  }
};

export interface FollowUpHistoryEntry {
  id: string;
  tanggal: string; // YYYY-MM-DD
  status: 'OPEN' | 'IN_PROGRESS' | 'PANTAU' | 'RESOLVED' | 'CLOSED';
  tindakan: string;
  pic: string;
  petugas?: string; // Nama petugas / personil yang menginput update
  akarMasalah?: string;
  detailAkarMasalah?: string;
  catatan?: string;
  targetSelesai?: string;
  updatedAt?: string;
}

export interface FollowUpTicket {
  id: string;
  wsid: string;
  lokasi: string;
  sektor: string;
  wilayah: string;
  vendor: string;
  periodeProblem: string;
  uptimeBaseline: number;
  kategoriProblem: string;
  akarMasalah: string;
  detailAkarMasalah?: string;
  actionPlan: string;
  pic: string;
  petugas?: string; // Nama petugas yang menginput update
  tanggalUpdate?: string;
  targetSelesai: string;
  status: 'OPEN' | 'IN_PROGRESS' | 'PANTAU' | 'RESOLVED' | 'CLOSED';
  catatan: string;
  updatedAt: string;
  history?: FollowUpHistoryEntry[];
}

const LOCAL_STORAGE_FOLLOWUP_KEY = 'DOWNTIME_BCA_DB_FOLLOWUP';

/**
 * Mengambil seluruh data tiket follow-up dari LocalStorage / Cache
 */
export const fetchFollowUpTickets = async (): Promise<{ success: boolean; tickets: FollowUpTicket[]; error?: string }> => {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_FOLLOWUP_KEY);
    const tickets: FollowUpTicket[] = raw ? JSON.parse(raw) : [];
    return { success: true, tickets };
  } catch (err: any) {
    return { success: false, tickets: [], error: err.message };
  }
};

/**
 * Menyimpan / memperbarui tiket follow-up ke LocalStorage / Cache
 */
export const saveFollowUpTicket = async (ticket: FollowUpTicket): Promise<{ success: boolean; ticket?: FollowUpTicket; message?: string; error?: string }> => {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_FOLLOWUP_KEY);
    let tickets: FollowUpTicket[] = raw ? JSON.parse(raw) : [];

    const idx = tickets.findIndex(t => t.id === ticket.id);
    if (idx >= 0) {
      tickets[idx] = { ...ticket, updatedAt: new Date().toISOString() };
    } else {
      tickets.unshift({ ...ticket, updatedAt: new Date().toISOString() });
    }

    localStorage.setItem(LOCAL_STORAGE_FOLLOWUP_KEY, JSON.stringify(tickets));
    return { success: true, ticket, message: 'Tiket berhasil disimpan di penyimpanan lokal.' };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
};

/**
 * Menghapus tiket follow-up dari LocalStorage / Cache
 */
export const deleteFollowUpTicket = async (ticketId: string): Promise<{ success: boolean; message?: string; error?: string }> => {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_FOLLOWUP_KEY);
    if (raw) {
      let tickets: FollowUpTicket[] = JSON.parse(raw);
      tickets = tickets.filter(t => t.id !== ticketId);
      localStorage.setItem(LOCAL_STORAGE_FOLLOWUP_KEY, JSON.stringify(tickets));
    }
    return { success: true, message: 'Tiket berhasil dihapus.' };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
};

/* ==========================================================================
 * SISTEM TIKET FOLLOW UP MODERN (KA OPS / KA WIL ↔ MONITORING)
 * ========================================================================== */

export interface FollowUpTicketItem {
  ticketId: string;
  wsid: string;
  lokasi: string;
  sektor: string;
  servicePoint: string;
  vendor: string;
  problem: string;
  sumberProblem?: 'OPEN_INCIDENT' | 'FREKUENSI' | 'ANALISIS' | 'CHRONIC_SLA';
  prioritas: 'NORMAL' | 'HIGH' | 'URGENT';
  kategori: 'VENDOR' | 'FLM' | 'SLM' | 'CABANG' | 'JALUR' | 'LAINNYA';
  catatanRequest: string;
  createdBy: string;
  createdAt: string;
  status: 'OPEN' | 'IN_PROGRESS' | 'REQ_CLOSE' | 'RE_OPEN' | 'CLOSED';
  periodeProblem?: string;
  uptimeBaseline?: number;
  durasiMenitFinal?: number;
  progresList: {
    id?: string;
    waktu: string;
    petugas: string;
    catatan: string;
  }[];
  reqCloseInfo?: {
    requestedBy: string;
    requestedAt: string;
    catatanPenyelesaian: string;
    statusMesinSaatReq?: string;
  };
  validationInfo?: {
    validatedBy: string;
    validatedAt: string;
    keputusan: 'CLOSED' | 'RE_OPEN';
    alasanReopen?: string;
    catatanApproval?: string;
  };
  updatedAt?: string;
}

const LOCAL_STORAGE_MODERN_TICKET_KEY = 'DOWNTIME_BCA_DB_TIKET_FOLLOWUP';

export const fetchFollowUpTicketsModern = async (): Promise<{ success: boolean; tickets: FollowUpTicketItem[]; error?: string }> => {
  // 1. Prioritas Utama: Supabase PostgreSQL (Cloud Database Realtime)
  if (isSupabaseConfigured()) {
    try {
      const client = getSupabase();
      if (client) {
        const { data, error } = await client
          .from('follow_up_tickets')
          .select('*')
          .order('created_at', { ascending: false });

        if (!error && data) {
          const tickets: FollowUpTicketItem[] = data.map((row: any) => {
            const extra = row.progress_notes && typeof row.progress_notes === 'object' && !Array.isArray(row.progress_notes)
              ? row.progress_notes
              : {};
            const progresList = Array.isArray(row.progress_notes)
              ? row.progress_notes
              : (extra.progresList || []);

            return {
              ticketId: row.id,
              wsid: row.wsid,
              lokasi: row.lokasi || '',
              sektor: row.sektor || '',
              servicePoint: row.service_point || '',
              vendor: extra.vendor || '',
              problem: row.kategori_problem || '',
              sumberProblem: extra.sumberProblem || 'OPEN_INCIDENT',
              prioritas: extra.prioritas || 'NORMAL',
              kategori: extra.kategori || 'VENDOR',
              catatanRequest: row.deskripsi_arahan || '',
              createdBy: row.created_by || '',
              createdAt: row.created_at || new Date().toISOString(),
              status: row.status || 'OPEN',
              durasiMenitFinal: extra.durasiMenitFinal,
              progresList,
              reqCloseInfo: extra.reqCloseInfo,
              validationInfo: row.closed_by ? {
                validatedBy: row.closed_by,
                validatedAt: row.closed_at,
                status: (row.status === 'CLOSED' ? 'ACCEPTED' : 'REJECTED') as any,
                catatan: row.validation_notes || ''
              } : extra.validationInfo,
              updatedAt: row.updated_at
            };
          });

          try {
            localStorage.setItem(LOCAL_STORAGE_MODERN_TICKET_KEY, JSON.stringify(tickets));
          } catch (_) {}

          return { success: true, tickets };
        }
      }
    } catch (err: any) {
      console.warn('Supabase fetchFollowUpTicketsModern failed, fallback local:', err);
    }
  }

  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_MODERN_TICKET_KEY);
    const tickets: FollowUpTicketItem[] = raw ? JSON.parse(raw) : [];
    return { success: true, tickets };
  } catch (err: any) {
    return { success: false, tickets: [], error: err.message };
  }
};

export const saveFollowUpTicketModern = async (ticket: FollowUpTicketItem): Promise<{ success: boolean; ticket?: FollowUpTicketItem; message?: string; error?: string }> => {
  // 1. Prioritas Utama: Supabase PostgreSQL
  if (isSupabaseConfigured()) {
    try {
      const client = getSupabase();
      if (client) {
        const nowIso = new Date().toISOString();
        const toSave: FollowUpTicketItem = {
          ...ticket,
          ticketId: ticket.ticketId || `TKT-${Date.now()}`,
          updatedAt: nowIso,
          createdAt: ticket.createdAt || nowIso
        };

        const extra = {
          vendor: toSave.vendor || '',
          sumberProblem: toSave.sumberProblem || 'OPEN_INCIDENT',
          prioritas: toSave.prioritas || 'NORMAL',
          kategori: toSave.kategori || 'VENDOR',
          durasiMenitFinal: toSave.durasiMenitFinal,
          progresList: toSave.progresList || [],
          reqCloseInfo: toSave.reqCloseInfo || null,
          validationInfo: toSave.validationInfo || null
        };

        const row = {
          id: toSave.ticketId,
          wsid: String(toSave.wsid || '').trim().replace(/^0+/, '') || String(toSave.wsid || ''),
          lokasi: toSave.lokasi || '',
          sektor: toSave.sektor || '',
          service_point: toSave.servicePoint || '',
          kategori_problem: toSave.problem || '',
          deskripsi_arahan: toSave.catatanRequest || '',
          created_by: toSave.createdBy || 'Petugas',
          created_at: toSave.createdAt,
          status: toSave.status || 'OPEN',
          progress_notes: extra,
          closed_at: toSave.validationInfo?.validatedAt || (toSave.status === 'CLOSED' ? nowIso : null),
          closed_by: toSave.validationInfo?.validatedBy || (toSave.status === 'CLOSED' ? toSave.createdBy : null),
          validation_notes: toSave.validationInfo?.catatan || null,
          updated_at: nowIso
        };

        const { error } = await client.from('follow_up_tickets').upsert(row, { onConflict: 'id' });
        if (error) throw error;

        // Backup lokal
        try {
          const raw = localStorage.getItem(LOCAL_STORAGE_MODERN_TICKET_KEY);
          let tickets: FollowUpTicketItem[] = raw ? JSON.parse(raw) : [];
          const idx = tickets.findIndex(t => t.ticketId === toSave.ticketId);
          if (idx >= 0) tickets[idx] = toSave;
          else tickets.unshift(toSave);
          localStorage.setItem(LOCAL_STORAGE_MODERN_TICKET_KEY, JSON.stringify(tickets));
        } catch (_) {}

        return { success: true, ticket: toSave, message: 'Tiket berhasil disimpan ke Supabase.' };
      }
    } catch (err: any) {
      console.warn('Supabase saveFollowUpTicketModern failed, fallback local:', err);
    }
  }

  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_MODERN_TICKET_KEY);
    let tickets: FollowUpTicketItem[] = raw ? JSON.parse(raw) : [];

    const nowIso = new Date().toISOString();
    const toSave: FollowUpTicketItem = {
      ...ticket,
      ticketId: ticket.ticketId || `TKT-${Date.now()}`,
      updatedAt: nowIso,
      createdAt: ticket.createdAt || nowIso
    };

    const idx = tickets.findIndex(t => t.ticketId === toSave.ticketId);
    if (idx >= 0) {
      tickets[idx] = toSave;
    } else {
      tickets.unshift(toSave);
    }

    localStorage.setItem(LOCAL_STORAGE_MODERN_TICKET_KEY, JSON.stringify(tickets));
    return { success: true, ticket: toSave, message: 'Tiket berhasil disimpan.' };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
};

export const deleteFollowUpTicketModern = async (ticketId: string): Promise<{ success: boolean; message?: string; error?: string }> => {
  // 1. Supabase PostgreSQL
  if (isSupabaseConfigured()) {
    try {
      const client = getSupabase();
      if (client) {
        await client.from('follow_up_tickets').delete().eq('id', ticketId);
      }
    } catch (err: any) {
      console.warn('Supabase deleteFollowUpTicketModern failed:', err);
    }
  }

  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_MODERN_TICKET_KEY);
    if (raw) {
      let tickets: FollowUpTicketItem[] = JSON.parse(raw);
      tickets = tickets.filter(t => t.ticketId !== ticketId);
      localStorage.setItem(LOCAL_STORAGE_MODERN_TICKET_KEY, JSON.stringify(tickets));
    }
    return { success: true, message: 'Tiket berhasil dihapus.' };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
};

/**
 * Format durasi berjalan tiket follow-up (contoh: '45m', '2j 15m', '1h 4j')
 */
export const formatTicketDuration = (createdAt: string, durasiMenitFinal?: number, isClosed?: boolean): { minutes: number; text: string; isUrgent: boolean } => {
  let minutes = 0;
  if (isClosed && typeof durasiMenitFinal === 'number' && durasiMenitFinal >= 0) {
    minutes = durasiMenitFinal;
  } else {
    try {
      const createdTime = new Date(createdAt).getTime();
      if (!isNaN(createdTime)) {
        minutes = Math.max(0, Math.floor((Date.now() - createdTime) / 60000));
      }
    } catch {
      minutes = 0;
    }
  }

  let text = '';
  if (minutes < 60) {
    text = `${minutes}m`;
  } else if (minutes < 1440) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    text = m > 0 ? `${h}j ${m}m` : `${h}j`;
  } else {
    const d = Math.floor(minutes / 1440);
    const h = Math.floor((minutes % 1440) / 60);
    text = h > 0 ? `${d}h ${h}j` : `${d}h`;
  }

  const isUrgent = minutes >= 240; // > 4 jam
  return { minutes, text, isUrgent };
};

