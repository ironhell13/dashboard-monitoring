import React, { useState, useEffect } from 'react';
import { getSupabaseInfo } from '../utils/supabaseClient';
import { clearMonitoringCache, CACHE_SCHEMA_VERSION } from '../utils/dbCache';

export interface DebugPanelProps {
  realtimeStatus?: 'SUBSCRIBED' | 'CONNECTING' | 'ERROR' | 'CLOSED' | string;
  connectionStatus?: string;
  activeDataset?: string;
  openCount?: number;
  dailyCount?: number;
  lastSyncedAt?: number | null;
  cacheAgeMs?: number | null;
  onResetCache?: () => void | Promise<void>;
}

export function DebugPanel({
  realtimeStatus,
  connectionStatus,
  activeDataset = 'supabase',
  openCount = 0,
  dailyCount = 0,
  lastSyncedAt = null,
  cacheAgeMs = null,
  onResetCache
}: DebugPanelProps) {
  const currentStatus = connectionStatus || realtimeStatus || 'CONNECTING';
  const [isVisible, setIsVisible] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [supabaseInfo, setSupabaseInfo] = useState<{
    url: string;
    projectRef: string;
    credentialSource: string;
    isConfigured: boolean;
  }>({ url: '', projectRef: '', credentialSource: 'none', isConfigured: false });

  useEffect(() => {
    // Hanya tampil jika URL memuat parameter ?debug=1
    const params = new URLSearchParams(window.location.search);
    if (params.get('debug') === '1') {
      setIsVisible(true);
      setSupabaseInfo(getSupabaseInfo());
    }
  }, []);

  if (!isVisible) return null;

  const handleClearCacheAndReload = async () => {
    if (confirm('Bersihkan seluruh cache monitoring lokal dan muat ulang halaman?')) {
      await clearMonitoringCache();
      window.location.reload();
    }
  };

  const getStatusBadge = () => {
    switch (realtimeStatus) {
      case 'SUBSCRIBED':
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-400">🟢 SUBSCRIBED</span>;
      case 'CONNECTING':
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-400">🟡 CONNECTING</span>;
      default:
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-500/20 text-rose-400">🔴 {realtimeStatus}</span>;
    }
  };

  const formatSyncTime = (epoch: number | null) => {
    if (!epoch) return '-';
    return new Date(epoch).toLocaleTimeString('id-ID');
  };

  return (
    <div className="fixed bottom-4 right-4 z-9999 font-mono text-xs shadow-2xl rounded-2xl bg-slate-900/95 text-slate-200 border border-slate-700 backdrop-blur-md overflow-hidden max-w-sm w-full">
      <div className="flex items-center justify-between px-3 py-2 bg-slate-800/80 border-b border-slate-700">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-blue-500 animate-pulse"></span>
          <strong className="text-white text-[11px] font-bold tracking-wider">DIAGNOSTIC PANEL (?debug=1)</strong>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setIsMinimized(!isMinimized)}
            className="p-1 hover:bg-slate-700 rounded text-slate-400 hover:text-white"
            title={isMinimized ? 'Expand' : 'Minimize'}
          >
            {isMinimized ? '▲' : '▼'}
          </button>
          <button
            type="button"
            onClick={() => setIsVisible(false)}
            className="p-1 hover:bg-slate-700 rounded text-slate-400 hover:text-white"
            title="Tutup"
          >
            ✕
          </button>
        </div>
      </div>

      {!isMinimized && (
        <div className="p-3 space-y-2">
          <div className="flex justify-between items-center py-0.5 border-b border-slate-800">
            <span className="text-slate-400">Project Ref:</span>
            <span className="font-bold text-blue-400">{supabaseInfo.projectRef || 'none'}</span>
          </div>

          <div className="flex justify-between items-center py-0.5 border-b border-slate-800">
            <span className="text-slate-400">Kredensial:</span>
            <span className="text-[11px] font-medium text-amber-300">
              {supabaseInfo.credentialSource === 'env' ? 'Vercel Env (Valid)' : supabaseInfo.credentialSource}
            </span>
          </div>

          <div className="flex justify-between items-center py-0.5 border-b border-slate-800">
            <span className="text-slate-400">Realtime Channel:</span>
            <div>{getStatusBadge()}</div>
          </div>

          <div className="flex justify-between items-center py-0.5 border-b border-slate-800">
            <span className="text-slate-400">Open Incidents:</span>
            <span className="font-bold text-white">{openCount.toLocaleString()} baris</span>
          </div>

          <div className="flex justify-between items-center py-0.5 border-b border-slate-800">
            <span className="text-slate-400">Daily Incidents:</span>
            <span className="font-bold text-white">{dailyCount.toLocaleString()} baris</span>
          </div>

          <div className="flex justify-between items-center py-0.5 border-b border-slate-800">
            <span className="text-slate-400">Terakhir Sinkron:</span>
            <span className="text-emerald-400">{formatSyncTime(lastSyncedAt)}</span>
          </div>

          <div className="flex justify-between items-center py-0.5 border-b border-slate-800">
            <span className="text-slate-400">Cache Version / Age:</span>
            <span className="text-slate-300">
              v{CACHE_SCHEMA_VERSION} · {cacheAgeMs !== null ? `${Math.round(cacheAgeMs / 1000)}s ago` : 'no cache'}
            </span>
          </div>

          <div className="pt-2">
            <button
              type="button"
              onClick={handleClearCacheAndReload}
              className="w-full py-1.5 px-3 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-[11px] transition-all cursor-pointer shadow-sm"
            >
              🧹 Bersihkan Cache Lokal & Muat Ulang
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default DebugPanel;
