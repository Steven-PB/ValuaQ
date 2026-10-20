import React, { useState, useEffect } from 'react';
import { 
  X, 
  Download, 
  Upload, 
  RotateCcw, 
  Check, 
  AlertCircle, 
  FileSpreadsheet, 
  FileText, 
  Database, 
  Clock, 
  Trash2, 
  ShieldCheck, 
  Plus, 
  ArrowRight,
  FileCode
} from 'lucide-react';
import { Category, Asset, MonthlyRecord, AppSettings } from '../types';
import { 
  exportAllData, 
  importAllData, 
  getLocalSnapshots, 
  createLocalSnapshot, 
  restoreLocalSnapshot, 
  deleteLocalSnapshot,
  LocalSnapshot
} from '../lib/storage';
import { 
  downloadExcelFile, 
  downloadCSVFile, 
  downloadCSVTemplate,
  inspectSpreadsheetFile, 
  executeSpreadsheetImport, 
  ImportPreviewResult 
} from '../lib/excelExportImport';

interface DataManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
  categories: Category[];
  assets: Asset[];
  records: MonthlyRecord[];
  settings: AppSettings;
  onApplyImportedData: (cats: Category[], assets: Asset[], records: MonthlyRecord[]) => void;
  onRefreshData: () => void;
  onResetDemo: () => void;
}

export const DataManagementModal: React.FC<DataManagementModalProps> = ({
  isOpen,
  onClose,
  categories,
  assets,
  records,
  settings,
  onApplyImportedData,
  onRefreshData,
  onResetDemo,
}) => {
  const [activeTab, setActiveTab] = useState<'spreadsheet' | 'localBackup' | 'json'>('spreadsheet');
  const [importJson, setImportJson] = useState('');
  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  // Spreadsheet import state
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [importPreview, setImportPreview] = useState<ImportPreviewResult | null>(null);
  const [importMode, setImportMode] = useState<'merge' | 'replace'>('merge');
  const [isInspecting, setIsInspecting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);

  // Local snapshot state
  const [snapshots, setSnapshots] = useState<LocalSnapshot[]>([]);
  const [snapshotNameInput, setSnapshotNameInput] = useState('');

  useEffect(() => {
    if (isOpen) {
      setSnapshots(getLocalSnapshots());
      setMessage(null);
      setSelectedFile(null);
      setImportPreview(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // Excel & CSV Export handlers
  const handleExportExcel = () => {
    try {
      downloadExcelFile(categories, assets, records, settings);
      setMessage({ type: 'success', text: 'Excel workbook (.xlsx) downloaded successfully with multiple sheets!' });
    } catch (e: any) {
      setMessage({ type: 'error', text: `Failed to export Excel file: ${e.message || e}` });
    }
  };

  const handleExportCSV = () => {
    try {
      downloadCSVFile(categories, assets, records);
      setMessage({ type: 'success', text: 'CSV spreadsheet (.csv) downloaded successfully! (100% compatible for future re-import)' });
    } catch (e: any) {
      setMessage({ type: 'error', text: `Failed to export CSV: ${e.message || e}` });
    }
  };

  const handleDownloadTemplate = () => {
    try {
      downloadCSVTemplate(categories, assets);
      setMessage({ type: 'info', text: 'CSV template downloaded with your current portfolio headers!' });
    } catch (e: any) {
      setMessage({ type: 'error', text: `Failed to download CSV template: ${e.message || e}` });
    }
  };

  // Inspect uploaded CSV or Excel file
  const handleSpreadsheetFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setSelectedFile(file);
    setIsInspecting(true);
    setMessage(null);

    try {
      const preview = await inspectSpreadsheetFile(file, assets);
      setImportPreview(preview);
      setMessage({
        type: 'info',
        text: `Inspected "${file.name}": Found ${preview.validMonthsCount} month records and ${preview.detectedAssets.length} asset columns.`,
      });
    } catch (err: any) {
      setImportPreview(null);
      setMessage({ type: 'error', text: err.message || 'Failed to parse spreadsheet file.' });
    } finally {
      setIsInspecting(false);
    }
  };

  // Execute spreadsheet import
  const handleConfirmSpreadsheetImport = async () => {
    if (!selectedFile) return;

    setIsImporting(true);
    setMessage(null);

    try {
      const res = await executeSpreadsheetImport(
        selectedFile,
        categories,
        assets,
        records,
        importMode
      );

      if (res.success) {
        onApplyImportedData(res.updatedCategories, res.updatedAssets, res.updatedRecords);
        setSnapshots(getLocalSnapshots());
        setMessage({
          type: 'success',
          text: `${res.message} (A local safety backup snapshot was saved to local data).`,
        });
        setSelectedFile(null);
        setImportPreview(null);
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Import failed.' });
    } finally {
      setIsImporting(false);
    }
  };

  // Local Snapshot handlers
  const handleCreateSnapshot = () => {
    const newSnap = createLocalSnapshot(snapshotNameInput.trim() || undefined);
    setSnapshots(getLocalSnapshots());
    setSnapshotNameInput('');
    setMessage({
      type: 'success',
      text: `Created local backup snapshot "${newSnap.name}" in local browser data.`,
    });
  };

  const handleRestoreSnapshot = (id: string, name: string) => {
    if (window.confirm(`Restore local backup snapshot "${name}"? Active portfolio data will be updated.`)) {
      const success = restoreLocalSnapshot(id);
      if (success) {
        onRefreshData();
        setMessage({ type: 'success', text: `Restored snapshot "${name}" successfully!` });
      } else {
        setMessage({ type: 'error', text: 'Failed to restore snapshot.' });
      }
    }
  };

  const handleDeleteSnapshot = (id: string) => {
    deleteLocalSnapshot(id);
    setSnapshots(getLocalSnapshots());
    setMessage({ type: 'info', text: 'Local snapshot removed.' });
  };

  // JSON handlers
  const handleDownloadBackup = () => {
    const dataStr = exportAllData();
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `valuaq_portfolio_backup_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    setMessage({ type: 'success', text: 'Backup JSON downloaded successfully!' });
  };

  const handleImportJson = () => {
    if (!importJson.trim()) {
      setMessage({ type: 'error', text: 'Please paste a valid JSON string.' });
      return;
    }

    createLocalSnapshot('Auto-backup before JSON import');
    const success = importAllData(importJson);
    if (success) {
      setMessage({ type: 'success', text: 'Data imported successfully! Updating UI...' });
      onRefreshData();
      setSnapshots(getLocalSnapshots());
      setTimeout(() => onClose(), 1200);
    } else {
      setMessage({ type: 'error', text: 'Invalid JSON format or corrupted backup file.' });
    }
  };

  const handleJsonFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      setImportJson(content);
      setMessage({ type: 'info', text: `Loaded "${file.name}". Click "Restore / Import Data" below.` });
    };
    reader.readAsText(file);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl max-w-2xl w-full p-4 sm:p-6 space-y-4 text-xs max-h-[92vh] flex flex-col">
        
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold">
              <Database className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-base text-slate-100 flex items-center gap-2">
                Data Hub: Excel, CSV & Local Backups
              </h3>
              <p className="text-[11px] text-slate-400">
                Import, export, and manually preserve portfolio snapshots in local storage
              </p>
            </div>
          </div>
          <button 
            onClick={onClose} 
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Status Message Notification */}
        {message && (
          <div
            className={`p-3 rounded-xl border flex items-start gap-2.5 shrink-0 ${
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

        {/* Tab Navigation */}
        <div className="flex items-center space-x-1.5 border-b border-slate-800/80 pb-2 shrink-0">
          <button
            onClick={() => setActiveTab('spreadsheet')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold text-xs transition-all ${
              activeTab === 'spreadsheet'
                ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
            }`}
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            <span>Excel / CSV Import & Export</span>
          </button>

          <button
            onClick={() => setActiveTab('localBackup')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold text-xs transition-all ${
              activeTab === 'localBackup'
                ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>Local Snapshots ({snapshots.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('json')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold text-xs transition-all ${
              activeTab === 'json'
                ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
            }`}
          >
            <FileCode className="w-3.5 h-3.5" />
            <span>JSON Backup</span>
          </button>
        </div>

        {/* Tab Content (Scrollable) */}
        <div className="overflow-y-auto space-y-4 pr-1 flex-1">
          
          {/* TAB 1: SPREADSHEET (EXCEL & CSV) */}
          {activeTab === 'spreadsheet' && (
            <div className="space-y-4">
              
              {/* Export Panel */}
              <div className="p-4 bg-slate-950/60 rounded-xl border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-slate-200 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                    <Download className="w-3.5 h-3.5 text-emerald-400" />
                    Export Portfolio Spreadsheet
                  </h4>
                  <span className="text-[10px] text-slate-400">
                    {records.length} months &bull; {assets.length} assets
                  </span>
                </div>
                <p className="text-slate-400 text-xs leading-relaxed">
                  Export your entire portfolio history with monthly asset values, invested capital, floating P&L, and categories. 
                  <span className="text-emerald-400 font-medium"> The exported CSV uses the exact same format as the importer</span>, so you can save it as an offline backup and re-import it anytime to restore past data!
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
                  <button
                    onClick={handleExportCSV}
                    className="flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold transition-all shadow-md shadow-emerald-500/20 cursor-pointer text-xs"
                  >
                    <FileText className="w-4 h-4" />
                    <span>Download CSV (.csv)</span>
                  </button>

                  <button
                    onClick={handleExportExcel}
                    className="flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold border border-slate-700 transition-all cursor-pointer text-xs"
                  >
                    <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
                    <span>Download Excel (.xlsx)</span>
                  </button>

                  <button
                    onClick={handleDownloadTemplate}
                    className="flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 font-semibold border border-dashed border-slate-600 transition-all cursor-pointer text-xs"
                    title="Download a clean CSV template with your current portfolio column structure"
                  >
                    <Download className="w-4 h-4 text-blue-400" />
                    <span>Download CSV Template</span>
                  </button>
                </div>
              </div>

              {/* Import Panel */}
              <div className="p-4 bg-slate-950/60 rounded-xl border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-slate-200 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                    <Upload className="w-3.5 h-3.5 text-blue-400" />
                    Import from CSV or Excel (.xlsx, .xls)
                  </h4>
                  <span className="text-[10px] text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20 font-medium">
                    1:1 Symmetrical Roundtrip
                  </span>
                </div>
                <p className="text-slate-400 text-xs leading-relaxed">
                  Upload any ValuaQ exported CSV or Excel file to restore historical months. Columns formatted as <code className="text-emerald-300 font-mono text-[11px] bg-slate-900 px-1 py-0.5 rounded">[Category] Asset (Value)</code> and <code className="text-emerald-300 font-mono text-[11px] bg-slate-900 px-1 py-0.5 rounded">[Category] Asset (Invested)</code> will map automatically, and any new categories or assets will be created seamlessly.
                </p>

                <div>
                  <label className="block text-slate-300 font-medium mb-1.5 text-xs">
                    Choose Spreadsheet File (.csv, .xlsx, .xls):
                  </label>
                  <input
                    type="file"
                    accept=".csv, .xlsx, .xls"
                    onChange={handleSpreadsheetFileSelect}
                    className="block w-full text-xs text-slate-400 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-slate-800 file:text-emerald-400 hover:file:bg-slate-700 cursor-pointer border border-slate-800 rounded-xl p-1 bg-slate-900"
                  />
                </div>

                {isInspecting && (
                  <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 flex items-center gap-2 text-xs">
                    <span className="w-3 h-3 rounded-full border-2 border-emerald-400 border-t-transparent animate-spin" />
                    <span>Analyzing spreadsheet headers and columns...</span>
                  </div>
                )}

                {/* Live Inspection Preview */}
                {importPreview && (
                  <div className="p-3.5 bg-slate-900/90 rounded-xl border border-blue-500/30 space-y-3">
                    <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                      <span className="font-bold text-slate-200 flex items-center gap-1.5 text-xs">
                        <Check className="w-4 h-4 text-blue-400" />
                        Preview: File Validated & Ready
                      </span>
                      <span className="text-[10px] bg-blue-500/20 text-blue-300 px-2 py-0.5 rounded-full font-semibold">
                        {importPreview.validMonthsCount} Month(s) Detected
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
                      <div>
                        <span className="text-slate-400 block mb-0.5">Months in file:</span>
                        <span className="font-mono text-slate-200 block truncate bg-slate-950 px-2 py-1 rounded border border-slate-800">
                          {importPreview.monthsList.slice(0, 5).join(', ')}
                          {importPreview.monthsList.length > 5 ? ` +${importPreview.monthsList.length - 5} more` : ''}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-400 block mb-0.5">Assets detected:</span>
                        <span className="text-slate-200 font-medium block bg-slate-950 px-2 py-1 rounded border border-slate-800 truncate">
                          {importPreview.detectedAssets.length} asset columns ({importPreview.newAssetsCount} new to portfolio)
                        </span>
                      </div>
                    </div>

                    {importPreview.detectedCategories.length > 0 && (
                      <div className="text-[11px] space-y-1">
                        <span className="text-slate-400 block">Categories recognized in column headers:</span>
                        <div className="flex flex-wrap gap-1">
                          {importPreview.detectedCategories.map((catName) => (
                            <span
                              key={catName}
                              className="px-2 py-0.5 rounded-md bg-slate-800 text-slate-300 text-[10px] border border-slate-700 font-medium"
                            >
                              {catName}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Mode Selection */}
                    <div className="space-y-1.5 pt-1">
                      <label className="text-slate-300 font-semibold block text-[11px]">
                        Choose Import Strategy:
                      </label>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => setImportMode('merge')}
                          className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                            importMode === 'merge'
                              ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                              : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-300'
                          }`}
                        >
                          <div className="font-bold text-xs">Merge Records</div>
                          <div className="text-[10px] text-slate-400 mt-0.5">
                            Keep existing months, update overlapping months.
                          </div>
                        </button>

                        <button
                          type="button"
                          onClick={() => setImportMode('replace')}
                          className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                            importMode === 'replace'
                              ? 'bg-rose-500/15 border-rose-500/40 text-rose-300'
                              : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-300'
                          }`}
                        >
                          <div className="font-bold text-xs">Replace All</div>
                          <div className="text-[10px] text-slate-400 mt-0.5">
                            Overwrite existing monthly records completely with file data.
                          </div>
                        </button>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 text-[10px] text-slate-400 bg-slate-950/50 p-2 rounded-lg border border-slate-800">
                      <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      <span>An instant local snapshot backup will be created in your browser prior to import for 100% rollback safety.</span>
                    </div>

                    <button
                      onClick={handleConfirmSpreadsheetImport}
                      disabled={isImporting}
                      className="w-full py-2.5 rounded-xl bg-blue-500 hover:bg-blue-400 text-slate-950 font-bold transition-all shadow-md shadow-blue-500/20 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 text-xs"
                    >
                      <Upload className="w-4 h-4" />
                      <span>{isImporting ? 'Importing Data...' : `Confirm & Import ${importPreview.validMonthsCount} Month(s)`}</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 2: LOCAL BACKUP SNAPSHOTS */}
          {activeTab === 'localBackup' && (
            <div className="space-y-4">
              
              {/* Create Snapshot Box */}
              <div className="p-4 bg-slate-950/60 rounded-xl border border-slate-800 space-y-3">
                <h4 className="font-bold text-slate-200 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                  <Plus className="w-3.5 h-3.5 text-emerald-400" />
                  Create Instant Local Backup Snapshot
                </h4>
                <p className="text-slate-400 text-xs">
                  Saves a full snapshot of your current portfolio, categories, and monthly records directly to your browser's local memory. You can revert back to any snapshot with a single click.
                </p>

                <div className="flex gap-2">
                  <input
                    type="text"
                    value={snapshotNameInput}
                    onChange={(e) => setSnapshotNameInput(e.target.value)}
                    placeholder="Optional snapshot note (e.g., Before Year-End Rebalance)..."
                    className="flex-1 bg-slate-900 border border-slate-800 text-slate-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-emerald-500"
                  />
                  <button
                    onClick={handleCreateSnapshot}
                    className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs transition-all shadow-md shadow-emerald-500/20 whitespace-nowrap cursor-pointer"
                  >
                    Save Snapshot
                  </button>
                </div>
              </div>

              {/* Snapshots List */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-slate-400 text-xs font-semibold px-1">
                  <span>Saved Local Snapshots ({snapshots.length})</span>
                  <span className="text-[10px] text-slate-500">Stored in browser local storage</span>
                </div>

                {snapshots.length === 0 ? (
                  <div className="p-6 text-center bg-slate-950/40 rounded-xl border border-slate-800/80 text-slate-500 text-xs">
                    No local snapshots saved yet. Click "Save Snapshot" above to create your first manual backup!
                  </div>
                ) : (
                  <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                    {snapshots.map((snap) => (
                      <div
                        key={snap.id}
                        className="p-3 bg-slate-950/70 border border-slate-800 rounded-xl flex items-center justify-between gap-3 hover:border-slate-700 transition-all"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="font-semibold text-slate-200 text-xs truncate">
                            {snap.name}
                          </div>
                          <div className="text-[10px] text-slate-400 flex items-center gap-2 mt-0.5">
                            <span className="flex items-center gap-1">
                              <Clock className="w-2.5 h-2.5 text-slate-500" />
                              {new Date(snap.timestamp).toLocaleString()}
                            </span>
                            <span>&bull;</span>
                            <span>{snap.recordCount} months</span>
                            <span>&bull;</span>
                            <span>{snap.assetCount} assets</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            onClick={() => handleRestoreSnapshot(snap.id, snap.name)}
                            className="px-2.5 py-1.5 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-400 font-semibold text-[11px] border border-emerald-500/30 transition-all flex items-center gap-1 cursor-pointer"
                            title="Restore this snapshot to active data"
                          >
                            <RotateCcw className="w-3 h-3" />
                            <span>Restore</span>
                          </button>
                          <button
                            onClick={() => handleDeleteSnapshot(snap.id)}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition-all cursor-pointer"
                            title="Delete snapshot"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

            </div>
          )}

          {/* TAB 3: JSON RAW BACKUP */}
          {activeTab === 'json' && (
            <div className="space-y-4">
              <div className="p-4 bg-slate-950/60 rounded-xl border border-slate-800 space-y-2">
                <h4 className="font-bold text-slate-200 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                  <Download className="w-3.5 h-3.5 text-emerald-400" />
                  1. Download JSON File
                </h4>
                <p className="text-slate-400 text-xs">
                  Save a complete programmatic snapshot of your categories, assets, monthly records, and user preferences.
                </p>
                <button
                  onClick={handleDownloadBackup}
                  className="w-full mt-2 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold transition-all shadow-md shadow-emerald-500/20 cursor-pointer"
                >
                  Export Backup (.json)
                </button>
              </div>

              <div className="p-4 bg-slate-950/60 rounded-xl border border-slate-800 space-y-3">
                <h4 className="font-bold text-slate-200 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                  <Upload className="w-3.5 h-3.5 text-blue-400" />
                  2. Restore from JSON File or Text
                </h4>

                <div>
                  <label className="block text-slate-400 mb-1">Select JSON File:</label>
                  <input
                    type="file"
                    accept=".json"
                    onChange={handleJsonFileUpload}
                    className="block w-full text-xs text-slate-400 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-slate-800 file:text-emerald-400 hover:file:bg-slate-700 cursor-pointer border border-slate-800 rounded-xl p-1 bg-slate-900"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 mb-1">Or paste JSON content directly:</label>
                  <textarea
                    rows={3}
                    value={importJson}
                    onChange={(e) => setImportJson(e.target.value)}
                    placeholder="Paste JSON string here..."
                    className="w-full bg-slate-900 border border-slate-800 text-slate-200 rounded-xl p-2.5 font-mono text-[11px] focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <button
                  onClick={handleImportJson}
                  className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold border border-slate-700 transition-all cursor-pointer"
                >
                  Restore from JSON
                </button>
              </div>
            </div>
          )}

        </div>

        {/* Modal Footer */}
        <div className="pt-3 border-t border-slate-800 flex items-center justify-between shrink-0">
          <button
            onClick={() => {
              if (window.confirm('Are you sure you want to perform a factory reset? All categories, assets, and monthly records will be reset.')) {
                onResetDemo();
                onClose();
              }
            }}
            className="text-slate-400 hover:text-rose-400 flex items-center gap-1 font-medium text-xs cursor-pointer transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Factory Reset Data</span>
          </button>

          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 font-medium hover:bg-slate-700 transition-all cursor-pointer"
          >
            Close
          </button>
        </div>

      </div>
    </div>
  );
};
