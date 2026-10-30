import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useFilteredData } from '../hooks/useFilteredData';
import { useDataStore, type MachineData } from '../store/useDataStore';
import * as XLSX from 'xlsx';
import { Download, MapPin, ChevronDown, ChevronUp, ArrowUpDown, ArrowUp, ArrowDown, X, ChevronRight } from 'lucide-react';
import { exportServicePointExcel, SERVICE_POINT_MAP, getServicePointName } from '../utils/comprehensiveExporter';
import { cleanSektorName } from '../utils/dailyIncidentParser';
import { aggregateMachinesData, getFrxDurForCategory } from '../utils/problemCalculator';
import StickyTableWrapper from '../components/StickyTableWrapper';

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
      ? <ArrowUp size={14} className="inline ml-1 text-blue-600" />
      : <ArrowDown size={14} className="inline ml-1 text-blue-600" />;
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
    <div className="space-y-3.5 animate-fade-in pb-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-2.5">
        <div>
          <h2 className="text-lg font-bold text-slate-900 tracking-tight">
            Distribusi Mesin per Service Point
          </h2>
          <p className="text-slate-500 text-xs mt-0.5">
            Daftar hierarki performa uptime dan downtime dikelompokkan berdasarkan Service Point.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button 
            onClick={handleExport}
            className="flex items-center gap-1.5 px-3 h-8 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-md transition-colors text-xs shadow-2xs cursor-pointer"
          >
            <Download size={13} />
            <span>Export Excel</span>
          </button>
        </div>
      </div>

      <div className={`grid grid-cols-1 ${selectedMachine ? 'xl:grid-cols-3' : ''} gap-4 transition-all duration-200`}>
        <div className={`bg-white rounded-lg border border-[#E5EAF2] shadow-2xs overflow-hidden ${selectedMachine ? 'xl:col-span-2' : ''}`}>
          <StickyTableWrapper>
            <table className="w-full text-xs text-left">
              <thead className="bg-[#F8FAFC] text-slate-600 font-semibold border-b border-[#E5EAF2] select-none text-[11px]">
                <tr>
                  <th className="px-3 py-1.5 cursor-pointer hover:bg-slate-100/70 transition-colors" onClick={() => handleSort('servicePoint')}>
                    Service Point {renderSortIcon('servicePoint')}
                  </th>
                  <th className="px-3 py-1.5 text-center cursor-pointer hover:bg-slate-100/70 transition-colors" onClick={() => handleSort('jumlahSektor')}>
                    Jumlah Sektor {renderSortIcon('jumlahSektor')}
                  </th>
                  <th className="px-3 py-1.5 text-center cursor-pointer hover:bg-slate-100/70 transition-colors" onClick={() => handleSort('jumlahMesin')}>
                    Jumlah Mesin Aktif {renderSortIcon('jumlahMesin')}
                  </th>
                  <th className="px-3 py-1.5 text-center cursor-pointer hover:bg-slate-100/70 transition-colors" onClick={() => handleSort('rataRataUptime')}>
                    Rata-rata Uptime (%) {renderSortIcon('rataRataUptime')}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E5EAF2]">
                {dataServicePoint.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-3 py-8 text-center text-slate-500">
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
                          className={`cursor-pointer transition-colors ${isExpanded ? 'bg-blue-50/30' : 'hover:bg-slate-50/70'}`}
                        >
                          <td className="px-3 py-1.5 font-semibold text-slate-900">
                            <div className="flex items-center gap-1.5">
                              {isExpanded ? <ChevronUp size={14} className="text-blue-600" /> : <ChevronDown size={14} className="text-slate-400" />}
                              {row.servicePoint}
                            </div>
                          </td>
                          <td className="px-3 py-1.5 text-center">
                            <span className="font-medium text-slate-700 bg-slate-100 px-2 py-0.2 rounded text-[10px] border border-slate-200">{row.jumlahSektor}</span>
                          </td>
                          <td className="px-3 py-1.5 text-center font-semibold text-slate-800">{row.jumlahMesin.toLocaleString()}</td>
                          <td className="px-3 py-1.5 text-center font-semibold text-emerald-700">{row.rataRataUptime.toFixed(2)}%</td>
                        </tr>
                        {isExpanded && (
                          <tr>
                            <td colSpan={4} className="p-0 bg-[#F8FAFC] border-b border-[#E5EAF2]">
                              <div className="p-4">
                                <div className="bg-white rounded-lg border border-[#E5EAF2] shadow-2xs overflow-hidden">
                                  <div className="bg-slate-50 px-4 py-2.5 border-b border-[#E5EAF2] flex justify-between items-center">
                                    <h4 className="font-semibold text-slate-800 text-xs">Daftar Sektor dalam {row.servicePoint}</h4>
                                    <span className="text-[11px] font-medium bg-blue-50 text-blue-700 px-2 py-0.5 rounded border border-blue-100">{row.sektorList.length} Sektor</span>
                                  </div>
                                  <div className="max-h-[400px] overflow-y-auto">
                                    <table className="w-full text-xs text-left">
                                      <thead className="bg-slate-50 sticky top-0 border-b border-[#E5EAF2] text-slate-600">
                                        <tr>
                                          <th className="px-4 py-2.5 font-semibold">Nama Sektor</th>
                                          <th className="px-4 py-2.5 text-center font-semibold">Jumlah Mesin BCA Aktif</th>
                                          <th className="px-4 py-2.5 text-center font-semibold">Uptime per Sektor (%)</th>
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-[#E5EAF2]">
                                        {row.sektorList.map((s, idx) => {
                                          const isSektorExpanded = expandedSektor === s.namaSektor;
                                          return (
                                            <React.Fragment key={idx}>
                                              <tr 
                                                className={`cursor-pointer transition-colors ${isSektorExpanded ? 'bg-blue-50/20' : 'hover:bg-slate-50'}`}
                                                onClick={() => setExpandedSektor(isSektorExpanded ? null : s.namaSektor)}
                                              >
                                                <td className="px-4 py-2.5 font-medium text-slate-800">
                                                  <div className="flex items-center gap-2">
                                                    {isSektorExpanded ? <ChevronUp size={13} className="text-blue-600" /> : <ChevronDown size={13} className="text-slate-400" />}
                                                    {s.namaSektor}
                                                  </div>
                                                </td>
                                                <td className="px-4 py-2.5 text-center text-slate-700">{s.jumlahMesin}</td>
                                                <td className="px-4 py-2.5 text-center font-semibold text-emerald-700">{s.uptime.toFixed(2)}%</td>
                                              </tr>
                                              {isSektorExpanded && (
                                                <tr>
                                                  <td colSpan={3} className="p-0 bg-white border-b border-[#E5EAF2]">
                                                    <div className="px-6 py-3 bg-[#F8FAFC]">
                                                      <h5 className="text-[11px] font-semibold text-slate-600 mb-2 uppercase tracking-wider">Daftar WSID (Diurutkan Downtime Terburuk):</h5>
                                                      <div className="overflow-x-auto rounded-lg border border-[#E5EAF2]">
                                                        <table className="w-full text-xs text-left bg-white">
                                                          <thead className="bg-[#F8FAFC] text-slate-600 border-b border-[#E5EAF2]">
                                                            <tr>
                                                              <th className="px-3.5 py-2 font-semibold">WSID</th>
                                                              <th className="px-3.5 py-2 font-semibold">Lokasi</th>
                                                              <th className="px-3.5 py-2 font-semibold">Vendor</th>
                                                              <th className="px-3.5 py-2 font-semibold text-right">Downtime (%)</th>
                                                            </tr>
                                                          </thead>
                                                          <tbody className="divide-y divide-[#E5EAF2]">
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
                                                                className={`cursor-pointer transition-colors ${selectedWsid === item.m.wsid ? 'bg-blue-50/80 border-l-2 border-blue-600' : 'hover:bg-slate-50 border-l-2 border-transparent'}`}
                                                                onClick={(e) => {
                                                                  e.stopPropagation();
                                                                  handleSelectWsid(item.m.wsid);
                                                                }}
                                                              >
                                                                <td className="px-3.5 py-2 font-semibold text-slate-900">{item.m.wsid}</td>
                                                                <td className="px-3.5 py-2 text-slate-500 truncate max-w-[200px]" title={item.m.lokasi}>{item.m.lokasi}</td>
                                                                <td className="px-3.5 py-2 whitespace-nowrap">
                                                                  <span className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded text-[10px] font-medium border border-slate-200">
                                                                    {item.m.vendor || '-'}
                                                                  </span>
                                                                </td>
                                                                <td className="px-3.5 py-2 font-semibold text-rose-600 text-right">{item.downtime.toFixed(2)}%</td>
                                                              </tr>
                                                            ))}
                                                            {s.bcaMachines.length === 0 && (
                                                              <tr>
                                                                <td colSpan={4} className="px-3.5 py-3 text-center text-slate-400">Tidak ada WSID</td>
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
          </StickyTableWrapper>
        </div>

        {/* Side Panel Inspector */}
        {selectedMachine && (
          <div className="xl:col-span-1 animate-fade-in">
            <div className="bg-white rounded-lg border border-[#E5EAF2] shadow-sm overflow-hidden sticky top-6">
              <div className="bg-slate-900 px-4 py-3 text-white flex justify-between items-center border-b border-slate-800">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-sm text-white">{selectedMachine.wsid}</h3>
                    {selectedMachine.vendor && selectedMachine.vendor !== '-' && (
                      <span className="px-1.5 py-0.5 bg-slate-800 text-slate-200 rounded text-[10px] font-medium border border-slate-700">
                        {selectedMachine.vendor}
                      </span>
                    )}
                  </div>
                  <p className="text-slate-400 text-[11px] truncate max-w-[230px]" title={selectedMachine.lokasi}>{selectedMachine.lokasi}</p>
                </div>
                <button 
                  onClick={() => handleSelectWsid(selectedMachine.wsid)}
                  className="p-1 hover:bg-slate-800 rounded transition-colors text-slate-400 hover:text-white"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="p-4">
                {!showDetailCategories ? (
                  <div className="space-y-4">
                    <div className="text-center">
                      <h4 className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-3">Total Downtime</h4>
                      
                      <div className="grid grid-cols-2 gap-3 mb-3">
                        <div className="bg-slate-50 rounded-lg p-3 border border-[#E5EAF2]">
                          <div className="text-[10px] text-slate-500 font-semibold mb-0.5 uppercase">Total FRX</div>
                          <div className="text-xl font-bold text-slate-900">{(selectedMachine as any).aggregatedData?.frxTotal?.toFixed(2) || 0}</div>
                        </div>
                        <div className="bg-slate-50 rounded-lg p-3 border border-[#E5EAF2]">
                          <div className="text-[10px] text-slate-500 font-semibold mb-0.5 uppercase">Total DUR</div>
                          <div className="text-xl font-bold text-slate-900">{(selectedMachine as any).aggregatedData?.durTotal?.toFixed(2) || 0}</div>
                        </div>
                      </div>
                      
                      <div className="bg-rose-50/70 rounded-lg p-3 border border-rose-200">
                        <div className="text-[10px] text-rose-700 font-semibold mb-0.5 uppercase">Total Downtime (%)</div>
                        <div className="text-2xl font-bold text-rose-600">{((selectedMachine as any).aggregatedData?.total || 0).toFixed(2)}%</div>
                      </div>
                    </div>

                    <button 
                      onClick={() => setShowDetailCategories(true)}
                      className="w-full py-2.5 px-3 bg-blue-50 text-blue-700 hover:bg-blue-100 font-semibold rounded-lg transition-colors flex items-center justify-center gap-1.5 text-xs border border-blue-100"
                    >
                      Lihat Detail per Kategori
                      <ChevronRight size={14} />
                    </button>
                  </div>
                ) : (
                  <div className="space-y-3 animate-fade-in">
                    <div className="flex items-center gap-2 mb-2 pb-2 border-b border-[#E5EAF2]">
                      <button 
                        onClick={() => setShowDetailCategories(false)}
                        className="p-1 hover:bg-slate-100 rounded text-slate-500 transition-colors"
                      >
                        <ChevronRight size={16} className="rotate-180" />
                      </button>
                      <h4 className="font-semibold text-slate-800 text-xs">Detail per Kategori</h4>
                    </div>
                    
                    <div className="space-y-2.5 max-h-[calc(100vh-320px)] overflow-y-auto pr-1">
                      <button 
                        onClick={() => navigate(`/wsid/${selectedMachine.wsid}`)}
                        className="w-full py-2 px-3 mb-2 bg-blue-600 text-white hover:bg-blue-700 font-medium rounded-lg transition-colors flex items-center justify-center gap-1.5 text-xs shadow-2xs"
                      >
                        Detail Tiap Bulan
                        <ChevronRight size={14} />
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
                          <div key={cat} className="bg-white border border-[#E5EAF2] rounded-lg p-2.5 shadow-2xs hover:border-blue-300 transition-colors">
                            <div className="font-medium text-slate-800 text-xs mb-1.5 pb-1 border-b border-[#E5EAF2]">{labelMap[cat]}</div>
                            <div className="flex justify-between items-center text-xs">
                              <div className="text-center px-2 flex-1">
                                <div className="text-[10px] text-slate-400 font-medium mb-0.5">FREQ</div>
                                <div className="font-semibold text-slate-800">{typeof frxDur.frx === 'number' ? frxDur.frx.toFixed(2) : frxDur.frx}</div>
                              </div>
                              <div className="w-px h-5 bg-[#E5EAF2]"></div>
                              <div className="text-center px-2 flex-1">
                                <div className="text-[10px] text-slate-400 font-medium mb-0.5">DUR</div>
                                <div className="font-semibold text-slate-800">{typeof frxDur.dur === 'number' ? frxDur.dur.toFixed(2) : frxDur.dur}</div>
                              </div>
                              <div className="w-px h-5 bg-[#E5EAF2]"></div>
                              <div className="text-center px-2 flex-1">
                                <div className="text-[10px] text-slate-400 font-medium mb-0.5">%</div>
                                <div className="font-semibold text-rose-600">{pct.toFixed(2)}%</div>
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
