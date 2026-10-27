import * as XLSX from 'xlsx';
import type { MachineData, MonthlyProblemData } from '../store/useDataStore';
import type { MasterRow, ParsedUptimeFile } from './excelParser';
import { hwDetailMap } from './problemCalculator';

export const SERVICE_POINT_MAP: Record<string, string> = {
  'ACJK': 'ABACUS JAKARTA',
  'ACBT': 'ABACUS BINTARO',
  'ACCK': 'ABACUS CIKANDE',
  'ACSR': 'ABACUS SERANG',
  'ACBS': 'ABACUS BEKASI',
  'ACRW': 'ABACUS RAWAMANGUN'
};

export function getServicePointName(sektorName?: string | null, wilayah?: string | null): string {
  if (sektorName && sektorName !== 'Unknown' && sektorName !== '-') {
    const sNorm = sektorName.trim().toUpperCase();
    if (SERVICE_POINT_MAP[sNorm]) return SERVICE_POINT_MAP[sNorm];
    if (Object.values(SERVICE_POINT_MAP).map(v => v.toUpperCase()).includes(sNorm)) {
      return sNorm;
    }
    const prefix = sektorName.split('-')[0].trim().toUpperCase();
    if (SERVICE_POINT_MAP[prefix]) return SERVICE_POINT_MAP[prefix];
  }
  if (wilayah && wilayah !== '-' && wilayah !== 'Unknown') {
    const wNorm = wilayah.trim().toUpperCase();
    if (SERVICE_POINT_MAP[wNorm]) return SERVICE_POINT_MAP[wNorm];
    if (Object.values(SERVICE_POINT_MAP).map(v => v.toUpperCase()).includes(wNorm)) {
      return wNorm;
    }
  }
  if (!sektorName || sektorName === 'Unknown' || sektorName === '-') return 'Unknown Service Point';
  const prefix = sektorName.split('-')[0].trim().toUpperCase();
  return SERVICE_POINT_MAP[prefix] || `Unknown (${prefix})`;
}

// Universal safe number helper
export function safeNum(val: any, decimals: number = 2): number {
  if (val === null || val === undefined || isNaN(val) || !isFinite(val)) return 0;
  return Number(Number(val).toFixed(decimals));
}

// Universal helper to guarantee sheets are never empty
export function ensureRows<T extends object>(rows: T[], fallbackRow: T): T[] {
  return rows.length > 0 ? rows : [fallbackRow];
}

// Helper to determine dominant category
export function getDominantCategory(uh: number, kom: number, up: number, hw: number, ll: number): string {
  const cats = [
    { name: 'Hardware (H/W)', val: hw },
    { name: 'Uang Habis (UH)', val: uh },
    { name: 'Komunikasi (KOM)', val: kom },
    { name: 'Uang Penuh (UP)', val: up },
    { name: 'Lain-lain (LL)', val: ll },
  ].sort((a, b) => b.val - a.val);

  return cats[0].val > 0 ? cats[0].name : 'Normal (0%)';
}

// Helper untuk membuat visual progress bar uptime di Excel
export function generateUptimeBar(uptime: number): string {
  if (uptime <= 0 || isNaN(uptime)) return '[░░░░░░░░░░░░░░░░] 0.00%';
  const val = Math.min(Math.max(uptime, 0), 100);
  const totalBlocks = 16;
  let filled = 0;
  if (val >= 90) {
    filled = Math.round(((val - 90) / 10) * totalBlocks);
  } else {
    filled = Math.round((val / 100) * totalBlocks);
  }
  filled = Math.min(Math.max(filled, 0), totalBlocks);
  const empty = totalBlocks - filled;
  return `[${'█'.repeat(filled)}${'░'.repeat(empty)}] ${val.toFixed(2)}%`;
}

// Helper untuk menghitung performa terpisah (mesin ATM / CRM / gabungan)
export function calculateMachineMetrics(machList: any[]) {
  const count = machList.length;
  if (count === 0) {
    return {
      count: 0,
      downtime: 0,
      uptime: 100,
      uh: 0,
      kom: 0,
      up: 0,
      hw: 0,
      ll: 0,
      dominant: '-'
    };
  }
  const dt = machList.reduce((acc, m) => acc + (m.avgTotal || 0), 0) / count;
  const uh = machList.reduce((acc, m) => acc + (m.avgUh || 0), 0) / count;
  const kom = machList.reduce((acc, m) => acc + (m.avgKom || 0), 0) / count;
  const up = machList.reduce((acc, m) => acc + (m.avgUp || 0), 0) / count;
  const hw = machList.reduce((acc, m) => acc + (m.avgHw || 0), 0) / count;
  const ll = machList.reduce((acc, m) => acc + (m.avgLl || 0), 0) / count;

  return {
    count,
    downtime: dt,
    uptime: 100 - dt,
    uh,
    kom,
    up,
    hw,
    ll,
    dominant: getDominantCategory(uh, kom, up, hw, ll)
  };
}

const MONTH_NAMES_ID: Record<string, string> = {
  '01': 'Januari', '1': 'Januari',
  '02': 'Februari', '2': 'Februari',
  '03': 'Maret', '3': 'Maret',
  '04': 'April', '4': 'April',
  '05': 'Mei', '5': 'Mei',
  '06': 'Juni', '6': 'Juni',
  '07': 'Juli', '7': 'Juli',
  '08': 'Agustus', '8': 'Agustus',
  '09': 'September', '9': 'September',
  '10': 'Oktober',
  '11': 'November',
  '12': 'Desember'
};

const MONTH_NAME_MAP: Record<string, string> = {
  januari: '01', january: '01', jan: '01',
  februari: '02', february: '02', feb: '02',
  maret: '03', march: '03', mar: '03',
  april: '04', apr: '04',
  mei: '05', may: '05',
  juni: '06', june: '06', jun: '06',
  juli: '07', july: '07', jul: '07',
  agustus: '08', august: '08', agt: '08', agu: '08', aug: '08',
  september: '09', sep: '09',
  oktober: '10', october: '10', okt: '10', oct: '10',
  november: '11', nopember: '11', nov: '11', nop: '11',
  desember: '12', december: '12', des: '12', dec: '12'
};

/**
 * Normalisasi segala format periode (termasuk GAS/JS Date string, ISO, YYYY-MM, Nama Bulan)
 * menjadi format standar "YYYY-MM" (misal: "2026-05")
 */
export function normalizePeriode(val: any): string {
  if (!val) return '';
  if (val instanceof Date) {
    const y = val.getFullYear();
    const m = String(val.getMonth() + 1).padStart(2, '0');
    return `${y}-${m}`;
  }
  const str = String(val).trim();
  if (str === 'ALL') return 'ALL';

  // 1. Format standar YYYY-MM (e.g. 2026-05, 2026/05)
  const yyyyMm = str.match(/^(\d{4})[-/](\d{1,2})$/);
  if (yyyyMm) {
    return `${yyyyMm[1]}-${yyyyMm[2].padStart(2, '0')}`;
  }

  // 2. Format MM-YYYY (e.g. 05-2026)
  const mmYyyy = str.match(/^(\d{1,2})[-/](\d{4})$/);
  if (mmYyyy) {
    return `${mmYyyy[2]}-${mmYyyy[1].padStart(2, '0')}`;
  }

  // 3. String tanggal JS/GAS (e.g. "Fri May 01 2026 00:00:00 GMT+0700 (Western Indonesia Time)" atau ISO)
  // Ekstrak nama bulan dan tahun langsung dari string untuk menghindari pergeseran timezone
  const dateStrMatch = str.match(/([a-zA-Z]{3,})\s+(\d{1,2})?\s*,\s*(20\d{2})/) ||
                       str.match(/[a-zA-Z]{3}\s+([a-zA-Z]{3,})\s+\d{1,2}\s+(20\d{2})/i) ||
                       str.match(/(20\d{2})[-/](\d{2})[-/](\d{2})/);
  if (dateStrMatch) {
    if (dateStrMatch[0].includes('-') || dateStrMatch[0].includes('/')) {
      // ISO YYYY-MM-DD
      const isoY = dateStrMatch[1];
      const isoM = dateStrMatch[2];
      return `${isoY}-${isoM}`;
    }
    const monthWord = (dateStrMatch[1] || '').toLowerCase();
    const yearStr = dateStrMatch[2] || dateStrMatch[3];
    for (const [key, num] of Object.entries(MONTH_NAME_MAP)) {
      if (monthWord.startsWith(key)) {
        return `${yearStr}-${num}`;
      }
    }
  }

  // 4. String dengan nama bulan dan tahun (e.g. "Mei 2026", "UT Mei'26")
  const lower = str.toLowerCase();
  for (const [key, num] of Object.entries(MONTH_NAME_MAP)) {
    const r = new RegExp(`(?:^|[^a-z])(${key})(?:[^a-z]|$)`, 'i');
    if (lower.match(r)) {
      const y4Match = str.match(/(20\d{2})/);
      if (y4Match) {
        return `${y4Match[1]}-${num}`;
      }
      const y2Match = str.match(/(?:^|[^0-9])([2-9]\d)(?:[^0-9]|$)/);
      if (y2Match) {
        return `20${y2Match[1]}-${num}`;
      }
    }
  }

  // 5. Fallback Date parse
  const d = new Date(str);
  if (!isNaN(d.getTime()) && (str.includes('GMT') || str.includes('T') || str.length > 15)) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    return `${y}-${m}`;
  }

  return str;
}

export function formatBulanTahun(periode: string): string {
  if (!periode) return '-';
  if (periode === 'ALL') return 'Semua Bulan';
  
  const norm = normalizePeriode(periode);
  const match = norm.match(/^(\d{4})-(\d{2})$/);
  if (match) {
    const y = match[1];
    const m = match[2];
    return `${MONTH_NAMES_ID[m] || m} ${y}`;
  }

  return String(periode);
}

/**
 * Automatically calculates optimal column widths based on contents and headers.
 * Caps column width between minWidth and 50 characters to prevent awkward wrapping.
 */
export function autoFitColumns(ws: XLSX.WorkSheet, minWidth: number = 10) {
  if (!ws['!ref']) return;
  const range = XLSX.utils.decode_range(ws['!ref']);
  const colWidths: number[] = [];

  for (let C = range.s.c; C <= range.e.c; ++C) {
    let maxLen = minWidth;
    for (let R = range.s.r; R <= range.e.r; ++R) {
      const cell = ws[XLSX.utils.encode_cell({ r: R, c: C })];
      if (cell && cell.v !== undefined && cell.v !== null) {
        const str = String(cell.v);
        if (str.length > maxLen) {
          maxLen = Math.min(str.length + 3, 50);
        }
      }
    }
    colWidths[C] = maxLen;
  }
  ws['!cols'] = colWidths.map(w => ({ wch: w }));
}

/**
 * Universal browser-safe Excel file downloader.
 * Writes standard OOXML binary array buffer with official Excel MIME type.
 */
export function downloadWorkbookAsExcel(wb: XLSX.WorkBook, filename: string) {
  const safeFilename = filename.toLowerCase().endsWith('.xlsx') ? filename : `${filename}.xlsx`;

  const excelBuffer = XLSX.write(wb, {
    bookType: 'xlsx',
    type: 'array',
    compression: true,
  });

  const blob = new Blob([excelBuffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;charset=UTF-8',
  });

  if (typeof window !== 'undefined') {
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = safeFilename;
    document.body.appendChild(link);
    link.click();

    setTimeout(() => {
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    }, 250);
  }
}

// =========================================================================
// 1. MENU SERVICE POINT EXPORT (2 Sheets)
// =========================================================================
export interface ServicePointExportData {
  servicePoint: string;
  jumlahSektor: number;
  jumlahMesin: number;
  rataRataUptime: number;
  rataRataDowntime?: number;
  uh?: number;
  kom?: number;
  up?: number;
  hw?: number;
  ll?: number;
  dominantProblem?: string;
  sektorList?: Array<{
    namaSektor: string;
    jumlahMesin: number;
    uptime: number;
    downtime?: number;
    uh?: number;
    kom?: number;
    up?: number;
    hw?: number;
    ll?: number;
    dominantProblem?: string;
    bcaMachines?: MachineData[];
  }>;
}

export function exportServicePointExcel(dataServicePoint: ServicePointExportData[], filenamePrefix?: string) {
  const wb = XLSX.utils.book_new();

  // -------------------------------------------------------------
  // Sheet 1: Distribusi Service Point
  // -------------------------------------------------------------
  let totalSektor = 0;
  let totalMesin = 0;
  let weightedUptimeSum = 0;
  let weightedDowntimeSum = 0;

  const sheet1Rows = dataServicePoint.map((d, idx) => {
    const downtime = d.rataRataDowntime !== undefined ? d.rataRataDowntime : (100 - d.rataRataUptime);
    totalSektor += d.jumlahSektor;
    totalMesin += d.jumlahMesin;
    weightedUptimeSum += d.rataRataUptime * d.jumlahMesin;
    weightedDowntimeSum += downtime * d.jumlahMesin;

    return {
      'No': idx + 1,
      'Service Point': d.servicePoint,
      'Jumlah Sektor': d.jumlahSektor,
      'Total Mesin Aktif': d.jumlahMesin,
      'Rata-rata Uptime (%)': safeNum(d.rataRataUptime),
      'Rata-rata Downtime (%)': safeNum(downtime),
      'Downtime UH (%)': safeNum(d.uh),
      'Downtime KOM (%)': safeNum(d.kom),
      'Downtime UP (%)': safeNum(d.up),
      'Downtime H/W (%)': safeNum(d.hw),
      'Downtime LL (%)': safeNum(d.ll),
      'Problem Dominan': d.dominantProblem || getDominantCategory(d.uh || 0, d.kom || 0, d.up || 0, d.hw || 0, d.ll || 0)
    };
  });

  const avgUptime = totalMesin > 0 ? weightedUptimeSum / totalMesin : 100;
  const avgDowntime = totalMesin > 0 ? weightedDowntimeSum / totalMesin : 0;

  if (sheet1Rows.length > 0) {
    sheet1Rows.push({
      'No': 'TOTAL' as any,
      'Service Point': 'KESELURUHAN (SERVICE POINT)',
      'Jumlah Sektor': totalSektor,
      'Total Mesin Aktif': totalMesin,
      'Rata-rata Uptime (%)': safeNum(avgUptime),
      'Rata-rata Downtime (%)': safeNum(avgDowntime),
      'Downtime UH (%)': '-' as any,
      'Downtime KOM (%)': '-' as any,
      'Downtime UP (%)': '-' as any,
      'Downtime H/W (%)': '-' as any,
      'Downtime LL (%)': '-' as any,
      'Problem Dominan': '-'
    });
  }

  const ws1 = XLSX.utils.json_to_sheet(sheet1Rows.length > 0 ? sheet1Rows : [{
    'No': 1, 'Service Point': 'Belum ada data', 'Jumlah Sektor': 0, 'Total Mesin Aktif': 0,
    'Rata-rata Uptime (%)': 100, 'Rata-rata Downtime (%)': 0, 'Downtime UH (%)': 0,
    'Downtime KOM (%)': 0, 'Downtime UP (%)': 0, 'Downtime H/W (%)': 0, 'Downtime LL (%)': 0, 'Problem Dominan': '-'
  }]);
  autoFitColumns(ws1);
  XLSX.utils.book_append_sheet(wb, ws1, 'Distribusi Service Point');

  // -------------------------------------------------------------
  // Sheet 2: Daftar Sektor dalam SP
  // -------------------------------------------------------------
  const sheet2Rows: any[] = [];
  let sIndex = 1;

  dataServicePoint.forEach(sp => {
    (sp.sektorList || []).forEach(sektor => {
      const dt = sektor.downtime !== undefined ? sektor.downtime : (100 - sektor.uptime);
      sheet2Rows.push({
        'No': sIndex++,
        'Service Point': sp.servicePoint,
        'Nama Sektor': sektor.namaSektor,
        'Jumlah Mesin BCA Aktif': sektor.jumlahMesin,
        'Uptime per Sektor (%)': safeNum(sektor.uptime),
        'Downtime per Sektor (%)': safeNum(dt),
        'Downtime UH (%)': safeNum(sektor.uh),
        'Downtime KOM (%)': safeNum(sektor.kom),
        'Downtime UP (%)': safeNum(sektor.up),
        'Downtime H/W (%)': safeNum(sektor.hw),
        'Downtime LL (%)': safeNum(sektor.ll),
        'Problem Dominan': sektor.dominantProblem || getDominantCategory(sektor.uh || 0, sektor.kom || 0, sektor.up || 0, sektor.hw || 0, sektor.ll || 0)
      });
    });
  });

  const ws2 = XLSX.utils.json_to_sheet(sheet2Rows.length > 0 ? sheet2Rows : [{
    'No': 1, 'Service Point': '-', 'Nama Sektor': 'Belum ada data sektor',
    'Jumlah Mesin BCA Aktif': 0, 'Uptime per Sektor (%)': 100, 'Downtime per Sektor (%)': 0,
    'Downtime UH (%)': 0, 'Downtime KOM (%)': 0, 'Downtime UP (%)': 0,
    'Downtime H/W (%)': 0, 'Downtime LL (%)': 0, 'Problem Dominan': '-'
  }]);
  autoFitColumns(ws2);
  XLSX.utils.book_append_sheet(wb, ws2, 'Daftar Sektor dalam SP');

  const dateStr = new Date().toISOString().split('T')[0];
  const filename = filenamePrefix || `Distribusi_Mesin_Service_Point_${dateStr}.xlsx`;
  downloadWorkbookAsExcel(wb, filename);
}

// =========================================================================
// 2. MENU MESIN PER SEKTOREXPORT (2 Sheets)
// =========================================================================
export interface SektorExportData {
  sektor: string;
  servicePoint: string;
  bcaAktif: number;
  nonBcaAktif: number;
  totalAktif: number;
  rataRataDowntime: number;
  rataRataUptime: number;
  uh?: number;
  kom?: number;
  up?: number;
  hw?: number;
  ll?: number;
  highestProblem?: {
    categoryKey: string;
    categoryName: string;
    value: number;
  };
  machinesBCA?: MachineData[];
}

export function exportMesinPerSektorExcel(dataSektor: SektorExportData[], filenamePrefix?: string) {
  const wb = XLSX.utils.book_new();

  // -------------------------------------------------------------
  // Sheet 1: Distribusi Mesin per Sektor
  // -------------------------------------------------------------
  let totalBca = 0;
  let totalNonBca = 0;
  let totalAll = 0;
  let weightedDowntimeSum = 0;

  const sheet1Rows = dataSektor.map((d, idx) => {
    totalBca += d.bcaAktif;
    totalNonBca += d.nonBcaAktif;
    totalAll += d.totalAktif;
    weightedDowntimeSum += d.rataRataDowntime * d.totalAktif;

    return {
      'No': idx + 1,
      'Sektor': d.sektor,
      'Service Point': d.servicePoint,
      'Jumlah Mesin Aktif BCA': d.bcaAktif,
      'Jumlah Mesin Aktif Non BCA': d.nonBcaAktif,
      'Total Mesin Aktif': d.totalAktif,
      'Rata-rata Downtime Total (%)': safeNum(d.rataRataDowntime),
      'Rata-rata Uptime (%)': safeNum(d.rataRataUptime),
      'Kategori Problem Tertinggi': d.highestProblem?.categoryName || '-',
      'Nilai Problem Tertinggi (%)': safeNum(d.highestProblem?.value),
      'Downtime UH (%)': safeNum(d.uh),
      'Downtime KOM (%)': safeNum(d.kom),
      'Downtime UP (%)': safeNum(d.up),
      'Downtime H/W (%)': safeNum(d.hw),
      'Downtime LL (%)': safeNum(d.ll)
    };
  });

  const avgDtAll = totalAll > 0 ? weightedDowntimeSum / totalAll : 0;

  if (sheet1Rows.length > 0) {
    sheet1Rows.push({
      'No': 'TOTAL' as any,
      'Sektor': 'KESELURUHAN (SEKTOR)',
      'Service Point': '-',
      'Jumlah Mesin Aktif BCA': totalBca,
      'Jumlah Mesin Aktif Non BCA': totalNonBca,
      'Total Mesin Aktif': totalAll,
      'Rata-rata Downtime Total (%)': safeNum(avgDtAll),
      'Rata-rata Uptime (%)': safeNum(100 - avgDtAll),
      'Kategori Problem Tertinggi': '-',
      'Nilai Problem Tertinggi (%)': '-' as any,
      'Downtime UH (%)': '-' as any,
      'Downtime KOM (%)': '-' as any,
      'Downtime UP (%)': '-' as any,
      'Downtime H/W (%)': '-' as any,
      'Downtime LL (%)': '-' as any
    });
  }

  const ws1 = XLSX.utils.json_to_sheet(sheet1Rows.length > 0 ? sheet1Rows : [{
    'No': 1, 'Sektor': 'Belum ada data sektor', 'Service Point': '-',
    'Jumlah Mesin Aktif BCA': 0, 'Jumlah Mesin Aktif Non BCA': 0, 'Total Mesin Aktif': 0,
    'Rata-rata Downtime Total (%)': 0, 'Rata-rata Uptime (%)': 100,
    'Kategori Problem Tertinggi': '-', 'Nilai Problem Tertinggi (%)': 0,
    'Downtime UH (%)': 0, 'Downtime KOM (%)': 0, 'Downtime UP (%)': 0,
    'Downtime H/W (%)': 0, 'Downtime LL (%)': 0
  }]);
  autoFitColumns(ws1);
  XLSX.utils.book_append_sheet(wb, ws1, 'Distribusi Mesin per Sektor');

  // -------------------------------------------------------------
  // Sheet 2: Daftar Mesin (BCA) / Per Sektor
  // -------------------------------------------------------------
  const sheet2Rows: any[] = [];
  let mIndex = 1;

  dataSektor.forEach(s => {
    (s.machinesBCA || []).forEach(m => {
      const agg = (m as any).aggregatedData || {};
      const dt = agg.total || 0;
      const up = 100 - dt;
      const uh = agg.uh || 0;
      const kom = agg.kom || 0;
      const upCat = agg.up || 0;
      const hw = agg.hw || 0;
      const ll = agg.ll || 0;
      const dominant = getDominantCategory(uh, kom, upCat, hw, ll);

      sheet2Rows.push({
        'No': mIndex++,
        'Sektor': s.sektor,
        'Service Point': s.servicePoint,
        'WSID': m.wsid,
        'Nama Lokasi': m.lokasi,
        'Vendor': m.vendor || '-',
        'Jenis Mesin': m.jenisMesin,
        'Tipe Mesin': m.tipeMesin,
        'Status': m.statusAktif,
        'Klien': 'BCA',
        'Total Downtime (%)': safeNum(dt),
        'Uptime (%)': safeNum(up),
        'Downtime UH (%)': safeNum(uh),
        'Downtime KOM (%)': safeNum(kom),
        'Downtime UP (%)': safeNum(upCat),
        'Downtime H/W (%)': safeNum(hw),
        'Downtime LL (%)': safeNum(ll),
        'Problem Dominan': dominant,
        'Total Frekuensi Problem': agg.frxTotal || 0,
        'Total Durasi Problem (Menit)': agg.durTotal || 0
      });
    });
  });

  const ws2 = XLSX.utils.json_to_sheet(sheet2Rows.length > 0 ? sheet2Rows : [{
    'No': 1, 'Sektor': '-', 'Service Point': '-', 'WSID': '-', 'Nama Lokasi': 'Belum ada data mesin BCA',
    'Vendor': '-', 'Jenis Mesin': '-', 'Tipe Mesin': '-', 'Status': '-', 'Klien': 'BCA',
    'Total Downtime (%)': 0, 'Uptime (%)': 100, 'Downtime UH (%)': 0, 'Downtime KOM (%)': 0,
    'Downtime UP (%)': 0, 'Downtime H/W (%)': 0, 'Downtime LL (%)': 0, 'Problem Dominan': '-',
    'Total Frekuensi Problem': 0, 'Total Durasi Problem (Menit)': 0
  }]);
  autoFitColumns(ws2);
  XLSX.utils.book_append_sheet(wb, ws2, 'Daftar Mesin BCA per Sektor');

  const dateStr = new Date().toISOString().split('T')[0];
  const filename = filenamePrefix || `Distribusi_Mesin_Per_Sektor_${dateStr}.xlsx`;
  downloadWorkbookAsExcel(wb, filename);
}

// =========================================================================
// 3. MENU SELURUH WSID AKTIF EXPORT (1 Sheet)
// =========================================================================
export function exportAllWsidExcel(machines: (MachineData & { aggregatedData?: any })[], filenamePrefix?: string) {
  const wb = XLSX.utils.book_new();

  let sumDowntime = 0;
  let totalFrx = 0;
  let totalDur = 0;

  const rows = machines.map((m, idx) => {
    const agg = (m as any).aggregatedData || {};
    const dt = agg.total || 0;
    const up = 100 - dt;
    const uh = agg.uh || 0;
    const kom = agg.kom || 0;
    const upCat = agg.up || 0;
    const hw = agg.hw || 0;
    const ll = agg.ll || 0;
    const frx = agg.frxTotal || 0;
    const dur = agg.durTotal || 0;

    sumDowntime += dt;
    totalFrx += frx;
    totalDur += dur;

    const dominant = getDominantCategory(uh, kom, upCat, hw, ll);

    return {
      'No': idx + 1,
      'WSID': m.wsid,
      'Nama Lokasi': m.lokasi,
      'Vendor': m.vendor || '-',
      'Sektor': m.sektorBCA || '-',
      'Service Point': getServicePointName(m.sektorBCA),
      'Jenis Mesin': m.jenisMesin,
      'Tipe Mesin': m.tipeMesin,
      'Status': m.statusAktif,
      'Klien': m.klienStatus,
      'Total Downtime (%)': safeNum(dt),
      'Uptime (%)': safeNum(up),
      'Problem Dominan': dominant,
      'Downtime UH (%)': safeNum(uh),
      'Downtime KOM (%)': safeNum(kom),
      'Downtime UP (%)': safeNum(upCat),
      'Downtime H/W (%)': safeNum(hw),
      'Downtime LL (%)': safeNum(ll),
      'Total Frekuensi Problem': frx,
      'Total Durasi Problem (Menit)': dur
    };
  });

  const count = machines.length;
  const avgDt = count > 0 ? sumDowntime / count : 0;

  if (rows.length > 0) {
    rows.push({
      'No': 'TOTAL' as any,
      'WSID': `${count} Mesin`,
      'Nama Lokasi': 'RATA-RATA KESELURUHAN WSID AKTIF (BCA)',
      'Vendor': '-',
      'Sektor': '-',
      'Service Point': '-',
      'Jenis Mesin': '-',
      'Tipe Mesin': '-',
      'Status': 'AKTIF',
      'Klien': 'BCA',
      'Total Downtime (%)': safeNum(avgDt),
      'Uptime (%)': safeNum(100 - avgDt),
      'Problem Dominan': '-',
      'Downtime UH (%)': '-' as any,
      'Downtime KOM (%)': '-' as any,
      'Downtime UP (%)': '-' as any,
      'Downtime H/W (%)': '-' as any,
      'Downtime LL (%)': '-' as any,
      'Total Frekuensi Problem': totalFrx,
      'Total Durasi Problem (Menit)': totalDur
    });
  }

  const ws = XLSX.utils.json_to_sheet(rows.length > 0 ? rows : [{
    'No': 1, 'WSID': '-', 'Nama Lokasi': 'Belum ada data WSID aktif', 'Vendor': '-', 'Sektor': '-',
    'Service Point': '-', 'Jenis Mesin': '-', 'Tipe Mesin': '-', 'Status': '-', 'Klien': 'BCA',
    'Total Downtime (%)': 0, 'Uptime (%)': 100, 'Problem Dominan': '-', 'Downtime UH (%)': 0,
    'Downtime KOM (%)': 0, 'Downtime UP (%)': 0, 'Downtime H/W (%)': 0, 'Downtime LL (%)': 0,
    'Total Frekuensi Problem': 0, 'Total Durasi Problem (Menit)': 0
  }]);
  autoFitColumns(ws);
  XLSX.utils.book_append_sheet(wb, ws, 'Seluruh WSID Aktif (BCA)');

  const dateStr = new Date().toISOString().split('T')[0];
  const filename = filenamePrefix || `Seluruh_WSID_Aktif_BCA_${dateStr}.xlsx`;
  downloadWorkbookAsExcel(wb, filename);
}

// =========================================================================
// 4. MENU / DASHBOARD DETAIL PERFORMA (WSID) EXPORT (2 Sheets)
// =========================================================================
export function exportWsidDetailExcel(machine: MachineData, filenamePrefix?: string) {
  const wb = XLSX.utils.book_new();

  // Helper format bulan
  const formatBulan = (periode: string) => {
    const [year, month] = periode.split('-');
    const months = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
    if (!year || !month || isNaN(parseInt(month, 10))) return periode;
    return `${months[parseInt(month, 10) - 1]} ${year}`;
  };

  const sortedMonths = [...(machine.monthlyData || [])].sort((a, b) => a.periode.localeCompare(b.periode));

  // -------------------------------------------------------------
  // Sheet 1: Detail Performa WSID (Monthly Table + Info Header)
  // -------------------------------------------------------------
  const aoa: any[][] = [];

  // Info Header Section
  aoa.push(['DETAIL PERFORMA DOWNTIME MESIN']);
  aoa.push(['WSID', machine.wsid, 'Nama Lokasi', machine.lokasi, 'Vendor', machine.vendor || '-']);
  aoa.push(['Sektor', machine.sektorBCA || '-', 'Service Point', getServicePointName(machine.sektorBCA)]);
  aoa.push(['Jenis Mesin', machine.jenisMesin, 'Tipe Mesin', machine.tipeMesin]);
  aoa.push(['Status', machine.statusAktif, 'Hari Operasional', machine.hari || '-', 'Jam Operasional', machine.jam || '-']);
  aoa.push([]); // blank row

  // Table Headers
  aoa.push([
    'No', 'Periode Bulan', 'Total Downtime (%)', 'Uptime (%)', 'Total Frekuensi', 'Total Durasi (Menit)',
    'UH Frekuensi', 'UH Durasi (Menit)', 'UH (%)',
    'KOM Frekuensi', 'KOM Durasi (Menit)', 'KOM (%)',
    'UP Frekuensi', 'UP Durasi (Menit)', 'UP (%)',
    'H/W Frekuensi', 'H/W Durasi (Menit)', 'H/W (%)',
    'LL Frekuensi', 'LL Durasi (Menit)', 'LL (%)',
    'Problem Dominan'
  ]);

  let sumDt = 0;
  let sumFrx = 0;
  let sumDur = 0;
  let sumUh = 0;
  let sumKom = 0;
  let sumUp = 0;
  let sumHw = 0;
  let sumLl = 0;

  sortedMonths.forEach((m, idx) => {
    const dt = m.total || 0;
    const up = 100 - dt;
    const uh = m.uh || 0;
    const kom = m.kom || 0;
    const upCat = m.up || 0;
    const hw = m.hw || 0;
    const ll = m.ll || 0;
    const dominant = getDominantCategory(uh, kom, upCat, hw, ll);

    sumDt += dt;
    sumFrx += m.frxTotal || 0;
    sumDur += m.durTotal || 0;
    sumUh += uh;
    sumKom += kom;
    sumUp += upCat;
    sumHw += hw;
    sumLl += ll;

    aoa.push([
      idx + 1,
      formatBulan(m.periode),
      safeNum(dt),
      safeNum(up),
      m.frxTotal || 0,
      m.durTotal || 0,
      m.uhFrx || 0,
      m.uhDur || 0,
      safeNum(uh),
      m.komFrx || 0,
      m.komDur || 0,
      safeNum(kom),
      m.upFrx || 0,
      m.upDur || 0,
      safeNum(upCat),
      m.hwFrx || 0,
      m.hwDur || 0,
      safeNum(hw),
      m.llFrx || 0,
      m.llDur || 0,
      safeNum(ll),
      dominant
    ]);
  });

  const monthCount = sortedMonths.length;
  if (monthCount > 0) {
    aoa.push([
      'RATA-RATA',
      `${monthCount} Bulan`,
      safeNum(sumDt / monthCount),
      safeNum(100 - (sumDt / monthCount)),
      Math.round(sumFrx / monthCount),
      Math.round(sumDur / monthCount),
      Math.round((sortedMonths.reduce((a, c) => a + (c.uhFrx || 0), 0)) / monthCount),
      Math.round((sortedMonths.reduce((a, c) => a + (c.uhDur || 0), 0)) / monthCount),
      safeNum(sumUh / monthCount),
      Math.round((sortedMonths.reduce((a, c) => a + (c.komFrx || 0), 0)) / monthCount),
      Math.round((sortedMonths.reduce((a, c) => a + (c.komDur || 0), 0)) / monthCount),
      safeNum(sumKom / monthCount),
      Math.round((sortedMonths.reduce((a, c) => a + (c.upFrx || 0), 0)) / monthCount),
      Math.round((sortedMonths.reduce((a, c) => a + (c.upDur || 0), 0)) / monthCount),
      safeNum(sumUp / monthCount),
      Math.round((sortedMonths.reduce((a, c) => a + (c.hwFrx || 0), 0)) / monthCount),
      Math.round((sortedMonths.reduce((a, c) => a + (c.hwDur || 0), 0)) / monthCount),
      safeNum(sumHw / monthCount),
      Math.round((sortedMonths.reduce((a, c) => a + (c.llFrx || 0), 0)) / monthCount),
      Math.round((sortedMonths.reduce((a, c) => a + (c.llDur || 0), 0)) / monthCount),
      safeNum(sumLl / monthCount),
      getDominantCategory(sumUh / monthCount, sumKom / monthCount, sumUp / monthCount, sumHw / monthCount, sumLl / monthCount)
    ]);
  }

  const ws1 = XLSX.utils.aoa_to_sheet(aoa);
  autoFitColumns(ws1);
  XLSX.utils.book_append_sheet(wb, ws1, 'Detail Performa WSID');

  // -------------------------------------------------------------
  // Sheet 2: Breakdown Hardware P01 - P10
  // -------------------------------------------------------------
  const sheet2Rows = sortedMonths.map((m, idx) => {
    const hwMap = m.hwDetail || {};
    return {
      'No': idx + 1,
      'Periode Bulan': formatBulan(m.periode),
      'Total H/W Downtime (%)': safeNum(m.hw),
      'P01 - Pick Modul (%)': safeNum(hwMap.P01),
      'P02 - Presenter (%)': safeNum(hwMap.P02),
      'P03 - Reject (%)': safeNum(hwMap.P03),
      'P04 - Card Reader (%)': safeNum(hwMap.P04),
      'P05 - Komunikasi (%)': safeNum(hwMap.P05),
      'P06 - DIU (%)': safeNum(hwMap.P06),
      'P07 - Uang Habis (%)': safeNum(hwMap.P07),
      'P08 - Replenishment (%)': safeNum(hwMap.P08),
      'P09 - LLH (%)': safeNum(hwMap.P09),
      'P10 - Uang Penuh (%)': safeNum(hwMap.P10)
    };
  });

  const ws2 = XLSX.utils.json_to_sheet(sheet2Rows.length > 0 ? sheet2Rows : [{
    'No': 1, 'Periode Bulan': 'Belum ada data', 'Total H/W Downtime (%)': 0,
    'P01 - Pick Modul (%)': 0, 'P02 - Presenter (%)': 0, 'P03 - Reject (%)': 0,
    'P04 - Card Reader (%)': 0, 'P05 - Komunikasi (%)': 0, 'P06 - DIU (%)': 0,
    'P07 - Uang Habis (%)': 0, 'P08 - Replenishment (%)': 0, 'P09 - LLH (%)': 0, 'P10 - Uang Penuh (%)': 0
  }]);
  autoFitColumns(ws2);
  XLSX.utils.book_append_sheet(wb, ws2, 'Breakdown Hardware WSID');

  const dateStr = new Date().toISOString().split('T')[0];
  const filename = filenamePrefix || `Detail_Performa_${machine.wsid}_${dateStr}.xlsx`;
  downloadWorkbookAsExcel(wb, filename);
}

// =========================================================================
// 5. MENU DASHBOARD GRAFIK INTERAKTIF EXPORT (3 Sheets)
// =========================================================================
export interface DashboardExportParams {
  aggregatedData: any[];
  groupBy: 'SERVICE_POINT' | 'SEKTOR';
  activePeriods: string[];
  metric: string;
  monthRange: string;
  filteredMachines: MachineData[];
  filenamePrefix?: string;
}

export function exportDashboardExcel({
  aggregatedData,
  groupBy,
  activePeriods,
  metric,
  monthRange,
  filteredMachines,
  filenamePrefix
}: DashboardExportParams) {
  const wb = XLSX.utils.book_new();
  const dimensionLabel = groupBy === 'SERVICE_POINT' ? 'Service Point' : 'Sektor';

  // -------------------------------------------------------------
  // Sheet 1: Ringkasan Terfilter
  // -------------------------------------------------------------
  const sheet1Rows = aggregatedData.map((d, idx) => ({
    'No': idx + 1,
    [dimensionLabel]: d.name,
    'Service Point Induk': d.servicePoint,
    'Jumlah Mesin Aktif': d.machineCount,
    'Mesin BCA': d.bcaCount,
    'Mesin Non BCA': d.nonBcaCount,
    'Rata-rata Uptime (%)': safeNum(d.uptime),
    'Total Downtime (%)': safeNum(d.downtimeTotal),
    'Uang Habis (UH) (%)': safeNum(d.uh),
    'Komunikasi (KOM) (%)': safeNum(d.kom),
    'Uang Penuh (UP) (%)': safeNum(d.up),
    'Hardware (H/W) (%)': safeNum(d.hw),
    'Lain-lain (LL) (%)': safeNum(d.ll),
    'Problem Dominan': d.dominantProblem
  }));

  const totalMesin = aggregatedData.reduce((a, b) => a + b.machineCount, 0);
  const totalBca = aggregatedData.reduce((a, b) => a + b.bcaCount, 0);
  const totalNonBca = aggregatedData.reduce((a, b) => a + b.nonBcaCount, 0);
  const avgUptime = totalMesin > 0 
    ? (aggregatedData.reduce((a, b) => a + (b.uptime * b.machineCount), 0) / totalMesin) 
    : 100;
  const avgDt = totalMesin > 0 
    ? (aggregatedData.reduce((a, b) => a + (b.downtimeTotal * b.machineCount), 0) / totalMesin) 
    : 0;

  if (sheet1Rows.length > 0) {
    sheet1Rows.push({
      'No': 'TOTAL' as any,
      [dimensionLabel]: `KESELURUHAN (${aggregatedData.length} ${dimensionLabel})`,
      'Service Point Induk': '-',
      'Jumlah Mesin Aktif': totalMesin,
      'Mesin BCA': totalBca,
      'Mesin Non BCA': totalNonBca,
      'Rata-rata Uptime (%)': safeNum(avgUptime),
      'Total Downtime (%)': safeNum(avgDt),
      'Uang Habis (UH) (%)': '-' as any,
      'Komunikasi (KOM) (%)': '-' as any,
      'Uang Penuh (UP) (%)': '-' as any,
      'Hardware (H/W) (%)': '-' as any,
      'Lain-lain (LL) (%)': '-' as any,
      'Problem Dominan': '-'
    });
  }

  const ws1 = XLSX.utils.json_to_sheet(sheet1Rows.length > 0 ? sheet1Rows : [{
    'No': 1, [dimensionLabel]: 'Belum ada data', 'Service Point Induk': '-',
    'Jumlah Mesin Aktif': 0, 'Mesin BCA': 0, 'Mesin Non BCA': 0,
    'Rata-rata Uptime (%)': 100, 'Total Downtime (%)': 0,
    'Uang Habis (UH) (%)': 0, 'Komunikasi (KOM) (%)': 0, 'Uang Penuh (UP) (%)': 0,
    'Hardware (H/W) (%)': 0, 'Lain-lain (LL) (%)': 0, 'Problem Dominan': '-'
  }]);
  autoFitColumns(ws1);
  XLSX.utils.book_append_sheet(wb, ws1, 'Ringkasan Dashboard');

  // -------------------------------------------------------------
  // Sheet 2: Tren Waktu Bulanan
  // -------------------------------------------------------------
  const trendRows = aggregatedData.map((unit, idx) => {
    const rowObj: Record<string, any> = {
      'No': idx + 1,
      [dimensionLabel]: unit.name,
      'Service Point Induk': unit.servicePoint,
      'Jumlah Mesin': unit.machineCount
    };

    // Filter machines that belong to this unit (HANYA mesin BCA)
    const unitMachines = filteredMachines.filter(m => {
      if (m.klienStatus !== 'BCA') return false;
      if (groupBy === 'SERVICE_POINT') {
        const sp = getServicePointName(m.sektorBCA);
        return sp === unit.name;
      } else {
        return (m.sektorBCA || 'Unknown') === unit.name;
      }
    });

    let sumPeriods = 0;
    let countPeriods = 0;

    activePeriods.forEach(p => {
      let periodSum = 0;
      let periodMachineCount = 0;

      unitMachines.forEach(m => {
        const mMonth = (m.monthlyData || []).find(d => d.periode === p);
        if (mMonth) {
          periodMachineCount++;
          if (metric === 'uptime') {
            periodSum += (100 - (mMonth.total || 0));
          } else if (metric === 'total_downtime' || metric === 'all_problems') {
            periodSum += (mMonth.total || 0);
          } else if (metric in mMonth) {
            periodSum += ((mMonth as any)[metric] || 0);
          }
        }
      });

      const periodVal = periodMachineCount > 0 ? periodSum / periodMachineCount : 0;
      rowObj[p] = safeNum(periodVal);
      if (periodMachineCount > 0) {
        sumPeriods += periodVal;
        countPeriods++;
      }
    });

    rowObj['Rata-rata Periode (%)'] = safeNum(countPeriods > 0 ? sumPeriods / countPeriods : 0);
    return rowObj;
  });

  const ws2 = XLSX.utils.json_to_sheet(trendRows.length > 0 ? trendRows : [{
    'No': 1, [dimensionLabel]: 'Belum ada data', 'Service Point Induk': '-', 'Jumlah Mesin': 0, 'Rata-rata Periode (%)': 0
  }]);
  autoFitColumns(ws2);
  XLSX.utils.book_append_sheet(wb, ws2, 'Tren Waktu Bulanan');

  // -------------------------------------------------------------
  // Sheet 3: Distribusi Kategori Problem
  // -------------------------------------------------------------
  const sheet3Rows = aggregatedData.map((d, idx) => ({
    'No': idx + 1,
    [dimensionLabel]: d.name,
    'Service Point Induk': d.servicePoint,
    'Uang Habis (UH) (%)': safeNum(d.uh),
    'Komunikasi (KOM) (%)': safeNum(d.kom),
    'Uang Penuh (UP) (%)': safeNum(d.up),
    'Hardware (H/W) (%)': safeNum(d.hw),
    'Lain-lain (LL) (%)': safeNum(d.ll),
    'Total Downtime (%)': safeNum(d.downtimeTotal),
    'Problem Tertinggi': d.dominantProblem
  }));

  const ws3 = XLSX.utils.json_to_sheet(sheet3Rows.length > 0 ? sheet3Rows : [{
    'No': 1, [dimensionLabel]: 'Belum ada data', 'Service Point Induk': '-',
    'Uang Habis (UH) (%)': 0, 'Komunikasi (KOM) (%)': 0, 'Uang Penuh (UP) (%)': 0,
    'Hardware (H/W) (%)': 0, 'Lain-lain (LL) (%)': 0, 'Total Downtime (%)': 0, 'Problem Tertinggi': '-'
  }]);
  autoFitColumns(ws3);
  XLSX.utils.book_append_sheet(wb, ws3, 'Distribusi Problem Dashboard');

  const dateStr = new Date().toISOString().split('T')[0];
  const filename = filenamePrefix || `Dashboard_Analisis_${groupBy}_${dateStr}.xlsx`;
  downloadWorkbookAsExcel(wb, filename);
}

// =========================================================================
// 6. GLOBAL COMPREHENSIVE EXPORT (Mencakup SELURUH Sheet di atas)
// =========================================================================
export interface ExportParams {
  masterData?: MasterRow[];
  parsedUptimeFiles?: ParsedUptimeFile[];
  machines: MachineData[];
  selectedPeriode?: string;
}

export function exportComprehensiveExcel({
  masterData = [],
  parsedUptimeFiles = [],
  machines = [],
  selectedPeriode = 'ALL'
}: ExportParams) {
  if (machines.length === 0 && masterData.length === 0) {
    if (typeof window !== 'undefined') {
      alert('Data dashboard masih kosong atau belum selesai dimuat. Silakan tunggu proses loading atau upload file sumber data terlebih dahulu.');
    }
  }

  const wb = XLSX.utils.book_new();

  // Filter machines if specific period is selected
  const processedMachines = machines.map(m => {
    let months = m.monthlyData || [];
    if (selectedPeriode !== 'ALL') {
      months = months.filter(d => d.periode === selectedPeriode);
    }
    const count = months.length;
    if (count === 0) {
      return {
        ...m,
        avgTotal: 0,
        avgUh: 0,
        avgKom: 0,
        avgUp: 0,
        avgHw: 0,
        avgLl: 0,
        totalFrx: 0,
        totalDur: 0,
        hwDetail: {} as Record<string, number>
      };
    }
    const sum = months.reduce((acc, curr) => ({
      total: acc.total + (curr.total || 0),
      uh: acc.uh + (curr.uh || 0),
      kom: acc.kom + (curr.kom || 0),
      up: acc.up + (curr.up || 0),
      hw: acc.hw + (curr.hw || 0),
      ll: acc.ll + (curr.ll || 0),
      frx: acc.frx + (curr.frxTotal || 0),
      dur: acc.dur + (curr.durTotal || 0),
      hwDetail: {
        P01: (acc.hwDetail.P01 || 0) + (curr.hwDetail?.P01 || 0),
        P02: (acc.hwDetail.P02 || 0) + (curr.hwDetail?.P02 || 0),
        P03: (acc.hwDetail.P03 || 0) + (curr.hwDetail?.P03 || 0),
        P04: (acc.hwDetail.P04 || 0) + (curr.hwDetail?.P04 || 0),
        P05: (acc.hwDetail.P05 || 0) + (curr.hwDetail?.P05 || 0),
        P06: (acc.hwDetail.P06 || 0) + (curr.hwDetail?.P06 || 0),
        P07: (acc.hwDetail.P07 || 0) + (curr.hwDetail?.P07 || 0),
        P08: (acc.hwDetail.P08 || 0) + (curr.hwDetail?.P08 || 0),
        P09: (acc.hwDetail.P09 || 0) + (curr.hwDetail?.P09 || 0),
        P10: (acc.hwDetail.P10 || 0) + (curr.hwDetail?.P10 || 0),
      }
    }), {
      total: 0, uh: 0, kom: 0, up: 0, hw: 0, ll: 0, frx: 0, dur: 0, hwDetail: {} as any
    });

    return {
      ...m,
      avgTotal: sum.total / count,
      avgUh: sum.uh / count,
      avgKom: sum.kom / count,
      avgUp: sum.up / count,
      avgHw: sum.hw / count,
      avgLl: sum.ll / count,
      totalFrx: sum.frx,
      totalDur: sum.dur,
      hwDetail: {
        P01: (sum.hwDetail.P01 || 0) / count,
        P02: (sum.hwDetail.P02 || 0) / count,
        P03: (sum.hwDetail.P03 || 0) / count,
        P04: (sum.hwDetail.P04 || 0) / count,
        P05: (sum.hwDetail.P05 || 0) / count,
        P06: (sum.hwDetail.P06 || 0) / count,
        P07: (sum.hwDetail.P07 || 0) / count,
        P08: (sum.hwDetail.P08 || 0) / count,
        P09: (sum.hwDetail.P09 || 0) / count,
        P10: (sum.hwDetail.P10 || 0) / count,
      }
    };
  });

  const activeProcessed = processedMachines.filter(m => m.statusAktif?.trim().toUpperCase() === 'AKTIF');

  const isAtmMachine = (m: any) => (m.jenisMesin || '').trim().toUpperCase() === 'ATM';
  const isCrmMachine = (m: any) => {
    const j = (m.jenisMesin || '').trim().toUpperCase();
    return j === 'CRM' || j === 'ATS' || j === 'CDM' || j === 'DDM';
  };

  // =========================================================================
  // GLOBAL SHEET 1: Distribusi Service Point (Perhitungan Terpisah ATM & CRM)
  // =========================================================================
  const spMap = new Map<string, {
    spName: string;
    sektorSet: Set<string>;
    machines: typeof activeProcessed;
    bcaMachines: typeof activeProcessed;
  }>();

  activeProcessed.forEach(m => {
    const sp = getServicePointName(m.sektorBCA);
    if (!spMap.has(sp)) {
      spMap.set(sp, { spName: sp, sektorSet: new Set(), machines: [], bcaMachines: [] });
    }
    const item = spMap.get(sp)!;
    item.machines.push(m);
    if (m.sektorBCA) item.sektorSet.add(m.sektorBCA);
    if (m.klienStatus === 'BCA') item.bcaMachines.push(m);
  });

  const sortedSpList = Array.from(spMap.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  let gTotalSektor = 0;
  let gTotalMesin = 0;
  let gTotalBca = 0;
  let gTotalAtm = 0;
  let gTotalCrm = 0;
  let gWeightedUptimeAtmSum = 0;
  let gWeightedDowntimeAtmSum = 0;
  let gWeightedUptimeCrmSum = 0;
  let gWeightedDowntimeCrmSum = 0;

  const globalSpRows = sortedSpList.map(([spName, data], idx) => {
    const mCount = data.machines.length;
    const bcaList = data.bcaMachines;
    const atmList = bcaList.filter(isAtmMachine);
    const crmList = bcaList.filter(isCrmMachine);

    const atmMetrics = calculateMachineMetrics(atmList);
    const crmMetrics = calculateMachineMetrics(crmList);

    const atmSlaStatus = atmMetrics.count > 0 ? (atmMetrics.uptime >= 99.00 ? 'ACHIEVED' : 'NOT ACHIEVED') : '-';
    const crmSlaStatus = crmMetrics.count > 0 ? (crmMetrics.uptime >= 98.50 ? 'ACHIEVED' : 'NOT ACHIEVED') : '-';

    gTotalSektor += data.sektorSet.size;
    gTotalMesin += mCount;
    gTotalBca += bcaList.length;
    gTotalAtm += atmMetrics.count;
    gTotalCrm += crmMetrics.count;

    if (atmMetrics.count > 0) {
      gWeightedUptimeAtmSum += atmMetrics.uptime * atmMetrics.count;
      gWeightedDowntimeAtmSum += atmMetrics.downtime * atmMetrics.count;
    }
    if (crmMetrics.count > 0) {
      gWeightedUptimeCrmSum += crmMetrics.uptime * crmMetrics.count;
      gWeightedDowntimeCrmSum += crmMetrics.downtime * crmMetrics.count;
    }

    return {
      'No': idx + 1,
      'Service Point': spName,
      'Jumlah Sektor': data.sektorSet.size,
      'Total Mesin Aktif (BCA + Non BCA)': mCount,
      'Total Mesin BCA': bcaList.length,
      // --- PERFORMA MESIN ATM ---
      'Jumlah ATM (BCA)': atmMetrics.count,
      'Uptime ATM (%)': atmMetrics.count > 0 ? safeNum(atmMetrics.uptime) : ('-' as any),
      'Target SLA ATM (%)': 99.00,
      'Status SLA ATM': atmSlaStatus,
      'Gap SLA ATM (%)': atmMetrics.count > 0 ? safeNum(atmMetrics.uptime - 99.00) : ('-' as any),
      'Grafik Uptime ATM': atmMetrics.count > 0 ? generateUptimeBar(atmMetrics.uptime) : '-',
      'Downtime Total ATM (%)': atmMetrics.count > 0 ? safeNum(atmMetrics.downtime) : ('-' as any),
      'Problem Dominan ATM': atmMetrics.dominant,
      'Downtime UH ATM (%)': atmMetrics.count > 0 ? safeNum(atmMetrics.uh) : ('-' as any),
      'Downtime KOM ATM (%)': atmMetrics.count > 0 ? safeNum(atmMetrics.kom) : ('-' as any),
      'Downtime H/W ATM (%)': atmMetrics.count > 0 ? safeNum(atmMetrics.hw) : ('-' as any),
      'Downtime LL ATM (%)': atmMetrics.count > 0 ? safeNum(atmMetrics.ll) : ('-' as any),
      // --- PERFORMA MESIN CRM ---
      'Jumlah CRM (BCA)': crmMetrics.count,
      'Uptime CRM (%)': crmMetrics.count > 0 ? safeNum(crmMetrics.uptime) : ('-' as any),
      'Target SLA CRM (%)': 98.50,
      'Status SLA CRM': crmSlaStatus,
      'Gap SLA CRM (%)': crmMetrics.count > 0 ? safeNum(crmMetrics.uptime - 98.50) : ('-' as any),
      'Grafik Uptime CRM': crmMetrics.count > 0 ? generateUptimeBar(crmMetrics.uptime) : '-',
      'Downtime Total CRM (%)': crmMetrics.count > 0 ? safeNum(crmMetrics.downtime) : ('-' as any),
      'Problem Dominan CRM': crmMetrics.dominant,
      'Downtime UH CRM (%)': crmMetrics.count > 0 ? safeNum(crmMetrics.uh) : ('-' as any),
      'Downtime KOM CRM (%)': crmMetrics.count > 0 ? safeNum(crmMetrics.kom) : ('-' as any),
      'Downtime UP CRM (%)': crmMetrics.count > 0 ? safeNum(crmMetrics.up) : ('-' as any),
      'Downtime H/W CRM (%)': crmMetrics.count > 0 ? safeNum(crmMetrics.hw) : ('-' as any),
      'Downtime LL CRM (%)': crmMetrics.count > 0 ? safeNum(crmMetrics.ll) : ('-' as any)
    };
  });

  const gAvgUpAtm = gTotalAtm > 0 ? gWeightedUptimeAtmSum / gTotalAtm : 100;
  const gAvgDtAtm = gTotalAtm > 0 ? gWeightedDowntimeAtmSum / gTotalAtm : 0;
  const gAvgUpCrm = gTotalCrm > 0 ? gWeightedUptimeCrmSum / gTotalCrm : 100;
  const gAvgDtCrm = gTotalCrm > 0 ? gWeightedDowntimeCrmSum / gTotalCrm : 0;

  if (globalSpRows.length > 0) {
    globalSpRows.push({
      'No': 'TOTAL' as any,
      'Service Point': 'KESELURUHAN (SERVICE POINT)',
      'Jumlah Sektor': gTotalSektor,
      'Total Mesin Aktif (BCA + Non BCA)': gTotalMesin,
      'Total Mesin BCA': gTotalBca,
      'Jumlah ATM (BCA)': gTotalAtm,
      'Uptime ATM (%)': safeNum(gAvgUpAtm),
      'Target SLA ATM (%)': 99.00,
      'Status SLA ATM': gAvgUpAtm >= 99.00 ? 'ACHIEVED' : 'NOT ACHIEVED',
      'Gap SLA ATM (%)': safeNum(gAvgUpAtm - 99.00),
      'Grafik Uptime ATM': generateUptimeBar(gAvgUpAtm),
      'Downtime Total ATM (%)': safeNum(gAvgDtAtm),
      'Problem Dominan ATM': '-',
      'Downtime UH ATM (%)': '-' as any,
      'Downtime KOM ATM (%)': '-' as any,
      'Downtime H/W ATM (%)': '-' as any,
      'Downtime LL ATM (%)': '-' as any,
      'Jumlah CRM (BCA)': gTotalCrm,
      'Uptime CRM (%)': safeNum(gAvgUpCrm),
      'Target SLA CRM (%)': 98.50,
      'Status SLA CRM': gAvgUpCrm >= 98.50 ? 'ACHIEVED' : 'NOT ACHIEVED',
      'Gap SLA CRM (%)': safeNum(gAvgUpCrm - 98.50),
      'Grafik Uptime CRM': generateUptimeBar(gAvgUpCrm),
      'Downtime Total CRM (%)': safeNum(gAvgDtCrm),
      'Problem Dominan CRM': '-',
      'Downtime UH CRM (%)': '-' as any,
      'Downtime KOM CRM (%)': '-' as any,
      'Downtime UP CRM (%)': '-' as any,
      'Downtime H/W CRM (%)': '-' as any,
      'Downtime LL CRM (%)': '-' as any
    });
  }

  const wsSp = XLSX.utils.json_to_sheet(globalSpRows);
  autoFitColumns(wsSp);
  XLSX.utils.book_append_sheet(wb, wsSp, 'Distribusi Service Point');

  // =========================================================================
  // GLOBAL SHEET 2: Daftar Sektor dalam SP (Performa Terpisah ATM & CRM)
  // =========================================================================
  const sektorGroupMap = new Map<string, typeof activeProcessed>();
  activeProcessed.forEach(m => {
    const s = m.sektorBCA || 'Unknown';
    if (!sektorGroupMap.has(s)) sektorGroupMap.set(s, []);
    sektorGroupMap.get(s)!.push(m);
  });

  const sortedSektorList = Array.from(sektorGroupMap.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  const globalSektorInSpRows = sortedSektorList.map(([sektorName, sMachines], idx) => {
    const spName = getServicePointName(sektorName);
    const bcaMachines = sMachines.filter(m => m.klienStatus === 'BCA');
    const atmList = bcaMachines.filter(isAtmMachine);
    const crmList = bcaMachines.filter(isCrmMachine);

    const atmMetrics = calculateMachineMetrics(atmList);
    const crmMetrics = calculateMachineMetrics(crmList);

    const atmSlaStatus = atmMetrics.count > 0 ? (atmMetrics.uptime >= 99.00 ? 'ACHIEVED' : 'NOT ACHIEVED') : '-';
    const crmSlaStatus = crmMetrics.count > 0 ? (crmMetrics.uptime >= 98.50 ? 'ACHIEVED' : 'NOT ACHIEVED') : '-';

    return {
      'No': idx + 1,
      'Service Point': spName,
      'Nama Sektor': sektorName,
      'Total Mesin BCA': bcaMachines.length,
      // PERFORMA ATM
      'Jumlah ATM (BCA)': atmMetrics.count,
      'Uptime ATM (%)': atmMetrics.count > 0 ? safeNum(atmMetrics.uptime) : ('-' as any),
      'Target SLA ATM (%)': 99.00,
      'Status SLA ATM': atmSlaStatus,
      'Downtime Total ATM (%)': atmMetrics.count > 0 ? safeNum(atmMetrics.downtime) : ('-' as any),
      'Problem Dominan ATM': atmMetrics.dominant,
      // PERFORMA CRM
      'Jumlah CRM (BCA)': crmMetrics.count,
      'Uptime CRM (%)': crmMetrics.count > 0 ? safeNum(crmMetrics.uptime) : ('-' as any),
      'Target SLA CRM (%)': 98.50,
      'Status SLA CRM': crmSlaStatus,
      'Downtime Total CRM (%)': crmMetrics.count > 0 ? safeNum(crmMetrics.downtime) : ('-' as any),
      'Problem Dominan CRM': crmMetrics.dominant
    };
  });

  const wsSektorInSp = XLSX.utils.json_to_sheet(globalSektorInSpRows);
  autoFitColumns(wsSektorInSp);
  XLSX.utils.book_append_sheet(wb, wsSektorInSp, 'Daftar Sektor dalam SP');

  // =========================================================================
  // GLOBAL SHEET 3: Performance ATM per Sektor (DEDICATED ATM)
  // =========================================================================
  const atmPerSektorRows = sortedSektorList.map(([sektorName, sMachines], idx) => {
    const spName = getServicePointName(sektorName);
    const atmList = sMachines.filter(m => m.klienStatus === 'BCA' && isAtmMachine(m));
    const m = calculateMachineMetrics(atmList);
    const gap = m.count > 0 ? m.uptime - 99.00 : 0;
    const slaStatus = m.count === 0 ? 'TIDAK ADA MESIN' : (m.uptime >= 99.00 ? 'ACHIEVED' : 'NOT ACHIEVED');

    return {
      'No': idx + 1,
      'Service Point': spName,
      'Nama Sektor': sektorName,
      'Jumlah Mesin ATM': m.count,
      'Uptime ATM (%)': m.count > 0 ? safeNum(m.uptime) : ('-' as any),
      'Target SLA ATM (%)': 99.00,
      'Status SLA': slaStatus,
      'Gap SLA (%)': m.count > 0 ? safeNum(gap) : ('-' as any),
      'Grafik Pencapaian': m.count > 0 ? generateUptimeBar(m.uptime) : '-',
      'Total Downtime ATM (%)': m.count > 0 ? safeNum(m.downtime) : ('-' as any),
      'Problem Dominan': m.dominant,
      'Downtime UH (%)': m.count > 0 ? safeNum(m.uh) : ('-' as any),
      'Downtime KOM (%)': m.count > 0 ? safeNum(m.kom) : ('-' as any),
      'Downtime H/W (%)': m.count > 0 ? safeNum(m.hw) : ('-' as any),
      'Downtime LL (%)': m.count > 0 ? safeNum(m.ll) : ('-' as any)
    };
  });

  const wsAtmPerSektor = XLSX.utils.json_to_sheet(atmPerSektorRows);
  autoFitColumns(wsAtmPerSektor);
  XLSX.utils.book_append_sheet(wb, wsAtmPerSektor, 'Performance ATM per Sektor');

  // =========================================================================
  // GLOBAL SHEET 4: Performance CRM per Sektor (DEDICATED CRM)
  // =========================================================================
  const crmPerSektorRows = sortedSektorList.map(([sektorName, sMachines], idx) => {
    const spName = getServicePointName(sektorName);
    const crmList = sMachines.filter(m => m.klienStatus === 'BCA' && isCrmMachine(m));
    const m = calculateMachineMetrics(crmList);
    const gap = m.count > 0 ? m.uptime - 98.50 : 0;
    const slaStatus = m.count === 0 ? 'TIDAK ADA MESIN' : (m.uptime >= 98.50 ? 'ACHIEVED' : 'NOT ACHIEVED');

    return {
      'No': idx + 1,
      'Service Point': spName,
      'Nama Sektor': sektorName,
      'Jumlah Mesin CRM': m.count,
      'Uptime CRM (%)': m.count > 0 ? safeNum(m.uptime) : ('-' as any),
      'Target SLA CRM (%)': 98.50,
      'Status SLA': slaStatus,
      'Gap SLA (%)': m.count > 0 ? safeNum(gap) : ('-' as any),
      'Grafik Pencapaian': m.count > 0 ? generateUptimeBar(m.uptime) : '-',
      'Total Downtime CRM (%)': m.count > 0 ? safeNum(m.downtime) : ('-' as any),
      'Problem Dominan': m.dominant,
      'Downtime UH (%)': m.count > 0 ? safeNum(m.uh) : ('-' as any),
      'Downtime KOM (%)': m.count > 0 ? safeNum(m.kom) : ('-' as any),
      'Downtime UP (%)': m.count > 0 ? safeNum(m.up) : ('-' as any),
      'Downtime H/W (%)': m.count > 0 ? safeNum(m.hw) : ('-' as any),
      'Downtime LL (%)': m.count > 0 ? safeNum(m.ll) : ('-' as any)
    };
  });

  const wsCrmPerSektor = XLSX.utils.json_to_sheet(crmPerSektorRows);
  autoFitColumns(wsCrmPerSektor);
  XLSX.utils.book_append_sheet(wb, wsCrmPerSektor, 'Performance CRM per Sektor');

  // =========================================================================
  // GLOBAL SHEET 5: Distribusi Mesin per Sektor (Perbandingan ATM & CRM)
  // =========================================================================
  const sheet3Data = sortedSektorList.map(([sektor, sMachines], idx) => {
    const sp = getServicePointName(sektor);
    const bcaMachines = sMachines.filter(m => m.klienStatus === 'BCA');
    const atmList = bcaMachines.filter(isAtmMachine);
    const crmList = bcaMachines.filter(isCrmMachine);
    const nonBcaMachines = sMachines.filter(m => m.klienStatus === 'Non BCA');

    const atmMetrics = calculateMachineMetrics(atmList);
    const crmMetrics = calculateMachineMetrics(crmList);

    return {
      'No': idx + 1,
      'Sektor': sektor,
      'Service Point': sp,
      'Jumlah ATM BCA': atmList.length,
      'Uptime ATM (%)': atmList.length > 0 ? safeNum(atmMetrics.uptime) : ('-' as any),
      'Status SLA ATM': atmList.length > 0 ? (atmMetrics.uptime >= 99.00 ? 'ACHIEVED' : 'NOT ACHIEVED') : '-',
      'Jumlah CRM BCA': crmList.length,
      'Uptime CRM (%)': crmList.length > 0 ? safeNum(crmMetrics.uptime) : ('-' as any),
      'Status SLA CRM': crmList.length > 0 ? (crmMetrics.uptime >= 98.50 ? 'ACHIEVED' : 'NOT ACHIEVED') : '-',
      'Total Mesin BCA': bcaMachines.length,
      'Jumlah Mesin Non BCA': nonBcaMachines.length,
      'Total Seluruh Mesin': sMachines.length,
      'Problem Dominan ATM': atmMetrics.dominant,
      'Problem Dominan CRM': crmMetrics.dominant
    };
  });

  const wsMesinSektor = XLSX.utils.json_to_sheet(sheet3Data);
  autoFitColumns(wsMesinSektor);
  XLSX.utils.book_append_sheet(wb, wsMesinSektor, 'Distribusi Mesin per Sektor');

  // =========================================================================
  // GLOBAL SHEET 6: Daftar Mesin BCA per Sektor
  // =========================================================================
  const bcaMachines = activeProcessed
    .filter(m => m.klienStatus === 'BCA')
    .sort((a, b) => (a.sektorBCA || '').localeCompare(b.sektorBCA || '') || a.wsid.localeCompare(b.wsid));

  const sheet4Data = bcaMachines.map((m, idx) => {
    const targetSla = isCrmMachine(m) ? 98.50 : 99.00;
    const uptime = 100 - m.avgTotal;
    const slaStatus = uptime >= targetSla ? 'ACHIEVED' : 'NOT ACHIEVED';

    return {
      'No': idx + 1,
      'Sektor': m.sektorBCA || 'Unknown',
      'Service Point': getServicePointName(m.sektorBCA),
      'WSID': m.wsid,
      'Nama Lokasi': m.lokasi,
      'Vendor': m.vendor || '-',
      'Jenis Mesin': m.jenisMesin,
      'Tipe Mesin': m.tipeMesin,
      'Status': m.statusAktif,
      'Klien': 'BCA',
      'Target SLA (%)': targetSla,
      'Uptime (%)': safeNum(uptime),
      'Status SLA': slaStatus,
      'Grafik Uptime': generateUptimeBar(uptime),
      'Total Downtime (%)': safeNum(m.avgTotal),
      'Problem Dominan': getDominantCategory(m.avgUh, m.avgKom, m.avgUp, m.avgHw, m.avgLl),
      'Downtime UH (%)': safeNum(m.avgUh),
      'Downtime KOM (%)': safeNum(m.avgKom),
      'Downtime UP (%)': safeNum(m.avgUp),
      'Downtime H/W (%)': safeNum(m.avgHw),
      'Downtime LL (%)': safeNum(m.avgLl),
      'Total Frekuensi Problem': m.totalFrx,
      'Total Durasi Problem (Menit)': m.totalDur
    };
  });

  const wsBcaPerSektor = XLSX.utils.json_to_sheet(sheet4Data.length > 0 ? sheet4Data : [{
    'No': 1, 'Sektor': '-', 'Service Point': '-', 'WSID': '-', 'Nama Lokasi': 'Belum ada data BCA',
    'Vendor': '-', 'Jenis Mesin': '-', 'Tipe Mesin': '-', 'Status': '-', 'Klien': 'BCA',
    'Target SLA (%)': 99.00, 'Uptime (%)': 100, 'Status SLA': 'ACHIEVED', 'Grafik Uptime': '-',
    'Total Downtime (%)': 0, 'Problem Dominan': '-',
    'Downtime UH (%)': 0, 'Downtime KOM (%)': 0, 'Downtime UP (%)': 0, 'Downtime H/W (%)': 0, 'Downtime LL (%)': 0,
    'Total Frekuensi Problem': 0, 'Total Durasi Problem (Menit)': 0
  }]);
  autoFitColumns(wsBcaPerSektor);
  XLSX.utils.book_append_sheet(wb, wsBcaPerSektor, 'Daftar Mesin BCA per Sektor');

  // =========================================================================
  // GLOBAL SHEET 7: Seluruh WSID Aktif (BCA)
  // =========================================================================
  const sheet5Data = bcaMachines.map((m, idx) => {
    const targetSla = isCrmMachine(m) ? 98.50 : 99.00;
    const uptime = 100 - m.avgTotal;
    const slaStatus = uptime >= targetSla ? 'ACHIEVED' : 'NOT ACHIEVED';

    return {
      'No': idx + 1,
      'WSID': m.wsid,
      'Nama Lokasi': m.lokasi,
      'Vendor': m.vendor || '-',
      'Sektor': m.sektorBCA || '-',
      'Service Point': getServicePointName(m.sektorBCA),
      'Jenis Mesin': m.jenisMesin,
      'Tipe Mesin': m.tipeMesin,
      'Status': m.statusAktif,
      'Target SLA (%)': targetSla,
      'Uptime (%)': safeNum(uptime),
      'Status SLA': slaStatus,
      'Grafik Uptime': generateUptimeBar(uptime),
      'Total Downtime (%)': safeNum(m.avgTotal),
      'Problem Dominan': getDominantCategory(m.avgUh, m.avgKom, m.avgUp, m.avgHw, m.avgLl),
      'Downtime UH (%)': safeNum(m.avgUh),
      'Downtime KOM (%)': safeNum(m.avgKom),
      'Downtime UP (%)': safeNum(m.avgUp),
      'Downtime H/W (%)': safeNum(m.avgHw),
      'Downtime LL (%)': safeNum(m.avgLl),
      'Total Frekuensi Problem': m.totalFrx,
      'Total Durasi Problem (Menit)': m.totalDur
    };
  });

  const wsAllWsid = XLSX.utils.json_to_sheet(sheet5Data);
  autoFitColumns(wsAllWsid);
  XLSX.utils.book_append_sheet(wb, wsAllWsid, 'Seluruh WSID Aktif (BCA)');

  // =========================================================================
  // GLOBAL SHEET 8 & 9: Grafik Tren Bulanan & Tren Bulanan (Abacus Jakarta)
  // =========================================================================
  let monthlyStats: any[] = [];
  if (parsedUptimeFiles.length > 0) {
    monthlyStats = parsedUptimeFiles.map((file) => {
      const jktAtm = file.atmData.filter(r => String(r.DESCKCU || r.KWW || '').trim().toUpperCase() === 'ABACUS JAKARTA');
      const jktAts = file.atsData.filter(r => String(r.DESCKCU || r.KWW || '').trim().toUpperCase() === 'ABACUS JAKARTA');

      const atmCount = jktAtm.length;
      const atsCount = jktAts.length;
      const totalMesin = atmCount + atsCount;

      const bcaAtm = jktAtm.filter(r => String(r.Klien || '').trim().toUpperCase() === 'BCA');
      const bcaCrm = jktAts.filter(r => String(r.Klien || '').trim().toUpperCase() === 'BCA');
      const bcaCount = bcaAtm.length + bcaCrm.length;
      const nonBcaCount = totalMesin - bcaCount;

      const avgDtAtm = atmCount > 0 ? (jktAtm.reduce((a, b) => a + (Number(b.Total_pct) || 0), 0) / atmCount) : 0;
      const avgDtAts = atsCount > 0 ? (jktAts.reduce((a, b) => a + (Number(b.Total_pct) || 0), 0) / atsCount) : 0;
      
      const upAtm = file.rekapUptimeATM > 0 ? file.rekapUptimeATM : (atmCount > 0 ? 100 - avgDtAtm : 0);
      const upCrm = file.rekapUptimeCRM > 0 ? file.rekapUptimeCRM : (atsCount > 0 ? 100 - avgDtAts : 0);

      const atmFrx = jktAtm.reduce((a, b) => a + (Number(b.Total_frx) || 0), 0);
      const atmDur = jktAtm.reduce((a, b) => a + (Number(b.Total_dur) || 0), 0);
      const crmFrx = jktAts.reduce((a, b) => a + (Number(b.Total_frx) || 0), 0);
      const crmDur = jktAts.reduce((a, b) => a + (Number(b.Total_dur) || 0), 0);

      const statusAtm = atmCount > 0 ? (upAtm >= 99.00 ? 'ACHIEVED' : 'NOT ACHIEVED') : '-';
      const statusCrm = atsCount > 0 ? (upCrm >= 98.50 ? 'ACHIEVED' : 'NOT ACHIEVED') : '-';
      const gapAtm = atmCount > 0 ? upAtm - 99.00 : 0;
      const gapCrm = atsCount > 0 ? upCrm - 98.50 : 0;

      return {
        'No': 1,
        'Periode Bulan': file.periode,
        // --- SEKSI MESIN ATM ---
        'Mesin ATM (Jakarta)': atmCount,
        'Uptime Rekap ATM (%)': safeNum(upAtm),
        'Target SLA ATM (%)': 99.00,
        'Status SLA ATM': statusAtm,
        'Gap SLA ATM (%)': atmCount > 0 ? safeNum(gapAtm) : ('-' as any),
        'Grafik Uptime ATM': atmCount > 0 ? generateUptimeBar(upAtm) : '-',
        'Rata-rata Downtime ATM (%)': safeNum(avgDtAtm),
        'Frekuensi Problem ATM': atmFrx,
        'Durasi Problem ATM (Menit)': atmDur,
        // --- SEKSI MESIN CRM ---
        'Mesin CRM (Jakarta)': atsCount,
        'Uptime Rekap CRM (%)': safeNum(upCrm),
        'Target SLA CRM (%)': 98.50,
        'Status SLA CRM': statusCrm,
        'Gap SLA CRM (%)': atsCount > 0 ? safeNum(gapCrm) : ('-' as any),
        'Grafik Uptime CRM': atsCount > 0 ? generateUptimeBar(upCrm) : '-',
        'Rata-rata Downtime CRM (%)': safeNum(avgDtAts),
        'Frekuensi Problem CRM': crmFrx,
        'Durasi Problem CRM (Menit)': crmDur,
        // --- GABUNGAN & POPULASI ---
        'Total Seluruh Mesin': totalMesin,
        'Mesin BCA': bcaCount,
        'Mesin Non BCA': nonBcaCount,
        'Total Frekuensi Problem': atmFrx + crmFrx,
        'Total Durasi Problem (Menit)': atmDur + crmDur
      };
    });
  } else {
    const periodSet = new Set<string>();
    processedMachines.forEach(m => m.monthlyData?.forEach(d => { if (d.periode) periodSet.add(d.periode); }));
    const distinctPeriods = Array.from(periodSet).sort();

    monthlyStats = distinctPeriods.map(periode => {
      let atmCount = 0;
      let crmCount = 0;
      let bcaCount = 0;
      let nonBcaCount = 0;
      let sumDtAtm = 0;
      let sumDtCrm = 0;
      let atmFrx = 0;
      let atmDur = 0;
      let crmFrx = 0;
      let crmDur = 0;

      processedMachines.forEach(m => {
        const item = m.monthlyData?.find(d => d.periode === periode);
        if (item) {
          if (isAtmMachine(m)) {
            atmCount++;
            sumDtAtm += item.total || 0;
            atmFrx += item.frxTotal || 0;
            atmDur += item.durTotal || 0;
          } else {
            crmCount++;
            sumDtCrm += item.total || 0;
            crmFrx += item.frxTotal || 0;
            crmDur += item.durTotal || 0;
          }
          if (m.klienStatus === 'BCA') bcaCount++;
          else nonBcaCount++;
        }
      });

      const totalMesin = atmCount + crmCount;
      const avgDtAtm = atmCount > 0 ? sumDtAtm / atmCount : 0;
      const avgDtCrm = crmCount > 0 ? sumDtCrm / crmCount : 0;
      const upAtm = atmCount > 0 ? 100 - avgDtAtm : 100;
      const upCrm = crmCount > 0 ? 100 - avgDtCrm : 100;
      const statusAtm = atmCount > 0 ? (upAtm >= 99.00 ? 'ACHIEVED' : 'NOT ACHIEVED') : '-';
      const statusCrm = crmCount > 0 ? (upCrm >= 98.50 ? 'ACHIEVED' : 'NOT ACHIEVED') : '-';
      const gapAtm = atmCount > 0 ? upAtm - 99.00 : 0;
      const gapCrm = crmCount > 0 ? upCrm - 98.50 : 0;

      return {
        'No': 1,
        'Periode Bulan': periode,
        // --- SEKSI MESIN ATM ---
        'Mesin ATM (Jakarta)': atmCount,
        'Uptime Rekap ATM (%)': safeNum(upAtm),
        'Target SLA ATM (%)': 99.00,
        'Status SLA ATM': statusAtm,
        'Gap SLA ATM (%)': atmCount > 0 ? safeNum(gapAtm) : ('-' as any),
        'Grafik Uptime ATM': atmCount > 0 ? generateUptimeBar(upAtm) : '-',
        'Rata-rata Downtime ATM (%)': safeNum(avgDtAtm),
        'Frekuensi Problem ATM': atmFrx,
        'Durasi Problem ATM (Menit)': atmDur,
        // --- SEKSI MESIN CRM ---
        'Mesin CRM (Jakarta)': crmCount,
        'Uptime Rekap CRM (%)': safeNum(upCrm),
        'Target SLA CRM (%)': 98.50,
        'Status SLA CRM': statusCrm,
        'Gap SLA CRM (%)': crmCount > 0 ? safeNum(gapCrm) : ('-' as any),
        'Grafik Uptime CRM': crmCount > 0 ? generateUptimeBar(upCrm) : '-',
        'Rata-rata Downtime CRM (%)': safeNum(avgDtCrm),
        'Frekuensi Problem CRM': crmFrx,
        'Durasi Problem CRM (Menit)': crmDur,
        // --- GABUNGAN & POPULASI ---
        'Total Seluruh Mesin': totalMesin,
        'Mesin BCA': bcaCount,
        'Mesin Non BCA': nonBcaCount,
        'Total Frekuensi Problem': atmFrx + crmFrx,
        'Total Durasi Problem (Menit)': atmDur + crmDur
      };
    });
  }

  const sheet6Data = ensureRows(monthlyStats, {
    'No': 1, 'Periode Bulan': 'Belum ada data bulanan', 
    'Mesin ATM (Jakarta)': 0, 'Uptime Rekap ATM (%)': 0, 'Target SLA ATM (%)': 99.00, 'Status SLA ATM': '-', 'Gap SLA ATM (%)': 0, 'Grafik Uptime ATM': '-', 'Rata-rata Downtime ATM (%)': 0, 'Frekuensi Problem ATM': 0, 'Durasi Problem ATM (Menit)': 0,
    'Mesin CRM (Jakarta)': 0, 'Uptime Rekap CRM (%)': 0, 'Target SLA CRM (%)': 98.50, 'Status SLA CRM': '-', 'Gap SLA CRM (%)': 0, 'Grafik Uptime CRM': '-', 'Rata-rata Downtime CRM (%)': 0, 'Frekuensi Problem CRM': 0, 'Durasi Problem CRM (Menit)': 0,
    'Total Seluruh Mesin': 0, 'Mesin BCA': 0, 'Mesin Non BCA': 0, 'Total Frekuensi Problem': 0, 'Total Durasi Problem (Menit)': 0
  });
  sheet6Data.sort((a, b) => String(a['Periode Bulan']).localeCompare(String(b['Periode Bulan'])));
  sheet6Data.forEach((row, i) => { 
    row['No'] = i + 1;
    row['Periode Bulan'] = formatBulanTahun(row['Periode Bulan']);
  });

  // VISUAL SHEET: Grafik Tren Bulanan
  const visualChartAoa: any[][] = [];
  visualChartAoa.push(['========================================================================================']);
  visualChartAoa.push(['  DASHBOARD VISUALISASI GRAFIK TREN BULANAN - PERFORMA UPTIME MESIN ATM VS CRM']);
  visualChartAoa.push(['  ABACUS JAKARTA - STANDAR TARGET SLA BCA: ATM = 99.00% | CRM = 98.50%']);
  visualChartAoa.push(['========================================================================================']);
  visualChartAoa.push([]);

  // Section 1: Ringkasan Pencapaian SLA Bulanan
  visualChartAoa.push(['--- 1. RINGKASAN PENCAPAIAN SLA BULAN KE BULAN (ATM VS CRM) ---']);
  visualChartAoa.push([
    'Periode',
    'Populasi ATM',
    'Uptime ATM (%)',
    'Target SLA ATM',
    'Status SLA ATM',
    'Deviasi SLA ATM',
    'Populasi CRM',
    'Uptime CRM (%)',
    'Target SLA CRM',
    'Status SLA CRM',
    'Deviasi SLA CRM',
    'Total Populasi'
  ]);
  sheet6Data.forEach(r => {
    visualChartAoa.push([
      r['Periode Bulan'],
      r['Mesin ATM (Jakarta)'],
      r['Uptime Rekap ATM (%)'],
      '99.00%',
      r['Status SLA ATM'],
      typeof r['Gap SLA ATM (%)'] === 'number' ? `${r['Gap SLA ATM (%)'] >= 0 ? '+' : ''}${r['Gap SLA ATM (%)']}%` : '-',
      r['Mesin CRM (Jakarta)'],
      r['Uptime Rekap CRM (%)'],
      '98.50%',
      r['Status SLA CRM'],
      typeof r['Gap SLA CRM (%)'] === 'number' ? `${r['Gap SLA CRM (%)'] >= 0 ? '+' : ''}${r['Gap SLA CRM (%)']}%` : '-',
      r['Total Seluruh Mesin']
    ]);
  });
  visualChartAoa.push([]);

  // Section 2: Visual Chart ATM
  visualChartAoa.push(['--- 2. GRAFIK TREN VISUAL UPTIME MESIN ATM BULAN KE BULAN ---']);
  visualChartAoa.push(['Target SLA ATM: 99.00% (Standar BCA)']);
  visualChartAoa.push(['Periode Bulan', 'Visualisasi Bar Uptime (Skala 90% - 100%)', 'Uptime (%)', 'Target SLA', 'Status SLA', 'Deviasi / Gap']);
  sheet6Data.forEach(r => {
    visualChartAoa.push([
      r['Periode Bulan'],
      r['Grafik Uptime ATM'],
      `${r['Uptime Rekap ATM (%)']}%`,
      '99.00%',
      r['Status SLA ATM'],
      typeof r['Gap SLA ATM (%)'] === 'number' ? `${r['Gap SLA ATM (%)'] >= 0 ? '+' : ''}${r['Gap SLA ATM (%)']}%` : '-'
    ]);
  });
  visualChartAoa.push([]);

  // Section 3: Visual Chart CRM
  visualChartAoa.push(['--- 3. GRAFIK TREN VISUAL UPTIME MESIN CRM BULAN KE BULAN ---']);
  visualChartAoa.push(['Target SLA CRM: 98.50% (Standar BCA)']);
  visualChartAoa.push(['Periode Bulan', 'Visualisasi Bar Uptime (Skala 90% - 100%)', 'Uptime (%)', 'Target SLA', 'Status SLA', 'Deviasi / Gap']);
  sheet6Data.forEach(r => {
    visualChartAoa.push([
      r['Periode Bulan'],
      r['Grafik Uptime CRM'],
      `${r['Uptime Rekap CRM (%)']}%`,
      '98.50%',
      r['Status SLA CRM'],
      typeof r['Gap SLA CRM (%)'] === 'number' ? `${r['Gap SLA CRM (%)'] >= 0 ? '+' : ''}${r['Gap SLA CRM (%)']}%` : '-'
    ]);
  });
  visualChartAoa.push([]);

  // Section 4: Populasi Mesin
  visualChartAoa.push(['--- 4. GRAFIK PERBANDINGAN POPULASI MESIN AKTIF (ATM VS CRM) ---']);
  visualChartAoa.push(['Periode Bulan', 'Populasi ATM', 'Bar Populasi ATM', 'Populasi CRM', 'Bar Populasi CRM', 'Total Mesin']);
  const maxAtm = Math.max(...sheet6Data.map(r => Number(r['Mesin ATM (Jakarta)']) || 0), 1);
  const maxCrm = Math.max(...sheet6Data.map(r => Number(r['Mesin CRM (Jakarta)']) || 0), 1);
  sheet6Data.forEach(r => {
    const cAtm = Number(r['Mesin ATM (Jakarta)']) || 0;
    const cCrm = Number(r['Mesin CRM (Jakarta)']) || 0;
    const barAtm = `[${'■'.repeat(Math.min(20, Math.round((cAtm / maxAtm) * 20)))}] ${cAtm}`;
    const barCrm = `[${'■'.repeat(Math.min(20, Math.round((cCrm / maxCrm) * 20)))}] ${cCrm}`;
    visualChartAoa.push([
      r['Periode Bulan'],
      cAtm,
      barAtm,
      cCrm,
      barCrm,
      r['Total Seluruh Mesin']
    ]);
  });
  visualChartAoa.push([]);

  // Section 5: Evaluasi & Catatan
  visualChartAoa.push(['--- 5. CATATAN & INTERPRETASI STANDAR SLA BCA ---']);
  visualChartAoa.push(['- Mesin ATM memiliki target SLA performa minimal 99.00% per bulan.']);
  visualChartAoa.push(['- Mesin CRM / ATS memiliki target SLA performa minimal 98.50% per bulan.']);
  visualChartAoa.push(['- Mesin dengan performa di bawah target diklasifikasikan sebagai NOT ACHIEVED dan memerlukan tindakan preventif/korektif.']);

  const wsVisual = XLSX.utils.aoa_to_sheet(visualChartAoa);
  autoFitColumns(wsVisual);
  XLSX.utils.book_append_sheet(wb, wsVisual, 'Grafik Tren Bulanan');

  const wsMonthly = XLSX.utils.json_to_sheet(sheet6Data);
  autoFitColumns(wsMonthly);
  XLSX.utils.book_append_sheet(wb, wsMonthly, 'Tren Bulanan');

  // =========================================================================
  // GLOBAL SHEET 10: Top 50 WSID Bermasalah
  // =========================================================================
  const top50Raw = [...activeProcessed]
    .sort((a, b) => b.avgTotal - a.avgTotal)
    .slice(0, 50)
    .map((m, idx) => {
      const targetSla = isCrmMachine(m) ? 98.50 : 99.00;
      const uptime = 100 - m.avgTotal;
      const slaStatus = uptime >= targetSla ? 'ACHIEVED' : 'NOT ACHIEVED';

      return {
        'Peringkat': idx + 1,
        'WSID': m.wsid,
        'Nama Lokasi': m.lokasi,
        'Vendor': m.vendor || '-',
        'Sektor': m.sektorBCA || 'Unknown',
        'Service Point': getServicePointName(m.sektorBCA),
        'Klien': m.klienStatus,
        'Jenis Mesin': m.jenisMesin,
        'Tipe Mesin': m.tipeMesin,
        'Target SLA (%)': targetSla,
        'Uptime (%)': safeNum(uptime),
        'Status SLA': slaStatus,
        'Grafik Uptime': generateUptimeBar(uptime),
        'Total Downtime (%)': safeNum(m.avgTotal),
        'Kategori Dominan': getDominantCategory(m.avgUh, m.avgKom, m.avgUp, m.avgHw, m.avgLl),
        'Frekuensi Problem': m.totalFrx,
        'Durasi Downtime (Menit)': m.totalDur,
        'P01 - Pick Modul (%)': safeNum(m.hwDetail?.P01),
        'P02 - Presenter (%)': safeNum(m.hwDetail?.P02),
        'P03 - Reject (%)': safeNum(m.hwDetail?.P03),
        'P04 - Card Reader (%)': safeNum(m.hwDetail?.P04),
        'P05 - Komunikasi (%)': safeNum(m.hwDetail?.P05),
        'P06 - DIU (%)': safeNum(m.hwDetail?.P06),
        'P07 - Uang Habis (%)': safeNum(m.hwDetail?.P07),
        'P08 - Replenishment (%)': safeNum(m.hwDetail?.P08),
        'P09 - LLH (%)': safeNum(m.hwDetail?.P09),
        'P10 - Uang Penuh (%)': safeNum(m.hwDetail?.P10)
      };
    });

  const sheet7Data = ensureRows(top50Raw, {
    'Peringkat': 1, 'WSID': '-', 'Nama Lokasi': 'Belum ada data', 'Vendor': '-', 'Sektor': '-', 'Service Point': '-',
    'Klien': '-', 'Jenis Mesin': '-', 'Tipe Mesin': '-', 'Target SLA (%)': 99.00, 'Uptime (%)': 100,
    'Status SLA': 'ACHIEVED', 'Grafik Uptime': '-', 'Total Downtime (%)': 0,
    'Kategori Dominan': '-', 'Frekuensi Problem': 0, 'Durasi Downtime (Menit)': 0,
    'P01 - Pick Modul (%)': 0, 'P02 - Presenter (%)': 0, 'P03 - Reject (%)': 0,
    'P04 - Card Reader (%)': 0, 'P05 - Komunikasi (%)': 0, 'P06 - DIU (%)': 0,
    'P07 - Uang Habis (%)': 0, 'P08 - Replenishment (%)': 0, 'P09 - LLH (%)': 0, 'P10 - Uang Penuh (%)': 0
  });

  const wsTop50 = XLSX.utils.json_to_sheet(sheet7Data);
  autoFitColumns(wsTop50);
  XLSX.utils.book_append_sheet(wb, wsTop50, 'Top 50 Bermasalah');

  // =========================================================================
  // GLOBAL SHEET 8: Hardware Problem per Sektor
  // =========================================================================
  const hwSektorRaw = sortedSektorList.map(([sektor, sMachines], idx) => {
    const count = sMachines.length || 1;
    const p01 = sMachines.reduce((a, m) => a + (m.hwDetail?.P01 || 0), 0) / count;
    const p02 = sMachines.reduce((a, m) => a + (m.hwDetail?.P02 || 0), 0) / count;
    const p03 = sMachines.reduce((a, m) => a + (m.hwDetail?.P03 || 0), 0) / count;
    const p04 = sMachines.reduce((a, m) => a + (m.hwDetail?.P04 || 0), 0) / count;
    const p05 = sMachines.reduce((a, m) => a + (m.hwDetail?.P05 || 0), 0) / count;
    const p06 = sMachines.reduce((a, m) => a + (m.hwDetail?.P06 || 0), 0) / count;
    const p07 = sMachines.reduce((a, m) => a + (m.hwDetail?.P07 || 0), 0) / count;
    const p08 = sMachines.reduce((a, m) => a + (m.hwDetail?.P08 || 0), 0) / count;
    const p09 = sMachines.reduce((a, m) => a + (m.hwDetail?.P09 || 0), 0) / count;
    const p10 = sMachines.reduce((a, m) => a + (m.hwDetail?.P10 || 0), 0) / count;
    const avgHw = sMachines.reduce((a, m) => a + m.avgHw, 0) / count;

    const hwParts = [
      { name: 'P01 - Pick Modul', val: p01 },
      { name: 'P02 - Presenter', val: p02 },
      { name: 'P03 - Reject', val: p03 },
      { name: 'P04 - Card Reader', val: p04 },
      { name: 'P05 - Komunikasi', val: p05 },
      { name: 'P06 - DIU', val: p06 },
      { name: 'P07 - Uang Habis', val: p07 },
      { name: 'P08 - Replenishment', val: p08 },
      { name: 'P09 - LLH', val: p09 },
      { name: 'P10 - Uang Penuh', val: p10 },
    ].sort((a, b) => b.val - a.val);

    const dominantPart = hwParts[0].val > 0 ? hwParts[0].name : '-';

    return {
      'No': idx + 1,
      'Sektor': sektor,
      'Service Point': getServicePointName(sektor),
      'Total Mesin Aktif': sMachines.length,
      'Rata-rata Downtime H/W (%)': safeNum(avgHw),
      'Modul Hardware Paling Sering Rusak': dominantPart,
      'P01 - Pick Modul (%)': safeNum(p01),
      'P02 - Presenter (%)': safeNum(p02),
      'P03 - Reject (%)': safeNum(p03),
      'P04 - Card Reader (%)': safeNum(p04),
      'P05 - Komunikasi (%)': safeNum(p05),
      'P06 - DIU (%)': safeNum(p06),
      'P07 - Uang Habis (%)': safeNum(p07),
      'P08 - Replenishment (%)': safeNum(p08),
      'P09 - LLH (%)': safeNum(p09),
      'P10 - Uang Penuh (%)': safeNum(p10)
    };
  });

  const wsHw = XLSX.utils.json_to_sheet(hwSektorRaw);
  autoFitColumns(wsHw);
  XLSX.utils.book_append_sheet(wb, wsHw, 'Hardware Sektor');

  const dateStr = new Date().toISOString().split('T')[0];
  const filename = `Laporan_Analisis_Downtime_Lengkap_${dateStr}.xlsx`;
  downloadWorkbookAsExcel(wb, filename);
}
