import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, RefreshCw, UploadCloud, Loader2 } from 'lucide-react';
import { useDataStore } from '../store/useDataStore';
import { fetchDashboardData } from '../utils/spreadsheetService';
import { matchData } from '../utils/dataMatcher';
import { saveDashboardSnapshot, hasValidUptimeInDataset } from '../utils/dbCache';

/**
 * Mengembalikan true jika store sudah memiliki minimal 1 data uptime bulanan mesin
 * (membedakan data uptime nyata dari fallback katalog mesin kosong).
 */
export function useHasUptimeData(): boolean {
  const { machines, rawUptimeFiles } = useDataStore();
  return useMemo(() => {
    if (Array.isArray(rawUptimeFiles) && rawUptimeFiles.length > 0) return true;
    return Array.isArray(machines) && machines.some((m) => Array.isArray(m.monthlyData) && m.monthlyData.length > 0);
  }, [machines, rawUptimeFiles]);
}

export default function UptimeDataStatusBanner() {
  const navigate = useNavigate();
  const hasUptimeData = useHasUptimeData();
  const {
    isSyncing,
    setMachines,
    setAvailablePeriodes,
    setGlobalTrendData,
    setRawMasterData,
    setRawUptimeFiles,
    setLockedPeriodes,
    setLastDbSync
  } = useDataStore();
  const [isManualSyncing, setIsManualSyncing] = useState(false);

  if (hasUptimeData) return null;

  const handleRetryCloudSync = async () => {
    setIsManualSyncing(true);
    try {
      const dbData = await fetchDashboardData();
      if (dbData?.hasData && hasValidUptimeInDataset(dbData.parsedUptimeFiles, dbData.prematchedMachines)) {
        const matched =
          dbData.prematchedMachines && dbData.prematchedMachines.length > 0
            ? dbData.prematchedMachines
            : matchData(dbData.masterData || [], dbData.parsedUptimeFiles || []);
        const periods = Array.from(
          new Set((dbData.parsedUptimeFiles || []).map((f) => f.periode).filter(Boolean))
        ).sort();
        setMachines(matched);
        if (periods.length > 0) setAvailablePeriodes(periods);
        if (dbData.globalTrendData && dbData.globalTrendData.length > 0) {
          setGlobalTrendData(dbData.globalTrendData);
        }
        setRawMasterData(dbData.masterData || []);
        setRawUptimeFiles(dbData.parsedUptimeFiles || []);
        if (dbData.lockedPeriodes) setLockedPeriodes(dbData.lockedPeriodes);
        setLastDbSync(dbData.lastUpdated || new Date().toISOString());

        await saveDashboardSnapshot({
          masterData: dbData.masterData || [],
          parsedUptimeFiles: dbData.parsedUptimeFiles || [],
          lockedPeriodes: dbData.lockedPeriodes || [],
          followUpTickets: dbData.tickets || [],
          lastUpdated: dbData.lastUpdated,
          matchedMachines: dbData.prematchedMachines,
          cloudMeta: dbData.cloudMeta
            ? {
                updatedAt: dbData.cloudMeta.updatedAt,
                masterUpdatedAt: dbData.cloudMeta.masterUpdatedAt,
                periodUpdatedAt: dbData.cloudMeta.periodUpdatedAt
              }
            : undefined,
          timestamp: Date.now()
        });
      }
    } catch (err) {
      console.warn('Retry cloud sync gagal:', err);
    } finally {
      setIsManualSyncing(false);
    }
  };

  if (isSyncing || isManualSyncing) {
    return (
      <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg flex items-center gap-2.5 text-xs text-blue-800 shadow-2xs">
        <Loader2 size={15} className="animate-spin text-blue-600 shrink-0" />
        <span>
          <strong>Menyinkronkan data uptime bulanan dari Cloud Supabase...</strong> Perhitungan persentase uptime akan tampil otomatis begitu proses selesai.
        </span>
      </div>
    );
  }

  return (
    <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-amber-900 shadow-2xs">
      <div className="flex items-start gap-2.5">
        <AlertTriangle size={16} className="text-amber-600 shrink-0 mt-0.5" />
        <div>
          <p className="font-semibold">Data uptime bulanan belum tersedia di Cloud Supabase / browser ini.</p>
          <p className="text-[11px] text-amber-800/90 mt-0.5">
            Angka 100% sebelumnya muncul karena data downtime bulanan belum tersinkron dari perangkat utama. Buka dashboard di PC utama agar data otomatis tersinkron ke Cloud, atau upload ulang file uptime bulanan.
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={handleRetryCloudSync}
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-white hover:bg-amber-100 border border-amber-300 text-amber-900 rounded-md font-semibold transition-colors cursor-pointer"
        >
          <RefreshCw size={12} />
          <span>Cek Ulang Cloud</span>
        </button>
        <button
          type="button"
          onClick={() => navigate('/upload')}
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-md font-semibold transition-colors cursor-pointer"
        >
          <UploadCloud size={12} />
          <span>Upload Data</span>
        </button>
      </div>
    </div>
  );
}
