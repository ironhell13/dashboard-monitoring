import { useState } from 'react';
import { Outlet, NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Activity,
  CalendarCheck,
  ClipboardCheck,
  Database,
  Server,
  MapPin,
  UploadCloud,
  Zap,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen
} from 'lucide-react';
import FilterBar from './FilterBar';
import { useDataStore } from '../store/useDataStore';

interface LayoutProps {
  onLogout?: () => void;
  userRole?: 'KAWIL' | 'KAOPS' | 'MONITORING';
}

export default function Layout({ onLogout, userRole }: LayoutProps) {
  const location = useLocation();
  const { machines } = useDataStore();
  const effectiveRole = userRole || (sessionStorage.getItem('USER_ROLE') as any) || 'KAOPS';

  // Persist sidebar collapsed preference in localStorage
  const [isCollapsed, setIsCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem('SIDEBAR_COLLAPSED') === 'true';
    } catch (e) {
      return false;
    }
  });

  const toggleCollapse = () => {
    setIsCollapsed(prev => {
      const next = !prev;
      try {
        localStorage.setItem('SIDEBAR_COLLAPSED', String(next));
      } catch (e) {}
      return next;
    });
  };

  const activeMachines = machines.filter(m => m.statusAktif?.trim().toUpperCase() === 'AKTIF');
  const bcaCount = activeMachines.filter(m => m.klienStatus === 'BCA').length;
  const nonBcaCount = activeMachines.filter(m => m.klienStatus === 'Non BCA').length;

  // Clean structured menu groups
  const menuSections = [
    {
      title: 'RINGKASAN & SLA',
      items: [
        { name: 'Dashboard Overview', path: '/dashboard', icon: LayoutDashboard },
        { name: 'Total Uptime Bulanan', path: '/total-uptime', icon: Activity },
      ]
    },
    {
      title: 'OPERASIONAL & TIKET',
      items: [
        { name: 'Cek Daily Incident', path: '/cek-daily', icon: CalendarCheck },
        { name: 'Need to Follow Up', path: '/follow-up', icon: ClipboardCheck },
      ]
    },
    {
      title: 'DATABASE & WILAYAH',
      items: [
        { name: 'Seluruh WSID Aktif', path: '/all-wsid', icon: Database },
        { name: 'Mesin per Sektor', path: '/sektor-mesin', icon: Server },
        { name: 'Service Point', path: '/service-point', icon: MapPin },
      ]
    },
    {
      title: 'PENGATURAN',
      items: [
        { name: 'Upload Data', path: '/upload', icon: UploadCloud },
      ]
    }
  ];

  return (
    <div className="min-h-screen bg-[#F4F7FE] flex overflow-hidden font-sans text-slate-700 selection:bg-teal-100 selection:text-teal-900">
      {/* Sidebar Navigation */}
      <aside
        className={`${
          isCollapsed ? 'w-20' : 'w-72'
        } bg-white/95 backdrop-blur-md m-4 mr-0 rounded-3xl border border-slate-100 shadow-[0px_3.5px_5.5px_rgba(0,0,0,0.02)] flex flex-col flex-shrink-0 z-20 transition-all duration-300 ease-in-out`}
      >
        {/* Brand Header */}
        {!isCollapsed ? (
          <div className="p-5 pb-4 border-b border-slate-100">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-teal-400 to-[#319795] text-white flex items-center justify-center shadow-[0px_4px_12px_rgba(79,209,197,0.35)] shrink-0">
                  <Zap className="w-5 h-5 fill-current" />
                </div>
                <div className="truncate">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[#2D3748] font-extrabold tracking-tight text-sm truncate">
                      eMons ATM CRM
                    </span>
                    <span className="text-[9px] bg-teal-50 text-[#319795] font-semibold px-1.5 py-0.5 rounded-full border border-teal-200/60 shrink-0">
                      PROD
                    </span>
                  </div>
                  <p className="text-slate-400 text-[11px] font-normal leading-tight truncate">
                    Efficient Monitoring System
                  </p>
                </div>
              </div>

              {/* Minimize Sidebar Button */}
              <button
                type="button"
                onClick={toggleCollapse}
                className="w-8 h-8 rounded-xl bg-slate-50 hover:bg-teal-50 border border-slate-200/80 hover:border-teal-200 text-slate-500 hover:text-[#006A63] flex items-center justify-center transition-colors cursor-pointer shrink-0 shadow-xs"
                title="Minimize Sidebar (Kecilkan)"
              >
                <PanelLeftClose className="w-4 h-4" />
              </button>
            </div>

            <div className="flex items-center justify-between mt-3.5 pt-2.5 border-t border-slate-100">
              <span className="text-[11px] font-medium text-slate-400">Portal Operasional</span>
              <span
                className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                  effectiveRole === 'KAWIL'
                    ? 'bg-indigo-50 text-indigo-700 border border-indigo-200/80'
                    : effectiveRole === 'KAOPS'
                    ? 'bg-teal-50 text-[#006A63] border border-teal-200/80'
                    : 'bg-slate-100 text-slate-700 border border-slate-200'
                }`}
              >
                {effectiveRole === 'KAWIL' ? 'Ka Wil' : effectiveRole === 'KAOPS' ? 'Ka Ops' : 'Monitoring'}
              </span>
            </div>
          </div>
        ) : (
          <div className="p-4 pb-3 border-b border-slate-100 flex flex-col items-center gap-2">
            <div
              className="w-10 h-10 rounded-xl bg-gradient-to-tr from-teal-400 to-[#319795] text-white flex items-center justify-center shadow-[0px_4px_12px_rgba(79,209,197,0.35)] shrink-0"
              title="eMons ATM CRM - Efficient Monitoring System"
            >
              <Zap className="w-5 h-5 fill-current" />
            </div>

            <button
              type="button"
              onClick={toggleCollapse}
              className="w-8 h-8 rounded-xl bg-slate-50 hover:bg-teal-50 border border-slate-200/80 hover:border-teal-200 text-slate-500 hover:text-[#006A63] flex items-center justify-center transition-colors cursor-pointer shadow-xs"
              title="Perluas Sidebar"
            >
              <PanelLeftOpen className="w-4 h-4" />
            </button>

            <span
              className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-extrabold uppercase tracking-tight ${
                effectiveRole === 'KAWIL'
                  ? 'bg-indigo-50 text-indigo-700 border border-indigo-200/80'
                  : effectiveRole === 'KAOPS'
                  ? 'bg-teal-50 text-[#006A63] border border-teal-200/80'
                  : 'bg-slate-100 text-slate-700'
              }`}
              title={`Portal Operasional: ${effectiveRole === 'KAWIL' ? 'Ka Wil' : 'Ka Ops'}`}
            >
              {effectiveRole === 'KAWIL' ? 'KW' : effectiveRole === 'KAOPS' ? 'KO' : 'MON'}
            </span>
          </div>
        )}

        {/* Structured Menu List */}
        <nav className="flex-1 px-3 py-4 space-y-4 overflow-y-auto custom-scrollbar">
          {menuSections.map((section, idx) => (
            <div key={section.title} className="space-y-1">
              {!isCollapsed ? (
                <p className="px-3 text-[10px] font-extrabold tracking-wider uppercase text-slate-400">
                  {section.title}
                </p>
              ) : idx > 0 ? (
                <div className="w-8 h-px bg-slate-100 mx-auto my-2" />
              ) : null}

              <div className="space-y-1">
                {section.items.map((item) => {
                  const isActive = location.pathname === item.path;
                  const Icon = item.icon;
                  return (
                    <div key={item.path} className="relative group">
                      <NavLink
                        to={item.path}
                        className={`group flex items-center ${
                          isCollapsed ? 'justify-center p-2.5' : 'gap-3 px-3 py-2.5'
                        } rounded-xl transition-all duration-200 ${
                          isActive
                            ? 'bg-[#4FD1C5] text-white shadow-[0px_4px_12px_rgba(79,209,197,0.35)] font-semibold'
                            : 'text-slate-600 hover:text-[#2D3748] hover:bg-slate-50 font-medium'
                        }`}
                      >
                        <div
                          className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-colors ${
                            isActive
                              ? 'bg-white/20 text-white'
                              : 'bg-slate-100 text-slate-500 group-hover:bg-teal-50 group-hover:text-[#319795]'
                          }`}
                        >
                          <Icon className="w-4 h-4" />
                        </div>
                        {!isCollapsed && <span className="text-xs tracking-tight truncate">{item.name}</span>}
                      </NavLink>

                      {/* Tooltip on hover when collapsed */}
                      {isCollapsed && (
                        <div className="absolute left-full top-1/2 -translate-y-1/2 ml-3.5 px-3 py-1.5 bg-slate-900 text-white text-xs font-semibold rounded-lg shadow-xl whitespace-nowrap opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity z-50">
                          {item.name}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* Machine Stats in Sidebar Footer */}
        {machines.length > 0 && (
          !isCollapsed ? (
            <div className="p-3.5 m-3 mb-2 rounded-2xl bg-slate-50/80 border border-slate-100 text-xs text-slate-500 shadow-inner">
              <div className="flex justify-between items-center mb-1.5">
                <span className="font-semibold text-slate-600 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                  <span>Mesin Aktif:</span>
                </span>
                <span className="font-bold text-[#2D3748]">{activeMachines.length} WSID</span>
              </div>
              <div className="flex justify-between items-center text-[11px] pt-1 border-t border-slate-200/60">
                <span className="bg-teal-50 text-[#319795] font-semibold px-2 py-0.5 rounded-md border border-teal-200/50">
                  BCA: {bcaCount}
                </span>
                <span className="bg-amber-50 text-amber-700 font-semibold px-2 py-0.5 rounded-md border border-amber-200/50">
                  Non BCA: {nonBcaCount}
                </span>
              </div>
            </div>
          ) : (
            <div className="px-2 my-2 relative group flex justify-center">
              <div
                className="w-12 py-2 rounded-xl bg-slate-50 border border-slate-100 text-center flex flex-col items-center justify-center cursor-help"
              >
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse mb-1" />
                <span className="text-[11px] font-bold text-slate-700 leading-none">{activeMachines.length}</span>
                <span className="text-[8px] text-slate-400 font-semibold mt-0.5">WSID</span>
              </div>

              {/* Tooltip on hover */}
              <div className="absolute left-full top-1/2 -translate-y-1/2 ml-3.5 px-3 py-2 bg-slate-900 text-white text-xs font-medium rounded-lg shadow-xl whitespace-nowrap opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity z-50 space-y-0.5 text-left">
                <div className="font-bold text-emerald-400">Mesin Aktif: {activeMachines.length} WSID</div>
                <div className="text-[11px] text-slate-300">BCA: {bcaCount} &bull; Non BCA: {nonBcaCount}</div>
              </div>
            </div>
          )
        )}

        {/* Ganti Mode / Logout Button */}
        {onLogout && (
          <div className={`${isCollapsed ? 'px-2 pb-3 flex justify-center' : 'px-4 pb-4'}`}>
            {!isCollapsed ? (
              <button
                onClick={onLogout}
                className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-white hover:bg-rose-50 border border-slate-200 hover:border-rose-200 text-slate-600 hover:text-rose-600 text-xs font-semibold transition-all shadow-xs cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Ganti Mode / Logout</span>
              </button>
            ) : (
              <div className="relative group">
                <button
                  onClick={onLogout}
                  className="w-10 h-10 rounded-xl bg-white hover:bg-rose-50 border border-slate-200 hover:border-rose-200 text-slate-600 hover:text-rose-600 flex items-center justify-center transition-all shadow-xs cursor-pointer"
                  title="Ganti Mode / Logout"
                >
                  <LogOut className="w-4 h-4" />
                </button>
                <div className="absolute left-full top-1/2 -translate-y-1/2 ml-3.5 px-3 py-1.5 bg-slate-900 text-white text-xs font-semibold rounded-lg shadow-xl whitespace-nowrap opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity z-50">
                  Ganti Mode / Logout
                </div>
              </div>
            )}
          </div>
        )}
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col h-screen overflow-hidden min-w-0 transition-all duration-300">
        {/* Sticky Header with Sidebar Toggle & Filters */}
        <header className="sticky top-0 z-10 w-full px-6 pt-4 pb-2 flex items-center gap-3">
          {/* Header Sidebar Toggle Button */}
          <button
            type="button"
            onClick={toggleCollapse}
            className="p-2.5 rounded-2xl bg-white border border-slate-200/80 hover:border-teal-300 text-slate-600 hover:text-teal-700 shadow-xs transition-all cursor-pointer flex items-center justify-center shrink-0"
            title={isCollapsed ? "Perluas Sidebar" : "Minimize Sidebar"}
          >
            {isCollapsed ? (
              <PanelLeftOpen className="w-4 h-4 text-teal-600" />
            ) : (
              <PanelLeftClose className="w-4 h-4 text-slate-500" />
            )}
          </button>

          <div className="flex-1 min-w-0">
            <FilterBar />
          </div>
        </header>

        {/* Scrollable Page Content */}
        <div className="flex-1 overflow-y-auto px-6 pb-6 custom-scrollbar flex flex-col justify-between">
          <div className="flex-1">
            <Outlet />
          </div>

          {/* Footer */}
          <footer className="py-4 text-center text-xs text-slate-400 border-t border-slate-200/60 mt-8">
            &copy; {new Date().getFullYear()} Mons Digital Studio &bull; eMons ATM CRM
          </footer>
        </div>
      </main>
    </div>
  );
}
