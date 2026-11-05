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

/**
 * Peta nama sektor ke singkatan Service Point resmi untuk resolusi akurat
 */
export const KNOWN_SEKTOR_SP_MAP: Record<string, string> = {
  // ACJK
  "SUDIRMAN": "ACJK", "INPRES": "ACJK", "TJ DUREN": "ACJK", "CILEDUG": "ACJK", "SLIPI": "ACJK",
  "KEBAYORAN LAMA": "ACJK", "KREO": "ACJK", "SENAYAN": "ACJK", "DAAN MOGOT": "ACJK", "ULUJAMI": "ACJK",
  "BENHIL": "ACJK", "KOTA": "ACJK", "TELUK GONG": "ACJK", "TELUK GONG 2": "ACJK", "PIK": "ACJK",
  "TOMANG": "ACJK", "CENTRAL PARK": "ACJK", "JELAMBAR": "ACJK", "SENAYAN 2": "ACJK",

  // ACBT
  "CENGKARENG 1": "ACBT", "CENGKARENG 2": "ACBT", "CEGER": "ACBT", "GRAHA": "ACBT", "MELATI MAS": "ACBT",
  "BINTARO": "ACBT", "SUMMARECON SERPONG": "ACBT", "GADING SERPONG": "ACBT", "LEGOK": "ACBT",
  "ALAM SUTERA": "ACBT", "CURUG": "ACBT", "KARAWACI": "ACBT", "SERPONG RAYA": "ACBT",
  "BSD TAMAN TEKNO": "ACBT", "CIKOKOL": "ACBT", "BSD 1": "ACBT", "BSD 2": "ACBT", "CIPONDOH 1": "ACBT",
  "CIPONDOH 2": "ACBT", "DUTA GARDEN": "ACBT", "TANGERANG KOTA": "ACBT", "PORIS": "ACBT",
  "NEGLASARI": "ACBT", "DADAP": "ACBT", "BITUNG": "ACBT", "CISAUK": "ACBT", "JATAKE": "ACBT",
  "FORESTA": "ACBT", "TELUK NAGA": "ACBT", "KOTA BUMI": "ACBT", "SEPATAN": "ACBT", "PAKU HAJI": "ACBT",
  "PARUNG PANJANG": "ACBT",

  // ACCK
  "CITRA RAYA": "ACCK", "CIKANDE": "ACCK", "BALARAJA": "ACCK", "JAYANTI": "ACCK", "KRAGILAN": "ACCK",
  "PASAR KEMIS": "ACCK", "TIGARAKSA": "ACCK", "JAWILAN": "ACCK", "CIRUAS": "ACCK", "CISOKA": "ACCK",
  "RAJEG": "ACCK", "RANGKASBITUNG": "ACCK",

  // ACSR
  "SERANG KOTA 1": "ACSR", "SERANG KOTA 2": "ACSR", "PETIR": "ACSR", "CIPOCOK JAYA": "ACSR",
  "CIOMAS": "ACSR", "TAKTAKAN": "ACSR", "SERANG": "ACSR", "CILEGON": "ACSR",

  // ACRW
  "CIDENG": "ACRW", "RAWAMANGUN": "ACRW",

  // ACBS
  "SGC": "ACBS", "BEKASI": "ACBS", "CIKARANG": "ACBS"
};

/**
 * Normalisasi nama Service Point agar selalu seragam menggunakan singkatan resmi:
 * ACJK (Jakarta), ACBT (Bintaro), ACCK (Cikande), ACSR (Serang), ACBS (Bekasi), ACRW (Rawamangun), TAG
 */
export function normalizeServicePoint(val?: string | null): string {
  if (!val) return '';
  const s = String(val).trim().toUpperCase();
  if (!s || s === '-' || s === 'N/A' || s === 'UNKNOWN' || s === 'NULL') return '';

  // 1. Jika berformat "ACJK - SEKTOR" atau "ACBT-KOTA BUMI"
  if (s.includes('-')) {
    const first = s.split('-')[0].trim();
    if (['ACJK', 'ACBT', 'ACCK', 'ACSR', 'ACBS', 'ACRW', 'TAG'].includes(first)) {
      return first;
    }
  }

  // 2. Exact matching nama panjang -> singkatan
  if (s === 'ABACUS JAKARTA' || s === 'JAKARTA' || s === 'PT ABACUS JAKARTA') return 'ACJK';
  if (s === 'ABACUS BINTARO' || s === 'BINTARO' || s === 'PT ABACUS BINTARO') return 'ACBT';
  if (s === 'ABACUS CIKANDE' || s === 'CIKANDE' || s === 'PT ABACUS CIKANDE') return 'ACCK';
  if (s === 'ABACUS SERANG' || s === 'SERANG' || s === 'PT ABACUS SERANG') return 'ACSR';
  if (s === 'ABACUS BEKASI' || s === 'BEKASI' || s === 'PT ABACUS BEKASI') return 'ACBS';
  if (s === 'ABACUS RAWAMANGUN' || s === 'RAWAMANGUN' || s === 'PT ABACUS RAWAMANGUN') return 'ACRW';
  if (s === 'TAG' || s === 'PT TAG' || s === 'TRANS ARTHA GEDUNG') return 'TAG';

  // 3. Prefix matching
  if (s.startsWith('ACJK')) return 'ACJK';
  if (s.startsWith('ACBT')) return 'ACBT';
  if (s.startsWith('ACCK')) return 'ACCK';
  if (s.startsWith('ACSR')) return 'ACSR';
  if (s.startsWith('ACBS')) return 'ACBS';
  if (s.startsWith('ACRW')) return 'ACRW';
  if (s.startsWith('TAG')) return 'TAG';

  // 4. Cek apakah ini nama sektor murni (misal: "KOTA BUMI" -> "ACBT", "CITRA RAYA" -> "ACCK")
  const clean = cleanSektorName(s).toUpperCase();
  if (KNOWN_SEKTOR_SP_MAP[clean]) {
    return KNOWN_SEKTOR_SP_MAP[clean];
  }
  if (KNOWN_SEKTOR_SP_MAP[s]) {
    return KNOWN_SEKTOR_SP_MAP[s];
  }

  // 5. Substring matching
  if (s.includes('JAKARTA')) return 'ACJK';
  if (s.includes('BINTARO')) return 'ACBT';
  if (s.includes('CIKANDE')) return 'ACCK';
  if (s.includes('SERANG')) return 'ACSR';
  if (s.includes('BEKASI')) return 'ACBS';
  if (s.includes('RAWAMANGUN')) return 'ACRW';

  return s;
}

/**
 * Mendapatkan kode Service Point resmi (ACJK, ACBT, ACCK, ACSR, ACBS, ACRW, TAG) dari nama sektor.
 * Memeriksa prefix (misal ACBT-KOTA BUMI) dan peta KNOWN_SEKTOR_SP_MAP secara akurat.
 */
export function getServicePointForSektor(sektor?: string | null): string {
  if (!sektor) return '';
  const s = String(sektor).trim();
  if (!s || s === '-' || s === 'N/A' || s === 'UNKNOWN') return '';

  // 1. Jika memiliki prefix SP (misal ACBT-KOTA BUMI, ACCK-RAJEG)
  if (s.includes('-')) {
    const prefix = s.split('-')[0].trim().toUpperCase();
    if (['ACJK', 'ACBT', 'ACCK', 'ACSR', 'ACBS', 'ACRW', 'TAG'].includes(prefix)) {
      return prefix;
    }
  }

  // 2. Cek nama sektor bersih di peta sektor resmi
  const clean = cleanSektorName(s).toUpperCase();
  if (KNOWN_SEKTOR_SP_MAP[clean]) {
    return KNOWN_SEKTOR_SP_MAP[clean];
  }
  if (KNOWN_SEKTOR_SP_MAP[s.toUpperCase()]) {
    return KNOWN_SEKTOR_SP_MAP[s.toUpperCase()];
  }

  // 3. Normalisasi
  const norm = normalizeServicePoint(s);
  if (['ACJK', 'ACBT', 'ACCK', 'ACSR', 'ACBS', 'ACRW', 'TAG'].includes(norm)) {
    return norm;
  }

  return '';
}

/**
 * Resolusi cerdas Service Point (ACJK, ACBT, ACCK, ACSR, ACBS, ACRW, TAG)
 * Mengutamakan data sektor (sektorBCA/sektor) daripada wilayah generic ("ABACUS JAKARTA")
 */
export function resolveServicePoint(machine?: any, incidentRow?: any): string {
  // 1. Ambil dari sektor mesin (sumber paling spesifik, misal: "ACBT-KOTA BUMI", "ACCK-RAJEG")
  const mSektor = machine?.sektorBCA || machine?.sektor || machine?.Sektor || machine?.sektor_bca || '';
  if (mSektor && typeof mSektor === 'string' && mSektor !== '-') {
    const spFromSek = getServicePointForSektor(mSektor);
    if (spFromSek && ['ACJK', 'ACBT', 'ACCK', 'ACSR', 'ACBS', 'ACRW', 'TAG'].includes(spFromSek)) {
      return spFromSek;
    }
  }

  // 2. Ambil dari sektor baris insiden jika mesin tidak ada
  const rSektor = incidentRow?.sektor || incidentRow?.sektor_bca || incidentRow?.servicePointSektor || incidentRow?.service_point_sektor || '';
  if (rSektor && typeof rSektor === 'string' && rSektor !== '-') {
    const spFromRowSek = getServicePointForSektor(rSektor);
    if (spFromRowSek && ['ACJK', 'ACBT', 'ACCK', 'ACSR', 'ACBS', 'ACRW', 'TAG'].includes(spFromRowSek)) {
      return spFromRowSek;
    }
  }

  // 3. Ambil dari servicePoint langsung jika ada (dan bukan generic)
  const mSp = machine?.servicePoint || machine?.service_point || machine?.ServicePoint || '';
  if (mSp && typeof mSp === 'string' && mSp !== '-') {
    const spFromM = normalizeServicePoint(mSp);
    if (spFromM && ['ACJK', 'ACBT', 'ACCK', 'ACSR', 'ACBS', 'ACRW', 'TAG'].includes(spFromM)) {
      return spFromM;
    }
  }

  // 4. Ambil dari service_point baris insiden jika ada
  const rSp = incidentRow?.servicePoint || incidentRow?.service_point || '';
  if (rSp && typeof rSp === 'string' && rSp !== '-') {
    const spFromRow = normalizeServicePoint(rSp);
    if (spFromRow && ['ACJK', 'ACBT', 'ACCK', 'ACSR', 'ACBS', 'ACRW', 'TAG'].includes(spFromRow)) {
      return spFromRow;
    }
  }

  // 5. Fallback ke wilayah operasional mesin jika tidak ada info sektor
  const wil = machine?.wilayahOperasional || machine?.wilayah_operasional || machine?.Wilayah || '';
  if (wil && typeof wil === 'string' && wil !== '-') {
    const spFromWil = normalizeServicePoint(wil);
    if (spFromWil && ['ACJK', 'ACBT', 'ACCK', 'ACSR', 'ACBS', 'ACRW', 'TAG'].includes(spFromWil)) {
      return spFromWil;
    }
  }

  return 'ACJK';
}

export function toComparableDate(str?: string | null, isEnd: boolean = false): string {
  if (!str) return '';
  const clean = str.trim();
  if (clean.includes('/')) {
    const parts = clean.split(' ')[0].split('/');
    if (parts.length >= 3) {
      const d = parts[0].padStart(2, '0');
      const m = parts[1].padStart(2, '0');
      const y = parts[2].length === 2 ? `20${parts[2]}` : parts[2];
      return `${y}-${m}-${d}`;
    } else if (parts.length === 2) {
      const d = parts[0].padStart(2, '0');
      const m = parts[1].padStart(2, '0');
      const y = new Date().getFullYear();
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
        const y = parts[2].length === 2 ? `20${parts[2]}` : parts[2];
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
export function extractMonthStr(dateStr?: string | null, fallback?: string): string {
  const defaultFallback = fallback || new Date().toISOString().slice(0, 7);
  if (!dateStr || dateStr === '-') return defaultFallback;
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
  return defaultFallback;
}

/**
 * Normalisasi format bulan menjadi YYYY-MM (alias untuk extractMonthStr)
 */
export function normalizeMonthStr(dateStr?: string | null, fallback?: string): string {
  return extractMonthStr(dateStr, fallback);
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
    spCode = normalizeServicePoint(sektor.split('-')[0].trim());
  } else if (defaultPengelola && defaultPengelola.trim() !== '') {
    spCode = normalizeServicePoint(defaultPengelola.trim());
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
/**
 * Disambiguasi Day dan Month dari format DD/MM vs MM/DD:
 * 1. Jika salah satu > 12, pasti itu adalah hari
 * 2. Proteksi masa depan: Insiden tidak mungkin di masa depan (> hari ini), jika DD/MM masa depan tapi MM/DD masa lalu, pasti MM/DD
 * 3. Menggunakan targetMonthHint jika cocok
 */
export function resolveDayAndMonth(
  p1: number,
  p2: number,
  year: number,
  targetMonthHint?: number
): { day: number; month: number } {
  if (p1 > 12 && p2 <= 12) {
    return { day: p1, month: p2 };
  }
  if (p2 > 12 && p1 <= 12) {
    return { day: p2, month: p1 };
  }

  const now = new Date();
  const currentY = now.getFullYear();
  const currentM = now.getMonth() + 1;
  const currentD = now.getDate();

  if (year === currentY) {
    const isP1Future = p2 > currentM || (p2 === currentM && p1 > currentD);
    const isP2PastOrPresent = p1 < currentM || (p1 === currentM && p2 <= currentD);
    if (isP1Future && isP2PastOrPresent) {
      return { day: p2, month: p1 };
    }

    const isP2Future = p1 > currentM || (p1 === currentM && p2 > currentD);
    const isP1PastOrPresent = p2 < currentM || (p2 === currentM && p1 <= currentD);
    if (isP2Future && isP1PastOrPresent) {
      return { day: p1, month: p2 };
    }
  }

  const activeMonth = (targetMonthHint && targetMonthHint >= 1 && targetMonthHint <= 12)
    ? targetMonthHint
    : currentM;

  if (p1 === activeMonth && p2 !== activeMonth) {
    return { day: p2, month: p1 };
  }
  if (p2 === activeMonth && p1 !== activeMonth) {
    return { day: p1, month: p2 };
  }

  return { day: p1, month: p2 };
}

/**
 * Parsing string tanggal waktu CSV/API menjadi objek Date.
 * Mendukung format:
 * - "YYYY-MM-DD HH:mm:ss" atau "YYYY-MM-DDTHH:mm:ss"
 * - "DD/MM/YYYY HH:mm:ss" atau "MM/DD/YYYY HH:mm:ss"
 */
export function parseDateTime(str?: string | null, targetMonthHint?: number): Date | null {
  if (!str || str === '-' || str.trim() === '') return null;
  const s = String(str).trim();
  const parts = s.split(/[T\s]+/);
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
    if (dParts[2].length === 2) year = 2000 + year;
    const resolved = resolveDayAndMonth(day, month, year, targetMonthHint);
    day = resolved.day;
    month = resolved.month;
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
export function normalizeDateString(str?: string | null, targetMonthHint?: number): string {
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
    let year = parseInt(m[3], 10);
    if (String(year).length === 2) year = 2000 + year;
    let hh = m[4] ? parseInt(m[4], 10) : 0;
    const mm = m[5] ? parseInt(m[5], 10) : 0;
    const ss = m[6] ? parseInt(m[6], 10) : 0;
    const ampm = m[7] ? m[7].toUpperCase() : '';

    if (ampm === 'PM' && hh < 12) hh += 12;
    if (ampm === 'AM' && hh === 12) hh = 0;

    const resolved = resolveDayAndMonth(p1, p2, year, targetMonthHint);
    const dStr = String(resolved.day).padStart(2, '0');
    const moStr = String(resolved.month).padStart(2, '0');
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
 * Membersihkan dan menormalisasi WSID BCA:
 * 1. Mengembalikan WSID yang terkonversi menjadi objek / representasi teks Date kembali ke kode WSID aslinya
 *    (Contoh: 'Sat Sep 12 1903 ...' -> '1351', 'Sun Apr 22 1900 ...' -> '0113')
 * 2. Menambahkan leading zero untuk angka murni 1-4 digit (Contoh: '54' -> '0054', '113' -> '0113')
 * 3. Menghilangkan sisa artefak desimal Excel (Contoh: '1351.0' -> '1351')
 * 4. Mengeliminasi token sampah / tergeser akibat newline pada komentar CSV (Contoh: '1000000000', detail teknis, dll.)
 */
export function cleanWsid(val: any): string {
  if (val === null || val === undefined) return '';
  let str = String(val).trim();
  if (!str || str === '-' || str.toUpperCase() === 'N/A' || str.toUpperCase() === 'UNKNOWN') return '';

  // 1. Cek jika val adalah Date object atau representasi teks Date
  const isDateObj = val instanceof Date && !isNaN(val.getTime());
  const dateStrMatch = str.match(/^(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+([A-Za-z]{3})\s+(\d{1,2})\s+(\d{4})/i);
  const isoDateMatch = str.match(/^(\d{4})-(\d{2})-(\d{2})/);

  if (isDateObj || dateStrMatch || isoDateMatch) {
    let yr = 0, mon = 0, day = 0;
    if (isDateObj) {
      yr = (val as Date).getFullYear();
      mon = (val as Date).getMonth();
      day = (val as Date).getDate();
    } else if (dateStrMatch) {
      const monthMap: Record<string, number> = {
        jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
        jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11
      };
      mon = monthMap[dateStrMatch[1].toLowerCase()] ?? 0;
      day = parseInt(dateStrMatch[2], 10);
      yr = parseInt(dateStrMatch[3], 10);
    } else if (isoDateMatch) {
      yr = parseInt(isoDateMatch[1], 10);
      mon = parseInt(isoDateMatch[2], 10) - 1;
      day = parseInt(isoDateMatch[3], 10);
    }

    // Jika tahun berada di rentang serial Excel wajar untuk nomor WSID 1-9999 (1900 - 1930)
    if (yr >= 1900 && yr <= 1930) {
      const excelEpoch = Date.UTC(1899, 11, 30);
      const targetUtc = Date.UTC(yr, mon, day);
      const serial = Math.round((targetUtc - excelEpoch) / 86400000);
      if (serial > 0 && serial < 10000) {
        return String(serial).padStart(4, '0');
      }
    }
  }

  // Bersihkan tanda kutip pembungkus
  str = str.replace(/^['"]+|['"]+$/g, '').trim();
  // Hilangkan desimal excel .0 jika ada
  str = str.replace(/\.0+$/, '');

  // 2. Angka murni 1-4 digit: tambahkan leading zero sampai 4 digit (misal: 54 -> 0054, 113 -> 0113)
  if (/^\d{1,4}$/.test(str)) {
    return str.padStart(4, '0');
  }

  // 3. WSID alfanumerik BCA standar 3-6 karakter (misal: K012, Z001)
  if (/^[A-Za-z0-9]{3,6}$/.test(str)) {
    return str.toUpperCase();
  }

  // Karakter corrupt/tergeser (seperti 1000000000 dari teks komentar hardware)
  return '';
}

/**
 * Resolusi jadwal operasional untuk suatu WSID
 */
export function resolveOperatingSchedule(
  wsid: string,
  customJamMap?: Map<string, { hari: string; jam: string }>,
  masterMap?: Map<string, MasterRow>
): { hari: string; jam: string } {
  const cleanWsidVal = cleanWsid(wsid) || String(wsid || '').trim();
  if (!cleanWsidVal) return { hari: 'MON-SUN', jam: '(00:00 - 23:59)' };

  // 1. Cek dari customJamMap (jika user mengunggah Master Jam Operasional custom)
  if (customJamMap && customJamMap.has(cleanWsidVal)) {
    return customJamMap.get(cleanWsidVal)!;
  }
  if (customJamMap && cleanWsidVal.startsWith('0')) {
    const zWsid = 'Z' + cleanWsidVal.substring(1);
    if (customJamMap.has(zWsid)) return customJamMap.get(zWsid)!;
  }

  // 2. Cek default bundled operating hours (7.577 WSID)
  const defaultHours = (defaultOperatingHoursJson as Record<string, string>)[cleanWsidVal];
  if (defaultHours) {
    const [h, j] = defaultHours.split('|');
    return { hari: h || 'MON-SUN', jam: j || '(00:00 - 23:59)' };
  }
  if (cleanWsidVal.startsWith('0')) {
    const zWsid = 'Z' + cleanWsidVal.substring(1);
    const zDefault = (defaultOperatingHoursJson as Record<string, string>)[zWsid];
    if (zDefault) {
      const [h, j] = zDefault.split('|');
      return { hari: h || 'MON-SUN', jam: j || '(00:00 - 23:59)' };
    }
  }

  // 3. Cek dari Master Data Mesin jika ada
  if (masterMap && masterMap.has(cleanWsidVal)) {
    const m = masterMap.get(cleanWsidVal)!;
    const h = m.Hari || 'MON-SUN';
    const j = m.Jam || m['Jam Operasi'] || '';
    if (j) return { hari: h, jam: String(j) };
  }

  // Default: 24 Jam
  return { hari: 'MON-SUN', jam: '(00:00 - 23:59)' };
}

/**
 * Mem-parsing konten CSV utuh menjadi array of records yang mematuhi RFC 4180:
 * Menangani baris baru (\r, \n) di dalam tanda kutip (seperti detail/komentar multi-baris OASE)
 * sehingga kolom tidak tergeser dan WSID tidak rusak oleh token baris berikutnya.
 */
export function parseCsvIntoRecords(content: string): string[][] {
  const records: string[][] = [];
  let row: string[] = [];
  let cur = '';
  let inQuotes = false;
  const len = content.length;

  for (let i = 0; i < len; i++) {
    const char = content[i];
    if (char === '"') {
      if (inQuotes && content[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      row.push(cur.trim());
      cur = '';
    } else if ((char === '\r' || char === '\n') && !inQuotes) {
      if (char === '\r' && content[i + 1] === '\n') {
        i++;
      }
      row.push(cur.trim());
      cur = '';
      if (row.length > 1 || (row.length === 1 && row[0] !== '')) {
        records.push(row);
      }
      row = [];
    } else {
      cur += char;
    }
  }

  if (cur.length > 0 || row.length > 0) {
    row.push(cur.trim());
    if (row.length > 1 || (row.length === 1 && row[0] !== '')) {
      records.push(row);
    }
  }

  return records;
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
  const currentMonthNum = (new Date()).getMonth() + 1;
  let targetMonthHint = currentMonthNum;

  const fnLower = filename.toLowerCase();
  const monthAbbrs: Record<string, number> = {
    jan: 1, feb: 2, mar: 3, apr: 4, mei: 5, may: 5, jun: 6,
    jul: 7, agu: 8, aug: 8, sep: 9, okt: 10, oct: 10, nov: 11, des: 12, dec: 12
  };
  for (const [abbr, mNum] of Object.entries(monthAbbrs)) {
    if (fnLower.includes(abbr)) {
      targetMonthHint = mNum;
      break;
    }
  }

  // Coba ekstrak timestamp snapshot dari pola nama file OASE yang umum
  // 1. DDMMYYYY_HH-mm-ss / DDMMYYYY_HHmmss (contoh: 13102026_14-00-00.csv)
  const matchFn1 = filename.match(/(\d{2})(\d{2})(\d{4})_(\d{2})[-_:]?(\d{2})[-_:]?(\d{2})/);
  // 2. YYYY-MM-DD_HH-mm-ss / YYYYMMDD_HHmmss (contoh: 2026-10-13_14-00-00.csv)
  const matchFn2 = filename.match(/(\d{4})[-_]?(\d{2})[-_]?(\d{2})[-_T](\d{2})[-_:]?(\d{2})[-_:]?(\d{2})/);
  // 3. DD-MM-YYYY_HH-mm-ss (contoh: 13-10-2026_14-00-00.csv)
  const matchFn3 = filename.match(/(\d{2})[-_](\d{2})[-_](\d{4})[-_](\d{2})[-_:]?(\d{2})[-_:]?(\d{2})/);

  if (matchFn1) {
    const [, d, m, y, hr, min, sec] = matchFn1;
    targetMonthHint = parseInt(m, 10) || currentMonthNum;
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
    targetMonthHint = parseInt(m, 10) || currentMonthNum;
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
    targetMonthHint = parseInt(m, 10) || currentMonthNum;
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
      const cWsid = cleanWsid(m.WSID);
      if (cWsid) {
        masterMap.set(cWsid, m);
      }
    }
  }

  const records = parseCsvIntoRecords(content);
  if (records.length < 2) {
    return {
      rows: [],
      totalRawLines: 0,
      matchedCount: 0,
      reportDateStr: reportDateStr || `${dStr}/${mStr}/${yStr}`,
      reportDefaultEndDate: finalEndDate,
      reportEndStr
    };
  }

  const headerParts = records[0];
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
  const totalLines = records.length;

  for (let i = 1; i < totalLines; i++) {
    const parts = records[i];
    if (!parts || parts.length === 0 || (parts.length === 1 && parts[0] === '')) continue;

    const eventDesc = getCol(parts, 'Event Code Description', 'event code description', 'event_code_description', 'event desc', 'event code desc');
    if (!eventDesc) continue;

    // Tampilkan seluruh problem yang ada (tidak dibatasi 35 problem whitelist)
    const rawWsid = getCol(parts, 'WSID', 'wsid');
    const wsid = cleanWsid(rawWsid);
    if (!wsid) continue; // Abaikan jika WSID kosong / corrupt / tergeser
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
        servicePoint = normalizeServicePoint(spParts[0].trim()) || spParts[0].trim().toUpperCase();
        sektor = cleanSektorName(spParts.slice(1).join(' - '));
      } else if (servicePointSektor.includes('-')) {
        const spParts = servicePointSektor.split('-');
        servicePoint = normalizeServicePoint(spParts[0].trim()) || spParts[0].trim().toUpperCase();
        sektor = cleanSektorName(spParts.slice(1).join('-'));
      } else {
        servicePoint = normalizeServicePoint(servicePointSektor.trim()) || servicePointSektor.trim().toUpperCase();
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
      monthStr: normalizeMonthStr(startTimeStr) || extractMonthStr(dateStr) || `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`
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
  dateDurations?: Record<string, number>;
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
  const seenIncidents = new Set<string>();

  for (const r of rows) {
    const cleanW = cleanWsid(r.wsid);
    if (!cleanW) continue;

    const incId = (r as any).incidentNumber || (r as any).incident_number || (r as any).id;
    const incKey = (incId && incId !== '-')
      ? String(incId)
      : `${cleanW}__${r.eventCodeDesc || ''}__${r.startTime || r.dateStr || ''}`;
    if (seenIncidents.has(incKey)) continue;
    seenIncidents.add(incKey);

    const key = `${cleanW}__${r.eventCodeDesc}`;

    // Normalisasi tanggal agar selalu berformat DD/MM/YYYY (mendukung ISO & legacy)
    let d = r.dateStr;
    if (!d || d === '-' || d === 'N/A') {
      const alt = (r as any).tanggal || r.startTime;
      if (alt && alt !== '-') {
        d = String(alt).trim().split(' ')[0];
      }
    }
    if (d && d.includes('-') && d.split('-')[0].length === 4) {
      const parts = d.split('T')[0].split(' ')[0].split('-');
      if (parts.length === 3) {
        d = `${parts[2].padStart(2, '0')}/${parts[1].padStart(2, '0')}/${parts[0]}`;
      }
    }

    if (d && d !== '-') {
      datesSet.add(d);
    }

    if (!map[key]) {
      map[key] = {
        wsid: cleanW,
        lokasi: r.lokasi,
        servicePointSektor: r.servicePointSektor,
        typeMesin: r.typeMesin,
        vendorMesin: r.vendorMesin,
        eventCodeDesc: r.eventCodeDesc,
        dateCounts: {},
        dateDurations: {},
        totalFrekuensi: 0,
        totalDurasi: 0
      };
    }

    const cur = map[key];
    if (d && d !== '-') {
      cur.dateCounts[d] = (cur.dateCounts[d] || 0) + 1;
      if (!cur.dateDurations) cur.dateDurations = {};
      cur.dateDurations[d] = (cur.dateDurations[d] || 0) + (r.durasi || 0);
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
      const sp = normalizeServicePoint(r.servicePoint || (r.servicePointSektor.includes('-') ? r.servicePointSektor.split('-')[0].trim() : r.servicePointSektor || '-')) || '-';
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
