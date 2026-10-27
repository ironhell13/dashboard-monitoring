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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl max-w-xl w-full p-6 shadow-2xl text-slate-100 flex flex-col gap-5">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white tracking-tight">Koneksi Backend Google Apps Script</h3>
              <p className="text-xs text-slate-400">Hubungkan frontend Vercel ini ke Web App Apps Script backend Anda</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              Google Apps Script Web App URL <span className="text-blue-400">(/exec)</span>
            </label>
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://script.google.com/macros/s/AKfycb.../exec"
              className="w-full bg-slate-950 border border-slate-700/80 rounded-xl px-3.5 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition font-mono"
            />
            <p className="text-[11px] text-slate-400 mt-1.5 leading-relaxed">
              Dapatkan URL ini saat melakukan <strong>Deploy &gt; New deployment &gt; Web app</strong> di Apps Script. Pastikan <em>Who has access</em> diatur ke <strong>Anyone</strong>.
            </p>
          </div>

          {testResult && (
            <div
              className={`p-3.5 rounded-xl border text-xs flex items-start gap-2.5 transition ${
                testResult.success
                  ? 'bg-emerald-950/40 border-emerald-500/30 text-emerald-300'
                  : 'bg-rose-950/40 border-rose-500/30 text-rose-300'
              }`}
            >
              <div className="mt-0.5">
                {testResult.success ? (
                  <svg className="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4 text-rose-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                )}
              </div>
              <div className="flex-1">
                <div className="font-semibold">{testResult.message}</div>
                {testResult.latency !== undefined && (
                  <div className="text-[10px] opacity-75 mt-0.5">Latency: {testResult.latency} ms</div>
                )}
              </div>
            </div>
          )}

          <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800/80 text-xs text-slate-400 space-y-1.5">
            <div className="font-semibold text-slate-300 flex items-center gap-1.5">
              <span>💡</span> Tips Deploy di Vercel:
            </div>
            <p>
              Anda juga bisa mengatur URL ini secara otomatis untuk seluruh user dengan menambahkan Environment Variable di Vercel Dashboard:
            </p>
            <code className="block bg-slate-900 px-2 py-1 rounded text-blue-400 font-mono text-[11px] border border-slate-800">
              VITE_GAS_API_URL=https://script.google.com/macros/s/.../exec
            </code>
          </div>
        </div>

        <div className="flex items-center justify-between pt-2 border-t border-slate-800">
          <button
            type="button"
            onClick={handleReset}
            className="text-xs text-slate-400 hover:text-slate-200 transition py-2 px-3 rounded-lg hover:bg-slate-800/50"
          >
            Reset ke Default
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleTest}
              disabled={testing}
              className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition disabled:opacity-50 flex items-center gap-1.5"
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
                <>
                  <span>⚡ Test Koneksi</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={handleSave}
              className="px-4 py-2 rounded-xl text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-600/30 transition"
            >
              Simpan Pengaturan
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
