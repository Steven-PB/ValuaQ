import React, { useState } from 'react';
import { X, Download, Upload, RotateCcw, Check, AlertCircle, FileText } from 'lucide-react';
import { exportAllData, importAllData } from '../lib/storage';

interface DataManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRefreshData: () => void;
  onResetDemo: () => void;
}

export const DataManagementModal: React.FC<DataManagementModalProps> = ({
  isOpen,
  onClose,
  onRefreshData,
  onResetDemo,
}) => {
  const [importJson, setImportJson] = useState('');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  if (!isOpen) return null;

  const handleDownloadBackup = () => {
    const dataStr = exportAllData();
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `monthly_asset_tracker_backup_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    setMessage({ type: 'success', text: 'Backup JSON downloaded successfully!' });
  };

  const handleImport = () => {
    if (!importJson.trim()) {
      setMessage({ type: 'error', text: 'Please paste a valid JSON string.' });
      return;
    }

    const success = importAllData(importJson);
    if (success) {
      setMessage({ type: 'success', text: 'Data imported successfully! Updating UI...' });
      onRefreshData();
      setTimeout(() => onClose(), 1200);
    } else {
      setMessage({ type: 'error', text: 'Invalid JSON format or corrupted backup file.' });
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      setImportJson(content);
      setMessage({ type: 'info', text: `Loaded "${file.name}". Click "Restore / Import Data" below to complete import.` });
    };
    reader.readAsText(file);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl max-w-lg w-full p-6 space-y-5 text-xs">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center space-x-2">
            <FileText className="w-5 h-5 text-emerald-400" />
            <h3 className="font-bold text-base text-slate-100">
              Data Backup, Export & Import
            </h3>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>

        {message && (
          <div
            className={`p-3 rounded-xl border flex items-center gap-2 ${
              message.type === 'success'
                ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                : 'bg-rose-500/10 border-rose-500/20 text-rose-400'
            }`}
          >
            {message.type === 'success' ? <Check className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
            <span>{message.text}</span>
          </div>
        )}

        {/* Export Section */}
        <div className="p-4 bg-slate-950/60 rounded-xl border border-slate-800 space-y-2">
          <h4 className="font-bold text-slate-200 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
            <Download className="w-3.5 h-3.5 text-emerald-400" />
            1. Download Local JSON Backup
          </h4>
          <p className="text-slate-400 text-[11px]">
            Save a full snapshot of your assets, monthly history, custom categories, and risk levels to a local JSON file.
          </p>
          <button
            onClick={handleDownloadBackup}
            className="w-full mt-2 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold transition-all shadow-md shadow-emerald-500/20"
          >
            Export Backup (.json)
          </button>
        </div>

        {/* Import Section */}
        <div className="p-4 bg-slate-950/60 rounded-xl border border-slate-800 space-y-3">
          <h4 className="font-bold text-slate-200 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
            <Upload className="w-3.5 h-3.5 text-blue-400" />
            2. Restore Data from Backup JSON
          </h4>

          <div>
            <label className="block text-slate-400 mb-1">Select Backup File:</label>
            <input
              type="file"
              accept=".json"
              onChange={handleFileUpload}
              className="block w-full text-xs text-slate-400 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-slate-800 file:text-emerald-400 hover:file:bg-slate-700 cursor-pointer"
            />
          </div>

          <div>
            <label className="block text-slate-400 mb-1">Or paste JSON content directly:</label>
            <textarea
              rows={3}
              value={importJson}
              onChange={(e) => setImportJson(e.target.value)}
              placeholder="Paste JSON here..."
              className="w-full bg-slate-900 border border-slate-800 text-slate-200 rounded-xl p-2.5 font-mono text-[11px] focus:outline-none focus:border-emerald-500"
            />
          </div>

          <button
            onClick={handleImport}
            className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold border border-slate-700 transition-all"
          >
            Restore / Import Data
          </button>
        </div>

        {/* Factory Reset Data */}
        <div className="pt-2 flex items-center justify-between border-t border-slate-800">
          <button
            onClick={() => {
              if (window.confirm('Are you sure you want to perform a factory reset? All categories, assets, and monthly records will be cleared permanently.')) {
                onResetDemo();
                onClose();
              }
            }}
            className="text-slate-400 hover:text-rose-400 flex items-center gap-1 font-medium text-xs cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Factory Reset / Clear All Data</span>
          </button>

          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 font-medium hover:bg-slate-700"
          >
            Close
          </button>
        </div>

      </div>
    </div>
  );
};
