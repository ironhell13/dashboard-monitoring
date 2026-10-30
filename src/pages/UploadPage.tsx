import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  UploadCloud, 
  FileSpreadsheet, 
  CheckCircle2, 
  AlertCircle, 
  Loader2, 
  Lock, 
  ArrowLeft, 
  Database, 
  ShieldCheck, 
  Info,
  Unlock
} from 'lucide-react';
import { parseMasterData, parseUptimeFile, type MasterRow, type ParsedUptimeFile } from '../utils/excelParser';
import { matchData } from '../utils/dataMatcher';
import { useDataStore } from '../store/useDataStore';
import { saveMasterData, saveUptimePeriod, unlockPeriode, isGasEnvironment } from '../utils/spreadsheetService';
import { isBackendConfigured } from '../utils/apiClient';
import { saveDashboardSnapshot } from '../utils/dbCache';
import { formatBulanTahun, normalizePeriode } from '../utils/comprehensiveExporter';

const formatMonthPeriode = (periode: string): string => {
  return formatBulanTahun(periode);
};

export default function UploadPage() {
  const navigate = useNavigate();
  const { 
    machines,
    rawMasterData,
    rawUptimeFiles,
    lockedPeriodes,
    setMachines, 
    setAvailablePeriodes, 
    setGlobalTrendData, 
    setRawMasterData, 
    setRawUptimeFiles,
    setLockedPeriodes,
    setLastDbSync,
    lastDbSync
  } = useDataStore();
  
  const [masterFile, setMasterFile] = useState<File | null>(null);
  const [uptimeFiles, setUptimeFiles] = useState<File[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [unlockingPeriode, setUnlockingPeriode] = useState<string | null>(null);

  const hasExistingMaster = rawMasterData && rawMasterData.length > 0;
  const hasExistingUptime = rawUptimeFiles && rawUptimeFiles.length > 0;
  const hasExistingData = hasExistingMaster || hasExistingUptime || machines.length > 0;

  const handleUnlock = async (periodeToUnlock: string) => {
    const monthLabel = formatMonthPeriode(periodeToUnlock);
    const confirm = window.confirm(`Buka kunci periode ${monthLabel}?\n\nData uptime periode ini akan dibuka kuncinya dari proteksi database sehingga Anda dapat meng-upload ulang file baru untuk periode ini.`);
    if (!confirm) return;

    setUnlockingPeriode(periodeToUnlock);
    try {
      const res = await unlockPeriode(periodeToUnlock);
      if (res.success) {
        const nextLocked = lockedPeriodes.filter(p => p !== periodeToUnlock);
        const nextUptime = rawUptimeFiles.filter(f => normalizePeriode(f.periode) !== normalizePeriode(periodeToUnlock));
        setLockedPeriodes(nextLocked);
        setRawUptimeFiles(nextUptime);
        
        // Re-match machines
        const reMatched = matchData(rawMasterData, nextUptime);
        setMachines(reMatched);
        
        alert(`Periode ${monthLabel} berhasil dibuka kuncinya.`);
      } else {
        alert(res.message || `Gagal membuka kunci periode ${monthLabel}`);
      }
    } catch (e: any) {
      alert("Error membuka kunci: " + (e?.message || String(e)));
    } finally {
      setUnlockingPeriode(null);
    }
  };

  const handleSyncCachedToBackend = async () => {
    if (!hasExistingMaster && !hasExistingUptime) return;
    setIsProcessing(true);
    setError(null);
    setStatusMessage("Menghubungkan ke Spreadsheet Backend...");
    setProgress(10);

    try {
      if (hasExistingMaster && rawMasterData && rawMasterData.length > 0) {
        setStatusMessage(`Menyimpan Master Data (${rawMasterData.length} mesin) ke Google Spreadsheet...`);
        const mRes = await saveMasterData(rawMasterData);
        if (!mRes.success) throw new Error(mRes.message || mRes.error || "Gagal menyimpan Master Data");
        setProgress(45);
      }

      if (hasExistingUptime && rawUptimeFiles && rawUptimeFiles.length > 0) {
        const total = rawUptimeFiles.length;
        for (let i = 0; i < total; i++) {
          const file = rawUptimeFiles[i];
          const label = formatMonthPeriode(file.periode);
          setStatusMessage(`Menyimpan Uptime ${label} (${i + 1}/${total}) ke Google Spreadsheet...`);
          const uRes = await saveUptimePeriod(file, true);
          if (!uRes.success) throw new Error(uRes.message || uRes.error || `Gagal menyimpan Uptime ${label}`);
          setProgress(45 + Math.floor(((i + 1) / total) * 50));
        }
      }

      setProgress(100);
      setStatusMessage("✅ Berhasil! Seluruh Master Data & Uptime berhasil disimpan ke Spreadsheet Backend!");
      setTimeout(() => {
        setIsProcessing(false);
        setStatusMessage(null);
        window.location.reload();
      }, 1500);
    } catch (err: any) {
      setError(err?.message || String(err));
      setIsProcessing(false);
    }
  };

  const handleProcess = async () => {
    // Validasi
    if (!masterFile && uptimeFiles.length === 0) {
      setError("Pilih minimal satu file: Master Data Mesin atau file Uptime Bulanan untuk diproses.");
      return;
    }
    if (!hasExistingMaster && !masterFile && uptimeFiles.length > 0) {
      setError("Belum ada Master Data Mesin di database. Mohon upload file Master Data Mesin terlebih dahulu.");
      return;
    }

    setIsProcessing(true);
    setError(null);
    setStatusMessage("Membaca dan memproses file Excel di browser...");
    setProgress(10);

    try {
      // 1. Parse Master Data
      let activeMasterData: MasterRow[] = rawMasterData || [];
      if (masterFile) {
        setStatusMessage("Mengekstrak file Master Data...");
        activeMasterData = await parseMasterData(masterFile);
        setProgress(25);
      }

      // 2. Parse Uptime Files
      const newlyParsedUptimeFiles: ParsedUptimeFile[] = [];
      if (uptimeFiles.length > 0) {
        setStatusMessage("Mengekstrak file Uptime Bulanan...");
        for (let i = 0; i < uptimeFiles.length; i++) {
          const parsed = await parseUptimeFile(uptimeFiles[i]);
          newlyParsedUptimeFiles.push(parsed);
          setProgress(25 + Math.floor(((i + 1) / uptimeFiles.length) * 20));
        }
      }

      // 3. Simpan Master Data ke Spreadsheet secara terpisah (Cepat: ~1s)
      if (masterFile && activeMasterData.length > 0) {
        setStatusMessage(`Menyimpan Master Data (${activeMasterData.length} mesin) ke database...`);
        const mRes = await saveMasterData(activeMasterData);
        if (!mRes.success) {
          throw new Error(mRes.message || mRes.error || "Gagal menyimpan Master Data ke database.");
        }
        setProgress(50);
      }

      // 4. Simpan Uptime bulan demi bulan dengan progress real-time (Cepat: ~1-2s per bulan)
      let currentLocked = [...(lockedPeriodes || [])];
      let combinedUptimeFiles: ParsedUptimeFile[] = [...(rawUptimeFiles || [])];

      if (newlyParsedUptimeFiles.length > 0) {
        const totalFiles = newlyParsedUptimeFiles.length;
        for (let i = 0; i < totalFiles; i++) {
          const file = newlyParsedUptimeFiles[i];
          const monthLabel = formatMonthPeriode(file.periode);
          const isUpdating = currentLocked.includes(file.periode);

          setStatusMessage(`${isUpdating ? 'Memperbarui' : 'Menyimpan'} Uptime ${monthLabel} (${i + 1}/${totalFiles}) ke database...`);
          const uRes = await saveUptimePeriod(file, true);

          if (!uRes.success) {
            throw new Error(uRes.message || uRes.error || `Gagal menyimpan Uptime periode ${monthLabel}`);
          }

          if (!currentLocked.includes(file.periode)) {
            currentLocked.push(file.periode);
          }
          combinedUptimeFiles = combinedUptimeFiles.filter(f => f.periode !== file.periode);
          combinedUptimeFiles.push(file);

          setProgress(50 + Math.floor(((i + 1) / totalFiles) * 35));
        }
      }

      // 5. Re-Match Data untuk dashboard
      setStatusMessage("Menyusun performa mesin...");
      setProgress(90);
      const matchedMachines = matchData(activeMasterData, combinedUptimeFiles);

      // 6. Extract periods dan global trend data
      const periods = new Set<string>();
      const trendData: any[] = [];
      
      combinedUptimeFiles.forEach(f => {
        periods.add(f.periode);
        const atmCount = f.atmData.filter(r => String(r.DESCKCU || '').trim().toUpperCase() === 'ABACUS JAKARTA').length;
        const atsCount = f.atsData.filter(r => String(r.DESCKCU || '').trim().toUpperCase() === 'ABACUS JAKARTA').length;
        
        trendData.push({
          periode: f.periode,
          uptimeATM: f.rekapUptimeATM,
          uptimeCRM: f.rekapUptimeCRM,
          jumlahMesinATM: atmCount,
          jumlahMesinCRM: atsCount
        });
      });
      
      const sortedPeriods = Array.from(periods).sort();
      trendData.sort((a, b) => a.periode.localeCompare(b.periode));

      // 7. Update Zustand Store & Simpan Snapshot ke IndexedDB
      setProgress(98);
      setMachines(matchedMachines);
      setAvailablePeriodes(sortedPeriods);
      setGlobalTrendData(trendData);
      setRawMasterData(activeMasterData);
      setRawUptimeFiles(combinedUptimeFiles);
      setLockedPeriodes(currentLocked);
      setLastDbSync(new Date().toISOString());

      await saveDashboardSnapshot({
        masterData: activeMasterData,
        parsedUptimeFiles: combinedUptimeFiles,
        lockedPeriodes: currentLocked,
        followUpTickets: [],
        lastUpdated: new Date().toISOString(),
        timestamp: Date.now()
      });

      setProgress(100);
      setStatusMessage("Selesai! Mengarahkan ke Dashboard...");

      setTimeout(() => {
        navigate('/dashboard');
      }, 500);

    } catch (err: any) {
      setError(err.message || "Terjadi kesalahan saat memproses data.");
      setIsProcessing(false);
      setStatusMessage(null);
    }
  };

  return (
    <div className="min-h-screen bg-[#F5F7FB] flex items-center justify-center p-4 sm:p-6 animate-fade-in">
      <div className="bg-white rounded-lg max-w-4xl w-full p-5 sm:p-6 border border-[#E5EAF2] shadow-2xs">
        {/* Header with back button */}
        <div className="flex items-center justify-between mb-4">
          {hasExistingData ? (
            <button
              onClick={() => navigate('/dashboard')}
              className="inline-flex items-center gap-1.5 px-3 h-8 text-xs font-medium text-slate-700 bg-white border border-[#E5EAF2] rounded-md hover:bg-slate-50 transition-colors shadow-2xs cursor-pointer"
            >
              <ArrowLeft size={13} />
              <span>Kembali ke Dashboard</span>
            </button>
          ) : (
            <div></div>
          )}

          <div className="inline-flex items-center gap-1.5 px-2.5 h-8 bg-slate-50 border border-[#E5EAF2] rounded-md text-xs text-slate-600 font-medium">
            <Database size={12} className={(isGasEnvironment() || isBackendConfigured()) ? "text-emerald-600" : "text-amber-600"} />
            <span>{(isGasEnvironment() || isBackendConfigured()) ? "Tersambung ke Google Spreadsheet Backend" : "Database Mode Lokal (Tersimpan)"}</span>
          </div>
        </div>

        <div className="text-center mb-5">
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">Database & Upload Data</h1>
          <p className="text-xs text-slate-500 mt-0.5 max-w-xl mx-auto">
            Data tersimpan permanen di Google Spreadsheet. Master Data dapat diupdate kapan saja, dan data uptime bulanan yang sudah masuk otomatis dikunci agar tidak tertimpa.
          </p>
        </div>

        {/* Sync Cache to Backend Banner */}
        {hasExistingData && (isGasEnvironment() || isBackendConfigured()) && (
          <div className="mb-5 p-4 bg-blue-50/70 border border-blue-200 rounded-lg flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-2xs">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-blue-600 rounded-lg text-white mt-0.5">
                <UploadCloud size={18} />
              </div>
              <div>
                <h4 className="text-xs font-semibold text-slate-900 flex items-center gap-2">
                  <span>Data Aktif di Browser:</span>
                  <span className="text-[11px] font-medium text-blue-700 bg-blue-100 px-2 py-0.5 rounded">
                    {rawMasterData?.length || 0} Mesin &bull; {rawUptimeFiles?.length || 0} Bulan Uptime
                  </span>
                </h4>
                <p className="text-xs text-slate-600 mt-0.5 max-w-xl">
                  Data yang Anda upload sebelumnya saat ini berada di memori browser. Klik tombol di samping untuk langsung menyimpan data ini ke Spreadsheet Backend tanpa perlu upload ulang file.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleSyncCachedToBackend}
              disabled={isProcessing}
              className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-lg shadow-2xs transition-colors flex items-center gap-2 whitespace-nowrap cursor-pointer disabled:opacity-50 shrink-0"
            >
              {isProcessing ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  <span>Menyimpan ke Spreadsheet...</span>
                </>
              ) : (
                <>
                  <UploadCloud size={14} />
                  <span>Kirim ke Spreadsheet Sekarang</span>
                </>
              )}
            </button>
          </div>
        )}

        {/* Locked Periods Status Banner */}
        {lockedPeriodes && lockedPeriodes.length > 0 && (
          <div className="mb-5 p-4 bg-amber-50/60 border border-amber-200 rounded-lg">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-amber-100 rounded-lg text-amber-700 mt-0.5">
                <Lock size={16} />
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-semibold text-amber-900 flex items-center gap-2">
                    <span>Periode Terkunci di Database (Anti-Overwrite)</span>
                    <span className="text-[11px] font-medium text-amber-700 bg-amber-100 px-2 py-0.5 rounded">
                      {lockedPeriodes.length} Bulan
                    </span>
                  </h4>
                  {lastDbSync && (
                    <span className="text-[10px] text-amber-700/80">
                      Sync: {new Date(lastDbSync).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </span>
                  )}
                </div>
                <p className="text-xs text-amber-700 mt-0.5">
                  Periode berikut sudah tersimpan di database dan dilindungi. Upload file baru tidak akan menimpa data pada bulan-bulan ini.
                </p>
                <div className="flex flex-wrap gap-2 mt-2.5">
                  {lockedPeriodes.map((p) => (
                    <span 
                      key={p} 
                      className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-white border border-amber-300 rounded text-xs font-medium text-amber-800 shadow-2xs"
                    >
                      <ShieldCheck size={13} className="text-amber-600" />
                      <span>{formatMonthPeriode(p)}</span>
                      <button
                        type="button"
                        onClick={() => handleUnlock(p)}
                        disabled={unlockingPeriode === p}
                        title={`Buka kunci periode ${formatMonthPeriode(p)} untuk upload ulang`}
                        className="ml-1 text-slate-400 hover:text-rose-600 transition-colors p-0.5 rounded cursor-pointer disabled:opacity-50 flex items-center"
                      >
                        {unlockingPeriode === p ? <Loader2 size={11} className="animate-spin text-amber-600" /> : <Unlock size={11} />}
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Info when existing master data is already loaded */}
        {hasExistingMaster && (
          <div className="mb-5 p-3 bg-blue-50/70 border border-blue-200 rounded-lg text-xs text-blue-700 flex items-center gap-2">
            <Info size={15} className="text-blue-600 shrink-0" />
            <span>
              <strong>Master Data Aktif:</strong> {rawMasterData.length} baris mesin tersimpan di database. Anda dapat mengupload file Master baru jika ada pembaruan mesin, atau cukup upload file Uptime bulan baru.
            </span>
          </div>
        )}

        {error && (
          <div className="mb-5 p-3.5 bg-rose-50 border border-rose-200 rounded-lg text-rose-700 flex items-center gap-2.5">
            <AlertCircle size={18} className="shrink-0" />
            <span className="text-xs font-medium">{error}</span>
          </div>
        )}

        <div className="grid md:grid-cols-2 gap-5 mb-6">
          {/* Master File Upload */}
          <div className={`border-2 border-dashed rounded-lg p-5 text-center transition-colors ${masterFile ? 'border-blue-400 bg-blue-50/30' : 'border-[#E5EAF2] hover:border-blue-300 hover:bg-slate-50/50'}`}>
            <div className="mx-auto w-10 h-10 bg-slate-50 rounded-lg border border-[#E5EAF2] flex items-center justify-center mb-3 text-blue-600">
              <FileSpreadsheet size={20} />
            </div>
            <h3 className="font-semibold text-slate-900 text-sm mb-0.5">Master Data Mesin</h3>
            <p className="text-xs text-slate-500 mb-3">
              {hasExistingMaster ? 'Upload file baru jika ada update Master Data' : 'Upload 1 file Excel Master Data BCA'}
            </p>
            
            <input 
              type="file" 
              accept=".xlsx,.xls" 
              id="master-upload" 
              className="hidden" 
              onChange={(e) => setMasterFile(e.target.files?.[0] || null)}
            />
            <label htmlFor="master-upload" className="cursor-pointer inline-flex items-center px-3.5 py-1.5 bg-white border border-[#E5EAF2] rounded-lg text-xs font-medium text-slate-700 hover:bg-slate-50 shadow-2xs transition-colors">
              {masterFile ? 'Ganti File' : (hasExistingMaster ? 'Update File Master' : 'Pilih File')}
            </label>
            {masterFile && (
              <div className="mt-3 flex items-center justify-center gap-1.5 text-xs text-emerald-700 font-medium">
                <CheckCircle2 size={14} />
                <span className="truncate max-w-[200px]">{masterFile.name}</span>
              </div>
            )}
            {!masterFile && hasExistingMaster && (
              <div className="mt-2.5 text-[11px] text-slate-400 font-normal">
                Menggunakan Master Data yang sudah ada di database
              </div>
            )}
          </div>

          {/* Uptime Files Upload */}
          <div className={`border-2 border-dashed rounded-lg p-5 text-center transition-colors ${uptimeFiles.length > 0 ? 'border-blue-400 bg-blue-50/30' : 'border-[#E5EAF2] hover:border-blue-300 hover:bg-slate-50/50'}`}>
            <div className="mx-auto w-10 h-10 bg-slate-50 rounded-lg border border-[#E5EAF2] flex items-center justify-center mb-3 text-blue-600">
              <UploadCloud size={20} />
            </div>
            <h3 className="font-semibold text-slate-900 text-sm mb-0.5">Data Uptime Bulanan</h3>
            <p className="text-xs text-slate-500 mb-3">Upload file Excel bulan baru (maks 12 bulan)</p>
            
            <input 
              type="file" 
              accept=".xlsx,.xls" 
              multiple
              id="uptime-upload" 
              className="hidden" 
              onChange={(e) => {
                if (e.target.files) {
                  const files = Array.from(e.target.files);
                  if (files.length > 12) {
                    setError("Maksimal 12 bulan file yang dapat di-upload sekaligus.");
                    return;
                  }
                  setUptimeFiles(files);
                  setError(null);
                }
              }}
            />
            <label htmlFor="uptime-upload" className="cursor-pointer inline-flex items-center px-3.5 py-1.5 bg-white border border-[#E5EAF2] rounded-lg text-xs font-medium text-slate-700 hover:bg-slate-50 shadow-2xs transition-colors">
              {uptimeFiles.length > 0 ? 'Ganti File' : 'Pilih File Uptime'}
            </label>
            {uptimeFiles.length > 0 && (
              <div className="mt-3 flex flex-col items-center justify-center text-xs text-blue-700 font-medium max-h-24 overflow-y-auto">
                <div className="flex items-center gap-1.5 mb-1 font-semibold">
                  <CheckCircle2 size={14} className="text-emerald-600" />
                  <span>{uptimeFiles.length} file dipilih</span>
                </div>
                {uptimeFiles.map((f, i) => (
                  <span key={i} className="text-[11px] text-slate-500 truncate max-w-[200px]">{f.name}</span>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Process Button & Progress */}
        <div className="flex flex-col items-center justify-center gap-2.5 text-center">
          <button
            onClick={handleProcess}
            disabled={
              (!masterFile && !hasExistingMaster) || 
              (uptimeFiles.length === 0 && !hasExistingUptime && !masterFile) || 
              isProcessing
            }
            className="inline-flex items-center justify-center gap-2 px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-2xs cursor-pointer"
          >
            {isProcessing ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                <span>Menyimpan ke Database ({progress}%)</span>
              </>
            ) : (
              <span>Simpan ke Database & Buka Dashboard</span>
            )}
          </button>

          {statusMessage && (
            <p className="text-xs text-blue-600 font-medium animate-pulse">
              {statusMessage}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
