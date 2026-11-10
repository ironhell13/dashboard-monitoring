import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import {
  Ticket,
  Clock,
  CheckCircle2,
  AlertOctagon,
  ShieldCheck,
  Search,
  Filter,
  Download,
  Plus,
  Send,
  MessageSquare,
  History,
  X,
  Check,
  RotateCcw,
  Trash2,
  Copy,
  ExternalLink,
  ChevronRight,
  Flame,
  Building2,
  MapPin,
  Cpu,
  User,
  Wrench,
  AlertTriangle,
  RefreshCw,
  Share2
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { useDataStore } from '../store/useDataStore';
import {
  type FollowUpTicketItem,
  fetchFollowUpTicketsModern,
  saveFollowUpTicketModern,
  deleteFollowUpTicketModern
} from '../utils/spreadsheetService';
import { cleanSektorName, getServicePointForSektor, TARGET_EVENT_CODES } from '../utils/dailyIncidentParser';
import { useQuickChips } from '../utils/quickChipsService';
import { subscribeFollowUpTicketsSupabase, getMachinesMap, getMachineMetadata } from '../utils/supabaseService';
import { getFollowUpRecommendations, type FollowUpRecommendation } from '../utils/followUpEngine';

interface FollowUpPageProps {
  userRole?: 'KAWIL' | 'KAOPS' | 'MONITORING';
  isEmbedded?: boolean;
}

const DEFAULT_SERVICE_POINTS = ['ACJK', 'ACBT', 'ACCK', 'ACSR', 'ACBS', 'ACRW', 'TAG'];

export default function FollowUpPage({ userRole, isEmbedded = false }: FollowUpPageProps) {
  const location = useLocation();
  const navState = (location.state || {}) as {
    categoryFilter?: string;
    categoryLabel?: string;
    priorityFilter?: string;
    categoryWsids?: string[];
  };

  const {
    modernTickets,
    setModernTickets,
    addOrUpdateModernTicket,
    removeModernTicket,
    rawMasterData,
    machines,
    selectedPeriode
  } = useDataStore();

  const [activeCategoryFilter, setActiveCategoryFilter] = useState<string | null>(navState.categoryFilter || null);
  const [activeCategoryLabel, setActiveCategoryLabel] = useState<string | null>(navState.categoryLabel || null);
  const [activeCategoryWsids, setActiveCategoryWsids] = useState<string[] | null>(navState.categoryWsids || null);

  const [mainSectionTab, setMainSectionTab] = useState<'RECOMMENDATIONS' | 'TICKETS'>(() => {
    return navState.categoryFilter || navState.categoryWsids ? 'RECOMMENDATIONS' : 'TICKETS';
  });

  useEffect(() => {
    if (navState.categoryFilter || navState.categoryWsids) {
      setActiveCategoryFilter(navState.categoryFilter || null);
      setActiveCategoryLabel(navState.categoryLabel || null);
      setActiveCategoryWsids(navState.categoryWsids || null);
      setMainSectionTab('RECOMMENDATIONS');
    }
  }, [location.state]);

  const [createPeriodeProblem, setCreatePeriodeProblem] = useState<string>('');
  const [createUptimeBaseline, setCreateUptimeBaseline] = useState<number | undefined>(undefined);
  const [createSumberProblem, setCreateSumberProblem] = useState<'OPEN_INCIDENT' | 'FREKUENSI' | 'ANALISIS' | 'CHRONIC_SLA'>('ANALISIS');

  // Rekomendasi SLA BCA & Chronic dari followUpEngine
  const allRecommendations = useMemo(() => {
    return getFollowUpRecommendations(machines || [], selectedPeriode || 'ALL');
  }, [machines, selectedPeriode]);

  const [onlyChronicFilter, setOnlyChronicFilter] = useState(false);
  const [recSearch, setRecSearch] = useState('');
  const [recPriorityFilter, setRecPriorityFilter] = useState<'ALL' | 'CRITICAL' | 'WARNING'>('ALL');

  const filteredRecommendations = useMemo(() => {
    let list = allRecommendations;

    if (activeCategoryWsids && activeCategoryWsids.length > 0) {
      const wsidSet = new Set(activeCategoryWsids.map((w) => w.trim().toUpperCase()));
      list = list.filter((r) => wsidSet.has(r.wsid.trim().toUpperCase()));
    }

    if (onlyChronicFilter) {
      list = list.filter((r) => r.isChronic);
    }

    if (recPriorityFilter !== 'ALL') {
      list = list.filter((r) => r.priority === recPriorityFilter);
    }

    if (recSearch.trim()) {
      const q = recSearch.trim().toLowerCase();
      list = list.filter(
        (r) =>
          r.wsid.toLowerCase().includes(q) ||
          r.lokasi.toLowerCase().includes(q) ||
          r.sektor.toLowerCase().includes(q) ||
          r.vendor.toLowerCase().includes(q) ||
          r.dominantProblem.toLowerCase().includes(q) ||
          (r.priorityReason && r.priorityReason.toLowerCase().includes(q))
      );
    }

    return list;
  }, [allRecommendations, activeCategoryWsids, onlyChronicFilter, recPriorityFilter, recSearch]);

  const activeTicketMap = useMemo(() => {
    const map = new Map<string, FollowUpTicketItem>();
    for (const t of modernTickets || []) {
      if (t.status !== 'CLOSED') {
        map.set(t.wsid.trim().toUpperCase(), t);
      }
    }
    return map;
  }, [modernTickets]);

  const { chipTexts: progressChips } = useQuickChips('PROGRESS_TIKET');
  const { chipTexts: instruksiChips } = useQuickChips('INSTRUKSI_REQUEST');

  // Role detection
  const effectiveRole = useMemo(() => {
    if (userRole) return userRole;
    if (sessionStorage.getItem('KAWIL_TOKEN')) return 'KAWIL';
    if (sessionStorage.getItem('KAOPS_TOKEN')) return 'KAOPS';
    return 'KAOPS';
  }, [userRole]);

  const isSupervisorRole = effectiveRole === 'KAWIL' || effectiveRole === 'KAOPS';

  // State Petugas Signature (sinkron dengan sesi Monitoring & Ka Ops)
  const [petugasName, setPetugasName] = useState(() => {
    try {
      const saved = localStorage.getItem('MONITORING_PETUGAS_NAME') || sessionStorage.getItem('PETUGAS_NAME');
      if (saved) return saved;
    } catch (e) {}
    if (effectiveRole === 'KAWIL') return 'Ka Wil';
    if (effectiveRole === 'KAOPS') return 'Ka Ops';
    return '';
  });
  const [showPetugasModal, setShowPetugasModal] = useState(false);
  const [tempPetugasName, setTempPetugasName] = useState('');

  // Ticker Live Timer
  const [liveTicker, setLiveTicker] = useState(0);
  useEffect(() => {
    const iv = setInterval(() => setLiveTicker((t) => t + 1), 60000);
    return () => clearInterval(iv);
  }, []);

  // Filter States
  const [selectedSp, setSelectedSp] = useState<string>('ALL');
  const [statusTab, setStatusTab] = useState<'ALL' | 'ACTION_NEEDED' | 'RE_OPEN' | 'WAITING_VALIDATION' | 'CLOSED'>('ALL');
  const [priorityFilter, setPriorityFilter] = useState<'ALL' | 'URGENT' | 'HIGH' | 'NORMAL'>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Modals State
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createWsid, setCreateWsid] = useState('');
  const [createLokasi, setCreateLokasi] = useState('');
  const [createSp, setCreateSp] = useState('ACJK');
  const [createSektor, setCreateSektor] = useState('');
  const [createVendor, setCreateVendor] = useState('Diebold Nixdorf');
  const [createProblem, setCreateProblem] = useState('');
  const [createPriority, setCreatePriority] = useState<'NORMAL' | 'HIGH' | 'URGENT'>('NORMAL');
  const [createCategory, setCreateCategory] = useState<'VENDOR' | 'FLM' | 'SLM' | 'CABANG' | 'JALUR'>('VENDOR');
  const [createNote, setCreateNote] = useState('');
  const [isSubmittingCreate, setIsSubmittingCreate] = useState(false);
  const [showWsidSuggestions, setShowWsidSuggestions] = useState(false);
  const [showProblemSuggestions, setShowProblemSuggestions] = useState(false);
  const wsidBoxRef = useRef<HTMLDivElement>(null);
  const problemBoxRef = useRef<HTMLDivElement>(null);

  // Modal Detail / Progress / Req Close / Validation
  const [activeTicket, setActiveTicket] = useState<FollowUpTicketItem | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);

  const [showProgressModal, setShowProgressModal] = useState(false);
  const [progressText, setProgressText] = useState('');
  const [isSavingProgress, setIsSavingProgress] = useState(false);

  const [showReqCloseModal, setShowReqCloseModal] = useState(false);
  const [reqCloseCatatan, setReqCloseCatatan] = useState('');
  const [reqCloseStatusMesin, setReqCloseStatusMesin] = useState('Mesin Normal / Problem Teratasi');
  const [isSubmittingReqClose, setIsSubmittingReqClose] = useState(false);

  const [showValidationModal, setShowValidationModal] = useState(false);
  const [validationDecision, setValidationDecision] = useState<'CLOSED' | 'RE_OPEN'>('CLOSED');
  const [validationReopenReason, setValidationReopenReason] = useState('');
  const [validationCatatanApproval, setValidationCatatanApproval] = useState('');
  const [isSubmittingValidation, setIsSubmittingValidation] = useState(false);

  // Helper format durasi tiket
  const formatTicketDuration = (createdAt: string, durasiMenitFinal?: number) => {
    if (typeof durasiMenitFinal === 'number' && durasiMenitFinal >= 0) {
      const h = Math.floor(durasiMenitFinal / 60);
      const m = durasiMenitFinal % 60;
      return h > 0 ? `${h}j ${m}m` : `${m}m`;
    }
    const ms = Date.now() - new Date(createdAt).getTime();
    if (ms < 0) return '0m';
    const totalMinutes = Math.floor(ms / 60000);
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    return h > 0 ? `${h}j ${m}m` : `${m}m`;
  };

  // Helper daftar Service Point unik
  const availableServicePoints = useMemo(() => {
    const set = new Set<string>(DEFAULT_SERVICE_POINTS);
    modernTickets.forEach((t) => {
      const sp = (t.servicePoint || '').trim().toUpperCase();
      if (sp && sp !== '-' && sp !== 'N/A') set.add(sp);
    });
    return Array.from(set).sort();
  }, [modernTickets]);

  // Filter Data
  const filteredTickets = useMemo(() => {
    let list = modernTickets || [];

    // Filter Service Point
    if (selectedSp !== 'ALL') {
      const targetSp = selectedSp.toUpperCase();
      list = list.filter((t) => {
        const sp = (t.servicePoint || '').trim().toUpperCase();
        return sp.includes(targetSp);
      });
    }

    // Filter Status Tab
    if (statusTab === 'ACTION_NEEDED') {
      list = list.filter((t) => t.status === 'OPEN' || t.status === 'IN_PROGRESS' || t.status === 'RE_OPEN');
    } else if (statusTab === 'RE_OPEN') {
      list = list.filter((t) => t.status === 'RE_OPEN');
    } else if (statusTab === 'WAITING_VALIDATION') {
      list = list.filter((t) => t.status === 'REQ_CLOSE');
    } else if (statusTab === 'CLOSED') {
      list = list.filter((t) => t.status === 'CLOSED');
    }

    // Filter Priority
    if (priorityFilter !== 'ALL') {
      list = list.filter((t) => t.prioritas === priorityFilter);
    }

    // Search Box
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter(
        (t) =>
          (t.ticketId || '').toLowerCase().includes(q) ||
          (t.wsid || '').toLowerCase().includes(q) ||
          (t.lokasi || '').toLowerCase().includes(q) ||
          (t.sektor || '').toLowerCase().includes(q) ||
          (t.servicePoint || '').toLowerCase().includes(q) ||
          (t.problem || '').toLowerCase().includes(q) ||
          (t.catatanRequest || '').toLowerCase().includes(q) ||
          (t.createdBy || '').toLowerCase().includes(q)
      );
    }

    // Sort order: RE_OPEN first, then REQ_CLOSE, OPEN, IN_PROGRESS, CLOSED
    return [...list].sort((a, b) => {
      const weight = (s: string) => {
        if (s === 'RE_OPEN') return 1;
        if (s === 'REQ_CLOSE') return 2;
        if (s === 'OPEN') return 3;
        if (s === 'IN_PROGRESS') return 4;
        return 5;
      };
      const wa = weight(a.status);
      const wb = weight(b.status);
      if (wa !== wb) return wa - wb;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }, [modernTickets, selectedSp, statusTab, priorityFilter, searchQuery, liveTicker]);

  // KPI Counters
  const countActionNeeded = useMemo(() => {
    return (modernTickets || []).filter((t) => t.status === 'OPEN' || t.status === 'IN_PROGRESS' || t.status === 'RE_OPEN').length;
  }, [modernTickets]);

  const countWaitingValidation = useMemo(() => {
    return (modernTickets || []).filter((t) => t.status === 'REQ_CLOSE').length;
  }, [modernTickets]);

  const countClosed = useMemo(() => {
    return (modernTickets || []).filter((t) => t.status === 'CLOSED').length;
  }, [modernTickets]);

  const countReOpen = useMemo(() => {
    return (modernTickets || []).filter((t) => t.status === 'RE_OPEN').length;
  }, [modernTickets]);

  // Petugas validation
  const ensurePetugas = (): boolean => {
    if (!petugasName.trim()) {
      setShowPetugasModal(true);
      return false;
    }
    return true;
  };

  const handleSavePetugasName = () => {
    if (tempPetugasName.trim()) {
      setPetugasName(tempPetugasName.trim());
      sessionStorage.setItem('PETUGAS_NAME', tempPetugasName.trim());
      localStorage.setItem('MONITORING_PETUGAS_NAME', tempPetugasName.trim());
      setShowPetugasModal(false);
    }
  };

  const handleRefreshTickets = async () => {
    setIsRefreshing(true);
    try {
      const res = await fetchFollowUpTicketsModern();
      if (res.success && res.tickets) {
        setModernTickets(res.tickets);
        setToastMessage('Data tiket berhasil dimutakhirkan dari cloud.');
        setTimeout(() => setToastMessage(null), 3000);
      }
    } catch (e: any) {
      alert('Gagal memuat ulang tiket: ' + (e?.message || e));
    } finally {
      setIsRefreshing(false);
    }
  };

  // Realtime Supabase Subscription & Initial Load
  useEffect(() => {
    handleRefreshTickets();
    const unsub = subscribeFollowUpTicketsSupabase(() => {
      handleRefreshTickets();
    });
    return () => {
      unsub();
    };
  }, []);

  // Catalog seluruh 2.043 mesin BCA untuk instant autocomplete & auto-fill
  const machinesCatalogList = useMemo(() => {
    const list: Array<{
      wsid: string;
      lokasi: string;
      servicePoint: string;
      sektor: string;
      vendor: string;
      tipeMesin: string;
    }> = [];

    try {
      const map = getMachinesMap();
      map.forEach((m, k) => {
        const rawSek = m.sektor_bca || m.sektor || '-';
        const cleanSek = rawSek !== '-' ? cleanSektorName(rawSek) : '-';
        const sp = m.service_point || getServicePointForSektor(cleanSek) || 'ACJK';
        list.push({
          wsid: k,
          lokasi: m.lokasi || '-',
          servicePoint: sp,
          sektor: cleanSek,
          vendor: (m.vendor && m.vendor !== '-') ? m.vendor : 'Diebold Nixdorf',
          tipeMesin: m.tipe_mesin || '-'
        });
      });
    } catch (_) {}

    return list;
  }, []);

  // Filter WSID Suggestions saat user mengetik
  const wsidSuggestions = useMemo(() => {
    const q = createWsid.trim().toUpperCase();
    if (!q || q.length < 1) return [];
    return machinesCatalogList
      .filter((m) => m.wsid.includes(q) || m.lokasi.toUpperCase().includes(q))
      .slice(0, 10);
  }, [createWsid, machinesCatalogList]);

  // Daftar Event Problem umum & dari tiket
  const problemSuggestions = useMemo(() => {
    const q = createProblem.trim().toLowerCase();
    if (!q || q.length < 1) return [];

    const extraProblems = [
      'Cassette 1 Fatal',
      'Cassette 2 Fatal',
      'Cassette 3 Fatal',
      'Cassette 4 Fatal',
      'cash handlr Hopper 1 Notes LOW',
      'cash handlr Hopper 2 Notes LOW',
      'cash handlr Hopper 3 Notes LOW',
      'cash handlr Hopper 4 Notes LOW',
      'Out of Service',
      'Card Reader Fault',
      'Supervisor Mode Active',
      'Network Offline / Down',
      'Receipt Printer Jam',
      'LLH-Lain-lain hardware'
    ];

    const allProblems = Array.from(
      new Set([
        ...TARGET_EVENT_CODES,
        ...extraProblems,
        ...modernTickets.map((t) => t.problem).filter(Boolean)
      ])
    );

    return allProblems
      .filter((p) => p.toLowerCase().includes(q))
      .slice(0, 10);
  }, [createProblem, modernTickets]);

  // Close suggestions when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (wsidBoxRef.current && !wsidBoxRef.current.contains(e.target as Node)) {
        setShowWsidSuggestions(false);
      }
      if (problemBoxRef.current && !problemBoxRef.current.contains(e.target as Node)) {
        setShowProblemSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelectMachineSuggestion = (m: {
    wsid: string;
    lokasi: string;
    servicePoint: string;
    sektor: string;
    vendor: string;
    tipeMesin: string;
  }) => {
    setCreateWsid(m.wsid);
    setCreateLokasi(m.lokasi);
    setCreateSektor(m.sektor);
    setCreateSp(m.servicePoint || 'ACJK');
    setCreateVendor(m.vendor);
    setShowWsidSuggestions(false);
  };

  const handleSelectProblemSuggestion = (prob: string) => {
    setCreateProblem(prob);
    setShowProblemSuggestions(false);
  };

  // 1. Action: Buat Tiket Manual
  const handleOpenCreateModal = () => {
    if (!ensurePetugas()) return;
    setCreateWsid('');
    setCreateLokasi('');
    setCreateSp('ACJK');
    setCreateSektor('');
    setCreateVendor('Diebold Nixdorf');
    setCreateProblem('');
    setCreatePriority('NORMAL');
    setCreateCategory('VENDOR');
    setCreateNote('');
    setCreatePeriodeProblem('');
    setCreateUptimeBaseline(undefined);
    setCreateSumberProblem('ANALISIS');
    setShowWsidSuggestions(false);
    setShowProblemSuggestions(false);
    setShowCreateModal(true);
  };

  const handleCreateTicketFromRecommendation = (rec: FollowUpRecommendation) => {
    if (!ensurePetugas()) return;
    setCreateWsid(rec.wsid);
    setCreateLokasi(rec.lokasi);
    setCreateSektor(rec.sektor);
    setCreateVendor(rec.vendor);
    const sp = getServicePointForSektor(rec.sektor) || 'ACJK';
    setCreateSp(sp);
    setCreateProblem(rec.dominantProblem || 'Chronic SLA Uptime Rendah');
    setCreatePriority(rec.priority === 'CRITICAL' ? 'URGENT' : 'HIGH');
    setCreateCategory('VENDOR');
    setCreatePeriodeProblem(rec.latestPeriode);
    setCreateUptimeBaseline(rec.latestUptime);
    setCreateSumberProblem('CHRONIC_SLA');
    setCreateNote(
      `Eskalasi Rekomendasi SLA BCA: Uptime ${rec.latestUptime}% (${rec.consecutiveLowMonths} bulan berturut-turut di bawah target). ${rec.priorityReason}`
    );
    setShowWsidSuggestions(false);
    setShowProblemSuggestions(false);
    setShowCreateModal(true);
  };

  // Auto-fill Service Point, Lokasi & Sektor saat input WSID
  const handleWsidInputChange = (val: string) => {
    const cleanW = val.trim().toUpperCase();
    setCreateWsid(cleanW);
    setShowWsidSuggestions(true);

    // Auto-fill jika persis cocok dengan metadata mesin
    const meta = getMachineMetadata(cleanW);
    if (meta) {
      if (meta.lokasi && meta.lokasi !== '-') setCreateLokasi(meta.lokasi);
      const cleanSek = meta.sektor_bca && meta.sektor_bca !== '-' ? cleanSektorName(meta.sektor_bca) : '';
      if (cleanSek) setCreateSektor(cleanSek);
      const sp = meta.service_point || (cleanSek ? getServicePointForSektor(cleanSek) : '');
      if (sp && sp !== '-') setCreateSp(sp);
      if (meta.vendor && meta.vendor !== '-') setCreateVendor(meta.vendor);
    }
  };

  const handleSubmitCreateTicket = async () => {
    if (!createWsid.trim() || !createProblem.trim() || !createNote.trim()) {
      alert('Mohon lengkapi WSID, Problem, dan Instruksi Permintaan!');
      return;
    }

    // Cek anti-duplikasi
    const isAlreadyActive = modernTickets.some(
      (t) => t.wsid.trim().toUpperCase() === createWsid.trim().toUpperCase() && t.status !== 'CLOSED'
    );
    if (isAlreadyActive) {
      alert(`Peringatan: WSID ${createWsid} sudah memiliki tiket aktif yang sedang berjalan. Mohon periksa kembali!`);
      return;
    }

    setIsSubmittingCreate(true);
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const rand = Math.floor(100 + Math.random() * 900);
    const ticketId = `TKT-${y}${m}${day}-${rand}`;
    const nowIso = d.toISOString();

    const roleTitle = effectiveRole === 'KAWIL' ? 'Ka Wil' : effectiveRole === 'KAOPS' ? 'Ka Ops' : 'Supervisor';
    const createdByStr = `${roleTitle}: ${petugasName.trim()}`;

    const newTicket: FollowUpTicketItem = {
      ticketId,
      wsid: createWsid.trim().toUpperCase(),
      lokasi: createLokasi.trim() || '-',
      sektor: createSektor.trim() || '-',
      servicePoint: createSp.trim().toUpperCase(),
      vendor: createVendor.trim() || 'ATM/CRM',
      problem: createProblem.trim(),
      sumberProblem: createSumberProblem,
      prioritas: createPriority,
      kategori: createCategory,
      catatanRequest: createNote.trim(),
      createdBy: createdByStr,
      createdAt: nowIso,
      status: 'OPEN',
      periodeProblem: createPeriodeProblem || undefined,
      uptimeBaseline: createUptimeBaseline,
      progresList: []
    };

    try {
      addOrUpdateModernTicket(newTicket);
      await saveFollowUpTicketModern(newTicket);
      setShowCreateModal(false);
      setToastMessage(`Tiket #${ticketId} (WSID ${newTicket.wsid}) berhasil diterbitkan ke Tim Monitoring!`);
      setTimeout(() => setToastMessage(null), 4000);
    } catch (e: any) {
      alert('Gagal menerbitkan tiket: ' + (e?.message || e));
    } finally {
      setIsSubmittingCreate(false);
    }
  };

  // 2. Action: Tambah Progres oleh Monitoring
  const handleOpenProgressModal = (ticket: FollowUpTicketItem) => {
    if (!ensurePetugas()) return;
    setActiveTicket(ticket);
    setProgressText('');
    setShowProgressModal(true);
  };

  const handleSaveProgress = async () => {
    if (!activeTicket || !progressText.trim()) return;
    setIsSavingProgress(true);
    const nowIso = new Date().toISOString();
    const roleTitle = effectiveRole === 'MONITORING' ? 'Monitoring' : effectiveRole === 'KAWIL' ? 'Ka Wil' : 'Ka Ops';
    const signer = `${roleTitle}: ${petugasName.trim()}`;

    const updatedProgresList = [
      ...(activeTicket.progresList || []),
      {
        id: `PRG-${Date.now()}`,
        waktu: nowIso,
        petugas: signer,
        catatan: progressText.trim()
      }
    ];

    const updatedTicket: FollowUpTicketItem = {
      ...activeTicket,
      status: activeTicket.status === 'OPEN' ? 'IN_PROGRESS' : activeTicket.status,
      progresList: updatedProgresList,
      updatedAt: nowIso
    };

    try {
      addOrUpdateModernTicket(updatedTicket);
      await saveFollowUpTicketModern(updatedTicket);
      setShowProgressModal(false);
      if (showDetailModal) setActiveTicket(updatedTicket);
      setToastMessage(`Progres tiket #${updatedTicket.ticketId} berhasil diperbarui.`);
      setTimeout(() => setToastMessage(null), 3000);
    } catch (e: any) {
      alert('Gagal menyimpan progres: ' + (e?.message || e));
    } finally {
      setIsSavingProgress(false);
    }
  };

  // 3. Action: Req Close oleh Monitoring
  const handleOpenReqCloseModal = (ticket: FollowUpTicketItem) => {
    if (!ensurePetugas()) return;
    setActiveTicket(ticket);
    setReqCloseCatatan('');
    setReqCloseStatusMesin('Mesin Normal / Problem Teratasi');
    setShowReqCloseModal(true);
  };

  const handleSubmitReqClose = async () => {
    if (!activeTicket || !reqCloseCatatan.trim()) return;
    setIsSubmittingReqClose(true);
    const nowIso = new Date().toISOString();
    const signer = `Monitoring: ${petugasName.trim()}`;

    const updatedTicket: FollowUpTicketItem = {
      ...activeTicket,
      status: 'REQ_CLOSE',
      reqCloseInfo: {
        requestedBy: signer,
        requestedAt: nowIso,
        catatanPenyelesaian: reqCloseCatatan.trim(),
        statusMesinSaatReq: reqCloseStatusMesin
      },
      updatedAt: nowIso
    };

    try {
      addOrUpdateModernTicket(updatedTicket);
      await saveFollowUpTicketModern(updatedTicket);
      setShowReqCloseModal(false);
      if (showDetailModal) setActiveTicket(updatedTicket);
      setToastMessage(`Pengajuan tutup tiket #${updatedTicket.ticketId} berhasil dikirim ke Ka Ops / Ka Wil!`);
      setTimeout(() => setToastMessage(null), 4000);
    } catch (e: any) {
      alert('Gagal mengirim pengajuan tutup: ' + (e?.message || e));
    } finally {
      setIsSubmittingReqClose(false);
    }
  };

  // 4. Action: Validasi oleh Ka Ops / Ka Wil (Approve Close vs Re-Open)
  const handleOpenValidationModal = (ticket: FollowUpTicketItem) => {
    if (!ensurePetugas()) return;
    setActiveTicket(ticket);
    setValidationDecision('CLOSED');
    setValidationReopenReason('');
    setValidationCatatanApproval('');
    setShowValidationModal(true);
  };

  const handleSubmitValidation = async () => {
    if (!activeTicket) return;
    if (validationDecision === 'RE_OPEN' && !validationReopenReason.trim()) {
      alert('Mohon masukkan alasan Re-Open agar Tim Monitoring memahami kendala yang belum tuntas!');
      return;
    }

    setIsSubmittingValidation(true);
    const nowIso = new Date().toISOString();
    const roleTitle = effectiveRole === 'KAWIL' ? 'Ka Wil' : 'Ka Ops';
    const validatorName = `${roleTitle}: ${petugasName.trim()}`;

    let durasiMenitFinal = activeTicket.durasiMenitFinal;
    if (validationDecision === 'CLOSED') {
      const createdTime = new Date(activeTicket.createdAt).getTime();
      durasiMenitFinal = Math.max(0, Math.floor((Date.now() - createdTime) / 60000));
    }

    const updatedTicket: FollowUpTicketItem = {
      ...activeTicket,
      status: validationDecision,
      durasiMenitFinal: validationDecision === 'CLOSED' ? durasiMenitFinal : undefined,
      validationInfo: {
        validatedBy: validatorName,
        validatedAt: nowIso,
        keputusan: validationDecision,
        alasanReopen: validationDecision === 'RE_OPEN' ? validationReopenReason.trim() : undefined,
        catatanApproval: validationDecision === 'CLOSED' ? validationCatatanApproval.trim() : undefined
      },
      updatedAt: nowIso
    };

    try {
      addOrUpdateModernTicket(updatedTicket);
      await saveFollowUpTicketModern(updatedTicket);
      setShowValidationModal(false);
      if (showDetailModal) setActiveTicket(updatedTicket);
      const msg =
        validationDecision === 'CLOSED'
          ? `Tiket #${updatedTicket.ticketId} berhasil disetujui & ditutup resmi!`
          : `Tiket #${updatedTicket.ticketId} berhasil di-RE-OPEN dan kembali ke antrean Tim Monitoring!`;
      setToastMessage(msg);
      setTimeout(() => setToastMessage(null), 4000);
    } catch (e: any) {
      alert('Gagal memvalidasi tiket: ' + (e?.message || e));
    } finally {
      setIsSubmittingValidation(false);
    }
  };

  // 5. Action: Hapus Tiket oleh Supervisor
  const handleDeleteTicket = async (ticketId: string) => {
    if (!confirm(`Hapus tiket #${ticketId}? Tindakan ini tidak dapat dibatalkan.`)) return;
    try {
      removeModernTicket(ticketId);
      await deleteFollowUpTicketModern(ticketId);
      if (showDetailModal) setShowDetailModal(false);
      setToastMessage(`Tiket #${ticketId} berhasil dihapus.`);
      setTimeout(() => setToastMessage(null), 3000);
    } catch (e: any) {
      alert('Gagal menghapus tiket: ' + (e?.message || e));
    }
  };

  // 6. Action: Salin Format WhatsApp
  const handleCopyWhatsApp = (ticket: FollowUpTicketItem) => {
    const text = `*ESKALASI FOLLOW UP PROBLEM ATM/CRM*
No Tiket : #${ticket.ticketId}
WSID     : ${ticket.wsid}
Lokasi   : ${ticket.lokasi}
SP/Sektor: ${ticket.servicePoint} - ${ticket.sektor}
Vendor   : ${ticket.vendor}
Problem  : ${ticket.problem}
Prioritas: ${ticket.prioritas}
Kategori : ${ticket.kategori}
Dibuat   : ${ticket.createdBy} (${new Date(ticket.createdAt).toLocaleString('id-ID')})

*Instruksi Ka Ops / Ka Wil:*
"${ticket.catatanRequest}"

*Status Tiket:* ${ticket.status === 'REQ_CLOSE' ? 'Menunggu Validasi Tutup' : ticket.status === 'IN_PROGRESS' ? 'Sedang Ditangani' : ticket.status === 'RE_OPEN' ? 'Re-Open (Belum Tuntas)' : ticket.status}
${ticket.progresList && ticket.progresList.length > 0 ? `*Progres Terakhir:* ${ticket.progresList[ticket.progresList.length - 1].catatan}` : ''}
${ticket.reqCloseInfo ? `*Catatan Penyelesaian:* ${ticket.reqCloseInfo.catatanPenyelesaian}` : ''}
`;
    navigator.clipboard.writeText(text);
    setToastMessage('Format pesan WhatsApp berhasil disalin ke clipboard!');
    setTimeout(() => setToastMessage(null), 3500);
  };

  // 7. Action: Export Excel
  const handleExportExcel = () => {
    const wb = XLSX.utils.book_new();
    const aoa: any[][] = [];

    aoa.push(['REKAP TIKET PERMINTAAN FOLLOW UP KE MONITORING']);
    aoa.push([`Diunduh: ${new Date().toLocaleString('id-ID')} | Filter SP: ${selectedSp} | Status: ${statusTab}`]);
    aoa.push([`Total Tiket: ${filteredTickets.length}`]);
    aoa.push([]);

    const headers = [
      'No',
      'No Tiket',
      'Waktu Dibuat',
      'Dibuat Oleh',
      'Service Point',
      'Sektor',
      'WSID',
      'Nama Lokasi',
      'Vendor',
      'Problem',
      'Prioritas',
      'Kategori',
      'Instruksi Ka Ops / Ka Wil',
      'Status Tiket',
      'Total Durasi',
      'Jumlah Update Progres',
      'Progres Terakhir',
      'Catatan Penyelesaian (Req Close)',
      'Divalidasi Oleh',
      'Catatan Approval'
    ];
    aoa.push(headers);

    filteredTickets.forEach((t, idx) => {
      const lastProg = t.progresList && t.progresList.length > 0 ? t.progresList[t.progresList.length - 1] : null;
      aoa.push([
        idx + 1,
        t.ticketId,
        new Date(t.createdAt).toLocaleString('id-ID'),
        t.createdBy,
        t.servicePoint,
        t.sektor,
        t.wsid,
        t.lokasi,
        t.vendor,
        t.problem,
        t.prioritas,
        t.kategori,
        t.catatanRequest,
        t.status,
        formatTicketDuration(t.createdAt, t.durasiMenitFinal),
        t.progresList?.length || 0,
        lastProg ? `${lastProg.petugas}: ${lastProg.catatan}` : '-',
        t.reqCloseInfo?.catatanPenyelesaian || '-',
        t.validationInfo?.validatedBy || '-',
        t.validationInfo?.catatanApproval || t.validationInfo?.alasanReopen || '-'
      ]);
    });

    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = [
      { wch: 6 },
      { wch: 18 },
      { wch: 20 },
      { wch: 22 },
      { wch: 15 },
      { wch: 18 },
      { wch: 12 },
      { wch: 30 },
      { wch: 18 },
      { wch: 30 },
      { wch: 12 },
      { wch: 14 },
      { wch: 40 },
      { wch: 18 },
      { wch: 16 },
      { wch: 12 },
      { wch: 45 },
      { wch: 40 },
      { wch: 22 },
      { wch: 35 }
    ];

    XLSX.utils.book_append_sheet(wb, ws, 'Rekap Tiket Follow Up');
    XLSX.writeFile(wb, `Rekap_Tiket_FollowUp_${selectedSp}_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  return (
    <div className={`flex-1 flex flex-col text-slate-800 space-y-4 ${
      isEmbedded ? 'w-full pb-8' : 'p-4 sm:p-6 bg-[#F5F7FB] min-h-screen'
    }`}>
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-5 right-5 z-50 px-4 py-2.5 rounded-lg bg-slate-900 text-white text-xs font-semibold shadow-lg flex items-center gap-2 animate-in fade-in slide-in-from-top-3">
          <CheckCircle2 size={15} className="text-emerald-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Header Halaman */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-white p-4 rounded-xl border border-[#E5EAF2] shadow-2xs">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center shrink-0 shadow-2xs">
              <Ticket size={18} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-bold text-[#0D1C2E] tracking-tight">
                  {effectiveRole === 'MONITORING' ? 'Dashboard Tiket Monitoring' : 'Pusat Tiket Permintaan ke Monitoring'}
                </h1>
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                  effectiveRole === 'MONITORING'
                    ? 'bg-blue-50 text-blue-700 border border-blue-200'
                    : effectiveRole === 'KAWIL'
                    ? 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                    : 'bg-teal-50 text-teal-700 border border-teal-200'
                }`}>
                  {effectiveRole === 'KAWIL' ? 'Portal Ka Wil' : effectiveRole === 'KAOPS' ? 'Portal Ka Ops' : 'Tim Monitoring'}
                </span>
              </div>
              <p className="text-[11px] text-[#555F71]">
                {effectiveRole === 'MONITORING'
                  ? 'Antrean permintaan tindak lanjut problem mesin dari Supervisor (Ka Wil / Ka Ops) ke Tim Monitoring'
                  : 'Koordinasi dan eskalasi penanganan problem mesin antara Supervisor (Ka Wil / Ka Ops) dan Tim Monitoring'}
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {/* Petugas Identity Pill */}
          <button
            type="button"
            onClick={() => {
              setTempPetugasName(petugasName);
              setShowPetugasModal(true);
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-50 hover:bg-slate-100 border border-[#E5EAF2] text-xs font-medium text-slate-700 transition-colors cursor-pointer"
            title="Ubah identitas petugas bertugas"
          >
            <User size={13} className="text-blue-600" />
            <span>Petugas: <strong className="text-[#0D1C2E]">{petugasName || 'Belum Diisi'}</strong></span>
          </button>

          {/* Refresh Tiket dari Cloud */}
          <button
            type="button"
            onClick={handleRefreshTickets}
            disabled={isRefreshing}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white hover:bg-slate-50 border border-[#E5EAF2] text-xs font-semibold text-slate-700 shadow-2xs transition-colors cursor-pointer"
            title="Muat ulang tiket terbaru dari Supabase Cloud"
          >
            <RefreshCw size={13} className={`text-blue-600 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span>{isRefreshing ? 'Memuat...' : 'Refresh'}</span>
          </button>

          {/* Export Excel */}
          <button
            type="button"
            onClick={handleExportExcel}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white hover:bg-slate-50 border border-[#E5EAF2] text-xs font-semibold text-slate-700 shadow-2xs transition-colors cursor-pointer"
            title="Download Rekap Tiket ke Excel"
          >
            <Download size={13} className="text-emerald-600" />
            <span>Export Excel</span>
          </button>

          {/* Buat Tiket Manual (Ka Wil / Ka Ops) */}
          {isSupervisorRole && (
            <button
              type="button"
              onClick={handleOpenCreateModal}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-2xs transition-colors cursor-pointer"
            >
              <Plus size={14} />
              <span>+ Buat Tiket Manual</span>
            </button>
          )}
        </div>
      </div>

      {/* Tab Navigasi Utama: Rekomendasi SLA/Chronic vs Daftar Tiket */}
      <div className="flex items-center gap-2 border-b border-[#E5EAF2] pb-1">
        <button
          type="button"
          onClick={() => setMainSectionTab('RECOMMENDATIONS')}
          className={`flex items-center gap-2 px-4 py-2 rounded-t-lg text-xs font-bold transition-all border-b-2 cursor-pointer ${
            mainSectionTab === 'RECOMMENDATIONS'
              ? 'border-blue-600 text-blue-600 bg-white shadow-2xs'
              : 'border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-50'
          }`}
        >
          <Flame size={15} className={mainSectionTab === 'RECOMMENDATIONS' ? 'text-amber-500' : 'text-slate-400'} />
          <span>Rekomendasi Tindak Lanjut (Chronic & SLA)</span>
          <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-amber-100 text-amber-800 font-bold">
            {allRecommendations.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setMainSectionTab('TICKETS')}
          className={`flex items-center gap-2 px-4 py-2 rounded-t-lg text-xs font-bold transition-all border-b-2 cursor-pointer ${
            mainSectionTab === 'TICKETS'
              ? 'border-blue-600 text-blue-600 bg-white shadow-2xs'
              : 'border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-50'
          }`}
        >
          <Ticket size={15} className={mainSectionTab === 'TICKETS' ? 'text-blue-600' : 'text-slate-400'} />
          <span>Daftar Tiket Tindak Lanjut</span>
          <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-blue-100 text-blue-800 font-bold">
            {(modernTickets || []).length}
          </span>
        </button>
      </div>

      {/* SECTION 1: REKOMENDASI TINDAK LANJUT (CHRONIC & SLA) */}
      {mainSectionTab === 'RECOMMENDATIONS' && (
        <div className="space-y-3">
          {/* Dashboard Active Filter Chip */}
          {activeCategoryLabel && (
            <div className="flex items-center justify-between gap-2 bg-blue-50 border border-blue-200 text-blue-900 px-3.5 py-2 rounded-xl text-xs">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium text-slate-600">Filter Kategori Dashboard:</span>
                <span className="font-bold px-2 py-0.5 rounded bg-blue-100 text-blue-800 border border-blue-300/60">
                  {activeCategoryLabel}
                </span>
                {activeCategoryWsids && (
                  <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-white text-blue-700 border border-blue-200">
                    {activeCategoryWsids.length} Unit WSID
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={() => {
                  setActiveCategoryFilter(null);
                  setActiveCategoryLabel(null);
                  setActiveCategoryWsids(null);
                }}
                className="flex items-center gap-1 px-2 py-1 rounded bg-white hover:bg-blue-100 text-blue-700 text-[11px] font-semibold border border-blue-200 transition-colors cursor-pointer"
              >
                <X size={12} />
                <span>Hapus Filter</span>
              </button>
            </div>
          )}

          {/* Recommendations Filter Toolbar */}
          <div className="bg-white p-3.5 rounded-xl border border-[#E5EAF2] shadow-2xs flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2 flex-1 min-w-[280px]">
              <div className="relative flex-1 min-w-[200px] max-w-md">
                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={recSearch}
                  onChange={(e) => setRecSearch(e.target.value)}
                  placeholder="Cari WSID, lokasi, sektor, vendor, problem..."
                  className="w-full h-8 pl-8 pr-7 rounded-lg bg-slate-50 text-xs text-slate-800 placeholder:text-slate-400 border border-[#E5EAF2] focus:outline-none focus:ring-1 focus:ring-blue-500 focus:bg-white"
                />
                {recSearch && (
                  <button
                    type="button"
                    onClick={() => setRecSearch('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    <X size={12} />
                  </button>
                )}
              </div>

              {/* Toggle Hanya Chronic */}
              <label className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#E5EAF2] bg-slate-50 text-xs font-semibold text-slate-700 cursor-pointer hover:bg-slate-100 transition-colors select-none">
                <input
                  type="checkbox"
                  checked={onlyChronicFilter}
                  onChange={(e) => setOnlyChronicFilter(e.target.checked)}
                  className="rounded text-blue-600 focus:ring-0 cursor-pointer"
                />
                <Flame size={13} className={onlyChronicFilter ? 'text-amber-500' : 'text-slate-400'} />
                <span>Hanya Chronic</span>
              </label>

              {/* Priority Filter */}
              <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg border border-slate-200">
                <button
                  type="button"
                  onClick={() => setRecPriorityFilter('ALL')}
                  className={`px-2.5 py-1 rounded text-[11px] font-semibold transition-colors cursor-pointer ${
                    recPriorityFilter === 'ALL' ? 'bg-white text-blue-600 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Semua
                </button>
                <button
                  type="button"
                  onClick={() => setRecPriorityFilter('CRITICAL')}
                  className={`px-2.5 py-1 rounded text-[11px] font-semibold transition-colors cursor-pointer ${
                    recPriorityFilter === 'CRITICAL' ? 'bg-white text-rose-700 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Kritis
                </button>
                <button
                  type="button"
                  onClick={() => setRecPriorityFilter('WARNING')}
                  className={`px-2.5 py-1 rounded text-[11px] font-semibold transition-colors cursor-pointer ${
                    recPriorityFilter === 'WARNING' ? 'bg-white text-amber-700 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Warning
                </button>
              </div>
            </div>

            <div className="text-xs text-slate-500 font-medium">
              Menampilkan <strong>{filteredRecommendations.length}</strong> rekomendasi
            </div>
          </div>

          {/* Recommendations Table */}
          {filteredRecommendations.length === 0 ? (
            <div className="p-8 bg-white border border-[#E5EAF2] rounded-xl text-center shadow-2xs">
              <CheckCircle2 size={32} className="text-emerald-500 mx-auto mb-2" />
              <h3 className="text-sm font-bold text-slate-800">Tidak ada mesin dalam kriteria ini</h3>
              <p className="text-xs text-slate-500 mt-1">
                Semua mesin dalam filter berada dalam kondisi aman atau filter pencarian tidak menemukan hasil.
              </p>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-[#E5EAF2] shadow-2xs overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-700">
                  <thead className="bg-slate-50 text-[11px] font-semibold text-slate-500 border-b border-[#E5EAF2] uppercase tracking-wider">
                    <tr>
                      <th className="px-3.5 py-2.5">WSID & Mesin</th>
                      <th className="px-3.5 py-2.5">Lokasi / Sektor / Vendor</th>
                      <th className="px-3.5 py-2.5">Uptime & Tren</th>
                      <th className="px-3.5 py-2.5">Prioritas & Status Kronis</th>
                      <th className="px-3.5 py-2.5">Masalah Dominan & Alasan</th>
                      <th className="px-3.5 py-2.5 text-right">Aksi Tindak Lanjut</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E5EAF2]">
                    {filteredRecommendations.map((rec) => {
                      const activeTicket = activeTicketMap.get(rec.wsid.trim().toUpperCase());
                      return (
                        <tr key={rec.wsid} className="hover:bg-slate-50/70 transition-colors">
                          <td className="px-3.5 py-3 align-top">
                            <div className="font-mono font-bold text-slate-900 text-sm">
                              {rec.wsid}
                            </div>
                            <span className="inline-block px-1.5 py-0.2 rounded text-[10px] font-semibold bg-slate-100 text-slate-600 border border-slate-200 mt-0.5">
                              {rec.jenisMesin}
                            </span>
                          </td>

                          <td className="px-3.5 py-3 align-top max-w-[240px]">
                            <div className="font-medium text-slate-800 line-clamp-1" title={rec.lokasi}>
                              {rec.lokasi}
                            </div>
                            <div className="text-[11px] text-slate-500 flex items-center gap-1.5 mt-0.5">
                              <span>Sektor: {rec.sektor}</span>
                              <span>&bull;</span>
                              <span>{rec.vendor}</span>
                            </div>
                          </td>

                          <td className="px-3.5 py-3 align-top">
                            <div className="flex items-baseline gap-1.5">
                              <span className={`text-sm font-bold ${
                                rec.latestUptime < (rec.jenisMesin === 'CRM' ? 98.0 : 98.5)
                                  ? 'text-rose-600'
                                  : 'text-amber-600'
                              }`}>
                                {rec.latestUptime}%
                              </span>
                              <span className="text-[10px] text-slate-400">
                                Target {rec.jenisMesin === 'CRM' ? '98.5%' : '99.0%'}
                              </span>
                            </div>
                            {/* Mini trend */}
                            {rec.trend && rec.trend.length > 0 && (
                              <div className="flex items-end gap-1 mt-1.5 h-6">
                                {rec.trend.map((t, tIdx) => {
                                  const isLow = t.uptime < (rec.jenisMesin === 'CRM' ? 98.5 : 99.0);
                                  const heightPct = Math.max(20, Math.min(100, (t.uptime - 80) * 5));
                                  return (
                                    <div
                                      key={tIdx}
                                      className="flex flex-col items-center group relative cursor-pointer"
                                      title={`${t.periode}: ${t.uptime}%`}
                                    >
                                      <div
                                        style={{ height: `${heightPct}%` }}
                                        className={`w-1.5 rounded-t-xs transition-all ${
                                          isLow ? 'bg-rose-500' : 'bg-emerald-500'
                                        }`}
                                      />
                                      <span className="text-[7px] text-slate-400 mt-0.5">
                                        {t.periode.slice(-2)}
                                      </span>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </td>

                          <td className="px-3.5 py-3 align-top">
                            <div className="flex flex-col gap-1 items-start">
                              <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                rec.priority === 'CRITICAL'
                                  ? 'bg-rose-50 text-rose-700 border border-rose-200'
                                  : 'bg-amber-50 text-amber-700 border border-amber-200'
                              }`}>
                                {rec.priority === 'CRITICAL' ? 'Prioritas Kritis' : 'Prioritas Warning'}
                              </span>

                              {rec.isChronic && (
                                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold border ${
                                  rec.consecutiveLowMonths > 2
                                    ? 'bg-rose-100 text-rose-900 border-rose-300'
                                    : 'bg-amber-100 text-amber-900 border-amber-300'
                                }`}>
                                  <Flame size={11} className={rec.consecutiveLowMonths > 2 ? 'text-rose-700' : 'text-amber-700'} />
                                  <span>Kronis: {rec.consecutiveLowMonths} Bln Rendah</span>
                                </span>
                              )}
                            </div>
                          </td>

                          <td className="px-3.5 py-3 align-top max-w-[280px]">
                            <div className="font-semibold text-slate-800 line-clamp-1">
                              {rec.dominantProblem}
                            </div>
                            <div className="text-[11px] text-slate-500 mt-0.5 line-clamp-2" title={rec.priorityReason}>
                              {rec.priorityReason}
                            </div>
                          </td>

                          <td className="px-3.5 py-3 align-top text-right">
                            {activeTicket ? (
                              <div className="inline-flex flex-col items-end">
                                <span className="inline-flex items-center gap-1 px-2 py-1 rounded bg-amber-50 text-amber-800 text-[10px] font-bold border border-amber-200">
                                  <Clock size={11} />
                                  <span>Tiket #{activeTicket.ticketId}</span>
                                </span>
                                <span className="text-[9px] text-slate-400 mt-0.5">
                                  Status: {activeTicket.status}
                                </span>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleCreateTicketFromRecommendation(rec)}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold shadow-2xs transition-colors cursor-pointer"
                              >
                                <Plus size={13} />
                                <span>Buat Tiket</span>
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* SECTION 2: DAFTAR TIKET TINDAK LANJUT */}
      {mainSectionTab === 'TICKETS' && (
        <>
          {/* Metric Cards (Compact Enterprise Grid) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Card 1: Semua Tiket Aktif */}
        <div
          onClick={() => setStatusTab('ALL')}
          className={`p-3.5 rounded-xl bg-white border transition-all cursor-pointer shadow-2xs ${
            statusTab === 'ALL' ? 'border-blue-600 ring-1 ring-blue-600/30' : 'border-[#E5EAF2] hover:border-slate-300'
          }`}
        >
          <div className="flex items-center justify-between text-xs text-[#555F71] mb-1">
            <span className="font-semibold text-[11px] uppercase tracking-wider">Total Tiket</span>
            <Ticket size={15} className="text-blue-600" />
          </div>
          <div className="text-2xl font-bold text-[#0D1C2E] font-mono tracking-tight">
            {(modernTickets || []).length}
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">
            Semua riwayat tiket di database
          </div>
        </div>

        {/* Card 2: Perlu Tindakan Monitoring */}
        <div
          onClick={() => setStatusTab('ACTION_NEEDED')}
          className={`p-3.5 rounded-xl bg-white border transition-all cursor-pointer shadow-2xs ${
            statusTab === 'ACTION_NEEDED' ? 'border-amber-500 ring-1 ring-amber-500/30' : 'border-[#E5EAF2] hover:border-slate-300'
          }`}
        >
          <div className="flex items-center justify-between text-xs text-[#555F71] mb-1">
            <span className="font-semibold text-[11px] uppercase tracking-wider text-amber-700">Perlu Tindakan Monitoring</span>
            <Clock size={15} className="text-amber-500" />
          </div>
          <div className="text-2xl font-bold text-amber-600 font-mono tracking-tight">
            {countActionNeeded}
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5 flex items-center gap-1">
            <span>Status: Open / In Progress</span>
            {countReOpen > 0 && (
              <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-rose-100 text-rose-700">
                {countReOpen} Re-Open
              </span>
            )}
          </div>
        </div>

        {/* Card 3: Menunggu Validasi Ka Ops */}
        <div
          onClick={() => setStatusTab('WAITING_VALIDATION')}
          className={`p-3.5 rounded-xl bg-white border transition-all cursor-pointer shadow-2xs ${
            statusTab === 'WAITING_VALIDATION' ? 'border-indigo-600 ring-1 ring-indigo-600/30' : 'border-[#E5EAF2] hover:border-slate-300'
          }`}
        >
          <div className="flex items-center justify-between text-xs text-[#555F71] mb-1">
            <span className="font-semibold text-[11px] uppercase tracking-wider text-indigo-700">Menunggu Validasi Ka Ops</span>
            <ShieldCheck size={15} className="text-indigo-600" />
          </div>
          <div className="text-2xl font-bold text-indigo-700 font-mono tracking-tight">
            {countWaitingValidation}
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">
            Monitoring sudah ajukan penutupan
          </div>
        </div>

        {/* Card 4: Tuntas (Closed) */}
        <div
          onClick={() => setStatusTab('CLOSED')}
          className={`p-3.5 rounded-xl bg-white border transition-all cursor-pointer shadow-2xs ${
            statusTab === 'CLOSED' ? 'border-emerald-600 ring-1 ring-emerald-600/30' : 'border-[#E5EAF2] hover:border-slate-300'
          }`}
        >
          <div className="flex items-center justify-between text-xs text-[#555F71] mb-1">
            <span className="font-semibold text-[11px] uppercase tracking-wider text-emerald-700">Tuntas (Closed)</span>
            <CheckCircle2 size={15} className="text-emerald-600" />
          </div>
          <div className="text-2xl font-bold text-emerald-600 font-mono tracking-tight">
            {countClosed}
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">
            Resmi disetujui & ditutup
          </div>
        </div>
      </div>

      {/* Enterprise Filter Toolbar */}
      <div className="bg-white p-3.5 rounded-xl border border-[#E5EAF2] shadow-2xs flex flex-wrap items-center justify-between gap-3">
        {/* Left: Filter Service Point & Status Tabs */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Service Point Dropdown Filter */}
          <div className="flex items-center gap-1.5 bg-slate-50 border border-[#E5EAF2] px-2.5 py-1 rounded-lg">
            <MapPin size={13} className="text-blue-600" />
            <span className="text-[11px] font-semibold text-slate-600">Service Point:</span>
            <select
              value={selectedSp}
              onChange={(e) => setSelectedSp(e.target.value)}
              className="bg-transparent text-xs font-bold text-[#0D1C2E] focus:outline-none cursor-pointer"
            >
              <option value="ALL">Semua SP (Seluruh Wilayah)</option>
              {availableServicePoints.map((sp) => (
                <option key={sp} value={sp}>
                  {sp}
                </option>
              ))}
            </select>
          </div>

          {/* Status Tabs */}
          <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg border border-slate-200/60">
            <button
              type="button"
              onClick={() => setStatusTab('ALL')}
              className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors cursor-pointer ${
                statusTab === 'ALL' ? 'bg-white text-blue-600 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Semua ({modernTickets.length})
            </button>
            <button
              type="button"
              onClick={() => setStatusTab('ACTION_NEEDED')}
              className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors cursor-pointer ${
                statusTab === 'ACTION_NEEDED' ? 'bg-white text-amber-700 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Perlu Tindakan ({countActionNeeded})
            </button>
            {countReOpen > 0 && (
              <button
                type="button"
                onClick={() => setStatusTab('RE_OPEN')}
                className={`px-2 py-0.5 rounded-md text-[11px] font-bold transition-all cursor-pointer flex items-center gap-1 ${
                  statusTab === 'RE_OPEN'
                    ? 'bg-rose-600 text-white shadow-2xs'
                    : 'bg-rose-100/80 text-rose-800 hover:bg-rose-200/80 animate-pulse'
                }`}
                title="Tiket yang dikembalikan oleh Ka Ops / Ka Wil karena penanganan belum tuntas"
              >
                <AlertOctagon size={11} />
                <span>Re-Open ({countReOpen})</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => setStatusTab('WAITING_VALIDATION')}
              className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors cursor-pointer ${
                statusTab === 'WAITING_VALIDATION' ? 'bg-white text-indigo-700 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Menunggu Validasi ({countWaitingValidation})
            </button>
            <button
              type="button"
              onClick={() => setStatusTab('CLOSED')}
              className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors cursor-pointer ${
                statusTab === 'CLOSED' ? 'bg-white text-emerald-700 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Tuntas ({countClosed})
            </button>
          </div>

          {/* Priority Filter */}
          <div className="flex items-center gap-1 bg-slate-50 border border-[#E5EAF2] px-2.5 py-1 rounded-lg text-xs">
            <span className="text-[11px] font-medium text-slate-500">Prioritas:</span>
            <select
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value as any)}
              className="bg-transparent text-xs font-semibold text-[#0D1C2E] focus:outline-none cursor-pointer"
            >
              <option value="ALL">Semua</option>
              <option value="URGENT">URGENT</option>
              <option value="HIGH">HIGH</option>
              <option value="NORMAL">NORMAL</option>
            </select>
          </div>
        </div>

        {/* Right: Search Box */}
        <div className="relative w-full sm:w-64">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cari tiket, WSID, lokasi, SP..."
            className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-[#E5EAF2] text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
          />
        </div>
      </div>

      {/* Main Table Card */}
      <div className="bg-white rounded-xl border border-[#E5EAF2] shadow-2xs overflow-hidden flex flex-col flex-1">
        <div className="overflow-x-auto flex-1">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-[#F8F9FF] border-b border-[#E5EAF2] text-[#555F71] uppercase tracking-wider text-[11px] font-semibold">
                <th className="py-2.5 px-3 whitespace-nowrap">No Tiket</th>
                <th className="py-2.5 px-3 whitespace-nowrap">Service Point / Sektor</th>
                <th className="py-2.5 px-3 whitespace-nowrap">WSID & Lokasi</th>
                <th className="py-2.5 px-3 whitespace-nowrap">Problem & Analisa</th>
                <th className="py-2.5 px-3 whitespace-nowrap text-center">Prioritas</th>
                <th className="py-2.5 px-3 min-w-[220px]">Instruksi Ka Ops / Ka Wil</th>
                <th className="py-2.5 px-3 whitespace-nowrap">Status & Progres</th>
                <th className="py-2.5 px-3 whitespace-nowrap text-center">Aksi Tindakan</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E5EAF2]">
              {filteredTickets.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400">
                    <Ticket size={28} className="mx-auto mb-2 text-slate-300" />
                    <p className="font-semibold text-slate-600 text-xs">Tidak ada tiket yang sesuai dengan filter.</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Silakan ubah filter Service Point atau tab status di atas.
                    </p>
                  </td>
                </tr>
              ) : (
                filteredTickets.map((ticket, idx) => {
                  const isReopen = ticket.status === 'RE_OPEN';
                  const isReqClose = ticket.status === 'REQ_CLOSE';
                  const isClosed = ticket.status === 'CLOSED';
                  const lastProg = ticket.progresList && ticket.progresList.length > 0 ? ticket.progresList[ticket.progresList.length - 1] : null;
                  const durStr = formatTicketDuration(ticket.createdAt, ticket.durasiMenitFinal);

                  return (
                    <tr
                      key={ticket.ticketId}
                      className={`hover:bg-blue-50/20 transition-colors ${
                        isReopen ? 'bg-rose-50/40' : isReqClose ? 'bg-indigo-50/30' : isClosed ? 'opacity-80' : ''
                      }`}
                    >
                      {/* 1. No Tiket & Waktu */}
                      <td className="py-2 px-3 whitespace-nowrap align-top">
                        <div className="flex flex-col gap-0.5">
                          <span className="font-mono font-bold text-xs text-[#0D1C2E]">
                            #{ticket.ticketId}
                          </span>
                          <span className="text-[10px] text-[#555F71]">
                            {new Date(ticket.createdAt).toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' })}{' '}
                            {new Date(ticket.createdAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                          <span className="text-[9px] text-slate-400 truncate max-w-[120px]" title={ticket.createdBy}>
                            Oleh: {ticket.createdBy}
                          </span>
                        </div>
                      </td>

                      {/* 2. SP & Sektor */}
                      <td className="py-2 px-3 whitespace-nowrap align-top">
                        <div className="flex flex-col gap-0.5">
                          <span className="inline-block px-1.5 py-0.2 rounded text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200 w-fit">
                            {ticket.servicePoint || '-'}
                          </span>
                          <span className="text-[11px] font-medium text-[#0D1C2E]">
                            {cleanSektorName(ticket.sektor)}
                          </span>
                        </div>
                      </td>

                      {/* 3. WSID & Lokasi */}
                      <td className="py-2 px-3 align-top max-w-[220px]">
                        <div className="flex flex-col gap-0.5">
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono font-bold text-xs text-blue-600">
                              {ticket.wsid}
                            </span>
                            <span className="text-[9px] px-1 py-0.2 rounded bg-slate-100 text-slate-600 font-medium">
                              {ticket.vendor || 'ATM'}
                            </span>
                          </div>
                          <span className="text-[11px] text-[#0D1C2E] truncate font-medium" title={ticket.lokasi}>
                            {ticket.lokasi}
                          </span>
                        </div>
                      </td>

                      {/* 4. Problem & Analisa */}
                      <td className="py-2 px-3 align-top max-w-[220px]">
                        <div className="flex flex-col gap-0.5">
                          <span className="text-[11px] font-semibold text-[#0D1C2E] truncate" title={ticket.problem}>
                            {ticket.problem}
                          </span>
                          <div className="flex items-center gap-1 text-[10px] text-[#555F71]">
                            <span className="px-1.5 py-0.2 rounded text-[9px] font-medium bg-slate-50 border border-slate-200">
                              {ticket.sumberProblem === 'FREKUENSI' ? 'Analisis Frekuensi' : 'Problem Open'}
                            </span>
                            <span>&bull; Durasi: {durStr}</span>
                          </div>
                        </div>
                      </td>

                      {/* 5. Prioritas */}
                      <td className="py-2 px-3 text-center align-top whitespace-nowrap">
                        <span
                          className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${
                            ticket.prioritas === 'URGENT'
                              ? 'bg-rose-100 text-rose-800 border border-rose-300'
                              : ticket.prioritas === 'HIGH'
                              ? 'bg-amber-100 text-amber-800 border border-amber-300'
                              : 'bg-slate-100 text-slate-700 border border-slate-200'
                          }`}
                        >
                          {ticket.prioritas}
                        </span>
                      </td>

                      {/* 6. Instruksi Ka Ops / Ka Wil */}
                      <td className="py-2 px-3 align-top">
                        <div className="p-2 rounded-lg bg-slate-50 border border-slate-200/80 text-[11px] text-slate-700 leading-relaxed italic">
                          "{ticket.catatanRequest}"
                        </div>
                      </td>

                      {/* 7. Status & Progres Terakhir */}
                      <td className="py-2 px-3 align-top min-w-[200px]">
                        <div className="flex flex-col gap-1">
                          {/* Status Badge */}
                          <div className="flex items-center gap-1.5">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold border flex items-center gap-1 ${
                                isReopen
                                  ? 'bg-rose-100 text-rose-800 border-rose-300 animate-pulse'
                                  : isReqClose
                                  ? 'bg-indigo-100 text-indigo-800 border-indigo-300 font-black'
                                  : ticket.status === 'IN_PROGRESS'
                                  ? 'bg-blue-100 text-blue-800 border-blue-300'
                                  : isClosed
                                  ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                                  : 'bg-amber-100 text-amber-800 border-amber-300'
                              }`}
                            >
                              {isReopen && <AlertOctagon size={11} />}
                              {isReqClose && <ShieldCheck size={11} />}
                              {isClosed && <CheckCircle2 size={11} />}
                              {ticket.status === 'OPEN' && 'Menunggu Tindakan'}
                              {ticket.status === 'IN_PROGRESS' && 'Sedang Diproses'}
                              {ticket.status === 'REQ_CLOSE' && 'Menunggu Validasi Ka Ops'}
                              {ticket.status === 'RE_OPEN' && 'Re-Open (Ditolak Ka Ops)'}
                              {ticket.status === 'CLOSED' && 'Tuntas & Ditutup'}
                            </span>
                          </div>

                          {/* RE-OPEN ALERT NOTE */}
                          {isReopen && ticket.validationInfo?.alasanReopen && (
                            <p className="text-[10px] text-rose-800 font-bold bg-rose-50 p-1.5 rounded border border-rose-200">
                              Alasan Tolak: "{ticket.validationInfo.alasanReopen}"
                            </p>
                          )}

                          {/* REQ CLOSE NOTE */}
                          {isReqClose && ticket.reqCloseInfo && (
                            <p className="text-[10px] text-indigo-900 font-medium bg-indigo-50 p-1.5 rounded border border-indigo-200">
                              Hasil Monitoring: "{ticket.reqCloseInfo.catatanPenyelesaian}"
                            </p>
                          )}

                          {/* LAST PROGRESS NOTE */}
                          {!isReqClose && !isReopen && lastProg && (
                            <p className="text-[10px] text-slate-600 line-clamp-2">
                              <strong>{lastProg.petugas}:</strong> {lastProg.catatan}
                            </p>
                          )}
                        </div>
                      </td>

                      {/* 8. Aksi Tindakan */}
                      <td className="py-2 px-3 whitespace-nowrap text-center align-top">
                        <div className="flex items-center justify-center gap-1">
                          {/* Aksi Khusus Monitoring */}
                          {!isClosed && (
                            <>
                              <button
                                type="button"
                                onClick={() => handleOpenProgressModal(ticket)}
                                className="px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-semibold transition-colors cursor-pointer"
                                title="Tambah catatan update progres penanganan"
                              >
                                + Progres
                              </button>

                              <button
                                type="button"
                                onClick={() => handleOpenReqCloseModal(ticket)}
                                className="px-2 py-1 rounded bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 text-[11px] font-bold transition-colors cursor-pointer"
                                title="Pekerjaan selesai, ajukan tutup tiket ke Ka Ops / Ka Wil"
                              >
                                Req Close
                              </button>
                            </>
                          )}

                          {/* Aksi Khusus Supervisor (Ka Ops / Ka Wil): Validasi Tutup / Re-Open */}
                          {isSupervisorRole && isReqClose && (
                            <button
                              type="button"
                              onClick={() => handleOpenValidationModal(ticket)}
                              className="px-2 py-1 rounded bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold shadow-2xs transition-colors cursor-pointer flex items-center gap-1"
                              title="Validasi penyelesaian tiket dari tim monitoring"
                            >
                              <ShieldCheck size={12} />
                              <span>Validasi</span>
                            </button>
                          )}

                          {/* Salin WhatsApp */}
                          <button
                            type="button"
                            onClick={() => handleCopyWhatsApp(ticket)}
                            className="p-1.5 rounded text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 transition-colors cursor-pointer"
                            title="Salin format teks eskalasi WhatsApp"
                          >
                            <Share2 size={13} />
                          </button>

                          {/* Detail Modal */}
                          <button
                            type="button"
                            onClick={() => {
                              setActiveTicket(ticket);
                              setShowDetailModal(true);
                            }}
                            className="p-1.5 rounded text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors cursor-pointer"
                            title="Lihat detail dan riwayat lengkap tiket"
                          >
                            <History size={13} />
                          </button>

                          {/* Hapus oleh Supervisor */}
                          {isSupervisorRole && (
                            <button
                              type="button"
                              onClick={() => handleDeleteTicket(ticket.ticketId)}
                              className="p-1.5 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                              title="Hapus tiket"
                            >
                              <Trash2 size={13} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Footer info bar */}
        <div className="p-3 bg-[#F8F9FF] border-t border-[#E5EAF2] flex items-center justify-between text-[11px] text-[#555F71]">
          <span>
            Menampilkan <strong>{filteredTickets.length}</strong> tiket (dari total {modernTickets.length} tiket)
          </span>
          <span className="text-[10px] text-slate-400">
            Sistem Sinkronisasi Realtime &bull; eMons ATM CRM BCA
          </span>
        </div>
      </div>
      </>
      )}

      {/* ========================================================= */}
      {/* MODAL 1: FORM BUAT TIKET BARU (KA WIL / KA OPS)           */}
      {/* ========================================================= */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col">
            <div className="p-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Ticket size={16} className="text-blue-600" />
                <h3 className="font-bold text-sm text-[#0D1C2E]">Terbitkan Req Follow Up ke Monitoring</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="w-7 h-7 rounded-full hover:bg-slate-200 text-slate-400 hover:text-slate-700 flex items-center justify-center transition-colors cursor-pointer"
              >
                <X size={15} />
              </button>
            </div>

            <div className="p-4 space-y-3 text-xs overflow-y-auto max-h-[75vh]">
              {createPeriodeProblem && (
                <div className="p-2.5 rounded-lg bg-blue-50 border border-blue-200 flex items-center justify-between text-xs text-blue-900">
                  <div>
                    <span className="font-semibold flex items-center gap-1 text-blue-800">
                      <Flame size={12} className="text-amber-500" />
                      Sumber Rekomendasi SLA BCA
                    </span>
                    <span className="block text-[11px] text-blue-700 mt-0.5">
                      Periode Evaluasi: {createPeriodeProblem}
                    </span>
                  </div>
                  {typeof createUptimeBaseline === 'number' && (
                    <div className="text-right">
                      <span className="text-[10px] text-blue-600 block">Baseline Uptime</span>
                      <span className="font-bold text-sm text-blue-800">{createUptimeBaseline}%</span>
                    </div>
                  )}
                </div>
              )}
              <div className="grid grid-cols-2 gap-2.5">
                <div className="relative" ref={wsidBoxRef}>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    WSID Mesin * <span className="text-[10px] text-blue-600 font-normal">(Ketik untuk saran)</span>
                  </label>
                  <input
                    type="text"
                    placeholder="Contoh: Z8VW / ACJK001"
                    value={createWsid}
                    onFocus={() => { if (createWsid.trim()) setShowWsidSuggestions(true); }}
                    onChange={(e) => handleWsidInputChange(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 font-mono font-bold focus:outline-none focus:ring-1 focus:ring-blue-500 uppercase"
                  />
                  {showWsidSuggestions && wsidSuggestions.length > 0 && (
                    <div className="absolute left-0 right-0 top-full mt-1 bg-white rounded-xl shadow-2xl border border-slate-200 z-50 max-h-60 overflow-y-auto divide-y divide-slate-100 animate-in fade-in zoom-in-95 duration-100">
                      <div className="p-1.5 bg-slate-50 text-[10px] font-semibold text-slate-500 flex items-center justify-between border-b border-slate-100 sticky top-0 z-10">
                        <span>Pilih WSID Mesin ({wsidSuggestions.length}):</span>
                        <span className="text-[9px] text-blue-600 font-bold">Auto-fill SP & Lokasi</span>
                      </div>
                      {wsidSuggestions.map((m) => (
                        <button
                          key={m.wsid}
                          type="button"
                          onClick={() => handleSelectMachineSuggestion(m)}
                          className="w-full px-2.5 py-2 text-left hover:bg-blue-50/80 transition-colors flex items-start justify-between gap-2 cursor-pointer group"
                        >
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="font-mono font-bold text-slate-900 group-hover:text-blue-700 text-xs">
                                {m.wsid}
                              </span>
                              <span className="text-[10px] px-1 py-0.2 rounded bg-indigo-50 text-indigo-700 font-bold border border-indigo-200">
                                {m.servicePoint}
                              </span>
                              <span className="text-[10px] text-slate-500 truncate">
                                &bull; {m.sektor}
                              </span>
                            </div>
                            <span className="text-[11px] text-slate-600 block truncate mt-0.5" title={m.lokasi}>
                              {m.lokasi}
                            </span>
                          </div>
                          <span className="text-[10px] font-semibold text-slate-400 group-hover:text-blue-600 shrink-0 mt-0.5">
                            Pilih &rarr;
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">Service Point *</label>
                  <select
                    value={createSp}
                    onChange={(e) => setCreateSp(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 font-semibold focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    {DEFAULT_SERVICE_POINTS.map((sp) => (
                      <option key={sp} value={sp}>{sp}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">Nama Lokasi</label>
                  <input
                    type="text"
                    placeholder="Contoh: Indomaret Meruya"
                    value={createLokasi}
                    onChange={(e) => setCreateLokasi(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">Sektor</label>
                  <input
                    type="text"
                    placeholder="Contoh: ULUJAMI"
                    value={createSektor}
                    onChange={(e) => setCreateSektor(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="relative" ref={problemBoxRef}>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  Event Problem / Analisa Masalah * <span className="text-[10px] text-blue-600 font-normal">(Ketik untuk saran problem)</span>
                </label>
                <input
                  type="text"
                  placeholder="Ketik problem, misal: Cassette 1 Fatal / Hopper / DSP / Out of Service..."
                  value={createProblem}
                  onFocus={() => { if (createProblem.trim()) setShowProblemSuggestions(true); }}
                  onChange={(e) => {
                    setCreateProblem(e.target.value);
                    setShowProblemSuggestions(true);
                  }}
                  className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 font-medium focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
                {showProblemSuggestions && problemSuggestions.length > 0 && (
                  <div className="absolute left-0 right-0 top-full mt-1 bg-white rounded-xl shadow-2xl border border-slate-200 z-50 max-h-52 overflow-y-auto divide-y divide-slate-100 animate-in fade-in zoom-in-95 duration-100">
                    <div className="p-1.5 bg-slate-50 text-[10px] font-semibold text-slate-500 border-b border-slate-100 sticky top-0 z-10 flex items-center justify-between">
                      <span>Saran Event Problem ({problemSuggestions.length}):</span>
                      <span className="text-[9px] text-blue-600 font-bold">Standar BCA</span>
                    </div>
                    {problemSuggestions.map((prob) => (
                      <button
                        key={prob}
                        type="button"
                        onClick={() => handleSelectProblemSuggestion(prob)}
                        className="w-full px-2.5 py-1.5 text-left hover:bg-blue-50/80 transition-colors text-xs text-slate-800 hover:text-blue-700 font-medium cursor-pointer flex items-center justify-between"
                      >
                        <span className="truncate">{prob}</span>
                        <span className="text-[10px] text-slate-400 shrink-0 ml-2">&larr; Pilih</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">Tingkat Prioritas</label>
                  <select
                    value={createPriority}
                    onChange={(e) => setCreatePriority(e.target.value as any)}
                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 font-semibold focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="NORMAL">NORMAL (SLA Standar 8 Jam)</option>
                    <option value="HIGH">HIGH (SLA Cepat 4 Jam)</option>
                    <option value="URGENT">URGENT (SLA Kritis 2 Jam)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">Kategori PIC Penanganan</label>
                  <select
                    value={createCategory}
                    onChange={(e) => setCreateCategory(e.target.value as any)}
                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 font-semibold focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="VENDOR">Vendor Mesin (Diebold/NCR/dll)</option>
                    <option value="FLM">Tim FLM Operasional</option>
                    <option value="SLM">Tim SLM</option>
                    <option value="CABANG">Pihak Cabang / Pengelola</option>
                    <option value="JALUR">Jalur Komunikasi / Telco</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  Instruksi Arahan untuk Tim Monitoring *
                </label>
                <textarea
                  rows={3}
                  placeholder="Tuliskan arahan tindakan yang harus diambil oleh tim monitoring, misal: 'Mesin ini sudah 4x problem dispenser dalam 2 hari, koordinasikan vendor untuk swap part hari ini juga'..."
                  value={createNote}
                  onChange={(e) => setCreateNote(e.target.value)}
                  className="w-full px-2.5 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-1 focus:ring-blue-500 leading-relaxed resize-none"
                />

                {/* Quick Chips Instruksi Arahan Ka Ops */}
                {instruksiChips.length > 0 && (
                  <div className="mt-2">
                    <span className="text-[10px] font-semibold text-slate-500 block mb-1">Pilihan Cepat Arahan:</span>
                    <div className="flex flex-wrap gap-1">
                      {instruksiChips.map((preset) => (
                        <button
                          key={preset}
                          type="button"
                          onClick={() => setCreateNote((prev) => (prev ? `${prev}. ${preset}` : preset))}
                          className="px-2 py-0.5 rounded bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 text-[10px] transition-colors cursor-pointer"
                        >
                          + {preset.length > 40 ? `${preset.slice(0, 40)}...` : preset}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="p-3 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="px-3 py-1.5 rounded-lg text-slate-600 hover:bg-slate-200 text-xs font-semibold transition-colors cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleSubmitCreateTicket}
                disabled={isSubmittingCreate}
                className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white text-xs font-bold shadow-2xs transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <Send size={13} />
                <span>{isSubmittingCreate ? 'Menerbitkan...' : 'Kirim Permintaan'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL 2: INPUT PROGRES OLEH MONITORING                    */}
      {/* ========================================================= */}
      {showProgressModal && activeTicket && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col">
            <div className="p-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-sm text-[#0D1C2E]">Update Progres Monitoring</h3>
                <p className="text-[11px] text-[#555F71]">
                  Tiket #{activeTicket.ticketId} &bull; {activeTicket.wsid} ({activeTicket.servicePoint})
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowProgressModal(false)}
                className="w-7 h-7 rounded-full hover:bg-slate-200 text-slate-400 hover:text-slate-700 flex items-center justify-center transition-colors cursor-pointer"
              >
                <X size={15} />
              </button>
            </div>

            <div className="p-4 space-y-3 text-xs">
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  Catatan Progres Tindakan *
                </label>
                <textarea
                  rows={3}
                  placeholder="Contoh: Vendor Diebold sudah dihubungi, teknisi sedang OTW ke lokasi..."
                  value={progressText}
                  onChange={(e) => setProgressText(e.target.value)}
                  className="w-full px-2.5 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-1 focus:ring-blue-500 leading-relaxed resize-none"
                />
              </div>

              {/* Quick Presets */}
              <div>
                <span className="text-[10px] font-semibold text-slate-500 block mb-1">Pilihan Cepat (Quick Chips):</span>
                <div className="flex flex-wrap gap-1">
                  {progressChips.map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setProgressText((prev) => (prev ? `${prev}. ${preset}` : preset))}
                      className="px-2 py-0.5 rounded bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 text-[10px] transition-colors cursor-pointer"
                    >
                      + {preset.length > 38 ? `${preset.slice(0, 38)}...` : preset}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="p-3 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowProgressModal(false)}
                className="px-3 py-1.5 rounded-lg text-slate-600 hover:bg-slate-200 text-xs font-semibold transition-colors cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleSaveProgress}
                disabled={isSavingProgress || !progressText.trim()}
                className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white text-xs font-bold shadow-2xs transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <Check size={13} />
                <span>{isSavingProgress ? 'Menyimpan...' : 'Simpan Progres'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL 3: REQ CLOSE OLEH MONITORING                        */}
      {/* ========================================================= */}
      {showReqCloseModal && activeTicket && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col">
            <div className="p-4 border-b border-indigo-100 bg-indigo-50/60 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-sm text-indigo-950">Ajukan Penutupan Tiket (Req Close)</h3>
                <p className="text-[11px] text-indigo-700">
                  Tiket #{activeTicket.ticketId} &bull; WSID {activeTicket.wsid}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowReqCloseModal(false)}
                className="w-7 h-7 rounded-full hover:bg-indigo-100 text-indigo-400 hover:text-indigo-800 flex items-center justify-center transition-colors cursor-pointer"
              >
                <X size={15} />
              </button>
            </div>

            <div className="p-4 space-y-3 text-xs">
              <div className="p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-[11px] text-amber-900 leading-relaxed">
                <strong>Catatan Sistem:</strong> Tiket tidak langsung tertutup permanen. Pengajuan Anda akan masuk ke antrean validasi Ka Ops / Ka Wil untuk persetujuan akhir.
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  Catatan Penyelesaian & Hasil Tindakan *
                </label>
                <textarea
                  rows={3}
                  placeholder="Contoh: Teknisi vendor Diebold sudah mengganti modul pick arm dispenser. Penarikan tunai test sukses dan problem sudah clear..."
                  value={reqCloseCatatan}
                  onChange={(e) => setReqCloseCatatan(e.target.value)}
                  className="w-full px-2.5 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-1 focus:ring-indigo-500 leading-relaxed resize-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  Kondisi Mesin Saat Ini
                </label>
                <select
                  value={reqCloseStatusMesin}
                  onChange={(e) => setReqCloseStatusMesin(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 font-semibold focus:outline-none focus:ring-1 focus:ring-indigo-500"
                >
                  <option value="Mesin Normal / Problem Teratasi">Mesin Normal / Problem Teratasi</option>
                  <option value="Mesin Sudah Online Transaksi">Mesin Sudah Online Transaksi</option>
                  <option value="Problem Selesai - Pemantauan Lanjut">Problem Selesai - Pemantauan Lanjut</option>
                </select>
              </div>
            </div>

            <div className="p-3 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowReqCloseModal(false)}
                className="px-3 py-1.5 rounded-lg text-slate-600 hover:bg-slate-200 text-xs font-semibold transition-colors cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleSubmitReqClose}
                disabled={isSubmittingReqClose || !reqCloseCatatan.trim()}
                className="px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white text-xs font-bold shadow-2xs transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <Send size={13} />
                <span>{isSubmittingReqClose ? 'Mengirim...' : 'Kirim Req Close'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL 4: VALIDASI TUTUP / RE-OPEN OLEH KA OPS / KA WIL    */}
      {/* ========================================================= */}
      {showValidationModal && activeTicket && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col">
            <div className="p-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-sm text-[#0D1C2E]">Validasi Penyelesaian Tiket</h3>
                <p className="text-[11px] text-[#555F71]">
                  Tiket #{activeTicket.ticketId} &bull; WSID {activeTicket.wsid}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowValidationModal(false)}
                className="w-7 h-7 rounded-full hover:bg-slate-200 text-slate-400 hover:text-slate-700 flex items-center justify-center transition-colors cursor-pointer"
              >
                <X size={15} />
              </button>
            </div>

            <div className="p-4 space-y-3 text-xs">
              {/* Info Pengajuan dari Monitoring */}
              {activeTicket.reqCloseInfo && (
                <div className="p-3 rounded-xl bg-indigo-50/70 border border-indigo-200 space-y-1">
                  <span className="text-[10px] font-bold text-indigo-900 uppercase tracking-wider block">
                    Pengajuan Tutup dari Tim Monitoring:
                  </span>
                  <p className="text-indigo-950 font-medium">"{activeTicket.reqCloseInfo.catatanPenyelesaian}"</p>
                  <p className="text-[10px] text-indigo-700">
                    Kondisi Mesin: <strong>{activeTicket.reqCloseInfo.statusMesinSaatReq}</strong> &bull; Oleh:{' '}
                    {activeTicket.reqCloseInfo.requestedBy}
                  </p>
                </div>
              )}

              {/* Pilihan Keputusan */}
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1.5">Keputusan Supervisor:</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setValidationDecision('CLOSED')}
                    className={`p-2.5 rounded-xl border text-center font-bold text-xs transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                      validationDecision === 'CLOSED'
                        ? 'bg-emerald-50 border-emerald-500 text-emerald-800 ring-1 ring-emerald-500'
                        : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <CheckCircle2 size={15} className={validationDecision === 'CLOSED' ? 'text-emerald-600' : 'text-slate-400'} />
                    <span>SETUJUI & TUTUP</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setValidationDecision('RE_OPEN')}
                    className={`p-2.5 rounded-xl border text-center font-bold text-xs transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                      validationDecision === 'RE_OPEN'
                        ? 'bg-rose-50 border-rose-500 text-rose-800 ring-1 ring-rose-500'
                        : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <RotateCcw size={15} className={validationDecision === 'RE_OPEN' ? 'text-rose-600' : 'text-slate-400'} />
                    <span>TOLAK & RE-OPEN</span>
                  </button>
                </div>
              </div>

              {/* Alasan Re-open jika Ditolak */}
              {validationDecision === 'RE_OPEN' ? (
                <div>
                  <label className="block text-[11px] font-bold text-rose-700 mb-1">
                    Alasan Penolakan / Re-Open * (Wajib Diisi)
                  </label>
                  <textarea
                    rows={3}
                    placeholder="Contoh: Saat dicek jam 15.00 mesin masih error dispense, mohon vendor dicek ulang sebelum ditinggal..."
                    value={validationReopenReason}
                    onChange={(e) => setValidationReopenReason(e.target.value)}
                    className="w-full px-2.5 py-2 rounded-lg border border-rose-300 focus:outline-none focus:ring-1 focus:ring-rose-500 leading-relaxed resize-none text-rose-900"
                  />
                </div>
              ) : (
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    Catatan Approval (Opsional)
                  </label>
                  <input
                    type="text"
                    placeholder="Contoh: Terverifikasi normal transaksi"
                    value={validationCatatanApproval}
                    onChange={(e) => setValidationCatatanApproval(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                </div>
              )}
            </div>

            <div className="p-3 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowValidationModal(false)}
                className="px-3 py-1.5 rounded-lg text-slate-600 hover:bg-slate-200 text-xs font-semibold transition-colors cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleSubmitValidation}
                disabled={isSubmittingValidation}
                className={`px-4 py-1.5 rounded-lg text-white text-xs font-bold shadow-2xs transition-all flex items-center gap-1.5 cursor-pointer ${
                  validationDecision === 'CLOSED' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-rose-600 hover:bg-rose-700'
                }`}
              >
                <Check size={13} />
                <span>
                  {isSubmittingValidation
                    ? 'Menyimpan...'
                    : validationDecision === 'CLOSED'
                    ? 'Konfirmasi Tutup Tiket'
                    : 'Kirim Re-Open ke Monitoring'}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL 5: DETAIL TIKET & TIMELINE LENGKAP                   */}
      {/* ========================================================= */}
      {showDetailModal && activeTicket && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-2xl w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[85vh]">
            <div className="p-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Ticket size={18} className="text-blue-600" />
                <div>
                  <h3 className="font-bold text-sm text-[#0D1C2E]">Detail Tiket #{activeTicket.ticketId}</h3>
                  <span className="text-[10px] text-slate-500">
                    WSID {activeTicket.wsid} &bull; {activeTicket.lokasi} ({activeTicket.servicePoint})
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => handleCopyWhatsApp(activeTicket)}
                  className="px-2.5 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer"
                >
                  <Share2 size={12} />
                  <span>Salin WA</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowDetailModal(false)}
                  className="w-7 h-7 rounded-full hover:bg-slate-200 text-slate-400 hover:text-slate-700 flex items-center justify-center transition-colors cursor-pointer"
                >
                  <X size={15} />
                </button>
              </div>
            </div>

            <div className="p-4 space-y-4 text-xs overflow-y-auto flex-1">
              {/* Meta Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 p-3 rounded-xl bg-slate-50 border border-slate-200">
                <div>
                  <span className="text-[10px] text-slate-400 block font-semibold">Service Point</span>
                  <span className="font-bold text-slate-800">{activeTicket.servicePoint}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 block font-semibold">Sektor</span>
                  <span className="font-bold text-slate-800">{activeTicket.sektor}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 block font-semibold">Vendor</span>
                  <span className="font-bold text-slate-800">{activeTicket.vendor}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 block font-semibold">Prioritas</span>
                  <span className="font-bold text-slate-800">{activeTicket.prioritas}</span>
                </div>
              </div>

              {/* Instruksi Ka Ops */}
              <div className="p-3 rounded-xl bg-blue-50/50 border border-blue-200">
                <span className="text-[10px] font-bold text-blue-900 uppercase tracking-wider block mb-0.5">
                  Instruksi Awal dari {activeTicket.createdBy}:
                </span>
                <p className="text-slate-800 leading-relaxed italic font-medium">"{activeTicket.catatanRequest}"</p>
                <span className="text-[10px] text-slate-400 block mt-1">
                  Diterbitkan: {new Date(activeTicket.createdAt).toLocaleString('id-ID')}
                </span>
              </div>

              {/* Status Box */}
              {activeTicket.status === 'RE_OPEN' && activeTicket.validationInfo?.alasanReopen && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200">
                  <span className="text-[10px] font-bold text-rose-800 uppercase tracking-wider block mb-0.5">
                    Alasan Re-Open oleh {activeTicket.validationInfo.validatedBy}:
                  </span>
                  <p className="text-rose-950 font-semibold">"{activeTicket.validationInfo.alasanReopen}"</p>
                </div>
              )}

              {activeTicket.reqCloseInfo && (
                <div className="p-3 rounded-xl bg-indigo-50 border border-indigo-200">
                  <span className="text-[10px] font-bold text-indigo-900 uppercase tracking-wider block mb-0.5">
                    Pengajuan Tutup (Req Close) oleh {activeTicket.reqCloseInfo.requestedBy}:
                  </span>
                  <p className="text-indigo-950 font-medium">"{activeTicket.reqCloseInfo.catatanPenyelesaian}"</p>
                  <span className="text-[10px] text-indigo-700 block mt-1">
                    Kondisi Mesin: {activeTicket.reqCloseInfo.statusMesinSaatReq}
                  </span>
                </div>
              )}

              {activeTicket.status === 'CLOSED' && activeTicket.validationInfo && (
                <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200">
                  <span className="text-[10px] font-bold text-emerald-800 uppercase tracking-wider block mb-0.5">
                    Tiket Ditutup Resmi oleh {activeTicket.validationInfo.validatedBy}:
                  </span>
                  <p className="text-emerald-950 font-medium">
                    {activeTicket.validationInfo.catatanApproval || 'Disetujui tanpa catatan tambahan.'}
                  </p>
                  <span className="text-[10px] text-emerald-700 block mt-1">
                    Waktu Selesai: {new Date(activeTicket.validationInfo.validatedAt).toLocaleString('id-ID')} &bull; Total SLA: {formatTicketDuration(activeTicket.createdAt, activeTicket.durasiMenitFinal)}
                  </span>
                </div>
              )}

              {/* Timeline Progres */}
              <div>
                <span className="text-[11px] font-bold text-slate-700 block mb-2">
                  Riwayat Progres Tindakan ({activeTicket.progresList?.length || 0}):
                </span>

                {(!activeTicket.progresList || activeTicket.progresList.length === 0) ? (
                  <p className="text-slate-400 italic text-[11px] p-3 rounded-lg bg-slate-50 border text-center">
                    Belum ada update tindakan penanganan dari tim monitoring.
                  </p>
                ) : (
                  <div className="relative pl-5 space-y-3 before:content-[''] before:absolute before:left-2 before:top-2 before:bottom-2 before:w-[2px] before:bg-slate-200">
                    {activeTicket.progresList.map((prog, pIdx) => (
                      <div key={prog.id || pIdx} className="relative text-xs">
                        <span className="absolute -left-5 top-1 w-2.5 h-2.5 rounded-full bg-blue-600 ring-2 ring-white"></span>
                        <div className="flex items-center gap-1.5 text-[10px] text-slate-400">
                          <strong className="text-slate-700">{prog.petugas}</strong>
                          <span>&bull;</span>
                          <span>{new Date(prog.waktu).toLocaleString('id-ID')}</span>
                        </div>
                        <p className="text-slate-800 font-medium mt-0.5 bg-slate-50 p-2 rounded-lg border border-slate-200">
                          {prog.catatan}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="p-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs">
              <span className="text-[11px] text-slate-500">
                Status Terkini: <strong>{activeTicket.status}</strong>
              </span>
              <button
                type="button"
                onClick={() => setShowDetailModal(false)}
                className="px-4 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-900 text-white font-semibold transition-colors cursor-pointer"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL 6: SET IDENTITAS PETUGAS                            */}
      {/* ========================================================= */}
      {showPetugasModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-sm w-full p-5 shadow-2xl border border-slate-200">
            <h3 className="font-bold text-sm text-[#0D1C2E] mb-1">Identitas Petugas Bertugas</h3>
            <p className="text-xs text-[#555F71] mb-3">
              Masukkan nama Anda untuk tanda tangan pembuatan tiket, update progres, atau validasi.
            </p>
            <input
              type="text"
              placeholder="Contoh: Budi Santoso"
              value={tempPetugasName}
              onChange={(e) => setTempPetugasName(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-blue-500 mb-3"
            />
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowPetugasModal(false)}
                className="px-3 py-1.5 rounded-lg text-slate-600 hover:bg-slate-100 text-xs font-semibold cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleSavePetugasName}
                disabled={!tempPetugasName.trim()}
                className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white text-xs font-bold shadow-2xs cursor-pointer"
              >
                Simpan
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
