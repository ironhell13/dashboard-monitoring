import React, { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  private handleReload = () => {
    window.location.reload();
  };

  private handleResetToUpload = () => {
    window.location.hash = '#/dashboard';
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
          <div className="bg-white max-w-lg w-full p-8 rounded-2xl shadow-xl border border-rose-100 text-center">
            <div className="w-16 h-16 bg-rose-50 text-rose-500 rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertTriangle size={32} />
            </div>
            <h2 className="text-xl font-bold text-slate-800 mb-2">Terjadi Kendala Tampilan</h2>
            <p className="text-sm text-slate-500 mb-6">
              Aplikasi mendeteksi kendala pada komponen. Silakan muat ulang halaman atau kembali ke menu upload.
            </p>
            {this.state.error && (
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-left mb-6 overflow-x-auto max-h-40">
                <p className="text-xs font-mono text-rose-600 font-semibold break-all">
                  {this.state.error.name}: {this.state.error.message}
                </p>
              </div>
            )}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <button
                onClick={this.handleReload}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl transition-all shadow-sm"
              >
                <RefreshCw size={16} />
                Muat Ulang
              </button>
              <button
                onClick={this.handleResetToUpload}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-semibold rounded-xl transition-all"
              >
                <Home size={16} />
                Kembali ke Upload
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
