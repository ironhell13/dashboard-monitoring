import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useFilteredData } from '../hooks/useFilteredData';
import { useDataStore, type MachineData } from '../store/useDataStore';
import * as XLSX from 'xlsx';
import { Download, MapPin, ChevronDown, ChevronUp, ArrowUpDown, ArrowUp, ArrowDown, X, ChevronRight } from 'lucide-react';
import { exportServicePointExcel, SERVICE_POINT_MAP, getServicePointName } from '../utils/comprehensiveExporter';
import { cleanSektorName } from '../utils/dailyIncidentParser';
import { aggregateMachinesData, getFrxDurForCategory } from '../utils/problemCalculator';

interface SektorStats {
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
  bcaMachines: MachineData[];
}

interface ServicePointRow {
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
  sektorList: SektorStats[];
}

export default function ServicePointPage() {
  const navigate = useNavigate();
  const filteredData = useFilteredData();
  const [expandedSP, setExpandedSP] = useState<string | null>(null);
  const [expandedSektor, setExpandedSektor] = useState<string | null>(null);
  const [selectedWsid, setSelectedWsid] = useState<string | null>(null);
  const [showDetailCategories, setShowDetailCategories] = useState(false);

  const selectedMachine = useMemo(() => {
    if (!selectedWsid) return null;
    return filteredData.find(m => m.wsid === selectedWsid) || null;
  }, [selectedWsid, filteredData]);
  
  const handleSelectWsid = (wsid: string) => {
    if (selectedWsid === wsid) {
      setSelectedWsid(null);
      setShowDetailCategories(false);
    } else {
      setSelectedWsid(wsid);
      setShowDetailCategories(false);
    }
  };

  type SortKey = 'servicePoint' | 'jumlahSektor' | 'jumlahMesin' | 'rataRataUptime';
  const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: 'asc' | 'desc' } | null>({ key: 'rataRataUptime', direction: 'asc' });

  const dataServicePoint: ServicePointRow[] = useMemo(() => {
    const map = new Map<string, {
      servicePoint: string, 
      machines: MachineData[],
      machinesBCA: MachineData[],
      sektorMap: Map<string, MachineData[]>
    }>();

    filteredData.forEach(m => {
      const groupName = getServicePointName(m.sektorBCA, m.wilayahOperasional);

      if (!map.has(groupName)) {
        map.set(groupName, { servicePoint: groupName, machines: [], machinesBCA: [], sektorMap: new Map() });
      }
      
      const item = map.get(groupName)!;
      item.machines.push(m);
      if (m.klienStatus === 'BCA') {
        item.machinesBCA.push(m);
      }

      const clean = cleanSektorName(m.sektorBCA);
      const sektorName = clean !== '-' ? clean : (m.sektorBCA || 'Unknown Sektor');
      if (!item.sektorMap.has(sektorName)) {
        item.sektorMap.set(sektorName, []);
      }
      item.sektorMap.get(sektorName)!.push(m);
    });

    const result: ServicePointRow[] = Array.from(map.values()).map(item => {
      // Hanya menghitung mesin yang statusnya aktif
      const allActive = item.machines.filter(m => m.statusAktif?.trim().toUpperCase() === 'AKTIF');
      const bcaActive = item.machinesBCA.filter(m => m.statusAktif?.trim().toUpperCase() === 'AKTIF');

      const aggregated = aggregateMachinesData(item.machinesBCA);
      const rataRataDowntime = aggregated?.total || 0;
      const rataRataUptime = 100 - rataRataDowntime;

      const sektorList: SektorStats[] = Array.from(item.sektorMap.entries()).map(([sName, sMachines]) => {
        const bcaInSektor = sMachines.filter(m => m.klienStatus === 'BCA');
        const activeBcaInSektor = bcaInSektor.filter(m => m.statusAktif?.trim().toUpperCase() === 'AKTIF');
        const sAgg = aggregateMachinesData(bcaInSektor);
        const sDown = sAgg?.total || 0;
        return {
          namaSektor: sName,
          jumlahMesin: activeBcaInSektor.length,
          uptime: 100 - sDown,
          downtime: sDown,
          uh: sAgg?.uh || 0,
          kom: sAgg?.kom || 0,
          up: sAgg?.up || 0,
          hw: sAgg?.hw || 0,
          ll: sAgg?.ll || 0,
          bcaMachines: activeBcaInSektor
        };
      }).sort((a, b) => a.uptime - b.uptime); // sort by uptime ascending (worst first)

      return {
        servicePoint: item.servicePoint,
        jumlahSektor: item.sektorMap.size,
        jumlahMesin: allActive.length,
        rataRataUptime,
        rataRataDowntime,
        uh: aggregated?.uh || 0,
        kom: aggregated?.kom || 0,
        up: aggregated?.up || 0,
        hw: aggregated?.hw || 0,
        ll: aggregated?.ll || 0,
        sektorList
      };
    });

    if (sortConfig) {
      result.sort((a, b) => {
        const aVal = a[sortConfig.key];
        const bVal = b[sortConfig.key];
        if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
        if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }

    return result;
  }, [filteredData, sortConfig]);

  const handleSort = (key: SortKey) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const renderSortIcon = (key: SortKey) => {
    if (!sortConfig || sortConfig.key !== key) {
      return <ArrowUpDown size={14} className="inline ml-1 text-slate-300 group-hover:text-slate-500" />;
    }
    return sortConfig.direction === 'asc' 
      ? <ArrowUp size={14} className="inline ml-1 text-indigo-500" />
      : <ArrowDown size={14} className="inline ml-1 text-indigo-500" />;
  };

  const handleExport = () => {
    exportServicePointExcel(dataServicePoint);
  };

  const toggleExpand = (sp: string) => {
    if (expandedSP === sp) {
      setExpandedSP(null);
      setExpandedSektor(null);
    } else {
      setExpandedSP(sp);
      setExpandedSektor(null);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">
            Distribusi Mesin per Service Point
          </h2>
          <p className="text-slate-500 text-sm mt-1">
            Dikelompokkan berdasarkan Service Point.
          </p>
        </div>
      </div>

      <div className={`grid grid-cols-1 ${selectedWsid ? 'xl:grid-cols-3' : ''} gap-6 transition-all duration-300`}>
        <div className={`glass-card rounded-2xl overflow-hidden shadow-sm border border-slate-200 ${selectedWsid ? 'xl:col-span-2' : ''}`}>
        <div className="overflow-x-auto">
          <div className="p-4 bg-white border-b border-slate-100 flex justify-end">
            <button 
              onClick={handleExport}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-50 text-emerald-600 hover:bg-emerald-100 font-semibold rounded-lg transition-colors text-sm"
            >
              <Download size={16} />
              Export Excel
            </button>
          </div>
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50/80 text-slate-600 font-semibold border-b border-slate-200 select-none">
              <tr>
                <th className="px-6 py-4 cursor-pointer hover:bg-slate-100" onClick={() => handleSort('servicePoint')}>
                  Service Point {renderSortIcon('servicePoint')}
                </th>
                <th className="px-6 py-4 text-center cursor-pointer hover:bg-slate-100" onClick={() => handleSort('jumlahSektor')}>
                  Jumlah Sektor {renderSortIcon('jumlahSektor')}
                </th>
                <th className="px-6 py-4 text-center cursor-pointer hover:bg-slate-100" onClick={() => handleSort('jumlahMesin')}>
                  Jumlah Mesin Aktif {renderSortIcon('jumlahMesin')}
                </th>
                <th className="px-6 py-4 text-center cursor-pointer hover:bg-slate-100" onClick={() => handleSort('rataRataUptime')}>
                  Rata-rata Uptime (%) {renderSortIcon('rataRataUptime')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {dataServicePoint.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-6 py-12 text-center text-slate-500">
                    Tidak ada data yang tersedia untuk filter saat ini.
                  </td>
                </tr>
              ) : (
                dataServicePoint.map((row) => {
                  const isExpanded = expandedSP === row.servicePoint;
                  
                  return (
                    <React.Fragment key={row.servicePoint}>
                      <tr 
                        onClick={() => toggleExpand(row.servicePoint)}
                        className={`cursor-pointer transition-colors ${isExpanded ? 'bg-indigo-50/30' : 'hover:bg-slate-50/50'}`}
                      >
                        <td className="px-6 py-4 font-semibold text-slate-800">
                          <div className="flex items-center gap-2">
                            {isExpanded ? <ChevronUp size={16} className="text-indigo-500" /> : <ChevronDown size={16} className="text-slate-400" />}
                            {row.servicePoint}
                          </div>
                        </td>
                        <td className="px-6 py-4 text-center">
                          <span className="font-semibold text-slate-700 bg-slate-100 px-3 py-1 rounded-full">{row.jumlahSektor}</span>
                        </td>
                        <td className="px-6 py-4 text-center font-bold text-slate-700">{row.jumlahMesin.toLocaleString()}</td>
                        <td className="px-6 py-4 text-center font-semibold text-emerald-600">{row.rataRataUptime.toFixed(2)}%</td>
                      </tr>
                      {isExpanded && (
                        <tr>
                          <td colSpan={4} className="p-0 bg-slate-50 border-b-2 border-indigo-100">
                            <div className="p-6">
                              <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                                <div className="bg-indigo-50/50 px-4 py-3 border-b border-slate-200 flex justify-between items-center">
                                  <h4 className="font-bold text-indigo-800">Daftar Sektor dalam {row.servicePoint}</h4>
                                  <span className="text-xs font-semibold bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full">{row.sektorList.length} Sektor</span>
                                </div>
                                <div className="max-h-[400px] overflow-y-auto">
                                  <table className="w-full text-sm text-left">
                                    <thead className="bg-slate-50 sticky top-0 border-b border-slate-200 text-slate-500">
                                      <tr>
                                        <th className="px-6 py-3">Nama Sektor</th>
                                        <th className="px-6 py-3 text-center">Jumlah Mesin BCA Aktif</th>
                                        <th className="px-6 py-3 text-center">Uptime per Sektor (%)</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                      {row.sektorList.map((s, idx) => {
                                        const isSektorExpanded = expandedSektor === s.namaSektor;
                                        return (
                                          <React.Fragment key={idx}>
                                            <tr 
                                              className={`cursor-pointer transition-colors ${isSektorExpanded ? 'bg-indigo-50/20' : 'hover:bg-slate-50'}`}
                                              onClick={() => setExpandedSektor(isSektorExpanded ? null : s.namaSektor)}
                                            >
                                              <td className="px-6 py-3 font-medium text-slate-700">
                                                <div className="flex items-center gap-2">
                                                  {isSektorExpanded ? <ChevronUp size={14} className="text-indigo-500" /> : <ChevronDown size={14} className="text-slate-400" />}
                                                  {s.namaSektor}
                                                </div>
                                              </td>
                                              <td className="px-6 py-3 text-center text-slate-600">{s.jumlahMesin}</td>
                                              <td className="px-6 py-3 text-center font-semibold text-emerald-600">{s.uptime.toFixed(2)}%</td>
                                            </tr>
                                            {isSektorExpanded && (
                                              <tr>
                                                <td colSpan={3} className="p-0 bg-white border-b border-indigo-50">
                                                  <div className="px-8 py-4 bg-slate-50/50">
                                                    <h5 className="text-sm font-semibold text-slate-600 mb-3">Daftar WSID (Diurutkan dari Downtime Terburuk):</h5>
                                                    <div className="overflow-x-auto rounded-lg border border-slate-200">
                                                      <table className="w-full text-xs text-left bg-white">
                                                        <thead className="bg-slate-100 text-slate-500 border-b border-slate-200">
                                                          <tr>
                                                            <th className="px-4 py-2 font-semibold">WSID</th>
                                                            <th className="px-4 py-2 font-semibold">Lokasi</th>
                                                            <th className="px-4 py-2 font-semibold">Vendor</th>
                                                            <th className="px-4 py-2 font-semibold text-right">Downtime (%)</th>
                                                          </tr>
                                                        </thead>
                                                        <tbody className="divide-y divide-slate-100">
                                                          {s.bcaMachines
                                                            .map(m => {
                                                              const agg = aggregateMachinesData([m]);
                                                              const downtime = agg?.total || 0;
                                                              return { m, downtime };
                                                            })
                                                            .sort((a, b) => b.downtime - a.downtime)
                                                            .map((item, mIdx) => (
                                                            <tr 
                                                              key={mIdx} 
                                                              className={`cursor-pointer transition-colors ${selectedWsid === item.m.wsid ? 'bg-blue-50/80 border-l-4 border-blue-500' : 'hover:bg-slate-50 border-l-4 border-transparent'}`}
                                                              onClick={(e) => {
                                                                e.stopPropagation();
                                                                handleSelectWsid(item.m.wsid);
                                                              }}
                                                            >
                                                              <td className="px-4 py-2 font-bold text-slate-700">{item.m.wsid}</td>
                                                              <td className="px-4 py-2 text-slate-500 truncate max-w-[200px]" title={item.m.lokasi}>{item.m.lokasi}</td>
                                                              <td className="px-4 py-2 whitespace-nowrap">
                                                                <span className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded text-[11px] font-semibold border border-slate-200">
                                                                  {item.m.vendor || '-'}
                                                                </span>
                                                              </td>
                                                              <td className="px-4 py-2 font-semibold text-rose-500 text-right">{item.downtime.toFixed(2)}%</td>
                                                            </tr>
                                                          ))}
                                                          {s.bcaMachines.length === 0 && (
                                                            <tr>
                                                              <td colSpan={4} className="px-4 py-4 text-center text-slate-400">Tidak ada WSID</td>
                                                            </tr>
                                                          )}
                                                        </tbody>
                                                      </table>
                                                    </div>
                                                  </div>
                                                </td>
                                              </tr>
                                            )}
                                          </React.Fragment>
                                        );
                                      })}
                                    </tbody>
                                  </table>
                                </div>
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

      {/* Side Panel */}
      {selectedMachine && (
        <div className="xl:col-span-1 animate-slide-in-right">
          <div className="bg-white rounded-2xl shadow-lg border border-slate-200 overflow-hidden sticky top-6">
            <div className="bg-indigo-600 px-6 py-4 text-white flex justify-between items-center">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-lg">{selectedMachine.wsid}</h3>
                  {selectedMachine.vendor && selectedMachine.vendor !== '-' && (
                    <span className="px-2 py-0.5 bg-white/20 text-white rounded text-xs font-semibold tracking-wide">
                      {selectedMachine.vendor}
                    </span>
                  )}
                </div>
                <p className="text-indigo-100 text-xs truncate max-w-[250px]" title={selectedMachine.lokasi}>{selectedMachine.lokasi}</p>
              </div>
              <button 
                onClick={() => handleSelectWsid(selectedMachine.wsid)}
                className="p-1 hover:bg-white/20 rounded-full transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-6">
              {!showDetailCategories ? (
                <div className="space-y-6">
                  <div className="text-center">
                    <h4 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-4">Total Downtime</h4>
                    
                    <div className="grid grid-cols-2 gap-4 mb-4">
                      <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
                        <div className="text-xs text-slate-500 font-semibold mb-1">Total FRX</div>
                        <div className="text-2xl font-bold text-slate-800">{(selectedMachine as any).aggregatedData?.frxTotal?.toFixed(2) || 0}</div>
                      </div>
                      <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
                        <div className="text-xs text-slate-500 font-semibold mb-1">Total DUR</div>
                        <div className="text-2xl font-bold text-slate-800">{(selectedMachine as any).aggregatedData?.durTotal?.toFixed(2) || 0}</div>
                      </div>
                    </div>
                    
                    <div className="bg-rose-50 rounded-xl p-4 border border-rose-100">
                      <div className="text-xs text-rose-500 font-semibold mb-1">Total (%)</div>
                      <div className="text-3xl font-bold text-rose-600">{((selectedMachine as any).aggregatedData?.total || 0).toFixed(2)}%</div>
                    </div>
                  </div>

                  <button 
                    onClick={() => setShowDetailCategories(true)}
                    className="w-full py-3 px-4 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 font-semibold rounded-xl transition-colors flex items-center justify-center gap-2 mt-4"
                  >
                    Lihat Detail per Kategori
                    <ChevronRight size={18} />
                  </button>
                </div>
              ) : (
                <div className="space-y-4 animate-fade-in">
                  <div className="flex items-center gap-2 mb-4 pb-2 border-b border-slate-100">
                    <button 
                      onClick={() => setShowDetailCategories(false)}
                      className="p-1 hover:bg-slate-100 rounded-lg text-slate-500 transition-colors"
                    >
                      <ChevronRight size={20} className="rotate-180" />
                    </button>
                    <h4 className="font-bold text-slate-700">Detail per Kategori</h4>
                  </div>
                  
                  <div className="space-y-3 max-h-[calc(100vh-320px)] overflow-y-auto pr-2">
                    <button 
                      onClick={() => navigate(`/wsid/${selectedMachine.wsid}`)}
                      className="w-full py-2.5 px-4 mb-2 bg-blue-600 text-white hover:bg-blue-700 font-semibold rounded-xl transition-colors flex items-center justify-center gap-2"
                    >
                      Detail Tiap Bulan
                      <ChevronRight size={16} />
                    </button>
                    {['uh', 'kom', 'up', 'hw', 'll'].map(cat => {
                      const agg = (selectedMachine as any).aggregatedData;
                      const frxDur = getFrxDurForCategory(agg, cat);
                      const pct = agg[cat] || 0;
                      
                      const labelMap: Record<string, string> = {
                        'uh': 'Uang Habis (UH)',
                        'kom': 'Komunikasi (KOM)',
                        'up': 'Uang Penuh (UP)',
                        'hw': 'Hardware (H/W)',
                        'll': 'Lain-lain (LL)'
                      };
                      
                      return (
                        <div key={cat} className="bg-white border border-slate-200 rounded-xl p-3 shadow-sm hover:border-indigo-300 transition-colors">
                          <div className="font-semibold text-slate-700 text-sm mb-2 pb-2 border-b border-slate-100">{labelMap[cat]}</div>
                          <div className="flex justify-between items-center text-xs">
                            <div className="text-center px-2 flex-1">
                              <div className="text-slate-400 mb-0.5">FREQ</div>
                              <div className="font-bold text-slate-700">{typeof frxDur.frx === 'number' ? frxDur.frx.toFixed(2) : frxDur.frx}</div>
                            </div>
                            <div className="w-px h-6 bg-slate-100"></div>
                            <div className="text-center px-2 flex-1">
                              <div className="text-slate-400 mb-0.5">DUR</div>
                              <div className="font-bold text-slate-700">{typeof frxDur.dur === 'number' ? frxDur.dur.toFixed(2) : frxDur.dur}</div>
                            </div>
                            <div className="w-px h-6 bg-slate-100"></div>
                            <div className="text-center px-2 flex-1">
                              <div className="text-slate-400 mb-0.5">%</div>
                              <div className="font-bold text-rose-600">{pct.toFixed(2)}%</div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}
