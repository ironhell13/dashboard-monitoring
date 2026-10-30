import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { 
  ClipboardCheck, 
  AlertTriangle, 
  Clock, 
  CheckCircle2, 
  XCircle, 
  Plus, 
  Edit3, 
  Trash2, 
  Filter, 
  Search, 
  Download, 
  TrendingUp, 
  TrendingDown, 
  Calendar, 
  User, 
  Loader2, 
  AlertCircle, 
  X, 
  ShieldAlert, 
  ArrowRight,
  Sparkles,
  ChevronDown,
  Check,
  History
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { useDataStore } from '../store/useDataStore';
import { 
  getFollowUpRecommendations, 
  evaluateTicketProgress, 
  type FollowUpRecommendation, 
  type TicketProgressEvaluation 
} from '../utils/followUpEngine';
import { cleanSektorName } from '../utils/dailyIncidentParser';
import { 
  saveFollowUpTicket, 
  deleteFollowUpTicket, 
  type FollowUpTicket,
  type FollowUpHistoryEntry
} from '../utils/spreadsheetService';
import { formatBulanTahun, getServicePointName } from '../utils/comprehensiveExporter';
import { evaluateMachineHealth } from '../utils/slaHelper';
import StickyTableWrapper from '../components/StickyTableWrapper';

const ROOT_CAUSE_PRESETS = [
  'Frekuensi Pengisian',
  'Cash Handler',
  'Dispenser',
  'EOB',
  'Reject Full',
  'Near Full',
  'Uang Tersangkut',
  'Selisih',
  'Card Reader',
  'Printer',
  'Down Intermitten',
  'Kelistrikan',
  'Lainnya (Input Manual)'
];

const PIC_PRESETS = [
  'Vendor Diebold Nixdorf',
  'Vendor Hitachi',
  'Vendor NCR',
  'Vendor OKI',
  'Vendor Hyosung',
  'Cash Replenishment',
  'Vendor Jaringan',
  'Tim Service Point / Operasional',
  'Tim Support Internal',
  'Lainnya (Input Manual)'
];

// Otomatis menghitung Target Tanggal Selesai (+7 hari / 1 minggu ke depan dari tanggal update)
const calculateTargetSelesai = (dateStr: string): string => {
  try {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) {
      const now = new Date();
      now.setDate(now.getDate() + 7);
      return now.toISOString().split('T')[0];
    }
    d.setDate(d.getDate() + 7);
    return d.toISOString().split('T')[0];
  } catch {
    const now = new Date();
    now.setDate(now.getDate() + 7);
    return now.toISOString().split('T')[0];
  }
};

// Reusable Searchable Combobox with live Auto-Suggestions and Dropdown Chevron Toggle
interface SuggestComboboxProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
  placeholder?: string;
  helperBadge?: string;
  required?: boolean;
}

function SuggestCombobox({
  label,
  value,
  onChange,
  options,
  placeholder,
  helperBadge,
  required
}: SuggestComboboxProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredOptions = useMemo(() => {
    const q = (value || '').trim().toLowerCase();
    if (!q) return options;
    return options.filter(opt => opt.toLowerCase().includes(q));
  }, [value, options]);

  return (
    <div className="relative" ref={containerRef}>
      <label className="block text-slate-600 mb-1 font-semibold flex items-center justify-between text-xs">
        <span>{label}</span>
        {helperBadge && (
          <span className="text-[10px] text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded font-normal">
            {helperBadge}
          </span>
        )}
      </label>
      <div className="relative flex items-center">
        <input
          type="text"
          value={value || ''}
          onChange={e => {
            onChange(e.target.value);
            if (!isOpen) setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          placeholder={placeholder || 'Ketik untuk mencari atau pilih dari dropdown...'}
          required={required}
          className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-3 pr-8 py-2 text-slate-900 focus:bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none text-xs transition-all"
        />
        <button
          type="button"
          tabIndex={-1}
          onClick={() => setIsOpen(!isOpen)}
          className="absolute right-2 p-1 text-slate-400 hover:text-slate-700 transition-colors cursor-pointer"
          title="Tampilkan dropdown opsi"
        >
          <ChevronDown size={15} className={`transition-transform duration-200 ${isOpen ? 'rotate-180 text-blue-600' : ''}`} />
        </button>
      </div>

      {isOpen && (
        <div className="absolute z-50 left-0 right-0 mt-1 max-h-52 overflow-y-auto bg-white border border-slate-200 rounded-xl shadow-xl py-1 text-xs">
          {filteredOptions.length === 0 ? (
            <div className="px-3 py-2 text-slate-400 italic">
              Tidak ada opsi preset yang cocok. Lanjutkan ketik untuk input manual.
            </div>
          ) : (
            filteredOptions.map((opt) => {
              const isSelected = (value || '').trim().toLowerCase() === opt.toLowerCase();
              return (
                <div
                  key={opt}
                  onClick={() => {
                    onChange(opt);
                    setIsOpen(false);
                  }}
                  className={`px-3 py-2 flex items-center justify-between cursor-pointer transition-colors ${
                    isSelected
                      ? 'bg-blue-50 text-blue-700 font-bold'
                      : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                >
                  <span>{opt}</span>
                  {isSelected && <Check size={14} className="text-blue-600 shrink-0 ml-2" />}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

export default function FollowUpPage() {
  const location = useLocation();
  const { 
    machines, 
    availablePeriodes, 
    selectedPeriode, 
    setSelectedPeriode,
    selectedJenisMesin,
    setSelectedJenisMesin,
    followUpTickets, 
    addOrUpdateFollowUpTicket, 
    removeFollowUpTicket 
  } = useDataStore();

  // Active Tab
  const [activeTab, setActiveTab] = useState<'RECOMMENDATIONS' | 'ACTIVE_TICKETS' | 'EVALUATION'>('RECOMMENDATIONS');

  // Filters
  const [priorityFilter, setPriorityFilter] = useState<'ALL' | 'CRITICAL' | 'WARNING'>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'OPEN' | 'IN_PROGRESS' | 'PANTAU' | 'CLOSED'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedServicePoint, setSelectedServicePoint] = useState('ALL');
  const [selectedSektor, setSelectedSektor] = useState('ALL');
  const [selectedVendor, setSelectedVendor] = useState('ALL');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [selectedCategoryLabel, setSelectedCategoryLabel] = useState<string>('');
  const [activeCategoryWsids, setActiveCategoryWsids] = useState<string[] | null>(null);

  // Sync category filter from navigation state
  useEffect(() => {
    if (location.state?.categoryFilter) {
      setSelectedCategory(location.state.categoryFilter);
      setSelectedCategoryLabel(location.state.categoryLabel || location.state.categoryFilter);
      if (location.state?.categoryWsids && Array.isArray(location.state.categoryWsids)) {
        setActiveCategoryWsids(location.state.categoryWsids);
      }
      if (location.state?.priorityFilter && location.state.priorityFilter !== 'ALL') {
        setPriorityFilter(location.state.priorityFilter);
      }
    }
  }, [location.state]);

  const handleCategoryChange = (val: string) => {
    setSelectedCategory(val);
    setActiveCategoryWsids(null); // Clear WSID constraint when manually choosing category
    if (val === 'ALL') {
      setSelectedCategoryLabel('');
    } else {
      const labels: Record<string, string> = {
        CHRONIC_CRITICAL: 'Mesin Kronis Kritis (> 2 Bulan)',
        CHRONIC_WARNING: 'Mesin Kronis Waspada (2 Bulan)',
        SPIKE_HW: 'Problem Hardware (H/W)',
        SPIKE_KOM: 'Problem Jaringan / Komunikasi (KOM)',
        SPIKE_UH: 'Problem Uang Habis (UH)',
        SPIKE_UP: 'Problem Uang Penuh (UP CRM)',
        UPTIME_CRITICAL: 'Uptime Kritis (< Ambang Batas)',
        UPTIME_BELOW_SLA: 'Uptime di Bawah Target SLA'
      };
      setSelectedCategoryLabel(labels[val] || val);
    }
  };

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const [isEditingExisting, setIsEditingExisting] = useState(false);
  const [modalTab, setModalTab] = useState<'FORM' | 'HISTORY'>('FORM');
  const [selectedHistoryTicket, setSelectedHistoryTicket] = useState<FollowUpTicket | null>(null);
  const [currentTicket, setCurrentTicket] = useState<Partial<FollowUpTicket>>({
    status: 'OPEN',
    akarMasalah: ROOT_CAUSE_PRESETS[0],
    detailAkarMasalah: '',
    pic: PIC_PRESETS[0],
    tanggalUpdate: new Date().toISOString().split('T')[0],
    targetSelesai: calculateTargetSelesai(new Date().toISOString().split('T')[0]),
    history: []
  });

  // Calculate Recommendations based on active filter (Khusus Mesin BCA Aktif)
  const recommendations = useMemo(() => {
    return getFollowUpRecommendations(machines, selectedPeriode, {
      jenisMesin: selectedJenisMesin
    });
  }, [machines, selectedPeriode, selectedJenisMesin]);

  // Unique Service Points for Filter (Hanya Service Point mesin BCA)
  const availableServicePoints = useMemo(() => {
    const spSet = new Set<string>();
    machines.forEach(m => {
      if (m.klienStatus === 'BCA' && m.sektorBCA) {
        const sp = getServicePointName(m.sektorBCA, m.wilayahOperasional);
        if (sp && sp !== 'Unknown Service Point' && !sp.startsWith('Unknown')) spSet.add(sp);
      }
    });
    recommendations.forEach(r => {
      if (r.sektor) {
        const sp = getServicePointName(r.sektor);
        if (sp && sp !== 'Unknown Service Point' && !sp.startsWith('Unknown')) spSet.add(sp);
      }
    });
    return Array.from(spSet).sort();
  }, [machines, recommendations]);

  // Unique Sektors for Filter (Hanya nama sektor murni, disesuaikan dengan Service Point jika dipilih)
  const availableSektors = useMemo(() => {
    const s = new Set<string>();
    machines.forEach(m => {
      if (m.klienStatus === 'BCA' && m.sektorBCA) {
        if (selectedServicePoint !== 'ALL') {
          const sp = getServicePointName(m.sektorBCA, m.wilayahOperasional);
          if (sp !== selectedServicePoint) return;
        }
        const clean = cleanSektorName(m.sektorBCA);
        if (clean && clean !== '-') {
          s.add(clean);
        }
      }
    });
    return Array.from(s).sort();
  }, [machines, selectedServicePoint]);

  // Unique Vendors for Filter (Dari mesin BCA aktif & rekomendasi)
  const availableVendors = useMemo(() => {
    const vSet = new Set<string>();
    recommendations.forEach(r => {
      if (r.vendor && r.vendor.trim() !== '' && r.vendor !== '-') {
        vSet.add(r.vendor.trim());
      }
    });
    machines.forEach(m => {
      if (m.klienStatus === 'BCA' && m.vendor && m.vendor !== '-' && m.vendor.trim() !== '') {
        vSet.add(m.vendor.trim());
      }
    });
    return Array.from(vSet).sort();
  }, [recommendations, machines]);

  // Handler for Service Point change: resets sektor if current sektor does not belong to new Service Point
  const handleServicePointChange = (sp: string) => {
    setSelectedServicePoint(sp);
    if (selectedSektor !== 'ALL' && sp !== 'ALL') {
      const spOfSektor = getServicePointName(selectedSektor);
      if (spOfSektor !== sp) {
        setSelectedSektor('ALL');
      }
    }
  };

  // Filtered Recommendations
  const filteredRecommendations = useMemo(() => {
    return recommendations.filter(r => {
      if (priorityFilter !== 'ALL' && r.priority !== priorityFilter) return false;

      // Filter by Service Point
      if (selectedServicePoint !== 'ALL') {
        const sp = getServicePointName(r.sektor);
        if (sp !== selectedServicePoint) return false;
      }

      // Filter by Sektor
      if (selectedSektor !== 'ALL' && cleanSektorName(r.sektor) !== selectedSektor) return false;

      // Filter by Vendor
      if (selectedVendor !== 'ALL') {
        if (r.vendor.trim().toUpperCase() !== selectedVendor.trim().toUpperCase()) return false;
      }

      // Filter by Category
      if (selectedCategory !== 'ALL') {
        if (activeCategoryWsids && activeCategoryWsids.length > 0) {
          if (!activeCategoryWsids.includes(r.wsid)) return false;
        } else {
          const reasonsStr = (r.reasons || []).join(' ');
          if (selectedCategory === 'CHRONIC_CRITICAL' && !reasonsStr.includes('Mesin Kronis (> 2 Bulan)')) return false;
          if (selectedCategory === 'CHRONIC_WARNING' && !reasonsStr.includes('Mesin Kronis (Waspada 2 Bulan)')) return false;
          if (selectedCategory === 'SPIKE_HW' && !reasonsStr.includes('Hardware')) return false;
          if (selectedCategory === 'SPIKE_KOM' && !reasonsStr.includes('Komunikasi') && !reasonsStr.includes('Jaringan')) return false;
          if (selectedCategory === 'SPIKE_UH' && !reasonsStr.includes('Uang Habis')) return false;
          if (selectedCategory === 'SPIKE_UP' && !reasonsStr.includes('Uang Penuh')) return false;
          if (selectedCategory === 'UPTIME_CRITICAL' && !reasonsStr.includes('Uptime Kritis')) return false;
          if (selectedCategory === 'UPTIME_BELOW_SLA' && !reasonsStr.includes('Target SLA')) return false;
        }
      }

      if (searchQuery.trim() !== '') {
        const q = searchQuery.toLowerCase();
        const sp = getServicePointName(r.sektor).toLowerCase();
        const matchWsid = r.wsid.toLowerCase().includes(q);
        const matchLokasi = r.lokasi.toLowerCase().includes(q);
        const matchVendor = r.vendor.toLowerCase().includes(q);
        const matchSektor = r.sektor.toLowerCase().includes(q);
        const matchServicePoint = sp.includes(q);
        if (!matchWsid && !matchLokasi && !matchVendor && !matchSektor && !matchServicePoint) return false;
      }
      return true;
    });
  }, [recommendations, priorityFilter, selectedServicePoint, selectedSektor, selectedVendor, selectedCategory, activeCategoryWsids, searchQuery]);

  // Filtered Active Tickets
  const filteredTickets = useMemo(() => {
    return (followUpTickets || []).filter(t => {
      if (statusFilter !== 'ALL') {
        if (statusFilter === 'PANTAU') {
          if (t.status !== 'PANTAU' && (t.status as string) !== 'RESOLVED') return false;
        } else if (t.status !== statusFilter) {
          return false;
        }
      }
      if (searchQuery.trim() !== '') {
        const q = searchQuery.toLowerCase();
        const matchWsid = t.wsid.toLowerCase().includes(q);
        const matchLokasi = t.lokasi.toLowerCase().includes(q);
        const matchPic = (t.pic || '').toLowerCase().includes(q);
        const matchAkar = `${t.akarMasalah || ''} ${t.detailAkarMasalah || ''}`.toLowerCase().includes(q);
        const matchHistory = (t.history || []).some(h => 
          (h.tindakan || '').toLowerCase().includes(q) ||
          (h.catatan || '').toLowerCase().includes(q) ||
          (h.pic || '').toLowerCase().includes(q)
        );
        if (!matchWsid && !matchLokasi && !matchPic && !matchAkar && !matchHistory) return false;
      }
      return true;
    });
  }, [followUpTickets, statusFilter, searchQuery]);

  // Ticket Progress Evaluations (Before vs After)
  const evaluations = useMemo(() => {
    return (followUpTickets || []).map(ticket => {
      const machine = machines.find(m => m.wsid === ticket.wsid);
      return {
        ticket,
        evaluation: evaluateTicketProgress(ticket, machine, availablePeriodes)
      };
    });
  }, [followUpTickets, machines, availablePeriodes]);

  // KPI Counters
  const criticalCount = recommendations.filter(r => r.priority === 'CRITICAL').length;
  const warningCount = recommendations.filter(r => r.priority === 'WARNING').length;
  const inProgressCount = (followUpTickets || []).filter(t => 
    t.status === 'IN_PROGRESS' || t.status === 'OPEN' || t.status === 'PANTAU' || (t.status as string) === 'RESOLVED'
  ).length;
  
  // Safe / Memenuhi Target SLA count (Aman - matching Dashboard, Khusus BCA Aktif)
  const safeCount = useMemo(() => {
    return machines.filter(m => {
      if (m.statusAktif?.trim().toUpperCase() !== 'AKTIF') return false;
      if (m.klienStatus !== 'BCA') return false;
      if (selectedJenisMesin !== 'ALL' && m.jenisMesin !== selectedJenisMesin) return false;
      const health = evaluateMachineHealth(m, selectedPeriode);
      return health.status === 'SAFE';
    }).length;
  }, [machines, selectedPeriode, selectedJenisMesin]);

  // Open Create Ticket Modal from Recommendation
  const handleCreateFromRecommendation = (rec: FollowUpRecommendation) => {
    const today = new Date().toISOString().split('T')[0];
    const initialPic = rec.vendor && rec.vendor !== '-'
      ? (rec.vendor.toLowerCase().includes('vendor') ? rec.vendor : `Vendor ${rec.vendor}`)
      : PIC_PRESETS[0];

    setIsEditingExisting(false);
    setModalTab('FORM');
    setCurrentTicket({
      id: `FU-${rec.wsid}-${Date.now().toString().slice(-4)}`,
      wsid: rec.wsid,
      lokasi: rec.lokasi,
      sektor: rec.sektor,
      wilayah: rec.wilayah,
      vendor: rec.vendor,
      periodeProblem: rec.latestPeriode,
      uptimeBaseline: rec.latestUptime,
      kategoriProblem: rec.dominantProblem,
      akarMasalah: ROOT_CAUSE_PRESETS[0],
      detailAkarMasalah: '',
      actionPlan: '',
      pic: initialPic,
      petugas: '',
      tanggalUpdate: today,
      targetSelesai: calculateTargetSelesai(today),
      status: 'OPEN',
      catatan: '',
      history: []
    });
    setModalError(null);
    setIsModalOpen(true);
  };

  // Open Edit / Update Ticket Modal
  const handleEditTicket = (ticket: FollowUpTicket) => {
    const today = new Date().toISOString().split('T')[0];
    const updateDate = ticket.tanggalUpdate || (ticket.updatedAt ? ticket.updatedAt.slice(0, 10) : today);
    setIsEditingExisting(true);
    setModalTab('FORM');

    const defaultPic = ticket.pic && ticket.pic !== '-'
      ? ticket.pic
      : (ticket.vendor && ticket.vendor !== '-'
          ? (ticket.vendor.toLowerCase().includes('vendor') ? ticket.vendor : `Vendor ${ticket.vendor}`)
          : PIC_PRESETS[0]);

    const existingHistory = ticket.history && ticket.history.length > 0
      ? ticket.history
      : [{
          id: `HIST-${ticket.id}-init`,
          tanggal: updateDate,
          status: (ticket.status as any) === 'RESOLVED' ? 'PANTAU' : (ticket.status || 'OPEN'),
          tindakan: ticket.actionPlan || '',
          pic: defaultPic,
          petugas: ticket.petugas || '',
          akarMasalah: ticket.akarMasalah || '',
          detailAkarMasalah: ticket.detailAkarMasalah || '',
          catatan: ticket.catatan || '',
          targetSelesai: ticket.targetSelesai || calculateTargetSelesai(today),
          updatedAt: ticket.updatedAt || new Date().toISOString()
        }];

    setCurrentTicket({
      ...ticket,
      detailAkarMasalah: '',
      actionPlan: '',
      catatan: '',
      petugas: '',
      pic: defaultPic,
      tanggalUpdate: today,
      targetSelesai: calculateTargetSelesai(today),
      status: (ticket.status as any) === 'RESOLVED' ? 'PANTAU' : (ticket.status || 'OPEN'),
      history: existingHistory
    });
    setModalError(null);
    setIsModalOpen(true);
  };

  // Save Ticket (Create or Update with History Tracking)
  const handleSaveTicket = async () => {
    if (!currentTicket.wsid || !currentTicket.actionPlan) {
      setModalError('WSID dan Tindakan (Action) wajib diisi.');
      return;
    }

    setIsSaving(true);
    setModalError(null);

    const today = new Date().toISOString().split('T')[0];
    const updateDate = currentTicket.tanggalUpdate || today;
    const targetDate = currentTicket.targetSelesai || calculateTargetSelesai(updateDate);
    const newStatus = (currentTicket.status as any) === 'RESOLVED' ? 'PANTAU' : (currentTicket.status || 'OPEN');

    const existingHistory = currentTicket.history && currentTicket.history.length > 0
      ? currentTicket.history
      : [];

    const entryPic = currentTicket.pic && currentTicket.pic !== '-'
      ? currentTicket.pic
      : (currentTicket.vendor && currentTicket.vendor !== '-'
          ? (currentTicket.vendor.toLowerCase().includes('vendor') ? currentTicket.vendor : `Vendor ${currentTicket.vendor}`)
          : PIC_PRESETS[0]);

    const newHistoryEntry: FollowUpHistoryEntry = {
      id: `HIST-${Date.now()}`,
      tanggal: updateDate,
      status: newStatus,
      tindakan: currentTicket.actionPlan || '',
      pic: entryPic,
      petugas: currentTicket.petugas || '',
      akarMasalah: currentTicket.akarMasalah || '',
      detailAkarMasalah: currentTicket.detailAkarMasalah || '',
      catatan: currentTicket.catatan || '',
      targetSelesai: targetDate,
      updatedAt: new Date().toISOString()
    };

    let updatedHistory: FollowUpHistoryEntry[];
    if (isEditingExisting) {
      if (existingHistory.length === 0) {
        updatedHistory = [newHistoryEntry];
      } else {
        updatedHistory = [newHistoryEntry, ...existingHistory];
      }
    } else {
      updatedHistory = [newHistoryEntry];
    }

    const ticketToSave: FollowUpTicket = {
      id: currentTicket.id || `FU-${Date.now()}`,
      wsid: currentTicket.wsid || '',
      lokasi: currentTicket.lokasi || '',
      sektor: currentTicket.sektor || '',
      wilayah: currentTicket.wilayah || 'ABACUS JAKARTA',
      vendor: currentTicket.vendor || '-',
      periodeProblem: currentTicket.periodeProblem || availablePeriodes[availablePeriodes.length - 1] || '',
      uptimeBaseline: Number(currentTicket.uptimeBaseline) || 0,
      kategoriProblem: currentTicket.kategoriProblem || 'Downtime Tinggi',
      akarMasalah: currentTicket.akarMasalah || '',
      detailAkarMasalah: currentTicket.detailAkarMasalah || '',
      actionPlan: currentTicket.actionPlan || '',
      pic: entryPic,
      petugas: currentTicket.petugas || '',
      tanggalUpdate: updateDate,
      targetSelesai: targetDate,
      status: newStatus,
      catatan: currentTicket.catatan || '',
      updatedAt: new Date().toISOString(),
      history: updatedHistory
    };

    try {
      const res = await saveFollowUpTicket(ticketToSave);
      if (res.success) {
        addOrUpdateFollowUpTicket(ticketToSave);
        if (selectedHistoryTicket && selectedHistoryTicket.id === ticketToSave.id) {
          setSelectedHistoryTicket(ticketToSave);
        }
        setIsModalOpen(false);
      } else {
        setModalError(res.error || res.message || 'Gagal menyimpan ke spreadsheet.');
      }
    } catch (err: any) {
      setModalError(err.message || 'Terjadi kesalahan sistem.');
    } finally {
      setIsSaving(false);
    }
  };

  // Delete Ticket
  const handleDeleteTicket = async (ticketId: string) => {
    if (!window.confirm(`Hapus tiket follow up ${ticketId}?`)) return;
    try {
      const res = await deleteFollowUpTicket(ticketId);
      if (res.success) {
        removeFollowUpTicket(ticketId);
      } else {
        alert(res.error || res.message || 'Gagal menghapus tiket.');
      }
    } catch (err: any) {
      alert(err.message || 'Gagal menghapus tiket.');
    }
  };

  // Export Follow Up Report to Excel
  const handleExportExcel = () => {
    const wb = XLSX.utils.book_new();

    const uptimeColHeader = selectedPeriode === 'ALL'
      ? 'Rata-rata Uptime Seluruh Bulan (%)'
      : `Uptime ${formatBulanTahun(selectedPeriode)} (%)`;

    // Sheet 1: Rekomendasi
    const recRows = (filteredRecommendations.length > 0 ? filteredRecommendations : recommendations).map((r, i) => ({
      No: i + 1,
      Prioritas: r.priority,
      WSID: r.wsid,
      Lokasi: r.lokasi,
      'Service Point': getServicePointName(r.sektor),
      Sektor: r.sektor,
      Vendor: r.vendor,
      [uptimeColHeader]: r.latestUptime,
      'Problem Dominan': r.dominantProblem,
      'Alasan Rekomendasi': r.priorityReason,
      'Bulan Kronis': r.isChronic ? `${r.consecutiveLowMonths} Bulan` : '-'
    }));
    const wsRec = XLSX.utils.json_to_sheet(recRows);
    XLSX.utils.book_append_sheet(wb, wsRec, 'Rekomendasi Follow Up');

    // Sheet 2: Tiket Aktif
    const ticketRows = (followUpTickets || []).map((t, i) => ({
      No: i + 1,
      'ID Tiket': t.id,
      WSID: t.wsid,
      Lokasi: t.lokasi,
      Sektor: t.sektor,
      Vendor: t.vendor,
      'Periode Problem': t.periodeProblem,
      'Uptime Awal (%)': t.uptimeBaseline,
      'Kategori Problem': t.kategoriProblem,
      'Akar Masalah': t.akarMasalah,
      'Rincian / Detail Masalah': t.detailAkarMasalah || '',
      'Tindakan (Action)': t.actionPlan,
      'PIC / Vendor': t.pic && t.pic !== '-' ? t.pic : 'Tim Support Internal',
      'Petugas / Penginput': t.petugas || '-',
      'Tanggal Update': t.tanggalUpdate || (t.updatedAt ? t.updatedAt.slice(0, 10) : '-'),
      'Target Selesai (+1 Minggu)': t.targetSelesai,
      Status: (t.status === 'RESOLVED' || t.status === 'PANTAU') ? 'PANTAU' : t.status,
      Catatan: t.catatan,
      'Total Update': (t.history?.length || 1)
    }));
    const wsTicket = XLSX.utils.json_to_sheet(ticketRows);
    XLSX.utils.book_append_sheet(wb, wsTicket, 'Tindakan (Action) Aktif');

    // Sheet 3: Riwayat Penanganan Detail
    const allHistoryRows: any[] = [];
    let hNo = 1;
    (followUpTickets || []).forEach(t => {
      const histList = t.history && t.history.length > 0
        ? t.history
        : [{
            id: `HIST-${t.id}-0`,
            tanggal: t.tanggalUpdate || (t.updatedAt ? t.updatedAt.slice(0, 10) : '-'),
            status: t.status,
            tindakan: t.actionPlan,
            pic: t.pic,
            petugas: t.petugas,
            akarMasalah: t.akarMasalah,
            detailAkarMasalah: t.detailAkarMasalah || '',
            catatan: t.catatan,
            targetSelesai: t.targetSelesai
          }];

      histList.forEach((h, hIdx) => {
        allHistoryRows.push({
          No: hNo++,
          'ID Tiket': t.id,
          WSID: t.wsid,
          Lokasi: t.lokasi,
          Sektor: t.sektor,
          Vendor: t.vendor,
          'Urutan Update': `Update #${histList.length - hIdx}`,
          'Tanggal Update': h.tanggal || '-',
          'Status Saat Update': (h.status === 'RESOLVED' || h.status === 'PANTAU') ? 'PANTAU' : h.status,
          'Tindakan (Action)': h.tindakan,
          'PIC / Vendor': h.pic && h.pic !== '-' ? h.pic : (t.pic && t.pic !== '-' ? t.pic : 'Tim Support Internal'),
          'Petugas / Penginput': h.petugas || t.petugas || '-',
          'Akar Masalah': h.akarMasalah || t.akarMasalah,
          'Rincian Akar Masalah': h.detailAkarMasalah || '',
          'Target Selesai': h.targetSelesai || t.targetSelesai,
          Catatan: h.catatan || ''
        });
      });
    });

    const wsHistory = XLSX.utils.json_to_sheet(allHistoryRows);
    XLSX.utils.book_append_sheet(wb, wsHistory, 'Riwayat Penanganan Detail');

    // Sheet 4: Evaluasi Before vs After
    const evalRows = evaluations.map((e, i) => ({
      No: i + 1,
      'ID Tiket': e.ticket.id,
      WSID: e.ticket.wsid,
      Lokasi: e.ticket.lokasi,
      'Periode Baseline': e.evaluation.baselinePeriode,
      'Uptime Baseline (%)': e.evaluation.baselineUptime,
      'Periode Evaluasi': e.evaluation.latestPeriode,
      'Uptime Terkini (%)': e.evaluation.latestUptime,
      'Delta Uptime (+/- %)': e.evaluation.deltaUptime,
      'Hasil Evaluasi': e.evaluation.statusLabel,
      'Rekomendasi Lanjutan': e.evaluation.recommendationNote
    }));
    const wsEval = XLSX.utils.json_to_sheet(evalRows);
    XLSX.utils.book_append_sheet(wb, wsEval, 'Evaluasi Before vs After');

    XLSX.writeFile(wb, `Laporan_Need_To_Follow_Up_BCA_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  return (
    <div className="space-y-5 pb-12 animate-fade-in">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">Need to Follow Up</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Pusat penanganan mesin BCA aktif bermasalah (ATM/CRM), tindak lanjut PIC/Vendor, dan evaluasi Before vs After.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleExportExcel}
            className="inline-flex items-center gap-2 px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-medium transition-colors shadow-2xs cursor-pointer"
          >
            <Download size={14} />
            <span>Export Laporan Follow Up</span>
          </button>
        </div>
      </div>

      {/* KPI Stats Cards (Compact 92-105px) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
        {/* Card 1: Critical */}
        <div className="bg-white rounded-lg p-3 border border-[#E5EAF2] shadow-2xs min-h-[92px] max-h-[105px] flex flex-col justify-between">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Prioritas Kritis</p>
              <h3 className="text-2xl font-bold text-rose-600 mt-0.5 leading-tight">{criticalCount}</h3>
            </div>
            <div className="p-1.5 bg-rose-50 text-rose-600 rounded-md border border-rose-100">
              <ShieldAlert size={15} />
            </div>
          </div>
          <p className="text-[10px] text-slate-400 truncate mt-0.5">
            {selectedPeriode === 'ALL' 
              ? 'Rata-rata < 99.00% / 98.00% atau Kronis > 2 Bulan' 
              : `Kritis pada ${formatBulanTahun(selectedPeriode)} atau Kronis > 2 Bulan`}
          </p>
        </div>

        {/* Card 2: Warning */}
        <div className="bg-white rounded-lg p-3 border border-[#E5EAF2] shadow-2xs min-h-[92px] max-h-[105px] flex flex-col justify-between">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Prioritas Warning</p>
              <h3 className="text-2xl font-bold text-amber-600 mt-0.5 leading-tight">{warningCount}</h3>
            </div>
            <div className="p-1.5 bg-amber-50 text-amber-600 rounded-md border border-amber-100">
              <AlertTriangle size={15} />
            </div>
          </div>
          <p className="text-[10px] text-slate-400 truncate mt-0.5">
            {selectedPeriode === 'ALL'
              ? 'Rata-rata di Bawah SLA, Waspada 2 Bulan, / Spike'
              : `Di Bawah SLA pada ${formatBulanTahun(selectedPeriode)} / Lonjakan`}
          </p>
        </div>

        {/* Card 3: Active Tickets */}
        <div className="bg-white rounded-lg p-3 border border-[#E5EAF2] shadow-2xs min-h-[92px] max-h-[105px] flex flex-col justify-between">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Tiket Aktif & Pantau</p>
              <h3 className="text-2xl font-bold text-blue-600 mt-0.5 leading-tight">{inProgressCount}</h3>
            </div>
            <div className="p-1.5 bg-blue-50 text-blue-600 rounded-md border border-blue-100">
              <Clock size={15} />
            </div>
          </div>
          <p className="text-[10px] text-slate-400 mt-0.5 truncate">Status OPEN / IN PROGRESS / PANTAU</p>
        </div>

        {/* Card 4: Target SLA Tercapai (Aman) */}
        <div className="bg-white rounded-lg p-3 border border-[#E5EAF2] shadow-2xs min-h-[92px] max-h-[105px] flex flex-col justify-between">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Target SLA Tercapai</p>
              <h3 className="text-2xl font-bold text-emerald-600 mt-0.5 leading-tight">{safeCount}</h3>
            </div>
            <div className="p-1.5 bg-emerald-50 text-emerald-600 rounded-md border border-emerald-100">
              <CheckCircle2 size={15} />
            </div>
          </div>
          <p className="text-[10px] text-slate-400 mt-0.5 truncate">BCA Aktif: ATM &ge; 99.00% • CRM &ge; 98.50%</p>
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="flex border-b border-[#E5EAF2] gap-1">
        <button
          onClick={() => setActiveTab('RECOMMENDATIONS')}
          className={`px-4 py-2.5 text-xs font-semibold transition-all border-b-2 cursor-pointer flex items-center gap-2 ${
            activeTab === 'RECOMMENDATIONS'
              ? 'border-blue-600 text-blue-600 bg-blue-50/40 rounded-t'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Sparkles size={14} />
          <span>Rekomendasi Butuh Follow Up</span>
          <span className="px-1.5 py-0.5 rounded text-[10px] bg-rose-50 text-rose-700 font-semibold border border-rose-200">
            {recommendations.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('ACTIVE_TICKETS')}
          className={`px-4 py-2.5 text-xs font-semibold transition-all border-b-2 cursor-pointer flex items-center gap-2 ${
            activeTab === 'ACTIVE_TICKETS'
              ? 'border-blue-600 text-blue-600 bg-blue-50/40 rounded-t'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Clock size={14} />
          <span>Monitoring Tindak Lanjut (Active)</span>
          <span className="px-1.5 py-0.5 rounded text-[10px] bg-blue-50 text-blue-700 font-semibold border border-blue-200">
            {(followUpTickets || []).length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('EVALUATION')}
          className={`px-4 py-2.5 text-xs font-semibold transition-all border-b-2 cursor-pointer flex items-center gap-2 ${
            activeTab === 'EVALUATION'
              ? 'border-blue-600 text-blue-600 bg-blue-50/40 rounded-t'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <TrendingUp size={14} />
          <span>Evaluasi Perkembangan (Before vs After)</span>
        </button>
      </div>

      {/* TAB 1: REKOMENDASI MESIN */}
      {activeTab === 'RECOMMENDATIONS' && (
        <div className="space-y-4">
          {/* Filter Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 bg-white border border-[#E5EAF2] rounded-lg shadow-2xs">
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1.5 text-xs text-slate-500 font-medium">
                <Filter size={14} />
                <span>Filter:</span>
              </div>

              {/* Periode Filter */}
              <div className="flex items-center gap-1.5 bg-slate-50 border border-[#E5EAF2] rounded-lg px-2.5 py-1.5">
                <Calendar size={13} className="text-slate-400" />
                <select
                  value={selectedPeriode}
                  onChange={e => setSelectedPeriode(e.target.value)}
                  className="text-xs bg-transparent text-slate-700 font-medium focus:outline-none cursor-pointer"
                >
                  <option value="ALL">Semua Bulan (Agregat)</option>
                  {availablePeriodes.map(p => (
                    <option key={p} value={p}>{formatBulanTahun(p)}</option>
                  ))}
                </select>
              </div>

              {/* Jenis Mesin Filter */}
              <select
                value={selectedJenisMesin}
                onChange={e => setSelectedJenisMesin(e.target.value as any)}
                className="text-xs bg-white border border-[#E5EAF2] rounded-lg px-2.5 py-1.5 text-slate-700 font-medium focus:ring-1 focus:ring-blue-500 focus:outline-none cursor-pointer"
              >
                <option value="ALL">Semua Mesin</option>
                <option value="ATM">ATM Saja</option>
                <option value="CRM">CRM (ATS) Saja</option>
              </select>

              {/* Fokus Klien Badge */}
              <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-blue-50 border border-blue-200 rounded-lg text-xs font-medium text-blue-700">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-600"></span>
                <span>Fokus: Mesin BCA Aktif</span>
              </div>

              {/* Priority Filter */}
              <div className="flex rounded-lg bg-slate-100 p-0.5 text-xs font-medium">
                {(['ALL', 'CRITICAL', 'WARNING'] as const).map(p => (
                  <button
                    key={p}
                    onClick={() => setPriorityFilter(p)}
                    className={`px-2.5 py-1 rounded transition-all cursor-pointer text-xs ${
                      priorityFilter === p ? 'bg-white shadow-2xs text-slate-900 font-semibold' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {p === 'ALL' ? 'Semua Status' : p === 'CRITICAL' ? 'Kritis' : 'Warning'}
                  </button>
                ))}
              </div>

              {/* Service Point Filter */}
              <div className="flex items-center gap-1.5 bg-white border border-[#E5EAF2] rounded-lg px-2.5 py-1.5 shadow-2xs">
                <span className="text-[10px] text-slate-400 font-semibold uppercase">SP:</span>
                <select
                  value={selectedServicePoint}
                  onChange={e => handleServicePointChange(e.target.value)}
                  className="text-xs bg-transparent text-slate-700 font-medium focus:outline-none cursor-pointer"
                >
                  <option value="ALL">Semua SP ({availableServicePoints.length})</option>
                  {availableServicePoints.map(sp => (
                    <option key={sp} value={sp}>{sp}</option>
                  ))}
                </select>
              </div>

              {/* Sektor Filter */}
              <div className="flex items-center gap-1.5 bg-white border border-[#E5EAF2] rounded-lg px-2.5 py-1.5 shadow-2xs">
                <span className="text-[10px] text-slate-400 font-semibold uppercase">Sektor:</span>
                <select
                  value={selectedSektor}
                  onChange={e => setSelectedSektor(e.target.value)}
                  className="text-xs bg-transparent text-slate-700 font-medium focus:outline-none cursor-pointer"
                >
                  <option value="ALL">Semua Sektor ({availableSektors.length})</option>
                  {availableSektors.map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>

              {/* Vendor Filter */}
              <div className="flex items-center gap-1.5 bg-white border border-[#E5EAF2] rounded-lg px-2.5 py-1.5 shadow-2xs">
                <span className="text-[10px] text-slate-400 font-semibold uppercase">Vendor:</span>
                <select
                  value={selectedVendor}
                  onChange={e => setSelectedVendor(e.target.value)}
                  className="text-xs bg-transparent text-slate-700 font-medium focus:outline-none cursor-pointer"
                >
                  <option value="ALL">Semua Vendor ({availableVendors.length})</option>
                  {availableVendors.map(v => (
                    <option key={v} value={v}>{v}</option>
                  ))}
                </select>
              </div>

              {/* Kategori Alasan Filter */}
              <select
                value={selectedCategory}
                onChange={e => handleCategoryChange(e.target.value)}
                className="text-xs bg-white border border-[#E5EAF2] rounded-lg px-2.5 py-1.5 text-slate-700 font-medium focus:ring-1 focus:ring-blue-500 focus:outline-none cursor-pointer"
              >
                <option value="ALL">Semua Kategori Problem & Kronis</option>
                <optgroup label="Mesin Kronis">
                  <option value="CHRONIC_CRITICAL">Mesin Kronis Kritis (&gt; 2 Bulan)</option>
                  <option value="CHRONIC_WARNING">Mesin Kronis Waspada (2 Bulan)</option>
                </optgroup>
                <optgroup label="Kategori Problem (Spikes)">
                  <option value="SPIKE_HW">Problem Hardware (H/W)</option>
                  <option value="SPIKE_KOM">Problem Jaringan & Komunikasi (KOM)</option>
                  <option value="SPIKE_UH">Problem Uang Habis (UH)</option>
                  <option value="SPIKE_UP">Problem Uang Penuh (UP CRM)</option>
                </optgroup>
                <optgroup label="Standar SLA">
                  <option value="UPTIME_CRITICAL">Uptime Kritis (&lt; Ambang Batas)</option>
                  <option value="UPTIME_BELOW_SLA">Uptime di Bawah Target SLA</option>
                </optgroup>
              </select>

              {/* Reset Filter Button */}
              {(selectedServicePoint !== 'ALL' || selectedVendor !== 'ALL' || selectedSektor !== 'ALL' || priorityFilter !== 'ALL' || selectedCategory !== 'ALL' || searchQuery.trim() !== '') && (
                <button
                  onClick={() => {
                    setSelectedServicePoint('ALL');
                    setSelectedVendor('ALL');
                    setSelectedSektor('ALL');
                    setPriorityFilter('ALL');
                    handleCategoryChange('ALL');
                    setSearchQuery('');
                  }}
                  className="inline-flex items-center gap-1 text-[11px] text-slate-500 hover:text-rose-600 font-medium px-2 py-1 rounded-lg hover:bg-rose-50 border border-[#E5EAF2] transition-colors cursor-pointer"
                  title="Reset semua filter rekomendasi"
                >
                  <X size={12} />
                  <span>Reset</span>
                </button>
              )}
            </div>

            {/* Search Input */}
            <div className="relative min-w-[200px]">
              <Search size={14} className="absolute left-3 top-2 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Cari WSID / Lokasi / Vendor..."
                className="w-full text-xs pl-8 pr-3 py-1.5 bg-slate-50 border border-[#E5EAF2] rounded-lg focus:bg-white focus:ring-1 focus:ring-blue-500 focus:outline-none"
              />
            </div>
          </div>

          {/* Active Category Banner from Dashboard Navigation or Dropdown */}
          {selectedCategory !== 'ALL' && (
            <div className="flex flex-wrap items-center justify-between gap-2 bg-blue-50 border border-blue-200 text-blue-900 px-3.5 py-2.5 rounded-lg text-xs shadow-2xs">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="p-1 rounded bg-blue-600 text-white">
                  <Filter size={12} />
                </span>
                <span className="font-semibold">Filter Kategori:</span>
                <span className="px-2 py-0.5 rounded bg-blue-600 text-white font-medium text-[11px]">
                  {selectedCategoryLabel || selectedCategory}
                </span>
                <span className="text-blue-700 font-medium">
                  • Menampilkan <strong>{filteredRecommendations.length}</strong> mesin
                </span>
              </div>
              <button
                onClick={() => handleCategoryChange('ALL')}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-white hover:bg-slate-50 text-slate-700 font-medium rounded-lg border border-[#E5EAF2] shadow-2xs transition-colors cursor-pointer text-xs"
              >
                <X size={12} />
                <span>Hapus Filter</span>
              </button>
            </div>
          )}

          {/* Table */}
          <div className="bg-white border border-[#E5EAF2] rounded-lg shadow-2xs overflow-hidden">
            <StickyTableWrapper>
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-[#F8FAFC] text-slate-600 font-semibold uppercase text-[11px] tracking-wider border-b border-[#E5EAF2]">
                    <th className="py-2.5 px-4">Prioritas</th>
                    <th className="py-2.5 px-4">WSID & Mesin</th>
                    <th className="py-2.5 px-4">Lokasi & Service Point</th>
                    <th className="py-2.5 px-4">Vendor</th>
                    <th className="py-2.5 px-4 text-center">
                      {selectedPeriode === 'ALL' ? (
                        <span>Rata-rata Uptime</span>
                      ) : (
                        <span>Uptime {formatBulanTahun(selectedPeriode)}</span>
                      )}
                    </th>
                    <th className="py-2.5 px-4">Problem Dominan</th>
                    <th className="py-2.5 px-4">Pola & Alasan</th>
                    <th className="py-2.5 px-4 text-center">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E5EAF2] text-slate-700">
                  {filteredRecommendations.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-10 text-center text-slate-400">
                        Tidak ada mesin yang memerlukan follow up sesuai filter yang dipilih.
                      </td>
                    </tr>
                  ) : (
                    filteredRecommendations.map((rec) => {
                      const hasActiveTicket = (followUpTickets || []).some(
                        t => t.wsid === rec.wsid && (t.status === 'OPEN' || t.status === 'IN_PROGRESS')
                      );

                      return (
                        <tr key={rec.wsid} className="hover:bg-slate-50/70 transition-colors">
                          <td className="py-2.5 px-4">
                            {rec.priority === 'CRITICAL' ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-rose-50 text-rose-700 border border-rose-200">
                                CRITICAL
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                                WARNING
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 px-4 font-semibold text-slate-900">
                            <div>{rec.wsid}</div>
                            <span className="text-[10px] font-normal text-slate-500 uppercase">{rec.jenisMesin}</span>
                          </td>
                          <td className="py-2.5 px-4">
                            <div className="font-medium text-slate-800 max-w-[220px] truncate">{rec.lokasi}</div>
                            <div className="text-[11px] text-slate-500 flex items-center gap-1 flex-wrap">
                              <span className="font-normal text-slate-700">{getServicePointName(rec.sektor)}</span>
                              <span className="text-slate-300">•</span>
                              <span className="text-slate-500">{rec.sektor}</span>
                            </div>
                          </td>
                          <td className="py-2.5 px-4 font-medium text-slate-700">
                            {rec.vendor}
                          </td>
                          <td className="py-2.5 px-4 text-center">
                            <span className={`inline-block px-2 py-0.5 rounded font-semibold text-xs ${
                              rec.priority === 'CRITICAL' ? 'bg-rose-50 text-rose-600 border border-rose-200' : 'bg-amber-50 text-amber-600 border border-amber-200'
                            }`}>
                              {rec.latestUptime.toFixed(2)}%
                            </span>
                            <div className="text-[10px] text-slate-400 mt-0.5">
                              {selectedPeriode === 'ALL' ? 'Rata-rata' : formatBulanTahun(selectedPeriode)}
                            </div>
                          </td>
                          <td className="py-2.5 px-4">
                            <div className="font-medium text-slate-800">{rec.dominantProblem}</div>
                          </td>
                          <td className="py-2.5 px-4">
                            <div className={`text-[11px] font-medium ${rec.isChronic ? 'text-purple-700' : 'text-slate-800'}`}>
                              {rec.priorityReason}
                            </div>
                            {rec.reasons && rec.reasons.length > 1 && (
                              <div className="flex flex-col gap-0.5 mt-1">
                                {rec.reasons.slice(1).map((r, ri) => (
                                  <span key={ri} className="text-[10px] text-slate-500 flex items-center gap-1">
                                    <span className="w-1 h-1 rounded-full bg-slate-400 shrink-0"></span>
                                    <span>{r}</span>
                                  </span>
                                ))}
                              </div>
                            )}
                          </td>
                          <td className="py-2.5 px-4 text-center">
                            {hasActiveTicket ? (
                              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-blue-700 bg-blue-50 px-2.5 py-1 rounded-lg border border-blue-200">
                                <Clock size={12} />
                                In Progress
                              </span>
                            ) : (
                              <button
                                onClick={() => handleCreateFromRecommendation(rec)}
                                className="inline-flex items-center gap-1 px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-medium shadow-2xs transition-colors cursor-pointer"
                              >
                                <Plus size={13} />
                                <span>Tindak Lanjuti</span>
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </StickyTableWrapper>
          </div>
        </div>
      )}

      {/* TAB 2: MONITORING TIKET AKTIF (CRUD) */}
      {activeTab === 'ACTIVE_TICKETS' && (
        <div className="space-y-4">
          {/* Status Filter */}
          <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 bg-white border border-[#E5EAF2] rounded-lg shadow-2xs">
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500 font-medium">Status Tiket:</span>
              <div className="flex flex-wrap rounded-lg bg-slate-100 p-0.5 text-xs font-medium">
                {(['ALL', 'OPEN', 'IN_PROGRESS', 'PANTAU', 'CLOSED'] as const).map(st => (
                  <button
                    key={st}
                    onClick={() => setStatusFilter(st)}
                    className={`px-2.5 py-1 rounded transition-all cursor-pointer text-xs ${
                      statusFilter === st ? 'bg-white shadow-2xs text-slate-900 font-semibold' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {st === 'ALL' ? 'Semua' : st}
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={() => {
                const today = new Date().toISOString().split('T')[0];
                setIsEditingExisting(false);
                setModalTab('FORM');
                setCurrentTicket({
                  id: `FU-${Date.now()}`,
                  status: 'OPEN',
                  akarMasalah: ROOT_CAUSE_PRESETS[0],
                  detailAkarMasalah: '',
                  actionPlan: '',
                  pic: PIC_PRESETS[0],
                  petugas: '',
                  tanggalUpdate: today,
                  targetSelesai: calculateTargetSelesai(today),
                  catatan: '',
                  history: []
                });
                setModalError(null);
                setIsModalOpen(true);
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-medium shadow-2xs transition-colors cursor-pointer"
            >
              <Plus size={14} />
              <span>+ Buat Tiket Baru</span>
            </button>
          </div>

          {/* Table */}
          <div className="bg-white border border-[#E5EAF2] rounded-lg shadow-2xs overflow-hidden">
            <StickyTableWrapper>
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-[#F8FAFC] text-slate-600 font-semibold uppercase text-[11px] tracking-wider border-b border-[#E5EAF2]">
                    <th className="py-2.5 px-4">ID Tiket</th>
                    <th className="py-2.5 px-4">WSID & Lokasi</th>
                    <th className="py-2.5 px-4">Baseline Problem</th>
                    <th className="py-2.5 px-4">Akar Masalah & Tindakan</th>
                    <th className="py-2.5 px-4">PIC / Vendor</th>
                    <th className="py-2.5 px-4">Jadwal Selesai</th>
                    <th className="py-2.5 px-4 text-center">Status</th>
                    <th className="py-2.5 px-4 text-center">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E5EAF2] text-slate-700">
                  {filteredTickets.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-10 text-center text-slate-400">
                        Belum ada tiket follow up yang tercatat. Klik tombol <strong>"+ Buat Tiket Baru"</strong> atau pilih dari tab <strong>Rekomendasi</strong>.
                      </td>
                    </tr>
                  ) : (
                    filteredTickets.map(ticket => {
                      const isPantau = ticket.status === 'PANTAU' || (ticket.status as string) === 'RESOLVED';
                      const statusColor = 
                        ticket.status === 'OPEN' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                        ticket.status === 'IN_PROGRESS' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                        isPantau ? 'bg-cyan-50 text-cyan-800 border-cyan-200' :
                        'bg-emerald-50 text-emerald-700 border-emerald-200';

                      return (
                        <tr key={ticket.id} className="hover:bg-slate-50/70 transition-colors">
                          <td className="py-2.5 px-4 font-mono font-medium text-slate-900">
                            {ticket.id}
                          </td>
                          <td className="py-2.5 px-4">
                            <div className="font-semibold text-slate-900">{ticket.wsid}</div>
                            <div className="text-[11px] text-slate-500 max-w-[200px] truncate">{ticket.lokasi}</div>
                          </td>
                          <td className="py-2.5 px-4">
                            <div className="font-medium text-slate-800">{ticket.kategoriProblem}</div>
                            <div className="text-[11px] text-slate-500">
                              Periode {ticket.periodeProblem} (Uptime {ticket.uptimeBaseline}%)
                            </div>
                          </td>
                          <td className="py-2.5 px-4">
                            <div className="font-medium text-slate-800 max-w-[250px] truncate">{ticket.akarMasalah}</div>
                            {ticket.detailAkarMasalah && (
                              <div className="text-[11px] text-slate-500 max-w-[250px] truncate italic">
                                {ticket.detailAkarMasalah}
                              </div>
                            )}
                            <div className="text-[11px] text-blue-600 max-w-[250px] truncate">{ticket.actionPlan}</div>
                            <div className="mt-1">
                              <button
                                type="button"
                                onClick={() => setSelectedHistoryTicket(ticket)}
                                className="inline-flex items-center gap-1 text-[10px] text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 px-2 py-0.5 rounded font-medium transition-colors cursor-pointer"
                                title="Lihat seluruh riwayat penanganan mesin ini"
                              >
                                <History size={11} className="text-blue-600" />
                                <span>{(ticket.history?.length || 1)} Catatan Riwayat</span>
                              </button>
                            </div>
                          </td>
                          <td className="py-2.5 px-4 font-medium text-slate-700">
                            {ticket.pic}
                          </td>
                          <td className="py-2.5 px-4">
                            <div className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-900">
                              <Calendar size={12} className="text-blue-600" />
                              <span>Target: {ticket.targetSelesai || '-'}</span>
                            </div>
                            <div className="text-[10px] text-slate-400 mt-0.5">
                              Update: {ticket.tanggalUpdate || (ticket.updatedAt ? ticket.updatedAt.slice(0, 10) : '-')}
                            </div>
                          </td>
                          <td className="py-2.5 px-4 text-center">
                            <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-semibold border ${statusColor}`}>
                              {isPantau ? 'PANTAU' : ticket.status}
                            </span>
                          </td>
                          <td className="py-2.5 px-4 text-center">
                            <div className="flex items-center justify-center gap-1.5">
                              <button
                                onClick={() => setSelectedHistoryTicket(ticket)}
                                className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors cursor-pointer"
                                title="Lihat Riwayat Penanganan WSID ini"
                              >
                                <History size={14} />
                              </button>
                              <button
                                onClick={() => handleEditTicket(ticket)}
                                className="p-1.5 text-slate-600 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors cursor-pointer"
                                title="Update / Tambah Tindakan"
                              >
                                <Edit3 size={14} />
                              </button>
                              <button
                                onClick={() => handleDeleteTicket(ticket.id)}
                                className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors cursor-pointer"
                                title="Hapus Tiket"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </StickyTableWrapper>
          </div>
        </div>
      )}

      {/* TAB 3: EVALUASI PERKEMBANGAN (BEFORE VS AFTER) */}
      {activeTab === 'EVALUATION' && (
        <div className="space-y-4">
          <div className="p-3.5 bg-blue-50/70 border border-blue-200 rounded-lg text-xs text-blue-900">
            <div className="flex items-center gap-1.5 font-semibold mb-1">
              <TrendingUp size={15} className="text-blue-600" />
              <span>Evaluasi Otomatis Performa Sebelum vs Sesudah Tindakan</span>
            </div>
            <p className="text-slate-600">
              Sistem secara otomatis membandingkan Uptime mesin saat tiket didaftarkan (Baseline) terhadap data Uptime bulan-bulan berikutnya yang sudah di-upload ke database.
            </p>
          </div>

          <div className="bg-white border border-[#E5EAF2] rounded-lg shadow-2xs overflow-hidden">
            <StickyTableWrapper>
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-[#F8FAFC] text-slate-600 font-semibold uppercase text-[11px] tracking-wider border-b border-[#E5EAF2]">
                    <th className="py-2.5 px-4">ID & WSID</th>
                    <th className="py-2.5 px-4">Lokasi & PIC</th>
                    <th className="py-2.5 px-4 text-center">Bulan Baseline (Before)</th>
                    <th className="py-2.5 px-4 text-center">Bulan Terkini (After)</th>
                    <th className="py-2.5 px-4 text-center">Selisih (+/- Δ%)</th>
                    <th className="py-2.5 px-4 text-center">Hasil Evaluasi</th>
                    <th className="py-2.5 px-4">Rekomendasi Lanjutan</th>
                    <th className="py-2.5 px-4 text-center">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E5EAF2] text-slate-700">
                  {evaluations.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-10 text-center text-slate-400">
                        Belum ada tiket follow up yang tercatat untuk dievaluasi.
                      </td>
                    </tr>
                  ) : (
                    evaluations.map(({ ticket, evaluation }) => {
                      const isUp = evaluation.deltaUptime > 0;
                      const isDown = evaluation.deltaUptime < 0;

                      return (
                        <tr key={ticket.id} className="hover:bg-slate-50/70 transition-colors">
                          <td className="py-2.5 px-4">
                            <div className="font-semibold text-slate-900">{ticket.wsid}</div>
                            <span className="font-mono text-[10px] text-slate-400">{ticket.id}</span>
                          </td>
                          <td className="py-2.5 px-4">
                            <div className="font-medium text-slate-800 max-w-[200px] truncate">{ticket.lokasi}</div>
                            <div className="text-[11px] text-slate-500">
                              PIC: {ticket.pic && ticket.pic !== '-' ? ticket.pic : 'Tim Support Internal'}
                              {ticket.petugas && <span className="text-[10px] text-slate-400"> ({ticket.petugas})</span>}
                            </div>
                          </td>
                          <td className="py-2.5 px-4 text-center">
                            <div className="font-semibold text-slate-800">{evaluation.baselineUptime.toFixed(2)}%</div>
                            <div className="text-[10px] text-slate-400">{evaluation.baselinePeriode}</div>
                          </td>
                          <td className="py-2.5 px-4 text-center">
                            {evaluation.evaluationStatus === 'PENDING_DATA' ? (
                              <span className="text-slate-400 italic text-[11px]">Menunggu Bulan Baru</span>
                            ) : (
                              <div>
                                <div className="font-semibold text-slate-900">{evaluation.latestUptime.toFixed(2)}%</div>
                                <div className="text-[10px] text-slate-400">{evaluation.latestPeriode}</div>
                              </div>
                            )}
                          </td>
                          <td className="py-2.5 px-4 text-center">
                            {evaluation.evaluationStatus === 'PENDING_DATA' ? (
                              <span className="text-slate-400">-</span>
                            ) : (
                              <span className={`inline-flex items-center gap-1 font-semibold text-xs px-2 py-0.5 rounded ${
                                isUp ? 'text-emerald-700 bg-emerald-50' : isDown ? 'text-rose-700 bg-rose-50' : 'text-slate-600 bg-slate-100'
                              }`}>
                                {isUp && <TrendingUp size={12} />}
                                {isDown && <TrendingDown size={12} />}
                                {evaluation.deltaUptime > 0 ? `+${evaluation.deltaUptime.toFixed(2)}%` : `${evaluation.deltaUptime.toFixed(2)}%`}
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 px-4 text-center">
                            <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-semibold ${
                              evaluation.statusColor === 'green' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' :
                              evaluation.statusColor === 'yellow' ? 'bg-amber-50 text-amber-800 border border-amber-200' :
                              evaluation.statusColor === 'red' ? 'bg-rose-50 text-rose-800 border border-rose-200' :
                              evaluation.statusColor === 'blue' ? 'bg-blue-50 text-blue-800 border border-blue-200' :
                              'bg-slate-100 text-slate-600 border border-slate-200'
                            }`}>
                              {evaluation.statusLabel}
                            </span>
                          </td>
                          <td className="py-2.5 px-4">
                            <p className="text-[11px] text-slate-600 max-w-[260px] leading-relaxed">
                              {evaluation.recommendationNote}
                            </p>
                          </td>
                          <td className="py-2.5 px-4 text-center">
                            <button
                              onClick={() => handleEditTicket(ticket)}
                              className="px-2.5 py-1 bg-white hover:bg-slate-50 text-slate-700 border border-[#E5EAF2] rounded-lg text-xs font-medium shadow-2xs transition-colors cursor-pointer"
                            >
                              Update
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </StickyTableWrapper>
          </div>
        </div>
      )}

      {/* CREATE / EDIT ACTION PLAN MODAL */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl relative max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between pb-4 mb-3 border-b border-slate-100 shrink-0">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-blue-100 text-blue-600 rounded-lg">
                  <ClipboardCheck size={20} />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-lg">
                    {isEditingExisting ? `Update Tindak Lanjut: ${currentTicket.wsid}` : 'Form Tindak Lanjut Mesin Baru'}
                  </h3>
                  <p className="text-xs text-slate-500">
                    {isEditingExisting ? `${currentTicket.lokasi || ''} • ID: ${currentTicket.id}` : `ID Tiket: ${currentTicket.id}`}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-700 p-1.5 rounded-lg hover:bg-slate-100 transition-all cursor-pointer"
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Tabs if Editing Existing Ticket */}
            {isEditingExisting && (
              <div className="flex border-b border-slate-200 mb-4 shrink-0">
                <button
                  type="button"
                  onClick={() => setModalTab('FORM')}
                  className={`px-4 py-2 text-xs font-bold border-b-2 cursor-pointer transition-all ${
                    modalTab === 'FORM'
                      ? 'border-blue-600 text-blue-600'
                      : 'border-transparent text-slate-400 hover:text-slate-700'
                  }`}
                >
                  📝 Input Tindakan Terkini
                </button>
                <button
                  type="button"
                  onClick={() => setModalTab('HISTORY')}
                  className={`px-4 py-2 text-xs font-bold border-b-2 cursor-pointer transition-all flex items-center gap-1.5 ${
                    modalTab === 'HISTORY'
                      ? 'border-blue-600 text-blue-600'
                      : 'border-transparent text-slate-400 hover:text-slate-700'
                  }`}
                >
                  <History size={13} />
                  <span>Riwayat Penanganan ({(currentTicket.history?.length || 1)})</span>
                </button>
              </div>
            )}

            {modalError && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-red-600 text-xs flex items-center gap-2 shrink-0">
                <AlertCircle size={16} />
                <span>{modalError}</span>
              </div>
            )}

            {/* Tab 1: Form Input */}
            {modalTab === 'FORM' ? (
              <div className="overflow-y-auto pr-1 flex-1">
                {/* Previous Action Callout Banner if Editing */}
                {isEditingExisting && currentTicket.history && currentTicket.history.length > 0 && (
                  <div className="mb-4 p-3 bg-blue-50/70 border border-blue-200 rounded-xl text-xs space-y-1">
                    <div className="flex items-center justify-between text-blue-900 font-bold">
                      <span>Tindakan Terakhir Sebelumnya:</span>
                      <span className="text-[10px] font-semibold text-blue-700 bg-white px-2 py-0.5 rounded border border-blue-200">
                        Update: {currentTicket.history[0]?.tanggal || currentTicket.tanggalUpdate}
                      </span>
                    </div>
                    <p className="text-slate-700 italic">
                      "{currentTicket.history[0]?.tindakan || currentTicket.actionPlan}"
                    </p>
                    <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500 pt-1 border-t border-blue-100">
                      <span>
                        PIC: <strong className="text-slate-700">{currentTicket.history[0]?.pic && currentTicket.history[0]?.pic !== '-' ? currentTicket.history[0].pic : (currentTicket.pic && currentTicket.pic !== '-' ? currentTicket.pic : 'Tim Support Internal')}</strong>
                      </span>
                      {(currentTicket.history[0]?.petugas || currentTicket.petugas) && (
                        <>
                          <span>•</span>
                          <span>
                            Petugas: <strong className="text-slate-700">{currentTicket.history[0]?.petugas || currentTicket.petugas}</strong>
                          </span>
                        </>
                      )}
                      <span>•</span>
                      <span>Status: <strong className="text-slate-700">{currentTicket.history[0]?.status || currentTicket.status}</strong></span>
                      {currentTicket.history[0]?.catatan && (
                        <>
                          <span>•</span>
                          <span className="truncate max-w-[200px]">Catatan: {currentTicket.history[0].catatan}</span>
                        </>
                      )}
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-medium text-slate-700 mb-4">
                  {/* WSID */}
                  <div>
                    <label className="block text-slate-600 mb-1">WSID Mesin</label>
                    <input
                      type="text"
                      value={currentTicket.wsid || ''}
                      onChange={e => setCurrentTicket({ ...currentTicket, wsid: e.target.value })}
                      placeholder="Misal: 309R"
                      disabled={isEditingExisting}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-900 font-bold focus:bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none disabled:bg-slate-100 disabled:text-slate-500"
                    />
                  </div>

                  {/* Lokasi */}
                  <div>
                    <label className="block text-slate-600 mb-1">Nama Lokasi</label>
                    <input
                      type="text"
                      value={currentTicket.lokasi || ''}
                      onChange={e => setCurrentTicket({ ...currentTicket, lokasi: e.target.value })}
                      placeholder="Lokasi Mesin"
                      disabled={isEditingExisting}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-900 focus:bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none disabled:bg-slate-100 disabled:text-slate-500"
                    />
                  </div>

                  {/* Periode Baseline & Uptime */}
                  <div>
                    <label className="block text-slate-600 mb-1">Bulan Deteksi Masalah (Baseline)</label>
                    <input
                      type="text"
                      value={currentTicket.periodeProblem || ''}
                      onChange={e => setCurrentTicket({ ...currentTicket, periodeProblem: e.target.value })}
                      placeholder="2026-07"
                      disabled={isEditingExisting}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-900 focus:bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none disabled:bg-slate-100 disabled:text-slate-500"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-600 mb-1">Uptime Awal Baseline (%)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={currentTicket.uptimeBaseline ?? ''}
                      onChange={e => setCurrentTicket({ ...currentTicket, uptimeBaseline: Number(e.target.value) })}
                      placeholder="94.20"
                      disabled={isEditingExisting}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-900 font-bold focus:bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none disabled:bg-slate-100 disabled:text-slate-500"
                    />
                  </div>

                  {/* Problem Dominan */}
                  <div className="md:col-span-2">
                    <label className="block text-slate-600 mb-1">Kategori / Problem Dominan</label>
                    <input
                      type="text"
                      value={currentTicket.kategoriProblem || ''}
                      onChange={e => setCurrentTicket({ ...currentTicket, kategoriProblem: e.target.value })}
                      placeholder="Misal: Hardware P02 Presenter / Uang Habis CIT"
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-900 focus:bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    />
                  </div>

                  {/* Akar Masalah (Root Cause) */}
                  <div className="md:col-span-2 space-y-2">
                    <SuggestCombobox
                      label="Akar Masalah (Root Cause)"
                      helperBadge="Pilih atau ketik langsung (Auto-suggest)"
                      value={currentTicket.akarMasalah || ''}
                      onChange={val => setCurrentTicket({ ...currentTicket, akarMasalah: val })}
                      options={ROOT_CAUSE_PRESETS}
                      placeholder="Pilih atau ketik kategori akar masalah..."
                    />
                    <div>
                      <label className="block text-slate-500 mb-1 text-[11px] font-medium">
                        Rincian / Catatan Detail Masalah {currentTicket.akarMasalah === 'Lainnya (Input Manual)' ? '(Disarankan Diisi)' : '(Opsional)'}
                      </label>
                      <textarea
                        rows={2}
                        value={currentTicket.detailAkarMasalah || ''}
                        onChange={e => setCurrentTicket({ ...currentTicket, detailAkarMasalah: e.target.value })}
                        placeholder="Tuliskan rincian atau catatan spesifik mengenai akar masalah mesin ini..."
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-900 focus:bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none text-xs"
                      />
                    </div>
                  </div>

                  {/* Tindakan (Action) */}
                  <div className="md:col-span-2">
                    <label className="block text-slate-600 mb-1 font-bold text-blue-700 text-xs">
                      {isEditingExisting ? 'Tindakan (Action) Terkini / Update Penanganan' : 'Tindakan (Action)'}
                    </label>
                    <textarea
                      rows={2}
                      value={currentTicket.actionPlan || ''}
                      onChange={e => setCurrentTicket({ ...currentTicket, actionPlan: e.target.value })}
                      placeholder="Tuliskan tindakan nyata yang sedang atau sudah dilakukan (misal: penggantian modul sensor, part baru dipasang, dsb.)..."
                      className="w-full bg-blue-50/50 border border-blue-200 rounded-lg px-3 py-2 text-slate-900 focus:bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none font-medium text-xs"
                    />
                  </div>

                  {/* PIC / Vendor */}
                  <div>
                    <SuggestCombobox
                      label="PIC / Vendor Penanggung Jawab"
                      helperBadge="Dropdown & Auto-suggest"
                      value={currentTicket.pic || ''}
                      onChange={val => setCurrentTicket({ ...currentTicket, pic: val })}
                      options={PIC_PRESETS}
                      placeholder="Pilih vendor atau ketik tim penanggung jawab..."
                    />
                  </div>

                  {/* Nama Petugas / Penginput Update */}
                  <div>
                    <label className="block text-slate-600 mb-1 font-semibold text-xs flex items-center justify-between">
                      <span>Nama Petugas / Penginput Update</span>
                      <span className="text-[10px] text-slate-400">Opsional</span>
                    </label>
                    <input
                      type="text"
                      value={currentTicket.petugas || ''}
                      onChange={e => setCurrentTicket({ ...currentTicket, petugas: e.target.value })}
                      placeholder="Nama staf / personil yang mencatat update..."
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-900 focus:bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none text-xs font-medium"
                    />
                  </div>

                  {/* Status */}
                  <div>
                    <label className="block text-slate-600 mb-1 font-bold text-xs">Status Tindak Lanjut</label>
                    <select
                      value={(currentTicket.status as any) === 'RESOLVED' ? 'PANTAU' : (currentTicket.status || 'OPEN')}
                      onChange={e => setCurrentTicket({ ...currentTicket, status: e.target.value as any })}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-900 font-bold focus:bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none text-xs"
                    >
                      <option value="OPEN">OPEN (Baru terdaftar)</option>
                      <option value="IN_PROGRESS">IN PROGRESS (Sedang dikerjakan)</option>
                      <option value="PANTAU">PANTAU (Tindakan selesai, pantau performa WSID)</option>
                      <option value="CLOSED">CLOSED (Performa terbukti membaik & SLA tercapai)</option>
                    </select>
                  </div>

                  {/* Tanggal Update Tiket */}
                  <div>
                    <label className="block text-slate-600 mb-1 font-semibold flex items-center justify-between text-xs">
                      <span>Tanggal Update Tiket</span>
                      <span className="text-[10px] text-slate-400">Default: Hari Ini</span>
                    </label>
                    <input
                      type="date"
                      value={currentTicket.tanggalUpdate || new Date().toISOString().split('T')[0]}
                      onChange={e => {
                        const newUpdateDate = e.target.value;
                        const autoTarget = calculateTargetSelesai(newUpdateDate);
                        setCurrentTicket({
                          ...currentTicket,
                          tanggalUpdate: newUpdateDate,
                          targetSelesai: autoTarget
                        });
                      }}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-900 focus:bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none text-xs font-medium"
                    />
                  </div>

                  {/* Target Tanggal Selesai */}
                  <div className="md:col-span-2">
                    <label className="block text-slate-600 mb-1 font-semibold flex items-center justify-between text-xs">
                      <span>Target Tanggal Selesai</span>
                      <span className="text-[10px] text-blue-600 font-bold bg-blue-50 px-1.5 py-0.5 rounded">
                        Otomatis +1 Minggu
                      </span>
                    </label>
                    <input
                      type="date"
                      value={currentTicket.targetSelesai || calculateTargetSelesai(currentTicket.tanggalUpdate || new Date().toISOString().split('T')[0])}
                      onChange={e => setCurrentTicket({ ...currentTicket, targetSelesai: e.target.value })}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-900 focus:bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none text-xs font-bold"
                    />
                    <p className="text-[10px] text-slate-400 mt-1">
                      Sistem otomatis menetapkan target 1 minggu (7 hari) ke depan sejak tanggal update tiket.
                    </p>
                  </div>

                  {/* Catatan Lapangan */}
                  <div className="md:col-span-2">
                    <label className="block text-slate-600 mb-1">Catatan Tambahan / Log Perkembangan</label>
                    <textarea
                      rows={2}
                      value={currentTicket.catatan || ''}
                      onChange={e => setCurrentTicket({ ...currentTicket, catatan: e.target.value })}
                      placeholder="Catatan update berkala mengenai apa yang sudah dilakukan..."
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-900 focus:bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    />
                  </div>
                </div>
              </div>
            ) : (
              /* Tab 2: Riwayat Penanganan Timeline */
              <div className="overflow-y-auto pr-2 space-y-4 flex-1 text-xs py-2">
                <div className="font-bold text-slate-800 flex items-center justify-between pb-1 border-b border-slate-100">
                  <span>Timeline Tindakan pada Tiket Ini:</span>
                  <span className="text-[11px] text-slate-400 font-normal">Urutan terbaru di atas</span>
                </div>

                <div className="space-y-4 pt-1">
                  {(!currentTicket.history || currentTicket.history.length === 0) ? (
                    <div className="py-8 text-center text-slate-400">
                      Belum ada catatan riwayat tindakan sebelumnya.
                    </div>
                  ) : (
                    currentTicket.history.map((h, idx, arr) => {
                      const isPantau = h.status === 'PANTAU' || (h.status as string) === 'RESOLVED';
                      const statusBadgeClass =
                        h.status === 'OPEN' ? 'bg-amber-100 text-amber-800 border-amber-300' :
                        h.status === 'IN_PROGRESS' ? 'bg-blue-100 text-blue-800 border-blue-300' :
                        isPantau ? 'bg-cyan-100 text-cyan-800 border-cyan-300' :
                        'bg-emerald-100 text-emerald-800 border-emerald-300';

                      return (
                        <div key={h.id || idx} className="relative pl-6 pb-4 border-l-2 border-blue-200 last:border-transparent last:pb-0">
                          <div className="absolute -left-[9px] top-0 w-4 h-4 rounded-full bg-white border-2 border-blue-600 flex items-center justify-center">
                            <span className="w-1.5 h-1.5 rounded-full bg-blue-600"></span>
                          </div>

                          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 shadow-xs space-y-1.5">
                            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/60 pb-1.5">
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-slate-900">{h.tanggal || '-'}</span>
                                <span className="text-[10px] text-slate-400">Update #{arr.length - idx}</span>
                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${statusBadgeClass}`}>
                                  {isPantau ? 'PANTAU' : h.status}
                                </span>
                              </div>
                              <div className="flex flex-wrap items-center gap-1.5 text-[11px] bg-white px-2 py-0.5 rounded border border-slate-200">
                                <span className="text-slate-600 font-semibold">
                                  PIC: {h.pic && h.pic !== '-' ? h.pic : 'Tim Support Internal'}
                                </span>
                                {h.petugas && (
                                  <span className="text-slate-500 font-normal border-l border-slate-200 pl-1.5">
                                    Petugas: <strong className="font-semibold text-slate-700">{h.petugas}</strong>
                                  </span>
                                )}
                              </div>
                            </div>

                            <div>
                              <div className="text-[11px] font-bold text-slate-500">Tindakan / Action:</div>
                              <div className="text-slate-800 font-medium whitespace-pre-wrap">{h.tindakan}</div>
                            </div>

                            {h.akarMasalah && (
                              <div className="text-[11px] text-slate-600">
                                <span className="text-slate-400">Akar Masalah:</span>{' '}
                                <span className="font-semibold text-slate-800">{h.akarMasalah}</span>
                                {h.detailAkarMasalah && <span className="italic text-slate-500"> - {h.detailAkarMasalah}</span>}
                              </div>
                            )}

                            {h.targetSelesai && (
                              <div className="text-[10px] text-slate-400 flex items-center gap-1">
                                <Calendar size={11} className="text-blue-500" />
                                <span>Target: {h.targetSelesai}</span>
                              </div>
                            )}

                            {h.catatan && (
                              <div className="text-[11px] text-slate-600 bg-white p-2 rounded border border-slate-200 italic">
                                <span className="font-semibold not-italic text-slate-500">Catatan:</span> {h.catatan}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}

            {/* Modal Actions */}
            <div className="flex items-center justify-between gap-3 pt-4 border-t border-slate-100 shrink-0">
              {isEditingExisting && modalTab === 'HISTORY' ? (
                <button
                  type="button"
                  onClick={() => setModalTab('FORM')}
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-all cursor-pointer"
                >
                  <span>📝 Kembali ke Form Input Tindakan</span>
                </button>
              ) : (
                <div />
              )}

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition-all cursor-pointer"
                >
                  Batal
                </button>

                <button
                  type="button"
                  onClick={handleSaveTicket}
                  disabled={isSaving}
                  className="inline-flex items-center gap-2 px-6 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold shadow-md shadow-slate-900/20 disabled:opacity-50 transition-all cursor-pointer"
                >
                  {isSaving ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      <span>Menyimpan ke Spreadsheet...</span>
                    </>
                  ) : (
                    <span>{isEditingExisting ? 'Simpan Update Tindakan' : 'Simpan Tiket Baru'}</span>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL RIWAYAT PENANGANAN LENGKAP WSID */}
      {selectedHistoryTicket && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl relative max-h-[90vh] flex flex-col">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-4 mb-4 border-b border-slate-100 shrink-0">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-blue-100 text-blue-600 rounded-lg">
                  <History size={22} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-slate-900 text-lg">
                      Riwayat Penanganan WSID: {selectedHistoryTicket.wsid}
                    </h3>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                      selectedHistoryTicket.status === 'OPEN' ? 'bg-amber-100 text-amber-800 border-amber-300' :
                      selectedHistoryTicket.status === 'IN_PROGRESS' ? 'bg-blue-100 text-blue-800 border-blue-300' :
                      (selectedHistoryTicket.status === 'PANTAU' || (selectedHistoryTicket.status as string) === 'RESOLVED') ? 'bg-cyan-100 text-cyan-800 border-cyan-300' :
                      'bg-emerald-100 text-emerald-800 border-emerald-300'
                    }`}>
                      {(selectedHistoryTicket.status === 'PANTAU' || (selectedHistoryTicket.status as string) === 'RESOLVED') ? 'PANTAU' : selectedHistoryTicket.status}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500">
                    {selectedHistoryTicket.lokasi} • Sektor {selectedHistoryTicket.sektor || '-'} • Vendor {selectedHistoryTicket.vendor || '-'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelectedHistoryTicket(null)}
                className="text-slate-400 hover:text-slate-700 p-1.5 rounded-lg hover:bg-slate-100 transition-all cursor-pointer"
              >
                <X size={20} />
              </button>
            </div>

            {/* Content Body: Timeline */}
            <div className="overflow-y-auto pr-2 space-y-4 flex-1 text-xs">
              {/* Summary Cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 bg-slate-50 p-3 rounded-xl border border-slate-200 text-center">
                <div>
                  <div className="text-[10px] text-slate-400 font-semibold uppercase">Periode Problem</div>
                  <div className="font-bold text-slate-800">{selectedHistoryTicket.periodeProblem || '-'}</div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-400 font-semibold uppercase">Uptime Baseline</div>
                  <div className="font-bold text-slate-800">{selectedHistoryTicket.uptimeBaseline}%</div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-400 font-semibold uppercase">PIC Terkini</div>
                  <div className="font-bold text-slate-800 truncate">{selectedHistoryTicket.pic || '-'}</div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-400 font-semibold uppercase">Total Riwayat</div>
                  <div className="font-bold text-blue-600">
                    {selectedHistoryTicket.history?.length || 1} Update
                  </div>
                </div>
              </div>

              <div className="font-bold text-slate-800 flex items-center justify-between pt-1">
                <span>Timeline Penanganan ({selectedHistoryTicket.wsid}):</span>
                <span className="text-[11px] text-slate-400 font-normal">Urutan terbaru di atas</span>
              </div>

              {/* Timeline List */}
              <div className="space-y-4 pt-1">
                {(selectedHistoryTicket.history && selectedHistoryTicket.history.length > 0 ? selectedHistoryTicket.history : [{
                  id: `HIST-${selectedHistoryTicket.id}-0`,
                  tanggal: selectedHistoryTicket.tanggalUpdate || (selectedHistoryTicket.updatedAt ? selectedHistoryTicket.updatedAt.slice(0, 10) : '-'),
                  status: selectedHistoryTicket.status,
                  tindakan: selectedHistoryTicket.actionPlan,
                  pic: selectedHistoryTicket.pic,
                  akarMasalah: selectedHistoryTicket.akarMasalah,
                  detailAkarMasalah: selectedHistoryTicket.detailAkarMasalah,
                  catatan: selectedHistoryTicket.catatan,
                  targetSelesai: selectedHistoryTicket.targetSelesai
                }]).map((h, idx, arr) => {
                  const isPantau = h.status === 'PANTAU' || (h.status as string) === 'RESOLVED';
                  const statusBadgeClass =
                    h.status === 'OPEN' ? 'bg-amber-100 text-amber-800 border-amber-300' :
                    h.status === 'IN_PROGRESS' ? 'bg-blue-100 text-blue-800 border-blue-300' :
                    isPantau ? 'bg-cyan-100 text-cyan-800 border-cyan-300' :
                    'bg-emerald-100 text-emerald-800 border-emerald-300';

                  return (
                    <div key={h.id || idx} className="relative pl-6 pb-4 border-l-2 border-blue-200 last:border-transparent last:pb-0">
                      <div className="absolute -left-[9px] top-0 w-4 h-4 rounded-full bg-white border-2 border-blue-600 flex items-center justify-center">
                        <span className="w-1.5 h-1.5 rounded-full bg-blue-600"></span>
                      </div>

                      <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 shadow-xs space-y-1.5">
                        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/60 pb-1.5">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-900">{h.tanggal || '-'}</span>
                            <span className="text-[10px] text-slate-400">Update #{arr.length - idx}</span>
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${statusBadgeClass}`}>
                              {isPantau ? 'PANTAU' : h.status}
                            </span>
                          </div>
                          <div className="flex flex-wrap items-center gap-1.5 text-[11px] bg-white px-2 py-0.5 rounded border border-slate-200">
                            <span className="text-slate-600 font-semibold">
                              PIC: {h.pic && h.pic !== '-' ? h.pic : 'Tim Support Internal'}
                            </span>
                            {h.petugas && (
                              <span className="text-slate-500 font-normal border-l border-slate-200 pl-1.5">
                                Petugas: <strong className="font-semibold text-slate-700">{h.petugas}</strong>
                              </span>
                            )}
                          </div>
                        </div>

                        <div>
                          <div className="text-[11px] font-bold text-slate-500">Tindakan / Action:</div>
                          <div className="text-slate-800 font-medium whitespace-pre-wrap">{h.tindakan}</div>
                        </div>

                        {h.akarMasalah && (
                          <div className="text-[11px] text-slate-600">
                            <span className="text-slate-400">Akar Masalah:</span>{' '}
                            <span className="font-semibold text-slate-800">{h.akarMasalah}</span>
                            {h.detailAkarMasalah && <span className="italic text-slate-500"> - {h.detailAkarMasalah}</span>}
                          </div>
                        )}

                        {h.targetSelesai && (
                          <div className="text-[10px] text-slate-400 flex items-center gap-1">
                            <Calendar size={11} className="text-blue-500" />
                            <span>Target: {h.targetSelesai}</span>
                          </div>
                        )}

                        {h.catatan && (
                          <div className="text-[11px] text-slate-600 bg-white p-2 rounded border border-slate-200 italic">
                            <span className="font-semibold not-italic text-slate-500">Catatan:</span> {h.catatan}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-between gap-3 pt-4 border-t border-slate-100 shrink-0 mt-4">
              <button
                type="button"
                onClick={() => {
                  const targetTicket = selectedHistoryTicket;
                  setSelectedHistoryTicket(null);
                  handleEditTicket(targetTicket);
                }}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-sm transition-all cursor-pointer"
              >
                <Plus size={14} />
                <span>+ Update Tindakan Baru</span>
              </button>

              <button
                type="button"
                onClick={() => setSelectedHistoryTicket(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition-all cursor-pointer"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
