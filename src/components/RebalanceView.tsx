import React, { useState, useMemo, useEffect } from 'react';
import { 
  Scale, 
  TrendingUp, 
  Sliders, 
  ArrowRight, 
  CheckCircle2, 
  AlertCircle, 
  DollarSign, 
  RotateCcw, 
  Sparkles, 
  Plus, 
  Minus, 
  Save, 
  Info,
  ArrowUpRight,
  ArrowDownRight,
  ShieldAlert
} from 'lucide-react';
import { Category, Asset, MonthlyRecord, RebalanceMode } from '../types';
import { calculateRebalance, getTargetPresets } from '../lib/rebalanceEngine';
import { formatCurrency, formatPercent, formatNumberWithCommas, parseFormattedNumber } from '../lib/formatters';

interface RebalanceViewProps {
  categories: Category[];
  assets: Asset[];
  records: MonthlyRecord[];
  currencySymbol: string;
  stealthMode: boolean;
  onUpdateCategoryTargets: (updatedCategories: Category[]) => void;
}

export const RebalanceView: React.FC<RebalanceViewProps> = ({
  categories,
  assets,
  records,
  currencySymbol,
  stealthMode,
  onUpdateCategoryTargets,
}) => {
  // Get the most recent month record
  const latestRecord = useMemo(() => {
    if (!records || records.length === 0) return undefined;
    return [...records].sort((a, b) => b.month.localeCompare(a.month))[0];
  }, [records]);

  // Local string state for target inputs (matches depositInput behavior: allows empty, prevents "030")
  const [targetInputs, setTargetInputs] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    const hasAnyTarget = categories.some((c) => typeof c.targetPercent === 'number' && c.targetPercent > 0);
    
    categories.forEach((cat) => {
      if (hasAnyTarget) {
        initial[cat.id] = cat.targetPercent !== undefined ? String(cat.targetPercent) : '0';
      } else {
        // Default equal distribution if no targets have ever been set
        const equalVal = Math.round((100 / Math.max(1, categories.length)) * 10) / 10;
        initial[cat.id] = String(equalVal);
      }
    });
    return initial;
  });

  // Rebalance mode & deposit capital input (formatted with live thousand separators)
  const [mode, setMode] = useState<RebalanceMode>('cashflow');
  const [depositInput, setDepositInput] = useState<string>(() => {
    return latestRecord?.monthlyMoneyInvested
      ? formatNumberWithCommas(latestRecord.monthlyMoneyInvested)
      : '10,000';
  });

  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string | null>(null);

  // Sync targetInputs when categories are loaded or updated externally
  useEffect(() => {
    setTargetInputs((prev) => {
      let changed = false;
      const next = { ...prev };
      const hasAnyTarget = categories.some((c) => typeof c.targetPercent === 'number' && c.targetPercent > 0);
      categories.forEach((cat) => {
        if (next[cat.id] === undefined) {
          changed = true;
          if (hasAnyTarget) {
            next[cat.id] = cat.targetPercent !== undefined ? String(cat.targetPercent) : '0';
          } else {
            const equalVal = Math.round((100 / Math.max(1, categories.length)) * 10) / 10;
            next[cat.id] = String(equalVal);
          }
        }
      });
      return changed ? next : prev;
    });
  }, [categories]);

  // Derive numeric localTargets for all calculations
  const localTargets = useMemo(() => {
    const parsed: Record<string, number> = {};
    categories.forEach((cat) => {
      const raw = targetInputs[cat.id];
      if (raw === undefined || raw === '') {
        parsed[cat.id] = 0;
      } else {
        const num = parseFloat(raw);
        parsed[cat.id] = isNaN(num) ? 0 : Math.max(0, Math.min(100, Math.round(num * 10) / 10));
      }
    });
    return parsed;
  }, [categories, targetInputs]);

  // Compute total target sum for validation
  const targetSum = useMemo(() => {
    return (Object.values(localTargets) as number[]).reduce((acc: number, val: number) => acc + (val || 0), 0);
  }, [localTargets]);

  const isTargetSumValid = Math.abs(targetSum - 100) < 0.1;

  // Categories merged with local targets for calculation
  const categoriesWithLocalTargets = useMemo(() => {
    return categories.map((cat) => ({
      ...cat,
      targetPercent: localTargets[cat.id] ?? 0,
    }));
  }, [categories, localTargets]);

  // Parse masked deposit input for calculation engine (only applicable in cashflow mode)
  const parsedDeposit = mode === 'cashflow' ? parseFormattedNumber(depositInput) : 0;

  // Run calculation engine with 5% tolerance margin
  const analysis = useMemo(() => {
    return calculateRebalance(
      categoriesWithLocalTargets,
      assets,
      latestRecord,
      parsedDeposit,
      mode,
      5.0 // 5% tolerance
    );
  }, [categoriesWithLocalTargets, assets, latestRecord, parsedDeposit, mode]);

  // Handle target input changes with leading zero suppression (e.g. typing 30 doesn't produce "030")
  const handleTargetChange = (categoryId: string, rawValue: string) => {
    let val = rawValue;
    // If user enters e.g. "030", strip redundant leading zero to become "30"
    if (/^0\d+/.test(val)) {
      val = val.replace(/^0+/, '');
    }
    // Cap max at 100
    const num = parseFloat(val);
    if (!isNaN(num) && num > 100) {
      val = '100';
    }
    setTargetInputs((prev) => ({
      ...prev,
      [categoryId]: val,
    }));
  };

  const handleTargetBlur = (categoryId: string) => {
    setTargetInputs((prev) => {
      const current = prev[categoryId];
      if (current === undefined || current.trim() === '') {
        return { ...prev, [categoryId]: '0' };
      }
      const num = parseFloat(current);
      if (isNaN(num)) {
        return { ...prev, [categoryId]: '0' };
      }
      return { ...prev, [categoryId]: String(Math.max(0, Math.min(100, Math.round(num * 10) / 10))) };
    });
  };

  // Live deposit input masking: automatic thousand separators and cursor preservation
  const handleDepositChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target;
    const rawValue = input.value;
    const selectionStart = input.selectionStart || 0;

    // Count raw digits/dots before current cursor
    const beforeCursor = rawValue.slice(0, selectionStart);
    const digitsBeforeCursor = beforeCursor.replace(/[^0-9.]/g, '').length;

    const formatted = formatNumberWithCommas(rawValue);
    setDepositInput(formatted);

    // Keep the cursor accurately placed relative to digits
    requestAnimationFrame(() => {
      if (!input) return;
      let count = 0;
      let newPos = formatted.length;
      for (let i = 0; i < formatted.length; i++) {
        if (/[0-9.]/.test(formatted[i])) {
          count++;
          if (count === digitsBeforeCursor) {
            newPos = i + 1;
            break;
          }
        }
      }
      input.setSelectionRange(newPos, newPos);
    });
  };

  // Quick preset: Equal Weight
  const handleApplyEqualWeight = () => {
    const presets = getTargetPresets(categories);
    if (presets.length > 0) {
      const nextInputs: Record<string, string> = {};
      Object.entries(presets[0].targets).forEach(([catId, val]) => {
        nextInputs[catId] = String(val);
      });
      setTargetInputs(nextInputs);
    }
  };

  // Quick preset: Normalize to 100%
  const handleNormalizeTargets = () => {
    if (targetSum <= 0) {
      handleApplyEqualWeight();
      return;
    }
    const nextInputs: Record<string, string> = {};
    let runningSum = 0;
    categories.forEach((cat, idx) => {
      const current = localTargets[cat.id] || 0;
      if (idx === categories.length - 1) {
        const share = Math.max(0, Math.round((100 - runningSum) * 10) / 10);
        nextInputs[cat.id] = String(share);
      } else {
        const share = Math.round(((current / targetSum) * 100) * 10) / 10;
        nextInputs[cat.id] = String(share);
        runningSum += share;
      }
    });
    setTargetInputs(nextInputs);
  };

  // Save targets to categories and persist to storage / cloud
  const handleSaveTargets = () => {
    const updated = categories.map((cat) => ({
      ...cat,
      targetPercent: localTargets[cat.id] ?? 0,
      updatedAt: new Date().toISOString(),
    }));
    onUpdateCategoryTargets(updated);
    setSaveSuccessMsg('Target allocations successfully saved and synced!');
    setTimeout(() => setSaveSuccessMsg(null), 3000);
  };

  const underweightItems = analysis.items.filter((it) => it.status === 'underweight');
  const overweightItems = analysis.items.filter((it) => it.status === 'overweight');
  const balancedItems = analysis.items.filter((it) => it.status === 'balanced');

  return (
    <div className="space-y-6 max-w-7xl mx-auto px-2 sm:px-4 pb-12">
      {/* 1. Header Overview & KPI Strip */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 sm:p-6 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-5">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <Scale className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
                Portfolio Rebalancing
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700">
                  {latestRecord ? `Latest: ${latestRecord.month}` : 'No Records Yet'}
                </span>
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Maintain optimal risk-adjusted asset allocation and deploy new capital without emotional bias.
              </p>
            </div>
          </div>

          {/* Quick Target Validation Status */}
          <div className="flex items-center gap-2">
            <div className={`px-3 py-1.5 rounded-xl border text-xs font-semibold flex items-center gap-1.5 ${
              isTargetSumValid 
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' 
                : 'bg-amber-500/10 border-amber-500/30 text-amber-400'
            }`}>
              {isTargetSumValid ? (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Targets Total: 100% (Valid)</span>
                </>
              ) : (
                <>
                  <AlertCircle className="w-3.5 h-3.5" />
                  <span>Targets Total: {targetSum.toFixed(1)}% (Needs 100%)</span>
                </>
              )}
            </div>

            <button
              onClick={handleSaveTargets}
              disabled={!isTargetSumValid}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl font-medium text-xs transition-all shadow-sm ${
                isTargetSumValid
                  ? 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold cursor-pointer'
                  : 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700'
              }`}
            >
              <Save className="w-3.5 h-3.5" />
              <span>Save Strategy</span>
            </button>
          </div>
        </div>

        {saveSuccessMsg && (
          <div className="mt-4 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{saveSuccessMsg}</span>
          </div>
        )}

        {/* KPI Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mt-5">
          <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3.5">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
              Total Portfolio Value
            </span>
            <div className="text-xl sm:text-2xl font-bold text-slate-100 font-mono mt-1 tabular-nums">
              {formatCurrency(analysis.totalCurrentValue, currencySymbol, stealthMode)}
            </div>
            <span className="text-[10px] text-slate-500 mt-1 block">Excluding Emergency Fund</span>
          </div>

          <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3.5">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
              Average Drift Score
            </span>
            <div className={`text-xl sm:text-2xl font-bold font-mono mt-1 tabular-nums ${
              analysis.overallDriftScore <= 2 ? 'text-emerald-400' : analysis.overallDriftScore <= 5 ? 'text-amber-400' : 'text-rose-400'
            }`}>
              {analysis.overallDriftScore.toFixed(1)}%
            </div>
            <span className="text-[10px] text-slate-500 mt-1 block">
              {analysis.overallDriftScore <= 2 ? '🟢 Portfolio well balanced' : analysis.overallDriftScore <= 5 ? '🟡 Moderate allocation drift' : '🔴 High allocation drift'}
            </span>
          </div>

          <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3.5">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
              Underweight Categories
            </span>
            <div className="text-xl sm:text-2xl font-bold text-amber-400 font-mono mt-1 tabular-nums">
              {underweightItems.length}
            </div>
            <span className="text-[10px] text-slate-500 mt-1 block">Priority for new capital additions</span>
          </div>

          <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3.5">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
              Balanced Categories
            </span>
            <div className="text-xl sm:text-2xl font-bold text-emerald-400 font-mono mt-1 tabular-nums">
              {balancedItems.length} / {categories.length}
            </div>
            <span className="text-[10px] text-slate-500 mt-1 block">Within ±5.0% target tolerance</span>
          </div>
        </div>
      </div>

      {/* 2. Interactive Rebalancing Planner Controls */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 sm:p-6 shadow-sm space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
          <div>
            <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
              <Sliders className="w-4 h-4 text-emerald-400" />
              Rebalance Execution Engine
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              {mode === 'cashflow'
                ? 'Specify new monthly deposit capital to calculate precise water-filling allocation orders.'
                : 'Classic rebalancing reallocates existing capital (sells overweight to buy underweight).'}
            </p>
          </div>

          {/* Strategy Mode Toggle */}
          <div className="flex items-center bg-slate-950 border border-slate-800 p-1 rounded-xl">
            <button
              onClick={() => setMode('cashflow')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                mode === 'cashflow'
                  ? 'bg-emerald-500 text-slate-950 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <span>⚡ Deposit Only (No Selling)</span>
            </button>
            <button
              onClick={() => setMode('full')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                mode === 'full'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <span>🔄 Classic Full Rebalance</span>
            </button>
          </div>
        </div>

        {/* Mode explanation card */}
        <div className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800/80 text-xs flex items-start gap-3">
          <Info className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <span className="font-semibold text-slate-200">
              {mode === 'cashflow' ? 'Cash-Flow Contribution Rebalancing (Recommended for DCA)' : 'Classic Rebalancing (Trim Overweight & Buy Underweight)'}
            </span>
            <p className="text-slate-400 leading-relaxed">
              {mode === 'cashflow' 
                ? 'Allocates your new monthly deposit exclusively to underweight categories using water-filling optimization. Zero assets are sold, completely avoiding taxable capital gains and transaction fees.'
                : 'Directly sells holdings in overweight categories and buys holdings in underweight categories so your entire portfolio immediately matches your target allocation exactly. No additional deposit capital is required.'}
            </p>
          </div>
        </div>

        {/* Deposit Capital Selector - Only shown in Deposit Only / Cashflow mode */}
        {mode === 'cashflow' && (
          <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center animate-in fade-in duration-150">
            <div className="md:col-span-5">
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                New Capital to Deploy / Deposit Amount
              </label>
              <div className="relative rounded-xl shadow-sm">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400 font-bold font-mono text-xs">
                  {currencySymbol}
                </div>
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  value={depositInput}
                  onChange={handleDepositChange}
                  placeholder="0"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-12 pr-4 py-2.5 text-slate-100 font-mono font-bold text-sm focus:outline-none focus:border-emerald-500 transition-colors tabular-nums"
                />
              </div>
            </div>

            {/* Quick Amount Buttons */}
            <div className="md:col-span-7 flex flex-wrap items-center gap-1.5 pt-1">
              {latestRecord && latestRecord.monthlyMoneyInvested > 0 && (
                <button
                  onClick={() => setDepositInput(formatNumberWithCommas(latestRecord.monthlyMoneyInvested))}
                  className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-emerald-400 text-xs font-medium transition-colors cursor-pointer"
                >
                  Use Latest Month's Invested ({formatCurrency(latestRecord.monthlyMoneyInvested, currencySymbol, stealthMode)})
                </button>
              )}
              <button
                onClick={() => setDepositInput(formatNumberWithCommas(parseFormattedNumber(depositInput) + 5000))}
                className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 text-xs font-medium transition-colors cursor-pointer"
              >
                +5,000
              </button>
              <button
                onClick={() => setDepositInput(formatNumberWithCommas(parseFormattedNumber(depositInput) + 10000))}
                className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 text-xs font-medium transition-colors cursor-pointer"
              >
                +10,000
              </button>
              <button
                onClick={() => setDepositInput(formatNumberWithCommas(parseFormattedNumber(depositInput) + 50000))}
                className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 text-xs font-medium transition-colors cursor-pointer"
              >
                +50,000
              </button>
              <button
                onClick={() => setDepositInput('0')}
                className="px-2 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-400 hover:text-slate-200 text-xs transition-colors cursor-pointer"
                title="Reset deposit to 0"
              >
                Clear
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 3. Rebalance Recommendations & Action Orders Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 sm:p-6 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-3">
          <div>
            <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-emerald-400" />
              Actionable Allocation Orders
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Follow these recommended dollar allocations to move your portfolio towards target.
            </p>
          </div>

          <div className="text-xs font-mono text-slate-400">
            Total Capital Injected: <span className="text-emerald-400 font-bold">{formatCurrency(analysis.depositAmount, currencySymbol, stealthMode)}</span>
          </div>
        </div>

        {/* Orders Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {analysis.items.map((item) => {
            const isBuy = item.actionAmount > 0;
            const isSell = item.actionAmount < 0;
            const isHold = item.actionAmount === 0;

            return (
              <div 
                key={item.categoryId}
                className={`border rounded-xl p-4 transition-all relative overflow-hidden ${
                  isBuy 
                    ? 'bg-emerald-950/20 border-emerald-500/30' 
                    : isSell 
                    ? 'bg-rose-950/20 border-rose-500/30' 
                    : 'bg-slate-950/50 border-slate-800/80'
                }`}
              >
                {/* Category header */}
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center space-x-2">
                    <span 
                      className="w-3 h-3 rounded-full shrink-0" 
                      style={{ backgroundColor: item.categoryColor }}
                    />
                    <span className="font-bold text-slate-200 text-sm">{item.categoryName}</span>
                  </div>
                  <span className="text-[11px] font-mono text-slate-400">
                    Target: <strong className="text-slate-200">{item.targetPercent}%</strong>
                  </span>
                </div>

                {/* Current vs Target */}
                <div className="flex items-center justify-between text-xs text-slate-400 mb-3 font-mono">
                  <span>Actual: {item.actualPercent.toFixed(1)}%</span>
                  <span className={item.driftPercent < -1.5 ? 'text-amber-400 font-semibold' : item.driftPercent > 1.5 ? 'text-rose-400 font-semibold' : 'text-emerald-400 font-semibold'}>
                    Drift: {item.driftPercent > 0 ? `+${item.driftPercent.toFixed(1)}%` : `${item.driftPercent.toFixed(1)}%`}
                  </span>
                </div>

                {/* Primary Action Value */}
                <div className="border-t border-slate-800/80 pt-2.5 flex items-center justify-between">
                  <span className="text-xs font-medium text-slate-400 flex items-center gap-1">
                    {isBuy && <ArrowUpRight className="w-4 h-4 text-emerald-400" />}
                    {isSell && <ArrowDownRight className="w-4 h-4 text-rose-400" />}
                    {isHold && <span className="w-2 h-2 rounded-full bg-slate-600 inline-block mr-1"></span>}
                    {isBuy ? 'Deposit / Buy:' : isSell ? 'Trim / Sell:' : 'Hold / No Change:'}
                  </span>
                  <span className={`text-base font-bold font-mono tabular-nums ${
                    isBuy ? 'text-emerald-400' : isSell ? 'text-rose-400' : 'text-slate-400'
                  }`}>
                    {isBuy ? `+${formatCurrency(item.actionAmount, currencySymbol, stealthMode)}` : isSell ? formatCurrency(item.actionAmount, currencySymbol, stealthMode) : formatCurrency(0, currencySymbol, stealthMode)}
                  </span>
                </div>

                {/* Projected resulting weight */}
                <div className="text-[11px] text-slate-400 mt-2 flex items-center justify-between border-t border-slate-800/40 pt-1.5 font-mono">
                  <span>Projected Weight:</span>
                  <span className="text-slate-200 font-semibold">
                    {item.actualPercent.toFixed(1)}% → <span className="text-emerald-400">{item.projectedPercent.toFixed(1)}%</span>
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 4. Target vs. Actual Detailed Allocation Grid & Target Editor */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 sm:p-6 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
          <div>
            <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
              <Scale className="w-4 h-4 text-emerald-400" />
              Target vs. Actual Breakdown & Strategy Editor
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Fine-tune your desired target percentages. Targets must total 100%.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleApplyEqualWeight}
              className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 text-xs font-medium transition-colors"
              title="Equally distribute 100% across all categories"
            >
              Equal Weight
            </button>
            <button
              onClick={handleNormalizeTargets}
              className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 text-xs font-medium transition-colors"
              title="Scale current target numbers so they sum to exactly 100%"
            >
              Normalize to 100%
            </button>
          </div>
        </div>

        {/* Dense Financial Table */}
        <div className="overflow-x-auto -mx-2 sm:mx-0">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-950/80 text-slate-400 text-[11px] font-semibold uppercase tracking-wider border-b border-slate-800">
              <tr>
                <th className="py-3 px-3">Category</th>
                <th className="py-3 px-3 text-right">Current Value</th>
                <th className="py-3 px-3 text-right">Actual %</th>
                <th className="py-3 px-3 text-center w-36">Visual Alignment</th>
                <th className="py-3 px-3 text-right w-28">Target %</th>
                <th className="py-3 px-3 text-right">Target Value</th>
                <th className="py-3 px-3 text-right">Drift</th>
                <th className="py-3 px-3 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono">
              {analysis.items.map((item) => {
                const targetVal = localTargets[item.categoryId] ?? 0;

                return (
                  <tr key={item.categoryId} className="hover:bg-slate-800/30 transition-colors">
                    {/* Category name */}
                    <td className="py-3 px-3 font-sans">
                      <div className="flex items-center space-x-2">
                        <span 
                          className="w-3 h-3 rounded-full shrink-0" 
                          style={{ backgroundColor: item.categoryColor }}
                        />
                        <span className="font-semibold text-slate-200">{item.categoryName}</span>
                        <span className="text-[10px] text-slate-500 font-mono">({item.riskLevel})</span>
                      </div>
                    </td>

                    {/* Current Value */}
                    <td className="py-3 px-3 text-right tabular-nums text-slate-200 font-semibold">
                      {formatCurrency(item.currentValue, currencySymbol, stealthMode)}
                    </td>

                    {/* Actual % */}
                    <td className="py-3 px-3 text-right tabular-nums text-slate-200">
                      {item.actualPercent.toFixed(1)}%
                    </td>

                    {/* Visual Comparison Gauge: Target marker on Actual bar */}
                    <td className="py-3 px-3 text-center align-middle">
                      <div className="w-full bg-slate-950 rounded-full h-2.5 relative border border-slate-800 overflow-hidden">
                        {/* Actual progress bar */}
                        <div 
                          className="h-full rounded-full transition-all duration-300" 
                          style={{ 
                            width: `${Math.min(100, item.actualPercent)}%`,
                            backgroundColor: item.categoryColor 
                          }}
                        />
                        {/* Target line marker */}
                        <div 
                          className="absolute top-0 bottom-0 w-1 bg-white shadow-sm z-10"
                          style={{ left: `${Math.min(100, Math.max(0, targetVal))}%` }}
                          title={`Target: ${targetVal}%`}
                        />
                      </div>
                    </td>

                    {/* Target % Input */}
                    <td className="py-3 px-3 text-right">
                      <div className="relative rounded-lg shadow-sm w-20 ml-auto flex items-center">
                        <input
                          type="number"
                          min="0"
                          max="100"
                          step="1"
                          placeholder="0"
                          value={targetInputs[item.categoryId] ?? ''}
                          onChange={(e) => handleTargetChange(item.categoryId, e.target.value)}
                          onBlur={() => handleTargetBlur(item.categoryId)}
                          className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-2 pr-6 py-1.5 text-right text-xs text-slate-100 font-mono font-bold focus:outline-none focus:border-emerald-500 transition-colors tabular-nums placeholder:text-slate-600"
                        />
                        <div className="absolute inset-y-0 right-0 pr-2 flex items-center pointer-events-none text-slate-400 font-mono font-semibold text-xs">
                          %
                        </div>
                      </div>
                    </td>

                    {/* Target Value */}
                    <td className="py-3 px-3 text-right tabular-nums text-slate-400">
                      {formatCurrency(item.targetValue, currencySymbol, stealthMode)}
                    </td>

                    {/* Drift */}
                    <td className={`py-3 px-3 text-right tabular-nums font-bold ${
                      item.driftPercent < -1.5 ? 'text-amber-400' : item.driftPercent > 1.5 ? 'text-rose-400' : 'text-emerald-400'
                    }`}>
                      {item.driftPercent > 0 ? `+${item.driftPercent.toFixed(1)}%` : `${item.driftPercent.toFixed(1)}%`}
                    </td>

                    {/* Status Badge */}
                    <td className="py-3 px-3 text-center font-sans">
                      <span className={`inline-block text-[11px] font-semibold px-2 py-0.5 rounded-md ${
                        item.status === 'underweight'
                          ? 'bg-amber-500/10 text-amber-300 border border-amber-500/20'
                          : item.status === 'overweight'
                          ? 'bg-rose-500/10 text-rose-300 border border-rose-500/20'
                          : 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/20'
                      }`}>
                        {item.status === 'underweight' ? 'Underweight' : item.status === 'overweight' ? 'Overweight' : 'On Target'}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            {/* Table Footer with Summary */}
            <tfoot className="border-t border-slate-700 bg-slate-950/60 font-mono text-xs font-semibold">
              <tr>
                <td className="py-3 px-3 text-slate-300 font-sans">Total Portfolio</td>
                <td className="py-3 px-3 text-right text-emerald-400 tabular-nums">
                  {formatCurrency(analysis.totalCurrentValue, currencySymbol, stealthMode)}
                </td>
                <td className="py-3 px-3 text-right text-slate-300 tabular-nums">
                  {analysis.totalCurrentValue > 0 ? '100.0%' : '0.0%'}
                </td>
                <td className="py-3 px-3 text-center text-slate-500 text-[10px] font-sans">—</td>
                <td className={`py-3 px-3 text-right tabular-nums ${isTargetSumValid ? 'text-emerald-400 font-bold' : 'text-amber-400 font-bold'}`}>
                  {targetSum.toFixed(1)}%
                </td>
                <td className="py-3 px-3 text-right text-slate-400 tabular-nums">
                  {formatCurrency(analysis.totalCurrentValue, currencySymbol, stealthMode)}
                </td>
                <td className="py-3 px-3 text-right text-slate-400 tabular-nums">
                  Avg: {analysis.overallDriftScore.toFixed(1)}%
                </td>
                <td className="py-3 px-3 text-center">
                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${isTargetSumValid ? 'text-emerald-400' : 'text-amber-400'}`}>
                    {isTargetSumValid ? '100% Balanced' : 'Check Sum'}
                  </span>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* 5. Simulated Portfolio Transformation Visualizer */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 sm:p-6 shadow-sm space-y-4">
        <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-emerald-400" />
          Simulated Portfolio Transformation
        </h3>
        <p className="text-xs text-slate-400">
          Side-by-side comparison of current allocation vs projected allocation after applying the recommended actions:
        </p>

        <div className="space-y-4 pt-2">
          {/* Current Bar */}
          <div>
            <div className="flex items-center justify-between text-xs text-slate-400 mb-1.5">
              <span className="font-semibold text-slate-300">Current Distribution</span>
              <span className="font-mono">{formatCurrency(analysis.totalCurrentValue, currencySymbol, stealthMode)}</span>
            </div>
            <div className="h-6 w-full bg-slate-950 rounded-lg flex overflow-hidden border border-slate-800">
              {analysis.items.map((item) => {
                if (item.actualPercent <= 0) return null;
                return (
                  <div
                    key={`curr-${item.categoryId}`}
                    className="h-full transition-all duration-300 relative group flex items-center justify-center text-[10px] font-mono text-white font-bold"
                    style={{ 
                      width: `${item.actualPercent}%`,
                      backgroundColor: item.categoryColor 
                    }}
                    title={`${item.categoryName}: ${item.actualPercent.toFixed(1)}%`}
                  >
                    {item.actualPercent >= 8 && `${item.actualPercent.toFixed(0)}%`}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Projected Bar */}
          <div>
            <div className="flex items-center justify-between text-xs text-slate-400 mb-1.5">
              <span className="font-semibold text-emerald-400">
                Projected Distribution (After {mode === 'cashflow' ? 'Deposit' : 'Rebalance'})
              </span>
              <span className="font-mono text-emerald-400 font-bold">
                {formatCurrency(analysis.totalNewPortfolioValue, currencySymbol, stealthMode)}
              </span>
            </div>
            <div className="h-6 w-full bg-slate-950 rounded-lg flex overflow-hidden border border-emerald-500/30">
              {analysis.items.map((item) => {
                if (item.projectedPercent <= 0) return null;
                return (
                  <div
                    key={`proj-${item.categoryId}`}
                    className="h-full transition-all duration-300 relative group flex items-center justify-center text-[10px] font-mono text-white font-bold"
                    style={{ 
                      width: `${item.projectedPercent}%`,
                      backgroundColor: item.categoryColor 
                    }}
                    title={`${item.categoryName}: ${item.projectedPercent.toFixed(1)}%`}
                  >
                    {item.projectedPercent >= 8 && `${item.projectedPercent.toFixed(0)}%`}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Legend */}
          <div className="flex flex-wrap items-center gap-3 pt-2 text-xs">
            {analysis.items.map((item) => (
              <div key={`legend-${item.categoryId}`} className="flex items-center space-x-1.5 text-slate-400">
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: item.categoryColor }} />
                <span>{item.categoryName}</span>
                <span className="font-mono text-slate-500 text-[11px]">(Target: {item.targetPercent}%)</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
