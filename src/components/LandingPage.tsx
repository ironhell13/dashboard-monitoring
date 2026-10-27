import React, { useState, useRef } from 'react';
import {
  Zap,
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
  HelpCircle
} from 'lucide-react';
import { loginKaOpsApi, loginKaWilApi } from '../utils/monitoringService';

interface LandingPageProps {
  onSelectMode: (mode: 'KAWIL' | 'KAOPS' | 'MONITORING') => void;
}

export default function LandingPage({ onSelectMode }: LandingPageProps) {
  const [selectedVerifyRole, setSelectedVerifyRole] = useState<'KAWIL' | 'KAOPS'>('KAWIL');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [lockStatus, setLockStatus] = useState<string | null>(null);
  const [showForgotModal, setShowForgotModal] = useState(false);

  const passwordInputRef = useRef<HTMLInputElement>(null);

  const handleSelectRole = (role: 'KAWIL' | 'KAOPS') => {
    setSelectedVerifyRole(role);
    setErrorMessage(null);
    setPassword('');
    if (passwordInputRef.current) {
      passwordInputRef.current.focus();
    }
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const roleLabel = selectedVerifyRole === 'KAWIL' ? 'Ka Wil' : 'Ka Ops';
    if (!password.trim()) {
      setErrorMessage(`Silakan masukkan password otorisasi ${roleLabel}.`);
      if (passwordInputRef.current) {
        passwordInputRef.current.focus();
      }
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);
    setLockStatus(null);

    try {
      if (selectedVerifyRole === 'KAWIL') {
        const res = await loginKaWilApi(password.trim());
        if (res.success && res.token) {
          try {
            sessionStorage.setItem('KAWIL_TOKEN', res.token);
            sessionStorage.setItem('APP_MODE', 'KAWIL');
            sessionStorage.setItem('USER_ROLE', 'KAWIL');
          } catch (e) {
            console.error('Failed to set sessionStorage', e);
          }
          window.location.hash = '#/dashboard';
          onSelectMode('KAWIL');
        } else {
          if (res.isLocked) {
            setLockStatus('Akses Ka Wil terkunci sementara karena 5x percobaan gagal. Silakan coba lagi dalam 5 menit.');
          } else if (res.remainingAttempts !== undefined) {
            setErrorMessage(`Password salah! Sisa percobaan: ${res.remainingAttempts}x lagi`);
          } else {
            setErrorMessage(res.message || 'Password salah atau otentikasi gagal.');
          }
        }
      } else {
        const res = await loginKaOpsApi(password.trim());
        if (res.success && res.token) {
          try {
            sessionStorage.setItem('KAOPS_TOKEN', res.token);
            sessionStorage.setItem('APP_MODE', 'KAOPS');
            sessionStorage.setItem('USER_ROLE', 'KAOPS');
          } catch (e) {
            console.error('Failed to set sessionStorage', e);
          }
          window.location.hash = '#/dashboard';
          onSelectMode('KAOPS');
        } else {
          if (res.isLocked) {
            setLockStatus('Akses Ka Ops terkunci sementara karena 5x percobaan gagal. Silakan coba lagi dalam 5 menit.');
          } else if (res.remainingAttempts !== undefined) {
            setErrorMessage(`Password salah! Sisa percobaan: ${res.remainingAttempts}x lagi`);
          } else {
            setErrorMessage(res.message || 'Password salah atau otentikasi gagal.');
          }
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
    <div className="min-h-screen bg-[#EEF5F7] text-slate-700 flex flex-col justify-between selection:bg-teal-100 selection:text-teal-900 relative antialiased font-sans overflow-x-hidden">
      {/* Top Gradient Wave Banner */}
      <div className="absolute top-0 left-0 right-0 h-[430px] bg-gradient-to-r from-[#0E8B7E] via-[#169B8D] to-[#34B79D] z-0 overflow-hidden">
        {/* Subtle radial ambient highlights */}
        <div className="absolute -top-24 -left-24 w-96 h-96 rounded-full bg-white/10 blur-2xl pointer-events-none" />
        <div className="absolute top-10 right-0 w-[500px] h-[400px] rounded-full bg-white/10 blur-3xl pointer-events-none" />
        
        {/* Soft bottom organic wave transition to #EEF5F7 */}
        <svg
          className="absolute bottom-0 left-0 w-full text-[#EEF5F7] fill-current pointer-events-none"
          viewBox="0 0 1440 120"
          preserveAspectRatio="none"
          style={{ height: '70px' }}
        >
          <path d="M0,32L60,42.7C120,53,240,75,360,80C480,85,600,75,720,58.7C840,43,960,21,1080,21.3C1200,21,1320,43,1380,53.3L1440,64L1440,120L1380,120C1320,120,1200,120,1080,120C960,120,840,120,720,120C600,120,480,120,360,120C240,120,120,120,60,120L0,120Z" />
        </svg>
      </div>

      {/* Main Content Area */}
      <div className="relative z-10 w-full max-w-[1240px] mx-auto px-6 sm:px-10 pt-6 pb-6 flex-1 flex flex-col">
        {/* Top Header Bar */}
        <header className="flex items-center justify-between pb-6">
          {/* Logo & Branding */}
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-white/20 backdrop-blur-md border border-white/30 flex items-center justify-center text-white shadow-sm">
              <Zap className="w-5 h-5 fill-current" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-white font-extrabold tracking-tight text-base sm:text-[17px]">
                  eMons ATM CRM
                </span>
                <span className="text-[10px] bg-white/20 backdrop-blur-md text-white font-bold px-2.5 py-0.5 rounded-full border border-white/30 tracking-wider">
                  BCA OPERATIONAL
                </span>
              </div>
              <p className="text-white/80 text-xs font-normal mt-0.5">
                Efficient Monitoring System
              </p>
            </div>
          </div>

          {/* SLA Status Indicator */}
          <div className="flex items-center gap-2 bg-white/15 backdrop-blur-md px-3.5 py-1.5 rounded-full border border-white/25 text-white text-xs shadow-sm">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="font-medium text-[11px] sm:text-xs">Sistem Monitoring Aktif</span>
          </div>
        </header>

        {/* Hero Title & Tagline */}
        <section className="text-center mt-6 sm:mt-8 mb-8 text-white">
          <h1 className="text-2xl sm:text-4xl font-extrabold tracking-tight leading-tight max-w-2xl mx-auto">
            Manajemen &amp; Monitoring Downtime<br />
            ATM/CRM
          </h1>
          <p className="text-xs sm:text-[13px] font-bold text-white/90 tracking-[0.2em] mt-3 uppercase flex items-center justify-center gap-3">
            <span>PANTAU</span>
            <span className="text-white/40 font-light">|</span>
            <span>DETEKSI</span>
            <span className="text-white/40 font-light">|</span>
            <span>TANGANI</span>
          </p>
        </section>

        {/* Two-Column Cards Grid */}
        <main className="flex-1 flex items-center justify-center py-2">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch max-w-5xl w-full">
            
            {/* KARTU KIRI: Monitoring Operasional */}
            <div className="lg:col-span-5 bg-white rounded-[26px] p-7 sm:p-8 shadow-[0_12px_35px_rgba(14,141,128,0.08)] border border-white/80 flex flex-col justify-between">
              <div>
                {/* Header Row */}
                <div className="flex items-start justify-between">
                  <div className="w-12 h-12 rounded-2xl bg-[#E8F8F5] border border-[#BCE8E2] flex items-center justify-center text-[#0D9488] shadow-inner">
                    <Monitor className="w-6 h-6 stroke-[2]" />
                  </div>
                  <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold bg-[#EAFBF3] text-[#047857] border border-[#A7F3D0] px-3 py-1 rounded-full">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#10B981]" />
                    Akses Terbuka / Tanpa Password
                  </span>
                </div>

                {/* Title & Subtitle */}
                <div className="mt-5">
                  <h2 className="text-xl font-bold text-[#0F172A] tracking-tight">
                    Monitoring Operasional
                  </h2>
                  <p className="text-xs text-[#64748B] font-medium mt-1">
                    Tim Petugas &amp; Helpdesk Monitoring Wilayah Jakarta
                  </p>
                </div>

                {/* Checklist */}
                <div className="space-y-3.5 mt-6">
                  <div className="flex items-center gap-3">
                    <span className="w-5 h-5 rounded-full bg-[#DCFCE7] text-[#16A34A] flex items-center justify-center shrink-0">
                      <Check className="w-3 h-3 stroke-[3]" />
                    </span>
                    <span className="text-[13px] text-[#334155] font-medium">
                      Pantau uptime real-time seluruh WSID
                    </span>
                  </div>

                  <div className="flex items-center gap-3">
                    <span className="w-5 h-5 rounded-full bg-[#DCFCE7] text-[#16A34A] flex items-center justify-center shrink-0">
                      <Check className="w-3 h-3 stroke-[3]" />
                    </span>
                    <span className="text-[13px] text-[#334155] font-medium">
                      Cek Frekuensi Tinggi Problem Mesin
                    </span>
                  </div>

                  <div className="flex items-center gap-3">
                    <span className="w-5 h-5 rounded-full bg-[#DCFCE7] text-[#16A34A] flex items-center justify-center shrink-0">
                      <Check className="w-3 h-3 stroke-[3]" />
                    </span>
                    <span className="text-[13px] text-[#334155] font-medium">
                      Input progress penanganan lapangan real-time
                    </span>
                  </div>

                  <div className="flex items-center gap-3">
                    <span className="w-5 h-5 rounded-full bg-[#DCFCE7] text-[#16A34A] flex items-center justify-center shrink-0">
                      <Check className="w-3 h-3 stroke-[3]" />
                    </span>
                    <span className="text-[13px] text-[#334155] font-medium">
                      Penanganan Cepat Problem Berulang
                    </span>
                  </div>
                </div>
              </div>

              {/* Bottom Action Area */}
              <div className="mt-8 pt-6 border-t border-slate-100">
                <button
                  type="button"
                  onClick={handleEnterMonitoring}
                  className="w-full bg-[#0B1527] hover:bg-[#1E293B] text-white font-semibold text-sm py-3.5 px-5 rounded-xl shadow-sm transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-[0.99]"
                >
                  <span>Buka Dashboard Langsung</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
                <p className="text-xs text-[#94A3B8] font-normal text-center mt-2.5">
                  Tidak Memerlukan Password
                </p>
              </div>
            </div>

            {/* KARTU KANAN: Akses Otorisasi Khusus */}
            <div className="lg:col-span-7 bg-white rounded-[26px] p-7 sm:p-8 shadow-[0_12px_35px_rgba(14,141,128,0.08)] border border-white/80 flex flex-col justify-between">
              <div>
                {/* Header Row */}
                <div className="flex items-start justify-between">
                  <div>
                    <span className="text-[11px] font-bold tracking-wider text-[#94A3B8] uppercase block">
                      AKSES OTORISASI KHUSUS
                    </span>
                    <h2 className="text-lg font-bold text-[#0F172A] mt-0.5 tracking-tight">
                      Pilih Level Manajemen
                    </h2>
                  </div>
                  <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold bg-[#FFFBEB] text-[#B45309] border border-[#FDE68A] px-3 py-1 rounded-full">
                    <Lock className="w-3 h-3 text-[#B45309]" />
                    Wajib Password
                  </span>
                </div>

                {/* Level Tabs Switcher */}
                <div className="bg-[#F1F5F9] p-1.5 rounded-xl flex gap-1.5 mt-5">
                  <button
                    type="button"
                    onClick={() => handleSelectRole('KAWIL')}
                    className={`flex-1 py-2.5 px-3 rounded-lg text-xs transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                      selectedVerifyRole === 'KAWIL'
                        ? 'bg-white text-[#0F172A] shadow-xs font-bold'
                        : 'text-[#64748B] hover:text-[#0F172A] font-medium'
                    }`}
                  >
                    <Building2 className={`w-4 h-4 ${selectedVerifyRole === 'KAWIL' ? 'text-[#0284C7]' : 'text-slate-400'}`} />
                    <span>Ka Wil</span>
                    <span className="text-[#64748B] font-normal text-[11px] ml-0.5">(Kepala Wilayah)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSelectRole('KAOPS')}
                    className={`flex-1 py-2.5 px-3 rounded-lg text-xs transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                      selectedVerifyRole === 'KAOPS'
                        ? 'bg-white text-[#0F172A] shadow-xs font-bold'
                        : 'text-[#64748B] hover:text-[#0F172A] font-medium'
                    }`}
                  >
                    <ShieldCheck className={`w-4 h-4 ${selectedVerifyRole === 'KAOPS' ? 'text-[#0284C7]' : 'text-slate-400'}`} />
                    <span>Ka Ops</span>
                    <span className="text-[#64748B] font-normal text-[11px] ml-0.5">(Operasional)</span>
                  </button>
                </div>

                {/* Verification Box Banner */}
                <div className="bg-[#F4F9FF] border border-[#DBEAFE] rounded-xl p-3.5 flex items-center gap-3.5 mt-4">
                  <div className="w-11 h-11 rounded-xl bg-[#004B99] text-white flex items-center justify-center font-extrabold text-sm shrink-0 shadow-xs tracking-tight">
                    {selectedVerifyRole === 'KAWIL' ? 'KW' : 'KO'}
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-[#0F172A] text-[13px]">
                        {selectedVerifyRole === 'KAWIL'
                          ? 'Verifikasi Otorisasi Ka Wil'
                          : 'Verifikasi Otorisasi Ka Ops'}
                      </span>
                      <span className={`text-[9.5px] font-bold px-2 py-0.5 rounded tracking-wide uppercase ${
                        selectedVerifyRole === 'KAWIL'
                          ? 'bg-[#DBEAFE] text-[#1E40AF]'
                          : 'bg-[#E0F2FE] text-[#0369A1]'
                      }`}>
                        {selectedVerifyRole === 'KAWIL' ? 'EXECUTIVE ACCESS' : 'OPERATIONAL ACCESS'}
                      </span>
                    </div>
                    <p className="text-xs text-[#64748B] mt-0.5 leading-snug">
                      {selectedVerifyRole === 'KAWIL'
                        ? 'Monitoring komprehensif performa downtime seluruh sektor'
                        : 'Monitoring operasional lapangan & koordinasi penanganan teknisi'}
                    </p>
                  </div>
                </div>

                {/* Form Inputs */}
                {lockStatus ? (
                  <div className="mt-5 p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs space-y-2">
                    <div className="flex items-center gap-2 font-bold text-rose-600">
                      <AlertTriangle className="w-4 h-4 shrink-0" />
                      <span>Akses Terkunci Sementara</span>
                    </div>
                    <p className="leading-relaxed">{lockStatus}</p>
                  </div>
                ) : (
                  <form onSubmit={handleLoginSubmit} className="mt-5 space-y-3.5">
                    <div>
                      {/* Label & Forgot Password Link */}
                      <div className="flex items-center justify-between mb-1.5">
                        <label
                          htmlFor="supervisor-pass"
                          className="text-[11px] font-bold tracking-wider text-[#475569] uppercase"
                        >
                          PASSWORD OTORISASI
                        </label>
                        <button
                          type="button"
                          onClick={() => setShowForgotModal(true)}
                          className="text-xs font-semibold text-[#0B63E5] hover:underline cursor-pointer"
                        >
                          Lupa Password?
                        </button>
                      </div>

                      {/* Input Box with Lock & Eye Toggle */}
                      <div className="relative">
                        <Lock className="w-4 h-4 text-[#94A3B8] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                        <input
                          ref={passwordInputRef}
                          id="supervisor-pass"
                          type={showPassword ? 'text' : 'password'}
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          placeholder={
                            selectedVerifyRole === 'KAWIL'
                              ? 'Masukkan password otorisasi Ka Wil...'
                              : 'Masukkan password otorisasi Ka Ops...'
                          }
                          className={`w-full bg-white border rounded-xl pl-10 pr-10 py-3 text-xs text-[#0F172A] placeholder:text-[#94A3B8] focus:outline-none transition-all ${
                            errorMessage
                              ? 'border-red-300 bg-red-50/20 focus:border-red-500 focus:ring-2 focus:ring-red-100'
                              : 'border-[#CBD5E1] focus:border-[#0B63E5] focus:ring-2 focus:ring-[#0B63E5]/15'
                          }`}
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="w-8 h-8 flex items-center justify-center text-[#94A3B8] hover:text-[#475569] absolute right-1.5 top-1/2 -translate-y-1/2 cursor-pointer focus:outline-none"
                          title={showPassword ? 'Sembunyikan password' : 'Lihat password'}
                        >
                          {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>

                    {/* Error Notice */}
                    {errorMessage && (
                      <div className="text-[#E53E3E] text-xs font-medium bg-red-50 border border-red-200 rounded-lg p-2.5 flex items-center gap-2 animate-pulse">
                        <AlertTriangle className="w-4 h-4 shrink-0 text-[#E53E3E]" />
                        <span>{errorMessage}</span>
                      </div>
                    )}

                    {/* Audit Log Banner */}
                    <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl p-2.5 flex items-center gap-2.5 text-xs text-[#475569]">
                      <ShieldCheck className="w-4 h-4 text-[#0284C7] shrink-0" />
                      <span>Setiap aktivitas login dicatat pada audit log</span>
                    </div>

                    {/* Right-Aligned Submit Button */}
                    <div className="flex justify-end pt-3">
                      <button
                        type="submit"
                        disabled={isLoading}
                        className="bg-[#005AA9] hover:bg-[#004887] text-white font-semibold text-xs py-3 px-6 rounded-xl shadow-xs transition-all flex items-center gap-2 cursor-pointer active:scale-[0.99] disabled:opacity-50"
                      >
                        {isLoading && <Clock className="w-3.5 h-3.5 animate-spin" />}
                        <span>
                          {isLoading
                            ? 'Memverifikasi...'
                            : selectedVerifyRole === 'KAWIL'
                            ? 'Masuk sebagai Ka Wil'
                            : 'Masuk sebagai Ka Ops'}
                        </span>
                        {!isLoading && <ArrowRight className="w-4 h-4" />}
                      </button>
                    </div>
                  </form>
                )}
              </div>
            </div>

          </div>
        </main>

        {/* Footer */}
        <footer className="pt-6 pb-2 text-xs text-[#475569] font-medium">
          &copy; {new Date().getFullYear()} Mons Digital Studio &bull;
        </footer>
      </div>

      {/* Modal Lupa Password */}
      {showForgotModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-xl border border-slate-100 space-y-4">
            <div className="flex items-start justify-between">
              <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                <HelpCircle className="w-5 h-5" />
              </div>
              <button
                type="button"
                onClick={() => setShowForgotModal(false)}
                className="w-8 h-8 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div>
              <h3 className="text-sm font-bold text-slate-800">Bantuan Password Otorisasi</h3>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                Password otorisasi Ka Wil dan Ka Ops dikelola secara terpusat oleh tim Administrator IT &amp; Helpdesk Operasional BCA Wilayah Jakarta.
              </p>
              <div className="mt-3 p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-600 space-y-1">
                <div className="font-semibold text-slate-700">Kontak Helpdesk Support:</div>
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
