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
    selectedPeriode, setSelectedPeriode,
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
    if (periode === 'ALL') return 'Semua Bulan (Agregat)';
    return formatBulanTahun(periode);
  };

  const activeSync = isSyncing || isRefreshing;

  return (
    <div className="bg-white rounded-2xl px-5 py-3.5 border border-slate-100 shadow-[0px_3.5px_5.5px_rgba(0,0,0,0.02)] flex flex-wrap items-center justify-between gap-4">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-4 sm:gap-6">
        <div className="flex items-center gap-2 mr-1">
          <div className="w-7 h-7 rounded-lg bg-teal-50 text-[#319795] flex items-center justify-center">
            <Filter size={15} />
          </div>
          <span className="text-xs font-bold text-[#2D3748]">Filter Global</span>
        </div>

        {/* Periode Filter: Range Dari & Sampai */}
        <div className="flex items-center gap-2 bg-slate-50 border border-slate-200/80 rounded-xl px-3 py-1.5 shadow-xs">
          <Calendar size={15} className="text-[#319795]" />
          <span className="text-[11px] font-semibold text-slate-500 uppercase">Dari:</span>
          <select
            value={selectedPeriodeStart}
            onChange={(e) => setSelectedPeriodeStart(e.target.value)}
            className="bg-transparent focus:outline-none text-xs font-medium text-slate-700 cursor-pointer pr-1"
          >
            <option value="ALL">Semua Periode</option>
            {availablePeriodes.map((p) => (
              <option key={p} value={p}>{getMonthText(p)}</option>
            ))}
          </select>
          <span className="text-slate-300">|</span>
          <span className="text-[11px] font-semibold text-slate-500 uppercase">Sampai:</span>
          <select
            value={selectedPeriodeEnd}
            onChange={(e) => setSelectedPeriodeEnd(e.target.value)}
            className="bg-transparent focus:outline-none text-xs font-medium text-slate-700 cursor-pointer pr-1"
          >
            <option value="ALL">Semua Periode</option>
            {availablePeriodes.map((p) => (
              <option key={p} value={p}>{getMonthText(p)}</option>
            ))}
          </select>
        </div>

        {/* Jenis Mesin Filter */}
        <div className="flex items-center gap-2 bg-slate-50 border border-slate-200/80 rounded-xl px-3 py-1.5 shadow-xs">
          <MonitorSmartphone size={15} className="text-[#319795]" />
          <select
            value={selectedJenisMesin}
            onChange={(e) => setSelectedJenisMesin(e.target.value as any)}
            className="bg-transparent focus:outline-none text-xs font-medium text-slate-700 cursor-pointer pr-1"
          >
            <option value="ALL">Semua Mesin</option>
            <option value="ATM">ATM</option>
            <option value="CRM">CRM (ATS)</option>
          </select>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3">
        {/* Dynamic Sync Status Badge & Instant Manual Refresh */}
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
          className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-medium border transition-all cursor-pointer shadow-xs ${
            activeSync
              ? 'bg-teal-50 text-[#319795] border-teal-200'
              : syncError
              ? 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100'
              : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
          }`}
        >
          {activeSync ? (
            <>
              <RefreshCw size={13} className="animate-spin text-[#319795]" />
              <span>Sinkronisasi...</span>
            </>
          ) : syncError ? (
            <>
              <AlertCircle size={13} className="text-amber-500" />
              <span>Cache Lokal (Coba Lagi)</span>
            </>
          ) : (
            <>
              <CheckCircle2 size={13} className="text-emerald-500" />
              <span>Tersinkronisasi</span>
              <RefreshCw size={11} className="text-slate-400 ml-0.5 hover:text-slate-600" />
            </>
          )}
        </button>

        {/* 1-Click Comprehensive Multi-Sheet Excel Export */}
        <button
          onClick={handleExportAll}
          title="Download laporan lengkap mencakup Ringkasan Sektor, Data WSID per Sektor (BCA & Non BCA), Tren Bulanan Abacus Jakarta, dan Top Problem"
          className="flex items-center gap-2 px-3.5 py-1.5 bg-[#4FD1C5] hover:bg-[#319795] text-white font-semibold rounded-xl text-xs shadow-[0px_4px_12px_rgba(79,209,197,0.35)] transition-all active:scale-95 cursor-pointer"
        >
          <FileSpreadsheet size={15} />
          <span>Export Laporan Lengkap</span>
        </button>
      </div>
    </div>
  );
}
