import React, { useMemo, useState } from 'react';
import { useDataStore } from '../store/useDataStore';
import StickyTableWrapper from '../components/StickyTableWrapper';
import { 
  Activity, 
  TrendingUp, 
  Download, 
  CheckCircle2, 
  AlertTriangle, 
  Layers,
  ArrowUpRight,
  ArrowDownRight
} from 'lucide-react';
import { 
  ResponsiveContainer, 
  LineChart, 
  Line, 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  ReferenceLine 
} from 'recharts';
import { exportComprehensiveExcel, formatBulanTahun } from '../utils/comprehensiveExporter';

const SLA_ATM = 99.00;
const SLA_CRM = 98.50;

export default function TotalUptimeBulanPage() {
  const [tableViewMode, setTableViewMode] = useState<'COMBINED' | 'SPLIT' | 'ATM' | 'CRM'>('COMBINED');
  const { 
    globalTrendData, 
    rawMasterData, 
    rawUptimeFiles, 
    machines, 
    selectedPeriode 
  } = useDataStore();

  const handleExportAll = () => {
    exportComprehensiveExcel({
      masterData: rawMasterData,
      parsedUptimeFiles: rawUptimeFiles,
      machines,
      selectedPeriode
    });
  };

  // Format data untuk grafik Recharts
  const chartData = useMemo(() => {
    if (!globalTrendData || globalTrendData.length === 0) return [];
    return [...globalTrendData]
      .sort((a, b) => a.periode.localeCompare(b.periode))
      .map(item => ({
        periodeRaw: item.periode,
        periodeLabel: formatBulanTahun(item.periode),
        uptimeATM: item.uptimeATM > 0 ? Number(item.uptimeATM.toFixed(2)) : null,
        uptimeCRM: item.uptimeCRM > 0 ? Number(item.uptimeCRM.toFixed(2)) : null,
        mesinATM: item.jumlahMesinATM || 0,
        mesinCRM: item.jumlahMesinCRM || 0,
        totalMesin: (item.jumlahMesinATM || 0) + (item.jumlahMesinCRM || 0)
      }));
  }, [globalTrendData]);

  // Statistik bulan terakhir
  const latestMonth = chartData.length > 0 ? chartData[chartData.length - 1] : null;

  // Hitung batas minimum sumbu Y agar grafik terlihat dinamis namun proporsional
  const minUptime = useMemo(() => {
    let min = 100;
    chartData.forEach(d => {
      if (d.uptimeATM && d.uptimeATM > 0) min = Math.min(min, d.uptimeATM);
      if (d.uptimeCRM && d.uptimeCRM > 0) min = Math.min(min, d.uptimeCRM);
    });
    return Math.max(90, Math.floor(min - 0.5));
  }, [chartData]);

  return (
    <div className="space-y-3.5 animate-fade-in pb-8">
      {/* Header & Export Action */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
        <div>
          <h1 className="text-lg font-bold text-slate-900 tracking-tight">Dashboard Overview &bull; Total Uptime & Performa (Abacus Jakarta)</h1>
          <p className="text-xs text-slate-500 mt-0.5">Perhitungan performa SLA terpisah antara mesin ATM dan CRM dengan grafik tren bulanan</p>
        </div>

        <button
          onClick={handleExportAll}
          className="inline-flex items-center gap-1.5 px-3 h-8 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-xs font-medium transition-colors shadow-2xs cursor-pointer self-start sm:self-auto"
        >
          <Download size={13} />
          <span>Export Laporan Lengkap (.xlsx)</span>
        </button>
      </div>

      {/* KPI Cards: Separated ATM & CRM Performance (Compact 92-105px) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
        {/* ATM SLA Card */}
        <div className="bg-white rounded-lg p-3 border border-[#E5EAF2] shadow-2xs min-h-[92px] max-h-[105px] flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-semibold tracking-wider text-slate-500 uppercase">
              Mesin ATM BCA
            </span>
            <span className="text-[10px] text-slate-400 font-medium">
              {latestMonth ? latestMonth.periodeLabel : '-'}
            </span>
          </div>
          
          <div className="flex items-baseline gap-2 my-0.5">
            <span className="text-2xl font-bold text-slate-900 leading-tight">
              {latestMonth?.uptimeATM ? `${latestMonth.uptimeATM.toFixed(2)}%` : '-'}
            </span>
            <span className="text-[11px] font-medium text-slate-500">
              SLA: {SLA_ATM}%
            </span>
          </div>

          <div className="flex items-center justify-between pt-1.5 border-t border-[#E5EAF2]">
            <div className="flex items-center gap-1">
              {latestMonth && latestMonth.uptimeATM !== null ? (
                latestMonth.uptimeATM >= SLA_ATM ? (
                  <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200">
                    <CheckCircle2 size={11} />
                    ACHIEVED (+{(latestMonth.uptimeATM - SLA_ATM).toFixed(2)}%)
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-rose-700 bg-rose-50 px-1.5 py-0.2 rounded border border-rose-200">
                    <AlertTriangle size={11} />
                    NOT ACHIEVED ({(latestMonth.uptimeATM - SLA_ATM).toFixed(2)}%)
                  </span>
                )
              ) : (
                <span className="text-xs text-slate-400">-</span>
              )}
            </div>
            <span className="text-[10px] font-medium text-slate-500">
              Populasi: <strong className="text-slate-700 font-semibold">{latestMonth?.mesinATM?.toLocaleString() || 0}</strong>
            </span>
          </div>
        </div>

        {/* CRM SLA Card */}
        <div className="bg-white rounded-lg p-3 border border-[#E5EAF2] shadow-2xs min-h-[92px] max-h-[105px] flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-semibold tracking-wider text-slate-500 uppercase">
              Mesin CRM / ATS BCA
            </span>
            <span className="text-[10px] text-slate-400 font-medium">
              {latestMonth ? latestMonth.periodeLabel : '-'}
            </span>
          </div>
          
          <div className="flex items-baseline gap-2 my-0.5">
            <span className="text-2xl font-bold text-slate-900 leading-tight">
              {latestMonth?.uptimeCRM ? `${latestMonth.uptimeCRM.toFixed(2)}%` : '-'}
            </span>
            <span className="text-[11px] font-medium text-slate-500">
              SLA: {SLA_CRM}%
            </span>
          </div>

          <div className="flex items-center justify-between pt-1.5 border-t border-[#E5EAF2]">
            <div className="flex items-center gap-1">
              {latestMonth && latestMonth.uptimeCRM !== null ? (
                latestMonth.uptimeCRM >= SLA_CRM ? (
                  <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200">
                    <CheckCircle2 size={11} />
                    ACHIEVED (+{(latestMonth.uptimeCRM - SLA_CRM).toFixed(2)}%)
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-rose-700 bg-rose-50 px-1.5 py-0.2 rounded border border-rose-200">
                    <AlertTriangle size={11} />
                    NOT ACHIEVED ({(latestMonth.uptimeCRM - SLA_CRM).toFixed(2)}%)
                  </span>
                )
              ) : (
                <span className="text-xs text-slate-400">-</span>
              )}
            </div>
            <span className="text-[10px] font-medium text-slate-500">
              Populasi: <strong className="text-slate-700 font-semibold">{latestMonth?.mesinCRM?.toLocaleString() || 0}</strong>
            </span>
          </div>
        </div>

        {/* Total Active Machines Card */}
        <div className="bg-white rounded-lg p-3 border border-[#E5EAF2] shadow-2xs min-h-[92px] max-h-[105px] flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-semibold tracking-wider text-slate-500 uppercase">
              Total Populasi Mesin
            </span>
            <span className="text-[10px] text-slate-400 font-medium">Abacus Jakarta</span>
          </div>
          
          <div className="flex items-baseline gap-2 my-0.5">
            <span className="text-2xl font-bold text-slate-900 leading-tight">
              {latestMonth?.totalMesin?.toLocaleString() || 0}
            </span>
            <span className="text-[11px] font-medium text-slate-500">
              Mesin Aktif
            </span>
          </div>

          <div className="flex items-center justify-between pt-1.5 border-t border-[#E5EAF2] text-[10px] text-slate-500">
            <span>ATM: <strong className="text-blue-600 font-semibold">{latestMonth?.mesinATM || 0}</strong></span>
            <span>CRM: <strong className="text-slate-700 font-semibold">{latestMonth?.mesinCRM || 0}</strong></span>
            <span>Periode: <strong className="text-slate-700 font-semibold">{chartData.length} Bulan</strong></span>
          </div>
        </div>
      </div>

      {/* Visual Monthly Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Chart 1: Uptime Trend (ATM vs CRM with SLA Reference Lines) */}
        <div className="bg-white rounded-lg p-4 border border-[#E5EAF2] shadow-2xs">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-1.5">
                <TrendingUp size={16} className="text-blue-600" />
                Grafik Tren Uptime Bulanan (ATM vs CRM)
              </h2>
              <p className="text-[11px] text-slate-500 mt-0.5">Target SLA: ATM 99.00%, CRM 98.50%</p>
            </div>
          </div>

          <div className="h-64 w-full">
            {chartData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-slate-400 text-xs">
                Belum ada data bulanan untuk grafik
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 15, right: 25, left: -10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis 
                    dataKey="periodeLabel" 
                    tick={{ fontSize: 11, fill: '#64748b' }}
                  />
                  <YAxis 
                    domain={[minUptime, 100]} 
                    tick={{ fontSize: 11, fill: '#64748b' }}
                    tickFormatter={(v) => `${v}%`}
                  />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: '#ffffff', 
                      borderRadius: '8px', 
                      boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
                      borderColor: '#E5EAF2',
                      fontSize: '11px'
                    }}
                    formatter={(val: any, name: any) => {
                      if (val === null) return ['-', name];
                      const num = Number(val);
                      if (name === 'Uptime ATM (%)') {
                        const gap = num - SLA_ATM;
                        return [`${num.toFixed(2)}% (${gap >= 0 ? '+' : ''}${gap.toFixed(2)}% vs SLA)`, name];
                      }
                      if (name === 'Uptime CRM (%)') {
                        const gap = num - SLA_CRM;
                        return [`${num.toFixed(2)}% (${gap >= 0 ? '+' : ''}${gap.toFixed(2)}% vs SLA)`, name];
                      }
                      return [`${num.toFixed(2)}%`, name];
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
                  <ReferenceLine 
                    y={SLA_ATM} 
                    stroke="#dc2626" 
                    strokeDasharray="4 4" 
                    label={{ value: 'SLA ATM 99.00%', position: 'top', fill: '#dc2626', fontSize: 10 }}
                  />
                  <ReferenceLine 
                    y={SLA_CRM} 
                    stroke="#d97706" 
                    strokeDasharray="4 4" 
                    label={{ value: 'SLA CRM 98.50%', position: 'bottom', fill: '#d97706', fontSize: 10 }}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="uptimeATM" 
                    name="Uptime ATM (%)" 
                    stroke="#2563eb" 
                    strokeWidth={2.5} 
                    dot={{ r: 3.5, fill: '#2563eb' }}
                    activeDot={{ r: 5 }}
                    connectNulls
                  />
                  <Line 
                    type="monotone" 
                    dataKey="uptimeCRM" 
                    name="Uptime CRM (%)" 
                    stroke="#0284c7" 
                    strokeWidth={2.5} 
                    dot={{ r: 3.5, fill: '#0284c7' }}
                    activeDot={{ r: 5 }}
                    connectNulls
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Chart 2: Machine Population Growth */}
        <div className="bg-white rounded-lg p-4 border border-[#E5EAF2] shadow-2xs">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-1.5">
                <Layers size={16} className="text-blue-600" />
                Grafik Pertumbuhan Populasi Mesin (ATM vs CRM)
              </h2>
              <p className="text-[11px] text-slate-500 mt-0.5">Perkembangan jumlah mesin aktif per periode</p>
            </div>
          </div>

          <div className="h-64 w-full">
            {chartData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-slate-400 text-xs">
                Belum ada data populasi untuk grafik
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 15, right: 25, left: -10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis 
                    dataKey="periodeLabel" 
                    tick={{ fontSize: 11, fill: '#64748b' }}
                  />
                  <YAxis 
                    tick={{ fontSize: 11, fill: '#64748b' }}
                  />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: '#ffffff', 
                      borderRadius: '8px', 
                      boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
                      borderColor: '#E5EAF2',
                      fontSize: '11px'
                    }}
                    formatter={(val: any, name: any) => [`${Number(val).toLocaleString()} Mesin`, name]}
                  />
                  <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
                  <Bar 
                    dataKey="mesinATM" 
                    name="Mesin ATM" 
                    fill="#2563eb" 
                    radius={[4, 4, 0, 0]} 
                  />
                  <Bar 
                    dataKey="mesinCRM" 
                    name="Mesin CRM / ATS" 
                    fill="#60a5fa" 
                    radius={[4, 4, 0, 0]} 
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      {/* Detailed Monthly Performance Table */}
      <div className="bg-white rounded-lg overflow-hidden shadow-2xs border border-[#E5EAF2]">
        <div className="px-4 py-3 border-b border-[#E5EAF2] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-slate-900 text-xs">Tabel Rekapitulasi Performa Bulanan</h3>
              <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded font-medium border border-slate-200">
                {chartData.length} Bulan
              </span>
            </div>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Perbandingan terpisah performa Uptime dan kepatuhan SLA antara Mesin ATM vs Mesin CRM
            </p>
          </div>

          {/* View Mode Toggle: Gabungan dengan Pembatas / Pisah 2 Tabel / ATM Saja / CRM Saja */}
          <div className="flex items-center bg-slate-100 p-0.5 rounded-md border border-slate-200 text-[11px] font-medium">
            <button
              type="button"
              onClick={() => setTableViewMode('COMBINED')}
              className={`px-2.5 py-1 rounded transition-colors cursor-pointer ${
                tableViewMode === 'COMBINED'
                  ? 'bg-white text-blue-600 font-semibold shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Gabungan (Ada Pembatas)
            </button>
            <button
              type="button"
              onClick={() => setTableViewMode('SPLIT')}
              className={`px-2.5 py-1 rounded transition-colors cursor-pointer ${
                tableViewMode === 'SPLIT'
                  ? 'bg-white text-blue-600 font-semibold shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Pisah 2 Tabel
            </button>
            <button
              type="button"
              onClick={() => setTableViewMode('ATM')}
              className={`px-2.5 py-1 rounded transition-colors cursor-pointer ${
                tableViewMode === 'ATM'
                  ? 'bg-white text-blue-600 font-semibold shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Hanya ATM
            </button>
            <button
              type="button"
              onClick={() => setTableViewMode('CRM')}
              className={`px-2.5 py-1 rounded transition-colors cursor-pointer ${
                tableViewMode === 'CRM'
                  ? 'bg-white text-blue-600 font-semibold shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Hanya CRM
            </button>
          </div>
        </div>

        {/* 1. TAMPILAN GABUNGAN DENGAN PEMBATAS TEGAS */}
        {tableViewMode === 'COMBINED' && (
          <StickyTableWrapper>
            <table className="w-full text-xs text-left border-collapse">
              <thead>
                {/* Baris 1 Group Header: ATM vs CRM Pembatas Jelas */}
                <tr className="border-b border-[#E5EAF2] text-[11px]">
                  <th rowSpan={2} className="px-3 py-2 font-semibold text-slate-700 bg-slate-50 border-r-2 border-slate-300">
                    Periode Bulan
                  </th>
                  <th colSpan={3} className="px-3 py-1.5 text-center font-bold text-blue-700 bg-blue-50/70 border-r-2 border-slate-300">
                    <div className="flex items-center justify-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-blue-600"></span>
                      <span>DATA MESIN ATM BCA (SLA &ge; 99.00%)</span>
                    </div>
                  </th>
                  <th colSpan={3} className="px-3 py-1.5 text-center font-bold text-indigo-700 bg-indigo-50/70 border-r-2 border-slate-300">
                    <div className="flex items-center justify-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-indigo-600"></span>
                      <span>DATA MESIN CRM / ATS BCA (SLA &ge; 98.50%)</span>
                    </div>
                  </th>
                  <th rowSpan={2} className="px-3 py-2 text-center font-bold text-slate-800 bg-slate-50">
                    Total Mesin
                  </th>
                </tr>
                {/* Baris 2 Sub Header */}
                <tr className="bg-[#F8FAFC] text-slate-600 font-semibold border-b border-[#E5EAF2] text-[10px]">
                  <th className="px-3 py-1 text-center bg-blue-50/30 text-blue-900 font-medium">Populasi</th>
                  <th className="px-3 py-1 text-center bg-blue-50/30 text-blue-900 font-medium">Uptime (%)</th>
                  <th className="px-3 py-1 text-center bg-blue-50/30 text-blue-900 font-medium border-r-2 border-slate-300">Status SLA</th>
                  
                  <th className="px-3 py-1 text-center bg-indigo-50/30 text-indigo-900 font-medium">Populasi</th>
                  <th className="px-3 py-1 text-center bg-indigo-50/30 text-indigo-900 font-medium">Uptime (%)</th>
                  <th className="px-3 py-1 text-center bg-indigo-50/30 text-indigo-900 font-medium border-r-2 border-slate-300">Status SLA</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E5EAF2]">
                {chartData.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-3 py-8 text-center text-slate-400">
                      Tidak ada data bulanan yang tersedia.
                    </td>
                  </tr>
                ) : (
                  chartData.map((data) => {
                    const atmAchieved = data.uptimeATM !== null && data.uptimeATM >= SLA_ATM;
                    const crmAchieved = data.uptimeCRM !== null && data.uptimeCRM >= SLA_CRM;

                    return (
                      <tr key={data.periodeRaw} className="hover:bg-slate-50/70 transition-colors">
                        <td className="px-3 py-1.5 font-semibold text-slate-900 border-r-2 border-slate-300 bg-slate-50/30">{data.periodeLabel}</td>
                        
                        {/* ATM Info */}
                        <td className="px-3 py-1.5 text-center text-slate-700 bg-blue-50/10">
                          {data.mesinATM.toLocaleString()}
                        </td>
                        <td className="px-3 py-1.5 text-center font-bold text-blue-600 bg-blue-50/10">
                          {data.uptimeATM !== null ? `${data.uptimeATM.toFixed(2)}%` : '-'}
                        </td>
                        <td className="px-3 py-1.5 text-center border-r-2 border-slate-300 bg-blue-50/10">
                          {data.uptimeATM !== null ? (
                            <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.2 rounded ${
                              atmAchieved ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200'
                            }`}>
                              {atmAchieved ? <CheckCircle2 size={10} /> : <AlertTriangle size={10} />}
                              {atmAchieved ? 'ACHIEVED' : 'NOT ACHIEVED'}
                            </span>
                          ) : '-'}
                        </td>

                        {/* CRM Info */}
                        <td className="px-3 py-1.5 text-center text-slate-700 bg-indigo-50/10">
                          {data.mesinCRM.toLocaleString()}
                        </td>
                        <td className="px-3 py-1.5 text-center font-bold text-indigo-600 bg-indigo-50/10">
                          {data.uptimeCRM !== null ? `${data.uptimeCRM.toFixed(2)}%` : '-'}
                        </td>
                        <td className="px-3 py-1.5 text-center border-r-2 border-slate-300 bg-indigo-50/10">
                          {data.uptimeCRM !== null ? (
                            <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.2 rounded ${
                              crmAchieved ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200'
                            }`}>
                              {crmAchieved ? <CheckCircle2 size={10} /> : <AlertTriangle size={10} />}
                              {crmAchieved ? 'ACHIEVED' : 'NOT ACHIEVED'}
                            </span>
                          ) : '-'}
                        </td>

                        {/* Total */}
                        <td className="px-3 py-1.5 text-center font-bold text-slate-900 bg-slate-50/30">
                          {data.totalMesin.toLocaleString()}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </StickyTableWrapper>
        )}

        {/* 2. TAMPILAN PISAH 2 TABEL (BERDAMPINGAN / DEDIKASI MASING-MASING) */}
        {tableViewMode === 'SPLIT' && (
          <div className="p-3 grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Tabel 1: ATM */}
            <div className="border border-blue-200 rounded-lg overflow-hidden">
              <div className="bg-blue-50/80 px-3 py-2 border-b border-blue-200 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-blue-600"></span>
                  <span className="text-xs font-bold text-blue-900">Tabel Performa Mesin ATM (BCA)</span>
                </div>
                <span className="text-[10px] text-blue-700 font-medium">Target SLA: 99.00%</span>
              </div>
              <StickyTableWrapper>
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-[#E5EAF2] text-[11px]">
                    <tr>
                      <th className="px-3 py-1.5">Periode</th>
                      <th className="px-3 py-1.5 text-center">Populasi ATM</th>
                      <th className="px-3 py-1.5 text-center">Uptime ATM (%)</th>
                      <th className="px-3 py-1.5 text-center">Status SLA</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E5EAF2]">
                    {chartData.map((data) => {
                      const atmAchieved = data.uptimeATM !== null && data.uptimeATM >= SLA_ATM;
                      return (
                        <tr key={data.periodeRaw} className="hover:bg-blue-50/30 transition-colors">
                          <td className="px-3 py-1.5 font-semibold text-slate-900">{data.periodeLabel}</td>
                          <td className="px-3 py-1.5 text-center text-slate-600">{data.mesinATM.toLocaleString()}</td>
                          <td className="px-3 py-1.5 text-center font-bold text-blue-600">
                            {data.uptimeATM !== null ? `${data.uptimeATM.toFixed(2)}%` : '-'}
                          </td>
                          <td className="px-3 py-1.5 text-center">
                            {data.uptimeATM !== null ? (
                              <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.2 rounded ${
                                atmAchieved ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200'
                              }`}>
                                {atmAchieved ? <CheckCircle2 size={10} /> : <AlertTriangle size={10} />}
                                {atmAchieved ? 'ACHIEVED' : 'NOT ACHIEVED'}
                              </span>
                            ) : '-'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </StickyTableWrapper>
            </div>

            {/* Tabel 2: CRM */}
            <div className="border border-indigo-200 rounded-lg overflow-hidden">
              <div className="bg-indigo-50/80 px-3 py-2 border-b border-indigo-200 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-indigo-600"></span>
                  <span className="text-xs font-bold text-indigo-900">Tabel Performa Mesin CRM / ATS (BCA)</span>
                </div>
                <span className="text-[10px] text-indigo-700 font-medium">Target SLA: 98.50%</span>
              </div>
              <StickyTableWrapper>
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-[#E5EAF2] text-[11px]">
                    <tr>
                      <th className="px-3 py-1.5">Periode</th>
                      <th className="px-3 py-1.5 text-center">Populasi CRM</th>
                      <th className="px-3 py-1.5 text-center">Uptime CRM (%)</th>
                      <th className="px-3 py-1.5 text-center">Status SLA</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E5EAF2]">
                    {chartData.map((data) => {
                      const crmAchieved = data.uptimeCRM !== null && data.uptimeCRM >= SLA_CRM;
                      return (
                        <tr key={data.periodeRaw} className="hover:bg-indigo-50/30 transition-colors">
                          <td className="px-3 py-1.5 font-semibold text-slate-900">{data.periodeLabel}</td>
                          <td className="px-3 py-1.5 text-center text-slate-600">{data.mesinCRM.toLocaleString()}</td>
                          <td className="px-3 py-1.5 text-center font-bold text-indigo-600">
                            {data.uptimeCRM !== null ? `${data.uptimeCRM.toFixed(2)}%` : '-'}
                          </td>
                          <td className="px-3 py-1.5 text-center">
                            {data.uptimeCRM !== null ? (
                              <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.2 rounded ${
                                crmAchieved ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200'
                              }`}>
                                {crmAchieved ? <CheckCircle2 size={10} /> : <AlertTriangle size={10} />}
                                {crmAchieved ? 'ACHIEVED' : 'NOT ACHIEVED'}
                              </span>
                            ) : '-'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </StickyTableWrapper>
            </div>
          </div>
        )}

        {/* 3. TAMPILAN HANYA ATM */}
        {tableViewMode === 'ATM' && (
          <StickyTableWrapper>
            <table className="w-full text-xs text-left">
              <thead className="bg-blue-50/60 text-blue-900 font-semibold border-b border-blue-200 text-[11px]">
                <tr>
                  <th className="px-3 py-1.5">Periode Bulan</th>
                  <th className="px-3 py-1.5 text-center">Populasi ATM</th>
                  <th className="px-3 py-1.5 text-center">Uptime ATM (%)</th>
                  <th className="px-3 py-1.5 text-center">Status SLA ATM (Target &ge; 99.00%)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E5EAF2]">
                {chartData.map((data) => {
                  const atmAchieved = data.uptimeATM !== null && data.uptimeATM >= SLA_ATM;
                  return (
                    <tr key={data.periodeRaw} className="hover:bg-blue-50/20 transition-colors">
                      <td className="px-3 py-1.5 font-semibold text-slate-900">{data.periodeLabel}</td>
                      <td className="px-3 py-1.5 text-center text-slate-600">{data.mesinATM.toLocaleString()}</td>
                      <td className="px-3 py-1.5 text-center font-bold text-blue-600">
                        {data.uptimeATM !== null ? `${data.uptimeATM.toFixed(2)}%` : '-'}
                      </td>
                      <td className="px-3 py-1.5 text-center">
                        {data.uptimeATM !== null ? (
                          <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.2 rounded ${
                            atmAchieved ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200'
                          }`}>
                            {atmAchieved ? <CheckCircle2 size={10} /> : <AlertTriangle size={10} />}
                            {atmAchieved ? 'ACHIEVED' : 'NOT ACHIEVED'}
                          </span>
                        ) : '-'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </StickyTableWrapper>
        )}

        {/* 4. TAMPILAN HANYA CRM */}
        {tableViewMode === 'CRM' && (
          <StickyTableWrapper>
            <table className="w-full text-xs text-left">
              <thead className="bg-indigo-50/60 text-indigo-900 font-semibold border-b border-indigo-200 text-[11px]">
                <tr>
                  <th className="px-3 py-1.5">Periode Bulan</th>
                  <th className="px-3 py-1.5 text-center">Populasi CRM</th>
                  <th className="px-3 py-1.5 text-center">Uptime CRM (%)</th>
                  <th className="px-3 py-1.5 text-center">Status SLA CRM (Target &ge; 98.50%)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E5EAF2]">
                {chartData.map((data) => {
                  const crmAchieved = data.uptimeCRM !== null && data.uptimeCRM >= SLA_CRM;
                  return (
                    <tr key={data.periodeRaw} className="hover:bg-indigo-50/20 transition-colors">
                      <td className="px-3 py-1.5 font-semibold text-slate-900">{data.periodeLabel}</td>
                      <td className="px-3 py-1.5 text-center text-slate-600">{data.mesinCRM.toLocaleString()}</td>
                      <td className="px-3 py-1.5 text-center font-bold text-indigo-600">
                        {data.uptimeCRM !== null ? `${data.uptimeCRM.toFixed(2)}%` : '-'}
                      </td>
                      <td className="px-3 py-1.5 text-center">
                        {data.uptimeCRM !== null ? (
                          <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.2 rounded ${
                            crmAchieved ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200'
                          }`}>
                            {crmAchieved ? <CheckCircle2 size={10} /> : <AlertTriangle size={10} />}
                            {crmAchieved ? 'ACHIEVED' : 'NOT ACHIEVED'}
                          </span>
                        ) : '-'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </StickyTableWrapper>
        )}
      </div>
    </div>
  );
}
