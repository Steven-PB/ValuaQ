import React, { useState, useMemo } from 'react';
import { 
  Plus, 
  Edit2, 
  Trash2, 
  Copy, 
  ArrowUpDown, 
  FileSpreadsheet, 
  TrendingUp, 
  TrendingDown, 
  Calendar,
  HelpCircle 
} from 'lucide-react';
import { Category, Asset, MonthlyRecord } from '../types';
import { formatCurrency, formatPercent, formatMonthName } from '../lib/formatters';

interface SpreadsheetViewProps {
  records: MonthlyRecord[];
  categories: Category[];
  assets: Asset[];
  activeAssetIds: string[];
  currencySymbol: string;
  stealthMode: boolean;
  onOpenMonthEditor: (recordToEdit?: MonthlyRecord) => void;
  onDeleteRecord: (id: string) => void;
  onDuplicateRecord: (record: MonthlyRecord) => void;
}

export const SpreadsheetView: React.FC<SpreadsheetViewProps> = ({
  records,
  categories,
  assets,
  activeAssetIds,
  currencySymbol,
  stealthMode,
  onOpenMonthEditor,
  onDeleteRecord,
  onDuplicateRecord,
}) => {
  const [sortAsc, setSortAsc] = useState<boolean>(false); // default: latest month first
  const [selectedYear, setSelectedYear] = useState<string>('ALL');

  const activeAssets = assets.filter((a) => activeAssetIds.includes(a.id));

  // Extract all unique years present in the monthly records dataset
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

  // Determine the latest month record in the entire dataset
  const latestMonthRecord = useMemo(() => {
    if (!records || records.length === 0) return null;
    return [...records].sort((a, b) => b.month.localeCompare(a.month))[0];
  }, [records]);

  // Full dataset sorted chronologically to reliably determine previous month
  const chronologicalRecords = useMemo(() => {
    return [...records].sort((a, b) => a.month.localeCompare(b.month));
  }, [records]);

  const filteredRecords = useMemo(() => {
    if (selectedYear === 'ALL') return records;
    return records.filter((r) => r.month.startsWith(selectedYear));
  }, [records, selectedYear]);

  const sortedRecords = [...filteredRecords].sort((a, b) => {
    return sortAsc ? a.month.localeCompare(b.month) : b.month.localeCompare(a.month);
  });

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-md overflow-hidden mb-8">
      
      {/* Header & Control Bar */}
      <div className="p-4 sm:p-5 border-b border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3 bg-slate-950/40">
        <div>
          <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-emerald-400" />
            Monthly Investment Spreadsheet Grid
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Row = Months, Columns = Asset Balances, Invested Capital & Floating Profit/Loss
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto justify-end">
          {/* Year Filter Dropdown Selector */}
          <div className="flex items-center gap-1.5 text-xs text-slate-300 bg-slate-800/90 px-3 py-2 rounded-xl border border-slate-700">
            <Calendar className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span className="font-medium text-slate-400">Year:</span>
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(e.target.value)}
              className="bg-transparent text-slate-100 font-semibold focus:outline-none cursor-pointer text-xs"
            >
              <option value="ALL" className="bg-slate-900 text-slate-100">All Years</option>
              {availableYears.map((yr) => (
                <option key={yr} value={yr} className="bg-slate-900 text-slate-100">
                  {yr}
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={() => setSortAsc(!sortAsc)}
            className="flex items-center gap-1.5 text-xs text-slate-300 bg-slate-800 hover:bg-slate-700 px-3 py-2 rounded-xl border border-slate-700 transition-all font-medium"
          >
            <ArrowUpDown className="w-3.5 h-3.5 text-emerald-400" />
            <span>Sort: {sortAsc ? 'Oldest First' : 'Newest First'}</span>
          </button>

          <button
            onClick={() => onOpenMonthEditor()}
            className="flex items-center gap-1.5 text-xs font-semibold text-slate-950 bg-emerald-400 hover:bg-emerald-300 px-4 py-2 rounded-xl shadow-md shadow-emerald-500/20 transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4 stroke-[3]" />
            <span>Add Month Record</span>
          </button>
        </div>
      </div>

      {/* Responsive Spreadsheet Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="bg-slate-950 text-slate-400 font-semibold border-b border-slate-800 uppercase tracking-wider">
              {/* Action Column on Far Left */}
              <th className="p-3.5 sticky left-0 bg-slate-950 z-20 border-r border-slate-800 text-center w-24 min-w-24">
                Actions
              </th>

              {/* Month Column next to Actions */}
              <th className="p-3.5 sticky left-24 bg-slate-950 z-20 border-r border-slate-800 min-w-28">
                Month
              </th>

              {/* Dynamic Asset Columns */}
              {activeAssets.map((ast) => {
                const cat = categories.find((c) => c.id === ast.categoryId);
                return (
                  <th
                    key={ast.id}
                    className="p-3.5 border-r border-slate-800 min-w-32 font-medium"
                  >
                    <div className="flex items-center gap-1.5 text-slate-200">
                      <span
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ backgroundColor: cat?.color || '#10b981' }}
                      />
                      <span className="truncate">{ast.name}</span>
                    </div>
                    {cat && (
                      <span className="text-[10px] text-slate-500 block font-normal capitalize">
                        {cat.name} ({cat.riskLevel})
                      </span>
                    )}
                  </th>
                );
              })}

              {/* Calculated Portfolio Summary Columns */}
              <th className="p-3.5 border-r border-slate-800 bg-emerald-950/20 text-emerald-400 font-bold min-w-36">
                Total Assets
              </th>
              <th className="p-3.5 border-r border-slate-800 bg-amber-950/20 text-amber-400 font-bold min-w-36" title="Safety Net Cash Reserve (excluded from P&L)">
                Emergency Fund
              </th>
              <th className="p-3.5 border-r border-slate-800 bg-blue-950/20 text-blue-400 font-bold min-w-36" title="Total Assets + Emergency Fund">
                Total Capital
              </th>
              <th className="p-3.5 border-r border-slate-800 min-w-32">
                Monthly Investment
              </th>
              <th className="p-3.5 border-r border-slate-800 min-w-32">
                Total Invested
              </th>
              <th className="p-3.5 border-r border-slate-800 min-w-36">
                Floating P / L ($ & %)
              </th>
              <th className="p-3.5 min-w-48">
                Description / Notes
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
                  No monthly records found for year "{selectedYear}". Try changing the year selector above!
                </td>
              </tr>
            ) : (
              sortedRecords.map((rec, idx) => {
                // Calculate total assets for this record using active filtered assets
                let rowTotalAsset = 0;
                let rowMonthlyInvested = 0;

                activeAssets.forEach((ast) => {
                  rowTotalAsset += rec.assetValues?.[ast.id] || 0;
                  rowMonthlyInvested += rec.assetInvestedValues?.[ast.id] || 0;
                });

                // Fallback if assetInvestedValues wasn't set on custom record and all assets are active
                if (activeAssets.length === assets.length && rowMonthlyInvested === 0 && (rec.monthlyMoneyInvested || 0) > 0) {
                  rowMonthlyInvested = rec.monthlyMoneyInvested || 0;
                }

                // Calculate cumulative total invested up to this month across active assets
                const recChronoIdx = chronologicalRecords.findIndex((r) => r.month === rec.month);
                let rowTotalInvested = 0;
                if (recChronoIdx >= 0) {
                  for (let i = 0; i <= recChronoIdx; i++) {
                    const r = chronologicalRecords[i];
                    let mInv = 0;
                    activeAssets.forEach((ast) => {
                      mInv += r.assetInvestedValues?.[ast.id] || 0;
                    });
                    if (activeAssets.length === assets.length && mInv === 0 && (r.monthlyMoneyInvested || 0) > 0) {
                      mInv = r.monthlyMoneyInvested || 0;
                    }
                    rowTotalInvested += mInv;
                  }
                }
                if (activeAssets.length === assets.length && rowTotalInvested === 0 && (rec.totalMoneyInvested || 0) > 0) {
                  rowTotalInvested = rec.totalMoneyInvested || 0;
                }

                const floatingPL = rowTotalAsset - rowTotalInvested;
                const floatingPLPercent = rowTotalInvested > 0 ? (floatingPL / rowTotalInvested) * 100 : 0;
                const isPositive = floatingPL >= 0;
                const isLatestMonth = rec.id === latestMonthRecord?.id;

                return (
                  <tr
                    key={rec.id}
                    className="hover:bg-slate-800/40 transition-colors group"
                  >
                    {/* Action Buttons Cell (Far Left) */}
                    <td className="p-3.5 sticky left-0 bg-slate-900 group-hover:bg-slate-800 z-10 border-r border-slate-800 text-center w-24 min-w-24">
                      <div className="flex items-center justify-center space-x-1">
                        <button
                          onClick={() => onOpenMonthEditor(rec)}
                          className="p-1.5 text-slate-400 hover:text-emerald-400 hover:bg-slate-800 rounded-lg transition-colors"
                          title="Edit this month record"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => onDuplicateRecord(rec)}
                          disabled={!isLatestMonth}
                          className={`p-1.5 rounded-lg transition-colors ${
                            isLatestMonth
                              ? 'text-slate-400 hover:text-blue-400 hover:bg-slate-800'
                              : 'text-slate-700 cursor-not-allowed opacity-40'
                          }`}
                          title={
                            isLatestMonth
                              ? 'Duplicate as next month'
                              : 'Copy is only enabled on the latest month to maintain timeline integrity'
                          }
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => onDeleteRecord(rec.id)}
                          disabled={!isLatestMonth}
                          className={`p-1.5 rounded-lg transition-colors ${
                            isLatestMonth
                              ? 'text-slate-400 hover:text-rose-400 hover:bg-slate-800 cursor-pointer'
                              : 'text-slate-700 cursor-not-allowed opacity-40'
                          }`}
                          title={
                            isLatestMonth
                              ? 'Delete this month record'
                              : 'Delete is only enabled on the latest month to preserve timeline integrity'
                          }
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>

                    {/* Month Cell */}
                    <td className="p-3.5 font-bold font-sans text-slate-100 sticky left-24 bg-slate-900 group-hover:bg-slate-800 z-10 border-r border-slate-800 min-w-28">
                      <div>{formatMonthName(rec.month)}</div>
                      <div className="text-[10px] text-slate-500 font-normal font-mono flex items-center gap-1">
                        <span>{rec.month}</span>
                        {isLatestMonth && (
                          <span className="px-1 py-0.2 text-[9px] bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded">
                            Latest
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Asset Value Cells */}
                    {activeAssets.map((ast) => {
                      const val = rec.assetValues?.[ast.id] || 0;
                      const investedVal = rec.assetInvestedValues?.[ast.id] || 0;
                      const assetPL = val - investedVal;
                      return (
                        <td
                          key={ast.id}
                          className="p-3.5 border-r border-slate-800/60 text-slate-300 min-w-36"
                        >
                          <div className="text-slate-100 font-semibold">
                            {formatCurrency(val, currencySymbol, stealthMode)}
                          </div>
                          <div className="flex items-center justify-between text-[10px] mt-1 pt-1 border-t border-slate-800/40">
                            <span className="text-slate-400 font-mono" title="Capital invested in this asset">
                              Cost: <span className="text-blue-300 font-medium">{formatCurrency(investedVal, currencySymbol, stealthMode)}</span>
                            </span>
                            {investedVal > 0 && (
                              <span className={`font-mono text-[9px] font-semibold ${assetPL >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                {assetPL >= 0 ? '+' : ''}{formatPercent(((assetPL) / investedVal) * 100, stealthMode)}
                              </span>
                            )}
                          </div>
                        </td>
                      );
                    })}

                    {/* Total Asset / Portfolio Cell */}
                    <td className="p-3.5 border-r border-slate-800/60 bg-emerald-950/10 font-bold text-emerald-400">
                      {formatCurrency(rowTotalAsset, currencySymbol, stealthMode)}
                    </td>

                    {/* Emergency Fund Cell */}
                    <td className="p-3.5 border-r border-slate-800/60 bg-amber-950/10 font-bold text-amber-400">
                      {formatCurrency(rec.emergencyFund || 0, currencySymbol, stealthMode)}
                    </td>

                    {/* Total Capital Cell (Assets + EF) */}
                    <td className="p-3.5 border-r border-slate-800/60 bg-blue-950/10 font-bold text-blue-400">
                      {formatCurrency(rowTotalAsset + (rec.emergencyFund || 0), currencySymbol, stealthMode)}
                    </td>

                    {/* Monthly Money Invested Cell */}
                    <td className="p-3.5 border-r border-slate-800/60 text-slate-300">
                      {rowMonthlyInvested >= 0 ? '+' : ''}{formatCurrency(rowMonthlyInvested, currencySymbol, stealthMode)}
                    </td>

                    {/* Total Money Invested Cell */}
                    <td className="p-3.5 border-r border-slate-800/60 text-blue-300 font-semibold">
                      {formatCurrency(rowTotalInvested, currencySymbol, stealthMode)}
                    </td>

                    {/* Floating Profit / Loss Cell */}
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
                    </td>

                    {/* Description / Notes Cell */}
                    <td className="p-3.5 text-slate-400 font-sans max-w-xs truncate">
                      {rec.description || <span className="text-slate-600 italic">No notes</span>}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

    </div>
  );
};
