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

  const handleProcess = async () => {
    // Validasi
    if (!hasExistingMaster && !masterFile) {
      setError("Mohon upload Master Data Mesin terlebih dahulu.");
      return;
    }
    if (!hasExistingUptime && uptimeFiles.length === 0) {
      setError("Mohon upload minimal 1 file Uptime Bulanan.");
      return;
    }
    if (!masterFile && uptimeFiles.length === 0) {
      setError("Pilih minimal file Master Data atau file Uptime untuk diupdate.");
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
        setStatusMessage(`Menyimpan Master Data (${activeMasterData.length} mesin) ke Spreadsheet...`);
        const mRes = await saveMasterData(activeMasterData);
        if (!mRes.success) {
          throw new Error(mRes.message || "Gagal menyimpan Master Data ke database.");
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

          setStatusMessage(`${isUpdating ? 'Memperbarui' : 'Menyimpan'} Uptime ${monthLabel} (${i + 1}/${totalFiles}) ke Spreadsheet...`);
          const uRes = await saveUptimePeriod(file, true);

          if (!uRes.success) {
            throw new Error(uRes.message || `Gagal menyimpan Uptime periode ${monthLabel}`);
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

      // 7. Update Zustand Store
      setProgress(98);
      setMachines(matchedMachines);
      setAvailablePeriodes(sortedPeriods);
      setGlobalTrendData(trendData);
      setRawMasterData(activeMasterData);
      setRawUptimeFiles(combinedUptimeFiles);
      setLockedPeriodes(currentLocked);
      setLastDbSync(new Date().toISOString());

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
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <div className="glass-card max-w-4xl w-full p-8 relative overflow-hidden">
        {/* Background blobs */}
        <div className="absolute -top-32 -left-32 w-64 h-64 bg-blue-400 rounded-full mix-blend-multiply filter blur-3xl opacity-20"></div>
        <div className="absolute -bottom-32 -right-32 w-64 h-64 bg-indigo-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20"></div>
        
        {/* Header with back button */}
        <div className="relative z-10 flex items-center justify-between mb-6">
          {hasExistingData ? (
            <button
              onClick={() => navigate('/dashboard')}
              className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-semibold text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-100 hover:text-slate-900 transition-all shadow-sm cursor-pointer"
            >
              <ArrowLeft size={16} />
              <span>Kembali ke Dashboard</span>
            </button>
          ) : (
            <div></div>
          )}

          <div className="inline-flex items-center gap-2 px-3 py-1 bg-slate-100/80 border border-slate-200 rounded-full text-xs text-slate-600 font-medium">
            <Database size={14} className={isGasEnvironment() ? "text-emerald-500" : "text-blue-500"} />
            <span>{isGasEnvironment() ? "Tersambung ke Google Spreadsheet" : "Database Mode Lokal (Tersimpan)"}</span>
          </div>
        </div>

        <div className="relative z-10 text-center mb-8">
          <h1 className="text-3xl font-extrabold text-slate-800 tracking-tight">Database & Upload Data</h1>
          <p className="text-slate-500 mt-2">
            Data tersimpan permanen di Google Spreadsheet. Master Data dapat diupdate kapan saja, dan data uptime bulanan yang sudah masuk otomatis dikunci agar tidak tertimpa.
          </p>
        </div>

        {/* Locked Periods Status Banner */}
        {lockedPeriodes && lockedPeriodes.length > 0 && (
          <div className="mb-6 p-4 bg-amber-50/80 border border-amber-200/80 rounded-2xl relative overflow-hidden">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-amber-100 rounded-xl text-amber-700 mt-0.5">
                <Lock size={18} />
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-bold text-amber-900 flex items-center gap-2">
                    <span>Periode Terkunci di Database (Anti-Overwrite)</span>
                    <span className="text-xs font-normal text-amber-700 bg-amber-200/60 px-2 py-0.5 rounded-full">
                      {lockedPeriodes.length} Bulan
                    </span>
                  </h4>
                  {lastDbSync && (
                    <span className="text-[11px] text-amber-700/80">
                      Sync: {new Date(lastDbSync).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </span>
                  )}
                </div>
                <p className="text-xs text-amber-700 mt-1">
                  Periode berikut sudah tersimpan di database dan dilindungi. Upload file baru tidak akan menimpa data pada bulan-bulan ini.
                </p>
                <div className="flex flex-wrap gap-2 mt-3">
                  {lockedPeriodes.map((p) => (
                    <span 
                      key={p} 
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-white border border-amber-300 rounded-lg text-xs font-semibold text-amber-800 shadow-xs"
                    >
                      <ShieldCheck size={14} className="text-amber-600" />
                      <span>{formatMonthPeriode(p)}</span>
                      <button
                        type="button"
                        onClick={() => handleUnlock(p)}
                        disabled={unlockingPeriode === p}
                        title={`Buka kunci periode ${formatMonthPeriode(p)} untuk upload ulang`}
                        className="ml-1 text-slate-400 hover:text-rose-600 transition-colors p-0.5 rounded cursor-pointer disabled:opacity-50 flex items-center"
                      >
                        {unlockingPeriode === p ? <Loader2 size={12} className="animate-spin text-amber-600" /> : <Unlock size={12} />}
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
          <div className="mb-6 p-3.5 bg-blue-50/70 border border-blue-200/70 rounded-xl text-xs text-blue-700 flex items-center gap-2.5">
            <Info size={16} className="text-blue-600 flex-shrink-0" />
            <span>
              <strong>Master Data Aktif:</strong> {rawMasterData.length} baris mesin tersimpan di database. Anda dapat mengupload file Master baru jika ada pembaruan mesin, atau cukup upload file Uptime bulan baru.
            </span>
          </div>
        )}

        {error && (
          <div className="mb-6 p-4 bg-red-50/80 border border-red-200 rounded-xl text-red-600 flex items-center gap-3">
            <AlertCircle size={20} className="flex-shrink-0" />
            <span className="text-sm font-medium">{error}</span>
          </div>
        )}

        <div className="grid md:grid-cols-2 gap-8 mb-8">
          {/* Master File Upload */}
          <div className={`border-2 border-dashed rounded-2xl p-6 text-center transition-all ${masterFile ? 'border-blue-400 bg-blue-50/30' : 'border-slate-300 hover:border-blue-400 hover:bg-slate-50/50'}`}>
            <div className="mx-auto w-12 h-12 bg-white rounded-full shadow-sm flex items-center justify-center mb-4 text-blue-500">
              <FileSpreadsheet size={24} />
            </div>
            <h3 className="font-semibold text-slate-800 mb-1">Master Data Mesin</h3>
            <p className="text-xs text-slate-500 mb-4">
              {hasExistingMaster ? 'Upload file baru jika ada update Master Data' : 'Upload 1 file Excel Master Data BCA'}
            </p>
            
            <input 
              type="file" 
              accept=".xlsx,.xls" 
              id="master-upload" 
              className="hidden" 
              onChange={(e) => setMasterFile(e.target.files?.[0] || null)}
            />
            <label htmlFor="master-upload" className="cursor-pointer inline-flex items-center px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 shadow-sm transition-all">
              {masterFile ? 'Ganti File' : (hasExistingMaster ? 'Update File Master' : 'Pilih File')}
            </label>
            {masterFile && (
              <div className="mt-4 flex items-center justify-center gap-2 text-sm text-green-600 font-medium">
                <CheckCircle2 size={16} />
                <span className="truncate max-w-[200px]">{masterFile.name}</span>
              </div>
            )}
            {!masterFile && hasExistingMaster && (
              <div className="mt-3 text-xs text-slate-400 font-medium">
                Menggunakan Master Data yang sudah ada di database
              </div>
            )}
          </div>

          {/* Uptime Files Upload */}
          <div className={`border-2 border-dashed rounded-2xl p-6 text-center transition-all ${uptimeFiles.length > 0 ? 'border-indigo-400 bg-indigo-50/30' : 'border-slate-300 hover:border-indigo-400 hover:bg-slate-50/50'}`}>
            <div className="mx-auto w-12 h-12 bg-white rounded-full shadow-sm flex items-center justify-center mb-4 text-indigo-500">
              <UploadCloud size={24} />
            </div>
            <h3 className="font-semibold text-slate-800 mb-1">Data Uptime Bulanan</h3>
            <p className="text-xs text-slate-500 mb-4">Upload file Excel bulan baru (maks 12 bulan)</p>
            
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
            <label htmlFor="uptime-upload" className="cursor-pointer inline-flex items-center px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 shadow-sm transition-all">
              {uptimeFiles.length > 0 ? 'Ganti File' : 'Pilih File Uptime'}
            </label>
            {uptimeFiles.length > 0 && (
              <div className="mt-4 flex flex-col items-center justify-center text-sm text-indigo-600 font-medium max-h-24 overflow-y-auto">
                <div className="flex items-center gap-2 mb-1">
                  <CheckCircle2 size={16} />
                  <span>{uptimeFiles.length} file dipilih</span>
                </div>
                {uptimeFiles.map((f, i) => (
                  <span key={i} className="text-xs text-slate-500 truncate max-w-[200px]">{f.name}</span>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Process Button & Progress */}
        <div className="flex flex-col items-center justify-center gap-3 text-center">
          <button
            onClick={handleProcess}
            disabled={
              (!masterFile && !hasExistingMaster) || 
              (uptimeFiles.length === 0 && !hasExistingUptime && !masterFile) || 
              isProcessing
            }
            className="inline-flex items-center justify-center gap-2 px-8 py-3 bg-slate-900 text-white rounded-xl font-medium hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-slate-900/20 cursor-pointer"
          >
            {isProcessing ? (
              <>
                <Loader2 size={20} className="animate-spin" />
                <span>Menyimpan ke Database ({progress}%)</span>
              </>
            ) : (
              <span>Simpan ke Database & Buka Dashboard</span>
            )}
          </button>

          {statusMessage && (
            <p className="text-xs text-indigo-600 font-medium animate-pulse">
              {statusMessage}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
