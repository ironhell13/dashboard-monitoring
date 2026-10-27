import { useEffect, useState, useCallback } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import LandingPage from './components/LandingPage';
import MonitoringPage from './pages/MonitoringPage';
import ErrorBoundary from './components/ErrorBoundary';
import UploadPage from './pages/UploadPage';
import DashboardPage from './pages/DashboardPage';
import MesinPerSektorPage from './pages/MesinPerSektorPage';
import ServicePointPage from './pages/ServicePointPage';
import TotalUptimeBulanPage from './pages/TotalUptimeBulanPage';
import AllWsidPage from './pages/AllWsidPage';
import WsidDetailPage from './pages/WsidDetailPage';
import FollowUpPage from './pages/FollowUpPage';
import CekDailyPage from './pages/CekDailyPage';
import { useDataStore } from './store/useDataStore';
import { matchData } from './utils/dataMatcher';
import { fetchDashboardData, fetchFollowUpTickets, fetchFollowUpTicketsModern, isGasEnvironment } from './utils/spreadsheetService';
import { logoutKaOpsApi, logoutKaWilApi } from './utils/monitoringService';
import { loadDashboardSnapshot, saveDashboardSnapshot } from './utils/dbCache';
import { Loader2, Zap } from 'lucide-react';

function App() {
  const {
    machines,
    setMachines,
    setAvailablePeriodes,
    setGlobalTrendData,
    setRawMasterData,
    setRawUptimeFiles,
    setLockedPeriodes,
    isDbLoaded,
    setIsDbLoaded,
    setDbSource,
    setLastDbSync,
    setFollowUpTickets,
    setModernTickets,
    setIsSyncing,
    setSyncError,
  } = useDataStore();

  const [loadingStatusText, setLoadingStatusText] = useState('Menghubungkan ke database...');

  type AppMode = 'LANDING' | 'KAWIL' | 'KAOPS' | 'MONITORING';
  const [appMode, setAppMode] = useState<AppMode>(() => {
    try {
      const saved = sessionStorage.getItem('APP_MODE');
      const tokenKawil = sessionStorage.getItem('KAWIL_TOKEN');
      const tokenKaops = sessionStorage.getItem('KAOPS_TOKEN');
      if (saved === 'MONITORING') return 'MONITORING';
      if (saved === 'KAWIL' && tokenKawil) return 'KAWIL';
      if (saved === 'KAOPS' && tokenKaops) return 'KAOPS';
    } catch (e) {}
    return 'LANDING';
  });

  const handleLogoutKaWil = async () => {
    const token = sessionStorage.getItem('KAWIL_TOKEN') || undefined;
    await logoutKaWilApi(token);
    try {
      sessionStorage.removeItem('KAWIL_TOKEN');
      sessionStorage.removeItem('APP_MODE');
      sessionStorage.removeItem('USER_ROLE');
    } catch (e) {}
    setAppMode('LANDING');
  };

  const handleLogoutKaOps = async () => {
    const token = sessionStorage.getItem('KAOPS_TOKEN') || undefined;
    await logoutKaOpsApi(token);
    try {
      sessionStorage.removeItem('KAOPS_TOKEN');
      sessionStorage.removeItem('APP_MODE');
      sessionStorage.removeItem('USER_ROLE');
    } catch (e) {}
    setAppMode('LANDING');
  };

  const handleLogoutMonitoring = () => {
    try {
      sessionStorage.removeItem('APP_MODE');
      sessionStorage.removeItem('USER_ROLE');
    } catch (e) {}
    setAppMode('LANDING');
  };

  // Helper untuk menerapkan dataset ke Zustand store
  const applyDataset = useCallback((
    masterData: any[],
    uptimeFiles: any[],
    lockedPeriodes: string[],
    lastUpdated: string | null,
    tickets?: any[]
  ) => {
    if (!masterData || masterData.length === 0) return false;

    const matchedMachines = matchData(masterData, uptimeFiles || []);
    const periods = new Set<string>();
    const trendData: any[] = [];

    (uptimeFiles || []).forEach((f: any) => {
      periods.add(f.periode);
      const atmCount = (f.atmData || []).filter((r: any) => String(r.DESCKCU || r.KWW || '').trim().toUpperCase() === 'ABACUS JAKARTA').length;
      const atsCount = (f.atsData || []).filter((r: any) => String(r.DESCKCU || r.KWW || '').trim().toUpperCase() === 'ABACUS JAKARTA').length;

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
    setRawMasterData(masterData);
    setRawUptimeFiles(uptimeFiles || []);
    setLockedPeriodes(lockedPeriodes || []);
    setLastDbSync(lastUpdated || null);
    setDbSource(isGasEnvironment() ? 'gas' : 'local');

    if (tickets && Array.isArray(tickets) && tickets.length > 0) {
      setFollowUpTickets(tickets);
    }

    return true;
  }, [
    setMachines,
    setAvailablePeriodes,
    setGlobalTrendData,
    setRawMasterData,
    setRawUptimeFiles,
    setLockedPeriodes,
    setLastDbSync,
    setDbSource,
    setFollowUpTickets
  ]);

  // Strategi Cache-First (Stale-While-Revalidate):
  // 1. Baca IndexedDB Cache instan (< 100ms) -> Dashboard langsung terbuka tanpa menunggu Apps Script
  // 2. Di latar belakang, sinkronkan data terbaru dari Google Spreadsheet
  // 3. Jika data baru tersedia, perbarui store & simpan ke cache secara mulus
  useEffect(() => {
    let isMounted = true;

    async function initializeDashboard() {
      let hasLocalCache = false;

      // STEP 1: Coba muat cache lokal berkecepatan tinggi
      try {
        setLoadingStatusText('Membaca cache database lokal...');
        const cached = await loadDashboardSnapshot();

        if (isMounted && cached && cached.masterData && cached.masterData.length > 0) {
          applyDataset(
            cached.masterData,
            cached.parsedUptimeFiles,
            cached.lockedPeriodes,
            cached.lastUpdated,
            cached.followUpTickets
          );
          hasLocalCache = true;
          // Segera tampilkan antarmuka dashboard ke user!
          setIsDbLoaded(true);
        }
      } catch (cacheErr) {
        console.warn('Cache lokal belum tersedia:', cacheErr);
      }

      // STEP 2: Sinkronisasi latar belakang dengan Google Apps Script
      setIsSyncing(true);
      if (!hasLocalCache) {
        setLoadingStatusText('Mengambil data terbaru dari Google Spreadsheet...');
      }

      try {
        const dbData = await fetchDashboardData();
        if (!isMounted) return;

        let tickets = dbData.tickets || [];
        // Jika tiket belum disertakan, ambil terpisah
        if (!tickets || tickets.length === 0) {
          try {
            const ticketRes = await fetchFollowUpTickets();
            if (ticketRes.success && ticketRes.tickets) {
              tickets = ticketRes.tickets;
            }
          } catch (tErr) {
            console.warn('Gagal memuat tiket follow-up:', tErr);
          }
        }

        // Muat tiket follow-up modern (Ka Ops / Ka Wil & Monitoring)
        try {
          if (dbData && dbData.modernFollowUpTickets && dbData.modernFollowUpTickets.length > 0) {
            setModernTickets(dbData.modernFollowUpTickets);
          } else {
            const mRes = await fetchFollowUpTicketsModern();
            if (mRes.success && mRes.tickets) {
              setModernTickets(mRes.tickets);
            }
          }
        } catch (mErr) {
          console.warn('Gagal memuat tiket modern:', mErr);
        }

        if (dbData && dbData.hasData && dbData.masterData?.length > 0) {
          applyDataset(
            dbData.masterData,
            dbData.parsedUptimeFiles || [],
            dbData.lockedPeriodes || [],
            dbData.lastUpdated,
            tickets
          );

          // Simpan snapshot terbaru ke IndexedDB agar kunjungan berikutnya instan
          await saveDashboardSnapshot({
            masterData: dbData.masterData,
            parsedUptimeFiles: dbData.parsedUptimeFiles || [],
            lockedPeriodes: dbData.lockedPeriodes || [],
            followUpTickets: tickets,
            lastUpdated: dbData.lastUpdated,
            timestamp: Date.now()
          });

          setSyncError(null);
        } else if (hasLocalCache) {
          // Tetap gunakan cache jika Apps Script belum memiliki data baru
          setSyncError(null);
        } else {
          setLockedPeriodes(dbData?.lockedPeriodes || []);
        }
      } catch (syncErr: any) {
        console.error('Gagal sinkronisasi dari Spreadsheet:', syncErr);
        if (isMounted) {
          setSyncError(syncErr?.message || String(syncErr));
        }
      } finally {
        if (isMounted) {
          setIsSyncing(false);
          setIsDbLoaded(true);
        }
      }
    }

    initializeDashboard();

    return () => {
      isMounted = false;
    };
  }, [applyDataset, setIsDbLoaded, setIsSyncing, setSyncError, setLockedPeriodes]);

  // 1. Mode Landing
  if (appMode === 'LANDING') {
    return (
      <ErrorBoundary>
        <LandingPage onSelectMode={(mode) => setAppMode(mode)} />
      </ErrorBoundary>
    );
  }

  // 2. Mode Monitoring
  if (appMode === 'MONITORING') {
    return (
      <ErrorBoundary>
        <MonitoringPage onLogout={handleLogoutMonitoring} userRole="MONITORING" isKaOps={false} />
      </ErrorBoundary>
    );
  }

  // 3. Mode Ka Wil & Ka Ops - Loading Screen saat 'Cold Start'
  if (!isDbLoaded) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-6 text-white select-none">
        <div className="relative flex items-center justify-center mb-6">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-500 animate-pulse flex items-center justify-center shadow-lg shadow-blue-500/30">
            <Loader2 className="w-8 h-8 animate-spin text-white" />
          </div>
          <div className="absolute -bottom-1 -right-1 bg-emerald-500 rounded-full p-1 shadow">
            <Zap className="w-3.5 h-3.5 text-white" />
          </div>
        </div>
        <h2 className="text-xl font-bold tracking-tight mb-0.5 text-slate-100">eMons ATM CRM</h2>
        <p className="text-xs text-teal-400 font-semibold mb-2">Efficient Monitoring System &bull; Pantau, deteksi, tangani</p>
        <p className="text-sm text-slate-400 mb-4">{loadingStatusText}</p>
        
        <div className="flex items-center gap-2 text-xs text-slate-400 bg-slate-800/80 px-3.5 py-1.5 rounded-full border border-slate-700/60 shadow-inner">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
          <span>Memuat data & mengaktifkan akselerasi cache instan...</span>
        </div>
      </div>
    );
  }

  const currentRole = appMode === 'KAWIL' ? 'KAWIL' : 'KAOPS';

  return (
    <ErrorBoundary>
      <HashRouter>
        <Routes>
          <Route path="/" element={<Navigate to={machines.length > 0 ? "/dashboard" : "/upload"} replace />} />
          <Route path="/upload" element={<UploadPage />} />
          
          {/* Dashboard Routes wrapped in Layout */}
          <Route element={<Layout onLogout={appMode === 'KAWIL' ? handleLogoutKaWil : handleLogoutKaOps} userRole={currentRole} />}>
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/cek-daily" element={<CekDailyPage userRole={currentRole} />} />
            <Route path="/follow-up" element={<FollowUpPage />} />
            <Route path="/sektor-mesin" element={<MesinPerSektorPage />} />
            <Route path="/service-point" element={<ServicePointPage />} />
            <Route path="/all-wsid" element={<AllWsidPage />} />
            <Route path="/wsid/:wsid" element={<WsidDetailPage />} />
            <Route path="/total-uptime" element={<TotalUptimeBulanPage />} />
          </Route>
        </Routes>
      </HashRouter>
    </ErrorBoundary>
  );
}

export default App;
