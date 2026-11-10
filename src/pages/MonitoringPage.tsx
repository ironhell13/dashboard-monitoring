import React, { useState, useEffect, useMemo, useRef, useCallback, useDeferredValue } from 'react';
import * as XLSX from 'xlsx';
import {
  AlertTriangle,
  Clock,
  Search,
  CheckCircle2,
  RefreshCw,
  UploadCloud,
  FileSpreadsheet,
  Download,
  Calendar,
  User,
  CheckSquare,
  Square,
  MessageSquare,
  History,
  ChevronRight,
  ChevronLeft,
  X,
  ChevronDown,
  ChevronUp,
  LogOut,
  SlidersHorizontal,
  Flame,
  RotateCcw,
  ArrowUpDown,
  Zap,
  Check,
  Server,
  Activity,
  Timer,
  Repeat,
  FileText,
  Eye,
  Sliders,
  ShieldCheck,
  BadgeCheck,
  Edit3,
  ExternalLink,
  Plus,
  MapPin,
  Layers,
  Wrench,
  Cpu,
  BarChart3,
  BarChart2,
  TrendingUp,
  Table,
  Filter,
  Send,
  Ticket,
  Inbox,
  AlertOctagon,
  RotateCw,
  ClipboardCheck,
  Trash2
} from 'lucide-react';
import {
  type FollowUpTicketItem,
  saveFollowUpTicketModern,
  fetchFollowUpTicketsModern,
  deleteFollowUpTicketModern,
  formatTicketDuration
} from '../utils/spreadsheetService';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Legend,
  Cell
} from 'recharts';
import {
  getOpenIncidentsApi,
  getIncidentHistoryApi,
  saveIncidentActionApi,
  bulkSaveIncidentActionApi,
  getWsidPenangananHistoryApi,
  searchIncidentsApi,
  uploadIncidentChunkApi,
  getUploadLogApi,
  getDailyIncidentsFromDbApi,
  getFrequencyMatrixApi,
  getFrequencyDetailApi,
  type OpenIncidentItem,
  type IncidentHistoryItem,
  type UploadLogItem
} from '../utils/monitoringService';
import StickyTableWrapper from '../components/StickyTableWrapper';
import {
  parseDailyIncidentCsv,
  exportDailyIncidentsToExcel,
  aggregateByWsidProblemDate,
  calculateOperationalDuration,
  resolveOperatingSchedule,
  parseDateTime,
  resolveDayAndMonth,
  normalizeDateString,
  disambiguateFutureDate,
  TARGET_EVENT_CODES,
  cleanSektorName,
  cleanWsid,
  isDateInRange,
  isEndTimeFilled,
  toComparableDate,
  extractMonthStr,
  normalizeServicePoint,
  resolveServicePoint,
  getServicePointForSektor,
  type DailyIncidentRow,
  type WsidProblemDateAggregation
} from '../utils/dailyIncidentParser';
import {
  loadLocalActions,
  clearMonitoringCache,
  saveFrequencyMatrixCache,
  loadFrequencyMatrixCache
} from '../utils/dbCache';
import { useDataStore } from '../store/useDataStore';
import FollowUpPage from './FollowUpPage';
import { useQuickChips } from '../utils/quickChipsService';
import { isSupabaseConfigured } from '../utils/supabaseClient';
import {
  subscribeActiveIncidentsSupabase,
  mapRowToOpenIncident,
  getMachineMetadata,
  getMachinesMap,
  fetchRecentIncidentsForChronicSupabase,
  fetchDistinctIncidentMonthsSupabase,
  toWibDateTimeString,
  toWibDateOnly,
  toWibTimeOnly,
  type RealtimeIncidentPayload
} from '../utils/supabaseService';
import { useOpenIncidents } from '../hooks/useOpenIncidents';
import { AutoRefreshCountdown } from '../components/AutoRefreshCountdown';
import { DebugPanel } from '../components/DebugPanel';

interface MonitoringPageProps {
  onLogout?: () => void;
  isKaOps?: boolean;
  userRole?: 'KAWIL' | 'KAOPS' | 'MONITORING';
}

export type MonitoringTab = 'OPEN' | 'FREKUENSI' | 'GRAFIK_FREKUENSI' | 'GRAFIK_24JAM' | 'TIKET' | 'HISTORY' | 'UPLOAD';

const LOCAL_STORAGE_PETUGAS = 'MONITORING_PETUGAS_NAME';
const LOCAL_STORAGE_ACTIONS = 'MONITORING_LOCAL_ACTIONS';

/** Quick Action Presets untuk kategori UPDATE (info progres / lapangan) */
export const UPDATE_PRESETS = [
  'Tim OTW Lokasi',
  'Koordinasi Vendor FLM',
  'Menunggu Tim CIT',
  'Konfirmasi Pengelola / Cabang',
  'Monitoring Berkala / Standby'
];

/** Quick Action Presets untuk kategori PENANGANAN (perbaikan nyata pada mesin) */
export const PENANGANAN_PRESETS = [
  'Replenish Ulang',
  'Eskalasi SLM (Part Replacement)',
  'Eskalasi Jaringan / Provider',
  'Cek Kelistrikan / UPS',
  'Reset / Reboot Mesin',
  'Ganti Sensor / Modul',
  'Sudah Penanganan Teknisi',
  'Mesin Sudah Normal / Up Kembali'
];

/** Quick Action Presets gabungan untuk backward compatibility */
export const ACTION_PRESETS = [...UPDATE_PRESETS, ...PENANGANAN_PRESETS];

/**
 * Normalisasi nama Service Point agar seragam dalam pencarian dan filter
 */
export function normSP(val?: string): string {
  if (!val) return '';
  return normalizeServicePoint(val).toLowerCase();
}

/**
 * Cek apakah string menyerupai format tanggal/waktu (bukan teks detail problem seperti "ATM S1G... has been marked DOWN")
 */
export function isDateLikeString(val: any): boolean {
  if (val === null || val === undefined || val === '' || val === '-') return false;
  if (val instanceof Date) return !isNaN(val.getTime());
  if (typeof val === 'number') return (val > 20000 && val < 80000) || (val > 1000000000 && val < 2500000000000);
  const s = String(val).trim();
  if (/^(Uns|Sol|Err|ATM|Warn|Info|Status|Tran|COM|DSP|Reject|Multi|SPV|FLM|SLM):/i.test(s)) return false;
  if (/has been marked|sent a power|error on|warning no|hopper|cassette|balancing|out of|mode switch|notes low|bills not|tran status|paper low|recpt prntr/i.test(s)) {
    return false;
  }
  if (/^\d{1,4}[-/]\d{1,2}[-/]\d{1,4}/.test(s)) return true;
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s)) return true;
  if (s.includes('GMT') || s.includes('Western Indonesia Time')) {
    const d = new Date(s);
    return !isNaN(d.getTime());
  }
  return false;
}

/**
 * Parse string tanggal ke Epoch timestamp untuk sorting kronologis akurat
 */
export function parseToEpoch(dateStr: string, targetMonthHint?: number): number {
  if (!dateStr || dateStr === '-') return 0;
  const s = String(dateStr).trim();
  if (s.includes('Z') || s.includes('+')) {
    const d = new Date(s);
    return isNaN(d.getTime()) ? 0 : d.getTime();
  }
  const m = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/);
  if (m) {
    let p1 = parseInt(m[1], 10);
    let p2 = parseInt(m[2], 10);
    let y = parseInt(m[3], 10);
    if (String(y).length === 2) y += 2000;
    const resolved = resolveDayAndMonth(p1, p2, y, targetMonthHint);
    const h = parseInt(m[4] || '0', 10);
    const min = parseInt(m[5] || '0', 10);
    const sec = parseInt(m[6] || '0', 10);
    return new Date(y, resolved.month - 1, resolved.day, h, min, sec).getTime();
  }
  const dt = new Date(s);
  return isNaN(dt.getTime()) ? 0 : dt.getTime();
}

/**
 * Helper pemformat tanggal/waktu start problem agar seragam "DD/MM/YYYY HH:mm:ss"
 * Memastikan zona waktu selalu WIB (Asia/Jakarta) dan mencegah tanggal masa depan dari swap US.
 */
export function formatStartProblemTime(raw: any, targetMonthHint?: number): string {
  if (raw === null || raw === undefined || raw === '' || raw === '-') return '-';

  // Pastikan bukan teks deskripsi problem
  if (!isDateLikeString(raw)) return '-';

  // 1. Objek Date, Epoch number, atau ISO/GMT timestamp dengan timezone:
  // Selalu konversikan ke waktu Indonesia Barat (WIB / Asia/Jakarta)
  const str = String(raw).trim();
  if (
    raw instanceof Date ||
    typeof raw === 'number' ||
    str.includes('T') ||
    str.includes('Z') ||
    str.includes('+') ||
    str.includes('GMT') ||
    str.includes('Western Indonesia Time')
  ) {
    const wib = toWibDateTimeString(raw);
    if (wib && wib !== '-') return wib;
  }

  // 2. Normalisasi string tanggal dengan proteksi tanggal masa depan (US swap disambiguation)
  return normalizeDateString(str, targetMonthHint);
}

/**
 * Helper untuk mendapatkan Start Problem Time tampilan:
 * Membaca item.startTime terlebih dahulu, jika kosong/'-' otomatis fallback
 * ke rekonstruksi tanggal & jam (item.tanggal/dateStr + item.jam/hourStr)
 */
export function getDisplayStartTime(
  item?: {
    startTime?: string | null;
    tanggal?: string | null;
    jam?: string | null;
    dateStr?: string | null;
    hourStr?: string | null;
    detail?: string | null;
  } | null,
  targetMonthHint?: number
): string {
  if (!item) return '-';
  if (item.startTime && item.startTime !== '-' && isDateLikeString(item.startTime)) {
    const f = formatStartProblemTime(item.startTime, targetMonthHint);
    if (f !== '-') return f;
  }
  const tgl = item.tanggal || item.dateStr;
  const jam = item.jam || item.hourStr;
  if (tgl && tgl !== '-') {
    const cleanJam = (jam && jam !== '-' && jam !== '00:00') ? jam : '00:00:00';
    const combined = `${tgl} ${cleanJam}`;
    const f = formatStartProblemTime(combined, targetMonthHint);
    if (f !== '-') return f;
    return `${tgl} ${jam || '00:00'}`;
  }
  return '-';
}

/**
 * Mendeteksi apakah suatu teks adalah pesan log/error teknis mesin bawaan sistem ATM/CRM
 * (bukan catatan/tindakan manual dari petugas operasional).
 */
export function isTechnicalMachineLog(str: string | undefined | null): boolean {
  if (!str || str === '-' || String(str).trim() === '') return false;
  const s = String(str).trim();
  if (/^(uns|sol|err|atm|crm|warn|info|status|tran|com|dsp|reject|multi|spv|flm|slm):/i.test(s)) return true;
  if (/has been marked|atm\s+|crm\s+|sent a power|error on|warning no|hopper|cassette|balancing|out of|mode switch|notes low|bills not|tran status|paper low|recpt prntr|reject bin|bunch note|card number|bna/i.test(s)) return true;
  return false;
}

/**
 * Helper parsing string tanggal/waktu ke epoch milliseconds untuk perbandingan akurat
 */
export function parseDateTimeToEpoch(str?: string | null): number {
  if (!str || str === '-' || String(str).trim() === '') return 0;
  const s = String(str).trim();
  const isoM = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})[T\s]+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?/);
  if (isoM) {
    return new Date(
      parseInt(isoM[1], 10),
      parseInt(isoM[2], 10) - 1,
      parseInt(isoM[3], 10),
      parseInt(isoM[4], 10),
      parseInt(isoM[5], 10),
      isoM[6] ? parseInt(isoM[6], 10) : 0
    ).getTime();
  }
  const ukM = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})[T\s]+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?/);
  if (ukM) {
    let y = parseInt(ukM[3], 10);
    if (y < 100) y += 2000;
    return new Date(
      y,
      parseInt(ukM[2], 10) - 1,
      parseInt(ukM[1], 10),
      parseInt(ukM[4], 10),
      parseInt(ukM[5], 10),
      ukM[6] ? parseInt(ukM[6], 10) : 0
    ).getTime();
  }
  const timeM = s.match(/^(\d{1,2})[:.](\d{1,2})(?:[:.](\d{1,2}))?(?:\s*WIB)?$/i);
  if (timeM) {
    const now = new Date();
    return new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      parseInt(timeM[1], 10),
      parseInt(timeM[2], 10),
      timeM[3] ? parseInt(timeM[3], 10) : 0
    ).getTime();
  }
  const parsed = new Date(s).getTime();
  return isNaN(parsed) ? 0 : parsed;
}

/**
 * Pengaya data Open Incident dari dataset allDailyIncidents:
 * Memastikan kolom Start Problem dan Detail di table Problem Open mendapatkan
 * timestamp presisi yang sama persis seperti pada table Riwayat (History).
 */
export function enrichOpenWithDailyData(
  openItems: OpenIncidentItem[],
  dailyRows: DailyIncidentRow[]
): OpenIncidentItem[] {
  // 1. Filter awal: Hanya ambil item yang benar-benar belum memiliki End Time valid
  const currentlyOpen = (openItems || []).filter((it) => !isEndTimeFilled(it.endTime));

  if (!dailyRows || dailyRows.length === 0) {
    return currentlyOpen.map((it) => ({
      ...it,
      startTime: formatStartProblemTime(it.startTime) !== '-' ? formatStartProblemTime(it.startTime) : getDisplayStartTime(it),
      detail: (!it.detail || it.detail === '-' || isDateLikeString(it.detail)) ? '-' : it.detail,
      status: 'OPEN'
    }));
  }

  // Pre-filter cepat: Kumpulkan WSID & Incident Number yang relevan dari item open aktif
  // Sehingga dari puluhan ribu baris dailyRows, hanya baris yang relevan yang diproses
  const relevantWsids = new Set<string>();
  const relevantIncNums = new Set<string>();
  for (let i = 0; i < currentlyOpen.length; i++) {
    const it = currentlyOpen[i];
    if (it.wsid) relevantWsids.add(it.wsid.toUpperCase());
    if (it.incidentNumber && it.incidentNumber !== '-') relevantIncNums.add(it.incidentNumber);
  }

  // Bangun lookup map dari dailyRows (hanya untuk mesin yang relevan)
  const dailyByIncNum = new Map<string, DailyIncidentRow>();
  const dailyByKey = new Map<string, DailyIncidentRow>();
  const dailyByWsidEv = new Map<string, DailyIncidentRow>();
  const closedInDaily = new Set<string>();

  for (let i = 0; i < dailyRows.length; i++) {
    const d = dailyRows[i];
    const wsidUpper = (d.wsid || '').toUpperCase();
    const incNum = (d.incidentNumber && d.incidentNumber !== '-') ? d.incidentNumber : undefined;

    // Lewati langsung baris yang mesinnya tidak ada di open list aktif (skip 99% iterasi berat)
    if (!relevantWsids.has(wsidUpper) && (!incNum || !relevantIncNums.has(incNum))) {
      continue;
    }

    const isClosed = isEndTimeFilled(d.endTime);
    const sT = formatStartProblemTime(d.startTime);
    const dP = (d.dateStr && d.dateStr !== '-') ? d.dateStr : sT.split(' ')[0];

    if (isClosed) {
      if (incNum) closedInDaily.add(incNum);
      closedInDaily.add(`${d.wsid}|${d.eventCodeDesc}|${sT}`.toUpperCase());
      closedInDaily.add(`${d.wsid}|${d.eventCodeDesc}|${dP}`.toUpperCase());
    } else {
      if (incNum) dailyByIncNum.set(incNum, d);
      const key = incNum || `${d.wsid}|${d.eventCodeDesc}|${sT}`;
      dailyByKey.set(key, d);
      dailyByWsidEv.set(`${d.wsid}|${d.eventCodeDesc}|${dP}`.toUpperCase(), d);
    }
  }

  // KASUS A: Jika openItems sudah ada (misal dari server getOpenIncidents / cleanIncidents)
  // openItems adalah Single Source of Truth insiden OPEN!
  // Kita HANYA memperkaya item-item yang ADA di openItems, tanpa membangkitkan row yang sudah dihapus!
  if (currentlyOpen.length > 0) {
    const result: OpenIncidentItem[] = [];
    const processedKeys = new Set<string>();

    for (const item of currentlyOpen) {
      const dPart = (item.tanggal && item.tanggal !== '-') ? item.tanggal : (item.startTime || '').split(' ')[0];
      const itemKey1 = (item.incidentNumber && item.incidentNumber !== '-') ? item.incidentNumber : '';
      const itemKey2 = `${item.wsid}|${item.eventCodeDesc}|${item.startTime}`.toUpperCase();
      const itemKey3 = `${item.wsid}|${item.eventCodeDesc}|${dPart}`.toUpperCase();

      // Cek apakah item ini sudah closed di database dailyRows
      if ((itemKey1 && closedInDaily.has(itemKey1)) || closedInDaily.has(itemKey2) || closedInDaily.has(itemKey3)) {
        continue; // Drop: sudah selesai / CLOSED di database
      }

      const matchKey = item.incidentKey || itemKey1 || itemKey2;
      if (processedKeys.has(matchKey)) continue;

      // Cari enrichment data dari dailyRows jika tersedia
      const d = (itemKey1 ? dailyByIncNum.get(itemKey1) : undefined) ||
        (item.incidentKey ? dailyByKey.get(item.incidentKey) : undefined) ||
        dailyByWsidEv.get(itemKey3);

      if (d) {
        const sTime = formatStartProblemTime(d.startTime) !== '-' ? formatStartProblemTime(d.startTime) : (formatStartProblemTime(item.startTime) !== '-' ? formatStartProblemTime(item.startTime) : getDisplayStartTime(item));
        const dText = (!d.detail || d.detail === '-' || isDateLikeString(d.detail)) ? item.detail : d.detail;

        const dHasAct = Boolean(d.actionTerakhir && d.actionTerakhir !== '-' && !isTechnicalMachineLog(d.actionTerakhir));
        const exHasAct = Boolean(item.actionTerakhir && item.actionTerakhir !== '-' && !isTechnicalMachineLog(item.actionTerakhir));
        const dEpoch = dHasAct ? parseDateTimeToEpoch(d.actionTerakhirWaktu) : 0;
        const exEpoch = exHasAct ? parseDateTimeToEpoch(item.actionTerakhirWaktu) : 0;

        let finalAction = item.actionTerakhir || '-';
        let finalActionOleh = item.actionTerakhirOleh || '-';
        let finalActionWaktu = item.actionTerakhirWaktu || '-';
        let finalJmlAction = item.jumlahAction || 0;

        if (dHasAct && exHasAct) {
          if (dEpoch >= exEpoch) {
            finalAction = d.actionTerakhir;
            finalActionOleh = (d.actionTerakhirOleh && d.actionTerakhirOleh !== '-' && d.actionTerakhirOleh !== 'CSV' && d.actionTerakhirOleh !== 'CSV Comment') ? d.actionTerakhirOleh : 'Petugas';
            finalActionWaktu = d.actionTerakhirWaktu && d.actionTerakhirWaktu !== '-' ? d.actionTerakhirWaktu : '-';
            finalJmlAction = Math.max(d.jumlahAction || 0, item.jumlahAction || 0, 1);
          }
        } else if (dHasAct) {
          finalAction = d.actionTerakhir;
          finalActionOleh = (d.actionTerakhirOleh && d.actionTerakhirOleh !== '-' && d.actionTerakhirOleh !== 'CSV' && d.actionTerakhirOleh !== 'CSV Comment') ? d.actionTerakhirOleh : 'Petugas';
          finalActionWaktu = d.actionTerakhirWaktu && d.actionTerakhirWaktu !== '-' ? d.actionTerakhirWaktu : '-';
          finalJmlAction = d.jumlahAction || 1;
        }

        result.push({
          ...item,
          detail: dText,
          startTime: sTime,
          durasiOpr: (typeof d.durasi === 'number' && d.durasi >= 0) ? d.durasi : (item.durasiOpr || 0),
          actionTerakhir: finalAction,
          actionTerakhirOleh: finalActionOleh,
          actionTerakhirWaktu: finalActionWaktu,
          jumlahAction: finalJmlAction,
          status: 'OPEN'
        });
      } else {
        result.push({
          ...item,
          status: 'OPEN'
        });
      }
      processedKeys.add(matchKey);
    }

    result.sort((a, b) => {
      const epochA = parseDateTimeToEpoch(a.startTime);
      const epochB = parseDateTimeToEpoch(b.startTime);
      return epochB - epochA;
    });

    return result;
  }

  // KASUS B: Jika openItems kosong, kembalikan array kosong (Supabase adalah Single Source of Truth, tidak membangkitkan data lama)
  return [];
}

/** Format durasi menit ke format manusiawi ringkas e.g. "1j 42m" atau "48m" */
export function formatDurationHuman(minutes: number): string {
  if (minutes < 0 || isNaN(minutes)) return '0m';
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}j ${m}m` : `${h}j`;
}

/** Helper parsing tanggal mendukung format DD/MM/YYYY, DD-MM-YYYY, YYYY-MM-DD, YYYY/MM/DD */
export function parseIncidentDateStr(dateStr: string): { day: number; month: number; year: number } | null {
  if (!dateStr || dateStr === '-') return null;
  const clean = dateStr.trim().split(' ')[0];
  const sep = clean.includes('-') ? '-' : clean.includes('/') ? '/' : '';
  if (!sep) return null;
  const parts = clean.split(sep);
  if (parts.length === 3) {
    if (parts[0].length === 4) {
      // YYYY-MM-DD or YYYY/MM/DD
      const year = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10);
      const day = parseInt(parts[2], 10);
      if (!isNaN(day) && !isNaN(month) && !isNaN(year)) return { day, month, year };
    } else {
      // DD-MM-YYYY or MM-DD-YYYY
      const day = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10);
      const year = parseInt(parts[2], 10);
      if (!isNaN(day) && !isNaN(month) && !isNaN(year)) {
        const resolved = resolveDayAndMonth(day, month, year);
        return { day: resolved.day, month: resolved.month, year };
      }
    }
  }
  return null;
}

/** Standarisasi tampilan string tanggal menjadi DD/MM/YYYY */
export function normalizeDateStr(dateStr: string): string {
  const p = parseIncidentDateStr(dateStr);
  if (!p) return dateStr || '-';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(p.day)}/${pad(p.month)}/${p.year}`;
}

/** Helper konversi tanggal ke epoch day untuk rentang hari */
export function parseDateStrToEpochDay(dateStr: string): number | null {
  if (!dateStr || dateStr === '-') return null;
  const p = parseIncidentDateStr(dateStr);
  if (!p) return null;
  return Math.floor(Date.UTC(p.year, p.month - 1, p.day) / 86400000);
}

/**
 * Normalisasi kode dan deskripsi problem untuk pencocokan seragam
 * Menjamin "Card Reader Faults", "P02 - Card Reader Faults", "P02" dicocokkan sebagai problem yang sama
 */
export function getProblemCanonicalKey(desc?: string, code?: string): string {
  const c = (code || '').trim().toUpperCase();
  const d = (desc || '').trim().toUpperCase();
  if (c && c !== '-' && c.length <= 10) return c;
  if (d.includes(' - ')) {
    const parts = d.split(' - ');
    if (parts[0].trim().length <= 6) return parts[1].trim();
  }
  if (d.includes(' · ')) {
    const parts = d.split(' · ');
    if (parts[0].trim().length <= 6) return parts[1].trim();
  }
  return d || '-';
}

export function renderAuthorBadge(author?: string) {
  if (!author || author === '-' || author === 'CSV' || author === 'CSV Comment') return null;
  const isWil = author.includes('Ka Wil') || author.startsWith('[Ka Wil]');
  const isOps = author.includes('Ka Ops') || author.startsWith('[Ka Ops]');
  const isMon = author.includes('Monitoring') || author.startsWith('[Monitoring]');

  if (isWil) {
    return (
      <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200/80 uppercase tracking-wide shrink-0">
        Ka Wil
      </span>
    );
  }
  if (isOps) {
    return (
      <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-teal-50 text-blue-600 border border-teal-200/80 uppercase tracking-wide shrink-0">
        Ka Ops
      </span>
    );
  }
  if (isMon) {
    return (
      <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-slate-100 text-slate-700 border border-slate-200 uppercase tracking-wide shrink-0">
        Monitoring
      </span>
    );
  }
  return null;
}

export function cleanAuthorName(author?: string): string {
  if (!author || author === '-' || author === 'CSV' || author === 'CSV Comment') return 'Petugas';
  return author
    .replace(/^\[Ka Wil\]\s*/i, '')
    .replace(/^\[Ka Ops\]\s*/i, '')
    .replace(/^\[Monitoring\]\s*/i, '')
    .trim() || author;
}

/**
 * Render cell End Time dengan pembeda visual yang jelas antara:
 * 1. OPEN (badge merah berkedip)
 * 2. Closed by DASHBOARD (Auto-Close via snapshot rekonsiliasi OASE: teks bronze/amber + badge "Auto-Close DB")
 * 3. Closed by OASE (Waktu selesai resmi dari file OASE: teks navy/slate + badge "OASE")
 */
export function renderIncidentEndTime(row: {
  endTime?: string | null;
  status?: string | null;
  closeSource?: 'OASE' | 'DASHBOARD' | '-' | string;
  actionTerakhirOleh?: string | null;
  actionTerakhir?: string | null;
}) {
  const isClosed = isEndTimeFilled(row.endTime);
  if (!isClosed) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#FFDAD6] text-[#BA1A1A]">
        <span className="w-1.5 h-1.5 rounded-full bg-[#BA1A1A] animate-pulse"></span>
        <span>OPEN</span>
      </span>
    );
  }

  const isByDashboard =
    row.closeSource === 'DASHBOARD' ||
    row.actionTerakhirOleh === 'Sistem Dashboard' ||
    (typeof row.actionTerakhir === 'string' && row.actionTerakhir.includes('[AUTO-CLOSE]'));

  const formattedEnd = formatStartProblemTime(row.endTime);

  if (isByDashboard) {
    return (
      <div
        className="inline-flex flex-col items-start gap-0.5"
        title="Auto-Close oleh Sistem Dashboard: Problem sudah tidak muncul di snapshot laporan OASE terbaru"
      >
        <span className="font-mono text-[11px] font-semibold text-amber-900">
          {formattedEnd}
        </span>
        <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded text-[9px] font-bold bg-amber-50 text-amber-800 border border-amber-300">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
          <span>Auto-Close DB</span>
        </span>
      </div>
    );
  }

  return (
    <div
      className="inline-flex flex-col items-start gap-0.5"
      title="Closed via OASE: Waktu selesai tercatat resmi dari sistem OASE"
    >
      <span className="font-mono text-[11px] font-medium text-[#0D1C2E]">
        {formattedEnd}
      </span>
      <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded text-[9px] font-medium bg-slate-100 text-slate-600 border border-slate-200">
        <span>OASE</span>
      </span>
    </div>
  );
}

export default function MonitoringPage({ onLogout, isKaOps = false, userRole }: MonitoringPageProps) {
  const { rawMasterData, machines, modernTickets, setModernTickets, addOrUpdateModernTicket, removeModernTicket } = useDataStore();

  const masterList = useMemo(() => {
    if (rawMasterData && rawMasterData.length > 0) return rawMasterData;
    if (machines && machines.length > 0) return machines;
    return [];
  }, [rawMasterData, machines]);

  const effectiveRole: 'KAWIL' | 'KAOPS' | 'MONITORING' = useMemo(() => {
    if (userRole) return userRole;
    try {
      const saved = sessionStorage.getItem('USER_ROLE');
      if (saved === 'KAWIL' || saved === 'KAOPS' || saved === 'MONITORING') return saved;
    } catch (e) { }
    return isKaOps ? 'KAOPS' : 'MONITORING';
  }, [userRole, isKaOps]);

  // Ka Wil dan Ka Ops memiliki kapabilitas supervisi & tindak lanjut
  const isSupervisorRole = isKaOps || effectiveRole === 'KAWIL' || effectiveRole === 'KAOPS';

  // Dynamic Quick Chips yang dikelola dari Menu Setting (Super Admin)
  const { chipTexts: dynamicUpdateChips } = useQuickChips('UPDATE');
  const { chipTexts: dynamicPenangananChips } = useQuickChips('PENANGANAN');
  const activeUpdateChips = dynamicUpdateChips.length > 0 ? dynamicUpdateChips : UPDATE_PRESETS;
  const activePenangananChips = dynamicPenangananChips.length > 0 ? dynamicPenangananChips : PENANGANAN_PRESETS;

  // =========================================================================
  // ALL STATE & REF HOOKS DECLARED AT THE VERY TOP (ZERO TDZ GUARANTEED)
  // =========================================================================

  // 1. Navigation Tab State
  const [activeTab, setActiveTab] = useState<MonitoringTab>('OPEN');

  // 2. Shared State: Petugas, Duty Modal, Live Countdown & Dataset
  const [petugasName, setPetugasName] = useState(() => {
    try {
      const saved = localStorage.getItem(LOCAL_STORAGE_PETUGAS);
      if (saved) return saved;
    } catch (e) { }
    if (effectiveRole === 'KAWIL') return 'Ka Wil';
    if (effectiveRole === 'KAOPS') return 'Ka Ops';
    return '';
  });

  const formatPetugasSignature = useCallback((rawName: string): string => {
    const trimmed = rawName.trim();
    if (effectiveRole === 'KAWIL') {
      if (!trimmed || trimmed.toLowerCase() === 'ka wil') return 'Ka Wil';
      return trimmed.startsWith('[Ka Wil]') ? trimmed : `[Ka Wil] ${trimmed}`;
    }
    if (effectiveRole === 'KAOPS') {
      if (!trimmed || trimmed.toLowerCase() === 'ka ops') return 'Ka Ops';
      return trimmed.startsWith('[Ka Ops]') ? trimmed : `[Ka Ops] ${trimmed}`;
    }
    if (!trimmed) return 'Petugas';
    return trimmed.startsWith('[Monitoring]') ? trimmed : `[Monitoring] ${trimmed}`;
  }, [effectiveRole]);
  const [petugasInputHighlight, setPetugasInputHighlight] = useState(false);
  const petugasInputRef = useRef<HTMLInputElement>(null);
  const [isDutyModalOpen, setIsDutyModalOpen] = useState(false);
  const [dutyOperatorInput, setDutyOperatorInput] = useState('');
  const [isSimulasiAman, setIsSimulasiAman] = useState(false);
  const [currentLiveTime, setCurrentLiveTime] = useState<Date>(() => new Date());

  const [allDailyIncidents, setAllDailyIncidents] = useState<DailyIncidentRow[]>([]);
  const [chronicDataset, setChronicDataset] = useState<DailyIncidentRow[]>([]);
  const [isLoadingChronic, setIsLoadingChronic] = useState<boolean>(false);

  const [syncStatusBanner, setSyncStatusBanner] = useState<{
    type: 'syncing' | 'success' | 'error';
    text: string;
  } | null>(null);

  // 3. Tab 1: Problem Open State via Hook useOpenIncidents (Single Source of Truth: Supabase Cloud DB)
  const {
    openIncidents,
    setOpenIncidents,
    isLoading: isLoadingOpen,
    connectionStatus,
    lastSyncedAt,
    refetch: fetchOpenIncidents
  } = useOpenIncidents();

  const isFetchingChronicRef = useRef(false);
  // Penarik dataset insiden beberapa hari terakhir secara kilat (<500ms) untuk kalkulasi Chronic instan
  const fetchChronicDataset = useCallback(async () => {
    if (isFetchingChronicRef.current) return;
    isFetchingChronicRef.current = true;
    setIsLoadingChronic(true);
    try {
      let attempts = 0;
      let success = false;
      while (attempts < 3 && !success) {
        attempts++;
        try {
          let res = await fetchRecentIncidentsForChronicSupabase(14);
          // Fallback ganda: jika res.rows masih kosong, gunakan API getDailyIncidentsFromDbApi (limit 3000)
          if (!res.success || !res.rows || res.rows.length === 0) {
            const dbRes = await getDailyIncidentsFromDbApi({ limit: 3000 });
            if (dbRes && dbRes.success && dbRes.rows && dbRes.rows.length > 0) {
              res = { success: true, rows: dbRes.rows };
            }
          }

          if (res.success && res.rows && res.rows.length > 0) {
            setChronicDataset(res.rows);
            setAllDailyIncidents((prev) => (prev.length === 0 ? res.rows : prev));
            setOpenIncidents((prev) => {
              if (!prev || prev.length === 0) return prev;
              return enrichOpenWithDailyData(prev, res.rows);
            });
            success = true;
            break;
          }
        } catch (attemptErr) {
          console.warn(`[CHRONIC-DEBUG] fetchChronicDataset percobaan ${attempts} gagal:`, attemptErr);
        }

        if (!success && attempts < 3) {
          await new Promise((resolve) => setTimeout(resolve, 1500));
        }
      }
    } catch (err) {
      console.warn('Gagal memuat dataset chronic cepat:', err);
    } finally {
      setIsLoadingChronic(false);
      isFetchingChronicRef.current = false;
    }
  }, [setOpenIncidents]);
  const [openCardFilter, setOpenCardFilter] = useState<
    'ALL' | 'OVER_60' | 'OVER_180' | 'CHRONIC' | 'CHRONIC_3X_SEHARI' | 'CHRONIC_3X_5HARI' | 'NO_ACTION'
  >('ALL');
  const [openSearch, setOpenSearch] = useState('');
  const [selectedEventCodesOpen, setSelectedEventCodesOpen] = useState<string[]>([]);
  const [isEventCodeDropdownOpenOpen, setIsEventCodeDropdownOpenOpen] = useState(false);
  const [eventCodeSearchOpen, setEventCodeSearchOpen] = useState('');
  const eventCodeDropdownRefOpen = useRef<HTMLDivElement>(null);
  const [selectedOpenSPs, setSelectedOpenSPs] = useState<string[]>([]);
  const [isSpDropdownOpenOpen, setIsSpDropdownOpenOpen] = useState(false);
  const [spSearchOpen, setSpSearchOpen] = useState('');
  const spDropdownRefOpen = useRef<HTMLDivElement>(null);

  const [selectedOpenSektors, setSelectedOpenSektors] = useState<string[]>([]);
  const [isSektorDropdownOpenOpen, setIsSektorDropdownOpenOpen] = useState(false);
  const [sektorSearchOpen, setSektorSearchOpen] = useState('');
  const sektorDropdownRefOpen = useRef<HTMLDivElement>(null);

  const [selectedOpenVendors, setSelectedOpenVendors] = useState<string[]>([]);
  const [isVendorDropdownOpenOpen, setIsVendorDropdownOpenOpen] = useState(false);
  const [vendorSearchOpen, setVendorSearchOpen] = useState('');
  const vendorDropdownRefOpen = useRef<HTMLDivElement>(null);

  const [selectedOpenTipes, setSelectedOpenTipes] = useState<string[]>([]);
  const [isTipeDropdownOpenOpen, setIsTipeDropdownOpenOpen] = useState(false);
  const tipeDropdownRefOpen = useRef<HTMLDivElement>(null);
  const [openStartDate, setOpenStartDate] = useState<string>('ALL');
  const [openEndDate, setOpenEndDate] = useState<string>('ALL');
  const openStartDateInputRef = useRef<HTMLInputElement>(null);
  const openEndDateInputRef = useRef<HTMLInputElement>(null);
  const [openDurationFilter, setOpenDurationFilter] = useState<'ALL' | 'OVER_45' | 'OVER_60' | 'OVER_180'>('ALL');
  const [openActionFilter, setOpenActionFilter] = useState<'ALL' | 'NO_ACTION' | 'HAS_ACTION'>('ALL');
  const [openChronicFilter, setOpenChronicFilter] = useState<'ALL' | 'CHRONIC_ANY' | '3X_SEHARI' | '3X_5_HARI'>('ALL');
  const [openSortBy, setOpenSortBy] = useState<'DURASI_DESC' | 'DURASI_ASC' | 'WSID_ASC' | 'TIME_DESC'>('DURASI_DESC');
  const [openSortColumn, setOpenSortColumn] = useState<
    'wsid' | 'typeMesin' | 'eventCodeDesc' | 'startTime' | 'durasiOpr' | 'chronic' | 'actionTerakhir'
  >('durasiOpr');
  const [openSortDirection, setOpenSortDirection] = useState<'asc' | 'desc'>('desc');
  const [selectedIncidentKeys, setSelectedIncidentKeys] = useState<Set<string>>(new Set());

  // Slide-over Drawer for Single Machine Update
  const [activeIncidentDetail, setActiveIncidentDetail] = useState<OpenIncidentItem | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [incidentHistory, setIncidentHistory] = useState<IncidentHistoryItem[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [singleActionText, setSingleActionText] = useState('');
  const [actionSaveSuccess, setActionSaveSuccess] = useState(false);

  // Action Category state (UPDATE vs PENANGANAN)
  const [actionCategory, setActionCategory] = useState<'UPDATE' | 'PENANGANAN'>('UPDATE');
  const [bulkActionCategory, setBulkActionCategory] = useState<'UPDATE' | 'PENANGANAN'>('UPDATE');

  // Detail Penanganan Modal state (from Frekuensi Tab)
  const [selectedFreqItemForDetail, setSelectedFreqItemForDetail] = useState<WsidProblemDateAggregation | null>(null);
  const [freqDetailDateFilter, setFreqDetailDateFilter] = useState<string>('ALL');
  const [freqDetailOnlyWithNotes, setFreqDetailOnlyWithNotes] = useState<boolean>(true);
  const [freqDetailHistory, setFreqDetailHistory] = useState<IncidentHistoryItem[]>([]);
  const [isLoadingFreqDetail, setIsLoadingFreqDetail] = useState<boolean>(false);
  const [showAddPenangananInModal, setShowAddPenangananInModal] = useState<boolean>(false);
  const [modalPenangananCategory, setModalPenangananCategory] = useState<'UPDATE' | 'PENANGANAN'>('PENANGANAN');
  const [modalPenangananText, setModalPenangananText] = useState<string>('');
  const [modalPenangananDate, setModalPenangananDate] = useState<string>('');
  const [isSavingModalPenanganan, setIsSavingModalPenanganan] = useState<boolean>(false);

  // Pagination for Problem Open
  const [currentPageOpen, setCurrentPageOpen] = useState(1);
  const [pageSizeOpen, setPageSizeOpen] = useState(15);

  // Bulk Action Modal
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [bulkActionText, setBulkActionText] = useState('');
  const [isSavingBulk, setIsSavingBulk] = useState(false);

  // Upload CSV Modal (accessible from top header & tab)
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);

  // 4. Tab 2: Frekuensi per Tanggal State
  const getCurrentWibMonth = () => {
    const now = new Date();
    const wib = new Date(now.getTime() + 7 * 3600 * 1000);
    const y = wib.getUTCFullYear();
    const m = String(wib.getUTCMonth() + 1).padStart(2, '0');
    return `${y}-${m}`;
  };

  const [freqMonth, setFreqMonth] = useState<string>(() => getCurrentWibMonth());
  const [freqMatrix, setFreqMatrix] = useState<WsidProblemDateAggregation[]>([]);
  const [freqDates, setFreqDates] = useState<string[]>([]);
  const [isLoadingFreq, setIsLoadingFreq] = useState(false);
  const [freqError, setFreqError] = useState<string | null>(null);
  const [freqSuccessMsg, setFreqSuccessMsg] = useState<string | null>(null);
  const [availableFreqMonths, setAvailableFreqMonths] = useState<string[]>([]);
  const [freqDetailIncidents, setFreqDetailIncidents] = useState<DailyIncidentRow[]>([]);
  const [freqSearch, setFreqSearch] = useState('');
  const [selectedEventCodesFreq, setSelectedEventCodesFreq] = useState<string[]>([]);
  const [isEventCodeDropdownOpenFreq, setIsEventCodeDropdownOpenFreq] = useState(false);
  const [eventCodeSearchFreq, setEventCodeSearchFreq] = useState('');
  const eventCodeDropdownRefFreq = useRef<HTMLDivElement>(null);
  const [freqServicePoint, setFreqServicePoint] = useState('ALL');
  const [freqDateFilter, setFreqDateFilter] = useState('ALL');
  const [freqStartDate, setFreqStartDate] = useState('ALL');
  const [freqEndDate, setFreqEndDate] = useState('ALL');
  const freqStartDateInputRef = useRef<HTMLInputElement>(null);
  const freqEndDateInputRef = useRef<HTMLInputElement>(null);
  const [sortFieldFreq, setSortFieldFreq] = useState<string>('totalFrekuensi');
  const [sortDirectionFreq, setSortDirectionFreq] = useState<'asc' | 'desc'>('desc');
  const [currentPageFreq, setCurrentPageFreq] = useState(1);
  const [pageSizeFreq, setPageSizeFreq] = useState(50);

  const tabFreqTableContainerRef = useRef<HTMLDivElement>(null);
  const floatingScrollbarRefFreq = useRef<HTMLDivElement>(null);
  const isSyncingScrollFreqRef = useRef(false);
  const [showFloatingScrollbarFreq, setShowFloatingScrollbarFreq] = useState(false);
  const [tabFreqScrollWidth, setTabFreqScrollWidth] = useState(0);
  const [floatingBarLeftFreq, setFloatingBarLeftFreq] = useState(0);
  const [floatingBarWidthFreq, setFloatingBarWidthFreq] = useState(0);

  // 5. Tab 3: History Problem State
  const [historyMonth, setHistoryMonth] = useState('ALL');
  const [historyStartDate, setHistoryStartDate] = useState('');
  const [historyEndDate, setHistoryEndDate] = useState('');
  const historyStartDateInputRef = useRef<HTMLInputElement>(null);
  const historyEndDateInputRef = useRef<HTMLInputElement>(null);
  const [historyStatus, setHistoryStatus] = useState('ALL');
  const [historyQuery, setHistoryQuery] = useState('');
  const [historyEventCode, setHistoryEventCode] = useState('ALL');
  const [selectedEventCodesHistory, setSelectedEventCodesHistory] = useState<string[]>([]);
  const [isEventCodeDropdownOpenHistory, setIsEventCodeDropdownOpenHistory] = useState(false);
  const [eventCodeSearchHistory, setEventCodeSearchHistory] = useState('');
  const eventCodeDropdownRefHistory = useRef<HTMLDivElement>(null);
  const [historyResults, setHistoryResults] = useState<OpenIncidentItem[]>([]);
  const [isLoadingSearchHistory, setIsLoadingSearchHistory] = useState(false);
  const [isLoadingDailyFromDb, setIsLoadingDailyFromDb] = useState(false);
  const [currentPageHistory, setCurrentPageHistory] = useState(1);
  const [pageSizeHistory, setPageSizeHistory] = useState(25);
  const [historySortColumn, setHistorySortColumn] = useState<
    'wsid' | 'typeMesin' | 'eventCodeDesc' | 'startTime' | 'endTime' | 'durasiOpr' | 'chronic' | 'actionTerakhir'
  >('startTime');
  const [historySortDirection, setHistorySortDirection] = useState<'asc' | 'desc'>('desc');
  const historyCacheRef = useRef<Record<string, OpenIncidentItem[]>>({});
  const allDailyIncidentsRef = useRef<DailyIncidentRow[]>([]);
  allDailyIncidentsRef.current = allDailyIncidents;
  const openIncidentsRef = useRef<OpenIncidentItem[]>([]);
  openIncidentsRef.current = openIncidents;
  const historyResultsRef = useRef<OpenIncidentItem[]>([]);
  historyResultsRef.current = historyResults;
  const evaluateChronicRef = useRef<((inc: any) => any) | null>(null);

  // 5b. Tab: Grafik Frekuensi Problem 24 Jam State
  const [grafik24Sp, setGrafik24Sp] = useState<string>('ALL');
  const [grafik24Sektor, setGrafik24Sektor] = useState<string>('ALL');
  const [grafik24SektorSearch, setGrafik24SektorSearch] = useState<string>('');
  const [isGrafik24SektorOpen, setIsGrafik24SektorOpen] = useState<boolean>(false);
  const grafik24SektorRef = useRef<HTMLDivElement>(null);

  const [grafik24Problem, setGrafik24Problem] = useState<string>('ALL');
  const [grafik24ProblemSearch, setGrafik24ProblemSearch] = useState<string>('');
  const [isGrafik24ProblemOpen, setIsGrafik24ProblemOpen] = useState<boolean>(false);
  const grafik24ProblemRef = useRef<HTMLDivElement>(null);

  const [grafik24Date, setGrafik24Date] = useState<string>('ALL');
  const [grafik24StartDate, setGrafik24StartDate] = useState<string>('ALL');
  const [grafik24EndDate, setGrafik24EndDate] = useState<string>('ALL');
  const grafik24StartDateInputRef = useRef<HTMLInputElement>(null);
  const grafik24EndDateInputRef = useRef<HTMLInputElement>(null);
  const [grafik24Search, setGrafik24Search] = useState<string>('');
  const [selectedHour24, setSelectedHour24] = useState<number | null>(null);
  const [grafik24CurrentPage, setGrafik24CurrentPage] = useState<number>(1);
  const [grafik24PageSize, setGrafik24PageSize] = useState<number>(20);
  const [hoveredHour24, setHoveredHour24] = useState<number | null>(null);

  // 5c. Dropdown Frekuensi & Tab: Grafik Frekuensi State
  const [isFrekuensiMenuOpen, setIsFrekuensiMenuOpen] = useState(false);
  const frekuensiMenuRef = useRef<HTMLDivElement>(null);

  const [gfMode, setGfMode] = useState<'SINGLE' | 'RANGE'>('SINGLE');
  const [gfSingleMonth, setGfSingleMonth] = useState('2026-10');
  const [gfStartMonth, setGfStartMonth] = useState('2026-08');
  const [gfEndMonth, setGfEndMonth] = useState('2026-10');
  const [gfSelectedProblems, setGfSelectedProblems] = useState<string[]>([]);
  const [isGfProblemOpen, setIsGfProblemOpen] = useState(false);
  const [gfProblemSearch, setGfProblemSearch] = useState('');
  const gfProblemRef = useRef<HTMLDivElement>(null);
  const gfMonthCacheRef = useRef<Record<string, { rows: DailyIncidentRow[]; availableMonths?: string[] }>>({});
  const [gfServicePoint, setGfServicePoint] = useState('ALL');
  const [gfWsidSearch, setGfWsidSearch] = useState('');
  const [gfChartType, setGfChartType] = useState<'area' | 'bar' | 'line'>('area');
  const [gfTrendGrouping, setGfTrendGrouping] = useState<'daily' | 'monthly'>('daily');
  const [gfCumulative, setGfCumulative] = useState(false);
  const [gfTablePage, setGfTablePage] = useState(1);
  const [gfTablePageSize, setGfTablePageSize] = useState(15);
  const [gfMultiMonthRows, setGfMultiMonthRows] = useState<DailyIncidentRow[]>([]);
  const [isLoadingGfData, setIsLoadingGfData] = useState(false);
  const [gfAvailableMonths, setGfAvailableMonths] = useState<string[]>([
    '2026-10', '2026-09', '2026-08', '2026-07', '2026-06', '2026-05'
  ]);

  // 6. Tab 4: Upload CSV State
  const fileUploadInputRef = useRef<HTMLInputElement>(null);
  const [isUploadingCsv, setIsUploadingCsv] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadMessage, setUploadMessage] = useState('');
  const [uploadStats, setUploadStats] = useState<any>(null);
  const [uploadLogs, setUploadLogs] = useState<UploadLogItem[]>([]);

  // =========================================================================
  // HANDLERS & HELPERS
  // =========================================================================

  const handlePetugasNameChange = (name: string) => {
    setPetugasName(name);
    try {
      localStorage.setItem(LOCAL_STORAGE_PETUGAS, name);
    } catch (e) { }
  };

  const openDutyModal = () => {
    setDutyOperatorInput(petugasName);
    setIsDutyModalOpen(true);
  };

  const saveDutyOperator = () => {
    if (!dutyOperatorInput.trim()) {
      alert('Nama Petugas tidak boleh kosong!');
      return;
    }
    handlePetugasNameChange(dutyOperatorInput.trim());
    setIsDutyModalOpen(false);
  };

  const requirePetugasName = (): boolean => {
    if (!petugasName.trim()) {
      setPetugasInputHighlight(true);
      openDutyModal();
      setTimeout(() => setPetugasInputHighlight(false), 2500);
      return false;
    }
    return true;
  };

  const extractOpenFromRows = (rows: DailyIncidentRow[]): OpenIncidentItem[] => {
    return rows
      .filter((r) => !isEndTimeFilled(r.endTime))
      .map((r) => {
        const key = (r.incidentNumber && r.incidentNumber !== '-') ? r.incidentNumber : `${r.wsid}|${r.eventCodeDesc}|${r.startTime}`;
        const spParts = (r.servicePointSektor || '').split('-');
        const sPoint = spParts[0]?.trim() || '-';
        const sektor = spParts[1]?.trim() || '-';

        const sTime = formatStartProblemTime(r.startTime) !== '-' ? formatStartProblemTime(r.startTime) : getDisplayStartTime(r);
        const dText = (!r.detail || r.detail === '-' || isDateLikeString(r.detail)) ? '-' : r.detail;

        // Detail teknis mesin BUKAN tindakan petugas
        let actionText = (r.actionTerakhir && r.actionTerakhir !== '-' && !isTechnicalMachineLog(r.actionTerakhir)) ? r.actionTerakhir : '-';
        const hasAction = actionText !== '-';
        const actionOleh = hasAction ? (r.actionTerakhirOleh && r.actionTerakhirOleh !== '-' && r.actionTerakhirOleh !== 'CSV' && r.actionTerakhirOleh !== 'CSV Comment' ? r.actionTerakhirOleh : 'Petugas') : '-';
        const actionWaktu = hasAction ? (r.actionTerakhirWaktu && r.actionTerakhirWaktu !== '-' ? (formatStartProblemTime(r.actionTerakhirWaktu) !== '-' ? formatStartProblemTime(r.actionTerakhirWaktu) : r.actionTerakhirWaktu) : sTime) : '-';

        return {
          incidentKey: key,
          incidentNumber: r.incidentNumber || '-',
          wsid: r.wsid,
          lokasi: r.lokasi || '-',
          servicePoint: sPoint,
          sektor: sektor,
          typeMesin: r.typeMesin || '-',
          vendor: r.vendorMesin || '-',
          eventCode: r.eventCode || '-',
          eventCodeDesc: r.eventCodeDesc,
          detail: dText,
          startTime: sTime,
          endTime: formatStartProblemTime(r.endTime),
          tanggal: r.dateStr || '-',
          jam: r.hourStr || '00:00',
          durationRaw: r.rawDuration || 0,
          durasiOpr: r.durasi || 0,
          status: 'OPEN',
          actionTerakhir: actionText,
          actionTerakhirOleh: actionOleh,
          actionTerakhirWaktu: actionWaktu,
          jumlahAction: hasAction ? (r.jumlahAction || 1) : 0,
          monthStr: extractMonthStr(r.dateStr || r.startTime, r.monthStr),
          comment: r.comment || undefined,
          keterangan: actionText !== '-' ? actionText : undefined
        };
      });
  };

  // Tarik dataset lengkap insiden bulanan (100+ insiden) dari Supabase Cloud DB
  const fetchDailyIncidentsFromDb = async (month: string = 'ALL') => {
    setIsLoadingDailyFromDb(true);
    try {
      const res = await getDailyIncidentsFromDbApi({ monthStr: month });
      if (res.success && res.rows) {
        setAllDailyIncidents(res.rows);

        // Langsung perbarui cache riwayat problem bulanan
        const mappedHistory = res.rows.map((r, idx) => {
          const key = (r.incidentNumber && r.incidentNumber !== '-' && r.incidentNumber !== 'N/A')
            ? `${r.incidentNumber}__${r.wsid}__${idx}`
            : `${r.wsid}|${r.eventCodeDesc}|${r.startTime}|${idx}`;
          const sTime = formatStartProblemTime(r.startTime) !== '-' ? formatStartProblemTime(r.startTime) : getDisplayStartTime(r);
          const eTime = formatStartProblemTime(r.endTime);
          const dText = (!r.detail || r.detail === '-' || isDateLikeString(r.detail)) ? '-' : r.detail;
          const actText = (r.actionTerakhir && r.actionTerakhir !== '-' && !isTechnicalMachineLog(r.actionTerakhir)) ? r.actionTerakhir : '-';
          const hasAction = actText !== '-';
          const spParts = (r.servicePointSektor || '').split('-');
          const compDate = toComparableDate(sTime || r.dateStr || r.tanggal || '');
          const epochStart = parseToEpoch(sTime);
          const epochEnd = parseToEpoch(eTime);
          const searchIdx = `${r.wsid || ''} ${r.lokasi || ''} ${r.eventCodeDesc || ''} ${r.servicePoint || spParts[0]?.trim() || ''} ${r.sektor || spParts[1]?.trim() || ''} ${r.vendorMesin || r.vendor || ''} ${r.typeMesin || ''} ${actText} ${dText}`.toLowerCase();

          return {
            incidentKey: key,
            incidentNumber: r.incidentNumber || '-',
            wsid: r.wsid,
            lokasi: r.lokasi || '-',
            servicePoint: r.servicePoint || spParts[0]?.trim() || '-',
            sektor: r.sektor || spParts[1]?.trim() || '-',
            typeMesin: r.typeMesin || '-',
            vendor: r.vendorMesin || '-',
            eventCode: r.eventCode || '-',
            eventCodeDesc: r.eventCodeDesc,
            detail: dText,
            startTime: sTime,
            endTime: eTime,
            tanggal: r.dateStr || '-',
            jam: r.hourStr || '00:00',
            durationRaw: r.rawDuration || 0,
            durasiOpr: r.durasi || 0,
            status: (!isEndTimeFilled(r.endTime)) ? 'OPEN' : 'CLOSED',
            actionTerakhir: actText,
            actionTerakhirOleh: hasAction ? (r.actionTerakhirOleh && r.actionTerakhirOleh !== '-' && r.actionTerakhirOleh !== 'CSV' && r.actionTerakhirOleh !== 'CSV Comment' ? r.actionTerakhirOleh : 'Petugas') : '-',
            actionTerakhirWaktu: hasAction ? (r.actionTerakhirWaktu && r.actionTerakhirWaktu !== '-' ? r.actionTerakhirWaktu : sTime) : '-',
            jumlahAction: hasAction ? (r.jumlahAction || 1) : 0,
            monthStr: extractMonthStr(r.dateStr || r.startTime, month),
            closeSource: (!isEndTimeFilled(r.endTime))
              ? '-'
              : (r.closeSource === 'DASHBOARD' || r.actionTerakhirOleh === 'Sistem Dashboard' || (typeof actText === 'string' && actText.includes('[AUTO-CLOSE]'))
                ? 'DASHBOARD'
                : 'OASE'),
            comment: r.comment || undefined,
            keterangan: actText !== '-' ? actText : undefined,
            _compDate: compDate,
            _epochStart: epochStart,
            _epochEnd: epochEnd,
            _search: searchIdx
          } as any;
        });

        historyCacheRef.current[month] = mappedHistory;
        setHistoryResults(mappedHistory);

        // Sinkronkan detail Problem Open yang aktif dengan data tanggal & jam asli dari database
        setOpenIncidents((prev) => {
          if (!prev || prev.length === 0) return prev;
          return enrichOpenWithDailyData(prev, res.rows);
        });

        setSyncStatusBanner({
          type: 'success',
          text: `Database tersinkronisasi realtime: ${res.rows.length.toLocaleString()} insiden berhasil dimuat!`
        });
        setTimeout(() => setSyncStatusBanner(null), 4000);
      } else if (!res.success) {
        setSyncStatusBanner({
          type: 'error',
          text: `Sinkronisasi database gagal: ${res.message || 'Koneksi database terputus'}`
        });
      }
    } catch (err: any) {
      console.warn('Gagal memuat daily incidents dari DB:', err);
      setSyncStatusBanner({
        type: 'error',
        text: `Koneksi database terganggu: ${err?.message || String(err)}`
      });
    } finally {
      setIsLoadingDailyFromDb(false);
    }
  };

  // Tarik dataset untuk Grafik Frekuensi (bisa single month atau rentang periode)
  const fetchGfData = async (
    mode: 'SINGLE' | 'RANGE' = gfMode,
    singleM: string = gfSingleMonth,
    startM: string = gfStartMonth,
    endM: string = gfEndMonth
  ) => {
    const cacheKey = mode === 'SINGLE' ? `SINGLE_${singleM}` : `RANGE_${startM}_${endM}`;
    if (gfMonthCacheRef.current[cacheKey]) {
      const cached = gfMonthCacheRef.current[cacheKey];
      setGfMultiMonthRows(cached.rows);
      if (cached.availableMonths && cached.availableMonths.length > 0) {
        setGfAvailableMonths(cached.availableMonths);
      }
      return;
    }

    setIsLoadingGfData(true);
    try {
      let res;
      if (mode === 'SINGLE') {
        res = await getDailyIncidentsFromDbApi({ monthStr: singleM });
      } else {
        res = await getDailyIncidentsFromDbApi({ startMonth: startM, endMonth: endM });
      }
      if (res && res.success && res.rows && res.rows.length > 0) {
        setGfMultiMonthRows(res.rows);
        if (res.availableMonths && res.availableMonths.length > 0) {
          setGfAvailableMonths(res.availableMonths);
        }
        gfMonthCacheRef.current[cacheKey] = { rows: res.rows, availableMonths: res.availableMonths };
      } else if (res && res.rows && res.rows.length === 0) {
        setGfMultiMonthRows([]);
        gfMonthCacheRef.current[cacheKey] = { rows: [], availableMonths: res?.availableMonths };
      }
    } catch (err) {
      console.warn('Gagal memuat dataset Grafik Frekuensi:', err);
    } finally {
      setIsLoadingGfData(false);
    }
  };

  // Muat daftar periode bulan dari Supabase
  useEffect(() => {
    let mounted = true;
    fetchDistinctIncidentMonthsSupabase().then((months) => {
      if (mounted && Array.isArray(months) && months.length > 0) {
        setAvailableFreqMonths(months);
      }
    });
    return () => { mounted = false; };
  }, []);

  // Muat dataset chronic cepat secara instan saat mount, saat tersambung, dan saat openIncidents pertama kali terisi
  const hasTriggeredChronicOnOpenRef = useRef(false);
  const prevConnectionStatusRef = useRef(connectionStatus);

  useEffect(() => {
    fetchChronicDataset();
  }, [fetchChronicDataset]);

  useEffect(() => {
    if (connectionStatus === 'SUBSCRIBED' && prevConnectionStatusRef.current !== 'SUBSCRIBED') {
      fetchChronicDataset();
    }
    prevConnectionStatusRef.current = connectionStatus;
  }, [connectionStatus, fetchChronicDataset]);

  useEffect(() => {
    if (openIncidents && openIncidents.length > 0 && !hasTriggeredChronicOnOpenRef.current) {
      hasTriggeredChronicOnOpenRef.current = true;
      fetchChronicDataset();
    }
  }, [openIncidents, fetchChronicDataset]);

  // Fungsi loader data matriks Frekuensi (RPC Database Server-side + Cache Stale-while-revalidate)
  const loadFrequencyData = useCallback(async (targetMonth: string, forceRefresh = false) => {
    if (!targetMonth || targetMonth === 'ALL') return;
    setIsLoadingFreq(true);
    setFreqError(null);
    const t0 = performance.now();

    try {
      // 1. Stale-while-revalidate: Cek cache IndexedDB terlebih dahulu untuk first-paint cepat (<15ms)
      if (!forceRefresh) {
        const cached = await loadFrequencyMatrixCache(targetMonth);
        if (cached && Array.isArray(cached.items) && cached.items.length > 0) {
          setFreqMatrix(cached.items);
          setFreqDates(cached.allDates || []);
          console.info(`[Frekuensi] Loaded from IndexedDB cache in ${(performance.now() - t0).toFixed(1)}ms (${cached.items.length} items)`);
        }
      }

      // 2. Fetch fresh data dari database via RPC get_frequency_matrix
      console.time(`fetchFrequencyMatrix-${targetMonth}`);
      const res = await getFrequencyMatrixApi(targetMonth);
      console.timeEnd(`fetchFrequencyMatrix-${targetMonth}`);

      if (res.success && res.items) {
        setFreqMatrix(res.items);
        setFreqDates(res.allDates || []);
        setFreqSuccessMsg(`${res.items.length.toLocaleString('id-ID')} kombinasi WSID-problem untuk ${targetMonth} berhasil dimuat.`);
        // Simpan ke cache IndexedDB
        await saveFrequencyMatrixCache(targetMonth, {
          items: res.items,
          allDates: res.allDates,
          totalCount: res.totalIncidents
        });
      } else {
        setFreqError(res.message || `Gagal memuat data frekuensi bulan ${targetMonth}`);
      }
    } catch (err: any) {
      console.error('[Frekuensi] Error loading matrix:', err);
      setFreqError(err.message || 'Terjadi kesalahan saat memuat data frekuensi.');
    } finally {
      setIsLoadingFreq(false);
    }
  }, []);

  // Auto-fetch data matriks Frekuensi saat tab Frekuensi aktif atau bulan berubah
  useEffect(() => {
    if (activeTab === 'FREKUENSI') {
      loadFrequencyData(freqMonth);
    }
  }, [activeTab, freqMonth, loadFrequencyData]);

  // Lazy-load dataset harian hanya ketika user membuka tab Grafik 24 Jam jika belum termuat
  useEffect(() => {
    if (
      activeTab === 'GRAFIK_24JAM' &&
      allDailyIncidents.length === 0 &&
      !isLoadingDailyFromDb
    ) {
      const targetM = historyMonth !== 'ALL' ? historyMonth : getCurrentWibMonth();
      fetchDailyIncidentsFromDb(targetM);
    }
  }, [activeTab, allDailyIncidents.length, isLoadingDailyFromDb, historyMonth]);

  // =========================================================================
  // BASIS DATA FREKUENSI & DETEKSI PROBLEM CHRONIC
  // =========================================================================
  const frequencyDataset = useMemo(() => {
    // Guard: Hindari kalkulasi berat saat user sedang berada di tab Problem Open, History, atau Frekuensi
    if (activeTab !== 'GRAFIK_24JAM') {
      return [];
    }

    const rawSourceRows =
      allDailyIncidents.length > 0
        ? allDailyIncidents
        : chronicDataset.length > 0
          ? [...chronicDataset, ...openIncidents]
          : historyResults.length > 0
            ? historyResults
            : openIncidents;

    // Deduplikasi dataset frekuensi agar tidak ada entri ganda
    const seenFreqKeys = new Set<string>();
    const deduplicatedRows: any[] = [];
    for (const r of rawSourceRows) {
      if (!r) continue;
      const wsid = (r.wsid || '').trim().toUpperCase();
      if (!wsid) continue;
      const incId = (r.incidentNumber && r.incidentNumber !== '-')
        ? r.incidentNumber
        : (r.id || `${wsid}__${r.eventCodeDesc || r.problem || ''}__${r.startTime || r.tanggal || r.dateStr || ''}`);
      if (seenFreqKeys.has(incId)) continue;
      seenFreqKeys.add(incId);
      deduplicatedRows.push(r);
    }

    const filteredByMonth = freqMonth === 'ALL'
      ? deduplicatedRows
      : deduplicatedRows.filter((r) => {
          const raw = r.dateStr || r.tanggal || r.startTime;
          const m = extractMonthStr(raw, r.monthStr || '');
          return m === freqMonth || (r.monthStr && r.monthStr === freqMonth);
        });

    return filteredByMonth.map((r: any) => {
      // Normalisasi dateStr menjadi format DD/MM/YYYY (mendukung input ISO, DB, maupun CSV)
      let dStr = r.dateStr;
      if (!dStr || dStr === '-' || dStr === 'N/A') {
        const rawDate = r.tanggal || r.dateStr || r.startTime;
        if (rawDate && rawDate !== '-') {
          const dateOnly = String(rawDate).trim().split(' ')[0];
          if (dateOnly.includes('-')) {
            const parts = dateOnly.split('-');
            if (parts.length === 3 && parts[0].length === 4) {
              const y = parseInt(parts[0], 10);
              const m = parseInt(parts[1], 10);
              const d = parseInt(parts[2], 10);
              const dis = disambiguateFutureDate(d, m, y);
              dStr = `${String(dis.day).padStart(2, '0')}/${String(dis.month).padStart(2, '0')}/${y}`;
            }
          } else if (dateOnly.includes('/')) {
            const parts = dateOnly.split('/');
            if (parts.length === 3) {
              const p1 = parseInt(parts[0], 10);
              const p2 = parseInt(parts[1], 10);
              let y = parseInt(parts[2], 10);
              if (String(y).length === 2) y = 2000 + y;
              const dis = resolveDayAndMonth(p1, p2, y);
              dStr = `${String(dis.day).padStart(2, '0')}/${String(dis.month).padStart(2, '0')}/${y}`;
            }
          }
        }
      } else if (dStr.includes('-') && dStr.split('-')[0].length === 4) {
        const parts = dStr.split('-');
        if (parts.length === 3) {
          const y = parseInt(parts[0], 10);
          const m = parseInt(parts[1], 10);
          const d = parseInt(parts[2], 10);
          const dis = disambiguateFutureDate(d, m, y);
          dStr = `${String(dis.day).padStart(2, '0')}/${String(dis.month).padStart(2, '0')}/${y}`;
        }
      } else if (dStr.includes('/')) {
        const parts = dStr.split(' ')[0].split('/');
        if (parts.length === 3) {
          const p1 = parseInt(parts[0], 10);
          const p2 = parseInt(parts[1], 10);
          let y = parseInt(parts[2], 10);
          if (String(y).length === 2) y = 2000 + y;
          const dis = resolveDayAndMonth(p1, p2, y);
          dStr = `${String(dis.day).padStart(2, '0')}/${String(dis.month).padStart(2, '0')}/${y}`;
        }
      }

      const sp = r.servicePoint || (r.servicePointSektor ? r.servicePointSektor.split('-')[0].trim() : '-');
      const sek = r.sektor || (r.servicePointSektor ? r.servicePointSektor.split('-')[1]?.trim() : '-');
      const spSek = r.servicePointSektor || ((sp !== '-' && sek !== '-') ? `${sp} - ${sek}` : (sp !== '-' ? sp : sek));

      return {
        ...r,
        incidentNumber: r.incidentNumber || r.ticket_no || '-',
        wsid: r.wsid,
        lokasi: r.lokasi || '-',
        servicePoint: sp,
        sektor: sek,
        servicePointSektor: spSek,
        typeMesin: r.typeMesin || r.type_mesin || '-',
        vendorMesin: r.vendorMesin || r.vendor || '-',
        startTime: r.startTime ? (typeof getDisplayStartTime === 'function' ? getDisplayStartTime(r) : r.startTime) : '-',
        endTime: r.endTime ? (typeof formatStartProblemTime === 'function' ? formatStartProblemTime(r.endTime) : r.endTime) : '-',
        dateStr: dStr || '-',
        hourStr: r.hourStr || (r.jam ? r.jam.slice(0, 5) : '00:00'),
        hourNumber: typeof r.hourNumber === 'number' ? r.hourNumber : 0,
        durasi: r.durasi ?? r.durasiOpr ?? r.durationRaw ?? 0,
        rawDuration: r.rawDuration ?? r.durationRaw ?? 0,
        eventCodeDesc: r.eventCodeDesc || r.problem || '-',
        eventCode: r.eventCode || r.event_code || '-',
        detail: r.detail || r.keterangan || '-'
      };
    });
  }, [activeTab, allDailyIncidents, chronicDataset, historyResults, openIncidents, freqMonth]);

  const chronicInfoMap = useMemo(() => {
    // Gabungkan seluruh data riwayat mutakhir yang ada (chronicDataset + allDailyIncidents + openIncidents)
    // Otomatis terdeduplikasi oleh seenIncidentIds di bawah sehingga 100% presisi dan instan
    const rawSourceRows =
      chronicDataset.length > 0 || allDailyIncidents.length > 0
        ? [...chronicDataset, ...allDailyIncidents, ...openIncidents]
        : historyResults.length > 0
          ? [...historyResults, ...openIncidents]
          : (openIncidents as any[]);

    // Deduplikasi dataset chronic agar insiden yang sama tidak terhitung 2 kali
    const seenIncidentIds = new Set<string>();
    const sourceRows: any[] = [];
    for (const r of rawSourceRows) {
      if (!r) continue;
      const wsid = (r.wsid || '').trim().toUpperCase();
      if (!wsid) continue;
      const pKey = getProblemCanonicalKey(r.eventCodeDesc || r.problem, r.eventCode || r.event_code);
      const incId = (r.incidentNumber && r.incidentNumber !== '-')
        ? r.incidentNumber
        : (r.id || r.ticket_no || `${wsid}__${pKey}__${r.startTime || r.tanggal || r.dateStr || ''}`);
      if (seenIncidentIds.has(incId)) continue;
      seenIncidentIds.add(incId);
      sourceRows.push(r);
    }

    const groupMap = new Map<string, { dateStr: string; normDate: string; epoch: number | null }[]>();

    for (const r of sourceRows) {
      const wsid = (r.wsid || '').trim().toUpperCase();
      if (!wsid) continue;
      const pKey = getProblemCanonicalKey(r.eventCodeDesc || r.problem, r.eventCode || r.event_code);
      const groupKey = `${wsid}|||${pKey}`;

      let list = groupMap.get(groupKey);
      if (!list) {
        list = [];
        groupMap.set(groupKey, list);
      }

      let rawDate =
        r.dateStr && r.dateStr !== '-'
          ? r.dateStr
          : r.tanggal && r.tanggal !== '-'
            ? r.tanggal.split(' ')[0]
            : r.startTime && r.startTime !== '-'
              ? r.startTime.split(' ')[0]
              : '';

      // Fallback cerdas: Jika tidak terdapat komponen tanggal (misal hanya berisi jam '15:59'), asumsikan hari ini
      if (!parseIncidentDateStr(rawDate)) {
        const now = new Date();
        rawDate = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`;
      }

      const normDate = normalizeDateStr(rawDate);
      const epoch = parseDateStrToEpochDay(rawDate);
      list.push({ dateStr: rawDate, normDate, epoch });
    }

    const resultMap = new Map<
      string,
      {
        sameDayCount: number;
        is3xSehari: boolean;
        fiveDayCount: number;
        is3x5Hari: boolean;
        totalOccurrences: number;
        isChronic: boolean;
      }
    >();

    const evalCache = new Map<string, {
      sameDayCount: number;
      is3xSehari: boolean;
      fiveDayCount: number;
      is3x5Hari: boolean;
      totalOccurrences: number;
      isChronic: boolean;
    }>();

    const evaluateChronicItem = (inc: {
      incidentKey?: string;
      wsid?: string;
      eventCodeDesc?: string;
      eventCode?: string;
      tanggal?: string;
      startTime?: string;
    }) => {
      const wsid = (inc.wsid || '').trim().toUpperCase();
      const pKey = getProblemCanonicalKey(inc.eventCodeDesc, inc.eventCode);
      const groupKey = `${wsid}|||${pKey}`;
      const occurrences = groupMap.get(groupKey);

      if (!occurrences || occurrences.length === 0) {
        return {
          sameDayCount: 0,
          is3xSehari: false,
          fiveDayCount: 0,
          is3x5Hari: false,
          totalOccurrences: 0,
          isChronic: false
        };
      }

      let rawIncDate =
        inc.tanggal && inc.tanggal !== '-'
          ? inc.tanggal.split(' ')[0]
          : inc.startTime && inc.startTime !== '-'
            ? inc.startTime.split(' ')[0]
            : '';

      // Fallback cerdas: Jika tidak terdapat komponen tanggal pada problem open aktif, asumsikan hari ini
      if (!parseIncidentDateStr(rawIncDate)) {
        const now = new Date();
        rawIncDate = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`;
      }

      const normIncDate = normalizeDateStr(rawIncDate);
      const cacheKey = `${groupKey}|||${normIncDate}`;
      const cached = evalCache.get(cacheKey);
      if (cached) return cached;

      // Fast-path: jika total kejadian problem ini kurang dari 3 kali, mustahil chronic
      if (occurrences.length < 3) {
        const sameDay = occurrences.filter((o) => normIncDate && o.normDate === normIncDate).length;
        const res = {
          sameDayCount: sameDay,
          is3xSehari: false,
          fiveDayCount: occurrences.length,
          is3x5Hari: false,
          totalOccurrences: occurrences.length,
          isChronic: false
        };
        evalCache.set(cacheKey, res);
        return res;
      }

      const incEpoch = parseDateStrToEpochDay(rawIncDate);

      // Hitung kejadian pada hari yang sama (3x Sehari) dan dalam rolling 5 hari (3x 5 Hari)
      let sameDayCount = 0;
      let fiveDayCount = 0;

      for (let i = 0; i < occurrences.length; i++) {
        const occ = occurrences[i];

        // Same day match dengan tanggal insiden yang dievaluasi
        if (normIncDate && occ.normDate && occ.normDate === normIncDate) {
          sameDayCount++;
        }

        // Rolling 5 hari mundur: dari incEpoch - 4 sampai incEpoch (5 hari berturut-turut)
        if (incEpoch !== null && occ.epoch !== null) {
          if (occ.epoch >= incEpoch - 4 && occ.epoch <= incEpoch) {
            fiveDayCount++;
          }
        }
      }

      const is3xSehari = sameDayCount >= 3;
      const is3x5Hari = fiveDayCount >= 3;
      const isChronic = is3xSehari || is3x5Hari;

      const res = {
        sameDayCount,
        is3xSehari,
        fiveDayCount,
        is3x5Hari,
        totalOccurrences: occurrences.length,
        isChronic
      };
      evalCache.set(cacheKey, res);
      return res;
    };

    // Expose evaluation function for on-demand lazy evaluation of paginated rows
    evaluateChronicRef.current = evaluateChronicItem;

    // Evaluasi seluruh open incidents aktif (biasanya 10-50 item, sekejap < 1ms)
    for (const inc of openIncidents) {
      if (inc.incidentKey) {
        resultMap.set(inc.incidentKey, evaluateChronicItem(inc));
      }
    }

    return resultMap;
  }, [openIncidents, allDailyIncidents, chronicDataset, historyResults]);

  const masterSchedMap = useMemo(() => {
    const map = new Map<string, any>();
    const list = (masterList && masterList.length > 0) ? masterList : (rawMasterData || []);
    if (list && Array.isArray(list)) {
      for (const m of list) {
        const cleanW = cleanWsid(m.WSID || m.wsid);
        if (cleanW) map.set(cleanW, m);
      }
    }
    return map;
  }, [masterList, rawMasterData]);

  // Jaminan ketat & absolut: Hanya problem yang masih OPEN (belum ada End Time yang valid)
  // Dan durasi dihitung REAL-TIME dari awal muncul problem sampai saat ini saat tim monitoring cek di dashboard
  const trulyOpenIncidents = useMemo(() => {
    return openIncidents
      .filter((inc) => !isEndTimeFilled(inc.endTime))
      .map((inc) => {
        const meta = getMachineMetadata(inc.wsid);
        const resolvedVendor = (inc.vendor && inc.vendor !== '-' && inc.vendor !== 'N/A')
          ? inc.vendor
          : (meta?.vendor || '-');
        const resolvedType = (inc.typeMesin && inc.typeMesin !== '-' && inc.typeMesin !== 'N/A')
          ? inc.typeMesin
          : (meta?.tipe_mesin || '-');
        const resolvedJenis = inc.jenisMesin || meta?.jenis_mesin ||
          (resolvedType.toUpperCase().includes('OMRON') || resolvedType.toUpperCase().includes('RG8') || resolvedType.toUpperCase().includes('8600') || resolvedType.toUpperCase().includes('SR7500') ? 'CRM' : 'ATM');
        const resolvedHari = inc.hariOperasional && inc.hariOperasional !== '-' ? inc.hariOperasional : (meta?.hari || 'MON-SUN');
        const resolvedJam = inc.jamOperasional && inc.jamOperasional !== '-' ? inc.jamOperasional : (meta?.jam || '(00:00 - 23:59)');
        const resolvedSp = (inc.servicePoint && inc.servicePoint !== '-' && inc.servicePoint !== 'N/A')
          ? inc.servicePoint
          : (meta?.service_point || resolveServicePoint(null, inc));
        const resolvedSektor = (inc.sektor && inc.sektor !== '-' && inc.sektor !== 'N/A')
          ? inc.sektor
          : (meta?.sektor_bca || inc.sektor || '-');

        const base = {
          ...inc,
          vendor: resolvedVendor,
          typeMesin: resolvedType,
          jenisMesin: resolvedJenis,
          hariOperasional: resolvedHari,
          jamOperasional: resolvedJam,
          servicePoint: resolvedSp,
          sektor: resolvedSektor,
        };

        if (!inc.startTime || inc.startTime === '-') return { ...base, status: 'OPEN' as const };
        const startDate = parseDateTime(inc.startTime);
        if (!startDate) return { ...base, status: 'OPEN' as const };

        const targetNow = currentLiveTime;
        if (targetNow.getTime() <= startDate.getTime()) return { ...base, status: 'OPEN' as const };

        const sched = resolveOperatingSchedule(inc.wsid, undefined, masterSchedMap);
        const liveDuration = calculateOperationalDuration(startDate, targetNow, sched.hari, sched.jam);

        return {
          ...base,
          status: 'OPEN' as const,
          durasiOpr: liveDuration >= 0 ? liveDuration : (inc.durasiOpr || 0)
        };
      });
  }, [openIncidents, currentLiveTime, masterSchedMap]);

  // Fast map untuk live duration incident open
  const trulyOpenIncidentsMap = useMemo(() => {
    const map = new Map<string, number>();
    trulyOpenIncidents.forEach((inc) => {
      map.set(inc.incidentKey, inc.durasiOpr);
      map.set(`${inc.wsid}|${inc.eventCodeDesc}`, inc.durasiOpr);
    });
    return map;
  }, [trulyOpenIncidents]);

  // Perhitungan durasi riwayat: jika status masih OPEN, hitung durasi berjalan realtime
  const getHistoryEffectiveDuration = useCallback((r: any): number => {
    if (!r) return 0;
    const isClosed = isEndTimeFilled(r.endTime);
    if (isClosed) {
      return r.durasiOpr || r.durasi || 0;
    }
    // Jika OPEN, cari live duration
    if (trulyOpenIncidentsMap.has(r.incidentKey)) {
      return trulyOpenIncidentsMap.get(r.incidentKey)!;
    }
    if (trulyOpenIncidentsMap.has(`${r.wsid}|${r.eventCodeDesc}`)) {
      return trulyOpenIncidentsMap.get(`${r.wsid}|${r.eventCodeDesc}`)!;
    }
    const sTime = getDisplayStartTime(r);
    const startDate = parseDateTime(sTime);
    if (!startDate || currentLiveTime.getTime() <= startDate.getTime()) {
      return r.durasiOpr || r.durasi || 0;
    }
    const sched = resolveOperatingSchedule(r.wsid, undefined, masterSchedMap);
    const liveDur = calculateOperationalDuration(startDate, currentLiveTime, sched.hari, sched.jam);
    return liveDur >= 0 ? liveDur : (r.durasiOpr || r.durasi || 0);
  }, [trulyOpenIncidentsMap, currentLiveTime, masterSchedMap]);

  // =========================================================================
  // SISTEM TIKET FOLLOW UP (KA OPS / KA WIL ↔ TIM MONITORING)
  // =========================================================================

  interface FollowUpTargetItem {
    wsid: string;
    lokasi: string;
    sektor: string;
    servicePoint: string;
    vendor: string;
    typeMesin?: string;
    problem: string;
    durasi?: number;
    sumberProblem: 'OPEN_INCIDENT' | 'FREKUENSI';
  }

  const [kaOpsFollowUpTarget, setKaOpsFollowUpTarget] = useState<FollowUpTargetItem | null>(null);
  const [kaOpsFollowUpNote, setKaOpsFollowUpNote] = useState('');
  const [kaOpsFollowUpPriority, setKaOpsFollowUpPriority] = useState<'NORMAL' | 'HIGH' | 'URGENT'>('HIGH');
  const [kaOpsFollowUpCategory, setKaOpsFollowUpCategory] = useState<'VENDOR' | 'FLM' | 'SLM' | 'CABANG' | 'JALUR'>('VENDOR');
  const [kaOpsFollowUpToast, setKaOpsFollowUpToast] = useState<string | null>(null);
  const [isSubmittingTicket, setIsSubmittingTicket] = useState(false);

  // Modal Pusat Tiket Follow Up
  const [showTicketCenterModal, setShowTicketCenterModal] = useState(false);
  const [ticketCenterTab, setTicketCenterTab] = useState<'ALL' | 'ACTION_NEEDED' | 'WAITING_VALIDATION' | 'CLOSED'>('ALL');
  const [ticketCenterSpFilter, setTicketCenterSpFilter] = useState('ALL');
  const [ticketSearchQuery, setTicketSearchQuery] = useState('');
  const [selectedTicketForDetail, setSelectedTicketForDetail] = useState<FollowUpTicketItem | null>(null);

  // State tambah progres oleh tim monitoring
  const [progressInputText, setProgressInputText] = useState('');
  const [isSavingProgress, setIsSavingProgress] = useState(false);

  // State Request Close oleh tim monitoring
  const [showReqCloseModal, setShowReqCloseModal] = useState(false);
  const [targetTicketForReqClose, setTargetTicketForReqClose] = useState<FollowUpTicketItem | null>(null);
  const [reqCloseCatatan, setReqCloseCatatan] = useState('');
  const [reqCloseStatusMesin, setReqCloseStatusMesin] = useState('Mesin Normal / Problem Teratasi');
  const [isSubmittingReqClose, setIsSubmittingReqClose] = useState(false);

  // State Validasi oleh Ka Ops / Ka Wil
  const [showValidationModal, setShowValidationModal] = useState(false);
  const [targetTicketForValidation, setTargetTicketForValidation] = useState<FollowUpTicketItem | null>(null);
  const [validationDecision, setValidationDecision] = useState<'CLOSED' | 'RE_OPEN'>('CLOSED');
  const [validationReopenReason, setValidationReopenReason] = useState('');
  const [validationCatatanApproval, setValidationCatatanApproval] = useState('');
  const [isSubmittingValidation, setIsSubmittingValidation] = useState(false);

  // Live Timer: Memperbarui durasi setiap 60 detik
  const [ticketLiveTicker, setTicketLiveTicker] = useState(0);
  useEffect(() => {
    const iv = setInterval(() => {
      setTicketLiveTicker(t => t + 1);
    }, 60000);
    return () => clearInterval(iv);
  }, []);

  // Filter & Agregasi Tiket Aktif
  const activeTickets = useMemo(() => {
    return (modernTickets || []).filter(t => t.status !== 'CLOSED');
  }, [modernTickets, ticketLiveTicker]);

  const activeTicketByWsidMap = useMemo(() => {
    const map = new Map<string, FollowUpTicketItem>();
    activeTickets.forEach(t => {
      map.set(t.wsid.trim().toUpperCase(), t);
    });
    return map;
  }, [activeTickets]);

  const openTicketsCount = useMemo(() => {
    return activeTickets.filter(t => t.status === 'OPEN' || t.status === 'IN_PROGRESS' || t.status === 'RE_OPEN').length;
  }, [activeTickets]);

  const reOpenTicketsCount = useMemo(() => {
    return activeTickets.filter(t => t.status === 'RE_OPEN').length;
  }, [activeTickets]);

  const reqCloseTicketsCount = useMemo(() => {
    return activeTickets.filter(t => t.status === 'REQ_CLOSE').length;
  }, [activeTickets]);

  const displayedTickets = useMemo(() => {
    let list = modernTickets || [];
    if (ticketCenterTab === 'ACTION_NEEDED') {
      list = list.filter(t => t.status === 'OPEN' || t.status === 'IN_PROGRESS' || t.status === 'RE_OPEN');
    } else if (ticketCenterTab === 'WAITING_VALIDATION') {
      list = list.filter(t => t.status === 'REQ_CLOSE');
    } else if (ticketCenterTab === 'CLOSED') {
      list = list.filter(t => t.status === 'CLOSED');
    }

    if (ticketCenterSpFilter !== 'ALL') {
      const sp = ticketCenterSpFilter.toUpperCase();
      list = list.filter(t => (t.servicePoint || '').trim().toUpperCase().includes(sp));
    }

    if (ticketSearchQuery.trim()) {
      const q = ticketSearchQuery.trim().toLowerCase();
      list = list.filter(t =>
        (t.ticketId || '').toLowerCase().includes(q) ||
        (t.wsid || '').toLowerCase().includes(q) ||
        (t.lokasi || '').toLowerCase().includes(q) ||
        (t.sektor || '').toLowerCase().includes(q) ||
        (t.problem || '').toLowerCase().includes(q) ||
        (t.createdBy || '').toLowerCase().includes(q)
      );
    }

    return [...list].sort((a, b) => {
      const weight = (s: string) => {
        if (s === 'RE_OPEN') return 1;
        if (s === 'REQ_CLOSE') return 2;
        if (s === 'OPEN') return 3;
        if (s === 'IN_PROGRESS') return 4;
        return 5;
      };
      const wa = weight(a.status);
      const wb = weight(b.status);
      if (wa !== wb) return wa - wb;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }, [modernTickets, ticketCenterTab, ticketSearchQuery, ticketCenterSpFilter, ticketLiveTicker]);

  const handleOpenKaOpsFollowUp = (item: any, source: 'OPEN_INCIDENT' | 'FREKUENSI' = 'OPEN_INCIDENT') => {
    const target: FollowUpTargetItem = {
      wsid: item.wsid || '',
      lokasi: item.lokasi || '',
      sektor: cleanSektorName(item.sektor || ''),
      servicePoint: item.servicePoint || '',
      vendor: item.vendor || '',
      typeMesin: item.typeMesin || 'ATM',
      problem: item.eventCodeDesc || item.problem || '',
      durasi: item.durasiOpr || item.durasi || 0,
      sumberProblem: source
    };
    setKaOpsFollowUpTarget(target);
    if (source === 'FREKUENSI' && item.frekuensi) {
      setKaOpsFollowUpNote(`Problem ${target.problem} terdeteksi berulang ${item.frekuensi}x pada WSID ${target.wsid} (Lokasi: ${target.lokasi}). Mohon koordinasi dengan vendor untuk pengecekan / swap part.`);
    } else {
      setKaOpsFollowUpNote(`Mohon percepatan tindak lanjut problem ${target.problem} pada WSID ${target.wsid} (Lokasi: ${target.lokasi})`);
    }
  };

  const handleSubmitKaOpsFollowUp = async () => {
    if (!kaOpsFollowUpTarget) return;

    // Kunci anti-duplikasi
    const isAlreadyActive = activeTicketByWsidMap.has(kaOpsFollowUpTarget.wsid.trim().toUpperCase());
    if (isAlreadyActive) {
      alert(`Peringatan: WSID ${kaOpsFollowUpTarget.wsid} sudah memiliki tiket follow up yang aktif.`);
      return;
    }

    setIsSubmittingTicket(true);
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const rand = Math.floor(100 + Math.random() * 900);
    const ticketId = `TKT-${y}${m}${day}-${rand}`;
    const nowIso = d.toISOString();

    const roleTitle = effectiveRole === 'KAWIL' ? 'Ka Wil' : (isKaOps || effectiveRole === 'KAOPS' ? 'Ka Ops' : 'Monitoring');
    const authorSignature = formatPetugasSignature(petugasName);
    const createdByStr = `${roleTitle}: ${authorSignature}`;

    const newTicket: FollowUpTicketItem = {
      ticketId,
      wsid: kaOpsFollowUpTarget.wsid.trim().toUpperCase(),
      lokasi: kaOpsFollowUpTarget.lokasi,
      sektor: kaOpsFollowUpTarget.sektor,
      servicePoint: kaOpsFollowUpTarget.servicePoint,
      vendor: kaOpsFollowUpTarget.vendor,
      problem: kaOpsFollowUpTarget.problem,
      sumberProblem: kaOpsFollowUpTarget.sumberProblem,
      prioritas: kaOpsFollowUpPriority,
      kategori: kaOpsFollowUpCategory,
      catatanRequest: kaOpsFollowUpNote.trim(),
      createdBy: createdByStr,
      createdAt: nowIso,
      status: 'OPEN',
      progresList: []
    };

    try {
      addOrUpdateModernTicket(newTicket);
      await saveFollowUpTicketModern(newTicket);
      setKaOpsFollowUpToast(`Tiket #${ticketId} (WSID ${newTicket.wsid}) berhasil diterbitkan dan masuk radar Tim Monitoring!`);
      setTimeout(() => setKaOpsFollowUpToast(null), 5000);
      setKaOpsFollowUpTarget(null);
      setKaOpsFollowUpNote('');
    } catch (e: any) {
      alert('Gagal menerbitkan tiket follow up: ' + (e?.message || e));
    } finally {
      setIsSubmittingTicket(false);
    }
  };

  // Handler Tambah Progres oleh Tim Monitoring
  const handleSaveProgressNote = async (ticket: FollowUpTicketItem) => {
    if (!progressInputText.trim()) return;
    setIsSavingProgress(true);
    const nowIso = new Date().toISOString();
    const updatedProgresList = [
      ...(ticket.progresList || []),
      {
        id: `PRG-${Date.now()}`,
        waktu: nowIso,
        petugas: formatPetugasSignature(petugasName),
        catatan: progressInputText.trim()
      }
    ];

    const updatedTicket: FollowUpTicketItem = {
      ...ticket,
      status: ticket.status === 'OPEN' ? 'IN_PROGRESS' : ticket.status,
      progresList: updatedProgresList,
      updatedAt: nowIso
    };

    try {
      addOrUpdateModernTicket(updatedTicket);
      await saveFollowUpTicketModern(updatedTicket);
      setProgressInputText('');
      if (selectedTicketForDetail?.ticketId === ticket.ticketId) {
        setSelectedTicketForDetail(updatedTicket);
      }
    } catch (e: any) {
      alert('Gagal menyimpan progres: ' + (e?.message || e));
    } finally {
      setIsSavingProgress(false);
    }
  };

  // Handler Request Close oleh Tim Monitoring
  const handleSubmitReqClose = async () => {
    if (!targetTicketForReqClose || !reqCloseCatatan.trim()) return;
    setIsSubmittingReqClose(true);
    const nowIso = new Date().toISOString();

    const updatedTicket: FollowUpTicketItem = {
      ...targetTicketForReqClose,
      status: 'REQ_CLOSE',
      reqCloseInfo: {
        requestedBy: formatPetugasSignature(petugasName),
        requestedAt: nowIso,
        catatanPenyelesaian: reqCloseCatatan.trim(),
        statusMesinSaatReq: reqCloseStatusMesin
      },
      updatedAt: nowIso
    };

    try {
      addOrUpdateModernTicket(updatedTicket);
      await saveFollowUpTicketModern(updatedTicket);
      setKaOpsFollowUpToast(`Pengajuan tutup tiket #${updatedTicket.ticketId} berhasil dikirim ke Ka Ops / Ka Wil!`);
      setTimeout(() => setKaOpsFollowUpToast(null), 5000);
      setShowReqCloseModal(false);
      setTargetTicketForReqClose(null);
      setReqCloseCatatan('');
      if (selectedTicketForDetail?.ticketId === updatedTicket.ticketId) {
        setSelectedTicketForDetail(updatedTicket);
      }
    } catch (e: any) {
      alert('Gagal mengirim pengajuan tutup tiket: ' + (e?.message || e));
    } finally {
      setIsSubmittingReqClose(false);
    }
  };

  // Handler Validasi oleh Ka Ops / Ka Wil (Close vs Re-Open)
  const handleSubmitValidation = async () => {
    if (!targetTicketForValidation) return;
    if (validationDecision === 'RE_OPEN' && !validationReopenReason.trim()) {
      alert('Alasan Re-Open wajib diisi agar tim monitoring memahami kendala yang belum tuntas!');
      return;
    }
    setIsSubmittingValidation(true);
    const nowIso = new Date().toISOString();
    const validatorName = `${effectiveRole === 'KAWIL' ? 'Ka Wil' : 'Ka Ops'}: ${formatPetugasSignature(petugasName)}`;

    let durasiMenitFinal = targetTicketForValidation.durasiMenitFinal;
    if (validationDecision === 'CLOSED') {
      const createdTime = new Date(targetTicketForValidation.createdAt).getTime();
      durasiMenitFinal = Math.max(0, Math.floor((Date.now() - createdTime) / 60000));
    }

    const updatedTicket: FollowUpTicketItem = {
      ...targetTicketForValidation,
      status: validationDecision,
      durasiMenitFinal: validationDecision === 'CLOSED' ? durasiMenitFinal : undefined,
      validationInfo: {
        validatedBy: validatorName,
        validatedAt: nowIso,
        keputusan: validationDecision,
        alasanReopen: validationDecision === 'RE_OPEN' ? validationReopenReason.trim() : undefined,
        catatanApproval: validationDecision === 'CLOSED' ? validationCatatanApproval.trim() : undefined
      },
      updatedAt: nowIso
    };

    try {
      addOrUpdateModernTicket(updatedTicket);
      await saveFollowUpTicketModern(updatedTicket);
      const msg = validationDecision === 'CLOSED'
        ? `Tiket #${updatedTicket.ticketId} berhasil ditutup resmi!`
        : `Tiket #${updatedTicket.ticketId} berhasil di-RE-OPEN dan kembali ke antrean Tim Monitoring!`;
      setKaOpsFollowUpToast(msg);
      setTimeout(() => setKaOpsFollowUpToast(null), 5000);
      setShowValidationModal(false);
      setTargetTicketForValidation(null);
      setValidationReopenReason('');
      setValidationCatatanApproval('');
      if (selectedTicketForDetail?.ticketId === updatedTicket.ticketId) {
        setSelectedTicketForDetail(updatedTicket);
      }
    } catch (e: any) {
      alert('Gagal menyimpan validasi tiket: ' + (e?.message || e));
    } finally {
      setIsSubmittingValidation(false);
    }
  };

  // Handler Hapus Tiket oleh Supervisor
  const handleDeleteTicket = async (ticketId: string) => {
    if (!confirm(`Hapus tiket #${ticketId}? Tindakan ini tidak dapat dibatalkan.`)) return;
    try {
      removeModernTicket(ticketId);
      await deleteFollowUpTicketModern(ticketId);
      if (selectedTicketForDetail?.ticketId === ticketId) {
        setSelectedTicketForDetail(null);
      }
      setKaOpsFollowUpToast(`Tiket #${ticketId} berhasil dihapus.`);
      setTimeout(() => setKaOpsFollowUpToast(null), 4000);
    } catch (e: any) {
      alert('Gagal menghapus tiket: ' + (e?.message || e));
    }
  };

  // Counts for KPI Summary Cards (terisolasi hanya Problem Open murni)
  const countOpenTotal = isSimulasiAman ? 0 : trulyOpenIncidents.length;
  const countOver60 = useMemo(() => isSimulasiAman ? 0 : trulyOpenIncidents.filter((r) => r.durasiOpr >= 60).length, [trulyOpenIncidents, isSimulasiAman]);
  const countOver180 = useMemo(() => isSimulasiAman ? 0 : trulyOpenIncidents.filter((r) => r.durasiOpr >= 180).length, [trulyOpenIncidents, isSimulasiAman]);
  const countChronic = useMemo(() => isSimulasiAman ? 0 : trulyOpenIncidents.filter((r) => chronicInfoMap.get(r.incidentKey)?.isChronic).length, [trulyOpenIncidents, chronicInfoMap, isSimulasiAman]);
  const count3xSehari = useMemo(() => isSimulasiAman ? 0 : trulyOpenIncidents.filter((r) => chronicInfoMap.get(r.incidentKey)?.is3xSehari).length, [trulyOpenIncidents, chronicInfoMap, isSimulasiAman]);
  const count3x5Hari = useMemo(() => isSimulasiAman ? 0 : trulyOpenIncidents.filter((r) => chronicInfoMap.get(r.incidentKey)?.is3x5Hari).length, [trulyOpenIncidents, chronicInfoMap, isSimulasiAman]);
  const countNoAction = useMemo(() => isSimulasiAman ? 0 : trulyOpenIncidents.filter((r) => !r.actionTerakhir || r.actionTerakhir === '-' || isTechnicalMachineLog(r.actionTerakhir)).length, [trulyOpenIncidents, isSimulasiAman]);

  const handleCardFilterClick = (
    filter: 'ALL' | 'OVER_60' | 'OVER_180' | 'CHRONIC' | 'CHRONIC_3X_SEHARI' | 'CHRONIC_3X_5HARI' | 'NO_ACTION'
  ) => {
    if (openCardFilter === filter) {
      setOpenCardFilter('ALL');
    } else {
      setOpenCardFilter(filter);
    }
    setCurrentPageOpen(1);
  };

  const filteredOpenIncidents = useMemo(() => {
    if (isSimulasiAman) return [];

    return trulyOpenIncidents.filter((inc) => {
      if (openCardFilter === 'OVER_60') {
        if (inc.durasiOpr < 60) return false;
      } else if (openCardFilter === 'OVER_180') {
        if (inc.durasiOpr < 180) return false;
      } else if (openCardFilter === 'CHRONIC') {
        const c = chronicInfoMap.get(inc.incidentKey);
        if (!c?.isChronic) return false;
      } else if (openCardFilter === 'CHRONIC_3X_SEHARI') {
        const c = chronicInfoMap.get(inc.incidentKey);
        if (!c?.is3xSehari) return false;
      } else if (openCardFilter === 'CHRONIC_3X_5HARI') {
        const c = chronicInfoMap.get(inc.incidentKey);
        if (!c?.is3x5Hari) return false;
      } else if (openCardFilter === 'NO_ACTION') {
        const hasValidAction = Boolean(inc.actionTerakhir && inc.actionTerakhir !== '-' && !isTechnicalMachineLog(inc.actionTerakhir));
        if (hasValidAction) return false;
      }

      if (openSearch.trim()) {
        const q = openSearch.toLowerCase().trim();
        const matchWsid = inc.wsid.toLowerCase().includes(q);
        const matchLok = inc.lokasi.toLowerCase().includes(q);
        const matchEvt = inc.eventCodeDesc.toLowerCase().includes(q);
        const matchSp = inc.servicePoint.toLowerCase().includes(q);
        const matchSektor = inc.sektor.toLowerCase().includes(q);
        const matchVendor = inc.vendor.toLowerCase().includes(q);
        const matchAction = (inc.actionTerakhir || '').toLowerCase().includes(q);
        const matchDetail = (inc.detail || '').toLowerCase().includes(q);
        const matchTipe = (inc.typeMesin || '').toLowerCase().includes(q);
        if (!matchWsid && !matchLok && !matchEvt && !matchSp && !matchSektor && !matchVendor && !matchAction && !matchDetail && !matchTipe) return false;
      }

      if (
        selectedEventCodesOpen.length > 0 &&
        !selectedEventCodesOpen.includes(inc.eventCodeDesc)
      ) {
        return false;
      }

      if (selectedOpenSPs.length > 0) {
        const itemSp = resolveServicePoint(null, inc);
        const sekSp = getServicePointForSektor(inc.sektor);
        const normItemSp = normSP(itemSp);
        const normSekSp = normSP(sekSp);
        const normRawSp = normSP(inc.servicePoint);
        const matched = selectedOpenSPs.some((sp) => {
          const normSp = normSP(sp);
          return normItemSp === normSp || normSekSp === normSp || normRawSp === normSp || (inc.servicePoint || '').toLowerCase().includes(sp.toLowerCase());
        });
        if (!matched) return false;
      }

      if (selectedOpenSektors.length > 0) {
        const itemSektor = cleanSektorName(inc.sektor).toUpperCase();
        if (!selectedOpenSektors.some((sk) => cleanSektorName(sk).toUpperCase() === itemSektor)) {
          return false;
        }
      }

      if (!isDateInRange(inc.tanggal || inc.startTime, openStartDate, openEndDate)) {
        return false;
      }

      if (selectedOpenVendors.length > 0) {
        const itemVendor = (inc.vendor || '').trim().toUpperCase();
        const matches = selectedOpenVendors.some((vd) => {
          const v = vd.trim().toUpperCase();
          if (v === itemVendor) return true;
          if ((v === 'ARG' || v === 'ABG' || v === 'OKI') && (itemVendor === 'ARG' || itemVendor === 'ABG' || itemVendor === 'OKI')) return true;
          if ((v === 'ITM' || v === 'IBM' || v === 'OMRON') && (itemVendor === 'ITM' || itemVendor === 'IBM' || itemVendor === 'OMRON')) return true;
          if ((v === 'HYO' || v === 'HYOSUNG') && (itemVendor === 'HYO' || itemVendor === 'HYOSUNG')) return true;
          if ((v === 'ITH' || v === 'HITACHI') && (itemVendor === 'ITH' || itemVendor === 'HITACHI')) return true;
          if ((v === 'ACH' || v === 'GLORY') && (itemVendor === 'ACH' || itemVendor === 'GLORY')) return true;
          return itemVendor.includes(v) || v.includes(itemVendor);
        });
        if (!matches) return false;
      }

      if (selectedOpenTipes.length > 0) {
        const modelStr = (inc.typeMesin || '').toUpperCase();
        const j = (inc.jenisMesin || (modelStr.includes('OMRON') || modelStr.includes('RG8') || modelStr.includes('8600') || modelStr.includes('SR7500') || modelStr.includes('CRM') || modelStr.includes('ATS') || modelStr.includes('CDM') ? 'CRM' : 'ATM')).toUpperCase();
        const matches = selectedOpenTipes.some((tipe) => {
          const t = tipe.toUpperCase();
          if (t === 'ATM') return j === 'ATM' || modelStr.includes('ATM');
          if (t === 'CRM') return j === 'CRM' || j === 'CDM' || j === 'DDM' || j === 'ATS' || modelStr.includes('CRM');
          return j === t;
        });
        if (!matches) return false;
      }

      if (openDurationFilter === 'OVER_45' && inc.durasiOpr < 45) {
        return false;
      }
      if (openDurationFilter === 'OVER_60' && inc.durasiOpr < 60) {
        return false;
      }
      if (openDurationFilter === 'OVER_180' && inc.durasiOpr < 180) {
        return false;
      }

      const hasValidAct = Boolean(inc.actionTerakhir && inc.actionTerakhir !== '-' && !isTechnicalMachineLog(inc.actionTerakhir));
      if (openActionFilter === 'NO_ACTION' && hasValidAct) {
        return false;
      }
      if (openActionFilter === 'HAS_ACTION' && !hasValidAct) {
        return false;
      }

      if (openChronicFilter === '3X_SEHARI') {
        const c = chronicInfoMap.get(inc.incidentKey);
        if (!c?.is3xSehari) return false;
      } else if (openChronicFilter === '3X_5_HARI') {
        const c = chronicInfoMap.get(inc.incidentKey);
        if (!c?.is3x5Hari) return false;
      } else if (openChronicFilter === 'CHRONIC_ANY') {
        const c = chronicInfoMap.get(inc.incidentKey);
        if (!c?.isChronic) return false;
      }

      return true;
    });
  }, [
    trulyOpenIncidents,
    openCardFilter,
    openSearch,
    selectedEventCodesOpen,
    selectedOpenSPs,
    selectedOpenSektors,
    openStartDate,
    openEndDate,
    selectedOpenVendors,
    selectedOpenTipes,
    openDurationFilter,
    openActionFilter,
    openChronicFilter,
    chronicInfoMap,
    isSimulasiAman
  ]);

  const sortedOpenIncidents = useMemo(() => {
    const list = [...filteredOpenIncidents];
    list.sort((a, b) => {
      let diff = 0;
      if (openSortColumn === 'wsid') {
        diff = a.wsid.localeCompare(b.wsid);
      } else if (openSortColumn === 'typeMesin') {
        diff = (a.typeMesin || '').localeCompare(b.typeMesin || '');
      } else if (openSortColumn === 'eventCodeDesc') {
        diff = (a.eventCodeDesc || '').localeCompare(b.eventCodeDesc || '');
      } else if (openSortColumn === 'startTime') {
        diff = parseToEpoch(getDisplayStartTime(a)) - parseToEpoch(getDisplayStartTime(b));
      } else if (openSortColumn === 'durasiOpr') {
        diff = (a.durasiOpr || 0) - (b.durasiOpr || 0);
      } else if (openSortColumn === 'chronic') {
        const cA = chronicInfoMap.get(a.incidentKey);
        const cB = chronicInfoMap.get(b.incidentKey);
        const scoreA = cA?.is3xSehari ? 3 : cA?.is3x5Hari ? 2 : 0;
        const scoreB = cB?.is3xSehari ? 3 : cB?.is3x5Hari ? 2 : 0;
        diff = scoreA - scoreB;
      } else if (openSortColumn === 'actionTerakhir') {
        diff = (a.actionTerakhir || '').localeCompare(b.actionTerakhir || '');
      }
      return openSortDirection === 'asc' ? diff : -diff;
    });
    return list;
  }, [filteredOpenIncidents, openSortColumn, openSortDirection, chronicInfoMap]);

  const handleSortOpen = (
    col: 'wsid' | 'typeMesin' | 'eventCodeDesc' | 'startTime' | 'durasiOpr' | 'chronic' | 'actionTerakhir'
  ) => {
    setCurrentPageOpen(1);
    if (openSortColumn === col) {
      const nextDir = openSortDirection === 'asc' ? 'desc' : 'asc';
      setOpenSortDirection(nextDir);
      if (col === 'durasiOpr') setOpenSortBy(nextDir === 'desc' ? 'DURASI_DESC' : 'DURASI_ASC');
      else if (col === 'wsid' && nextDir === 'asc') setOpenSortBy('WSID_ASC');
      else if (col === 'startTime' && nextDir === 'desc') setOpenSortBy('TIME_DESC');
    } else {
      setOpenSortColumn(col);
      const defaultDir = col === 'durasiOpr' || col === 'chronic' || col === 'startTime' ? 'desc' : 'asc';
      setOpenSortDirection(defaultDir);
      if (col === 'durasiOpr') setOpenSortBy(defaultDir === 'desc' ? 'DURASI_DESC' : 'DURASI_ASC');
      else if (col === 'wsid' && defaultDir === 'asc') setOpenSortBy('WSID_ASC');
      else if (col === 'startTime' && defaultDir === 'desc') setOpenSortBy('TIME_DESC');
    }
  };

  const handleOpenSortByChange = (val: 'DURASI_DESC' | 'DURASI_ASC' | 'WSID_ASC' | 'TIME_DESC') => {
    setOpenSortBy(val);
    setCurrentPageOpen(1);
    if (val === 'DURASI_DESC') {
      setOpenSortColumn('durasiOpr');
      setOpenSortDirection('desc');
    } else if (val === 'DURASI_ASC') {
      setOpenSortColumn('durasiOpr');
      setOpenSortDirection('asc');
    } else if (val === 'WSID_ASC') {
      setOpenSortColumn('wsid');
      setOpenSortDirection('asc');
    } else if (val === 'TIME_DESC') {
      setOpenSortColumn('startTime');
      setOpenSortDirection('desc');
    }
  };

  const totalPagesOpen = Math.ceil(sortedOpenIncidents.length / pageSizeOpen) || 1;
  const paginatedOpenIncidents = useMemo(() => {
    const start = (currentPageOpen - 1) * pageSizeOpen;
    return sortedOpenIncidents.slice(start, start + pageSizeOpen);
  }, [sortedOpenIncidents, currentPageOpen, pageSizeOpen]);

  const hasActiveOpenFilters = useMemo(() => {
    return (
      openCardFilter !== 'ALL' ||
      openSearch.trim() !== '' ||
      selectedEventCodesOpen.length > 0 ||
      selectedOpenSPs.length > 0 ||
      selectedOpenSektors.length > 0 ||
      selectedOpenVendors.length > 0 ||
      selectedOpenTipes.length > 0 ||
      openStartDate !== 'ALL' ||
      openEndDate !== 'ALL' ||
      openDurationFilter !== 'ALL' ||
      openActionFilter !== 'ALL' ||
      openChronicFilter !== 'ALL'
    );
  }, [
    openCardFilter,
    openSearch,
    selectedEventCodesOpen,
    selectedOpenSPs,
    selectedOpenSektors,
    selectedOpenVendors,
    selectedOpenTipes,
    openStartDate,
    openEndDate,
    openDurationFilter,
    openActionFilter,
    openChronicFilter
  ]);

  const handleResetOpenFilters = () => {
    setOpenCardFilter('ALL');
    setOpenSearch('');
    setSelectedEventCodesOpen([]);
    setSelectedOpenSPs([]);
    setSelectedOpenSektors([]);
    setSelectedOpenVendors([]);
    setSelectedOpenTipes([]);
    setOpenStartDate('ALL');
    setOpenEndDate('ALL');
    setOpenDurationFilter('ALL');
    setOpenActionFilter('ALL');
    setOpenChronicFilter('ALL');
    setCurrentPageOpen(1);
  };

  const toggleOpenSP = (sp: string) => {
    setSelectedOpenSPs((prev) =>
      prev.includes(sp) ? prev.filter((s) => s !== sp) : [...prev, sp]
    );
    setCurrentPageOpen(1);
  };
  const selectAllOpenSPs = () => {
    setSelectedOpenSPs([...openAvailableSPs]);
    setCurrentPageOpen(1);
  };
  const clearAllOpenSPs = () => {
    setSelectedOpenSPs([]);
    setCurrentPageOpen(1);
  };

  const toggleOpenSektor = (sk: string) => {
    setSelectedOpenSektors((prev) =>
      prev.includes(sk) ? prev.filter((s) => s !== sk) : [...prev, sk]
    );
    setCurrentPageOpen(1);
  };
  const selectAllOpenSektors = () => {
    setSelectedOpenSektors([...openAvailableSektors]);
    setCurrentPageOpen(1);
  };
  const clearAllOpenSektors = () => {
    setSelectedOpenSektors([]);
    setCurrentPageOpen(1);
  };

  const toggleOpenVendor = (vd: string) => {
    setSelectedOpenVendors((prev) =>
      prev.includes(vd) ? prev.filter((v) => v !== vd) : [...prev, vd]
    );
    setCurrentPageOpen(1);
  };
  const selectAllOpenVendors = () => {
    setSelectedOpenVendors([...openAvailableVendors]);
    setCurrentPageOpen(1);
  };
  const clearAllOpenVendors = () => {
    setSelectedOpenVendors([]);
    setCurrentPageOpen(1);
  };

  const toggleOpenTipe = (tipe: string) => {
    setSelectedOpenTipes((prev) =>
      prev.includes(tipe) ? prev.filter((t) => t !== tipe) : [...prev, tipe]
    );
    setCurrentPageOpen(1);
  };
  const selectAllOpenTipes = () => {
    setSelectedOpenTipes(['ATM', 'CRM']);
    setCurrentPageOpen(1);
  };
  const clearAllOpenTipes = () => {
    setSelectedOpenTipes([]);
    setCurrentPageOpen(1);
  };

  // Base sets dari master data (dihitung SEKALI saat catalog master dimuat, bebas dari iterasi riwayat puluhan ribu baris)
  const baseOpenEvents = useMemo(() => {
    const set = new Set<string>();
    TARGET_EVENT_CODES.forEach((c) => set.add(c));
    return Array.from(set);
  }, []);

  /** Daftar seluruh Event Code / Problem yang ada */
  const openAvailableEvents = useMemo(() => {
    const set = new Set<string>(baseOpenEvents);
    for (let i = 0; i < trulyOpenIncidents.length; i++) {
      const r = trulyOpenIncidents[i];
      if (r.eventCodeDesc && r.eventCodeDesc.trim()) set.add(r.eventCodeDesc.trim());
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [baseOpenEvents, trulyOpenIncidents]);

  const toggleEventCodeOpen = (code: string) => {
    setSelectedEventCodesOpen((prev) => {
      if (prev.includes(code)) {
        return prev.filter((c) => c !== code);
      } else {
        return [...prev, code];
      }
    });
    setCurrentPageOpen(1);
  };

  const selectAllEventCodesOpen = () => {
    const q = eventCodeSearchOpen.trim().toLowerCase();
    const toSelect = q
      ? openAvailableEvents.filter((c) => c.toLowerCase().includes(q))
      : openAvailableEvents;
    setSelectedEventCodesOpen((prev) => Array.from(new Set([...prev, ...toSelect])));
    setCurrentPageOpen(1);
  };

  const clearAllEventCodesOpen = () => {
    setSelectedEventCodesOpen([]);
    setCurrentPageOpen(1);
  };

  const baseOpenSPs = useMemo(() => {
    const set = new Set<string>();
    // Baseline daftar resmi seluruh Service Point BCA
    ['ACJK', 'ACBT', 'ACCK', 'ACSR', 'ACBS', 'ACRW', 'TAG'].forEach((sp) => set.add(sp));
    if (masterList && masterList.length > 0) {
      for (let i = 0; i < masterList.length; i++) {
        const m = masterList[i];
        const sp = resolveServicePoint(m);
        if (sp && sp !== '-' && sp !== 'N/A') set.add(sp);
      }
    }
    return Array.from(set).filter(Boolean);
  }, [masterList]);

  const openAvailableSPs = useMemo(() => {
    const set = new Set<string>(baseOpenSPs);
    for (let i = 0; i < trulyOpenIncidents.length; i++) {
      const r = trulyOpenIncidents[i];
      const sp = resolveServicePoint(null, r);
      if (sp && sp !== '-' && sp !== 'N/A') set.add(sp);
      const sekSp = getServicePointForSektor(r.sektor);
      if (sekSp && sekSp !== '-' && sekSp !== 'N/A') set.add(sekSp);
    }
    return Array.from(set).filter(Boolean).sort((a, b) => a.localeCompare(b));
  }, [baseOpenSPs, trulyOpenIncidents]);

  const baseOpenSektors = useMemo(() => {
    const set = new Set<string>();
    if (masterList && masterList.length > 0) {
      for (let i = 0; i < masterList.length; i++) {
        const m = masterList[i];
        const sk = cleanSektorName(m.Sektor || m.sektor || m.sektorBCA || '');
        if (sk && sk !== '-') set.add(sk);
      }
    }
    return Array.from(set);
  }, [masterList]);

  const openAvailableSektors = useMemo(() => {
    const set = new Set<string>(baseOpenSektors);
    for (let i = 0; i < trulyOpenIncidents.length; i++) {
      const r = trulyOpenIncidents[i];
      const sk = cleanSektorName(r.sektor);
      if (sk && sk !== '-') set.add(sk);
    }
    const allList = Array.from(set);

    // KETIKA USER MEMILIH SERVICE POINT, FILTER SEKTOR HANYA TAMPILKAN PILIHAN SEKTOR MILIK SP TERPILIH!
    if (selectedOpenSPs.length > 0) {
      const filtered = allList.filter((sk) => {
        const mappedSp = getServicePointForSektor(sk);
        return selectedOpenSPs.some((sp) => normSP(sp) === normSP(mappedSp));
      });
      return filtered.sort((a, b) => a.localeCompare(b));
    }

    return allList.sort((a, b) => a.localeCompare(b));
  }, [baseOpenSektors, trulyOpenIncidents, selectedOpenSPs]);

  // Otomatis bersihkan selectedOpenSektors jika pilihan Service Point berubah
  useEffect(() => {
    if (selectedOpenSPs.length > 0 && selectedOpenSektors.length > 0) {
      setSelectedOpenSektors((prev) =>
        prev.filter((sk) => {
          const mappedSp = getServicePointForSektor(sk);
          return selectedOpenSPs.some((sp) => normSP(sp) === normSP(mappedSp));
        })
      );
    }
  }, [selectedOpenSPs]);

  const baseOpenVendors = useMemo(() => {
    const set = new Set<string>();
    // Ambil vendor dari seluruh master mesin (static catalog & store)
    try {
      getMachinesMap().forEach((meta) => {
        if (meta.vendor && meta.vendor !== '-' && meta.vendor !== 'N/A') set.add(meta.vendor);
      });
    } catch (_) {}
    if (masterList && masterList.length > 0) {
      for (let i = 0; i < masterList.length; i++) {
        const m = masterList[i];
        const vd = (m.vendor || m.Vendor || (m as any).vendorMesin || (m as any)['Vendor'] || '').trim();
        if (vd && vd !== '-' && vd !== 'N/A' && vd !== 'UNKNOWN') set.add(vd);
      }
    }
    return Array.from(set);
  }, [masterList]);

  const openAvailableVendors = useMemo(() => {
    const set = new Set<string>(baseOpenVendors);
    for (let i = 0; i < trulyOpenIncidents.length; i++) {
      const r = trulyOpenIncidents[i];
      const vd = (r.vendor || '').trim();
      if (vd && vd !== '-' && vd !== 'N/A' && vd !== 'UNKNOWN') set.add(vd);
    }
    // Fallback daftar vendor umum BCA jika belum terhidrasi
    if (set.size === 0) {
      ['ABG', 'ACH', 'ARG', 'Diebold Nixdorf', 'Hitachi', 'HYO', 'IBM', 'ITM', 'NCR', 'OKI'].forEach((v) => set.add(v));
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [baseOpenVendors, trulyOpenIncidents]);

  // =========================================================================
  // PRECOMPUTED COUNTS UNTUK DROPDOWN (O(1) lookup saat JSX render)
  // =========================================================================
  const openEventCountMap = useMemo(() => {
    const map = new Map<string, number>();
    for (let i = 0; i < openIncidents.length; i++) {
      const code = openIncidents[i].eventCodeDesc;
      if (code) map.set(code, (map.get(code) || 0) + 1);
    }
    return map;
  }, [openIncidents]);

  const openSpCountMap = useMemo(() => {
    const counts = new Map<string, number>();
    const normTargets = openAvailableSPs.map((sp) => ({ sp, norm: normSP(sp), lower: sp.toLowerCase() }));
    for (let i = 0; i < trulyOpenIncidents.length; i++) {
      const r = trulyOpenIncidents[i];
      const itemNorm = normSP(resolveServicePoint(null, r));
      const sekNorm = normSP(getServicePointForSektor(r.sektor));
      const rawNorm = normSP(r.servicePoint);
      const rawLower = (r.servicePoint || '').toLowerCase();
      for (let j = 0; j < normTargets.length; j++) {
        const t = normTargets[j];
        if (itemNorm === t.norm || sekNorm === t.norm || rawNorm === t.norm || rawLower.includes(t.lower)) {
          counts.set(t.sp, (counts.get(t.sp) || 0) + 1);
        }
      }
    }
    return counts;
  }, [openAvailableSPs, trulyOpenIncidents]);

  const openSektorCountMap = useMemo(() => {
    const map = new Map<string, number>();
    for (let i = 0; i < openIncidents.length; i++) {
      const sk = openIncidents[i].sektor;
      if (sk) map.set(sk, (map.get(sk) || 0) + 1);
    }
    return map;
  }, [openIncidents]);

  const openVendorCountMap = useMemo(() => {
    const counts = new Map<string, number>();
    for (let i = 0; i < openAvailableVendors.length; i++) {
      const vd = openAvailableVendors[i];
      const v = vd.trim().toUpperCase();
      let c = 0;
      for (let j = 0; j < trulyOpenIncidents.length; j++) {
        const r = trulyOpenIncidents[j];
        const itemVendor = (r.vendor || '').trim().toUpperCase();
        if (v === itemVendor) { c++; continue; }
        if ((v === 'ARG' || v === 'ABG' || v === 'OKI') && (itemVendor === 'ARG' || itemVendor === 'ABG' || itemVendor === 'OKI')) { c++; continue; }
        if ((v === 'ITM' || v === 'IBM' || v === 'OMRON') && (itemVendor === 'ITM' || itemVendor === 'IBM' || itemVendor === 'OMRON')) { c++; continue; }
        if ((v === 'HYO' || v === 'HYOSUNG') && (itemVendor === 'HYO' || itemVendor === 'HYOSUNG')) { c++; continue; }
        if ((v === 'ITH' || v === 'HITACHI') && (itemVendor === 'ITH' || itemVendor === 'HITACHI')) { c++; continue; }
        if ((v === 'ACH' || v === 'GLORY') && (itemVendor === 'ACH' || itemVendor === 'GLORY')) { c++; continue; }
        if (itemVendor.includes(v) || v.includes(itemVendor)) { c++; continue; }
      }
      counts.set(vd, c);
    }
    return counts;
  }, [openAvailableVendors, trulyOpenIncidents]);

  const openTipeCountMap = useMemo(() => {
    let countAtm = 0;
    let countCrm = 0;
    for (let i = 0; i < trulyOpenIncidents.length; i++) {
      const r = trulyOpenIncidents[i];
      const modelStr = (r.typeMesin || '').toUpperCase();
      const j = (r.jenisMesin || (modelStr.includes('OMRON') || modelStr.includes('RG8') || modelStr.includes('8600') || modelStr.includes('SR7500') || modelStr.includes('CRM') || modelStr.includes('ATS') || modelStr.includes('CDM') ? 'CRM' : 'ATM')).toUpperCase();
      if (j === 'ATM' || modelStr.includes('ATM')) countAtm++;
      if (j === 'CRM' || j === 'CDM' || j === 'DDM' || j === 'ATS' || modelStr.includes('CRM')) countCrm++;
    }
    const map = new Map<string, number>();
    map.set('ATM', countAtm);
    map.set('CRM', countCrm);
    return map;
  }, [trulyOpenIncidents]);

  const historyEventCountMap = useMemo(() => {
    if (activeTab !== 'HISTORY') return new Map<string, number>();
    const map = new Map<string, number>();
    for (let i = 0; i < historyResults.length; i++) {
      const code = historyResults[i].eventCodeDesc;
      if (code) map.set(code, (map.get(code) || 0) + 1);
    }
    return map;
  }, [activeTab, historyResults]);

  // =========================================================================
  // DRAWER & SINGLE ACTION HANDLERS
  // =========================================================================
  const handleOpenDetailDrawer = async (inc: OpenIncidentItem) => {
    setActiveIncidentDetail(inc);
    setSingleActionText('');
    setActionSaveSuccess(false);
    setIsDrawerOpen(true);
    setIncidentHistory([]);
    setIsLoadingHistory(true);

    try {
      const mStr = extractMonthStr(inc.tanggal || inc.startTime || inc.monthStr, historyMonth);
      const res = await getIncidentHistoryApi(inc.incidentKey, mStr);
      let combinedHistory = (res && res.success && Array.isArray(res.history)) ? [...res.history] : [];

      // Masukkan riwayat penanganan dari Tiket Follow Up jika ada untuk mesin ini
      const wsidClean = inc.wsid.trim().toUpperCase();
      const relatedTickets = (modernTickets || []).filter((t) => t.wsid.trim().toUpperCase() === wsidClean);
      for (const t of relatedTickets) {
        combinedHistory.push({
          logId: `TKT_REQ_${t.ticketId}`,
          waktu: toWibDateTimeString(t.createdAt),
          incidentKey: inc.incidentKey,
          wsid: inc.wsid,
          eventCodeDesc: t.problem || inc.eventCodeDesc,
          tipe: 'PENANGANAN',
          isiAction: `[TIKET ${t.ticketId}] Permintaan Follow Up (${t.kategori}): ${t.catatanRequest}`,
          namaPetugas: t.createdBy,
          statusSebelum: 'OPEN',
          statusSesudah: t.status,
          catatan: `Prioritas: ${t.prioritas}`
        });

        if (Array.isArray(t.progresList)) {
          for (const p of t.progresList) {
            combinedHistory.push({
              logId: `TKT_PROG_${t.ticketId}_${p.id || p.waktu}`,
              waktu: toWibDateTimeString(p.waktu),
              incidentKey: inc.incidentKey,
              wsid: inc.wsid,
              eventCodeDesc: t.problem || inc.eventCodeDesc,
              tipe: 'PENANGANAN',
              isiAction: `[TIKET ${t.ticketId}] Penanganan: ${p.catatan}`,
              namaPetugas: p.petugas,
              statusSebelum: 'IN_PROGRESS',
              statusSesudah: t.status,
              catatan: '-'
            });
          }
        }

        if (t.reqCloseInfo) {
          combinedHistory.push({
            logId: `TKT_CLOSE_${t.ticketId}`,
            waktu: toWibDateTimeString(t.reqCloseInfo.requestedAt),
            incidentKey: inc.incidentKey,
            wsid: inc.wsid,
            eventCodeDesc: t.problem || inc.eventCodeDesc,
            tipe: 'PENANGANAN',
            isiAction: `[TIKET ${t.ticketId}] Pengajuan Selesai: ${t.reqCloseInfo.catatanPenyelesaian}`,
            namaPetugas: t.reqCloseInfo.requestedBy,
            statusSebelum: 'IN_PROGRESS',
            statusSesudah: 'REQ_CLOSE',
            catatan: t.reqCloseInfo.statusMesinSaatReq || '-'
          });
        }
      }

      setIncidentHistory(combinedHistory.sort((a, b) => b.waktu.localeCompare(a.waktu)));
    } catch (e) {
      console.warn('Gagal memuat riwayat tindakan dari Supabase:', e);
      setIncidentHistory([]);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  const handleCloseDrawer = () => {
    setIsDrawerOpen(false);
    setActiveIncidentDetail(null);
  };

  const addQuickNote = (note: string) => {
    setSingleActionText((prev) => {
      const trimmed = prev.trim();
      if (!trimmed) return note;
      if (trimmed.includes(note)) return prev;
      return `${trimmed}; ${note}`;
    });
  };

  const handleSubmitSingleAction = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!activeIncidentDetail) return;
    if (!requirePetugasName()) return;
    if (!singleActionText.trim()) {
      alert('Isi catatan tindakan tidak boleh kosong!');
      return;
    }

    const rawActionText = singleActionText.trim();
    const actionText = rawActionText.startsWith('[') ? rawActionText : `[${actionCategory}] ${rawActionText}`;
    const petugas = formatPetugasSignature(petugasName);
    const incKey = activeIncidentDetail.incidentKey;
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const nowTimeStr = `${pad(now.getDate())}/${pad(now.getMonth() + 1)}/${now.getFullYear()} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
    const nowFullStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;

    const newActionItem: IncidentHistoryItem = {
      logId: 'ACT_' + Date.now(),
      waktu: nowFullStr,
      incidentKey: incKey,
      wsid: activeIncidentDetail.wsid,
      eventCodeDesc: activeIncidentDetail.eventCodeDesc,
      tipe: actionCategory,
      isiAction: rawActionText,
      namaPetugas: petugas,
      statusSebelum: 'OPEN',
      statusSesudah: 'OPEN',
      catatan: '-'
    };

    // Snapshot state untuk rollback jika update ke Supabase gagal
    const previousHistory = [...incidentHistory];
    const previousDetail = activeIncidentDetail ? { ...activeIncidentDetail } : null;
    const previousOpen = [...openIncidents];
    const previousDaily = [...allDailyIncidents];

    // Optimistic UI Update
    setIncidentHistory((prev) => [newActionItem, ...prev]);

    setActiveIncidentDetail((prev) =>
      prev
        ? {
          ...prev,
          actionTerakhir: actionText,
          actionTerakhirOleh: petugas,
          actionTerakhirWaktu: nowTimeStr,
          jumlahAction: (prev.jumlahAction || 0) + 1
        }
        : null
    );

    setOpenIncidents((prev) =>
      prev.map((item) => {
        const isMatch = (item.incidentKey === incKey) ||
          (activeIncidentDetail.incidentNumber && activeIncidentDetail.incidentNumber !== '-' && item.incidentNumber === activeIncidentDetail.incidentNumber) ||
          (item.wsid === activeIncidentDetail.wsid && item.eventCodeDesc === activeIncidentDetail.eventCodeDesc);
        if (isMatch) {
          return {
            ...item,
            actionTerakhir: actionText,
            actionTerakhirOleh: petugas,
            actionTerakhirWaktu: nowTimeStr,
            jumlahAction: (item.jumlahAction || 0) + 1
          };
        }
        return item;
      })
    );

    setAllDailyIncidents((prev) => {
      const next = prev.map((item) => {
        const key = item.incidentNumber || `${item.wsid}|${item.eventCodeDesc}|${item.startTime}`;
        const isMatch = (item.incidentNumber && item.incidentNumber !== '-' && item.incidentNumber === incKey) ||
          key === incKey ||
          (activeIncidentDetail && item.wsid === activeIncidentDetail.wsid && item.eventCodeDesc === activeIncidentDetail.eventCodeDesc);
        if (isMatch) {
          return {
            ...item,
            actionTerakhir: actionText,
            actionTerakhirOleh: petugas,
            actionTerakhirWaktu: nowTimeStr,
            jumlahAction: (item.jumlahAction || 0) + 1
          };
        }
        return item;
      });
      allDailyIncidentsRef.current = next;
      return next;
    });

    setSingleActionText('');
    setActionSaveSuccess(true);
    setTimeout(() => setActionSaveSuccess(false), 3000);

    const mStr = extractMonthStr(activeIncidentDetail.tanggal || activeIncidentDetail.startTime || activeIncidentDetail.monthStr, historyMonth);
    try {
      const res = await saveIncidentActionApi({
        incidentKey: incKey,
        monthStr: mStr,
        wsid: activeIncidentDetail.wsid,
        eventCodeDesc: activeIncidentDetail.eventCodeDesc,
        isiAction: rawActionText,
        kategori: actionCategory,
        namaPetugas: petugas
      });

      if (!res || !res.success) {
        throw new Error(res?.message || 'Gagal menyimpan catatan ke database Supabase');
      }
    } catch (err: any) {
      console.error('Update tindakan Supabase gagal, rollback state:', err);
      // Rollback Optimistic Update
      setIncidentHistory(previousHistory);
      setActiveIncidentDetail(previousDetail);
      setOpenIncidents(previousOpen);
      setAllDailyIncidents(previousDaily);
      allDailyIncidentsRef.current = previousDaily;
      setSingleActionText(rawActionText);
      alert(`Gagal menyimpan tindakan ke database: ${err?.message || 'Koneksi bermasalah'}. Data telah dikembalikan.`);
    }
  };

  // =========================================================================
  // BULK ACTION HANDLERS
  // =========================================================================
  const handleToggleSelectAll = () => {
    if (selectedIncidentKeys.size === filteredOpenIncidents.length) {
      setSelectedIncidentKeys(new Set());
    } else {
      setSelectedIncidentKeys(new Set(filteredOpenIncidents.map((r) => r.incidentKey)));
    }
  };

  const handleToggleSelectKey = (key: string) => {
    const next = new Set(selectedIncidentKeys);
    if (next.has(key)) {
      next.delete(key);
    } else {
      next.add(key);
    }
    setSelectedIncidentKeys(next);
  };

  const handleSubmitBulkAction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedIncidentKeys.size === 0) return;
    if (!requirePetugasName()) return;
    if (!bulkActionText.trim()) {
      alert('Isi Action wajib diisi!');
      return;
    }

    const rawActionText = bulkActionText.trim();
    const actionText = rawActionText.startsWith('[') ? rawActionText : `[${bulkActionCategory}] ${rawActionText}`;
    const petugas = formatPetugasSignature(petugasName);
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const nowTimeStr = `${pad(now.getDate())}/${pad(now.getMonth() + 1)}/${now.getFullYear()} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;

    // Snapshot state untuk rollback jika Supabase gagal
    const previousOpen = [...openIncidents];
    const previousDaily = [...allDailyIncidents];
    const prevSelectedKeys = new Set(selectedIncidentKeys);

    // Optimistic UI Update
    setOpenIncidents((prev) =>
      prev.map((item) =>
        selectedIncidentKeys.has(item.incidentKey)
          ? {
            ...item,
            actionTerakhir: actionText,
            actionTerakhirOleh: petugas,
            actionTerakhirWaktu: nowTimeStr,
            jumlahAction: (item.jumlahAction || 0) + 1
          }
          : item
      )
    );

    setAllDailyIncidents((prev) => {
      const next = prev.map((item) => {
        const key = item.incidentNumber || `${item.wsid}|${item.eventCodeDesc}|${item.startTime}`;
        const isSelected = selectedIncidentKeys.has(key) || (item.incidentNumber && selectedIncidentKeys.has(item.incidentNumber));
        if (isSelected) {
          return {
            ...item,
            actionTerakhir: actionText,
            actionTerakhirOleh: petugas,
            actionTerakhirWaktu: nowTimeStr,
            jumlahAction: (item.jumlahAction || 0) + 1
          };
        }
        return item;
      });
      allDailyIncidentsRef.current = next;
      return next;
    });

    const itemsToUpdate = openIncidents
      .filter((r) => selectedIncidentKeys.has(r.incidentKey))
      .map((r) => ({
        incidentKey: r.incidentKey,
        monthStr: extractMonthStr(r.tanggal || r.startTime || r.monthStr, historyMonth),
        wsid: r.wsid,
        eventCodeDesc: r.eventCodeDesc
      }));

    setShowBulkModal(false);
    setBulkActionText('');
    setSelectedIncidentKeys(new Set());

    try {
      const res = await bulkSaveIncidentActionApi({
        items: itemsToUpdate,
        isiAction: rawActionText,
        kategori: bulkActionCategory,
        namaPetugas: petugas
      });

      if (!res || !res.success) {
        throw new Error(res?.message || 'Gagal menyimpan bulk action ke database Supabase');
      }
    } catch (err: any) {
      console.error('Sync bulk action ke Supabase gagal, rollback state:', err);
      // Rollback Optimistic Update
      setOpenIncidents(previousOpen);
      setAllDailyIncidents(previousDaily);
      allDailyIncidentsRef.current = previousDaily;
      setSelectedIncidentKeys(prevSelectedKeys);
      alert(`Gagal menyimpan tindakan massal ke database: ${err?.message || 'Koneksi terganggu'}. Data telah dikembalikan.`);
    }
  };

  // =========================================================================
  // TAB 2: LOGIC FREKUENSI
  // =========================================================================
  const aggFreqItems = freqMatrix;

  const freqAvailableEvents = useMemo(() => {
    const set = new Set<string>();
    freqMatrix.forEach((r) => {
      if (r.eventCodeDesc && r.eventCodeDesc.trim()) {
        set.add(r.eventCodeDesc.trim());
      }
    });
    if (set.size === 0) {
      TARGET_EVENT_CODES.forEach((c) => set.add(c));
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [freqMatrix]);

  const freqAvailableMonths = useMemo(() => {
    const set = new Set<string>(availableFreqMonths);
    set.add(getCurrentWibMonth());
    set.add('2026-10');
    set.add('2026-09');
    return Array.from(set).sort((a, b) => b.localeCompare(a));
  }, [availableFreqMonths]);

  const freqAvailableSPs = useMemo(() => {
    const set = new Set<string>();
    if (masterList && masterList.length > 0) {
      masterList.forEach((m: any) => {
        const sp = resolveServicePoint(m);
        if (sp && sp !== '-' && sp !== 'N/A') set.add(sp);
      });
    }
    allDailyIncidents.forEach((r) => {
      const sp = resolveServicePoint(null, r);
      if (sp && sp !== '-' && sp !== 'N/A') set.add(sp);
      if (r.servicePointSektor && r.servicePointSektor !== '-') {
        const p = normalizeServicePoint(r.servicePointSektor.split('-')[0].trim());
        if (p && p !== '-' && p !== 'N/A') set.add(p);
      }
    });
    openIncidents.forEach((r) => {
      const sp = resolveServicePoint(null, r);
      if (sp && sp !== '-' && sp !== 'N/A') set.add(sp);
    });
    aggFreqItems.forEach((r) => {
      if (r.servicePointSektor && r.servicePointSektor !== '-') {
        const sp = normalizeServicePoint(r.servicePointSektor.split('-')[0].trim());
        if (sp && sp !== '-' && sp !== 'N/A') set.add(sp);
      }
    });
    return Array.from(set).filter(Boolean).sort((a, b) => a.localeCompare(b));
  }, [masterList, allDailyIncidents, openIncidents, aggFreqItems]);

  // Click outside to close dropdowns
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        eventCodeDropdownRefOpen.current &&
        !eventCodeDropdownRefOpen.current.contains(event.target as Node)
      ) {
        setIsEventCodeDropdownOpenOpen(false);
      }
      if (
        spDropdownRefOpen.current &&
        !spDropdownRefOpen.current.contains(event.target as Node)
      ) {
        setIsSpDropdownOpenOpen(false);
      }
      if (
        sektorDropdownRefOpen.current &&
        !sektorDropdownRefOpen.current.contains(event.target as Node)
      ) {
        setIsSektorDropdownOpenOpen(false);
      }
      if (
        vendorDropdownRefOpen.current &&
        !vendorDropdownRefOpen.current.contains(event.target as Node)
      ) {
        setIsVendorDropdownOpenOpen(false);
      }
      if (
        tipeDropdownRefOpen.current &&
        !tipeDropdownRefOpen.current.contains(event.target as Node)
      ) {
        setIsTipeDropdownOpenOpen(false);
      }
      if (
        eventCodeDropdownRefFreq.current &&
        !eventCodeDropdownRefFreq.current.contains(event.target as Node)
      ) {
        setIsEventCodeDropdownOpenFreq(false);
      }
      if (
        eventCodeDropdownRefHistory.current &&
        !eventCodeDropdownRefHistory.current.contains(event.target as Node)
      ) {
        setIsEventCodeDropdownOpenHistory(false);
      }
      if (
        grafik24SektorRef.current &&
        !grafik24SektorRef.current.contains(event.target as Node)
      ) {
        setIsGrafik24SektorOpen(false);
      }
      if (
        grafik24ProblemRef.current &&
        !grafik24ProblemRef.current.contains(event.target as Node)
      ) {
        setIsGrafik24ProblemOpen(false);
      }
      if (
        frekuensiMenuRef.current &&
        !frekuensiMenuRef.current.contains(event.target as Node)
      ) {
        setIsFrekuensiMenuOpen(false);
      }
      if (
        gfProblemRef.current &&
        !gfProblemRef.current.contains(event.target as Node)
      ) {
        setIsGfProblemOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const toggleEventCodeFreq = (code: string) => {
    setSelectedEventCodesFreq((prev) => {
      if (prev.includes(code)) {
        return prev.filter((c) => c !== code);
      } else {
        return [...prev, code];
      }
    });
    setCurrentPageFreq(1);
  };

  const selectAllEventCodesFreq = () => {
    const q = eventCodeSearchFreq.trim().toLowerCase();
    const toSelect = q
      ? freqAvailableEvents.filter((c) => c.toLowerCase().includes(q))
      : freqAvailableEvents;
    setSelectedEventCodesFreq((prev) => Array.from(new Set([...prev, ...toSelect])));
    setCurrentPageFreq(1);
  };

  const clearAllEventCodesFreq = () => {
    setSelectedEventCodesFreq([]);
    setCurrentPageFreq(1);
  };

  const filteredFreqItems = useMemo(() => {
    if (activeTab !== 'FREKUENSI') return [];
    return aggFreqItems.filter((item) => {
      if (freqSearch) {
        const q = freqSearch.toLowerCase();
        const matchWsid = item.wsid.toLowerCase().includes(q);
        const matchLok = item.lokasi.toLowerCase().includes(q);
        const matchSp = item.servicePointSektor.toLowerCase().includes(q);
        const matchProblem = item.eventCodeDesc.toLowerCase().includes(q);
        if (!matchWsid && !matchLok && !matchSp && !matchProblem) return false;
      }
      if (selectedEventCodesFreq.length > 0 && !selectedEventCodesFreq.includes(item.eventCodeDesc)) {
        return false;
      }
      if (freqServicePoint !== 'ALL') {
        const target = freqServicePoint.trim().toLowerCase();
        const rawSp = ((item as any).servicePoint || '').toLowerCase();
        const rawSpSektor = (item.servicePointSektor || '').toLowerCase();
        const firstPart = rawSpSektor.includes('-') ? rawSpSektor.split('-')[0].trim() : rawSpSektor;
        if (!rawSp.includes(target) && !firstPart.includes(target) && !rawSpSektor.includes(target)) {
          return false;
        }
      }
      if (freqStartDate !== 'ALL' || freqEndDate !== 'ALL') {
        const countInRange = freqDates.reduce((acc, d) => {
          if (isDateInRange(d, freqStartDate, freqEndDate)) {
            return acc + (item.dateCounts?.[d] || 0);
          }
          return acc;
        }, 0);
        if (countInRange <= 0) return false;
      } else if (freqDateFilter !== 'ALL' && (!item.dateCounts?.[freqDateFilter] || item.dateCounts[freqDateFilter] <= 0)) {
        return false;
      }
      return true;
    });
  }, [activeTab, aggFreqItems, freqSearch, selectedEventCodesFreq, freqServicePoint, freqStartDate, freqEndDate, freqDateFilter, freqDates]);

  const displayedFreqDates = useMemo(() => {
    if (activeTab !== 'FREKUENSI') return freqDates;
    if (freqStartDate === 'ALL' && freqEndDate === 'ALL') return freqDates;
    return freqDates.filter((d) => isDateInRange(d, freqStartDate, freqEndDate));
  }, [activeTab, freqDates, freqStartDate, freqEndDate]);

  const sortedFreqItems = useMemo(() => {
    if (activeTab !== 'FREKUENSI') return [];
    const list = [...filteredFreqItems];
    const isDateFiltered = freqStartDate !== 'ALL' || freqEndDate !== 'ALL' || freqDateFilter !== 'ALL';

    const getItemCount = (item: any) => {
      if (!isDateFiltered) return item.totalFrekuensi;
      return displayedFreqDates.reduce((acc, d) => acc + (item.dateCounts?.[d] || 0), 0);
    };

    list.sort((a, b) => {
      let aVal: any = 0;
      let bVal: any = 0;

      if (sortFieldFreq === 'totalFrekuensi') {
        aVal = getItemCount(a);
        bVal = getItemCount(b);
      } else if (sortFieldFreq === 'totalDurasi') {
        const getDur = (it: any) => {
          if (!isDateFiltered) return it.totalDurasi;
          const exact = displayedFreqDates.reduce((acc, d) => acc + (it.dateDurations?.[d] || 0), 0);
          if (exact > 0) return exact;
          const cnt = displayedFreqDates.reduce((acc, d) => acc + (it.dateCounts?.[d] || 0), 0);
          return it.totalFrekuensi > 0 ? Math.round((it.totalDurasi / it.totalFrekuensi) * cnt) : 0;
        };
        aVal = getDur(a);
        bVal = getDur(b);
      } else if (sortFieldFreq === 'wsid') {
        return sortDirectionFreq === 'asc' ? a.wsid.localeCompare(b.wsid) : b.wsid.localeCompare(a.wsid);
      } else if (sortFieldFreq === 'lokasi') {
        return sortDirectionFreq === 'asc' ? a.lokasi.localeCompare(b.lokasi) : b.lokasi.localeCompare(a.lokasi);
      } else if (sortFieldFreq === 'servicePointSektor') {
        return sortDirectionFreq === 'asc' ? a.servicePointSektor.localeCompare(b.servicePointSektor) : b.servicePointSektor.localeCompare(a.servicePointSektor);
      } else if (sortFieldFreq === 'eventCodeDesc') {
        return sortDirectionFreq === 'asc' ? a.eventCodeDesc.localeCompare(b.eventCodeDesc) : b.eventCodeDesc.localeCompare(a.eventCodeDesc);
      } else if (freqDates.includes(sortFieldFreq)) {
        aVal = a.dateCounts?.[sortFieldFreq] || 0;
        bVal = b.dateCounts?.[sortFieldFreq] || 0;
      }

      if (typeof aVal === 'number' && typeof bVal === 'number') {
        if (aVal !== bVal) {
          return sortDirectionFreq === 'asc' ? aVal - bVal : bVal - aVal;
        }
        return getItemCount(b) - getItemCount(a);
      }
      return 0;
    });
    return list;
  }, [activeTab, filteredFreqItems, sortFieldFreq, sortDirectionFreq, freqDates, displayedFreqDates, freqStartDate, freqEndDate, freqDateFilter]);

  const totalPagesFreq = Math.ceil(sortedFreqItems.length / pageSizeFreq) || 1;
  const paginatedFreqItems = useMemo(() => {
    if (activeTab !== 'FREKUENSI') return [];
    const start = (currentPageFreq - 1) * pageSizeFreq;
    return sortedFreqItems.slice(start, start + pageSizeFreq);
  }, [activeTab, sortedFreqItems, currentPageFreq, pageSizeFreq]);

  const handleSortFreq = (field: string) => {
    setCurrentPageFreq(1);
    if (sortFieldFreq === field) {
      setSortDirectionFreq(sortDirectionFreq === 'asc' ? 'desc' : 'asc');
    } else {
      setSortFieldFreq(field);
      setSortDirectionFreq('desc');
    }
  };

  // Map WSID to count of Penanganan
  const wsidPenangananCountMap = useMemo(() => {
    if (activeTab !== 'FREKUENSI') return new Map<string, number>();
    const map = new Map<string, number>();

    allDailyIncidents.forEach((r) => {
      const act = r.actionTerakhir || '';
      if (act && act !== '-' && (act.toUpperCase().includes('PENANGANAN') || act.startsWith('[PENANGANAN]'))) {
        const key = r.wsid.trim().toUpperCase();
        map.set(key, (map.get(key) || 0) + 1);
      }
    });

    try {
      const raw = localStorage.getItem(LOCAL_STORAGE_ACTIONS);
      if (raw) {
        const list: IncidentHistoryItem[] = JSON.parse(raw);
        list.forEach((a) => {
          if (a.tipe === 'PENANGANAN' || (a.isiAction && a.isiAction.includes('[PENANGANAN]'))) {
            const key = (a.wsid || '').trim().toUpperCase();
            if (key) {
              map.set(key, (map.get(key) || 0) + 1);
            }
          }
        });
      }
    } catch (e) { }

    return map;
  }, [allDailyIncidents, incidentHistory]);

  const handleOpenFreqDetail = async (item: WsidProblemDateAggregation, prefilteredDate?: string) => {
    setSelectedFreqItemForDetail(item);
    setFreqDetailDateFilter(prefilteredDate || 'ALL');
    setFreqDetailOnlyWithNotes(true);
    setShowAddPenangananInModal(false);
    setModalPenangananText('');
    setModalPenangananCategory('PENANGANAN');
    setModalPenangananDate(prefilteredDate || Object.keys(item.dateCounts || {})[0] || '');
    setIsLoadingFreqDetail(true);

    try {
      const [histRes, rawRes] = await Promise.all([
        getWsidPenangananHistoryApi(item.wsid),
        getFrequencyDetailApi({
          wsid: item.wsid,
          problem: item.eventCodeDesc,
          month: freqMonth !== 'ALL' ? freqMonth : undefined
        })
      ]);

      if (histRes.success && histRes.history) {
        setFreqDetailHistory(histRes.history);
      } else {
        setFreqDetailHistory([]);
      }

      if (rawRes.success && rawRes.rows) {
        setFreqDetailIncidents(rawRes.rows);
      } else {
        setFreqDetailIncidents([]);
      }
    } catch (e) {
      console.warn('Gagal memuat riwayat penanganan server:', e);
      setFreqDetailHistory([]);
      setFreqDetailIncidents([]);
    } finally {
      setIsLoadingFreqDetail(false);
    }
  };

  const handleCloseFreqDetail = () => {
    setSelectedFreqItemForDetail(null);
    setFreqDetailHistory([]);
    setFreqDetailIncidents([]);
    setShowAddPenangananInModal(false);
  };

  const handleSaveModalPenanganan = async () => {
    if (!selectedFreqItemForDetail) return;
    if (!requirePetugasName()) return;
    if (!modalPenangananText.trim()) {
      alert('Isi catatan penanganan wajib diisi!');
      return;
    }

    setIsSavingModalPenanganan(true);
    const rawAction = modalPenangananText.trim();
    const formattedAction = rawAction.startsWith('[') ? rawAction : `[${modalPenangananCategory}] ${rawAction}`;
    const petugas = formatPetugasSignature(petugasName);
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const nowTimeStr = `${pad(now.getDate())}/${pad(now.getMonth() + 1)}/${now.getFullYear()} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
    const nowFullStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
    const fakeKey = `FREQ_${selectedFreqItemForDetail.wsid}_${Date.now()}`;

    const newHistoryItem: IncidentHistoryItem = {
      logId: 'ACT_' + Date.now(),
      waktu: nowFullStr,
      incidentKey: fakeKey,
      wsid: selectedFreqItemForDetail.wsid,
      eventCodeDesc: selectedFreqItemForDetail.eventCodeDesc,
      tipe: modalPenangananCategory,
      isiAction: rawAction,
      namaPetugas: petugas,
      statusSebelum: 'OPEN',
      statusSesudah: 'OPEN',
      catatan: modalPenangananDate ? `Penanganan problem tanggal ${modalPenangananDate}` : '-'
    };

    setFreqDetailHistory((prev) => [newHistoryItem, ...prev]);

    setAllDailyIncidents((prev) => {
      const next = prev.map((item) => {
        if (
          item.wsid.trim().toUpperCase() === selectedFreqItemForDetail.wsid.trim().toUpperCase() &&
          (!modalPenangananDate || item.dateStr === modalPenangananDate)
        ) {
          return {
            ...item,
            actionTerakhir: formattedAction,
            actionTerakhirOleh: petugas,
            actionTerakhirWaktu: nowTimeStr,
            jumlahAction: (item.jumlahAction || 0) + 1
          };
        }
        return item;
      });
      return next;
    });

    try {
      await saveIncidentActionApi({
        incidentKey: fakeKey,
        monthStr: historyMonth,
        wsid: selectedFreqItemForDetail.wsid,
        eventCodeDesc: selectedFreqItemForDetail.eventCodeDesc,
        isiAction: rawAction,
        kategori: modalPenangananCategory,
        namaPetugas: petugas
      });
    } catch (err) {
      console.warn('Sync penanganan server terkendala, tetap tersimpan lokal:', err);
    } finally {
      setIsSavingModalPenanganan(false);
      setModalPenangananText('');
      setShowAddPenangananInModal(false);
    }
  };

  const freqDateNotesCountMap = useMemo(() => {
    if (!selectedFreqItemForDetail) return new Map<string, number>();
    const targetWsid = selectedFreqItemForDetail.wsid.trim().toUpperCase();
    const map = new Map<string, number>();

    freqDetailIncidents.forEach((r: any) => {
      if ((r.wsid || '').trim().toUpperCase() !== targetWsid) return;
      const act = r.actionTerakhir && r.actionTerakhir !== '-' ? r.actionTerakhir : (r.comment || r.keterangan || '');
      if (act && act.trim() !== '' && act.trim() !== '-') {
        const d = r.dateStr || '';
        if (d) {
          map.set(d, (map.get(d) || 0) + 1);
        }
      }
    });

    freqDetailHistory.forEach((h) => {
      const act = (h.isiAction || '').trim();
      if (!act || act === '-') return;
      const dMatch = (h.catatan || '').match(/\b\d{1,2}[-/]\d{1,2}(?:[-/]\d{2,4})?\b/) ||
        (h.waktu || '').match(/\b\d{1,2}[-/]\d{1,2}(?:[-/]\d{2,4})?\b/);
      if (dMatch) {
        const d = dMatch[0];
        map.set(d, (map.get(d) || 0) + 1);
      }
    });

    return map;
  }, [selectedFreqItemForDetail, freqDetailIncidents, freqDetailHistory]);

  const freqDetailRows = useMemo(() => {
    if (!selectedFreqItemForDetail) return [];
    const targetWsid = selectedFreqItemForDetail.wsid.trim().toUpperCase();
    const targetProblem = (selectedFreqItemForDetail.eventCodeDesc || '').trim().toLowerCase();

    const matched = freqDetailIncidents.filter((r) => {
      const matchWsid = r.wsid.trim().toUpperCase() === targetWsid;
      const matchProblem = !targetProblem || (r.eventCodeDesc || '').trim().toLowerCase() === targetProblem;
      if (!matchWsid || !matchProblem) return false;
      if (freqDetailDateFilter !== 'ALL') {
        const isExactMatch = r.dateStr === freqDetailDateFilter;
        const isNormMatch = normalizeDateStr(r.dateStr) === normalizeDateStr(freqDetailDateFilter);
        if (!isExactMatch && !isNormMatch) return false;
      }
      return true;
    });

    const rows: {
      id: string;
      tanggalJam: string;
      dateStr: string;
      durasi: number;
      status: 'OPEN' | 'SOLVED';
      kategori: 'PENANGANAN' | 'UPDATE' | 'NONE';
      actionText: string;
      petugas: string;
    }[] = [];

    const matchedHistKeys = new Set<string>();

    matched.forEach((item, idx) => {
      const r = item as any;
      const act = r.actionTerakhir && r.actionTerakhir !== '-' ? r.actionTerakhir : (r.comment || r.keterangan || '');
      let kategori: 'PENANGANAN' | 'UPDATE' | 'NONE' = 'NONE';
      if (act) {
        if (act.toUpperCase().includes('PENANGANAN') || act.startsWith('[PENANGANAN]')) {
          kategori = 'PENANGANAN';
        } else if (act.toUpperCase().includes('UPDATE') || act.startsWith('[UPDATE]')) {
          kategori = 'UPDATE';
        } else {
          if (/replenish|slm|jaringan|ganti|perbaikan|reboot|part|listrik/i.test(act)) {
            kategori = 'PENANGANAN';
          } else {
            kategori = 'UPDATE';
          }
        }
      }

      const histMatch = freqDetailHistory.find((h) => {
        const hKey = h.logId || `${h.waktu}_${h.isiAction}`;
        if (matchedHistKeys.has(hKey)) return false;
        if (h.waktu && r.dateStr && (h.waktu.includes(r.dateStr) || normalizeDateStr(h.waktu) === normalizeDateStr(r.dateStr))) return true;
        if (h.catatan && r.dateStr && h.catatan.includes(r.dateStr)) return true;
        return false;
      });

      if (histMatch) {
        matchedHistKeys.add(histMatch.logId || `${histMatch.waktu}_${histMatch.isiAction}`);
      }

      const finalAction = act || histMatch?.isiAction || '';
      const finalKategori = kategori !== 'NONE' ? kategori : (histMatch?.tipe === 'PENANGANAN' ? 'PENANGANAN' : histMatch ? 'UPDATE' : 'NONE');
      const finalPetugas = r.actionTerakhirOleh && r.actionTerakhirOleh !== '-' ? r.actionTerakhirOleh : (histMatch?.namaPetugas || '-');

      rows.push({
        id: r.incidentNumber || `${r.dateStr}_${r.startTime || ''}_${idx}`,
        tanggalJam: `${r.dateStr || ''} ${r.startTime || r.hourStr || ''}`.trim(),
        dateStr: r.dateStr || '',
        durasi: r.durasi || 0,
        status: (r.endTime && r.endTime !== '-' && r.endTime.trim() !== '') ? 'SOLVED' : 'OPEN',
        kategori: finalKategori,
        actionText: finalAction.replace(/^\[(UPDATE|PENANGANAN)\]\s*/i, '').trim(),
        petugas: finalPetugas
      });
    });

    // Sertakan juga item riwayat tindakan dari server/history yang belum terpetakan
    freqDetailHistory.forEach((h, hIdx) => {
      const hKey = h.logId || `${h.waktu}_${h.isiAction}`;
      if (matchedHistKeys.has(hKey)) return;

      const hWsid = (h.wsid || '').trim().toUpperCase();
      if (hWsid && hWsid !== targetWsid) return;

      if (freqDetailDateFilter !== 'ALL') {
        const matchWaktu = h.waktu && (h.waktu.includes(freqDetailDateFilter) || normalizeDateStr(h.waktu) === normalizeDateStr(freqDetailDateFilter));
        const matchCatatan = h.catatan && h.catatan.includes(freqDetailDateFilter);
        if (!matchWaktu && !matchCatatan) return;
      }

      const actionText = (h.isiAction || '').replace(/^\[(UPDATE|PENANGANAN)\]\s*/i, '').trim();
      if (!actionText || actionText === '-') return;

      const kategori = (h.tipe === 'PENANGANAN' || h.isiAction.includes('[PENANGANAN]')) ? 'PENANGANAN' : 'UPDATE';

      rows.push({
        id: hKey || `hist_${hIdx}`,
        tanggalJam: h.waktu || '-',
        dateStr: h.waktu ? h.waktu.split(' ')[0] : '',
        durasi: 0,
        status: 'SOLVED',
        kategori,
        actionText,
        petugas: h.namaPetugas || '-'
      });
    });

    // Default: tampilkan yang ada catatannya saja
    if (freqDetailOnlyWithNotes) {
      return rows.filter((row) => row.actionText && row.actionText.trim() !== '' && row.actionText.trim() !== '-');
    }

    return rows;
  }, [selectedFreqItemForDetail, frequencyDataset, freqDetailDateFilter, freqDetailHistory, freqDetailOnlyWithNotes]);

  const updateTabFreqScrollMetrics = useCallback(() => {
    const el = tabFreqTableContainerRef.current;
    if (!el) {
      setShowFloatingScrollbarFreq(false);
      return;
    }

    const rect = el.getBoundingClientRect();
    const scrollW = el.scrollWidth;
    const clientW = el.clientWidth;
    const isScrollable = scrollW > clientW + 10;
    const isBottomOffscreen = rect.bottom > window.innerHeight;
    const isTableOnscreen = rect.top < window.innerHeight - 60 && rect.bottom > 100;

    const shouldShow = isScrollable && isTableOnscreen && isBottomOffscreen;

    setTabFreqScrollWidth(scrollW);
    setFloatingBarLeftFreq(rect.left);
    setFloatingBarWidthFreq(rect.width);
    setShowFloatingScrollbarFreq(shouldShow);

    if (floatingScrollbarRefFreq.current && !isSyncingScrollFreqRef.current) {
      floatingScrollbarRefFreq.current.scrollLeft = el.scrollLeft;
    }
  }, []);

  useEffect(() => {
    if (activeTab !== 'FREKUENSI') {
      setShowFloatingScrollbarFreq(false);
      return;
    }

    const el = tabFreqTableContainerRef.current;
    if (!el) return;

    let scrollParent: Element | Window = window;
    let parent = el.parentElement;
    while (parent) {
      const style = window.getComputedStyle(parent);
      if (style.overflowY === 'auto' || style.overflowY === 'scroll') {
        scrollParent = parent;
        break;
      }
      parent = parent.parentElement;
    }

    const handleScrollOrResize = () => {
      updateTabFreqScrollMetrics();
    };

    updateTabFreqScrollMetrics();

    scrollParent.addEventListener('scroll', handleScrollOrResize, { passive: true });
    window.addEventListener('scroll', handleScrollOrResize, { passive: true });
    window.addEventListener('resize', handleScrollOrResize, { passive: true });

    const resizeObserver = new ResizeObserver(() => {
      updateTabFreqScrollMetrics();
    });
    resizeObserver.observe(el);

    const timer = setTimeout(updateTabFreqScrollMetrics, 100);

    return () => {
      clearTimeout(timer);
      scrollParent.removeEventListener('scroll', handleScrollOrResize);
      window.removeEventListener('scroll', handleScrollOrResize);
      window.removeEventListener('resize', handleScrollOrResize);
      resizeObserver.disconnect();
    };
  }, [activeTab, paginatedFreqItems, pageSizeFreq, updateTabFreqScrollMetrics]);

  const handleTabFreqTableScroll = () => {
    if (isSyncingScrollFreqRef.current) return;
    const tableEl = tabFreqTableContainerRef.current;
    const floatEl = floatingScrollbarRefFreq.current;
    if (!tableEl || !floatEl) return;

    isSyncingScrollFreqRef.current = true;
    floatEl.scrollLeft = tableEl.scrollLeft;
    requestAnimationFrame(() => {
      isSyncingScrollFreqRef.current = false;
    });
  };

  const handleFloatingScrollFreq = () => {
    if (isSyncingScrollFreqRef.current) return;
    const tableEl = tabFreqTableContainerRef.current;
    const floatEl = floatingScrollbarRefFreq.current;
    if (!tableEl || !floatEl) return;

    isSyncingScrollFreqRef.current = true;
    tableEl.scrollLeft = floatEl.scrollLeft;
    requestAnimationFrame(() => {
      isSyncingScrollFreqRef.current = false;
    });
  };

  // =========================================================================
  // TAB 3: LOGIC HISTORY PROBLEM
  // =========================================================================
  const handleSearchHistory = async (forceRefresh = false) => {
    if (!forceRefresh && historyCacheRef.current[historyMonth]) {
      setHistoryResults(historyCacheRef.current[historyMonth]);
      return;
    }

    if (!forceRefresh && allDailyIncidents.length > 0) {
      const mappedLocal = allDailyIncidents.map((r, idx) => {
        const key = (r.incidentNumber && r.incidentNumber !== '-' && r.incidentNumber !== 'N/A')
          ? `${r.incidentNumber}__${r.wsid}__${idx}`
          : `${r.wsid}|${r.eventCodeDesc}|${r.startTime}|${idx}`;
        const sTime = formatStartProblemTime(r.startTime) !== '-' ? formatStartProblemTime(r.startTime) : getDisplayStartTime(r);
        const eTime = formatStartProblemTime(r.endTime);
        const dText = (!r.detail || r.detail === '-' || isDateLikeString(r.detail)) ? '-' : r.detail;

        let actionText = (r.actionTerakhir && r.actionTerakhir !== '-' && !isTechnicalMachineLog(r.actionTerakhir)) ? r.actionTerakhir : '-';
        const hasAction = actionText !== '-';
        const spParts = (r.servicePointSektor || '').split('-');
        const compDate = toComparableDate(sTime || r.dateStr || r.tanggal || '');
        const epochStart = parseToEpoch(sTime);
        const epochEnd = parseToEpoch(eTime);
        const searchIdx = `${r.wsid || ''} ${r.lokasi || ''} ${r.eventCodeDesc || ''} ${r.servicePoint || spParts[0]?.trim() || ''} ${r.sektor || spParts[1]?.trim() || ''} ${r.vendorMesin || r.vendor || ''} ${r.typeMesin || ''} ${actionText} ${dText}`.toLowerCase();

        return {
          incidentKey: key,
          incidentNumber: r.incidentNumber || '-',
          wsid: r.wsid,
          lokasi: r.lokasi || '-',
          servicePoint: r.servicePoint || spParts[0]?.trim() || '-',
          sektor: r.sektor || spParts[1]?.trim() || '-',
          typeMesin: r.typeMesin || '-',
          vendor: r.vendorMesin || '-',
          eventCode: r.eventCode || '-',
          eventCodeDesc: r.eventCodeDesc,
          detail: dText,
          startTime: sTime,
          endTime: eTime,
          tanggal: r.dateStr || '-',
          jam: r.hourStr || '00:00',
          durationRaw: r.rawDuration || 0,
          durasiOpr: r.durasi || 0,
          status: (!isEndTimeFilled(r.endTime)) ? 'OPEN' : 'CLOSED',
          actionTerakhir: actionText,
          actionTerakhirOleh: hasAction ? (r.actionTerakhirOleh && r.actionTerakhirOleh !== '-' && r.actionTerakhirOleh !== 'CSV' && r.actionTerakhirOleh !== 'CSV Comment' ? r.actionTerakhirOleh : 'Petugas') : '-',
          actionTerakhirWaktu: hasAction ? (r.actionTerakhirWaktu && r.actionTerakhirWaktu !== '-' ? r.actionTerakhirWaktu : sTime) : '-',
          jumlahAction: hasAction ? (r.jumlahAction || 1) : 0,
          monthStr: extractMonthStr(r.dateStr || r.startTime, historyMonth),
          closeSource: (!isEndTimeFilled(r.endTime))
            ? '-'
            : (r.closeSource === 'DASHBOARD' || r.actionTerakhirOleh === 'Sistem Dashboard' || (typeof actionText === 'string' && actionText.includes('[AUTO-CLOSE]'))
              ? 'DASHBOARD'
              : 'OASE'),
          comment: r.comment || undefined,
          keterangan: actionText !== '-' ? actionText : undefined,
          _compDate: compDate,
          _epochStart: epochStart,
          _epochEnd: epochEnd,
          _search: searchIdx
        } as any;
      });
      historyCacheRef.current[historyMonth] = mappedLocal;
      setHistoryResults(mappedLocal);
      return;
    }

    setIsLoadingSearchHistory(true);
    try {
      const res = await searchIncidentsApi({
        monthStr: historyMonth,
        query: historyQuery,
        status: historyStatus,
        eventCodeDesc: selectedEventCodesHistory.length === 1 ? selectedEventCodesHistory[0] : 'ALL',
        eventCodes: selectedEventCodesHistory.length > 0 ? selectedEventCodesHistory : undefined
      });
      if (res.success && res.incidents) {
        const clean = res.incidents.map((it, idx) => {
          const sTime = formatStartProblemTime(it.startTime) !== '-' ? formatStartProblemTime(it.startTime) : getDisplayStartTime(it);
          const eTime = formatStartProblemTime(it.endTime);
          const dText = (!it.detail || it.detail === '-' || isDateLikeString(it.detail)) ? '-' : it.detail;
          const isClosed = isEndTimeFilled(it.endTime);
          const closeSrc: 'OASE' | 'DASHBOARD' | '-' = !isClosed
            ? '-'
            : (it.closeSource === 'DASHBOARD' || it.actionTerakhirOleh === 'Sistem Dashboard' || (typeof it.actionTerakhir === 'string' && it.actionTerakhir.includes('[AUTO-CLOSE]'))
              ? 'DASHBOARD'
              : 'OASE');
          const compDate = toComparableDate(sTime || it.tanggal || '');
          const epochStart = parseToEpoch(sTime);
          const epochEnd = parseToEpoch(eTime);
          const searchIdx = `${it.wsid || ''} ${it.lokasi || ''} ${it.eventCodeDesc || ''} ${it.servicePoint || ''} ${it.sektor || ''} ${it.vendor || ''} ${it.typeMesin || ''} ${it.actionTerakhir || ''} ${dText}`.toLowerCase();
          const key = (it.incidentNumber && it.incidentNumber !== '-' && it.incidentNumber !== 'N/A')
            ? `${it.incidentNumber}__${it.wsid}__${idx}`
            : `${it.wsid}|${it.eventCodeDesc}|${sTime}|${idx}`;
          return {
            ...it,
            incidentKey: key,
            detail: dText,
            startTime: sTime,
            endTime: eTime,
            closeSource: closeSrc,
            _compDate: compDate,
            _epochStart: epochStart,
            _epochEnd: epochEnd,
            _search: searchIdx
          } as any;
        });
        historyCacheRef.current[historyMonth] = clean;
        setHistoryResults(clean);
      } else {
        setHistoryResults([]);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoadingSearchHistory(false);
    }
  };

  // =========================================================================
  // TAB GRAFIK FREKUENSI PROBLEM 24 JAM (00:00 - 23:00) LOGIC
  // =========================================================================

  /**
   * Helper ekstraksi jam (0..23) dari baris problem
   */
  const getHourFromRecord = useCallback((r: any): number => {
    if (typeof r.hourNumber === 'number' && !isNaN(r.hourNumber) && r.hourNumber >= 0 && r.hourNumber <= 23) {
      return r.hourNumber;
    }
    const hStr = r.hourStr || r.jam || '';
    const m1 = String(hStr).match(/^(\d{1,2}):/);
    if (m1) {
      const h = parseInt(m1[1], 10);
      if (h >= 0 && h <= 23) return h;
    }
    const sTime = r.startTime || '';
    const m2 = String(sTime).match(/(?:[T\s]|^)(\d{1,2}):(\d{2})/);
    if (m2) {
      const h = parseInt(m2[1], 10);
      if (h >= 0 && h <= 23) return h;
    }
    return 0;
  }, []);

  /**
   * Daftar Service Point unik untuk filter Grafik 24 Jam
   */
  const grafik24AvailableSPs = useMemo(() => {
    const set = new Set<string>();
    if (openAvailableSPs && openAvailableSPs.length > 0) {
      openAvailableSPs.forEach((sp) => {
        const s = normalizeServicePoint(sp);
        if (s) set.add(s);
      });
    }
    if (masterList && masterList.length > 0) {
      masterList.forEach((m: any) => {
        const sp = resolveServicePoint(m);
        if (sp && sp !== '-' && sp !== 'N/A') set.add(sp);
      });
    }
    frequencyDataset.forEach((r) => {
      const sp = resolveServicePoint(null, r);
      if (sp && sp !== '-' && sp !== 'N/A') set.add(sp);
    });
    return Array.from(set).filter(Boolean).sort((a, b) => a.localeCompare(b));
  }, [openAvailableSPs, masterList, frequencyDataset]);

  /**
   * Daftar Sektor unik untuk filter Grafik 24 Jam (mengikuti filter Service Point jika dipilih)
   */
  const grafik24AvailableSektors = useMemo(() => {
    const set = new Set<string>();
    const targetSpNorm = grafik24Sp !== 'ALL' ? normSP(grafik24Sp) : '';

    frequencyDataset.forEach((r) => {
      if (targetSpNorm) {
        const rowSp = normSP(resolveServicePoint(null, r));
        const rowSpSek = normSP(r.servicePointSektor);
        if (rowSp !== targetSpNorm && !rowSpSek.includes(targetSpNorm)) {
          return;
        }
      }
      const sk = cleanSektorName(r.sektor);
      if (sk && sk !== '-' && sk !== 'N/A') set.add(sk);
    });

    if (masterList && masterList.length > 0) {
      masterList.forEach((m: any) => {
        if (targetSpNorm) {
          const mSp = normSP(resolveServicePoint(m));
          if (mSp !== targetSpNorm) return;
        }
        const sk = cleanSektorName(m.Sektor || m.sektor || m.sektorBCA || '');
        if (sk && sk !== '-' && sk !== 'N/A') set.add(sk);
      });
    }

    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [frequencyDataset, rawMasterData, grafik24Sp]);

  /**
   * Daftar Tanggal unik dari dataset problem untuk filter tanggal harian
   */
  const grafik24AvailableDates = useMemo(() => {
    const set = new Set<string>();
    frequencyDataset.forEach((r) => {
      if (r.dateStr && r.dateStr !== '-' && r.dateStr.trim() !== '') {
        set.add(r.dateStr.trim());
      }
    });
    return Array.from(set).sort((a, b) => {
      const pA = a.split(/[-/]/);
      const pB = b.split(/[-/]/);
      if (pA.length === 3 && pB.length === 3) {
        const yA = pA[2].length === 2 ? `20${pA[2]}` : pA[2];
        const yB = pB[2].length === 2 ? `20${pB[2]}` : pB[2];
        const sA = `${yA}-${pA[1].padStart(2, '0')}-${pA[0].padStart(2, '0')}`;
        const sB = `${yB}-${pB[1].padStart(2, '0')}-${pB[0].padStart(2, '0')}`;
        return sA.localeCompare(sB);
      }
      return a.localeCompare(b);
    });
  }, [frequencyDataset]);

  /**
   * Daftar Problem unik dari dataset problem untuk filter jenis problem
   */
  const grafik24AvailableProblems = useMemo(() => {
    const set = new Set<string>();
    frequencyDataset.forEach((r) => {
      const code = (r.eventCodeDesc || r.eventCode || '').trim();
      if (code && code !== '-' && code !== 'N/A') set.add(code);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [frequencyDataset]);

  /**
   * Filter dataset problem 24 jam berdasarkan SP, Sektor, Tanggal, dan Jenis Problem
   */
  const filtered24hIncidents = useMemo(() => {
    if (activeTab !== 'GRAFIK_24JAM') return [];
    return frequencyDataset.filter((r) => {
      if (grafik24Sp !== 'ALL') {
        const targetSpNorm = normSP(grafik24Sp);
        const rowSp = normSP(r.servicePoint);
        const rowSpSek = normSP(r.servicePointSektor);
        if (rowSp !== targetSpNorm && !rowSpSek.includes(targetSpNorm)) {
          return false;
        }
      }

      if (grafik24Sektor !== 'ALL') {
        const targetSek = cleanSektorName(grafik24Sektor).toUpperCase();
        const rowSek = cleanSektorName(r.sektor).toUpperCase();
        if (rowSek !== targetSek) {
          return false;
        }
      }

      if (grafik24Problem !== 'ALL') {
        const targetProb = grafik24Problem.trim().toLowerCase();
        const rowProb = (r.eventCodeDesc || r.eventCode || '').trim().toLowerCase();
        if (rowProb !== targetProb) {
          return false;
        }
      }

      if (!isDateInRange(r.dateStr, grafik24StartDate, grafik24EndDate)) {
        return false;
      }

      return true;
    });
  }, [activeTab, frequencyDataset, grafik24Sp, grafik24Sektor, grafik24Problem, grafik24StartDate, grafik24EndDate]);

  /**
   * Agregasi 24 Jam (00:00 s/d 23:00) lengkap dengan kalkulasi Peak Hour
   */
  const hourly24Distribution = useMemo(() => {
    const buckets: {
      hour: number;
      hourLabel: string;
      hourRange: string;
      rows: any[];
      count: number;
      totalDurasi: number;
      openCount: number;
      solvedCount: number;
      topProblems: { code: string; count: number }[];
    }[] = [];

    for (let h = 0; h < 24; h++) {
      const padH = String(h).padStart(2, '0');
      buckets.push({
        hour: h,
        hourLabel: `${padH}:00`,
        hourRange: `${padH}:00 - ${padH}:59`,
        rows: [],
        count: 0,
        totalDurasi: 0,
        openCount: 0,
        solvedCount: 0,
        topProblems: []
      });
    }

    if (activeTab !== 'GRAFIK_24JAM') {
      return {
        buckets: buckets.map((b) => ({ ...b, isPeak: false, percentage: 0 })),
        maxCount: 0,
        totalCount: 0
      };
    }

    filtered24hIncidents.forEach((r) => {
      const h = getHourFromRecord(r);
      if (h >= 0 && h < 24) {
        buckets[h].rows.push(r);
        buckets[h].count++;
        buckets[h].totalDurasi += r.durasi || 0;
        const isSolved = r.endTime && r.endTime !== '-' && r.endTime.trim() !== '';
        if (isSolved) {
          buckets[h].solvedCount++;
        } else {
          buckets[h].openCount++;
        }
      }
    });

    buckets.forEach((b) => {
      const probMap: Record<string, number> = {};
      b.rows.forEach((r) => {
        const code = r.eventCodeDesc || r.eventCode || 'Problem Tidak Terspesifikasi';
        probMap[code] = (probMap[code] || 0) + 1;
      });
      b.topProblems = Object.entries(probMap)
        .map(([code, count]) => ({ code, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 3);
    });

    const maxCount = Math.max(...buckets.map((b) => b.count), 0);
    const totalAll = buckets.reduce((sum, b) => sum + b.count, 0) || 0;

    return {
      buckets: buckets.map((b) => ({
        ...b,
        isPeak: maxCount > 0 && b.count === maxCount,
        percentage: totalAll > 0 ? Math.round((b.count / totalAll) * 100) : 0
      })),
      maxCount,
      totalCount: totalAll
    };
  }, [activeTab, filtered24hIncidents, getHourFromRecord]);

  /**
   * Detail informasi Peak Hour (puncak kejadian dalam 24 jam)
   */
  const peakHourInfo = useMemo(() => {
    if (activeTab !== 'GRAFIK_24JAM') {
      return {
        peakHourStr: '-',
        peakCount: 0,
        percentage: 0,
        peakHours: [] as number[],
        description: ''
      };
    }
    const { buckets, maxCount, totalCount } = hourly24Distribution;
    if (maxCount === 0 || totalCount === 0) {
      return {
        peakHourStr: '-',
        peakCount: 0,
        percentage: 0,
        peakHours: [] as number[],
        description: grafik24Problem !== 'ALL'
          ? `Belum ada data untuk problem "${grafik24Problem}" pada filter saat ini.`
          : 'Belum ada problem yang tercatat pada filter saat ini.'
      };
    }

    const peaks = buckets.filter((b) => b.isPeak);
    const peakHourNumbers = peaks.map((p) => p.hour);
    const peakHourStr = peaks.map((p) => `${String(p.hour).padStart(2, '0')}:00`).join(' & ');
    const pct = totalCount > 0 ? Math.round((maxCount / totalCount) * 100) : 0;
    const problemPrefix = grafik24Problem !== 'ALL' ? `Problem "${grafik24Problem}"` : 'Problem';

    return {
      peakHourStr,
      peakCount: maxCount,
      percentage: pct,
      peakHours: peakHourNumbers,
      description: `Puncak frekuensi ${problemPrefix} (Peak Hour) terdeteksi pada pukul ${peakHourStr} dengan total ${maxCount} kejadian problem (${pct}% dari seluruh problem pada filter ini).`
    };
  }, [activeTab, hourly24Distribution, grafik24Problem]);

  /**
   * Baris data problem yang ditampilkan pada tabel (jam terpilih atau seluruh jam jika belum dipilih)
   */
  const displayed24hRows = useMemo(() => {
    if (activeTab !== 'GRAFIK_24JAM') return [];
    let baseList: any[] = [];
    if (selectedHour24 !== null) {
      const bucket = hourly24Distribution.buckets.find((b) => b.hour === selectedHour24);
      baseList = bucket ? bucket.rows : [];
    } else {
      baseList = filtered24hIncidents;
    }

    if (!grafik24Search.trim()) return baseList;

    const q = grafik24Search.trim().toLowerCase();
    return baseList.filter((r) => {
      const wsid = (r.wsid || '').toLowerCase();
      const lok = (r.lokasi || '').toLowerCase();
      const prob = (r.eventCodeDesc || r.eventCode || '').toLowerCase();
      const sp = (r.servicePoint || r.servicePointSektor || '').toLowerCase();
      const sek = (r.sektor || '').toLowerCase();
      const act = (r.actionTerakhir || '').toLowerCase();
      const pet = (r.actionTerakhirOleh || '').toLowerCase();
      return (
        wsid.includes(q) ||
        lok.includes(q) ||
        prob.includes(q) ||
        sp.includes(q) ||
        sek.includes(q) ||
        act.includes(q) ||
        pet.includes(q)
      );
    });
  }, [activeTab, selectedHour24, hourly24Distribution, filtered24hIncidents, grafik24Search]);

  const totalPages24 = Math.ceil(displayed24hRows.length / grafik24PageSize) || 1;
  const paginated24hRows = useMemo(() => {
    if (activeTab !== 'GRAFIK_24JAM') return [];
    const start = (grafik24CurrentPage - 1) * grafik24PageSize;
    return displayed24hRows.slice(start, start + grafik24PageSize);
  }, [activeTab, displayed24hRows, grafik24CurrentPage, grafik24PageSize]);

  const handleExportOpenToExcel = () => {
    const dateStamp = new Date().toISOString().slice(0, 10);
    const fileName = `Problem_Open_${dateStamp}.xlsx`;
    exportDailyIncidentsToExcel(
      filteredOpenIncidents.map((r: any) => {
        const cInfo = r.incidentKey ? chronicInfoMap.get(r.incidentKey) : undefined;
        return {
          wsid: r.wsid,
          lokasi: r.lokasi || '-',
          servicePointSektor: r.servicePoint && r.sektor ? `${r.servicePoint} - ${r.sektor}` : (r.servicePoint || r.sektor || '-'),
          servicePoint: r.servicePoint || '',
          sektor: r.sektor || '',
          typeMesin: r.typeMesin || '-',
          vendorMesin: r.vendor || '-',
          startTime: r.startTime || '-',
          endTime: r.endTime || '-',
          durasi: r.durasiOpr || r.durationRaw || 0,
          rawDuration: r.durationRaw || 0,
          eventCodeDesc: r.eventCodeDesc || '-',
          eventCode: r.eventCode || '-',
          detail: r.detail || '-',
          actionTerakhir: r.actionTerakhir || '-',
          actionTerakhirOleh: r.actionTerakhirOleh || '-',
          actionTerakhirWaktu: r.actionTerakhirWaktu || '-',
          status: 'OPEN',
          chronic: cInfo?.isChronic
            ? (cInfo.is3xSehari ? `CHRONIC (${cInfo.sameDayCount}x Sehari)` : `CHRONIC (${cInfo.fiveDayCount}x/5 Hari)`)
            : 'NORMAL'
        };
      }) as any,
      fileName
    );
  };

  const handleExport24hToExcel = () => {
    const hourLabel = selectedHour24 !== null ? `Jam_${String(selectedHour24).padStart(2, '0')}` : '24_Jam';
    const dateStamp = new Date().toISOString().slice(0, 10);
    const fileName = `Frekuensi_Problem_${hourLabel}_${dateStamp}.xlsx`;
    exportDailyIncidentsToExcel(
      displayed24hRows.map((r) => ({
        wsid: r.wsid,
        lokasi: r.lokasi,
        servicePointSektor: r.servicePointSektor || `${r.servicePoint || ''} - ${r.sektor || ''}`,
        servicePoint: r.servicePoint || '',
        sektor: r.sektor || '',
        typeMesin: r.typeMesin || '',
        vendorMesin: r.vendorMesin || r.vendor || '',
        startTime: r.startTime || '',
        endTime: r.endTime || '',
        dateStr: r.dateStr || '',
        hourStr: r.hourStr || r.jam || '',
        durasi: r.durasi || 0,
        eventCodeDesc: r.eventCodeDesc || r.eventCode || '',
        actionTerakhir: r.actionTerakhir || '',
        actionTerakhirOleh: r.actionTerakhirOleh || '',
        status: (r.endTime && r.endTime !== '-' && r.endTime.trim() !== '') ? 'SOLVED' : 'OPEN'
      })) as any,
      fileName
    );
  };

  const handleOpenActionFrom24h = (row: any) => {
    const incItem: OpenIncidentItem = {
      incidentKey: row.incidentNumber || `HOURLY_${row.wsid}_${row.dateStr || ''}_${row.hourStr || ''}`,
      incidentNumber: row.incidentNumber || '-',
      wsid: row.wsid,
      lokasi: row.lokasi,
      servicePoint: row.servicePoint || '',
      sektor: row.sektor || '',
      typeMesin: row.typeMesin || '',
      vendor: row.vendorMesin || row.vendor || '',
      eventCodeDesc: row.eventCodeDesc || row.eventCode || '',
      eventCode: row.eventCode || '',
      startTime: row.startTime || '',
      endTime: row.endTime || '',
      tanggal: row.dateStr || '',
      jam: row.hourStr || row.jam || '',
      durasiOpr: row.durasi || 0,
      durationRaw: row.rawDuration || row.durasi || 0,
      status: (row.endTime && row.endTime !== '-' && row.endTime.trim() !== '') ? 'SOLVED' : 'OPEN',
      actionTerakhir: row.actionTerakhir || '',
      actionTerakhirOleh: row.actionTerakhirOleh || '',
      actionTerakhirWaktu: row.actionTerakhirWaktu || '',
      jumlahAction: row.jumlahAction || 0,
      monthStr: historyMonth,
      detail: row.detail || '-',
      comment: row.comment || undefined,
      keterangan: row.keterangan || undefined
    };
    handleOpenDetailDrawer(incItem);
  };

  const handleOpenWsidHistoryFrom24h = (row: any) => {
    const aggItem = aggFreqItems.find(
      (a) => a.wsid.trim().toUpperCase() === row.wsid.trim().toUpperCase()
    ) || {
      wsid: row.wsid,
      lokasi: row.lokasi,
      servicePointSektor: row.servicePointSektor || `${row.servicePoint || ''} - ${row.sektor || ''}`,
      eventCodeDesc: row.eventCodeDesc || '',
      totalFrekuensi: 1,
      totalDurasi: row.durasi || 0,
      dateCounts: { [row.dateStr || 'Hari Ini']: 1 }
    };
    handleOpenFreqDetail(aggItem, row.dateStr);
  };

  useEffect(() => {
    if (activeTab === 'HISTORY') {
      handleSearchHistory();
    }
  }, [activeTab, historyMonth]);

  const toggleEventCodeHistory = (code: string) => {
    setSelectedEventCodesHistory((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]
    );
    setCurrentPageHistory(1);
  };

  const selectAllEventCodesHistory = () => {
    const q = eventCodeSearchHistory.trim().toLowerCase();
    const toSelect = q
      ? historyAvailableEvents.filter((c) => c.toLowerCase().includes(q))
      : historyAvailableEvents;
    setSelectedEventCodesHistory((prev) => Array.from(new Set([...prev, ...toSelect])));
    setCurrentPageHistory(1);
  };

  const clearAllEventCodesHistory = () => {
    setSelectedEventCodesHistory([]);
    setCurrentPageHistory(1);
  };

  const filteredHistory = useMemo(() => {
    if (activeTab !== 'HISTORY') return [];
    const hasStatus = historyStatus !== 'ALL';
    const hasEvents = selectedEventCodesHistory.length > 0;
    const eventsSet = hasEvents ? new Set(selectedEventCodesHistory.map((s) => s.trim().toUpperCase())) : null;
    const compStart = historyStartDate ? toComparableDate(historyStartDate, false) : '';
    const compEnd = historyEndDate ? toComparableDate(historyEndDate, true) : '';
    const q = historyQuery.trim().toLowerCase();
    const qTokens = q ? q.split(/\s+/).filter(Boolean) : [];

    return historyResults.filter((r: any) => {
      if (hasStatus && r.status !== historyStatus) return false;
      if (eventsSet) {
        const desc = (r.eventCodeDesc || '').trim().toUpperCase();
        const code = (r.eventCode || '').trim().toUpperCase();
        if (!eventsSet.has(desc) && !eventsSet.has(code)) return false;
      }
      if (compStart && r._compDate && r._compDate < compStart) return false;
      if (compEnd && r._compDate && r._compDate > compEnd) return false;

      if (qTokens.length > 0) {
        const wsidStr = (r.wsid || '').toLowerCase();
        const lokStr = (r.lokasi || '').toLowerCase();
        const evtStr = (r.eventCodeDesc || '').toLowerCase();
        const spStr = (r.servicePoint || '').toLowerCase();
        const sekStr = (r.sektor || '').toLowerCase();
        const venStr = (r.vendor || r.vendorMesin || '').toLowerCase();
        const tipeStr = (r.typeMesin || '').toLowerCase();
        const actStr = (r.actionTerakhir || '').toLowerCase();
        const detStr = (r.detail || '').toLowerCase();
        const incNumStr = (r.incidentNumber || '').toLowerCase();

        const combinedSearch = (
          r._search ||
          `${wsidStr} ${lokStr} ${evtStr} ${spStr} ${sekStr} ${venStr} ${tipeStr} ${actStr} ${detStr} ${incNumStr}`
        ).toLowerCase();

        const matchesAllTokens = qTokens.every((token) =>
          wsidStr.includes(token) ||
          lokStr.includes(token) ||
          evtStr.includes(token) ||
          spStr.includes(token) ||
          sekStr.includes(token) ||
          venStr.includes(token) ||
          tipeStr.includes(token) ||
          actStr.includes(token) ||
          detStr.includes(token) ||
          incNumStr.includes(token) ||
          combinedSearch.includes(token)
        );
        if (!matchesAllTokens) return false;
      }
      return true;
    });
  }, [activeTab, historyResults, historyStatus, selectedEventCodesHistory, historyQuery, historyStartDate, historyEndDate]);

  const sortedHistory = useMemo(() => {
    if (activeTab !== 'HISTORY') return [];
    if (filteredHistory.length === 0) return [];
    const list = [...filteredHistory];
    const isAsc = historySortDirection === 'asc';

    list.sort((a: any, b: any) => {
      let diff = 0;
      switch (historySortColumn) {
        case 'wsid':
          diff = a.wsid.localeCompare(b.wsid);
          break;
        case 'typeMesin':
          diff = (a.typeMesin || '').localeCompare(b.typeMesin || '');
          break;
        case 'eventCodeDesc':
          diff = (a.eventCodeDesc || '').localeCompare(b.eventCodeDesc || '');
          break;
        case 'startTime':
          diff = (a._epochStart || 0) - (b._epochStart || 0);
          break;
        case 'endTime':
          diff = (a._epochEnd || 0) - (b._epochEnd || 0);
          break;
        case 'durasiOpr':
          diff = (a.durasiOpr || 0) - (b.durasiOpr || 0);
          break;
        case 'chronic':
          diff = (a.durasiOpr || 0) - (b.durasiOpr || 0);
          break;
        case 'actionTerakhir':
          diff = (a.actionTerakhir || '').localeCompare(b.actionTerakhir || '');
          break;
        default:
          diff = (a._epochStart || 0) - (b._epochStart || 0);
      }
      return isAsc ? diff : -diff;
    });
    return list;
  }, [activeTab, filteredHistory, historySortColumn, historySortDirection]);

  const totalPagesHistory = Math.ceil(sortedHistory.length / pageSizeHistory) || 1;
  const paginatedHistory = useMemo(() => {
    if (activeTab !== 'HISTORY') return [];
    const start = (currentPageHistory - 1) * pageSizeHistory;
    return sortedHistory.slice(start, start + pageSizeHistory);
  }, [activeTab, sortedHistory, currentPageHistory, pageSizeHistory]);

  const handleSortHistory = (
    col: 'wsid' | 'typeMesin' | 'eventCodeDesc' | 'startTime' | 'endTime' | 'durasiOpr' | 'chronic' | 'actionTerakhir'
  ) => {
    setCurrentPageHistory(1);
    if (historySortColumn === col) {
      setHistorySortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setHistorySortColumn(col);
      const defaultDir = col === 'durasiOpr' || col === 'chronic' || col === 'startTime' || col === 'endTime' ? 'desc' : 'asc';
      setHistorySortDirection(defaultDir);
    }
  };

  const historyAvailableEvents = useMemo(() => {
    const set = new Set<string>();
    TARGET_EVENT_CODES.forEach((c) => set.add(c));
    for (let i = 0; i < historyResults.length; i++) {
      const desc = (historyResults[i].eventCodeDesc || '').trim();
      if (desc && desc !== '-' && desc !== 'N/A') set.add(desc);
      const code = (historyResults[i].eventCode || '').trim();
      if (code && code !== '-' && code !== 'N/A') set.add(code);
    }
    for (let i = 0; i < allDailyIncidents.length; i++) {
      const desc = (allDailyIncidents[i].eventCodeDesc || '').trim();
      if (desc && desc !== '-' && desc !== 'N/A') set.add(desc);
      const code = (allDailyIncidents[i].eventCode || '').trim();
      if (code && code !== '-' && code !== 'N/A') set.add(code);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [historyResults, allDailyIncidents]);

  // =========================================================================
  // TAB 4: LOGIC UPLOAD CSV
  // =========================================================================
  const fetchUploadLogs = async () => {
    try {
      const res = await getUploadLogApi();
      if (res.success && res.logs) {
        setUploadLogs(res.logs);
      }
    } catch (e) { }
  };

  useEffect(() => {
    if (activeTab === 'UPLOAD') {
      fetchUploadLogs();
    }
  }, [activeTab]);

  const handleFileUploadInstant = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!requirePetugasName()) {
      if (fileUploadInputRef.current) fileUploadInputRef.current.value = '';
      return;
    }

    setIsUploadingCsv(true);
    setUploadProgress(15);
    setUploadMessage(`Membaca dan memproses instan file ${file.name}...`);
    setUploadStats(null);
    let isLocalDataActivated = false;

    try {
      const parsed = await parseDailyIncidentCsv(file, { masterData: rawMasterData });
      const snapshotEndDate = parsed.reportDefaultEndDate || new Date();
      const snapshotEndStr = parsed.reportEndStr;

      // 1. Kumpulkan seluruh identitas insiden pada CSV OASE yang baru diupload
      const incomingIncNums = new Set<string>();
      const incomingCompositeKeys = new Set<string>();
      const incomingWsidEventKeys = new Set<string>();

      parsed.rows.forEach((r) => {
        if (r.incidentNumber && r.incidentNumber !== '-') {
          incomingIncNums.add(r.incidentNumber.trim().toUpperCase());
        }
        const w = (r.wsid || '').trim().toUpperCase();
        const ev = (r.eventCodeDesc || '').trim().toUpperCase();
        const st = (r.startTime || '').trim();
        if (w && ev) {
          incomingWsidEventKeys.add(`${w}|${ev}`);
          if (st) {
            incomingCompositeKeys.add(`${w}|${ev}|${st}`);
          }
        }
      });

      // 2. Kumpulkan seluruh insiden yang sebelumnya OPEN di dashboard / database
      const previousOpenList: (OpenIncidentItem | DailyIncidentRow)[] = [];
      const seenOpenKeys = new Set<string>();

      const registerPreviousOpen = (it: any) => {
        if (!isEndTimeFilled(it.endTime)) {
          const k = (it.incidentNumber && it.incidentNumber !== '-')
            ? it.incidentNumber.trim().toUpperCase()
            : `${(it.wsid || '').trim().toUpperCase()}|${(it.eventCodeDesc || '').trim().toUpperCase()}|${(it.startTime || '').trim()}`;
          if (!seenOpenKeys.has(k)) {
            seenOpenKeys.add(k);
            previousOpenList.push(it);
          }
        }
      };

      openIncidentsRef.current.forEach(registerPreviousOpen);
      allDailyIncidentsRef.current.forEach(registerPreviousOpen);

      // 3. REKONSILIASI SNAPSHOT (CARA 1):
      // Jika file CSV memiliki minimal 10 baris (mencegah file test/parsial menutup problem asli),
      // maka insiden open sebelumnya yang SUDAH HILANG dari report OASE dinyatakan RESOLVED -> AUTO-CLOSE BY DASHBOARD!
      const autoClosedRows: DailyIncidentRow[] = [];
      if (parsed.rows.length >= 10 && previousOpenList.length > 0) {
        for (const prev of previousOpenList) {
          const incNum = (prev.incidentNumber && prev.incidentNumber !== '-') ? prev.incidentNumber.trim().toUpperCase() : '';
          const w = (prev.wsid || '').trim().toUpperCase();
          const ev = (prev.eventCodeDesc || '').trim().toUpperCase();
          const st = (prev.startTime || '').trim();

          const isStillInOase = (incNum && incomingIncNums.has(incNum)) ||
            incomingCompositeKeys.has(`${w}|${ev}|${st}`) ||
            incomingWsidEventKeys.has(`${w}|${ev}`);

          if (!isStillInOase) {
            const startDate = parseDateTime(prev.startTime);
            const sched = resolveOperatingSchedule(prev.wsid, undefined, masterSchedMap);
            const durasiOpr = calculateOperationalDuration(startDate, snapshotEndDate, sched.hari, sched.jam);

            const dStr = (prev as any).dateStr || (prev as any).tanggal || (prev.startTime ? prev.startTime.split(' ')[0] : '-');
            const hStr = (prev as any).hourStr || (prev as any).jam || '00:00';

            const closedItem: DailyIncidentRow = {
              incidentNumber: prev.incidentNumber || '-',
              wsid: prev.wsid,
              lokasi: prev.lokasi || '-',
              servicePointSektor: (prev as any).servicePointSektor || `${prev.servicePoint || '-'} - ${prev.sektor || '-'}`,
              servicePoint: prev.servicePoint || '-',
              sektor: prev.sektor || '-',
              typeMesin: prev.typeMesin || '-',
              vendorMesin: (prev as any).vendorMesin || (prev as any).vendor || '-',
              startTime: prev.startTime,
              endTime: snapshotEndStr,
              dateStr: dStr,
              hourStr: hStr,
              hourNumber: (prev as any).hourNumber || 0,
              durasi: durasiOpr,
              rawDuration: (prev as any).rawDuration || (prev as any).durationRaw || durasiOpr,
              eventCodeDesc: prev.eventCodeDesc,
              eventCode: (prev as any).eventCode || '-',
              operatingDays: sched.hari,
              operatingHours: sched.jam,
              detail: (prev as any).detail || '-',
              comment: prev.comment || undefined,
              keterangan: prev.keterangan || undefined,
              actionTerakhir: '[AUTO-CLOSE] Problem sudah tidak muncul di report OASE',
              actionTerakhirOleh: 'Sistem Dashboard',
              actionTerakhirWaktu: snapshotEndStr,
              jumlahAction: ((prev as any).jumlahAction || 0) + 1,
              closeSource: 'DASHBOARD'
            };
            autoClosedRows.push(closedItem);
          }
        }
      }

      // 4. Bangun dataset gabungan (riwayat lama + autoClosed + data CSV baru)
      const datasetMap = new Map<string, DailyIncidentRow>();

      allDailyIncidentsRef.current.forEach((r) => {
        const k = (r.incidentNumber && r.incidentNumber !== '-')
          ? r.incidentNumber.trim().toUpperCase()
          : `${(r.wsid || '').trim().toUpperCase()}|${(r.eventCodeDesc || '').trim().toUpperCase()}|${(r.startTime || '').trim()}`;
        datasetMap.set(k, r);
      });

      autoClosedRows.forEach((r) => {
        const k = (r.incidentNumber && r.incidentNumber !== '-')
          ? r.incidentNumber.trim().toUpperCase()
          : `${(r.wsid || '').trim().toUpperCase()}|${(r.eventCodeDesc || '').trim().toUpperCase()}|${(r.startTime || '').trim()}`;
        datasetMap.set(k, r);
      });

      parsed.rows.forEach((r) => {
        const k = (r.incidentNumber && r.incidentNumber !== '-')
          ? r.incidentNumber.trim().toUpperCase()
          : `${(r.wsid || '').trim().toUpperCase()}|${(r.eventCodeDesc || '').trim().toUpperCase()}|${(r.startTime || '').trim()}`;
        datasetMap.set(k, r);
      });

      const mergedAllRows = Array.from(datasetMap.values());
      setAllDailyIncidents(mergedAllRows);

      const extractedOpen = extractOpenFromRows(mergedAllRows);
      setOpenIncidents(extractedOpen);
      isLocalDataActivated = true;

      const rowsToUpload = [...parsed.rows, ...autoClosedRows];
      setUploadProgress(40);
      setUploadMessage(
        `Dashboard aktif (${extractedOpen.length} Open)! Menyinkronkan ${rowsToUpload.length.toLocaleString()} insiden` +
        (autoClosedRows.length > 0 ? ` (termasuk ${autoClosedRows.length} auto-close)...` : '...')
      );

      setSyncStatusBanner({
        type: 'syncing',
        text: `Data aktif di dashboard (${extractedOpen.length} Problem Open)! Menyinkronkan ke database Supabase...`
      });

      setActiveTab('OPEN');
      setIsUploadModalOpen(false);

      const chunkSize = 2000;
      const totalChunks = Math.ceil(rowsToUpload.length / chunkSize) || 1;
      let aggStats = {
        totalLines: parsed.totalRawLines + autoClosedRows.length,
        matched: rowsToUpload.length,
        newCount: 0,
        updatedCount: 0,
        unchangedCount: 0,
        skippedCount: parsed.totalRawLines - parsed.rows.length
      };

      for (let i = 0; i < totalChunks; i++) {
        const chunk = rowsToUpload.slice(i * chunkSize, (i + 1) * chunkSize);
        const progressPct = 40 + Math.round(((i + 1) / totalChunks) * 55);
        setUploadProgress(progressPct);
        setUploadMessage(`Sinkronisasi batch ${i + 1} dari ${totalChunks}...`);

        const res = await uploadIncidentChunkApi({
          uploaderName: formatPetugasSignature(petugasName),
          sumber: 'Monitoring',
          fileName: file.name,
          totalCsvLines: parsed.totalRawLines + autoClosedRows.length,
          chunkIndex: i,
          totalChunks: totalChunks,
          rows: chunk
        });

        if (!res.success) {
          throw new Error(res.message || `Gagal memproses batch ${i + 1}`);
        }

        if (res.stats) {
          aggStats.newCount += res.stats.newCount || 0;
          aggStats.updatedCount += res.stats.updatedCount || 0;
          aggStats.unchangedCount += res.stats.unchangedCount || 0;
        }

        if (i < totalChunks - 1) {
          await new Promise((r) => setTimeout(r, 300));
        }
      }

      setUploadProgress(100);
      setUploadStats(aggStats);
      setUploadMessage('Sinkronisasi selesai! Database berhasil diperbarui.');

      // Refresh cache riwayat dan tarik dataset database terbaru
      historyCacheRef.current = {};
      await Promise.all([
        fetchOpenIncidents(),
        fetchChronicDataset()
      ]);
      fetchDailyIncidentsFromDb('ALL');

      const autoCloseReport = autoClosedRows.length > 0
        ? ` (${autoClosedRows.length} problem hilang dari OASE otomatis di-auto-close oleh dashboard).`
        : '.';
      const dbTargetName = isSupabaseConfigured() ? 'Supabase' : 'Google Spreadsheet';
      setSyncStatusBanner({
        type: 'success',
        text: `Sukses sinkronisasi ${parsed.rows.length.toLocaleString()} insiden ke database ${dbTargetName}${autoCloseReport}`
      });

      fetchUploadLogs();
    } catch (err: any) {
      console.error(err);
      const prefix = isLocalDataActivated
        ? 'Data aktif di dashboard, namun sinkronisasi server terkendala: '
        : 'Gagal memproses file CSV: ';
      setSyncStatusBanner({
        type: 'error',
        text: prefix + (err.message || String(err))
      });
    } finally {
      setIsUploadingCsv(false);
      if (fileUploadInputRef.current) fileUploadInputRef.current.value = '';
    }
  };

  // =========================================================================
  // LOGIC & MEMOIZED DERIVATIONS FOR GRAFIK FREKUENSI
  // =========================================================================

  // Source dataset for Grafik Frekuensi
  const rawGfDataset = useMemo(() => {
    if (gfMultiMonthRows.length > 0) return gfMultiMonthRows;
    return allDailyIncidents;
  }, [gfMultiMonthRows, allDailyIncidents]);

  // Effect to load data when entering GRAFIK_FREKUENSI
  useEffect(() => {
    if (activeTab === 'GRAFIK_FREKUENSI') {
      if (gfMultiMonthRows.length === 0) {
        if (allDailyIncidents.length > 0) {
          setGfMultiMonthRows(allDailyIncidents);
        } else {
          fetchGfData(gfMode, gfSingleMonth, gfStartMonth, gfEndMonth);
        }
      }
    }
  }, [activeTab]);

  // Available Problem / Event Codes for Grafik Frekuensi filter
  const gfAvailableProblems = useMemo(() => {
    const set = new Set<string>();
    rawGfDataset.forEach((r) => {
      const code = (r.eventCodeDesc || r.eventCode || '').trim();
      if (code && code !== '-' && code !== 'N/A') set.add(code);
    });
    if (set.size === 0) {
      TARGET_EVENT_CODES.forEach((c) => set.add(c));
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [rawGfDataset]);

  // Available Service Points for Grafik Frekuensi filter
  const gfAvailableSPs = useMemo(() => {
    const set = new Set<string>();
    if (masterList && masterList.length > 0) {
      masterList.forEach((m: any) => {
        const sp = resolveServicePoint(m);
        if (sp && sp !== '-' && sp !== 'N/A') set.add(sp);
      });
    }
    rawGfDataset.forEach((r) => {
      const sp = resolveServicePoint(null, r);
      if (sp && sp !== '-' && sp !== 'N/A') set.add(sp);
      if (r.servicePointSektor && r.servicePointSektor !== '-') {
        const parts = r.servicePointSektor.split('-');
        if (parts[0] && parts[0].trim() !== '-') {
          const spPart = normalizeServicePoint(parts[0].trim());
          if (spPart) set.add(spPart);
        }
      }
    });
    return Array.from(set).filter(Boolean).sort((a, b) => a.localeCompare(b));
  }, [rawGfDataset, masterList]);

  // Deferred values for instant responsive UI when typing or selecting filters
  const deferredGfProblems = useDeferredValue(gfSelectedProblems);
  const deferredGfServicePoint = useDeferredValue(gfServicePoint);
  const deferredGfWsidSearch = useDeferredValue(gfWsidSearch);

  // High-performance single-pass calculation for all Grafik Frekuensi charts & metrics
  const gfComputedData = useMemo(() => {
    if (activeTab !== 'GRAFIK_FREKUENSI') {
      return {
        gfKpiMetrics: {
          total: 0,
          uniqueWsids: 0,
          avgPerDay: 0,
          topProblem: { name: '-', count: 0, pct: 0 },
          topSp: { name: '-', count: 0, pct: 0 },
          dayCount: 0
        },
        gfTrendData: [],
        gfTopProblemsData: [],
        gfSpDistributionData: [],
        gfTopWsidsData: [],
        gfAggregatedItems: []
      };
    }

    const hasProbFilter = deferredGfProblems.length > 0;
    const probSet = hasProbFilter ? new Set(deferredGfProblems) : null;
    const hasSpFilter = deferredGfServicePoint !== 'ALL';
    const targetSpNorm = hasSpFilter ? normalizeServicePoint(deferredGfServicePoint).toUpperCase() : '';
    const searchQ = deferredGfWsidSearch.trim().toLowerCase();
    const hasSearch = Boolean(searchQ);
    const isMonthlyTrend = gfMode === 'RANGE' && gfTrendGrouping === 'monthly';

    let total = 0;
    const uniqueWsidsSet = new Set<string>();
    const datesSet = new Set<string>();
    const pMap: Record<string, number> = {};
    const spMap: Record<string, number> = {};
    const trendMap: Record<string, number> = {};
    const wsidMap: Record<string, { count: number; lokasi: string; sp: string; problems: Record<string, number> }> = {};
    const aggMap: Record<string, {
      wsid: string;
      lokasi: string;
      servicePointSektor: string;
      servicePoint: string;
      typeMesin: string;
      eventCodeDesc: string;
      totalFrekuensi: number;
      totalDurasi: number;
      actionTerakhir?: string;
    }> = {};

    const len = rawGfDataset.length;
    for (let i = 0; i < len; i++) {
      const r = rawGfDataset[i];

      // 1. Problem filter
      if (hasProbFilter) {
        const pDesc = (r.eventCodeDesc || '').trim();
        if (!probSet!.has(pDesc)) continue;
      }

      // 2. Service Point filter
      if (hasSpFilter) {
        const sp = resolveServicePoint(null, r).toUpperCase();
        const spSek = normalizeServicePoint((r.servicePointSektor || '').split('-')[0].trim()).toUpperCase();
        if (sp !== targetSpNorm && spSek !== targetSpNorm) continue;
      }

      // 3. WSID Search filter
      if (hasSearch) {
        const matchWsid = (r.wsid || '').toLowerCase().includes(searchQ);
        const matchLok = (r.lokasi || '').toLowerCase().includes(searchQ);
        if (!matchWsid && !matchLok) continue;
      }

      total++;
      if (r.wsid) uniqueWsidsSet.add(r.wsid);

      // Date / Trend
      if (isMonthlyTrend) {
        const m = extractMonthStr(r.dateStr || r.startTime || (r as any).monthStr);
        if (m) trendMap[m] = (trendMap[m] || 0) + 1;
      } else {
        const d = r.dateStr;
        if (d && d !== '-') {
          datesSet.add(d);
          trendMap[d] = (trendMap[d] || 0) + 1;
        }
      }

      // Problem count
      const p = (r.eventCodeDesc || 'Unknown').trim();
      pMap[p] = (pMap[p] || 0) + 1;

      // Service Point count
      let sp = resolveServicePoint(null, r);
      if (!sp || sp === 'UNKNOWN' || sp === '-') {
        sp = 'Others';
      }
      spMap[sp] = (spMap[sp] || 0) + 1;

      // WSID
      const w = (r.wsid || '').trim().toUpperCase();
      if (w) {
        let wEntry = wsidMap[w];
        if (!wEntry) {
          wEntry = { count: 0, lokasi: r.lokasi || '-', sp: sp || '-', problems: {} };
          wsidMap[w] = wEntry;
        }
        wEntry.count++;
        wEntry.problems[p] = (wEntry.problems[p] || 0) + 1;
      }

      // Aggregated Table Items
      if (r.wsid) {
        const key = `${r.wsid}__${r.eventCodeDesc}`;
        let aEntry = aggMap[key];
        if (!aEntry) {
          aEntry = {
            wsid: r.wsid,
            lokasi: r.lokasi || '-',
            servicePointSektor: r.servicePointSektor || '-',
            servicePoint: sp || '-',
            typeMesin: r.typeMesin || '-',
            eventCodeDesc: r.eventCodeDesc || '-',
            totalFrekuensi: 0,
            totalDurasi: 0,
            actionTerakhir: r.actionTerakhir
          };
          aggMap[key] = aEntry;
        }
        aEntry.totalFrekuensi++;
        aEntry.totalDurasi += (r.durasi || 0);
        if (r.actionTerakhir && r.actionTerakhir !== '-') {
          aEntry.actionTerakhir = r.actionTerakhir;
        }
      }
    }

    // KPI Metrics calculation
    const dayCount = Math.max(datesSet.size, 1);
    const avgPerDay = Math.round((total / dayCount) * 10) / 10;
    const pSorted = Object.entries(pMap).sort((a, b) => b[1] - a[1]);
    const topProblem = pSorted[0]
      ? { name: pSorted[0][0], count: pSorted[0][1], pct: Math.round((pSorted[0][1] / Math.max(total, 1)) * 100) }
      : { name: '-', count: 0, pct: 0 };
    const spSorted = Object.entries(spMap).sort((a, b) => b[1] - a[1]);
    const topSp = spSorted[0]
      ? { name: spSorted[0][0], count: spSorted[0][1], pct: Math.round((spSorted[0][1] / Math.max(total, 1)) * 100) }
      : { name: '-', count: 0, pct: 0 };
    const gfKpiMetrics = { total, uniqueWsids: uniqueWsidsSet.size, avgPerDay, topProblem, topSp, dayCount };

    // Trend Data calculation
    let gfTrendData: any[] = [];
    if (isMonthlyTrend) {
      const sortedMonths = Object.keys(trendMap).sort();
      let cum = 0;
      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
      gfTrendData = sortedMonths.map((m) => {
        const count = trendMap[m] || 0;
        cum += count;
        const parts = m.split('-');
        const label = `${monthNames[parseInt(parts[1], 10) - 1] || parts[1]} ${parts[0]}`;
        return {
          key: m,
          label,
          total: gfCumulative ? cum : count,
          rawTotal: count
        };
      });
    } else {
      const sortedDates = Object.keys(trendMap).sort((a, b) => {
        const da = a.split('/').reverse().join('-');
        const db = b.split('/').reverse().join('-');
        return da.localeCompare(db);
      });
      let cum = 0;
      gfTrendData = sortedDates.map((d) => {
        const count = trendMap[d] || 0;
        cum += count;
        const parts = d.split('/');
        const label = parts.length >= 2 ? `${parts[0]}/${parts[1]}` : d;
        return {
          key: d,
          label,
          total: gfCumulative ? cum : count,
          rawTotal: count
        };
      });
    }

    // Top Problems Data
    const totalSafe = total || 1;
    const gfTopProblemsData = pSorted.slice(0, 10).map(([problem, count]) => ({
      problem: problem.length > 25 ? problem.slice(0, 23) + '...' : problem,
      fullProblem: problem,
      count,
      pct: Math.round((count / totalSafe) * 100)
    }));

    // SP Distribution Data
    const gfSpDistributionData = spSorted.map(([spName, count]) => ({
      sp: spName,
      count
    }));

    // Top WSIDs Data
    const wsidSorted = Object.entries(wsidMap).sort((a, b) => b[1].count - a[1].count);
    const gfTopWsidsData = wsidSorted.slice(0, 10).map(([wsid, info]) => {
      const topP = Object.entries(info.problems).sort((a, b) => b[1] - a[1])[0];
      return {
        wsid,
        lokasi: info.lokasi,
        sp: info.sp,
        count: info.count,
        topProblem: topP ? `${topP[0]} (${topP[1]}x)` : '-'
      };
    });

    // Aggregated Table Items
    const gfAggregatedItems = Object.values(aggMap).sort((a, b) => b.totalFrekuensi - a.totalFrekuensi);

    return {
      gfKpiMetrics,
      gfTrendData,
      gfTopProblemsData,
      gfSpDistributionData,
      gfTopWsidsData,
      gfAggregatedItems
    };
  }, [
    activeTab,
    rawGfDataset,
    deferredGfProblems,
    deferredGfServicePoint,
    deferredGfWsidSearch,
    gfMode,
    gfTrendGrouping,
    gfCumulative
  ]);

  const {
    gfKpiMetrics,
    gfTrendData,
    gfTopProblemsData,
    gfSpDistributionData,
    gfTopWsidsData,
    gfAggregatedItems
  } = gfComputedData;

  const totalPagesGf = Math.ceil(gfAggregatedItems.length / gfTablePageSize) || 1;
  const paginatedGfItems = useMemo(() => {
    const start = (gfTablePage - 1) * gfTablePageSize;
    return gfAggregatedItems.slice(start, start + gfTablePageSize);
  }, [gfAggregatedItems, gfTablePage, gfTablePageSize]);

  const formatGfMonthLabel = (mStr: string) => {
    if (!mStr) return '-';
    const parts = mStr.split('-');
    if (parts.length < 2) return mStr;
    const y = parts[0];
    const m = parseInt(parts[1], 10);
    const names = [
      'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
      'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
    ];
    return `${names[m - 1] || parts[1]} ${y}`;
  };

  const handleExportFreqTableExcel = () => {
    if (!sortedFreqItems || sortedFreqItems.length === 0) {
      alert('Tidak ada data frekuensi yang sesuai filter untuk diekspor!');
      return;
    }

    try {
      const wb = XLSX.utils.book_new();

      // SHEET 1: Matriks Frekuensi per WSID & Tanggal
      const s1Aoa: any[][] = [];
      s1Aoa.push(['MATRIKS FREKUENSI PROBLEM PER WSID PER TANGGAL']);
      s1Aoa.push([`Tanggal Export: ${new Date().toLocaleString('id-ID')}`]);
      s1Aoa.push([`Total Data: ${sortedFreqItems.length.toLocaleString('id-ID')} kombinasi WSID & Problem`]);
      s1Aoa.push([]);

      const s1Headers = [
        'No',
        'WSID',
        'Lokasi',
        'Service Point - Sektor',
        'Problem (Event Code)',
        ...displayedFreqDates.map((d) => `Tgl ${d}`),
        'Total Frekuensi',
        'Total Durasi (Menit)',
        'Rata-rata Durasi (Menit)'
      ];
      s1Aoa.push(s1Headers);

      sortedFreqItems.forEach((r, idx) => {
        const avgDur = Math.round((r.totalDurasi / Math.max(r.totalFrekuensi, 1)) * 10) / 10;
        const rowData = [
          idx + 1,
          r.wsid,
          r.lokasi || '-',
          r.servicePointSektor || '-',
          r.eventCodeDesc || '-',
          ...displayedFreqDates.map((d) => (r.dateCounts && r.dateCounts[d] !== undefined) ? r.dateCounts[d] : 0),
          r.totalFrekuensi || 0,
          r.totalDurasi || 0,
          avgDur
        ];
        s1Aoa.push(rowData);
      });

      const ws1 = XLSX.utils.aoa_to_sheet(s1Aoa);
      ws1['!cols'] = [
        { wch: 6 },
        { wch: 12 },
        { wch: 32 },
        { wch: 25 },
        { wch: 35 },
        ...displayedFreqDates.map(() => ({ wch: 10 })),
        { wch: 16 },
        { wch: 20 },
        { wch: 22 }
      ];
      XLSX.utils.book_append_sheet(wb, ws1, 'Matriks Frekuensi');

      // SHEET 2: Rincian Raw Insiden Terkait
      if (frequencyDataset && frequencyDataset.length > 0) {
        const relevantWsidSet = new Set(sortedFreqItems.map((s) => s.wsid));
        const filteredIncidents = frequencyDataset.filter((inc) => relevantWsidSet.has(inc.wsid));

        if (filteredIncidents.length > 0) {
          const s2Aoa: any[][] = [];
          s2Aoa.push(['DETAIL RAW INSIDEN TERKAIT']);
          s2Aoa.push([`Total: ${filteredIncidents.length.toLocaleString('id-ID')} insiden`]);
          s2Aoa.push([]);
          s2Aoa.push([
            'No',
            'WSID',
            'Lokasi',
            'Service Point - Sektor',
            'Tipe Mesin',
            'Vendor Mesin',
            'Problem / Event Code',
            'Start Time',
            'End Time',
            'Durasi (Menit)',
            'Tanggal',
            'Jam',
            'Status'
          ]);

          filteredIncidents.slice(0, 10000).forEach((inc, idx) => {
            s2Aoa.push([
              idx + 1,
              inc.wsid,
              inc.lokasi || '-',
              inc.servicePointSektor || '-',
              inc.typeMesin || '-',
              inc.vendorMesin || '-',
              inc.eventCodeDesc || '-',
              inc.startTime || '-',
              inc.endTime || '-',
              inc.durasi || 0,
              inc.dateStr || '-',
              inc.hourStr || '-',
              isEndTimeFilled(inc.endTime) ? 'CLOSED' : 'OPEN'
            ]);
          });

          const ws2 = XLSX.utils.aoa_to_sheet(s2Aoa);
          XLSX.utils.book_append_sheet(wb, ws2, 'Detail Insiden');
        }
      }

      const dateStr = new Date().toISOString().slice(0, 10);
      XLSX.writeFile(wb, `Matriks_Frekuensi_Problem_${dateStr}.xlsx`);
    } catch (err: any) {
      console.error('Gagal export excel frekuensi:', err);
      alert(`Gagal mengekspor file Excel: ${err?.message || String(err)}`);
    }
  };

  const handleExportGfExcel = () => {
    if (gfAggregatedItems.length === 0) {
      alert('Tidak ada data frekuensi untuk diekspor!');
      return;
    }
    const exportRows = gfAggregatedItems.map((item, idx) => ({
      'No': idx + 1,
      'WSID': item.wsid,
      'Nama Lokasi': item.lokasi,
      'Service Point': item.servicePoint,
      'Service Point - Sektor': item.servicePointSektor,
      'Tipe Mesin': item.typeMesin,
      'Problem / Event Code': item.eventCodeDesc,
      'Frekuensi': item.totalFrekuensi,
      'Total Durasi (Menit)': item.totalDurasi,
      'Rata-rata Durasi (Menit)': Math.round((item.totalDurasi / Math.max(item.totalFrekuensi, 1)) * 10) / 10,
      'Tindakan Terakhir': item.actionTerakhir || '-'
    }));

    const ws = XLSX.utils.json_to_sheet(exportRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Grafik_Frekuensi');
    const periodLabel = gfMode === 'SINGLE' ? gfSingleMonth : `${gfStartMonth}_sd_${gfEndMonth}`;
    XLSX.writeFile(wb, `Analisis_Grafik_Frekuensi_${periodLabel}.xlsx`);
  };

  // =========================================================================
  // RENDER JSX (CLEAN, SIMPLE, PURITY OPERATIONAL SLATE AESTHETICS)
  // =========================================================================
  return (
    <div className={`w-full text-[#0D1C2E] flex flex-col font-sans antialiased selection:bg-blue-100 ${isSupervisorRole ? 'bg-transparent min-h-0' : 'min-h-screen bg-[#F5F7FB]'
      }`}>
      {/* ==================================================== */}
      {/* 1. TOP HEADER (44px COMPACT ENTERPRISE DENSITY)      */}
      {/* ==================================================== */}
      <header className={`w-full bg-white/95 backdrop-blur-md transition-all ${isSupervisorRole
          ? 'rounded-lg border border-[#E5EAF2] shadow-2xs mb-3 sticky top-0 z-20'
          : 'sticky top-0 z-40 h-11 shadow-2xs border-b border-[#E5EAF2]'
        }`}>
        <div className={`w-full h-full flex items-center justify-between gap-3 ${isSupervisorRole ? 'px-3 sm:px-4' : 'max-w-[1440px] mx-auto px-3 sm:px-6'
          }`}>
          {/* Brand Logo & Title */}
          <div className="flex items-center gap-2.5 shrink-0">
            <div className={`w-7 h-7 rounded-md flex items-center justify-center font-bold shadow-2xs ${effectiveRole === 'KAWIL'
                ? 'bg-indigo-100 text-indigo-700'
                : effectiveRole === 'KAOPS'
                  ? 'bg-teal-100 text-blue-600'
                  : 'bg-blue-50 text-blue-600'
              }`}>
              <Server size={15} />
            </div>
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-xs sm:text-sm text-[#0D1C2E] tracking-tight">
                {isSupervisorRole ? 'Cek Daily Incident' : 'Mons Monitoring'}
              </span>
              <span className={`px-1.5 py-0.2 rounded text-[9px] font-bold tracking-wider uppercase ${effectiveRole === 'KAWIL'
                  ? 'bg-indigo-100 text-indigo-800'
                  : effectiveRole === 'KAOPS'
                    ? 'bg-teal-100 text-teal-800'
                    : 'bg-[#EFF4FF] text-[#555F71]'
                }`}>
                {effectiveRole === 'KAWIL' ? 'Ka Wil' : effectiveRole === 'KAOPS' ? 'Ka Ops' : 'Monitoring'}
              </span>
            </div>
          </div>

          {/* Navigation Tabs (Compact 44px) */}
          <nav className="hidden md:flex items-center gap-4 h-full">
            <button
              onClick={() => setActiveTab('OPEN')}
              className={`inline-flex items-center gap-1.5 h-11 px-2 border-b-2 transition-all text-xs font-semibold cursor-pointer ${activeTab === 'OPEN'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-[#555F71] hover:text-[#0D1C2E]'
                }`}
            >
              <span>Problem Open</span>
              <span className="px-1.5 py-0.2 rounded-full bg-[#FFDAD6] text-[#BA1A1A] text-[9px] font-bold">
                {countOpenTotal}
              </span>
            </button>

            {/* Dropdown Frekuensi & Grafik Frekuensi */}
            <div className="relative" ref={frekuensiMenuRef}>
              <button
                type="button"
                onClick={() => setIsFrekuensiMenuOpen((prev) => !prev)}
                className={`inline-flex items-center gap-1.5 h-11 px-2 border-b-2 transition-all text-xs font-semibold cursor-pointer ${activeTab === 'FREKUENSI' || activeTab === 'GRAFIK_FREKUENSI' || activeTab === 'GRAFIK_24JAM'
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-[#555F71] hover:text-[#0D1C2E]'
                  }`}
              >
                {activeTab === 'GRAFIK_FREKUENSI' ? (
                  <>
                    <TrendingUp size={14} className="text-blue-600" />
                    <span>Grafik Frekuensi</span>
                  </>
                ) : activeTab === 'GRAFIK_24JAM' ? (
                  <>
                    <BarChart3 size={14} className="text-blue-600" />
                    <span>Grafik 24 Jam</span>
                  </>
                ) : (
                  <>
                    <span>Frekuensi</span>
                    <span className="px-1.5 py-0.2 rounded-full bg-[#EFF4FF] text-[#555F71] text-[9px] font-bold">
                      {aggFreqItems.length}
                    </span>
                  </>
                )}
                <ChevronDown
                  size={12}
                  className={`transition-transform duration-200 ${isFrekuensiMenuOpen ? 'rotate-180 text-blue-600' : 'text-slate-400'
                    }`}
                />
              </button>

              {/* Popover Dropdown */}
              {isFrekuensiMenuOpen && (
                <div className="absolute left-0 top-full mt-1 w-64 bg-white rounded-lg shadow-xl border border-[#E5EAF2] py-1.5 z-50 animate-in fade-in zoom-in-95 duration-150">
                  <div className="px-3 py-1 text-[9px] font-bold text-slate-400 uppercase tracking-wider">
                    Menu Frekuensi
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setActiveTab('FREKUENSI');
                      setIsFrekuensiMenuOpen(false);
                    }}
                    className={`w-full px-3 py-2 text-left flex items-start gap-2.5 transition-colors cursor-pointer ${activeTab === 'FREKUENSI'
                        ? 'bg-blue-50/50 text-blue-600'
                        : 'hover:bg-slate-50 text-slate-700'
                      }`}
                  >
                    <div className="p-1.5 rounded-md bg-slate-100 text-slate-600 mt-0.5">
                      <Table size={14} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-bold flex items-center justify-between">
                        <span>Frekuensi</span>
                        <span className="px-1.5 py-0.2 text-[9px] font-bold rounded-full bg-[#EFF4FF] text-blue-600">
                          {aggFreqItems.length}
                        </span>
                      </div>
                      <div className="text-[10px] text-[#555F71] mt-0.5 leading-snug">
                        Tabel matriks WSID, Problem & Tanggal
                      </div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setActiveTab('GRAFIK_FREKUENSI');
                      setIsFrekuensiMenuOpen(false);
                    }}
                    className={`w-full px-3 py-2 text-left flex items-start gap-2.5 transition-colors cursor-pointer ${activeTab === 'GRAFIK_FREKUENSI'
                        ? 'bg-blue-50/50 text-blue-600'
                        : 'hover:bg-slate-50 text-slate-700'
                      }`}
                  >
                    <div className="p-1.5 rounded-md bg-blue-50 text-blue-600 mt-0.5">
                      <TrendingUp size={14} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-bold flex items-center justify-between">
                        <span>Grafik Frekuensi</span>
                        <span className="px-1.5 py-0.2 text-[8px] font-extrabold rounded-full bg-emerald-100 text-emerald-700">
                          GRAFIK
                        </span>
                      </div>
                      <div className="text-[10px] text-[#555F71] mt-0.5 leading-snug">
                        Grafik tren periode, Top Problem & WSID
                      </div>
                    </div>
                  </button>

                  <div className="my-1 border-t border-slate-100"></div>

                  <button
                    type="button"
                    onClick={() => {
                      setActiveTab('GRAFIK_24JAM');
                      setIsFrekuensiMenuOpen(false);
                    }}
                    className={`w-full px-3 py-1.5 text-left flex items-start gap-2.5 transition-colors cursor-pointer ${activeTab === 'GRAFIK_24JAM'
                        ? 'bg-blue-50/50 text-blue-600'
                        : 'hover:bg-slate-50 text-slate-700'
                      }`}
                  >
                    <div className="p-1.5 rounded-md bg-indigo-50 text-indigo-600 mt-0.5">
                      <BarChart3 size={14} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-bold text-slate-700">
                        <span>Grafik 24 Jam</span>
                      </div>
                      <div className="text-[10px] text-slate-400 mt-0.5 leading-snug">
                        Distribusi problem per jam (00:00 - 23:00)
                      </div>
                    </div>
                  </button>
                </div>
              )}
            </div>

            {/* TAB BARU: TIKET REQ MONITORING */}
            <button
              onClick={() => setActiveTab('TIKET')}
              className={`inline-flex items-center gap-1.5 h-11 px-2 border-b-2 transition-all text-xs font-semibold cursor-pointer ${activeTab === 'TIKET'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-[#555F71] hover:text-[#0D1C2E]'
                }`}
            >
              <Ticket size={14} className={activeTab === 'TIKET' ? 'text-blue-600' : 'text-slate-400'} />
              <span>Tiket Req</span>
              {reOpenTicketsCount > 0 ? (
                <span className="px-1.5 py-0.2 rounded-full bg-rose-500 text-white text-[9px] font-bold animate-pulse">
                  {reOpenTicketsCount} Re-Open
                </span>
              ) : openTicketsCount > 0 ? (
                <span className="px-1.5 py-0.2 rounded-full bg-amber-100 text-amber-800 text-[9px] font-bold">
                  {openTicketsCount}
                </span>
              ) : null}
            </button>

            <button
              onClick={() => setActiveTab('HISTORY')}
              className={`inline-flex items-center gap-1.5 h-11 px-2 border-b-2 transition-all text-xs font-semibold cursor-pointer ${activeTab === 'HISTORY'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-[#555F71] hover:text-[#0D1C2E]'
                }`}
            >
              <span>Riwayat</span>
            </button>

            <button
              onClick={() => setActiveTab('UPLOAD')}
              className={`inline-flex items-center gap-1.5 h-11 px-2 border-b-2 transition-all text-xs font-semibold cursor-pointer ${activeTab === 'UPLOAD'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-[#555F71] hover:text-[#0D1C2E]'
                }`}
            >
              <span>Upload CSV</span>
            </button>
          </nav>

          {/* Right Utility Bar */}
          <div className="flex items-center gap-2 sm:gap-2.5">
            {/* Petugas Capsule */}
            <button
              onClick={openDutyModal}
              className={`flex items-center gap-1.5 px-2.5 h-7 rounded-md text-xs font-medium transition-all cursor-pointer border border-[#E5EAF2] ${!petugasName.trim() || petugasInputHighlight
                  ? 'bg-rose-100 text-rose-800 ring-1 ring-rose-300 animate-pulse font-bold'
                  : 'bg-white hover:bg-slate-50 text-[#0D1C2E]'
                }`}
              title="Klik untuk mengubah petugas jaga"
            >
              <User size={12} className={!petugasName.trim() ? 'text-rose-600' : 'text-blue-600'} />
              <span>Petugas: <strong>{petugasName.trim() || 'Wajib Diisi'}</strong></span>
              <ChevronDown size={11} className="text-[#555F71]" />
            </button>

            {/* Tombol Akses Cepat: Dashboard Tiket Follow Up */}
            <button
              type="button"
              onClick={() => setActiveTab('TIKET')}
              className={`relative flex items-center gap-1.5 px-2.5 h-7 rounded-md text-xs font-semibold transition-all cursor-pointer shadow-2xs border ${activeTab === 'TIKET'
                  ? 'bg-blue-50 text-blue-700 border-blue-300 ring-1 ring-blue-300'
                  : reOpenTicketsCount > 0
                    ? 'bg-rose-600 text-white border-rose-700 animate-pulse'
                    : reqCloseTicketsCount > 0 && isSupervisorRole
                      ? 'bg-purple-600 text-white border-purple-700'
                      : activeTickets.length > 0
                        ? 'bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border-indigo-200'
                        : 'bg-white hover:bg-slate-50 text-slate-700 border-[#E5EAF2]'
                }`}
              title="Buka Dashboard Tiket Follow Up"
            >
              <Ticket size={13} />
              <span>Tiket Follow Up</span>
              {activeTickets.length > 0 && (
                <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-black ${reOpenTicketsCount > 0 || (reqCloseTicketsCount > 0 && isSupervisorRole)
                    ? 'bg-white text-rose-700'
                    : 'bg-indigo-600 text-white'
                  }`}>
                  {reOpenTicketsCount > 0 ? `! ${reOpenTicketsCount}` : activeTickets.length}
                </span>
              )}
            </button>

            {/* Hidden Input for Instant CSV */}
            <input
              ref={fileUploadInputRef}
              type="file"
              accept=".csv,text/csv"
              onChange={handleFileUploadInstant}
              className="hidden"
            />

            {/* Logout Button */}
            {!isKaOps && onLogout && (
              <button
                onClick={onLogout}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-rose-50 hover:text-rose-600 text-slate-600 flex items-center justify-center transition-colors cursor-pointer"
                title="Keluar dari Portal Monitoring"
              >
                <LogOut size={15} />
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Warning banner jika Nama Petugas belum diisi */}
      {!petugasName.trim() && (
        <div className={`border-b border-amber-200 py-2 flex items-center justify-between text-xs text-amber-900 animate-in fade-in duration-200 ${isSupervisorRole ? 'bg-[#FFF8E1] rounded-2xl border border-amber-200 mb-3 px-4 w-full' : 'bg-[#FFF8E1] px-4 sm:px-8'
          }`}>
          <div className={`flex items-center gap-2 w-full ${isSupervisorRole ? '' : 'max-w-[1440px] mx-auto'}`}>
            <AlertTriangle size={15} className="text-amber-600 shrink-0" />
            <span>
              <strong>Perhatian Petugas:</strong> Harap masukkan Nama Anda agar seluruh catatan tindakan dan upload CSV tercatat dalam audit log.
            </span>
            <button
              onClick={openDutyModal}
              className="ml-auto underline font-bold hover:text-amber-950 cursor-pointer"
            >
              Isi Sekarang &rarr;
            </button>
          </div>
        </div>
      )}

      {/* BANNER TIKET FOLLOW UP AKTIF */}
      {activeTickets.length > 0 && (
        <div className={`py-2.5 px-4 text-xs font-medium flex items-center justify-between transition-all animate-in fade-in duration-200 ${isSupervisorRole ? 'rounded-2xl border mb-3 shadow-xs w-full' : 'px-4 sm:px-8 border-b'
          } ${reOpenTicketsCount > 0
            ? 'bg-rose-50 text-rose-950 border-rose-300'
            : reqCloseTicketsCount > 0 && isSupervisorRole
              ? 'bg-purple-50 text-purple-950 border-purple-300'
              : 'bg-indigo-50 text-indigo-950 border-indigo-200'
          }`}>
          <div className={`w-full flex items-center justify-between ${isSupervisorRole ? '' : 'max-w-[1440px] mx-auto'}`}>
            <div className="flex items-center gap-2.5">
              <span className="relative flex h-2.5 w-2.5 shrink-0">
                <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${reOpenTicketsCount > 0 ? 'bg-rose-500' : 'bg-indigo-500'
                  }`}></span>
                <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${reOpenTicketsCount > 0 ? 'bg-rose-600' : 'bg-indigo-600'
                  }`}></span>
              </span>
              <div>
                {reOpenTicketsCount > 0 ? (
                  <span>
                    <strong className="text-rose-700 font-black">PERHATIAN MENDESAK:</strong> Terdapat{' '}
                    <strong className="text-rose-800 underline font-black">{reOpenTicketsCount} Tiket RE-OPEN</strong> oleh Ka Ops / Ka Wil karena penanganan belum tuntas. Mohon segera cek!
                  </span>
                ) : reqCloseTicketsCount > 0 && isSupervisorRole ? (
                  <span>
                    <strong className="text-purple-700 font-bold">MENUNGGU VALIDASI SUPERVISOR:</strong> Terdapat{' '}
                    <strong className="text-purple-800 underline font-bold">{reqCloseTicketsCount} Tiket</strong> yang telah diajukan tutup oleh Tim Monitoring dan siap divalidasi.
                  </span>
                ) : (
                  <span>
                    <strong className="text-indigo-800 font-bold">Radar Tiket Follow Up:</strong> Terdapat{' '}
                    <strong className="text-indigo-900 underline font-bold">{activeTickets.length} tiket aktif</strong> ({openTicketsCount} proses/open, {reqCloseTicketsCount} menunggu validasi).
                  </span>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setActiveTab('TIKET')}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer shadow-2xs shrink-0 flex items-center gap-1.5 ml-3 ${reOpenTicketsCount > 0
                  ? 'bg-rose-600 hover:bg-rose-700 text-white'
                  : reqCloseTicketsCount > 0 && isSupervisorRole
                    ? 'bg-purple-600 hover:bg-purple-700 text-white'
                    : 'bg-indigo-600 hover:bg-indigo-700 text-white'
                }`}
            >
              <span>Buka Dashboard Tiket &rarr;</span>
            </button>
          </div>
        </div>
      )}

      {/* Sync Status Banner */}
      {syncStatusBanner && (
        <div
          className={`py-2.5 text-xs font-medium flex items-center justify-between transition-all ${isSupervisorRole ? 'rounded-2xl border mb-3 px-4 shadow-xs w-full' : 'px-4 sm:px-8 border-b'
            } ${syncStatusBanner.type === 'syncing'
              ? 'bg-blue-50 text-blue-800 border-blue-200'
              : syncStatusBanner.type === 'success'
                ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                : 'bg-rose-50 text-rose-800 border-rose-200'
            }`}
        >
          <div className={`w-full flex items-center justify-between ${isSupervisorRole ? '' : 'max-w-[1440px] mx-auto'}`}>
            <div className="flex items-center gap-2">
              {syncStatusBanner.type === 'syncing' ? (
                <Clock size={15} className="animate-spin text-blue-600" />
              ) : syncStatusBanner.type === 'success' ? (
                <CheckCircle2 size={15} className="text-emerald-600" />
              ) : (
                <AlertTriangle size={15} className="text-rose-600" />
              )}
              <span>{syncStatusBanner.text}</span>
            </div>
            <button
              onClick={() => setSyncStatusBanner(null)}
              className="p-1 hover:bg-black/5 rounded text-slate-500 cursor-pointer"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      )}

      {/* ==================================================== */}
      {/* 2. MAIN VIEWPORT (FULL WIDTH FOR SUPERVISOR DASHBOARD) */}
      {/* ==================================================== */}
      <main className={`w-full flex-1 transition-all ${isSupervisorRole ? 'pt-0 pb-16' : 'max-w-[1440px] mx-auto px-4 sm:px-8 pt-4 pb-28'
        }`}>
        {/* ==================================================== */}
        {/* TAB 1: PROBLEM OPEN (UTAMA)                          */}
        {/* ==================================================== */}
        {activeTab === 'OPEN' && (
          <div className="flex flex-col w-full gap-4 animate-in fade-in duration-150">
            {/* Top Welcome & Sub-bar */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 py-1">
              <div className="flex items-center gap-3 flex-wrap">
                <h1 className="font-bold text-lg sm:text-xl text-[#0D1C2E] tracking-tight">
                  Monitoring Problem Open
                </h1>
                <AutoRefreshCountdown
                  isLoading={isLoadingOpen || isLoadingChronic}
                  connectionStatus={connectionStatus}
                  lastSyncedAt={lastSyncedAt}
                  intervalSeconds={120}
                  onRefresh={async () => {
                    await Promise.all([
                      fetchOpenIncidents(),
                      fetchChronicDataset()
                    ]);
                  }}
                />
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-50 text-slate-700 text-xs font-medium border border-[#E5EAF2]">
                  <span className={`w-2 h-2 rounded-full ${isLoadingChronic ? 'bg-amber-500 animate-pulse' : chronicDataset.length > 0 ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                  Data chronic: <strong className="text-[#0D1C2E]">{chronicDataset.length.toLocaleString('id-ID')}</strong> insiden / 14 hari
                </span>
              </div>

              {/* Right Utility Buttons */}
              <div className="flex items-center gap-2 self-start md:self-auto">
                <button
                  type="button"
                  onClick={openDutyModal}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white shadow-2xs hover:bg-[#EFF4FF] text-[#555F71] hover:text-[#0D1C2E] transition-all text-xs font-medium border border-[#EFF4FF] cursor-pointer"
                >
                  <ShieldCheck size={14} className="text-blue-600" />
                  <span>Ganti Petugas</span>
                </button>

                <button
                  type="button"
                  onClick={() => setIsSimulasiAman((prev) => !prev)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium border transition-all cursor-pointer ${isSimulasiAman
                      ? 'bg-emerald-100 text-emerald-800 border-emerald-300 font-bold'
                      : 'bg-white shadow-2xs hover:bg-[#EFF4FF] text-[#555F71] hover:text-[#0D1C2E] border-[#EFF4FF]'
                    }`}
                  title="Simulasikan tampilan ketika seluruh mesin beroperasi 100% normal"
                >
                  <Eye size={14} className={isSimulasiAman ? 'text-emerald-700' : 'text-[#555F71]'} />
                  <span>{isSimulasiAman ? 'Mode Normal Aktif' : 'Simulasi Semua Aman'}</span>
                </button>
              </div>
            </div>

            {/* Row of 5 Clickable Filter KPI Cards (Compact 92-102px height) */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2.5">
              {/* Card 1: Total Open */}
              <div
                onClick={() => handleCardFilterClick('ALL')}
                className={`cursor-pointer bg-white p-3 rounded-lg shadow-2xs flex items-center justify-between transition-all select-none border min-h-[92px] max-h-[102px] ${openCardFilter === 'ALL'
                    ? 'border-blue-600 bg-blue-50/30 ring-1 ring-blue-500'
                    : 'border-[#E5EAF2] hover:border-slate-300'
                  }`}
              >
                <div className="flex flex-col min-w-0">
                  <span className="text-[11px] font-semibold text-blue-600 uppercase tracking-wider truncate">
                    Total Open
                  </span>
                  <span className="text-2xl font-bold text-[#0D1C2E] leading-tight my-0.5">
                    {countOpenTotal}
                  </span>
                  <div className="flex items-center gap-1">
                    <span className="inline-flex items-center px-1.5 py-0.2 rounded bg-blue-50 text-blue-600 text-[9px] font-semibold border border-blue-200/60">
                      {openCardFilter === 'ALL' ? 'Aktif Dipilih' : 'Semua Problem'}
                    </span>
                  </div>
                </div>
                <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0 border border-blue-100">
                  <Server size={17} />
                </div>
              </div>

              {/* Card 2: Lebih dari 60 Menit */}
              <div
                onClick={() => handleCardFilterClick('OVER_60')}
                className={`cursor-pointer bg-white p-3 rounded-lg shadow-2xs flex items-center justify-between transition-all select-none border group min-h-[92px] max-h-[102px] ${openCardFilter === 'OVER_60'
                    ? 'border-rose-400 bg-rose-50/40 ring-1 ring-rose-400'
                    : 'border-[#E5EAF2] hover:border-rose-200'
                  }`}
              >
                <div className="flex flex-col min-w-0">
                  <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider truncate group-hover:text-rose-600">
                    &gt; 60 Menit
                  </span>
                  <span className="text-2xl font-bold text-[#BA1A1A] leading-tight my-0.5">
                    {countOver60}
                  </span>
                  <div className="flex items-center gap-1">
                    <span className="inline-flex items-center px-1.5 py-0.2 rounded bg-rose-50 text-rose-700 text-[9px] font-semibold border border-rose-200">
                      Prioritas Tinggi
                    </span>
                  </div>
                </div>
                <div className="w-8 h-8 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center shrink-0 border border-rose-100">
                  <Timer size={17} />
                </div>
              </div>

              {/* Card 3: Chronic 3x Sehari */}
              <div
                onClick={() => handleCardFilterClick('CHRONIC_3X_SEHARI')}
                className={`cursor-pointer bg-white p-3 rounded-lg shadow-2xs flex items-center justify-between transition-all select-none border group min-h-[92px] max-h-[102px] ${openCardFilter === 'CHRONIC_3X_SEHARI'
                    ? 'border-amber-400 bg-amber-50/40 ring-1 ring-amber-400'
                    : 'border-[#E5EAF2] hover:border-amber-200'
                  }`}
              >
                <div className="flex flex-col min-w-0">
                  <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider truncate group-hover:text-amber-700">
                    Chronic 3x Sehari
                  </span>
                  <span className="text-2xl font-bold text-[#B7791F] leading-tight my-0.5">
                    {count3xSehari}
                  </span>
                  <div className="flex items-center gap-1">
                    <span className="inline-flex items-center px-1.5 py-0.2 rounded bg-amber-50 text-amber-800 text-[9px] font-semibold border border-amber-200">
                      Hari Ini
                    </span>
                  </div>
                </div>
                <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center shrink-0 border border-amber-100">
                  <Flame size={17} />
                </div>
              </div>

              {/* Card 4: Chronic 3x dalam 5 Hari */}
              <div
                onClick={() => handleCardFilterClick('CHRONIC_3X_5HARI')}
                className={`cursor-pointer bg-white p-3 rounded-lg shadow-2xs flex items-center justify-between transition-all select-none border group min-h-[92px] max-h-[102px] ${openCardFilter === 'CHRONIC_3X_5HARI'
                    ? 'border-indigo-400 bg-indigo-50/40 ring-1 ring-indigo-400'
                    : 'border-[#E5EAF2] hover:border-slate-300'
                  }`}
              >
                <div className="flex flex-col min-w-0">
                  <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider truncate group-hover:text-slate-800">
                    Chronic 3x / 5 Hari
                  </span>
                  <span className="text-2xl font-bold text-[#0D1C2E] leading-tight my-0.5">
                    {count3x5Hari}
                  </span>
                  <div className="flex items-center gap-1">
                    <span className="inline-flex items-center px-1.5 py-0.2 rounded bg-slate-100 text-slate-600 text-[9px] font-semibold border border-slate-200">
                      5 Hari Terakhir
                    </span>
                  </div>
                </div>
                <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center shrink-0 border border-slate-200">
                  <Repeat size={17} />
                </div>
              </div>

              {/* Card 5: Belum Di-update */}
              <div
                onClick={() => handleCardFilterClick('NO_ACTION')}
                className={`cursor-pointer bg-white p-3 rounded-lg shadow-2xs flex items-center justify-between transition-all select-none border group col-span-2 md:col-span-1 min-h-[92px] max-h-[102px] ${openCardFilter === 'NO_ACTION'
                    ? 'border-blue-400 bg-blue-50/40 ring-1 ring-blue-400'
                    : 'border-[#E5EAF2] hover:border-slate-300'
                  }`}
              >
                <div className="flex flex-col min-w-0">
                  <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider truncate group-hover:text-blue-700">
                    Belum Di-update
                  </span>
                  <span className="text-2xl font-bold text-slate-600 leading-tight my-0.5">
                    {countNoAction}
                  </span>
                  <div className="flex items-center gap-1">
                    <span className="inline-flex items-center px-1.5 py-0.2 rounded bg-blue-50 text-blue-700 text-[9px] font-semibold border border-blue-200">
                      Perlu Tindakan
                    </span>
                  </div>
                </div>
                <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0 border border-blue-100">
                  <FileText size={17} />
                </div>
              </div>
            </div>

            {/* Empty State Simulation Card (when 0 or simulated) */}
            {(countOpenTotal === 0 || isSimulasiAman) && (
              <div className="bg-white p-8 rounded-2xl shadow-sm text-center border border-[#EFF4FF]">
                <div className="w-14 h-14 rounded-full bg-blue-50 text-blue-600 mx-auto flex items-center justify-center mb-3">
                  <CheckCircle2 size={32} />
                </div>
                <h3 className="font-bold text-base text-[#0D1C2E]">
                  Tidak ada problem open — semua mesin beroperasi normal 🎉
                </h3>
                <p className="text-xs text-[#555F71] max-w-md mx-auto mt-1">
                  Semua terminal ATM dan CRM berada dalam status online nominal. Laporan SLA operasional tercatat optimal 99.98%.
                </p>
                {isSimulasiAman && (
                  <button
                    type="button"
                    onClick={() => setIsSimulasiAman(false)}
                    className="mt-4 px-4 py-1.5 rounded-xl bg-[#EFF4FF] text-[#0D1C2E] text-xs font-semibold hover:bg-[#E5EEFF] transition-colors cursor-pointer"
                  >
                    Tutup Simulasi
                  </button>
                )}
              </div>
            )}

            {/* Clean Enterprise Filter Deck (Compact 2-row layout) */}
            <div className="bg-white rounded-lg p-3 shadow-2xs border border-[#E5EAF2] flex flex-col gap-2">
              {/* Row 1: Search, Active Count Badge, Sort, and Reset */}
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
                <div className="relative flex-1 min-w-[240px] max-w-xl">
                  <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={openSearch}
                    onChange={(e) => {
                      setOpenSearch(e.target.value);
                      setCurrentPageOpen(1);
                    }}
                    placeholder="Cari WSID, lokasi, atau ATM/CRM..."
                    className="w-full h-8 pl-8 pr-7 rounded-md bg-slate-50 text-xs text-slate-800 placeholder:text-slate-400 border border-[#E5EAF2] focus:outline-none focus:ring-1 focus:ring-blue-500 focus:bg-white transition-all"
                  />
                  {openSearch && (
                    <button
                      type="button"
                      onClick={() => setOpenSearch('')}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                    >
                      <X size={12} />
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-2 shrink-0 self-end md:self-auto flex-wrap">
                  {/* Export Excel Button */}
                  <button
                    type="button"
                    onClick={handleExportOpenToExcel}
                    className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md bg-[#EFF4FF] hover:bg-[#E5EEFF] text-blue-600 text-xs font-semibold shadow-2xs border border-blue-200/60 transition-all cursor-pointer"
                    title="Ekspor daftar Problem Open ke Excel"
                  >
                    <Download size={13} />
                    <span>Export Excel</span>
                  </button>

                  {/* Sort Dropdown */}
                  <div className="relative">
                    <select
                      value={openSortBy}
                      onChange={(e) => handleOpenSortByChange(e.target.value as any)}
                      className="h-8 px-2.5 pr-6 rounded-md bg-slate-50 hover:bg-slate-100 text-slate-800 text-xs font-medium outline-none cursor-pointer appearance-none border border-[#E5EAF2]"
                    >
                      <option value="DURASI_DESC">Sort: Durasi Terlama &darr;</option>
                      <option value="DURASI_ASC">Sort: Durasi Tercepat &uarr;</option>
                      <option value="WSID_ASC">Sort: WSID (A-Z)</option>
                      <option value="TIME_DESC">Sort: Start Time Terbaru</option>
                    </select>
                    <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  </div>

                  {/* Reset All Filters Button */}
                  {hasActiveOpenFilters && (
                    <button
                      type="button"
                      onClick={handleResetOpenFilters}
                      className="inline-flex items-center gap-1 text-rose-700 hover:bg-rose-50 border border-rose-200 text-xs font-semibold px-2.5 h-8 rounded-md transition-colors shrink-0 cursor-pointer"
                      title="Reset semua filter"
                    >
                      <RotateCcw size={12} />
                      <span>Reset</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Row 2: Secondary Filter Controls (Compact Toolbar) */}
              <div className="flex items-center gap-1.5 flex-wrap pt-1.5 border-t border-[#E5EAF2]">
                {/* 1. Multi-Select Event Code Dropdown (Standar 35 Event Codes) */}
                <div className="relative" ref={eventCodeDropdownRefOpen}>
                  <button
                    type="button"
                    onClick={() => setIsEventCodeDropdownOpenOpen((prev) => !prev)}
                    className={`inline-flex items-center gap-1 h-8 px-2.5 rounded-md text-xs font-medium transition-colors shrink-0 border cursor-pointer ${selectedEventCodesOpen.length > 0
                        ? 'bg-blue-50 text-blue-600 border-blue-600 font-semibold'
                        : 'bg-white hover:bg-slate-50 text-slate-700 border-[#E5EAF2]'
                      }`}
                  >
                    <SlidersHorizontal size={12} className={selectedEventCodesOpen.length > 0 ? 'text-blue-600' : 'text-slate-400'} />
                    <span className="text-slate-500">Event:</span>
                    <span className="font-semibold truncate max-w-[120px]">
                      {selectedEventCodesOpen.length === 0
                        ? `Semua (${openAvailableEvents.length})`
                        : selectedEventCodesOpen.length === 1
                          ? selectedEventCodesOpen[0]
                          : `${selectedEventCodesOpen.length} Dipilih`}
                    </span>
                    <ChevronDown size={12} className="text-slate-400" />
                  </button>

                  {isEventCodeDropdownOpenOpen && (
                    <div className="absolute left-0 mt-1 w-80 sm:w-96 bg-white rounded-lg shadow-xl border border-[#E5EAF2] z-50 p-2.5 flex flex-col gap-2 animate-in fade-in zoom-in-95 duration-150">
                      <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-1.5">
                        <div className="flex items-center gap-1">
                          <span className="font-bold text-xs text-slate-800">Filter Problem (Standar 35)</span>
                          <span className="text-[11px] text-slate-400">
                            ({selectedEventCodesOpen.length}/{openAvailableEvents.length})
                          </span>
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={selectAllEventCodesOpen}
                            className="text-[11px] text-blue-600 hover:underline font-semibold px-1.5 py-0.5 rounded cursor-pointer"
                          >
                            Pilih Semua
                          </button>
                          <span className="text-slate-300">&bull;</span>
                          <button
                            type="button"
                            onClick={clearAllEventCodesOpen}
                            className="text-[11px] text-rose-600 hover:underline font-semibold px-1.5 py-0.5 rounded cursor-pointer"
                          >
                            Reset
                          </button>
                        </div>
                      </div>

                      <div className="relative">
                        <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                          type="text"
                          placeholder="Cari deskripsi problem..."
                          value={eventCodeSearchOpen}
                          onChange={(e) => setEventCodeSearchOpen(e.target.value)}
                          className="w-full pl-7 pr-6 py-1 text-xs bg-slate-50 border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                        {eventCodeSearchOpen && (
                          <button
                            type="button"
                            onClick={() => setEventCodeSearchOpen('')}
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                          >
                            <X size={11} />
                          </button>
                        )}
                      </div>

                      <div className="max-h-56 overflow-y-auto divide-y divide-slate-100 pr-1">
                        {openAvailableEvents
                          .filter((code) => code.toLowerCase().includes(eventCodeSearchOpen.toLowerCase()))
                          .map((code) => {
                            const isChecked = selectedEventCodesOpen.includes(code);
                            const activeCount = openEventCountMap.get(code) || 0;
                            return (
                              <label
                                key={code}
                                className={`flex items-start justify-between gap-2 px-2 py-1.5 rounded cursor-pointer text-xs transition-colors ${isChecked ? 'bg-blue-50 text-blue-600 font-semibold' : 'hover:bg-slate-50 text-slate-700'
                                  }`}
                              >
                                <div className="flex items-start gap-1.5">
                                  <input
                                    type="checkbox"
                                    checked={isChecked}
                                    onChange={() => toggleEventCodeOpen(code)}
                                    className="mt-0.5 h-3.5 w-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                                  />
                                  <span className="leading-snug break-words">{code}</span>
                                </div>
                                {activeCount > 0 ? (
                                  <span className="shrink-0 px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-rose-100 text-rose-700">
                                    {activeCount}
                                  </span>
                                ) : (
                                  <span className="shrink-0 text-[10px] text-slate-300">0</span>
                                )}
                              </label>
                            );
                          })}
                      </div>
                    </div>
                  )}
                </div>

                {/* 2. Multi-Select Service Point Dropdown */}
                <div className="relative" ref={spDropdownRefOpen}>
                  <button
                    type="button"
                    onClick={() => {
                      setIsSpDropdownOpenOpen((prev) => !prev);
                      setIsEventCodeDropdownOpenOpen(false);
                      setIsSektorDropdownOpenOpen(false);
                      setIsVendorDropdownOpenOpen(false);
                      setIsTipeDropdownOpenOpen(false);
                    }}
                    className={`inline-flex items-center gap-1 h-8 px-2.5 rounded-md text-xs font-medium transition-colors shrink-0 border cursor-pointer ${selectedOpenSPs.length > 0
                        ? 'bg-blue-50 text-blue-600 border-blue-600 font-semibold'
                        : 'bg-white hover:bg-slate-50 text-slate-700 border-[#E5EAF2]'
                      }`}
                  >
                    <MapPin size={12} className={selectedOpenSPs.length > 0 ? 'text-blue-600' : 'text-slate-400'} />
                    <span className="text-slate-500">SP:</span>
                    <span className="font-semibold truncate max-w-[110px]">
                      {selectedOpenSPs.length === 0
                        ? `Semua (${openAvailableSPs.length})`
                        : selectedOpenSPs.length === 1
                          ? selectedOpenSPs[0]
                          : `${selectedOpenSPs.length} Dipilih`}
                    </span>
                    <ChevronDown size={12} className="text-slate-400" />
                  </button>

                  {isSpDropdownOpenOpen && (
                    <div className="absolute left-0 mt-1 w-72 sm:w-80 bg-white rounded-lg shadow-xl border border-[#E5EAF2] z-50 p-2.5 flex flex-col gap-2 animate-in fade-in zoom-in-95 duration-150">
                      <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-1.5">
                        <div className="flex items-center gap-1">
                          <span className="font-bold text-xs text-slate-800">Filter Service Point</span>
                          <span className="text-[11px] text-slate-400">
                            ({selectedOpenSPs.length}/{openAvailableSPs.length})
                          </span>
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={selectAllOpenSPs}
                            className="text-[11px] text-blue-600 hover:underline font-semibold px-1.5 py-0.5 rounded cursor-pointer"
                          >
                            Pilih Semua
                          </button>
                          <span className="text-slate-300">&bull;</span>
                          <button
                            type="button"
                            onClick={clearAllOpenSPs}
                            className="text-[11px] text-rose-600 hover:underline font-semibold px-1.5 py-0.5 rounded cursor-pointer"
                          >
                            Reset
                          </button>
                        </div>
                      </div>

                      <div className="relative">
                        <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                          type="text"
                          placeholder="Cari Service Point..."
                          value={spSearchOpen}
                          onChange={(e) => setSpSearchOpen(e.target.value)}
                          className="w-full pl-7 pr-6 py-1 text-xs bg-slate-50 border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                        {spSearchOpen && (
                          <button
                            type="button"
                            onClick={() => setSpSearchOpen('')}
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                          >
                            <X size={11} />
                          </button>
                        )}
                      </div>

                      <div className="max-h-56 overflow-y-auto divide-y divide-slate-100 pr-1">
                        {openAvailableSPs
                          .filter((sp) => sp.toLowerCase().includes(spSearchOpen.toLowerCase()))
                          .map((sp) => {
                            const isChecked = selectedOpenSPs.includes(sp);
                            const activeCount = openSpCountMap.get(sp) || 0;
                            return (
                              <label
                                key={sp}
                                className={`flex items-start justify-between gap-2 px-2 py-1.5 rounded cursor-pointer text-xs transition-colors ${isChecked ? 'bg-blue-50 text-blue-600 font-semibold' : 'hover:bg-slate-50 text-slate-700'
                                  }`}
                              >
                                <div className="flex items-start gap-1.5">
                                  <input
                                    type="checkbox"
                                    checked={isChecked}
                                    onChange={() => toggleOpenSP(sp)}
                                    className="mt-0.5 h-3.5 w-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                                  />
                                  <span className="leading-snug break-words">{sp}</span>
                                </div>
                                {activeCount > 0 ? (
                                  <span className="shrink-0 px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-rose-100 text-rose-700">
                                    {activeCount}
                                  </span>
                                ) : (
                                  <span className="shrink-0 text-[10px] text-slate-300">0</span>
                                )}
                              </label>
                            );
                          })}
                      </div>
                    </div>
                  )}
                </div>

                {/* 3. Multi-Select Sektor Dropdown */}
                <div className="relative" ref={sektorDropdownRefOpen}>
                  <button
                    type="button"
                    onClick={() => {
                      setIsSektorDropdownOpenOpen((prev) => !prev);
                      setIsEventCodeDropdownOpenOpen(false);
                      setIsSpDropdownOpenOpen(false);
                      setIsVendorDropdownOpenOpen(false);
                      setIsTipeDropdownOpenOpen(false);
                    }}
                    className={`inline-flex items-center gap-1 h-8 px-2.5 rounded-md text-xs font-medium transition-colors shrink-0 border cursor-pointer ${selectedOpenSektors.length > 0
                        ? 'bg-blue-50 text-blue-600 border-blue-600 font-semibold'
                        : 'bg-white hover:bg-slate-50 text-slate-700 border-[#E5EAF2]'
                      }`}
                  >
                    <Layers size={12} className={selectedOpenSektors.length > 0 ? 'text-blue-600' : 'text-slate-400'} />
                    <span className="text-slate-500">Sektor:</span>
                    <span className="font-semibold truncate max-w-[110px]">
                      {selectedOpenSektors.length === 0
                        ? `Semua (${openAvailableSektors.length})`
                        : selectedOpenSektors.length === 1
                          ? selectedOpenSektors[0]
                          : `${selectedOpenSektors.length} Dipilih`}
                    </span>
                    <ChevronDown size={12} className="text-slate-400" />
                  </button>

                  {isSektorDropdownOpenOpen && (
                    <div className="absolute left-0 mt-1 w-72 sm:w-80 bg-white rounded-lg shadow-xl border border-[#E5EAF2] z-50 p-2.5 flex flex-col gap-2 animate-in fade-in zoom-in-95 duration-150">
                      <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-1.5">
                        <div className="flex items-center gap-1">
                          <span className="font-bold text-xs text-slate-800">Filter Sektor</span>
                          <span className="text-[11px] text-slate-400">
                            ({selectedOpenSektors.length}/{openAvailableSektors.length})
                          </span>
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={selectAllOpenSektors}
                            className="text-[11px] text-blue-600 hover:underline font-semibold px-1.5 py-0.5 rounded cursor-pointer"
                          >
                            Pilih Semua
                          </button>
                          <span className="text-slate-300">&bull;</span>
                          <button
                            type="button"
                            onClick={clearAllOpenSektors}
                            className="text-[11px] text-rose-600 hover:underline font-semibold px-1.5 py-0.5 rounded cursor-pointer"
                          >
                            Reset
                          </button>
                        </div>
                      </div>

                      <div className="relative">
                        <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                          type="text"
                          placeholder="Cari Sektor..."
                          value={sektorSearchOpen}
                          onChange={(e) => setSektorSearchOpen(e.target.value)}
                          className="w-full pl-7 pr-6 py-1 text-xs bg-slate-50 border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                        {sektorSearchOpen && (
                          <button
                            type="button"
                            onClick={() => setSektorSearchOpen('')}
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                          >
                            <X size={11} />
                          </button>
                        )}
                      </div>

                      <div className="max-h-56 overflow-y-auto divide-y divide-slate-100 pr-1">
                        {openAvailableSektors
                          .filter((sk) => sk.toLowerCase().includes(sektorSearchOpen.toLowerCase()))
                          .map((sk) => {
                            const isChecked = selectedOpenSektors.includes(sk);
                            const activeCount = openSektorCountMap.get(sk) || 0;
                            return (
                              <label
                                key={sk}
                                className={`flex items-start justify-between gap-2 px-2 py-1.5 rounded cursor-pointer text-xs transition-colors ${isChecked ? 'bg-blue-50 text-blue-600 font-semibold' : 'hover:bg-slate-50 text-slate-700'
                                  }`}
                              >
                                <div className="flex items-start gap-1.5">
                                  <input
                                    type="checkbox"
                                    checked={isChecked}
                                    onChange={() => toggleOpenSektor(sk)}
                                    className="mt-0.5 h-3.5 w-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                                  />
                                  <span className="leading-snug break-words">{sk}</span>
                                </div>
                                {activeCount > 0 ? (
                                  <span className="shrink-0 px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-rose-100 text-rose-700">
                                    {activeCount}
                                  </span>
                                ) : (
                                  <span className="shrink-0 text-[10px] text-slate-300">0</span>
                                )}
                              </label>
                            );
                          })}
                      </div>
                    </div>
                  )}
                </div>

                {/* 4. Multi-Select Vendor Dropdown */}
                <div className="relative" ref={vendorDropdownRefOpen}>
                  <button
                    type="button"
                    onClick={() => {
                      setIsVendorDropdownOpenOpen((prev) => !prev);
                      setIsEventCodeDropdownOpenOpen(false);
                      setIsSpDropdownOpenOpen(false);
                      setIsSektorDropdownOpenOpen(false);
                      setIsTipeDropdownOpenOpen(false);
                    }}
                    className={`inline-flex items-center gap-1 h-8 px-2.5 rounded-md text-xs font-medium transition-colors shrink-0 border cursor-pointer ${selectedOpenVendors.length > 0
                        ? 'bg-blue-50 text-blue-600 border-blue-600 font-semibold'
                        : 'bg-white hover:bg-slate-50 text-slate-700 border-[#E5EAF2]'
                      }`}
                  >
                    <Wrench size={12} className={selectedOpenVendors.length > 0 ? 'text-blue-600' : 'text-slate-400'} />
                    <span className="text-slate-500">Vendor:</span>
                    <span className="font-semibold truncate max-w-[110px]">
                      {selectedOpenVendors.length === 0
                        ? `Semua (${openAvailableVendors.length})`
                        : selectedOpenVendors.length === 1
                          ? selectedOpenVendors[0]
                          : `${selectedOpenVendors.length} Dipilih`}
                    </span>
                    <ChevronDown size={12} className="text-slate-400" />
                  </button>

                  {isVendorDropdownOpenOpen && (
                    <div className="absolute left-0 mt-1 w-72 sm:w-80 bg-white rounded-lg shadow-xl border border-[#E5EAF2] z-50 p-2.5 flex flex-col gap-2 animate-in fade-in zoom-in-95 duration-150">
                      <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-1.5">
                        <div className="flex items-center gap-1">
                          <span className="font-bold text-xs text-slate-800">Filter Vendor</span>
                          <span className="text-[11px] text-slate-400">
                            ({selectedOpenVendors.length}/{openAvailableVendors.length})
                          </span>
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={selectAllOpenVendors}
                            className="text-[11px] text-blue-600 hover:underline font-semibold px-1.5 py-0.5 rounded cursor-pointer"
                          >
                            Pilih Semua
                          </button>
                          <span className="text-slate-300">&bull;</span>
                          <button
                            type="button"
                            onClick={clearAllOpenVendors}
                            className="text-[11px] text-rose-600 hover:underline font-semibold px-1.5 py-0.5 rounded cursor-pointer"
                          >
                            Reset
                          </button>
                        </div>
                      </div>

                      <div className="relative">
                        <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                          type="text"
                          placeholder="Cari Vendor..."
                          value={vendorSearchOpen}
                          onChange={(e) => setVendorSearchOpen(e.target.value)}
                          className="w-full pl-7 pr-6 py-1 text-xs bg-slate-50 border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                        {vendorSearchOpen && (
                          <button
                            type="button"
                            onClick={() => setVendorSearchOpen('')}
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                          >
                            <X size={11} />
                          </button>
                        )}
                      </div>

                      <div className="max-h-56 overflow-y-auto divide-y divide-slate-100 pr-1">
                        {openAvailableVendors
                          .filter((vd) => vd.toLowerCase().includes(vendorSearchOpen.toLowerCase()))
                          .map((vd) => {
                            const isChecked = selectedOpenVendors.includes(vd);
                            const activeCount = openVendorCountMap.get(vd) || 0;
                            return (
                              <label
                                key={vd}
                                className={`flex items-start justify-between gap-2 px-2 py-1.5 rounded cursor-pointer text-xs transition-colors ${isChecked ? 'bg-blue-50 text-blue-600 font-semibold' : 'hover:bg-slate-50 text-slate-700'
                                  }`}
                              >
                                <div className="flex items-start gap-1.5">
                                  <input
                                    type="checkbox"
                                    checked={isChecked}
                                    onChange={() => toggleOpenVendor(vd)}
                                    className="mt-0.5 h-3.5 w-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                                  />
                                  <span className="leading-snug break-words">{vd}</span>
                                </div>
                                {activeCount > 0 ? (
                                  <span className="shrink-0 px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-rose-100 text-rose-700">
                                    {activeCount}
                                  </span>
                                ) : (
                                  <span className="shrink-0 text-[10px] text-slate-300">0</span>
                                )}
                              </label>
                            );
                          })}
                      </div>
                    </div>
                  )}
                </div>

                {/* 5. Multi-Select Tipe Mesin Dropdown */}
                <div className="relative" ref={tipeDropdownRefOpen}>
                  <button
                    type="button"
                    onClick={() => {
                      setIsTipeDropdownOpenOpen((prev) => !prev);
                      setIsEventCodeDropdownOpenOpen(false);
                      setIsSpDropdownOpenOpen(false);
                      setIsSektorDropdownOpenOpen(false);
                      setIsVendorDropdownOpenOpen(false);
                    }}
                    className={`inline-flex items-center gap-1 h-8 px-2.5 rounded-md text-xs font-medium transition-colors shrink-0 border cursor-pointer ${selectedOpenTipes.length > 0
                        ? 'bg-blue-50 text-blue-600 border-blue-600 font-semibold'
                        : 'bg-white hover:bg-slate-50 text-slate-700 border-[#E5EAF2]'
                      }`}
                  >
                    <Cpu size={12} className={selectedOpenTipes.length > 0 ? 'text-blue-600' : 'text-slate-400'} />
                    <span className="text-slate-500">Tipe:</span>
                    <span className="font-semibold truncate max-w-[100px]">
                      {selectedOpenTipes.length === 0
                        ? 'Semua'
                        : selectedOpenTipes.length === 1
                          ? selectedOpenTipes[0]
                          : `${selectedOpenTipes.length} Dipilih`}
                    </span>
                    <ChevronDown size={12} className="text-slate-400" />
                  </button>

                  {isTipeDropdownOpenOpen && (
                    <div className="absolute left-0 mt-1 w-56 bg-white rounded-lg shadow-xl border border-[#E5EAF2] z-50 p-2.5 flex flex-col gap-2 animate-in fade-in zoom-in-95 duration-150">
                      <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-1.5">
                        <span className="font-bold text-xs text-slate-800">Filter Tipe Mesin</span>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={selectAllOpenTipes}
                            className="text-[11px] text-blue-600 hover:underline font-semibold px-1.5 py-0.5 rounded cursor-pointer"
                          >
                            Pilih Semua
                          </button>
                          <span className="text-slate-300">&bull;</span>
                          <button
                            type="button"
                            onClick={clearAllOpenTipes}
                            className="text-[11px] text-rose-600 hover:underline font-semibold px-1.5 py-0.5 rounded cursor-pointer"
                          >
                            Reset
                          </button>
                        </div>
                      </div>

                      <div className="divide-y divide-slate-100">
                        {['ATM', 'CRM'].map((tipe) => {
                          const isChecked = selectedOpenTipes.includes(tipe);
                          const activeCount = openTipeCountMap.get(tipe) || 0;
                          return (
                            <label
                              key={tipe}
                              className={`flex items-center justify-between gap-2 px-2 py-1.5 rounded cursor-pointer text-xs transition-colors ${isChecked ? 'bg-blue-50 text-blue-600 font-semibold' : 'hover:bg-slate-50 text-slate-700'
                                }`}
                            >
                              <div className="flex items-center gap-1.5">
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={() => toggleOpenTipe(tipe)}
                                  className="h-3.5 w-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                                />
                                <span>{tipe === 'ATM' ? 'ATM (Tarik Tunai)' : 'CRM / ATS (Setor Tarik)'}</span>
                              </div>
                              {activeCount > 0 ? (
                                <span className="shrink-0 px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-rose-100 text-rose-700">
                                  {activeCount}
                                </span>
                              ) : (
                                <span className="shrink-0 text-[10px] text-slate-300">0</span>
                              )}
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>

                {/* 6. Durasi Filter */}
                <div className="relative">
                  <select
                    value={openDurationFilter}
                    onChange={(e) => {
                      setOpenDurationFilter(e.target.value as any);
                      setCurrentPageOpen(1);
                    }}
                    className={`h-8 px-2.5 pr-6 rounded-md text-xs font-medium border outline-none cursor-pointer appearance-none ${openDurationFilter !== 'ALL'
                        ? 'bg-[#FFDAD6] text-[#BA1A1A] border-[#BA1A1A]/40 font-semibold'
                        : 'bg-white hover:bg-slate-50 text-slate-700 border-[#E5EAF2]'
                      }`}
                  >
                    <option value="ALL">Durasi: Semua</option>
                    <option value="OVER_45">Durasi: &gt; 45 Menit</option>
                    <option value="OVER_60">Durasi: &gt; 60 Menit</option>
                    <option value="OVER_180">Durasi: &gt; 180 Menit</option>
                  </select>
                  <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                </div>

                {/* 7. Action Filter */}
                <div className="relative">
                  <select
                    value={openActionFilter}
                    onChange={(e) => {
                      setOpenActionFilter(e.target.value as any);
                      setCurrentPageOpen(1);
                    }}
                    className={`h-8 px-2.5 pr-6 rounded-md text-xs font-medium border outline-none cursor-pointer appearance-none ${openActionFilter !== 'ALL'
                        ? 'bg-blue-50 text-blue-600 border-blue-600 font-semibold'
                        : 'bg-white hover:bg-slate-50 text-slate-700 border-[#E5EAF2]'
                      }`}
                  >
                    <option value="ALL">Tindakan: Semua</option>
                    <option value="NO_ACTION">Belum Ada Action</option>
                    <option value="HAS_ACTION">Sudah Ada Action</option>
                  </select>
                  <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                </div>

                {/* 8. Filter Periode Tanggal (Dari & Sampai) */}
                <div className="flex items-center gap-2 bg-white border border-[#E5EAF2] hover:border-blue-400 rounded-md px-2.5 h-8 shrink-0 transition-colors shadow-2xs">
                  <div
                    onClick={() => {
                      try {
                        openStartDateInputRef.current?.showPicker();
                      } catch (_) {
                        openStartDateInputRef.current?.focus();
                      }
                    }}
                    className="flex items-center gap-1.5 cursor-pointer hover:text-blue-600 transition-colors"
                    title="Pilih tanggal mulai"
                  >
                    <Calendar size={12} className={openStartDate !== 'ALL' ? 'text-blue-600' : 'text-slate-400'} />
                    <span className="text-[10px] font-bold text-slate-400 uppercase">Dari:</span>
                    <input
                      ref={openStartDateInputRef}
                      type="date"
                      value={openStartDate === 'ALL' ? '' : openStartDate}
                      onClick={(e) => {
                        try {
                          (e.target as any).showPicker?.();
                        } catch (_) {}
                      }}
                      onChange={(e) => {
                        setOpenStartDate(e.target.value || 'ALL');
                        setCurrentPageOpen(1);
                      }}
                      className="bg-transparent text-xs font-medium text-slate-700 focus:outline-none cursor-pointer"
                    />
                  </div>

                  <span className="text-slate-300">|</span>

                  <div
                    onClick={() => {
                      try {
                        openEndDateInputRef.current?.showPicker();
                      } catch (_) {
                        openEndDateInputRef.current?.focus();
                      }
                    }}
                    className="flex items-center gap-1.5 cursor-pointer hover:text-blue-600 transition-colors"
                    title="Pilih tanggal selesai"
                  >
                    <span className="text-[10px] font-bold text-slate-400 uppercase">Sampai:</span>
                    <input
                      ref={openEndDateInputRef}
                      type="date"
                      value={openEndDate === 'ALL' ? '' : openEndDate}
                      onClick={(e) => {
                        try {
                          (e.target as any).showPicker?.();
                        } catch (_) {}
                      }}
                      onChange={(e) => {
                        setOpenEndDate(e.target.value || 'ALL');
                        setCurrentPageOpen(1);
                      }}
                      className="bg-transparent text-xs font-medium text-slate-700 focus:outline-none cursor-pointer"
                    />
                  </div>

                  {(openStartDate !== 'ALL' || openEndDate !== 'ALL') && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setOpenStartDate('ALL');
                        setOpenEndDate('ALL');
                        setCurrentPageOpen(1);
                      }}
                      className="text-slate-400 hover:text-rose-600 ml-0.5 cursor-pointer transition-colors p-0.5"
                      title="Reset filter tanggal"
                    >
                      <X size={12} />
                    </button>
                  )}
                </div>
              </div>

              {/* Active Removable Filter Chips Sub-row */}
              {hasActiveOpenFilters && (
                <div className="flex items-center gap-1.5 pt-1.5 border-t border-[#E5EAF2] flex-wrap text-xs">
                  <span className="text-slate-500 font-medium mr-1 text-[11px]">Filter Aktif:</span>

                  {(openStartDate !== 'ALL' || openEndDate !== 'ALL') && (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-blue-50 text-blue-600 font-medium">
                      <Calendar size={12} />
                      <span>Periode: <strong>{openStartDate !== 'ALL' ? openStartDate : 'Awal'} s/d {openEndDate !== 'ALL' ? openEndDate : 'Akhir'}</strong></span>
                      <button
                        onClick={() => {
                          setOpenStartDate('ALL');
                          setOpenEndDate('ALL');
                        }}
                        className="hover:text-rose-600 cursor-pointer"
                      >
                        <X size={12} />
                      </button>
                    </span>
                  )}

                  {openCardFilter !== 'ALL' && (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#EFF4FF] text-[#0D1C2E] font-medium">
                      <span>Status: <strong>{openCardFilter}</strong></span>
                      <button onClick={() => setOpenCardFilter('ALL')} className="hover:text-rose-600 cursor-pointer">
                        <X size={12} />
                      </button>
                    </span>
                  )}

                  {openSearch && (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#EFF4FF] text-[#0D1C2E] font-medium">
                      <span>Cari: <strong>"{openSearch}"</strong></span>
                      <button onClick={() => setOpenSearch('')} className="hover:text-rose-600 cursor-pointer">
                        <X size={12} />
                      </button>
                    </span>
                  )}

                  {selectedEventCodesOpen.map((evt) => (
                    <span key={evt} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-blue-50 text-blue-600 font-medium">
                      <span>Event: <strong>{evt}</strong></span>
                      <button onClick={() => toggleEventCodeOpen(evt)} className="hover:text-rose-600 cursor-pointer">
                        <X size={12} />
                      </button>
                    </span>
                  ))}

                  {selectedOpenSPs.map((sp) => (
                    <span key={sp} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#EFF4FF] text-[#0D1C2E] font-medium">
                      <span>SP: <strong>{sp}</strong></span>
                      <button onClick={() => toggleOpenSP(sp)} className="hover:text-rose-600 cursor-pointer">
                        <X size={12} />
                      </button>
                    </span>
                  ))}

                  {selectedOpenSektors.map((sk) => (
                    <span key={sk} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#EFF4FF] text-[#0D1C2E] font-medium">
                      <span>Sektor: <strong>{sk}</strong></span>
                      <button onClick={() => toggleOpenSektor(sk)} className="hover:text-rose-600 cursor-pointer">
                        <X size={12} />
                      </button>
                    </span>
                  ))}

                  {selectedOpenVendors.map((vd) => (
                    <span key={vd} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#EFF4FF] text-[#0D1C2E] font-medium">
                      <span>Vendor: <strong>{vd}</strong></span>
                      <button onClick={() => toggleOpenVendor(vd)} className="hover:text-rose-600 cursor-pointer">
                        <X size={12} />
                      </button>
                    </span>
                  ))}

                  {selectedOpenTipes.map((tipe) => (
                    <span key={tipe} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#EFF4FF] text-[#0D1C2E] font-medium">
                      <span>Tipe: <strong>{tipe}</strong></span>
                      <button onClick={() => toggleOpenTipe(tipe)} className="hover:text-rose-600 cursor-pointer">
                        <X size={12} />
                      </button>
                    </span>
                  ))}

                  {openDurationFilter !== 'ALL' && (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#FFDAD6] text-[#BA1A1A] font-medium">
                      <span>Durasi: <strong>{openDurationFilter === 'OVER_45' ? '> 45 mnt' : openDurationFilter === 'OVER_60' ? '> 60 mnt' : '> 180 mnt'}</strong></span>
                      <button onClick={() => setOpenDurationFilter('ALL')} className="hover:text-rose-600 cursor-pointer">
                        <X size={12} />
                      </button>
                    </span>
                  )}

                  {openActionFilter !== 'ALL' && (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#EFF4FF] text-[#0D1C2E] font-medium">
                      <span>Tindakan: <strong>{openActionFilter === 'NO_ACTION' ? 'Belum Ada Action' : 'Sudah Ada Action'}</strong></span>
                      <button onClick={() => setOpenActionFilter('ALL')} className="hover:text-rose-600 cursor-pointer">
                        <X size={12} />
                      </button>
                    </span>
                  )}

                  <button
                    type="button"
                    onClick={handleResetOpenFilters}
                    className="text-blue-600 hover:underline font-semibold ml-2 cursor-pointer text-xs"
                  >
                    Hapus Semua
                  </button>
                </div>
              )}
            </div>

            {/* Main Incident Table Container (Enterprise Compact Table) */}
            <div className="bg-white rounded-lg p-3 shadow-2xs border border-[#E5EAF2] flex flex-col">
              <StickyTableWrapper tableWrapperClassName="w-full">
                <table className="w-full text-left border-collapse min-w-[1000px]">
                  <thead>
                    <tr className="h-8 bg-[#F8FAFC] text-slate-600 text-[11px] font-semibold uppercase tracking-wider border-b border-[#E5EAF2]">
                      <th className="pl-3 pr-2 w-9 text-center">
                        <input
                          type="checkbox"
                          checked={selectedIncidentKeys.size > 0 && selectedIncidentKeys.size === filteredOpenIncidents.length}
                          onChange={handleToggleSelectAll}
                          className="w-3.5 h-3.5 rounded text-blue-600 focus:ring-0 accent-blue-600 cursor-pointer"
                        />
                      </th>
                      <th
                        onClick={() => handleSortOpen('wsid')}
                        className="px-2.5 py-1.5 min-w-[190px] cursor-pointer hover:bg-slate-100/80 transition-colors select-none"
                      >
                        <div className="flex items-center gap-1">
                          <span>WSID / Lokasi</span>
                          {openSortColumn === 'wsid' ? (
                            openSortDirection === 'asc' ? <ChevronUp size={11} className="text-blue-600" /> : <ChevronDown size={11} className="text-blue-600" />
                          ) : (
                            <ArrowUpDown size={11} className="text-slate-400" />
                          )}
                        </div>
                      </th>
                      <th
                        onClick={() => handleSortOpen('typeMesin')}
                        className="px-2.5 py-1.5 min-w-[130px] cursor-pointer hover:bg-slate-100/80 transition-colors select-none"
                      >
                        <div className="flex items-center gap-1">
                          <span>Tipe / Vendor</span>
                          {openSortColumn === 'typeMesin' ? (
                            openSortDirection === 'asc' ? <ChevronUp size={11} className="text-blue-600" /> : <ChevronDown size={11} className="text-blue-600" />
                          ) : (
                            <ArrowUpDown size={11} className="text-slate-400" />
                          )}
                        </div>
                      </th>
                      <th
                        onClick={() => handleSortOpen('eventCodeDesc')}
                        className="px-2.5 py-1.5 min-w-[180px] cursor-pointer hover:bg-slate-100/80 transition-colors select-none"
                      >
                        <div className="flex items-center gap-1">
                          <span>Problem</span>
                          {openSortColumn === 'eventCodeDesc' ? (
                            openSortDirection === 'asc' ? <ChevronUp size={11} className="text-blue-600" /> : <ChevronDown size={11} className="text-blue-600" />
                          ) : (
                            <ArrowUpDown size={11} className="text-slate-400" />
                          )}
                        </div>
                      </th>
                      <th
                        onClick={() => handleSortOpen('startTime')}
                        className="px-2.5 py-1.5 w-28 cursor-pointer hover:bg-slate-100/80 transition-colors select-none"
                      >
                        <div className="flex items-center gap-1">
                          <span>Start</span>
                          {openSortColumn === 'startTime' ? (
                            openSortDirection === 'asc' ? <ChevronUp size={11} className="text-blue-600" /> : <ChevronDown size={11} className="text-blue-600" />
                          ) : (
                            <ArrowUpDown size={11} className="text-slate-400" />
                          )}
                        </div>
                      </th>
                      <th
                        onClick={() => handleSortOpen('durasiOpr')}
                        className="px-2.5 py-1.5 w-28 cursor-pointer hover:bg-slate-100/80 transition-colors select-none"
                      >
                        <div className="flex items-center gap-1">
                          <span className="flex items-center gap-1">
                            <span>Durasi</span>
                            <span className="inline-flex items-center px-1 py-0.2 rounded bg-emerald-100 text-emerald-800 text-[8px] font-bold tracking-wider">LIVE</span>
                          </span>
                          {openSortColumn === 'durasiOpr' ? (
                            openSortDirection === 'asc' ? <ChevronUp size={11} className="text-blue-600" /> : <ChevronDown size={11} className="text-blue-600" />
                          ) : (
                            <ArrowUpDown size={11} className="text-slate-400" />
                          )}
                        </div>
                      </th>
                      <th
                        onClick={() => handleSortOpen('chronic')}
                        className="px-2.5 py-1.5 w-28 cursor-pointer hover:bg-slate-100/80 transition-colors select-none"
                      >
                        <div className="flex items-center gap-1">
                          <span>Chronic Status</span>
                          {openSortColumn === 'chronic' ? (
                            openSortDirection === 'asc' ? <ChevronUp size={11} className="text-blue-600" /> : <ChevronDown size={11} className="text-blue-600" />
                          ) : (
                            <ArrowUpDown size={11} className="text-slate-400" />
                          )}
                        </div>
                      </th>
                      <th
                        onClick={() => handleSortOpen('actionTerakhir')}
                        className="px-2.5 py-1.5 min-w-[190px] cursor-pointer hover:bg-slate-100/80 transition-colors select-none"
                      >
                        <div className="flex items-center gap-1">
                          <span>Update Terakhir (Keterangan)</span>
                          {openSortColumn === 'actionTerakhir' ? (
                            openSortDirection === 'asc' ? <ChevronUp size={11} className="text-blue-600" /> : <ChevronDown size={11} className="text-blue-600" />
                          ) : (
                            <ArrowUpDown size={11} className="text-slate-400" />
                          )}
                        </div>
                      </th>
                      <th className="pr-3 pl-2 py-1.5 w-20 text-right">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="text-xs divide-y divide-[#EFF4FF]">
                    {paginatedOpenIncidents.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="py-12 text-center text-slate-400">
                          {isLoadingOpen && allDailyIncidents.length === 0 ? (
                            <div className="flex items-center justify-center gap-2 text-blue-600 font-medium">
                              <Clock size={16} className="animate-spin" />
                              <span>Memuat insiden dari server...</span>
                            </div>
                          ) : (
                            <div className="space-y-2 max-w-sm mx-auto">
                              <p className="font-semibold text-slate-700">Tidak ada problem open yang sesuai.</p>
                              <p className="text-xs text-slate-400">
                                {hasActiveOpenFilters
                                  ? 'Coba sesuaikan kata kunci pencarian atau reset filter aktif.'
                                  : 'Upload file incident CSV per jam untuk memuat data telemetri terkini.'}
                              </p>
                              {hasActiveOpenFilters && (
                                <button
                                  onClick={handleResetOpenFilters}
                                  className="mt-2 px-3.5 py-1.5 rounded-xl bg-[#EFF4FF] text-blue-600 font-semibold text-xs cursor-pointer hover:bg-[#E5EEFF]"
                                >
                                  Reset Filter
                                </button>
                              )}
                            </div>
                          )}
                        </td>
                      </tr>
                    ) : (
                      paginatedOpenIncidents.map((r) => {
                        const isSelected = selectedIncidentKeys.has(r.incidentKey);
                        const isDrawerActive = activeIncidentDetail?.incidentKey === r.incidentKey;
                        const chronic = chronicInfoMap.get(r.incidentKey);

                        return (
                          <tr
                            key={r.incidentKey}
                            className={`h-10 hover:bg-[#F8F9FF] transition-colors ${isDrawerActive
                                ? 'bg-blue-50/50 ring-1 ring-blue-400/40'
                                : isSelected
                                  ? 'bg-[#EFF4FF]/70'
                                  : ''
                              }`}
                          >
                            <td className="pl-3 pr-2 text-center">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => handleToggleSelectKey(r.incidentKey)}
                                className="w-4 h-4 rounded text-blue-600 focus:ring-0 accent-blue-600 cursor-pointer"
                              />
                            </td>

                            {/* 1. WSID / Lokasi */}
                            <td className="px-3 py-1.5">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="font-bold text-[#0D1C2E] font-mono">{r.wsid}</span>
                                {activeTicketByWsidMap.has(r.wsid.trim().toUpperCase()) && (() => {
                                  const t = activeTicketByWsidMap.get(r.wsid.trim().toUpperCase())!;
                                  const isReopen = t.status === 'RE_OPEN';
                                  const isReqClose = t.status === 'REQ_CLOSE';
                                  const dur = formatTicketDuration(t.createdAt, t.durasiMenitFinal, t.status === 'CLOSED');
                                  return (
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setSelectedTicketForDetail(t);
                                        setShowTicketCenterModal(true);
                                      }}
                                      className={`inline-flex items-center gap-1 px-1.5 py-0.2 rounded-md text-[10px] font-bold border transition-all cursor-pointer ${isReopen
                                          ? 'bg-rose-100 text-rose-800 border-rose-300 animate-pulse font-black'
                                          : isReqClose
                                            ? 'bg-purple-100 text-purple-800 border-purple-300'
                                            : 'bg-amber-100 text-amber-800 border-amber-300'
                                        }`}
                                      title={`Tiket #${t.ticketId} (${t.status}): Klik untuk melihat & tindak lanjut`}
                                    >
                                      <Ticket size={10} />
                                      <span>{isReopen ? 'RE-OPEN' : isReqClose ? 'REQ CLOSE' : t.prioritas} ({dur.text})</span>
                                    </button>
                                  );
                                })()}
                              </div>
                              <span className="text-[#555F71] text-[11px] block truncate max-w-[200px]" title={r.lokasi}>
                                {r.lokasi || '-'}
                              </span>
                            </td>

                            {/* 2. Tipe / Vendor */}
                            <td className="px-3 py-1.5 text-xs text-[#555F71]">
                              <div className="flex items-center gap-1.5">
                                <span className="font-semibold text-[#0D1C2E] block truncate max-w-[130px]" title={r.typeMesin}>
                                  {r.typeMesin || '-'}
                                </span>
                                {r.jenisMesin && (
                                  <span className={`px-1.5 py-0.2 rounded text-[9px] font-bold ${
                                    r.jenisMesin === 'CRM' ? 'bg-indigo-100 text-indigo-700' : 'bg-emerald-100 text-emerald-700'
                                  }`}>
                                    {r.jenisMesin}
                                  </span>
                                )}
                              </div>
                              <span className="text-[11px] font-medium text-slate-600 block truncate max-w-[140px]" title={`Vendor: ${r.vendor}`}>
                                Vendor: <strong className="font-bold text-slate-800">{r.vendor || '-'}</strong>
                              </span>
                            </td>

                            {/* 3. Problem */}
                            <td className="px-3 py-1.5">
                              <div className="flex items-center gap-1.5">
                                <span
                                  className={`w-2 h-2 rounded-full shrink-0 ${r.durasiOpr >= 180
                                      ? 'bg-[#BA1A1A]'
                                      : r.durasiOpr >= 60
                                        ? 'bg-amber-500'
                                        : 'bg-blue-600'
                                    }`}
                                />
                                <span className="text-[#0D1C2E] font-medium truncate max-w-[200px]" title={r.eventCodeDesc}>
                                  {r.eventCodeDesc}
                                </span>
                              </div>
                            </td>

                            {/* 4. Start Time */}
                            <td className="px-3 py-1.5 font-mono text-[11px] text-[#555F71] whitespace-nowrap">
                              {getDisplayStartTime(r)}
                            </td>

                            {/* 5. Durasi Badge */}
                            <td className="px-3 py-1.5 whitespace-nowrap">
                              <span
                                title={`Durasi Berjalan: ${r.durasiOpr} menit (sejak ${getDisplayStartTime(r)} s/d ${currentLiveTime.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })} WIB, sesuai jam kerja operasional WSID)`}
                                className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold font-mono tracking-tight cursor-help ${r.durasiOpr >= 180
                                    ? 'bg-[#FFDAD6] text-[#BA1A1A] animate-pulse font-extrabold'
                                    : r.durasiOpr >= 60
                                      ? 'bg-amber-100 text-amber-900 border border-amber-300'
                                      : 'bg-[#EFF4FF] text-[#555F71]'
                                  }`}
                              >
                                {formatDurationHuman(r.durasiOpr)}
                              </span>
                            </td>

                            {/* 6. Chronic Status */}
                            <td className="px-3 py-1.5 whitespace-nowrap">
                              {chronic?.is3xSehari ? (
                                <span
                                  title={`Problem yang sama terjadi ${chronic.sameDayCount}x hari ini`}
                                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 text-[10px] font-bold border border-amber-300"
                                >
                                  <Flame size={11} className="text-amber-700" />
                                  <span>3x hari ini</span>
                                </span>
                              ) : chronic?.is3x5Hari ? (
                                <span
                                  title={`Problem yang sama terjadi ${chronic.fiveDayCount}x dlm 5 hari`}
                                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#EFF4FF] text-blue-600 text-[10px] font-bold"
                                >
                                  <Repeat size={11} className="text-blue-600" />
                                  <span>3x/5 hari</span>
                                </span>
                              ) : (
                                <span className="text-[#555F71]/60 font-mono">-</span>
                              )}
                            </td>

                            {/* 7. Update Terakhir (Menampilkan Isi Keterangannya) */}
                            <td className="px-3 py-1.5">
                              {r.actionTerakhir &&
                                r.actionTerakhir !== '-' &&
                                !isTechnicalMachineLog(r.actionTerakhir) &&
                                r.actionTerakhirOleh !== 'CSV' ? (
                                <div className="flex flex-col gap-0.5 max-w-[240px]" title={`${r.actionTerakhir} (${r.actionTerakhirOleh || '-'} • ${formatStartProblemTime(r.actionTerakhirWaktu) !== '-' ? formatStartProblemTime(r.actionTerakhirWaktu) : (r.actionTerakhirWaktu || '-')})`}>
                                  <span className="text-xs font-semibold text-[#0D1C2E] truncate">
                                    {r.actionTerakhir}
                                  </span>
                                  <span className="text-[10px] text-[#555F71] flex items-center gap-1.5 truncate">
                                    <CheckCircle2 size={11} className="text-blue-600 shrink-0" />
                                    {renderAuthorBadge(r.actionTerakhirOleh)}
                                    <span className="truncate">{cleanAuthorName(r.actionTerakhirOleh)} &bull; {formatStartProblemTime(r.actionTerakhirWaktu) !== '-' ? formatStartProblemTime(r.actionTerakhirWaktu) : (r.actionTerakhirWaktu || '-')}</span>
                                  </span>
                                </div>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#EFF4FF] text-[#555F71] text-[10px] font-medium">
                                  <span className="w-1.5 h-1.5 rounded-full bg-[#BA1A1A] animate-pulse"></span>
                                  <span>Belum di-update</span>
                                </span>
                              )}
                            </td>

                            {/* 8. Aksi Button */}
                            <td className="pr-3 pl-2 py-1.5 text-right whitespace-nowrap">
                              <div className="inline-flex items-center gap-1.5 justify-end">
                                {activeTicketByWsidMap.has(r.wsid.trim().toUpperCase()) ? (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setSelectedTicketForDetail(activeTicketByWsidMap.get(r.wsid.trim().toUpperCase())!);
                                      setShowTicketCenterModal(true);
                                    }}
                                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-bold transition-colors cursor-pointer shadow-2xs"
                                    title="Lihat & Tindak Lanjut Tiket Follow Up"
                                  >
                                    <Ticket size={11} />
                                    <span>Tiket Aktif</span>
                                  </button>
                                ) : isSupervisorRole ? (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleOpenKaOpsFollowUp(r, 'OPEN_INCIDENT');
                                    }}
                                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-[11px] font-bold border border-indigo-200 transition-colors cursor-pointer shadow-2xs"
                                    title="Ajukan permintaan tindak lanjut untuk problem ini"
                                  >
                                    <Send size={11} className="text-indigo-600" />
                                    <span>Req Follow Up</span>
                                  </button>
                                ) : null}
                                <button
                                  type="button"
                                  onClick={() => handleOpenDetailDrawer(r)}
                                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#EFF4FF] hover:bg-blue-600 hover:text-blue-700 text-blue-600 text-xs font-semibold transition-colors cursor-pointer"
                                >
                                  <span>Update</span>
                                  <Edit3 size={12} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </StickyTableWrapper>

              {/* Pagination Footer */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 mt-2 border-t border-[#EFF4FF] text-xs text-[#555F71]">
                <div className="flex items-center gap-2">
                  <span>
                    Menampilkan <strong className="text-[#0D1C2E] font-semibold">
                      {paginatedOpenIncidents.length > 0 ? (currentPageOpen - 1) * pageSizeOpen + 1 : 0}–
                      {Math.min(currentPageOpen * pageSizeOpen, sortedOpenIncidents.length)}
                    </strong> dari <strong className="text-[#0D1C2E] font-semibold">{sortedOpenIncidents.length}</strong> problem
                  </span>
                  <span>&bull;</span>
                  <div className="flex items-center gap-1">
                    <span>Tampilkan:</span>
                    <select
                      value={pageSizeOpen}
                      onChange={(e) => {
                        setPageSizeOpen(Number(e.target.value));
                        setCurrentPageOpen(1);
                      }}
                      className="bg-[#EFF4FF] px-2 py-0.5 rounded-lg text-[#0D1C2E] font-semibold outline-none cursor-pointer"
                    >
                      <option value={10}>10 per halaman</option>
                      <option value={15}>15 per halaman</option>
                      <option value={25}>25 per halaman</option>
                      <option value={50}>50 per halaman</option>
                      <option value={100}>100 per halaman</option>
                    </select>
                  </div>
                </div>

                <div className="flex items-center gap-1 self-end sm:self-auto">
                  <button
                    type="button"
                    disabled={currentPageOpen <= 1}
                    onClick={() => setCurrentPageOpen((p) => Math.max(1, p - 1))}
                    className="w-7 h-7 rounded-lg flex items-center justify-center bg-[#F8F9FF] hover:bg-[#EFF4FF] text-[#555F71] disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
                  >
                    <ChevronLeft size={15} />
                  </button>

                  <span className="px-2.5 text-xs font-semibold text-[#0D1C2E]">
                    {currentPageOpen} / {totalPagesOpen}
                  </span>

                  <button
                    type="button"
                    disabled={currentPageOpen >= totalPagesOpen}
                    onClick={() => setCurrentPageOpen((p) => Math.min(totalPagesOpen, p + 1))}
                    className="w-7 h-7 rounded-lg flex items-center justify-center bg-[#F8F9FF] hover:bg-[#EFF4FF] text-[#555F71] disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
                  >
                    <ChevronRight size={15} />
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ======================================================== */}
        {/* TAB 2: FREKUENSI PER TANGGAL (STITCH MATRIX TABLE)      */}
        {/* ======================================================== */}
        {activeTab === 'FREKUENSI' && (
          <div className="flex flex-col w-full gap-4 animate-in fade-in duration-150">
            {/* Top Command & Filter Deck */}
            <div className="w-full bg-white rounded-2xl p-4 shadow-sm border border-[#EFF4FF] flex flex-wrap items-center justify-between gap-3">
              {/* Left Filters Group */}
              <div className="flex flex-wrap items-center gap-2.5 flex-1 min-w-[280px]">
                <div className="relative flex-1 min-w-[200px] max-w-sm">
                  <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Cari WSID, lokasi, SP, problem..."
                    value={freqSearch}
                    onChange={(e) => {
                      setFreqSearch(e.target.value);
                      setCurrentPageFreq(1);
                    }}
                    className="w-full h-9 pl-9 pr-3 rounded-xl bg-[#F8F9FF] text-xs text-[#0D1C2E] border border-[#EFF4FF] outline-none focus:bg-white focus:ring-1 focus:ring-blue-500"
                  />
                </div>

                {/* Multi-Select Event Code Filter */}
                <div className="relative" ref={eventCodeDropdownRefFreq}>
                  <button
                    type="button"
                    onClick={() => setIsEventCodeDropdownOpenFreq((prev) => !prev)}
                    className={`h-9 px-3 rounded-xl text-xs font-medium border flex items-center gap-1.5 cursor-pointer ${selectedEventCodesFreq.length > 0
                        ? 'bg-blue-50 text-blue-600 border-blue-600'
                        : 'bg-[#F8F9FF] hover:bg-[#EFF4FF] text-[#0D1C2E] border-[#EFF4FF]'
                      }`}
                  >
                    <SlidersHorizontal size={13} className="text-blue-600" />
                    <span className="truncate max-w-[160px]">
                      {selectedEventCodesFreq.length === 0
                        ? `Event Code (${freqAvailableEvents.length})`
                        : `${selectedEventCodesFreq.length} Dipilih`}
                    </span>
                    <ChevronDown size={13} />
                  </button>

                  {isEventCodeDropdownOpenFreq && (
                    <div className="absolute left-0 mt-1.5 w-80 sm:w-96 bg-white rounded-2xl shadow-xl border border-slate-200 z-50 p-3 flex flex-col gap-2.5 animate-in fade-in zoom-in-95 duration-150">
                      <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-2">
                        <span className="font-bold text-xs text-[#0D1C2E]">Filter Event Code</span>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={selectAllEventCodesFreq}
                            className="text-[11px] text-blue-600 hover:underline font-semibold px-2 py-0.5 rounded cursor-pointer"
                          >
                            Pilih Semua
                          </button>
                          <span className="text-slate-300">&bull;</span>
                          <button
                            type="button"
                            onClick={clearAllEventCodesFreq}
                            className="text-[11px] text-rose-600 hover:underline font-semibold px-2 py-0.5 rounded cursor-pointer"
                          >
                            Reset
                          </button>
                        </div>
                      </div>

                      <div className="relative">
                        <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                          type="text"
                          placeholder="Cari deskripsi event..."
                          value={eventCodeSearchFreq}
                          onChange={(e) => setEventCodeSearchFreq(e.target.value)}
                          className="w-full pl-8 pr-7 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                      </div>

                      <div className="max-h-60 overflow-y-auto divide-y divide-slate-100 pr-1">
                        {freqAvailableEvents
                          .filter((code) => code.toLowerCase().includes(eventCodeSearchFreq.toLowerCase()))
                          .map((code) => {
                            const isChecked = selectedEventCodesFreq.includes(code);
                            return (
                              <label
                                key={code}
                                className={`flex items-start gap-2.5 px-2 py-1.5 rounded-lg cursor-pointer text-xs transition-colors ${isChecked ? 'bg-blue-50 text-blue-600 font-semibold' : 'hover:bg-slate-50 text-slate-700'
                                  }`}
                              >
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={() => toggleEventCodeFreq(code)}
                                  className="mt-0.5 h-3.5 w-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                                />
                                <span className="leading-snug break-words">{code}</span>
                              </label>
                            );
                          })}
                      </div>
                    </div>
                  )}
                </div>

                {/* Month Filter */}
                <select
                  value={freqMonth}
                  onChange={(e) => {
                    const newMonth = e.target.value;
                    setFreqMonth(newMonth);
                    setCurrentPageFreq(1);
                    loadFrequencyData(newMonth);
                  }}
                  className="h-9 px-3 rounded-xl bg-[#F8F9FF] hover:bg-[#EFF4FF] text-[#0D1C2E] text-xs font-semibold border border-[#EFF4FF] outline-none cursor-pointer"
                >
                  {freqAvailableMonths.map((m) => {
                    const [y, mo] = m.split('-');
                    const monthNames = ['', 'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
                    const label = `${monthNames[parseInt(mo, 10)] || mo} ${y}`;
                    return (
                      <option key={m} value={m}>
                        Bulan: {label} ({m})
                      </option>
                    );
                  })}
                </select>

                {/* Service Point Filter */}
                <select
                  value={freqServicePoint}
                  onChange={(e) => {
                    setFreqServicePoint(e.target.value);
                    setCurrentPageFreq(1);
                  }}
                  className="h-9 px-3 rounded-xl bg-[#F8F9FF] hover:bg-[#EFF4FF] text-[#0D1C2E] text-xs font-medium border border-[#EFF4FF] outline-none cursor-pointer"
                >
                  <option value="ALL">Semua Service Point</option>
                  {freqAvailableSPs.map((sp) => (
                    <option key={sp} value={sp}>SP: {sp}</option>
                  ))}
                </select>

                {/* Date Filter: Range Dari & Sampai (Kalender) */}
                <div className="flex items-center gap-2 h-9 px-2.5 rounded-xl bg-white border border-[#E5EAF2] text-xs shadow-xs hover:border-blue-400 transition-colors">
                  <div
                    className="flex items-center gap-1.5 cursor-pointer"
                    onClick={() => freqStartDateInputRef.current?.showPicker()}
                    title="Pilih tanggal mulai"
                  >
                    <Calendar size={13} className="text-blue-600 shrink-0" />
                    <span className="text-[10px] font-bold text-slate-400 uppercase">Dari:</span>
                    <input
                      ref={freqStartDateInputRef}
                      type="date"
                      value={freqStartDate === 'ALL' ? '' : freqStartDate}
                      onClick={(e) => {
                        try {
                          (e.target as any).showPicker?.();
                        } catch {}
                      }}
                      onChange={(e) => {
                        setFreqStartDate(e.target.value || 'ALL');
                        setCurrentPageFreq(1);
                      }}
                      className="bg-transparent text-[#0D1C2E] font-medium outline-none cursor-pointer text-xs"
                    />
                  </div>
                  <span className="text-slate-300">|</span>
                  <div
                    className="flex items-center gap-1.5 cursor-pointer"
                    onClick={() => freqEndDateInputRef.current?.showPicker()}
                    title="Pilih tanggal akhir"
                  >
                    <span className="text-[10px] font-bold text-slate-400 uppercase">Sampai:</span>
                    <input
                      ref={freqEndDateInputRef}
                      type="date"
                      value={freqEndDate === 'ALL' ? '' : freqEndDate}
                      onClick={(e) => {
                        try {
                          (e.target as any).showPicker?.();
                        } catch {}
                      }}
                      onChange={(e) => {
                        setFreqEndDate(e.target.value || 'ALL');
                        setCurrentPageFreq(1);
                      }}
                      className="bg-transparent text-[#0D1C2E] font-medium outline-none cursor-pointer text-xs"
                    />
                  </div>
                  {(freqStartDate !== 'ALL' || freqEndDate !== 'ALL') && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setFreqStartDate('ALL');
                        setFreqEndDate('ALL');
                        setCurrentPageFreq(1);
                      }}
                      className="text-xs text-rose-500 hover:text-rose-700 font-bold px-1 py-0.5 rounded-md hover:bg-rose-50 transition-colors ml-1 cursor-pointer"
                      title="Tampilkan Semua Tanggal"
                    >
                      ✕
                    </button>
                  )}
                </div>

                {(freqSearch || selectedEventCodesFreq.length > 0 || freqServicePoint !== 'ALL' || freqMonth !== 'ALL' || freqStartDate !== 'ALL' || freqEndDate !== 'ALL' || freqDateFilter !== 'ALL') && (
                  <button
                    type="button"
                    onClick={() => {
                      setFreqSearch('');
                      setSelectedEventCodesFreq([]);
                      setFreqServicePoint('ALL');
                      setFreqMonth('ALL');
                      setFreqDateFilter('ALL');
                      setFreqStartDate('ALL');
                      setFreqEndDate('ALL');
                      setSortFieldFreq('totalFrekuensi');
                      setSortDirectionFreq('desc');
                      setCurrentPageFreq(1);
                    }}
                    className="inline-flex items-center gap-1 text-[#555F71] hover:text-[#BA1A1A] text-xs font-medium px-2 transition-colors cursor-pointer"
                  >
                    <RotateCcw size={13} />
                    <span>Reset</span>
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2">
                {/* Sync Database Button */}
                <button
                  type="button"
                  onClick={() => loadFrequencyData(freqMonth, true)}
                  disabled={isLoadingFreq}
                  className="inline-flex items-center gap-1.5 h-9 px-3 rounded-xl bg-[#EFF4FF] hover:bg-[#E5EEFF] text-blue-600 text-xs font-semibold shadow-2xs transition-all cursor-pointer"
                  title="Sinkronkan data frekuensi dari database Supabase"
                >
                  <RefreshCw size={13} className={isLoadingFreq ? 'animate-spin' : ''} />
                  <span>Sync DB</span>
                </button>

                {/* Export Excel Button */}
                <button
                  type="button"
                  onClick={handleExportFreqTableExcel}
                  className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-xl bg-[#EFF4FF] hover:bg-[#E5EEFF] text-blue-600 text-xs font-semibold shadow-2xs transition-all cursor-pointer"
                  title="Ekspor seluruh matriks data frekuensi problem ke Excel"
                >
                  <Download size={14} />
                  <span>Export Excel</span>
                </button>
              </div>
            </div>

            {/* Status & Banner Notifikasi Frekuensi */}
            {freqError && (
              <div className="w-full bg-rose-50 border border-rose-200 text-rose-700 px-4 py-2.5 rounded-xl text-xs flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <AlertTriangle size={15} className="text-rose-600 shrink-0" />
                  <span>{freqError}</span>
                </div>
                <button
                  type="button"
                  onClick={() => loadFrequencyData(freqMonth, true)}
                  className="text-xs font-bold underline hover:text-rose-900 cursor-pointer"
                >
                  Coba Lagi
                </button>
              </div>
            )}
            {freqSuccessMsg && !freqError && (
              <div className="w-full bg-emerald-50 border border-emerald-200 text-emerald-800 px-4 py-2 rounded-xl text-xs flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CheckCircle2 size={15} className="text-emerald-600 shrink-0" />
                  <span>{freqSuccessMsg}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setFreqSuccessMsg(null)}
                  className="text-xs text-emerald-600 hover:text-emerald-900 cursor-pointer font-bold"
                >
                  ✕
                </button>
              </div>
            )}

            {/* Matrix Table Card */}
            <div className="bg-white rounded-2xl shadow-sm border border-[#EFF4FF] overflow-hidden">
              <div
                ref={tabFreqTableContainerRef}
                onScroll={handleTabFreqTableScroll}
                className="overflow-x-auto relative"
              >
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-[#F8F9FF] text-[#555F71] font-bold uppercase tracking-wider text-[11px] border-b border-[#E5EAF2] select-none h-10">
                      <th className="py-2 px-3 w-12 text-center">No</th>
                      <th
                        onClick={() => handleSortFreq('wsid')}
                        className="py-2 px-3 cursor-pointer hover:bg-slate-100/80 transition-colors"
                      >
                        <div className="flex items-center gap-1">
                          <span>WSID</span>
                          <ArrowUpDown size={12} className={sortFieldFreq === 'wsid' ? 'text-blue-600' : 'text-slate-400'} />
                        </div>
                      </th>
                      <th
                        onClick={() => handleSortFreq('lokasi')}
                        className="py-2 px-3 cursor-pointer hover:bg-slate-100/80 transition-colors"
                      >
                        <div className="flex items-center gap-1">
                          <span>Lokasi</span>
                          <ArrowUpDown size={12} className={sortFieldFreq === 'lokasi' ? 'text-blue-600' : 'text-slate-400'} />
                        </div>
                      </th>
                      <th
                        onClick={() => handleSortFreq('servicePointSektor')}
                        className="py-2 px-3 cursor-pointer hover:bg-slate-100/80 transition-colors"
                      >
                        <div className="flex items-center gap-1">
                          <span>Service Point - Sektor</span>
                          <ArrowUpDown size={12} className={sortFieldFreq === 'servicePointSektor' ? 'text-blue-600' : 'text-slate-400'} />
                        </div>
                      </th>
                      <th
                        onClick={() => handleSortFreq('eventCodeDesc')}
                        className="py-2 px-3 cursor-pointer hover:bg-slate-100/80 transition-colors"
                      >
                        <div className="flex items-center gap-1">
                          <span>Problem (Event Code)</span>
                          <ArrowUpDown size={12} className={sortFieldFreq === 'eventCodeDesc' ? 'text-blue-600' : 'text-slate-400'} />
                        </div>
                      </th>

                      {/* Dynamic Date Columns */}
                      {displayedFreqDates.map((date) => {
                        const isSorted = sortFieldFreq === date;
                        return (
                          <th
                            key={date}
                            onClick={() => handleSortFreq(date)}
                            className={`py-2 px-2 text-center whitespace-nowrap min-w-[70px] cursor-pointer select-none transition-all ${isSorted
                                ? 'bg-blue-50 text-blue-600 border-x border-blue-200 font-bold'
                                : 'hover:bg-slate-100 text-[#555F71]'
                              }`}
                          >
                            <div className="flex items-center justify-center gap-1">
                              <span>{date.slice(0, 5)}</span>
                              <ArrowUpDown size={11} className={isSorted ? 'text-blue-600' : 'text-slate-400'} />
                            </div>
                          </th>
                        );
                      })}

                      <th
                        onClick={() => handleSortFreq('totalFrekuensi')}
                        className="py-2 px-3 text-center cursor-pointer hover:bg-slate-100/80 transition-colors bg-blue-50/50 text-blue-600 border-x border-blue-200"
                      >
                        <div className="flex items-center justify-center gap-1">
                          <span>Total Frekuensi</span>
                          <ArrowUpDown size={12} className={sortFieldFreq === 'totalFrekuensi' ? 'text-blue-600' : 'text-slate-400'} />
                        </div>
                      </th>

                      <th
                        onClick={() => handleSortFreq('totalDurasi')}
                        className="py-2 px-3 text-right cursor-pointer hover:bg-slate-100/80 text-[#555F71] transition-colors"
                      >
                        <div className="flex items-center justify-end gap-1">
                          <span>Total Durasi</span>
                          <ArrowUpDown size={12} className={sortFieldFreq === 'totalDurasi' ? 'text-blue-600' : 'text-slate-400'} />
                        </div>
                      </th>

                      <th className="py-2 px-3 text-center whitespace-nowrap text-blue-600 bg-blue-50/50 font-semibold border-l border-blue-200">
                        Penanganan Problem
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#EFF4FF]">
                    {isLoadingFreq && paginatedFreqItems.length === 0 ? (
                      <tr>
                        <td colSpan={7 + displayedFreqDates.length} className="text-center py-16 text-slate-500">
                          <div className="flex flex-col items-center justify-center gap-2">
                            <RefreshCw size={24} className="animate-spin text-blue-600" />
                            <span className="font-semibold text-xs text-[#0D1C2E]">Memuat matriks frekuensi bulan {freqMonth}...</span>
                            <span className="text-[11px] text-slate-400">Mengambil data agregasi dari database Supabase</span>
                          </div>
                        </td>
                      </tr>
                    ) : paginatedFreqItems.length === 0 ? (
                      <tr>
                        <td colSpan={7 + displayedFreqDates.length} className="text-center py-12 text-slate-400">
                          {freqError ? (
                            <div className="flex flex-col items-center gap-2 text-rose-600">
                              <AlertTriangle size={20} />
                              <span className="text-xs font-semibold">{freqError}</span>
                              <button
                                type="button"
                                onClick={() => loadFrequencyData(freqMonth, true)}
                                className="px-3 py-1 bg-rose-100 hover:bg-rose-200 text-rose-800 rounded-lg text-xs font-semibold cursor-pointer"
                              >
                                Coba Lagi
                              </button>
                            </div>
                          ) : (
                            `Tidak ada data frekuensi untuk bulan ${freqMonth} yang cocok dengan filter saat ini.`
                          )}
                        </td>
                      </tr>
                    ) : (
                      paginatedFreqItems.map((item, idx) => {
                        const rowNumber = (currentPageFreq - 1) * pageSizeFreq + idx + 1;
                        return (
                          <tr key={`${item.wsid}-${item.eventCodeDesc}-${idx}`} className="h-10 hover:bg-[#F8F9FF] transition-colors">
                            <td className="py-2 px-3 text-center text-slate-400 font-mono">{rowNumber}</td>
                            <td className="py-2 px-3 whitespace-nowrap">
                              <button
                                type="button"
                                onClick={() => handleOpenFreqDetail(item)}
                                className="font-bold text-[#0D1C2E] font-mono hover:text-blue-600 hover:underline cursor-pointer text-left"
                                title="Klik untuk melihat rekap penanganan mesin ini"
                              >
                                {item.wsid}
                              </button>
                            </td>
                            <td className="py-2 px-3 text-[#555F71] max-w-[200px] truncate" title={item.lokasi}>
                              {item.lokasi}
                            </td>
                            <td className="py-2 px-3 text-[#555F71] whitespace-nowrap text-[11px]">
                              {item.servicePointSektor}
                            </td>
                            <td className="py-2 px-3 text-[#0D1C2E] font-medium truncate max-w-[220px]" title={item.eventCodeDesc}>
                              {item.eventCodeDesc}
                            </td>

                            {/* Dynamic Date Occurrences */}
                            {displayedFreqDates.map((date) => {
                              const count = item.dateCounts?.[date] || 0;
                              const isSorted = sortFieldFreq === date;
                              return (
                                <td
                                  key={date}
                                  className={`py-1 px-2 text-center font-mono transition-colors ${isSorted ? 'bg-blue-50/40 border-x border-blue-100' : ''
                                    }`}
                                >
                                  {count > 0 ? (
                                    <button
                                      type="button"
                                      onClick={() => handleOpenFreqDetail(item, date)}
                                      className={`inline-block px-2 py-0.5 rounded font-bold text-[11px] cursor-pointer hover:scale-105 transition-all ${isSorted
                                          ? 'bg-blue-600 text-white shadow-2xs'
                                          : count >= 5
                                            ? 'bg-rose-100 text-rose-800 font-extrabold border border-rose-300'
                                            : count >= 3
                                              ? 'bg-amber-100 text-amber-800 border border-amber-300'
                                              : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                                        }`}
                                      title={`Terjadi ${count}x pada tgl ${date}. Klik untuk membuka detail penanganan tanggal ini.`}
                                    >
                                      {count}
                                    </button>
                                  ) : (
                                    <span className="text-slate-300">-</span>
                                  )}
                                </td>
                              );
                            })}

                            <td className="py-1 px-3 text-center whitespace-nowrap bg-blue-50/30">
                              <span className="px-2.5 py-0.5 rounded-full font-bold font-mono text-xs bg-blue-600 text-white shadow-2xs">
                                {(() => {
                                  const isDateFiltered = freqStartDate !== 'ALL' || freqEndDate !== 'ALL' || freqDateFilter !== 'ALL';
                                  const count = isDateFiltered
                                    ? displayedFreqDates.reduce((acc, d) => acc + (item.dateCounts?.[d] || 0), 0)
                                    : item.totalFrekuensi;
                                  return `${count}x`;
                                })()}
                              </span>
                            </td>

                            <td className="py-1 px-3 text-right font-mono font-semibold text-[#555F71] whitespace-nowrap">
                              {(() => {
                                const isDateFiltered = freqStartDate !== 'ALL' || freqEndDate !== 'ALL' || freqDateFilter !== 'ALL';
                                if (!isDateFiltered) return formatDurationHuman(item.totalDurasi);
                                const countInFiltered = displayedFreqDates.reduce((acc, d) => acc + (item.dateCounts?.[d] || 0), 0);
                                if (countInFiltered === 0) return '0m';
                                const exactDurInFiltered = displayedFreqDates.reduce((acc, d) => acc + (item.dateDurations?.[d] || 0), 0);
                                if (exactDurInFiltered > 0) return formatDurationHuman(exactDurInFiltered);
                                if (item.totalFrekuensi > 0 && countInFiltered !== item.totalFrekuensi) {
                                  const proRatedDur = Math.round((item.totalDurasi / item.totalFrekuensi) * countInFiltered);
                                  return formatDurationHuman(proRatedDur);
                                }
                                return formatDurationHuman(item.totalDurasi);
                              })()}
                            </td>

                            <td className="py-1 px-3 text-center whitespace-nowrap border-l border-slate-100">
                              <div className="flex items-center justify-center gap-1.5">
                                {(() => {
                                  const pCount = wsidPenangananCountMap.get(item.wsid.trim().toUpperCase()) || 0;
                                  return (
                                    <button
                                      type="button"
                                      onClick={() => handleOpenFreqDetail(item)}
                                      className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-lg text-[11px] font-bold transition-all shadow-2xs cursor-pointer ${pCount > 0
                                          ? 'bg-blue-50 hover:bg-[#cbfbf0] text-blue-600 border border-blue-200 hover:scale-[1.02]'
                                          : 'bg-[#F8F9FF] hover:bg-[#EFF4FF] text-[#555F71] border border-[#EFF4FF]'
                                        }`}
                                      title="Klik untuk melihat detail penanganan tiap tanggal kejadian"
                                    >
                                      <Wrench size={12} className={pCount > 0 ? 'text-blue-600' : 'text-slate-400'} />
                                      <span>{pCount > 0 ? `${pCount} Catatan` : 'Detail'}</span>
                                    </button>
                                  );
                                })()}

                                {/* Tombol Req Follow Up atau Tiket Aktif */}
                                {activeTicketByWsidMap.has(item.wsid.trim().toUpperCase()) ? (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setSelectedTicketForDetail(activeTicketByWsidMap.get(item.wsid.trim().toUpperCase())!);
                                      setShowTicketCenterModal(true);
                                    }}
                                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-[11px] font-bold border border-indigo-200 transition-colors cursor-pointer shadow-2xs"
                                    title="Lihat & Tindak Lanjut Tiket Follow Up Aktif"
                                  >
                                    <Ticket size={12} className="text-indigo-600" />
                                    <span>Tiket Aktif</span>
                                  </button>
                                ) : isSupervisorRole ? (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      handleOpenKaOpsFollowUp(
                                        {
                                          wsid: item.wsid,
                                          lokasi: item.lokasi,
                                          servicePointSektor: item.servicePointSektor,
                                          servicePoint: item.servicePoint,
                                          sektor: item.sektor,
                                          typeMesin: item.typeMesin || 'ATM',
                                          vendor: item.vendorMesin || 'ATM/CRM',
                                          problem: item.eventCodeDesc,
                                          durasi: item.totalDurasi,
                                          frekuensi: item.totalFrekuensi
                                        },
                                        'FREKUENSI'
                                      );
                                    }}
                                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-bold transition-colors cursor-pointer shadow-2xs"
                                    title="Req Follow Up ke Monitoring untuk problem berulang ini"
                                  >
                                    <Send size={12} />
                                    <span>Req Follow Up</span>
                                  </button>
                                ) : null}
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {/* Floating Horizontal Scrollbar */}
              {showFloatingScrollbarFreq && (
                <div
                  style={{
                    left: `${floatingBarLeftFreq}px`,
                    width: `${floatingBarWidthFreq}px`
                  }}
                  className="fixed bottom-0 z-40 bg-slate-900/80 backdrop-blur-md border-t border-slate-700/60 shadow-[0_-4px_20px_rgba(0,0,0,0.25)] px-3 py-1.5 animate-in fade-in duration-150"
                >
                  <div
                    ref={floatingScrollbarRefFreq}
                    onScroll={handleFloatingScrollFreq}
                    className="overflow-x-auto w-full py-0.5 cursor-ew-resize select-none"
                    title="Geser slide bar ini untuk menggeser kolom tanggal"
                  >
                    <div style={{ width: `${tabFreqScrollWidth}px`, height: '8px' }} className="rounded-full bg-transparent" />
                  </div>
                </div>
              )}

              {/* Pagination Controls */}
              <div className="px-6 py-3 bg-[#F8F9FF] border-t border-[#EFF4FF] flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-[#555F71]">
                <div>
                  Halaman <strong>{currentPageFreq}</strong> dari <strong>{totalPagesFreq}</strong> (Total {sortedFreqItems.length.toLocaleString('id-ID')} baris)
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={currentPageFreq <= 1}
                    onClick={() => setCurrentPageFreq((p) => Math.max(1, p - 1))}
                    className="px-3 py-1.5 bg-white border border-[#EFF4FF] rounded-lg hover:bg-slate-100 disabled:opacity-40 flex items-center gap-1 font-medium text-[#0D1C2E] cursor-pointer"
                  >
                    <ChevronLeft size={14} />
                    <span>Sebelumnya</span>
                  </button>

                  <button
                    type="button"
                    disabled={currentPageFreq >= totalPagesFreq}
                    onClick={() => setCurrentPageFreq((p) => Math.min(totalPagesFreq, p + 1))}
                    className="px-3 py-1.5 bg-white border border-[#EFF4FF] rounded-lg hover:bg-slate-100 disabled:opacity-40 flex items-center gap-1 font-medium text-[#0D1C2E] cursor-pointer"
                  >
                    <span>Berikutnya</span>
                    <ChevronRight size={14} />
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ==================================================== */}
        {/* TAB 2C: GRAFIK FREKUENSI PROBLEM & TREN PERIODE      */}
        {/* ==================================================== */}
        {activeTab === 'GRAFIK_FREKUENSI' && (
          <div className="flex flex-col w-full gap-5 animate-in fade-in duration-150">
            {/* 1. Header & Filters Card */}
            <div className="w-full bg-white rounded-2xl p-5 shadow-sm border border-[#EFF4FF] flex flex-col gap-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600 font-bold">
                      <TrendingUp size={18} />
                    </div>
                    <h2 className="text-base font-bold text-[#0D1C2E]">
                      Grafik Analisis Frekuensi Problem ATM & CRM
                    </h2>
                  </div>
                  <p className="text-xs text-[#555F71] mt-1">
                    Visualisasi tren frekuensi, komparasi Service Point, identifikasi 10 problem dominan, serta unit WSID dengan frekuensi downtime tertinggi.
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      setGfSelectedProblems([]);
                      setGfServicePoint('ALL');
                      setGfWsidSearch('');
                      setGfTablePage(1);
                    }}
                    className="px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-semibold text-[#555F71] hover:bg-slate-50 flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <RotateCcw size={13} />
                    <span>Reset Filter</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => fetchGfData(gfMode, gfSingleMonth, gfStartMonth, gfEndMonth)}
                    disabled={isLoadingGfData}
                    className="px-3.5 py-1.5 rounded-xl bg-blue-600 text-white text-xs font-semibold hover:bg-[#00524c] disabled:opacity-50 flex items-center gap-1.5 shadow-sm transition-all cursor-pointer"
                  >
                    <RefreshCw size={13} className={isLoadingGfData ? 'animate-spin' : ''} />
                    <span>{isLoadingGfData ? 'Memuat Data...' : 'Sinkron Data'}</span>
                  </button>
                </div>
              </div>

              {/* Filter Controls Row */}
              <div className="pt-3 border-t border-slate-100 flex flex-col gap-3">
                {/* Mode Periode Toggle & Month Pickers */}
                <div className="flex flex-wrap items-center gap-3">
                  {/* Mode Tabs */}
                  <div className="inline-flex p-1 bg-slate-100 rounded-xl text-xs font-semibold">
                    <button
                      type="button"
                      onClick={() => {
                        setGfMode('SINGLE');
                        fetchGfData('SINGLE', gfSingleMonth, gfStartMonth, gfEndMonth);
                      }}
                      className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${gfMode === 'SINGLE'
                          ? 'bg-white text-blue-600 shadow-xs font-bold'
                          : 'text-slate-600 hover:text-slate-900'
                        }`}
                    >
                      1 Bulan Penuh
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setGfMode('RANGE');
                        fetchGfData('RANGE', gfSingleMonth, gfStartMonth, gfEndMonth);
                      }}
                      className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${gfMode === 'RANGE'
                          ? 'bg-white text-blue-600 shadow-xs font-bold'
                          : 'text-slate-600 hover:text-slate-900'
                        }`}
                    >
                      Periode Rentang Bulan
                    </button>
                  </div>

                  {/* Single Month Picker */}
                  {gfMode === 'SINGLE' && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-slate-600">Pilih Bulan:</span>
                      <select
                        value={gfSingleMonth}
                        onChange={(e) => {
                          const val = e.target.value;
                          setGfSingleMonth(val);
                          fetchGfData('SINGLE', val, gfStartMonth, gfEndMonth);
                        }}
                        className="h-9 px-3 rounded-xl bg-[#F8F9FF] border border-slate-200 text-xs font-semibold text-[#0D1C2E] outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
                      >
                        {gfAvailableMonths.map((m) => (
                          <option key={m} value={m}>
                            {formatGfMonthLabel(m)} ({m})
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* Range Month Pickers */}
                  {gfMode === 'RANGE' && (
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-semibold text-slate-600">Dari:</span>
                      <select
                        value={gfStartMonth}
                        onChange={(e) => setGfStartMonth(e.target.value)}
                        className="h-9 px-3 rounded-xl bg-[#F8F9FF] border border-slate-200 text-xs font-semibold text-[#0D1C2E] outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
                      >
                        {gfAvailableMonths.map((m) => (
                          <option key={m} value={m}>
                            {formatGfMonthLabel(m)}
                          </option>
                        ))}
                      </select>

                      <span className="text-xs font-semibold text-slate-600">Sampai:</span>
                      <select
                        value={gfEndMonth}
                        onChange={(e) => setGfEndMonth(e.target.value)}
                        className="h-9 px-3 rounded-xl bg-[#F8F9FF] border border-slate-200 text-xs font-semibold text-[#0D1C2E] outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
                      >
                        {gfAvailableMonths.map((m) => (
                          <option key={m} value={m}>
                            {formatGfMonthLabel(m)}
                          </option>
                        ))}
                      </select>

                      <button
                        type="button"
                        onClick={() => fetchGfData('RANGE', gfSingleMonth, gfStartMonth, gfEndMonth)}
                        disabled={isLoadingGfData}
                        className="h-9 px-3.5 rounded-xl bg-blue-50 text-blue-600 font-bold text-xs hover:bg-blue-100 flex items-center gap-1.5 transition-colors cursor-pointer"
                      >
                        <RefreshCw size={12} className={isLoadingGfData ? 'animate-spin' : ''} />
                        <span>Terapkan Rentang</span>
                      </button>
                    </div>
                  )}
                </div>

                {/* Sub-Filters: Problem, Service Point, WSID Search */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {/* Filter Problem (Searchable Multi/Single dropdown) */}
                  <div className="relative" ref={gfProblemRef}>
                    <label className="text-[11px] font-semibold text-slate-500 mb-1 flex items-center justify-between">
                      <span>Filter Problem / Event Code:</span>
                      {gfSelectedProblems.length > 0 && (
                        <button
                          type="button"
                          onClick={() => setGfSelectedProblems([])}
                          className="text-[10px] text-rose-500 hover:underline cursor-pointer"
                        >
                          Reset ({gfSelectedProblems.length})
                        </button>
                      )}
                    </label>
                    <button
                      type="button"
                      onClick={() => setIsGfProblemOpen((prev) => !prev)}
                      className="w-full h-9 px-3 rounded-xl bg-[#F8F9FF] border border-slate-200 text-xs font-semibold text-[#0D1C2E] flex items-center justify-between gap-1.5 cursor-pointer hover:border-blue-600"
                    >
                      <span className="truncate">
                        {gfSelectedProblems.length === 0
                          ? `Semua Problem (${gfAvailableProblems.length})`
                          : `${gfSelectedProblems.length} Problem Dipilih`}
                      </span>
                      <ChevronDown size={14} className={`text-slate-400 transition-transform ${isGfProblemOpen ? 'rotate-180' : ''}`} />
                    </button>

                    {/* Popover Problem Dropdown */}
                    {isGfProblemOpen && (
                      <div className="absolute left-0 top-full mt-1.5 w-full min-w-[280px] bg-white rounded-xl shadow-xl border border-slate-200 z-50 p-2 animate-in fade-in zoom-in-95 duration-100">
                        <div className="relative mb-2">
                          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                          <input
                            type="text"
                            placeholder="Cari jenis problem..."
                            value={gfProblemSearch}
                            onChange={(e) => setGfProblemSearch(e.target.value)}
                            className="w-full h-8 pl-8 pr-2 rounded-lg bg-slate-50 text-xs text-slate-800 border border-slate-200 outline-none focus:bg-white focus:ring-1 focus:ring-blue-500"
                          />
                        </div>

                        <div className="max-h-56 overflow-y-auto space-y-0.5 pr-1">
                          <button
                            type="button"
                            onClick={() => {
                              setGfSelectedProblems([]);
                              setIsGfProblemOpen(false);
                            }}
                            className={`w-full px-2.5 py-1.5 rounded-lg text-left text-xs font-semibold flex items-center justify-between cursor-pointer ${gfSelectedProblems.length === 0
                                ? 'bg-blue-50 text-blue-600'
                                : 'hover:bg-slate-50 text-slate-700'
                              }`}
                          >
                            <span>Semua Problem</span>
                            {gfSelectedProblems.length === 0 && <Check size={14} className="text-blue-600" />}
                          </button>

                          {gfAvailableProblems
                            .filter((p) => p.toLowerCase().includes(gfProblemSearch.toLowerCase()))
                            .map((p) => {
                              const isChecked = gfSelectedProblems.includes(p);
                              return (
                                <button
                                  key={p}
                                  type="button"
                                  onClick={() => {
                                    setGfSelectedProblems((prev) =>
                                      prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]
                                    );
                                  }}
                                  className={`w-full px-2.5 py-1.5 rounded-lg text-left text-xs flex items-center justify-between cursor-pointer ${isChecked
                                      ? 'bg-blue-50/75 text-blue-600 font-bold'
                                      : 'hover:bg-slate-50 text-slate-700'
                                    }`}
                                >
                                  <span className="truncate pr-2">{p}</span>
                                  {isChecked && <Check size={14} className="text-blue-600 shrink-0" />}
                                </button>
                              );
                            })}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Filter Service Point */}
                  <div>
                    <label className="text-[11px] font-semibold text-slate-500 mb-1 flex items-center justify-between">
                      <span>Filter Service Point:</span>
                      {gfServicePoint !== 'ALL' && (
                        <button
                          type="button"
                          onClick={() => setGfServicePoint('ALL')}
                          className="text-[10px] text-rose-500 hover:underline cursor-pointer"
                        >
                          Reset
                        </button>
                      )}
                    </label>
                    <select
                      value={gfServicePoint}
                      onChange={(e) => setGfServicePoint(e.target.value)}
                      className="w-full h-9 px-3 rounded-xl bg-[#F8F9FF] border border-slate-200 text-xs font-semibold text-[#0D1C2E] outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
                    >
                      <option value="ALL">Semua Service Point ({gfAvailableSPs.length})</option>
                      {gfAvailableSPs.map((sp) => (
                        <option key={sp} value={sp}>
                          {sp}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Filter WSID Search */}
                  <div>
                    <label className="text-[11px] font-semibold text-slate-500 mb-1 flex items-center justify-between">
                      <span>Cari WSID / Nama Lokasi:</span>
                      {gfWsidSearch && (
                        <button
                          type="button"
                          onClick={() => setGfWsidSearch('')}
                          className="text-[10px] text-rose-500 hover:underline cursor-pointer"
                        >
                          Clear
                        </button>
                      )}
                    </label>
                    <div className="relative">
                      <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input
                        type="text"
                        placeholder="Ketik kode WSID atau lokasi..."
                        value={gfWsidSearch}
                        onChange={(e) => {
                          setGfWsidSearch(e.target.value);
                          setGfTablePage(1);
                        }}
                        className="w-full h-9 pl-9 pr-8 rounded-xl bg-[#F8F9FF] border border-slate-200 text-xs text-[#0D1C2E] outline-none focus:bg-white focus:ring-1 focus:ring-blue-500"
                      />
                      {gfWsidSearch && (
                        <button
                          type="button"
                          onClick={() => setGfWsidSearch('')}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                        >
                          <X size={14} />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* 2. KPI Summary Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5">
              <div className="bg-white rounded-2xl p-4 border border-[#EFF4FF] shadow-xs flex flex-col justify-between">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Total Frekuensi</span>
                  <div className="w-7 h-7 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600">
                    <Activity size={15} />
                  </div>
                </div>
                <div>
                  <div className="text-2xl font-black text-[#0D1C2E]">
                    {gfKpiMetrics.total.toLocaleString()}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    Kasus kejadian problem
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-2xl p-4 border border-[#EFF4FF] shadow-xs flex flex-col justify-between">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">WSID Terdampak</span>
                  <div className="w-7 h-7 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-600">
                    <Server size={15} />
                  </div>
                </div>
                <div>
                  <div className="text-2xl font-black text-[#0D1C2E]">
                    {gfKpiMetrics.uniqueWsids.toLocaleString()}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    Unit ATM / CRM terimbas
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-2xl p-4 border border-[#EFF4FF] shadow-xs flex flex-col justify-between">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Rata-rata / Hari</span>
                  <div className="w-7 h-7 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600">
                    <Timer size={15} />
                  </div>
                </div>
                <div>
                  <div className="text-2xl font-black text-[#0D1C2E]">
                    {gfKpiMetrics.avgPerDay}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    Dalam {gfKpiMetrics.dayCount} hari operasional
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-2xl p-4 border border-[#EFF4FF] shadow-xs flex flex-col justify-between">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Problem Dominan</span>
                  <div className="w-7 h-7 rounded-lg bg-amber-50 flex items-center justify-center text-amber-600">
                    <AlertTriangle size={15} />
                  </div>
                </div>
                <div>
                  <div className="text-base font-black text-[#0D1C2E] truncate" title={gfKpiMetrics.topProblem.name}>
                    {gfKpiMetrics.topProblem.name}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    {gfKpiMetrics.topProblem.count} kasus ({gfKpiMetrics.topProblem.pct}%)
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-2xl p-4 border border-[#EFF4FF] shadow-xs flex flex-col justify-between col-span-2 sm:col-span-1">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Top Service Point</span>
                  <div className="w-7 h-7 rounded-lg bg-emerald-50 flex items-center justify-center text-emerald-600">
                    <MapPin size={15} />
                  </div>
                </div>
                <div>
                  <div className="text-2xl font-black text-[#0D1C2E]">
                    {gfKpiMetrics.topSp.name}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    {gfKpiMetrics.topSp.count} kejadian ({gfKpiMetrics.topSp.pct}%)
                  </div>
                </div>
              </div>
            </div>

            {/* 3. Main Chart: Tren Frekuensi Problem */}
            <div className="w-full bg-white rounded-2xl p-5 shadow-sm border border-[#EFF4FF] flex flex-col gap-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-bold text-[#0D1C2E] flex items-center gap-2">
                    <span>Tren Pergerakan Frekuensi Problem</span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#EFF4FF] text-blue-600">
                      {gfMode === 'SINGLE' ? formatGfMonthLabel(gfSingleMonth) : `${formatGfMonthLabel(gfStartMonth)} - ${formatGfMonthLabel(gfEndMonth)}`}
                    </span>
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Menampilkan total kejadian downtime problem per {gfMode === 'RANGE' && gfTrendGrouping === 'monthly' ? 'bulan' : 'tanggal'} pada periode yang dipilih.
                  </p>
                </div>

                {/* Toolbar Chart Controls */}
                <div className="flex flex-wrap items-center gap-2">
                  {/* Grouping Toggle (only in RANGE mode) */}
                  {gfMode === 'RANGE' && (
                    <div className="inline-flex p-0.5 bg-slate-100 rounded-lg text-[11px] font-semibold">
                      <button
                        type="button"
                        onClick={() => setGfTrendGrouping('daily')}
                        className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${gfTrendGrouping === 'daily' ? 'bg-white text-blue-600 font-bold shadow-2xs' : 'text-slate-600'
                          }`}
                      >
                        Harian
                      </button>
                      <button
                        type="button"
                        onClick={() => setGfTrendGrouping('monthly')}
                        className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${gfTrendGrouping === 'monthly' ? 'bg-white text-blue-600 font-bold shadow-2xs' : 'text-slate-600'
                          }`}
                      >
                        Bulanan
                      </button>
                    </div>
                  )}

                  {/* Kumulatif Toggle */}
                  <button
                    type="button"
                    onClick={() => setGfCumulative((prev) => !prev)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-all cursor-pointer ${gfCumulative
                        ? 'bg-blue-50 border-blue-600 text-blue-600 font-bold'
                        : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}
                  >
                    {gfCumulative ? 'Akumulasi (ON)' : 'Kumulatif'}
                  </button>

                  {/* Chart Type Toggle */}
                  <div className="inline-flex p-0.5 bg-slate-100 rounded-lg text-[11px] font-semibold">
                    <button
                      type="button"
                      onClick={() => setGfChartType('area')}
                      className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${gfChartType === 'area' ? 'bg-white text-blue-600 font-bold shadow-2xs' : 'text-slate-600'
                        }`}
                    >
                      Area
                    </button>
                    <button
                      type="button"
                      onClick={() => setGfChartType('bar')}
                      className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${gfChartType === 'bar' ? 'bg-white text-blue-600 font-bold shadow-2xs' : 'text-slate-600'
                        }`}
                    >
                      Bar
                    </button>
                    <button
                      type="button"
                      onClick={() => setGfChartType('line')}
                      className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${gfChartType === 'line' ? 'bg-white text-blue-600 font-bold shadow-2xs' : 'text-slate-600'
                        }`}
                    >
                      Line
                    </button>
                  </div>
                </div>
              </div>

              {/* Chart Render */}
              <div className="w-full h-80 pt-2">
                {gfTrendData.length === 0 ? (
                  <div className="w-full h-full flex flex-col items-center justify-center text-slate-400 gap-2 border border-dashed border-slate-200 rounded-xl">
                    <Activity size={32} className="opacity-40" />
                    <p className="text-xs">Tidak ada data untuk filter periode terpilih</p>
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    {gfChartType === 'area' ? (
                      <AreaChart data={gfTrendData} margin={{ top: 10, right: 20, left: -10, bottom: 0 }}>
                        <defs>
                          <linearGradient id="gfTrendGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#2563eb" stopOpacity={0.35} />
                            <stop offset="95%" stopColor="#60a5fa" stopOpacity={0.0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#EFF4FF" vertical={false} />
                        <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#555F71' }} axisLine={{ stroke: '#E2E8F0' }} tickLine={false} />
                        <YAxis tick={{ fontSize: 11, fill: '#555F71' }} axisLine={false} tickLine={false} />
                        <RechartsTooltip
                          content={({ active, payload, label }) => {
                            if (active && payload && payload.length) {
                              const d = payload[0].payload;
                              return (
                                <div className="bg-white/95 backdrop-blur-sm p-3 rounded-xl shadow-lg border border-slate-100 text-xs">
                                  <div className="font-bold text-slate-700">{label} ({d.key})</div>
                                  <div className="text-blue-600 font-bold mt-1">
                                    {gfCumulative ? `Kumulatif: ${d.total} kasus` : `Frekuensi: ${d.total} kejadian`}
                                  </div>
                                  {gfCumulative && (
                                    <div className="text-[11px] text-slate-400">Kasus hari ini: {d.rawTotal}</div>
                                  )}
                                </div>
                              );
                            }
                            return null;
                          }}
                        />
                        <Area type="monotone" dataKey="total" name="Frekuensi" stroke="#2563eb" strokeWidth={2.5} fillOpacity={1} fill="url(#gfTrendGrad)" />
                      </AreaChart>
                    ) : gfChartType === 'bar' ? (
                      <BarChart data={gfTrendData} margin={{ top: 10, right: 20, left: -10, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#EFF4FF" vertical={false} />
                        <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#555F71' }} axisLine={{ stroke: '#E2E8F0' }} tickLine={false} />
                        <YAxis tick={{ fontSize: 11, fill: '#555F71' }} axisLine={false} tickLine={false} />
                        <RechartsTooltip
                          content={({ active, payload, label }) => {
                            if (active && payload && payload.length) {
                              const d = payload[0].payload;
                              return (
                                <div className="bg-white/95 backdrop-blur-sm p-3 rounded-xl shadow-lg border border-slate-100 text-xs">
                                  <div className="font-bold text-slate-700">{label} ({d.key})</div>
                                  <div className="text-blue-600 font-bold mt-1">
                                    Frekuensi: {d.total} kejadian
                                  </div>
                                </div>
                              );
                            }
                            return null;
                          }}
                        />
                        <Bar dataKey="total" fill="#2563eb" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    ) : (
                      <LineChart data={gfTrendData} margin={{ top: 10, right: 20, left: -10, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#EFF4FF" vertical={false} />
                        <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#555F71' }} axisLine={{ stroke: '#E2E8F0' }} tickLine={false} />
                        <YAxis tick={{ fontSize: 11, fill: '#555F71' }} axisLine={false} tickLine={false} />
                        <RechartsTooltip
                          content={({ active, payload, label }) => {
                            if (active && payload && payload.length) {
                              const d = payload[0].payload;
                              return (
                                <div className="bg-white/95 backdrop-blur-sm p-3 rounded-xl shadow-lg border border-slate-100 text-xs">
                                  <div className="font-bold text-slate-700">{label} ({d.key})</div>
                                  <div className="text-blue-600 font-bold mt-1">
                                    Frekuensi: {d.total} kejadian
                                  </div>
                                </div>
                              );
                            }
                            return null;
                          }}
                        />
                        <Line type="monotone" dataKey="total" stroke="#2563eb" strokeWidth={2.5} dot={{ r: 3, fill: '#2563eb' }} activeDot={{ r: 5 }} />
                      </LineChart>
                    )}
                  </ResponsiveContainer>
                )}
              </div>
            </div>

            {/* 4. Row: 2 Kolom Chart (Top 10 Problem & Distribusi Service Point) */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              {/* Kiri: Top 10 Problem (Horizontal Bar Chart) */}
              <div className="bg-white rounded-2xl p-5 shadow-sm border border-[#EFF4FF] flex flex-col gap-3">
                <div>
                  <h3 className="text-sm font-bold text-[#0D1C2E] flex items-center justify-between">
                    <span>Top 10 Problem Terbanyak</span>
                    <span className="text-[11px] font-semibold text-slate-400">Total Kejadian</span>
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    10 kategori masalah yang paling sering memicu mesin offline.
                  </p>
                </div>

                <div className="w-full h-72">
                  {gfTopProblemsData.length === 0 ? (
                    <div className="w-full h-full flex items-center justify-center text-slate-400 text-xs">
                      Tidak ada data problem
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart layout="vertical" data={gfTopProblemsData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#EFF4FF" />
                        <XAxis type="number" tick={{ fontSize: 10, fill: '#555F71' }} axisLine={{ stroke: '#E2E8F0' }} tickLine={false} />
                        <YAxis type="category" dataKey="problem" tick={{ fontSize: 10, fill: '#0D1C2E' }} width={120} axisLine={false} tickLine={false} />
                        <RechartsTooltip
                          content={({ active, payload }) => {
                            if (active && payload && payload.length) {
                              const d = payload[0].payload;
                              return (
                                <div className="bg-white p-2.5 rounded-xl shadow-lg border border-slate-100 text-xs">
                                  <div className="font-bold text-slate-800">{d.fullProblem}</div>
                                  <div className="text-blue-600 font-bold mt-1">
                                    {d.count} kejadian ({d.pct}% dari total)
                                  </div>
                                </div>
                              );
                            }
                            return null;
                          }}
                        />
                        <Bar dataKey="count" fill="#3b82f6" radius={[0, 6, 6, 0]}>
                          {gfTopProblemsData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={index === 0 ? '#2563eb' : '#3b82f6'} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </div>

              {/* Kanan: Distribusi Frekuensi per Service Point */}
              <div className="bg-white rounded-2xl p-5 shadow-sm border border-[#EFF4FF] flex flex-col gap-3">
                <div>
                  <h3 className="text-sm font-bold text-[#0D1C2E] flex items-center justify-between">
                    <span>Komparasi Frekuensi per Service Point</span>
                    <span className="text-[11px] font-semibold text-slate-400">Distribusi Kasus</span>
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Perbandingan akumulasi kasus problem di tiap Service Point.
                  </p>
                </div>

                <div className="w-full h-72">
                  {gfSpDistributionData.length === 0 ? (
                    <div className="w-full h-full flex items-center justify-center text-slate-400 text-xs">
                      Tidak ada data service point
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={gfSpDistributionData} margin={{ top: 10, right: 15, left: -10, bottom: 20 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#EFF4FF" />
                        <XAxis dataKey="sp" tick={{ fontSize: 10, fill: '#0D1C2E', fontWeight: 600 }} angle={-25} textAnchor="end" height={40} axisLine={{ stroke: '#E2E8F0' }} tickLine={false} />
                        <YAxis tick={{ fontSize: 10, fill: '#555F71' }} axisLine={false} tickLine={false} />
                        <RechartsTooltip
                          content={({ active, payload }) => {
                            if (active && payload && payload.length) {
                              const d = payload[0].payload;
                              return (
                                <div className="bg-white p-2.5 rounded-xl shadow-lg border border-slate-100 text-xs">
                                  <div className="font-bold text-slate-800">SP: {d.sp}</div>
                                  <div className="text-indigo-600 font-bold mt-1">
                                    Total Problem: {d.count} kejadian
                                  </div>
                                </div>
                              );
                            }
                            return null;
                          }}
                        />
                        <Bar dataKey="count" fill="#6366F1" radius={[6, 6, 0, 0]}>
                          {gfSpDistributionData.map((entry, index) => {
                            const colors = ['#2563eb', '#10b981', '#6366F1', '#F59E0B', '#EF4444', '#8B5CF6', '#3B82F6', '#14B8A6'];
                            return <Cell key={`sp-${index}`} fill={colors[index % colors.length]} />;
                          })}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </div>
            </div>

            {/* 5. Chart 3: Top 10 WSID dengan Problem Tertinggi */}
            <div className="w-full bg-white rounded-2xl p-5 shadow-sm border border-[#EFF4FF] flex flex-col gap-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-bold text-[#0D1C2E] flex items-center gap-2">
                    <span>Top 10 Mesin ATM / CRM Sering Bermasalah (WSID)</span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-600">
                      Mesin Kritis
                    </span>
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Klik nama WSID pada bar atau klik tabel di bawah untuk melihat rincian permasalahan mesin tersebut.
                  </p>
                </div>
              </div>

              <div className="w-full h-64">
                {gfTopWsidsData.length === 0 ? (
                  <div className="w-full h-full flex items-center justify-center text-slate-400 text-xs">
                    Tidak ada data WSID
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={gfTopWsidsData} margin={{ top: 10, right: 15, left: -10, bottom: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#EFF4FF" />
                      <XAxis dataKey="wsid" tick={{ fontSize: 11, fill: '#0D1C2E', fontWeight: 600 }} axisLine={{ stroke: '#E2E8F0' }} tickLine={false} />
                      <YAxis tick={{ fontSize: 10, fill: '#555F71' }} axisLine={false} tickLine={false} />
                      <RechartsTooltip
                        content={({ active, payload }) => {
                          if (active && payload && payload.length) {
                            const d = payload[0].payload;
                            return (
                              <div className="bg-white p-3 rounded-xl shadow-lg border border-slate-100 text-xs space-y-1">
                                <div className="font-bold text-[#0D1C2E] text-sm">{d.wsid}</div>
                                <div className="text-slate-600 text-[11px]">{d.lokasi}</div>
                                <div className="text-slate-400 text-[10px]">SP: {d.sp}</div>
                                <div className="pt-1 text-rose-600 font-bold">Total: {d.count} kali problem</div>
                                <div className="text-[11px] text-slate-500">Problem Dominan: {d.topProblem}</div>
                              </div>
                            );
                          }
                          return null;
                        }}
                      />
                      <Bar
                        dataKey="count"
                        fill="#EF4444"
                        radius={[6, 6, 0, 0]}
                        onClick={(data) => {
                          if (data && data.wsid) {
                            setGfWsidSearch(data.wsid);
                          }
                        }}
                        className="cursor-pointer"
                      />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>

            {/* 6. Tabel Rangkuman Frekuensi per WSID & Problem */}
            <div className="w-full bg-white rounded-2xl shadow-sm border border-[#EFF4FF] overflow-hidden flex flex-col">
              <div className="p-4 sm:p-5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[#F8F9FF]/50">
                <div>
                  <h3 className="text-sm font-bold text-[#0D1C2E] flex items-center gap-2">
                    <Table size={16} className="text-blue-600" />
                    <span>Rangkuman Frekuensi WSID & Problem</span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-600">
                      {gfAggregatedItems.length} Kombinasi
                    </span>
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Data terkelompok berdasarkan unit WSID dan jenis problem pada periode terpilih.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleExportGfExcel}
                    className="px-3 py-1.5 rounded-xl bg-emerald-600 text-white font-semibold text-xs hover:bg-emerald-700 flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
                  >
                    <Download size={13} />
                    <span>Ekspor Excel (.xlsx)</span>
                  </button>
                </div>
              </div>

              {/* Table Body */}
              <StickyTableWrapper>
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-[#F8F9FF] text-[#555F71] border-b border-slate-100 text-[11px] font-bold uppercase tracking-wider">
                      <th className="py-3 px-3.5 w-12 text-center">No</th>
                      <th className="py-3 px-3.5">WSID & Lokasi</th>
                      <th className="py-3 px-3.5">Service Point - Sektor</th>
                      <th className="py-3 px-3.5">Tipe Mesin</th>
                      <th className="py-3 px-3.5">Problem / Event Code</th>
                      <th className="py-3 px-3.5 text-center">Frekuensi</th>
                      <th className="py-3 px-3.5 text-right">Total Durasi</th>
                      <th className="py-3 px-3.5 text-right">Rata-rata Durasi</th>
                      <th className="py-3 px-3.5">Tindakan Terakhir</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {paginatedGfItems.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="py-8 text-center text-slate-400">
                          Tidak ada data yang sesuai dengan filter pencarian.
                        </td>
                      </tr>
                    ) : (
                      paginatedGfItems.map((item, idx) => {
                        const rowNum = (gfTablePage - 1) * gfTablePageSize + idx + 1;
                        const avgDur = Math.round((item.totalDurasi / Math.max(item.totalFrekuensi, 1)) * 10) / 10;
                        return (
                          <tr key={`${item.wsid}_${item.eventCodeDesc}_${idx}`} className="hover:bg-slate-50/80 transition-colors">
                            <td className="py-3 px-3.5 text-center text-slate-400 font-mono text-[11px]">
                              {rowNum}
                            </td>
                            <td className="py-3 px-3.5">
                              <div className="font-bold text-[#0D1C2E] flex items-center gap-1.5">
                                <span>{item.wsid}</span>
                              </div>
                              <div className="text-[11px] text-slate-500 truncate max-w-xs" title={item.lokasi}>
                                {item.lokasi}
                              </div>
                            </td>
                            <td className="py-3 px-3.5">
                              <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 text-[11px] font-semibold">
                                {item.servicePointSektor}
                              </span>
                            </td>
                            <td className="py-3 px-3.5 text-slate-600 font-medium">
                              {item.typeMesin}
                            </td>
                            <td className="py-3 px-3.5">
                              <span className="px-2 py-1 rounded-lg bg-blue-50/50 text-blue-600 font-bold text-[11px]">
                                {item.eventCodeDesc}
                              </span>
                            </td>
                            <td className="py-3 px-3.5 text-center">
                              <span className={`px-2.5 py-1 rounded-full text-xs font-black ${item.totalFrekuensi >= 5
                                  ? 'bg-rose-100 text-rose-700'
                                  : item.totalFrekuensi >= 3
                                    ? 'bg-amber-100 text-amber-800'
                                    : 'bg-[#EFF4FF] text-blue-600'
                                }`}>
                                {item.totalFrekuensi}x
                              </span>
                            </td>
                            <td className="py-3 px-3.5 text-right font-mono font-medium text-slate-700">
                              {item.totalDurasi}m
                            </td>
                            <td className="py-3 px-3.5 text-right font-mono text-slate-500">
                              {avgDur}m
                            </td>
                            <td className="py-3 px-3.5">
                              <div className="text-[11px] text-slate-600 truncate max-w-xs" title={item.actionTerakhir || '-'}>
                                {item.actionTerakhir || '-'}
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </StickyTableWrapper>

              {/* Table Footer & Pagination */}
              <div className="p-3.5 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white text-xs text-slate-500">
                <div>
                  Menampilkan {paginatedGfItems.length} dari {gfAggregatedItems.length} total item (Halaman {gfTablePage} dari {totalPagesGf})
                </div>

                <div className="flex items-center gap-1.5 self-end sm:self-auto">
                  <button
                    type="button"
                    disabled={gfTablePage <= 1}
                    onClick={() => setGfTablePage((p) => Math.max(1, p - 1))}
                    className="px-2.5 py-1 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 cursor-pointer flex items-center gap-1"
                  >
                    <ChevronLeft size={14} />
                    <span>Sebelumnya</span>
                  </button>

                  <div className="px-2 font-semibold text-slate-700">
                    {gfTablePage} / {totalPagesGf}
                  </div>

                  <button
                    type="button"
                    disabled={gfTablePage >= totalPagesGf}
                    onClick={() => setGfTablePage((p) => Math.min(totalPagesGf, p + 1))}
                    className="px-2.5 py-1 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 cursor-pointer flex items-center gap-1"
                  >
                    <span>Berikutnya</span>
                    <ChevronRight size={14} />
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ==================================================== */}
        {/* TAB 2B: GRAFIK FREKUENSI PROBLEM 24 JAM (00:00-23:00)*/}
        {/* ==================================================== */}
        {activeTab === 'GRAFIK_24JAM' && (
          <div className="flex flex-col w-full gap-5 animate-in fade-in duration-150">
            {/* 1. Header & Filters Card */}
            <div className="w-full bg-white rounded-2xl p-5 shadow-sm border border-[#EFF4FF] flex flex-col gap-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600 font-bold">
                      <BarChart3 size={18} />
                    </div>
                    <h2 className="text-base font-bold text-[#0D1C2E]">
                      Grafik Frekuensi Problem 24 Jam (00:00 - 23:00)
                    </h2>
                  </div>
                  <p className="text-xs text-[#555F71] mt-1">
                    Analisis konsentrasi problem per jam operasional, identifikasi jam sibuk (Peak Hour), dan telusuri penanganan tiap unit pada jam tertentu.
                  </p>
                </div>

                <div className="flex items-center gap-2 self-start sm:self-auto">
                  <button
                    type="button"
                    onClick={() => {
                      setGrafik24Sp('ALL');
                      setGrafik24Sektor('ALL');
                      setGrafik24SektorSearch('');
                      setIsGrafik24SektorOpen(false);
                      setGrafik24Problem('ALL');
                      setGrafik24ProblemSearch('');
                      setIsGrafik24ProblemOpen(false);
                      setGrafik24Date('ALL');
                      setGrafik24Search('');
                      setSelectedHour24(null);
                    }}
                    className="h-9 px-3 rounded-xl bg-[#F8F9FF] hover:bg-[#EFF4FF] text-[#555F71] hover:text-[#0D1C2E] border border-slate-200 text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer"
                  >
                    <RotateCcw size={13} />
                    <span>Reset Filter</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => fetchDailyIncidentsFromDb()}
                    disabled={isLoadingDailyFromDb}
                    className="h-9 px-3.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition-all shadow-2xs flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
                  >
                    <RefreshCw size={13} className={isLoadingDailyFromDb ? 'animate-spin' : ''} />
                    <span>Sinkron DB</span>
                  </button>
                </div>
              </div>

              {/* Filter Controls Row */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-2 border-t border-[#EFF4FF]">
                {/* 1. Filter Service Point */}
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-[#555F71] flex items-center gap-1">
                    <MapPin size={11} className="text-blue-600" />
                    <span>Service Point:</span>
                  </label>
                  <select
                    value={grafik24Sp}
                    onChange={(e) => {
                      setGrafik24Sp(e.target.value);
                      setGrafik24Sektor('ALL');
                      setGrafik24CurrentPage(1);
                    }}
                    className="w-full h-9 px-3 rounded-xl bg-[#F8F9FF] border border-slate-200 text-xs font-semibold text-[#0D1C2E] outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
                  >
                    <option value="ALL">Semua Service Point ({grafik24AvailableSPs.length})</option>
                    {grafik24AvailableSPs.map((sp) => (
                      <option key={sp} value={sp}>
                        {sp}
                      </option>
                    ))}
                  </select>
                </div>

                {/* 2. Filter Sektor (Searchable Dropdown) */}
                <div className="space-y-1 relative" ref={grafik24SektorRef}>
                  <label className="text-[11px] font-semibold text-[#555F71] flex items-center justify-between">
                    <span className="flex items-center gap-1">
                      <Layers size={11} className="text-blue-600" />
                      <span>Sektor:</span>
                    </span>
                    {grafik24Sektor !== 'ALL' && (
                      <button
                        type="button"
                        onClick={() => {
                          setGrafik24Sektor('ALL');
                          setGrafik24CurrentPage(1);
                        }}
                        className="text-[10px] text-rose-500 hover:underline cursor-pointer"
                      >
                        Reset
                      </button>
                    )}
                  </label>
                  <button
                    type="button"
                    onClick={() => setIsGrafik24SektorOpen((prev) => !prev)}
                    className="w-full h-9 px-3 rounded-xl bg-[#F8F9FF] border border-slate-200 text-xs font-semibold text-[#0D1C2E] flex items-center justify-between gap-1.5 cursor-pointer hover:border-blue-600"
                  >
                    <span className="truncate">
                      {grafik24Sektor === 'ALL'
                        ? (grafik24Sp !== 'ALL' ? `Semua Sektor di ${grafik24Sp}` : `Semua Sektor (${grafik24AvailableSektors.length})`)
                        : grafik24Sektor}
                    </span>
                    <ChevronDown size={14} className={`text-slate-400 transition-transform ${isGrafik24SektorOpen ? 'rotate-180' : ''}`} />
                  </button>

                  {/* Popover Dropdown Sektor dengan Fitur Search */}
                  {isGrafik24SektorOpen && (
                    <div className="absolute left-0 top-full mt-1.5 w-full min-w-[240px] bg-white rounded-xl shadow-xl border border-slate-200 z-50 p-2 animate-in fade-in zoom-in-95 duration-100">
                      <div className="relative mb-2">
                        <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                          type="text"
                          value={grafik24SektorSearch}
                          onChange={(e) => setGrafik24SektorSearch(e.target.value)}
                          placeholder="Cari nama sektor..."
                          className="w-full h-8 pl-8 pr-7 bg-[#F8F9FF] border border-slate-200 rounded-lg text-xs outline-none focus:ring-1 focus:ring-blue-500"
                          autoFocus
                        />
                        {grafik24SektorSearch && (
                          <button
                            type="button"
                            onClick={() => setGrafik24SektorSearch('')}
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                          >
                            <X size={12} />
                          </button>
                        )}
                      </div>

                      <div className="max-h-52 overflow-y-auto space-y-0.5 text-xs">
                        <button
                          type="button"
                          onClick={() => {
                            setGrafik24Sektor('ALL');
                            setIsGrafik24SektorOpen(false);
                            setGrafik24CurrentPage(1);
                          }}
                          className={`w-full px-2.5 py-1.5 rounded-lg text-left flex items-center justify-between transition-colors cursor-pointer ${grafik24Sektor === 'ALL'
                              ? 'bg-blue-50 text-blue-600 font-bold'
                              : 'text-slate-700 hover:bg-[#F8F9FF]'
                            }`}
                        >
                          <span>Semua Sektor</span>
                          {grafik24Sektor === 'ALL' && <Check size={13} />}
                        </button>

                        {grafik24AvailableSektors
                          .filter((sk) => sk.toLowerCase().includes(grafik24SektorSearch.toLowerCase()))
                          .map((sk) => {
                            const isSelected = grafik24Sektor === sk;
                            return (
                              <button
                                key={sk}
                                type="button"
                                onClick={() => {
                                  setGrafik24Sektor(sk);
                                  setIsGrafik24SektorOpen(false);
                                  setGrafik24CurrentPage(1);
                                }}
                                className={`w-full px-2.5 py-1.5 rounded-lg text-left flex items-center justify-between transition-colors cursor-pointer ${isSelected
                                    ? 'bg-blue-50 text-blue-600 font-bold'
                                    : 'text-slate-700 hover:bg-[#F8F9FF]'
                                  }`}
                              >
                                <span className="truncate">{sk}</span>
                                {isSelected && <Check size={13} />}
                              </button>
                            );
                          })}

                        {grafik24AvailableSektors.filter((sk) =>
                          sk.toLowerCase().includes(grafik24SektorSearch.toLowerCase())
                        ).length === 0 && (
                            <div className="py-4 text-center text-slate-400 text-xs">
                              Tidak ada sektor ditemukan
                            </div>
                          )}
                      </div>
                    </div>
                  )}
                </div>

                {/* 3. Filter Problem (Searchable Dropdown) */}
                <div className="space-y-1 relative" ref={grafik24ProblemRef}>
                  <label className="text-[11px] font-semibold text-[#555F71] flex items-center justify-between">
                    <span className="flex items-center gap-1">
                      <AlertTriangle size={11} className="text-blue-600" />
                      <span>Jenis Problem:</span>
                    </span>
                    {grafik24Problem !== 'ALL' && (
                      <button
                        type="button"
                        onClick={() => {
                          setGrafik24Problem('ALL');
                          setGrafik24CurrentPage(1);
                        }}
                        className="text-[10px] text-rose-500 hover:underline cursor-pointer"
                      >
                        Reset
                      </button>
                    )}
                  </label>
                  <button
                    type="button"
                    onClick={() => setIsGrafik24ProblemOpen((prev) => !prev)}
                    className="w-full h-9 px-3 rounded-xl bg-[#F8F9FF] border border-slate-200 text-xs font-semibold text-[#0D1C2E] flex items-center justify-between gap-1.5 cursor-pointer hover:border-blue-600"
                  >
                    <span className="truncate">
                      {grafik24Problem === 'ALL'
                        ? `Semua Problem (${grafik24AvailableProblems.length})`
                        : grafik24Problem}
                    </span>
                    <ChevronDown size={14} className={`text-slate-400 transition-transform ${isGrafik24ProblemOpen ? 'rotate-180' : ''}`} />
                  </button>

                  {/* Popover Dropdown Problem dengan Fitur Search */}
                  {isGrafik24ProblemOpen && (
                    <div className="absolute left-0 top-full mt-1.5 w-full min-w-[280px] sm:min-w-[320px] bg-white rounded-xl shadow-xl border border-slate-200 z-50 p-2 animate-in fade-in zoom-in-95 duration-100">
                      <div className="relative mb-2">
                        <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                          type="text"
                          value={grafik24ProblemSearch}
                          onChange={(e) => setGrafik24ProblemSearch(e.target.value)}
                          placeholder="Cari jenis problem (COM, Cash, Card...)"
                          className="w-full h-8 pl-8 pr-7 bg-[#F8F9FF] border border-slate-200 rounded-lg text-xs outline-none focus:ring-1 focus:ring-blue-500"
                          autoFocus
                        />
                        {grafik24ProblemSearch && (
                          <button
                            type="button"
                            onClick={() => setGrafik24ProblemSearch('')}
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                          >
                            <X size={12} />
                          </button>
                        )}
                      </div>

                      <div className="max-h-56 overflow-y-auto space-y-0.5 text-xs">
                        <button
                          type="button"
                          onClick={() => {
                            setGrafik24Problem('ALL');
                            setIsGrafik24ProblemOpen(false);
                            setGrafik24CurrentPage(1);
                          }}
                          className={`w-full px-2.5 py-1.5 rounded-lg text-left flex items-center justify-between transition-colors cursor-pointer ${grafik24Problem === 'ALL'
                              ? 'bg-blue-50 text-blue-600 font-bold'
                              : 'text-slate-700 hover:bg-[#F8F9FF]'
                            }`}
                        >
                          <span>Semua Jenis Problem ({grafik24AvailableProblems.length})</span>
                          {grafik24Problem === 'ALL' && <Check size={13} />}
                        </button>

                        {grafik24AvailableProblems
                          .filter((p) => p.toLowerCase().includes(grafik24ProblemSearch.toLowerCase()))
                          .map((prob) => {
                            const isSelected = grafik24Problem.toLowerCase() === prob.toLowerCase();
                            return (
                              <button
                                key={prob}
                                type="button"
                                onClick={() => {
                                  setGrafik24Problem(prob);
                                  setIsGrafik24ProblemOpen(false);
                                  setGrafik24CurrentPage(1);
                                }}
                                className={`w-full px-2.5 py-1.5 rounded-lg text-left flex items-center justify-between transition-colors cursor-pointer ${isSelected
                                    ? 'bg-blue-50 text-blue-600 font-bold'
                                    : 'text-slate-700 hover:bg-[#F8F9FF]'
                                  }`}
                              >
                                <span className="truncate pr-2 font-medium">{prob}</span>
                                {isSelected && <Check size={13} className="shrink-0 text-blue-600" />}
                              </button>
                            );
                          })}

                        {grafik24AvailableProblems.filter((p) =>
                          p.toLowerCase().includes(grafik24ProblemSearch.toLowerCase())
                        ).length === 0 && (
                            <div className="py-4 text-center text-slate-400 text-xs">
                              Tidak ada problem yang cocok
                            </div>
                          )}
                      </div>
                    </div>
                  )}
                </div>

                {/* 4. Filter Periode Tanggal (Dari & Sampai - Kalender) */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[11px] font-semibold text-[#555F71]">
                    <span className="flex items-center gap-1">
                      <Calendar size={11} className="text-blue-600" />
                      <span>Periode Tanggal:</span>
                    </span>
                    {(grafik24StartDate !== 'ALL' || grafik24EndDate !== 'ALL') && (
                      <button
                        type="button"
                        onClick={() => {
                          setGrafik24StartDate('ALL');
                          setGrafik24EndDate('ALL');
                          setGrafik24CurrentPage(1);
                        }}
                        className="text-[10px] text-rose-500 hover:text-rose-700 font-bold hover:underline cursor-pointer"
                      >
                        Reset
                      </button>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 h-9 px-2 bg-white border border-slate-200 rounded-xl text-xs hover:border-blue-400 transition-colors">
                    <div
                      className="flex items-center gap-1 cursor-pointer w-full"
                      onClick={() => grafik24StartDateInputRef.current?.showPicker()}
                      title="Pilih tanggal mulai"
                    >
                      <span className="text-[10px] font-bold text-slate-400 uppercase">Dari:</span>
                      <input
                        ref={grafik24StartDateInputRef}
                        type="date"
                        value={grafik24StartDate === 'ALL' ? '' : grafik24StartDate}
                        onClick={(e) => {
                          try {
                            (e.target as any).showPicker?.();
                          } catch {}
                        }}
                        onChange={(e) => {
                          setGrafik24StartDate(e.target.value || 'ALL');
                          setGrafik24CurrentPage(1);
                        }}
                        className="bg-transparent text-xs font-semibold text-[#0D1C2E] outline-none cursor-pointer w-full"
                      />
                    </div>
                    <span className="text-slate-300">|</span>
                    <div
                      className="flex items-center gap-1 cursor-pointer w-full"
                      onClick={() => grafik24EndDateInputRef.current?.showPicker()}
                      title="Pilih tanggal akhir"
                    >
                      <span className="text-[10px] font-bold text-slate-400 uppercase">Sampai:</span>
                      <input
                        ref={grafik24EndDateInputRef}
                        type="date"
                        value={grafik24EndDate === 'ALL' ? '' : grafik24EndDate}
                        onClick={(e) => {
                          try {
                            (e.target as any).showPicker?.();
                          } catch {}
                        }}
                        onChange={(e) => {
                          setGrafik24EndDate(e.target.value || 'ALL');
                          setGrafik24CurrentPage(1);
                        }}
                        className="bg-transparent text-xs font-semibold text-[#0D1C2E] outline-none cursor-pointer w-full"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
            {/* 2. Main 24-Hour Interactive Bar Chart Card */}
            <div className="bg-white rounded-2xl p-5 border border-[#EFF4FF] shadow-sm flex flex-col gap-4">
              {/* Chart Canvas Area */}
              <div className="relative pt-2 pb-2">
                <div className="text-[11px] font-semibold text-[#555F71] flex flex-wrap items-center justify-between gap-2 mb-3 px-1">
                  <div className="flex items-center gap-2">
                    <span>Klik pada salah satu batang jam untuk membedah data problem pada jam tersebut:</span>
                    {selectedHour24 !== null && (
                      <button
                        type="button"
                        onClick={() => setSelectedHour24(null)}
                        className="px-2 py-0.5 rounded-md bg-slate-100 hover:bg-slate-200 text-blue-600 text-[10px] font-bold flex items-center gap-1 cursor-pointer transition-colors"
                      >
                        <RotateCcw size={10} />
                        <span>Tampilkan Semua Jam</span>
                      </button>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-[10px]">
                    <span className="flex items-center gap-1">
                      <span className="w-2.5 h-2.5 rounded-xs bg-gradient-to-t from-amber-500 to-orange-500 inline-block" />
                      <span className="font-bold text-amber-700">Peak Hour</span>
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="w-2.5 h-2.5 rounded-xs bg-blue-600 ring-1 ring-blue-500 inline-block" />
                      <span className="font-bold text-blue-600">Jam Terpilih</span>
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="w-2.5 h-2.5 rounded-xs bg-blue-600 inline-block" />
                      <span>Frekuensi Normal</span>
                    </span>
                  </div>
                </div>

                {/* 24 Bars Grid / Flex Container */}
                <div className="overflow-x-auto pb-2">
                  <div className="min-w-[760px] h-64 border-b border-slate-200 flex items-end gap-1.5 sm:gap-2 px-2 relative">
                    {/* Background Guide Lines */}
                    <div className="absolute inset-0 pointer-events-none flex flex-col justify-between text-[10px] text-slate-300 z-0">
                      <div className="border-b border-slate-100 w-full flex justify-end pr-1 font-mono">
                        Max: {hourly24Distribution.maxCount}
                      </div>
                      <div className="border-b border-slate-100 w-full flex justify-end pr-1 font-mono">
                        {(hourly24Distribution.maxCount / 2).toFixed(0)}
                      </div>
                      <div className="w-full flex justify-end pr-1 font-mono text-slate-300">
                        0
                      </div>
                    </div>

                    {/* Bars for 00..23 */}
                    {hourly24Distribution.buckets.map((b) => {
                      const isSelected = selectedHour24 === b.hour;
                      const maxVal = hourly24Distribution.maxCount || 1;
                      const barHeightPx = maxVal > 0 ? Math.max(Math.round((b.count / maxVal) * 190), b.count > 0 ? 8 : 3) : 3;

                      return (
                        <div
                          key={b.hour}
                          onClick={() => {
                            setSelectedHour24(selectedHour24 === b.hour ? null : b.hour);
                            setGrafik24CurrentPage(1);
                          }}
                          onMouseEnter={() => setHoveredHour24(b.hour)}
                          onMouseLeave={() => setHoveredHour24(null)}
                          className={`flex-1 flex flex-col items-center justify-end h-full relative cursor-pointer group transition-all z-10 ${isSelected ? 'scale-105' : 'hover:scale-102'
                            }`}
                        >
                          {/* Floating Badge PEAK di atas batang */}
                          {b.isPeak && (
                            <div className="absolute -top-6 flex items-center justify-center pointer-events-none animate-bounce">
                              <span className="px-1 py-0.2 rounded-md bg-amber-500 text-white font-extrabold text-[9px] shadow-xs flex items-center gap-0.5 tracking-tighter">
                                <Flame size={9} />
                                <span>PEAK</span>
                              </span>
                            </div>
                          )}

                          {/* Hover Tooltip Popover */}
                          {hoveredHour24 === b.hour && (
                            <div className="absolute bottom-full mb-3 z-30 pointer-events-none bg-[#0D1C2E] text-white p-2.5 rounded-xl shadow-xl text-left min-w-[190px] border border-slate-700 animate-in fade-in zoom-in-95 duration-100">
                              <div className="flex items-center justify-between border-b border-slate-700 pb-1 mb-1.5">
                                <span className="font-bold text-xs text-blue-600">
                                  Pukul {b.hourRange}
                                </span>
                                {b.isPeak && (
                                  <span className="px-1.5 py-0.2 rounded bg-amber-500 text-white text-[9px] font-bold">
                                    PEAK HOUR
                                  </span>
                                )}
                              </div>
                              <div className="space-y-1 text-[11px]">
                                <div className="flex items-center justify-between">
                                  <span className="text-slate-400">Total Problem:</span>
                                  <strong className="text-white font-mono">{b.count}x ({b.percentage}%)</strong>
                                </div>
                                <div className="flex items-center justify-between">
                                  <span className="text-slate-400">Status Problem:</span>
                                  <span className="font-medium text-slate-200">
                                    <span className="text-rose-400 font-bold">{b.openCount} Open</span> &bull;{' '}
                                    <span className="text-emerald-400 font-bold">{b.solvedCount} Solved</span>
                                  </span>
                                </div>
                                <div className="flex items-center justify-between">
                                  <span className="text-slate-400">Total Durasi:</span>
                                  <span className="text-slate-200 font-mono">{formatDurationHuman(b.totalDurasi)}</span>
                                </div>
                                {b.topProblems.length > 0 && (
                                  <div className="pt-1 mt-1 border-t border-slate-700">
                                    <span className="text-[10px] text-slate-400 block mb-0.5 font-semibold">Problem Terbanyak:</span>
                                    {b.topProblems.map((tp, tpIdx) => (
                                      <div key={tpIdx} className="text-[10px] text-slate-300 truncate">
                                        &bull; {tp.code} ({tp.count}x)
                                      </div>
                                    ))}
                                  </div>
                                )}
                                <div className="pt-1 mt-1 border-t border-slate-700 text-[10px] text-blue-600 font-semibold text-center">
                                  Klik untuk tampilkan tabel
                                </div>
                              </div>
                            </div>
                          )}

                          {/* Count text di atas bar */}
                          <span className={`text-[10px] font-bold font-mono mb-1 transition-colors ${b.isPeak
                              ? 'text-amber-700 font-extrabold'
                              : isSelected
                                ? 'text-blue-600 font-extrabold'
                                : b.count > 0
                                  ? 'text-slate-600'
                                  : 'text-slate-300'
                            }`}>
                            {b.count}
                          </span>

                          {/* The Bar */}
                          <div
                            style={{ height: `${barHeightPx}px` }}
                            className={`w-full max-w-[28px] rounded-t-md transition-all duration-300 ${b.isPeak
                                ? 'bg-gradient-to-t from-amber-500 via-amber-400 to-orange-500 shadow-[0_2px_10px_rgba(245,158,11,0.4)]'
                                : isSelected
                                  ? 'bg-gradient-to-t from-blue-600 to-blue-400 ring-2 ring-blue-500 ring-offset-1'
                                  : b.count > 0
                                    ? 'bg-gradient-to-t from-blue-600/60 to-blue-400/80 group-hover:from-blue-600 group-hover:to-blue-400'
                                    : 'bg-slate-200/80 group-hover:bg-slate-300'
                              }`}
                          />
                        </div>
                      );
                    })}
                  </div>

                  {/* X-Axis Hour Labels */}
                  <div className="min-w-[760px] flex items-center gap-1.5 sm:gap-2 px-2 pt-2">
                    {hourly24Distribution.buckets.map((b) => {
                      const isSelected = selectedHour24 === b.hour;
                      return (
                        <div
                          key={b.hour}
                          onClick={() => {
                            setSelectedHour24(selectedHour24 === b.hour ? null : b.hour);
                            setGrafik24CurrentPage(1);
                          }}
                          className={`flex-1 text-center cursor-pointer transition-colors ${b.isPeak
                              ? 'text-amber-700 font-bold'
                              : isSelected
                                ? 'text-blue-600 font-bold underline'
                                : 'text-slate-500 hover:text-[#0D1C2E]'
                            }`}
                        >
                          <span className="text-[10px] block font-mono">
                            {b.hourLabel}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>

            {/* 4. Table Section: Data Problem pada Jam Terpilih */}
            <div className="bg-white rounded-2xl shadow-sm border border-[#EFF4FF] overflow-hidden flex flex-col">
              {/* Table Header Controls */}
              <div className="p-4 border-b border-[#E5EAF2] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-[#F8F9FF]/60">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-teal-50 border border-teal-200 flex items-center justify-center text-blue-600">
                    <Clock size={18} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-bold text-[#0D1C2E]">
                        {selectedHour24 !== null
                          ? `Data Problem Pukul ${String(selectedHour24).padStart(2, '0')}:00 - ${String(selectedHour24).padStart(2, '0')}:59`
                          : 'Seluruh Problem 24 Jam'}
                      </h3>
                      {selectedHour24 !== null && hourly24Distribution.buckets[selectedHour24]?.isPeak && (
                        <span className="px-2 py-0.5 rounded-full bg-amber-500 text-white text-[10px] font-extrabold flex items-center gap-1">
                          <Flame size={10} />
                          <span>PEAK HOUR</span>
                        </span>
                      )}
                      <span className="px-2 py-0.5 rounded-full bg-[#EFF4FF] text-blue-600 text-xs font-bold font-mono">
                        {displayed24hRows.length} Problem
                      </span>
                    </div>
                    <span className="text-xs text-[#555F71] block mt-0.5">
                      {selectedHour24 !== null
                        ? `Menampilkan rincian problem yang terjadi pada pukul ${String(selectedHour24).padStart(2, '0')}:00.`
                        : 'Klik salah satu batang grafik jam di atas untuk memfilter jam spesifik.'}
                    </span>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                  <div className="relative flex-1 sm:w-56">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      value={grafik24Search}
                      onChange={(e) => {
                        setGrafik24Search(e.target.value);
                        setGrafik24CurrentPage(1);
                      }}
                      placeholder="Cari WSID, Problem, SP..."
                      className="w-full h-8.5 pl-8 pr-3 bg-white border border-slate-200 rounded-xl text-xs outline-none focus:ring-1 focus:ring-blue-500"
                    />
                    {grafik24Search && (
                      <button
                        onClick={() => setGrafik24Search('')}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                      >
                        <X size={12} />
                      </button>
                    )}
                  </div>

                  {selectedHour24 !== null && (
                    <button
                      type="button"
                      onClick={() => setSelectedHour24(null)}
                      className="h-8.5 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition-all cursor-pointer flex items-center gap-1"
                      title="Kembali ke semua jam"
                    >
                      <X size={13} />
                      <span>Semua Jam</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={handleExport24hToExcel}
                    className="h-8.5 px-3.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition-all shadow-2xs flex items-center gap-1.5 cursor-pointer"
                  >
                    <Download size={13} />
                    <span>Export Excel</span>
                  </button>
                </div>
              </div>

              {/* Table Data */}
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse min-w-[960px]">
                  <thead>
                    <tr className="bg-[#F8F9FF] text-[#555F71] font-bold uppercase tracking-wider text-[11px] border-b border-[#E5EAF2] h-10 select-none">
                      <th className="py-2.5 px-3 w-12 text-center">No</th>
                      <th className="py-2.5 px-3 whitespace-nowrap">WSID & Tipe Mesin</th>
                      <th className="py-2.5 px-3 min-w-[160px] whitespace-nowrap">Lokasi</th>
                      <th className="py-2.5 px-3 min-w-[280px] whitespace-nowrap">Problem / Event Code</th>
                      <th className="py-2.5 px-3 whitespace-nowrap">Service Point & Sektor</th>
                      <th className="py-2.5 px-3 whitespace-nowrap">Start</th>
                      <th className="py-2.5 px-3 whitespace-nowrap">End</th>
                      <th className="py-2.5 px-3 whitespace-nowrap">Durasi</th>
                      <th className="py-2.5 px-3 text-center whitespace-nowrap w-24">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#EFF4FF]">
                    {paginated24hRows.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="py-12 text-center text-slate-400">
                          <AlertTriangle size={24} className="mx-auto mb-2 text-slate-300" />
                          <p className="font-semibold text-slate-600">
                            Tidak ada problem yang cocok dengan filter jam dan kriteria ini.
                          </p>
                          <p className="text-[11px] text-slate-400 mt-1">
                            Silakan coba ubah pilihan jam di atas atau reset filter Service Point/Sektor.
                          </p>
                        </td>
                      </tr>
                    ) : (
                      paginated24hRows.map((r, idx) => {
                        const globalIdx = (grafik24CurrentPage - 1) * grafik24PageSize + idx + 1;

                        return (
                          <tr key={idx} className="hover:bg-[#F8F9FF] transition-colors">
                            <td className="py-3 px-3 text-center font-mono text-slate-400">{globalIdx}</td>

                            {/* WSID & Tipe Mesin */}
                            <td className="py-3 px-3 whitespace-nowrap">
                              <div className="flex flex-col">
                                <span className="font-mono font-bold text-[#0D1C2E] text-xs">
                                  {r.wsid}
                                </span>
                                <span className="text-[10px] text-[#555F71]">
                                  {r.typeMesin || '-'}
                                </span>
                              </div>
                            </td>

                            {/* Lokasi */}
                            <td className="py-3 px-3 min-w-[160px] max-w-[240px]">
                              <p className="text-xs text-[#0D1C2E] truncate font-medium" title={r.lokasi}>
                                {r.lokasi || '-'}
                              </p>
                            </td>

                            {/* Problem */}
                            <td className="py-3 px-3 min-w-[280px] whitespace-nowrap">
                              <span className="font-semibold text-blue-600 text-xs block">
                                {r.eventCodeDesc || r.eventCode || '-'}
                              </span>
                            </td>

                            {/* Service Point & Sektor */}
                            <td className="py-3 px-3 whitespace-nowrap">
                              <div className="flex flex-col">
                                <span className="font-semibold text-[#0D1C2E]">
                                  {r.servicePoint || (r.servicePointSektor ? r.servicePointSektor.split('-')[0].trim() : '-')}
                                </span>
                                <span className="text-[10px] text-[#555F71]">
                                  {r.sektor || (r.servicePointSektor ? r.servicePointSektor.split('-')[1]?.trim() : '-')}
                                </span>
                              </div>
                            </td>

                            {/* Start */}
                            <td className="py-3 px-3 whitespace-nowrap font-mono text-xs text-[#0D1C2E]">
                              {getDisplayStartTime(r)}
                            </td>

                            {/* End */}
                            <td className="py-2.5 px-3 whitespace-nowrap">
                              {renderIncidentEndTime(r)}
                            </td>

                            {/* Durasi */}
                            <td className="py-3 px-3 whitespace-nowrap font-mono text-xs font-semibold text-[#0D1C2E]">
                              {formatDurationHuman(r.durasi || 0)}
                            </td>

                            {/* Aksi Buttons */}
                            <td className="py-3 px-3 text-center whitespace-nowrap">
                              <div className="flex items-center justify-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => handleOpenActionFrom24h(r)}
                                  className="px-2.5 py-1 rounded-lg bg-blue-50 hover:bg-blue-700 text-blue-600 hover:text-white text-[11px] font-bold border border-blue-200 transition-all cursor-pointer flex items-center gap-1"
                                  title="Buka form catatan update / penanganan"
                                >
                                  <Edit3 size={11} />
                                  <span>Update</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleOpenWsidHistoryFrom24h(r)}
                                  className="p-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors cursor-pointer"
                                  title="Lihat rekap seluruh penanganan mesin ini"
                                >
                                  <History size={13} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {/* Table Pagination */}
              {displayed24hRows.length > 0 && (
                <div className="p-3 border-t border-[#EFF4FF] flex flex-col sm:flex-row items-center justify-between gap-3 bg-[#F8F9FF]/60 text-xs text-[#555F71]">
                  <div className="flex items-center gap-2">
                    <span>
                      Menampilkan{' '}
                      <strong>
                        {displayed24hRows.length > 0 ? (grafik24CurrentPage - 1) * grafik24PageSize + 1 : 0}
                      </strong>{' '}
                      -{' '}
                      <strong>
                        {Math.min(grafik24CurrentPage * grafik24PageSize, displayed24hRows.length)}
                      </strong>{' '}
                      dari <strong>{displayed24hRows.length}</strong> problem
                    </span>
                    <select
                      value={grafik24PageSize}
                      onChange={(e) => {
                        setGrafik24PageSize(Number(e.target.value));
                        setGrafik24CurrentPage(1);
                      }}
                      className="h-7 px-2 bg-white border border-slate-200 rounded-md text-[11px] font-semibold text-[#0D1C2E] cursor-pointer"
                    >
                      <option value={10}>10 / hal</option>
                      <option value={20}>20 / hal</option>
                      <option value={50}>50 / hal</option>
                      <option value={100}>100 / hal</option>
                    </select>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      disabled={grafik24CurrentPage <= 1}
                      onClick={() => setGrafik24CurrentPage((prev) => Math.max(prev - 1, 1))}
                      className="px-2.5 py-1 bg-white border border-slate-200 rounded-lg hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1 text-[11px] font-semibold cursor-pointer"
                    >
                      <ChevronLeft size={13} />
                      <span>Sebelumnya</span>
                    </button>
                    <span className="px-2 font-mono font-bold text-[#0D1C2E]">
                      {grafik24CurrentPage} / {totalPages24}
                    </span>
                    <button
                      type="button"
                      disabled={grafik24CurrentPage >= totalPages24}
                      onClick={() => setGrafik24CurrentPage((prev) => Math.min(prev + 1, totalPages24))}
                      className="px-2.5 py-1 bg-white border border-slate-200 rounded-lg hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1 text-[11px] font-semibold cursor-pointer"
                    >
                      <span>Berikutnya</span>
                      <ChevronRight size={13} />
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ==================================================== */}
        {/* TAB: DASHBOARD TIKET REQ MONITORING                  */}
        {/* ==================================================== */}
        {activeTab === 'TIKET' && (
          <div className="flex flex-col w-full gap-4 animate-in fade-in duration-150">
            <FollowUpPage userRole={effectiveRole} isEmbedded={true} />
          </div>
        )}

        {/* ==================================================== */}
        {/* TAB 3: RIWAYAT PROBLEM (LOG AUDIT RESTORASI)        */}
        {/* ==================================================== */}
        {activeTab === 'HISTORY' && (
          <div className="flex flex-col w-full gap-4 animate-in fade-in duration-150">
            {/* Header & Filter Bar */}
            <div className="w-full bg-white rounded-2xl p-4 shadow-sm border border-[#EFF4FF] flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2.5 flex-1 min-w-[280px]">
                <div className="relative min-w-[200px] flex-1 max-w-xs">
                  <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={historyQuery}
                    onChange={(e) => {
                      setHistoryQuery(e.target.value);
                      setCurrentPageHistory(1);
                    }}
                    placeholder="Cari WSID / Lokasi / Event / Keterangan..."
                    className="w-full h-9 pl-9 pr-3 rounded-xl bg-[#F8F9FF] text-xs text-[#0D1C2E] border border-[#EFF4FF] outline-none focus:bg-white focus:ring-1 focus:ring-blue-500"
                  />
                </div>

                {/* Filter Periode Tanggal Dari & Sampai (Expanded Click Target) */}
                <div className="flex items-center gap-2 h-9 px-2.5 rounded-xl bg-white border border-[#E5EAF2] text-xs shadow-xs hover:border-blue-400 transition-colors">
                  <div
                    className="flex items-center gap-1.5 cursor-pointer"
                    onClick={() => historyStartDateInputRef.current?.showPicker()}
                    title="Pilih tanggal mulai"
                  >
                    <Calendar size={13} className="text-blue-600 shrink-0" />
                    <span className="text-[10px] font-bold text-slate-400 uppercase">Dari:</span>
                    <input
                      ref={historyStartDateInputRef}
                      type="date"
                      value={historyStartDate}
                      onClick={(e) => {
                        try {
                          (e.target as any).showPicker?.();
                        } catch {}
                      }}
                      onChange={(e) => {
                        const val = e.target.value;
                        setHistoryStartDate(val);
                        const m = val.slice(0, 7);
                        if (m && m !== historyMonth) setHistoryMonth(m);
                        setCurrentPageHistory(1);
                      }}
                      className="bg-transparent text-[#0D1C2E] font-medium outline-none cursor-pointer text-xs"
                    />
                  </div>
                  <span className="text-slate-300">|</span>
                  <div
                    className="flex items-center gap-1.5 cursor-pointer"
                    onClick={() => historyEndDateInputRef.current?.showPicker()}
                    title="Pilih tanggal akhir"
                  >
                    <span className="text-[10px] font-bold text-slate-400 uppercase">Sampai:</span>
                    <input
                      ref={historyEndDateInputRef}
                      type="date"
                      value={historyEndDate}
                      onClick={(e) => {
                        try {
                          (e.target as any).showPicker?.();
                        } catch {}
                      }}
                      onChange={(e) => {
                        setHistoryEndDate(e.target.value);
                        setCurrentPageHistory(1);
                      }}
                      className="bg-transparent text-[#0D1C2E] font-medium outline-none cursor-pointer text-xs"
                    />
                  </div>
                  {(historyStartDate || historyEndDate) && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setHistoryStartDate('');
                        setHistoryEndDate('');
                        setHistoryMonth('ALL');
                        setCurrentPageHistory(1);
                      }}
                      className="text-xs text-rose-500 hover:text-rose-700 font-bold px-1.5 py-0.5 rounded-md hover:bg-rose-50 transition-colors ml-1 cursor-pointer"
                      title="Tampilkan Semua Tanggal"
                    >
                      ✕ Reset
                    </button>
                  )}
                </div>

                {/* Status Filter */}
                <select
                  value={historyStatus}
                  onChange={(e) => {
                    setHistoryStatus(e.target.value);
                    setCurrentPageHistory(1);
                  }}
                  className="h-9 px-3 rounded-xl bg-[#F8F9FF] text-[#0D1C2E] text-xs font-medium border border-[#EFF4FF] outline-none cursor-pointer"
                >
                  <option value="ALL">Status: Semua</option>
                  <option value="CLOSED">Status: Closed / Selesai</option>
                  <option value="OPEN">Status: Problem Open</option>
                </select>

                {/* Multi-Select Event Code Filter History */}
                <div className="relative" ref={eventCodeDropdownRefHistory}>
                  <button
                    type="button"
                    onClick={() => setIsEventCodeDropdownOpenHistory((prev) => !prev)}
                    className={`h-9 px-3 rounded-xl text-xs font-medium border flex items-center gap-1.5 cursor-pointer ${selectedEventCodesHistory.length > 0
                        ? 'bg-blue-50 text-blue-600 border-blue-600 font-semibold'
                        : 'bg-[#F8F9FF] hover:bg-[#EFF4FF] text-[#0D1C2E] border-[#EFF4FF]'
                      }`}
                  >
                    <SlidersHorizontal size={13} className={selectedEventCodesHistory.length > 0 ? 'text-blue-600' : 'text-[#555F71]'} />
                    <span className="truncate max-w-[160px]">
                      {selectedEventCodesHistory.length === 0
                        ? `Event (${historyAvailableEvents.length})`
                        : `${selectedEventCodesHistory.length} Dipilih`}
                    </span>
                    <ChevronDown size={13} className="text-[#555F71]" />
                  </button>

                  {isEventCodeDropdownOpenHistory && (
                    <div className="absolute left-0 mt-1.5 w-80 sm:w-96 bg-white rounded-2xl shadow-2xl border border-slate-200 z-50 p-3 flex flex-col gap-2.5 animate-in fade-in zoom-in-95 duration-150">
                      <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-2">
                        <span className="font-bold text-xs text-[#0D1C2E]">Filter Event (Riwayat)</span>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={selectAllEventCodesHistory}
                            className="text-[11px] text-blue-600 hover:underline font-semibold px-2 py-0.5 rounded cursor-pointer"
                          >
                            Pilih Semua
                          </button>
                          <span className="text-slate-300">&bull;</span>
                          <button
                            type="button"
                            onClick={clearAllEventCodesHistory}
                            className="text-[11px] text-rose-600 hover:underline font-semibold px-2 py-0.5 rounded cursor-pointer"
                          >
                            Reset
                          </button>
                        </div>
                      </div>

                      <div className="relative">
                        <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                          type="text"
                          placeholder="Cari deskripsi event..."
                          value={eventCodeSearchHistory}
                          onChange={(e) => setEventCodeSearchHistory(e.target.value)}
                          className="w-full pl-8 pr-7 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                        {eventCodeSearchHistory && (
                          <button
                            type="button"
                            onClick={() => setEventCodeSearchHistory('')}
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                          >
                            <X size={12} />
                          </button>
                        )}
                      </div>

                      <div className="max-h-60 overflow-y-auto divide-y divide-slate-100 pr-1">
                        {historyAvailableEvents
                          .filter((code) => code.toLowerCase().includes(eventCodeSearchHistory.toLowerCase()))
                          .map((code) => {
                            const isChecked = selectedEventCodesHistory.includes(code);
                            const countInHistory = historyEventCountMap.get(code) || 0;
                            return (
                              <label
                                key={code}
                                className={`flex items-start justify-between gap-2 px-2 py-1.5 rounded-lg cursor-pointer text-xs transition-colors ${isChecked ? 'bg-blue-50 text-blue-600 font-semibold' : 'hover:bg-slate-50 text-slate-700'
                                  }`}
                              >
                                <div className="flex items-start gap-2">
                                  <input
                                    type="checkbox"
                                    checked={isChecked}
                                    onChange={() => toggleEventCodeHistory(code)}
                                    className="mt-0.5 h-3.5 w-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                                  />
                                  <span className="leading-snug break-words">{code}</span>
                                </div>
                                {countInHistory > 0 ? (
                                  <span className="shrink-0 px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-[#EFF4FF] text-blue-600">
                                    {countInHistory}
                                  </span>
                                ) : (
                                  <span className="shrink-0 text-[10px] text-slate-300">0</span>
                                )}
                              </label>
                            );
                          })}
                      </div>
                    </div>
                  )}
                </div>

                {/* Reset Filters Button */}
                {(historyQuery || historyStatus !== 'ALL' || selectedEventCodesHistory.length > 0) && (
                  <button
                    type="button"
                    onClick={() => {
                      setHistoryQuery('');
                      setHistoryStatus('ALL');
                      setSelectedEventCodesHistory([]);
                    }}
                    className="inline-flex items-center gap-1 text-[#555F71] hover:text-[#BA1A1A] text-xs font-medium px-2 transition-colors cursor-pointer"
                    title="Reset filter riwayat"
                  >
                    <RotateCcw size={13} />
                    <span>Reset</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => handleSearchHistory(true)}
                  disabled={isLoadingSearchHistory}
                  className="h-9 px-3 rounded-xl bg-[#EFF4FF] hover:bg-[#E5EEFF] text-blue-600 text-xs font-medium transition-colors cursor-pointer flex items-center gap-1"
                  title="Refresh dari server"
                >
                  <RefreshCw size={13} className={isLoadingSearchHistory ? 'animate-spin' : ''} />
                  <span>Refresh</span>
                </button>
              </div>

              {/* Export Button */}
              {filteredHistory.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    const dateStr = new Date().toISOString().slice(0, 10);
                    exportDailyIncidentsToExcel(
                      filteredHistory.map((r) => ({
                        incidentNumber: r.incidentNumber,
                        wsid: r.wsid,
                        lokasi: r.lokasi,
                        servicePointSektor: `${r.servicePoint} - ${r.sektor}`,
                        servicePoint: r.servicePoint,
                        sektor: r.sektor,
                        typeMesin: r.typeMesin,
                        vendorMesin: r.vendor,
                        startTime: r.startTime,
                        endTime: r.endTime,
                        dateStr: r.tanggal,
                        hourStr: r.jam,
                        hourNumber: 0,
                        durasi: r.durasiOpr,
                        rawDuration: r.durationRaw,
                        eventCodeDesc: r.eventCodeDesc,
                        eventCode: r.eventCode,
                        detail: r.detail
                      })),
                      `Riwayat_Insiden_${historyMonth}_${dateStr}.xlsx`
                    );
                  }}
                  className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-xl bg-[#EFF4FF] hover:bg-[#E5EEFF] text-blue-600 text-xs font-semibold shadow-2xs transition-all cursor-pointer"
                >
                  <Download size={14} />
                  <span>Export Excel</span>
                </button>
              )}
            </div>

            {/* Dense Incident Table */}
            <div className="bg-white rounded-lg shadow-2xs border border-[#E5EAF2] overflow-hidden p-3">
              <div className="overflow-x-auto w-full">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="h-8 bg-[#F8FAFC] text-slate-600 text-[11px] font-semibold uppercase tracking-wider border-b border-[#E5EAF2]">
                      <th
                        onClick={() => handleSortHistory('wsid')}
                        className="px-2.5 py-1.5 cursor-pointer hover:bg-slate-100/80 transition-colors select-none"
                      >
                        <div className="flex items-center gap-1">
                          <span>WSID / Lokasi</span>
                          {historySortColumn === 'wsid' ? (
                            historySortDirection === 'asc' ? <ChevronUp size={11} className="text-blue-600" /> : <ChevronDown size={11} className="text-blue-600" />
                          ) : (
                            <ArrowUpDown size={11} className="text-slate-400" />
                          )}
                        </div>
                      </th>
                      <th
                        onClick={() => handleSortHistory('typeMesin')}
                        className="px-2.5 py-1.5 cursor-pointer hover:bg-slate-100/80 transition-colors select-none"
                      >
                        <div className="flex items-center gap-1">
                          <span>Tipe / Vendor</span>
                          {historySortColumn === 'typeMesin' ? (
                            historySortDirection === 'asc' ? <ChevronUp size={11} className="text-blue-600" /> : <ChevronDown size={11} className="text-blue-600" />
                          ) : (
                            <ArrowUpDown size={11} className="text-slate-400" />
                          )}
                        </div>
                      </th>
                      <th
                        onClick={() => handleSortHistory('eventCodeDesc')}
                        className="px-2.5 py-1.5 cursor-pointer hover:bg-slate-100/80 transition-colors select-none"
                      >
                        <div className="flex items-center gap-1">
                          <span>Problem</span>
                          {historySortColumn === 'eventCodeDesc' ? (
                            historySortDirection === 'asc' ? <ChevronUp size={11} className="text-blue-600" /> : <ChevronDown size={11} className="text-blue-600" />
                          ) : (
                            <ArrowUpDown size={11} className="text-slate-400" />
                          )}
                        </div>
                      </th>
                      <th
                        onClick={() => handleSortHistory('startTime')}
                        className="px-2.5 py-1.5 cursor-pointer hover:bg-slate-100/80 transition-colors select-none"
                      >
                        <div className="flex items-center gap-1">
                          <span>Start</span>
                          {historySortColumn === 'startTime' ? (
                            historySortDirection === 'asc' ? <ChevronUp size={11} className="text-blue-600" /> : <ChevronDown size={11} className="text-blue-600" />
                          ) : (
                            <ArrowUpDown size={11} className="text-slate-400" />
                          )}
                        </div>
                      </th>
                      <th
                        onClick={() => handleSortHistory('endTime')}
                        className="px-2.5 py-1.5 cursor-pointer hover:bg-slate-100/80 transition-colors select-none"
                      >
                        <div className="flex items-center gap-1">
                          <span>End</span>
                          {historySortColumn === 'endTime' ? (
                            historySortDirection === 'asc' ? <ChevronUp size={11} className="text-blue-600" /> : <ChevronDown size={11} className="text-blue-600" />
                          ) : (
                            <ArrowUpDown size={11} className="text-slate-400" />
                          )}
                        </div>
                      </th>
                      <th
                        onClick={() => handleSortHistory('durasiOpr')}
                        className="px-2.5 py-1.5 cursor-pointer hover:bg-slate-100/80 transition-colors select-none"
                      >
                        <div className="flex items-center gap-1">
                          <span>Durasi</span>
                          {historySortColumn === 'durasiOpr' ? (
                            historySortDirection === 'asc' ? <ChevronUp size={11} className="text-blue-600" /> : <ChevronDown size={11} className="text-blue-600" />
                          ) : (
                            <ArrowUpDown size={11} className="text-slate-400" />
                          )}
                        </div>
                      </th>
                      <th
                        onClick={() => handleSortHistory('chronic')}
                        className="px-2.5 py-1.5 cursor-pointer hover:bg-slate-100/80 transition-colors select-none"
                      >
                        <div className="flex items-center gap-1">
                          <span>Chronic Status</span>
                          {historySortColumn === 'chronic' ? (
                            historySortDirection === 'asc' ? <ChevronUp size={11} className="text-blue-600" /> : <ChevronDown size={11} className="text-blue-600" />
                          ) : (
                            <ArrowUpDown size={11} className="text-slate-400" />
                          )}
                        </div>
                      </th>
                      <th
                        onClick={() => handleSortHistory('actionTerakhir')}
                        className="px-2.5 py-1.5 cursor-pointer hover:bg-slate-100/80 transition-colors select-none"
                      >
                        <div className="flex items-center gap-1.5">
                          <span>Action (Keterangan)</span>
                          {historySortColumn === 'actionTerakhir' ? (
                            historySortDirection === 'asc' ? <ChevronUp size={12} className="text-blue-600" /> : <ChevronDown size={12} className="text-blue-600" />
                          ) : (
                            <ArrowUpDown size={12} className="text-slate-400" />
                          )}
                        </div>
                      </th>
                      <th className="px-3 py-2 text-right">Detail</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#EFF4FF]">
                    {paginatedHistory.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="py-12 text-center text-slate-400">
                          {isLoadingSearchHistory ? 'Mencari catatan insiden...' : 'Tidak ada data ditemukan untuk parameter pencarian ini.'}
                        </td>
                      </tr>
                    ) : (
                      paginatedHistory.map((r, idx) => {
                        const chronic = chronicInfoMap.get(r.incidentKey) || evaluateChronicRef.current?.(r);
                        return (
                          <tr key={r.incidentKey || `${r.wsid}_${r.startTime}_${idx}`} className="h-10 hover:bg-[#F8F9FF] transition-colors">
                            {/* 1. WSID / Lokasi */}
                            <td className="px-3 py-1.5">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="font-bold text-[#0D1C2E] font-mono">{r.wsid}</span>
                                {activeTicketByWsidMap.has(r.wsid.trim().toUpperCase()) && (() => {
                                  const t = activeTicketByWsidMap.get(r.wsid.trim().toUpperCase())!;
                                  const isReopen = t.status === 'RE_OPEN';
                                  const isReqClose = t.status === 'REQ_CLOSE';
                                  const dur = formatTicketDuration(t.createdAt, t.durasiMenitFinal, t.status === 'CLOSED');
                                  return (
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setSelectedTicketForDetail(t);
                                        setShowTicketCenterModal(true);
                                      }}
                                      className={`inline-flex items-center gap-1 px-1.5 py-0.2 rounded-md text-[10px] font-bold border transition-all cursor-pointer ${isReopen
                                          ? 'bg-rose-100 text-rose-800 border-rose-300 animate-pulse font-black'
                                          : isReqClose
                                            ? 'bg-purple-100 text-purple-800 border-purple-300'
                                            : 'bg-amber-100 text-amber-800 border-amber-300'
                                        }`}
                                      title={`Tiket #${t.ticketId} (${t.status}): Klik untuk melihat & tindak lanjut`}
                                    >
                                      <Ticket size={10} />
                                      <span>{isReopen ? 'RE-OPEN' : isReqClose ? 'REQ CLOSE' : t.prioritas} ({dur.text})</span>
                                    </button>
                                  );
                                })()}
                              </div>
                              <span className="text-[#555F71] text-[11px] block truncate max-w-[180px]" title={r.lokasi}>
                                {r.lokasi || '-'}
                              </span>
                              {(r.servicePoint || r.sektor) && (
                                <span className="text-[10px] text-slate-400 block truncate max-w-[180px]">
                                  {r.servicePoint !== '-' ? r.servicePoint : ''}{r.sektor && r.sektor !== '-' ? ` • ${r.sektor}` : ''}
                                </span>
                              )}
                            </td>

                            {/* 2. Tipe / Vendor */}
                            <td className="px-3 py-1.5 text-xs text-[#555F71] whitespace-nowrap">
                              <span className="font-semibold text-[#0D1C2E] block">{r.typeMesin || '-'}</span>
                              <span className="text-[11px] text-[#555F71] block truncate max-w-[130px]" title={r.vendor}>
                                {r.vendor || '-'}
                              </span>
                            </td>

                            {/* 3. Problem */}
                            <td className="px-3 py-1.5">
                              <div className="flex items-center gap-1.5">
                                <span
                                  className={`w-2 h-2 rounded-full shrink-0 ${r.durasiOpr >= 180
                                      ? 'bg-[#BA1A1A]'
                                      : r.durasiOpr >= 60
                                        ? 'bg-amber-500'
                                        : 'bg-blue-600'
                                    }`}
                                />
                                <span className="text-[#0D1C2E] font-medium truncate max-w-[180px]" title={r.eventCodeDesc}>
                                  {r.eventCodeDesc || '-'}
                                </span>
                              </div>
                              {r.eventCode && r.eventCode !== '-' && (
                                <span className="text-[10px] font-mono text-slate-400 pl-3.5 block">{r.eventCode}</span>
                              )}
                            </td>

                            {/* 4. Start */}
                            <td className="px-3 py-1.5 font-mono text-[11px] text-[#555F71] whitespace-nowrap">
                              {getDisplayStartTime(r)}
                            </td>

                            {/* 5. End */}
                            <td className="px-3 py-1.5 whitespace-nowrap">
                              {renderIncidentEndTime(r)}
                            </td>

                            {/* 6. Durasi */}
                            <td className="px-3 py-1.5 whitespace-nowrap">
                              {(() => {
                                const isItemOpen = (!r.endTime || r.endTime === '-' || r.status === 'OPEN');
                                const effDur = getHistoryEffectiveDuration(r);
                                return (
                                  <span
                                    title={
                                      isItemOpen
                                        ? `Problem Masih OPEN: Durasi berjalan ${effDur} menit sejak ${getDisplayStartTime(r)} hingga saat ini (sesuai jam operasional WSID)`
                                        : `Durasi Operasional: ${effDur} menit`
                                    }
                                    className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold font-mono tracking-tight ${effDur >= 180
                                        ? 'bg-[#FFDAD6] text-[#BA1A1A] font-extrabold'
                                        : effDur >= 60
                                          ? 'bg-amber-100 text-amber-900 border border-amber-300'
                                          : 'bg-[#EFF4FF] text-[#555F71]'
                                      }`}
                                  >
                                    {formatDurationHuman(effDur)}
                                  </span>
                                );
                              })()}
                            </td>

                            {/* 7. Chronic Status */}
                            <td className="px-3 py-1.5 whitespace-nowrap">
                              {chronic?.is3xSehari ? (
                                <span
                                  title={`Problem yang sama terjadi ${chronic.sameDayCount}x hari ini`}
                                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 text-[10px] font-bold border border-amber-300"
                                >
                                  <Flame size={11} className="text-amber-700" />
                                  <span>3x hari ini</span>
                                </span>
                              ) : chronic?.is3x5Hari ? (
                                <span
                                  title={`Problem yang sama terjadi ${chronic.fiveDayCount}x dlm 5 hari`}
                                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#EFF4FF] text-blue-600 text-[10px] font-bold"
                                >
                                  <Repeat size={11} className="text-blue-600" />
                                  <span>3x/5 hari</span>
                                </span>
                              ) : (
                                <span className="text-[#555F71]/60 font-mono">-</span>
                              )}
                            </td>

                            {/* 8. Action (Menampilkan Isi Keterangannya) */}
                            <td className="px-3 py-1.5">
                              {r.actionTerakhir &&
                                r.actionTerakhir !== '-' &&
                                !isTechnicalMachineLog(r.actionTerakhir) &&
                                r.actionTerakhirOleh !== 'CSV' ? (
                                <div
                                  className="flex flex-col gap-0.5 max-w-[240px]"
                                  title={`${r.actionTerakhir} (${r.actionTerakhirOleh || '-'} • ${formatStartProblemTime(r.actionTerakhirWaktu) !== '-' ? formatStartProblemTime(r.actionTerakhirWaktu) : (r.actionTerakhirWaktu || '-')})`}
                                >
                                  <span className="text-xs font-semibold text-[#0D1C2E] truncate">
                                    {r.actionTerakhir}
                                  </span>
                                  <span className="text-[10px] text-[#555F71] flex items-center gap-1.5 truncate">
                                    <CheckCircle2 size={11} className="text-blue-600 shrink-0" />
                                    {renderAuthorBadge(r.actionTerakhirOleh)}
                                    <span className="truncate">
                                      {cleanAuthorName(r.actionTerakhirOleh)} &bull; {formatStartProblemTime(r.actionTerakhirWaktu) !== '-' ? formatStartProblemTime(r.actionTerakhirWaktu) : (r.actionTerakhirWaktu || '-')}
                                    </span>
                                  </span>
                                </div>
                              ) : (
                                <span className="text-slate-400 text-xs italic">-</span>
                              )}
                            </td>

                            {/* 9. Detail */}
                            <td className="px-3 py-1.5 text-right whitespace-nowrap">
                              <div className="inline-flex items-center gap-1.5 justify-end">
                                {activeTicketByWsidMap.has(r.wsid.trim().toUpperCase()) ? (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setSelectedTicketForDetail(activeTicketByWsidMap.get(r.wsid.trim().toUpperCase())!);
                                      setShowTicketCenterModal(true);
                                    }}
                                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-bold transition-colors cursor-pointer shadow-2xs"
                                    title="Lihat & Tindak Lanjut Tiket Follow Up"
                                  >
                                    <Ticket size={11} />
                                    <span>Tiket Aktif</span>
                                  </button>
                                ) : isSupervisorRole ? (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleOpenKaOpsFollowUp(r, 'FREKUENSI');
                                    }}
                                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-[11px] font-bold border border-indigo-200 transition-colors cursor-pointer shadow-2xs"
                                    title="Ajukan permintaan tindak lanjut untuk problem ini"
                                  >
                                    <Send size={11} className="text-indigo-600" />
                                    <span>Req Follow Up</span>
                                  </button>
                                ) : null}
                                <button
                                  type="button"
                                  onClick={() => handleOpenDetailDrawer(r)}
                                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#EFF4FF] hover:bg-blue-600 hover:text-blue-700 text-blue-600 text-xs font-semibold transition-colors cursor-pointer"
                                >
                                  Detail
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {/* Pagination Bar for History */}
              {filteredHistory.length > 0 && (
                <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-4 border-t border-[#EFF4FF] mt-3">
                  <div className="flex items-center gap-2 text-xs text-[#555F71]">
                    <span>
                      Menampilkan{' '}
                      <strong className="text-[#0D1C2E] font-semibold">
                        {(currentPageHistory - 1) * pageSizeHistory + 1}
                      </strong>{' '}
                      -{' '}
                      <strong className="text-[#0D1C2E] font-semibold">
                        {Math.min(currentPageHistory * pageSizeHistory, filteredHistory.length)}
                      </strong>{' '}
                      dari{' '}
                      <strong className="text-[#0D1C2E] font-semibold">{filteredHistory.length}</strong> riwayat
                    </span>
                    <span>&bull;</span>
                    <div className="flex items-center gap-1">
                      <span>Tampilkan:</span>
                      <select
                        value={pageSizeHistory}
                        onChange={(e) => {
                          setPageSizeHistory(Number(e.target.value));
                          setCurrentPageHistory(1);
                        }}
                        className="bg-[#EFF4FF] px-2 py-0.5 rounded-lg text-[#0D1C2E] font-semibold outline-none cursor-pointer"
                      >
                        <option value={15}>15 per halaman</option>
                        <option value={25}>25 per halaman</option>
                        <option value={50}>50 per halaman</option>
                        <option value={100}>100 per halaman</option>
                      </select>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 self-end sm:self-auto">
                    <button
                      type="button"
                      disabled={currentPageHistory <= 1}
                      onClick={() => setCurrentPageHistory((p) => Math.max(1, p - 1))}
                      className="w-7 h-7 rounded-lg flex items-center justify-center bg-[#F8F9FF] hover:bg-[#EFF4FF] text-[#555F71] disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
                    >
                      <ChevronLeft size={15} />
                    </button>

                    <span className="px-2.5 text-xs font-semibold text-[#0D1C2E]">
                      {currentPageHistory} / {totalPagesHistory}
                    </span>

                    <button
                      type="button"
                      disabled={currentPageHistory >= totalPagesHistory}
                      onClick={() => setCurrentPageHistory((p) => Math.min(totalPagesHistory, p + 1))}
                      className="w-7 h-7 rounded-lg flex items-center justify-center bg-[#F8F9FF] hover:bg-[#EFF4FF] text-[#555F71] disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
                    >
                      <ChevronRight size={15} />
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ==================================================== */}
        {/* TAB 4: UPLOAD CSV PER JAM VIEW                       */}
        {/* ==================================================== */}
        {activeTab === 'UPLOAD' && (
          <div className="flex flex-col w-full gap-5 animate-in fade-in duration-150">
            <div className="bg-white p-7 rounded-2xl border border-[#EFF4FF] shadow-sm space-y-5">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-bold text-[#0D1C2E]">Upload Data Incident Report CSV</h2>
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-600">
                    Akselerasi Batch Instan
                  </span>
                </div>
                <p className="text-xs text-[#555F71]">
                  Tarik file telemetri CSV per jam ke kotak dropzone di bawah. Data langsung terbuka seketika di dashboard problem open.
                </p>
              </div>

              {/* Upload Drop Zone */}
              <div
                onClick={() => {
                  if (!requirePetugasName()) return;
                  fileUploadInputRef.current?.click();
                }}
                className={`border-2 border-dashed rounded-2xl p-8 sm:p-12 text-center cursor-pointer transition-all flex flex-col items-center justify-center space-y-3 ${petugasName.trim()
                    ? 'border-blue-600 hover:border-blue-600 bg-blue-50/20 hover:bg-blue-50/40'
                    : 'border-slate-200 bg-slate-50 opacity-60'
                  }`}
              >
                <div className="w-14 h-14 rounded-2xl bg-white shadow-sm flex items-center justify-center text-blue-600">
                  <UploadCloud size={30} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-[#0D1C2E]">Tarik file CSV per jam ke sini atau klik untuk memilih</h3>
                  <p className="text-xs text-[#555F71] mt-1">Format: .csv (Report Incident_ATM_CRM_*.csv)</p>
                </div>
              </div>

              {/* Upload Progress Bar */}
              {isUploadingCsv && (
                <div className="space-y-2 p-4 rounded-xl bg-blue-50 border border-blue-200">
                  <div className="flex justify-between text-xs font-semibold text-blue-600">
                    <span className="flex items-center gap-2">
                      <Clock size={14} className="animate-spin" />
                      <span>{uploadMessage}</span>
                    </span>
                    <span className="font-mono">{uploadProgress}%</span>
                  </div>
                  <div className="w-full h-2 bg-white rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-600 transition-all duration-300"
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Upload Result Stats */}
              {uploadStats && (
                <div className="p-4 rounded-xl bg-blue-50 border border-blue-200 text-xs space-y-2">
                  <div className="flex items-center gap-2 font-bold text-blue-600">
                    <CheckCircle2 size={16} />
                    <span>Sinkronisasi Selesai — Status Mesin Berhasil Diperbarui</span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
                    <div className="bg-white p-2.5 rounded-xl border border-[#EFF4FF]">
                      <span className="text-[10px] text-slate-500">Total Baris:</span>
                      <div className="font-bold text-[#0D1C2E] text-base">{uploadStats.totalLines.toLocaleString()}</div>
                    </div>
                    <div className="bg-white p-2.5 rounded-xl border border-[#EFF4FF]">
                      <span className="text-[10px] text-rose-600">Problem Baru:</span>
                      <div className="font-bold text-rose-700 text-base">{uploadStats.newCount.toLocaleString()}</div>
                    </div>
                    <div className="bg-white p-2.5 rounded-xl border border-[#EFF4FF]">
                      <span className="text-[10px] text-blue-600">Diperbarui:</span>
                      <div className="font-bold text-blue-600 text-base">{uploadStats.updatedCount.toLocaleString()}</div>
                    </div>
                    <div className="bg-white p-2.5 rounded-xl border border-[#EFF4FF]">
                      <span className="text-[10px] text-slate-500">Tanpa Ubah:</span>
                      <div className="font-bold text-slate-700 text-base">{uploadStats.unchangedCount.toLocaleString()}</div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Riwayat Upload Log */}
            <div className="bg-white rounded-2xl border border-[#EFF4FF] p-5 space-y-3 shadow-sm">
              <h3 className="text-sm font-bold text-[#0D1C2E] flex items-center gap-2">
                <History size={16} className="text-blue-600" />
                <span>Riwayat Upload Terakhir (Database Server)</span>
              </h3>

              <div className="overflow-x-auto rounded-xl border border-[#EFF4FF]">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-[#F8F9FF] text-[#555F71] font-bold uppercase text-[11px] h-9">
                      <th className="px-3">Waktu</th>
                      <th className="px-3">Uploader</th>
                      <th className="px-3">Sumber</th>
                      <th className="px-3">Nama File</th>
                      <th className="px-3 text-right">Total Baris</th>
                      <th className="px-3 text-right text-rose-600">Baru</th>
                      <th className="px-3 text-right text-blue-600">Diupdate</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#EFF4FF] font-mono text-[11px]">
                    {uploadLogs.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="p-6 text-center text-slate-400 font-sans">
                          Belum ada catatan riwayat upload di database server.
                        </td>
                      </tr>
                    ) : (
                      uploadLogs.map((log, idx) => (
                        <tr key={idx} className="h-9 hover:bg-[#F8F9FF]">
                          <td className="px-3 whitespace-nowrap text-[#555F71]">{log.waktu}</td>
                          <td className="px-3 font-sans font-semibold text-[#0D1C2E]">{log.uploader}</td>
                          <td className="px-3 font-sans text-[#555F71]">{log.sumber}</td>
                          <td className="px-3 text-[#555F71] truncate max-w-[180px]">{log.namaFile}</td>
                          <td className="px-3 text-right text-[#555F71]">{log.totalLines?.toLocaleString() || '-'}</td>
                          <td className="px-3 text-right font-bold text-rose-600">{log.baru?.toLocaleString() || 0}</td>
                          <td className="px-3 text-right font-bold text-blue-600">{log.diupdate?.toLocaleString() || 0}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* ==================================================== */}
      {/* 3. RIGHT SLIDE-OVER DRAWER (SINGLE MACHINE ACTION)   */}
      {/* ==================================================== */}
      <div
        className={`fixed inset-y-0 right-0 z-50 w-full sm:w-[440px] bg-white shadow-2xl flex flex-col transform transition-transform duration-300 ease-in-out ${isDrawerOpen && activeIncidentDetail ? 'translate-x-0' : 'translate-x-full'
          }`}
      >
        {activeIncidentDetail && (
          <>
            {/* Drawer Header */}
            <div className="p-5 border-b border-[#E5EAF2] flex items-start justify-between bg-[#F8F9FF]/80">
              <div className="flex flex-col pr-2">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-extrabold text-lg text-[#0D1C2E] font-mono tracking-tight">
                    {activeIncidentDetail.wsid}
                  </span>
                  {(() => {
                    const isOpen = (!activeIncidentDetail.endTime || activeIncidentDetail.endTime === '-' || activeIncidentDetail.status === 'OPEN');
                    const displayDur = isOpen ? getHistoryEffectiveDuration(activeIncidentDetail) : activeIncidentDetail.durasiOpr;
                    return (
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold font-mono flex items-center gap-1 ${displayDur >= 180
                            ? 'bg-[#FFDAD6] text-[#BA1A1A]'
                            : displayDur >= 60
                              ? 'bg-amber-100 text-amber-900'
                              : 'bg-[#EFF4FF] text-[#555F71]'
                          }`}
                        title={isOpen ? `Durasi realtime berjalan sampai saat ini (${currentLiveTime.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })} WIB)` : `Durasi Operasional: ${displayDur} menit`}
                      >
                        {isOpen && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse inline-block" />}
                        {formatDurationHuman(displayDur)}
                      </span>
                    );
                  })()}
                </div>
                <div className="font-medium text-xs text-[#0D1C2E] truncate">
                  {activeIncidentDetail.lokasi}
                </div>
                <div className="flex items-center gap-1.5 mt-1 text-[11px] text-[#555F71]">
                  <span>{activeIncidentDetail.typeMesin} &bull; {activeIncidentDetail.vendor}</span>
                  <span>&bull;</span>
                  <span className="text-blue-600 font-semibold truncate max-w-[170px]">
                    {activeIncidentDetail.eventCodeDesc}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {activeTicketByWsidMap.has(activeIncidentDetail.wsid.trim().toUpperCase()) ? (
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedTicketForDetail(activeTicketByWsidMap.get(activeIncidentDetail.wsid.trim().toUpperCase())!);
                      setShowTicketCenterModal(true);
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition-all shadow-xs cursor-pointer"
                  >
                    <Ticket size={13} />
                    <span>Tiket Follow Up</span>
                  </button>
                ) : isSupervisorRole ? (
                  <button
                    type="button"
                    onClick={() => {
                      handleOpenKaOpsFollowUp(activeIncidentDetail);
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition-all shadow-xs cursor-pointer"
                  >
                    <Send size={13} />
                    <span>Req Follow Up</span>
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={handleCloseDrawer}
                  className="w-8 h-8 rounded-full bg-[#EFF4FF] flex items-center justify-center text-[#555F71] hover:text-[#0D1C2E] hover:bg-[#E5EEFF] transition-colors cursor-pointer"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Drawer Body */}
            <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-5">
              {/* Timing Info Card */}
              <div className="grid grid-cols-2 gap-3 p-3.5 rounded-xl bg-white border border-[#E5EAF2] text-xs shadow-xs">
                <div>
                  <span className="text-[10px] text-[#555F71] block font-semibold uppercase tracking-wider mb-0.5">Waktu Mulai (Start)</span>
                  <span className="font-mono text-[11px] font-semibold text-[#0D1C2E]">
                    {getDisplayStartTime(activeIncidentDetail)}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-[#555F71] block font-semibold uppercase tracking-wider mb-0.5">Waktu Selesai (End)</span>
                  <div className="mt-0.5">
                    {renderIncidentEndTime(activeIncidentDetail)}
                  </div>
                </div>
              </div>

              {/* Jadwal & Profil Operasional Mesin (Hari & Jam Operasi) */}
              {(() => {
                const sched = resolveOperatingSchedule(activeIncidentDetail.wsid, undefined, masterSchedMap);
                const meta = getMachineMetadata(activeIncidentDetail.wsid);
                const rawHari = activeIncidentDetail.hariOperasional && activeIncidentDetail.hariOperasional !== '-' 
                  ? activeIncidentDetail.hariOperasional 
                  : (meta?.hari || sched.hari || 'MON-SUN');
                const rawJam = activeIncidentDetail.jamOperasional && activeIncidentDetail.jamOperasional !== '-' 
                  ? activeIncidentDetail.jamOperasional 
                  : (meta?.jam || sched.jam || '(00:00 - 23:59)');
                const is24Jam = rawJam.includes('00:00') && (rawJam.includes('23:59') || rawJam.includes('24:00'));
                const cleanJam = rawJam.replace(/[()]/g, '').trim();

                const formatHariDisplay = (h: string) => {
                  const up = (h || '').toUpperCase();
                  if (up === 'MON-SUN' || up.includes('SENIN - MINGGU') || up.includes('SENIN-MINGGU') || up === 'EVERYDAY') {
                    return 'Senin – Minggu (Setiap Hari)';
                  }
                  if (up === 'MON-FRI' || up.includes('SENIN - JUMAT') || up.includes('SENIN-JUMAT')) {
                    return 'Senin – Jumat (Hari Kerja)';
                  }
                  if (up === 'MON-SAT' || up.includes('SENIN - SABTU') || up.includes('SENIN-SABTU')) {
                    return 'Senin – Sabtu';
                  }
                  return h || 'Senin – Minggu (Setiap Hari)';
                };

                const vendorName = activeIncidentDetail.vendor && activeIncidentDetail.vendor !== '-' 
                  ? activeIncidentDetail.vendor 
                  : (meta?.vendor || '-');
                const typeName = activeIncidentDetail.typeMesin && activeIncidentDetail.typeMesin !== '-' 
                  ? activeIncidentDetail.typeMesin 
                  : (meta?.tipe_mesin || '-');
                const jenisName = activeIncidentDetail.jenisMesin || meta?.jenis_mesin || 
                  (typeName.toUpperCase().includes('OMRON') || typeName.toUpperCase().includes('RG8') || typeName.toUpperCase().includes('8600') || typeName.toUpperCase().includes('SR7500') ? 'CRM' : 'ATM');
                const spName = activeIncidentDetail.servicePoint && activeIncidentDetail.servicePoint !== '-' 
                  ? activeIncidentDetail.servicePoint 
                  : (meta?.service_point || resolveServicePoint(null, activeIncidentDetail) || '-');
                const sektorName = activeIncidentDetail.sektor && activeIncidentDetail.sektor !== '-' 
                  ? activeIncidentDetail.sektor 
                  : (meta?.sektor_bca || '-');

                return (
                  <div className="rounded-xl border border-blue-100 bg-gradient-to-br from-blue-50/60 to-indigo-50/40 p-3.5 space-y-2.5 shadow-xs">
                    <div className="flex items-center justify-between border-b border-blue-100 pb-2">
                      <div className="flex items-center gap-1.5 text-xs font-bold text-blue-900">
                        <Calendar size={13} className="text-blue-600" />
                        <span>Jadwal & Profil Operasional Mesin</span>
                      </div>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        is24Jam ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' : 'bg-blue-100 text-blue-800 border border-blue-200'
                      }`}>
                        {is24Jam ? '24 JAM' : 'JAM TERBATAS'}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs">
                      {/* Hari Operasi */}
                      <div className="bg-white/95 p-2.5 rounded-lg border border-blue-100/70 shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
                        <span className="text-[10px] text-[#555F71] font-semibold block uppercase tracking-wider mb-0.5">
                          Hari Operasi
                        </span>
                        <span className="font-semibold text-[#0D1C2E] text-[11px] leading-tight block">
                          {formatHariDisplay(rawHari)}
                        </span>
                      </div>

                      {/* Jam Operasi */}
                      <div className="bg-white/95 p-2.5 rounded-lg border border-blue-100/70 shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
                        <span className="text-[10px] text-[#555F71] font-semibold block uppercase tracking-wider mb-0.5">
                          Jam Operasi
                        </span>
                        <span className="font-mono font-bold text-[#0D1C2E] text-[11px] leading-tight block">
                          {cleanJam} {is24Jam ? '(24 Jam)' : 'WIB'}
                        </span>
                      </div>

                      {/* Vendor & Tipe */}
                      <div className="bg-white/95 p-2.5 rounded-lg border border-blue-100/70 shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
                        <span className="text-[10px] text-[#555F71] font-semibold block uppercase tracking-wider mb-0.5">
                          Vendor & Tipe
                        </span>
                        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                          <span className="font-bold text-blue-700 text-[11px]">{vendorName}</span>
                          <span className="text-slate-300">&bull;</span>
                          <span className="font-medium text-[#0D1C2E] text-[11px] truncate max-w-[85px]" title={typeName}>
                            {typeName}
                          </span>
                          <span className={`px-1 py-0.2 rounded text-[9px] font-bold ${
                            jenisName === 'CRM' ? 'bg-indigo-100 text-indigo-700' : 'bg-emerald-100 text-emerald-700'
                          }`}>
                            {jenisName}
                          </span>
                        </div>
                      </div>

                      {/* Service Point & Sektor */}
                      <div className="bg-white/95 p-2.5 rounded-lg border border-blue-100/70 shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
                        <span className="text-[10px] text-[#555F71] font-semibold block uppercase tracking-wider mb-0.5">
                          SP & Sektor
                        </span>
                        <div className="flex items-center gap-1 mt-0.5 text-[11px] truncate">
                          <span className="font-bold text-indigo-700">{spName}</span>
                          <span className="text-slate-300">&bull;</span>
                          <span className="text-[#0D1C2E] truncate font-medium" title={sektorName}>
                            {sektorName}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })()}
              {/* Chronic Alert Banner if detected */}
              {(() => {
                const c = chronicInfoMap.get(activeIncidentDetail.incidentKey) || evaluateChronicRef.current?.(activeIncidentDetail);
                if (!c?.isChronic) return null;
                return (
                  <div className="bg-amber-50 border border-amber-200 p-3 rounded-xl flex items-center gap-2 text-xs text-amber-900">
                    <Flame size={16} className="text-amber-600 shrink-0" />
                    <div>
                      <strong className="block">Terdeteksi Problem Chronic Berulang:</strong>
                      <span>
                        {c.is3xSehari && `Terjadi ${c.sameDayCount}x pada hari ini.`}{' '}
                        {c.is3x5Hari && `Terjadi ${c.fiveDayCount}x dlm rentang 5 hari.`}
                      </span>
                    </div>
                  </div>
                );
              })()}

              {/* Keterangan / Comment Terkini */}
              {(() => {
                const act = activeIncidentDetail.actionTerakhir;
                const isValidAct = Boolean(
                  act &&
                  act !== '-' &&
                  !isTechnicalMachineLog(act) &&
                  activeIncidentDetail.actionTerakhirOleh !== 'CSV'
                );
                const comm = activeIncidentDetail.comment;
                const isValidComm = Boolean(
                  comm &&
                  comm !== '-' &&
                  comm !== activeIncidentDetail.detail &&
                  !isTechnicalMachineLog(comm)
                );

                if (!isValidAct && !isValidComm) return null;

                const text = isValidAct ? act : comm;
                const source = isValidAct ? (activeIncidentDetail.actionTerakhirOleh || 'Petugas') : 'Catatan CSV';
                const time = activeIncidentDetail.actionTerakhirWaktu || '-';

                return (
                  <div className="bg-[#EFF4FF] border border-[#d2e3fc] p-3 rounded-xl flex flex-col gap-1.5 text-xs">
                    <div className="flex items-center gap-1.5 font-bold text-blue-600">
                      <MessageSquare size={14} />
                      <span>Update / Tindakan Terkini:</span>
                    </div>
                    <p className="text-[#0D1C2E] font-medium leading-relaxed bg-white/80 p-2.5 rounded-lg border border-[#d2e3fc]">
                      {text}
                    </p>
                    <span className="text-[10px] text-[#555F71]">
                      Petugas: {source} &bull; {time}
                    </span>
                  </div>
                );
              })()}

              {/* Dropdown Kategori Action: Update vs Penanganan */}
              <div className="flex flex-col gap-1.5 p-3 rounded-xl bg-white border border-[#E5EAF2]">
                <div className="flex items-center justify-between">
                  <label htmlFor="drawer-kategori-select" className="text-xs font-bold text-[#0D1C2E] flex items-center gap-1.5">
                    {actionCategory === 'PENANGANAN' ? (
                      <Wrench size={14} className="text-emerald-600" />
                    ) : (
                      <Clock size={14} className="text-sky-600" />
                    )}
                    <span>Kategori Tindakan:</span>
                  </label>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${actionCategory === 'PENANGANAN'
                      ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                      : 'bg-sky-100 text-sky-800 border border-sky-300'
                    }`}>
                    {actionCategory === 'PENANGANAN' ? '🛠️ Masuk Rekap Frekuensi' : 'ℹ️ Info Progres'}
                  </span>
                </div>

                <div className="relative">
                  <select
                    id="drawer-kategori-select"
                    value={actionCategory}
                    onChange={(e) => setActionCategory(e.target.value as any)}
                    className={`w-full h-9 px-3 pr-8 rounded-xl text-xs font-semibold border outline-none cursor-pointer appearance-none transition-all ${actionCategory === 'PENANGANAN'
                        ? 'bg-emerald-50 text-emerald-900 border-emerald-300 focus:ring-1 focus:ring-emerald-400'
                        : 'bg-sky-50 text-sky-900 border-sky-300 focus:ring-1 focus:ring-sky-400'
                      }`}
                  >
                    <option value="UPDATE">Update — Informasi Tim OTW Lokasi & Status</option>
                    <option value="PENANGANAN">Penanganan — Perbaikan Nyata Problem Mesin</option>
                  </select>
                  <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
                </div>

                <p className="text-[11px] text-[#555F71] leading-relaxed">
                  {actionCategory === 'UPDATE' ? (
                    <span><strong>Update:</strong> Untuk menginformasikan Tim Otw Lokasi, koordinasi vendor, atau info status lapangan.</span>
                  ) : (
                    <span><strong>Penanganan:</strong> Tindakan perbaikan nyata mesin (misal: <em>Replenish Ulang, Eskalasi SLM, Eskalasi Jaringan, Cek Kelistrikan</em>). Keterangan ini otomatis masuk ke <strong>Rekapan Frekuensi per Tanggal</strong>.</span>
                  )}
                </p>
              </div>

              {/* Input Field Action */}
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <label htmlFor="drawer-action-input" className="text-xs font-bold text-[#0D1C2E]">
                    Catatan {actionCategory === 'PENANGANAN' ? 'Penanganan Mesin' : 'Update Tindakan'}
                  </label>
                  <span className="text-[11px] text-[#555F71]">Wajib diisi</span>
                </div>
                <textarea
                  id="drawer-action-input"
                  rows={3}
                  value={singleActionText}
                  onChange={(e) => setSingleActionText(e.target.value)}
                  placeholder={
                    actionCategory === 'PENANGANAN'
                      ? 'Contoh: Replenish Ulang, modul presenter diganti teknisi, normal kembali...'
                      : 'Contoh: Tim teknisi vendor sedang OTW menuju lokasi mesin...'
                  }
                  className="w-full p-3 rounded-xl bg-[#F8F9FF] text-xs text-[#0D1C2E] border border-[#EFF4FF] placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:bg-white resize-none transition-all"
                />
              </div>

              {/* Quick-pick chips */}
              <div className="flex flex-col gap-1.5">
                <span className="text-[11px] font-semibold text-[#555F71]">
                  Pilihan Cepat ({actionCategory === 'PENANGANAN' ? 'Tindakan Penanganan' : 'Update Progres'}):
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {(actionCategory === 'PENANGANAN' ? activePenangananChips : activeUpdateChips).map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => addQuickNote(preset)}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors cursor-pointer ${actionCategory === 'PENANGANAN'
                          ? 'bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200'
                          : 'bg-[#EFF4FF] hover:bg-[#E5EEFF] hover:text-blue-600 text-[#0D1C2E]'
                        }`}
                    >
                      + {preset}
                    </button>
                  ))}
                </div>
              </div>

              {/* Operator Context & Save CTA */}
              <div className="p-3.5 rounded-xl bg-white border border-[#E5EAF2] flex flex-col gap-3">
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-1.5 text-[#555F71]">
                    <User size={13} className="text-blue-600" />
                    <span>Diupdate sebagai:</span>
                  </div>
                  <strong className={petugasName.trim() ? 'text-blue-600' : 'text-rose-600'}>
                    {petugasName.trim() || 'Belum Diisi (Wajib)'}
                  </strong>
                </div>

                {actionSaveSuccess && (
                  <div className="p-2 rounded-lg bg-blue-50 text-blue-600 text-xs font-semibold flex items-center gap-1.5">
                    <CheckCircle2 size={14} />
                    <span>Catatan action tersimpan sukses!</span>
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => handleSubmitSingleAction()}
                  disabled={!singleActionText.trim()}
                  className="w-full h-10 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-400 text-white text-xs font-bold shadow-sm transition-all flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed"
                >
                  <Check size={16} />
                  <span>Simpan Update Tindakan</span>
                </button>
              </div>

              {/* Vertical Timeline: Riwayat Tindakan Mesin */}
              <div className="flex flex-col gap-3 pt-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-xs text-[#0D1C2E]">Riwayat Tindakan Mesin</span>
                  <span className="text-[11px] text-[#555F71]">{incidentHistory.length} Riwayat</span>
                </div>

                {isLoadingHistory ? (
                  <div className="py-4 text-center text-xs text-slate-400">
                    <Clock size={16} className="animate-spin mx-auto mb-1 text-blue-600" />
                    <span>Memuat log riwayat...</span>
                  </div>
                ) : incidentHistory.length === 0 ? (
                  <div className="p-4 rounded-xl bg-white border border-[#E5EAF2] text-center text-xs text-[#555F71]">
                    Belum ada catatan riwayat tindakan sebelumnya.
                  </div>
                ) : (
                  <div className="relative pl-6 space-y-4 before:content-[''] before:absolute before:left-2 before:top-2 before:bottom-2 before:w-[2px] before:bg-[#EFF4FF]">
                    {incidentHistory.map((item, idx) => (
                      <div key={idx} className="relative flex flex-col gap-1">
                        <span className="absolute -left-6 top-1 w-3.5 h-3.5 rounded-full bg-blue-600 ring-4 ring-white"></span>
                        <div className="flex items-center gap-1.5 text-[11px]">
                          {renderAuthorBadge(item.namaPetugas)}
                          <strong className="text-[#0D1C2E] font-semibold">{cleanAuthorName(item.namaPetugas)}</strong>
                          <span className="text-[#555F71]">&bull; {item.waktu}</span>
                        </div>
                        <p className="text-xs text-[#555F71] bg-[#F8F9FF] p-2.5 rounded-xl border border-[#EFF4FF]">
                          "{item.isiAction}"
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Drawer Backdrop */}
      {isDrawerOpen && (
        <div
          className="fixed inset-0 bg-[#0D1C2E]/40 backdrop-blur-xs z-40 transition-opacity"
          onClick={handleCloseDrawer}
        />
      )}

      {/* ==================================================== */}
      {/* 4. BOTTOM FLOATING BULK ACTION BAR                   */}
      {/* ==================================================== */}
      {selectedIncidentKeys.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-30 bg-[#1A202C] text-white rounded-full px-6 py-2.5 shadow-2xl flex items-center gap-5 sm:gap-8 backdrop-blur-md animate-in slide-in-from-bottom-5 duration-200">
          <div className="flex items-center gap-2 text-xs">
            <span className="w-2 h-2 rounded-full bg-blue-600 animate-pulse"></span>
            <span>
              <strong className="text-blue-600 font-bold text-sm">{selectedIncidentKeys.size}</strong> dipilih &bull;{' '}
              <button
                type="button"
                onClick={handleToggleSelectAll}
                className="underline hover:text-white text-slate-300 transition-colors cursor-pointer"
              >
                Pilih semua hasil filter ({filteredOpenIncidents.length})
              </button>
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                if (!requirePetugasName()) return;
                setShowBulkModal(true);
              }}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition-all shadow-sm cursor-pointer"
            >
              <MessageSquare size={14} />
              <span>Update Action ({selectedIncidentKeys.size})</span>
            </button>

            <button
              type="button"
              onClick={() => setSelectedIncidentKeys(new Set())}
              className="px-3 py-1.5 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition-colors cursor-pointer"
            >
              Batal
            </button>
          </div>
        </div>
      )}

      {/* ==================================================== */}
      {/* 5. MODAL: SIAPA YANG BERTUGAS? (DUTY MODAL)          */}
      {/* ==================================================== */}
      {isDutyModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#0D1C2E]/50 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="w-full max-w-md bg-white rounded-2xl p-6 shadow-2xl flex flex-col gap-4 border border-[#EFF4FF]">
            <div className="flex items-start justify-between">
              <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                <ShieldCheck size={22} />
              </div>
              <button
                type="button"
                onClick={() => setIsDutyModalOpen(false)}
                className="w-8 h-8 rounded-full bg-[#EFF4FF] flex items-center justify-center text-[#555F71] hover:text-[#0D1C2E] cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            <div className="flex flex-col gap-1">
              <h2 className="font-bold text-base text-[#0D1C2E]">Siapa yang bertugas hari ini?</h2>
              <p className="text-xs text-[#555F71] leading-relaxed">
                Masukkan identitas nama Anda untuk mengidentifikasi seluruh log audit pembaruan tindakan dan upload file CSV terminal.
              </p>
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="duty-operator-name" className="text-xs font-semibold text-[#0D1C2E]">
                Nama Petugas Ops
              </label>
              <div className="relative">
                <User size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#555F71]" />
                <input
                  id="duty-operator-name"
                  type="text"
                  value={dutyOperatorInput}
                  onChange={(e) => setDutyOperatorInput(e.target.value)}
                  placeholder="Contoh: Budi Prasetyo"
                  className="w-full h-10 pl-9 pr-3 rounded-xl bg-[#F8F9FF] text-xs text-[#0D1C2E] border border-[#EFF4FF] outline-none focus:ring-1 focus:ring-blue-500 focus:bg-white"
                  autoFocus
                />
              </div>
              <span className="text-[11px] text-[#555F71]">Nama akan tercatat di setiap update dan upload monitoring.</span>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsDutyModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-[#EFF4FF] text-[#555F71] text-xs font-semibold hover:bg-[#E5EEFF] transition-colors cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={saveDutyOperator}
                className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-md transition-colors cursor-pointer"
              >
                Mulai Monitoring
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================== */}
      {/* 6. MODAL: UPLOAD DATA CSV PER JAM                    */}
      {/* ==================================================== */}
      {isUploadModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#0D1C2E]/50 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="w-full max-w-[540px] bg-white rounded-2xl shadow-2xl p-6 flex flex-col gap-4 border border-[#EFF4FF]">
            <div className="flex items-start justify-between">
              <div className="flex flex-col gap-0.5">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-blue-600"></span>
                  <h2 className="font-bold text-base text-[#0D1C2E]">Upload Data CSV Per Jam</h2>
                </div>
                <p className="text-xs text-[#555F71]">
                  Sinkronisasi telemetri status mesin ATM & CRM BCA per jam operasional.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsUploadModalOpen(false)}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-[#555F71] hover:text-[#0D1C2E] hover:bg-[#EFF4FF] transition-colors cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Dropzone */}
            <div
              onClick={() => fileUploadInputRef.current?.click()}
              className="rounded-xl bg-[#F8F9FF] p-6 flex flex-col items-center justify-center text-center cursor-pointer border-2 border-dashed border-blue-600 hover:bg-blue-50/40 transition group"
            >
              <div className="w-12 h-12 rounded-xl bg-white shadow-sm flex items-center justify-center text-blue-600 mb-2 group-hover:scale-105 transition-transform">
                <UploadCloud size={26} />
              </div>
              <span className="text-xs font-semibold text-[#0D1C2E]">
                Klik untuk memilih file CSV telemetri per jam
              </span>
              <span className="text-[11px] text-[#555F71] mt-0.5">Format didukung: .csv</span>
            </div>

            {/* Operator Identifier */}
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[#EFF4FF] text-xs text-[#555F71]">
              <ShieldCheck size={15} className="text-blue-600" />
              <span>Diupload oleh: <strong className="text-[#0D1C2E] font-semibold">{petugasName || 'Budi'}</strong></span>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsUploadModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-[#EFF4FF] hover:bg-[#E5EEFF] text-[#555F71] text-xs font-medium transition-colors cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={() => fileUploadInputRef.current?.click()}
                className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-md transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <UploadCloud size={14} />
                <span>Pilih File CSV</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================== */}
      {/* 7. MODAL: BULK ACTION UPDATE                         */}
      {/* ==================================================== */}
      {showBulkModal && (
        <div className="fixed inset-0 z-50 bg-[#0D1C2E]/50 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white border border-[#EFF4FF] rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4 text-[#0D1C2E]">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-blue-50 text-blue-600 rounded-xl">
                  <MessageSquare size={18} />
                </div>
                <h3 className="text-base font-bold text-[#0D1C2E]">
                  Update Action Terpilih ({selectedIncidentKeys.size} Mesin)
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowBulkModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <p className="text-xs text-[#555F71]">
              Catatan tindakan massal akan tersimpan seketika di database dan otomatis terlihat di Cek Daily Ka Ops.
            </p>

            <form onSubmit={handleSubmitBulkAction} className="space-y-3.5">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-[#0D1C2E]">Nama Petugas (Wajib)</label>
                <input
                  type="text"
                  value={petugasName}
                  onChange={(e) => handlePetugasNameChange(e.target.value)}
                  placeholder="Ketik nama Anda..."
                  className="w-full px-3.5 py-2 bg-white border border-[#E5EAF2] rounded-xl text-xs text-[#0D1C2E] outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              {/* Dropdown Kategori Bulk Action */}
              <div className="space-y-1">
                <label className="text-xs font-semibold text-[#0D1C2E]">Kategori Tindakan</label>
                <div className="relative">
                  <select
                    value={bulkActionCategory}
                    onChange={(e) => setBulkActionCategory(e.target.value as any)}
                    className={`w-full h-9 px-3 pr-8 rounded-xl text-xs font-semibold border outline-none cursor-pointer appearance-none transition-all ${bulkActionCategory === 'PENANGANAN'
                        ? 'bg-emerald-50 text-emerald-900 border-emerald-300 focus:ring-1 focus:ring-emerald-400'
                        : 'bg-sky-50 text-sky-900 border-sky-300 focus:ring-1 focus:ring-sky-400'
                      }`}
                  >
                    <option value="UPDATE">Update — Informasi Tim OTW Lokasi & Status</option>
                    <option value="PENANGANAN">Penanganan — Perbaikan Nyata Problem Mesin (Masuk Rekap Frekuensi)</option>
                  </select>
                  <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
                </div>
              </div>

              {/* Quick Action Presets */}
              <div className="space-y-1">
                <span className="text-[11px] font-semibold text-[#555F71]">
                  Pilihan Cepat ({bulkActionCategory === 'PENANGANAN' ? 'Tindakan Penanganan' : 'Update Progres'}):
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {(bulkActionCategory === 'PENANGANAN' ? activePenangananChips : activeUpdateChips).map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setBulkActionText(preset)}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all cursor-pointer ${bulkActionCategory === 'PENANGANAN'
                          ? 'bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200'
                          : 'bg-[#EFF4FF] hover:bg-[#E5EEFF] hover:text-blue-600 text-[#0D1C2E]'
                        }`}
                    >
                      + {preset}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-[#0D1C2E]">Catatan Action</label>
                <textarea
                  rows={3}
                  value={bulkActionText}
                  onChange={(e) => setBulkActionText(e.target.value)}
                  placeholder="Contoh: Dispatch teknisi vendor ke seluruh unit terpilih..."
                  className="w-full p-3 bg-white border border-[#E5EAF2] rounded-xl text-xs text-[#0D1C2E] outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowBulkModal(false)}
                  className="px-4 py-2 rounded-xl bg-[#EFF4FF] text-[#555F71] text-xs font-semibold cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSavingBulk || !bulkActionText.trim() || !petugasName.trim()}
                  className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-400 text-white text-xs font-bold shadow-md flex items-center gap-1.5 cursor-pointer disabled:cursor-not-allowed"
                >
                  {isSavingBulk ? (
                    <>
                      <Clock size={14} className="animate-spin" />
                      <span>Menyimpan...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 size={14} />
                      <span>Simpan untuk {selectedIncidentKeys.size} Mesin</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ==================================================== */}
      {/* 8. MODAL: DETAIL PENANGANAN FREKUENSI PROBLEM        */}
      {/* ==================================================== */}
      {selectedFreqItemForDetail && (
        <div className="fixed inset-0 z-50 bg-[#0D1C2E]/50 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white border border-[#EFF4FF] rounded-2xl max-w-4xl w-full max-h-[90vh] flex flex-col shadow-2xl text-[#0D1C2E] overflow-hidden">
            {/* Modal Header */}
            <div className="p-5 border-b border-[#E5EAF2] bg-[#F8F9FF] flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600 shrink-0">
                  <Wrench size={20} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-extrabold text-[#0D1C2E] font-mono">
                      {selectedFreqItemForDetail.wsid}
                    </h3>
                    <span className="text-xs text-[#555F71] font-normal truncate max-w-[280px]">
                      &bull; {selectedFreqItemForDetail.lokasi}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5 text-xs text-[#555F71]">
                    <span className="font-semibold text-blue-600">{selectedFreqItemForDetail.eventCodeDesc}</span>
                    <span>&bull;</span>
                    <span>{selectedFreqItemForDetail.servicePointSektor}</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <a
                  href={`#/wsid/${selectedFreqItemForDetail.wsid}`}
                  target="_blank"
                  rel="noreferrer"
                  className="px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-2xs"
                  title="Buka Halaman Detail Mesin Lengkap"
                >
                  <ExternalLink size={13} />
                  <span>Detail Mesin</span>
                </a>
                <button
                  type="button"
                  onClick={() => setShowAddPenangananInModal((prev) => !prev)}
                  className="px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition-all shadow-2xs flex items-center gap-1.5 cursor-pointer"
                >
                  <Plus size={14} />
                  <span>{showAddPenangananInModal ? 'Tutup Form' : 'Catat Penanganan Baru'}</span>
                </button>
                <button
                  type="button"
                  onClick={handleCloseFreqDetail}
                  className="w-8 h-8 rounded-full bg-white border border-[#EFF4FF] flex items-center justify-center text-[#555F71] hover:text-[#0D1C2E] hover:bg-slate-100 transition-colors cursor-pointer"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div className="p-5 flex-1 overflow-y-auto space-y-4">
              {/* Summary KPIs */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3 rounded-xl bg-white border border-[#E5EAF2]">
                  <span className="text-[11px] text-[#555F71] block">Total Frekuensi Kejadian</span>
                  <strong className="text-lg font-bold text-blue-600 font-mono">{selectedFreqItemForDetail.totalFrekuensi}x</strong>
                </div>
                <div className="p-3 rounded-xl bg-white border border-[#E5EAF2]">
                  <span className="text-[11px] text-[#555F71] block">Total Durasi Problem</span>
                  <strong className="text-lg font-bold text-[#0D1C2E] font-mono">{formatDurationHuman(selectedFreqItemForDetail.totalDurasi)}</strong>
                </div>
                <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200">
                  <span className="text-[11px] text-emerald-800 block">Tindakan Penanganan</span>
                  <strong className="text-lg font-bold text-emerald-900 font-mono">
                    {freqDetailHistory.filter((h) => h.tipe === 'PENANGANAN' || h.isiAction.includes('[PENANGANAN]')).length +
                      frequencyDataset.filter(
                        (r) =>
                          r.wsid.trim().toUpperCase() === selectedFreqItemForDetail.wsid.trim().toUpperCase() &&
                          ((r as any).actionTerakhir || '').includes('[PENANGANAN]')
                      ).length}x
                  </strong>
                </div>
                <div className="p-3 rounded-xl bg-sky-50 border border-sky-200">
                  <span className="text-[11px] text-sky-800 block">Update Progres / Lapangan</span>
                  <strong className="text-lg font-bold text-sky-900 font-mono">
                    {freqDetailHistory.filter((h) => h.tipe === 'UPDATE' || h.isiAction.includes('[UPDATE]')).length}x
                  </strong>
                </div>
              </div>

              {/* Form Input Penanganan Cepat jika aktif */}
              {showAddPenangananInModal && (
                <div className="p-4 rounded-xl bg-blue-50/50 border border-blue-200 space-y-3 animate-in slide-in-from-top-2 duration-150">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-blue-600 flex items-center gap-1.5">
                      <Wrench size={14} />
                      <span>Input Catatan Penanganan / Update Mesin {selectedFreqItemForDetail.wsid}</span>
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-[11px] font-semibold text-[#0D1C2E]">Kategori Catatan:</label>
                      <select
                        value={modalPenangananCategory}
                        onChange={(e) => setModalPenangananCategory(e.target.value as any)}
                        className={`w-full h-8.5 px-3 rounded-lg text-xs font-semibold border outline-none cursor-pointer ${modalPenangananCategory === 'PENANGANAN'
                            ? 'bg-emerald-50 text-emerald-900 border-emerald-300'
                            : 'bg-sky-50 text-sky-900 border-sky-300'
                          }`}
                      >
                        <option value="PENANGANAN">Penanganan — Perbaikan Nyata Mesin</option>
                        <option value="UPDATE">Update — Info Progres / Tim OTW Lokasi</option>
                      </select>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[11px] font-semibold text-[#0D1C2E]">Terkait Kejadian Tanggal:</label>
                      <select
                        value={modalPenangananDate}
                        onChange={(e) => setModalPenangananDate(e.target.value)}
                        className="w-full h-8.5 px-3 rounded-lg text-xs font-medium border border-slate-200 bg-white outline-none cursor-pointer"
                      >
                        <option value="">Semua / Umum</option>
                        {Object.keys(selectedFreqItemForDetail.dateCounts || {}).map((dt) => (
                          <option key={dt} value={dt}>
                            Tanggal {dt} ({selectedFreqItemForDetail.dateCounts[dt]}x problem)
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Presets */}
                  <div className="space-y-1">
                    <span className="text-[10px] font-semibold text-[#555F71]">Pilihan Cepat:</span>
                    <div className="flex flex-wrap gap-1.5">
                      {(modalPenangananCategory === 'PENANGANAN' ? activePenangananChips : activeUpdateChips).map((preset) => (
                        <button
                          key={preset}
                          type="button"
                          onClick={() => setModalPenangananText((prev) => (prev ? `${prev}, ${preset}` : preset))}
                          className="px-2 py-0.5 rounded-md text-[10px] font-medium bg-white hover:bg-slate-100 border border-slate-200 text-[#0D1C2E] cursor-pointer"
                        >
                          + {preset}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold text-[#0D1C2E]">Catatan Penanganan / Tindakan:</label>
                    <textarea
                      rows={2}
                      value={modalPenangananText}
                      onChange={(e) => setModalPenangananText(e.target.value)}
                      placeholder="Contoh: Replenish Ulang, bersihkan sensor penarik, test dispense 50 lembar normal..."
                      className="w-full p-2.5 rounded-lg border border-slate-200 bg-white text-xs outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setShowAddPenangananInModal(false)}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-100 cursor-pointer"
                    >
                      Batal
                    </button>
                    <button
                      type="button"
                      onClick={handleSaveModalPenanganan}
                      disabled={isSavingModalPenanganan || !modalPenangananText.trim()}
                      className="px-4 py-1.5 rounded-lg text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white disabled:bg-slate-300 transition-all cursor-pointer flex items-center gap-1.5"
                    >
                      {isSavingModalPenanganan ? (
                        <>
                          <Clock size={13} className="animate-spin" />
                          <span>Menyimpan...</span>
                        </>
                      ) : (
                        <>
                          <Check size={13} />
                          <span>Simpan Penanganan</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}

              {/* Date Filter Pills */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-[#0D1C2E] block">Filter Berdasarkan Tanggal Kejadian:</span>
                  <span className="text-[11px] text-[#555F71]">
                    Pilih tanggal untuk melihat catatan penanganan
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setFreqDetailDateFilter('ALL')}
                    className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${freqDetailDateFilter === 'ALL'
                        ? 'bg-blue-600 text-white shadow-2xs'
                        : 'bg-[#F8F9FF] text-[#555F71] hover:bg-[#EFF4FF] border border-[#EFF4FF]'
                      }`}
                  >
                    Semua Tanggal ({selectedFreqItemForDetail.totalFrekuensi}x)
                  </button>
                  {Object.keys(selectedFreqItemForDetail.dateCounts || {}).map((dt) => {
                    const count = selectedFreqItemForDetail.dateCounts[dt];
                    const isSelected = freqDetailDateFilter === dt;
                    const notesCount = freqDateNotesCountMap.get(dt) || 0;
                    return (
                      <button
                        key={dt}
                        type="button"
                        onClick={() => setFreqDetailDateFilter(dt)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all cursor-pointer flex items-center gap-1.5 ${isSelected
                            ? 'bg-blue-600 text-white font-bold shadow-2xs'
                            : 'bg-white hover:bg-[#F8F9FF] text-[#0D1C2E] border border-slate-200'
                          }`}
                      >
                        <span>{dt}</span>
                        <span className={`px-1.5 py-0.2 text-[10px] rounded-full font-bold ${isSelected ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-700'
                          }`}>
                          {count}x
                        </span>
                        {notesCount > 0 && (
                          <span
                            className={`px-1.5 py-0.2 text-[9px] rounded-full font-bold flex items-center gap-0.5 ${isSelected
                                ? 'bg-emerald-300 text-emerald-950'
                                : 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                              }`}
                            title={`${notesCount} catatan penanganan tercatat`}
                          >
                            <Check size={9} />
                            <span>{notesCount}</span>
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Table of Problem Occurrences & Penanganannya */}
              <div className="space-y-1.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-[#0D1C2E]">
                      Daftar Catatan Penanganan Tiap Tanggal
                    </span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-600 border border-blue-200">
                      {freqDetailRows.length} {freqDetailOnlyWithNotes ? 'Catatan' : 'Kejadian'}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setFreqDetailOnlyWithNotes((prev) => !prev)}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer border ${freqDetailOnlyWithNotes
                          ? 'bg-blue-600 text-white border-blue-600 shadow-2xs'
                          : 'bg-white hover:bg-slate-50 text-slate-600 border-slate-200'
                        }`}
                      title={freqDetailOnlyWithNotes ? 'Saat ini hanya menampilkan yang memiliki catatan. Klik untuk melihat semua kejadian.' : 'Klik untuk menyaring hanya kejadian yang memiliki catatan.'}
                    >
                      <Check size={12} className={freqDetailOnlyWithNotes ? 'text-white' : 'opacity-0'} />
                      <span>Hanya Yang Ada Catatan</span>
                    </button>
                  </div>
                </div>

                <div className="border border-[#EFF4FF] rounded-xl overflow-hidden shadow-2xs">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-[#F8F9FF] text-[#555F71] border-b border-[#E5EAF2] text-[11px] font-semibold">
                      <tr>
                        <th className="py-2.5 px-3 text-center w-10">No</th>
                        <th className="py-2.5 px-3 whitespace-nowrap">Tanggal & Jam Problem</th>
                        <th className="py-2.5 px-3 whitespace-nowrap">Durasi</th>
                        <th className="py-2.5 px-3 whitespace-nowrap">Status Problem</th>
                        <th className="py-2.5 px-3 whitespace-nowrap">Kategori</th>
                        <th className="py-2.5 px-3">Penanganan / Tindakan yang Dilakukan</th>
                        <th className="py-2.5 px-3 whitespace-nowrap">Petugas</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#EFF4FF]">
                      {freqDetailRows.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="text-center py-8 text-slate-500 text-xs">
                            <div className="flex flex-col items-center justify-center gap-2">
                              <FileText size={24} className="text-slate-300" />
                              <p className="font-semibold text-slate-600">
                                {freqDetailDateFilter === 'ALL'
                                  ? 'Belum ada catatan penanganan yang tercatat untuk mesin ini.'
                                  : `Belum ada catatan penanganan pada tanggal ${freqDetailDateFilter}.`}
                              </p>
                              <button
                                type="button"
                                onClick={() => {
                                  setShowAddPenangananInModal(true);
                                  if (freqDetailDateFilter !== 'ALL') {
                                    setModalPenangananDate(freqDetailDateFilter);
                                  }
                                }}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-bold hover:bg-blue-700 transition-all cursor-pointer mt-1"
                              >
                                <Plus size={13} />
                                <span>Input Catatan Penanganan Sekarang</span>
                              </button>
                            </div>
                          </td>
                        </tr>
                      ) : (
                        freqDetailRows.map((row, rIdx) => {
                          const isPenanganan = row.kategori === 'PENANGANAN';
                          const isUpdate = row.kategori === 'UPDATE';
                          return (
                            <tr key={row.id || rIdx} className="hover:bg-[#F8F9FF] transition-colors">
                              <td className="py-2.5 px-3 text-center text-slate-400 font-mono">{rIdx + 1}</td>
                              <td className="py-2.5 px-3 whitespace-nowrap font-mono font-medium text-[#0D1C2E]">
                                {row.tanggalJam}
                              </td>
                              <td className="py-2.5 px-3 whitespace-nowrap font-mono text-[#555F71]">
                                {formatDurationHuman(row.durasi)}
                              </td>
                              <td className="py-2.5 px-3 whitespace-nowrap">
                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${row.status === 'OPEN' ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-800'
                                  }`}>
                                  {row.status}
                                </span>
                              </td>
                              <td className="py-2.5 px-3 whitespace-nowrap">
                                {isPenanganan ? (
                                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 flex items-center gap-1 w-fit">
                                    <Wrench size={10} />
                                    <span>PENANGANAN</span>
                                  </span>
                                ) : isUpdate ? (
                                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-sky-100 text-sky-800 border border-sky-300 flex items-center gap-1 w-fit">
                                    <Clock size={10} />
                                    <span>UPDATE</span>
                                  </span>
                                ) : (
                                  <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-100 text-slate-500">
                                    Belum Ada Tindakan
                                  </span>
                                )}
                              </td>
                              <td className="py-2.5 px-3 max-w-[320px]">
                                {row.actionText ? (
                                  <p className="text-[#0D1C2E] font-medium leading-relaxed">
                                    {row.actionText}
                                  </p>
                                ) : (
                                  <span className="text-slate-400 italic">Belum ada keterangan penanganan tercatat</span>
                                )}
                              </td>
                              <td className="py-2.5 px-3 whitespace-nowrap text-[#555F71]">
                                {row.petugas || '-'}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Riwayat Log Tambahan dari Server/LocalStorage jika ada */}
              {freqDetailHistory.length > 0 && (
                <div className="space-y-1.5 pt-2">
                  <span className="text-xs font-bold text-[#0D1C2E] flex items-center gap-1.5">
                    <History size={13} className="text-blue-600" />
                    <span>Log Riwayat Tindakan Mesin (Semua Tanggal)</span>
                  </span>
                  <div className="space-y-2">
                    {freqDetailHistory.map((hist, hIdx) => (
                      <div key={hIdx} className="p-2.5 rounded-xl bg-white border border-[#E5EAF2] flex items-start justify-between gap-3 text-xs">
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-2">
                            <span className={`px-2 py-0.2 rounded-full text-[10px] font-bold ${hist.tipe === 'PENANGANAN' || hist.isiAction.includes('[PENANGANAN]')
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-sky-100 text-sky-800'
                              }`}>
                              {hist.tipe === 'PENANGANAN' || hist.isiAction.includes('[PENANGANAN]') ? 'PENANGANAN' : 'UPDATE'}
                            </span>
                            {renderAuthorBadge(hist.namaPetugas)}
                            <strong className="text-[#0D1C2E]">{cleanAuthorName(hist.namaPetugas)}</strong>
                            <span className="text-[11px] text-[#555F71]">&bull; {hist.waktu}</span>
                          </div>
                          <p className="text-[#0D1C2E] font-medium leading-relaxed mt-1">
                            {hist.isiAction}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Seksi Tiket Follow Up & Tindakan Penanganan Lapangan */}
              {(() => {
                const wsidClean = (selectedFreqItemForDetail.wsid || '').trim().toUpperCase();
                const wsidTickets = (modernTickets || []).filter(
                  (t) => (t.wsid || '').trim().toUpperCase() === wsidClean
                );
                const activeTicket = wsidTickets.find((t) => t.status !== 'CLOSED');

                return (
                  <div className="space-y-3 pt-3 border-t border-[#E5EAF2]">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-indigo-50 border border-indigo-200 flex items-center justify-center text-indigo-600">
                          <Ticket size={15} />
                        </div>
                        <div>
                          <span className="text-xs font-bold text-[#0D1C2E] flex items-center gap-1.5">
                            <span>Tiket Follow Up &amp; Tindakan Penanganan</span>
                            <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-indigo-100 text-indigo-700">
                              {wsidTickets.length} Tiket
                            </span>
                          </span>
                          <span className="text-[10px] text-slate-500 block">
                            Eskalasi pengawasan dan catatan progres penanganan teknisi vendor/lapangan
                          </span>
                        </div>
                      </div>

                      {/* Action Button: Req Follow Up jika belum ada tiket aktif */}
                      {!activeTicket && isSupervisorRole && (
                        <button
                          type="button"
                          onClick={() => {
                            handleOpenKaOpsFollowUp(
                              {
                                wsid: selectedFreqItemForDetail.wsid,
                                lokasi: selectedFreqItemForDetail.lokasi,
                                servicePointSektor: selectedFreqItemForDetail.servicePointSektor,
                                problem: selectedFreqItemForDetail.eventCodeDesc,
                                frekuensi: selectedFreqItemForDetail.totalFrekuensi
                              },
                              'FREKUENSI'
                            );
                          }}
                          className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-2xs flex items-center gap-1.5 transition-all cursor-pointer"
                        >
                          <Send size={12} />
                          <span>Terbitkan Tiket Follow Up</span>
                        </button>
                      )}
                    </div>

                    {wsidTickets.length === 0 ? (
                      <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-center text-xs text-slate-500">
                        <Ticket size={24} className="mx-auto text-slate-300 mb-1" />
                        <p className="font-semibold text-slate-600">Belum ada Tiket Follow Up untuk mesin ini.</p>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          Jika problem berulang ini perlu penanganan terpadu oleh teknisi/vendor, terbitkan tiket follow up di atas.
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {wsidTickets.map((t) => (
                          <div
                            key={t.ticketId}
                            className={`p-3.5 rounded-xl border transition-all ${
                              t.status === 'CLOSED'
                                ? 'bg-slate-50/70 border-slate-200 opacity-90'
                                : 'bg-white border-indigo-200 shadow-xs ring-1 ring-indigo-500/10'
                            }`}
                          >
                            {/* Ticket Header */}
                            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-mono font-bold text-xs text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200">
                                  #{t.ticketId}
                                </span>
                                <span
                                  className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                    t.status === 'CLOSED'
                                      ? 'bg-slate-100 text-slate-700'
                                      : t.status === 'REQ_CLOSE'
                                      ? 'bg-purple-100 text-purple-700 border border-purple-200'
                                      : t.status === 'IN_PROGRESS'
                                      ? 'bg-blue-100 text-blue-700 border border-blue-200'
                                      : 'bg-amber-100 text-amber-800 border border-amber-200'
                                  }`}
                                >
                                  {t.status === 'REQ_CLOSE' ? 'MENUNGGU VALIDASI' : t.status}
                                </span>
                                <span
                                  className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                                    t.prioritas === 'URGENT'
                                      ? 'bg-rose-100 text-rose-700 border border-rose-200'
                                      : t.prioritas === 'HIGH'
                                      ? 'bg-amber-100 text-amber-700 border border-amber-200'
                                      : 'bg-slate-100 text-slate-600'
                                  }`}
                                >
                                  Prioritas: {t.prioritas}
                                </span>
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-600">
                                  Kategori: {t.kategori}
                                </span>
                              </div>

                              <div className="flex items-center gap-2 text-[11px] text-slate-400">
                                <Clock size={11} />
                                <span>{new Date(t.createdAt).toLocaleString('id-ID')}</span>
                                <span>&bull;</span>
                                <span>
                                  Oleh: <strong>{t.createdBy}</strong>
                                </span>
                              </div>
                            </div>

                            {/* Problem & Catatan Request */}
                            <div className="mt-2.5 space-y-1">
                              <div className="text-xs">
                                <span className="text-slate-400 text-[11px]">Problem Terkait: </span>
                                <strong className="text-slate-800">{t.problem}</strong>
                              </div>
                              {t.catatanRequest && (
                                <div className="p-2.5 rounded-lg bg-amber-50/60 border border-amber-200/70 text-xs text-amber-900 leading-relaxed">
                                  <span className="font-semibold text-amber-800 block text-[10px] uppercase mb-0.5">
                                    Arahan / Catatan Request:
                                  </span>
                                  {t.catatanRequest}
                                </div>
                              )}
                            </div>

                            {/* Progres List / Tindakan Penanganan */}
                            <div className="mt-3 space-y-1.5">
                              <div className="flex items-center justify-between">
                                <span className="text-[11px] font-bold text-slate-700 flex items-center gap-1">
                                  <Wrench size={11} className="text-indigo-600" />
                                  <span>Daftar Tindakan / Progres Penanganan ({(t.progresList || []).length}):</span>
                                </span>
                              </div>

                              {!t.progresList || t.progresList.length === 0 ? (
                                <p className="text-[11px] text-slate-400 italic bg-slate-50 p-2 rounded-lg border border-slate-100">
                                  Belum ada tindakan / progres yang diinputkan untuk tiket ini.
                                </p>
                              ) : (
                                <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                                  {t.progresList.map((prg, pIdx) => (
                                    <div
                                      key={prg.id || pIdx}
                                      className="p-2 rounded-lg bg-slate-50 border border-slate-200 flex items-start justify-between gap-2 text-xs"
                                    >
                                      <div className="space-y-0.5 flex-1 min-w-0">
                                        <div className="flex items-center gap-2 text-[10px]">
                                          <span className="font-semibold text-indigo-700 bg-indigo-50 px-1.5 py-0.2 rounded border border-indigo-200">
                                            Tindakan #{pIdx + 1}
                                          </span>
                                          <strong className="text-slate-800">{prg.petugas}</strong>
                                          <span className="text-slate-400">
                                            &bull; {new Date(prg.waktu).toLocaleString('id-ID')}
                                          </span>
                                        </div>
                                        <p className="text-slate-700 leading-relaxed pt-0.5 text-xs">
                                          {prg.catatan}
                                        </p>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}

                              {/* Info Request Close / Validasi jika ada */}
                              {t.reqCloseInfo && (
                                <div className="p-2.5 rounded-lg bg-purple-50 border border-purple-200 text-xs text-purple-900 space-y-0.5 mt-2">
                                  <div className="flex items-center gap-1.5 font-bold text-[10px] uppercase text-purple-800">
                                    <CheckCircle2 size={12} />
                                    <span>Catatan Permintaan Close:</span>
                                    <span className="text-purple-600 font-normal">
                                      ({t.reqCloseInfo.requestedBy} &bull;{' '}
                                      {new Date(t.reqCloseInfo.requestedAt).toLocaleString('id-ID')})
                                    </span>
                                  </div>
                                  <p className="leading-relaxed">{t.reqCloseInfo.catatanPenyelesaian}</p>
                                </div>
                              )}

                              {t.status === 'CLOSED' && t.validationInfo && (
                                <div className="p-2.5 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-900 space-y-0.5 mt-1">
                                  <div className="flex items-center gap-1.5 font-bold text-[10px] uppercase text-emerald-800">
                                    <ShieldCheck size={12} />
                                    <span>Tiket Tervalidasi Selesai (Closed):</span>
                                    <span className="text-emerald-600 font-normal">
                                      ({t.validationInfo.validatedBy} &bull;{' '}
                                      {new Date(t.validationInfo.validatedAt).toLocaleString('id-ID')})
                                    </span>
                                  </div>
                                  {t.validationInfo.catatanApproval && (
                                    <p className="leading-relaxed">{t.validationInfo.catatanApproval}</p>
                                  )}
                                </div>
                              )}

                              {/* Quick Button to open in Ticket Center Modal */}
                              {t.status !== 'CLOSED' && (
                                <div className="pt-2 flex justify-end">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setSelectedTicketForDetail(t);
                                      setShowTicketCenterModal(true);
                                    }}
                                    className="px-3 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-semibold border border-indigo-200 transition-colors flex items-center gap-1 cursor-pointer"
                                  >
                                    <Ticket size={12} />
                                    <span>Buka Tindak Lanjut Lengkap di Pusat Tiket</span>
                                    <ChevronRight size={12} />
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-[#EFF4FF] bg-[#F8F9FF] flex items-center justify-between">
              <span className="text-[11px] text-[#555F71]">
                Rekapan Penanganan terintegrasi otomatis dari update monitoring & data kejadian harian.
              </span>
              <button
                type="button"
                onClick={handleCloseFreqDetail}
                className="px-4 py-2 rounded-xl bg-slate-200 hover:bg-slate-300 text-[#0D1C2E] text-xs font-bold transition-all cursor-pointer"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================== */}
      {/* MODAL KA OPS: REQUEST FOLLOW UP                      */}
      {/* ==================================================== */}
      {kaOpsFollowUpTarget && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-indigo-100 overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="p-5 border-b border-indigo-100 bg-gradient-to-r from-indigo-50/80 to-slate-50 flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-md shadow-indigo-500/20">
                  <Send size={18} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-800">
                    Request Follow Up Problem
                  </h3>
                  <p className="text-xs text-slate-500">
                    Koordinasi penanganan khusus Ka Ops untuk mesin / problem ini
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setKaOpsFollowUpTarget(null)}
                className="w-8 h-8 rounded-full bg-white hover:bg-slate-100 flex items-center justify-center text-slate-500 transition-colors cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 space-y-4 text-xs overflow-y-auto max-h-[70vh]">
              {/* WSID Summary Box */}
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-mono font-bold text-sm text-slate-800">
                    {kaOpsFollowUpTarget.wsid}
                  </span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-100 text-indigo-700">
                    {kaOpsFollowUpTarget.typeMesin}
                  </span>
                </div>
                <div className="text-slate-700 font-medium">
                  {kaOpsFollowUpTarget.lokasi}
                </div>
                <div className="pt-1.5 border-t border-slate-200/60 flex items-center justify-between text-[11px] text-slate-500">
                  <span>Sektor: <strong className="text-slate-700">{cleanSektorName(kaOpsFollowUpTarget.sektor)}</strong></span>
                  <span>SP: <strong className="text-slate-700">{kaOpsFollowUpTarget.servicePoint}</strong></span>
                </div>
                <div className="text-[11px] text-rose-700 font-semibold bg-rose-50 px-2.5 py-1 rounded-lg border border-rose-200 flex items-center justify-between">
                  <span>{kaOpsFollowUpTarget.eventCodeDesc}</span>
                  <span className="font-mono">{formatDurationHuman(getHistoryEffectiveDuration(kaOpsFollowUpTarget))}</span>
                </div>
              </div>

              {/* Priority Select */}
              <div className="space-y-1.5">
                <label className="font-bold text-slate-700">Tingkat Prioritas Tindak Lanjut:</label>
                <div className="grid grid-cols-3 gap-2">
                  {(['NORMAL', 'HIGH', 'URGENT'] as const).map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setKaOpsFollowUpPriority(p)}
                      className={`py-2 px-3 rounded-xl border text-xs font-bold transition-all cursor-pointer ${kaOpsFollowUpPriority === p
                          ? p === 'URGENT'
                            ? 'bg-rose-500 text-white border-rose-600 shadow-sm'
                            : p === 'HIGH'
                              ? 'bg-amber-500 text-white border-amber-600 shadow-sm'
                              : 'bg-indigo-600 text-white border-indigo-700 shadow-sm'
                          : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                        }`}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>

              {/* Category Select */}
              <div className="space-y-1.5">
                <label className="font-bold text-slate-700">Pihak Ditugaskan / Kategori:</label>
                <div className="grid grid-cols-4 gap-2">
                  {(['VENDOR', 'FLM', 'SLM', 'CABANG'] as const).map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setKaOpsFollowUpCategory(cat)}
                      className={`py-1.5 px-2 rounded-xl border text-xs font-semibold transition-all cursor-pointer text-center ${kaOpsFollowUpCategory === cat
                          ? 'bg-slate-800 text-white border-slate-900 shadow-xs'
                          : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                        }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>

              {/* Notes Input */}
              <div className="space-y-1.5">
                <label className="font-bold text-slate-700">Instruksi / Catatan Tindak Lanjut:</label>
                <textarea
                  rows={3}
                  value={kaOpsFollowUpNote}
                  onChange={(e) => setKaOpsFollowUpNote(e.target.value)}
                  placeholder="Tuliskan catatan khusus atau instruksi penanganan untuk tim operasional..."
                  className="w-full p-3 rounded-xl border border-slate-300 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none shadow-inner"
                />
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-slate-200 bg-slate-50 flex flex-col sm:flex-row items-center justify-between gap-2.5">
              <button
                type="button"
                onClick={() => {
                  window.location.hash = `#/follow-up?wsid=${kaOpsFollowUpTarget.wsid}`;
                }}
                className="inline-flex items-center gap-1.5 text-xs text-indigo-700 font-bold hover:underline cursor-pointer order-2 sm:order-1"
              >
                <span>Buka di Menu Follow Up Ka Ops &rarr;</span>
              </button>

              <div className="flex items-center gap-2 w-full sm:w-auto justify-end order-1 sm:order-2">
                <button
                  type="button"
                  onClick={() => setKaOpsFollowUpTarget(null)}
                  className="px-4 py-2 rounded-xl bg-white border border-slate-300 text-slate-700 text-xs font-semibold hover:bg-slate-100 transition-colors cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={handleSubmitKaOpsFollowUp}
                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition-all shadow-md shadow-indigo-500/20 cursor-pointer flex items-center gap-1.5"
                >
                  <Send size={13} />
                  <span>Kirim Permintaan</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================== */}
      {/* MODAL PUSAT TIKET FOLLOW UP                          */}
      {/* (Ka Ops / Ka Wil <-> Tim Monitoring)                 */}
      {/* ==================================================== */}
      {showTicketCenterModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl max-w-5xl w-full max-h-[92vh] shadow-2xl border border-slate-200 overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
            {/* Header Modal */}
            <div className="p-5 sm:px-7 border-b border-slate-200 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-3.5">
                <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-indigo-500 to-purple-500 flex items-center justify-center shadow-lg shadow-indigo-500/30">
                  <Ticket size={22} className="text-white" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-black tracking-tight text-white">
                      Pusat Tiket Follow Up
                    </h2>
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-indigo-500/30 text-indigo-200 border border-indigo-400/30">
                      SLA Realtime
                    </span>
                  </div>
                  <p className="text-xs text-slate-300">
                    Sistem Koordinasi & Eskalasi Problem Mesin antara Supervisor (Ka Ops/Ka Wil) dan Tim Monitoring
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowTicketCenterModal(false)}
                className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-slate-300 hover:text-white transition-colors cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Sub-header Filter & Tabs */}
            <div className="p-4 sm:px-7 bg-slate-50 border-b border-slate-200 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
              {/* Tab Navigation */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0">
                <button
                  type="button"
                  onClick={() => setTicketCenterTab('ALL')}
                  className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap flex items-center gap-2 ${ticketCenterTab === 'ALL'
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                    }`}
                >
                  <Inbox size={14} />
                  <span>Semua Tiket</span>
                  <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${ticketCenterTab === 'ALL' ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-700'
                    }`}>
                    {(modernTickets || []).length}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setTicketCenterTab('ACTION_NEEDED')}
                  className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap flex items-center gap-2 ${ticketCenterTab === 'ACTION_NEEDED'
                      ? 'bg-amber-500 text-white shadow-xs'
                      : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                    }`}
                >
                  <Clock size={14} />
                  <span>Perlu Tindakan Monitoring</span>
                  <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${ticketCenterTab === 'ACTION_NEEDED' ? 'bg-white/20 text-white' : 'bg-amber-100 text-amber-800'
                    }`}>
                    {openTicketsCount}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setTicketCenterTab('WAITING_VALIDATION')}
                  className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap flex items-center gap-2 ${ticketCenterTab === 'WAITING_VALIDATION'
                      ? 'bg-purple-600 text-white shadow-xs'
                      : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                    }`}
                >
                  <ShieldCheck size={14} />
                  <span>Menunggu Validasi Ka Ops</span>
                  <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-black ${ticketCenterTab === 'WAITING_VALIDATION'
                      ? 'bg-white text-purple-700'
                      : reqCloseTicketsCount > 0
                        ? 'bg-purple-100 text-purple-800 animate-pulse'
                        : 'bg-slate-200 text-slate-700'
                    }`}>
                    {reqCloseTicketsCount}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setTicketCenterTab('CLOSED')}
                  className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap flex items-center gap-2 ${ticketCenterTab === 'CLOSED'
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                    }`}
                >
                  <CheckCircle2 size={14} />
                  <span>Tuntas (Closed)</span>
                  <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${ticketCenterTab === 'CLOSED' ? 'bg-white/20 text-white' : 'bg-emerald-100 text-emerald-800'
                    }`}>
                    {(modernTickets || []).filter(t => t.status === 'CLOSED').length}
                  </span>
                </button>
              </div>

              {/* Controls: Filter SP & Search Box */}
              <div className="flex items-center gap-2 w-full md:w-auto">
                <select
                  value={ticketCenterSpFilter}
                  onChange={(e) => setTicketCenterSpFilter(e.target.value)}
                  className="px-2.5 py-1.5 rounded-xl border border-slate-300 text-xs font-semibold text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-2xs"
                >
                  <option value="ALL">Semua SP</option>
                  <option value="ACJK">ACJK</option>
                  <option value="ACBT">ACBT</option>
                  <option value="ACCK">ACCK</option>
                  <option value="ACSR">ACSR</option>
                  <option value="ACBS">ACBS</option>
                  <option value="ACRW">ACRW</option>
                  <option value="TAG">TAG</option>
                </select>

                {/* Search Box */}
                <div className="relative w-full md:w-64">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={ticketSearchQuery}
                    onChange={(e) => setTicketSearchQuery(e.target.value)}
                    placeholder="Cari tiket, WSID, lokasi..."
                    className="w-full pl-9 pr-3 py-1.5 rounded-xl border border-slate-300 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                  />
                </div>
              </div>
            </div>

            {/* Ticket List Body */}
            <div className="p-4 sm:p-6 overflow-y-auto max-h-[calc(92vh-200px)] space-y-4">
              {displayedTickets.length === 0 ? (
                <div className="py-16 text-center text-slate-400">
                  <div className="w-16 h-16 rounded-3xl bg-slate-100 text-slate-300 flex items-center justify-center mx-auto mb-3">
                    <Ticket size={30} />
                  </div>
                  <h4 className="text-sm font-bold text-slate-600 mb-1">Tidak Ada Tiket Ditemukan</h4>
                  <p className="text-xs text-slate-400 max-w-sm mx-auto">
                    {ticketSearchQuery ? 'Tidak ada tiket yang sesuai dengan kata kunci pencarian.' : 'Belum ada tiket pada kategori tab ini.'}
                  </p>
                </div>
              ) : (
                displayedTickets.map((ticket) => {
                  const isReopen = ticket.status === 'RE_OPEN';
                  const isReqClose = ticket.status === 'REQ_CLOSE';
                  const isClosed = ticket.status === 'CLOSED';
                  const durationStr = formatTicketDuration(ticket.createdAt, ticket.durasiMenitFinal);
                  const isUrgentDuration = !isClosed && (Date.now() - new Date(ticket.createdAt).getTime()) > 4 * 3600 * 1000;

                  return (
                    <div
                      key={ticket.ticketId}
                      className={`rounded-2xl border p-4.5 transition-all shadow-xs ${isReopen
                          ? 'bg-rose-50/50 border-rose-300 shadow-rose-100'
                          : isReqClose
                            ? 'bg-purple-50/40 border-purple-200 shadow-purple-50'
                            : isClosed
                              ? 'bg-slate-50/80 border-slate-200 opacity-90'
                              : 'bg-white border-slate-200 hover:border-indigo-300 hover:shadow-md'
                        }`}
                    >
                      {/* Top Card Row */}
                      <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-black text-xs px-2.5 py-1 rounded-lg bg-slate-900 text-white tracking-wider">
                            #{ticket.ticketId}
                          </span>

                          {/* Status Pill */}
                          <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold border flex items-center gap-1 ${isReopen
                              ? 'bg-rose-100 text-rose-800 border-rose-300 animate-pulse'
                              : isReqClose
                                ? 'bg-purple-100 text-purple-800 border-purple-300'
                                : ticket.status === 'IN_PROGRESS'
                                  ? 'bg-amber-100 text-amber-800 border-amber-300'
                                  : isClosed
                                    ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                                    : 'bg-blue-100 text-blue-800 border-blue-300'
                            }`}>
                            {isReopen && <AlertOctagon size={12} />}
                            {isReqClose && <ShieldCheck size={12} />}
                            {isClosed && <CheckCircle2 size={12} />}
                            {ticket.status === 'OPEN' && 'Tiket Baru (Open)'}
                            {ticket.status === 'IN_PROGRESS' && 'Sedang Ditangani'}
                            {ticket.status === 'REQ_CLOSE' && 'Menunggu Validasi Tutup'}
                            {ticket.status === 'RE_OPEN' && 'Re-Open (Belum Tuntas)'}
                            {ticket.status === 'CLOSED' && 'Tuntas & Ditutup'}
                          </span>

                          {/* Prioritas */}
                          <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${ticket.prioritas === 'URGENT'
                              ? 'bg-rose-600 text-white'
                              : ticket.prioritas === 'HIGH'
                                ? 'bg-amber-500 text-white'
                                : 'bg-slate-200 text-slate-700'
                            }`}>
                            {ticket.prioritas}
                          </span>

                          {/* Kategori PIC */}
                          <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                            {ticket.kategori}
                          </span>
                        </div>

                        {/* Duration Clock */}
                        <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono font-bold ${isClosed
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : isUrgentDuration
                              ? 'bg-rose-100 text-rose-800 border border-rose-300 animate-pulse'
                              : 'bg-slate-100 text-slate-700 border border-slate-200'
                          }`}>
                          <Timer size={13} />
                          <span>{isClosed ? `Total SLA: ${durationStr}` : `Durasi Berjalan: ${durationStr}`}</span>
                        </div>
                      </div>

                      {/* Card Content */}
                      <div className="py-3 grid grid-cols-1 md:grid-cols-12 gap-3 text-xs">
                        {/* Machine Details (4 cols) */}
                        <div className="md:col-span-4 space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-black text-sm text-slate-900">{ticket.wsid}</span>
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 font-bold border">
                              {ticket.vendor || 'ATM/CRM'}
                            </span>
                          </div>
                          <p className="text-slate-700 font-medium line-clamp-1">{ticket.lokasi}</p>
                          <p className="text-[11px] text-slate-500">
                            Sektor: <strong className="text-slate-700">{cleanSektorName(ticket.sektor)}</strong> &bull; SP: <strong className="text-slate-700">{ticket.servicePoint}</strong>
                          </p>
                          <div className="pt-1 text-[11px] font-semibold text-rose-600 flex items-center gap-1">
                            <Flame size={12} />
                            <span>{ticket.problem}</span>
                          </div>
                        </div>

                        {/* Initial Request & Notes (8 cols) */}
                        <div className="md:col-span-8 space-y-2">
                          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 text-[11px]">
                            <div className="flex items-center justify-between text-slate-500 mb-1 text-[10px]">
                              <span>Dibuat oleh: <strong className="text-indigo-700">{ticket.createdBy}</strong></span>
                              <span>{new Date(ticket.createdAt).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })}</span>
                            </div>
                            <p className="text-slate-800 italic font-medium">"{ticket.catatanRequest}"</p>
                          </div>

                          {/* RE-OPEN ALERT BOX */}
                          {isReopen && ticket.validationInfo?.alasanReopen && (
                            <div className="p-3 rounded-xl bg-rose-100/80 border border-rose-300 text-[11px] space-y-1 animate-in fade-in">
                              <div className="flex items-center gap-1.5 text-rose-800 font-bold">
                                <AlertOctagon size={14} className="text-rose-600 shrink-0" />
                                <span>Alasan Re-Open oleh Ka Ops / Ka Wil:</span>
                              </div>
                              <p className="text-rose-900 font-semibold pl-5">
                                "{ticket.validationInfo.alasanReopen}"
                              </p>
                              <div className="text-[10px] text-rose-700 pl-5">
                                Divalidasi oleh: {ticket.validationInfo.validatedBy} ({new Date(ticket.validationInfo.validatedAt).toLocaleString('id-ID')})
                              </div>
                            </div>
                          )}

                          {/* REQ_CLOSE INFO BOX */}
                          {isReqClose && ticket.reqCloseInfo && (
                            <div className="p-3 rounded-xl bg-purple-100/80 border border-purple-300 text-[11px] space-y-1">
                              <div className="flex items-center gap-1.5 text-purple-800 font-bold">
                                <ShieldCheck size={14} className="text-purple-600 shrink-0" />
                                <span>Pengajuan Tutup dari Tim Monitoring:</span>
                              </div>
                              <p className="text-purple-950 font-semibold pl-5">
                                "{ticket.reqCloseInfo.catatanPenyelesaian}"
                              </p>
                              <div className="text-[10px] text-purple-700 pl-5 flex items-center justify-between">
                                <span>Kondisi Mesin: <strong>{ticket.reqCloseInfo.statusMesinSaatReq}</strong></span>
                                <span>Oleh: {ticket.reqCloseInfo.requestedBy} ({new Date(ticket.reqCloseInfo.requestedAt).toLocaleString('id-ID', { timeStyle: 'short' })})</span>
                              </div>
                            </div>
                          )}

                          {/* CLOSED SUCCESS BOX */}
                          {isClosed && ticket.validationInfo && (
                            <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-[11px] space-y-1">
                              <div className="flex items-center gap-1.5 text-emerald-800 font-bold">
                                <CheckCircle2 size={14} className="text-emerald-600 shrink-0" />
                                <span>Tiket Ditutup Resmi oleh Ka Ops / Ka Wil</span>
                              </div>
                              <div className="text-[10px] text-emerald-700 pl-5">
                                Disetujui oleh: <strong>{ticket.validationInfo.validatedBy}</strong> ({new Date(ticket.validationInfo.validatedAt).toLocaleString('id-ID')})
                                {ticket.validationInfo.catatanApproval && ` &bull; "${ticket.validationInfo.catatanApproval}"`}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Progress Timeline Accordion / Summary */}
                      {(ticket.progresList && ticket.progresList.length > 0) && (
                        <div className="my-2 p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-[11px] space-y-1.5">
                          <div className="font-bold text-slate-700 flex items-center gap-1.5">
                            <History size={12} className="text-indigo-600" />
                            <span>Progres Tindakan Monitoring ({ticket.progresList.length}):</span>
                          </div>
                          <div className="space-y-1 max-h-24 overflow-y-auto pl-4 border-l-2 border-indigo-200">
                            {ticket.progresList.map((p, idx) => (
                              <div key={p.id || idx} className="text-slate-700">
                                <span className="font-bold text-indigo-700">{p.petugas}</span>{' '}
                                <span className="text-[10px] text-slate-400">({new Date(p.waktu).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}):</span>{' '}
                                <span>{p.catatan}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Inline Add Progress (for OPEN / IN_PROGRESS / RE_OPEN) */}
                      {!isClosed && (
                        <div className="mt-2.5 pt-2.5 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
                          {/* Quick Progress Input */}
                          <div className="flex items-center gap-1.5 flex-1 min-w-[240px]">
                            <input
                              type="text"
                              placeholder="Tambah progres / info vendor terkini..."
                              value={selectedTicketForDetail?.ticketId === ticket.ticketId ? progressInputText : ''}
                              onChange={(e) => {
                                setSelectedTicketForDetail(ticket);
                                setProgressInputText(e.target.value);
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  handleSaveProgressNote(ticket);
                                }
                              }}
                              className="w-full px-3 py-1.5 rounded-lg border border-slate-200 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-white"
                            />
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedTicketForDetail(ticket);
                                handleSaveProgressNote(ticket);
                              }}
                              disabled={isSavingProgress || !progressInputText.trim() || selectedTicketForDetail?.ticketId !== ticket.ticketId}
                              className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white text-xs font-semibold cursor-pointer shrink-0 transition-colors"
                            >
                              Simpan
                            </button>
                          </div>

                          {/* Action Buttons */}
                          <div className="flex items-center gap-2">
                            {/* Tombol Request Close (untuk Monitoring pada tiket Open/InProgress/ReOpen) */}
                            {ticket.status !== 'REQ_CLOSE' && (
                              <button
                                type="button"
                                onClick={() => {
                                  setTargetTicketForReqClose(ticket);
                                  setReqCloseCatatan('');
                                  setShowReqCloseModal(true);
                                }}
                                className="px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold transition-all shadow-xs cursor-pointer flex items-center gap-1.5"
                              >
                                <ClipboardCheck size={13} />
                                <span>Ajukan Tutup (Req Close)</span>
                              </button>
                            )}

                            {/* Tombol Validasi (untuk Ka Ops/Ka Wil jika REQ_CLOSE) */}
                            {isReqClose && (
                              <button
                                type="button"
                                onClick={() => {
                                  setTargetTicketForValidation(ticket);
                                  setValidationDecision('CLOSED');
                                  setValidationReopenReason('');
                                  setValidationCatatanApproval('');
                                  setShowValidationModal(true);
                                }}
                                className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-all shadow-xs cursor-pointer flex items-center gap-1.5 animate-pulse"
                              >
                                <ShieldCheck size={13} />
                                <span>Validasi Tiket</span>
                              </button>
                            )}

                            {/* Tombol Detail Lengkap */}
                            <button
                              type="button"
                              onClick={() => setSelectedTicketForDetail(ticket)}
                              className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium cursor-pointer transition-colors"
                            >
                              Detail & Riwayat
                            </button>

                            {/* Tombol Hapus (khusus Supervisor / Ka Ops) */}
                            {isSupervisorRole && (
                              <button
                                type="button"
                                onClick={() => handleDeleteTicket(ticket.ticketId)}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                                title="Hapus Tiket"
                              >
                                <Trash2 size={14} />
                              </button>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Closed Footer Details */}
                      {isClosed && (
                        <div className="mt-2.5 pt-2 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                          <span>Status: <strong>Tiket Telah Selesai & Divalidasi</strong></span>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => setSelectedTicketForDetail(ticket)}
                              className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium cursor-pointer"
                            >
                              Lihat Audit Trail
                            </button>
                            {isSupervisorRole && (
                              <button
                                type="button"
                                onClick={() => handleDeleteTicket(ticket.ticketId)}
                                className="p-1 text-slate-400 hover:text-rose-600 cursor-pointer"
                                title="Hapus Arsip Tiket"
                              >
                                <Trash2 size={13} />
                              </button>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 sm:px-7 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
              <span className="text-xs text-slate-500">
                Menampilkan <strong>{displayedTickets.length}</strong> tiket &bull; Sinkronisasi realtime ke Supabase Cloud
              </span>
              <button
                type="button"
                onClick={() => setShowTicketCenterModal(false)}
                className="px-5 py-2 rounded-xl bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold transition-all shadow-xs cursor-pointer"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================== */}
      {/* MODAL TIM MONITORING: REQUEST CLOSE TIKET            */}
      {/* ==================================================== */}
      {showReqCloseModal && targetTicketForReqClose && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-purple-200 overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="p-5 border-b border-purple-100 bg-gradient-to-r from-purple-50 to-indigo-50 flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-purple-600 text-white flex items-center justify-center shadow-md shadow-purple-500/20">
                  <ClipboardCheck size={20} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-800">
                    Pengajuan Tutup Tiket (Request Close)
                  </h3>
                  <p className="text-xs text-slate-500">
                    Tiket #{targetTicketForReqClose.ticketId} &bull; WSID {targetTicketForReqClose.wsid}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowReqCloseModal(false);
                  setTargetTicketForReqClose(null);
                }}
                className="w-8 h-8 rounded-full bg-white hover:bg-slate-100 flex items-center justify-center text-slate-500 transition-colors cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 space-y-4 text-xs overflow-y-auto max-h-[70vh]">
              {/* Summary */}
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5">
                <div className="flex items-center justify-between font-bold text-slate-800">
                  <span>WSID: {targetTicketForReqClose.wsid} ({targetTicketForReqClose.lokasi})</span>
                  <span className="px-2 py-0.5 rounded text-[10px] bg-purple-100 text-purple-700">{targetTicketForReqClose.kategori}</span>
                </div>
                <div className="text-rose-600 font-semibold">
                  Problem: {targetTicketForReqClose.problem}
                </div>
                <div className="text-slate-500 text-[11px] pt-1 border-t border-slate-200">
                  Permintaan Ka Ops: <span className="italic">"{targetTicketForReqClose.catatanRequest}"</span>
                </div>
              </div>

              {/* Status Mesin Saat Pengajuan */}
              <div className="space-y-1.5">
                <label className="font-bold text-slate-700">Status Mesin Terkini di Lapangan:</label>
                <select
                  value={reqCloseStatusMesin}
                  onChange={(e) => setReqCloseStatusMesin(e.target.value)}
                  className="w-full p-2.5 rounded-xl border border-slate-300 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-purple-500 bg-white"
                >
                  <option value="Normal / Problem Teratasi (Siap Transaksi)">Normal / Problem Teratasi (Siap Transaksi)</option>
                  <option value="Up Normal - Berhasil Uji Tarik Tunai">Up Normal - Berhasil Uji Tarik Tunai</option>
                  <option value="Normal Sementara - Dalam Pantauan 1 Jam">Normal Sementara - Dalam Pantauan 1 Jam</option>
                  <option value="Menunggu Part / Kunjungan Lanjutan Terjadwal">Menunggu Part / Kunjungan Lanjutan Terjadwal</option>
                  <option value="Problem Selesai Berdasarkan Konfirmasi Vendor">Problem Selesai Berdasarkan Konfirmasi Vendor</option>
                </select>
              </div>

              {/* Catatan Tindakan Penyelesaian */}
              <div className="space-y-1.5">
                <label className="font-bold text-slate-700">
                  Catatan Tindakan & Solusi Penanganan <span className="text-rose-600 font-black">* (Wajib)</span>:
                </label>
                <textarea
                  rows={4}
                  value={reqCloseCatatan}
                  onChange={(e) => setReqCloseCatatan(e.target.value)}
                  placeholder="Contoh: Teknisi vendor DN (sdr. Budi) telah melakukan reset modul dispenser dan pembersihan roller jam 14:30. Mesin telah dites transaksi tarik tunai Rp 100.000 sukses dan saat ini status dispenser normal."
                  className="w-full p-3 rounded-xl border border-slate-300 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none shadow-inner"
                />
              </div>

              <div className="p-3 rounded-xl bg-purple-50 border border-purple-200 text-purple-900 text-[11px] flex items-start gap-2">
                <ShieldCheck size={16} className="text-purple-600 shrink-0 mt-0.5" />
                <span>
                  Tiket tidak akan langsung ditutup secara sepihak, melainkan akan diteruskan ke <strong>Ka Ops / Ka Wil</strong> untuk divalidasi apakah masalah benar-benar tuntas.
                </span>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-slate-200 bg-slate-50 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => {
                  setShowReqCloseModal(false);
                  setTargetTicketForReqClose(null);
                }}
                className="px-4 py-2 rounded-xl bg-white border border-slate-300 text-slate-700 text-xs font-semibold hover:bg-slate-100 transition-colors cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleSubmitReqClose}
                disabled={isSubmittingReqClose || !reqCloseCatatan.trim()}
                className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 disabled:opacity-40 text-white text-xs font-bold transition-all shadow-md shadow-purple-500/20 cursor-pointer flex items-center gap-1.5"
              >
                <ClipboardCheck size={14} />
                <span>Kirim Pengajuan Tutup</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================== */}
      {/* MODAL KA OPS / KA WIL: VALIDASI TUTUP TIKET          */}
      {/* ==================================================== */}
      {showValidationModal && targetTicketForValidation && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl max-w-xl w-full shadow-2xl border border-indigo-200 overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="p-5 border-b border-indigo-100 bg-gradient-to-r from-indigo-50 to-slate-50 flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-md shadow-indigo-500/20">
                  <ShieldCheck size={20} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-800">
                    Validasi Penutupan Tiket Follow Up
                  </h3>
                  <p className="text-xs text-slate-500">
                    Keputusan Supervisor: Setujui Tutup (Close) atau Re-Open Tiket
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowValidationModal(false);
                  setTargetTicketForValidation(null);
                }}
                className="w-8 h-8 rounded-full bg-white hover:bg-slate-100 flex items-center justify-center text-slate-500 transition-colors cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 space-y-4 text-xs overflow-y-auto max-h-[70vh]">
              {/* Perbandingan Instruksi Awal vs Laporan Penanganan */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5">
                  <div className="font-bold text-indigo-700 flex items-center gap-1.5">
                    <Inbox size={13} />
                    <span>Permintaan Awal Ka Ops:</span>
                  </div>
                  <div className="text-[11px] text-slate-700 italic">
                    "{targetTicketForValidation.catatanRequest}"
                  </div>
                  <div className="text-[10px] text-slate-400 pt-1 border-t border-slate-200">
                    Oleh: {targetTicketForValidation.createdBy}
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-purple-50/70 border border-purple-200 space-y-1.5">
                  <div className="font-bold text-purple-700 flex items-center gap-1.5">
                    <ClipboardCheck size={13} />
                    <span>Laporan Tim Monitoring:</span>
                  </div>
                  <div className="text-[11px] text-purple-950 font-medium">
                    "{targetTicketForValidation.reqCloseInfo?.catatanPenyelesaian || '-'}"
                  </div>
                  <div className="text-[10px] text-purple-700 pt-1 border-t border-purple-200 flex items-center justify-between">
                    <span>Kondisi: <strong>{targetTicketForValidation.reqCloseInfo?.statusMesinSaatReq}</strong></span>
                    <span>{targetTicketForValidation.reqCloseInfo?.requestedBy}</span>
                  </div>
                </div>
              </div>

              {/* Pilihan Keputusan */}
              <div className="space-y-2">
                <label className="font-bold text-slate-700">Keputusan Validasi Supervisor:</label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setValidationDecision('CLOSED')}
                    className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between ${validationDecision === 'CLOSED'
                        ? 'bg-emerald-50 border-emerald-500 ring-2 ring-emerald-500/20 text-emerald-950 font-bold'
                        : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <CheckCircle2 size={16} className={validationDecision === 'CLOSED' ? 'text-emerald-600' : 'text-slate-400'} />
                      <span className="text-xs">Setujui Tutup (Close)</span>
                    </div>
                    <p className="text-[10px] text-slate-500 font-normal">
                      Problem telah tuntas, durasi SLA berhenti & tiket resmi diarsipkan.
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setValidationDecision('RE_OPEN')}
                    className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between ${validationDecision === 'RE_OPEN'
                        ? 'bg-rose-50 border-rose-500 ring-2 ring-rose-500/20 text-rose-950 font-bold'
                        : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <AlertOctagon size={16} className={validationDecision === 'RE_OPEN' ? 'text-rose-600' : 'text-slate-400'} />
                      <span className="text-xs">Tolak & Re-Open Tiket</span>
                    </div>
                    <p className="text-[10px] text-slate-500 font-normal">
                      Masalah belum tuntas / drop kembali. Dikembalikan ke antrean monitoring prioritas tinggi.
                    </p>
                  </button>
                </div>
              </div>

              {/* Input Dinamis berdasarkan keputusan */}
              {validationDecision === 'RE_OPEN' ? (
                <div className="space-y-1.5 animate-in fade-in duration-200">
                  <label className="font-bold text-rose-700 flex items-center gap-1.5">
                    <AlertOctagon size={13} />
                    <span>Alasan Re-Open Penolakan <span className="text-rose-600">* (Wajib Diisi)</span>:</span>
                  </label>
                  <textarea
                    rows={3}
                    value={validationReopenReason}
                    onChange={(e) => setValidationReopenReason(e.target.value)}
                    placeholder="Wajib jelaskan mengapa tiket di-reopen (contoh: Mesin masih terpantau drop kembali 10 menit setelah perbaikan vendor, mohon eskalasi vendor level 2 atau ganti part feeder)..."
                    className="w-full p-3 rounded-xl border border-rose-300 text-xs text-rose-950 focus:outline-none focus:ring-2 focus:ring-rose-500 bg-rose-50/30 resize-none shadow-inner"
                  />
                </div>
              ) : (
                <div className="space-y-1.5 animate-in fade-in duration-200">
                  <label className="font-bold text-slate-700">Catatan Approval (Opsional):</label>
                  <input
                    type="text"
                    value={validationCatatanApproval}
                    onChange={(e) => setValidationCatatanApproval(e.target.value)}
                    placeholder="Contoh: Disetujui, mesin sudah normal dan transaksi berhasil."
                    className="w-full p-2.5 rounded-xl border border-slate-300 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
                  />
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-slate-200 bg-slate-50 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => {
                  setShowValidationModal(false);
                  setTargetTicketForValidation(null);
                }}
                className="px-4 py-2 rounded-xl bg-white border border-slate-300 text-slate-700 text-xs font-semibold hover:bg-slate-100 transition-colors cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleSubmitValidation}
                disabled={isSubmittingValidation || (validationDecision === 'RE_OPEN' && !validationReopenReason.trim())}
                className={`px-5 py-2 rounded-xl text-white text-xs font-bold transition-all shadow-md cursor-pointer flex items-center gap-1.5 disabled:opacity-40 ${validationDecision === 'CLOSED'
                    ? 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-500/20'
                    : 'bg-rose-600 hover:bg-rose-700 shadow-rose-500/20'
                  }`}
              >
                {validationDecision === 'CLOSED' ? <CheckCircle2 size={14} /> : <AlertOctagon size={14} />}
                <span>{validationDecision === 'CLOSED' ? 'Setujui & Tutup Tiket' : 'Simpan & Re-Open Tiket'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================== */}
      {/* MODAL DETAIL & AUDIT TRAIL TIKET                    */}
      {/* ==================================================== */}
      {selectedTicketForDetail && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl max-w-2xl w-full shadow-2xl border border-indigo-100 overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="p-5 border-b border-indigo-100 bg-gradient-to-r from-slate-900 to-indigo-950 text-white flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-500/30 border border-indigo-400/30 text-white flex items-center justify-center">
                  <Ticket size={20} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-bold text-white">
                      Detail Tiket #{selectedTicketForDetail.ticketId}
                    </h3>
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-500/40 text-indigo-200 border border-indigo-400/30">
                      {selectedTicketForDetail.status}
                    </span>
                  </div>
                  <p className="text-xs text-slate-300">
                    WSID: {selectedTicketForDetail.wsid} &bull; {selectedTicketForDetail.lokasi}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedTicketForDetail(null)}
                className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-slate-300 hover:text-white transition-colors cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            {/* Body */}
            <div className="p-5 space-y-4 text-xs overflow-y-auto max-h-[70vh]">
              {/* Meta Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                <div>
                  <span className="text-[10px] text-slate-400 block">Sektor / SP</span>
                  <span className="font-semibold text-slate-700">{cleanSektorName(selectedTicketForDetail.sektor)} / {selectedTicketForDetail.servicePoint}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 block">Vendor</span>
                  <span className="font-semibold text-slate-700">{selectedTicketForDetail.vendor || '-'}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 block">Prioritas</span>
                  <span className="font-semibold text-slate-700">{selectedTicketForDetail.prioritas}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 block">Durasi Tiket</span>
                  <span className="font-mono font-bold text-indigo-700">
                    {formatTicketDuration(selectedTicketForDetail.createdAt, selectedTicketForDetail.durasiMenitFinal)}
                  </span>
                </div>
              </div>

              {/* Problem & Initial Request */}
              <div className="p-3.5 rounded-xl bg-indigo-50/50 border border-indigo-200 space-y-1.5">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="font-bold text-indigo-900 flex items-center gap-1.5">
                    <Flame size={13} className="text-rose-600" />
                    Problem: {selectedTicketForDetail.problem}
                  </span>
                  <span className="text-slate-500 text-[10px]">
                    {new Date(selectedTicketForDetail.createdAt).toLocaleString('id-ID')}
                  </span>
                </div>
                <p className="text-slate-800 text-xs italic font-medium">
                  "{selectedTicketForDetail.catatanRequest}"
                </p>
                <div className="text-[10px] text-indigo-700">
                  Diterbitkan oleh: <strong>{selectedTicketForDetail.createdBy}</strong>
                </div>
              </div>

              {/* Re-Open Box if applicable */}
              {selectedTicketForDetail.status === 'RE_OPEN' && selectedTicketForDetail.validationInfo?.alasanReopen && (
                <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-300 space-y-1">
                  <div className="font-bold text-rose-800 flex items-center gap-1.5">
                    <AlertOctagon size={14} className="text-rose-600" />
                    <span>Alasan Re-Open oleh Supervisor:</span>
                  </div>
                  <p className="text-rose-900 font-semibold text-xs">
                    "{selectedTicketForDetail.validationInfo.alasanReopen}"
                  </p>
                  <div className="text-[10px] text-rose-700">
                    Divalidasi oleh: {selectedTicketForDetail.validationInfo.validatedBy} ({new Date(selectedTicketForDetail.validationInfo.validatedAt).toLocaleString('id-ID')})
                  </div>
                </div>
              )}

              {/* Req Close Box if applicable */}
              {selectedTicketForDetail.reqCloseInfo && (
                <div className="p-3.5 rounded-xl bg-purple-50 border border-purple-200 space-y-1">
                  <div className="font-bold text-purple-800 flex items-center gap-1.5">
                    <ClipboardCheck size={14} className="text-purple-600" />
                    <span>Laporan Pengajuan Tutup dari Tim Monitoring:</span>
                  </div>
                  <p className="text-purple-950 font-medium text-xs">
                    "{selectedTicketForDetail.reqCloseInfo.catatanPenyelesaian}"
                  </p>
                  <div className="text-[10px] text-purple-700 flex items-center justify-between pt-1 border-t border-purple-200">
                    <span>Kondisi Mesin: <strong>{selectedTicketForDetail.reqCloseInfo.statusMesinSaatReq}</strong></span>
                    <span>Oleh: {selectedTicketForDetail.reqCloseInfo.requestedBy}</span>
                  </div>
                </div>
              )}

              {/* Closed Validation Box if applicable */}
              {selectedTicketForDetail.status === 'CLOSED' && selectedTicketForDetail.validationInfo && (
                <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 space-y-1">
                  <div className="font-bold text-emerald-800 flex items-center gap-1.5">
                    <CheckCircle2 size={14} className="text-emerald-600" />
                    <span>Tiket Resmi Ditutup (Selesai & Divalidasi)</span>
                  </div>
                  <div className="text-emerald-950 text-xs">
                    Catatan: "{selectedTicketForDetail.validationInfo.catatanApproval || 'Tuntas sesuai standar operasional.'}"
                  </div>
                  <div className="text-[10px] text-emerald-700 pt-1 border-t border-emerald-200">
                    Disetujui oleh: <strong>{selectedTicketForDetail.validationInfo.validatedBy}</strong> pada {new Date(selectedTicketForDetail.validationInfo.validatedAt).toLocaleString('id-ID')}
                  </div>
                </div>
              )}

              {/* Progress Timeline */}
              <div className="space-y-2 pt-2">
                <div className="font-bold text-slate-800 flex items-center justify-between">
                  <span>Riwayat & Progres Tindakan ({selectedTicketForDetail.progresList?.length || 0}):</span>
                  <span className="text-[10px] text-slate-400">Diperbarui realtime</span>
                </div>

                <div className="space-y-2 border-l-2 border-slate-200 pl-4 ml-2">
                  {(!selectedTicketForDetail.progresList || selectedTicketForDetail.progresList.length === 0) ? (
                    <p className="text-slate-400 italic text-xs py-2">Belum ada catatan progres yang ditambahkan.</p>
                  ) : (
                    selectedTicketForDetail.progresList.map((p, idx) => (
                      <div key={p.id || idx} className="relative group">
                        <span className="absolute -left-[21px] top-1.5 w-2.5 h-2.5 rounded-full bg-indigo-500 border-2 border-white ring-1 ring-indigo-200" />
                        <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200">
                          <div className="flex items-center justify-between text-[10px] text-slate-500 mb-1">
                            <span className="font-bold text-indigo-700">{p.petugas}</span>
                            <span>{new Date(p.waktu).toLocaleString('id-ID')}</span>
                          </div>
                          <p className="text-slate-800 text-xs">{p.catatan}</p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Add Progress inside Detail */}
              {selectedTicketForDetail.status !== 'CLOSED' && (
                <div className="pt-2 border-t border-slate-200 space-y-2">
                  <label className="font-bold text-slate-700">Tambah Catatan Progres Baru:</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={progressInputText}
                      onChange={(e) => setProgressInputText(e.target.value)}
                      placeholder="Tuliskan catatan progres atau koordinasi vendor..."
                      className="flex-1 px-3 py-2 rounded-xl border border-slate-300 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          handleSaveProgressNote(selectedTicketForDetail);
                        }
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => handleSaveProgressNote(selectedTicketForDetail)}
                      disabled={isSavingProgress || !progressInputText.trim()}
                      className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer shrink-0"
                    >
                      Kirim
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
              <div>
                {selectedTicketForDetail.status === 'REQ_CLOSE' && isSupervisorRole && (
                  <button
                    type="button"
                    onClick={() => {
                      setTargetTicketForValidation(selectedTicketForDetail);
                      setValidationDecision('CLOSED');
                      setValidationReopenReason('');
                      setValidationCatatanApproval('');
                      setShowValidationModal(true);
                    }}
                    className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-all cursor-pointer shadow-xs flex items-center gap-1.5"
                  >
                    <ShieldCheck size={14} />
                    <span>Validasi Tiket Ini</span>
                  </button>
                )}
                {selectedTicketForDetail.status !== 'CLOSED' && selectedTicketForDetail.status !== 'REQ_CLOSE' && (
                  <button
                    type="button"
                    onClick={() => {
                      setTargetTicketForReqClose(selectedTicketForDetail);
                      setReqCloseCatatan('');
                      setShowReqCloseModal(true);
                    }}
                    className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold transition-all cursor-pointer shadow-xs flex items-center gap-1.5"
                  >
                    <ClipboardCheck size={14} />
                    <span>Ajukan Tutup (Req Close)</span>
                  </button>
                )}
              </div>

              <button
                type="button"
                onClick={() => setSelectedTicketForDetail(null)}
                className="px-5 py-2 rounded-xl bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold transition-all cursor-pointer"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast Notification Ka Ops */}
      {kaOpsFollowUpToast && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-900 text-white px-4 py-3 rounded-2xl shadow-xl flex items-center gap-3 text-xs border border-slate-700 animate-in slide-in-from-bottom duration-300">
          <CheckCircle2 size={18} className="text-emerald-400 shrink-0" />
          <span className="font-medium">{kaOpsFollowUpToast}</span>
          <button
            onClick={() => setKaOpsFollowUpToast(null)}
            className="p-1 hover:bg-white/10 rounded-lg text-slate-400 hover:text-white"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Panel Diagnostik (Aktif hanya jika URL mengandung ?debug=1) */}
      <DebugPanel
        activeDataset="supabase"
        openCount={openIncidents.length}
        dailyCount={allDailyIncidents.length}
        lastSyncedAt={lastSyncedAt}
        connectionStatus={connectionStatus}
        onResetCache={async () => {
          await clearMonitoringCache();
          window.location.reload();
        }}
      />

      {/* ==================================================== */}
      {/* 8. FOOTER                                            */}
      {/* ==================================================== */}
      {!isSupervisorRole && (
        <footer className="w-full bg-white border-t border-[#E5EAF2] py-3 text-center text-xs text-slate-400 mt-auto">
          ©️ 2026 Mons Digital Studio • eMons ATM CRM
        </footer>
      )}
    </div>
  );
}
