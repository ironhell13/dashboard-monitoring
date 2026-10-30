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
    <div className="min-h-screen bg-[#F5F7FB] flex font-sans text-slate-800 antialiased selection:bg-blue-100 selection:text-blue-900">
      {/* Sidebar Navigation - Fixed & Sticky Enterprise Left Sidebar */}
      <aside
        className={`${
          isCollapsed ? 'w-14' : 'w-56'
        } bg-white border-r border-[#E5EAF2] flex flex-col flex-shrink-0 z-20 h-screen sticky top-0 transition-all duration-200 ease-in-out`}
      >
        {/* Brand Header */}
        {!isCollapsed ? (
          <div className="px-3 py-2.5 border-b border-[#E5EAF2]">
            <div className="flex items-center justify-between gap-1.5">
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-7 h-7 rounded-md bg-blue-600 text-white flex items-center justify-center shrink-0 shadow-2xs">
                  <Zap className="w-3.5 h-3.5 fill-current" />
                </div>
                <div className="truncate">
                  <div className="flex items-center gap-1">
                    <span className="text-slate-900 font-bold text-xs tracking-tight truncate">
                      eMons ATM CRM
                    </span>
                    <span className="text-[8px] bg-blue-50 text-blue-700 font-semibold px-1 py-0.2 rounded border border-blue-200/60 shrink-0">
                      PROD
                    </span>
                  </div>
                  <p className="text-slate-400 text-[9px] leading-tight truncate">
                    Efficient Monitoring System
                  </p>
                </div>
              </div>

              {/* Minimize Sidebar Button */}
              <button
                type="button"
                onClick={toggleCollapse}
                className="w-6 h-6 rounded bg-slate-50 hover:bg-slate-100 border border-slate-200/80 text-slate-500 hover:text-slate-800 flex items-center justify-center transition-colors cursor-pointer shrink-0"
                title="Minimize Sidebar"
              >
                <PanelLeftClose className="w-3 h-3" />
              </button>
            </div>

            <div className="flex items-center justify-between mt-2 pt-1.5 border-t border-[#E5EAF2]">
              <span className="text-[10px] font-medium text-slate-500">Portal Akses</span>
              <span
                className={`inline-flex items-center px-1.5 py-0.2 rounded text-[9px] font-semibold uppercase tracking-wider ${
                  effectiveRole === 'KAWIL'
                    ? 'bg-blue-50 text-blue-700 border border-blue-200/80'
                    : effectiveRole === 'KAOPS'
                    ? 'bg-slate-100 text-slate-700 border border-slate-200'
                    : 'bg-slate-100 text-slate-600 border border-slate-200'
                }`}
              >
                {effectiveRole === 'KAWIL' ? 'Ka Wil' : effectiveRole === 'KAOPS' ? 'Ka Ops' : 'Monitoring'}
              </span>
            </div>
          </div>
        ) : (
          <div className="p-2 border-b border-[#E5EAF2] flex flex-col items-center gap-2">
            <div
              className="w-7 h-7 rounded-md bg-blue-600 text-white flex items-center justify-center shrink-0 shadow-2xs"
              title="eMons ATM CRM - Efficient Monitoring System"
            >
              <Zap className="w-3.5 h-3.5 fill-current" />
            </div>

            <button
              type="button"
              onClick={toggleCollapse}
              className="w-6 h-6 rounded bg-slate-50 hover:bg-slate-100 border border-slate-200/80 text-slate-500 hover:text-slate-800 flex items-center justify-center transition-colors cursor-pointer"
              title="Perluas Sidebar"
            >
              <PanelLeftOpen className="w-3 h-3" />
            </button>

            <span
              className={`inline-flex items-center px-1 py-0.2 rounded text-[8px] font-bold uppercase tracking-tight ${
                effectiveRole === 'KAWIL'
                  ? 'bg-blue-50 text-blue-700 border border-blue-200/80'
                  : 'bg-slate-100 text-slate-700 border border-slate-200'
              }`}
              title={`Portal Operasional: ${effectiveRole === 'KAWIL' ? 'Ka Wil' : 'Ka Ops'}`}
            >
              {effectiveRole === 'KAWIL' ? 'KW' : effectiveRole === 'KAOPS' ? 'KO' : 'MON'}
            </span>
          </div>
        )}

        {/* Structured Menu List */}
        <nav className="flex-1 px-2 py-2 space-y-3 overflow-y-auto">
          {menuSections.map((section, idx) => (
            <div key={section.title} className="space-y-0.5">
              {!isCollapsed ? (
                <p className="px-2 text-[9px] font-semibold tracking-wider uppercase text-slate-400 mb-1">
                  {section.title}
                </p>
              ) : idx > 0 ? (
                <div className="w-5 h-px bg-slate-200 mx-auto my-1.5" />
              ) : null}

              <div className="space-y-0.5">
                {section.items.map((item) => {
                  const isActive = location.pathname === item.path;
                  const Icon = item.icon;
                  return (
                    <div key={item.path} className="relative group">
                      <NavLink
                        to={item.path}
                        className={`group flex items-center ${
                          isCollapsed ? 'justify-center p-1.5' : 'gap-2 px-2 py-1.5'
                        } rounded-md text-xs transition-colors ${
                          isActive
                            ? 'bg-blue-50 text-blue-700 font-semibold border border-blue-200/60'
                            : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50 font-medium'
                        }`}
                      >
                        <Icon
                          className={`w-3.5 h-3.5 shrink-0 transition-colors ${
                            isActive ? 'text-blue-600' : 'text-slate-400 group-hover:text-slate-600'
                          }`}
                        />
                        {!isCollapsed && <span className="truncate">{item.name}</span>}
                      </NavLink>

                      {/* Tooltip on hover when collapsed */}
                      {isCollapsed && (
                        <div className="absolute left-full top-1/2 -translate-y-1/2 ml-2 px-2 py-1 bg-slate-900 text-white text-[11px] font-medium rounded shadow-lg whitespace-nowrap opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity z-50">
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
            <div className="p-2 m-2 mb-1.5 rounded-md bg-slate-50 border border-[#E5EAF2] text-[11px] text-slate-600">
              <div className="flex justify-between items-center mb-1">
                <span className="font-medium text-slate-600 flex items-center gap-1.5 text-[10px]">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  <span>Mesin Aktif:</span>
                </span>
                <span className="font-bold text-slate-900 text-[10px]">{activeMachines.length} WSID</span>
              </div>
              <div className="flex justify-between items-center text-[9px] pt-1 border-t border-slate-200/70">
                <span className="text-slate-600 font-medium">
                  BCA: <strong className="text-blue-700 font-semibold">{bcaCount}</strong>
                </span>
                <span className="text-slate-400">&bull;</span>
                <span className="text-slate-600 font-medium">
                  Non BCA: <strong className="text-slate-800 font-semibold">{nonBcaCount}</strong>
                </span>
              </div>
            </div>
          ) : (
            <div className="px-1 my-1.5 relative group flex justify-center">
              <div className="w-9 py-1 rounded bg-slate-50 border border-[#E5EAF2] text-center flex flex-col items-center justify-center cursor-help">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mb-0.5" />
                <span className="text-[9px] font-bold text-slate-800 leading-none">{activeMachines.length}</span>
                <span className="text-[6px] text-slate-400 uppercase font-semibold">WSID</span>
              </div>

              {/* Tooltip on hover */}
              <div className="absolute left-full top-1/2 -translate-y-1/2 ml-2 px-2 py-1 bg-slate-900 text-white text-[11px] font-medium rounded shadow-lg whitespace-nowrap opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity z-50 space-y-0.5 text-left">
                <div className="font-semibold text-emerald-400">Mesin Aktif: {activeMachines.length} WSID</div>
                <div className="text-[10px] text-slate-300">BCA: {bcaCount} &bull; Non BCA: {nonBcaCount}</div>
              </div>
            </div>
          )
        )}

        {/* Ganti Mode / Logout Button */}
        {onLogout && (
          <div className={`${isCollapsed ? 'px-1.5 pb-2 flex justify-center' : 'px-2 pb-2'}`}>
            {!isCollapsed ? (
              <button
                onClick={onLogout}
                className="w-full flex items-center justify-center gap-1.5 px-2 py-1 rounded-md bg-white hover:bg-slate-50 border border-[#E5EAF2] text-slate-600 hover:text-rose-600 text-[11px] font-medium transition-colors cursor-pointer"
              >
                <LogOut className="w-3 h-3" />
                <span>Ganti Mode / Logout</span>
              </button>
            ) : (
              <div className="relative group">
                <button
                  onClick={onLogout}
                  className="w-7 h-7 rounded-md bg-white hover:bg-slate-50 border border-[#E5EAF2] text-slate-600 hover:text-rose-600 flex items-center justify-center transition-colors cursor-pointer"
                  title="Ganti Mode / Logout"
                >
                  <LogOut className="w-3 h-3" />
                </button>
                <div className="absolute left-full top-1/2 -translate-y-1/2 ml-2 px-2 py-1 bg-slate-900 text-white text-[11px] font-medium rounded shadow-lg whitespace-nowrap opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity z-50">
                  Ganti Mode / Logout
                </div>
              </div>
            )}
          </div>
        )}
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col h-screen overflow-hidden min-w-0 bg-[#F5F7FB]">
        {/* Sticky Top Header with Horizontal Filters */}
        <header className="sticky top-0 z-10 w-full bg-white border-b border-[#E5EAF2] px-4 py-1.5 flex items-center gap-2">
          {/* Header Sidebar Toggle Button */}
          <button
            type="button"
            onClick={toggleCollapse}
            className="p-1 rounded bg-white border border-[#E5EAF2] hover:bg-slate-50 text-slate-600 hover:text-slate-900 transition-colors cursor-pointer flex items-center justify-center shrink-0"
            title={isCollapsed ? "Perluas Sidebar" : "Minimize Sidebar"}
          >
            {isCollapsed ? (
              <PanelLeftOpen className="w-3.5 h-3.5 text-blue-600" />
            ) : (
              <PanelLeftClose className="w-3.5 h-3.5 text-slate-500" />
            )}
          </button>

          <div className="flex-1 min-w-0">
            <FilterBar />
          </div>
        </header>

        {/* Scrollable Page Content */}
        <div className="flex-1 overflow-y-auto px-4 py-3.5 sm:px-5 sm:py-3.5 custom-scrollbar flex flex-col justify-between">
          <div className="flex-1">
            <Outlet />
          </div>

          {/* Footer */}
          <footer className="py-2.5 text-center text-[10px] text-slate-400 border-t border-[#E5EAF2] mt-4">
            &copy; {new Date().getFullYear()} Mons Digital Studio &bull; eMons ATM CRM
          </footer>
        </div>
      </main>
    </div>
  );
}
