import React, { useState, useRef, useEffect } from 'react';
import {
  Activity,
  ShieldCheck,
  Building2,
  Lock,
  ArrowRight,
  Monitor,
  Eye,
  EyeOff,
  AlertTriangle,
  Clock,
  Check,
  X,
  HelpCircle,
  KeyRound,
  User,
  Crown,
  ChevronRight
} from 'lucide-react';
import { authenticateUserSupabase } from '../utils/supabaseService';

interface LandingPageProps {
  onSelectMode: (mode: 'KAWIL' | 'KAOPS' | 'MONITORING') => void;
}

type VerifyRole = 'KAWIL' | 'KAOPS' | 'SUPER_ADMIN';

export default function LandingPage({ onSelectMode }: LandingPageProps) {
  const [selectedVerifyRole, setSelectedVerifyRole] = useState<VerifyRole>('KAWIL');
  const [username, setUsername] = useState('kawil');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [lockStatus, setLockStatus] = useState<string | null>(null);
  const [showForgotModal, setShowForgotModal] = useState(false);

  const passwordInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Eager prefetch dataset ringkasan di latar belakang selagi user berada di halaman login
    fetch('/summary-data.json').catch(() => {});
  }, []);

  const handleSelectRole = (role: VerifyRole) => {
    setSelectedVerifyRole(role);
    setErrorMessage(null);
    setPassword('');
    if (role === 'SUPER_ADMIN') {
      setUsername('superadmin');
    } else if (role === 'KAWIL') {
      setUsername('kawil');
    } else {
      setUsername('kaops');
    }
    if (passwordInputRef.current) {
      passwordInputRef.current.focus();
    }
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim()) {
      setErrorMessage('Silakan masukkan Username / ID Pengguna.');
      return;
    }
    if (!password.trim()) {
      setErrorMessage('Silakan masukkan Password akun.');
      if (passwordInputRef.current) {
        passwordInputRef.current.focus();
      }
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);
    setLockStatus(null);

    try {
      const res = await authenticateUserSupabase(username.trim(), password.trim());

      if (res.success && res.token) {
        const effRole = res.role || selectedVerifyRole;
        try {
          sessionStorage.setItem('USER_ROLE', effRole);
          sessionStorage.setItem('USERNAME', username.trim().toLowerCase());
          if (effRole === 'KAWIL') {
            sessionStorage.setItem('KAWIL_TOKEN', res.token);
            sessionStorage.setItem('APP_MODE', 'KAWIL');
          } else {
            sessionStorage.setItem('KAOPS_TOKEN', res.token);
            sessionStorage.setItem('APP_MODE', 'KAOPS');
          }
        } catch (e) {
          console.error('Failed to set sessionStorage', e);
        }
        window.location.hash = '#/dashboard';
        onSelectMode(effRole === 'KAWIL' ? 'KAWIL' : 'KAOPS');
      } else {
        if (res.isLocked) {
          setLockStatus('Akses terkunci sementara karena beberapa kali percobaan gagal. Silakan coba lagi.');
        } else {
          setErrorMessage(res.message || 'Username atau Password salah!');
        }
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'Terjadi kesalahan sistem saat verifikasi.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleEnterMonitoring = () => {
    try {
      sessionStorage.setItem('APP_MODE', 'MONITORING');
      sessionStorage.setItem('USER_ROLE', 'MONITORING');
    } catch (e) {}
    onSelectMode('MONITORING');
  };

  return (
    <div className="bg-[#F4F7FC] text-slate-800 font-sans min-h-screen flex flex-col justify-between selection:bg-blue-600 selection:text-white antialiased">
      {/* BEGIN: TopNavigationBar */}
      <header className="w-full bg-[#0B192C] text-white border-b border-slate-800 sticky top-0 z-40 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          {/* Brand & Subtitle */}
          <div className="flex items-center space-x-3">
            <div className="h-9 w-9 rounded-lg bg-blue-600 flex items-center justify-center text-white shadow-md shadow-blue-500/30">
              <Activity className="w-5 h-5" />
            </div>
            <div className="flex items-baseline space-x-2">
              <span className="font-bold tracking-tight text-lg text-white">
                eMons <span className="text-[#00A3FF]">ATM CRM</span>
              </span>
              <span className="hidden sm:inline-block px-2 py-0.5 text-xs font-semibold uppercase tracking-wider rounded bg-blue-900/60 text-blue-200 border border-blue-700/50">
                BCA Operational
              </span>
            </div>
          </div>

          {/* Real-time Status Indicator */}
          <div className="flex items-center space-x-3">
            <div className="flex items-center space-x-2 bg-slate-900/80 px-3.5 py-1.5 rounded-full border border-slate-700/60 text-xs font-medium text-emerald-300">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
              </span>
              <span className="tracking-wide">Sistem Monitoring Aktif</span>
            </div>
            <span className="hidden md:inline-block text-xs text-slate-400 border-l border-slate-700 pl-3">
              v4.2 PROD
            </span>
          </div>
        </div>
      </header>
      {/* END: TopNavigationBar */}

      {/* BEGIN: MainContentArea */}
      <main className="flex-grow flex items-center justify-center py-8 px-4 sm:px-6 lg:px-8 bg-grid-pattern">
        <div className="w-full max-w-7xl mx-auto">
          {/* System Overview Banner Header */}
          <div className="text-center mb-6 sm:mb-8">
            <h1 className="text-2xl sm:text-3xl font-extrabold text-[#0B192C] tracking-tight">
              Manajemen &amp; Monitoring Downtime ATM/CRM
            </h1>
            <div className="mt-2 flex items-center justify-center space-x-3 text-xs sm:text-sm font-semibold text-blue-600 uppercase tracking-widest">
              <span>Pantau</span>
              <span className="text-slate-300">•</span>
              <span>Deteksi</span>
              <span className="text-slate-300">•</span>
              <span>Tangani</span>
            </div>
          </div>

          {/* Center Brand Graphic */}
          <div className="flex justify-center items-center -my-3 sm:-my-4 mb-4">
            <img
              src="https://lh3.googleusercontent.com/aida-public/AB6AXuDKRbp3aaMSV52UGzTvc0WmdV-PUXMRSxolfWF74I1xV927r-tY95aQdWiEhXwsSe_nSiNlZ7mrtXsDaN-jN_eVGO4KqYrF2iwZOv2bDHte4A8wJI9_jSO-tXAQEGPv8Gv2ai3j_h-rkeSpzHLMruSvIDF77HMW3q7dxiStcx0nMhAMNVMwvuO4cqGRcuMvDSbMqOJcH_UfVJtFBjEm5eMj3gcY6gvefz2su4wvDNfJ9XcYunNNJz_uSt-PsWPnduQ-"
              alt="eMons Efficient Monitoring System Logo"
              className="w-full max-w-[480px] sm:max-w-[540px] h-auto object-contain mix-blend-multiply transition-opacity duration-300"
              onError={(e) => {
                // Sembunyikan elemen jika URL gambar tidak dapat diakses
                (e.target as HTMLElement).style.display = 'none';
              }}
            />
          </div>

          {/* Two-Column Desktop Layout Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start max-w-6xl mx-auto">
            {/* KARTU KIRI: Monitoring Operasional (Akses Cepat) */}
            <section className="bg-white rounded-2xl border border-blue-100 p-6 sm:p-7 panel-glow relative overflow-hidden flex flex-col justify-between shadow-sm hover:border-blue-300 transition-all duration-200 min-h-[480px]">
              <div className="absolute top-0 right-0 w-32 h-32 bg-blue-50 rounded-bl-full pointer-events-none -z-0" />
              
              <div className="relative z-10 flex flex-col h-full justify-between">
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <span className="text-[11px] font-bold uppercase tracking-wider text-blue-600 block mb-0.5">
                        Portal Utama Sistem
                      </span>
                      <h2 className="text-xl font-bold text-slate-900">Monitoring Operasional</h2>
                    </div>
                    <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1.5" />
                      Akses Terbuka
                    </span>
                  </div>

                  <div className="p-4 rounded-xl bg-blue-50/70 border border-blue-100 mb-5">
                    <div className="flex items-start space-x-3.5">
                      <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center flex-shrink-0 shadow-sm">
                        <Monitor className="w-5 h-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className="font-bold text-sm text-slate-900 block leading-tight">
                          Leader dan Supervisor
                        </span>
                        <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                          Pintu masuk cepat operasional rutin untuk pemantauan problem, pelaporan, dan tindak lanjut eskalasi harian secara real-time.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-3 mb-6">
                    <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/60 flex items-center justify-between">
                      <div className="flex items-center space-x-2.5">
                        <div className="w-8 h-8 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-blue-600">
                          <Activity className="w-4 h-4" />
                        </div>
                        <div>
                          <span className="block text-xs font-bold text-slate-800">Status Kanal Dashboard</span>
                          <span className="text-[11px] text-slate-500">Terhubung ke Database Monitoring Pusat</span>
                        </div>
                      </div>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                        Siap Akses
                      </span>
                    </div>

                    <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/60 flex items-center justify-between">
                      <div className="flex items-center space-x-2.5">
                        <div className="w-8 h-8 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-slate-700">
                          <User className="w-4 h-4" />
                        </div>
                        <div>
                          <span className="block text-xs font-bold text-slate-800">Mode Otentikasi Petugas</span>
                          <span className="text-[11px] text-slate-500">SSO Jaringan Internal / Akses Langsung</span>
                        </div>
                      </div>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                        Instan
                      </span>
                    </div>
                  </div>
                </div>

                <div>
                  <div className="pt-2">
                    <button
                      type="button"
                      onClick={handleEnterMonitoring}
                      className="w-full inline-flex items-center justify-center px-6 py-3 rounded-xl text-sm font-bold text-white bg-slate-900 hover:bg-slate-800 active:bg-slate-900 transition duration-150 shadow-md group cursor-pointer"
                    >
                      <span>Buka Dashboard Operasional</span>
                      <ArrowRight className="ml-2 w-4 h-4 group-hover:translate-x-1 transition-transform" />
                    </button>
                  </div>
                  <div className="mt-5 pt-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                    <span className="font-medium text-slate-400 text-[11px]">Sesi Langsung Terproteksi</span>
                    <span className="text-[11px] text-slate-400 font-medium italic">Tanpa Perlu Kata Sandi Khusus</span>
                  </div>
                </div>
              </div>
            </section>

            {/* KARTU KANAN: Akses Otorisasi Khusus (Wajib Password) */}
            <section className="bg-white rounded-2xl border border-slate-200/80 p-6 sm:p-7 panel-glow relative min-h-[480px] flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-0.5">
                      Akses Otorisasi Khusus
                    </span>
                    <h2 className="text-xl font-bold text-slate-900">Pilih Level Manajemen</h2>
                  </div>
                  <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-200">
                    <Lock className="w-3 h-3 mr-1.5 text-amber-600" />
                    Wajib Password
                  </span>
                </div>

                {/* Role Tab Selector (Ka Wil vs Ka Ops vs Super Admin) */}
                {selectedVerifyRole === 'SUPER_ADMIN' ? (
                  <div className="bg-amber-500/10 border border-amber-300/80 rounded-xl p-3 flex items-center justify-between mb-5">
                    <div className="flex items-center space-x-2.5">
                      <div className="w-7 h-7 rounded-lg bg-amber-500 text-white flex items-center justify-center font-bold text-xs shadow-xs">
                        <Crown className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="text-xs font-bold text-amber-900 leading-tight">Portal Super Administrator</div>
                        <div className="text-[11px] text-amber-700">Akses penuh konfigurasi sistem &amp; basis data</div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleSelectRole('KAWIL')}
                      className="text-xs text-amber-800 hover:text-amber-950 font-semibold cursor-pointer underline flex items-center gap-0.5"
                    >
                      <span>← Kembali</span>
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100/90 rounded-xl mb-5">
                    <button
                      type="button"
                      onClick={() => handleSelectRole('KAWIL')}
                      className={`flex items-center justify-center space-x-2 py-2.5 px-3 rounded-lg text-xs sm:text-sm font-semibold transition cursor-pointer ${
                        selectedVerifyRole === 'KAWIL'
                          ? 'bg-white text-blue-700 shadow-sm border border-slate-200/60'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <Building2 className="w-4 h-4" />
                      <span>Ka Wil (Kepala Wilayah)</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSelectRole('KAOPS')}
                      className={`flex items-center justify-center space-x-2 py-2.5 px-3 rounded-lg text-xs sm:text-sm font-semibold transition cursor-pointer ${
                        selectedVerifyRole === 'KAOPS'
                          ? 'bg-white text-indigo-700 shadow-sm border border-slate-200/60'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <ShieldCheck className="w-4 h-4" />
                      <span>Ka Ops (Operasional)</span>
                    </button>
                  </div>
                )}

                {/* Role Badge Container */}
                <div className={`mb-5 p-3.5 rounded-xl border flex items-center space-x-3.5 ${
                  selectedVerifyRole === 'SUPER_ADMIN'
                    ? 'bg-amber-50/70 border-amber-200'
                    : selectedVerifyRole === 'KAOPS'
                    ? 'bg-indigo-50/70 border-indigo-100'
                    : 'bg-blue-50/70 border-blue-100'
                }`}>
                  <div className={`w-10 h-10 rounded-lg text-white font-bold text-sm flex items-center justify-center shadow-sm shrink-0 ${
                    selectedVerifyRole === 'SUPER_ADMIN'
                      ? 'bg-amber-600'
                      : selectedVerifyRole === 'KAOPS'
                      ? 'bg-indigo-600'
                      : 'bg-blue-600'
                  }`}>
                    {selectedVerifyRole === 'KAWIL' ? 'KW' : selectedVerifyRole === 'SUPER_ADMIN' ? 'SA' : 'KO'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center space-x-2">
                      <span className="font-bold text-xs text-slate-900">
                        {selectedVerifyRole === 'KAWIL'
                          ? 'Verifikasi Otorisasi Ka Wil'
                          : selectedVerifyRole === 'SUPER_ADMIN'
                          ? 'Verifikasi Otorisasi Super Admin'
                          : 'Verifikasi Otorisasi Ka Ops'}
                      </span>
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase ${
                        selectedVerifyRole === 'KAWIL'
                          ? 'bg-blue-200 text-blue-900'
                          : selectedVerifyRole === 'SUPER_ADMIN'
                          ? 'bg-amber-200 text-amber-900'
                          : 'bg-indigo-200 text-indigo-900'
                      }`}>
                        {selectedVerifyRole === 'KAWIL'
                          ? 'Executive Access'
                          : selectedVerifyRole === 'SUPER_ADMIN'
                          ? 'Root Privilege'
                          : 'Operations Lead'}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-600 truncate mt-0.5">
                      {selectedVerifyRole === 'KAWIL'
                        ? 'Monitoring komprehensif performa downtime seluruh sektor'
                        : selectedVerifyRole === 'SUPER_ADMIN'
                        ? 'Akses penuh manajemen sistem, database Supabase, dan hak akses user'
                        : 'Kontrol teknis, penugasan teknisi vendor & investigasi kendala ATM/CRM'}
                    </p>
                  </div>
                </div>

                {/* Form Authentication */}
                {lockStatus ? (
                  <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs space-y-1.5 mb-4">
                    <div className="flex items-center gap-2 font-bold text-rose-700">
                      <AlertTriangle className="w-4 h-4 shrink-0" />
                      <span>Akses Terkunci Sementara</span>
                    </div>
                    <p className="leading-relaxed">{lockStatus}</p>
                  </div>
                ) : (
                  <form onSubmit={handleLoginSubmit} className="space-y-4">
                    {/* Username Input */}
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5" htmlFor="login-username">
                        Username / ID Pengguna
                      </label>
                      <div className="relative rounded-xl shadow-xs">
                        <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                          <User className="w-4 h-4" />
                        </div>
                        <input
                          id="login-username"
                          name="username"
                          type="text"
                          required
                          value={username}
                          onChange={(e) => setUsername(e.target.value)}
                          placeholder="Masukkan ID Pengguna"
                          className="block w-full pl-10 pr-4 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-600 focus:border-blue-600 transition"
                        />
                      </div>
                    </div>

                    {/* Password Input */}
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider" htmlFor="login-password">
                          Password Akun
                        </label>
                        <button
                          type="button"
                          onClick={() => setShowForgotModal(true)}
                          className="text-xs font-medium text-blue-600 hover:text-blue-800 transition cursor-pointer"
                        >
                          Lupa Password?
                        </button>
                      </div>
                      <div className="relative rounded-xl shadow-xs">
                        <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                          <Lock className="w-4 h-4" />
                        </div>
                        <input
                          ref={passwordInputRef}
                          id="login-password"
                          name="password"
                          type={showPassword ? 'text' : 'password'}
                          required
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          placeholder="Masukkan password akun..."
                          className={`block w-full pl-10 pr-10 py-2.5 text-sm bg-slate-50 border rounded-xl focus:bg-white focus:ring-2 transition ${
                            errorMessage
                              ? 'border-rose-300 bg-rose-50/20 focus:ring-rose-500 focus:border-rose-500'
                              : 'border-slate-200 focus:ring-blue-600 focus:border-blue-600'
                          }`}
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-600 focus:outline-none cursor-pointer"
                          title={showPassword ? 'Sembunyikan password' : 'Lihat password'}
                        >
                          {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>

                    {/* Error Notice */}
                    {errorMessage && (
                      <div className="text-rose-700 text-xs font-medium bg-rose-50 border border-rose-200 rounded-xl p-2.5 flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600" />
                        <span>{errorMessage}</span>
                      </div>
                    )}

                    {/* Security Notice */}
                    <div className="flex items-center space-x-2 text-[11px] text-slate-500 bg-slate-50 p-2.5 rounded-lg border border-slate-200/60">
                      <ShieldCheck className="w-4 h-4 text-blue-600 shrink-0" />
                      <span>Setiap aktivitas login dicatat pada audit log database keamanan sentral.</span>
                    </div>

                    {/* Submit Button */}
                    <div className="pt-2">
                      <button
                        type="submit"
                        disabled={isLoading}
                        className={`w-full inline-flex items-center justify-center px-6 py-3 rounded-xl text-sm font-bold text-white transition duration-150 shadow-md group cursor-pointer disabled:opacity-60 ${
                          selectedVerifyRole === 'SUPER_ADMIN'
                            ? 'bg-amber-600 hover:bg-amber-700 active:bg-amber-800 shadow-amber-500/20'
                            : selectedVerifyRole === 'KAOPS'
                            ? 'bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 shadow-indigo-500/20'
                            : 'bg-blue-600 hover:bg-blue-700 active:bg-blue-800 shadow-blue-500/20'
                        }`}
                      >
                        {isLoading && <Clock className="w-4 h-4 mr-2 animate-spin" />}
                        <span>
                          {isLoading
                            ? 'Memverifikasi...'
                            : selectedVerifyRole === 'SUPER_ADMIN'
                            ? 'Masuk sebagai Super Admin'
                            : selectedVerifyRole === 'KAWIL'
                            ? 'Masuk sebagai Ka Wil'
                            : 'Masuk sebagai Ka Ops'}
                        </span>
                        {!isLoading && (
                          <ArrowRight className="ml-2 w-4 h-4 group-hover:translate-x-1 transition-transform" />
                        )}
                      </button>
                    </div>
                  </form>
                )}
              </div>

              {/* Bottom Card Footer */}
              <div className="mt-5 pt-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                <span className="font-medium text-slate-400 text-[11px]">Akses Khusus Terproteksi</span>
                <div className="flex items-center space-x-3 sm:space-x-4 font-medium">
                  {selectedVerifyRole === 'SUPER_ADMIN' ? (
                    <button
                      type="button"
                      onClick={() => handleSelectRole('KAWIL')}
                      className="hover:text-blue-600 transition flex items-center cursor-pointer text-[11px]"
                    >
                      <span>← Kembali ke Login Pengguna</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleSelectRole('SUPER_ADMIN')}
                      className="hover:text-blue-600 transition flex items-center cursor-pointer text-[11px]"
                      title="Portal Otorisasi Khusus Super Admin"
                    >
                      <KeyRound className="mr-1 w-3.5 h-3.5 text-slate-400" />
                      <span>Portal Administrator</span>
                    </button>
                  )}
                  <span className="text-slate-300">•</span>
                  <button
                    type="button"
                    onClick={() => setShowForgotModal(true)}
                    className="hover:text-blue-600 transition cursor-pointer text-[11px]"
                  >
                    Bantuan Teknis
                  </button>
                </div>
              </div>
            </section>
          </div>
        </div>
      </main>
      {/* END: MainContentArea */}

      {/* BEGIN: Footer */}
      <footer className="w-full bg-white border-t border-slate-200 py-4 text-center text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <div className="flex items-center space-x-1.5">
            <span>©️ 2026 <strong>Mons Digital Studio</strong> • eMons ATM CRM</span>
          </div>
          <div className="flex items-center space-x-4 text-slate-400 text-[11px]">
            <span>Bank Central Asia Operational Gateway</span>
          </div>
        </div>
      </footer>
      {/* END: Footer */}

      {/* Modal Lupa Password / Bantuan Teknis */}
      {showForgotModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-start justify-between">
              <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center border border-blue-100">
                <HelpCircle className="w-5 h-5" />
              </div>
              <button
                type="button"
                onClick={() => setShowForgotModal(false)}
                className="w-7 h-7 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div>
              <h3 className="text-base font-bold text-slate-900">Bantuan Password Otorisasi</h3>
              <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
                Password otorisasi Ka Wil dan Ka Ops dikelola secara terpusat oleh tim Administrator IT &amp; Helpdesk Operasional BCA Wilayah Jakarta.
              </p>
              <div className="mt-3.5 p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-600 space-y-1.5">
                <div className="font-semibold text-slate-800">Kontak Helpdesk Support:</div>
                <div>Ext: <strong>4881 / 4882</strong></div>
                <div>Email: <strong>ops-monitoring@bca.co.id</strong></div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowForgotModal(false)}
              className="w-full py-2.5 px-4 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-xl transition-colors cursor-pointer"
            >
              Tutup
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
