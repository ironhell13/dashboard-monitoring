import React, { useState, useMemo, useEffect } from 'react';
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
  Database,
  Cloud,
  CloudOff,
  RefreshCw,
  ExternalLink,
  Copy,
  HelpCircle,
  UserPlus,
  Key,
  Mail,
  Phone,
  UserCheck,
  UserX,
  Server,
  Lock,
  Upload
} from 'lucide-react';
import {
  type QuickChipCategory,
  type QuickChipItem,
  QUICK_CHIP_CATEGORIES,
  useQuickChips
} from '../utils/quickChipsService';
import {
  type AppUser,
  type AppUserRole,
  type AppUserStatus,
  fetchUsersSupabase,
  saveUserSupabase,
  deleteUserSupabase,
  subscribeUsersSupabase,
  migrateAllDataToSupabase,
  migrateDailyDataToSupabase,
  uploadIncidentsToSupabase,
  type MigrationProgress
} from '../utils/supabaseService';
import { parseDailyIncidentCsv } from '../utils/dailyIncidentParser';
import {
  getSupabaseUrl,
  getSupabaseAnonKey,
  setSupabaseCredentials,
  isSupabaseConfigured,
  testSupabaseConnection
} from '../utils/supabaseClient';

const DEFAULT_APP_USERS: AppUser[] = [
  {
    id: 'usr_superadmin',
    username: 'superadmin',
    fullName: 'Super Administrator eMons BCA',
    email: 'superadmin@bca.co.id',
    role: 'SUPER_ADMIN',
    status: 'ACTIVE',
    createdAt: '2026-11-03T10:00:00Z'
  },
  {
    id: 'usr_kaops',
    username: 'kaops',
    fullName: 'Kepala Operasional (Ka Ops)',
    email: 'kaops@bca.co.id',
    role: 'KAOPS',
    status: 'ACTIVE',
    createdAt: '2026-11-03T10:00:00Z'
  },
  {
    id: 'usr_kawil',
    username: 'kawil',
    fullName: 'Kepala Wilayah (Ka Wil)',
    email: 'kawil@bca.co.id',
    role: 'KAWIL',
    status: 'ACTIVE',
    createdAt: '2026-11-03T10:00:00Z'
  },
  {
    id: 'usr_monitoring',
    username: 'monitoring',
    fullName: 'Tim Monitoring & Dispatcher',
    email: 'monitoring@bca.co.id',
    role: 'MONITORING',
    status: 'ACTIVE',
    createdAt: '2026-11-03T10:00:00Z'
  }
];

interface SettingsPageProps {
  userRole?: 'KAWIL' | 'KAOPS' | 'MONITORING';
}

type SettingsSubMenu = 'QUICK_CHIPS' | 'ACCOUNTS' | 'DATABASE_CONFIG' | 'SLA_CONFIG' | 'PROBLEM_WHITELIST';

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

  // Quick Chips Hook (Reaktif & Tersinkron Cloud)
  const {
    chips,
    syncStatus,
    addChip,
    updateChip,
    deleteChip,
    reorderChip,
    resetToDefault,
    refreshFromServer
  } = useQuickChips();

  // Cloud Sync Interaction State
  const [isSyncing, setIsSyncing] = useState(false);
  const [isGasGuideOpen, setIsGasGuideOpen] = useState(false);

  // Modal State for Create / Edit
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingChip, setEditingChip] = useState<QuickChipItem | null>(null);
  const [formCategory, setFormCategory] = useState<QuickChipCategory>('UPDATE');
  const [formText, setFormText] = useState('');
  const [formError, setFormError] = useState('');

  // Modal State for Reset Confirmation
  const [isResetConfirmOpen, setIsResetConfirmOpen] = useState(false);

  // User Management State (Super Admin & Multi-User)
  const [users, setUsers] = useState<AppUser[]>([]);
  const [userSearchQuery, setUserSearchQuery] = useState('');
  const [userRoleFilter, setUserRoleFilter] = useState<AppUserRole | 'ALL'>('ALL');
  const [isUserModalOpen, setIsUserModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<AppUser | null>(null);
  const [userFormUsername, setUserFormUsername] = useState('');
  const [userFormFullName, setUserFormFullName] = useState('');
  const [userFormEmail, setUserFormEmail] = useState('');
  const [userFormPassword, setUserFormPassword] = useState('');
  const [userFormRole, setUserFormRole] = useState<AppUserRole>('MONITORING');
  const [userFormStatus, setUserFormStatus] = useState<AppUserStatus>('ACTIVE');
  const [userFormSektor, setUserFormSektor] = useState('');
  const [userFormError, setUserFormError] = useState('');
  const [isUserLoading, setIsUserLoading] = useState(false);

  // Supabase Configuration State
  const [supabaseUrlInput, setSupabaseUrlInput] = useState('');
  const [supabaseKeyInput, setSupabaseKeyInput] = useState('');
  const [isTestingSupabase, setIsTestingSupabase] = useState(false);
  const [supabaseTestStatus, setSupabaseTestStatus] = useState<{ success: boolean; message: string } | null>(null);

  // Load initial Supabase Credentials & Users list
  useEffect(() => {
    setSupabaseUrlInput(getSupabaseUrl());
    setSupabaseKeyInput(getSupabaseAnonKey());
    loadUsersList();

    const unsub = subscribeUsersSupabase((updated) => {
      setUsers(updated);
    });
    return () => unsub();
  }, []);

  const loadUsersList = async () => {
    setIsUserLoading(true);
    try {
      if (isSupabaseConfigured()) {
        const res = await fetchUsersSupabase();
        if (res.success && res.users.length > 0) {
          setUsers(res.users);
          setIsUserLoading(false);
          return;
        }
      }
      const saved = localStorage.getItem('EMONS_LOCAL_USERS');
      if (saved) {
        setUsers(JSON.parse(saved));
      } else {
        setUsers(DEFAULT_APP_USERS);
        localStorage.setItem('EMONS_LOCAL_USERS', JSON.stringify(DEFAULT_APP_USERS));
      }
    } catch (e) {
      console.warn('Gagal load users:', e);
    } finally {
      setIsUserLoading(false);
    }
  };

  const handleOpenCreateUserModal = () => {
    setEditingUser(null);
    setUserFormUsername('');
    setUserFormFullName('');
    setUserFormEmail('');
    setUserFormPassword('');
    setUserFormRole('MONITORING');
    setUserFormStatus('ACTIVE');
    setUserFormSektor('');
    setUserFormError('');
    setIsUserModalOpen(true);
  };

  const handleOpenEditUserModal = (user: AppUser) => {
    setEditingUser(user);
    setUserFormUsername(user.username);
    setUserFormFullName(user.fullName);
    setUserFormEmail(user.email || '');
    setUserFormPassword('');
    setUserFormRole(user.role);
    setUserFormStatus(user.status);
    setUserFormSektor(user.assignedSektor || '');
    setUserFormError('');
    setIsUserModalOpen(true);
  };

  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userFormUsername.trim() || !userFormFullName.trim()) {
      setUserFormError('Username dan Nama Lengkap wajib diisi!');
      return;
    }
    if (!editingUser && !userFormPassword.trim()) {
      setUserFormError('Password wajib diisi untuk pengguna baru!');
      return;
    }

    try {
      if (isSupabaseConfigured()) {
        const res = await saveUserSupabase({
          id: editingUser?.id,
          username: userFormUsername,
          fullName: userFormFullName,
          email: userFormEmail,
          password: userFormPassword,
          role: userFormRole,
          status: userFormStatus,
          assignedSektor: userFormSektor
        });

        if (!res.success) throw new Error(res.message);
        showToast(editingUser ? 'Pengguna berhasil diperbarui di Supabase!' : 'Pengguna baru berhasil ditambahkan ke Supabase!', 'success');
        loadUsersList();
      } else {
        const current = [...users];
        if (editingUser) {
          const idx = current.findIndex((u) => u.id === editingUser.id);
          if (idx !== -1) {
            current[idx] = {
              ...current[idx],
              username: userFormUsername.trim().toLowerCase(),
              fullName: userFormFullName.trim(),
              email: userFormEmail.trim() || undefined,
              role: userFormRole,
              status: userFormStatus,
              assignedSektor: userFormSektor.trim() || undefined,
              updatedAt: new Date().toISOString()
            };
          }
          showToast('Pengguna berhasil diperbarui (tersimpan lokal).', 'info');
        } else {
          if (current.some((u) => u.username.toLowerCase() === userFormUsername.trim().toLowerCase())) {
            throw new Error(`Username "${userFormUsername}" sudah terdaftar.`);
          }
          current.push({
            id: `usr_${Date.now()}`,
            username: userFormUsername.trim().toLowerCase(),
            fullName: userFormFullName.trim(),
            email: userFormEmail.trim() || undefined,
            role: userFormRole,
            status: userFormStatus,
            assignedSektor: userFormSektor.trim() || undefined,
            createdAt: new Date().toISOString()
          });
          showToast('Pengguna baru berhasil ditambahkan (tersimpan lokal).', 'info');
        }
        setUsers(current);
        localStorage.setItem('EMONS_LOCAL_USERS', JSON.stringify(current));
      }

      setIsUserModalOpen(false);
      setEditingUser(null);
    } catch (err: any) {
      setUserFormError(err.message || 'Gagal menyimpan pengguna.');
    }
  };

  const handleDeleteUser = async (user: AppUser) => {
    if (user.username === 'superadmin') {
      showToast('Akun Super Administrator utama tidak boleh dihapus demi keamanan sistem!', 'error');
      return;
    }

    if (window.confirm(`Yakin ingin menghapus pengguna "${user.fullName}" (@${user.username})?`)) {
      try {
        if (isSupabaseConfigured()) {
          const res = await deleteUserSupabase(user.id);
          if (!res.success) throw new Error(res.message);
          showToast('Pengguna berhasil dihapus dari Supabase.', 'success');
          loadUsersList();
        } else {
          const filtered = users.filter((u) => u.id !== user.id);
          setUsers(filtered);
          localStorage.setItem('EMONS_LOCAL_USERS', JSON.stringify(filtered));
          showToast('Pengguna berhasil dihapus dari penyimpanan lokal.', 'info');
        }
      } catch (err: any) {
        showToast(err.message || 'Gagal menghapus pengguna.', 'error');
      }
    }
  };

  const handleSaveSupabaseConfig = async () => {
    const cleanUrl = supabaseUrlInput.trim();
    const cleanKey = supabaseKeyInput.trim();
    setSupabaseCredentials(cleanUrl, cleanKey);
    showToast('Kredensial Supabase berhasil disimpan di browser.', 'success');
    handleTestSupabaseConfig();
  };

  const handleTestSupabaseConfig = async () => {
    setIsTestingSupabase(true);
    setSupabaseTestStatus(null);
    try {
      const res = await testSupabaseConnection();
      setSupabaseTestStatus(res);
      if (res.success) {
        showToast('Koneksi Supabase Sukses!', 'success');
        loadUsersList();
      } else {
        showToast(res.message, 'error');
      }
    } catch (err: any) {
      setSupabaseTestStatus({ success: false, message: err.message || 'Gagal menghubungi Supabase.' });
    } finally {
      setIsTestingSupabase(false);
    }
  };

  // Data Migration to Supabase State & Action
  const [isMigrating, setIsMigrating] = useState(false);
  const [migrationProgress, setMigrationProgress] = useState<MigrationProgress | null>(null);

  const handleStartMigration = async () => {
    if (!isSupabaseConfigured()) {
      showToast('Koneksi Supabase belum terkonfigurasi. Simpan URL dan Anon Key terlebih dahulu.', 'error');
      return;
    }
    if (!window.confirm('Yakin ingin memigrasikan seluruh 2.043 data mesin dan rekap downtime ke database Supabase sekarang?')) {
      return;
    }

    setIsMigrating(true);
    setMigrationProgress({ step: 'Memulai proses migrasi...', percent: 0 });
    try {
      const res = await migrateAllDataToSupabase((p) => {
        setMigrationProgress(p);
      });
      showToast(`Migrasi sukses! ${res.machinesCount} mesin dan ${res.uptimeCount} data bulanan kini aktif di Supabase.`, 'success');
    } catch (err: any) {
      showToast(err.message || 'Gagal melakukan migrasi data.', 'error');
      setMigrationProgress(null);
    } finally {
      setIsMigrating(false);
    }
  };

  // Daily Incidents Migration State & Actions
  const [isMigratingDaily, setIsMigratingDaily] = useState(false);
  const [dailyMigrationProgress, setDailyMigrationProgress] = useState<MigrationProgress | null>(null);

  const handleStartDailyMigration = async () => {
    if (!isSupabaseConfigured()) {
      showToast('Koneksi Supabase belum terkonfigurasi. Simpan URL dan Anon Key terlebih dahulu.', 'error');
      return;
    }
    if (!window.confirm('Yakin ingin memigrasikan riwayat insiden harian & tindakan dari cache lokal/spreadsheet ke database Supabase sekarang?')) {
      return;
    }

    setIsMigratingDaily(true);
    setDailyMigrationProgress({ step: 'Mencari arsip data daily...', percent: 5 });
    try {
      const res = await migrateDailyDataToSupabase((p) => {
        setDailyMigrationProgress(p);
      });
      if (res.success) {
        showToast(res.message, 'success');
      } else {
        showToast(res.message, 'error');
      }
    } catch (err: any) {
      showToast(err.message || 'Gagal memigrasikan data daily.', 'error');
      setDailyMigrationProgress(null);
    } finally {
      setIsMigratingDaily(false);
    }
  };

  const handleDailyCsvFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!isSupabaseConfigured()) {
      showToast('Koneksi Supabase belum terkonfigurasi. Simpan URL dan Anon Key terlebih dahulu.', 'error');
      return;
    }

    setIsMigratingDaily(true);
    setDailyMigrationProgress({ step: `Membaca berkas ${file.name}...`, percent: 10 });

    try {
      const text = await file.text();
      setDailyMigrationProgress({ step: 'Mem-parsing CSV laporan insiden OASE...', percent: 25 });
      const parsed = parseDailyIncidentCsv(text);

      if (!parsed.rows || parsed.rows.length === 0) {
        throw new Error('Tidak ada baris insiden yang valid ditemukan di berkas CSV ini.');
      }

      const rows = parsed.rows;
      const chunkSize = 500;
      const totalChunks = Math.ceil(rows.length / chunkSize);

      for (let i = 0; i < totalChunks; i++) {
        const chunk = rows.slice(i * chunkSize, (i + 1) * chunkSize);
        const pct = 30 + Math.round(((i + 1) / totalChunks) * 65);
        setDailyMigrationProgress({
          step: `Mengunggah batch ${i + 1} dari ${totalChunks} (${(i * chunkSize + chunk.length).toLocaleString()} baris)...`,
          percent: pct
        });

        await uploadIncidentsToSupabase({
          uploaderName: 'Super Admin (CSV Import)',
          sumber: 'Upload CSV Langsung',
          fileName: file.name,
          totalCsvLines: rows.length,
          chunkIndex: i,
          totalChunks: totalChunks,
          rows: chunk
        });
      }

      setDailyMigrationProgress({ step: 'Selesai!', percent: 100 });
      showToast(`Sukses memigrasikan ${rows.length.toLocaleString()} insiden dari ${file.name} ke database Supabase!`, 'success');
    } catch (err: any) {
      showToast(err.message || 'Gagal memproses file CSV.', 'error');
      setDailyMigrationProgress(null);
    } finally {
      setIsMigratingDaily(false);
      e.target.value = '';
    }
  };

  // Filtered Users
  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      const matchRole = userRoleFilter === 'ALL' || u.role === userRoleFilter;
      const q = userSearchQuery.trim().toLowerCase();
      const matchSearch =
        !q ||
        u.username.toLowerCase().includes(q) ||
        u.fullName.toLowerCase().includes(q) ||
        (u.email && u.email.toLowerCase().includes(q)) ||
        (u.assignedSektor && u.assignedSektor.toLowerCase().includes(q));
      return matchRole && matchSearch;
    });
  }, [users, userRoleFilter, userSearchQuery]);

  const getRoleBadge = (role: AppUserRole) => {
    switch (role) {
      case 'SUPER_ADMIN':
        return { label: 'Super Admin', badgeClass: 'bg-purple-100 text-purple-800 border-purple-200' };
      case 'KAWIL':
        return { label: 'Ka Wil', badgeClass: 'bg-indigo-100 text-indigo-800 border-indigo-200' };
      case 'KAOPS':
        return { label: 'Ka Ops', badgeClass: 'bg-blue-100 text-blue-800 border-blue-200' };
      case 'MONITORING':
        return { label: 'Monitoring', badgeClass: 'bg-emerald-100 text-emerald-800 border-emerald-200' };
      case 'VIEWER':
      default:
        return { label: 'Viewer', badgeClass: 'bg-slate-100 text-slate-800 border-slate-200' };
    }
  };

  // Manual Trigger Refresh dari Server Cloud
  const handleManualSync = async () => {
    setIsSyncing(true);
    try {
      const res = await refreshFromServer();
      if (res.serverConnected) {
        showToast('Sinkronisasi sukses! Data terbaru dari cloud server telah dimuat.', 'success');
      } else {
        showToast(res.message || 'Server belum ter-deploy versi baru. Data tetap tersimpan secara lokal.', 'error');
      }
    } catch (err: any) {
      showToast('Gagal menghubungi server cloud Google Apps Script.', 'error');
    } finally {
      setIsSyncing(false);
    }
  };

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
  const handleSaveChip = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = formText.trim();
    if (!clean) {
      setFormError('Teks pilihan cepat tidak boleh kosong!');
      return;
    }

    try {
      if (editingChip) {
        const res = await updateChip(editingChip.id, { category: formCategory, text: clean });
        if (res.serverSynced) {
          showToast('Pilihan cepat berhasil diperbarui & tersinkron ke cloud server!', 'success');
        } else {
          showToast('Pilihan cepat diperbarui (tersimpan lokal di browser ini).', 'info');
        }
      } else {
        const res = await addChip(formCategory, clean);
        if (res.serverSynced) {
          showToast('Pilihan cepat baru berhasil ditambahkan & tersinkron ke cloud server!', 'success');
        } else {
          showToast('Pilihan cepat baru ditambahkan (tersimpan lokal di browser ini).', 'info');
        }
      }
      setIsModalOpen(false);
      setEditingChip(null);
      setFormText('');
    } catch (err: any) {
      setFormError(err.message || 'Gagal menyimpan pilihan cepat');
    }
  };

  // Handle Delete
  const handleDeleteChip = async (chip: QuickChipItem) => {
    if (window.confirm(`Yakin ingin menghapus pilihan cepat "${chip.text}"?`)) {
      const res = await deleteChip(chip.id);
      if (res.serverSynced) {
        showToast('Pilihan cepat berhasil dihapus & tersinkron ke cloud.', 'info');
      } else {
        showToast('Pilihan cepat berhasil dihapus dari browser lokal.', 'info');
      }
    }
  };

  // Handle Reset to Default
  const handleConfirmReset = async () => {
    const res = await resetToDefault();
    setIsResetConfirmOpen(false);
    if (res.serverSynced) {
      showToast('Seluruh pilihan cepat telah dikembalikan ke bawaan sistem & tersinkron ke cloud.', 'success');
    } else {
      showToast('Pilihan cepat dikembalikan ke bawaan sistem (lokal).', 'info');
    }
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

              {/* 2. Sub Menu: Manajemen Akun & Hak Akses (Active) */}
              <button
                type="button"
                onClick={() => setActiveSubMenu('ACCOUNTS')}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer text-left ${
                  activeSubMenu === 'ACCOUNTS'
                    ? 'bg-blue-600 text-white shadow-sm shadow-blue-600/30'
                    : 'text-slate-700 hover:bg-slate-100'
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <Users className={`w-4 h-4 shrink-0 ${activeSubMenu === 'ACCOUNTS' ? 'text-white' : 'text-blue-600'}`} />
                  <div className="truncate">
                    <span className="block font-bold">Akun & Pengguna</span>
                    <span className={`text-[10px] block truncate ${activeSubMenu === 'ACCOUNTS' ? 'text-blue-100' : 'text-slate-400'}`}>
                      Super Admin & Hak Akses
                    </span>
                  </div>
                </div>
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold shrink-0 ${
                    activeSubMenu === 'ACCOUNTS' ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  {users.length}
                </span>
              </button>

              {/* 3. Sub Menu: Database Supabase PostgreSQL (Active) */}
              <button
                type="button"
                onClick={() => setActiveSubMenu('DATABASE_CONFIG')}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer text-left ${
                  activeSubMenu === 'DATABASE_CONFIG'
                    ? 'bg-blue-600 text-white shadow-sm shadow-blue-600/30'
                    : 'text-slate-700 hover:bg-slate-100'
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <Database className={`w-4 h-4 shrink-0 ${activeSubMenu === 'DATABASE_CONFIG' ? 'text-white' : 'text-emerald-600'}`} />
                  <div className="truncate">
                    <span className="block font-bold">Database Supabase</span>
                    <span className={`text-[10px] block truncate ${activeSubMenu === 'DATABASE_CONFIG' ? 'text-blue-100' : 'text-slate-400'}`}>
                      Koneksi PostgreSQL & Realtime
                    </span>
                  </div>
                </div>
                <span
                  className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold shrink-0 ${
                    isSupabaseConfigured()
                      ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                      : 'bg-amber-100 text-amber-800 border border-amber-200'
                  }`}
                >
                  {isSupabaseConfigured() ? 'Terkoneksi' : 'Setup'}
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

              {/* Cloud Sync Status Banner (Multi-PC Synchronization) */}
              <div
                className={`p-3.5 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                  syncStatus.isSynced
                    ? 'bg-emerald-50/70 border-emerald-200 text-emerald-900'
                    : syncStatus.isChecking
                    ? 'bg-slate-50 border-slate-200 text-slate-700'
                    : 'bg-amber-50/80 border-amber-300 text-amber-950'
                }`}
              >
                <div className="flex items-start gap-2.5">
                  <div
                    className={`w-8 h-8 rounded-lg shrink-0 flex items-center justify-center mt-0.5 ${
                      syncStatus.isSynced
                        ? 'bg-emerald-100 text-emerald-700'
                        : syncStatus.isChecking
                        ? 'bg-slate-200 text-slate-600 animate-spin'
                        : 'bg-amber-100 text-amber-700'
                    }`}
                  >
                    {syncStatus.isSynced ? (
                      <Cloud className="w-4 h-4" />
                    ) : syncStatus.isChecking ? (
                      <RefreshCw className="w-4 h-4" />
                    ) : (
                      <CloudOff className="w-4 h-4" />
                    )}
                  </div>
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold">
                        {syncStatus.isSynced
                          ? 'Sinkronisasi Cloud Aktif (Multi-PC Terhubung)'
                          : syncStatus.isChecking
                          ? 'Memeriksa Sinkronisasi Cloud...'
                          : 'Perhatian: Sinkronisasi Cloud Belum Terhubung'}
                      </span>
                      <span
                        className={`text-[9px] px-2 py-0.2 rounded-full font-bold uppercase tracking-wider ${
                          syncStatus.isSynced
                            ? 'bg-emerald-200 text-emerald-800'
                            : syncStatus.isChecking
                            ? 'bg-slate-200 text-slate-700'
                            : 'bg-amber-200 text-amber-900'
                        }`}
                      >
                        {syncStatus.source === 'Cloud' ? 'Google Cloud' : 'Browser Lokal (PC Ini)'}
                      </span>
                    </div>
                    <p className="text-[11px] leading-relaxed text-slate-600">
                      {syncStatus.isSynced
                        ? 'Setiap perubahan pilihan cepat otomatis tersimpan di Google Cloud (Google Apps Script & Database Spreadsheet) dan langsung tampil di PC 1, PC 2, maupun perangkat lain.'
                        : syncStatus.isChecking
                        ? 'Sedang menghubungkan ke server Google Apps Script...'
                        : 'Perubahan tersimpan aman di PC ini, namun belum tersinkron ke PC lain karena Web App Google Apps Script perlu dideploy ke versi baru (New Version).'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                  {!syncStatus.isSynced && (
                    <button
                      type="button"
                      onClick={() => setIsGasGuideOpen(true)}
                      className="px-2.5 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-[11px] font-bold shadow-xs transition-colors cursor-pointer flex items-center gap-1.5"
                    >
                      <HelpCircle className="w-3.5 h-3.5" />
                      <span>Cara Update Script (1 Mnt)</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={handleManualSync}
                    disabled={isSyncing}
                    className="px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-[11px] font-semibold transition-colors cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
                    title="Tarik data Quick Chips terbaru dari server Google"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 text-slate-500 ${isSyncing ? 'animate-spin text-blue-600' : ''}`} />
                    <span>{isSyncing ? 'Menyinkronkan...' : 'Tarik Data Server'}</span>
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

          {/* Sub Menu 2: Accounts (Manajemen Pengguna & Super Admin) */}
          {activeSubMenu === 'ACCOUNTS' && (
            <div className="bg-white rounded-2xl border border-slate-200 p-4 md:p-6 shadow-2xs space-y-5">
              {/* Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-base md:text-lg font-bold text-slate-900 flex items-center gap-2">
                      <Users className="w-5 h-5 text-blue-600" />
                      Manajemen Pengguna & Super Admin
                    </h2>
                    <span className="text-[10px] px-2 py-0.5 font-bold rounded-full bg-blue-100 text-blue-800 border border-blue-200">
                      CRUD Aktif
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Kelola akun, tambah pengguna baru (Super Admin, Ka Wil, Ka Ops, Monitoring), ubah hak akses, atau hapus user.
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={loadUsersList}
                    disabled={isUserLoading}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-100 text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50"
                    title="Refresh data pengguna"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isUserLoading ? 'animate-spin text-blue-600' : ''}`} />
                    <span>Refresh</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleOpenCreateUserModal}
                    className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-xs transition-colors cursor-pointer"
                  >
                    <UserPlus className="w-4 h-4" />
                    <span>Tambah User Baru</span>
                  </button>
                </div>
              </div>

              {/* Role Filter Tabs */}
              <div className="flex flex-wrap items-center gap-1.5 p-1 bg-slate-100/80 rounded-xl">
                <button
                  type="button"
                  onClick={() => setUserRoleFilter('ALL')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
                    userRoleFilter === 'ALL'
                      ? 'bg-white text-blue-700 shadow-2xs font-bold'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
                  }`}
                >
                  <span>Semua Peran</span>
                  <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-slate-200 text-slate-700 font-bold">
                    {users.length}
                  </span>
                </button>

                {(['SUPER_ADMIN', 'KAOPS', 'KAWIL', 'MONITORING'] as AppUserRole[]).map((r) => {
                  const meta = getRoleBadge(r);
                  const count = users.filter((u) => u.role === r).length;
                  return (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setUserRoleFilter(r)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
                        userRoleFilter === r
                          ? 'bg-white text-blue-700 shadow-2xs font-bold'
                          : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
                      }`}
                    >
                      <span>{meta.label}</span>
                      <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-slate-200 text-slate-700 font-bold">
                        {count}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Search Bar */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="relative flex-1 max-w-sm">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Cari nama, username, email, atau sektor..."
                    value={userSearchQuery}
                    onChange={(e) => setUserSearchQuery(e.target.value)}
                    className="w-full pl-8 pr-8 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:bg-white"
                  />
                  {userSearchQuery && (
                    <button
                      type="button"
                      onClick={() => setUserSearchQuery('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                <span className="text-xs text-slate-500">
                  Menampilkan <strong>{filteredUsers.length}</strong> dari {users.length} pengguna
                </span>
              </div>

              {/* Users Table */}
              {filteredUsers.length === 0 ? (
                <div className="py-12 text-center rounded-xl border border-dashed border-slate-200 bg-slate-50/50">
                  <Users className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                  <p className="text-xs font-semibold text-slate-700">Tidak ada pengguna yang cocok</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    {userSearchQuery ? 'Coba ubah kata kunci pencarian Anda' : 'Belum ada pengguna untuk filter ini'}
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-slate-200">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase text-[10px] tracking-wider">
                      <tr>
                        <th className="px-4 py-3">Pengguna</th>
                        <th className="px-3 py-3">Peran / Hak Akses</th>
                        <th className="px-3 py-3">Status</th>
                        <th className="px-3 py-3">Batas Sektor</th>
                        <th className="px-3 py-3 text-right">Aksi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {filteredUsers.map((u) => {
                        const roleMeta = getRoleBadge(u.role);
                        const isMainSuperAdmin = u.username.toLowerCase() === 'superadmin';
                        return (
                          <tr key={u.id} className="hover:bg-slate-50/70 transition-colors">
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 font-bold flex items-center justify-center shrink-0 text-xs">
                                  {u.fullName ? u.fullName.charAt(0).toUpperCase() : 'U'}
                                </div>
                                <div className="min-w-0">
                                  <div className="flex items-center gap-1.5 font-bold text-slate-900">
                                    <span>{u.fullName}</span>
                                    {isMainSuperAdmin && (
                                      <span className="px-1.5 py-0.2 rounded text-[9px] bg-purple-100 text-purple-800 font-bold border border-purple-200">
                                        Root
                                      </span>
                                    )}
                                  </div>
                                  <div className="text-[11px] text-slate-400 flex items-center gap-2">
                                    <span className="font-mono text-slate-500">@{u.username}</span>
                                    {u.email && <span>• {u.email}</span>}
                                  </div>
                                </div>
                              </div>
                            </td>
                            <td className="px-3 py-3">
                              <span className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${roleMeta.badgeClass}`}>
                                {roleMeta.label}
                              </span>
                            </td>
                            <td className="px-3 py-3">
                              <span
                                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                                  u.status === 'ACTIVE'
                                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                    : 'bg-slate-100 text-slate-500 border-slate-200'
                                }`}
                              >
                                <span className={`w-1.5 h-1.5 rounded-full ${u.status === 'ACTIVE' ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                                <span>{u.status === 'ACTIVE' ? 'Aktif' : 'Nonaktif'}</span>
                              </span>
                            </td>
                            <td className="px-3 py-3 text-slate-600 text-[11px]">
                              {u.assignedSektor ? (
                                <span className="font-medium text-blue-700">{u.assignedSektor}</span>
                              ) : (
                                <span className="text-slate-400 italic">Semua Sektor (Bebas)</span>
                              )}
                            </td>
                            <td className="px-3 py-3 text-right">
                              <div className="flex items-center justify-end gap-1">
                                <button
                                  type="button"
                                  onClick={() => handleOpenEditUserModal(u)}
                                  title="Edit data / reset password"
                                  className="p-1.5 rounded-lg text-slate-500 hover:text-blue-600 hover:bg-blue-50 cursor-pointer transition-colors"
                                >
                                  <Edit3 className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteUser(u)}
                                  disabled={isMainSuperAdmin}
                                  title={isMainSuperAdmin ? 'Akun Super Admin utama tidak boleh dihapus' : 'Hapus user ini'}
                                  className={`p-1.5 rounded-lg transition-colors ${
                                    isMainSuperAdmin
                                      ? 'text-slate-200 cursor-not-allowed'
                                      : 'text-slate-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer'
                                  }`}
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Sub Menu 3: Database Supabase Configuration */}
          {activeSubMenu === 'DATABASE_CONFIG' && (
            <div className="bg-white rounded-2xl border border-slate-200 p-4 md:p-6 shadow-2xs space-y-6">
              {/* Header */}
              <div className="pb-4 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <h2 className="text-base md:text-lg font-bold text-slate-900 flex items-center gap-2">
                    <Database className="w-5 h-5 text-emerald-600" />
                    Koneksi Database Supabase (PostgreSQL)
                  </h2>
                  <span
                    className={`text-[10px] px-2 py-0.5 font-bold rounded-full border ${
                      isSupabaseConfigured()
                        ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                        : 'bg-amber-100 text-amber-800 border-amber-200'
                    }`}
                  >
                    {isSupabaseConfigured() ? 'Terkoneksi' : 'Perlu Setup'}
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  Hubungkan dashboard ke database cloud Supabase untuk menghilangkan keterbatasan spreadsheet, latensi &lt; 50ms, dan sinkronisasi realtime multi-PC.
                </p>
              </div>

              {/* Status Banner */}
              <div
                className={`p-4 rounded-xl border flex items-start gap-3 ${
                  isSupabaseConfigured()
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                    : 'bg-amber-50 border-amber-200 text-amber-900'
                }`}
              >
                <div
                  className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                    isSupabaseConfigured() ? 'bg-emerald-200 text-emerald-800' : 'bg-amber-200 text-amber-800'
                  }`}
                >
                  <Server className="w-5 h-5" />
                </div>
                <div className="space-y-1">
                  <h4 className="text-xs font-bold">
                    {isSupabaseConfigured()
                      ? 'Database Supabase Terkonfigurasi'
                      : 'Kredensial Supabase Belum Terhubung'}
                  </h4>
                  <p className="text-[11px] leading-relaxed text-slate-600">
                    {isSupabaseConfigured()
                      ? 'Dashboard saat ini terhubung langsung ke database PostgreSQL Supabase. Query data, tiket, insiden, dan penambahan pengguna berlangsung instan.'
                      : 'Dashboard saat ini masih menggunakan Google Apps Script / LocalStorage. Masukkan Project URL dan Anon Key Supabase Anda di bawah untuk mengaktifkan database PostgreSQL.'}
                  </p>
                </div>
              </div>

              {/* Form Input Kredensial */}
              <div className="bg-slate-50 p-4 md:p-5 rounded-xl border border-slate-200 space-y-4">
                <span className="text-xs font-bold text-slate-900 block">Kredensial API Proyek Supabase:</span>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Supabase Project URL *
                  </label>
                  <input
                    type="text"
                    placeholder="https://xyzcompany.supabase.co"
                    value={supabaseUrlInput}
                    onChange={(e) => setSupabaseUrlInput(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-mono text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                  <p className="text-[10px] text-slate-400 mt-1">Ditemukan di: Project Settings &gt; API &gt; Project URL</p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Supabase Anon / Public Key *
                  </label>
                  <textarea
                    rows={3}
                    placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                    value={supabaseKeyInput}
                    onChange={(e) => setSupabaseKeyInput(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-mono text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none leading-relaxed"
                  />
                  <p className="text-[10px] text-slate-400 mt-1">Ditemukan di: Project Settings &gt; API &gt; Project API Keys &gt; anon public</p>
                </div>

                {supabaseTestStatus && (
                  <div
                    className={`p-3 rounded-lg text-xs border flex items-center gap-2 ${
                      supabaseTestStatus.success
                        ? 'bg-emerald-100/70 border-emerald-300 text-emerald-800'
                        : 'bg-rose-100/70 border-rose-300 text-rose-800'
                    }`}
                  >
                    {supabaseTestStatus.success ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    ) : (
                      <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                    )}
                    <span>{supabaseTestStatus.message}</span>
                  </div>
                )}

                <div className="pt-2 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={handleSaveSupabaseConfig}
                    className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-xs cursor-pointer flex items-center gap-1.5"
                  >
                    <Check className="w-4 h-4" />
                    <span>Simpan &amp; Uji Koneksi</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleTestSupabaseConfig}
                    disabled={isTestingSupabase}
                    className="px-3.5 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 text-xs font-semibold cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 text-slate-500 ${isTestingSupabase ? 'animate-spin text-emerald-600' : ''}`} />
                    <span>{isTestingSupabase ? 'Menguji...' : 'Uji Koneksi Saja'}</span>
                  </button>
                </div>
              </div>

              {/* One-Click Data Migration Tool */}
              <div className="p-4 md:p-5 rounded-xl border border-emerald-200 bg-emerald-50/40 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-lg bg-emerald-600 text-white flex items-center justify-center shrink-0">
                      <Database className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-slate-900">Migrasi Data Otomatis ke Supabase</h4>
                      <p className="text-[11px] text-slate-500">
                        Pindahkan seluruh 2.043 Master Mesin &amp; Rekap Downtime Bulanan langsung ke database cloud PostgreSQL
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleStartMigration}
                    disabled={isMigrating || !isSupabaseConfigured()}
                    className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-xs cursor-pointer disabled:opacity-50 flex items-center gap-1.5 shrink-0"
                  >
                    {isMigrating ? <RefreshCw className="w-4 h-4 animate-spin" /> : <ArrowUp className="w-4 h-4 rotate-45" />}
                    <span>{isMigrating ? 'Memproses Migrasi...' : 'Mulai Migrasi Data Sekarang'}</span>
                  </button>
                </div>

                {migrationProgress && (
                  <div className="p-3 bg-white rounded-lg border border-emerald-200 space-y-1.5">
                    <div className="flex items-center justify-between text-xs font-semibold text-slate-700">
                      <span>{migrationProgress.step}</span>
                      <span className="text-emerald-700 font-bold">{migrationProgress.percent}%</span>
                    </div>
                    <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                      <div
                        className="bg-emerald-600 h-2 rounded-full transition-all duration-300"
                        style={{ width: `${migrationProgress.percent}%` }}
                      />
                    </div>
                    {migrationProgress.details && (
                      <p className="text-[10px] text-slate-500 font-mono">{migrationProgress.details}</p>
                    )}
                  </div>
                )}
              </div>

              {/* One-Click Daily Incidents Migration Tool */}
              <div className="p-4 md:p-5 rounded-xl border border-indigo-200 bg-indigo-50/40 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-lg bg-indigo-600 text-white flex items-center justify-center shrink-0">
                      <FileText className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-slate-900">Migrasi Data Insiden Daily (OASE) ke Supabase</h4>
                      <p className="text-[11px] text-slate-500">
                        Pindahkan seluruh riwayat insiden harian &amp; catatan tindakan penanganan dari cache lokal/spreadsheet ke PostgreSQL
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <label
                      className={`px-3 py-2 rounded-lg border border-indigo-300 bg-white hover:bg-indigo-50 text-indigo-700 text-xs font-bold shadow-xs cursor-pointer flex items-center gap-1.5 transition-colors ${
                        isMigratingDaily || !isSupabaseConfigured() ? 'opacity-50 pointer-events-none' : ''
                      }`}
                      title="Upload file CSV OASE yang tersimpan di komputer Anda"
                    >
                      <Upload className="w-4 h-4 text-indigo-600" />
                      <span>Upload Berkas CSV OASE</span>
                      <input
                        type="file"
                        accept=".csv"
                        onChange={handleDailyCsvFileSelect}
                        disabled={isMigratingDaily || !isSupabaseConfigured()}
                        className="hidden"
                      />
                    </label>

                    <button
                      type="button"
                      onClick={handleStartDailyMigration}
                      disabled={isMigratingDaily || !isSupabaseConfigured()}
                      className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-xs cursor-pointer disabled:opacity-50 flex items-center gap-1.5 shrink-0"
                    >
                      {isMigratingDaily ? <RefreshCw className="w-4 h-4 animate-spin" /> : <ArrowUp className="w-4 h-4 rotate-45" />}
                      <span>{isMigratingDaily ? 'Menyinkronkan Daily...' : 'Migrasikan Arsip Daily'}</span>
                    </button>
                  </div>
                </div>

                {dailyMigrationProgress && (
                  <div className="p-3 bg-white rounded-lg border border-indigo-200 space-y-1.5">
                    <div className="flex items-center justify-between text-xs font-semibold text-slate-700">
                      <span>{dailyMigrationProgress.step}</span>
                      <span className="text-indigo-700 font-bold">{dailyMigrationProgress.percent}%</span>
                    </div>
                    <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                      <div
                        className="bg-indigo-600 h-2 rounded-full transition-all duration-300"
                        style={{ width: `${dailyMigrationProgress.percent}%` }}
                      />
                    </div>
                    {dailyMigrationProgress.details && (
                      <p className="text-[10px] text-slate-500 font-mono">{dailyMigrationProgress.details}</p>
                    )}
                  </div>
                )}
              </div>

              {/* Panduan Schema SQL */}
              <div className="p-4 rounded-xl border border-blue-200 bg-blue-50/50 space-y-2">
                <div className="flex items-center gap-2 text-xs font-bold text-blue-950">
                  <FileText className="w-4 h-4 text-blue-600" />
                  <span>File SQL Schema Siap Pakai</span>
                </div>
                <p className="text-[11px] text-slate-600 leading-relaxed">
                  File skema lengkap (<code className="bg-blue-100 px-1 py-0.5 rounded font-mono text-[10px]">supabase/schema.sql</code>) telah mencakup seluruh tabel master mesin, rekap uptime bulanan, insiden aktif, tiket follow up, quick chips, serta tabel pengguna (<code className="bg-blue-100 px-1 py-0.5 rounded font-mono text-[10px]">app_users</code>) dengan Super Admin default.
                </p>
                <div className="pt-1">
                  <span className="text-[11px] font-semibold text-blue-800">
                    Jalankan file tersebut di menu SQL Editor pada dashboard Supabase Anda.
                  </span>
                </div>
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

      {/* MODAL: Panduan Update Google Apps Script untuk Sinkronisasi Multi-Device */}
      {isGasGuideOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-2xs animate-fadeIn">
          <div className="bg-white rounded-2xl max-w-xl w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-blue-900 via-indigo-900 to-slate-900 text-white">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-blue-500/20 border border-blue-400/30 text-blue-300 flex items-center justify-center">
                  <Cloud className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold">Panduan Update Script Google (1 Menit)</h3>
                  <p className="text-[11px] text-blue-200">Agar Quick Chips otomatis tersinkron di PC 1, PC 2, dst.</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsGasGuideOpen(false)}
                className="text-white/70 hover:text-white p-1 rounded-lg hover:bg-white/10 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4 overflow-y-auto text-xs text-slate-700">
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 text-[11px] space-y-1">
                <div className="flex items-center gap-1.5 font-bold">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                  <span>Mengapa perubahan di PC 1 belum otomatis muncul di PC 2?</span>
                </div>
                <p className="leading-relaxed">
                  Web App Google Apps Script di cloud saat ini berjalan pada deployment versi lama yang belum memuat fungsi <code className="bg-amber-100 px-1 py-0.5 rounded font-mono text-[10px]">getQuickChipsConfig</code> &amp; <code className="bg-amber-100 px-1 py-0.5 rounded font-mono text-[10px]">saveQuickChipsConfig</code>. Cukup lakukan deploy <strong>New version</strong> satu kali di Apps Script Editor, setelah itu seluruh PC akan tersinkron otomatis.
                </p>
              </div>

              <div className="space-y-3">
                <span className="font-bold text-slate-900 block text-xs">Langkah Cepat (Hanya 4 Langkah):</span>

                <div className="space-y-2.5">
                  <div className="flex items-start gap-3 p-3 rounded-xl bg-slate-50 border border-slate-200">
                    <span className="w-5 h-5 rounded-full bg-blue-600 text-white font-bold flex items-center justify-center text-[10px] shrink-0 mt-0.5">
                      1
                    </span>
                    <div>
                      <p className="font-semibold text-slate-800">Buka Project Google Apps Script</p>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        Buka editor Google Apps Script yang terhubung dengan database eMons BCA Anda.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3 p-3 rounded-xl bg-slate-50 border border-slate-200">
                    <span className="w-5 h-5 rounded-full bg-blue-600 text-white font-bold flex items-center justify-center text-[10px] shrink-0 mt-0.5">
                      2
                    </span>
                    <div>
                      <p className="font-semibold text-slate-800">Salin Seluruh Kode Terbaru ke Code.gs</p>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        Buka file <code className="bg-slate-200 px-1 py-0.5 rounded font-mono text-[10px]">Code.gs</code> di Apps Script, lalu gantikan seluruh isinya dengan file terbaru dari:
                      </p>
                      <p className="mt-1 text-[11px] font-mono text-blue-700 bg-blue-50 px-2 py-1 rounded border border-blue-200">
                        apps_script_backend/Code.gs
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3 p-3 rounded-xl bg-slate-50 border border-slate-200">
                    <span className="w-5 h-5 rounded-full bg-blue-600 text-white font-bold flex items-center justify-center text-[10px] shrink-0 mt-0.5">
                      3
                    </span>
                    <div>
                      <p className="font-semibold text-slate-800">Simpan Perubahan</p>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        Tekan <kbd className="px-1.5 py-0.5 bg-slate-200 border rounded font-mono text-[10px]">Ctrl + S</kbd> (atau <kbd className="px-1.5 py-0.5 bg-slate-200 border rounded font-mono text-[10px]">Cmd + S</kbd> di Mac).
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3 p-3 rounded-xl bg-slate-50 border border-slate-200">
                    <span className="w-5 h-5 rounded-full bg-blue-600 text-white font-bold flex items-center justify-center text-[10px] shrink-0 mt-0.5">
                      4
                    </span>
                    <div>
                      <p className="font-semibold text-slate-800">Deploy Versi Baru (Sangat Penting!)</p>
                      <p className="text-[11px] text-slate-500 leading-relaxed mt-0.5">
                        Klik tombol <strong>Deploy</strong> (kanan atas) &gt; pilih <strong>Manage Deployments</strong> &gt; klik ikon <strong>Edit (pensil)</strong> pada Web App aktif &gt; pada bagian <strong>Version</strong> pilih <strong>"New version"</strong> &gt; klik <strong>Deploy</strong>.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-900 text-[11px]">
                <p className="font-semibold">Selesai!</p>
                <p className="mt-0.5">
                  Setelah deploy versi baru selesai, kembali ke dashboard ini lalu klik tombol <strong>"Tarik Data Server"</strong>. Status akan berubah menjadi hijau (Sinkron Cloud Aktif), dan setiap perubahan di PC 1 akan langsung tampil di PC 2!
                </p>
              </div>
            </div>

            <div className="px-5 py-3 border-t border-slate-100 bg-slate-50 flex items-center justify-between">
              <span className="text-[11px] text-slate-500">Hanya perlu dilakukan 1 kali.</span>
              <button
                type="button"
                onClick={() => setIsGasGuideOpen(false)}
                className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold cursor-pointer"
              >
                Saya Mengerti
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Tambah / Edit Pengguna (Super Admin) */}
      {isUserModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-2xs animate-fadeIn">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center">
                  <UserPlus className="w-4 h-4" />
                </div>
                <h3 className="text-sm font-bold text-slate-900">
                  {editingUser ? `Edit Pengguna (@${editingUser.username})` : 'Tambah Pengguna Baru'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsUserModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-200/60 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveUser} className="p-5 space-y-3.5">
              {userFormError && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600" />
                  <span>{userFormError}</span>
                </div>
              )}

              {/* Username & Nama Lengkap */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    Username *
                  </label>
                  <input
                    type="text"
                    placeholder="misal: budi_ops"
                    value={userFormUsername}
                    disabled={Boolean(editingUser)}
                    onChange={(e) => {
                      setUserFormUsername(e.target.value.toLowerCase().replace(/\s+/g, '_'));
                      if (userFormError) setUserFormError('');
                    }}
                    className="w-full px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs font-mono text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:bg-white disabled:opacity-60"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    Nama Lengkap *
                  </label>
                  <input
                    type="text"
                    placeholder="Budi Santoso"
                    value={userFormFullName}
                    onChange={(e) => {
                      setUserFormFullName(e.target.value);
                      if (userFormError) setUserFormError('');
                    }}
                    className="w-full px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:bg-white"
                  />
                </div>
              </div>

              {/* Email & Password */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    Email
                  </label>
                  <input
                    type="email"
                    placeholder="budi@bca.co.id"
                    value={userFormEmail}
                    onChange={(e) => setUserFormEmail(e.target.value)}
                    className="w-full px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:bg-white"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    {editingUser ? 'Password Baru (Opsional)' : 'Password *'}
                  </label>
                  <input
                    type="password"
                    placeholder={editingUser ? 'Kosongkan jika tidak ubah' : 'Password aman'}
                    value={userFormPassword}
                    onChange={(e) => {
                      setUserFormPassword(e.target.value);
                      if (userFormError) setUserFormError('');
                    }}
                    className="w-full px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:bg-white"
                  />
                </div>
              </div>

              {/* Role & Status */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    Peran / Role *
                  </label>
                  <select
                    value={userFormRole}
                    onChange={(e) => setUserFormRole(e.target.value as AppUserRole)}
                    className="w-full px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:bg-white"
                  >
                    <option value="SUPER_ADMIN">Super Admin (Akses Penuh)</option>
                    <option value="KAOPS">Ka Ops (Kepala Operasional)</option>
                    <option value="KAWIL">Ka Wil (Kepala Wilayah)</option>
                    <option value="MONITORING">Monitoring (Dispatcher &amp; Tindakan)</option>
                    <option value="VIEWER">Viewer (Hanya Lihat)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    Status Akun *
                  </label>
                  <select
                    value={userFormStatus}
                    onChange={(e) => setUserFormStatus(e.target.value as AppUserStatus)}
                    className="w-full px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:bg-white"
                  >
                    <option value="ACTIVE">Aktif (Dapat Login)</option>
                    <option value="INACTIVE">Nonaktif (Diblokir)</option>
                  </select>
                </div>
              </div>

              {/* Batasan Sektor (Opsional) */}
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  Batas Sektor Tertentu (Opsional)
                </label>
                <input
                  type="text"
                  placeholder="Kosongkan jika berhak melihat semua sektor (default)"
                  value={userFormSektor}
                  onChange={(e) => setUserFormSektor(e.target.value)}
                  className="w-full px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:bg-white"
                />
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsUserModalOpen(false)}
                  className="px-3.5 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 text-xs font-semibold cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-xs cursor-pointer"
                >
                  {editingUser ? 'Simpan Perubahan' : 'Tambahkan Pengguna'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
