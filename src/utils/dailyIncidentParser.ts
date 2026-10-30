import * as XLSX from 'xlsx';
import defaultOperatingHoursJson from '../data/defaultOperatingHours.json';
import type { MasterRow } from './excelParser';

export interface DailyIncidentRow {
  incidentNumber?: string;
  wsid: string;
  lokasi: string;
  servicePointSektor: string;
  servicePoint?: string;
  sektor?: string;
  typeMesin: string;
  vendorMesin: string;
  startTime: string;
  endTime: string;
  dateStr: string; // DD/MM/YYYY
  hourStr: string; // HH:00 (e.g. "10:00")
  hourNumber: number; // 0..23
  durasi: number; // in minutes (calculated based on operating days & hours)
  rawDuration?: number; // original duration from CSV
  eventCodeDesc: string;
  eventCode?: string;
  operatingDays?: string;
  operatingHours?: string;
  detail?: string;
  comment?: string;
  keterangan?: string;
  actionTerakhir?: string;
  actionTerakhirOleh?: string;
  actionTerakhirWaktu?: string;
  jumlahAction?: number;
  closeSource?: 'OASE' | 'DASHBOARD' | '-';
  monthStr?: string;
}

export const TARGET_EVENT_CODES: string[] = [
  'CAH HANDLER: Op not attmptd-BILL IN TRANSPORT',
  'Card Reader Faults',
  'CARD SKIMMING',
  'cash handlr: Exit shutter jamm',
  'cash handlr: Op not attmptd -p',
  'cash handlr: Presenter sensor',
  'cash handlr: Presenter timing',
  'Cassette & Reject bin Overfill',
  'Chip Contact Indicates Problem',
  'COM-ATM HAS BEEN MARKED DOWN',
  'Comm Down 30x Per Hari',
  'DSP-BILLS NOT SEEN AT EXIT SEN',
  'DSP-Pick Module Failure',
  'DSP-SENSOR FAILED/CURCY JAM',
  'encryptor: Hardware error',
  'EPP PK Not Verified',
  'Error on Bunch Notes Acceptor',
  'ICR-CARD JAM DURING CAPTURE',
  'ICR-DEVICE STILL INOPERATIVE',
  'LLH-Lain-lain hardware',
  'Multi-Cassette Fault',
  'Multi-Cassette Fault/Out',
  'Multi-Cassette FaultOut',
  'Multi-Cassette Missing',
  'Multi-Cassette Out',
  'PAP-PAPER EXHAUSTED',
  'PAP-PAPER NOT LOADED',
  'PRT-PRINTER OPEN',
  'Receipt Printer Faulted',
  'recpt prntr: Paper low',
  'Reject bin near full',
  'REJ-REJECT BIN OVERFILL',
  'SHUTTER JAMMED',
  'SPV-MODE SWITCH MOVE TO SPV',
  'V-SAT'
];

export const TARGET_EVENT_CODES_SET = new Set(
  TARGET_EVENT_CODES.map((s) => s.trim().toUpperCase())
);

export function cleanSektorName(raw?: string | null): string {
  if (!raw || typeof raw !== 'string') return '-';
  let s = raw.trim();
  if (!s || s === '-' || s.toUpperCase() === 'UNKNOWN' || s.toUpperCase() === 'N/A') return '-';

  if (s.includes('-')) {
    const parts = s.split('-');
    const remainder = parts.slice(1).join('-').trim();
    if (remainder) {
      s = remainder;
    }
  }

  s = s.replace(/^[-_\s]+|[-_\s]+$/g, '').trim().toUpperCase();

  const invalidValues = [
    'ABACUS CASH SOLUTION',
    'GRUP ABACUS CASH SOLUTION',
    'PT ABACUS CASH SOLUTION',
    'PT. ABACUS CASH SOLUTION',
    'ABACUS JAKARTA',
    'ABACUS BEKASI',
    'ABACUS BINTARO',
    'ABACUS CIKANDE',
    'ABACUS SERANG',
    'ABACUS RAWAMANGUN',
    'UNKNOWN',
    'UNKNOWN SEKTOR',
    'N/A',
    '-',
    ''
  ];

  if (invalidValues.includes(s)) {
    return '-';
  }

  const spCodes = ['ACJK', 'ACBT', 'ACCK', 'ACSR', 'ACBS', 'ACRW', 'TAG'];
  if (spCodes.includes(s)) {
    return '-';
  }

  return s;
}

export function toComparableDate(str?: string | null, isEnd: boolean = false): string {
  if (!str) return '';
  const clean = str.trim();
  if (clean.includes('/')) {
    const parts = clean.split(' ')[0].split('/');
    if (parts.length >= 3) {
      const d = parts[0].padStart(2, '0');
      const m = parts[1].padStart(2, '0');
      const y = parts[2];
      return `${y}-${m}-${d}`;
    }
  } else if (clean.includes('-')) {
    const parts = clean.split(' ')[0].split('-');
    if (parts.length === 3) {
      if (parts[0].length === 4) {
        return `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
      } else {
        const d = parts[0].padStart(2, '0');
        const m = parts[1].padStart(2, '0');
        const y = parts[2];
        return `${y}-${m}-${d}`;
      }
    } else if (parts.length === 2) {
      return isEnd ? `${clean}-31` : `${clean}-01`;
    }
  }
  return clean;
}

export function isEndTimeFilled(endTime?: string | null): boolean {
  if (!endTime) return false;
  const s = String(endTime).trim();
  if (
    s === '' ||
    s === '-' ||
    s === '00:00:00' ||
    s === 'null' ||
    s === 'undefined' ||
    s.includes('1899') ||
    s.includes('1900') ||
    s.toUpperCase() === 'OPEN'
  ) {
    return false;
  }
  return /\d/.test(s);
}

export function isDateInRange(dateStr?: string | null, start?: string | null, end?: string | null): boolean {
  const hasStart = Boolean(start && start !== 'ALL' && start !== '');
  const hasEnd = Boolean(end && end !== 'ALL' && end !== '');

  // Jika tidak ada filter tanggal yang aktif, SEMUA data lolos secara default
  if (!hasStart && !hasEnd) {
    return true;
  }

  // Jika filter tanggal aktif tetapi baris data tidak memiliki tanggal valid
  if (!dateStr || dateStr === '-') return false;
  const comp = toComparableDate(dateStr);
  if (!comp) return false;

  if (hasStart) {
    const compStart = toComparableDate(start, false);
    if (compStart && comp < compStart) return false;
  }
  if (hasEnd) {
    const compEnd = toComparableDate(end, true);
    if (compEnd && comp > compEnd) return false;
  }
  return true;
}

/**
 * Ekstrak format YYYY-MM dari format tanggal DD/MM/YYYY atau YYYY-MM-DD
 */
export function extractMonthStr(dateStr?: string | null, fallback: string = '2026-10'): string {
  if (!dateStr || dateStr === '-') return fallback;
  const s = String(dateStr).trim();
  if (s.includes('/')) {
    const parts = s.split(' ')[0].split('/');
    if (parts.length >= 3) {
      const y = parts[2].length === 2 ? `20${parts[2]}` : parts[2];
      const m = parts[1].padStart(2, '0');
      return `${y}-${m}`;
    }
  }
  if (s.includes('-')) {
    const parts = s.split(' ')[0].split('-');
    if (parts.length >= 2 && parts[0].length === 4) {
      return `${parts[0]}-${parts[1].padStart(2, '0')}`;
    }
  }
  return fallback;
}

/**
 * Format SERVICE POINT - SEKTOR sesuai format: KODE_SERVICE_POINT - NAMA_SEKTOR
 * Contoh: "ACJK - ULUJAMI", "ACBT - PAKU HAJI", "ACBS - BEKASI"
 */
export function formatServicePointSektor(
  sektor?: string | null,
  defaultPengelola?: string | null
): string {
  const cleanSek = cleanSektorName(sektor);
  let spCode = '';

  if (sektor && sektor.includes('-')) {
    spCode = sektor.split('-')[0].trim().toUpperCase();
  } else if (defaultPengelola && defaultPengelola.trim() !== '') {
    const match = defaultPengelola.trim().match(/^([A-Z]{4})/i);
    if (match) spCode = match[1].toUpperCase();
  }

  if (spCode && cleanSek && cleanSek !== '-') {
    return `${spCode} - ${cleanSek}`;
  } else if (cleanSek && cleanSek !== '-') {
    return cleanSek;
  } else if (spCode) {
    return spCode;
  }

  return '-';
}

/**
 * Parsing string tanggal DD/MM/YYYY HH:mm:ss menjadi Date
 */
export function parseDateTime(str?: string | null, targetMonthHint = 10): Date | null {
  if (!str || str === '-' || str.trim() === '') return null;
  const parts = str.trim().split(' ');
  const sep = parts[0].includes('-') ? '-' : '/';
  const dParts = parts[0].split(sep);
  if (dParts.length < 3) return null;

  let day = parseInt(dParts[0], 10);
  let month = parseInt(dParts[1], 10);
  let year = parseInt(dParts[2], 10);

  if (dParts[0].length === 4) {
    // YYYY-MM-DD
    year = parseInt(dParts[0], 10);
    month = parseInt(dParts[1], 10);
    day = parseInt(dParts[2], 10);
  } else {
    // DD/MM/YYYY or MM/DD/YYYY
    if (month > 12 && day <= 12) {
      const tmp = day;
      day = month;
      month = tmp;
    } else if (day === targetMonthHint && month !== targetMonthHint && month <= 12) {
      // Inversi locale US oleh sistem/Sheets (misal 10/07/2026 untuk 7 Oktober)
      const tmp = day;
      day = month;
      month = tmp;
    }
  }

  if (isNaN(day) || isNaN(month) || isNaN(year)) return null;

  let hour = 0;
  let minute = 0;
  let second = 0;
  if (parts[1]) {
    const tParts = parts[1].split(':');
    hour = parseInt(tParts[0] || '0', 10);
    minute = parseInt(tParts[1] || '0', 10);
    second = parseInt(tParts[2] || '0', 10);
  }

  return new Date(year, month - 1, day, hour, minute, second);
}

/**
 * Normalisasi format string tanggal/waktu CSV ke standar baku DD/MM/YYYY HH:mm:ss.
 * Membalik format US (MM/DD/YYYY) menjadi DD/MM/YYYY secara konsisten dan aman.
 */
export function normalizeDateString(str?: string | null, targetMonthHint = 10): string {
  if (!str || str === '-' || str.trim() === '') return '-';
  const s = String(str).trim();
  if (/^(Uns|Sol|Err|ATM|Warn|Info|Status|Tran|COM|DSP|Reject|Multi|SPV|FLM|SLM):/i.test(s)) return '-';
  if (/has been marked|sent a power|error on|warning no|hopper|cassette|balancing|out of|mode switch|notes low|bills not|tran status|paper low|recpt prntr/i.test(s)) {
    return '-';
  }

  // Format ISO: YYYY-MM-DD[T or space]HH:mm:ss
  if (/^\d{4}[-/]\d{1,2}[-/]\d{1,2}/.test(s)) {
    const parts = s.split(/[T\s]+/);
    const sep = parts[0].includes('-') ? '-' : '/';
    const dp = parts[0].split(sep);
    const y = dp[0];
    const m = dp[1].padStart(2, '0');
    const d = dp[2].padStart(2, '0');
    let t = parts[1] || '00:00:00';
    if (t.split(':').length === 2) t += ':00';
    return `${d}/${m}/${y} ${t.split('.')[0]}`;
  }

  // DD/MM/YYYY atau MM/DD/YYYY dengan kemungkinan AM/PM
  const m = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?(?:\s*(AM|PM))?)?/i);
  if (m) {
    const p1 = parseInt(m[1], 10);
    const p2 = parseInt(m[2], 10);
    let year = m[3];
    if (year.length === 2) year = `20${year}`;
    let hh = m[4] ? parseInt(m[4], 10) : 0;
    const mm = m[5] ? parseInt(m[5], 10) : 0;
    const ss = m[6] ? parseInt(m[6], 10) : 0;
    const ampm = m[7] ? m[7].toUpperCase() : '';

    if (ampm === 'PM' && hh < 12) hh += 12;
    if (ampm === 'AM' && hh === 12) hh = 0;

    let day = p1;
    let month = p2;

    if (p2 > 12 && p1 <= 12) {
      day = p2;
      month = p1;
    } else if (p1 === targetMonthHint && p2 !== targetMonthHint && p2 <= 12) {
      // Inversi US: p1 adalah bulan (10), p2 adalah tanggal (1..12)
      day = p2;
      month = p1;
    }

    const dStr = String(day).padStart(2, '0');
    const moStr = String(month).padStart(2, '0');
    const tStr = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
    return `${dStr}/${moStr}/${year} ${tStr}`;
  }

  return s;
}

/**
 * Format string jadwal hari operasional ke daftar hari aktif (0 = Minggu, 1 = Senin, ..., 6 = Sabtu)
 */
export function parseOperatingDays(hariStr?: string | null): number[] {
  const h = (hariStr || 'MON-SUN').trim().toUpperCase();
  if (h.includes('MON-FRI')) return [1, 2, 3, 4, 5];
  if (h.includes('MON-SAT')) return [1, 2, 3, 4, 5, 6];
  return [0, 1, 2, 3, 4, 5, 6]; // Default MON-SUN (7 hari)
}

/**
 * Format string jam operasional (e.g. "(07:00 - 22:00)" atau "07:00:00-22:00:00")
 */
export function parseOperatingHours(jamStr?: string | null): {
  startH: number;
  startM: number;
  endH: number;
  endM: number;
} {
  const clean = (jamStr || '00:00 - 23:59').replace(/[()]/g, '').trim();
  const parts = clean.split(/[-–]/).map((s) => s.trim());
  let startH = 0,
    startM = 0,
    endH = 23,
    endM = 59;
  if (parts.length === 2) {
    const sTime = parts[0].split(':').map((n) => parseInt(n, 10));
    const eTime = parts[1].split(':').map((n) => parseInt(n, 10));
    startH = isNaN(sTime[0]) ? 0 : sTime[0];
    startM = isNaN(sTime[1]) ? 0 : sTime[1];
    endH = isNaN(eTime[0]) ? 23 : eTime[0];
    endM = isNaN(eTime[1]) ? 59 : eTime[1];
  }
  return { startH, startM, endH, endM };
}

/**
 * Hitung durasi operasional dalam satuan MENIT.
 * Hanya rentang waktu yang berada dalam jam dan hari operasional yang dihitung.
 */
export function calculateOperationalDuration(
  start: Date | null,
  end: Date | null,
  hariStr?: string | null,
  jamStr?: string | null
): number {
  if (!start || !end || end.getTime() <= start.getTime()) return 0;

  const activeDays = new Set(parseOperatingDays(hariStr));
  const { startH, startM, endH, endM } = parseOperatingHours(jamStr);

  let totalMs = 0;
  const cur = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const lastDay = new Date(end.getFullYear(), end.getMonth(), end.getDate());

  while (cur.getTime() <= lastDay.getTime()) {
    const dayOfWeek = cur.getDay();
    if (activeDays.has(dayOfWeek)) {
      const openTime = new Date(
        cur.getFullYear(),
        cur.getMonth(),
        cur.getDate(),
        startH,
        startM,
        0
      );
      const closeTime = new Date(
        cur.getFullYear(),
        cur.getMonth(),
        cur.getDate(),
        endH,
        endM,
        endH === 23 && endM === 59 ? 59 : 0
      );

      const winStart = Math.max(start.getTime(), openTime.getTime());
      const winEnd = Math.min(end.getTime(), closeTime.getTime());

      if (winEnd > winStart) {
        totalMs += winEnd - winStart;
      }
    }
    cur.setDate(cur.getDate() + 1);
  }

  return Math.round(totalMs / (1000 * 60));
}

/**
 * Resolusi jadwal operasional untuk suatu WSID
 */
export function resolveOperatingSchedule(
  wsid: string,
  customJamMap?: Map<string, { hari: string; jam: string }>,
  masterMap?: Map<string, MasterRow>
): { hari: string; jam: string } {
  const cleanWsid = String(wsid || '').trim();
  if (!cleanWsid) return { hari: 'MON-SUN', jam: '(00:00 - 23:59)' };

  // 1. Cek dari customJamMap (jika user mengunggah Master Jam Operasional custom)
  if (customJamMap && customJamMap.has(cleanWsid)) {
    return customJamMap.get(cleanWsid)!;
  }
  if (customJamMap && cleanWsid.startsWith('0')) {
    const zWsid = 'Z' + cleanWsid.substring(1);
    if (customJamMap.has(zWsid)) return customJamMap.get(zWsid)!;
  }

  // 2. Cek default bundled operating hours (7.577 WSID)
  const defaultHours = (defaultOperatingHoursJson as Record<string, string>)[cleanWsid];
  if (defaultHours) {
    const [h, j] = defaultHours.split('|');
    return { hari: h || 'MON-SUN', jam: j || '(00:00 - 23:59)' };
  }
  if (cleanWsid.startsWith('0')) {
    const zWsid = 'Z' + cleanWsid.substring(1);
    const zDefault = (defaultOperatingHoursJson as Record<string, string>)[zWsid];
    if (zDefault) {
      const [h, j] = zDefault.split('|');
      return { hari: h || 'MON-SUN', jam: j || '(00:00 - 23:59)' };
    }
  }

  // 3. Cek dari Master Data Mesin jika ada
  if (masterMap && masterMap.has(cleanWsid)) {
    const m = masterMap.get(cleanWsid)!;
    const h = m.Hari || 'MON-SUN';
    const j = m.Jam || m['Jam Operasi'] || '';
    if (j) return { hari: h, jam: String(j) };
  }

  // Default: 24 Jam
  return { hari: 'MON-SUN', jam: '(00:00 - 23:59)' };
}

/**
 * Fast CSV line splitter yang menghandle tanda kutip
 */
export function splitCsvLine(line: string): string[] {
  const result: string[] = [];
  let cur = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(cur.trim());
      cur = '';
    } else {
      cur += char;
    }
  }
  result.push(cur.trim());
  return result;
}

export interface ParseDailyIncidentResult {
  rows: DailyIncidentRow[];
  totalRawLines: number;
  matchedCount: number;
  reportDateStr?: string;
  reportDefaultEndDate: Date;
  reportEndStr: string;
}

/**
 * Parsing file Incident Report CSV
 */
export async function parseDailyIncidentCsv(
  fileOrContent: File | string,
  options?: {
    masterData?: MasterRow[];
    customJamMap?: Map<string, { hari: string; jam: string }>;
  }
): Promise<ParseDailyIncidentResult> {
  let content = '';
  let filename = '';

  if (typeof fileOrContent === 'string') {
    content = fileOrContent;
  } else {
    filename = fileOrContent.name;
    content = await fileOrContent.text();
  }

  let reportDefaultEndDate: Date | null = null;
  let reportDateStr: string | undefined = undefined;
  let targetMonthHint = 10;

  // Coba ekstrak timestamp snapshot dari pola nama file OASE yang umum
  // 1. DDMMYYYY_HH-mm-ss / DDMMYYYY_HHmmss (contoh: 13102026_14-00-00.csv)
  const matchFn1 = filename.match(/(\d{2})(\d{2})(\d{4})_(\d{2})[-_:]?(\d{2})[-_:]?(\d{2})/);
  // 2. YYYY-MM-DD_HH-mm-ss / YYYYMMDD_HHmmss (contoh: 2026-10-13_14-00-00.csv)
  const matchFn2 = filename.match(/(\d{4})[-_]?(\d{2})[-_]?(\d{2})[-_T](\d{2})[-_:]?(\d{2})[-_:]?(\d{2})/);
  // 3. DD-MM-YYYY_HH-mm-ss (contoh: 13-10-2026_14-00-00.csv)
  const matchFn3 = filename.match(/(\d{2})[-_](\d{2})[-_](\d{4})[-_](\d{2})[-_:]?(\d{2})[-_:]?(\d{2})/);

  if (matchFn1) {
    const [, d, m, y, hr, min, sec] = matchFn1;
    targetMonthHint = parseInt(m, 10) || 10;
    reportDateStr = `${d}/${m}/${y}`;
    reportDefaultEndDate = new Date(
      parseInt(y, 10),
      parseInt(m, 10) - 1,
      parseInt(d, 10),
      parseInt(hr, 10),
      parseInt(min, 10),
      parseInt(sec, 10)
    );
  } else if (matchFn2) {
    const [, y, m, d, hr, min, sec] = matchFn2;
    targetMonthHint = parseInt(m, 10) || 10;
    reportDateStr = `${d}/${m}/${y}`;
    reportDefaultEndDate = new Date(
      parseInt(y, 10),
      parseInt(m, 10) - 1,
      parseInt(d, 10),
      parseInt(hr, 10),
      parseInt(min, 10),
      parseInt(sec, 10)
    );
  } else if (matchFn3) {
    const [, d, m, y, hr, min, sec] = matchFn3;
    targetMonthHint = parseInt(m, 10) || 10;
    reportDateStr = `${d}/${m}/${y}`;
    reportDefaultEndDate = new Date(
      parseInt(y, 10),
      parseInt(m, 10) - 1,
      parseInt(d, 10),
      parseInt(hr, 10),
      parseInt(min, 10),
      parseInt(sec, 10)
    );
  }

  const finalEndDate = reportDefaultEndDate || new Date();
  const dStr = String(finalEndDate.getDate()).padStart(2, '0');
  const mStr = String(finalEndDate.getMonth() + 1).padStart(2, '0');
  const yStr = finalEndDate.getFullYear();
  const hrStr = String(finalEndDate.getHours()).padStart(2, '0');
  const mnStr = String(finalEndDate.getMinutes()).padStart(2, '0');
  const scStr = String(finalEndDate.getSeconds()).padStart(2, '0');
  const reportEndStr = `${dStr}/${mStr}/${yStr} ${hrStr}:${mnStr}:${scStr}`;

  // Buat lookup Master Data Mesin jika ada
  const masterMap = new Map<string, MasterRow>();
  if (options?.masterData) {
    for (const m of options.masterData) {
      if (m.WSID) {
        masterMap.set(String(m.WSID).trim(), m);
      }
    }
  }

  const lines = content.split(/\r?\n/);
  if (lines.length < 2) {
    return { rows: [], totalRawLines: 0, matchedCount: 0 };
  }

  const headerParts = splitCsvLine(lines[0]);
  const colIdx: Record<string, number> = {};
  headerParts.forEach((h, idx) => {
    colIdx[h.trim().toLowerCase()] = idx;
  });

  const getCol = (parts: string[], ...names: string[]): string => {
    for (const name of names) {
      const idx = colIdx[name.toLowerCase()];
      if (idx !== undefined && parts[idx] !== undefined) {
        return parts[idx];
      }
    }
    return '';
  };

  const rows: DailyIncidentRow[] = [];
  const totalLines = lines.length;

  for (let i = 1; i < totalLines; i++) {
    const line = lines[i];
    if (!line || line.trim() === '') continue;

    const parts = splitCsvLine(line);
    const eventDesc = getCol(parts, 'Event Code Description', 'event code description', 'event_code_description', 'event desc', 'event code desc');
    if (!eventDesc) continue;

    // Tampilkan seluruh problem yang ada (tidak dibatasi 35 problem whitelist)
    const wsid = getCol(parts, 'WSID', 'wsid');
    const rawStartTimeStr = getCol(parts, 'Start Time', 'start time', 'start_time', 'start', 'start date', 'waktu mulai');
    const rawEndTimeStr = getCol(parts, 'End Time', 'end time', 'end_time', 'end', 'end date', 'waktu selesai');
    const rawDurStr = getCol(parts, 'Duration', 'duration', 'durasi');

    const startTimeStr = normalizeDateString(rawStartTimeStr, targetMonthHint);
    const endTimeStr = rawEndTimeStr && rawEndTimeStr !== '-' ? normalizeDateString(rawEndTimeStr, targetMonthHint) : '-';

    const startDate = parseDateTime(startTimeStr, targetMonthHint);
    const endDate = parseDateTime(endTimeStr, targetMonthHint) || reportDefaultEndDate || new Date();

    // Resolusi jam & hari operasional
    const sched = resolveOperatingSchedule(wsid, options?.customJamMap, masterMap);

    // Hitung durasi operasional
    const durasi = calculateOperationalDuration(startDate, endDate, sched.hari, sched.jam);

    // Resolusi Nama Lokasi, Tipe Mesin, Vendor Mesin, Service Point - Sektor
    const m = masterMap.get(wsid);
    const lokasi = (m && (m['Nama Lokasi'] || m.lokasi)) || getCol(parts, 'Lokasi 1', 'lokasi') || '-';
    const typeMesin = (m && (m['Tipe Mesin'] || m.tipeMesin)) || getCol(parts, 'Tipe Mesin', 'type mesin') || '-';
    const vendorMesin = (m && (m.Vendor || m.vendor)) || getCol(parts, 'Vendor Mesin', 'vendor') || '-';

    // Format SERVICE POINT - SEKTOR (Contoh: "ACJK - ULUJAMI", Sektor murni: "ULUJAMI")
    const rawSektor = m?.Sektor || m?.sektor || m?.sektorBCA || '';
    const rawPengelola = getCol(parts, 'Pengelola', 'pengelola');
    const servicePointSektor = formatServicePointSektor(rawSektor, rawPengelola);

    let servicePoint = '-';
    let sektor = '-';
    if (servicePointSektor && servicePointSektor !== '-') {
      if (servicePointSektor.includes(' - ')) {
        const spParts = servicePointSektor.split(' - ');
        servicePoint = spParts[0].trim().toUpperCase();
        sektor = cleanSektorName(spParts.slice(1).join(' - '));
      } else if (servicePointSektor.includes('-')) {
        const spParts = servicePointSektor.split('-');
        servicePoint = spParts[0].trim().toUpperCase();
        sektor = cleanSektorName(spParts.slice(1).join('-'));
      } else {
        servicePoint = servicePointSektor.trim().toUpperCase();
        sektor = cleanSektorName(servicePointSektor);
      }
    }
    if (sektor === '-' && rawSektor) {
      sektor = cleanSektorName(rawSektor);
    }

    // Date and Hour info
    let dateStr = '-';
    let hourStr = '00:00';
    let hourNumber = 0;
    if (startTimeStr && startTimeStr !== '-') {
      const [dPart, tPart] = startTimeStr.split(' ');
      if (dPart) {
        dateStr = dPart;
      }
      if (tPart) {
        const h = parseInt(tPart.split(':')[0] || '0', 10);
        hourNumber = isNaN(h) ? 0 : h;
        hourStr = `${String(hourNumber).padStart(2, '0')}:00`;
      }
    }

    const isClosed = isEndTimeFilled(endTimeStr);

    rows.push({
      incidentNumber: getCol(parts, 'Incident Number', 'incident number'),
      wsid,
      lokasi,
      servicePointSektor,
      servicePoint,
      sektor,
      typeMesin,
      vendorMesin,
      startTime: startTimeStr,
      endTime: endTimeStr && endTimeStr !== '-' ? endTimeStr : '-',
      dateStr,
      hourStr,
      hourNumber,
      durasi,
      rawDuration: rawDurStr ? parseInt(rawDurStr, 10) : undefined,
      eventCodeDesc: eventDesc,
      eventCode: getCol(parts, 'Event Code', 'event code'),
      operatingDays: sched.hari,
      operatingHours: sched.jam,
      detail: getCol(parts, 'Detail', 'detail'),
      comment: (() => {
        const c = getCol(parts, 'Comment', 'comment', 'Comments', 'comments', 'Keterangan', 'keterangan', 'Remark', 'Remarks', 'Catatan', 'Notes');
        return c && c !== '-' ? c.trim() : undefined;
      })(),
      keterangan: (() => {
        const c = getCol(parts, 'Comment', 'comment', 'Comments', 'comments', 'Keterangan', 'keterangan', 'Remark', 'Remarks', 'Catatan', 'Notes');
        return c && c !== '-' ? c.trim() : undefined;
      })(),
      actionTerakhir: undefined,
      actionTerakhirOleh: undefined,
      actionTerakhirWaktu: undefined,
      jumlahAction: 0,
      closeSource: isClosed ? 'OASE' : '-',
      monthStr: normalizeMonthStr(startTimeStr) || '2026-10'
    });
  }

  return {
    rows,
    totalRawLines: totalLines - 1,
    matchedCount: rows.length,
    reportDateStr: reportDateStr || `${dStr}/${mStr}/${yStr}`,
    reportDefaultEndDate: finalEndDate,
    reportEndStr
  };
}

// ==========================================
// AGREGASI SUB MENU 1: PER WSID, PER PROBLEM, PER TANGGAL
// ==========================================

export interface WsidProblemDateAggregation {
  wsid: string;
  lokasi: string;
  servicePointSektor: string;
  typeMesin: string;
  vendorMesin: string;
  eventCodeDesc: string;
  dateCounts: Record<string, number>;
  totalFrekuensi: number;
  totalDurasi: number; // in minutes
}

export function aggregateByWsidProblemDate(
  rows: DailyIncidentRow[]
): {
  items: WsidProblemDateAggregation[];
  allDates: string[];
} {
  const map: Record<string, WsidProblemDateAggregation> = {};
  const datesSet = new Set<string>();

  for (const r of rows) {
    if (!r.wsid) continue;
    const key = `${r.wsid}__${r.eventCodeDesc}`;
    if (r.dateStr && r.dateStr !== '-') {
      datesSet.add(r.dateStr);
    }

    if (!map[key]) {
      map[key] = {
        wsid: r.wsid,
        lokasi: r.lokasi,
        servicePointSektor: r.servicePointSektor,
        typeMesin: r.typeMesin,
        vendorMesin: r.vendorMesin,
        eventCodeDesc: r.eventCodeDesc,
        dateCounts: {},
        totalFrekuensi: 0,
        totalDurasi: 0
      };
    }

    const cur = map[key];
    const d = r.dateStr;
    if (d && d !== '-') {
      cur.dateCounts[d] = (cur.dateCounts[d] || 0) + 1;
    }
    cur.totalFrekuensi += 1;
    cur.totalDurasi += r.durasi || 0;
  }

  // Sort dates chronologically
  const allDates = Array.from(datesSet).sort((a, b) => {
    const da = a.split('/').reverse().join('-');
    const db = b.split('/').reverse().join('-');
    return da.localeCompare(db);
  });

  const items = Object.values(map).sort((a, b) => b.totalFrekuensi - a.totalFrekuensi);

  return { items, allDates };
}

// ==========================================
// AGREGASI SUB MENU 2: DISTRIBUSI PROBLEM PER JAM (00:00 - 23:00)
// ==========================================

export interface HourlyServicePointStat {
  servicePoint: string;
  count: number;
  percentage: number;
  durasi: number;
  topProblem: string;
  topProblemCount: number;
}

export interface HourlySektorStat {
  sektor: string;
  servicePoint: string;
  count: number;
  percentage: number;
  durasi: number;
  topProblem: string;
  topProblemCount: number;
  topProblemDurasi?: number;
  topProblemByCount?: string;
  topProblemByDurasi?: string;
  problemBreakdown?: { problem: string; count: number; durasi: number }[];
}

export interface HourlyImpactWsidStat {
  wsid: string;
  lokasi: string;
  servicePointSektor: string;
  servicePoint: string;
  sektor: string;
  typeMesin: string;
  vendorMesin: string;
  count: number;
  durasi: number;
  topProblem: string;
  topProblemCount: number;
  topProblemDurasi?: number;
  topProblemByCount?: string;
  topProblemByDurasi?: string;
  problemBreakdown?: { problem: string; count: number; durasi: number }[];
}

export interface HourlyProblemStat {
  problem: string;
  count: number;
  percentage: number;
  durasi: number;
}

export interface HourlyProblemDistribution {
  hour: string; // e.g. "00:00", "01:00", ..., "23:00"
  hourNumber: number; // 0..23
  totalIncidents: number;
  percentage: number;
  totalDurasi: number;
  topProblem: string;
  topProblemCount: number;
  topServicePoint: string;
  topServicePointCount: number;
  topSektor: string;
  topSektorCount: number;
  topWsid: string;
  topWsidLokasi: string;
  topWsidCount: number;
  topWsidDurasi: number;
  topWsidProblem: string;
  problemBreakdown: HourlyProblemStat[];
  servicePointBreakdown: HourlyServicePointStat[];
  sektorBreakdown: HourlySektorStat[];
  impactWsidList: HourlyImpactWsidStat[];
}

export function aggregateByHourDistribution(
  rows: DailyIncidentRow[]
): HourlyProblemDistribution[] {
  const totalAll = rows.length || 1;

  // Kelompokkan baris berdasarkan jam 0..23
  const hourRowsMap: Record<number, DailyIncidentRow[]> = {};
  for (let h = 0; h < 24; h++) {
    hourRowsMap[h] = [];
  }

  for (const r of rows) {
    const h = r.hourNumber >= 0 && r.hourNumber <= 23 ? r.hourNumber : 0;
    hourRowsMap[h].push(r);
  }

  const result: HourlyProblemDistribution[] = [];

  for (let h = 0; h < 24; h++) {
    const hourRows = hourRowsMap[h];
    const totalHourIncidents = hourRows.length;
    let totalDurasi = 0;

    // 1. Problem Breakdown
    const problemMap: Record<string, { count: number; durasi: number }> = {};

    // 2. Service Point Breakdown
    const spMap: Record<string, { count: number; durasi: number; problems: Record<string, { count: number; durasi: number }> }> = {};

    // 3. Sektor Breakdown
    const sektorMap: Record<string, { servicePoint: string; count: number; durasi: number; problems: Record<string, { count: number; durasi: number }> }> = {};

    // 4. Impact WSID Breakdown
    const wsidMap: Record<string, {
      wsid: string;
      lokasi: string;
      servicePointSektor: string;
      servicePoint: string;
      sektor: string;
      typeMesin: string;
      vendorMesin: string;
      count: number;
      durasi: number;
      problems: Record<string, { count: number; durasi: number }>;
    }> = {};

    for (const r of hourRows) {
      const dur = r.durasi || 0;
      totalDurasi += dur;

      // Problem
      const pDesc = r.eventCodeDesc || '-';
      if (!problemMap[pDesc]) problemMap[pDesc] = { count: 0, durasi: 0 };
      problemMap[pDesc].count += 1;
      problemMap[pDesc].durasi += dur;

      // Service Point & Sektor
      const sp = r.servicePoint || (r.servicePointSektor.includes('-') ? r.servicePointSektor.split('-')[0].trim().toUpperCase() : r.servicePointSektor || '-');
      const sName = r.sektor || (r.servicePointSektor.includes('-') ? r.servicePointSektor.split('-').slice(1).join('-').trim().toUpperCase() : r.servicePointSektor || '-');

      if (!spMap[sp]) spMap[sp] = { count: 0, durasi: 0, problems: {} };
      spMap[sp].count += 1;
      spMap[sp].durasi += dur;
      if (!spMap[sp].problems[pDesc]) spMap[sp].problems[pDesc] = { count: 0, durasi: 0 };
      spMap[sp].problems[pDesc].count += 1;
      spMap[sp].problems[pDesc].durasi += dur;

      if (!sektorMap[sName]) sektorMap[sName] = { servicePoint: sp, count: 0, durasi: 0, problems: {} };
      sektorMap[sName].count += 1;
      sektorMap[sName].durasi += dur;
      if (!sektorMap[sName].problems[pDesc]) sektorMap[sName].problems[pDesc] = { count: 0, durasi: 0 };
      sektorMap[sName].problems[pDesc].count += 1;
      sektorMap[sName].problems[pDesc].durasi += dur;

      // WSID
      const wKey = r.wsid || '-';
      if (!wsidMap[wKey]) {
        wsidMap[wKey] = {
          wsid: wKey,
          lokasi: r.lokasi || '-',
          servicePointSektor: r.servicePointSektor || '-',
          servicePoint: sp,
          sektor: sName,
          typeMesin: r.typeMesin || '-',
          vendorMesin: r.vendorMesin || '-',
          count: 0,
          durasi: 0,
          problems: {}
        };
      }
      wsidMap[wKey].count += 1;
      wsidMap[wKey].durasi += dur;
      if (!wsidMap[wKey].problems[pDesc]) wsidMap[wKey].problems[pDesc] = { count: 0, durasi: 0 };
      wsidMap[wKey].problems[pDesc].count += 1;
      wsidMap[wKey].problems[pDesc].durasi += dur;
    }

    // Helper cari problem statistik
    const getTopProblemStats = (probs: Record<string, { count: number; durasi: number }>) => {
      let topProblemByCount = '-';
      let topCount = 0;
      let topProblemByDurasi = '-';
      let topDurasi = -1;

      const breakdown = Object.entries(probs).map(([problem, st]) => ({
        problem,
        count: st.count,
        durasi: st.durasi
      }));

      for (const [p, st] of Object.entries(probs)) {
        if (st.count > topCount) {
          topCount = st.count;
          topProblemByCount = p;
        }
        if (st.durasi > topDurasi) {
          topDurasi = st.durasi;
          topProblemByDurasi = p;
        }
      }

      // Default topProblem: jika ada durasi terbesar > 0, prioritaskan problem berdurasi terbesar;
      // jika semua durasi 0, gunakan problem frekuensi terbanyak.
      const topProblem = (topDurasi > 0 && topProblemByDurasi !== '-') ? topProblemByDurasi : topProblemByCount;
      const topProblemCount = probs[topProblem]?.count || topCount;
      const topProblemDurasi = probs[topProblem]?.durasi || (topDurasi > 0 ? topDurasi : 0);

      return {
        topProblem,
        topProblemCount,
        topProblemDurasi,
        topProblemByCount: topProblemByCount !== '-' ? topProblemByCount : topProblem,
        topProblemByDurasi: topProblemByDurasi !== '-' ? topProblemByDurasi : topProblem,
        problemBreakdown: breakdown.sort((a, b) => b.durasi - a.durasi || b.count - a.count)
      };
    };

    // 1. Problem Breakdown list
    const problemBreakdown: HourlyProblemStat[] = Object.entries(problemMap)
      .map(([problem, data]) => ({
        problem,
        count: data.count,
        durasi: data.durasi,
        percentage: totalHourIncidents > 0 ? Number(((data.count / totalHourIncidents) * 100).toFixed(1)) : 0
      }))
      .sort((a, b) => b.count - a.count);

    // 2. Service Point Breakdown list
    const servicePointBreakdown: HourlyServicePointStat[] = Object.entries(spMap)
      .map(([sp, data]) => {
        const tp = getTopProblemStats(data.problems);
        return {
          servicePoint: sp,
          count: data.count,
          durasi: data.durasi,
          percentage: totalHourIncidents > 0 ? Number(((data.count / totalHourIncidents) * 100).toFixed(1)) : 0,
          topProblem: tp.topProblem,
          topProblemCount: tp.topProblemCount
        };
      })
      .sort((a, b) => b.count - a.count);

    // 3. Sektor Breakdown list
    const sektorBreakdown: HourlySektorStat[] = Object.entries(sektorMap)
      .map(([sektor, data]) => {
        const tp = getTopProblemStats(data.problems);
        return {
          sektor,
          servicePoint: data.servicePoint,
          count: data.count,
          durasi: data.durasi,
          percentage: totalHourIncidents > 0 ? Number(((data.count / totalHourIncidents) * 100).toFixed(1)) : 0,
          topProblem: tp.topProblem,
          topProblemCount: tp.topProblemCount,
          topProblemDurasi: tp.topProblemDurasi,
          topProblemByCount: tp.topProblemByCount,
          topProblemByDurasi: tp.topProblemByDurasi,
          problemBreakdown: tp.problemBreakdown
        };
      })
      .sort((a, b) => b.count - a.count);

    // 4. Impact WSID list (diurutkan berdasarkan durasi downtime terbesar & frekuensi tertinggi)
    const impactWsidList: HourlyImpactWsidStat[] = Object.values(wsidMap)
      .map((data) => {
        const tp = getTopProblemStats(data.problems);
        return {
          wsid: data.wsid,
          lokasi: data.lokasi,
          servicePointSektor: data.servicePointSektor,
          servicePoint: data.servicePoint,
          sektor: data.sektor,
          typeMesin: data.typeMesin,
          vendorMesin: data.vendorMesin,
          count: data.count,
          durasi: data.durasi,
          topProblem: tp.topProblem,
          topProblemCount: tp.topProblemCount,
          topProblemDurasi: tp.topProblemDurasi,
          topProblemByCount: tp.topProblemByCount,
          topProblemByDurasi: tp.topProblemByDurasi,
          problemBreakdown: tp.problemBreakdown
        };
      })
      .sort((a, b) => (b.durasi - a.durasi) || (b.count - a.count));

    const topProblem = problemBreakdown[0]?.problem || '-';
    const topProblemCount = problemBreakdown[0]?.count || 0;
    const topServicePoint = servicePointBreakdown[0]?.servicePoint || '-';
    const topServicePointCount = servicePointBreakdown[0]?.count || 0;
    const topSektor = sektorBreakdown[0]?.sektor || '-';
    const topSektorCount = sektorBreakdown[0]?.count || 0;

    const topWsidItem = impactWsidList[0];
    const topWsid = topWsidItem?.wsid || '-';
    const topWsidLokasi = topWsidItem?.lokasi || '-';
    const topWsidCount = topWsidItem?.count || 0;
    const topWsidDurasi = topWsidItem?.durasi || 0;
    const topWsidProblem = topWsidItem?.topProblem || '-';

    const hourLabel = `${String(h).padStart(2, '0')}:00`;

    result.push({
      hour: hourLabel,
      hourNumber: h,
      totalIncidents: totalHourIncidents,
      percentage: Number(((totalHourIncidents / totalAll) * 100).toFixed(2)),
      totalDurasi,
      topProblem,
      topProblemCount,
      topServicePoint,
      topServicePointCount,
      topSektor,
      topSektorCount,
      topWsid,
      topWsidLokasi,
      topWsidCount,
      topWsidDurasi,
      topWsidProblem,
      problemBreakdown,
      servicePointBreakdown,
      sektorBreakdown,
      impactWsidList
    });
  }

  return result;
}

// ==========================================
// EXPORT EXCEL 3 SHEET
// ==========================================

export function exportDailyIncidentsToExcel(
  rows: DailyIncidentRow[],
  filename: string = 'Daily_Incident_Analysis.xlsx'
) {
  const wb = XLSX.utils.book_new();

  // ----------------------------------------
  // SHEET 1: Detail Incident
  // ----------------------------------------
  const s1Aoa: any[][] = [];
  s1Aoa.push(['LAPORAN DETAIL DAILY INCIDENT']);
  s1Aoa.push([`Dibuat: ${new Date().toLocaleString('id-ID')}`]);
  s1Aoa.push([`Total Insiden: ${rows.length} insiden`]);
  s1Aoa.push([]);

  const s1Headers = [
    'No',
    'WSID',
    'LOKASI',
    'SERVICE POINT - SEKTOR',
    'TYPE MESIN',
    'VENDOR MESIN',
    'START TIME',
    'END TIME',
    'DURASI (MENIT)',
    'EVENT CODE DESCRIPTION',
    'HARI OPR',
    'JAM OPR'
  ];
  s1Aoa.push(s1Headers);

  rows.forEach((r, idx) => {
    s1Aoa.push([
      idx + 1,
      r.wsid,
      r.lokasi,
      r.servicePointSektor,
      r.typeMesin,
      r.vendorMesin,
      r.startTime,
      r.endTime,
      r.durasi,
      r.eventCodeDesc,
      r.operatingDays || '-',
      r.operatingHours || '-'
    ]);
  });

  const ws1 = XLSX.utils.aoa_to_sheet(s1Aoa);
  ws1['!cols'] = [
    { wch: 6 },  // No
    { wch: 10 }, // WSID
    { wch: 32 }, // Lokasi
    { wch: 25 }, // Service Point - Sektor
    { wch: 18 }, // Type Mesin
    { wch: 26 }, // Vendor Mesin
    { wch: 20 }, // Start Time
    { wch: 20 }, // End Time
    { wch: 16 }, // Durasi
    { wch: 36 }, // Event Code Desc
    { wch: 12 }, // Hari Opr
    { wch: 18 }  // Jam Opr
  ];
  XLSX.utils.book_append_sheet(wb, ws1, 'Detail Incident');

  // ----------------------------------------
  // SHEET 2: Frekuensi WSID per Problem per Tanggal
  // ----------------------------------------
  const { items: aggItems, allDates } = aggregateByWsidProblemDate(rows);
  const s2Aoa: any[][] = [];
  s2Aoa.push(['FREKUENSI PROBLEM PER WSID PER TANGGAL']);
  s2Aoa.push([`Dibuat: ${new Date().toLocaleString('id-ID')}`]);
  s2Aoa.push([`Total Kombinasi WSID & Problem: ${aggItems.length}`]);
  s2Aoa.push([]);

  const s2Headers = [
    'No',
    'WSID',
    'LOKASI',
    'SERVICE POINT - SEKTOR',
    'TYPE MESIN',
    'VENDOR MESIN',
    'EVENT CODE DESCRIPTION',
    ...allDates,
    'TOTAL FREKUENSI',
    'TOTAL DURASI OPR (MENIT)'
  ];
  s2Aoa.push(s2Headers);

  aggItems.forEach((item, idx) => {
    const row = [
      idx + 1,
      item.wsid,
      item.lokasi,
      item.servicePointSektor,
      item.typeMesin,
      item.vendorMesin,
      item.eventCodeDesc,
      ...allDates.map((d) => item.dateCounts[d] || 0),
      item.totalFrekuensi,
      item.totalDurasi
    ];
    s2Aoa.push(row);
  });

  const ws2 = XLSX.utils.aoa_to_sheet(s2Aoa);
  ws2['!cols'] = [
    { wch: 6 },
    { wch: 10 },
    { wch: 30 },
    { wch: 25 },
    { wch: 18 },
    { wch: 24 },
    { wch: 36 },
    ...allDates.map(() => ({ wch: 12 })),
    { wch: 16 },
    { wch: 24 }
  ];
  XLSX.utils.book_append_sheet(wb, ws2, 'Frekuensi WSID per Tanggal');

  // ----------------------------------------
  // SHEET 3: Distribusi Problem per Jam
  // ----------------------------------------
  const hourlyData = aggregateByHourDistribution(rows);
  const s3Aoa: any[][] = [];
  s3Aoa.push(['DISTRIBUSI KEJADIAN PROBLEM PER JAM (00:00 - 23:00)']);
  s3Aoa.push([`Dibuat: ${new Date().toLocaleString('id-ID')}`]);
  s3Aoa.push([`Total Insiden: ${rows.length}`]);
  s3Aoa.push([]);

  const s3Headers = [
    'JAM KEJADIAN',
    'TOTAL INSIDEN',
    'PERSENTASE (%)',
    'TOTAL DURASI OPR (MENIT)',
    'TOP SERVICE POINT',
    'FREKUENSI SP',
    'TOP SEKTOR',
    'FREKUENSI SEKTOR',
    'TOP IMPACT WSID',
    'LOKASI TOP WSID',
    'DURASI TOP WSID (MENIT)',
    'PROBLEM UTAMA TOP WSID',
    'TOP 1 PROBLEM',
    'FREKUENSI TOP 1',
    'TOP 2 PROBLEM',
    'FREKUENSI TOP 2',
    'TOP 3 PROBLEM',
    'FREKUENSI TOP 3',
    'DETAIL RINCIAN PROBLEM (SEMUA)',
    'DETAIL SERVICE POINT TERDAMPAK',
    'DETAIL SEKTOR TERDAMPAK'
  ];
  s3Aoa.push(s3Headers);

  hourlyData.forEach((h) => {
    const b1 = h.problemBreakdown[0];
    const b2 = h.problemBreakdown[1];
    const b3 = h.problemBreakdown[2];

    const allProblemStr = h.problemBreakdown
      .map((p) => `${p.problem}: ${p.count}x (${p.percentage}%)`)
      .join(' | ');

    const allSpStr = h.servicePointBreakdown
      .map((s) => `${s.servicePoint}: ${s.count}x (${s.percentage}%)`)
      .join(' | ');

    const allSektorStr = h.sektorBreakdown
      .slice(0, 8)
      .map((sk) => `${sk.sektor}: ${sk.count}x`)
      .join(' | ');

    s3Aoa.push([
      h.hour,
      h.totalIncidents,
      `${h.percentage}%`,
      h.totalDurasi,
      h.topServicePoint,
      h.topServicePointCount,
      h.topSektor,
      h.topSektorCount,
      h.topWsid,
      h.topWsidLokasi,
      h.topWsidDurasi,
      h.topWsidProblem,
      b1 ? b1.problem : '-',
      b1 ? b1.count : 0,
      b2 ? b2.problem : '-',
      b2 ? b2.count : 0,
      b3 ? b3.problem : '-',
      b3 ? b3.count : 0,
      allProblemStr || '-',
      allSpStr || '-',
      allSektorStr || '-'
    ]);
  });

  const ws3 = XLSX.utils.aoa_to_sheet(s3Aoa);
  ws3['!cols'] = [
    { wch: 14 }, // Jam
    { wch: 15 }, // Total
    { wch: 15 }, // %
    { wch: 24 }, // Durasi
    { wch: 22 }, // Top SP
    { wch: 15 }, // Frx SP
    { wch: 24 }, // Top Sektor
    { wch: 16 }, // Frx Sektor
    { wch: 18 }, // Top WSID
    { wch: 30 }, // Lokasi Top WSID
    { wch: 24 }, // Durasi Top WSID
    { wch: 30 }, // Problem Top WSID
    { wch: 30 }, // Top 1
    { wch: 15 }, // Frx 1
    { wch: 30 }, // Top 2
    { wch: 15 }, // Frx 2
    { wch: 30 }, // Top 3
    { wch: 15 }, // Frx 3
    { wch: 60 }, // Detail Problem
    { wch: 45 }, // Detail SP
    { wch: 45 }  // Detail Sektor
  ];
  XLSX.utils.book_append_sheet(wb, ws3, 'Distribusi Problem per Jam');

  // ----------------------------------------
  // SHEET 4: Deteksi Problem Berulang (1 Hari & 5 Hari)
  // ----------------------------------------
  const s4Aoa: any[][] = [];
  s4Aoa.push(['DETEKSI WSID PROBLEM BERULANG (1 HARI & 5 HARI)']);
  s4Aoa.push([`Dibuat: ${new Date().toLocaleString('id-ID')}`]);
  s4Aoa.push([`Kriteria: Problem SAMA >= 3x dalam 1 hari ATAU >= 3x dalam rentang 5 hari`]);
  s4Aoa.push([]);

  const s4Headers = [
    'NO',
    'WSID',
    'LOKASI',
    'SERVICE POINT - SEKTOR',
    'TYPE MESIN',
    'VENDOR MESIN',
    'EVENT CODE DESCRIPTION',
    'BERULANG 1 HARI (>=3x)',
    'BERULANG 5 HARI (>=3x)',
    'MAX 1 HARI',
    'TOTAL KEJADIAN',
    'STATUS TERKINI',
    'WAKTU KEJADIAN TERAKHIR',
    'RINCIAN WAKTU KEJADIAN'
  ];
  s4Aoa.push(s4Headers);

  const recMap = new Map<
    string,
    {
      wsid: string;
      lokasi: string;
      servicePointSektor: string;
      typeMesin: string;
      vendorMesin: string;
      problemDesc: string;
      allIncidents: DailyIncidentRow[];
    }
  >();

  rows.forEach((r) => {
    const pKey = (r.eventCodeDesc || '-').trim().toUpperCase();
    const gKey = `${r.wsid.trim()}|||${pKey}`;
    let g = recMap.get(gKey);
    if (!g) {
      g = {
        wsid: r.wsid,
        lokasi: r.lokasi || '-',
        servicePointSektor: r.servicePointSektor || '-',
        typeMesin: r.typeMesin || '-',
        vendorMesin: r.vendorMesin || '-',
        problemDesc: r.eventCodeDesc || '-',
        allIncidents: []
      };
      recMap.set(gKey, g);
    }
    g.allIncidents.push(r);
  });

  let recIdx = 1;
  recMap.forEach((grp) => {
    const perDateMap = new Map<string, number>();
    grp.allIncidents.forEach((r) => {
      if (r.dateStr) {
        perDateMap.set(r.dateStr, (perDateMap.get(r.dateStr) || 0) + 1);
      }
    });

    let isSameDay = false;
    let maxSameDay = 0;
    for (const [, cnt] of perDateMap.entries()) {
      if (cnt >= 3) isSameDay = true;
      if (cnt > maxSameDay) maxSameDay = cnt;
    }

    const dateEpochs = grp.allIncidents
      .map((r) => {
        if (!r.dateStr || typeof r.dateStr !== 'string') return null;
        const parts = r.dateStr.split('/');
        if (parts.length === 3) {
          const d = parseInt(parts[0], 10);
          const m = parseInt(parts[1], 10);
          const y = parseInt(parts[2], 10);
          if (!isNaN(d) && !isNaN(m) && !isNaN(y)) {
            return { r, ep: Math.floor(Date.UTC(y, m - 1, d) / 86400000) };
          }
        }
        return null;
      })
      .filter((x): x is { r: DailyIncidentRow; ep: number } => x !== null);

    let isFiveDay = false;
    let maxFiveDay = 0;
    for (const item of dateEpochs) {
      const win = dateEpochs.filter((x) => x.ep >= item.ep - 4 && x.ep <= item.ep);
      if (win.length >= 3) isFiveDay = true;
      if (win.length > maxFiveDay) maxFiveDay = win.length;
    }

    if (isSameDay || isFiveDay) {
      const sortedInc = [...grp.allIncidents].sort((a, b) =>
        (b.startTime || '').localeCompare(a.startTime || '')
      );
      const hasOpen = sortedInc.some(
        (r) => !r.endTime || r.endTime === '-' || r.endTime.trim() === ''
      );
      const detailStr = sortedInc.map((i) => `${i.dateStr} ${i.hourStr}`).join('; ');

      s4Aoa.push([
        recIdx++,
        grp.wsid,
        grp.lokasi,
        grp.servicePointSektor,
        grp.typeMesin,
        grp.vendorMesin,
        grp.problemDesc,
        isSameDay ? `YA (${maxSameDay}x)` : 'TIDAK',
        isFiveDay ? `YA (${maxFiveDay}x)` : 'TIDAK',
        maxSameDay,
        sortedInc.length,
        hasOpen ? 'MASIH OPEN' : 'CLOSED',
        sortedInc[0]?.startTime || '-',
        detailStr
      ]);
    }
  });

  const ws4 = XLSX.utils.aoa_to_sheet(s4Aoa);
  ws4['!cols'] = [
    { wch: 6 },
    { wch: 10 },
    { wch: 32 },
    { wch: 25 },
    { wch: 18 },
    { wch: 26 },
    { wch: 36 },
    { wch: 24 },
    { wch: 24 },
    { wch: 14 },
    { wch: 16 },
    { wch: 16 },
    { wch: 20 },
    { wch: 60 }
  ];
  XLSX.utils.book_append_sheet(wb, ws4, 'Problem Berulang');

  // Simpan Workbook
  XLSX.writeFile(wb, filename);
}
