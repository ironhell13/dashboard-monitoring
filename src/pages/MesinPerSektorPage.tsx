import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useFilteredData } from '../hooks/useFilteredData';
import { useDataStore, type MachineData } from '../store/useDataStore';
import * as XLSX from 'xlsx';
import { Download, Layers, MapPin, FileSpreadsheet, ChevronDown, ChevronUp, ArrowUpDown, ArrowUp, ArrowDown, Activity } from 'lucide-react';
import { exportMesinPerSektorExcel, SERVICE_POINT_MAP, getServicePointName } from '../utils/comprehensiveExporter';
import { aggregateMachinesData, getHighestProblemCategory, getValueForCategory, getFrxDurForCategory, type HighestProblemResult } from '../utils/problemCalculator';
import { cleanSektorName } from '../utils/dailyIncidentParser';
import StickyTableWrapper from '../components/StickyTableWrapper';

interface SektorRow {
  sektor: string;
  servicePoint: string;
  bcaAktif: number;
  nonBcaAktif: number;
  totalAktif: number;
  rataRataDowntime: number;
  rataRataUptime: number;
  uh?: number;
  kom?: number;
  up?: number;
  hw?: number;
  ll?: number;
  machinesBCA: MachineData[];
  machinesNonBCA: MachineData[];
  machinesTidakAktif: MachineData[];
  highestProblem: HighestProblemResult;
}

export default function MesinPerSektorPage() {
  const navigate = useNavigate();
  const filteredData = useFilteredData();
  const { rawMasterData, rawUptimeFiles, machines, selectedPeriode } = useDataStore();
  const [expandedSektor, setExpandedSektor] = useState<string | null>(null);
  const [selectedWsid, setSelectedWsid] = useState<string | null>(null);

  type SortKey = 'sektor' | 'servicePoint' | 'bcaAktif' | 'nonBcaAktif' | 'totalAktif' | 'rataRataDowntime' | 'rataRataUptime';
  const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: 'asc' | 'desc' } | null>({ key: 'rataRataUptime', direction: 'asc' });
  const [selectedSPFilter, setSelectedSPFilter] = useState<string>('ALL');

  const dataSektor: SektorRow[] = useMemo(() => {
    const map = new Map<string, {
      sektor: string, 
      machinesBCA: any[], 
      machinesNonBCA: any[] 
    }>();

    filteredData.forEach(m => {
      const clean = cleanSektorName(m.sektorBCA);
      const groupName = clean !== '-' ? clean : 'Unknown Sektor';
      const servicePoint = getServicePointName(m.sektorBCA, m.wilayahOperasional);

      if (!map.has(groupName)) {
        map.set(groupName, { sektor: groupName, servicePoint, machinesBCA: [], machinesNonBCA: [] });
      }
      const item = map.get(groupName)!;

      if (m.klienStatus === 'BCA') {
        item.machinesBCA.push(m);
      } else {
        item.machinesNonBCA.push(m);
      }
    });

    let result: SektorRow[] = Array.from(map.values()).map(item => {
      const allMachines = [...item.machinesBCA, ...item.machinesNonBCA];
      const totalAktif = allMachines.filter(m => m.statusAktif.trim().toUpperCase() === 'AKTIF').length;
      const machinesTidakAktif = allMachines.filter(m => m.statusAktif.trim().toUpperCase() !== 'AKTIF');

      // HANYA gunakan mesin BCA untuk kalkulasi Uptime/Downtime dan Problem Tertinggi
      const aggregated = aggregateMachinesData(item.machinesBCA);
      const rataRataDowntime = aggregated?.total || 0;
      const rataRataUptime = 100 - rataRataDowntime;
      
      const highestProblem = getHighestProblemCategory(aggregated);

      const bcaAktif = item.machinesBCA.filter(m => m.statusAktif.trim().toUpperCase() === 'AKTIF').length;
      const nonBcaAktif = item.machinesNonBCA.filter(m => m.statusAktif.trim().toUpperCase() === 'AKTIF').length;

      return {
        sektor: item.sektor,
        servicePoint: (item as any).servicePoint,
        bcaAktif,
        nonBcaAktif,
        totalAktif,
        rataRataDowntime,
        rataRataUptime,
        uh: aggregated?.uh || 0,
        kom: aggregated?.kom || 0,
        up: aggregated?.up || 0,
        hw: aggregated?.hw || 0,
        ll: aggregated?.ll || 0,
        machinesBCA: item.machinesBCA,
        machinesNonBCA: item.machinesNonBCA,
        machinesTidakAktif,
        highestProblem
      };
    });

    if (selectedSPFilter !== 'ALL') {
      result = result.filter(r => r.servicePoint === selectedSPFilter);
    }

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
  }, [filteredData, sortConfig, selectedSPFilter]);

  const uniqueServicePoints = useMemo(() => {
    const spSet = new Set<string>();
    filteredData.forEach(m => {
      const sp = getServicePointName(m.sektorBCA, m.wilayahOperasional);
      if (sp && sp !== 'Unknown Service Point' && !sp.startsWith('Unknown')) {
        spSet.add(sp);
      }
    });
    return Array.from(spSet).sort();
  }, [filteredData]);

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
    exportMesinPerSektorExcel(dataSektor);
  };
  const toggleExpand = (sektor: string) => {
    if (expandedSektor === sektor) {
      setExpandedSektor(null);
      setSelectedWsid(null);
    } else {
      setExpandedSektor(sektor);
      setSelectedWsid(null);
    }
  };

  return (
    <div className="space-y-3.5 animate-fade-in pb-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
        <div>
          <h2 className="text-lg font-bold text-slate-900">
            Distribusi Mesin per Sektor
          </h2>
          <p className="text-slate-500 text-xs mt-0.5">
            Downtime yang ditampilkan pada Dashboard ini, berdasarkan perhitungan jumlah mesin per sektor.
          </p>
        </div>
        
        <div className="flex items-center gap-2 self-start sm:self-auto flex-wrap">
          <div className="flex items-center gap-1.5 bg-white px-2 h-8 rounded-md border border-[#E5EAF2] text-xs shadow-2xs">
            <MapPin size={12} className="text-slate-400" />
            <select
              value={selectedSPFilter}
              onChange={(e) => setSelectedSPFilter(e.target.value)}
              className="bg-transparent focus:outline-none text-xs text-slate-700 font-medium cursor-pointer"
            >
              <option value="ALL">Semua Service Point</option>
              {uniqueServicePoints.map((sp) => (
                <option key={sp} value={sp}>{sp}</option>
              ))}
            </select>
          </div>

          <button 
            onClick={handleExport}
            className="flex items-center gap-1.5 px-3 h-8 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-medium rounded-md transition-colors text-xs shadow-2xs cursor-pointer"
          >
            <Download size={13} />
            <span>Export Excel</span>
          </button>
        </div>
      </div>

      <div className="bg-white rounded-lg overflow-hidden shadow-2xs border border-[#E5EAF2]">
        <StickyTableWrapper>
          <table className="w-full text-xs text-left">
            <thead className="bg-[#F8FAFC] text-slate-600 font-semibold border-b border-[#E5EAF2] select-none text-[11px]">
              <tr>
                <th className="px-3 py-1.5 cursor-pointer hover:bg-slate-100" onClick={() => handleSort('sektor')}>
                  Sektor {renderSortIcon('sektor')}
                </th>
                <th className="px-4 py-2.5 cursor-pointer hover:bg-slate-100" onClick={() => handleSort('servicePoint')}>
                  Service Point {renderSortIcon('servicePoint')}
                </th>
                <th className="px-4 py-2.5 text-center cursor-pointer group" onClick={() => handleSort('bcaAktif')}>
                  Jumlah Mesin Aktif BCA {renderSortIcon('bcaAktif')}
                </th>
                <th className="px-4 py-2.5 text-center cursor-pointer group" onClick={() => handleSort('nonBcaAktif')}>
                  Jumlah Mesin Aktif Non BCA {renderSortIcon('nonBcaAktif')}
                </th>
                <th className="px-4 py-2.5 text-center cursor-pointer group" onClick={() => handleSort('totalAktif')}>
                  Total Mesin Aktif {renderSortIcon('totalAktif')}
                </th>
                <th className="px-4 py-2.5 text-center cursor-pointer group" onClick={() => handleSort('rataRataDowntime')}>
                  Rata-rata Downtime Total (%) {renderSortIcon('rataRataDowntime')}
                </th>
                <th className="px-4 py-2.5 text-center cursor-pointer group" onClick={() => handleSort('rataRataUptime')}>
                  Rata-rata Uptime (%) {renderSortIcon('rataRataUptime')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E5EAF2]">
              {dataSektor.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-slate-400">
                    Tidak ada data yang tersedia untuk filter saat ini.
                  </td>
                </tr>
              ) : (
                dataSektor.map((row) => {
                  const isExpanded = expandedSektor === row.sektor;
                  
                  return (
                    <React.Fragment key={row.sektor}>
                      <tr 
                        onClick={() => toggleExpand(row.sektor)}
                        className={`cursor-pointer transition-colors ${isExpanded ? 'bg-blue-50/40' : 'hover:bg-slate-50/80'}`}
                      >
                        <td className="px-4 py-2.5 font-semibold text-slate-800">
                          <div className="flex items-center gap-1.5">
                            {isExpanded ? <ChevronUp size={14} className="text-blue-600" /> : <ChevronDown size={14} className="text-slate-400" />}
                            {row.sektor}
                          </div>
                        </td>
                        <td className="px-4 py-2.5 text-slate-600 font-medium">
                          {row.servicePoint}
                        </td>
                        <td className="px-4 py-2.5 text-center font-medium text-blue-700">{row.bcaAktif.toLocaleString()}</td>
                        <td className="px-4 py-2.5 text-center font-medium text-slate-600">{row.nonBcaAktif.toLocaleString()}</td>
                        <td className="px-4 py-2.5 text-center font-bold text-slate-800">{row.totalAktif.toLocaleString()}</td>
                        <td className="px-4 py-2.5 text-center font-semibold text-rose-600">{row.rataRataDowntime.toFixed(2)}%</td>
                        <td className="px-4 py-2.5 text-center font-semibold text-emerald-600">{row.rataRataUptime.toFixed(2)}%</td>
                      </tr>
                      {isExpanded && (
                        <tr>
                          <td colSpan={8} className="p-0 bg-slate-50/60 border-b border-[#E5EAF2]">
                            <div className="p-4 space-y-3">
                              <div className="inline-flex items-center gap-2 bg-white border border-[#E5EAF2] px-3 py-1.5 rounded-md shadow-2xs">
                                <span className="text-slate-500 text-[11px] uppercase tracking-wider font-semibold">Problem Tertinggi:</span>
                                <span className="text-xs font-bold text-slate-800">{row.highestProblem.categoryName}</span>
                                <span className="text-xs font-bold text-rose-600">({row.highestProblem.value.toFixed(2)}%)</span>
                              </div>

                              <div className={`grid grid-cols-1 ${selectedWsid ? 'lg:grid-cols-2' : ''} gap-4`}>
                                <div className="bg-white rounded-lg shadow-2xs border border-[#E5EAF2] overflow-hidden">
                                  <div className="bg-slate-50 px-3.5 py-2 border-b border-[#E5EAF2] flex justify-between items-center">
                                    <h4 className="font-semibold text-slate-800 text-xs">Daftar Mesin (BCA)</h4>
                                    <span className="text-[10px] font-semibold bg-blue-50 text-blue-700 border border-blue-200/60 px-2 py-0.2 rounded-full">{row.machinesBCA.length} Mesin</span>
                                  </div>
                                  <div className="max-h-[260px] overflow-y-auto">
                                    <table className="w-full text-xs text-left">
                                      <thead className="bg-[#F8FAFC] sticky top-0 border-b border-[#E5EAF2] text-slate-500 text-[11px]">
                                        <tr>
                                          <th className="px-3 py-1.5">WSID</th>
                                          <th className="px-3 py-1.5">Lokasi</th>
                                          <th className="px-3 py-1.5">Vendor</th>
                                          <th className="px-3 py-1.5 text-right">Nilai (%)</th>
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-slate-100">
                                        {row.machinesBCA.length === 0 ? (
                                          <tr><td colSpan={4} className="px-3 py-4 text-center text-slate-400">Tidak ada mesin BCA</td></tr>
                                        ) : (
                                          row.machinesBCA.sort((a, b) => getValueForCategory((b as any).aggregatedData, row.highestProblem.categoryKey) - getValueForCategory((a as any).aggregatedData, row.highestProblem.categoryKey)).map(m => (
                                            <tr 
                                              key={m.wsid} 
                                              className={`cursor-pointer transition-colors ${selectedWsid === m.wsid ? 'bg-blue-50/70 border-l-2 border-blue-600' : 'hover:bg-slate-50'}`}
                                              onClick={() => setSelectedWsid(m.wsid === selectedWsid ? null : m.wsid)}
                                            >
                                              <td className="px-3 py-1.5 font-semibold text-slate-800 font-mono">{m.wsid}</td>
                                              <td className="px-3 py-1.5 text-slate-500 truncate max-w-sm" title={m.lokasi}>{m.lokasi}</td>
                                              <td className="px-3 py-1.5 whitespace-nowrap">
                                                <span className="px-1.5 py-0.2 bg-slate-100 text-slate-700 rounded text-[10px] font-medium border border-slate-200">
                                                  {m.vendor || '-'}
                                                </span>
                                              </td>
                                              <td className="px-3 py-1.5 text-right font-medium text-rose-600">
                                                {getValueForCategory((m as any).aggregatedData, row.highestProblem.categoryKey).toFixed(2)}%
                                              </td>
                                            </tr>
                                          ))
                                        )}
                                      </tbody>
                                    </table>
                                  </div>
                                </div>
                                {selectedWsid && (() => {
                                  const selectedMachine = row.machinesBCA.find(m => m.wsid === selectedWsid);
                                  if (!selectedMachine) return null;
                                  const machineAgg = (selectedMachine as any).aggregatedData;
                                  const machineHighest = getHighestProblemCategory(machineAgg);
                                  const machineFrxDur = getFrxDurForCategory(machineAgg, machineHighest.categoryKey);
                                  
                                  return (
                                    <div className="bg-white rounded-lg shadow-2xs border border-[#E5EAF2] overflow-hidden flex flex-col">
                                      <div className="bg-slate-50 px-3.5 py-2 border-b border-[#E5EAF2] flex justify-between items-center">
                                        <div className="flex items-center gap-2">
                                          <h4 className="font-semibold text-slate-800 text-xs">Detail Mesin: {selectedWsid}</h4>
                                          {selectedMachine.vendor && selectedMachine.vendor !== '-' && (
                                            <span className="px-1.5 py-0.2 bg-slate-200 text-slate-700 rounded text-[10px] font-medium">
                                              Vendor: {selectedMachine.vendor}
                                            </span>
                                          )}
                                        </div>
                                      </div>
                                      <div className="p-4 flex-1 flex flex-col justify-center items-center text-center">
                                        <h5 className="text-slate-500 text-xs font-semibold uppercase tracking-wider mb-1">Problem Tertinggi</h5>
                                        <div className="text-xl font-bold text-slate-900 mb-4">{machineHighest.categoryName}</div>
                                        
                                        <div className="grid grid-cols-3 gap-2.5 w-full max-w-xs">
                                          <div className="bg-slate-50 rounded-md p-2.5 border border-[#E5EAF2]">
                                            <div className="text-[10px] text-slate-500 font-medium mb-0.5">FREQ</div>
                                            <div className="text-base font-bold text-slate-800 font-mono">{machineFrxDur.frx}</div>
                                          </div>
                                          <div className="bg-slate-50 rounded-md p-2.5 border border-[#E5EAF2]">
                                            <div className="text-[10px] text-slate-500 font-medium mb-0.5">DUR</div>
                                            <div className="text-base font-bold text-slate-800 font-mono">{machineFrxDur.dur}</div>
                                          </div>
                                          <div className="bg-rose-50 rounded-md p-2.5 border border-rose-200">
                                            <div className="text-[10px] text-rose-600 font-medium mb-0.5">%</div>
                                            <div className="text-base font-bold text-rose-600 font-mono">{machineHighest.value.toFixed(2)}%</div>
                                          </div>
                                        </div>
                                        
                                        <button 
                                          onClick={() => navigate('/all-wsid', { state: { selectedWsid } })}
                                          className="mt-5 w-full max-w-xs py-2 px-3 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-medium rounded-lg text-xs transition-colors shadow-xs flex items-center justify-center gap-1.5 cursor-pointer"
                                        >
                                          <Activity size={14} />
                                          <span>Detail Performance</span>
                                        </button>
                                      </div>
                                    </div>
                                  );
                                })()}
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
    </div>
  );
}
