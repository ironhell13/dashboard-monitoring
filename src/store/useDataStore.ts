import { create } from 'zustand';

export interface MonthlyProblemData {
  periode: string; // e.g., "2026-08"
  uh: number;
  kom: number;
  up: number; // Only for CRM/ATS
  hw: number;
  ll: number;
  total: number;
  hwDetail: Record<string, number>;
  hwSubCategories?: Record<string, { frx: number; dur: number; pct: number }>;
  frxTotal: number;
  durTotal: number;
  uhFrx: number;
  uhDur: number;
  komFrx: number;
  komDur: number;
  upFrx: number;
  upDur: number;
  hwFrx: number;
  hwDur: number;
  llFrx: number;
  llDur: number;
}

export interface MachineData {
  wsid: string;
  jenisMesin: 'ATM' | 'CRM' | 'CDM' | 'DDM' | 'UNKNOWN';
  klienStatus: 'BCA' | 'Non BCA';
  sektorBCA: string | null;
  wilayahOperasional: string;
  lokasi: string;
  vendor?: string;
  tipeMesin: string;
  statusAktif: string;
  hari?: string;
  jam?: string | number;
  opr?: string;
  monthlyData: MonthlyProblemData[];
}

export interface TrendData {
  periode: string;
  uptimeATM: number;
  uptimeCRM: number;
  jumlahMesinATM: number;
  jumlahMesinCRM: number;
}

interface DataStore {
  machines: MachineData[];
  setMachines: (machines: MachineData[]) => void;
  
  globalTrendData: TrendData[];
  setGlobalTrendData: (data: TrendData[]) => void;
  
  // Filters
  selectedPeriode: string | 'ALL';
  setSelectedPeriode: (periode: string | 'ALL') => void;
  selectedPeriodeStart: string | 'ALL';
  setSelectedPeriodeStart: (periode: string | 'ALL') => void;
  selectedPeriodeEnd: string | 'ALL';
  setSelectedPeriodeEnd: (periode: string | 'ALL') => void;
  
  selectedKlien: 'ALL' | 'BCA' | 'Non BCA';
  setSelectedKlien: (klien: 'ALL' | 'BCA' | 'Non BCA') => void;
  
  selectedJenisMesin: 'ALL' | 'ATM' | 'CRM';
  setSelectedJenisMesin: (jenis: 'ALL' | 'ATM' | 'CRM') => void;
  
  selectedSektorWilayah: string[]; // array of selected sektor/wilayah
  setSelectedSektorWilayah: (sektor: string[]) => void;
  
  sektorMode: 'SEKTOR_BCA' | 'SERVICE_POINT';
  setSektorMode: (mode: 'SEKTOR_BCA' | 'SERVICE_POINT') => void;
  
  // Raw parsed data for comprehensive export
  rawMasterData: any[];
  setRawMasterData: (data: any[]) => void;
  rawUptimeFiles: any[];
  setRawUptimeFiles: (files: any[]) => void;

  // Available filter options based on data
  availablePeriodes: string[];
  setAvailablePeriodes: (periodes: string[]) => void;

  // Database Persistence & Locking
  lockedPeriodes: string[];
  setLockedPeriodes: (periodes: string[]) => void;
  isDbLoaded: boolean;
  setIsDbLoaded: (loaded: boolean) => void;
  dbSource: 'gas' | 'local' | 'none';
  setDbSource: (source: 'gas' | 'local' | 'none') => void;
  lastDbSync: string | null;
  setLastDbSync: (time: string | null) => void;

  // Follow-Up Tickets (CRUD)
  followUpTickets: any[];
  setFollowUpTickets: (tickets: any[]) => void;
  addOrUpdateFollowUpTicket: (ticket: any) => void;
  removeFollowUpTicket: (ticketId: string) => void;

  // Modern Follow-Up Tickets (Ka Ops / Ka Wil & Monitoring)
  modernTickets: import('../utils/spreadsheetService').FollowUpTicketItem[];
  setModernTickets: (tickets: import('../utils/spreadsheetService').FollowUpTicketItem[]) => void;
  addOrUpdateModernTicket: (ticket: import('../utils/spreadsheetService').FollowUpTicketItem) => void;
  removeModernTicket: (ticketId: string) => void;

  // Background Sync Indicator
  isSyncing: boolean;
  setIsSyncing: (isSyncing: boolean) => void;
  syncError: string | null;
  setSyncError: (error: string | null) => void;
}

export const useDataStore = create<DataStore>((set) => ({
  machines: [],
  setMachines: (machines) => set({ machines }),
  
  globalTrendData: [],
  setGlobalTrendData: (data) => set({ globalTrendData: data }),
  
  rawMasterData: [],
  setRawMasterData: (rawMasterData) => set({ rawMasterData }),
  
  rawUptimeFiles: [],
  setRawUptimeFiles: (rawUptimeFiles) => set({ rawUptimeFiles }),

  selectedPeriode: 'ALL',
  setSelectedPeriode: (periode) => set({ selectedPeriode: periode }),
  selectedPeriodeStart: 'ALL',
  setSelectedPeriodeStart: (periode) => set({ selectedPeriodeStart: periode }),
  selectedPeriodeEnd: 'ALL',
  setSelectedPeriodeEnd: (periode) => set({ selectedPeriodeEnd: periode }),
  
  selectedKlien: 'ALL',
  setSelectedKlien: (klien) => set({ selectedKlien: klien }),
  
  selectedJenisMesin: 'ALL',
  setSelectedJenisMesin: (jenis) => set({ selectedJenisMesin: jenis }),
  
  selectedSektorWilayah: [],
  setSelectedSektorWilayah: (sektor) => set({ selectedSektorWilayah: sektor }),
  
  sektorMode: 'SEKTOR_BCA',
  setSektorMode: (mode) => set({ sektorMode: mode, selectedSektorWilayah: [] }), // Reset selection on mode change
  
  availablePeriodes: [],
  setAvailablePeriodes: (periodes) => set({ availablePeriodes: periodes }),

  lockedPeriodes: [],
  setLockedPeriodes: (lockedPeriodes) => set({ lockedPeriodes }),

  isDbLoaded: false,
  setIsDbLoaded: (isDbLoaded) => set({ isDbLoaded }),

  dbSource: 'none',
  setDbSource: (dbSource) => set({ dbSource }),

  lastDbSync: null,
  setLastDbSync: (lastDbSync) => set({ lastDbSync }),

  followUpTickets: [],
  setFollowUpTickets: (tickets) => set({ followUpTickets: tickets }),
  addOrUpdateFollowUpTicket: (ticket) => set((state) => {
    const idx = state.followUpTickets.findIndex(t => t.id === ticket.id);
    if (idx >= 0) {
      const updated = [...state.followUpTickets];
      updated[idx] = ticket;
      return { followUpTickets: updated };
    }
    return { followUpTickets: [ticket, ...state.followUpTickets] };
  }),
  removeFollowUpTicket: (ticketId) => set((state) => ({
    followUpTickets: state.followUpTickets.filter(t => t.id !== ticketId)
  })),

  modernTickets: [],
  setModernTickets: (tickets) => set({ modernTickets: tickets }),
  addOrUpdateModernTicket: (ticket) => set((state) => {
    const idx = state.modernTickets.findIndex(t => t.ticketId === ticket.ticketId);
    if (idx >= 0) {
      const updated = [...state.modernTickets];
      updated[idx] = ticket;
      return { modernTickets: updated };
    }
    return { modernTickets: [ticket, ...state.modernTickets] };
  }),
  removeModernTicket: (ticketId) => set((state) => ({
    modernTickets: state.modernTickets.filter(t => t.ticketId !== ticketId)
  })),

  isSyncing: false,
  setIsSyncing: (isSyncing) => set({ isSyncing }),
  syncError: null,
  setSyncError: (syncError) => set({ syncError }),
}));


