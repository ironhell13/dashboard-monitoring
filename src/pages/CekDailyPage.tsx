import React from 'react';
import MonitoringPage from './MonitoringPage';

interface CekDailyPageProps {
  userRole?: 'KAWIL' | 'KAOPS' | 'MONITORING';
}

/**
 * CekDailyPage - Mode Ka Wil / Ka Ops
 * Menampilkan dashboard Daily Incident versi Ka Wil & Ka Ops yang saling terhubung 
 * langsung secara realtime dengan database dan telemetri monitoring,
 * dilengkapi fitur khusus untuk melakukan Request Follow Up problem / WSID.
 */
export default function CekDailyPage({ userRole }: CekDailyPageProps) {
  const effectiveRole = userRole || (sessionStorage.getItem('USER_ROLE') as any) || 'KAOPS';
  return <MonitoringPage isKaOps={true} userRole={effectiveRole} />;
}
