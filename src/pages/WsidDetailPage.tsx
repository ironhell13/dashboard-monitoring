import React, { useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useDataStore } from '../store/useDataStore';
import { ArrowLeft, Server, Activity, ChevronDown, ChevronUp, Download, ShieldAlert, CheckCircle2, AlertTriangle } from 'lucide-react';
import { hwDetailMap } from '../utils/problemCalculator';
import { exportWsidDetailExcel, formatBulanTahun, normalizePeriode } from '../utils/comprehensiveExporter';
import { evaluateMachineHealth } from '../utils/slaHelper';

export default function WsidDetailPage() {
  const { wsid } = useParams<{ wsid: string }>();
  const navigate = useNavigate();
  const { machines } = useDataStore();
  const [expandedMonth, setExpandedMonth] = useState<string | null>(null);

  const machine = useMemo(() => {
    return machines.find(m => m.wsid === wsid) || null;
  }, [machines, wsid]);

  if (!machine) {
    return (
      <div className="flex flex-col items-center justify-center h-[50vh] space-y-4">
        <Server size={48} className="text-slate-300" />
        <h2 className="text-2xl font-bold text-slate-700">WSID Tidak Ditemukan</h2>
        <p className="text-slate-500">Mesin dengan WSID {wsid} tidak ada dalam database aktif.</p>
        <button 
          onClick={() => navigate('/all-wsid')}
          className="px-4 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors shadow-sm font-semibold"
        >
          Kembali ke Daftar WSID
        </button>
      </div>
    );
  }

  // Sort monthlyData by periode (Bulan) chronologically ascending
  const sortedMonthlyData = [...machine.monthlyData].sort((a, b) => normalizePeriode(a.periode).localeCompare(normalizePeriode(b.periode)));

  const latestHealth = useMemo(() => {
    if (!machine) return null;
    return evaluateMachineHealth(machine);
  }, [machine]);

  const formatNum = (val: number | undefined) => {
    if (val === undefined) return 0;
    return typeof val === 'number' && !Number.isInteger(val) ? val.toFixed(2) : val;
  };

  const formatBulan = (periode: string) => {
    return formatBulanTahun(periode);
  };

  const toggleExpand = (periode: string) => {
    setExpandedMonth(prev => prev === periode ? null : periode);
  };

  const handleExport = () => {
    exportWsidDetailExcel(machine);
  };

  return (
    <div className="space-y-6 max-w-[1600px] mx-auto animate-fade-in pb-12">
      {/* Header Area */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-4">
          <button 
            onClick={() => navigate('/all-wsid')}
            className="p-2 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 text-slate-600 transition-colors shadow-sm"
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
              <Activity size={24} className="text-blue-600" />
              Detail Performa: {machine.wsid}
            </h2>
            <div className="text-slate-500 mt-1 flex items-center flex-wrap gap-2 text-sm md:text-base">
              <span>{machine.lokasi}</span>
              <span className="text-slate-300">|</span>
              <span className="font-semibold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded text-xs md:text-sm">Vendor: {machine.vendor || '-'}</span>
              <span className="text-slate-300">|</span>
              <span className="font-medium">{machine.tipeMesin}</span>
              {machine.hari && (
                <>
                  <span className="text-slate-300">|</span>
                  <span className="font-medium text-amber-700 bg-amber-50 px-2 py-0.5 rounded">HARI: {machine.hari}</span>
                </>
              )}
              {machine.jam && (
                <>
                  <span className="text-slate-300">|</span>
                  <span className="font-medium text-blue-700 bg-blue-50 px-2 py-0.5 rounded">JAM: {machine.jam}</span>
                </>
              )}
              {machine.opr && (
                <>
                  <span className="text-slate-300">|</span>
                  <span className="font-medium text-blue-700 bg-blue-50 px-2 py-0.5 rounded">OPR: {machine.opr}</span>
                </>
              )}
            </div>
          </div>
        </div>

        <button
          onClick={handleExport}
          className="flex items-center gap-2 px-4 py-2 bg-emerald-50 text-emerald-600 hover:bg-emerald-100 font-semibold rounded-xl transition-colors text-sm shadow-sm border border-emerald-200 whitespace-nowrap self-start md:self-auto"
        >
          <Download size={16} />
          <span>Export Excel</span>
        </button>
      </div>

      {/* SLA & Health Status Overview Card */}
      {latestHealth && (
        <div className={`p-5 rounded-2xl border ${latestHealth.bgColor} ${latestHealth.borderColor} shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4`}>
          <div className="space-y-1.5">
            <div className="flex items-center gap-2.5 flex-wrap">
              <span className={`px-3 py-1 rounded-full text-xs font-bold border ${latestHealth.badgeColor} flex items-center gap-1.5`}>
                {latestHealth.status === 'SAFE' && <CheckCircle2 size={13} />}
                {latestHealth.status === 'WARNING' && <AlertTriangle size={13} />}
                {latestHealth.status === 'CRITICAL' && <ShieldAlert size={13} />}
                Status Kesehatan: {latestHealth.statusLabel}
              </span>
              <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-white border border-slate-200 text-slate-700">
                Target SLA: {latestHealth.targetSla}% ({machine.jenisMesin || 'ATM'})
              </span>
              <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                latestHealth.currentUptime >= latestHealth.targetSla
                  ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                  : 'bg-red-100 text-red-800 border border-red-200'
              }`}>
                Uptime Terkini: {latestHealth.currentUptime}%
              </span>
              {latestHealth.consecutiveLowMonths > 0 && (
                <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-purple-100 border border-purple-200 text-purple-800">
                  {latestHealth.consecutiveLowMonths} Bulan Berturut-turut di bawah SLA {latestHealth.isChronicCritical ? '(Otomatis Kritis)' : '(Waspada)'}
                </span>
              )}
            </div>
            <p className="text-xs text-slate-700 font-medium pt-1">
              {latestHealth.status === 'SAFE' 
                ? 'Performa mesin prima memenuhi standar SLA operasional BCA.'
                : `Alasan utama: ${latestHealth.primaryReason}`}
            </p>
          </div>

          {latestHealth.status !== 'SAFE' && latestHealth.reasons.length > 0 && (
            <div className="bg-white/90 p-3.5 rounded-xl border border-slate-200 text-xs text-slate-700 max-w-lg shrink-0">
              <div className="font-bold text-slate-800 mb-1 flex items-center gap-1.5">
                <AlertTriangle size={14} className="text-amber-500" />
                <span>Rincian Faktor Masalah:</span>
              </div>
              <ul className="space-y-1 text-[11px] list-disc list-inside text-slate-600">
                {latestHealth.reasons.map((r, i) => (
                  <li key={i} className="leading-tight">{r}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Main Table Area */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-center">
            <thead className="bg-slate-800 text-white sticky top-0 z-10">
              <tr>
                <th rowSpan={2} className="px-4 py-3 font-semibold border-r border-slate-600 align-middle">Bulan</th>
                <th colSpan={3} className="px-4 py-2 font-semibold border-b border-r border-slate-600 bg-slate-700">Total Downtime</th>
                <th colSpan={3} className="px-4 py-2 font-semibold border-b border-r border-slate-600">Uang Habis (UH)</th>
                <th colSpan={3} className="px-4 py-2 font-semibold border-b border-r border-slate-600">Komunikasi (KOM)</th>
                <th colSpan={3} className="px-4 py-2 font-semibold border-b border-r border-slate-600">Uang Penuh (UP)</th>
                <th colSpan={3} className="px-4 py-2 font-semibold border-b border-r border-slate-600">Hardware (H/W)</th>
                <th colSpan={3} className="px-4 py-2 font-semibold border-b border-slate-600">Lain-lain (LL)</th>
              </tr>
              <tr className="bg-slate-700/50 text-slate-200 text-xs">
                {/* Total */}
                <th className="px-2 py-2 font-medium border-r border-slate-600 bg-slate-600">FRX</th>
                <th className="px-2 py-2 font-medium border-r border-slate-600 bg-slate-600">DUR</th>
                <th className="px-2 py-2 font-medium border-r border-slate-600 bg-slate-600">%</th>
                {/* UH */}
                <th className="px-2 py-2 font-medium border-r border-slate-600">FRX</th>
                <th className="px-2 py-2 font-medium border-r border-slate-600">DUR</th>
                <th className="px-2 py-2 font-medium border-r border-slate-600">%</th>
                {/* KOM */}
                <th className="px-2 py-2 font-medium border-r border-slate-600">FRX</th>
                <th className="px-2 py-2 font-medium border-r border-slate-600">DUR</th>
                <th className="px-2 py-2 font-medium border-r border-slate-600">%</th>
                {/* UP */}
                <th className="px-2 py-2 font-medium border-r border-slate-600">FRX</th>
                <th className="px-2 py-2 font-medium border-r border-slate-600">DUR</th>
                <th className="px-2 py-2 font-medium border-r border-slate-600">%</th>
                {/* HW */}
                <th className="px-2 py-2 font-medium border-r border-slate-600">FRX</th>
                <th className="px-2 py-2 font-medium border-r border-slate-600">DUR</th>
                <th className="px-2 py-2 font-medium border-r border-slate-600">%</th>
                {/* LL */}
                <th className="px-2 py-2 font-medium border-r border-slate-600">FRX</th>
                <th className="px-2 py-2 font-medium border-r border-slate-600">DUR</th>
                <th className="px-2 py-2 font-medium">%</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {sortedMonthlyData.length === 0 ? (
                <tr>
                  <td colSpan={19} className="px-6 py-12 text-center text-slate-500">
                    Tidak ada data bulanan untuk WSID ini.
                  </td>
                </tr>
              ) : (
                sortedMonthlyData.map((data, index) => {
                  const maxPct = Math.max(data.uh || 0, data.kom || 0, data.up || 0, data.hw || 0, data.ll || 0);
                  const getPctClass = (val: number | undefined) => {
                    const num = val || 0;
                    if (maxPct > 0 && num === maxPct) return 'text-red-600 font-bold';
                    return 'text-slate-700 font-medium';
                  };
                  
                  return (
                    <React.Fragment key={data.periode}>
                      <tr className={`hover:bg-slate-50 ${index % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}`}>
                        <td className="px-4 py-3 font-semibold text-slate-800 border-r border-slate-200">{formatBulan(data.periode)}</td>
                        
                        {/* Total */}
                        <td className="px-2 py-3 border-r border-slate-200 bg-blue-50/30">{formatNum(data.frxTotal)}</td>
                        <td className="px-2 py-3 border-r border-slate-200 bg-blue-50/30">{formatNum(data.durTotal)}</td>
                        <td className="px-2 py-3 border-r border-slate-200 bg-blue-50/30 font-bold text-rose-600">{formatNum(data.total)}%</td>
                        
                        {/* UH */}
                        <td className="px-2 py-3 border-r border-slate-100">{formatNum(data.uhFrx)}</td>
                        <td className="px-2 py-3 border-r border-slate-100">{formatNum(data.uhDur)}</td>
                        <td className={`px-2 py-3 border-r border-slate-200 ${getPctClass(data.uh)}`}>{formatNum(data.uh)}%</td>
                        
                        {/* KOM */}
                        <td className="px-2 py-3 border-r border-slate-100">{formatNum(data.komFrx)}</td>
                        <td className="px-2 py-3 border-r border-slate-100">{formatNum(data.komDur)}</td>
                        <td className={`px-2 py-3 border-r border-slate-200 ${getPctClass(data.kom)}`}>{formatNum(data.kom)}%</td>
                        
                        {/* UP */}
                        <td className="px-2 py-3 border-r border-slate-100">{formatNum(data.upFrx)}</td>
                        <td className="px-2 py-3 border-r border-slate-100">{formatNum(data.upDur)}</td>
                        <td className={`px-2 py-3 border-r border-slate-200 ${getPctClass(data.up)}`}>{formatNum(data.up)}%</td>
                        
                        {/* HW */}
                        <td 
                          colSpan={3} 
                          className="border-r border-slate-200 p-0 cursor-pointer hover:bg-slate-100 transition-colors"
                          onClick={() => toggleExpand(data.periode)}
                        >
                          <div className="flex items-center justify-between px-2 py-3 h-full w-full">
                            <div className="flex-1 flex gap-2 justify-center">
                              <span className="w-8 text-center">{formatNum(data.hwFrx)}</span>
                              <span className="w-8 text-center">{formatNum(data.hwDur)}</span>
                              <span className={`w-10 text-center ${getPctClass(data.hw)}`}>{formatNum(data.hw)}%</span>
                            </div>
                            {expandedMonth === data.periode ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
                          </div>
                        </td>
                        
                        {/* LL */}
                        <td className="px-2 py-3 border-r border-slate-100">{formatNum(data.llFrx)}</td>
                        <td className="px-2 py-3 border-r border-slate-100">{formatNum(data.llDur)}</td>
                        <td className={`px-2 py-3 ${getPctClass(data.ll)}`}>{formatNum(data.ll)}%</td>
                      </tr>
                      {expandedMonth === data.periode && (
                        <tr>
                          <td colSpan={19} className="p-0 border-b border-slate-200 bg-slate-100/50">
                            <div className="p-4 flex gap-4 overflow-x-auto">
                              <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden flex-1 max-w-[800px]">
                                <table className="w-full text-xs text-left">
                                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                                    <tr>
                                      <th className="px-3 py-2 font-medium border-r border-slate-200">Hardware Sub-Kategori</th>
                                      <th className="px-3 py-2 font-medium border-r border-slate-200 text-center w-16">FRX</th>
                                      <th className="px-3 py-2 font-medium border-r border-slate-200 text-center w-16">DUR</th>
                                      <th className="px-3 py-2 font-medium text-center w-16">%</th>
                                    </tr>
                                  </thead>
                                   <tbody className="divide-y divide-slate-100">
                                    {(() => {
                                      const subEntries = Object.entries(data.hwSubCategories || {});
                                      const items = subEntries.length > 0
                                        ? subEntries.map(([key, vals]) => ({ key, frx: vals.frx || 0, dur: vals.dur || 0, pct: vals.pct || 0 }))
                                        : Object.entries(data.hwDetail || {}).map(([key, pct]) => ({ key, frx: 0, dur: 0, pct: Number(pct) || 0 }));
                                      
                                      const filtered = items.filter(i => i.pct > 0 || i.frx > 0 || i.dur > 0);
                                      if (filtered.length === 0) {
                                        return (
                                          <tr>
                                            <td colSpan={4} className="px-3 py-3 text-center text-slate-400">
                                              Tidak ada detail sub-kategori hardware untuk bulan ini.
                                            </td>
                                          </tr>
                                        );
                                      }

                                      return filtered.map(item => (
                                        <tr key={item.key} className="hover:bg-slate-50">
                                          <td className="px-3 py-2 border-r border-slate-100">{hwDetailMap[item.key] || item.key}</td>
                                          <td className="px-3 py-2 border-r border-slate-100 text-center">{formatNum(item.frx)}</td>
                                          <td className="px-3 py-2 border-r border-slate-100 text-center">{formatNum(item.dur)}</td>
                                          <td className={`px-3 py-2 text-center ${item.pct > 1 ? 'text-red-600 font-bold' : 'font-medium text-slate-700'}`}>{formatNum(item.pct)}%</td>
                                        </tr>
                                      ));
                                    })()}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
