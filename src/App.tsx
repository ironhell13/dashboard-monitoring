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
import { fetchDashboardData, fetchDashboardSummary, fetchFollowUpTickets, fetchFollowUpTicketsModern } from './utils/spreadsheetService';
import { syncFullDatasetToCloud } from './utils/supabaseService';
import { isSupabaseConfigured } from './utils/supabaseClient';
import { logoutKaOpsApi, logoutKaWilApi } from './utils/monitoringService';
import {
  CLOUD_DATA_VERSION,
  loadDashboardSnapshot,
  saveDashboardSnapshot,
  loadCachedMasterData,
  loadCachedUptimeFiles,
  loadCachedLockedPeriodes,
  hasValidUptimeInDataset,
  hasIntactMasterFields
} from './utils/dbCache';
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
      sessionStorage.removeItem('USERNAME');
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
      sessionStorage.removeItem('USERNAME');
    } catch (e) {}
    setAppMode('LANDING');
  };

  const handleLogoutMonitoring = () => {
    try {
      sessionStorage.removeItem('APP_MODE');
      sessionStorage.removeItem('USER_ROLE');
      sessionStorage.removeItem('USERNAME');
    } catch (e) {}
    setAppMode('LANDING');
  };

  // Helper untuk menerapkan dataset ke Zustand store
  const applyDataset = useCallback((
    masterData: any[],
    uptimeFiles: any[],
    lockedPeriodes: string[],
    lastUpdated: string | null,
    tickets?: any[],
    prematchedMachines?: any[]
  ) => {
    if ((!masterData || masterData.length === 0) && (!prematchedMachines || prematchedMachines.length === 0)) return false;

    // Jika mesin sudah di-prematch (instan 0ms), lewati matchData yang berat
    const matchedMachines = (prematchedMachines && prematchedMachines.length > 0)
      ? prematchedMachines
      : matchData(masterData, uptimeFiles || []);
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
    if (sortedPeriods.length > 0) {
      setAvailablePeriodes(sortedPeriods);
    }
    if (trendData.length > 0) {
      setGlobalTrendData(trendData);
    }
    setRawMasterData(masterData || []);
    setRawUptimeFiles(uptimeFiles || []);
    if (lockedPeriodes && lockedPeriodes.length > 0) {
      setLockedPeriodes(lockedPeriodes);
    }
    setLastDbSync(lastUpdated || null);
    setDbSource('local');

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
      let loadedCloudUpdatedAt: string | undefined;
      let loadedCloudVersion: number | undefined;

      // STEP 1: Coba muat cache snapshot lokal yang VALID (wajib punya data uptime + vendor/sektor utuh)
      try {
        const cached = await loadDashboardSnapshot();
        if (
          isMounted &&
          cached &&
          hasValidUptimeInDataset(cached.parsedUptimeFiles, cached.matchedMachines)
        ) {
          applyDataset(
            cached.masterData || [],
            cached.parsedUptimeFiles || [],
            cached.lockedPeriodes || [],
            cached.lastUpdated,
            cached.followUpTickets,
            cached.matchedMachines
          );
          hasFullData = true;
          loadedCloudUpdatedAt = cached.cloudMeta?.updatedAt;
          loadedCloudVersion = cached.cloudMeta?.version;
          setIsDbLoaded(true);
        } else if (isMounted) {
          // Fallback STEP 1b: baca cache terpisah jika snapshot belum terbentuk
          const [cMaster, cUptime, cLocked] = await Promise.all([
            loadCachedMasterData(),
            loadCachedUptimeFiles(),
            loadCachedLockedPeriodes()
          ]);
          if (cMaster?.length > 0 && cUptime?.length > 0 && hasIntactMasterFields(cMaster)) {
            applyDataset(cMaster, cUptime, cLocked || [], null);
            hasFullData = true;
            setIsDbLoaded(true);
          }
        }
      } catch (cacheErr) {
        console.warn('Cache snapshot lokal belum tersedia:', cacheErr);
      }

      // STEP 2: Jika belum ada cache lokal valid (misal Laptop baru / Incognito),
      // muat SUMMARY DATASET dari Cloud Supabase (atau fallback statis) agar Dashboard Overview langsung tampil
      if (!hasFullData) {
        try {
          const summary = await fetchDashboardSummary();
          if (isMounted && summary && summary.globalTrendData && summary.globalTrendData.length > 0) {
            setGlobalTrendData(summary.globalTrendData);
            setAvailablePeriodes(summary.availablePeriodes || []);
            setLockedPeriodes(summary.lockedPeriodes || []);
            setLastDbSync(summary.lastUpdated);
            setIsDbLoaded(true);
          }
        } catch (summaryErr) {
          console.warn('Gagal memuat dashboard summary:', summaryErr);
        }
      }

      // STEP 3: Sinkronisasi Cloud Supabase (Single Source of Truth antar-device)
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

        // 3b. Sinkronkan dataset lengkap Master + Monthly Uptime dari Cloud Supabase
        const dbData = await fetchDashboardData();
        if (!isMounted) return;

        const tickets = dbData.tickets || [];
        const validCloudOrLocal = hasValidUptimeInDataset(dbData.parsedUptimeFiles, dbData.prematchedMachines);

        if (dbData && dbData.hasData && validCloudOrLocal) {
          const cloudTs = dbData.cloudMeta?.updatedAt;
          const cloudVer = dbData.cloudMeta?.version;
          const alreadySyncedSameVersion =
            hasFullData &&
            dbData.source === 'cloud_snapshot' &&
            !dbData.isPartialFallback &&
            cloudVer === CLOUD_DATA_VERSION &&
            loadedCloudVersion === CLOUD_DATA_VERSION &&
            cloudTs &&
            loadedCloudUpdatedAt &&
            cloudTs === loadedCloudUpdatedAt;

          if (!alreadySyncedSameVersion) {
            applyDataset(
              dbData.masterData || [],
              dbData.parsedUptimeFiles || [],
              dbData.lockedPeriodes || [],
              dbData.lastUpdated,
              tickets,
              dbData.prematchedMachines
            );

            // Jangan simpan cache permanen jika masih data parsial / v1 lama
            if (!dbData.isPartialFallback && dbData.source !== 'cloud_relational') {
              await saveDashboardSnapshot({
                masterData: dbData.masterData || [],
                parsedUptimeFiles: dbData.parsedUptimeFiles || [],
                lockedPeriodes: dbData.lockedPeriodes || [],
                followUpTickets: tickets,
                lastUpdated: dbData.lastUpdated,
                matchedMachines: dbData.prematchedMachines,
                cloudMeta: dbData.cloudMeta
                  ? {
                      version: dbData.cloudMeta.version,
                      updatedAt: dbData.cloudMeta.updatedAt,
                      masterUpdatedAt: dbData.cloudMeta.masterUpdatedAt,
                      periodUpdatedAt: dbData.cloudMeta.periodUpdatedAt
                    }
                  : undefined,
                timestamp: Date.now()
              });
            }
          }

          // AUTO-PUBLISH DARI PC SUMBER:
          // Jika Cloud belum punya snapshot v2 tapi PC lokal punya data master + uptime utuh,
          // otomatis unggah ke Cloud sehingga seluruh Laptop / browser lain ikut identik 100%!
          if (
            isSupabaseConfigured() &&
            dbData.parsedUptimeFiles &&
            dbData.parsedUptimeFiles.length > 0 &&
            hasIntactMasterFields(dbData.masterData) &&
            (dbData.source === 'local_cache' || dbData.needsCloudUpgrade)
          ) {
            try {
              const pushRes = await syncFullDatasetToCloud(
                dbData.masterData || [],
                dbData.parsedUptimeFiles,
                dbData.lockedPeriodes || []
              );
              if (pushRes.success && pushRes.meta) {
                await saveDashboardSnapshot({
                  masterData: dbData.masterData || [],
                  parsedUptimeFiles: dbData.parsedUptimeFiles || [],
                  lockedPeriodes: pushRes.meta.lockedPeriodes,
                  followUpTickets: tickets,
                  lastUpdated: pushRes.meta.updatedAt,
                  cloudMeta: {
                    version: pushRes.meta.version,
                    updatedAt: pushRes.meta.updatedAt,
                    masterUpdatedAt: pushRes.meta.masterUpdatedAt,
                    periodUpdatedAt: pushRes.meta.periodUpdatedAt
                  },
                  timestamp: Date.now()
                });
                if (isMounted) setLastDbSync(pushRes.meta.updatedAt);
              }
            } catch (pushErr) {
              console.warn('[AutoCloudSync] Gagal auto-publish ke Cloud:', pushErr);
            }
          }

          setSyncError(null);
        } else if (!hasFullData && dbData.masterData && dbData.masterData.length > 0) {
          // Tidak ada data uptime di Cloud maupun lokal: tampilkan master katalog saja tanpa menyimpan snapshot palsu
          setRawMasterData(dbData.masterData);
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
    setModernTickets,
    setRawMasterData
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
        <HashRouter>
          <MonitoringPage onLogout={handleLogoutMonitoring} userRole="MONITORING" isKaOps={false} />
        </HashRouter>
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

  const roleFromStorage = (sessionStorage.getItem('USER_ROLE') as any);
  const currentRole = roleFromStorage || (appMode === 'KAWIL' ? 'KAWIL' : 'KAOPS');
  const isSuperAdmin =
    currentRole === 'SUPER_ADMIN' ||
    currentRole === 'SUPERADMIN' ||
    roleFromStorage === 'SUPER_ADMIN' ||
    sessionStorage.getItem('USERNAME') === 'superadmin';

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
            <Route
              path="/settings"
              element={
                isSuperAdmin ? <SettingsPage userRole={currentRole} /> : <Navigate to="/dashboard" replace />
              }
            />
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
