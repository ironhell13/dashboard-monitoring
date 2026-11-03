import React, { useState, useMemo } from 'react';
import {
  Settings,
  Sparkles,
  Users,
  Shield,
  Sliders,
  Cpu,
  Plus,
  Trash2,
  Edit3,
  RotateCcw,
  Check,
  Search,
  ArrowUp,
  ArrowDown,
  Info,
  CheckCircle2,
  AlertTriangle,
  X,
  Tag,
  Clock,
  Wrench,
  MessageSquare,
  FileText,
  ChevronRight,
  Database
} from 'lucide-react';
import {
  type QuickChipCategory,
  type QuickChipItem,
  QUICK_CHIP_CATEGORIES,
  useQuickChips
} from '../utils/quickChipsService';

interface SettingsPageProps {
  userRole?: 'KAWIL' | 'KAOPS' | 'MONITORING';
}

type SettingsSubMenu = 'QUICK_CHIPS' | 'ACCOUNTS' | 'SLA_CONFIG' | 'PROBLEM_WHITELIST';

export default function SettingsPage({ userRole = 'KAOPS' }: SettingsPageProps) {
  const [activeSubMenu, setActiveSubMenu] = useState<SettingsSubMenu>('QUICK_CHIPS');
  const [selectedCategory, setSelectedCategory] = useState<QuickChipCategory | 'ALL'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Toast Notification State
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'info' | 'error' } | null>(null);
  const showToast = (text: string, type: 'success' | 'info' | 'error' = 'success') => {
    setToastMessage({ text, type });
    setTimeout(() => {
      setToastMessage((prev) => (prev?.text === text ? null : prev));
    }, 3500);
  };

  // Quick Chips Hook (Reaktif)
  const { chips, addChip, updateChip, deleteChip, reorderChip, resetToDefault } = useQuickChips();

  // Modal State for Create / Edit
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingChip, setEditingChip] = useState<QuickChipItem | null>(null);
  const [formCategory, setFormCategory] = useState<QuickChipCategory>('UPDATE');
  const [formText, setFormText] = useState('');
  const [formError, setFormError] = useState('');

  // Modal State for Reset Confirmation
  const [isResetConfirmOpen, setIsResetConfirmOpen] = useState(false);

  // Filtered Chips based on category & search query
  const filteredChips = useMemo(() => {
    return chips.filter((c) => {
      const matchCategory = selectedCategory === 'ALL' || c.category === selectedCategory;
      const matchSearch = !searchQuery.trim() || c.text.toLowerCase().includes(searchQuery.trim().toLowerCase());
      return matchCategory && matchSearch;
    });
  }, [chips, selectedCategory, searchQuery]);

  // Counts per category
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { ALL: chips.length };
    QUICK_CHIP_CATEGORIES.forEach((cat) => {
      counts[cat.id] = chips.filter((c) => c.category === cat.id).length;
    });
    return counts;
  }, [chips]);

  const customChipsCount = useMemo(() => {
    return chips.filter((c) => c.isCustom).length;
  }, [chips]);

  // Open modal for Create
  const handleOpenCreateModal = (defaultCat?: QuickChipCategory) => {
    setEditingChip(null);
    setFormCategory(defaultCat || (selectedCategory !== 'ALL' ? selectedCategory : 'UPDATE'));
    setFormText('');
    setFormError('');
    setIsModalOpen(true);
  };

  // Open modal for Edit
  const handleOpenEditModal = (chip: QuickChipItem) => {
    setEditingChip(chip);
    setFormCategory(chip.category);
    setFormText(chip.text);
    setFormError('');
    setIsModalOpen(true);
  };

  // Submit Save (Create or Update)
  const handleSaveChip = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = formText.trim();
    if (!clean) {
      setFormError('Teks pilihan cepat tidak boleh kosong!');
      return;
    }

    try {
      if (editingChip) {
        updateChip(editingChip.id, { category: formCategory, text: clean });
        showToast('Pilihan cepat berhasil diperbarui!', 'success');
      } else {
        addChip(formCategory, clean);
        showToast('Pilihan cepat baru berhasil ditambahkan!', 'success');
      }
      setIsModalOpen(false);
      setEditingChip(null);
      setFormText('');
    } catch (err: any) {
      setFormError(err.message || 'Gagal menyimpan pilihan cepat');
    }
  };

  // Handle Delete
  const handleDeleteChip = (chip: QuickChipItem) => {
    if (window.confirm(`Yakin ingin menghapus pilihan cepat "${chip.text}"?`)) {
      deleteChip(chip.id);
      showToast('Pilihan cepat berhasil dihapus.', 'info');
    }
  };

  // Handle Reset to Default
  const handleConfirmReset = () => {
    resetToDefault();
    setIsResetConfirmOpen(false);
    showToast('Seluruh pilihan cepat telah dikembalikan ke bawaan sistem.', 'success');
  };

  // Helper untuk mendapatkan visual styling kategori
  const getCategoryMeta = (catId: QuickChipCategory) => {
    return QUICK_CHIP_CATEGORIES.find((c) => c.id === catId) || QUICK_CHIP_CATEGORIES[0];
  };

  const roleTitle = userRole === 'KAWIL' ? 'Kepala Wilayah (Ka Wil)' : 'Kepala Operasional (Ka Ops)';

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Toast Alert */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 animate-bounce">
          <div
            className={`flex items-center gap-2.5 px-4 py-3 rounded-xl shadow-lg border text-xs font-semibold ${
              toastMessage.type === 'success'
                ? 'bg-emerald-600 text-white border-emerald-500 shadow-emerald-500/20'
                : toastMessage.type === 'error'
                ? 'bg-rose-600 text-white border-rose-500 shadow-rose-500/20'
                : 'bg-slate-800 text-white border-slate-700 shadow-slate-900/30'
            }`}
          >
            {toastMessage.type === 'success' && <CheckCircle2 className="w-4 h-4 text-emerald-200" />}
            {toastMessage.type === 'error' && <AlertTriangle className="w-4 h-4 text-rose-200" />}
            {toastMessage.type === 'info' && <Info className="w-4 h-4 text-blue-200" />}
            <span>{toastMessage.text}</span>
          </div>
        </div>
      )}

      {/* Header Banner Super Admin */}
      <div className="rounded-2xl bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 text-white p-5 md:p-6 shadow-sm border border-slate-800 relative overflow-hidden">
        <div className="absolute right-0 top-0 translate-x-8 -translate-y-8 w-64 h-64 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 relative z-10">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-wider uppercase bg-blue-500/20 text-blue-300 border border-blue-400/30">
                Pusat Kontrol Super Admin
              </span>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-400/30">
                {roleTitle}
              </span>
            </div>
            <h1 className="text-xl md:text-2xl font-bold tracking-tight text-white flex items-center gap-2.5">
              <Settings className="w-6 h-6 text-blue-400" />
              Menu Setting & Konfigurasi Sistem
            </h1>
            <p className="text-xs md:text-sm text-slate-300 mt-1 max-w-2xl leading-relaxed">
              Kelola pengaturan terpusat dashboard eMons BCA. Sesuaikan pilihan cepat (quick chips), template instruksi,
              parameter toleransi downtime, serta konfigurasi operasional tingkat supervisor.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="bg-slate-800/80 backdrop-blur-xs border border-slate-700/80 rounded-xl p-3 flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-blue-600/30 border border-blue-500/40 flex items-center justify-center text-blue-400">
                <Tag className="w-5 h-5" />
              </div>
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block">Total Preset Aktif</span>
                <span className="text-lg font-extrabold text-white">{chips.length} Chips</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Setting Workspace: Sidebar Navigation + Content Area */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Sub-Menu Navigation */}
        <div className="lg:col-span-3 space-y-2">
          <div className="bg-white rounded-2xl border border-slate-200 p-3 shadow-2xs">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider px-3 py-2 block">
              Daftar Pengaturan
            </span>

            <div className="space-y-1">
              {/* 1. Sub Menu: Pilihan Cepat (Active) */}
              <button
                type="button"
                onClick={() => setActiveSubMenu('QUICK_CHIPS')}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer text-left ${
                  activeSubMenu === 'QUICK_CHIPS'
                    ? 'bg-blue-600 text-white shadow-sm shadow-blue-600/30'
                    : 'text-slate-700 hover:bg-slate-100'
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <Sparkles className={`w-4 h-4 shrink-0 ${activeSubMenu === 'QUICK_CHIPS' ? 'text-white' : 'text-blue-600'}`} />
                  <div className="truncate">
                    <span className="block font-bold">Pilihan Cepat</span>
                    <span className={`text-[10px] block truncate ${activeSubMenu === 'QUICK_CHIPS' ? 'text-blue-100' : 'text-slate-400'}`}>
                      Quick Chips Tindakan & Tiket
                    </span>
                  </div>
                </div>
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold shrink-0 ${
                    activeSubMenu === 'QUICK_CHIPS' ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  {chips.length}
                </span>
              </button>

              {/* 2. Sub Menu: Manajemen Akun & Hak Akses (Coming Soon) */}
              <button
                type="button"
                onClick={() => setActiveSubMenu('ACCOUNTS')}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer text-left ${
                  activeSubMenu === 'ACCOUNTS'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-700 hover:bg-slate-100'
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <Users className={`w-4 h-4 shrink-0 ${activeSubMenu === 'ACCOUNTS' ? 'text-white' : 'text-slate-500'}`} />
                  <div className="truncate">
                    <span className="block font-bold">Akun & Akses</span>
                    <span className={`text-[10px] block truncate ${activeSubMenu === 'ACCOUNTS' ? 'text-blue-100' : 'text-slate-400'}`}>
                      Password & Token Akses
                    </span>
                  </div>
                </div>
                <span className="text-[9px] px-1.5 py-0.5 rounded-full font-bold bg-amber-100 text-amber-800 border border-amber-200 shrink-0">
                  Segera
                </span>
              </button>

              {/* 3. Sub Menu: Parameter & Target SLA (Coming Soon) */}
              <button
                type="button"
                onClick={() => setActiveSubMenu('SLA_CONFIG')}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer text-left ${
                  activeSubMenu === 'SLA_CONFIG'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-700 hover:bg-slate-100'
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <Sliders className={`w-4 h-4 shrink-0 ${activeSubMenu === 'SLA_CONFIG' ? 'text-white' : 'text-slate-500'}`} />
                  <div className="truncate">
                    <span className="block font-bold">Target SLA</span>
                    <span className={`text-[10px] block truncate ${activeSubMenu === 'SLA_CONFIG' ? 'text-blue-100' : 'text-slate-400'}`}>
                      Toleransi & Batas Waktu
                    </span>
                  </div>
                </div>
                <span className="text-[9px] px-1.5 py-0.5 rounded-full font-bold bg-amber-100 text-amber-800 border border-amber-200 shrink-0">
                  Segera
                </span>
              </button>

              {/* 4. Sub Menu: Master Event Code & Whitelist (Coming Soon) */}
              <button
                type="button"
                onClick={() => setActiveSubMenu('PROBLEM_WHITELIST')}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer text-left ${
                  activeSubMenu === 'PROBLEM_WHITELIST'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-700 hover:bg-slate-100'
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <Cpu className={`w-4 h-4 shrink-0 ${activeSubMenu === 'PROBLEM_WHITELIST' ? 'text-white' : 'text-slate-500'}`} />
                  <div className="truncate">
                    <span className="block font-bold">Master Problem</span>
                    <span className={`text-[10px] block truncate ${activeSubMenu === 'PROBLEM_WHITELIST' ? 'text-blue-100' : 'text-slate-400'}`}>
                      Whitelist 35 Event Code
                    </span>
                  </div>
                </div>
                <span className="text-[9px] px-1.5 py-0.5 rounded-full font-bold bg-amber-100 text-amber-800 border border-amber-200 shrink-0">
                  Segera
                </span>
              </button>
            </div>
          </div>

          {/* Super Admin Info Card */}
          <div className="p-3.5 bg-blue-50/60 rounded-2xl border border-blue-200/80 text-[11px] text-blue-900 space-y-1.5">
            <div className="flex items-center gap-1.5 font-bold text-blue-950">
              <Shield className="w-3.5 h-3.5 text-blue-700" />
              <span>Otoritas Super Admin</span>
            </div>
            <p className="text-slate-600 leading-relaxed text-[11px]">
              Setiap perubahan pada Pilihan Cepat (Quick Chips) akan langsung tersimpan dan otomatis aktif secara real-time pada:
            </p>
            <ul className="list-disc pl-4 space-y-0.5 text-slate-700 text-[10px]">
              <li>Pop-up input Tindakan Tim Monitoring</li>
              <li>Tindakan Massal (Bulk Action)</li>
              <li>Update Progres Tiket Follow Up</li>
              <li>Input Arahan Tiket Baru Ka Ops / Ka Wil</li>
            </ul>
          </div>
        </div>

        {/* Right Content Area: Active Sub-Menu View */}
        <div className="lg:col-span-9 space-y-4">
          {activeSubMenu === 'QUICK_CHIPS' && (
            <div className="bg-white rounded-2xl border border-slate-200 p-4 md:p-6 shadow-2xs space-y-5">
              {/* Sub-Menu Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-base md:text-lg font-bold text-slate-900 flex items-center gap-2">
                      <Sparkles className="w-5 h-5 text-amber-500" />
                      Manajemen Pilihan Cepat (Quick Chips)
                    </h2>
                    <span className="text-[10px] px-2 py-0.5 font-bold rounded-full bg-blue-100 text-blue-800 border border-blue-200">
                      CRUD Aktif
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Tambah, edit, sesuaikan urutan, atau hapus teks template yang memudahkan tim saat mengisi catatan tindakan & tiket.
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => setIsResetConfirmOpen(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-100 text-xs font-semibold transition-colors cursor-pointer"
                    title="Kembalikan semua pilihan cepat ke preset standar bawaan sistem"
                  >
                    <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
                    <span>Reset Default</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleOpenCreateModal()}
                    className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-xs transition-colors cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Tambah Chip Baru</span>
                  </button>
                </div>
              </div>

              {/* Category Filter Tabs */}
              <div className="flex flex-wrap items-center gap-1.5 p-1 bg-slate-100/80 rounded-xl">
                <button
                  type="button"
                  onClick={() => setSelectedCategory('ALL')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
                    selectedCategory === 'ALL'
                      ? 'bg-white text-blue-700 shadow-2xs font-bold'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
                  }`}
                >
                  <span>Semua Kategori</span>
                  <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-slate-200 text-slate-700 font-bold">
                    {categoryCounts['ALL']}
                  </span>
                </button>

                {QUICK_CHIP_CATEGORIES.map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setSelectedCategory(cat.id)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
                      selectedCategory === cat.id
                        ? 'bg-white text-blue-700 shadow-2xs font-bold'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
                    }`}
                  >
                    <span>{cat.shortName}</span>
                    <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-slate-200 text-slate-700 font-bold">
                      {categoryCounts[cat.id]}
                    </span>
                  </button>
                ))}
              </div>

              {/* Search & Meta Bar */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="relative flex-1 max-w-sm">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Cari teks pilihan cepat..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-8 pr-8 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:bg-white"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <span>Menampilkan <strong>{filteredChips.length}</strong> dari {chips.length} pilihan cepat</span>
                  {customChipsCount > 0 && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-semibold border border-emerald-200">
                      {customChipsCount} kustom
                    </span>
                  )}
                </div>
              </div>

              {/* Quick Chips List Grid */}
              {filteredChips.length === 0 ? (
                <div className="py-12 text-center rounded-xl border border-dashed border-slate-200 bg-slate-50/50">
                  <Tag className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                  <p className="text-xs font-semibold text-slate-700">Tidak ada pilihan cepat yang cocok</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    {searchQuery ? 'Coba ubah kata kunci pencarian Anda' : 'Silakan tambahkan pilihan cepat baru untuk kategori ini'}
                  </p>
                  <button
                    type="button"
                    onClick={() => handleOpenCreateModal()}
                    className="mt-3 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer"
                  >
                    + Tambah Chip Sekarang
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {filteredChips.map((chip, idx) => {
                    const meta = getCategoryMeta(chip.category);
                    return (
                      <div
                        key={chip.id}
                        className="group p-3 rounded-xl border border-slate-200 hover:border-blue-300 bg-white hover:bg-blue-50/20 transition-all shadow-2xs flex flex-col justify-between gap-2.5"
                      >
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between gap-2">
                            <span
                              className={`text-[9px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full border ${meta.badgeClass}`}
                            >
                              {meta.shortName}
                            </span>

                            <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100 transition-opacity">
                              <button
                                type="button"
                                onClick={() => reorderChip(chip.id, 'UP')}
                                title="Pindah ke atas"
                                className="p-1 rounded text-slate-400 hover:text-blue-600 hover:bg-slate-100 cursor-pointer transition-colors"
                              >
                                <ArrowUp className="w-3 h-3" />
                              </button>
                              <button
                                type="button"
                                onClick={() => reorderChip(chip.id, 'DOWN')}
                                title="Pindah ke bawah"
                                className="p-1 rounded text-slate-400 hover:text-blue-600 hover:bg-slate-100 cursor-pointer transition-colors"
                              >
                                <ArrowDown className="w-3 h-3" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleOpenEditModal(chip)}
                                title="Edit pilihan cepat"
                                className="p-1 rounded text-slate-500 hover:text-blue-600 hover:bg-blue-100/60 cursor-pointer transition-colors"
                              >
                                <Edit3 className="w-3 h-3" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteChip(chip)}
                                title="Hapus pilihan cepat"
                                className="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-100/60 cursor-pointer transition-colors"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                          </div>

                          {/* Live Chip Preview Appearance */}
                          <div className="pt-1">
                            <span
                              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium border ${meta.chipClass} shadow-2xs select-none`}
                            >
                              + {chip.text}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center justify-between pt-1 border-t border-slate-100 text-[10px] text-slate-400">
                          <span>Urutan #{chip.order}</span>
                          {chip.isCustom ? (
                            <span className="text-emerald-600 font-medium">Kustom</span>
                          ) : (
                            <span className="text-slate-400">Bawaan Sistem</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Sub Menu 2: Accounts (Coming Soon Preview) */}
          {activeSubMenu === 'ACCOUNTS' && (
            <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center shadow-2xs space-y-4">
              <div className="w-14 h-14 rounded-2xl bg-amber-50 text-amber-600 border border-amber-200 flex items-center justify-center mx-auto">
                <Users className="w-7 h-7" />
              </div>
              <div className="max-w-md mx-auto space-y-1">
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200 uppercase tracking-wider">
                  Segera Hadir di Versi Berikutnya
                </span>
                <h3 className="text-base font-bold text-slate-900 mt-2">Manajemen Akun & Hak Akses Supervisor</h3>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Modul ini akan memungkinkan Super Admin Ka Wil / Ka Ops untuk mengganti password login supervisor,
                  mengatur sesi aktif, dan mengonfigurasi hak akses petugas Tim Monitoring secara mandiri.
                </p>
              </div>
            </div>
          )}

          {/* Sub Menu 3: Target SLA (Coming Soon Preview) */}
          {activeSubMenu === 'SLA_CONFIG' && (
            <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center shadow-2xs space-y-4">
              <div className="w-14 h-14 rounded-2xl bg-blue-50 text-blue-600 border border-blue-200 flex items-center justify-center mx-auto">
                <Sliders className="w-7 h-7" />
              </div>
              <div className="max-w-md mx-auto space-y-1">
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 border border-blue-200 uppercase tracking-wider">
                  Segera Hadir di Versi Berikutnya
                </span>
                <h3 className="text-base font-bold text-slate-900 mt-2">Konfigurasi Target SLA & Batas Toleransi</h3>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Modul ini akan menyediakan pengaturan target uptime bulanan (default 98.5%), batas waktu eskalasi tiket (SLA 60 menit, 120 menit),
                  dan parameter perhitungan downtime operasional mesin per wilayah.
                </p>
              </div>
            </div>
          )}

          {/* Sub Menu 4: Problem Whitelist (Coming Soon Preview) */}
          {activeSubMenu === 'PROBLEM_WHITELIST' && (
            <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center shadow-2xs space-y-4">
              <div className="w-14 h-14 rounded-2xl bg-purple-50 text-purple-600 border border-purple-200 flex items-center justify-center mx-auto">
                <Cpu className="w-7 h-7" />
              </div>
              <div className="max-w-md mx-auto space-y-1">
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-100 text-purple-800 border border-purple-200 uppercase tracking-wider">
                  Segera Hadir di Versi Berikutnya
                </span>
                <h3 className="text-base font-bold text-slate-900 mt-2">Master Problem Whitelist & Modul Hardware</h3>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Modul ini akan memungkinkan Super Admin menambah atau menonaktifkan deskripsi event code OASE
                  dan mengelompokkannya ke dalam sub-kategori modul hardware (Cash Handler, Card Reader, EPP, dsb).
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* MODAL: Tambah / Edit Pilihan Cepat */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-2xs animate-fadeIn">
          <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center">
                  <Sparkles className="w-4 h-4" />
                </div>
                <h3 className="text-sm font-bold text-slate-900">
                  {editingChip ? 'Edit Pilihan Cepat' : 'Tambah Pilihan Cepat Baru'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-200/60 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveChip} className="p-5 space-y-4">
              {formError && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600" />
                  <span>{formError}</span>
                </div>
              )}

              {/* Kategori Selector */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Kategori Pilihan Cepat *
                </label>
                <select
                  value={formCategory}
                  onChange={(e) => setFormCategory(e.target.value as QuickChipCategory)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:bg-white"
                >
                  {QUICK_CHIP_CATEGORIES.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.name}
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-slate-400 mt-1">
                  {getCategoryMeta(formCategory).description}
                </p>
              </div>

              {/* Teks Input */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Teks Pilihan Cepat *
                </label>
                <textarea
                  rows={3}
                  placeholder="Ketik teks yang akan otomatis terisi saat chip diklik..."
                  value={formText}
                  onChange={(e) => {
                    setFormText(e.target.value);
                    if (formError) setFormError('');
                  }}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:bg-white resize-none leading-relaxed"
                />
                <div className="flex items-center justify-between text-[10px] text-slate-400 mt-1">
                  <span>Gunakan kalimat singkat, padat, dan representatif</span>
                  <span>{formText.length} karakter</span>
                </div>
              </div>

              {/* Live Preview Box */}
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80 space-y-1.5">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                  Pratinjau Tampilan Chip:
                </span>
                <div className="pt-0.5">
                  <span
                    className={`inline-flex items-center gap-1 px-3 py-1 rounded-md text-xs font-medium border ${getCategoryMeta(formCategory).chipClass} shadow-2xs`}
                  >
                    + {formText.trim() || 'Contoh Teks Chip Pilihan Cepat'}
                  </span>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-3.5 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 text-xs font-semibold cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-xs cursor-pointer"
                >
                  {editingChip ? 'Simpan Perubahan' : 'Tambahkan Chip'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Konfirmasi Reset Default */}
      {isResetConfirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-2xs animate-fadeIn">
          <div className="bg-white rounded-2xl max-w-sm w-full shadow-2xl border border-slate-200 p-5 space-y-4">
            <div className="w-10 h-10 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center mx-auto">
              <RotateCcw className="w-5 h-5" />
            </div>
            <div className="text-center space-y-1">
              <h3 className="text-sm font-bold text-slate-900">Kembalikan ke Preset Standar?</h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                Tindakan ini akan mengembalikan seluruh pilihan cepat (quick chips) ke daftar template default bawaan sistem.
                Chip kustom yang pernah Anda buat akan terhapus.
              </p>
            </div>
            <div className="flex items-center justify-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsResetConfirmOpen(false)}
                className="px-3.5 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 text-xs font-semibold cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleConfirmReset}
                className="px-4 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold shadow-xs cursor-pointer"
              >
                Ya, Reset ke Standar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
