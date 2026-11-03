import { useEffect, useState, useCallback } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import LandingPage from './components/LandingPage';
import MonitoringPage from './pages/MonitoringPage';
import ErrorBoundary from './components/ErrorBoundary';
import UploadPage from './pages/UploadPage';
import MesinPerSektorPage from './pages/MesinPerSektorPage';
import ServicePointPage from './pages/ServicePointPage';
import TotalUptimeBulanPage from './pages/TotalUptimeBulanPage';
import AllWsidPage from './pages/AllWsidPage';
import WsidDetailPage from './pages/WsidDetailPage';
import FollowUpPage from './pages/FollowUpPage';
import CekDailyPage from './pages/CekDailyPage';
import SettingsPage from './pages/SettingsPage';
import { useDataStore } from './store/useDataStore';
import { matchData } from './utils/dataMatcher';
import { fetchDashboardData, fetchDashboardSummary, fetchFollowUpTickets, fetchFollowUpTicketsModern, isGasEnvironment } from './utils/spreadsheetService';
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
  // Strategi Akselerasi Dua Tahap (Two-Phase Instant Hydration):
  // 1. TAHAP 1 (< 30ms): Coba muat cache snapshot IndexedDB ATAU ringkasan summary dataset (1.4 KB).
  //    Dashboard Overview langsung terbuka seketika tanpa blocking UI!
  // 2. TAHAP 2 (Latar Belakang / Non-Blocking): Muat tiket follow-up dan dataset lengkap 2.043 mesin.
  //    Setelah selesai, data mesin di store diperbarui dan disimpan ke IndexedDB secara mulus.
  useEffect(() => {
    let isMounted = true;

    async function initializeDashboard() {
      let hasFullData = false;

      // STEP 1: Coba muat cache snapshot lokal (IndexedDB ~15ms)
      try {
        const cached = await loadDashboardSnapshot();
        if (isMounted && cached && cached.masterData && cached.masterData.length > 0) {
          applyDataset(
            cached.masterData,
            cached.parsedUptimeFiles,
            cached.lockedPeriodes,
            cached.lastUpdated,
            cached.followUpTickets
          );
          hasFullData = true;
          // Segera buka dashboard dari cache lokal
          setIsDbLoaded(true);
        }
      } catch (cacheErr) {
        console.warn('Cache snapshot lokal belum tersedia:', cacheErr);
      }

      // STEP 2: Jika belum ada cache snapshot (misal Incognito / Cold Start),
      // muat SUMMARY DATASET TERLEBIH DAHULU (1.4 KB, < 20ms) agar Dashboard LANGSUNG MUNCUL seketika!
      if (!hasFullData) {
        try {
          const summary = await fetchDashboardSummary();
          if (isMounted && summary && summary.globalTrendData && summary.globalTrendData.length > 0) {
            setGlobalTrendData(summary.globalTrendData);
            setAvailablePeriodes(summary.availablePeriodes || []);
            setLockedPeriodes(summary.lockedPeriodes || []);
            setLastDbSync(summary.lastUpdated);
            // LANGSUNG BUKA DASHBOARD INSTAN (< 30ms)!
            setIsDbLoaded(true);
          }
        } catch (summaryErr) {
          console.warn('Gagal memuat dashboard summary:', summaryErr);
        }
      }

      // STEP 3: Latar Belakang (Non-Blocking) - Sinkronisasi tiket & detail 2.043 mesin
      setIsSyncing(true);
      try {
        // 3a. Ambil tiket follow-up terbaru
        try {
          const mRes = await fetchFollowUpTicketsModern();
          if (isMounted && mRes.success && mRes.tickets) {
            setModernTickets(mRes.tickets);
          }
        } catch (mErr) {
          console.warn('Gagal memuat tiket modern:', mErr);
        }

        // 3b. Muat dataset detail mesin jika belum ada
        const dbData = await fetchDashboardData();
        if (!isMounted) return;

        let tickets = dbData.tickets || [];
        if (dbData && dbData.hasData && dbData.masterData?.length > 0) {
          applyDataset(
            dbData.masterData,
            dbData.parsedUptimeFiles || [],
            dbData.lockedPeriodes || [],
            dbData.lastUpdated,
            tickets
          );

          // Simpan snapshot ke IndexedDB untuk kunjungan berikutnya
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
      } catch (syncErr: any) {
        console.warn('Sinkronisasi data latar belakang:', syncErr);
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
  }, [
    applyDataset,
    setIsDbLoaded,
    setIsSyncing,
    setSyncError,
    setGlobalTrendData,
    setAvailablePeriodes,
    setLockedPeriodes,
    setLastDbSync,
    setModernTickets
  ]);

  // 1. Mode Landing
  if (appMode === 'LANDING') {
    return (
      <ErrorBoundary>
        <LandingPage onSelectMode={(mode) => {
          if (mode === 'KAWIL' || mode === 'KAOPS') {
            window.location.hash = '#/dashboard';
          }
          setAppMode(mode);
        }} />
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
          {/* Selalu arahkan root ke /dashboard saat login */}
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          
          {/* Dashboard Routes wrapped in Layout */}
          <Route element={<Layout onLogout={appMode === 'KAWIL' ? handleLogoutKaWil : handleLogoutKaOps} userRole={currentRole} />}>
            <Route path="/dashboard" element={<TotalUptimeBulanPage />} />
            <Route path="/upload" element={<UploadPage />} />
            <Route path="/cek-daily" element={<CekDailyPage userRole={currentRole} />} />
            <Route path="/follow-up" element={<FollowUpPage userRole={currentRole} />} />
            <Route path="/sektor-mesin" element={<MesinPerSektorPage />} />
            <Route path="/service-point" element={<ServicePointPage />} />
            <Route path="/all-wsid" element={<AllWsidPage />} />
            <Route path="/wsid/:wsid" element={<WsidDetailPage />} />
            <Route path="/settings" element={<SettingsPage userRole={currentRole} />} />
            <Route path="/total-uptime" element={<Navigate to="/dashboard" replace />} />
          </Route>

          {/* Fallback route */}
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </HashRouter>
    </ErrorBoundary>
  );
}

export default App;
