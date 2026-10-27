import type { MachineData } from '../store/useDataStore';
import type { FollowUpTicket } from './spreadsheetService';
import { normalizePeriode } from './comprehensiveExporter';
import { evaluateMachineHealth, getTargetSla } from './slaHelper';

export interface FollowUpRecommendation {
  wsid: string;
  lokasi: string;
  sektor: string;
  wilayah: string;
  vendor: string;
  jenisMesin: string;
  latestPeriode: string;
  latestUptime: number;
  priority: 'CRITICAL' | 'WARNING';
  priorityReason: string;
  reasons?: string[];
  isChronic: boolean;
  consecutiveLowMonths: number;
  dominantProblem: string;
  problemDetails: {
    hw: number;
    uh: number;
    kom: number;
    up: number;
    ll: number;
    topHwModule?: string;
    topHwModulePct?: number;
  };
  trend: { periode: string; uptime: number }[];
}

export interface TicketProgressEvaluation {
  ticketId: string;
  wsid: string;
  baselinePeriode: string;
  baselineUptime: number;
  latestPeriode: string;
  latestUptime: number;
  deltaUptime: number;
  evaluationStatus: 'RESOLVED_SUCCESS' | 'IMPROVING' | 'STAGNANT' | 'MONITORING' | 'PENDING_DATA';
  statusLabel: string;
  statusColor: 'green' | 'yellow' | 'red' | 'blue' | 'slate';
  recommendationNote: string;
}

const HW_MODULE_NAMES: Record<string, string> = {
  P01: 'Pick Modul',
  P02: 'Presenter',
  P03: 'Reject',
  P04: 'Card Reader',
  P05: 'Komunikasi',
  P06: 'DIU',
  P07: 'Uang Habis',
  P08: 'Replenishment',
  P09: 'LLH',
  P10: 'Uang Penuh'
};

/**
 * Menganalisa seluruh mesin dan merekomendasikan WSID yang membutuhkan tindak lanjut
 * berdasarkan aturan SLA Resmi BCA:
 * - Target SLA: ATM 99.00%, CRM 98.50%
 * - Kritis: ATM < 98.50%, CRM < 98.00%
 * - Mesin Kronis: 2 bulan di bawah SLA (Warning), > 2 bulan di bawah SLA (Kritis)
 * - Lonjakan Komponen (Spike): KOM > 0.30%, UP > 0.50%, UH > 0.30%, HW > 1.00%
 */
export interface FollowUpFilterOptions {
  klien?: string;
  jenisMesin?: string;
  sektor?: string;
}

export const getFollowUpRecommendations = (
  machines: MachineData[],
  activePeriode: string,
  filterOptions?: FollowUpFilterOptions
): FollowUpRecommendation[] => {
  if (!machines || machines.length === 0) return [];

  const normActivePeriode = normalizePeriode(activePeriode);
  const isAll = !normActivePeriode || normActivePeriode === 'ALL';

  const recommendations: FollowUpRecommendation[] = [];

  machines.forEach(machine => {
    // 1. Hanya evaluasi mesin yang aktif
    if (machine.statusAktif?.trim().toUpperCase() !== 'AKTIF') return;

    // 2. HANYA FOKUS KE MESIN BCA AKTIF (Non BCA tidak dievaluasi untuk SLA & Follow Up BCA)
    if (machine.klienStatus !== 'BCA') return;

    // 3. Filter Jenis Mesin jika dispesifikasikan
    if (filterOptions?.jenisMesin && filterOptions.jenisMesin !== 'ALL' && machine.jenisMesin !== filterOptions.jenisMesin) {
      return;
    }

    // 4. Filter Sektor jika dispesifikasikan
    if (filterOptions?.sektor && filterOptions.sektor !== 'ALL' && machine.sektorBCA !== filterOptions.sektor) {
      return;
    }

    const history = [...(machine.monthlyData || [])].sort((a, b) => 
      normalizePeriode(a.periode).localeCompare(normalizePeriode(b.periode))
    );

    // Evaluasi performa kesehatan mesin sesuai periode filter
    const health = evaluateMachineHealth(machine, isAll ? 'ALL' : normActivePeriode);

    // Jika mesin performanya aman sesuai SLA tanpa problem khusus, tidak perlu follow up
    if (health.status === 'SAFE') return;

    // Ambil data referensi modul hardware & problem details
    let refMonthData: any = null;
    if (!isAll) {
      refMonthData = history.find(h => normalizePeriode(h.periode) === normActivePeriode) || null;
    } else {
      refMonthData = history[history.length - 1] || null;
    }

    let topModule = '';
    let topModulePct = 0;
    if (refMonthData && refMonthData.hwDetail) {
      for (const [modKey, val] of Object.entries(refMonthData.hwDetail)) {
        const numVal = Number(val) || 0;
        if (numVal > topModulePct) {
          topModulePct = numVal;
          topModule = modKey;
        }
      }
    }

    const priority: 'CRITICAL' | 'WARNING' = health.status === 'CRITICAL' ? 'CRITICAL' : 'WARNING';

    const trend = history.slice(-6).map(h => ({
      periode: h.periode,
      uptime: Number(Math.max(0, 100 - (Number(h.total) || 0)).toFixed(2))
    }));

    recommendations.push({
      wsid: machine.wsid,
      lokasi: machine.lokasi || 'Unknown Lokasi',
      sektor: machine.sektorBCA || 'Unknown',
      wilayah: machine.wilayahOperasional || 'ABACUS JAKARTA',
      vendor: machine.vendor && machine.vendor !== '-' ? machine.vendor : 'Vendor BCA',
      jenisMesin: machine.jenisMesin || 'ATM',
      latestPeriode: isAll ? 'ALL' : normActivePeriode,
      latestUptime: health.currentUptime,
      priority,
      priorityReason: health.primaryReason,
      reasons: health.reasons,
      isChronic: health.isChronicCritical || health.isChronicWarning,
      consecutiveLowMonths: health.consecutiveLowMonths,
      dominantProblem: health.dominantProblem,
      problemDetails: {
        hw: refMonthData ? Number(refMonthData.hw) || 0 : 0,
        uh: refMonthData ? Number(refMonthData.uh) || 0 : 0,
        kom: refMonthData ? Number(refMonthData.kom) || 0 : 0,
        up: refMonthData ? Number(refMonthData.up) || 0 : 0,
        ll: refMonthData ? Number(refMonthData.ll) || 0 : 0,
        topHwModule: topModule,
        topHwModulePct: topModulePct
      },
      trend
    });
  });

  // Urutkan rekomendasi: CRITICAL duluan, kemudian berdasarkan uptime terendah
  return recommendations.sort((a, b) => {
    if (a.priority === 'CRITICAL' && b.priority !== 'CRITICAL') return -1;
    if (a.priority !== 'CRITICAL' && b.priority === 'CRITICAL') return 1;
    return a.latestUptime - b.latestUptime;
  });
};

/**
 * Mengevaluasi perkembangan tiket tindak lanjut (Before vs After)
 * membandingkan Uptime saat tiket dibuat vs Uptime bulan-bulan berikutnya
 */
export const evaluateTicketProgress = (
  ticket: FollowUpTicket,
  machine?: MachineData,
  allAvailablePeriodes: string[] = []
): TicketProgressEvaluation => {
  const baselinePeriode = normalizePeriode(ticket.periodeProblem);
  const baselineUptime = Number(ticket.uptimeBaseline) || 0;

  if (!machine || !machine.monthlyData || machine.monthlyData.length === 0) {
    return {
      ticketId: ticket.id,
      wsid: ticket.wsid,
      baselinePeriode,
      baselineUptime,
      latestPeriode: baselinePeriode,
      latestUptime: baselineUptime,
      deltaUptime: 0,
      evaluationStatus: 'PENDING_DATA',
      statusLabel: 'Menunggu Data Mesin',
      statusColor: 'slate',
      recommendationNote: 'Data historis performa mesin belum tersedia.'
    };
  }

  // Cari bulan-bulan setelah baseline
  const sortedPeriods = allAvailablePeriodes.map(normalizePeriode).sort();
  const laterPeriods = sortedPeriods.filter(p => p.localeCompare(baselinePeriode) > 0);

  if (laterPeriods.length === 0) {
    return {
      ticketId: ticket.id,
      wsid: ticket.wsid,
      baselinePeriode,
      baselineUptime,
      latestPeriode: baselinePeriode,
      latestUptime: baselineUptime,
      deltaUptime: 0,
      evaluationStatus: 'PENDING_DATA',
      statusLabel: 'Menunggu Data Bulan Baru',
      statusColor: 'slate',
      recommendationNote: 'Belum ada data Uptime bulan setelah periode tindakan. Akan dievaluasi otomatis saat file bulan berikutnya di-upload.'
    };
  }

  // Ambil bulan terbaru yang tersedia
  const latestPeriode = laterPeriods[laterPeriods.length - 1];
  const latestMonthData = machine.monthlyData.find(m => normalizePeriode(m.periode) === latestPeriode);

  if (!latestMonthData) {
    return {
      ticketId: ticket.id,
      wsid: ticket.wsid,
      baselinePeriode,
      baselineUptime,
      latestPeriode,
      latestUptime: 0,
      deltaUptime: 0,
      evaluationStatus: 'PENDING_DATA',
      statusLabel: 'Data Bulan Baru Belum Ada',
      statusColor: 'slate',
      recommendationNote: `Mesin tidak tercatat di file periode ${latestPeriode}.`
    };
  }

  const latestUptime = Number(Math.max(0, 100 - (Number(latestMonthData.total) || 0)).toFixed(2));
  const deltaUptime = Number((latestUptime - baselineUptime).toFixed(2));

  const targetSla = getTargetSla(machine?.jenisMesin);

  // Tentukan status evaluasi
  if (latestUptime >= targetSla) {
    return {
      ticketId: ticket.id,
      wsid: ticket.wsid,
      baselinePeriode,
      baselineUptime,
      latestPeriode,
      latestUptime,
      deltaUptime,
      evaluationStatus: 'RESOLVED_SUCCESS',
      statusLabel: 'Membaik (Target SLA Tercapai)',
      statusColor: 'green',
      recommendationNote: `Uptime naik menjadi ${latestUptime}% (Target SLA >= ${targetSla}% tercapai). Tiket dapat ditutup (CLOSED).`
    };
  } else if (deltaUptime >= 1.0) {
    return {
      ticketId: ticket.id,
      wsid: ticket.wsid,
      baselinePeriode,
      baselineUptime,
      latestPeriode,
      latestUptime,
      deltaUptime,
      evaluationStatus: 'IMPROVING',
      statusLabel: 'Progres Positif (Pantau)',
      statusColor: 'yellow',
      recommendationNote: `Ada peningkatan performa (+${deltaUptime}%), namun masih di bawah target SLA (${targetSla}%). Pertahankan monitoring.`
    };
  } else if (deltaUptime <= 0) {
    return {
      ticketId: ticket.id,
      wsid: ticket.wsid,
      baselinePeriode,
      baselineUptime,
      latestPeriode,
      latestUptime,
      deltaUptime,
      evaluationStatus: 'STAGNANT',
      statusLabel: 'Stagnan / Belum Membaik',
      statusColor: 'red',
      recommendationNote: `Tindakan belum membuahkan hasil (Uptime ${latestUptime}%). Diperlukan eskalasi ke Vendor atau supervisi ulang.`
    };
  } else {
    return {
      ticketId: ticket.id,
      wsid: ticket.wsid,
      baselinePeriode,
      baselineUptime,
      latestPeriode,
      latestUptime,
      deltaUptime,
      evaluationStatus: 'MONITORING',
      statusLabel: 'Dalam Pemantauan',
      statusColor: 'blue',
      recommendationNote: `Performa relatif stabil (${latestUptime}%). Lanjutkan observasi tindakan.`
    };
  }
};
