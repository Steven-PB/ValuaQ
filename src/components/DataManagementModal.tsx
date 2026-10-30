import React, { useState, useEffect, useMemo } from 'react';
import { 
  X, 
  Download, 
  Upload, 
  RotateCcw, 
  Check, 
  AlertCircle, 
  Database, 
  ShieldCheck, 
  FileCode,
  Copy,
  Layers,
  Coins,
  Calendar
} from 'lucide-react';
import { Category, Asset, MonthlyRecord, AppSettings, LedgerTransaction, MonthlyPriceMap } from '../types';
import { 
  exportAllData, 
  importAllData, 
  parseAndValidateBackupJson,
  createLocalSnapshot
} from '../lib/storage';

interface DataManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
  categories: Category[];
  assets: Asset[];
  records: MonthlyRecord[];
  transactions?: LedgerTransaction[];
  monthlyPrices?: MonthlyPriceMap;
  settings: AppSettings;
  onRefreshData: () => void;
  onResetDemo: () => void;
}

export const DataManagementModal: React.FC<DataManagementModalProps> = ({
  isOpen,
  onClose,
  categories,
  assets,
  records,
  transactions = [],
  monthlyPrices = {},
  onRefreshData,
  onResetDemo,
}) => {
  const [importJson, setImportJson] = useState('');
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirmingFactoryReset, setConfirmingFactoryReset] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  useEffect(() => {
    if (isOpen) {
      setMessage(null);
      setImportJson('');
      setUploadedFileName(null);
      setCopied(false);
      setConfirmingFactoryReset(false);
    }
  }, [isOpen]);

  // Live validation of the JSON string entered or uploaded
  const backupPreview = useMemo(() => {
    if (!importJson.trim()) return null;
    return parseAndValidateBackupJson(importJson);
  }, [importJson]);

  if (!isOpen) return null;

  // Export entire ledger & configuration as JSON file
  const handleDownloadBackup = () => {
    try {
      const dataStr = exportAllData();
      const blob = new Blob([dataStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `valuaq_backup_${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      setMessage({
        type: 'success',
        text: 'Backup JSON file exported with your entire ledger and configuration.',
      });
    } catch (e: any) {
      setMessage({
        type: 'error',
        text: `Failed to export backup JSON: ${e?.message || e}`,
      });
    }
  };

  // Copy JSON string to clipboard
  const handleCopyBackupJson = async () => {
    try {
      const dataStr = exportAllData();
      await navigator.clipboard.writeText(dataStr);
      setCopied(true);
      setMessage({
        type: 'info',
        text: 'Complete backup JSON copied to clipboard.',
      });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setMessage({
        type: 'error',
        text: 'Unable to copy to clipboard. Please use the Export JSON button.',
      });
    }
  };

  // Load JSON file from disk
  const handleJsonFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = (event.target?.result as string) || '';
      setImportJson(content);
      setUploadedFileName(file.name);
      const check = parseAndValidateBackupJson(content);
      if (check.valid && check.data) {
        setMessage({
          type: 'info',
          text: `Loaded "${file.name}". Ready to restore ${check.data.transactions?.length || 0} ledger transactions, ${check.data.assets.length} assets, and ${check.data.categories.length} categories.`,
        });
      } else {
        setMessage({
          type: 'error',
          text: check.error || 'Selected file is not a valid ValuaQ JSON backup.',
        });
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  // Restore entire app state from JSON
  const handleRestoreJson = () => {
    if (!importJson.trim()) {
      setMessage({ type: 'error', text: 'Please select a JSON backup file or paste your backup JSON below.' });
      return;
    }

    const validation = parseAndValidateBackupJson(importJson);
    if (!validation.valid || !validation.data) {
      setMessage({
        type: 'error',
        text: validation.error || 'Invalid JSON format or corrupted backup file.',
      });
      return;
    }

    createLocalSnapshot('Auto-backup before JSON restore');
    const success = importAllData(importJson);
    if (success) {
      onRefreshData();
      setMessage({
        type: 'success',
        text: `Restored ${validation.data.transactions?.length || 0} transactions, ${validation.data.assets.length} assets, and ${validation.data.categories.length} categories.`,
      });
      setTimeout(() => onClose(), 1000);
    } else {
      setMessage({ type: 'error', text: 'Failed to restore app state from backup JSON.' });
    }
  };

  const priceSnapshotMonthCount = Object.keys(monthlyPrices || {}).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="fintech-card rounded-xl shadow-2xl max-w-xl w-full p-5 sm:p-6 space-y-5 text-xs max-h-[92vh] flex flex-col">
        
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-slate-800/80 pb-3.5 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 flex items-center justify-center shrink-0">
              <Database className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-base text-slate-100">
                Backup &amp; Restore
              </h3>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Export your entire ledger and configuration as a JSON file, or import it to restore app state
              </p>
            </div>
          </div>
          <button 
            onClick={onClose} 
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Status Message Notification */}
        {message && (
          <div
            className={`p-3 rounded-lg border flex items-start gap-2.5 shrink-0 ${
              message.type === 'success'
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                : message.type === 'error'
                ? 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                : 'bg-blue-500/10 border-blue-500/30 text-blue-300'
            }`}
          >
            {message.type === 'success' ? (
              <Check className="w-4 h-4 shrink-0 mt-0.5 text-emerald-400" />
            ) : message.type === 'error' ? (
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />
            ) : (
              <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5 text-blue-400" />
            )}
            <span className="text-xs leading-relaxed">{message.text}</span>
          </div>
        )}

        {/* Scrollable Content */}
        <div className="overflow-y-auto space-y-4 pr-1 flex-1">
          
          {/* Section 1: Export Backup (.json) */}
          <div className="p-4 bg-[#080C14] rounded-xl border border-slate-800/90 space-y-3.5">
            <div className="flex items-center justify-between">
              <h4 className="font-bold text-slate-200 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                <Download className="w-3.5 h-3.5 text-emerald-400" />
                <span>1. Export Ledger &amp; Configuration (.json)</span>
              </h4>
              <span className="text-[10px] font-mono text-emerald-400">
                Full State Snapshot
              </span>
            </div>

            <p className="text-slate-400 text-xs leading-relaxed">
              Exports a complete JSON backup containing all ledger transactions, asset &amp; risk hierarchy, target allocations, 1st-of-month price snapshots, and preferences.
            </p>

            {/* Current State Summary Strip */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-0.5">
              <div className="p-2.5 rounded-lg bg-[#0D131F] border border-slate-800/80">
                <div className="text-[10px] text-slate-400 flex items-center gap-1">
                  <Coins className="w-3 h-3 text-emerald-400" />
                  <span>Transactions</span>
                </div>
                <div className="text-sm font-bold font-mono tabular-nums text-slate-100 mt-0.5">
                  {transactions.length}
                </div>
              </div>
              <div className="p-2.5 rounded-lg bg-[#0D131F] border border-slate-800/80">
                <div className="text-[10px] text-slate-400 flex items-center gap-1">
                  <Layers className="w-3 h-3 text-blue-400" />
                  <span>Assets</span>
                </div>
                <div className="text-sm font-bold font-mono tabular-nums text-slate-100 mt-0.5">
                  {assets.length}
                </div>
              </div>
              <div className="p-2.5 rounded-lg bg-[#0D131F] border border-slate-800/80">
                <div className="text-[10px] text-slate-400 flex items-center gap-1">
                  <ShieldCheck className="w-3 h-3 text-amber-400" />
                  <span>Categories</span>
                </div>
                <div className="text-sm font-bold font-mono tabular-nums text-slate-100 mt-0.5">
                  {categories.length}
                </div>
              </div>
              <div className="p-2.5 rounded-lg bg-[#0D131F] border border-slate-800/80">
                <div className="text-[10px] text-slate-400 flex items-center gap-1">
                  <Calendar className="w-3 h-3 text-violet-400" />
                  <span>Months</span>
                </div>
                <div className="text-sm font-bold font-mono tabular-nums text-slate-100 mt-0.5">
                  {Math.max(records.length, priceSnapshotMonthCount)}
                </div>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 pt-1">
              <button
                onClick={handleDownloadBackup}
                className="flex-1 py-2.5 px-4 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                <Download className="w-4 h-4" />
                <span>Export Backup (.json)</span>
              </button>
              <button
                onClick={handleCopyBackupJson}
                className="py-2.5 px-3.5 rounded-lg bg-[#0D131F] hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-800 font-semibold transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                title="Copy raw JSON backup to clipboard"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-slate-400" />}
                <span>{copied ? 'Copied' : 'Copy JSON'}</span>
              </button>
            </div>
          </div>

          {/* Section 2: Import / Restore Backup (.json) */}
          <div className="p-4 bg-[#080C14] rounded-xl border border-slate-800/90 space-y-3.5">
            <div className="flex items-center justify-between">
              <h4 className="font-bold text-slate-200 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                <Upload className="w-3.5 h-3.5 text-blue-400" />
                <span>2. Restore from Backup (.json)</span>
              </h4>
              {uploadedFileName && (
                <span className="text-[10px] font-mono text-blue-400 truncate max-w-[180px]">
                  {uploadedFileName}
                </span>
              )}
            </div>

            <p className="text-slate-400 text-xs leading-relaxed">
              Select a previously exported <code className="text-emerald-400 font-mono">.json</code> backup file or paste the JSON payload below to restore your entire ledger and configuration.
            </p>

            <div>
              <label className="block text-slate-300 font-medium mb-1.5 text-xs">
                Select Backup File (.json):
              </label>
              <input
                type="file"
                accept=".json,application/json"
                onChange={handleJsonFileUpload}
                className="block w-full text-xs text-slate-400 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-slate-800 file:text-emerald-400 hover:file:bg-slate-700 cursor-pointer border border-slate-800 rounded-lg p-1.5 bg-[#0D131F]"
              />
            </div>

            <div>
              <label className="block text-slate-400 mb-1 text-xs">
                Or paste backup JSON content directly:
              </label>
              <textarea
                rows={3}
                value={importJson}
                onChange={(e) => {
                  setImportJson(e.target.value);
                  setUploadedFileName(null);
                }}
                placeholder='{"version": "2.0.0", "categories": [...], "assets": [...], "transactions": [...]}'
                className="w-full bg-[#0D131F] border border-slate-800 text-slate-200 rounded-lg p-2.5 font-mono text-[11px] focus:outline-none focus:border-emerald-500/60"
              />
            </div>

            {/* Live Backup Preview Card */}
            {backupPreview && backupPreview.valid && backupPreview.data && (
              <div className="p-3 rounded-lg bg-[#0D131F] border border-emerald-500/30 space-y-2">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="font-semibold text-emerald-400 flex items-center gap-1.5">
                    <FileCode className="w-3.5 h-3.5" />
                    <span>Valid Backup Payload Ready</span>
                  </span>
                  <span className="font-mono text-slate-400 text-[10px]">
                    {backupPreview.data.timestamp
                      ? new Date(backupPreview.data.timestamp).toLocaleDateString()
                      : 'v' + backupPreview.data.version}
                  </span>
                </div>
                <div className="text-[11px] text-slate-300 font-mono tabular-nums flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span>{backupPreview.data.transactions?.length || 0} Transactions</span>
                  <span className="text-slate-600" aria-hidden="true">·</span>
                  <span>{backupPreview.data.assets.length} Assets</span>
                  <span className="text-slate-600" aria-hidden="true">·</span>
                  <span>{backupPreview.data.categories.length} Categories</span>
                  <span className="text-slate-600" aria-hidden="true">·</span>
                  <span>{Object.keys(backupPreview.data.monthlyPrices || {}).length} Price Snapshots</span>
                </div>
              </div>
            )}

            <button
              onClick={handleRestoreJson}
              disabled={!importJson.trim()}
              className="w-full py-2.5 px-4 rounded-lg bg-blue-500 hover:bg-blue-400 disabled:bg-slate-800 disabled:text-slate-500 text-slate-950 font-bold transition-all flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed"
            >
              <Upload className="w-4 h-4" />
              <span>Restore App State from JSON</span>
            </button>
          </div>

        </div>

        {/* Modal Footer */}
        <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between gap-2 shrink-0">
          {!confirmingFactoryReset ? (
            <button
              onClick={() => setConfirmingFactoryReset(true)}
              className="text-slate-400 hover:text-rose-400 flex items-center gap-1.5 font-medium text-xs cursor-pointer transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Factory Reset Data</span>
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-rose-400 font-semibold">Reset all data to zero?</span>
              <button
                onClick={() => {
                  onResetDemo();
                  setConfirmingFactoryReset(false);
                  onClose();
                }}
                className="px-2.5 py-1 rounded bg-rose-600 hover:bg-rose-500 text-white font-semibold text-[11px] cursor-pointer transition-colors"
              >
                Confirm Reset
              </button>
              <button
                onClick={() => setConfirmingFactoryReset(false)}
                className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] cursor-pointer transition-colors"
              >
                Cancel
              </button>
            </div>
          )}

          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-slate-800 text-slate-300 font-semibold hover:bg-slate-700 transition-all cursor-pointer"
          >
            Close
          </button>
        </div>

      </div>
    </div>
  );
};
