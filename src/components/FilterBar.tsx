import { useState } from 'react';
import { useDataStore } from '../store/useDataStore';
import { Filter, Calendar, MonitorSmartphone, FileSpreadsheet, RefreshCw, CheckCircle2, AlertCircle } from 'lucide-react';
import { exportComprehensiveExcel, formatBulanTahun } from '../utils/comprehensiveExporter';
import { fetchDashboardData, fetchFollowUpTickets, fetchFollowUpTicketsModern } from '../utils/spreadsheetService';
import { saveDashboardSnapshot } from '../utils/dbCache';
import { matchData } from '../utils/dataMatcher';

export default function FilterBar() {
  const {
    machines, setMachines,
    rawMasterData, setRawMasterData,
    rawUptimeFiles, setRawUptimeFiles,
    availablePeriodes, setAvailablePeriodes,
    setGlobalTrendData,
    lockedPeriodes, setLockedPeriodes,
    selectedPeriode,
    selectedPeriodeStart, setSelectedPeriodeStart,
    selectedPeriodeEnd, setSelectedPeriodeEnd,
    selectedJenisMesin, setSelectedJenisMesin,
    lastDbSync, setLastDbSync,
    setFollowUpTickets,
    setModernTickets,
    isSyncing, setIsSyncing,
    syncError, setSyncError,
  } = useDataStore();

  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleExportAll = () => {
    exportComprehensiveExcel({
      masterData: rawMasterData,
      parsedUptimeFiles: rawUptimeFiles,
      machines,
      selectedPeriode
    });
  };

  const handleManualRefresh = async () => {
    if (isSyncing || isRefreshing) return;
    setIsRefreshing(true);
    setIsSyncing(true);

    try {
      const dbData = await fetchDashboardData();
      let tickets = dbData.tickets || [];
      if (!tickets || tickets.length === 0) {
        try {
          const tRes = await fetchFollowUpTickets();
          if (tRes.success && tRes.tickets) tickets = tRes.tickets;
        } catch (e) {}
      }

      if (dbData.modernFollowUpTickets && dbData.modernFollowUpTickets.length > 0) {
        setModernTickets(dbData.modernFollowUpTickets);
      } else {
        try {
          const mRes = await fetchFollowUpTicketsModern();
          if (mRes.success && mRes.tickets) setModernTickets(mRes.tickets);
        } catch (e) {}
      }

      if (dbData && dbData.hasData && dbData.masterData?.length > 0) {
        const matchedMachines = matchData(dbData.masterData, dbData.parsedUptimeFiles || []);
        const periods = new Set<string>();
        const trendData: any[] = [];

        (dbData.parsedUptimeFiles || []).forEach(f => {
          periods.add(f.periode);
          const atmCount = f.atmData.filter(r => String(r.DESCKCU || r.KWW || '').trim().toUpperCase() === 'ABACUS JAKARTA').length;
          const atsCount = f.atsData.filter(r => String(r.DESCKCU || r.KWW || '').trim().toUpperCase() === 'ABACUS JAKARTA').length;

          trendData.push({
            periode: f.periode,
            uptimeATM: f.rekapUptimeATM || 0,
            uptimeCRM: f.rekapUptimeCRM || 0,
            jumlahMesinATM: atmCount,
            jumlahMesinCRM: atsCount
          });
        });

        const sortedPeriods = Array.from(periods).sort();
        trendData.sort((a, b) => a.periode.localeCompare(b.periode));

        setMachines(matchedMachines);
        setAvailablePeriodes(sortedPeriods);
        setGlobalTrendData(trendData);
        setRawMasterData(dbData.masterData);
        setRawUptimeFiles(dbData.parsedUptimeFiles || []);
        setLockedPeriodes(dbData.lockedPeriodes || []);
        setLastDbSync(dbData.lastUpdated);
        if (tickets.length > 0) setFollowUpTickets(tickets);

        await saveDashboardSnapshot({
          masterData: dbData.masterData,
          parsedUptimeFiles: dbData.parsedUptimeFiles || [],
          lockedPeriodes: dbData.lockedPeriodes || [],
          followUpTickets: tickets,
          lastUpdated: dbData.lastUpdated,
          timestamp: Date.now()
        });

        setSyncError(null);
      }
    } catch (err: any) {
      console.error('Gagal refresh manual:', err);
      setSyncError(err?.message || String(err));
    } finally {
      setIsRefreshing(false);
      setIsSyncing(false);
    }
  };

  const getMonthText = (periode: string) => {
    if (periode === 'ALL') return 'Semua Periode';
    return formatBulanTahun(periode);
  };

  const activeSync = isSyncing || isRefreshing;

  return (
    <div className="bg-white rounded-lg px-3 py-1.5 border border-[#E5EAF2] shadow-2xs flex flex-wrap items-center justify-between gap-2">
      {/* Filters Area */}
      <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
        <div className="flex items-center gap-1 text-slate-700 mr-0.5">
          <Filter size={13} className="text-slate-400" />
          <span className="text-xs font-semibold text-slate-800">Filter Global</span>
        </div>

        {/* Periode Filter: Range Dari & Sampai */}
        <div className="flex items-center gap-1.5 bg-slate-50 border border-[#E5EAF2] rounded-md px-2 h-8 text-xs">
          <Calendar size={12} className="text-slate-400" />
          <span className="text-[11px] font-medium text-slate-500">Dari:</span>
          <select
            value={selectedPeriodeStart}
            onChange={(e) => setSelectedPeriodeStart(e.target.value)}
            className="bg-transparent focus:outline-none text-xs font-medium text-slate-800 cursor-pointer pr-1"
          >
            <option value="ALL">Semua Periode</option>
            {availablePeriodes.map((p) => (
              <option key={p} value={p}>{getMonthText(p)}</option>
            ))}
          </select>
          <span className="text-slate-300">|</span>
          <span className="text-[11px] font-medium text-slate-500">Sampai:</span>
          <select
            value={selectedPeriodeEnd}
            onChange={(e) => setSelectedPeriodeEnd(e.target.value)}
            className="bg-transparent focus:outline-none text-xs font-medium text-slate-800 cursor-pointer pr-1"
          >
            <option value="ALL">Semua Periode</option>
            {availablePeriodes.map((p) => (
              <option key={p} value={p}>{getMonthText(p)}</option>
            ))}
          </select>
        </div>

        {/* Jenis Mesin Filter */}
        <div className="flex items-center gap-1.5 bg-slate-50 border border-[#E5EAF2] rounded-md px-2 h-8 text-xs">
          <MonitorSmartphone size={12} className="text-slate-400" />
          <select
            value={selectedJenisMesin}
            onChange={(e) => setSelectedJenisMesin(e.target.value as any)}
            className="bg-transparent focus:outline-none text-xs font-medium text-slate-800 cursor-pointer pr-1"
          >
            <option value="ALL">Semua Mesin</option>
            <option value="ATM">ATM</option>
            <option value="CRM">CRM (ATS)</option>
          </select>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex items-center gap-1.5">
        {/* Sync Status Badge & Instant Manual Refresh */}
        <button
          onClick={handleManualRefresh}
          disabled={activeSync}
          title={
            activeSync
              ? 'Sedang menyinkronkan data dengan Google Spreadsheet...'
              : syncError
              ? `Terjadi kendala koneksi: ${syncError}. Klik untuk coba lagi.`
              : `Data tersinkronisasi. Terakhir: ${lastDbSync ? new Date(lastDbSync).toLocaleTimeString('id-ID') : 'Terkini'}. Klik untuk sinkron ulang.`
          }
          className={`flex items-center gap-1.5 px-2.5 h-8 rounded-md text-xs font-medium border transition-colors cursor-pointer ${
            activeSync
              ? 'bg-blue-50 text-blue-700 border-blue-200'
              : syncError
              ? 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100'
              : 'bg-white text-slate-600 border-[#E5EAF2] hover:bg-slate-50'
          }`}
        >
          {activeSync ? (
            <>
              <RefreshCw size={12} className="animate-spin text-blue-600" />
              <span>Sinkronisasi...</span>
            </>
          ) : syncError ? (
            <>
              <AlertCircle size={12} className="text-amber-500" />
              <span>Cache Lokal (Coba Lagi)</span>
            </>
          ) : (
            <>
              <CheckCircle2 size={12} className="text-emerald-500" />
              <span>Tersinkronisasi</span>
              <RefreshCw size={11} className="text-slate-400 ml-0.5 hover:text-slate-600" />
            </>
          )}
        </button>

        {/* 1-Click Comprehensive Multi-Sheet Excel Export - Solid Blue Enterprise Button */}
        <button
          onClick={handleExportAll}
          title="Download laporan lengkap mencakup Ringkasan Sektor, Data WSID per Sektor (BCA & Non BCA), Tren Bulanan Abacus Jakarta, dan Top Problem"
          className="flex items-center gap-1.5 px-3 h-8 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-medium rounded-md text-xs transition-colors cursor-pointer shadow-2xs"
        >
          <FileSpreadsheet size={13} />
          <span>Export Laporan Lengkap</span>
        </button>
      </div>
    </div>
  );
}
