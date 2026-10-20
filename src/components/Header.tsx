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
  DollarSign,
  Cloud,
  CloudCheck,
  LogOut,
  User as UserIcon,
  RefreshCw
} from 'lucide-react';
import { AppSettings } from '../types';
import { User } from '../lib/firebase';

interface HeaderProps {
  activeTab: 'dashboard' | 'spreadsheet' | 'hierarchy';
  setActiveTab: (tab: 'dashboard' | 'spreadsheet' | 'hierarchy') => void;
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
}) => {
  return (
    <header className="bg-slate-900 border-b border-slate-800 text-slate-100 sticky top-0 z-30 shadow-md">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
        <div className="flex flex-col lg:flex-row items-center justify-between py-2 lg:py-3 gap-2 sm:gap-3 header-compact">
          
          {/* Logo and Title */}
          <div className="flex items-center space-x-2.5 sm:space-x-3 w-full lg:w-auto justify-between lg:justify-start">
            <div className="flex items-center space-x-2 sm:space-x-2.5">
              <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-gradient-to-tr from-emerald-500 to-teal-400 flex items-center justify-center text-slate-950 font-bold shadow-lg shadow-emerald-500/20 shrink-0">
                <ShieldCheck className="w-5 h-5 sm:w-5.5 sm:h-5.5 stroke-[2.5]" />
              </div>
              <div>
                <h1 className="text-base sm:text-lg font-bold text-slate-50 tracking-tight leading-none header-title">
                  ValuaQ
                </h1>
                <p className="text-[10px] sm:text-xs text-slate-400 mt-0.5 flex flex-wrap items-center gap-1 font-medium header-subtitle">
                  <span>3-Level Portfolio & Risk Engine</span>
                  <span className="hidden xs:inline-block w-1 h-1 rounded-full bg-slate-600"></span>
                  {user ? (
                    <span className="text-emerald-400 flex items-center gap-1">
                      <CloudCheck className="w-3 h-3" />
                      Google Cloud Synced
                    </span>
                  ) : (
                    <span className="text-slate-400">Offline & Encrypted</span>
                  )}
                </p>
              </div>
            </div>

            {/* Mobile Actions */}
            <div className="flex items-center gap-1 lg:hidden">
              <button
                onClick={() => onUpdateSettings({ stealthMode: !settings.stealthMode })}
                className="p-1.5 sm:p-2 text-slate-300 hover:text-white rounded-lg bg-slate-800 border border-slate-700"
                title={settings.stealthMode ? "Show financial numbers" : "Hide financial numbers"}
              >
                {settings.stealthMode ? <EyeOff className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-amber-400" /> : <Eye className="w-3.5 h-3.5 sm:w-4 sm:h-4" />}
              </button>
            </div>
          </div>

          {/* Quick Controls & Google Sync */}
          <div className="flex flex-wrap items-center space-x-1.5 sm:space-x-2 w-full lg:w-auto justify-end text-[11px] sm:text-xs">
            
            {/* Google Sync / Auth Button */}
            {user ? (
              <div className="flex items-center gap-1.5 sm:gap-2 bg-slate-800/90 border border-emerald-500/30 rounded-xl px-2 py-1 sm:px-2.5 sm:py-1 text-[11px] sm:text-xs">
                {user.photoURL ? (
                  <img src={user.photoURL} alt={user.displayName || 'User'} className="w-5 h-5 sm:w-6 sm:h-6 rounded-full border border-emerald-400" />
                ) : (
                  <div className="w-5 h-5 sm:w-6 sm:h-6 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold">
                    <UserIcon className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                  </div>
                )}
                <div className="flex flex-col text-left">
                  <span className="text-[10px] sm:text-[11px] font-semibold text-slate-200 truncate max-w-[90px] sm:max-w-[120px] leading-tight">
                    {user.displayName || user.email?.split('@')[0]}
                  </span>
                  <span className="text-[8px] sm:text-[9px] text-emerald-400 flex items-center gap-0.5">
                    <Cloud className="w-2 h-2 sm:w-2.5 sm:h-2.5" /> {isSyncing ? 'Syncing...' : 'Synced'}
                  </span>
                </div>
                {onManualSync && (
                  <button
                    onClick={onManualSync}
                    disabled={isSyncing}
                    className="p-1 text-slate-400 hover:text-emerald-400 rounded-md hover:bg-slate-700/50 transition-all cursor-pointer ml-0.5 disabled:opacity-50"
                    title="Sync Now: Merge cloud and device data safely (Union Guard)"
                  >
                    <RefreshCw className={`w-3 h-3 sm:w-3.5 sm:h-3.5 ${isSyncing ? 'animate-spin text-emerald-400' : ''}`} />
                  </button>
                )}
                <button
                  onClick={onSignOut}
                  className="p-1 text-slate-400 hover:text-rose-400 rounded-md hover:bg-slate-700/50 transition-all cursor-pointer ml-0.5"
                  title="Sign Out of Google Account"
                >
                  <LogOut className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                </button>
              </div>
            ) : (
              <button
                onClick={onSignIn}
                className="flex items-center gap-1 sm:gap-1.5 px-2.5 py-1 sm:px-3 sm:py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold shadow-md shadow-emerald-500/20 transition-all cursor-pointer text-[11px] sm:text-xs"
                title="Sign in with Google to sync data across devices"
              >
                <Cloud className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                <span>Sync with Google</span>
              </button>
            )}

            {/* Currency Indicator */}
            <div className="hidden sm:flex items-center bg-slate-800/80 border border-slate-700/80 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-emerald-400 gap-1.5">
              <DollarSign className="w-3.5 h-3.5 text-slate-400" />
              <span className="text-slate-300 font-medium">Currency:</span>
              <span className="font-mono text-emerald-400 font-bold">NTD (NT$)</span>
            </div>

            {/* Stealth Mode Button */}
            <button
              onClick={() => onUpdateSettings({ stealthMode: !settings.stealthMode })}
              className={`hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg border font-medium transition-all ${
                settings.stealthMode
                  ? 'bg-amber-500/10 text-amber-300 border-amber-500/30 hover:bg-amber-500/20'
                  : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700 hover:text-white'
              }`}
            >
              {settings.stealthMode ? (
                <>
                  <EyeOff className="w-3.5 h-3.5 text-amber-400" />
                  <span>Stealth Mode ON</span>
                </>
              ) : (
                <>
                  <Eye className="w-3.5 h-3.5 text-slate-400" />
                  <span>Hide Amounts</span>
                </>
              )}
            </button>

            {/* Data Management Modal Trigger */}
            <button
              onClick={onOpenDataModal}
              className="flex items-center gap-1 sm:gap-1.5 px-2 py-1 sm:px-3 sm:py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-300 hover:text-white hover:bg-slate-700 transition-all font-medium text-[11px] sm:text-xs"
            >
              <Download className="w-3.5 h-3.5" />
              <span className="hidden md:inline">Backup / Restore</span>
            </button>

            {/* Factory Reset */}
            <button
              onClick={() => {
                if (window.confirm('Are you sure you want to perform a factory reset? All data will be cleared.')) {
                  onResetDemo();
                }
              }}
              className="p-1 sm:p-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-400 hover:text-rose-400 hover:bg-slate-800 transition-all cursor-pointer"
              title="Factory reset / Clear all data"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center space-x-1 border-t border-slate-800/80 pt-1.5 pb-1 overflow-x-auto no-scrollbar">
          <button
            onClick={() => setActiveTab('dashboard')}
            className={`flex items-center gap-1.5 sm:gap-2 px-3 py-1.5 sm:px-4 sm:py-2 rounded-lg font-medium text-xs sm:text-sm transition-all whitespace-nowrap ${
              activeTab === 'dashboard'
                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 font-semibold'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
            }`}
          >
            <PieChart className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            <span>Dashboards</span>
          </button>

          <button
            onClick={() => setActiveTab('spreadsheet')}
            className={`flex items-center gap-1.5 sm:gap-2 px-3 py-1.5 sm:px-4 sm:py-2 rounded-lg font-medium text-xs sm:text-sm transition-all whitespace-nowrap ${
              activeTab === 'spreadsheet'
                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 font-semibold'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
            }`}
          >
            <Table className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            <span>Monthly Spreadsheet</span>
          </button>

          <button
            onClick={() => setActiveTab('hierarchy')}
            className={`flex items-center gap-1.5 sm:gap-2 px-3 py-1.5 sm:px-4 sm:py-2 rounded-lg font-medium text-xs sm:text-sm transition-all whitespace-nowrap ${
              activeTab === 'hierarchy'
                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 font-semibold'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
            }`}
          >
            <Layers className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            <span>Assets & Risk Hierarchy</span>
          </button>
        </div>
      </div>
    </header>
  );
};
