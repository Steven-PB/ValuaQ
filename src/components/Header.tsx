import React from 'react';
import { 
  Eye, 
  EyeOff, 
  PieChart, 
  Table, 
  Layers, 
  Download, 
  RotateCcw, 
  ShieldCheck, 
  Cloud,
  LogOut,
  User as UserIcon,
  RefreshCw,
  Scale,
  Coins,
  Activity,
  AlertTriangle,
  CheckCircle2,
  Globe
} from 'lucide-react';
import { AppSettings } from '../types';
import { User } from '../lib/firebase';
import { SyncHealthReport } from '../lib/syncMerge';
import { SUPPORTED_BASE_CURRENCIES, normalizeCurrencyCode, getCurrencySymbolForCode } from '../lib/formatters';

interface HeaderProps {
  activeTab: 'dashboard' | 'ledger' | 'spreadsheet' | 'hierarchy' | 'rebalance';
  setActiveTab: (tab: 'dashboard' | 'ledger' | 'spreadsheet' | 'hierarchy' | 'rebalance') => void;
  settings: AppSettings;
  onUpdateSettings: (newSettings: Partial<AppSettings>) => void;
  onOpenDataModal: () => void;
  onResetDemo: () => void;
  totalPortfolioValue: number;
  floatingPL: number;
  floatingPLPercent: number;
  user: User | null;
  onSignIn: () => void;
  onSignOut: () => void;
  isSyncing?: boolean;
  onManualSync?: () => void;
  syncHealth?: SyncHealthReport;
  onOpenSyncHealth?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  setActiveTab,
  settings,
  onUpdateSettings,
  onOpenDataModal,
  onResetDemo,
  user,
  onSignIn,
  onSignOut,
  isSyncing,
  onManualSync,
  syncHealth,
  onOpenSyncHealth,
}) => {
  const navItems: {
    id: 'dashboard' | 'ledger' | 'spreadsheet' | 'hierarchy' | 'rebalance';
    label: string;
    icon: React.ReactNode;
  }[] = [
    { id: 'dashboard', label: 'Dashboards', icon: <PieChart className="w-3.5 h-3.5" /> },
    { id: 'ledger', label: 'Transaction Ledger', icon: <Coins className="w-3.5 h-3.5" /> },
    { id: 'spreadsheet', label: 'Monthly Spreadsheet', icon: <Table className="w-3.5 h-3.5" /> },
    { id: 'hierarchy', label: 'Assets & Risk', icon: <Layers className="w-3.5 h-3.5" /> },
    { id: 'rebalance', label: 'Rebalance', icon: <Scale className="w-3.5 h-3.5" /> },
  ];

  const isDrift = syncHealth?.status === 'drift_detected';
  const activeBaseCurrency = normalizeCurrencyCode(settings.baseCurrency || settings.currencySymbol || 'NTD');

  return (
    <header className="bg-[#080C14]/95 backdrop-blur-md border-b border-slate-800/80 text-slate-100 sticky top-0 z-30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between gap-4 h-14 sm:h-16">
          
          {/* Zone 1: Brand Wordmark */}
          <div className="flex items-center gap-2.5 shrink-0">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
              <ShieldCheck className="w-4 h-4 stroke-[2.2]" />
            </div>
            <span className="text-base sm:text-lg font-bold text-slate-50 tracking-tight whitespace-nowrap">
              ValuaQ
            </span>
          </div>

          {/* Zone 2: Desktop Single-Line Navigation */}
          <nav className="hidden lg:flex items-center gap-1">
            {navItems.map((item) => {
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  className={`relative flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold transition-all whitespace-nowrap shrink-0 cursor-pointer ${
                    isActive
                      ? 'text-emerald-400 bg-emerald-500/10'
                      : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/40'
                  }`}
                >
                  {item.icon}
                  <span>{item.label}</span>
                  {isActive && (
                    <span className="absolute bottom-0 left-3 right-3 h-0.5 bg-emerald-400 rounded-full" />
                  )}
                </button>
              );
            })}
          </nav>

          {/* Zone 3: Workspace Utilities & Cloud Sync */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {/* Multi-Currency Base Selector */}
            <label
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#0D131F] border border-slate-800 hover:border-emerald-500/40 text-xs font-medium transition-all shrink-0 cursor-pointer"
              title="Switch Portfolio Multi-Currency Base (converts all totals, KPIs, charts & spreadsheets)"
            >
              <Globe className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span className="hidden xl:inline text-[11px] font-mono text-slate-400">Base:</span>
              <select
                value={activeBaseCurrency}
                onChange={(e) => {
                  const nextBase = normalizeCurrencyCode(e.target.value);
                  onUpdateSettings({
                    baseCurrency: nextBase,
                    currencySymbol: getCurrencySymbolForCode(nextBase),
                  });
                }}
                className="bg-transparent text-emerald-300 font-mono font-bold text-xs focus:outline-none cursor-pointer pr-0.5"
              >
                {SUPPORTED_BASE_CURRENCIES.map((c) => (
                  <option key={c.code} value={c.code} className="bg-slate-900 text-slate-100">
                    {c.label}
                  </option>
                ))}
              </select>
            </label>

            {/* Stealth Mode Toggle */}
            <button
              onClick={() => onUpdateSettings({ stealthMode: !settings.stealthMode })}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-all whitespace-nowrap shrink-0 cursor-pointer ${
                settings.stealthMode
                  ? 'bg-amber-500/10 text-amber-300 border-amber-500/30 hover:bg-amber-500/20'
                  : 'bg-[#0D131F] text-slate-300 border-slate-800 hover:border-slate-700 hover:text-white'
              }`}
              title={settings.stealthMode ? 'Show financial numbers' : 'Hide financial numbers'}
            >
              {settings.stealthMode ? (
                <>
                  <EyeOff className="w-3.5 h-3.5 text-amber-400" />
                  <span className="hidden sm:inline">Stealth ON</span>
                </>
              ) : (
                <>
                  <Eye className="w-3.5 h-3.5 text-slate-400" />
                  <span className="hidden sm:inline">Hide</span>
                </>
              )}
            </button>

            {/* Backup & Restore Modal Trigger */}
            <button
              onClick={onOpenDataModal}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#0D131F] border border-slate-800 text-slate-300 hover:text-white hover:border-slate-700 transition-all font-medium text-xs whitespace-nowrap shrink-0 cursor-pointer"
              title="Backup & Restore Portfolio Data (.json)"
            >
              <Download className="w-3.5 h-3.5 text-emerald-400" />
              <span className="hidden md:inline">Backup &amp; Restore</span>
            </button>

            {/* Factory Reset */}
            <button
              onClick={() => {
                if (window.confirm('Are you sure you want to perform a factory reset? All data will be cleared.')) {
                  onResetDemo();
                }
              }}
              className="p-1.5 rounded-lg bg-[#0D131F] border border-slate-800 text-slate-400 hover:text-rose-400 hover:border-slate-700 transition-all cursor-pointer shrink-0"
              title="Factory reset / Clear all data"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>

            {/* Google Sync / Auth Control & Sync Health Monitor */}
            {user ? (
              <div className="flex items-center gap-1.5 bg-[#0D131F] border border-slate-800 rounded-lg pl-2 pr-1.5 py-1 text-xs shrink-0">
                <div className="relative shrink-0">
                  {user.photoURL ? (
                    <img
                      src={user.photoURL}
                      alt={user.displayName || 'User'}
                      referrerPolicy="no-referrer"
                      className="w-5 h-5 rounded-full border border-emerald-500/40"
                    />
                  ) : (
                    <div className="w-5 h-5 rounded-full bg-emerald-500/15 text-emerald-400 flex items-center justify-center font-bold">
                      <UserIcon className="w-3 h-3" />
                    </div>
                  )}
                  <span
                    className={`absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full border border-[#0D131F] ${
                      isSyncing
                        ? 'bg-amber-400 animate-pulse'
                        : isDrift
                        ? 'bg-amber-400'
                        : 'bg-emerald-400'
                    }`}
                    title={
                      isSyncing
                        ? 'Syncing with Google Cloud...'
                        : isDrift
                        ? `Sync Drift Detected (${syncHealth?.totalDriftCount} item(s))`
                        : 'Google Cloud Sync Healthy'
                    }
                  />
                </div>
                <span className="text-[11px] font-medium text-slate-200 truncate max-w-[80px] hidden sm:inline">
                  {user.displayName || user.email?.split('@')[0]}
                </span>

                {/* Sync Health Monitor Trigger */}
                {onOpenSyncHealth && (
                  <button
                    onClick={onOpenSyncHealth}
                    className={`flex items-center gap-1 px-1.5 py-0.5 text-[11px] font-medium rounded border transition-colors cursor-pointer ${
                      isDrift
                        ? 'text-amber-300 bg-amber-500/15 hover:bg-amber-500/25 border-amber-500/40'
                        : 'text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 border-emerald-500/25'
                    }`}
                    title={
                      isDrift
                        ? `Sync Health: Drift Detected (${syncHealth?.totalDriftCount} difference(s)) — Click to Reconcile`
                        : `Sync Health: Verified In Sync (#${syncHealth?.localChecksum || ''})`
                    }
                  >
                    {isDrift ? (
                      <AlertTriangle className="w-3 h-3 text-amber-400" />
                    ) : (
                      <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                    )}
                    <span className="hidden xl:inline">
                      {isDrift ? `Drift (${syncHealth?.totalDriftCount})` : 'Healthy'}
                    </span>
                  </button>
                )}

                {onManualSync && (
                  <button
                    onClick={onManualSync}
                    disabled={isSyncing}
                    className="flex items-center gap-1 px-1.5 py-0.5 text-[11px] font-medium text-slate-300 hover:text-white rounded bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700/70 transition-colors cursor-pointer disabled:opacity-50"
                    title="Sync Now with Google Cloud"
                  >
                    <RefreshCw className={`w-3 h-3 ${isSyncing ? 'animate-spin text-emerald-400' : ''}`} />
                    <span className="hidden 2xl:inline">{isSyncing ? 'Syncing' : 'Sync'}</span>
                  </button>
                )}
                <button
                  onClick={onSignOut}
                  className="p-1 text-slate-400 hover:text-rose-400 rounded hover:bg-slate-800 transition-colors cursor-pointer"
                  title="Sign Out"
                >
                  <LogOut className="w-3 h-3" />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-1.5">
                {onOpenSyncHealth && (
                  <button
                    onClick={onOpenSyncHealth}
                    className="p-1.5 rounded-lg bg-[#0D131F] border border-slate-800 text-slate-400 hover:text-emerald-400 hover:border-slate-700 transition-all cursor-pointer shrink-0"
                    title="View Ledger Sync Health Monitor"
                  >
                    <Activity className="w-3.5 h-3.5" />
                  </button>
                )}
                <button
                  onClick={onSignIn}
                  disabled={isSyncing}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold transition-all cursor-pointer text-xs whitespace-nowrap shrink-0 disabled:opacity-60"
                  title="Sign in with Google to sync data across devices"
                >
                  <Cloud className="w-3.5 h-3.5" />
                  <span>{isSyncing ? 'Connecting...' : 'Sync Cloud'}</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Mobile / Tablet Compact Navigation Strip (< 1024px) */}
        <div className="flex lg:hidden items-center gap-1 border-t border-slate-800/70 py-1.5 overflow-x-auto no-scrollbar">
          {navItems.map((item) => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold text-xs transition-all whitespace-nowrap shrink-0 cursor-pointer ${
                  isActive
                    ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
                }`}
              >
                {item.icon}
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </header>
  );
};
