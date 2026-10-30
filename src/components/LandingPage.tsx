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
    <div className="min-h-screen bg-[#F5F7FB] text-slate-800 flex flex-col justify-between selection:bg-blue-100 selection:text-blue-900 font-sans antialiased">
      {/* Top Professional Corporate Banner - Semi-transparent */}
      <div className="bg-[#0F172A]/75 backdrop-blur-md border-b border-slate-700/50 text-white">
        <div className="max-w-[1240px] mx-auto px-6 sm:px-10 py-6">
          {/* Top Header Bar */}
          <header className="flex items-center justify-between pb-6 border-b border-slate-700/40">
            {/* Logo & Branding */}
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-blue-600 flex items-center justify-center text-white shadow-xs">
                <Zap className="w-4 h-4 fill-current" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-white font-bold tracking-tight text-base sm:text-[16px]">
                    eMons ATM CRM
                  </span>
                  <span className="text-[10px] bg-blue-900/60 text-blue-300 font-medium px-2 py-0.5 rounded border border-blue-700/50">
                    BCA OPERATIONAL
                  </span>
                </div>
                <p className="text-slate-400 text-xs mt-0.5">
                  Efficient Monitoring System
                </p>
              </div>
            </div>

            {/* SLA Status Indicator */}
            <div className="flex items-center gap-2 bg-slate-800/80 px-3 py-1 rounded-full border border-slate-700 text-slate-300 text-xs">
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              <span className="font-medium text-[11px] sm:text-xs text-slate-200">Sistem Monitoring Aktif</span>
            </div>
          </header>

          {/* Hero Section */}
          <section className="text-center pt-8 pb-6 text-white max-w-2xl mx-auto">
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-100">
              Manajemen &amp; Monitoring Downtime ATM/CRM
            </h1>
            <p className="text-xs sm:text-[12px] font-semibold text-blue-400 tracking-widest mt-2.5 uppercase flex items-center justify-center gap-3">
              <span>PANTAU</span>
              <span className="text-slate-600">•</span>
              <span>DETEKSI</span>
              <span className="text-slate-600">•</span>
              <span>TANGANI</span>
            </p>
          </section>
        </div>
      </div>

      {/* Main Content Area */}
      <main className="flex-1 flex items-center justify-center py-10 px-6 sm:px-10">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch max-w-5xl w-full">
          
          {/* KARTU KIRI: Monitoring Operasional (Akses Terbuka) */}
          <div className="lg:col-span-5 bg-white rounded-xl p-6 sm:p-7 border border-[#E5EAF2] shadow-xs flex flex-col justify-between">
            <div>
              {/* Header Row */}
              <div className="flex items-start justify-between">
                <div className="w-10 h-10 rounded-lg bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600">
                  <Monitor className="w-5 h-5 stroke-[2]" />
                </div>
                <span className="inline-flex items-center gap-1.5 text-[11px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200 px-2.5 py-0.5 rounded-full">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  Akses Terbuka
                </span>
              </div>

              {/* Title & Subtitle */}
              <div className="mt-4">
                <h2 className="text-lg font-bold text-slate-900 tracking-tight">
                  Monitoring Operasional
                </h2>
                <p className="text-xs text-slate-500 mt-1">
                  Petugas &amp; Helpdesk Monitoring Operasional
                </p>
              </div>

              {/* Checklist */}
              <div className="space-y-3 mt-6">
                <div className="flex items-center gap-2.5">
                  <span className="w-4 h-4 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0 border border-emerald-200">
                    <Check className="w-2.5 h-2.5 stroke-[3]" />
                  </span>
                  <span className="text-xs text-slate-700 font-medium">
                    Pantau uptime real-time seluruh WSID
                  </span>
                </div>

                <div className="flex items-center gap-2.5">
                  <span className="w-4 h-4 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0 border border-emerald-200">
                    <Check className="w-2.5 h-2.5 stroke-[3]" />
                  </span>
                  <span className="text-xs text-slate-700 font-medium">
                    Cek Frekuensi Tinggi Problem Mesin
                  </span>
                </div>

                <div className="flex items-center gap-2.5">
                  <span className="w-4 h-4 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0 border border-emerald-200">
                    <Check className="w-2.5 h-2.5 stroke-[3]" />
                  </span>
                  <span className="text-xs text-slate-700 font-medium">
                    Input progress penanganan lapangan real-time
                  </span>
                </div>

                <div className="flex items-center gap-2.5">
                  <span className="w-4 h-4 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0 border border-emerald-200">
                    <Check className="w-2.5 h-2.5 stroke-[3]" />
                  </span>
                  <span className="text-xs text-slate-700 font-medium">
                    Penanganan Cepat Problem Berulang
                  </span>
                </div>
              </div>
            </div>

            {/* Bottom Action Area */}
            <div className="mt-8 pt-5 border-t border-[#E5EAF2]">
              <button
                type="button"
                onClick={handleEnterMonitoring}
                className="w-full bg-slate-900 hover:bg-slate-800 text-white font-medium text-xs py-2.5 px-4 rounded-lg transition-colors flex items-center justify-center gap-2 cursor-pointer shadow-xs"
              >
                <span>Buka Dashboard Langsung</span>
                <ArrowRight className="w-4 h-4" />
              </button>
              <p className="text-[11px] text-slate-400 text-center mt-2">
                Tidak Memerlukan Password
              </p>
            </div>
          </div>

          {/* KARTU KANAN: Akses Otorisasi Khusus (Wajib Password) */}
          <div className="lg:col-span-7 bg-white rounded-xl p-6 sm:p-7 border border-[#E5EAF2] shadow-xs flex flex-col justify-between">
            <div>
              {/* Header Row */}
              <div className="flex items-start justify-between">
                <div>
                  <span className="text-[10px] font-semibold tracking-wider text-slate-400 uppercase block">
                    AKSES OTORISASI KHUSUS
                  </span>
                  <h2 className="text-lg font-bold text-slate-900 mt-0.5 tracking-tight">
                    Pilih Level Manajemen
                  </h2>
                </div>
                <span className="inline-flex items-center gap-1.5 text-[11px] font-medium bg-amber-50 text-amber-700 border border-amber-200 px-2.5 py-0.5 rounded-full">
                  <Lock className="w-3 h-3 text-amber-600" />
                  Wajib Password
                </span>
              </div>

              {/* Level Tabs Switcher */}
              <div className="bg-slate-100 p-1 rounded-lg flex gap-1 mt-4">
                <button
                  type="button"
                  onClick={() => handleSelectRole('KAWIL')}
                  className={`flex-1 py-2 px-3 rounded-md text-xs transition-colors cursor-pointer flex items-center justify-center gap-1.5 ${
                    selectedVerifyRole === 'KAWIL'
                      ? 'bg-white text-slate-900 shadow-2xs font-semibold'
                      : 'text-slate-600 hover:text-slate-900 font-medium'
                  }`}
                >
                  <Building2 className={`w-3.5 h-3.5 ${selectedVerifyRole === 'KAWIL' ? 'text-blue-600' : 'text-slate-400'}`} />
                  <span>Ka Wil</span>
                  <span className="text-slate-400 font-normal text-[11px] ml-0.5">(Kepala Wilayah)</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleSelectRole('KAOPS')}
                  className={`flex-1 py-2 px-3 rounded-md text-xs transition-colors cursor-pointer flex items-center justify-center gap-1.5 ${
                    selectedVerifyRole === 'KAOPS'
                      ? 'bg-white text-slate-900 shadow-2xs font-semibold'
                      : 'text-slate-600 hover:text-slate-900 font-medium'
                  }`}
                >
                  <ShieldCheck className={`w-3.5 h-3.5 ${selectedVerifyRole === 'KAOPS' ? 'text-blue-600' : 'text-slate-400'}`} />
                  <span>Ka Ops</span>
                  <span className="text-slate-400 font-normal text-[11px] ml-0.5">(Operasional)</span>
                </button>
              </div>

              {/* Verification Box Banner */}
              <div className="bg-slate-50 border border-[#E5EAF2] rounded-lg p-3 flex items-center gap-3 mt-4">
                <div className="w-9 h-9 rounded-md bg-blue-600 text-white flex items-center justify-center font-bold text-xs shrink-0 shadow-2xs">
                  {selectedVerifyRole === 'KAWIL' ? 'KW' : 'KO'}
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-slate-900 text-xs">
                      {selectedVerifyRole === 'KAWIL'
                        ? 'Verifikasi Otorisasi Ka Wil'
                        : 'Verifikasi Otorisasi Ka Ops'}
                    </span>
                    <span className={`text-[9px] font-semibold px-1.5 py-0.2 rounded uppercase ${
                      selectedVerifyRole === 'KAWIL'
                        ? 'bg-blue-50 text-blue-700 border border-blue-200'
                        : 'bg-slate-200/80 text-slate-700'
                    }`}>
                      {selectedVerifyRole === 'KAWIL' ? 'EXECUTIVE ACCESS' : 'OPERATIONAL ACCESS'}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">
                    {selectedVerifyRole === 'KAWIL'
                      ? 'Monitoring komprehensif performa downtime seluruh sektor'
                      : 'Monitoring operasional lapangan & koordinasi penanganan teknisi'}
                  </p>
                </div>
              </div>

              {/* Form Inputs */}
              {lockStatus ? (
                <div className="mt-4 p-3.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs space-y-1.5">
                  <div className="flex items-center gap-2 font-semibold text-rose-700">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    <span>Akses Terkunci Sementara</span>
                  </div>
                  <p className="leading-relaxed">{lockStatus}</p>
                </div>
              ) : (
                <form onSubmit={handleLoginSubmit} className="mt-4 space-y-3">
                  <div>
                    {/* Label & Forgot Password Link */}
                    <div className="flex items-center justify-between mb-1">
                      <label
                        htmlFor="supervisor-pass"
                        className="text-[10px] font-semibold tracking-wider text-slate-500 uppercase"
                      >
                        PASSWORD OTORISASI
                      </label>
                      <button
                        type="button"
                        onClick={() => setShowForgotModal(true)}
                        className="text-xs font-medium text-blue-600 hover:underline cursor-pointer"
                      >
                        Lupa Password?
                      </button>
                    </div>

                    {/* Input Box with Lock & Eye Toggle */}
                    <div className="relative">
                      <Lock className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
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
                        className={`w-full bg-white border rounded-lg pl-9 pr-9 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none transition-colors ${
                          errorMessage
                            ? 'border-rose-300 bg-rose-50/20 focus:border-rose-500'
                            : 'border-[#CBD5E1] focus:border-blue-600 focus:ring-1 focus:ring-blue-600'
                        }`}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="w-7 h-7 flex items-center justify-center text-slate-400 hover:text-slate-600 absolute right-1 top-1/2 -translate-y-1/2 cursor-pointer focus:outline-none"
                        title={showPassword ? 'Sembunyikan password' : 'Lihat password'}
                      >
                        {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>

                  {/* Error Notice */}
                  {errorMessage && (
                    <div className="text-rose-700 text-xs font-medium bg-rose-50 border border-rose-200 rounded-md p-2 flex items-center gap-2">
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-rose-600" />
                      <span>{errorMessage}</span>
                    </div>
                  )}

                  {/* Audit Log Banner */}
                  <div className="bg-slate-50 border border-[#E5EAF2] rounded-lg p-2 flex items-center gap-2 text-xs text-slate-500">
                    <ShieldCheck className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                    <span>Setiap aktivitas login dicatat pada audit log</span>
                  </div>

                  {/* Right-Aligned Submit Button - Solid Blue Enterprise Button */}
                  <div className="flex justify-end pt-2">
                    <button
                      type="submit"
                      disabled={isLoading}
                      className="bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-medium text-xs py-2 px-5 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs disabled:opacity-50"
                    >
                      {isLoading && <Clock className="w-3.5 h-3.5 animate-spin" />}
                      <span>
                        {isLoading
                          ? 'Memverifikasi...'
                          : selectedVerifyRole === 'KAWIL'
                          ? 'Masuk sebagai Ka Wil'
                          : 'Masuk sebagai Ka Ops'}
                      </span>
                      {!isLoading && <ArrowRight className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>

        </div>
      </main>

      {/* Footer */}
      <footer className="py-4 text-center text-xs text-slate-400 border-t border-[#E5EAF2]">
        ©️ 2026 Mons Digital Studio • eMons ATM CRM
      </footer>

      {/* Modal Lupa Password */}
      {showForgotModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-xl max-w-sm w-full p-5 shadow-lg border border-[#E5EAF2] space-y-4">
            <div className="flex items-start justify-between">
              <div className="w-9 h-9 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center border border-blue-100">
                <HelpCircle className="w-5 h-5" />
              </div>
              <button
                type="button"
                onClick={() => setShowForgotModal(false)}
                className="w-7 h-7 rounded-md hover:bg-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div>
              <h3 className="text-sm font-bold text-slate-900">Bantuan Password Otorisasi</h3>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                Password otorisasi Ka Wil dan Ka Ops dikelola secara terpusat oleh tim Administrator IT &amp; Helpdesk Operasional BCA Wilayah Jakarta.
              </p>
              <div className="mt-3 p-3 bg-slate-50 border border-[#E5EAF2] rounded-lg text-xs text-slate-600 space-y-1">
                <div className="font-semibold text-slate-800">Kontak Helpdesk Support:</div>
                <div>Ext: <strong>4881 / 4882</strong></div>
                <div>Email: <strong>ops-monitoring@bca.co.id</strong></div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowForgotModal(false)}
              className="w-full py-2 px-4 bg-slate-900 hover:bg-slate-800 text-white text-xs font-medium rounded-lg transition-colors cursor-pointer"
            >
              Tutup
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
