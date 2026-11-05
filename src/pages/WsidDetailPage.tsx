import React, { useMemo, useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useDataStore } from '../store/useDataStore';
import {
  ArrowLeft,
  Server,
  Activity,
  ChevronDown,
  ChevronUp,
  Download,
  ShieldAlert,
  CheckCircle2,
  AlertTriangle,
  Ticket,
  Clock,
  Wrench,
  Plus,
  Check,
  Send,
  User,
  ChevronRight,
  History,
  FileText
} from 'lucide-react';
import { hwDetailMap } from '../utils/problemCalculator';
import { exportWsidDetailExcel, formatBulanTahun, normalizePeriode } from '../utils/comprehensiveExporter';
import { evaluateMachineHealth } from '../utils/slaHelper';
import {
  type FollowUpTicketItem,
  fetchFollowUpTicketsModern,
  saveFollowUpTicketModern
} from '../utils/spreadsheetService';
import {
  getWsidPenangananHistoryApi,
  saveIncidentActionApi,
  type IncidentHistoryItem
} from '../utils/monitoringService';

export default function WsidDetailPage() {
  const { wsid } = useParams<{ wsid: string }>();
  const navigate = useNavigate();
  const { machines, rawMasterData, modernTickets, setModernTickets, addOrUpdateModernTicket } = useDataStore();
  const [expandedMonth, setExpandedMonth] = useState<string | null>(null);

  // States for Incident Action History & Tickets
  const [incidentHistory, setIncidentHistory] = useState<IncidentHistoryItem[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [showAddTicketProgress, setShowAddTicketProgress] = useState(false);
  const [newProgressNote, setNewProgressNote] = useState('');
  const [isSavingProgress, setIsSavingProgress] = useState(false);
  const [activeTabSection, setActiveTabSection] = useState<'TIKET' | 'LOG_TINDAKAN'>('TIKET');

  // Input tindakan langsung jika belum ada tiket
  const [showDirectActionForm, setShowDirectActionForm] = useState(false);
  const [directActionText, setDirectActionText] = useState('');
  const [directActionCategory, setDirectActionCategory] = useState<'PENANGANAN' | 'UPDATE'>('PENANGANAN');
  const [isSavingDirectAction, setIsSavingDirectAction] = useState(false);

  const cleanWsid = useMemo(() => (wsid || '').trim().toUpperCase(), [wsid]);

  const machine = useMemo(() => {
    const found = machines.find((m) => (m.wsid || '').trim().toUpperCase() === cleanWsid);
    if (found) return found;

    const foundRaw = (rawMasterData || []).find(
      (m: any) => String(m.wsid || m.WSID || '').trim().toUpperCase() === cleanWsid
    );
    if (foundRaw) {
      return {
        wsid: foundRaw.wsid || foundRaw.WSID,
        lokasi: foundRaw.lokasi || foundRaw['Nama Lokasi'] || '-',
        vendor: foundRaw.vendor || foundRaw.Vendor || '-',
        tipeMesin: foundRaw.tipeMesin || foundRaw['Tipe Mesin'] || '-',
        sektorBCA: foundRaw.sektorBCA || foundRaw.Sektor || '-',
        wilayahOperasional: foundRaw.wilayahOperasional || '-',
        monthlyData: []
      } as any;
    }
    return null;
  }, [machines, rawMasterData, cleanWsid]);

  // Load ticket & incident actions data for this WSID
  useEffect(() => {
    if (cleanWsid) {
      // 1. Refresh modern tickets jika belum terisi
      if (!modernTickets || modernTickets.length === 0) {
        fetchFollowUpTicketsModern().then((res) => {
          if (res.success && res.tickets) {
            setModernTickets(res.tickets);
          }
        });
      }

      // 2. Ambil riwayat tindakan / penanganan insiden dari server Supabase
      setIsLoadingHistory(true);
      getWsidPenangananHistoryApi(cleanWsid)
        .then((res) => {
          if (res.success && res.history) {
            setIncidentHistory(res.history);
          }
        })
        .catch((err) => console.warn('Gagal memuat riwayat tindakan WSID:', err))
        .finally(() => setIsLoadingHistory(false));
    }
  }, [cleanWsid]);

  // Filter tiket milik WSID ini
  const wsidTickets = useMemo(() => {
    return (modernTickets || []).filter(
      (t) => (t.wsid || '').trim().toUpperCase() === cleanWsid
    );
  }, [modernTickets, cleanWsid]);

  const activeTicket = useMemo(() => {
    return wsidTickets.find((t) => t.status !== 'CLOSED') || null;
  }, [wsidTickets]);

  const closedTickets = useMemo(() => {
    return wsidTickets.filter((t) => t.status === 'CLOSED');
  }, [wsidTickets]);

  // Handler tambah tindakan / progres pada tiket aktif
  const handleSaveTicketProgress = async () => {
    if (!activeTicket || !newProgressNote.trim()) return;

    setIsSavingProgress(true);
    const nowIso = new Date().toISOString();
    const petugasName = localStorage.getItem('MONITORING_PETUGAS_NAME') || sessionStorage.getItem('PETUGAS_NAME') || 'Petugas Monitoring';

    const updatedList = [
      ...(activeTicket.progresList || []),
      {
        id: `PRG-${Date.now()}`,
        waktu: nowIso,
        petugas: petugasName,
        catatan: newProgressNote.trim()
      }
    ];

    const updatedTicket: FollowUpTicketItem = {
      ...activeTicket,
      status: activeTicket.status === 'OPEN' ? 'IN_PROGRESS' : activeTicket.status,
      progresList: updatedList,
      updatedAt: nowIso
    };

    try {
      addOrUpdateModernTicket(updatedTicket);
      await saveFollowUpTicketModern(updatedTicket);
      setNewProgressNote('');
      setShowAddTicketProgress(false);
    } catch (e: any) {
      alert('Gagal menyimpan progres tiket: ' + (e?.message || e));
    } finally {
      setIsSavingProgress(false);
    }
  };

  // Handler tambah catatan penanganan langsung ke log insiden mesin
  const handleSaveDirectAction = async () => {
    if (!directActionText.trim() || !cleanWsid) return;

    setIsSavingDirectAction(true);
    const petugasName = localStorage.getItem('MONITORING_PETUGAS_NAME') || sessionStorage.getItem('PETUGAS_NAME') || 'Petugas Monitoring';
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const nowFullStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
    const fakeKey = `DIRECT_${cleanWsid}_${Date.now()}`;

    const newHist: IncidentHistoryItem = {
      logId: `ACT_${Date.now()}`,
      waktu: nowFullStr,
      incidentKey: fakeKey,
      wsid: cleanWsid,
      eventCodeDesc: machine?.tipeMesin ? `Penanganan Mesin ${machine.tipeMesin}` : 'Penanganan Mesin',
      tipe: directActionCategory,
      isiAction: directActionText.trim(),
      namaPetugas: petugasName,
      statusSebelum: 'OPEN',
      statusSesudah: 'OPEN',
      catatan: 'Input langsung dari Detail Mesin'
    };

    setIncidentHistory((prev) => [newHist, ...prev]);

    try {
      await saveIncidentActionApi({
        incidentKey: fakeKey,
        monthStr: `${now.getFullYear()}-${pad(now.getMonth() + 1)}`,
        wsid: cleanWsid,
        eventCodeDesc: newHist.eventCodeDesc,
        isiAction: directActionText.trim(),
        kategori: directActionCategory,
        namaPetugas: petugasName
      });
      setDirectActionText('');
      setShowDirectActionForm(false);
    } catch (err) {
      console.warn('Gagal sinkron log tindakan server:', err);
    } finally {
      setIsSavingDirectAction(false);
    }
  };

  if (!machine) {
    return (
      <div className="flex flex-col items-center justify-center h-[50vh] space-y-4">
        <Server size={48} className="text-slate-300" />
        <h2 className="text-2xl font-bold text-slate-700">WSID Tidak Ditemukan</h2>
        <p className="text-slate-500">Mesin dengan WSID {wsid} tidak ada dalam database aktif.</p>
        <button
          onClick={() => navigate('/all-wsid')}
          className="px-4 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors shadow-sm font-semibold cursor-pointer"
        >
          Kembali ke Daftar WSID
        </button>
      </div>
    );
  }

  // Sort monthlyData by periode (Bulan) chronologically ascending
  const sortedMonthlyData = [...(machine.monthlyData || [])].sort((a, b) =>
    normalizePeriode(a.periode).localeCompare(normalizePeriode(b.periode))
  );

  const latestHealth = machine ? evaluateMachineHealth(machine) : null;

  const formatNum = (val: number | undefined) => {
    if (val === undefined) return 0;
    return typeof val === 'number' && !Number.isInteger(val) ? val.toFixed(2) : val;
  };

  const formatBulan = (periode: string) => {
    return formatBulanTahun(periode);
  };

  const toggleExpand = (periode: string) => {
    setExpandedMonth((prev) => (prev === periode ? null : periode));
  };

  const handleExport = () => {
    exportWsidDetailExcel(machine);
  };

  return (
    <div className="space-y-4 max-w-[1600px] mx-auto animate-fade-in pb-10">
      {/* Header Area */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-2.5 mb-1">
        <div className="flex items-center gap-2.5">
          <button
            onClick={() => navigate('/all-wsid')}
            className="w-8 h-8 bg-white border border-[#E5EAF2] rounded-lg hover:bg-slate-50 text-slate-600 flex items-center justify-center transition-colors shadow-2xs cursor-pointer"
            title="Kembali ke Daftar WSID"
          >
            <ArrowLeft size={16} />
          </button>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-lg font-bold text-slate-900 tracking-tight flex items-center gap-1.5">
                <Activity size={18} className="text-blue-600" />
                Detail Mesin &amp; Performa: {machine.wsid}
              </h2>
              {activeTicket && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-100 text-indigo-700 border border-indigo-200 flex items-center gap-1">
                  <Ticket size={11} />
                  <span>Tiket Follow Up #{activeTicket.ticketId} Aktif</span>
                </span>
              )}
            </div>
            <div className="text-slate-500 mt-0.5 flex items-center flex-wrap gap-1.5 text-xs">
              <span className="font-semibold text-slate-700">{machine.lokasi}</span>
              <span className="text-slate-300">•</span>
              <span className="font-medium text-slate-700 bg-slate-100 px-1.5 py-0.2 rounded border border-slate-200 text-[10px]">
                Vendor: {machine.vendor || '-'}
              </span>
              <span className="text-slate-300">•</span>
              <span>{machine.tipeMesin}</span>
              {machine.sektorBCA && (
                <>
                  <span className="text-slate-300">•</span>
                  <span className="font-medium text-slate-700 bg-blue-50 text-blue-700 px-1.5 py-0.2 rounded text-[10px] border border-blue-100">
                    Sektor: {machine.sektorBCA}
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        <button
          onClick={handleExport}
          className="flex items-center gap-1.5 px-3.5 h-8.5 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors text-xs shadow-2xs whitespace-nowrap self-start md:self-auto cursor-pointer"
        >
          <Download size={14} />
          <span>Export Excel</span>
        </button>
      </div>

      {/* SLA & Health Status Overview Card */}
      {latestHealth && (
        <div className="p-3.5 rounded-xl border border-[#E5EAF2] bg-white shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span
                className={`px-2 py-0.5 rounded-md text-[10px] font-semibold border ${latestHealth.badgeColor} flex items-center gap-1`}
              >
                {latestHealth.status === 'SAFE' && <CheckCircle2 size={12} />}
                {latestHealth.status === 'WARNING' && <AlertTriangle size={12} />}
                {latestHealth.status === 'CRITICAL' && <ShieldAlert size={12} />}
                Status: {latestHealth.statusLabel}
              </span>
              <span className="text-[10px] font-medium px-2 py-0.5 rounded bg-slate-50 border border-[#E5EAF2] text-slate-700">
                Target SLA: {latestHealth.targetSla}% ({machine.jenisMesin || 'ATM'})
              </span>
              <span
                className={`text-[10px] font-semibold px-2 py-0.5 rounded border ${
                  latestHealth.currentUptime >= latestHealth.targetSla
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    : 'bg-rose-50 text-rose-700 border-rose-200'
                }`}
              >
                Uptime Terkini: {latestHealth.currentUptime}%
              </span>
              {latestHealth.consecutiveLowMonths > 0 && (
                <span className="text-[10px] font-medium px-2 py-0.5 rounded bg-purple-50 border border-purple-200 text-purple-700">
                  {latestHealth.consecutiveLowMonths} Bulan Berturut di bawah SLA{' '}
                  {latestHealth.isChronicCritical ? '(Kronis Kritis)' : '(Waspada)'}
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-600 pt-0.5">
              {latestHealth.status === 'SAFE'
                ? 'Performa mesin prima memenuhi standar SLA operasional BCA.'
                : `Alasan utama: ${latestHealth.primaryReason}`}
            </p>
          </div>

          {latestHealth.status !== 'SAFE' && latestHealth.reasons.length > 0 && (
            <div className="bg-slate-50 p-2.5 rounded-lg border border-[#E5EAF2] text-xs text-slate-700 max-w-lg shrink-0">
              <div className="font-semibold text-slate-800 mb-1 flex items-center gap-1 text-[10px]">
                <AlertTriangle size={12} className="text-amber-500" />
                <span>Rincian Faktor Masalah:</span>
              </div>
              <ul className="space-y-0.5 text-[10px] list-disc list-inside text-slate-600">
                {latestHealth.reasons.map((r, i) => (
                  <li key={i} className="leading-tight">
                    {r}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* ===================================================================== */}
      {/* SEKSI UTAMA: TIKET FOLLOW UP & LOG TINDAKAN PENANGANAN MESIN */}
      {/* ===================================================================== */}
      <div className="bg-white rounded-xl shadow-2xs border border-[#E5EAF2] overflow-hidden">
        {/* Navigation Tabs Header */}
        <div className="bg-slate-50/80 px-4 py-3 border-b border-[#E5EAF2] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setActiveTabSection('TIKET')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                activeTabSection === 'TIKET'
                  ? 'bg-indigo-600 text-white shadow-2xs'
                  : 'bg-white hover:bg-slate-100 text-slate-600 border border-slate-200'
              }`}
            >
              <Ticket size={13} />
              <span>Tiket Follow Up &amp; Tindakan ({wsidTickets.length})</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTabSection('LOG_TINDAKAN')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                activeTabSection === 'LOG_TINDAKAN'
                  ? 'bg-blue-600 text-white shadow-2xs'
                  : 'bg-white hover:bg-slate-100 text-slate-600 border border-slate-200'
              }`}
            >
              <History size={13} />
              <span>Riwayat Log Insiden ({incidentHistory.length})</span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            {activeTabSection === 'TIKET' && activeTicket && (
              <button
                type="button"
                onClick={() => setShowAddTicketProgress((prev) => !prev)}
                className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs"
              >
                <Plus size={13} />
                <span>{showAddTicketProgress ? 'Batal' : 'Tambah Tindakan Tiket'}</span>
              </button>
            )}

            {activeTabSection === 'LOG_TINDAKAN' && (
              <button
                type="button"
                onClick={() => setShowDirectActionForm((prev) => !prev)}
                className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs"
              >
                <Plus size={13} />
                <span>{showDirectActionForm ? 'Batal' : 'Catat Penanganan Baru'}</span>
              </button>
            )}
          </div>
        </div>

        {/* TAB 1: TIKET FOLLOW UP & TINDAKAN PENANGANAN */}
        {activeTabSection === 'TIKET' && (
          <div className="p-4 sm:p-5 space-y-4">
            {/* Form Tambah Tindakan Progres Tiket jika aktif */}
            {showAddTicketProgress && activeTicket && (
              <div className="p-4 rounded-xl bg-indigo-50/60 border border-indigo-200 space-y-3 animate-in fade-in duration-150">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-indigo-900 flex items-center gap-1.5">
                    <Wrench size={14} className="text-indigo-600" />
                    <span>Catat Tindakan / Progres pada Tiket #{activeTicket.ticketId}</span>
                  </span>
                  <span className="text-[11px] text-indigo-700 font-medium">WSID: {cleanWsid}</span>
                </div>

                <textarea
                  rows={2}
                  value={newProgressNote}
                  onChange={(e) => setNewProgressNote(e.target.value)}
                  placeholder="Contoh: Teknisi vendor Diebold tiba di lokasi, penggantian dispenser roll selesai & test normal..."
                  className="w-full p-2.5 rounded-lg border border-indigo-200 bg-white text-xs outline-none focus:ring-1 focus:ring-indigo-500"
                />

                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowAddTicketProgress(false)}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-100 cursor-pointer"
                  >
                    Batal
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveTicketProgress}
                    disabled={isSavingProgress || !newProgressNote.trim()}
                    className="px-4 py-1.5 rounded-lg text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white disabled:bg-slate-300 transition-all cursor-pointer flex items-center gap-1.5"
                  >
                    {isSavingProgress ? (
                      <>
                        <Clock size={13} className="animate-spin" />
                        <span>Menyimpan...</span>
                      </>
                    ) : (
                      <>
                        <Check size={13} />
                        <span>Simpan Tindakan</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}

            {wsidTickets.length === 0 ? (
              <div className="py-8 text-center text-slate-500">
                <Ticket size={32} className="mx-auto text-slate-300 mb-2" />
                <h4 className="font-semibold text-slate-700 text-xs">Belum Ada Tiket Follow Up</h4>
                <p className="text-[11px] text-slate-400 mt-1 max-w-sm mx-auto">
                  Tiket follow up yang diterbitkan dari Menu Frekuensi atau Menu Tiket untuk WSID ini akan tercatat
                  secara otomatis di sini beserta seluruh tindakan lapangannya.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {wsidTickets.map((t) => (
                  <div
                    key={t.ticketId}
                    className={`rounded-xl border transition-all ${
                      t.status === 'CLOSED'
                        ? 'bg-slate-50/70 border-slate-200 opacity-90'
                        : 'bg-white border-indigo-200 shadow-xs ring-1 ring-indigo-500/10'
                    }`}
                  >
                    {/* Header Tiket */}
                    <div className="p-3.5 border-b border-slate-100 flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono font-bold text-xs text-indigo-700 bg-indigo-50 px-2.5 py-0.5 rounded-md border border-indigo-200">
                          #{t.ticketId}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            t.status === 'CLOSED'
                              ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                              : t.status === 'REQ_CLOSE'
                              ? 'bg-purple-100 text-purple-700 border border-purple-200'
                              : t.status === 'IN_PROGRESS'
                              ? 'bg-blue-100 text-blue-700 border border-blue-200'
                              : 'bg-amber-100 text-amber-800 border border-amber-200'
                          }`}
                        >
                          {t.status === 'REQ_CLOSE' ? 'MENUNGGU VALIDASI' : t.status}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                            t.prioritas === 'URGENT'
                              ? 'bg-rose-100 text-rose-700 border border-rose-200'
                              : t.prioritas === 'HIGH'
                              ? 'bg-amber-100 text-amber-700 border border-amber-200'
                              : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          Prioritas: {t.prioritas}
                        </span>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-600">
                          Kategori: {t.kategori}
                        </span>
                      </div>

                      <div className="flex items-center gap-2 text-[11px] text-slate-400">
                        <Clock size={12} />
                        <span>{new Date(t.createdAt).toLocaleString('id-ID')}</span>
                        <span>&bull;</span>
                        <span>
                          Oleh: <strong>{t.createdBy}</strong>
                        </span>
                      </div>
                    </div>

                    {/* Problem & Catatan Request */}
                    <div className="p-3.5 space-y-2">
                      <div className="text-xs">
                        <span className="text-slate-400 text-[11px]">Problem Terkait: </span>
                        <strong className="text-slate-800">{t.problem}</strong>
                      </div>
                      {t.catatanRequest && (
                        <div className="p-2.5 rounded-lg bg-amber-50/70 border border-amber-200 text-xs text-amber-900 leading-relaxed">
                          <span className="font-semibold text-amber-800 block text-[10px] uppercase mb-0.5">
                            Arahan / Instruksi Request:
                          </span>
                          {t.catatanRequest}
                        </div>
                      )}

                      {/* Timeline Tindakan / Progres Tiket */}
                      <div className="mt-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                            <Wrench size={12} className="text-indigo-600" />
                            <span>Tindakan &amp; Progres Penanganan ({(t.progresList || []).length}):</span>
                          </span>
                        </div>

                        {!t.progresList || t.progresList.length === 0 ? (
                          <p className="text-[11px] text-slate-400 italic bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                            Belum ada catatan tindakan yang dimasukkan untuk tiket ini.
                          </p>
                        ) : (
                          <div className="space-y-1.5">
                            {t.progresList.map((prg, pIdx) => (
                              <div
                                key={prg.id || pIdx}
                                className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 flex items-start justify-between gap-3 text-xs"
                              >
                                <div className="space-y-0.5 flex-1 min-w-0">
                                  <div className="flex items-center gap-2 text-[10px]">
                                    <span className="font-semibold text-indigo-700 bg-indigo-50 px-1.5 py-0.2 rounded border border-indigo-200">
                                      Tindakan #{pIdx + 1}
                                    </span>
                                    <strong className="text-slate-800">{prg.petugas}</strong>
                                    <span className="text-slate-400">
                                      &bull; {new Date(prg.waktu).toLocaleString('id-ID')}
                                    </span>
                                  </div>
                                  <p className="text-slate-700 leading-relaxed pt-0.5 text-xs font-medium">
                                    {prg.catatan}
                                  </p>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Catatan Request Close */}
                        {t.reqCloseInfo && (
                          <div className="p-2.5 rounded-lg bg-purple-50 border border-purple-200 text-xs text-purple-900 space-y-0.5 mt-2">
                            <div className="flex items-center gap-1.5 font-bold text-[10px] uppercase text-purple-800">
                              <CheckCircle2 size={12} />
                              <span>Catatan Pengajuan Selesai (Req Close):</span>
                              <span className="text-purple-600 font-normal">
                                ({t.reqCloseInfo.requestedBy} &bull;{' '}
                                {new Date(t.reqCloseInfo.requestedAt).toLocaleString('id-ID')})
                              </span>
                            </div>
                            <p className="leading-relaxed">{t.reqCloseInfo.catatanPenyelesaian}</p>
                          </div>
                        )}

                        {/* Validasi Approval Closed */}
                        {t.status === 'CLOSED' && t.validationInfo && (
                          <div className="p-2.5 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-900 space-y-0.5 mt-1">
                            <div className="flex items-center gap-1.5 font-bold text-[10px] uppercase text-emerald-800">
                              <ShieldCheck size={12} />
                              <span>Tiket Tervalidasi Selesai (Closed):</span>
                              <span className="text-emerald-600 font-normal">
                                ({t.validationInfo.validatedBy} &bull;{' '}
                                {new Date(t.validationInfo.validatedAt).toLocaleString('id-ID')})
                              </span>
                            </div>
                            {t.validationInfo.catatanApproval && (
                              <p className="leading-relaxed">{t.validationInfo.catatanApproval}</p>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 2: RIWAYAT LOG TINDAKAN INSIDEN (DARI CEK DAILY & FREKUENSI) */}
        {activeTabSection === 'LOG_TINDAKAN' && (
          <div className="p-4 sm:p-5 space-y-4">
            {/* Form Catat Penanganan Langsung jika aktif */}
            {showDirectActionForm && (
              <div className="p-4 rounded-xl bg-blue-50/60 border border-blue-200 space-y-3 animate-in fade-in duration-150">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-blue-900 flex items-center gap-1.5">
                    <Wrench size={14} className="text-blue-600" />
                    <span>Catat Tindakan / Penanganan Mesin {cleanWsid}</span>
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] font-semibold text-slate-700 block mb-1">Kategori:</label>
                    <select
                      value={directActionCategory}
                      onChange={(e) => setDirectActionCategory(e.target.value as any)}
                      className="w-full h-8.5 px-3 rounded-lg text-xs font-semibold border border-slate-200 bg-white"
                    >
                      <option value="PENANGANAN">PENANGANAN (Perbaikan Fisik/Teknis Mesin)</option>
                      <option value="UPDATE">UPDATE (Info Progres Lapangan/Koordinasi)</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="text-[11px] font-semibold text-slate-700 block mb-1">Isi Tindakan Penanganan:</label>
                  <textarea
                    rows={2}
                    value={directActionText}
                    onChange={(e) => setDirectActionText(e.target.value)}
                    placeholder="Contoh: Pembersihan sensor bunch notes, ganti roll thermal receipt printer, dispense aman..."
                    className="w-full p-2.5 rounded-lg border border-slate-200 bg-white text-xs outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>

                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowDirectActionForm(false)}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-100 cursor-pointer"
                  >
                    Batal
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveDirectAction}
                    disabled={isSavingDirectAction || !directActionText.trim()}
                    className="px-4 py-1.5 rounded-lg text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white disabled:bg-slate-300 transition-all cursor-pointer flex items-center gap-1.5"
                  >
                    {isSavingDirectAction ? (
                      <>
                        <Clock size={13} className="animate-spin" />
                        <span>Menyimpan...</span>
                      </>
                    ) : (
                      <>
                        <Check size={13} />
                        <span>Simpan Penanganan</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}

            {isLoadingHistory ? (
              <div className="py-8 text-center text-slate-400 text-xs">
                <Clock size={20} className="animate-spin mx-auto mb-2 text-blue-600" />
                <span>Memuat riwayat log tindakan dari server...</span>
              </div>
            ) : incidentHistory.length === 0 ? (
              <div className="py-8 text-center text-slate-500">
                <FileText size={32} className="mx-auto text-slate-300 mb-2" />
                <h4 className="font-semibold text-slate-700 text-xs">Belum Ada Riwayat Tindakan Tercatat</h4>
                <p className="text-[11px] text-slate-400 mt-1 max-w-sm mx-auto">
                  Tindakan yang diinput melalui Cek Daily atau Tab Frekuensi untuk mesin ini akan tampil di sini.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {incidentHistory.map((hist, hIdx) => (
                  <div
                    key={hist.logId || hIdx}
                    className="p-3 rounded-xl bg-slate-50/70 border border-slate-200 flex items-start justify-between gap-3 text-xs"
                  >
                    <div className="space-y-1 flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            hist.tipe === 'PENANGANAN' || hist.isiAction.includes('[PENANGANAN]')
                              ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                              : 'bg-sky-100 text-sky-800 border border-sky-300'
                          }`}
                        >
                          {hist.tipe === 'PENANGANAN' || hist.isiAction.includes('[PENANGANAN]')
                            ? 'PENANGANAN'
                            : 'UPDATE'}
                        </span>
                        <strong className="text-slate-800">{hist.namaPetugas || 'Petugas'}</strong>
                        <span className="text-slate-400 text-[11px]">&bull; {hist.waktu}</span>
                        {hist.eventCodeDesc && (
                          <span className="text-[10px] font-semibold text-slate-500 bg-white px-1.5 py-0.2 rounded border border-slate-200">
                            Problem: {hist.eventCodeDesc}
                          </span>
                        )}
                      </div>
                      <p className="text-slate-700 font-medium leading-relaxed pt-0.5">{hist.isiAction}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ===================================================================== */}
      {/* TABEL DOWNTIME BULANAN & RINCIAN KATEGORI */}
      {/* ===================================================================== */}
      <div className="bg-white rounded-xl shadow-2xs border border-[#E5EAF2] overflow-hidden">
        <div className="px-4 py-3 bg-slate-50/70 border-b border-[#E5EAF2] flex items-center justify-between">
          <span className="text-xs font-bold text-slate-800">
            Riwayat Downtime Bulanan Mesin ({sortedMonthlyData.length} Periode)
          </span>
          <span className="text-[11px] text-slate-500">Klik baris hardware untuk melihat rincian sub-kategori</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-center border-collapse">
            <thead className="sticky top-0 z-10 text-[11px]">
              <tr className="bg-[#F8FAFC] text-slate-700 font-semibold border-b border-[#E5EAF2]">
                <th rowSpan={2} className="px-2.5 py-1.5 border-r border-[#E5EAF2] align-middle text-left font-semibold">
                  Bulan
                </th>
                <th
                  colSpan={3}
                  className="px-2.5 py-1 border-b border-r border-[#E5EAF2] bg-blue-50/50 text-blue-900 font-semibold"
                >
                  Total Downtime
                </th>
                <th colSpan={3} className="px-2.5 py-1 border-b border-r border-[#E5EAF2] font-semibold">
                  Uang Habis (UH)
                </th>
                <th colSpan={3} className="px-2.5 py-1 border-b border-r border-[#E5EAF2] font-semibold">
                  Komunikasi (KOM)
                </th>
                <th colSpan={3} className="px-2.5 py-1 border-b border-r border-[#E5EAF2] font-semibold">
                  Uang Penuh (UP)
                </th>
                <th colSpan={3} className="px-2.5 py-1 border-b border-r border-[#E5EAF2] font-semibold">
                  Hardware (H/W)
                </th>
                <th colSpan={3} className="px-3 py-1.5 border-b border-[#E5EAF2] font-semibold">
                  Lain-lain (LL)
                </th>
              </tr>
              <tr className="bg-slate-50 text-slate-500 text-[11px] border-b border-[#E5EAF2]">
                {/* Total */}
                <th className="px-2 py-1.5 font-medium border-r border-[#E5EAF2] bg-blue-50/70 text-blue-800">FRX</th>
                <th className="px-2 py-1.5 font-medium border-r border-[#E5EAF2] bg-blue-50/70 text-blue-800">DUR</th>
                <th className="px-2 py-1.5 font-medium border-r border-[#E5EAF2] bg-blue-50/70 text-blue-800">%</th>
                {/* UH */}
                <th className="px-2 py-1.5 font-medium border-r border-[#E5EAF2]">FRX</th>
                <th className="px-2 py-1.5 font-medium border-r border-[#E5EAF2]">DUR</th>
                <th className="px-2 py-1.5 font-medium border-r border-[#E5EAF2]">%</th>
                {/* KOM */}
                <th className="px-2 py-1.5 font-medium border-r border-[#E5EAF2]">FRX</th>
                <th className="px-2 py-1.5 font-medium border-r border-[#E5EAF2]">DUR</th>
                <th className="px-2 py-1.5 font-medium border-r border-[#E5EAF2]">%</th>
                {/* UP */}
                <th className="px-2 py-1.5 font-medium border-r border-[#E5EAF2]">FRX</th>
                <th className="px-2 py-1.5 font-medium border-r border-[#E5EAF2]">DUR</th>
                <th className="px-2 py-1.5 font-medium border-r border-[#E5EAF2]">%</th>
                {/* HW */}
                <th className="px-2 py-1.5 font-medium border-r border-[#E5EAF2]">FRX</th>
                <th className="px-2 py-1.5 font-medium border-r border-[#E5EAF2]">DUR</th>
                <th className="px-2 py-1.5 font-medium border-r border-[#E5EAF2]">%</th>
                {/* LL */}
                <th className="px-2 py-1.5 font-medium border-r border-[#E5EAF2]">FRX</th>
                <th className="px-2 py-1.5 font-medium border-r border-[#E5EAF2]">DUR</th>
                <th className="px-2 py-1.5 font-medium">%</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E5EAF2] text-slate-700">
              {sortedMonthlyData.length === 0 ? (
                <tr>
                  <td colSpan={19} className="px-4 py-10 text-center text-slate-400">
                    Tidak ada data bulanan untuk WSID ini.
                  </td>
                </tr>
              ) : (
                sortedMonthlyData.map((data, index) => {
                  const maxPct = Math.max(
                    data.uh || 0,
                    data.kom || 0,
                    data.up || 0,
                    data.hw || 0,
                    data.ll || 0
                  );
                  const getPctClass = (val: number | undefined) => {
                    const num = val || 0;
                    if (maxPct > 0 && num === maxPct) return 'text-rose-600 font-semibold';
                    return 'text-slate-700 font-medium';
                  };

                  return (
                    <React.Fragment key={data.periode}>
                      <tr
                        className={`hover:bg-slate-50/70 transition-colors ${
                          index % 2 === 0 ? 'bg-white' : 'bg-[#F8FAFC]/50'
                        }`}
                      >
                        <td className="px-3 py-2.5 font-semibold text-slate-900 border-r border-[#E5EAF2] text-left">
                          {formatBulan(data.periode)}
                        </td>

                        {/* Total */}
                        <td className="px-2 py-2.5 border-r border-[#E5EAF2] bg-blue-50/30">
                          {formatNum(data.frxTotal)}
                        </td>
                        <td className="px-2 py-2.5 border-r border-[#E5EAF2] bg-blue-50/30">
                          {formatNum(data.durTotal)}
                        </td>
                        <td className="px-2 py-2.5 border-r border-[#E5EAF2] bg-blue-50/30 font-bold text-rose-600">
                          {formatNum(data.total)}%
                        </td>

                        {/* UH */}
                        <td className="px-2 py-2.5 border-r border-[#E5EAF2]">{formatNum(data.uhFrx)}</td>
                        <td className="px-2 py-2.5 border-r border-[#E5EAF2]">{formatNum(data.uhDur)}</td>
                        <td className={`px-2 py-2.5 border-r border-[#E5EAF2] ${getPctClass(data.uh)}`}>
                          {formatNum(data.uh)}%
                        </td>

                        {/* KOM */}
                        <td className="px-2 py-2.5 border-r border-[#E5EAF2]">{formatNum(data.komFrx)}</td>
                        <td className="px-2 py-2.5 border-r border-[#E5EAF2]">{formatNum(data.komDur)}</td>
                        <td className={`px-2 py-2.5 border-r border-[#E5EAF2] ${getPctClass(data.kom)}`}>
                          {formatNum(data.kom)}%
                        </td>

                        {/* UP */}
                        <td className="px-2 py-2.5 border-r border-[#E5EAF2]">{formatNum(data.upFrx)}</td>
                        <td className="px-2 py-2.5 border-r border-[#E5EAF2]">{formatNum(data.upDur)}</td>
                        <td className={`px-2 py-2.5 border-r border-[#E5EAF2] ${getPctClass(data.up)}`}>
                          {formatNum(data.up)}%
                        </td>

                        {/* HW */}
                        <td
                          colSpan={3}
                          className="border-r border-[#E5EAF2] p-0 cursor-pointer hover:bg-blue-50/30 transition-colors"
                          onClick={() => toggleExpand(data.periode)}
                        >
                          <div className="flex items-center justify-between px-2 py-2.5 h-full w-full">
                            <div className="flex-1 flex gap-2 justify-center">
                              <span className="w-8 text-center">{formatNum(data.hwFrx)}</span>
                              <span className="w-8 text-center">{formatNum(data.hwDur)}</span>
                              <span className={`w-10 text-center ${getPctClass(data.hw)}`}>
                                {formatNum(data.hw)}%
                              </span>
                            </div>
                            {expandedMonth === data.periode ? (
                              <ChevronUp size={14} className="text-blue-600" />
                            ) : (
                              <ChevronDown size={14} className="text-slate-400" />
                            )}
                          </div>
                        </td>

                        {/* LL */}
                        <td className="px-2 py-2.5 border-r border-[#E5EAF2]">{formatNum(data.llFrx)}</td>
                        <td className="px-2 py-2.5 border-r border-[#E5EAF2]">{formatNum(data.llDur)}</td>
                        <td className={`px-2 py-2.5 ${getPctClass(data.ll)}`}>{formatNum(data.ll)}%</td>
                      </tr>

                      {expandedMonth === data.periode && (
                        <tr>
                          <td colSpan={19} className="p-3 border-b border-[#E5EAF2] bg-[#F8FAFC]">
                            <div className="bg-white rounded-lg border border-[#E5EAF2] shadow-2xs overflow-hidden max-w-[700px] text-left">
                              <div className="bg-slate-50 px-3 py-1.5 border-b border-[#E5EAF2] text-slate-700 font-semibold text-xs">
                                Rincian Sub-Kategori Hardware
                              </div>
                              <table className="w-full text-xs text-left">
                                <thead className="bg-[#F8FAFC] border-b border-[#E5EAF2] text-slate-600 font-medium">
                                  <tr>
                                    <th className="px-3 py-1.5 border-r border-[#E5EAF2]">Sub-Kategori</th>
                                    <th className="px-3 py-1.5 border-r border-[#E5EAF2] text-center w-16">FRX</th>
                                    <th className="px-3 py-1.5 border-r border-[#E5EAF2] text-center w-16">DUR</th>
                                    <th className="px-3 py-1.5 text-center w-16">%</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-[#E5EAF2]">
                                  {(() => {
                                    const subEntries = Object.entries(data.hwSubCategories || {});
                                    const items =
                                      subEntries.length > 0
                                        ? subEntries.map(([key, vals]) => ({
                                            key,
                                            frx: vals.frx || 0,
                                            dur: vals.dur || 0,
                                            pct: vals.pct || 0
                                          }))
                                        : Object.entries(data.hwDetail || {}).map(([key, pct]) => ({
                                            key,
                                            frx: 0,
                                            dur: 0,
                                            pct: Number(pct) || 0
                                          }));

                                    const filtered = items.filter((i) => i.pct > 0 || i.frx > 0 || i.dur > 0);
                                    if (filtered.length === 0) {
                                      return (
                                        <tr>
                                          <td colSpan={4} className="px-3 py-2.5 text-center text-slate-400">
                                            Tidak ada detail sub-kategori hardware untuk bulan ini.
                                          </td>
                                        </tr>
                                      );
                                    }

                                    return filtered.map((item) => (
                                      <tr key={item.key} className="hover:bg-slate-50/70">
                                        <td className="px-3 py-1.5 border-r border-[#E5EAF2] text-slate-700">
                                          {hwDetailMap[item.key] || item.key}
                                        </td>
                                        <td className="px-3 py-1.5 border-r border-[#E5EAF2] text-center text-slate-700">
                                          {formatNum(item.frx)}
                                        </td>
                                        <td className="px-3 py-1.5 border-r border-[#E5EAF2] text-center text-slate-700">
                                          {formatNum(item.dur)}
                                        </td>
                                        <td
                                          className={`px-3 py-1.5 text-center ${
                                            item.pct > 1 ? 'text-rose-600 font-semibold' : 'text-slate-700'
                                          }`}
                                        >
                                          {formatNum(item.pct)}%
                                        </td>
                                      </tr>
                                    ));
                                  })()}
                                </tbody>
                              </table>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
