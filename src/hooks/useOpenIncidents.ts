import { useState, useEffect, useRef, useCallback } from 'react';
import { getSupabase } from '../utils/supabaseClient';
import {
  fetchOpenIncidentsSupabase,
  getMachinesMap,
  mapRowToOpenIncident
} from '../utils/supabaseService';
import { isEndTimeFilled } from '../utils/dailyIncidentParser';
import type { OpenIncidentItem } from '../utils/monitoringService';
import { loadFirstPaintCache, saveFirstPaintCache } from '../utils/dbCache';

export type RealtimeConnectionStatus = 'SUBSCRIBED' | 'CONNECTING' | 'ERROR' | 'OFFLINE';

export interface UseOpenIncidentsOptions {
  autoSubscribe?: boolean;
  onSyncSuccess?: (count: number) => void;
  onSyncError?: (error: Error) => void;
}

export function useOpenIncidents(options: UseOpenIncidentsOptions = {}) {
  const { autoSubscribe = true, onSyncSuccess, onSyncError } = options;

  const [openIncidents, setOpenIncidents] = useState<OpenIncidentItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isInitialLoading, setIsInitialLoading] = useState<boolean>(true);
  const [connectionStatus, setConnectionStatus] = useState<RealtimeConnectionStatus>('CONNECTING');
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Refs untuk debounce realtime & status tracking
  const openIncidentsRef = useRef<OpenIncidentItem[]>([]);
  openIncidentsRef.current = openIncidents;

  const pendingBatchRef = useRef<{
    upsertKeys: Set<string>;
    deleteKeys: Set<string>;
  }>({
    upsertKeys: new Set(),
    deleteKeys: new Set()
  });
  const batchTimerRef = useRef<any>(null);
  const isFetchingRef = useRef<boolean>(false);

  // 1. Fetch penuh dari server Supabase (Single Source of Truth)
  const fetchAllOpen = useCallback(async (isSilent = false) => {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;
    if (!isSilent) setIsLoading(true);

    try {
      const res = await fetchOpenIncidentsSupabase({ forceSync: true });
      if (res && res.success) {
        const freshData = Array.isArray(res.incidents) ? res.incidents : [];
        setOpenIncidents(freshData);
        openIncidentsRef.current = freshData;
        const now = Date.now();
        setLastSyncedAt(now);
        setErrorMessage(null);

        // Update First Paint Cache (selalu ditimpa termasuk jika kosong)
        saveFirstPaintCache({ openIncidents: freshData }).catch(() => {});

        onSyncSuccess?.(freshData.length);
      } else {
        const msg = res?.message || 'Gagal memuat insiden aktif';
        setErrorMessage(msg);
        onSyncError?.(new Error(msg));
      }
    } catch (err: any) {
      const msg = err?.message || 'Koneksi ke Supabase terputus';
      setErrorMessage(msg);
      onSyncError?.(err);
    } finally {
      isFetchingRef.current = false;
      setIsLoading(false);
      setIsInitialLoading(false);
    }
  }, [onSyncSuccess, onSyncError]);

  // 2. Proses batch realtime delta update (300-500ms debounce)
  const processRealtimeBatch = useCallback(async () => {
    const { upsertKeys, deleteKeys } = pendingBatchRef.current;
    if (upsertKeys.size === 0 && deleteKeys.size === 0) return;

    // Salin keys dan reset penampung
    const toUpsert = Array.from(upsertKeys);
    const toDelete = new Set(deleteKeys);
    pendingBatchRef.current = { upsertKeys: new Set(), deleteKeys: new Set() };

    let current = [...openIncidentsRef.current];

    // Hapus baris yang closed/deleted
    if (toDelete.size > 0) {
      current = current.filter((it) => !toDelete.has(it.incidentKey));
    }

    // Ambil data terbaru untuk baris yang di-insert/update
    if (toUpsert.length > 0) {
      const client = getSupabase();
      if (client) {
        try {
          const machinesMap = getMachinesMap();
          const { data, error } = await client
            .from('active_incidents')
            .select('incident_key, wsid, problem, status, start_time, end_time, duration_minutes, action_taken, action_by, action_at, is_bulk_action')
            .in('incident_key', toUpsert)
            .eq('status', 'OPEN');

          if (!error && Array.isArray(data)) {
            const mappedNew = data
              .filter((row) => !isEndTimeFilled(row.end_time))
              .map((row) => {
                const cleanWsid = (row.wsid || '').trim().toUpperCase();
                const meta = machinesMap.get(cleanWsid);
                return mapRowToOpenIncident(row, meta);
              });

            const newMap = new Map(mappedNew.map((m) => [m.incidentKey, m]));

            // Upsert in-place
            const updated = current.map((item) => {
              if (newMap.has(item.incidentKey)) {
                const fresh = newMap.get(item.incidentKey)!;
                newMap.delete(item.incidentKey);
                return fresh;
              }
              return item;
            });

            // Tambahkan baris baru yang belum ada
            current = [...Array.from(newMap.values()), ...updated];
          }
        } catch (e) {
          console.warn('[useOpenIncidents] Delta fetch error, fallback ke full refetch:', e);
          fetchAllOpen(true);
          return;
        }
      }
    }

    setOpenIncidents(current);
    openIncidentsRef.current = current;
    setLastSyncedAt(Date.now());
    saveFirstPaintCache({ openIncidents: current }).catch(() => {});
  }, [fetchAllOpen]);

  const queueRealtimeEvent = useCallback((payload: any) => {
    const { eventType, new: newRow, old: oldRow } = payload;
    const key = newRow?.incident_key || oldRow?.incident_key;
    if (!key) return;

    if (eventType === 'DELETE' || (newRow && (newRow.status !== 'OPEN' || isEndTimeFilled(newRow.end_time)))) {
      pendingBatchRef.current.deleteKeys.add(key);
      pendingBatchRef.current.upsertKeys.delete(key);
    } else if (eventType === 'INSERT' || eventType === 'UPDATE') {
      if (newRow && newRow.status === 'OPEN' && !isEndTimeFilled(newRow.end_time)) {
        pendingBatchRef.current.upsertKeys.add(key);
        pendingBatchRef.current.deleteKeys.delete(key);
      }
    }

    if (batchTimerRef.current) clearTimeout(batchTimerRef.current);
    batchTimerRef.current = setTimeout(() => {
      processRealtimeBatch();
    }, 400);
  }, [processRealtimeBatch]);

  // 3. First Paint Cache Load
  useEffect(() => {
    let isMounted = true;
    loadFirstPaintCache().then((cached) => {
      if (isMounted && cached && Array.isArray(cached.openIncidents) && cached.openIncidents.length > 0) {
        // Tampilkan first paint instan jika belum ada data server
        if (openIncidentsRef.current.length === 0) {
          setOpenIncidents(cached.openIncidents);
          openIncidentsRef.current = cached.openIncidents;
        }
      }
    });

    // Selalu fetch server Supabase setelah first paint
    fetchAllOpen();

    return () => {
      isMounted = false;
    };
  }, [fetchAllOpen]);

  const connectionStatusRef = useRef<RealtimeConnectionStatus>('CONNECTING');
  connectionStatusRef.current = connectionStatus;

  // 4. Realtime Subscription & Connection Status Tracking
  useEffect(() => {
    if (!autoSubscribe) return;
    const client = getSupabase();
    if (!client) {
      setConnectionStatus('OFFLINE');
      return;
    }

    setConnectionStatus('CONNECTING');

    const channelName = `realtime_open_incidents_${Date.now()}`;
    const channel = client
      .channel(channelName)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'active_incidents' },
        (payload) => {
          queueRealtimeEvent(payload);
        }
      )
      .subscribe((status, err) => {
        if (status === 'SUBSCRIBED') {
          setConnectionStatus('SUBSCRIBED');
          setErrorMessage(null);
          // Lakukan full resync sekali saat berhasil tersambung untuk menangkap event yang terlewat
          fetchAllOpen(true);
        } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          setConnectionStatus(err ? 'ERROR' : 'OFFLINE');
        }
      });

    // Listener visibilitychange, online, focus untuk resync otomatis
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        fetchAllOpen(true);
      }
    };
    const handleOnline = () => {
      setConnectionStatus('CONNECTING');
      fetchAllOpen(true);
    };
    const handleOffline = () => {
      setConnectionStatus('OFFLINE');
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Polling cadangan (setiap 2 menit) hanya saat tab aktif dan channel TIDAK SUBSCRIBED
    const backupInterval = setInterval(() => {
      if (document.visibilityState === 'visible' && connectionStatusRef.current !== 'SUBSCRIBED') {
        fetchAllOpen(true);
      }
    }, 120000);

    return () => {
      if (batchTimerRef.current) clearTimeout(batchTimerRef.current);
      clearInterval(backupInterval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      try {
        client.removeChannel(channel);
      } catch (_) {}
    };
  }, [autoSubscribe, fetchAllOpen, queueRealtimeEvent]);

  return {
    openIncidents,
    setOpenIncidents,
    isLoading,
    isInitialLoading,
    connectionStatus,
    lastSyncedAt,
    errorMessage,
    refetch: fetchAllOpen
  };
}