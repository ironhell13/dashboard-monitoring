import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDataStore, type MachineData } from '../store/useDataStore';
import { 
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer 
} from 'recharts';
import { 
  BarChart3, TrendingUp, PieChart as PieIcon,
  Layers, MapPin, Server, Download, Info, CheckCircle2, AlertTriangle, Cpu,
  ShieldAlert, ArrowRight, Activity, ChevronDown, ChevronUp
} from 'lucide-react';
import { exportDashboardExcel, SERVICE_POINT_MAP, getServicePointName, formatBulanTahun } from '../utils/comprehensiveExporter';
import { cleanSektorName } from '../utils/dailyIncidentParser';
import { 
  evaluateMachineHealth, 
  SPIKE_THRESHOLDS 
} from '../utils/slaHelper';

function formatPeriodLabel(periode: string) {
  if (!periode || periode === 'ALL') return 'Semua Bulan';
  return formatBulanTahun(periode);
}

type GroupByDimension = 'SERVICE_POINT' | 'SEKTOR';
type MetricType = 'uptime' | 'total_downtime' | 'uh' | 'kom' | 'up' | 'hw' | 'll' | 'all_problems';
type ChartType = 'bar' | 'trend' | 'donut';

interface AggregatedUnit {
  id: string;
  name: string;
  servicePoint: string;
  machineCount: number;
  bcaCount: number;
  nonBcaCount: number;
  uptime: number;
  downtimeTotal: number;
  uh: number;
  kom: number;
  up: number;
  hw: number;
  ll: number;
  dominantProblem: string;
}

const PROBLEM_COLORS = {
  uh: '#f59e0b', // Amber
  kom: '#3b82f6', // Blue
  up: '#ec4899', // Pink
  hw: '#ef4444', // Red
  ll: '#8b5cf6', // Violet
};

export default function DashboardPage() {
  const navigate = useNavigate();
  const { 
    machines, 
    availablePeriodes, 
    selectedPeriode, 
    setSelectedPeriode, 
    selectedKlien, 
    selectedJenisMesin 
  } = useDataStore();

  // Control States
  const [groupBy, setGroupBy] = useState<GroupByDimension>('SERVICE_POINT');
  const [metric, setMetric] = useState<MetricType>('uptime');
  const [monthRange, setMonthRange] = useState<string>(selectedPeriode || 'ALL');
  const [filterServicePoint, setFilterServicePoint] = useState<string>('ALL');
  const [chartType, setChartType] = useState<ChartType>('bar');
  const [isHealthDetailOpen, setIsHealthDetailOpen] = useState(false);

  // Synchronize local monthRange with global selectedPeriode
  useEffect(() => {
    if (selectedPeriode && selectedPeriode !== monthRange) {
      setMonthRange(selectedPeriode);
    }
  }, [selectedPeriode]);

  // Sorted list of all available periods in chronological order
  const sortedPeriods = useMemo(() => {
    return [...availablePeriodes].sort();
  }, [availablePeriodes]);

  // Determine active periods based on monthRange filter
  const activePeriods = useMemo(() => {
    if (sortedPeriods.length === 0) return [];
    if (monthRange === 'ALL') return sortedPeriods;
    if (monthRange === '1') return sortedPeriods.slice(-1);
    if (monthRange === '3') return sortedPeriods.slice(-3);
    if (monthRange === '6') return sortedPeriods.slice(-6);
    // Specific month
    return sortedPeriods.filter(p => p === monthRange);
  }, [sortedPeriods, monthRange]);

  // Active machines filtered by global Klien & Jenis Mesin
  const filteredMachines = useMemo(() => {
    return machines.filter(m => {
      if (m.statusAktif?.trim().toUpperCase() !== 'AKTIF') return false;
      if (selectedKlien !== 'ALL' && m.klienStatus !== selectedKlien) return false;
      if (selectedJenisMesin !== 'ALL' && m.jenisMesin !== selectedJenisMesin) return false;
      return true;
    });
  }, [machines, selectedKlien, selectedJenisMesin]);

  // Extract list of all Service Points
  const servicePointOptions = useMemo(() => {
    const spSet = new Set<string>();
    filteredMachines.forEach(m => {
      const sp = getServicePointName(m.sektorBCA, m.wilayahOperasional);
      if (sp && sp !== 'Unknown Service Point' && !sp.startsWith('Unknown')) {
        spSet.add(sp);
      }
    });
    return Array.from(spSet).sort();
  }, [filteredMachines]);

  // Aggregate Data by Group Dimension (Service Point or Sektor) across active periods
  const aggregatedData: AggregatedUnit[] = useMemo(() => {
    if (filteredMachines.length === 0) return [];

    const map = new Map<string, {
      name: string;
      servicePoint: string;
      machines: MachineData[];
    }>();

    filteredMachines.forEach(m => {
      const spName = getServicePointName(m.sektorBCA, m.wilayahOperasional);

      let key = spName;
      let displayName = spName;

      if (groupBy === 'SEKTOR') {
        // Filter by specific Service Point if chosen
        if (filterServicePoint !== 'ALL' && spName !== filterServicePoint) {
          return;
        }
        const clean = cleanSektorName(m.sektorBCA);
        const sektorName = clean !== '-' ? clean : (m.sektorBCA || 'Unknown Sektor');
        key = `${spName}:::${sektorName}`;
        displayName = sektorName;
      }

      if (!map.has(key)) {
        map.set(key, { name: displayName, servicePoint: spName, machines: [] });
      }
      map.get(key)!.machines.push(m);
    });

    const result: AggregatedUnit[] = Array.from(map.entries()).map(([key, item]) => {
      const totalMachines = item.machines.length;
      const bcaMachines = item.machines.filter(m => m.klienStatus === 'BCA');
      const bcaCount = bcaMachines.length;
      const nonBcaCount = totalMachines - bcaCount;

      let sumUptime = 0;
      let sumDowntime = 0;
      let sumUh = 0;
      let sumKom = 0;
      let sumUp = 0;
      let sumHw = 0;
      let sumLl = 0;
      let machineCountWithData = 0;

      // HANYA menghitung mesin BCA untuk metrik performa (Uptime/Downtime/Problem)
      bcaMachines.forEach(m => {
        // Filter monthly data by active periods
        const months = m.monthlyData.filter(d => activePeriods.includes(d.periode));
        if (months.length > 0) {
          machineCountWithData++;
          const mDown = months.reduce((acc, curr) => acc + (curr.total || 0), 0) / months.length;
          const mUh = months.reduce((acc, curr) => acc + (curr.uh || 0), 0) / months.length;
          const mKom = months.reduce((acc, curr) => acc + (curr.kom || 0), 0) / months.length;
          const mUp = months.reduce((acc, curr) => acc + (curr.up || 0), 0) / months.length;
          const mHw = months.reduce((acc, curr) => acc + (curr.hw || 0), 0) / months.length;
          const mLl = months.reduce((acc, curr) => acc + (curr.ll || 0), 0) / months.length;

          sumDowntime += mDown;
          sumUh += mUh;
          sumKom += mKom;
          sumUp += mUp;
          sumHw += mHw;
          sumLl += mLl;
          sumUptime += Math.max(0, 100 - mDown);
        } else {
          // If no month data in period, default uptime 100%
          sumUptime += 100;
        }
      });

      const denom = bcaCount || 1;
      const avgDowntime = bcaCount > 0 ? sumDowntime / denom : 0;
      const avgUptime = bcaCount > 0 ? sumUptime / denom : 100;
      const avgUh = bcaCount > 0 ? sumUh / denom : 0;
      const avgKom = bcaCount > 0 ? sumKom / denom : 0;
      const avgUp = bcaCount > 0 ? sumUp / denom : 0;
      const avgHw = bcaCount > 0 ? sumHw / denom : 0;
      const avgLl = bcaCount > 0 ? sumLl / denom : 0;

      // Find dominant problem
      const problems = [
        { name: 'Hardware (H/W)', val: avgHw },
        { name: 'Uang Habis (UH)', val: avgUh },
        { name: 'Komunikasi (KOM)', val: avgKom },
        { name: 'Uang Penuh (UP)', val: avgUp },
        { name: 'Lain-lain (LL)', val: avgLl },
      ].sort((a, b) => b.val - a.val);
      const dominantProblem = problems[0].val > 0 ? problems[0].name : 'Normal (0%)';

      return {
        id: key,
        name: item.name,
        servicePoint: item.servicePoint,
        machineCount: totalMachines,
        bcaCount,
        nonBcaCount,
        uptime: Number(avgUptime.toFixed(2)),
        downtimeTotal: Number(avgDowntime.toFixed(2)),
        uh: Number(avgUh.toFixed(2)),
        kom: Number(avgKom.toFixed(2)),
        up: Number(avgUp.toFixed(2)),
        hw: Number(avgHw.toFixed(2)),
        ll: Number(avgLl.toFixed(2)),
        dominantProblem,
      };
    });

    // Default sort: if metric is uptime, sort descending; if downtime/problem, sort descending (worst first)
    return result.sort((a, b) => {
      if (metric === 'uptime') return b.uptime - a.uptime;
      if (metric === 'total_downtime') return b.downtimeTotal - a.downtimeTotal;
      if (metric === 'all_problems') return b.downtimeTotal - a.downtimeTotal;
      return (b[metric] as number) - (a[metric] as number);
    });
  }, [filteredMachines, groupBy, filterServicePoint, activePeriods, metric]);

  // Monthly Trend Data for Line/Area chart
  const monthlyTrendData = useMemo(() => {
    if (activePeriods.length === 0 || filteredMachines.length === 0) return [];

    return activePeriods.map(periode => {
      const pointData: Record<string, any> = {
        periode: formatPeriodLabel(periode),
        rawPeriode: periode,
      };

      // Calculate for top units or selected unit
      const unitsToTrack = aggregatedData.slice(0, 6);
      unitsToTrack.forEach(unit => {
        const unitMachines = filteredMachines.filter(m => {
          if (m.klienStatus !== 'BCA') return false;
          if (groupBy === 'SERVICE_POINT') {
            const sp = getServicePointName(m.sektorBCA, m.wilayahOperasional);
            return sp === unit.name;
          } else {
            const clean = cleanSektorName(m.sektorBCA);
            const sektorName = clean !== '-' ? clean : (m.sektorBCA || 'Unknown Sektor');
            return sektorName === unit.name;
          }
        });

        let totalDown = 0;
        let count = 0;
        unitMachines.forEach(m => {
          const pData = m.monthlyData.find(d => d.periode === periode);
          if (pData) {
            count++;
            if (metric === 'uptime') totalDown += (pData.total || 0);
            else if (metric === 'total_downtime') totalDown += (pData.total || 0);
            else if (metric === 'all_problems') totalDown += (pData.total || 0);
            else totalDown += ((pData as any)[metric] || 0);
          }
        });

        const denom = count || 1;
        const avgDown = totalDown / denom;
        const val = metric === 'uptime' ? Math.max(0, 100 - avgDown) : avgDown;
        pointData[unit.name] = Number(val.toFixed(2));
      });

      return pointData;
    });
  }, [activePeriods, filteredMachines, aggregatedData, groupBy, metric]);

  // Overall Problem Distribution (for Donut Chart)
  const problemDistribution = useMemo(() => {
    if (aggregatedData.length === 0) return [];
    const totalUh = aggregatedData.reduce((sum, u) => sum + u.uh, 0);
    const totalKom = aggregatedData.reduce((sum, u) => sum + u.kom, 0);
    const totalUp = aggregatedData.reduce((sum, u) => sum + u.up, 0);
    const totalHw = aggregatedData.reduce((sum, u) => sum + u.hw, 0);
    const totalLl = aggregatedData.reduce((sum, u) => sum + u.ll, 0);

    return [
      { name: 'Hardware (H/W)', value: Number(totalHw.toFixed(2)), color: PROBLEM_COLORS.hw },
      { name: 'Uang Habis (UH)', value: Number(totalUh.toFixed(2)), color: PROBLEM_COLORS.uh },
      { name: 'Komunikasi (KOM)', value: Number(totalKom.toFixed(2)), color: PROBLEM_COLORS.kom },
      { name: 'Uang Penuh (UP)', value: Number(totalUp.toFixed(2)), color: PROBLEM_COLORS.up },
      { name: 'Lain-lain (LL)', value: Number(totalLl.toFixed(2)), color: PROBLEM_COLORS.ll },
    ].filter(p => p.value > 0);
  }, [aggregatedData]);

  // Global KPIs
  const kpis = useMemo(() => {
    if (aggregatedData.length === 0) {
      return { avgUptime: 0, avgDowntime: 0, bestUnit: '-', worstUnit: '-', worstProblem: '-' };
    }
    const totalUptime = aggregatedData.reduce((s, u) => s + u.uptime, 0) / aggregatedData.length;
    const totalDowntime = aggregatedData.reduce((s, u) => s + u.downtimeTotal, 0) / aggregatedData.length;
    
    // Sort by uptime for best/worst
    const byUptime = [...aggregatedData].sort((a, b) => b.uptime - a.uptime);
    const best = byUptime[0];
    const worst = byUptime[byUptime.length - 1];

    return {
      avgUptime: Number(totalUptime.toFixed(2)),
      avgDowntime: Number(totalDowntime.toFixed(2)),
      bestUnit: `${best.name} (${best.uptime}%)`,
      worstUnit: `${worst.name} (${worst.downtimeTotal}%)`,
      worstProblem: worst.dominantProblem,
    };
  }, [aggregatedData]);

  // Active period for machine health analysis: follows monthRange or selected period
  const activeHealthPeriod = useMemo(() => {
    if (monthRange === 'ALL') return 'ALL';
    if (monthRange.length === 7) return monthRange; // e.g. 'YYYY-MM'
    if (activePeriods.length === 0) return 'ALL';
    return activePeriods[activePeriods.length - 1];
  }, [activePeriods, monthRange]);

  // Comprehensive Machine Health Analysis based on BCA SLA & Chronic rules
  const healthAnalysis = useMemo(() => {
    let safeCount = 0;
    let warningCount = 0;
    let criticalCount = 0;
    let chronicWarningCount = 0;
    let chronicCriticalCount = 0;
    
    // Standardized categories: Mesin Kronis, Problem Spikes, and SLA standards
    const categoryDefinitions: Record<string, {
      label: string;
      category: 'CHRONIC' | 'SPIKE' | 'SLA';
      status: 'CRITICAL' | 'WARNING';
      description: string;
    }> = {
      CHRONIC_CRITICAL: {
        label: 'Mesin Kronis Kritis (> 2 Bulan)',
        category: 'CHRONIC',
        status: 'CRITICAL',
        description: 'Bermasalah di bawah target SLA > 2 bulan berturut-turut (otomatis eskalasi Kritis)'
      },
      CHRONIC_WARNING: {
        label: 'Mesin Kronis Waspada (2 Bulan)',
        category: 'CHRONIC',
        status: 'WARNING',
        description: 'Bermasalah di bawah target SLA selama 2 bulan berturut-turut (zona waspada)'
      },
      SPIKE_HW: {
        label: 'Problem Hardware (H/W)',
        category: 'SPIKE',
        status: 'CRITICAL',
        description: `Downtime modul fisik / Hardware melampaui ambang batas ${SPIKE_THRESHOLDS.HW}%`
      },
      SPIKE_KOM: {
        label: 'Problem Jaringan & Komunikasi (KOM)',
        category: 'SPIKE',
        status: 'WARNING',
        description: `Downtime Komunikasi (KOM) melampaui ambang batas ${SPIKE_THRESHOLDS.KOM}%`
      },
      SPIKE_UH: {
        label: 'Problem Uang Habis (UH)',
        category: 'SPIKE',
        status: 'WARNING',
        description: `Downtime Uang Habis melampaui ${SPIKE_THRESHOLDS.UH}% (replenishment kas CIT)`
      },
      SPIKE_UP: {
        label: 'Problem Uang Penuh (UP CRM)',
        category: 'SPIKE',
        status: 'CRITICAL',
        description: `Downtime Uang Penuh melampaui ${SPIKE_THRESHOLDS.UP}% (cassette setoran penuh)`
      },
      UPTIME_CRITICAL: {
        label: 'Uptime Kritis (< Ambang Batas Kritis)',
        category: 'SLA',
        status: 'CRITICAL',
        description: 'Uptime anjlok di bawah ambang batas toleransi operasional (< 99.00% ATM / < 98.00% CRM)'
      },
      UPTIME_BELOW_SLA: {
        label: 'Uptime di Bawah Target SLA',
        category: 'SLA',
        status: 'WARNING',
        description: 'Uptime berada dalam rentang toleransi warning (< 99.00% ATM / < 98.50% CRM)'
      }
    };

    const reasonMap: Record<string, {
      key: string;
      label: string;
      count: number;
      status: 'WARNING' | 'CRITICAL';
      category: 'CHRONIC' | 'SPIKE' | 'SLA';
      description: string;
      wsids: string[];
    }> = {};

    // HANYA mengevaluasi mesin BCA Aktif untuk Status Kesehatan Mesin & Kepatuhan SLA
    const bcaActiveMachines = filteredMachines.filter(m => m.klienStatus === 'BCA');

    bcaActiveMachines.forEach(m => {
      const evalRes = evaluateMachineHealth(m, activeHealthPeriod);
      if (evalRes.status === 'SAFE') {
        safeCount++;
      } else if (evalRes.status === 'WARNING') {
        warningCount++;
      } else if (evalRes.status === 'CRITICAL') {
        criticalCount++;
      }

      if (evalRes.isChronicWarning) chronicWarningCount++;
      if (evalRes.isChronicCritical) chronicCriticalCount++;

      if (evalRes.status !== 'SAFE') {
        const matchedKeys = new Set<string>();

        evalRes.reasons.forEach(r => {
          if (r.includes('Mesin Kronis (> 2 Bulan)')) {
            matchedKeys.add('CHRONIC_CRITICAL');
          } else if (r.includes('Mesin Kronis (Waspada 2 Bulan)')) {
            matchedKeys.add('CHRONIC_WARNING');
          } else if (r.includes('Hardware')) {
            matchedKeys.add('SPIKE_HW');
          } else if (r.includes('Komunikasi') || r.includes('Jaringan')) {
            matchedKeys.add('SPIKE_KOM');
          } else if (r.includes('Uang Habis')) {
            matchedKeys.add('SPIKE_UH');
          } else if (r.includes('Uang Penuh')) {
            matchedKeys.add('SPIKE_UP');
          } else if (r.includes('Uptime Kritis')) {
            matchedKeys.add('UPTIME_CRITICAL');
          } else if (r.includes('Target SLA') || r.includes('di bawah Target SLA')) {
            matchedKeys.add('UPTIME_BELOW_SLA');
          }
        });

        matchedKeys.forEach(key => {
          if (!reasonMap[key]) {
            const def = categoryDefinitions[key];
            if (def) {
              reasonMap[key] = {
                key,
                label: def.label,
                count: 0,
                status: def.status,
                category: def.category,
                description: def.description,
                wsids: []
              };
            }
          }
          if (reasonMap[key]) {
            reasonMap[key].count++;
            reasonMap[key].wsids.push(m.wsid);
          }
        });
      }
    });

    const total = bcaActiveMachines.length;
    const sortedReasons = Object.values(reasonMap)
      .filter(item => item.count > 0)
      .map(item => ({
        ...item,
        pct: total > 0 ? ((item.count / total) * 100).toFixed(1) : '0'
      }))
      .sort((a, b) => {
        const catOrder: Record<string, number> = { CHRONIC: 1, SPIKE: 2, SLA: 3 };
        const orderDiff = (catOrder[a.category] || 9) - (catOrder[b.category] || 9);
        if (orderDiff !== 0) return orderDiff;
        return b.count - a.count;
      });

    return {
      total,
      safeCount,
      warningCount,
      criticalCount,
      chronicWarningCount,
      chronicCriticalCount,
      safePct: total > 0 ? ((safeCount / total) * 100).toFixed(1) : '0',
      warningPct: total > 0 ? ((warningCount / total) * 100).toFixed(1) : '0',
      criticalPct: total > 0 ? ((criticalCount / total) * 100).toFixed(1) : '0',
      reasons: sortedReasons
    };
  }, [filteredMachines, activeHealthPeriod]);

  // Navigate to follow-up page filtered by specific problem / chronic category
  const handleReasonCardClick = (item: typeof healthAnalysis.reasons[0]) => {
    setSelectedPeriode(activeHealthPeriod);
    navigate('/follow-up', {
      state: {
        categoryFilter: item.key,
        categoryLabel: item.label,
        priorityFilter: item.status,
        categoryWsids: item.wsids
      }
    });
  };

  // Export Chart Data to Multi-Sheet Excel
  const handleExportExcel = () => {
    exportDashboardExcel({
      aggregatedData,
      groupBy,
      activePeriods,
      metric,
      monthRange,
      filteredMachines,
    });
  };

  // Helper for Bar Color based on BCA SLA Target
  const getBarColor = (entry: AggregatedUnit) => {
    if (metric === 'uptime') {
      if (entry.uptime >= 99.2) return '#10b981'; // Emerald (High Uptime meeting SLA)
      if (entry.uptime >= 98.0) return '#3b82f6'; // Blue (Moderate)
      if (entry.uptime >= 95.0) return '#f59e0b'; // Amber (Warning)
      return '#ef4444'; // Red (Critical)
    }
    if (metric === 'total_downtime' || metric === 'all_problems') {
      if (entry.downtimeTotal > 2.0) return '#ef4444'; // Red (High Downtime)
      if (entry.downtimeTotal > 0.9) return '#f59e0b'; // Amber
      return '#3b82f6'; // Blue
    }
    return PROBLEM_COLORS[metric as keyof typeof PROBLEM_COLORS] || '#6366f1';
  };

  const getMetricLabel = () => {
    switch (metric) {
      case 'uptime': return 'Rata-rata Uptime (%)';
      case 'total_downtime': return 'Total Downtime (%)';
      case 'uh': return 'Downtime Uang Habis (UH) (%)';
      case 'kom': return 'Downtime Komunikasi (KOM) (%)';
      case 'up': return 'Downtime Uang Penuh (UP) (%)';
      case 'hw': return 'Downtime Hardware (H/W) (%)';
      case 'll': return 'Downtime Lain-lain (LL) (%)';
      case 'all_problems': return 'Komparasi Problem (UH, KOM, UP, H/W, LL)';
      default: return 'Persentase (%)';
    }
  };

  const LINE_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#06b6d4'];

  return (
    <div className="space-y-5 animate-fade-in pb-12">
      {/* Top Header & Export */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0 border border-blue-100">
              <BarChart3 size={17} />
            </div>
            Dashboard Overview
          </h2>
          <p className="text-slate-500 text-xs mt-0.5">
            Ringkasan KPI performa uptime &amp; evaluasi insiden mesin ATM &amp; CRM.
          </p>
        </div>
        <button
          onClick={handleExportExcel}
          disabled={aggregatedData.length === 0}
          className="inline-flex items-center gap-2 px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-700 font-medium rounded-lg border border-[#E5EAF2] shadow-2xs transition-colors text-xs disabled:opacity-50 cursor-pointer self-start sm:self-auto"
        >
          <Download size={13} className="text-blue-600" />
          <span>Export Data Grafik</span>
        </button>
      </div>

      {/* 4 Clean Enterprise KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        {/* KPI 1: Uptime */}
        <div className="bg-white rounded-lg border border-[#E5EAF2] p-4 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Rata-rata Uptime</span>
            <CheckCircle2 size={16} className="text-emerald-600" />
          </div>
          <div className="text-2xl font-bold text-slate-900 tracking-tight">
            {kpis.avgUptime}%
          </div>
          <p className="text-[11px] text-slate-500 mt-1">SLA: ATM 99.00% &bull; CRM 98.50%</p>
        </div>

        {/* KPI 2: Downtime */}
        <div className="bg-white rounded-lg border border-[#E5EAF2] p-4 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Rata-rata Downtime</span>
            <AlertTriangle size={16} className="text-rose-500" />
          </div>
          <div className="text-2xl font-bold text-slate-900 tracking-tight">
            {kpis.avgDowntime}%
          </div>
          <p className="text-[11px] text-slate-500 mt-1">Akumulasi seluruh problem</p>
        </div>

        {/* KPI 3: Best Unit */}
        <div className="bg-white rounded-lg border border-[#E5EAF2] p-4 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Uptime Terbaik</span>
            <TrendingUp size={16} className="text-blue-600" />
          </div>
          <div className="text-lg font-bold text-slate-900 tracking-tight truncate" title={kpis.bestUnit}>
            {kpis.bestUnit}
          </div>
          <p className="text-[11px] text-emerald-600 font-medium mt-1">Performa Tertinggi</p>
        </div>

        {/* KPI 4: Needs Attention */}
        <div className="bg-white rounded-lg border border-[#E5EAF2] p-4 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Perlu Perhatian</span>
            <Cpu size={16} className="text-amber-500" />
          </div>
          <div className="text-lg font-bold text-slate-900 tracking-tight truncate" title={kpis.worstUnit}>
            {kpis.worstUnit}
          </div>
          <p className="text-[11px] text-slate-500 mt-1 truncate" title={`Penyebab: ${kpis.worstProblem}`}>
            Dominan: <strong className="text-rose-600 font-medium">{kpis.worstProblem}</strong>
          </p>
        </div>
      </div>

      {/* Health SLA Telemetry Strip */}
      <div className="bg-white rounded-lg border border-[#E5EAF2] p-3.5 shadow-2xs transition-all">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          {/* Left: Title & Subtitle */}
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0 border border-blue-100">
              <ShieldAlert size={16} />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h4 className="font-bold text-slate-900 text-xs sm:text-sm">
                  Status Kesehatan Mesin (BCA Aktif)
                </h4>
                <span className="text-[10px] px-2 py-0.2 rounded bg-slate-100 text-slate-600 font-medium border border-slate-200">
                  {healthAnalysis.total} Unit &bull; {formatPeriodLabel(activeHealthPeriod)}
                </span>
              </div>
              <p className="text-[11px] text-slate-500">
                Target SLA: ATM 99.00% &bull; CRM 98.50% | Zona Waspada 2 Bln | Kritis &gt; 2 Bln
              </p>
            </div>
          </div>

          {/* Middle: 3 Compact Status Badges */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold">
              <CheckCircle2 size={13} className="text-emerald-600" />
              <span>{healthAnalysis.safeCount} Aman</span>
              <span className="text-[10px] font-normal text-emerald-700">({healthAnalysis.safePct}%)</span>
            </div>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-amber-50 border border-amber-200 text-amber-800 text-xs font-semibold">
              <AlertTriangle size={13} className="text-amber-600" />
              <span>{healthAnalysis.warningCount} Waspada</span>
              <span className="text-[10px] font-normal text-amber-700">({healthAnalysis.warningPct}%)</span>
            </div>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold">
              <ShieldAlert size={13} className="text-rose-600" />
              <span>{healthAnalysis.criticalCount} Kritis</span>
              <span className="text-[10px] font-normal text-rose-700">({healthAnalysis.criticalPct}%)</span>
            </div>
          </div>

          {/* Right: Actions */}
          <div className="flex items-center gap-2 self-end lg:self-auto">
            <button
              onClick={() => setIsHealthDetailOpen(!isHealthDetailOpen)}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-50 hover:bg-slate-100 border border-[#E5EAF2] text-slate-700 rounded-md text-xs font-medium transition-colors cursor-pointer"
            >
              <span>{isHealthDetailOpen ? 'Tutup Rincian' : 'Rincian Masalah'}</span>
              {isHealthDetailOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            </button>
            <button
              onClick={() => {
                setSelectedPeriode(activeHealthPeriod);
                navigate('/follow-up');
              }}
              className="inline-flex items-center gap-1 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-xs font-medium transition-colors cursor-pointer shadow-2xs"
            >
              <span>Follow-Up</span>
              <ArrowRight size={13} />
            </button>
          </div>
        </div>

        {/* Expandable Breakdown Drawer */}
        {isHealthDetailOpen && (
          <div className="mt-3 pt-3 border-t border-[#E5EAF2] space-y-2.5 animate-fade-in">
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span className="font-semibold text-slate-700">
                Rincian Kategori Masalah ({healthAnalysis.reasons.length} terdeteksi):
              </span>
              <span className="text-[11px]">Klik kartu untuk filter WSID di Need to Follow Up</span>
            </div>

            {healthAnalysis.reasons.length === 0 ? (
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-center text-xs font-medium text-emerald-800">
                Semua mesin berada dalam status aman dan memenuhi target SLA.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-2.5">
                {healthAnalysis.reasons.map((item) => {
                  const isCrit = item.status === 'CRITICAL' || item.key === 'CHRONIC_CRITICAL';
                  return (
                    <div
                      key={item.key}
                      onClick={() => handleReasonCardClick(item)}
                      className="p-3 bg-slate-50 hover:bg-white border border-[#E5EAF2] hover:border-blue-400 hover:shadow-2xs rounded-lg transition-all cursor-pointer group flex flex-col justify-between"
                      title={item.description}
                    >
                      <div>
                        <div className="flex items-center justify-between gap-1 mb-1">
                          <span className={`text-[9px] font-semibold px-1.5 py-0.2 rounded uppercase tracking-wider ${
                            isCrit
                              ? 'bg-rose-50 text-rose-700 border border-rose-200'
                              : 'bg-amber-50 text-amber-700 border border-amber-200'
                          }`}>
                            {isCrit ? 'Kritis' : 'Warning'}
                          </span>
                          <span className="text-xs font-bold text-slate-800">
                            {item.count} <span className="text-[10px] text-slate-400 font-normal">unit</span>
                          </span>
                        </div>
                        <h5 className="text-xs font-semibold text-slate-800 group-hover:text-blue-600 transition-colors line-clamp-1">
                          {item.label}
                        </h5>
                        <p className="text-[10px] text-slate-500 mt-0.5 line-clamp-2">
                          {item.description}
                        </p>
                      </div>

                      <div className="mt-2 pt-1.5 border-t border-slate-200/70 flex items-center justify-between text-[10px] text-blue-600 font-medium">
                        <span>Lihat WSID</span>
                        <ArrowRight size={11} className="group-hover:translate-x-0.5 transition-transform" />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Main Interactive Chart Section */}
      <div className="bg-white rounded-lg border border-[#E5EAF2] p-5 shadow-2xs space-y-4">
        {/* Header with Title + Integrated Toolbar */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-3 border-b border-[#E5EAF2]">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-slate-900 text-sm sm:text-base">
                {getMetricLabel()}
              </h3>
              <span className="text-[11px] px-2 py-0.2 rounded bg-blue-50 text-blue-700 font-semibold border border-blue-200/60">
                {groupBy === 'SERVICE_POINT' ? 'Per Service Point' : 'Per Sektor'}
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              {chartType === 'bar' && 'Klik bar untuk drill-down sektor · ' }
              {chartType === 'trend' && 'Pergerakan nilai antar bulan · ' }
              {chartType === 'donut' && 'Proporsi kontribusi problem · ' }
              Menampilkan {aggregatedData.length} {groupBy === 'SERVICE_POINT' ? 'Service Point' : 'Sektor'}
            </p>
          </div>

          {/* Integrated Toolbar */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Dimension Toggle: SP vs Sektor */}
            <div className="inline-flex bg-slate-100 p-0.5 rounded-md border border-[#E5EAF2]">
              <button
                onClick={() => {
                  setGroupBy('SERVICE_POINT');
                  setFilterServicePoint('ALL');
                }}
                className={`flex items-center gap-1.5 py-1 px-2.5 rounded text-xs transition-colors cursor-pointer ${
                  groupBy === 'SERVICE_POINT'
                    ? 'bg-blue-600 text-white font-medium shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900 font-medium'
                }`}
              >
                <MapPin size={11} />
                Service Point
              </button>
              <button
                onClick={() => setGroupBy('SEKTOR')}
                className={`flex items-center gap-1.5 py-1 px-2.5 rounded text-xs transition-colors cursor-pointer ${
                  groupBy === 'SEKTOR'
                    ? 'bg-blue-600 text-white font-medium shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900 font-medium'
                }`}
              >
                <Server size={11} />
                Sektor
              </button>
            </div>

            {/* Sub-filter if Sektor is active */}
            {groupBy === 'SEKTOR' && (
              <select
                value={filterServicePoint}
                onChange={(e) => setFilterServicePoint(e.target.value)}
                className="bg-white border border-[#E5EAF2] rounded-md px-2.5 py-1 text-xs text-slate-700 font-medium focus:border-blue-500 focus:outline-none cursor-pointer"
              >
                <option value="ALL">Semua SP</option>
                {servicePointOptions.map(sp => (
                  <option key={sp} value={sp}>{sp}</option>
                ))}
              </select>
            )}

            {/* Metric Selector */}
            <select
              value={metric}
              onChange={(e) => setMetric(e.target.value as MetricType)}
              className="bg-white border border-[#E5EAF2] rounded-md px-2.5 py-1 text-xs text-slate-700 font-medium focus:border-blue-500 focus:outline-none cursor-pointer"
            >
              <option value="uptime">Uptime (%)</option>
              <option value="total_downtime">Total Downtime (%)</option>
              <option value="all_problems">Semua Problem (Stacked)</option>
              <option value="hw">Hardware / HW (%)</option>
              <option value="uh">Uang Habis / UH (%)</option>
              <option value="kom">Komunikasi / KOM (%)</option>
              <option value="up">Uang Penuh / UP (%)</option>
              <option value="ll">Lain-lain / LL (%)</option>
            </select>

            {/* Chart Type: Bar / Trend / Donut */}
            <div className="inline-flex bg-slate-100 p-0.5 rounded-md border border-[#E5EAF2]">
              <button
                onClick={() => setChartType('bar')}
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs transition-colors cursor-pointer ${
                  chartType === 'bar'
                    ? 'bg-blue-600 text-white font-medium shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900 font-medium'
                }`}
                title="Peringkat Bar"
              >
                <BarChart3 size={12} />
                Bar
              </button>
              <button
                onClick={() => setChartType('trend')}
                disabled={activePeriods.length < 2}
                title={activePeriods.length < 2 ? 'Minimal 2 bulan data' : 'Tren Waktu'}
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs transition-colors cursor-pointer ${
                  chartType === 'trend'
                    ? 'bg-blue-600 text-white font-medium shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900 font-medium disabled:opacity-40'
                }`}
              >
                <TrendingUp size={12} />
                Tren
              </button>
              <button
                onClick={() => setChartType('donut')}
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs transition-colors cursor-pointer ${
                  chartType === 'donut'
                    ? 'bg-blue-600 text-white font-medium shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900 font-medium'
                }`}
                title="Distribusi Problem"
              >
                <PieIcon size={12} />
                Donut
              </button>
            </div>
          </div>
        </div>

        {/* Render Chart according to chartType */}
        <div className="w-full h-[450px]">
          {aggregatedData.length === 0 ? (
            <div className="w-full h-full flex flex-col items-center justify-center text-slate-400 gap-2">
              <Info size={32} />
              <p className="text-sm">Tidak ada data yang tersedia untuk filter yang dipilih.</p>
            </div>
          ) : chartType === 'bar' ? (
            <ResponsiveContainer width="100%" height="100%">
              {metric === 'all_problems' ? (
                <BarChart data={aggregatedData} margin={{ top: 20, right: 30, left: 0, bottom: 60 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis 
                    dataKey="name" 
                    angle={-35} 
                    textAnchor="end" 
                    tick={{ fontSize: 11, fill: '#64748b' }} 
                    interval={0}
                    height={70}
                  />
                  <YAxis 
                    unit="%" 
                    tick={{ fontSize: 12, fill: '#64748b' }}
                  />
                  <Tooltip 
                    content={({ active, payload, label }) => {
                      if (!active || !payload || payload.length === 0) return null;
                      const d = payload[0].payload as AggregatedUnit;
                      return (
                        <div className="bg-white p-4 rounded-xl shadow-xl border border-slate-200 text-xs space-y-1.5 min-w-[220px]">
                          <p className="font-bold text-slate-800 text-sm border-b border-slate-100 pb-1">{d.name}</p>
                          <p className="text-slate-500">Service Point: <span className="font-semibold text-slate-700">{d.servicePoint}</span></p>
                          <p className="text-slate-500">Total Mesin: <span className="font-semibold text-slate-700">{d.machineCount} unit</span></p>
                          <p className="text-emerald-600 font-semibold">Uptime: {d.uptime}%</p>
                          <p className="text-rose-600 font-bold">Total Downtime: {d.downtimeTotal}%</p>
                          <div className="pt-1.5 border-t border-slate-100 space-y-1">
                            <p className="flex justify-between text-amber-600"><span>Uang Habis (UH):</span> <span className="font-bold">{d.uh}%</span></p>
                            <p className="flex justify-between text-blue-600"><span>Komunikasi (KOM):</span> <span className="font-bold">{d.kom}%</span></p>
                            <p className="flex justify-between text-pink-600"><span>Uang Penuh (UP):</span> <span className="font-bold">{d.up}%</span></p>
                            <p className="flex justify-between text-rose-600"><span>Hardware (H/W):</span> <span className="font-bold">{d.hw}%</span></p>
                            <p className="flex justify-between text-purple-600"><span>Lain-lain (LL):</span> <span className="font-bold">{d.ll}%</span></p>
                          </div>
                        </div>
                      );
                    }}
                  />
                  <Legend verticalAlign="top" height={36} />
                  <Bar dataKey="hw" name="Hardware (H/W)" stackId="a" fill={PROBLEM_COLORS.hw} />
                  <Bar dataKey="uh" name="Uang Habis (UH)" stackId="a" fill={PROBLEM_COLORS.uh} />
                  <Bar dataKey="kom" name="Komunikasi (KOM)" stackId="a" fill={PROBLEM_COLORS.kom} />
                  <Bar dataKey="up" name="Uang Penuh (UP)" stackId="a" fill={PROBLEM_COLORS.up} />
                  <Bar dataKey="ll" name="Lain-lain (LL)" stackId="a" fill={PROBLEM_COLORS.ll} />
                </BarChart>
              ) : (
                <BarChart 
                  data={aggregatedData} 
                  margin={{ top: 20, right: 30, left: 0, bottom: 60 }}
                  onClick={(e) => {
                    if (e && e.activePayload && e.activePayload[0] && groupBy === 'SERVICE_POINT') {
                      const spName = e.activePayload[0].payload.name;
                      setGroupBy('SEKTOR');
                      setFilterServicePoint(spName);
                    }
                  }}
                >
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis 
                    dataKey="name" 
                    angle={-35} 
                    textAnchor="end" 
                    tick={{ fontSize: 11, fill: '#64748b' }} 
                    interval={0}
                    height={70}
                  />
                  <YAxis 
                    unit="%" 
                    domain={metric === 'uptime' ? [0, 100] : [0, 'auto']}
                    tick={{ fontSize: 12, fill: '#64748b' }}
                  />
                  <Tooltip 
                    cursor={{ fill: 'rgba(241, 245, 249, 0.6)' }}
                    content={({ active, payload }) => {
                      if (!active || !payload || payload.length === 0) return null;
                      const d = payload[0].payload as AggregatedUnit;
                      const val = metric === 'uptime' ? d.uptime : metric === 'total_downtime' ? d.downtimeTotal : d[metric as keyof AggregatedUnit];
                      return (
                        <div className="bg-white p-3.5 rounded-xl shadow-xl border border-slate-200 text-xs space-y-1 min-w-[200px]">
                          <p className="font-bold text-slate-800 text-sm border-b border-slate-100 pb-1">{d.name}</p>
                          <p className="text-slate-500">Service Point: <span className="font-medium text-slate-700">{d.servicePoint}</span></p>
                          <p className="text-slate-500">Jumlah Mesin: <span className="font-medium text-slate-700">{d.machineCount}</span> (BCA: {d.bcaCount}, Non: {d.nonBcaCount})</p>
                          <p className="text-blue-600 font-bold text-sm mt-1">{getMetricLabel()}: {val}%</p>
                          <p className="text-slate-500">Problem Terbesar: <span className="font-semibold text-rose-500">{d.dominantProblem}</span></p>
                          {groupBy === 'SERVICE_POINT' && (
                            <p className="text-[10px] text-blue-500 italic mt-1 pt-1 border-t border-slate-100">💡 Klik bar untuk melihat sektor di dalamnya</p>
                          )}
                        </div>
                      );
                    }}
                  />
                  <Bar 
                    dataKey={metric === 'uptime' ? 'uptime' : metric === 'total_downtime' ? 'downtimeTotal' : metric} 
                    radius={[6, 6, 0, 0]}
                    cursor="pointer"
                  >
                    {aggregatedData.map((entry) => (
                      <Cell key={entry.id} fill={getBarColor(entry)} />
                    ))}
                  </Bar>
                </BarChart>
              )}
            </ResponsiveContainer>
          ) : chartType === 'trend' ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={monthlyTrendData} margin={{ top: 20, right: 30, left: 0, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="periode" tick={{ fontSize: 12, fill: '#64748b' }} />
                <YAxis unit="%" tick={{ fontSize: 12, fill: '#64748b' }} domain={metric === 'uptime' ? [85, 100] : [0, 'auto']} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '12px' }} 
                  formatter={(value: any) => [`${value}%`, '']}
                />
                <Legend verticalAlign="top" height={36} />
                {aggregatedData.slice(0, 6).map((unit, idx) => (
                  <Line 
                    key={unit.name}
                    type="monotone"
                    dataKey={unit.name}
                    stroke={LINE_COLORS[idx % LINE_COLORS.length]}
                    strokeWidth={2.5}
                    dot={{ r: 4 }}
                    activeDot={{ r: 6 }}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          ) : (
            /* Donut / Pie Chart */
            <div className="w-full h-full flex flex-col md:flex-row items-center justify-around gap-6">
              <div className="w-full md:w-1/2 h-[380px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={problemDistribution}
                      cx="50%"
                      cy="50%"
                      innerRadius={80}
                      outerRadius={130}
                      paddingAngle={4}
                      dataKey="value"
                    >
                      {problemDistribution.map((entry) => (
                        <Cell key={entry.name} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip 
                      formatter={(val: any) => [`${val}%`, 'Persentase']}
                      contentStyle={{ backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '12px' }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              <div className="w-full md:w-1/2 space-y-3 pr-6">
                <h4 className="font-bold text-slate-700 text-sm mb-2">Komposisi Kontribusi Downtime</h4>
                {problemDistribution.map((p) => (
                  <div key={p.name} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100">
                    <div className="flex items-center gap-2.5">
                      <span className="w-3.5 h-3.5 rounded-full" style={{ backgroundColor: p.color }}></span>
                      <span className="text-xs font-semibold text-slate-700">{p.name}</span>
                    </div>
                    <span className="text-sm font-bold text-slate-800">{p.value}%</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Summary Table below chart */}
      <div className="bg-white rounded-lg border border-[#E5EAF2] shadow-2xs overflow-hidden">
        <div className="px-5 py-3.5 bg-white border-b border-[#E5EAF2] flex justify-between items-center">
          <h3 className="font-bold text-slate-900 text-xs sm:text-sm">
            Tabel Peringkat Lengkap ({groupBy === 'SERVICE_POINT' ? 'Service Point' : 'Sektor'})
          </h3>
          <span className="text-xs text-slate-400 font-normal">Terurut berdasarkan nilai metrik terpilih</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-[#F8FAFC] text-slate-600 font-semibold border-b border-[#E5EAF2] select-none">
              <tr>
                <th className="px-4 py-2.5 text-center">Peringkat</th>
                <th className="px-4 py-2.5">{groupBy === 'SERVICE_POINT' ? 'Service Point' : 'Sektor'}</th>
                {groupBy === 'SEKTOR' && <th className="px-4 py-2.5">Service Point Induk</th>}
                <th className="px-4 py-2.5 text-center">Mesin Aktif</th>
                <th className="px-4 py-2.5 text-center">Uptime (%)</th>
                <th className="px-4 py-2.5 text-center">Downtime Total (%)</th>
                <th className="px-4 py-2.5 text-center">UH (%)</th>
                <th className="px-4 py-2.5 text-center">KOM (%)</th>
                <th className="px-4 py-2.5 text-center">UP (%)</th>
                <th className="px-4 py-2.5 text-center">H/W (%)</th>
                <th className="px-4 py-2.5 text-center">LL (%)</th>
                <th className="px-4 py-2.5">Problem Dominan</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E5EAF2]">
              {aggregatedData.map((d, idx) => (
                <tr key={d.id} className="hover:bg-slate-50/80 transition-colors">
                  <td className="px-4 py-2.5 text-center font-medium text-slate-400">{idx + 1}</td>
                  <td className="px-4 py-2.5 font-semibold text-slate-800">{d.name}</td>
                  {groupBy === 'SEKTOR' && <td className="px-4 py-2.5 text-slate-500">{d.servicePoint}</td>}
                  <td className="px-4 py-2.5 text-center font-medium text-slate-600">{d.machineCount}</td>
                  <td className="px-4 py-2.5 text-center">
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200/70">
                      {d.uptime}%
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-rose-50 text-rose-700 border border-rose-200/70">
                      {d.downtimeTotal}%
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-center text-amber-600 font-medium">{d.uh}%</td>
                  <td className="px-4 py-2.5 text-center text-blue-600 font-medium">{d.kom}%</td>
                  <td className="px-4 py-2.5 text-center text-pink-600 font-medium">{d.up}%</td>
                  <td className="px-4 py-2.5 text-center text-rose-600 font-medium">{d.hw}%</td>
                  <td className="px-4 py-2.5 text-center text-purple-600 font-medium">{d.ll}%</td>
                  <td className="px-4 py-2.5 text-slate-600 font-medium">{d.dominantProblem}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
