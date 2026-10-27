import type { MachineData } from '../store/useDataStore';
import { normalizePeriode } from './comprehensiveExporter';

export const SLA_TARGETS = {
  ATM: 99.00,
  CRM: 98.50
} as const;

export const WARNING_THRESHOLDS = {
  ATM: 98.50,
  CRM: 98.00
} as const;

export const SPIKE_THRESHOLDS = {
  KOM: 0.30,
  UP: 0.50, // Khusus CRM
  UH: 0.30,
  HW: 1.00
} as const;

export type MachineHealthStatus = 'SAFE' | 'WARNING' | 'CRITICAL';

export interface MachineHealthEvaluation {
  status: MachineHealthStatus;
  statusLabel: 'Aman' | 'Warning' | 'Kritis';
  badgeColor: string; // Tailwind classes
  textColor: string;
  borderColor: string;
  bgColor: string;
  targetSla: number;
  warningThreshold: number;
  currentUptime: number;
  currentDowntime: number;
  consecutiveLowMonths: number;
  isChronicWarning: boolean; // 2 bulan berturut-turut di bawah SLA
  isChronicCritical: boolean; // > 2 bulan berturut-turut di bawah SLA
  primaryReason: string;
  reasons: string[];
  dominantProblem: string;
  hasSpike: boolean;
  spikeDetails: string[];
}

export function getTargetSla(jenisMesin?: string): number {
  const j = (jenisMesin || '').trim().toUpperCase();
  return (j === 'CRM' || j === 'ATS') ? SLA_TARGETS.CRM : SLA_TARGETS.ATM;
}

export function getWarningThreshold(jenisMesin?: string): number {
  const j = (jenisMesin || '').trim().toUpperCase();
  return (j === 'CRM' || j === 'ATS') ? WARNING_THRESHOLDS.CRM : WARNING_THRESHOLDS.ATM;
}

/**
 * Mengevaluasi kesehatan performa mesin berdasarkan aturan SLA BCA:
 * 1. Target SLA: ATM 99.00%, CRM 98.50%
 * 2. Ambang Kritis: ATM < 98.50%, CRM < 98.00%
 * 3. Chronic Machine:
 *    - 2 Bulan berturut-turut di bawah SLA => Warning (Zona Waspada 2 Bulan)
 *    - Lebih dari 2 Bulan berturut-turut di bawah SLA (> 2 Bulan) => Otomatis Kritis
 * 4. Problem Spikes (Lonjakan Masalah):
 *    - Komunikasi (KOM) > 0.30%
 *    - Uang Penuh (UP CRM) > 0.50%
 *    - Uang Habis (UH) > 0.30%
 *    - Hardware (H/W) > 1.00%
 */
export function evaluateMachineHealth(
  machine: MachineData,
  selectedPeriode?: string
): MachineHealthEvaluation {
  const isCrm = (machine.jenisMesin || '').trim().toUpperCase() === 'CRM' || 
                (machine.jenisMesin || '').trim().toUpperCase() === 'ATS';
  const targetSla = isCrm ? SLA_TARGETS.CRM : SLA_TARGETS.ATM;
  const warningThreshold = isCrm ? WARNING_THRESHOLDS.CRM : WARNING_THRESHOLDS.ATM;

  const history = [...(machine.monthlyData || [])].sort((a, b) => 
    normalizePeriode(a.periode).localeCompare(normalizePeriode(b.periode))
  );

  const isAll = !selectedPeriode || selectedPeriode === 'ALL';

  // ==========================================
  // KASUS 1: PERIODE 'ALL' (AGREGAT SELURUH BULAN)
  // ==========================================
  if (isAll) {
    if (history.length === 0) {
      return {
        status: 'SAFE',
        statusLabel: 'Aman',
        badgeColor: 'bg-emerald-100 text-emerald-800 border-emerald-300',
        textColor: 'text-emerald-700',
        borderColor: 'border-emerald-500',
        bgColor: 'bg-emerald-50',
        targetSla,
        warningThreshold,
        currentUptime: 100,
        currentDowntime: 0,
        consecutiveLowMonths: 0,
        isChronicWarning: false,
        isChronicCritical: false,
        primaryReason: `Memenuhi Target SLA (${targetSla}%)`,
        reasons: [],
        dominantProblem: '-',
        hasSpike: false,
        spikeDetails: []
      };
    }

    // Hitung rata-rata downtime & problem seluruh bulan
    let sumDt = 0;
    let sumHw = 0;
    let sumUh = 0;
    let sumKom = 0;
    let sumUp = 0;
    let sumLl = 0;

    let maxConsecutiveLow = 0;
    let currentConsecutiveLow = 0;
    const spikeDetails: string[] = [];

    history.forEach(h => {
      const dt = Number(h.total) || 0;
      const up = 100 - dt;
      sumDt += dt;
      sumHw += Number(h.hw) || 0;
      sumUh += Number(h.uh) || 0;
      sumKom += Number(h.kom) || 0;
      sumUp += Number(h.up) || 0;
      sumLl += Number(h.ll) || 0;

      if (up < targetSla) {
        currentConsecutiveLow++;
        if (currentConsecutiveLow > maxConsecutiveLow) {
          maxConsecutiveLow = currentConsecutiveLow;
        }
      } else {
        currentConsecutiveLow = 0;
      }

      // Deteksi spike pada masing-masing bulan
      const kom = Number(h.kom) || 0;
      const upM = Number(h.up) || 0;
      const uh = Number(h.uh) || 0;
      const hw = Number(h.hw) || 0;
      const pLabel = h.periode;

      if (kom > SPIKE_THRESHOLDS.KOM) {
        spikeDetails.push(`Lonjakan Komunikasi (${pLabel}): ${kom.toFixed(2)}% (> ${SPIKE_THRESHOLDS.KOM}%)`);
      }
      if (isCrm && upM > SPIKE_THRESHOLDS.UP) {
        spikeDetails.push(`Lonjakan Uang Penuh (${pLabel}): ${upM.toFixed(2)}% (> ${SPIKE_THRESHOLDS.UP}%)`);
      }
      if (uh > SPIKE_THRESHOLDS.UH) {
        spikeDetails.push(`Lonjakan Uang Habis (${pLabel}): ${uh.toFixed(2)}% (> ${SPIKE_THRESHOLDS.UH}%)`);
      }
      if (hw > SPIKE_THRESHOLDS.HW) {
        spikeDetails.push(`Lonjakan Hardware (${pLabel}): ${hw.toFixed(2)}% (> ${SPIKE_THRESHOLDS.HW}%)`);
      }
    });

    const monthCount = history.length;
    const avgDtTotal = Number((sumDt / monthCount).toFixed(2));
    const currentUptime = Number(Math.max(0, 100 - avgDtTotal).toFixed(2));
    const avgHw = sumHw / monthCount;
    const avgUh = sumUh / monthCount;
    const avgKom = sumKom / monthCount;
    const avgUp = sumUp / monthCount;
    const avgLl = sumLl / monthCount;

    let dominantProblem = 'Total Downtime';
    const maxProblem = Math.max(avgHw, avgUh, avgKom, avgUp, avgLl);
    if (maxProblem > 0) {
      if (maxProblem === avgHw) dominantProblem = `Hardware (${avgHw.toFixed(2)}%)`;
      else if (maxProblem === avgUh) dominantProblem = `Uang Habis (${avgUh.toFixed(2)}%)`;
      else if (maxProblem === avgKom) dominantProblem = `Komunikasi (${avgKom.toFixed(2)}%)`;
      else if (maxProblem === avgUp) dominantProblem = `Uang Penuh (${avgUp.toFixed(2)}%)`;
      else dominantProblem = `Lain-lain (${avgLl.toFixed(2)}%)`;
    }

    const isChronicWarning = maxConsecutiveLow === 2;
    const isChronicCritical = maxConsecutiveLow > 2;
    const hasSpike = spikeDetails.length > 0;

    const reasons: string[] = [];
    let status: MachineHealthStatus = 'SAFE';

    // 1. Evaluasi Kritis
    if (currentUptime < warningThreshold) {
      status = 'CRITICAL';
      reasons.push(`Rata-rata Uptime Kritis: ${currentUptime}% (< ${warningThreshold.toFixed(2)}%)`);
    } else if (isChronicCritical) {
      status = 'CRITICAL';
      reasons.push(`Mesin Kronis (> 2 Bulan): ${maxConsecutiveLow} Bulan berturut-turut di bawah SLA (${targetSla}%)`);
    }

    // 2. Evaluasi Warning (jika belum Kritis)
    if (status !== 'CRITICAL') {
      if (isChronicWarning) {
        status = 'WARNING';
        reasons.push(`Mesin Kronis (Waspada 2 Bulan): 2 Bulan berturut-turut di bawah SLA (${targetSla}%)`);
      } else if (currentUptime < targetSla) {
        status = 'WARNING';
        reasons.push(`Rata-rata Uptime di bawah Target SLA (${targetSla}%): ${currentUptime}%`);
      }

      if (hasSpike) {
        status = 'WARNING';
        spikeDetails.slice(0, 3).forEach(s => reasons.push(s));
      }
    } else {
      if (isChronicCritical && !reasons.some(r => r.includes('Mesin Kronis'))) {
        reasons.push(`Mesin Kronis (> 2 Bulan): ${maxConsecutiveLow} Bulan berturut-turut di bawah SLA`);
      }
      if (hasSpike) {
        spikeDetails.slice(0, 2).forEach(s => reasons.push(s));
      }
    }

    if (status === 'SAFE') {
      reasons.push(`Performa Prima (Rata-rata Uptime ${currentUptime}% Memenuhi Target SLA ${targetSla}%)`);
    }

    const primaryReason = reasons[0] || `Status ${status}`;

    let statusLabel: 'Aman' | 'Warning' | 'Kritis' = 'Aman';
    let badgeColor = 'bg-emerald-100 text-emerald-800 border-emerald-200';
    let textColor = 'text-emerald-700';
    let borderColor = 'border-emerald-500';
    let bgColor = 'bg-emerald-50';

    if (status === 'CRITICAL') {
      statusLabel = 'Kritis';
      badgeColor = 'bg-red-100 text-red-800 border-red-300';
      textColor = 'text-red-700';
      borderColor = 'border-red-500';
      bgColor = 'bg-red-50';
    } else if (status === 'WARNING') {
      statusLabel = 'Warning';
      badgeColor = 'bg-amber-100 text-amber-800 border-amber-300';
      textColor = 'text-amber-700';
      borderColor = 'border-amber-500';
      bgColor = 'bg-amber-50';
    }

    return {
      status,
      statusLabel,
      badgeColor,
      textColor,
      borderColor,
      bgColor,
      targetSla,
      warningThreshold,
      currentUptime,
      currentDowntime: avgDtTotal,
      consecutiveLowMonths: maxConsecutiveLow,
      isChronicWarning,
      isChronicCritical,
      primaryReason,
      reasons,
      dominantProblem,
      hasSpike,
      spikeDetails
    };
  }

  // ==========================================
  // KASUS 2: PERIODE SPESIFIK (BULAN TERTENTU)
  // ==========================================
  const norm = normalizePeriode(selectedPeriode);
  const targetIdx = history.findIndex(h => normalizePeriode(h.periode) === norm);

  // Jika mesin tidak memiliki data pada bulan spesifik tersebut
  if (targetIdx === -1) {
    return {
      status: 'SAFE',
      statusLabel: 'Aman',
      badgeColor: 'bg-emerald-100 text-emerald-800 border-emerald-300',
      textColor: 'text-emerald-700',
      borderColor: 'border-emerald-500',
      bgColor: 'bg-emerald-50',
      targetSla,
      warningThreshold,
      currentUptime: 100,
      currentDowntime: 0,
      consecutiveLowMonths: 0,
      isChronicWarning: false,
      isChronicCritical: false,
      primaryReason: `Tidak Ada Downtime Tercatat pada Periode Ini`,
      reasons: [`Performa Prima pada periode ${norm}`],
      dominantProblem: '-',
      hasSpike: false,
      spikeDetails: []
    };
  }

  const current = history[targetIdx];
  const dtTotal = Number(current.total) || 0;
  const currentUptime = Number(Math.max(0, 100 - dtTotal).toFixed(2));

  // Hitung bulan berturut-turut di bawah target SLA hingga bulan terpilih
  let consecutiveLow = 0;
  for (let i = targetIdx; i >= 0; i--) {
    const mDt = Number(history[i].total) || 0;
    const mUp = 100 - mDt;
    if (mUp < targetSla) {
      consecutiveLow++;
    } else {
      break;
    }
  }

  const isChronicWarning = consecutiveLow === 2;
  const isChronicCritical = consecutiveLow > 2;

  const hw = Number(current.hw) || 0;
  const uh = Number(current.uh) || 0;
  const kom = Number(current.kom) || 0;
  const up = Number(current.up) || 0;
  const ll = Number(current.ll) || 0;

  let dominantProblem = 'Total Downtime';
  const maxProblem = Math.max(hw, uh, kom, up, ll);
  if (maxProblem > 0) {
    if (maxProblem === hw) dominantProblem = `Hardware (${hw.toFixed(2)}%)`;
    else if (maxProblem === uh) dominantProblem = `Uang Habis (${uh.toFixed(2)}%)`;
    else if (maxProblem === kom) dominantProblem = `Komunikasi (${kom.toFixed(2)}%)`;
    else if (maxProblem === up) dominantProblem = `Uang Penuh (${up.toFixed(2)}%)`;
    else dominantProblem = `Lain-lain (${ll.toFixed(2)}%)`;
  }

  const spikeDetails: string[] = [];
  if (kom > SPIKE_THRESHOLDS.KOM) {
    spikeDetails.push(`Lonjakan Komunikasi / Jaringan: ${kom.toFixed(2)}% (> ${SPIKE_THRESHOLDS.KOM}%)`);
  }
  if (isCrm && up > SPIKE_THRESHOLDS.UP) {
    spikeDetails.push(`Lonjakan Uang Penuh / Cassette Full: ${up.toFixed(2)}% (> ${SPIKE_THRESHOLDS.UP}%)`);
  }
  if (uh > SPIKE_THRESHOLDS.UH) {
    spikeDetails.push(`Lonjakan Uang Habis / Replenishment: ${uh.toFixed(2)}% (> ${SPIKE_THRESHOLDS.UH}%)`);
  }
  if (hw > SPIKE_THRESHOLDS.HW) {
    spikeDetails.push(`Lonjakan Hardware: ${hw.toFixed(2)}% (> ${SPIKE_THRESHOLDS.HW}%)`);
  }
  const hasSpike = spikeDetails.length > 0;

  const reasons: string[] = [];
  let status: MachineHealthStatus = 'SAFE';

  // 1. Evaluasi Kritis
  if (currentUptime < warningThreshold) {
    status = 'CRITICAL';
    reasons.push(`Uptime Kritis: ${currentUptime}% (< ${warningThreshold.toFixed(2)}%)`);
  } else if (isChronicCritical) {
    status = 'CRITICAL';
    reasons.push(`Mesin Kronis (> 2 Bulan): ${consecutiveLow} Bulan berturut-turut di bawah SLA (${targetSla}%)`);
  }

  // 2. Evaluasi Warning (jika belum Kritis)
  if (status !== 'CRITICAL') {
    if (isChronicWarning) {
      status = 'WARNING';
      reasons.push(`Mesin Kronis (Waspada 2 Bulan): 2 Bulan berturut-turut di bawah SLA (${targetSla}%)`);
    } else if (currentUptime < targetSla) {
      status = 'WARNING';
      reasons.push(`Uptime di bawah Target SLA (${targetSla}%): ${currentUptime}%`);
    }

    if (hasSpike) {
      status = 'WARNING';
      spikeDetails.forEach(s => reasons.push(s));
    }
  } else {
    if (isChronicCritical && !reasons.some(r => r.includes('Mesin Kronis'))) {
      reasons.push(`Mesin Kronis (> 2 Bulan): ${consecutiveLow} Bulan berturut-turut di bawah SLA`);
    }
    if (hasSpike) {
      spikeDetails.forEach(s => reasons.push(s));
    }
  }

  if (status === 'SAFE') {
    reasons.push(`Performa Prima (Memenuhi Target SLA ${targetSla}%)`);
  }

  const primaryReason = reasons[0] || `Status ${status}`;

  let statusLabel: 'Aman' | 'Warning' | 'Kritis' = 'Aman';
  let badgeColor = 'bg-emerald-100 text-emerald-800 border-emerald-200';
  let textColor = 'text-emerald-700';
  let borderColor = 'border-emerald-500';
  let bgColor = 'bg-emerald-50';

  if (status === 'CRITICAL') {
    statusLabel = 'Kritis';
    badgeColor = 'bg-red-100 text-red-800 border-red-300';
    textColor = 'text-red-700';
    borderColor = 'border-red-500';
    bgColor = 'bg-red-50';
  } else if (status === 'WARNING') {
    statusLabel = 'Warning';
    badgeColor = 'bg-amber-100 text-amber-800 border-amber-300';
    textColor = 'text-amber-700';
    borderColor = 'border-amber-500';
    bgColor = 'bg-amber-50';
  }

  return {
    status,
    statusLabel,
    badgeColor,
    textColor,
    borderColor,
    bgColor,
    targetSla,
    warningThreshold,
    currentUptime,
    currentDowntime: dtTotal,
    consecutiveLowMonths: consecutiveLow,
    isChronicWarning,
    isChronicCritical,
    primaryReason,
    reasons,
    dominantProblem,
    hasSpike,
    spikeDetails
  };
}
