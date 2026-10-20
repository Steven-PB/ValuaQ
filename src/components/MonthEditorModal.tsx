import React, { useState, useEffect } from 'react';
import { 
  X, 
  Save, 
  Calendar, 
  AlertCircle, 
  AlertTriangle 
} from 'lucide-react';
import { Category, Asset, MonthlyRecord, RiskLevel } from '../types';
import { 
  formatCurrency, 
  formatPercent, 
  getRiskLevelBadgeClass 
} from '../lib/formatters';

interface MonthEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (recordData: Omit<MonthlyRecord, 'id'>, existingId?: string) => void;
  initialRecord?: MonthlyRecord | null;
  latestRecord?: MonthlyRecord | null;
  records?: MonthlyRecord[];
  categories: Category[];
  assets: Asset[];
  currencySymbol: string;
}

export const MonthEditorModal: React.FC<MonthEditorModalProps> = ({
  isOpen,
  onClose,
  onSave,
  initialRecord,
  latestRecord,
  records = [],
  categories,
  assets,
  currencySymbol,
}) => {
  const [month, setMonth] = useState<string>('');
  const [assetValues, setAssetValues] = useState<Record<string, number>>({});
  const [assetInvestedValues, setAssetInvestedValues] = useState<Record<string, number>>({});
  const [assetValueInputs, setAssetValueInputs] = useState<Record<string, string>>({});
  const [assetInvestedValueInputs, setAssetInvestedValueInputs] = useState<Record<string, string>>({});
  const [emergencyFund, setEmergencyFund] = useState<number>(0);
  const [emergencyFundInput, setEmergencyFundInput] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [showZeroInvestedConfirm, setShowZeroInvestedConfirm] = useState<boolean>(false);

  useEffect(() => {
    if (isOpen) {
      setError('');
      let initialVals: Record<string, number> = {};
      let initialInvVals: Record<string, number> = {};
      let initialEF = 0;

      if (initialRecord) {
        setMonth(initialRecord.month);
        initialVals = { ...(initialRecord.assetValues || {}) };
        initialInvVals = { ...(initialRecord.assetInvestedValues || {}) };
        initialEF = initialRecord.emergencyFund || 0;
        setDescription(initialRecord.description || '');
      } else {
        // Default to next month if latest record exists, or current month
        let defaultMonth = '2026-08';
        let defaultAssetVals: Record<string, number> = {};
        let defaultAssetInvestedVals: Record<string, number> = {};

        if (latestRecord) {
          const [yr, mo] = latestRecord.month.split('-');
          let yrNum = parseInt(yr, 10);
          let moNum = parseInt(mo, 10) + 1;
          if (moNum > 12) {
            moNum = 1;
            yrNum += 1;
          }
          defaultMonth = `${yrNum}-${String(moNum).padStart(2, '0')}`;
          defaultAssetVals = { ...(latestRecord.assetValues || {}) };
          defaultAssetInvestedVals = {};
          initialEF = latestRecord.emergencyFund || 0;
        } else {
          const now = new Date();
          defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        }

        setMonth(defaultMonth);
        initialVals = defaultAssetVals;
        initialInvVals = defaultAssetInvestedVals;
        setDescription('');
      }

      setAssetValues(initialVals);
      setAssetInvestedValues(initialInvVals);
      setEmergencyFund(initialEF);
      setEmergencyFundInput(initialEF === 0 ? '' : String(initialEF));

      const valInputs: Record<string, string> = {};
      const invInputs: Record<string, string> = {};
      Object.entries(initialVals).forEach(([id, val]) => {
        valInputs[id] = val === 0 ? '' : String(val);
      });
      Object.entries(initialInvVals).forEach(([id, val]) => {
        invInputs[id] = val === 0 ? '' : String(val);
      });
      setAssetValueInputs(valInputs);
      setAssetInvestedValueInputs(invInputs);
    }
  }, [isOpen, initialRecord, latestRecord]);

  const previewTotalAsset = (Object.values(assetValues) as number[]).reduce((acc, curr) => acc + (Number(curr) || 0), 0);
  const calculatedMonthlyInvested = (Object.values(assetInvestedValues) as number[]).reduce((acc, curr) => acc + (Number(curr) || 0), 0);

  // Compute previous month's cumulative total invested capital by summing all records prior to target month
  let prevTotalInvested = 0;
  if (records && records.length > 0) {
    records.forEach((r) => {
      if (r.month < month && r.id !== initialRecord?.id) {
        prevTotalInvested += (r.monthlyMoneyInvested || 0);
      }
    });
  } else if (latestRecord && latestRecord.id !== initialRecord?.id) {
    prevTotalInvested = latestRecord.totalMoneyInvested || 0;
  } else if (initialRecord) {
    prevTotalInvested = (initialRecord.totalMoneyInvested || 0) - (initialRecord.monthlyMoneyInvested || 0);
  }

  const calculatedTotalInvested = prevTotalInvested + calculatedMonthlyInvested;
  const previewFloatingPL = previewTotalAsset - calculatedTotalInvested;

  const handleAssetValueChange = (assetId: string, valueStr: string) => {
    const sanitized = valueStr.replace(/^0+(?=\d)/, '');
    setAssetValueInputs((prev) => ({ ...prev, [assetId]: sanitized }));
    const parsed = parseFloat(sanitized) || 0;
    setAssetValues((prev) => ({
      ...prev,
      [assetId]: parsed,
    }));
  };

  const handleAssetInvestedValueChange = (assetId: string, valueStr: string) => {
    const sanitized = valueStr.replace(/^0+(?=\d)/, '');
    setAssetInvestedValueInputs((prev) => ({ ...prev, [assetId]: sanitized }));
    const parsed = parseFloat(sanitized) || 0;
    setAssetInvestedValues((prev) => ({
      ...prev,
      [assetId]: parsed,
    }));
  };

  const handleEmergencyFundChange = (valueStr: string) => {
    const sanitized = valueStr.replace(/^0+(?=\d)/, '');
    setEmergencyFundInput(sanitized);
    const parsed = parseFloat(sanitized) || 0;
    setEmergencyFund(parsed);
  };

  const executeSave = () => {
    onSave(
      {
        month,
        assetValues,
        assetInvestedValues,
        monthlyMoneyInvested: calculatedMonthlyInvested,
        totalMoneyInvested: calculatedTotalInvested,
        emergencyFund,
        description,
      },
      initialRecord?.id
    );
    setShowZeroInvestedConfirm(false);
    onClose();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!month || !month.match(/^\d{4}-\d{2}$/)) {
      setError('Please provide a valid month format (YYYY-MM).');
      return;
    }

    // Duplicate month check
    const isDuplicate = records.some((r) => r.month === month && r.id !== initialRecord?.id);
    if (isDuplicate) {
      setError(`A record for month "${month}" already exists. Please select a different month.`);
      return;
    }

    // Safeguard: Check if monthly invested is 0 and prompt for confirmation
    if (calculatedMonthlyInvested === 0 && !showZeroInvestedConfirm) {
      setShowZeroInvestedConfirm(true);
      return;
    }

    executeSave();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden">
        
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950/50">
          <div className="flex items-center space-x-2">
            <Calendar className="w-5 h-5 text-emerald-400" />
            <h3 className="text-base font-bold text-slate-100">
              {initialRecord ? `Edit Month Snapshot (${initialRecord.month})` : 'Record New Monthly Values'}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg bg-slate-800/60 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Form */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto custom-scrollbar p-4 sm:p-6 space-y-6 text-xs">
          {error && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Month Picker & Auto-Calculated Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-slate-950/60 p-4 rounded-xl border border-slate-800">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-slate-400 font-semibold uppercase tracking-wider">
                  Target Month
                </label>
                <span className="text-[10px] text-amber-400 font-medium">Sequential</span>
              </div>
              <input
                type="month"
                required
                value={month}
                onChange={(e) => {
                  setMonth(e.target.value);
                  setError('');
                }}
                className="w-full bg-slate-900 border border-slate-700 text-slate-100 rounded-xl px-3 py-2 text-xs font-mono focus:outline-none focus:border-emerald-500"
                title="Select target month for snapshot."
              />
            </div>

            <div className="bg-slate-900/80 p-2.5 rounded-xl border border-slate-800 flex flex-col justify-center">
              <div className="text-slate-400 font-medium text-[10px] uppercase tracking-wider mb-1 flex items-center gap-1">
                <span>Monthly Investment</span>
                <span className="text-emerald-400 text-[9px] font-normal">(Sum of Money Invested)</span>
              </div>
              <div className="text-sm font-bold font-mono text-emerald-400">
                {formatCurrency(calculatedMonthlyInvested, currencySymbol)}
              </div>
            </div>
          </div>

          {/* Emergency Fund Reserve (Safety Net - Excluded from P&L and Invested Capital) */}
          <div className="bg-slate-950/60 p-4 rounded-xl border border-amber-500/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-1.5 mb-0.5">
                <span className="font-bold text-amber-400 uppercase tracking-wider text-[11px]">
                  Emergency Fund (Safety Net Cash Reserve)
                </span>
                <span className="px-1.5 py-0.5 bg-amber-500/10 text-amber-300 border border-amber-500/20 rounded text-[9px] font-semibold">
                  Excluded from P&amp;L
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                Cash safety net reserve. Total Capital = Total Assets + Emergency Fund.
              </p>
            </div>
            <div className="w-full sm:w-48">
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 font-mono text-xs">
                  {currencySymbol}
                </span>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={emergencyFundInput ?? (emergencyFund === 0 ? '' : String(emergencyFund))}
                  onChange={(e) => handleEmergencyFundChange(e.target.value)}
                  className="w-full bg-slate-900 border border-amber-500/30 text-amber-300 rounded-xl pl-8 pr-3 py-2 font-mono text-xs font-bold focus:outline-none focus:border-amber-400"
                  placeholder="0"
                />
              </div>
            </div>
          </div>

          {/* Asset Values & Per-Asset Invested Amounts */}
          <div>
            <h4 className="font-bold text-slate-200 uppercase tracking-wider text-[11px] mb-3 flex items-center justify-between">
              <span>Asset Portfolio & Investment for {month || 'this month'}:</span>
              <span className="text-[10px] text-slate-400 font-normal">Asset Value & Money Invested per Asset</span>
            </h4>

            {assets.length === 0 ? (
              <div className="p-6 bg-slate-950/60 rounded-xl border border-dashed border-slate-800 text-center space-y-2">
                <AlertTriangle className="w-6 h-6 text-amber-400 mx-auto" />
                <p className="text-slate-300 font-semibold text-xs">No Assets Configured</p>
                <p className="text-slate-500 text-[11px]">
                  Please create categories and assets in the "Asset Hierarchy Manager" tab first before recording monthly values.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {assets.map((ast) => {
                const cat = categories.find((c) => c.id === ast.categoryId);
                const currentVal = assetValues[ast.id] ?? 0;
                const investedVal = assetInvestedValues[ast.id] ?? 0;

                return (
                  <div
                    key={ast.id}
                    className="p-3 bg-slate-950/40 border border-slate-800 rounded-xl space-y-2 hover:border-slate-700 transition-all"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-slate-200 truncate pr-2">
                        {ast.name}
                      </span>
                      {cat && (
                        <span className={`px-1.5 py-0.5 text-[10px] rounded border font-medium ${getRiskLevelBadgeClass(cat.riskLevel)}`}>
                          {cat.name} ({cat.riskLevel})
                        </span>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-900">
                      <div>
                        <label className="block text-[10px] text-slate-400 mb-1 font-medium">Asset Value</label>
                        <div className="relative">
                          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500 font-mono text-[10px]">
                            {currencySymbol}
                          </span>
                          <input
                            type="number"
                            min="0"
                            step="any"
                            value={assetValueInputs[ast.id] ?? (currentVal === 0 ? '' : String(currentVal))}
                            onChange={(e) => handleAssetValueChange(ast.id, e.target.value)}
                            className="w-full bg-slate-900 border border-slate-800 text-slate-100 rounded-lg pl-7 pr-2 py-1 font-mono text-xs focus:outline-none focus:border-emerald-500"
                            placeholder="0"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-[10px] text-slate-400 mb-1 font-medium">Money Invested</label>
                        <div className="relative">
                          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500 font-mono text-[10px]">
                            {currencySymbol}
                          </span>
                          <input
                            type="number"
                            min="0"
                            step="any"
                            value={assetInvestedValueInputs[ast.id] ?? (investedVal === 0 ? '' : String(investedVal))}
                            onChange={(e) => handleAssetInvestedValueChange(ast.id, e.target.value)}
                            className="w-full bg-slate-900 border border-slate-800 text-blue-300 rounded-lg pl-7 pr-2 py-1 font-mono text-xs focus:outline-none focus:border-blue-500"
                            placeholder="0"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            )}
          </div>

          {/* Live Preview Summary Bar */}
          <div className="p-3 bg-slate-950 border border-emerald-500/20 rounded-xl grid grid-cols-2 sm:grid-cols-4 gap-2 font-mono text-center">
            <div className="text-left">
              <span className="text-slate-400 block text-[10px]">Total Assets:</span>
              <span className="text-emerald-400 font-bold text-sm">
                {formatCurrency(previewTotalAsset, currencySymbol)}
              </span>
            </div>
            <div>
              <span className="text-slate-400 block text-[10px]">Emergency Fund:</span>
              <span className="text-amber-400 font-bold text-sm">
                {formatCurrency(emergencyFund, currencySymbol)}
              </span>
            </div>
            <div>
              <span className="text-slate-400 block text-[10px]">Total Capital:</span>
              <span className="text-blue-400 font-bold text-sm">
                {formatCurrency(previewTotalAsset + emergencyFund, currencySymbol)}
              </span>
            </div>
            <div className="text-right">
              <span className="text-slate-400 block text-[10px]">Preview Floating P/L:</span>
              <span className={`font-bold text-sm ${previewFloatingPL >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {formatCurrency(previewFloatingPL, currencySymbol)}
              </span>
            </div>
          </div>

          {/* Description & Notes */}
          <div>
            <label className="block text-slate-400 font-semibold uppercase tracking-wider mb-1.5">
              Month Notes & Market Context
            </label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Dollar cost averaged into US stocks, received crypto dividend, etc."
              className="w-full bg-slate-950 border border-slate-800 text-slate-100 rounded-xl p-3 text-xs focus:outline-none focus:border-emerald-500"
            />
          </div>

          {/* Footer Submit Buttons */}
          <div className="pt-2 flex items-center justify-end space-x-2 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-slate-300 bg-slate-800 hover:bg-slate-700 transition-all font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 rounded-xl text-slate-950 font-bold bg-emerald-400 hover:bg-emerald-300 shadow-md shadow-emerald-500/20 transition-all flex items-center gap-1.5"
            >
              <Save className="w-4 h-4 stroke-[2.5]" />
              <span>Save Month Record</span>
            </button>
          </div>

        </form>
      </div>

      {/* Zero Monthly Invested Safeguard Confirmation Dialog */}
      {showZeroInvestedConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-amber-500/40 rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex items-center space-x-3 text-amber-400">
              <AlertTriangle className="w-6 h-6 shrink-0" />
              <h4 className="font-bold text-slate-100 text-base">Monthly Invested is {currencySymbol}0</h4>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              The calculated monthly capital addition for <span className="font-mono text-emerald-400 font-semibold">{month}</span> is <span className="font-mono font-bold text-amber-400">{formatCurrency(0, currencySymbol)}</span> based on the per-asset invested amounts.
            </p>
            <p className="text-xs text-slate-400">
              Are you sure you want to proceed and save this month record with <strong>{currencySymbol}0</strong> new capital invested?
            </p>
            <div className="flex items-center justify-end space-x-3 pt-2">
              <button
                type="button"
                onClick={() => setShowZeroInvestedConfirm(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-800 rounded-xl transition-colors border border-slate-700"
              >
                Go Back & Adjust
              </button>
              <button
                type="button"
                onClick={executeSave}
                className="px-4 py-2 text-xs font-bold text-slate-950 bg-amber-400 hover:bg-amber-300 rounded-xl transition-colors font-sans shadow-lg shadow-amber-400/20"
              >
                Confirm & Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
