import type { MasterRow, ParsedUptimeFile } from './excelParser';
import { normalizePeriode } from './comprehensiveExporter';
import { apiGet, apiPost, isBackendConfigured } from './apiClient';
import { getSupabase, isSupabaseConfigured } from './supabaseClient';
import {
  saveCachedMasterData,
  loadCachedMasterData,
  saveCachedUptimeFiles,
  loadCachedUptimeFiles,
  saveCachedLockedPeriodes,
  loadCachedLockedPeriodes,
  loadDashboardSnapshot
} from './dbCache';

export interface DashboardDbData {
  success: boolean;
  hasData: boolean;
  masterData: MasterRow[];
  parsedUptimeFiles: ParsedUptimeFile[];
  lockedPeriodes: string[];
  lastUpdated: string | null;
  tickets?: FollowUpTicket[];
  modernFollowUpTickets?: FollowUpTicketItem[];
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
 */
export const isGasEnvironment = (): boolean => {
  return (
    typeof window !== 'undefined' &&
    Boolean((window as any).google?.script?.run)
  );
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
    WSID: wsid,
    LOKASI: String(r.LOKASI || '').trim(),
    DESCKCU: String(r.DESCKCU || r.KWW || '').trim(),
    VDR: String(r.VDR || '').trim(),
    SEKTOR: String(r.SEKTOR || '').trim(),
    Klien: String(r.Klien || 'BCA').trim(),
    'Tipe Mesin': r['Tipe Mesin'] || '',
    STATUS: r.STATUS || 'AKTIF',
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
        const chunk = masterData.map((m: any) => ({
          wsid: String(m.WSID || m.wsid || '').trim().replace(/^0+/, '') || String(m.WSID || m.wsid || ''),
          jenis_mesin: m['Jenis Mesin'] || m.jenisMesin || m.jenis_mesin || 'ATM',
          klien_status: m.Klien || m.klienStatus || m.klien_status || 'BCA',
          sektor_bca: m.Sektor || m.sektorBCA || m.sektor_bca || '',
          wilayah_operasional: m.Wilayah || m.wilayahOperasional || m.wilayah_operasional || '',
          lokasi: m['Nama Lokasi'] || m.lokasi || '',
          vendor: m.Vendor || m.vendor || '',
          tipe_mesin: m['Tipe Mesin'] || m.tipeMesin || m.tipe_mesin || '',
          status_aktif: m['Status Aktif'] || m.statusAktif || m.status_aktif || 'AKTIF',
          jam_operasional: m['Jam Operasional'] || m.jam || m.jam_operasional || '(00:00 - 24:00)',
          opr: Math.round(Number(m.OPR || m.opr) || 43200),
          updated_at: new Date().toISOString()
        }));

        for (let i = 0; i < chunk.length; i += 500) {
          const slice = chunk.slice(i, i + 500);
          await client.from('machines').upsert(slice, { onConflict: 'wsid' });
        }
      }
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

  // 1. Supabase Cloud (jika terkonfigurasi)
  if (isSupabaseConfigured()) {
    try {
      const client = getSupabase();
      if (client) {
        const rows: any[] = [];
        const all = [...compactAtmData, ...compactAtsData];
        all.forEach((r: any) => {
          const w = String(r.wsid || '').trim().replace(/^0+/, '');
          if (!w) return;
          rows.push({
            wsid: w,
            periode: normPeriode,
            uh: Number(r.uh) || 0,
            uh_frx: Math.round(Number(r.uhFrx) || 0),
            uh_dur: Math.round(Number(r.uhDur) || 0),
            um: Number(r.um !== undefined ? r.um : (r.kom || 0)),
            um_frx: Math.round(Number(r.umFrx || r.komFrx) || 0),
            um_dur: Math.round(Number(r.umDur || r.komDur) || 0),
            pm: Number(r.pm !== undefined ? r.pm : (r.hw || 0)),
            pm_frx: Math.round(Number(r.pmFrx || r.hwFrx) || 0),
            pm_dur: Math.round(Number(r.pmDur || r.hwDur) || 0),
            total_downtime_dur: Math.round(Number(r.durTotal || r.totalDowntimeDur || 0)),
            target_sla: 98.50,
            target_vol: Math.round(Number(r.targetVol) || 0),
            is_locked: true,
            updated_at: new Date().toISOString()
          });
        });

        for (let i = 0; i < rows.length; i += 300) {
          const slice = rows.slice(i, i + 300);
          await client.from('monthly_uptime').upsert(slice, { onConflict: 'wsid,periode' });
        }
      }
    } catch (sbErr) {
      console.warn('Supabase saveUptimePeriod failed, fallback ke IndexedDB:', sbErr);
    }
  }

  // 2. Local storage / IndexedDB fallback (Bebas kuota 5MB)
  try {
    let lockedPeriodes: string[] = await loadCachedLockedPeriodes();
    if (!lockedPeriodes || lockedPeriodes.length === 0) {
      const rawLocked = localStorage.getItem(LOCAL_STORAGE_KEYS.LOCKED);
      lockedPeriodes = rawLocked ? JSON.parse(rawLocked) : [];
    }
    lockedPeriodes = lockedPeriodes.map(normalizePeriode);

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
    existingUptime.push({
      ...file,
      periode: normPeriode,
      atmData: compactAtmData as any,
      atsData: compactAtsData as any
    });

    if (!lockedPeriodes.includes(normPeriode)) {
      lockedPeriodes.push(normPeriode);
    }

    await saveCachedUptimeFiles(existingUptime);
    await saveCachedLockedPeriodes(lockedPeriodes);

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

/**
 * Mengambil data dashboard dari database lokal / Snapshot / Bundled Data (~30ms)
 * Telah dioptimalkan penuh: Bebas dari pemanggilan lambat Google Spreadsheet.
 */
export const fetchDashboardData = async (): Promise<DashboardDbData> => {
  // 1. Coba ambil dari IndexedDB cache (kapasitas puluhan MB, sangat cepat < 30ms)
  try {
    const cachedMaster = await loadCachedMasterData();
    const cachedUptime = await loadCachedUptimeFiles();
    const cachedLocked = await loadCachedLockedPeriodes();

    if (cachedMaster && cachedMaster.length > 0 && cachedUptime && cachedUptime.length > 0) {
      return {
        success: true,
        hasData: true,
        masterData: cachedMaster,
        parsedUptimeFiles: cachedUptime.map(f => ({ ...f, periode: normalizePeriode(f.periode) })),
        lockedPeriodes: cachedLocked.map(normalizePeriode),
        lastUpdated: localStorage.getItem(LOCAL_STORAGE_KEYS.LAST_SYNC) || new Date().toISOString()
      };
    }
  } catch (idbErr) {
    console.warn('Gagal membaca IndexedDB, mencoba snapshot fallback:', idbErr);
  }

  // 2. Coba ambil dari Snapshot cache
  try {
    const snapshot = await loadDashboardSnapshot();
    if (snapshot && snapshot.masterData?.length > 0 && snapshot.parsedUptimeFiles?.length > 0) {
      return {
        success: true,
        hasData: true,
        masterData: snapshot.masterData,
        parsedUptimeFiles: snapshot.parsedUptimeFiles.map(f => ({ ...f, periode: normalizePeriode(f.periode) })),
        lockedPeriodes: (snapshot.lockedPeriodes || []).map(normalizePeriode),
        lastUpdated: snapshot.lastUpdated,
        tickets: snapshot.followUpTickets || []
      };
    }
  } catch (e) {}

  // 3. Fallback Bundled Dataset dari CDN/Edge (Instant < 100ms)
  try {
    const res = await fetch('/sample-data.json');
    if (res.ok) {
      const sample = await res.json();
      if (sample.rawMasterData && sample.rawUptimeFiles) {
        const defaultLocked = (sample.rawUptimeFiles as ParsedUptimeFile[]).map(f => f.periode);
        await saveCachedMasterData(sample.rawMasterData);
        await saveCachedUptimeFiles(sample.rawUptimeFiles);
        await saveCachedLockedPeriodes(defaultLocked);

        return {
          success: true,
          hasData: true,
          masterData: sample.rawMasterData,
          parsedUptimeFiles: sample.rawUptimeFiles.map((f: any) => ({ ...f, periode: normalizePeriode(f.periode) })),
          lockedPeriodes: defaultLocked,
          lastUpdated: new Date().toISOString()
        };
      } else if (sample.machines && Array.isArray(sample.machines) && sample.machines.length > 0) {
        // Unpack machines dataset & monthly problem breakdown
        const masterData: MasterRow[] = sample.machines.map((m: any) => ({
          WSID: String(m.wsid || '').trim(),
          'Jenis Mesin': m.jenisMesin || 'ATM',
          Klien: m.klienStatus || 'BCA',
          Sektor: m.sektorBCA || '-',
          Wilayah: m.wilayahOperasional || 'ABACUS JAKARTA',
          'Nama Lokasi': m.lokasi || '',
          Vendor: m.vendor || '-',
          'Tipe Mesin': m.tipeMesin || '',
          Status: m.statusAktif || 'AKTIF',
          Jam: m.jam || '',
          OPR: m.opr || ''
        }));

        const periodes: string[] = (sample.availablePeriodes || ['2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08']).map(normalizePeriode);

        const parsedUptimeFiles: ParsedUptimeFile[] = periodes.map((periode: string) => {
          const atmData: any[] = [];
          const atsData: any[] = [];

          for (const m of sample.machines) {
            const md = (m.monthlyData || []).find((x: any) => normalizePeriode(x.periode) === periode);
            if (!md) continue;

            const row = {
              WSID: String(m.wsid || '').trim(),
              LOKASI: m.lokasi || '',
              DESCKCU: m.wilayahOperasional || 'ABACUS JAKARTA',
              KWW: m.wilayahOperasional || 'ABACUS JAKARTA',
              VDR: m.vendor || '-',
              SEKTOR: m.sektorBCA || '-',
              Klien: m.klienStatus || 'BCA',
              'Tipe Mesin': m.tipeMesin || '',
              STATUS: m.statusAktif || 'AKTIF',
              JAM: m.jam || '',
              OPR: m.opr || '',
              Total_pct: Number(md.total) || 0,
              Total_frx: Number(md.frxTotal) || 0,
              Total_dur: Number(md.durTotal) || 0,
              UH_pct: Number(md.uh) || 0,
              UH_frx: Number(md.uhFrx) || 0,
              UH_dur: Number(md.uhDur) || 0,
              KOM_pct: Number(md.kom) || 0,
              KOM_frx: Number(md.komFrx) || 0,
              KOM_dur: Number(md.komDur) || 0,
              UP_pct: Number(md.up) || 0,
              UP_frx: Number(md.upFrx) || 0,
              UP_dur: Number(md.upDur) || 0,
              'H/W_pct': Number(md.hw) || 0,
              'H/W_frx': Number(md.hwFrx) || 0,
              'H/W_dur': Number(md.hwDur) || 0,
              LL_pct: Number(md.ll) || 0,
              LL_frx: Number(md.llFrx) || 0,
              LL_dur: Number(md.llDur) || 0,
              hwDetail: md.hwDetail || {},
              hwSubCategories: md.hwSubCategories || {}
            };

            const jm = String(m.jenisMesin || '').toUpperCase();
            if (jm === 'CRM' || jm === 'CDM' || jm === 'ATS') {
              atsData.push(row);
            } else {
              atmData.push(row);
            }
          }

          const calcAvg = (rows: any[]) => {
            if (rows.length === 0) return 100;
            const sumTot = rows.reduce((acc, r) => acc + (r.Total_pct || 0), 0);
            return Math.max(0, 100 - (sumTot / rows.length));
          };

          return {
            periode,
            atmData,
            atsData,
            rekapUptimeATM: Number(calcAvg(atmData).toFixed(2)),
            rekapUptimeCRM: Number(calcAvg(atsData).toFixed(2))
          };
        });

        try {
          await saveCachedMasterData(masterData);
          await saveCachedUptimeFiles(parsedUptimeFiles);
          await saveCachedLockedPeriodes(periodes);
        } catch (idbErr) {
          console.warn('Gagal menyimpan cache IndexedDB:', idbErr);
        }

        return {
          success: true,
          hasData: true,
          masterData,
          parsedUptimeFiles,
          lockedPeriodes: periodes,
          lastUpdated: new Date().toISOString()
        };
      }
    }
  } catch (sampleErr) {
    console.warn('Gagal memuat bundled sample-data.json:', sampleErr);
  }

  // 4. Fallback LocalStorage
  try {
    const rawMaster = localStorage.getItem(LOCAL_STORAGE_KEYS.MASTER);
    const rawUptime = localStorage.getItem(LOCAL_STORAGE_KEYS.UPTIME);
    const rawLocked = localStorage.getItem(LOCAL_STORAGE_KEYS.LOCKED);
    const lastUpdated = localStorage.getItem(LOCAL_STORAGE_KEYS.LAST_SYNC);

    let lockedPeriodes: string[] = [];
    if (rawLocked) {
      try {
        lockedPeriodes = (JSON.parse(rawLocked) || []).map(normalizePeriode);
      } catch (e) {}
    }

    if (rawMaster && rawUptime) {
      const masterData = JSON.parse(rawMaster);
      const parsedUptimeFiles = (JSON.parse(rawUptime) || []).map((f: ParsedUptimeFile) => ({
        ...f,
        periode: normalizePeriode(f.periode)
      }));
      return {
        success: true,
        hasData: masterData.length > 0 && parsedUptimeFiles.length > 0,
        masterData,
        parsedUptimeFiles,
        lockedPeriodes,
        lastUpdated,
      };
    }
  } catch (e) {}

  return {
    success: false,
    hasData: false,
    masterData: [],
    parsedUptimeFiles: [],
    lockedPeriodes: [],
    lastUpdated: null
  };
};

/**
 * Cek status koneksi spreadsheet
 */
export const checkSpreadsheetStatus = async (): Promise<ConnectionStatusResult> => {
  if (isGasEnvironment()) {
    return new Promise((resolve) => {
      (window as any).google.script.run
        .withSuccessHandler((res: ConnectionStatusResult) => resolve(res))
        .withFailureHandler((err: any) => resolve({ success: false, message: String(err) }))
        .checkSpreadsheetStatus();
    });
  }

  if (isBackendConfigured()) {
    try {
      const res = await apiGet('checkSpreadsheetStatus');
      if (res && res.success !== undefined) return res;
    } catch (err) {}
  }

  const rawLocked = localStorage.getItem(LOCAL_STORAGE_KEYS.LOCKED);
  const lastUpdated = localStorage.getItem(LOCAL_STORAGE_KEYS.LAST_SYNC);
  return {
    success: true,
    spreadsheetName: 'Local Storage Database (Dev Mode)',
    lockedPeriodes: rawLocked ? JSON.parse(rawLocked) : [],
    lastUpdated
  };
};

/**
 * Buka kunci periode tertentu (fitur admin perbaikan data)
 */
export const unlockPeriode = async (periode: string): Promise<{ success: boolean; message?: string }> => {
  if (isGasEnvironment()) {
    return new Promise((resolve) => {
      (window as any).google.script.run
        .withSuccessHandler((res: any) => resolve(res))
        .withFailureHandler((err: any) => resolve({ success: false, message: String(err) }))
        .unlockPeriode(periode);
    });
  }

  if (isBackendConfigured()) {
    try {
      const res = await apiPost('unlockPeriode', { periode });
      if (res && res.success !== undefined) return res;
    } catch (err) {}
  }

  try {
    const rawLocked = localStorage.getItem(LOCAL_STORAGE_KEYS.LOCKED);
    let lockedPeriodes: string[] = rawLocked ? JSON.parse(rawLocked) : [];
    lockedPeriodes = lockedPeriodes.filter(p => p !== periode);
    localStorage.setItem(LOCAL_STORAGE_KEYS.LOCKED, JSON.stringify(lockedPeriodes));

    const rawUptime = localStorage.getItem(LOCAL_STORAGE_KEYS.UPTIME);
    if (rawUptime) {
      let uptimeFiles: ParsedUptimeFile[] = JSON.parse(rawUptime);
      uptimeFiles = uptimeFiles.filter(f => f.periode !== periode);
      localStorage.setItem(LOCAL_STORAGE_KEYS.UPTIME, JSON.stringify(uptimeFiles));
    }

    return {
      success: true,
      message: `Periode ${periode} berhasil dibuka kuncinya dari Database Lokal.`
    };
  } catch (err: any) {
    return {
      success: false,
      message: err.message
    };
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
 * Mengambil seluruh data tiket follow-up dari Google Spreadsheet / LocalStorage
 */
export const fetchFollowUpTickets = async (): Promise<{ success: boolean; tickets: FollowUpTicket[]; error?: string }> => {
  if (isGasEnvironment()) {
    return new Promise((resolve) => {
      (window as any).google.script.run
        .withSuccessHandler((res: { success: boolean; tickets: FollowUpTicket[] }) => {
          resolve(res || { success: true, tickets: [] });
        })
        .withFailureHandler((err: any) => {
          resolve({
            success: false,
            tickets: [],
            error: err?.message || String(err)
          });
        })
        .getFollowUpTickets();
    });
  }

  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_FOLLOWUP_KEY);
    const tickets: FollowUpTicket[] = raw ? JSON.parse(raw) : [];
    return { success: true, tickets };
  } catch (err: any) {
    return { success: false, tickets: [], error: err.message };
  }
};

/**
 * Menyimpan / memperbarui tiket follow-up ke Google Spreadsheet / LocalStorage
 */
export const saveFollowUpTicket = async (ticket: FollowUpTicket): Promise<{ success: boolean; ticket?: FollowUpTicket; message?: string; error?: string }> => {
  if (isGasEnvironment()) {
    return new Promise((resolve) => {
      (window as any).google.script.run
        .withSuccessHandler((res: any) => resolve(res || { success: true, ticket }))
        .withFailureHandler((err: any) => resolve({ success: false, error: err?.message || String(err) }))
        .saveFollowUpTicket(ticket);
    });
  }

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
 * Menghapus tiket follow-up dari Google Spreadsheet / LocalStorage
 */
export const deleteFollowUpTicket = async (ticketId: string): Promise<{ success: boolean; message?: string; error?: string }> => {
  if (isGasEnvironment()) {
    return new Promise((resolve) => {
      (window as any).google.script.run
        .withSuccessHandler((res: any) => resolve(res || { success: true }))
        .withFailureHandler((err: any) => resolve({ success: false, error: err?.message || String(err) }))
        .deleteFollowUpTicket(ticketId);
    });
  }

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
  sumberProblem: 'OPEN_INCIDENT' | 'FREKUENSI';
  prioritas: 'NORMAL' | 'HIGH' | 'URGENT';
  kategori: 'VENDOR' | 'FLM' | 'SLM' | 'CABANG' | 'JALUR' | 'LAINNYA';
  catatanRequest: string;
  createdBy: string;
  createdAt: string;
  status: 'OPEN' | 'IN_PROGRESS' | 'REQ_CLOSE' | 'RE_OPEN' | 'CLOSED';
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

  if (isGasEnvironment()) {
    return new Promise((resolve) => {
      (window as any).google.script.run
        .withSuccessHandler((res: { success: boolean; tickets: FollowUpTicketItem[] }) => {
          resolve(res || { success: true, tickets: [] });
        })
        .withFailureHandler((err: any) => {
          resolve({
            success: false,
            tickets: [],
            error: err?.message || String(err)
          });
        })
        .getFollowUpTicketsModern();
    });
  }

  if (isBackendConfigured()) {
    try {
      const res = await apiGet('getFollowUpTicketsModern');
      if (res && res.success !== undefined) {
        return { success: true, tickets: res.tickets || [] };
      }
    } catch (err: any) {
      console.warn('API fetchFollowUpTicketsModern failed, fallback local:', err);
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

  if (isGasEnvironment()) {
    return new Promise((resolve) => {
      (window as any).google.script.run
        .withSuccessHandler((res: any) => resolve(res || { success: true, ticket }))
        .withFailureHandler((err: any) => resolve({ success: false, error: err?.message || String(err) }))
        .saveFollowUpTicketModern(ticket);
    });
  }

  if (isBackendConfigured()) {
    try {
      const res = await apiPost('saveFollowUpTicketModern', { ticket });
      if (res && res.success !== undefined) return res;
    } catch (err: any) {
      console.warn('API saveFollowUpTicketModern failed, fallback local:', err);
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

  if (isGasEnvironment()) {
    return new Promise((resolve) => {
      (window as any).google.script.run
        .withSuccessHandler((res: any) => resolve(res || { success: true }))
        .withFailureHandler((err: any) => resolve({ success: false, error: err?.message || String(err) }))
        .deleteFollowUpTicketModern(ticketId);
    });
  }

  if (isBackendConfigured()) {
    try {
      const res = await apiPost('deleteFollowUpTicketModern', { ticketId });
      if (res && res.success !== undefined) return res;
    } catch (err: any) {}
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

