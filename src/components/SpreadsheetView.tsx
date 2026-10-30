import React, { useState, useMemo } from 'react';
import { 
  ArrowUp,
  ArrowDown,
  FileSpreadsheet, 
  TrendingUp, 
  TrendingDown, 
  Calendar, 
  Sparkles,
  Tag,
  StickyNote,
  Edit2,
  Plus,
  X,
  Save,
  MessageSquareQuote
} from 'lucide-react';
import { Category, Asset, MonthlyRecord } from '../types';
import {
  formatCurrency,
  formatPercent,
  formatMonthName,
  formatNumberWithCommas,
  parseFormattedNumber,
  isLiveMonth,
  SUPPORTED_PRICE_CURRENCIES,
  getAssetPriceCurrency,
  getCurrencySymbolForCode,
  convertPriceFromNTD,
  convertPriceToNTD,
  formatAssetUnitPrice,
  resolveCurrencyCodeFromSymbolOrCode,
} from '../lib/formatters';
import { downloadExcelFile } from '../lib/excelExportImport';
import { isEmergencyFundAsset, getAssetBasePrice } from '../lib/ledgerEngine';
import { CustomDropdown } from './CustomDropdown';

interface SpreadsheetViewProps {
  records: MonthlyRecord[];
  categories: Category[];
  assets: Asset[];
  activeAssetIds: string[];
  currencySymbol: string;
  stealthMode: boolean;
  onOpenMonthEditor?: (recordToEdit?: MonthlyRecord) => void;
  onDeleteRecord?: (id: string) => void;
  onDuplicateRecord?: (record: MonthlyRecord) => void;
  onUpdateMonthPrice?: (month: string, assetId: string, price: number) => void;
  onUpdateMonthNote?: (month: string, monthNote: string, assetNotes?: Record<string, string>) => void;
  onEditAsset?: (id: string, updated: Partial<Asset>) => void;
}

export const SpreadsheetView: React.FC<SpreadsheetViewProps> = ({
  records,
  categories,
  assets,
  activeAssetIds,
  currencySymbol,
  stealthMode,
  onUpdateMonthPrice,
  onUpdateMonthNote,
  onEditAsset,
}) => {
  const [sortAsc, setSortAsc] = useState<boolean>(false); // default: latest month first (Descending)
  const [selectedYear, setSelectedYear] = useState<string>('ALL');

  // Month Price Editor Dialog State
  const [editingPriceMonth, setEditingPriceMonth] = useState<string | null>(null);
  const [priceFormInputs, setPriceFormInputs] = useState<Record<string, string>>({});

  // Month Decision Notes & Asset Reminders Editor State
  const [editingNoteMonth, setEditingNoteMonth] = useState<string | null>(null);
  const [editingMonthNoteText, setEditingMonthNoteText] = useState<string>('');
  const [editingAssetNotes, setEditingAssetNotes] = useState<Record<string, string>>({});
  const [expandedAssetNotes, setExpandedAssetNotes] = useState<boolean>(false);

  const nonEfAssets = useMemo(() => {
    return assets.filter((a) => !isEmergencyFundAsset(a));
  }, [assets]);

  const activeAssets = useMemo(() => {
    return nonEfAssets.filter((a) => activeAssetIds.includes(a.id));
  }, [nonEfAssets, activeAssetIds]);

  const isAllSelected = activeAssets.length === nonEfAssets.length;

  // Precompute cumulative & monthly invested capital per month for active (filtered) assets
  const investedByMonthMap = useMemo(() => {
    const chrono = [...records].sort((a, b) => a.month.localeCompare(b.month));
    const map = new Map<string, { monthlyInvested: number; totalInvested: number }>();
    let runningFiltered = 0;

    chrono.forEach((r) => {
      if (isAllSelected) {
        map.set(r.month, {
          monthlyInvested: r.monthlyMoneyInvested || 0,
          totalInvested: r.totalMoneyInvested || 0,
        });
      } else {
        const rawInv = r.assetInvestedValues || {};
        let monthDelta = 0;
        activeAssets.forEach((a) => {
          monthDelta += Number(rawInv[a.id]) || 0;
        });
        runningFiltered += monthDelta;
        map.set(r.month, {
          monthlyInvested: Math.round(monthDelta * 100) / 100,
          totalInvested: Math.max(0, Math.round(runningFiltered * 100) / 100),
        });
      }
    });

    return map;
  }, [records, activeAssets, isAllSelected]);

  const categoryMap = useMemo(() => {
    const map = new Map<string, Category>();
    categories.forEach((c) => map.set(c.id, c));
    return map;
  }, [categories]);

  // Extract all unique years present in the records dataset
  const availableYears = useMemo(() => {
    const set = new Set<string>();
    records.forEach((r) => {
      if (r.month && r.month.includes('-')) {
        const year = r.month.split('-')[0];
        set.add(year);
      }
    });
    return Array.from(set).sort((a, b) => b.localeCompare(a));
  }, [records]);

  const yearOptions = useMemo(() => {
    return [
      { value: 'ALL', label: 'All Years' },
      ...availableYears.map((yr) => ({ value: yr, label: yr })),
    ];
  }, [availableYears]);

  const filteredRecords = useMemo(() => {
    if (selectedYear === 'ALL') return records;
    return records.filter((r) => r.month.startsWith(selectedYear));
  }, [records, selectedYear]);

  const sortedRecords = useMemo(() => {
    return [...filteredRecords].sort((a, b) => {
      return sortAsc ? a.month.localeCompare(b.month) : b.month.localeCompare(a.month);
    });
  }, [filteredRecords, sortAsc]);

  // Open Month Price Editor
  const handleOpenPriceEditor = (rec: MonthlyRecord) => {
    setEditingPriceMonth(rec.month);
    const initialInputs: Record<string, string> = {};
    activeAssets.forEach((ast) => {
      const curr = (ast.currency || 'NTD').toUpperCase();
      const isBaseCash = ast.isCash && (curr === 'NTD' || curr === 'TWD');
      if (isBaseCash) {
        initialInputs[ast.id] = '1';
      } else {
        const pNtd = getAssetBasePrice(ast, rec.assetPrices);
        const displayCurr = getAssetPriceCurrency(ast);
        const converted = Math.round(convertPriceFromNTD(pNtd, displayCurr) * 10000) / 10000;
        initialInputs[ast.id] = formatNumberWithCommas(converted);
      }
    });
    setPriceFormInputs(initialInputs);
  };

  const handleSavePrices = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPriceMonth || !onUpdateMonthPrice) {
      setEditingPriceMonth(null);
      return;
    }

    Object.entries(priceFormInputs).forEach(([astId, valStr]) => {
      const parsed = parseFormattedNumber(valStr as string);
      const ast = activeAssets.find((a) => a.id === astId);
      const displayCurr = getAssetPriceCurrency(ast);
      const priceInNTD = convertPriceToNTD(parsed > 0 ? parsed : 1, displayCurr);
      onUpdateMonthPrice(editingPriceMonth, astId, Math.round(priceInNTD * 10000) / 10000);
    });

    setEditingPriceMonth(null);
  };

  // Open Month Decision Notes Editor
  const handleOpenNoteEditor = (rec: MonthlyRecord, assetIdToHighlight?: string) => {
    setEditingNoteMonth(rec.month);
    const isAutoPlaceholder = 
      rec.description?.startsWith('Snapshot for ') || 
      rec.description?.startsWith('Upcoming Live Real-Time');
    setEditingMonthNoteText(isAutoPlaceholder ? '' : (rec.description || ''));
    setEditingAssetNotes({ ...(rec.assetNotes || {}) });
    setExpandedAssetNotes(Boolean(assetIdToHighlight || (rec.assetNotes && Object.keys(rec.assetNotes).length > 0)));
  };

  const handleSaveNotes = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingNoteMonth || !onUpdateMonthNote) {
      setEditingNoteMonth(null);
      return;
    }

    const cleanedAssetNotes: Record<string, string> = {};
    Object.entries(editingAssetNotes).forEach(([aId, txt]) => {
      if (typeof txt === 'string' && txt.trim()) {
        cleanedAssetNotes[aId] = txt.trim();
      }
    });

    onUpdateMonthNote(editingNoteMonth, editingMonthNoteText.trim(), cleanedAssetNotes);
    setEditingNoteMonth(null);
  };

  return (
    <div className="fintech-card rounded-xl shadow-md overflow-hidden mb-8">
      
      {/* Header & Control Bar */}
      <div className="p-4 sm:p-5 border-b border-slate-800/80 flex flex-col sm:flex-row items-center justify-between gap-3 bg-[#080C14]/60">
        <div>
          <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-emerald-400" />
            <span>Monthly Asset &amp; Quantity Spreadsheet</span>
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            1st of month valuation = <strong>Original Quantity &times; 1st-of-Month Price</strong>. Click <span className="text-amber-400 font-medium">Note</span> to document decisions and reminders for each monthly asset.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto justify-end">
          {/* Year Filter Dropdown Selector */}
          <div className="flex items-center gap-1.5 text-xs">
            <span className="font-medium text-slate-400">Year:</span>
            <CustomDropdown
              value={selectedYear}
              onChange={setSelectedYear}
              options={yearOptions}
              icon={<Calendar className="w-3.5 h-3.5 text-emerald-400 shrink-0" />}
              className="w-32 text-xs py-2 px-3 bg-[#080C14] border-slate-800"
            />
          </div>

          <button
            type="button"
            onClick={() => setSortAsc(!sortAsc)}
            className="flex items-center gap-1.5 text-xs text-slate-300 bg-[#080C14] hover:bg-slate-800/80 px-3 py-2 rounded-lg border border-slate-800 hover:border-slate-700 transition-all font-medium cursor-pointer"
            title={sortAsc ? 'Sort Order: Ascending (Oldest to Newest). Click to switch to Descending.' : 'Sort Order: Descending (Newest to Oldest). Click to switch to Ascending.'}
          >
            {sortAsc ? (
              <ArrowUp className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            ) : (
              <ArrowDown className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            )}
            <span>{sortAsc ? 'Ascending' : 'Descending'}</span>
          </button>

          {/* Generate Read-Only Excel Spreadsheet */}
          <button
            onClick={() => downloadExcelFile(categories, assets, records, { currencySymbol, stealthMode, defaultChartType: 'all', defaultGroupMode: 'category' })}
            className="flex items-center gap-1.5 text-xs font-semibold text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 px-3 py-2 rounded-lg border border-emerald-500/30 transition-all cursor-pointer"
            title="Generate Excel spreadsheet (.xlsx)"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
            <span>Excel</span>
          </button>
        </div>
      </div>

      {/* Responsive Spreadsheet Table with Pinned Header & Pinned Left Columns */}
      <div className="overflow-auto max-h-[72vh] relative custom-scrollbar">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="bg-[#080C14] text-slate-400 font-semibold border-b border-slate-800/80 uppercase tracking-wider text-[11px]">
              {/* 1. Pinned Action Column on Far Left */}
              <th className="p-3 sticky top-0 left-0 bg-[#080C14] z-30 border-r border-b border-slate-800 text-center w-36 min-w-36 max-w-36">
                Actions
              </th>

              {/* 2. Pinned Month Column */}
              <th className="p-3.5 sticky top-0 left-36 bg-[#080C14] z-30 border-r border-b border-slate-800 w-36 min-w-36 max-w-36">
                Month
              </th>

              {/* 3. Pinned Total Capital Column (Pinned together with Actions & Month) */}
              <th className="p-3.5 sticky top-0 left-72 bg-[#091224] z-30 border-r-2 border-b border-slate-700/90 text-blue-400 font-bold w-36 min-w-36 max-w-36 shadow-[2px_0_8px_rgba(0,0,0,0.45)]">
                Total Capital
              </th>

              {/* 4. Summary Columns on the Left */}
              <th className="p-3.5 sticky top-0 bg-[#071917] z-20 border-r border-b border-slate-800 text-emerald-400 font-bold min-w-36">
                Total Assets
              </th>
              <th className="p-3.5 sticky top-0 bg-[#181209] z-20 border-r border-b border-slate-800 text-amber-400 font-bold min-w-36">
                Emergency Fund
              </th>
              <th className="p-3.5 sticky top-0 bg-[#080C14] z-20 border-r border-b border-slate-800 min-w-36">
                Monthly Deposit / Yield
              </th>
              <th className="p-3.5 sticky top-0 bg-[#080C14] z-20 border-r border-b border-slate-800 min-w-32">
                Total Invested
              </th>
              <th className="p-3.5 sticky top-0 bg-[#080C14] z-20 border-r border-b border-slate-800 min-w-36">
                Floating P / L ($ &amp; %)
              </th>

              {/* 5. Dynamic Asset Columns */}
              {activeAssets.map((ast) => {
                const cat = categoryMap.get(ast.categoryId);
                return (
                  <th
                    key={ast.id}
                    className="p-3.5 sticky top-0 bg-[#080C14] z-20 border-r border-b border-slate-800 min-w-40 font-medium"
                  >
                    <div className="flex items-center gap-1.5 text-slate-200">
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: cat?.color || '#10b981' }}
                      />
                      <span className="truncate font-bold">{ast.name}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-[10px] text-slate-500 font-normal mt-0.5">
                      <span>{cat ? cat.name : 'Asset'}</span>
                      {ast.isCash && (
                        <span className="text-[9px] font-mono px-1 bg-emerald-500/20 text-emerald-400 rounded">
                          Cash
                        </span>
                      )}
                      {ast.tickerSymbol && (
                        <span className="font-mono text-slate-400">({ast.tickerSymbol})</span>
                      )}
                    </div>
                  </th>
                );
              })}

              {/* 6. Investment Decision / Notes */}
              <th className="p-3.5 sticky top-0 bg-[#080C14] z-20 border-b border-slate-800 min-w-56 max-w-xs">
                Investment Decision / Notes
              </th>
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-800/60 font-mono text-slate-200">
            {sortedRecords.length === 0 ? (
              <tr>
                <td
                  colSpan={activeAssets.length + 9}
                  className="p-12 text-center text-slate-500 font-sans"
                >
                  No records found. Record your deposits, conversions, or dividends in the <strong>Ledger</strong> tab!
                </td>
              </tr>
            ) : (
              sortedRecords.map((rec) => {
                const isLive = !!rec.isLivePending;

                let rowTotalAsset = 0;
                activeAssets.forEach((ast) => {
                  rowTotalAsset += rec.assetValues?.[ast.id] || 0;
                });

                const rowEmergencyFund = rec.emergencyFund || 0;
                const rowTotalCapital = rowTotalAsset + rowEmergencyFund;
                const invMetrics = investedByMonthMap.get(rec.month);
                const rowInvested = invMetrics ? invMetrics.totalInvested : (rec.totalMoneyInvested || 0);
                const rowMonthlyInvested = invMetrics ? invMetrics.monthlyInvested : (rec.monthlyMoneyInvested || 0);
                const rowMonthlyDiv = rec.monthlyDividendIncome || 0;
                const rowTotalDiv = rec.totalDividendIncome || 0;
                const floatingPL = rowTotalAsset - rowInvested;
                const floatingPLPercent = rowInvested > 0 ? (floatingPL / rowInvested) * 100 : 0;
                const isPositive = floatingPL >= 0;

                const hasCustomMonthNote = Boolean(
                  rec.description && 
                  !rec.description.startsWith('Snapshot for ') && 
                  !rec.description.startsWith('Upcoming Live Real-Time')
                );
                const assetNotesCount = rec.assetNotes ? Object.keys(rec.assetNotes).length : 0;
                const hasAnyNotes = hasCustomMonthNote || assetNotesCount > 0;

                return (
                  <tr
                    key={rec.id}
                    className={`transition-colors group ${
                      isLive 
                        ? 'bg-emerald-950/15 hover:bg-emerald-950/25' 
                        : 'hover:bg-slate-800/30'
                    }`}
                  >
                    {/* 1. Pinned Action Buttons Cell */}
                    <td className="p-2.5 sticky left-0 z-10 border-r border-slate-800 text-center w-36 min-w-36 max-w-36 bg-[#080C14] group-hover:bg-[#0D131F]">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          onClick={() => handleOpenPriceEditor(rec)}
                          className="px-2 py-1 rounded bg-[#0D131F] hover:bg-slate-800 text-slate-300 hover:text-emerald-400 text-[11px] font-sans font-medium flex items-center gap-1 border border-slate-800 transition-colors cursor-pointer"
                          title={isLive ? "Adjust live prices" : "Edit 1st of month prices"}
                        >
                          <Tag className="w-3 h-3 text-emerald-400" />
                          <span>Prices</span>
                        </button>
                        <button
                          onClick={() => handleOpenNoteEditor(rec)}
                          className={`px-2 py-1 rounded text-[11px] font-sans font-medium flex items-center gap-1 border transition-colors cursor-pointer ${
                            hasAnyNotes
                              ? 'bg-amber-500/15 border-amber-500/30 text-amber-300 hover:bg-amber-500/25'
                              : 'bg-[#0D131F] border-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                          }`}
                          title={hasAnyNotes ? "Edit monthly decision notes & reminders" : "Add reminder note on this month's decisions"}
                        >
                          <StickyNote className="w-3 h-3 text-amber-400" />
                          <span>Note{hasAnyNotes ? ` (${assetNotesCount + (hasCustomMonthNote ? 1 : 0)})` : ''}</span>
                        </button>
                      </div>
                    </td>

                    {/* 2. Pinned Month Cell */}
                    <td className="p-3.5 font-bold font-sans text-slate-100 sticky left-36 z-10 border-r border-slate-800 w-36 min-w-36 max-w-36 bg-[#080C14] group-hover:bg-[#0D131F]">
                      {isLive || isLiveMonth(rec.month) ? (
                        <>
                          <div className="flex items-center gap-2">
                            <span className="relative flex h-2 w-2 shrink-0">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                            </span>
                            <span className="text-emerald-400 font-bold tracking-wide">Live</span>
                          </div>
                          <div className="text-[10px] text-emerald-400/70 font-mono font-normal mt-0.5">
                            Real-Time Market
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="flex items-center gap-1.5">
                            <span>{formatMonthName(rec.month)}</span>
                          </div>
                          <div className="text-[10px] text-slate-500 font-mono font-normal">
                            {rec.month} (1st)
                          </div>
                        </>
                      )}
                    </td>

                    {/* 3. Pinned Total Capital Cell (Total Assets + Emergency Fund) */}
                    <td className="p-3.5 sticky left-72 z-10 border-r-2 border-slate-700/90 bg-[#091224] group-hover:bg-[#0E1930] font-bold text-blue-400 w-36 min-w-36 max-w-36 shadow-[2px_0_8px_rgba(0,0,0,0.45)]">
                      {formatCurrency(rowTotalCapital, currencySymbol, stealthMode)}
                    </td>

                    {/* 4. Total Assets */}
                    <td className="p-3.5 border-r border-slate-800/60 bg-emerald-950/10 font-bold text-emerald-400">
                      {formatCurrency(rowTotalAsset, currencySymbol, stealthMode)}
                    </td>

                    {/* 5. Emergency Fund (Safety Net) */}
                    <td className="p-3.5 border-r border-slate-800/60 bg-amber-950/10 font-bold text-amber-400">
                      {formatCurrency(rowEmergencyFund, currencySymbol, stealthMode)}
                    </td>

                    {/* 6. Monthly Money Invested + Monthly Dividend/Yield */}
                    <td className="p-3.5 border-r border-slate-800/60 text-slate-300 space-y-1">
                      <div>
                        {rowMonthlyInvested !== 0
                          ? `${rowMonthlyInvested > 0 ? '+' : ''}${formatCurrency(rowMonthlyInvested, currencySymbol, stealthMode)}`
                          : rowMonthlyDiv === 0
                          ? '—'
                          : null}
                      </div>
                      {rowMonthlyDiv > 0 && (
                        <div className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-violet-500/15 text-violet-300 border border-violet-500/30">
                          <Sparkles className="w-2.5 h-2.5 text-violet-400" />
                          <span>+{formatCurrency(rowMonthlyDiv, currencySymbol, stealthMode)} Yield</span>
                        </div>
                      )}
                    </td>

                    {/* 7. Total Invested */}
                    <td className="p-3.5 border-r border-slate-800/60 text-blue-300 font-semibold">
                      {formatCurrency(rowInvested, currencySymbol, stealthMode)}
                    </td>

                    {/* 8. Floating Profit / Loss */}
                    <td className={`p-3.5 border-r border-slate-800/60 font-bold ${
                      isPositive ? 'text-emerald-400' : 'text-rose-400'
                    }`}>
                      <div className="flex items-center gap-1">
                        {isPositive ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
                        <span>{formatCurrency(floatingPL, currencySymbol, stealthMode)}</span>
                      </div>
                      <div className="text-[10px] font-medium opacity-80 mt-0.5">
                        ({formatPercent(floatingPLPercent, stealthMode)})
                      </div>
                      {rowTotalDiv > 0 && (
                        <div className="text-[9px] font-sans font-semibold text-violet-300 mt-0.5">
                          Incl. {formatCurrency(rowTotalDiv, currencySymbol, stealthMode)} yield
                        </div>
                      )}
                    </td>

                    {/* 9. Asset Value Cells (Shows Valuation + Original Quantity + 1st-of-month Price + Note pill if present) */}
                    {activeAssets.map((ast) => {
                      const val = rec.assetValues?.[ast.id] || 0;
                      const qty = rec.assetQuantities?.[ast.id] ?? 0;
                      const price = getAssetBasePrice(ast, rec.assetPrices);
                      const curr = (ast.currency || 'NTD').toUpperCase();
                      const isBaseCash = ast.isCash && (curr === 'NTD' || curr === 'TWD');
                      const assetNote = rec.assetNotes?.[ast.id];

                      return (
                        <td
                          key={ast.id}
                          className="p-3.5 border-r border-slate-800/60 text-slate-300 min-w-40"
                        >
                          {/* Valuation = Qty * Price */}
                          <div className="text-slate-100 font-bold text-xs">
                            {formatCurrency(val, currencySymbol, stealthMode)}
                          </div>

                          {/* Original Quantity and 1st of month Price breakdown */}
                          <div className="text-[10px] font-mono text-slate-400 mt-1 space-y-0.5">
                            <div className="flex items-center justify-between">
                              <span className="text-slate-500">Qty:</span>
                              <span className="text-slate-200 font-semibold">
                                {stealthMode ? '••••' : formatNumberWithCommas(qty)}
                              </span>
                            </div>
                            {!isBaseCash && (
                              <div className="flex items-center justify-between text-[9px]">
                                <span className="text-slate-500">{ast.isCash ? 'FX Rate:' : 'Price:'}</span>
                                <span className="text-emerald-400 font-medium">
                                  @{formatAssetUnitPrice(price, ast, stealthMode)}
                                </span>
                              </div>
                            )}
                          </div>

                          {/* Asset Decision Note Indicator Pill */}
                          {assetNote && (
                            <div
                              onClick={(e) => {
                                e.stopPropagation();
                                handleOpenNoteEditor(rec, ast.id);
                              }}
                              className="mt-1.5 p-1 rounded bg-amber-500/10 border border-amber-500/25 text-[10px] text-amber-300 font-sans cursor-pointer hover:bg-amber-500/20 transition-all flex items-start gap-1"
                              title={`Asset Decision Note: ${assetNote} (Click to edit)`}
                            >
                              <StickyNote className="w-2.5 h-2.5 text-amber-400 shrink-0 mt-0.5" />
                              <span className="line-clamp-1 truncate">{assetNote}</span>
                            </div>
                          )}
                        </td>
                      );
                    })}

                    {/* 10. Investment Decision / Notes Column */}
                    <td className="p-3.5 text-slate-300 font-sans min-w-56 max-w-xs">
                      {isLive ? (
                        <div className="space-y-1">
                          <span className="text-emerald-400 font-semibold flex items-center gap-1 text-[11px]">
                            <Sparkles className="w-3 h-3" /> Real-time live valuation
                          </span>
                          {hasCustomMonthNote && (
                            <div 
                              onClick={() => handleOpenNoteEditor(rec)}
                              className="text-[11px] text-slate-200 cursor-pointer hover:text-white group flex items-start gap-1 p-1 -m-1 rounded hover:bg-slate-800/40"
                              title="Click to edit decision notes"
                            >
                              <span className="line-clamp-2 leading-relaxed">{rec.description}</span>
                              <Edit2 className="w-3 h-3 text-slate-500 group-hover:text-amber-400 shrink-0 mt-0.5" />
                            </div>
                          )}
                        </div>
                      ) : hasCustomMonthNote ? (
                        <div
                          onClick={() => handleOpenNoteEditor(rec)}
                          className="cursor-pointer group hover:bg-slate-800/40 p-1.5 -m-1.5 rounded transition-colors"
                          title="Click to edit decision notes & reminders"
                        >
                          <div className="flex items-start justify-between gap-1.5">
                            <span className="text-[11px] text-slate-200 font-normal line-clamp-2 leading-relaxed">
                              {rec.description}
                            </span>
                            <Edit2 className="w-3 h-3 text-slate-500 group-hover:text-amber-400 shrink-0 mt-0.5" />
                          </div>
                          {assetNotesCount > 0 && (
                            <div className="mt-1 flex items-center gap-1 text-[10px] text-amber-400 font-mono">
                              <StickyNote className="w-2.5 h-2.5" />
                              <span>{assetNotesCount} asset reminder{assetNotesCount > 1 ? 's' : ''}</span>
                            </div>
                          )}
                        </div>
                      ) : (
                        <button
                          onClick={() => handleOpenNoteEditor(rec)}
                          className="inline-flex items-center gap-1 text-[11px] text-slate-400 hover:text-amber-300 py-1 px-2 rounded hover:bg-slate-800/60 transition-colors cursor-pointer"
                          title="Add reminder note on why this investment decision was made"
                        >
                          <Plus className="w-3 h-3 text-amber-400" />
                          <span>Add Decision Note</span>
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Monthly Prices Editor Modal */}
      {editingPriceMonth && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="fintech-card rounded-xl shadow-2xl max-w-md w-full overflow-hidden border border-slate-800">
            
            {/* Header */}
            <div className="p-5 border-b border-slate-800/80 flex items-center justify-between bg-[#080C14]/60">
              <div>
                <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
                  <Tag className="w-4 h-4 text-emerald-400" />
                  <span>{isLiveMonth(editingPriceMonth) ? 'Live Asset Prices' : '1st of Month Asset Prices'}</span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-1.5">
                  <span>Period:</span>
                  {isLiveMonth(editingPriceMonth) ? (
                    <strong className="inline-flex items-center gap-1.5 text-emerald-400">
                      <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                      </span>
                      <span>Live</span>
                    </strong>
                  ) : (
                    <strong>{formatMonthName(editingPriceMonth)} ({editingPriceMonth})</strong>
                  )}
                </p>
              </div>
              <button
                onClick={() => setEditingPriceMonth(null)}
                className="text-slate-400 hover:text-slate-200 text-lg leading-none cursor-pointer"
              >
                &times;
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleSavePrices} className="p-5 space-y-4">
              <p className="text-xs text-slate-400">
                {isLiveMonth(editingPriceMonth)
                  ? 'Current live unit prices multiplied by your asset quantities for real-time valuation.'
                  : `Asset prices on the 1st day of ${formatMonthName(editingPriceMonth)}. These are multiplied by the asset's quantity to calculate monthly valuation.`}
              </p>

              <div className="space-y-3 max-h-72 overflow-y-auto no-scrollbar pr-1">
                {activeAssets.map((ast) => {
                  const cat = categoryMap.get(ast.categoryId);
                  const curr = (ast.currency || 'NTD').toUpperCase();
                  const isBaseCash = ast.isCash && (curr === 'NTD' || curr === 'TWD');

                  if (isBaseCash) {
                    return (
                      <div
                        key={ast.id}
                        className="p-2.5 rounded-lg bg-[#080C14] border border-slate-800/80 flex items-center justify-between text-xs"
                      >
                        <div className="flex items-center gap-2">
                          <span
                            className="w-2.5 h-2.5 rounded-full"
                            style={{ backgroundColor: cat?.color || '#10b981' }}
                          />
                          <span className="font-semibold text-slate-300">{ast.name}</span>
                          <span className="text-[10px] text-emerald-400 uppercase font-mono">(Cash Base)</span>
                        </div>
                        <span className="font-mono text-slate-400">1.00 (Base)</span>
                      </div>
                    );
                  }

                  const displayCurr = getAssetPriceCurrency(ast);
                  const displaySym = getCurrencySymbolForCode(displayCurr);

                  return (
                    <div
                      key={ast.id}
                      className="p-3 rounded-lg bg-[#080C14] border border-slate-800/80 space-y-1.5"
                    >
                      <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                          <span
                            className="w-2.5 h-2.5 rounded-full"
                            style={{ backgroundColor: cat?.color || '#3b82f6' }}
                          />
                          <span className="font-semibold text-slate-200">{ast.name}</span>
                          {ast.isCash ? (
                            <span className="text-[10px] text-emerald-400 uppercase font-mono">
                              ({curr} Exchange Rate)
                            </span>
                          ) : ast.tickerSymbol ? (
                            <span className="text-[10px] font-mono text-slate-400">({ast.tickerSymbol})</span>
                          ) : null}
                        </div>

                        {onEditAsset && (
                          <label className="inline-flex items-center gap-1 text-[10px] text-slate-400">
                            <span>Currency:</span>
                            <select
                              value={displayCurr}
                              onChange={(e) => {
                                const newCurr = e.target.value;
                                const curVal = parseFormattedNumber(priceFormInputs[ast.id] || '0');
                                if (curVal > 0) {
                                  const inNtd = convertPriceToNTD(curVal, displayCurr);
                                  const inNew = Math.round(convertPriceFromNTD(inNtd, newCurr) * 10000) / 10000;
                                  setPriceFormInputs((prev) => ({
                                    ...prev,
                                    [ast.id]: formatNumberWithCommas(inNew),
                                  }));
                                }
                                onEditAsset(ast.id, { priceCurrency: newCurr });
                              }}
                              className="bg-slate-900 border border-slate-700 text-indigo-300 font-mono font-bold text-[10px] rounded px-1.5 py-0.5 focus:outline-none focus:border-indigo-500 cursor-pointer"
                            >
                              {SUPPORTED_PRICE_CURRENCIES.map((c) => (
                                <option key={c.code} value={c.code}>
                                  {c.code} ({c.symbol})
                                </option>
                              ))}
                            </select>
                          </label>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono text-emerald-400 font-semibold shrink-0">{displaySym}</span>
                        <input
                          type="text"
                          placeholder="Price on 1st of month"
                          value={priceFormInputs[ast.id] || ''}
                          onChange={(e) => {
                            const val = formatNumberWithCommas(e.target.value);
                            setPriceFormInputs((prev) => ({ ...prev, [ast.id]: val }));
                          }}
                          className="w-full bg-[#0D131F] border border-slate-700/80 rounded-lg px-2.5 py-1.5 text-xs font-mono text-slate-100 focus:outline-none focus:border-emerald-500 font-semibold"
                        />
                        {displayCurr !== resolveCurrencyCodeFromSymbolOrCode(currencySymbol) && (
                          <span className="text-[10px] font-mono text-slate-500 shrink-0">
                            ≈ {formatCurrency(convertPriceToNTD(parseFormattedNumber(priceFormInputs[ast.id] || '0'), displayCurr), currencySymbol, false)}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end space-x-2 pt-3 border-t border-slate-800/80">
                <button
                  type="button"
                  onClick={() => setEditingPriceMonth(null)}
                  className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold shadow-md shadow-emerald-500/20 transition-all cursor-pointer"
                >
                  Save Prices
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Monthly Investment Decision & Asset Notes Editor Modal */}
      {editingNoteMonth && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="fintech-card rounded-xl shadow-2xl max-w-lg w-full overflow-hidden border border-slate-800 flex flex-col max-h-[90vh]">
            
            {/* Header */}
            <div className="p-4 sm:p-5 border-b border-slate-800/80 flex items-center justify-between bg-[#080C14]/80 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-400 flex items-center justify-center">
                  <StickyNote className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
                    <span>Investment Decision &amp; Reminders</span>
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-1.5">
                    <span>Period:</span>
                    {isLiveMonth(editingNoteMonth) ? (
                      <strong className="inline-flex items-center gap-1.5 text-emerald-400">
                        <span className="relative flex h-2 w-2">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                        </span>
                        <span>Live</span>
                      </strong>
                    ) : (
                      <strong>{formatMonthName(editingNoteMonth)} ({editingNoteMonth})</strong>
                    )}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setEditingNoteMonth(null)}
                className="text-slate-400 hover:text-slate-200 text-lg leading-none cursor-pointer p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleSaveNotes} className="p-4 sm:p-5 space-y-4 overflow-y-auto flex-1 text-xs">
              
              {/* Primary Monthly Decision Reminder */}
              <div className="space-y-1.5">
                <label className="block text-slate-200 font-semibold text-xs flex items-center gap-1.5">
                  <MessageSquareQuote className="w-3.5 h-3.5 text-amber-400" />
                  <span>Monthly Investment Decision &amp; Strategy Note:</span>
                </label>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  Record why you made specific investment decisions at this time (e.g., market sentiment, rebalancing rationale, personal goals, macro conditions).
                </p>
                <textarea
                  rows={3}
                  value={editingMonthNoteText}
                  onChange={(e) => setEditingMonthNoteText(e.target.value)}
                  placeholder="e.g. Reallocated 15% from Cash into S&P 500 following dip; paused crypto DCA to build 6-month emergency reserve..."
                  className="w-full bg-[#080C14] border border-slate-800 rounded-lg p-2.5 text-slate-100 text-xs focus:outline-none focus:border-amber-400/70 font-sans leading-relaxed"
                />
              </div>

              {/* Per-Asset Decision Reminders (Accordion / Section) */}
              <div className="space-y-2 pt-2 border-t border-slate-800/80">
                <div className="flex items-center justify-between">
                  <span className="text-slate-300 font-semibold text-xs">
                    Asset-Specific Decision Notes (Optional):
                  </span>
                  <button
                    type="button"
                    onClick={() => setExpandedAssetNotes(!expandedAssetNotes)}
                    className="text-[11px] text-amber-400 hover:underline cursor-pointer font-medium"
                  >
                    {expandedAssetNotes ? 'Collapse Assets' : `Show Asset Notes (${activeAssets.length})`}
                  </button>
                </div>
                <p className="text-[11px] text-slate-400">
                  Add reminders on individual assets for this month (e.g., rationale for buying, selling, or holding).
                </p>

                {expandedAssetNotes && (
                  <div className="space-y-2.5 max-h-60 overflow-y-auto pr-1 pt-1">
                    {activeAssets.map((ast) => {
                      const cat = categoryMap.get(ast.categoryId);
                      const currentVal = editingAssetNotes[ast.id] || '';

                      return (
                        <div
                          key={ast.id}
                          className="p-2.5 rounded-lg bg-[#080C14] border border-slate-800/90 space-y-1.5"
                        >
                          <div className="flex items-center justify-between text-[11px]">
                            <div className="flex items-center gap-1.5 font-semibold text-slate-200">
                              <span
                                className="w-2 h-2 rounded-full"
                                style={{ backgroundColor: cat?.color || '#3b82f6' }}
                              />
                              <span>{ast.name}</span>
                              {ast.tickerSymbol && (
                                <span className="font-mono text-slate-400 text-[10px]">({ast.tickerSymbol})</span>
                              )}
                            </div>
                            <span className="text-[10px] text-slate-500 font-mono">
                              {cat?.name}
                            </span>
                          </div>

                          <input
                            type="text"
                            value={currentVal}
                            onChange={(e) => {
                              const val = e.target.value;
                              setEditingAssetNotes((prev) => ({
                                ...prev,
                                [ast.id]: val,
                              }));
                            }}
                            placeholder={`Decision note for ${ast.name} (e.g. Bought on pullback, held for yield...)`}
                            className="w-full bg-[#0D131F] border border-slate-800 rounded-md px-2.5 py-1.5 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-amber-400/60"
                          />
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end space-x-2 pt-3 border-t border-slate-800/80 shrink-0">
                <button
                  type="button"
                  onClick={() => setEditingNoteMonth(null)}
                  className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold shadow-md shadow-amber-500/20 transition-all cursor-pointer flex items-center gap-1.5"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>Save Decision Notes</span>
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

    </div>
  );
};
