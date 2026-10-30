import React, { useState, useEffect } from 'react';
import { getBackendApiUrl, setBackendApiUrl, apiGet } from '../utils/apiClient';

interface BackendConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved?: () => void;
}

export const BackendConfigModal: React.FC<BackendConfigModalProps> = ({
  isOpen,
  onClose,
  onSaved
}) => {
  const [url, setUrl] = useState('');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
    latency?: number;
  } | null>(null);

  useEffect(() => {
    if (isOpen) {
      setUrl(getBackendApiUrl() || '');
      setTestResult(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleTest = async () => {
    const trimmed = url.trim();
    if (!trimmed) {
      setTestResult({
        success: false,
        message: 'Masukkan URL Google Apps Script Web App terlebih dahulu.'
      });
      return;
    }

    setTesting(true);
    setTestResult(null);
    const start = performance.now();

    try {
      // Simpan sementara untuk diuji
      setBackendApiUrl(trimmed);
      const res = await apiGet('ping');
      const latency = Math.round(performance.now() - start);

      if (res && res.success) {
        setTestResult({
          success: true,
          message: `Koneksi Berhasil! ${res.message || 'Backend Online'}`,
          latency
        });
      } else {
        setTestResult({
          success: false,
          message: res?.message || 'Respon server tidak valid.',
          latency
        });
      }
    } catch (err: any) {
      const latency = Math.round(performance.now() - start);
      setTestResult({
        success: false,
        message: `Gagal terhubung: ${err.message || String(err)}. Pastikan Web App di-deploy dengan akses 'Anyone' (Siapa saja).`,
        latency
      });
    } finally {
      setTesting(false);
    }
  };

  const handleSave = () => {
    const trimmed = url.trim();
    setBackendApiUrl(trimmed);
    if (onSaved) onSaved();
    onClose();
  };

  const handleReset = () => {
    setBackendApiUrl('');
    setUrl('');
    setTestResult({
      success: true,
      message: 'Pengaturan dikembalikan ke konfigurasi default.'
    });
    if (onSaved) onSaved();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-fade-in">
      <div className="bg-white border border-[#E5EAF2] rounded-lg max-w-xl w-full p-6 shadow-xl text-slate-900 flex flex-col gap-4">
        <div className="flex items-center justify-between pb-3 border-b border-[#E5EAF2]">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-blue-50 text-blue-600 border border-blue-100">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 tracking-tight">Koneksi Backend Google Apps Script</h3>
              <p className="text-xs text-slate-500">Hubungkan frontend Vercel ini ke Web App Apps Script backend Anda</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 p-1 rounded-lg hover:bg-slate-100 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="space-y-3.5">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Google Apps Script Web App URL <span className="text-blue-600 font-normal">(/exec)</span>
            </label>
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://script.google.com/macros/s/AKfycb.../exec"
              className="w-full bg-white border border-[#E5EAF2] rounded-lg px-3 py-2 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-colors font-mono"
            />
            <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
              Dapatkan URL ini saat melakukan <strong>Deploy &gt; New deployment &gt; Web app</strong> di Apps Script. Pastikan <em>Who has access</em> diatur ke <strong>Anyone</strong>.
            </p>
          </div>

          {testResult && (
            <div
              className={`p-3 rounded-lg border text-xs flex items-start gap-2 transition ${
                testResult.success
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                  : 'bg-rose-50 border-rose-200 text-rose-800'
              }`}
            >
              <div className="mt-0.5">
                {testResult.success ? (
                  <svg className="w-4 h-4 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4 text-rose-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                )}
              </div>
              <div className="flex-1">
                <div className="font-semibold">{testResult.message}</div>
                {testResult.latency !== undefined && (
                  <div className="text-[10px] text-slate-500 mt-0.5">Latency: {testResult.latency} ms</div>
                )}
              </div>
            </div>
          )}

          <div className="p-3 bg-slate-50 rounded-lg border border-[#E5EAF2] text-xs text-slate-600 space-y-1">
            <div className="font-semibold text-slate-800 flex items-center gap-1.5">
              <span>💡</span> Tips Deploy di Vercel:
            </div>
            <p className="text-[11px]">
              Anda juga bisa mengatur URL ini secara otomatis untuk seluruh user dengan menambahkan Environment Variable di Vercel Dashboard:
            </p>
            <code className="block bg-white px-2 py-1 rounded text-blue-700 font-mono text-[11px] border border-[#E5EAF2]">
              VITE_GAS_API_URL=https://script.google.com/macros/s/.../exec
            </code>
          </div>
        </div>

        <div className="flex items-center justify-between pt-2 border-t border-[#E5EAF2]">
          <button
            type="button"
            onClick={handleReset}
            className="text-xs text-slate-500 hover:text-slate-800 font-medium py-1.5 px-2 rounded hover:bg-slate-50 transition-colors"
          >
            Reset ke Default
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleTest}
              disabled={testing}
              className="px-3 py-1.5 rounded-lg text-xs font-medium bg-white hover:bg-slate-50 text-slate-700 border border-[#E5EAF2] transition-colors shadow-2xs disabled:opacity-50 flex items-center gap-1.5"
            >
              {testing ? (
                <>
                  <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  <span>Menguji...</span>
                </>
              ) : (
                <span>Test Koneksi</span>
              )}
            </button>

            <button
              type="button"
              onClick={handleSave}
              className="px-3.5 py-1.5 rounded-lg text-xs font-medium bg-blue-600 hover:bg-blue-700 text-white shadow-2xs transition-colors"
            >
              Simpan Pengaturan
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
