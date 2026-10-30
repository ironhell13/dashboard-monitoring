import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useFilteredData } from '../hooks/useFilteredData';
import StickyTableWrapper from '../components/StickyTableWrapper';
import { getFrxDurForCategory } from '../utils/problemCalculator';
import {
  Search,
  ArrowUpDown,
  ChevronRight,
  ChevronLeft,
  ChevronsLeft,
  ChevronsRight,
  X,
  Download,
  Server,
  ShieldCheck,
  AlertTriangle,
  Flame,
  RotateCcw,
  SlidersHorizontal,
  ExternalLink,
  Clock,
  MapPin,
  Building2,
  Activity,
  Layers,
  Calendar,
  CheckCircle2
} from 'lucide-react';
import { exportAllWsidExcel, SERVICE_POINT_MAP, getServicePointName } from '../utils/comprehensiveExporter';
import { cleanSektorName } from '../utils/dailyIncidentParser';
import { evaluateMachineHealth, type MachineHealthStatus } from '../utils/slaHelper';
import type { MachineData } from '../store/useDataStore';

export default function AllWsidPage() {
  const navigate = useNavigate();
  const allFilteredData = useFilteredData();
  const location = useLocation();

  // Selection & Inspector State
  const [selectedWsid, setSelectedWsid] = useState<string | null>(location.state?.selectedWsid || null);
  const [inspectorTab, setInspectorTab] = useState<'SLA' | 'KATEGORI'>('SLA');
  const tableTopRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (location.state?.selectedWsid) {
      setSelectedWsid(location.state.selectedWsid);
    }
  }, [location.state]);

  // Filter States
  const [searchTerm, setSearchTerm] = useState('');
  const [slaFilter, setSlaFilter] = useState<'ALL' | MachineHealthStatus>('ALL');
  const [jenisFilter, setJenisFilter] = useState<'ALL' | 'ATM' | 'CRM'>('ALL');
  const [vendorFilter, setVendorFilter] = useState<string>('ALL');
  const [servicePointFilter, setServicePointFilter] = useState<string>('ALL');

  // Pagination State
  const [pageSize, setPageSize] = useState<number>(25);
  const [currentPage, setCurrentPage] = useState<number>(1);

  // Sorting State
  const [sortConfig, setSortConfig] = useState<{
    key: 'wsid' | 'lokasi' | 'vendor' | 'total' | 'sektor' | 'servicePoint' | 'jenisMesin';
    direction: 'asc' | 'desc';
  } | null>({
    key: 'total',
    direction: 'desc'
  });

  // Base Data: BCA & AKTIF only
  const baseBcaAktifMachines = useMemo(() => {
    return allFilteredData.filter(
      (m) => m.klienStatus === 'BCA' && (m.statusAktif || '').toUpperCase() === 'AKTIF'
    );
  }, [allFilteredData]);

  // Dynamic Filter Options
  const uniqueVendors = useMemo(() => {
    const set = new Set<string>();
    baseBcaAktifMachines.forEach((m) => {
      if (m.vendor && m.vendor.trim() && m.vendor !== '-') {
        set.add(m.vendor.trim());
      }
    });
    return Array.from(set).sort();
  }, [baseBcaAktifMachines]);

  const uniqueServicePoints = useMemo(() => {
    const set = new Set<string>();
    baseBcaAktifMachines.forEach((m) => {
      const sp = getServicePointName(m.sektorBCA, m.wilayahOperasional);
      if (sp && sp !== 'Unknown Service Point' && !sp.startsWith('Unknown')) {
        set.add(sp.trim());
      }
    });
    return Array.from(set).sort();
  }, [baseBcaAktifMachines]);

  // Executive KPI Metrics
  const kpiStats = useMemo(() => {
    let safe = 0;
    let warning = 0;
    let critical = 0;
    let totalDowntimePct = 0;

    baseBcaAktifMachines.forEach((m) => {
      const h = evaluateMachineHealth(m);
      if (h.status === 'SAFE') safe++;
      else if (h.status === 'WARNING') warning++;
      else if (h.status === 'CRITICAL') critical++;

      const pct = (m as any).aggregatedData?.total || 0;
      totalDowntimePct += pct;
    });

    const total = baseBcaAktifMachines.length;
    const avgDowntime = total > 0 ? totalDowntimePct / total : 0;
    const avgUptime = Math.max(0, 100 - avgDowntime);

    return {
      total,
      safe,
      warning,
      critical,
      avgDowntime,
      avgUptime
    };
  }, [baseBcaAktifMachines]);

  // Filtered Machines
  const filteredMachines = useMemo(() => {
    let list = baseBcaAktifMachines;

    // SLA Filter
    if (slaFilter !== 'ALL') {
      list = list.filter((m) => {
        const h = evaluateMachineHealth(m);
        return h.status === slaFilter;
      });
    }

    // Jenis Mesin Filter
    if (jenisFilter !== 'ALL') {
      list = list.filter((m) => {
        const j = (m.jenisMesin || '').trim().toUpperCase();
        if (jenisFilter === 'CRM') return j === 'CRM' || j === 'ATS';
        return j !== 'CRM' && j !== 'ATS';
      });
    }

    // Vendor Filter
    if (vendorFilter !== 'ALL') {
      list = list.filter((m) => (m.vendor || '').trim() === vendorFilter);
    }

    // Service Point Filter
    if (servicePointFilter !== 'ALL') {
      list = list.filter((m) => {
        const sp = getServicePointName(m.sektorBCA, m.wilayahOperasional);
        return sp === servicePointFilter;
      });
    }

    // Search Term
    if (searchTerm.trim()) {
      const lower = searchTerm.toLowerCase();
      list = list.filter(
        (m) =>
          m.wsid.toLowerCase().includes(lower) ||
          (m.lokasi && m.lokasi.toLowerCase().includes(lower)) ||
          (m.vendor && m.vendor.toLowerCase().includes(lower)) ||
          (m.sektorBCA && m.sektorBCA.toLowerCase().includes(lower))
      );
    }

    // Sorting
    if (sortConfig) {
      list = [...list].sort((a, b) => {
        let aVal: any = a[sortConfig.key as keyof typeof a];
        let bVal: any = b[sortConfig.key as keyof typeof b];

        if (sortConfig.key === 'total') {
          aVal = (a as any).aggregatedData?.total || 0;
          bVal = (b as any).aggregatedData?.total || 0;
        } else if (sortConfig.key === 'lokasi') {
          aVal = a.lokasi || '';
          bVal = b.lokasi || '';
        } else if (sortConfig.key === 'vendor') {
          aVal = a.vendor || '';
          bVal = b.vendor || '';
        } else if (sortConfig.key === 'sektor') {
          aVal = cleanSektorName(a.sektorBCA) !== '-' ? cleanSektorName(a.sektorBCA) : (a.sektorBCA || '');
          bVal = cleanSektorName(b.sektorBCA) !== '-' ? cleanSektorName(b.sektorBCA) : (b.sektorBCA || '');
        } else if (sortConfig.key === 'jenisMesin') {
          aVal = a.jenisMesin || '';
          bVal = b.jenisMesin || '';
        } else if (sortConfig.key === 'servicePoint') {
          aVal = getServicePointName(a.sektorBCA, a.wilayahOperasional);
          bVal = getServicePointName(b.sektorBCA, b.wilayahOperasional);
        }

        if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
        if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }

    return list;
  }, [
    baseBcaAktifMachines,
    slaFilter,
    jenisFilter,
    vendorFilter,
    servicePointFilter,
    searchTerm,
    sortConfig
  ]);

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, slaFilter, jenisFilter, vendorFilter, servicePointFilter, pageSize]);

  // Pagination calculation
  const totalPages = pageSize === 0 ? 1 : Math.max(1, Math.ceil(filteredMachines.length / pageSize));
  const paginatedMachines = useMemo(() => {
    if (pageSize === 0) return filteredMachines;
    const start = (currentPage - 1) * pageSize;
    return filteredMachines.slice(start, start + pageSize);
  }, [filteredMachines, currentPage, pageSize]);

  const selectedMachine = useMemo(() => {
    if (!selectedWsid) return null;
    return baseBcaAktifMachines.find((m) => m.wsid === selectedWsid) || null;
  }, [selectedWsid, baseBcaAktifMachines]);

  const selectedHealth = useMemo(() => {
    if (!selectedMachine) return null;
    return evaluateMachineHealth(selectedMachine);
  }, [selectedMachine]);

  const handleSort = (
    key: 'wsid' | 'lokasi' | 'vendor' | 'total' | 'sektor' | 'servicePoint' | 'jenisMesin'
  ) => {
    let direction: 'asc' | 'desc' = 'desc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'desc') {
      direction = 'asc';
    }
    setSortConfig({ key, direction });
  };

  const renderSortIcon = (key: string) => {
    if (sortConfig?.key === key) {
      return (
        <ArrowUpDown
          size={13}
          className={`inline ml-1 ${
            sortConfig.direction === 'desc' ? 'text-blue-600' : 'text-slate-400'
          }`}
        />
      );
    }
    return (
      <ArrowUpDown
        size={13}
        className="inline ml-1 text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity"
      />
    );
  };

  const handleSelectWsid = (wsid: string) => {
    if (selectedWsid === wsid) {
      setSelectedWsid(null);
    } else {
      setSelectedWsid(wsid);
    }
  };

  const handleResetFilters = () => {
    setSearchTerm('');
    setSlaFilter('ALL');
    setJenisFilter('ALL');
    setVendorFilter('ALL');
    setServicePointFilter('ALL');
    setCurrentPage(1);
  };

  const hasActiveFilters =
    searchTerm !== '' ||
    slaFilter !== 'ALL' ||
    jenisFilter !== 'ALL' ||
    vendorFilter !== 'ALL' ||
    servicePointFilter !== 'ALL';

  const handleExport = () => {
    exportAllWsidExcel(filteredMachines);
  };

  return (
    <div className="space-y-6 max-w-[1600px] mx-auto animate-fade-in pb-12">
      {/* ======================================================== */}
      {/* 1. HEADER SECTION                                        */}
      {/* ======================================================== */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 shrink-0">
              <Server size={17} />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-slate-900">
                Seluruh WSID Aktif (BCA)
              </h1>
              <p className="text-slate-500 text-xs mt-0.5">
                Monitoring komprehensif performa downtime, status kesehatan SLA, dan spesifikasi seluruh mesin BCA aktif.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5 self-start md:self-auto shrink-0 flex-wrap">
          <div className="text-xs text-slate-600 bg-white border border-[#E5EAF2] px-3 py-1.5 rounded-lg shadow-2xs font-medium">
            Terfilter:{' '}
            <strong className="text-slate-900 font-bold">
              {filteredMachines.length.toLocaleString('id-ID')}
            </strong>{' '}
            / {baseBcaAktifMachines.length.toLocaleString('id-ID')} Mesin
          </div>

          <button
            onClick={handleExport}
            className="flex items-center gap-1.5 px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-medium rounded-lg transition-colors text-xs whitespace-nowrap shadow-xs cursor-pointer"
            title="Download Excel seluruh mesin BCA aktif yang terfilter"
          >
            <Download size={14} />
            <span>Export Excel</span>
          </button>
        </div>
      </div>

      {/* ======================================================== */}
      {/* 2. 4 EXECUTIVE KPI METRIC CARDS (COMPACT 92-105px)       */}
      {/* ======================================================== */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
        {/* Card 1: Total WSID Aktif */}
        <div
          onClick={() => setSlaFilter('ALL')}
          className={`p-3 rounded-lg border transition-all cursor-pointer bg-white shadow-2xs relative overflow-hidden min-h-[92px] max-h-[105px] flex flex-col justify-between ${
            slaFilter === 'ALL'
              ? 'border-blue-600 ring-1 ring-blue-500 bg-blue-50/20'
              : 'border-[#E5EAF2] hover:border-slate-300'
          }`}
        >
          <div className="flex items-start justify-between">
            <div>
              <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block">
                Total WSID Aktif (BCA)
              </span>
              <h3 className="text-2xl font-bold text-slate-900 font-mono mt-0.5 leading-tight">
                {kpiStats.total.toLocaleString('id-ID')}
              </h3>
            </div>
            <div
              className={`w-7 h-7 rounded-md flex items-center justify-center transition-colors ${
                slaFilter === 'ALL'
                  ? 'bg-blue-600 text-white shadow-2xs'
                  : 'bg-blue-50 text-blue-600 border border-blue-200/60'
              }`}
            >
              <Server size={15} />
            </div>
          </div>
          <p className="text-[10px] text-slate-500 flex items-center gap-1 mt-0.5">
            <span>Rata-rata Uptime:</span>
            <strong className="text-blue-700 font-semibold">{kpiStats.avgUptime.toFixed(2)}%</strong>
          </p>
          {slaFilter === 'ALL' && (
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600" />
          )}
        </div>

        {/* Card 2: Status Aman (Safe) */}
        <div
          onClick={() => setSlaFilter(slaFilter === 'SAFE' ? 'ALL' : 'SAFE')}
          className={`p-3 rounded-lg border transition-all cursor-pointer bg-white shadow-2xs relative overflow-hidden min-h-[92px] max-h-[105px] flex flex-col justify-between ${
            slaFilter === 'SAFE'
              ? 'border-emerald-600 ring-1 ring-emerald-500 bg-emerald-50/20'
              : 'border-[#E5EAF2] hover:border-slate-300'
          }`}
        >
          <div className="flex items-start justify-between">
            <div>
              <span className="text-[10px] font-semibold text-emerald-700 uppercase tracking-wider block">
                SLA Aman (Safe)
              </span>
              <h3 className="text-2xl font-bold text-emerald-700 font-mono mt-0.5 leading-tight">
                {kpiStats.safe.toLocaleString('id-ID')}
              </h3>
            </div>
            <div
              className={`w-7 h-7 rounded-md flex items-center justify-center transition-colors ${
                slaFilter === 'SAFE'
                  ? 'bg-emerald-600 text-white shadow-2xs'
                  : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
              }`}
            >
              <ShieldCheck size={15} />
            </div>
          </div>
          <p className="text-[10px] text-slate-500 flex items-center gap-1 mt-0.5">
            <span>Persentase:</span>
            <strong className="text-emerald-700 font-semibold">
              {((kpiStats.safe / (kpiStats.total || 1)) * 100).toFixed(1)}%
            </strong>
            <span>mesin sehat</span>
          </p>
          {slaFilter === 'SAFE' && (
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-emerald-600" />
          )}
        </div>

        {/* Card 3: Perlu Perhatian (Warning) */}
        <div
          onClick={() => setSlaFilter(slaFilter === 'WARNING' ? 'ALL' : 'WARNING')}
          className={`p-3 rounded-lg border transition-all cursor-pointer bg-white shadow-2xs relative overflow-hidden min-h-[92px] max-h-[105px] flex flex-col justify-between ${
            slaFilter === 'WARNING'
              ? 'border-amber-600 ring-1 ring-amber-500 bg-amber-50/20'
              : 'border-[#E5EAF2] hover:border-slate-300'
          }`}
        >
          <div className="flex items-start justify-between">
            <div>
              <span className="text-[10px] font-semibold text-amber-700 uppercase tracking-wider block">
                Perlu Perhatian (Warning)
              </span>
              <h3 className="text-2xl font-bold text-amber-700 font-mono mt-0.5 leading-tight">
                {kpiStats.warning.toLocaleString('id-ID')}
              </h3>
            </div>
            <div
              className={`w-7 h-7 rounded-md flex items-center justify-center transition-colors ${
                slaFilter === 'WARNING'
                  ? 'bg-amber-600 text-white shadow-2xs'
                  : 'bg-amber-50 text-amber-700 border border-amber-200'
              }`}
            >
              <AlertTriangle size={15} />
            </div>
          </div>
          <p className="text-[10px] text-slate-500 mt-0.5 truncate">
            Mendekati ambang / 2 bln berturut-turut
          </p>
          {slaFilter === 'WARNING' && (
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-amber-600" />
          )}
        </div>

        {/* Card 4: Status Kritis (Critical) */}
        <div
          onClick={() => setSlaFilter(slaFilter === 'CRITICAL' ? 'ALL' : 'CRITICAL')}
          className={`p-3 rounded-lg border transition-all cursor-pointer bg-white shadow-2xs relative overflow-hidden min-h-[92px] max-h-[105px] flex flex-col justify-between ${
            slaFilter === 'CRITICAL'
              ? 'border-rose-600 ring-1 ring-rose-500 bg-rose-50/20'
              : 'border-[#E5EAF2] hover:border-slate-300'
          }`}
        >
          <div className="flex items-start justify-between">
            <div>
              <span className="text-[10px] font-semibold text-rose-700 uppercase tracking-wider block">
                Status Kritis (Critical)
              </span>
              <h3 className="text-2xl font-bold text-rose-700 font-mono mt-0.5 leading-tight">
                {kpiStats.critical.toLocaleString('id-ID')}
              </h3>
            </div>
            <div
              className={`w-7 h-7 rounded-md flex items-center justify-center transition-colors ${
                slaFilter === 'CRITICAL'
                  ? 'bg-rose-600 text-white shadow-2xs'
                  : 'bg-rose-50 text-rose-700 border border-rose-200'
              }`}
            >
              <Flame size={15} />
            </div>
          </div>
          <p className="text-[10px] text-slate-500 mt-0.5 truncate">
            Di bawah batas SLA / kronis &gt; 2 bulan
          </p>
          {slaFilter === 'CRITICAL' && (
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-rose-600" />
          )}
        </div>
      </div>

      {/* ======================================================== */}
      {/* 3. SMART FILTER TOOLBAR                                   */}
      {/* ======================================================== */}
      <div className="bg-white p-2.5 rounded-lg border border-[#E5EAF2] shadow-2xs space-y-2">
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-2">
          {/* Search Box */}
          <div className="relative flex-1 max-w-md">
            <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none text-slate-400">
              <Search size={13} />
            </div>
            <input
              type="text"
              className="pl-8 pr-7 h-8 bg-slate-50 border border-[#E5EAF2] rounded-md w-full text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600 transition-colors"
              placeholder="Cari WSID, Lokasi, Vendor, atau Sektor..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="absolute inset-y-0 right-0 pr-2.5 flex items-center text-slate-400 hover:text-slate-600 cursor-pointer"
                title="Hapus kata kunci pencarian"
              >
                <X size={12} />
              </button>
            )}
          </div>

          {/* Filter Dropdowns */}
          <div className="flex flex-wrap items-center gap-1.5">
            {/* Status SLA */}
            <div className="flex items-center gap-1 bg-slate-50 border border-[#E5EAF2] px-2 h-8 rounded-md text-xs">
              <span className="text-slate-500 font-medium">Status:</span>
              <select
                value={slaFilter}
                onChange={(e) => setSlaFilter(e.target.value as any)}
                className="bg-transparent text-slate-800 text-xs font-semibold outline-none cursor-pointer"
              >
                <option value="ALL">Semua Status</option>
                <option value="SAFE">Aman (Safe)</option>
                <option value="WARNING">Warning</option>
                <option value="CRITICAL">Kritis</option>
              </select>
            </div>

            {/* Jenis Mesin */}
            <div className="flex items-center gap-1 bg-slate-50 border border-[#E5EAF2] px-2 h-8 rounded-md text-xs">
              <span className="text-slate-500 font-medium">Jenis:</span>
              <select
                value={jenisFilter}
                onChange={(e) => setJenisFilter(e.target.value as any)}
                className="bg-transparent text-slate-800 text-xs font-semibold outline-none cursor-pointer"
              >
                <option value="ALL">Semua Jenis</option>
                <option value="ATM">ATM (Target 99%)</option>
                <option value="CRM">CRM / ATS (Target 98.5%)</option>
              </select>
            </div>

            {/* Vendor */}
            <div className="flex items-center gap-1 bg-slate-50 border border-[#E5EAF2] px-2 h-8 rounded-md text-xs">
              <span className="text-slate-500 font-medium">Vendor:</span>
              <select
                value={vendorFilter}
                onChange={(e) => setVendorFilter(e.target.value)}
                className="bg-transparent text-slate-800 text-xs font-semibold outline-none cursor-pointer max-w-[120px] truncate"
              >
                <option value="ALL">Semua Vendor</option>
                {uniqueVendors.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </div>

            {/* Service Point */}
            <div className="flex items-center gap-1 bg-slate-50 border border-[#E5EAF2] px-2 h-8 rounded-md text-xs">
              <span className="text-slate-500 font-medium">SP:</span>
              <select
                value={servicePointFilter}
                onChange={(e) => setServicePointFilter(e.target.value)}
                className="bg-transparent text-slate-800 text-xs font-semibold outline-none cursor-pointer max-w-[130px] truncate"
              >
                <option value="ALL">Semua SP</option>
                {uniqueServicePoints.map((sp) => (
                  <option key={sp} value={sp}>
                    {sp}
                  </option>
                ))}
              </select>
            </div>

            {/* Page Size */}
            <div className="flex items-center gap-1 bg-slate-50 border border-[#E5EAF2] px-2 h-8 rounded-md text-xs">
              <span className="text-slate-500 font-medium">Tampil:</span>
              <select
                value={pageSize}
                onChange={(e) => setPageSize(Number(e.target.value))}
                className="bg-transparent text-slate-800 text-xs font-semibold outline-none cursor-pointer"
              >
                <option value={15}>15</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
                <option value={0}>Semua</option>
              </select>
            </div>

            {/* Reset Button */}
            {hasActiveFilters && (
              <button
                type="button"
                onClick={handleResetFilters}
                className="px-2 h-8 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-md text-xs font-semibold transition-all cursor-pointer flex items-center gap-1 shadow-2xs"
                title="Reset semua filter ke default"
              >
                <RotateCcw size={11} />
                <span>Reset</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ======================================================== */}
      {/* 4. MAIN CONTENT AREA (TABLE & SIDE INSPECTOR)            */}
      {/* ======================================================== */}
      <div
        ref={tableTopRef}
        className={`grid grid-cols-1 ${
          selectedWsid ? 'xl:grid-cols-3' : ''
        } gap-4 transition-all duration-300 items-start`}
      >
        {/* Main Table Card */}
        <div
          className={`bg-white rounded-lg shadow-2xs border border-[#E5EAF2] overflow-hidden ${
            selectedWsid ? 'xl:col-span-2' : ''
          }`}
        >
          {/* Table Header Info Bar */}
          <div className="px-3 py-2 bg-slate-50/80 border-b border-[#E5EAF2] flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 text-xs">
            <div className="text-slate-500 font-medium">
              Menampilkan{' '}
              <strong className="text-slate-800 font-mono font-bold">
                {filteredMachines.length === 0
                  ? 0
                  : (currentPage - 1) * (pageSize || filteredMachines.length) + 1}
              </strong>{' '}
              s.d.{' '}
              <strong className="text-slate-800 font-mono font-bold">
                {pageSize === 0
                  ? filteredMachines.length
                  : Math.min(currentPage * pageSize, filteredMachines.length)}
              </strong>{' '}
              dari{' '}
              <strong className="text-slate-800 font-mono font-bold">
                {filteredMachines.length.toLocaleString('id-ID')}
              </strong>{' '}
              mesin terfilter
            </div>

            <div className="text-slate-400 text-[11px] italic">
              💡 Klik baris mana saja untuk membedah rincian performa mesin di panel samping
            </div>
          </div>

          <StickyTableWrapper>
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="h-8 bg-[#F8FAFC] text-slate-600 font-semibold uppercase tracking-wider text-[11px] select-none border-b border-[#E5EAF2]">
                  <th
                    className="py-1.5 px-3 w-28 cursor-pointer group whitespace-nowrap"
                    onClick={() => handleSort('wsid')}
                  >
                    WSID {renderSortIcon('wsid')}
                  </th>
                  <th
                    className="py-1.5 px-3 w-28 cursor-pointer group whitespace-nowrap"
                    onClick={() => handleSort('jenisMesin')}
                  >
                    Jenis & Vendor {renderSortIcon('jenisMesin')}
                  </th>
                  <th
                    className="py-1.5 px-3 min-w-[140px] cursor-pointer group whitespace-nowrap"
                    onClick={() => handleSort('sektor')}
                  >
                    Sektor - Service Point {renderSortIcon('sektor')}
                  </th>
                  <th
                    className="py-1.5 px-3 min-w-[180px] cursor-pointer group"
                    onClick={() => handleSort('lokasi')}
                  >
                    Lokasi Mesin {renderSortIcon('lokasi')}
                  </th>
                  <th className="py-1.5 px-3 w-32 whitespace-nowrap text-center">
                    Status SLA
                  </th>
                  <th
                    className="py-1.5 px-3 w-32 text-right cursor-pointer group whitespace-nowrap"
                    onClick={() => handleSort('total')}
                  >
                    Downtime (%) {renderSortIcon('total')}
                  </th>
                  <th className="py-1.5 px-2 text-center w-16">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paginatedMachines.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-14 text-center">
                      <div className="max-w-xs mx-auto space-y-2">
                        <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
                          <Search size={22} />
                        </div>
                        <p className="font-bold text-slate-700 text-sm">
                          Tidak ada mesin ditemukan
                        </p>
                        <p className="text-slate-400 text-xs">
                          Coba ubah kata kunci pencarian atau reset filter di atas.
                        </p>
                        {hasActiveFilters && (
                          <button
                            type="button"
                            onClick={handleResetFilters}
                            className="mt-2 px-3 py-1.5 bg-white text-slate-700 border border-[#E5EAF2] rounded-lg text-xs font-medium hover:bg-slate-50 transition-colors cursor-pointer"
                          >
                            Reset Semua Filter
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ) : (
                  paginatedMachines.map((m) => {
                    const totalPct = (m as any).aggregatedData?.total || 0;
                    const isSelected = selectedWsid === m.wsid;
                    const spLabel = getServicePointName(m.sektorBCA, m.wilayahOperasional);
                    const mHealth = evaluateMachineHealth(m);
                    const isCrm =
                      (m.jenisMesin || '').trim().toUpperCase() === 'CRM' ||
                      (m.jenisMesin || '').trim().toUpperCase() === 'ATS';

                    return (
                      <tr
                        key={m.wsid}
                        onClick={() => handleSelectWsid(m.wsid)}
                        className={`cursor-pointer transition-colors ${
                          isSelected
                            ? 'bg-blue-50/70 border-l-2 border-blue-600'
                            : 'hover:bg-slate-50/80 border-l-2 border-transparent'
                        }`}
                      >
                        {/* WSID */}
                        <td className="py-1.5 px-3 whitespace-nowrap font-mono font-bold text-slate-900">
                          <span
                            className={
                              isSelected ? 'text-blue-600 font-bold' : ''
                            }
                          >
                            {m.wsid}
                          </span>
                        </td>

                        {/* Jenis & Vendor */}
                        <td className="py-1.5 px-3 whitespace-nowrap">
                          <div className="flex flex-col gap-0.5 items-start">
                            <span
                              className={`px-1.5 py-0.2 rounded text-[9px] font-semibold font-mono uppercase tracking-wider ${
                                isCrm
                                  ? 'bg-blue-50 text-blue-700 border border-blue-200/70'
                                  : 'bg-slate-100 text-slate-700 border border-slate-200'
                              }`}
                            >
                              {m.jenisMesin || 'ATM'}
                            </span>
                            {m.vendor && m.vendor !== '-' && (
                              <span className="text-[9px] text-slate-500 font-semibold px-1 py-0.2 bg-slate-100 rounded border border-slate-200/60">
                                {m.vendor}
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Sektor & SP */}
                        <td className="py-1.5 px-3 whitespace-nowrap">
                          <div className="flex flex-col">
                            <span className="font-semibold text-slate-700 text-xs">
                              {cleanSektorName(m.sektorBCA) !== '-' ? cleanSektorName(m.sektorBCA) : (m.sektorBCA || '-')}
                            </span>
                            <span className="text-[10px] text-slate-400">
                              SP: {spLabel}
                            </span>
                          </div>
                        </td>

                        {/* Lokasi Mesin */}
                        <td className="py-1.5 px-3 text-slate-600 max-w-xs truncate" title={m.lokasi}>
                          <span className="text-slate-800 font-medium text-xs">{m.lokasi || '-'}</span>
                          {m.wilayahOperasional && (
                            <span className="block text-[10px] text-slate-400 truncate">
                              {m.wilayahOperasional}
                            </span>
                          )}
                        </td>

                        {/* Status SLA */}
                        <td className="py-1.5 px-3 whitespace-nowrap text-center">
                          <div className="inline-flex flex-col items-center gap-0.5">
                            <span
                              className={`inline-flex items-center px-1.5 py-0.2 rounded text-[9px] font-semibold border ${mHealth.badgeColor}`}
                              title={mHealth.primaryReason}
                            >
                              {mHealth.status === 'SAFE' && (
                                <CheckCircle2 size={10} className="mr-1 text-emerald-600" />
                              )}
                              {mHealth.status === 'WARNING' && (
                                <AlertTriangle size={10} className="mr-1 text-amber-600" />
                              )}
                              {mHealth.status === 'CRITICAL' && (
                                <Flame size={10} className="mr-1 text-rose-600" />
                              )}
                              <span>{mHealth.statusLabel}</span>
                            </span>
                            {mHealth.status !== 'SAFE' && (
                              <span
                                className="text-[9px] text-slate-400 truncate max-w-[120px]"
                                title={mHealth.primaryReason}
                              >
                                {mHealth.primaryReason}
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Nilai Downtime (%) */}
                        <td className="py-1.5 px-3 text-right whitespace-nowrap">
                          <div className="flex flex-col items-end gap-0.5">
                            <span
                              className={`font-mono font-bold text-xs ${
                                totalPct > 2.0
                                  ? 'text-rose-600'
                                  : totalPct > 1.0
                                  ? 'text-amber-600'
                                  : 'text-emerald-600'
                              }`}
                            >
                              {totalPct.toFixed(2)}%
                            </span>
                            {/* Visual Progress Bar */}
                            <div className="w-16 bg-slate-100 rounded-full h-1 overflow-hidden">
                              <div
                                className={`h-full rounded-full ${
                                  totalPct > 2.0
                                    ? 'bg-rose-500'
                                    : totalPct > 1.0
                                    ? 'bg-amber-400'
                                    : 'bg-emerald-400'
                                }`}
                                style={{
                                  width: `${Math.min(100, Math.max(5, (totalPct / 5) * 100))}%`
                                }}
                              />
                            </div>
                          </div>
                        </td>

                        {/* Aksi Button */}
                        <td className="py-2.5 px-3 text-center whitespace-nowrap">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSelectWsid(m.wsid);
                            }}
                            className={`p-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                              isSelected
                                ? 'bg-blue-600 text-white shadow-2xs'
                                : 'bg-slate-100 hover:bg-slate-200 text-slate-600 hover:text-slate-900'
                            }`}
                            title={isSelected ? 'Tutup Panel Detail' : 'Buka Panel Detail'}
                          >
                            <ChevronRight
                              size={14}
                              className={`transition-transform ${isSelected ? 'rotate-90' : ''}`}
                            />
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </StickyTableWrapper>

          {/* Pagination Controls */}
          {pageSize > 0 && totalPages > 1 && (
            <div className="p-3.5 bg-white border-t border-[#E5EAF2] flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
              <div className="text-slate-500">
                Halaman <strong className="text-slate-800">{currentPage}</strong> dari{' '}
                <strong className="text-slate-800">{totalPages}</strong>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  disabled={currentPage === 1}
                  onClick={() => {
                    setCurrentPage(1);
                    tableTopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                  }}
                  className="p-1.5 rounded-md border border-[#E5EAF2] text-slate-600 hover:bg-slate-50 disabled:opacity-30 disabled:pointer-events-none cursor-pointer"
                  title="Halaman Pertama"
                >
                  <ChevronsLeft size={14} />
                </button>
                <button
                  type="button"
                  disabled={currentPage === 1}
                  onClick={() => {
                    setCurrentPage((prev) => Math.max(1, prev - 1));
                    tableTopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                  }}
                  className="p-1.5 rounded-md border border-[#E5EAF2] text-slate-600 hover:bg-slate-50 disabled:opacity-30 disabled:pointer-events-none cursor-pointer"
                  title="Halaman Sebelumnya"
                >
                  <ChevronLeft size={14} />
                </button>

                {/* Number Pills */}
                {Array.from({ length: Math.min(5, totalPages) }, (_, idx) => {
                  let p = currentPage - 2 + idx;
                  if (currentPage < 3) p = idx + 1;
                  else if (currentPage > totalPages - 2) p = totalPages - 4 + idx;
                  if (p < 1 || p > totalPages) return null;

                  return (
                    <button
                      key={p}
                      type="button"
                      onClick={() => {
                        setCurrentPage(p);
                        tableTopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                      }}
                      className={`min-w-[28px] h-7 rounded-md text-xs font-mono font-medium transition-colors cursor-pointer ${
                        currentPage === p
                          ? 'bg-blue-600 text-white shadow-2xs'
                          : 'bg-white border border-[#E5EAF2] text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      {p}
                    </button>
                  );
                })}

                <button
                  type="button"
                  disabled={currentPage === totalPages}
                  onClick={() => {
                    setCurrentPage((prev) => Math.min(totalPages, prev + 1));
                    tableTopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                  }}
                  className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-30 disabled:pointer-events-none cursor-pointer"
                  title="Halaman Berikutnya"
                >
                  <ChevronRight size={15} />
                </button>
                <button
                  type="button"
                  disabled={currentPage === totalPages}
                  onClick={() => {
                    setCurrentPage(totalPages);
                    tableTopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                  }}
                  className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-30 disabled:pointer-events-none cursor-pointer"
                  title="Halaman Terakhir"
                >
                  <ChevronsRight size={15} />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ======================================================== */}
        {/* 5. SIDE DETAIL INSPECTOR PANEL                           */}
        {/* ======================================================== */}
        {selectedMachine && (
          <div className="xl:col-span-1 animate-slide-in-right sticky top-6">
            <div className="bg-white rounded-lg shadow-xs border border-[#E5EAF2] overflow-hidden">
              {/* Executive Header */}
              <div className="p-4 bg-slate-900 text-white flex justify-between items-start gap-3 border-b border-slate-800">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-lg font-bold tracking-tight text-white">
                      {selectedMachine.wsid}
                    </span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-semibold font-mono bg-blue-900/60 text-blue-300 border border-blue-700/50">
                      {selectedMachine.jenisMesin || 'ATM'}
                    </span>
                    {selectedMachine.vendor && selectedMachine.vendor !== '-' && (
                      <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-slate-800 text-slate-300 border border-slate-700">
                        {selectedMachine.vendor}
                      </span>
                    )}
                  </div>
                  <p className="text-slate-400 text-xs truncate max-w-[260px]" title={selectedMachine.lokasi}>
                    {selectedMachine.lokasi || '-'}
                  </p>
                  <p className="text-[11px] text-slate-400">
                    Sektor: <strong className="text-slate-200">{cleanSektorName(selectedMachine.sektorBCA) !== '-' ? cleanSektorName(selectedMachine.sektorBCA) : (selectedMachine.sektorBCA || '-')}</strong>
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setSelectedWsid(null)}
                  className="p-1.5 bg-slate-800 hover:bg-slate-700 rounded-md text-slate-300 hover:text-white transition-colors cursor-pointer"
                  title="Tutup Panel"
                >
                  <X size={15} />
                </button>
              </div>

              {/* Segmented Tab Inside Inspector */}
              <div className="p-2.5 bg-slate-50 border-b border-[#E5EAF2] flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setInspectorTab('SLA')}
                  className={`flex-1 py-1.5 px-3 rounded-md text-xs font-semibold transition-colors cursor-pointer flex items-center justify-center gap-1.5 ${
                    inspectorTab === 'SLA'
                      ? 'bg-white text-blue-700 shadow-2xs border border-[#E5EAF2]'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <ShieldCheck size={13} className={inspectorTab === 'SLA' ? 'text-blue-600' : 'text-slate-400'} />
                  <span>Kesehatan SLA</span>
                </button>
                <button
                  type="button"
                  onClick={() => setInspectorTab('KATEGORI')}
                  className={`flex-1 py-1.5 px-3 rounded-md text-xs font-semibold transition-colors cursor-pointer flex items-center justify-center gap-1.5 ${
                    inspectorTab === 'KATEGORI'
                      ? 'bg-white text-blue-700 shadow-2xs border border-[#E5EAF2]'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <Activity size={13} className={inspectorTab === 'KATEGORI' ? 'text-blue-600' : 'text-slate-400'} />
                  <span>5 Kategori Problem</span>
                </button>
              </div>

              <div className="p-5 max-h-[calc(100vh-280px)] overflow-y-auto space-y-4">
                {/* TAB 1: KESEHATAN SLA & JADWAL */}
                {inspectorTab === 'SLA' && (
                  <div className="space-y-4 animate-in fade-in duration-200">
                    {/* SLA Health Card */}
                    {selectedHealth && (
                      <div
                        className={`p-4 rounded-2xl border ${selectedHealth.bgColor} ${selectedHealth.borderColor} space-y-2.5`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-slate-700">Status Kesehatan:</span>
                          <span
                            className={`px-2.5 py-0.5 rounded-full text-xs font-bold border ${selectedHealth.badgeColor}`}
                          >
                            {selectedHealth.statusLabel}
                          </span>
                        </div>

                        <div className="text-xs text-slate-600 flex justify-between">
                          <span>Target SLA ({selectedMachine.jenisMesin || 'ATM'}):</span>
                          <span className="font-bold font-mono">{selectedHealth.targetSla}%</span>
                        </div>

                        <div className="text-xs text-slate-600 flex justify-between">
                          <span>Uptime Terkini:</span>
                          <span
                            className={`font-bold font-mono ${
                              selectedHealth.currentUptime < selectedHealth.targetSla
                                ? 'text-rose-600'
                                : 'text-emerald-600'
                            }`}
                          >
                            {selectedHealth.currentUptime}%
                          </span>
                        </div>

                        {selectedHealth.consecutiveLowMonths > 0 && (
                          <div className="text-xs text-slate-600 flex justify-between">
                            <span>Bulan di bawah SLA:</span>
                            <span className="font-bold text-rose-700 font-mono">
                              {selectedHealth.consecutiveLowMonths} Bulan Berturut-turut
                            </span>
                          </div>
                        )}

                        {selectedHealth.status !== 'SAFE' && selectedHealth.reasons.length > 0 && (
                          <div className="pt-2 border-t border-slate-200/60 space-y-1">
                            <p className="text-[11px] font-bold text-slate-700">
                              Alasan Masuk {selectedHealth.statusLabel}:
                            </p>
                            <ul className="text-[11px] text-slate-600 space-y-1 list-disc list-inside">
                              {selectedHealth.reasons.map((r, ri) => (
                                <li key={ri} className="leading-tight">
                                  {r}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Jadwal Operasional */}
                    {(selectedMachine.hari || selectedMachine.jam) && (
                      <div className="p-3.5 bg-slate-50/80 rounded-2xl border border-slate-200/80 space-y-1.5 text-xs">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                          Jadwal Operasional Mesin
                        </span>
                        {selectedMachine.hari && (
                          <div className="text-slate-600 flex justify-between">
                            <span>Hari Layanan:</span>
                            <span className="font-semibold text-slate-800">
                              {selectedMachine.hari}
                            </span>
                          </div>
                        )}
                        {selectedMachine.jam && (
                          <div className="text-slate-600 flex justify-between">
                            <span>Jam Operasional:</span>
                            <span className="font-semibold text-slate-800">
                              {selectedMachine.jam}
                            </span>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Ringkasan Downtime Aggregated */}
                    <div className="space-y-2">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                        Akumulasi Downtime
                      </span>

                      <div className="grid grid-cols-2 gap-3">
                        <div className="bg-slate-50/80 p-3 rounded-2xl border border-slate-200/80 text-center">
                          <div className="text-[11px] text-slate-500 font-medium">Total FRX</div>
                          <div className="text-lg font-black text-slate-800 font-mono mt-0.5">
                            {(selectedMachine as any).aggregatedData?.frxTotal?.toFixed(2) || 0}
                          </div>
                        </div>

                        <div className="bg-slate-50/80 p-3 rounded-2xl border border-slate-200/80 text-center">
                          <div className="text-[11px] text-slate-500 font-medium">Total DUR (mnt)</div>
                          <div className="text-lg font-black text-slate-800 font-mono mt-0.5">
                            {(selectedMachine as any).aggregatedData?.durTotal?.toFixed(2) || 0}
                          </div>
                        </div>
                      </div>

                      <div className="bg-rose-50/60 p-3 rounded-2xl border border-rose-200/80 text-center">
                        <div className="text-[11px] text-rose-600 font-medium">
                          Total Persentase Downtime
                        </div>
                        <div className="text-2xl font-black text-rose-600 font-mono mt-0.5">
                          {((selectedMachine as any).aggregatedData?.total || 0).toFixed(2)}%
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* TAB 2: 5 KATEGORI PROBLEM */}
                {inspectorTab === 'KATEGORI' && (
                  <div className="space-y-3 animate-in fade-in duration-200">
                    <p className="text-xs text-slate-500">
                      Rincian frekuensi, durasi, dan persentase dampak pada 5 kategori problem utama:
                    </p>

                    {['uh', 'kom', 'up', 'hw', 'll'].map((cat) => {
                      const agg = (selectedMachine as any).aggregatedData;
                      const frxDur = getFrxDurForCategory(agg, cat);
                      const pct = agg ? agg[cat] || 0 : 0;

                      const labelMap: Record<string, { label: string; desc: string }> = {
                        uh: { label: 'Uang Habis (UH)', desc: 'Kehabisan lembar tunai' },
                        kom: { label: 'Komunikasi (KOM)', desc: 'Jaringan offline / timeout' },
                        up: { label: 'Uang Penuh (UP)', desc: 'Slot setoran penuh (CRM)' },
                        hw: { label: 'Hardware (H/W)', desc: 'Kendala modul fisik mesin' },
                        ll: { label: 'Lain-lain (LL)', desc: 'Faktor eksternal / pendukung' }
                      };

                      const meta = labelMap[cat];

                      return (
                        <div
                          key={cat}
                          className="bg-white border border-[#E5EAF2] rounded-lg p-2.5 shadow-2xs hover:border-blue-400 transition-colors"
                        >
                          <div className="flex items-center justify-between pb-1.5 border-b border-slate-100">
                            <div>
                              <div className="font-semibold text-slate-900 text-xs">
                                {meta.label}
                              </div>
                              <div className="text-[10px] text-slate-400">{meta.desc}</div>
                            </div>
                            <span
                              className={`text-xs font-mono font-bold ${
                                pct > 0.5 ? 'text-rose-600' : 'text-slate-700'
                              }`}
                            >
                              {pct.toFixed(2)}%
                            </span>
                          </div>

                          <div className="flex justify-between items-center text-xs pt-1.5">
                            <div className="text-center flex-1">
                              <div className="text-slate-400 text-[10px]">FREQ</div>
                              <div className="font-bold text-slate-700 font-mono text-xs">
                                {typeof frxDur.frx === 'number'
                                  ? frxDur.frx.toFixed(2)
                                  : frxDur.frx}
                              </div>
                            </div>
                            <div className="w-px h-5 bg-slate-100" />
                            <div className="text-center flex-1">
                              <div className="text-slate-400 text-[10px]">DURASI</div>
                              <div className="font-bold text-slate-700 font-mono text-xs">
                                {typeof frxDur.dur === 'number'
                                  ? frxDur.dur.toFixed(2)
                                  : frxDur.dur}
                              </div>
                            </div>
                            <div className="w-px h-5 bg-slate-100" />
                            <div className="text-center flex-1">
                              <div className="text-slate-400 text-[10px]">BOBOT</div>
                              <div className="font-bold text-blue-600 font-mono text-xs">
                                {pct.toFixed(2)}%
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Shortcut to Deep Analytics */}
                <div className="pt-2 border-t border-[#E5EAF2]">
                  <button
                    type="button"
                    onClick={() => navigate(`/wsid/${selectedMachine.wsid}`)}
                    className="w-full py-2 px-3.5 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-1.5 text-xs shadow-xs cursor-pointer"
                  >
                    <span>Buka Analisis Bulanan Lengkap</span>
                    <ExternalLink size={13} />
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
