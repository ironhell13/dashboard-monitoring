import React, { useState, useEffect, useRef } from 'react';
import { RefreshCw } from 'lucide-react';
import type { RealtimeConnectionStatus } from '../hooks/useOpenIncidents';

interface AutoRefreshCountdownProps {
  onRefresh: () => void | Promise<void>;
  isLoading: boolean;
  intervalSeconds?: number;
  connectionStatus?: RealtimeConnectionStatus;
  lastSyncedAt?: number | null;
}

export const AutoRefreshCountdown: React.FC<AutoRefreshCountdownProps> = React.memo(({
  onRefresh,
  isLoading,
  intervalSeconds = 15,
  connectionStatus = 'SUBSCRIBED',
  lastSyncedAt
}) => {
  const [secondsLeft, setSecondsLeft] = useState<number>(intervalSeconds);
  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;

  // Timer internal terisolasi (tidak memicu re-render parent)
  useEffect(() => {
    const timer = setInterval(() => {
      // Jangan kurangi timer jika tab sedang di background
      if (document.hidden) return;

      setSecondsLeft((prev) => {
        if (prev <= 1) {
          onRefreshRef.current();
          return intervalSeconds;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [intervalSeconds]);

  // Reset countdown jika sedang loading
  useEffect(() => {
    if (isLoading) {
      setSecondsLeft(intervalSeconds);
    }
  }, [isLoading, intervalSeconds]);

  const handleManualClick = () => {
    setSecondsLeft(intervalSeconds);
    onRefreshRef.current();
  };

  const statusBadge = () => {
    switch (connectionStatus) {
      case 'SUBSCRIBED':
        return (
          <span className="flex items-center gap-1 text-[11px] font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
            <span>Live Realtime</span>
          </span>
        );
      case 'CONNECTING':
        return (
          <span className="flex items-center gap-1 text-[11px] font-medium text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span>
            <span>Menyambung...</span>
          </span>
        );
      case 'ERROR':
      case 'OFFLINE':
      default:
        return (
          <span className="flex items-center gap-1 text-[11px] font-medium text-rose-700 bg-rose-50 px-2 py-0.5 rounded-full border border-rose-200">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
            <span>Offline</span>
          </span>
        );
    }
  };

  const syncTimeStr = lastSyncedAt
    ? new Date(lastSyncedAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : '-';

  return (
    <div className="flex items-center gap-2">
      {statusBadge()}

      <div className="hidden sm:flex items-center gap-1 text-[11px] text-[#555F71]">
        <span>Sinkron: <strong className="text-[#0D1C2E] font-medium">{syncTimeStr}</strong></span>
      </div>

      <button
        type="button"
        onClick={handleManualClick}
        disabled={isLoading}
        className="flex items-center gap-1.5 text-[#555F71] hover:text-[#0D1C2E] text-[11px] bg-[#EFF4FF] hover:bg-[#dbe6ff] px-2.5 py-1 rounded-full cursor-pointer transition-all border border-transparent hover:border-[#BFD3FF] disabled:opacity-50"
        title="Klik untuk menyinkronkan data Problem Open & Database terbaru sekarang"
      >
        <RefreshCw size={12} className={isLoading ? 'animate-spin text-blue-600' : 'text-blue-600'} />
        <span>
          {isLoading ? (
            'Menyinkronkan...'
          ) : (
            <span>
              Update otomatis (<strong className="text-[#0D1C2E] font-semibold">{secondsLeft}s</strong>) • <strong className="text-blue-600 underline">Refresh</strong>
            </span>
          )}
        </span>
      </button>
    </div>
  );
});