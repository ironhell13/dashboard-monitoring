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
    <div className="space-y-3.5 max-w-[1600px] mx-auto animate-fade-in pb-8">
      {/* Header Area */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-2.5 mb-2">
        <div className="flex items-center gap-2.5">
          <button 
            onClick={() => navigate('/all-wsid')}
            className="w-7 h-7 bg-white border border-[#E5EAF2] rounded-md hover:bg-slate-50 text-slate-600 flex items-center justify-center transition-colors shadow-2xs cursor-pointer"
            title="Kembali ke Daftar WSID"
          >
            <ArrowLeft size={15} />
          </button>
          <div>
            <h2 className="text-lg font-bold text-slate-900 tracking-tight flex items-center gap-1.5">
              <Activity size={17} className="text-blue-600" />
              Detail Performa: {machine.wsid}
            </h2>
            <div className="text-slate-500 mt-0.5 flex items-center flex-wrap gap-1.5 text-xs">
              <span className="font-medium text-slate-700">{machine.lokasi}</span>
              <span className="text-slate-300">•</span>
              <span className="font-medium text-slate-700 bg-slate-100 px-1.5 py-0.2 rounded border border-slate-200 text-[10px]">Vendor: {machine.vendor || '-'}</span>
              <span className="text-slate-300">•</span>
              <span>{machine.tipeMesin}</span>
              {machine.hari && (
                <>
                  <span className="text-slate-300">•</span>
                  <span className="font-medium text-slate-700 bg-slate-50 px-1 py-0.2 rounded text-[9px] border border-slate-200">HARI: {machine.hari}</span>
                </>
              )}
              {machine.jam && (
                <>
                  <span className="text-slate-300">•</span>
                  <span className="font-medium text-slate-700 bg-slate-50 px-1 py-0.2 rounded text-[9px] border border-slate-200">JAM: {machine.jam}</span>
                </>
              )}
              {machine.opr && (
                <>
                  <span className="text-slate-300">•</span>
                  <span className="font-medium text-slate-700 bg-slate-50 px-1 py-0.2 rounded text-[9px] border border-slate-200">OPR: {machine.opr}</span>
                </>
              )}
            </div>
          </div>
        </div>

        <button
          onClick={handleExport}
          className="flex items-center gap-1.5 px-3 h-8 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-md transition-colors text-xs shadow-2xs whitespace-nowrap self-start md:self-auto cursor-pointer"
        >
          <Download size={13} />
          <span>Export Excel</span>
        </button>
      </div>

      {/* SLA & Health Status Overview Card */}
      {latestHealth && (
        <div className="p-3 rounded-lg border border-[#E5EAF2] bg-white shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className={`px-1.5 py-0.2 rounded text-[10px] font-semibold border ${latestHealth.badgeColor} flex items-center gap-1`}>
                {latestHealth.status === 'SAFE' && <CheckCircle2 size={11} />}
                {latestHealth.status === 'WARNING' && <AlertTriangle size={11} />}
                {latestHealth.status === 'CRITICAL' && <ShieldAlert size={11} />}
                Status: {latestHealth.statusLabel}
              </span>
              <span className="text-[10px] font-medium px-1.5 py-0.2 rounded bg-slate-50 border border-[#E5EAF2] text-slate-700">
                Target SLA: {latestHealth.targetSla}% ({machine.jenisMesin || 'ATM'})
              </span>
              <span className={`text-[10px] font-semibold px-1.5 py-0.2 rounded border ${
                latestHealth.currentUptime >= latestHealth.targetSla
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : 'bg-rose-50 text-rose-700 border-rose-200'
              }`}>
                Uptime Terkini: {latestHealth.currentUptime}%
              </span>
              {latestHealth.consecutiveLowMonths > 0 && (
                <span className="text-[10px] font-medium px-1.5 py-0.2 rounded bg-purple-50 border border-purple-200 text-purple-700">
                  {latestHealth.consecutiveLowMonths} Bulan Berturut di bawah SLA {latestHealth.isChronicCritical ? '(Kronis Kritis)' : '(Waspada)'}
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-600 pt-0.5">
              {latestHealth.status === 'SAFE' 
                ? 'Performa mesin prima memenuhi standar SLA operasional BCA.'
                : `Alasan utama: ${latestHealth.primaryReason}`}
            </p>
          </div>

          {latestHealth.status !== 'SAFE' && latestHealth.reasons.length > 0 && (
            <div className="bg-slate-50 p-2.5 rounded-lg border border-[#E5EAF2] text-xs text-slate-700 max-w-lg shrink-0">
              <div className="font-semibold text-slate-800 mb-1 flex items-center gap-1 text-[10px]">
                <AlertTriangle size={12} className="text-amber-500" />
                <span>Rincian Faktor Masalah:</span>
              </div>
              <ul className="space-y-0.5 text-[10px] list-disc list-inside text-slate-600">
                {latestHealth.reasons.map((r, i) => (
                  <li key={i} className="leading-tight">{r}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Main Table Area */}
      <div className="bg-white rounded-lg shadow-2xs border border-[#E5EAF2] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-center border-collapse">
            <thead className="sticky top-0 z-10 text-[11px]">
              <tr className="bg-[#F8FAFC] text-slate-700 font-semibold border-b border-[#E5EAF2]">
                <th rowSpan={2} className="px-2.5 py-1.5 border-r border-[#E5EAF2] align-middle text-left font-semibold">Bulan</th>
                <th colSpan={3} className="px-2.5 py-1 border-b border-r border-[#E5EAF2] bg-blue-50/50 text-blue-900 font-semibold">Total Downtime</th>
                <th colSpan={3} className="px-2.5 py-1 border-b border-r border-[#E5EAF2] font-semibold">Uang Habis (UH)</th>
                <th colSpan={3} className="px-2.5 py-1 border-b border-r border-[#E5EAF2] font-semibold">Komunikasi (KOM)</th>
                <th colSpan={3} className="px-2.5 py-1 border-b border-r border-[#E5EAF2] font-semibold">Uang Penuh (UP)</th>
                <th colSpan={3} className="px-2.5 py-1 border-b border-r border-[#E5EAF2] font-semibold">Hardware (H/W)</th>
                <th colSpan={3} className="px-3 py-1.5 border-b border-[#E5EAF2] font-semibold">Lain-lain (LL)</th>
              </tr>
              <tr className="bg-slate-50 text-slate-500 text-[11px] border-b border-[#E5EAF2]">
                {/* Total */}
                <th className="px-2 py-1.5 font-medium border-r border-[#E5EAF2] bg-blue-50/70 text-blue-800">FRX</th>
                <th className="px-2 py-1.5 font-medium border-r border-[#E5EAF2] bg-blue-50/70 text-blue-800">DUR</th>
                <th className="px-2 py-1.5 font-medium border-r border-[#E5EAF2] bg-blue-50/70 text-blue-800">%</th>
                {/* UH */}
                <th className="px-2 py-1.5 font-medium border-r border-[#E5EAF2]">FRX</th>
                <th className="px-2 py-1.5 font-medium border-r border-[#E5EAF2]">DUR</th>
                <th className="px-2 py-1.5 font-medium border-r border-[#E5EAF2]">%</th>
                {/* KOM */}
                <th className="px-2 py-1.5 font-medium border-r border-[#E5EAF2]">FRX</th>
                <th className="px-2 py-1.5 font-medium border-r border-[#E5EAF2]">DUR</th>
                <th className="px-2 py-1.5 font-medium border-r border-[#E5EAF2]">%</th>
                {/* UP */}
                <th className="px-2 py-1.5 font-medium border-r border-[#E5EAF2]">FRX</th>
                <th className="px-2 py-1.5 font-medium border-r border-[#E5EAF2]">DUR</th>
                <th className="px-2 py-1.5 font-medium border-r border-[#E5EAF2]">%</th>
                {/* HW */}
                <th className="px-2 py-1.5 font-medium border-r border-[#E5EAF2]">FRX</th>
                <th className="px-2 py-1.5 font-medium border-r border-[#E5EAF2]">DUR</th>
                <th className="px-2 py-1.5 font-medium border-r border-[#E5EAF2]">%</th>
                {/* LL */}
                <th className="px-2 py-1.5 font-medium border-r border-[#E5EAF2]">FRX</th>
                <th className="px-2 py-1.5 font-medium border-r border-[#E5EAF2]">DUR</th>
                <th className="px-2 py-1.5 font-medium">%</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E5EAF2] text-slate-700">
              {sortedMonthlyData.length === 0 ? (
                <tr>
                  <td colSpan={19} className="px-4 py-10 text-center text-slate-400">
                    Tidak ada data bulanan untuk WSID ini.
                  </td>
                </tr>
              ) : (
                sortedMonthlyData.map((data, index) => {
                  const maxPct = Math.max(data.uh || 0, data.kom || 0, data.up || 0, data.hw || 0, data.ll || 0);
                  const getPctClass = (val: number | undefined) => {
                    const num = val || 0;
                    if (maxPct > 0 && num === maxPct) return 'text-rose-600 font-semibold';
                    return 'text-slate-700 font-medium';
                  };
                  
                  return (
                    <React.Fragment key={data.periode}>
                      <tr className={`hover:bg-slate-50/70 transition-colors ${index % 2 === 0 ? 'bg-white' : 'bg-[#F8FAFC]/50'}`}>
                        <td className="px-3 py-2.5 font-semibold text-slate-900 border-r border-[#E5EAF2] text-left">{formatBulan(data.periode)}</td>
                        
                        {/* Total */}
                        <td className="px-2 py-2.5 border-r border-[#E5EAF2] bg-blue-50/30">{formatNum(data.frxTotal)}</td>
                        <td className="px-2 py-2.5 border-r border-[#E5EAF2] bg-blue-50/30">{formatNum(data.durTotal)}</td>
                        <td className="px-2 py-2.5 border-r border-[#E5EAF2] bg-blue-50/30 font-bold text-rose-600">{formatNum(data.total)}%</td>
                        
                        {/* UH */}
                        <td className="px-2 py-2.5 border-r border-[#E5EAF2]">{formatNum(data.uhFrx)}</td>
                        <td className="px-2 py-2.5 border-r border-[#E5EAF2]">{formatNum(data.uhDur)}</td>
                        <td className={`px-2 py-2.5 border-r border-[#E5EAF2] ${getPctClass(data.uh)}`}>{formatNum(data.uh)}%</td>
                        
                        {/* KOM */}
                        <td className="px-2 py-2.5 border-r border-[#E5EAF2]">{formatNum(data.komFrx)}</td>
                        <td className="px-2 py-2.5 border-r border-[#E5EAF2]">{formatNum(data.komDur)}</td>
                        <td className={`px-2 py-2.5 border-r border-[#E5EAF2] ${getPctClass(data.kom)}`}>{formatNum(data.kom)}%</td>
                        
                        {/* UP */}
                        <td className="px-2 py-2.5 border-r border-[#E5EAF2]">{formatNum(data.upFrx)}</td>
                        <td className="px-2 py-2.5 border-r border-[#E5EAF2]">{formatNum(data.upDur)}</td>
                        <td className={`px-2 py-2.5 border-r border-[#E5EAF2] ${getPctClass(data.up)}`}>{formatNum(data.up)}%</td>
                        
                        {/* HW */}
                        <td 
                          colSpan={3} 
                          className="border-r border-[#E5EAF2] p-0 cursor-pointer hover:bg-blue-50/30 transition-colors"
                          onClick={() => toggleExpand(data.periode)}
                        >
                          <div className="flex items-center justify-between px-2 py-2.5 h-full w-full">
                            <div className="flex-1 flex gap-2 justify-center">
                              <span className="w-8 text-center">{formatNum(data.hwFrx)}</span>
                              <span className="w-8 text-center">{formatNum(data.hwDur)}</span>
                              <span className={`w-10 text-center ${getPctClass(data.hw)}`}>{formatNum(data.hw)}%</span>
                            </div>
                            {expandedMonth === data.periode ? <ChevronUp size={14} className="text-blue-600" /> : <ChevronDown size={14} className="text-slate-400" />}
                          </div>
                        </td>
                        
                        {/* LL */}
                        <td className="px-2 py-2.5 border-r border-[#E5EAF2]">{formatNum(data.llFrx)}</td>
                        <td className="px-2 py-2.5 border-r border-[#E5EAF2]">{formatNum(data.llDur)}</td>
                        <td className={`px-2 py-2.5 ${getPctClass(data.ll)}`}>{formatNum(data.ll)}%</td>
                      </tr>
                      {expandedMonth === data.periode && (
                        <tr>
                          <td colSpan={19} className="p-3 border-b border-[#E5EAF2] bg-[#F8FAFC]">
                            <div className="bg-white rounded-lg border border-[#E5EAF2] shadow-2xs overflow-hidden max-w-[700px] text-left">
                              <div className="bg-slate-50 px-3 py-1.5 border-b border-[#E5EAF2] text-slate-700 font-semibold text-xs">
                                Rincian Sub-Kategori Hardware
                              </div>
                              <table className="w-full text-xs text-left">
                                <thead className="bg-[#F8FAFC] border-b border-[#E5EAF2] text-slate-600 font-medium">
                                  <tr>
                                    <th className="px-3 py-1.5 border-r border-[#E5EAF2]">Sub-Kategori</th>
                                    <th className="px-3 py-1.5 border-r border-[#E5EAF2] text-center w-16">FRX</th>
                                    <th className="px-3 py-1.5 border-r border-[#E5EAF2] text-center w-16">DUR</th>
                                    <th className="px-3 py-1.5 text-center w-16">%</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-[#E5EAF2]">
                                  {(() => {
                                    const subEntries = Object.entries(data.hwSubCategories || {});
                                    const items = subEntries.length > 0
                                      ? subEntries.map(([key, vals]) => ({ key, frx: vals.frx || 0, dur: vals.dur || 0, pct: vals.pct || 0 }))
                                      : Object.entries(data.hwDetail || {}).map(([key, pct]) => ({ key, frx: 0, dur: 0, pct: Number(pct) || 0 }));
                                    
                                    const filtered = items.filter(i => i.pct > 0 || i.frx > 0 || i.dur > 0);
                                    if (filtered.length === 0) {
                                      return (
                                        <tr>
                                          <td colSpan={4} className="px-3 py-2.5 text-center text-slate-400">
                                            Tidak ada detail sub-kategori hardware untuk bulan ini.
                                          </td>
                                        </tr>
                                      );
                                    }

                                    return filtered.map(item => (
                                      <tr key={item.key} className="hover:bg-slate-50/70">
                                        <td className="px-3 py-1.5 border-r border-[#E5EAF2] text-slate-700">{hwDetailMap[item.key] || item.key}</td>
                                        <td className="px-3 py-1.5 border-r border-[#E5EAF2] text-center text-slate-700">{formatNum(item.frx)}</td>
                                        <td className="px-3 py-1.5 border-r border-[#E5EAF2] text-center text-slate-700">{formatNum(item.dur)}</td>
                                        <td className={`px-3 py-1.5 text-center ${item.pct > 1 ? 'text-rose-600 font-semibold' : 'text-slate-700'}`}>{formatNum(item.pct)}%</td>
                                      </tr>
                                    ));
                                  })()}
                                </tbody>
                              </table>
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
