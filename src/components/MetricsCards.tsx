import React, { useState, useMemo } from 'react';
import {
  ArrowUpRight,
  ArrowDownRight,
  Maximize2,
  ChevronUp,
  ChevronDown,
  Search,
  TrendingUp,
  TrendingDown,
  X,
  Sparkles,
} from 'lucide-react';
import { formatCurrency, formatPercent, formatNumberWithCommas, isLiveMonth, formatMonthName } from '../lib/formatters';
import { RiskLevel } from '../types';
import { MiniSparkline, SparklinePoint } from './MiniSparkline';
import { MonthlySavingsBar, MonthlySavingsPoint } from './MonthlySavingsBar';

export interface AssetPLContribution {
  id: string;
  name: string;
  tickerSymbol?: string;
  currency?: string;
  isCash?: boolean;
  categoryId: string;
  categoryName: string;
  categoryColor: string;
  riskLevel: RiskLevel;
  quantity: number;
  unitPrice: number;
  currentValue: number;
  investedCost: number;
  dividendEarned: number;
  plAmount: number;
  plPercent: number;
}

interface MetricsCardsProps {
  monthName: string;
  isLive?: boolean;
  totalPortfolio: number;
  prevTotalPortfolio?: number;
  totalMoneyInvested: number;
  monthlyMoneyInvested: number;
  floatingPL: number;
  floatingPLPercent: number;
  totalDividendIncome?: number;
  monthlyDividendIncome?: number;
  emergencyFund: number;
  totalCapital: number;
  currencySymbol: string;
  stealthMode: boolean;
  riskBreakdown: Record<RiskLevel, { amount: number; percent: number }>;
  portfolioHistory?: SparklinePoint[];
  investedHistory?: SparklinePoint[];
  savingsHistory?: MonthlySavingsPoint[];
  assetPLContributions?: AssetPLContribution[];
}

export const MetricsCards: React.FC<MetricsCardsProps> = ({
  monthName,
  isLive = true,
  totalPortfolio,
  prevTotalPortfolio,
  totalMoneyInvested,
  monthlyMoneyInvested,
  floatingPL,
  floatingPLPercent,
  totalDividendIncome = 0,
  emergencyFund,
  totalCapital,
  currencySymbol,
  stealthMode,
  riskBreakdown,
  portfolioHistory,
  investedHistory,
  savingsHistory,
  assetPLContributions = [],
}) => {
  const [plAssetIdx, setPlAssetIdx] = useState<number>(0);
  const [isPLModalOpen, setIsPLModalOpen] = useState<boolean>(false);
  const [plSearch, setPlSearch] = useState<string>('');
  const [plFilterTab, setPlFilterTab] = useState<'all' | 'profit' | 'loss' | 'investments' | 'cash'>('all');

  const monthChange = prevTotalPortfolio !== undefined ? totalPortfolio - prevTotalPortfolio : 0;
  const monthChangePercent = prevTotalPortfolio && prevTotalPortfolio > 0 ? (monthChange / prevTotalPortfolio) * 100 : 0;
  const isPositivePL = floatingPL >= 0;

  const lowPct = Math.max(0, Math.min(100, riskBreakdown.Low?.percent || 0));
  const medPct = Math.max(0, Math.min(100, riskBreakdown.Medium?.percent || 0));
  const highPct = Math.max(0, Math.min(100, riskBreakdown.High?.percent || 0));

  const showLiveBadge = isLive || isLiveMonth(monthName);

  // Filtered assets inside the P&L Breakdown Modal
  const filteredPLAssets = useMemo(() => {
    return assetPLContributions.filter((item) => {
      if (plFilterTab === 'profit' && item.plAmount <= 0) return false;
      if (plFilterTab === 'loss' && item.plAmount >= 0) return false;
      if (plFilterTab === 'investments' && item.isCash) return false;
      if (plFilterTab === 'cash' && !item.isCash) return false;

      if (plSearch.trim()) {
        const q = plSearch.toLowerCase();
        const nameMatch = item.name.toLowerCase().includes(q);
        const tickerMatch = (item.tickerSymbol || '').toLowerCase().includes(q);
        const catMatch = item.categoryName.toLowerCase().includes(q);
        const currMatch = (item.currency || '').toLowerCase().includes(q);
        if (!nameMatch && !tickerMatch && !catMatch && !currMatch) return false;
      }
      return true;
    });
  }, [assetPLContributions, plFilterTab, plSearch]);

  const profitableCount = useMemo(
    () => assetPLContributions.filter((a) => a.plAmount > 0).length,
    [assetPLContributions]
  );
  const lossCount = useMemo(
    () => assetPLContributions.filter((a) => a.plAmount < 0).length,
    [assetPLContributions]
  );
  const totalAbsPL = useMemo(
    () => assetPLContributions.reduce((sum, a) => sum + Math.abs(a.plAmount), 0),
    [assetPLContributions]
  );

  return (
    <>
      <div className="grid grid-cols-1 xs:grid-cols-2 lg:grid-cols-3 gap-3.5 sm:gap-4">
        
        {/* Card 1: Total Capital (Assets + Emergency Fund) */}
        <div className="fintech-card rounded-xl p-4 sm:p-5 flex flex-col justify-between metric-card-compact">
          <div>
            <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
              <span className="font-semibold text-slate-300">Total Capital</span>
              <span className="text-[11px] text-slate-500">
                Assets <span aria-hidden="true">·</span> Emergency Reserve
              </span>
            </div>
            <div className="text-2xl sm:text-3xl font-bold font-mono tabular-nums text-slate-50 tracking-tight metric-value-compact">
              {formatCurrency(totalCapital, currencySymbol, stealthMode)}
            </div>
          </div>
          <div className="mt-3 pt-2.5 border-t border-slate-800/70 flex items-center justify-between text-[11px] text-slate-400">
            <span>Combined Net Worth</span>
            {monthName !== 'N/A' ? (
              showLiveBadge ? (
                <span className="inline-flex items-center gap-1.5 font-mono tabular-nums text-emerald-400 font-semibold">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                  </span>
                  <span>Live</span>
                </span>
              ) : (
                <span className="font-mono tabular-nums text-slate-300">
                  {formatMonthName(monthName)}
                </span>
              )
            ) : (
              <span className="font-mono tabular-nums text-slate-500">No Data</span>
            )}
          </div>
        </div>

        {/* Card 2: Emergency Fund (Safety Net Cash Reserve) */}
        <div className="fintech-card rounded-xl p-4 sm:p-5 flex flex-col justify-between metric-card-compact">
          <div>
            <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
              <span className="font-semibold text-amber-400/90">Emergency Fund</span>
              <span className="text-[11px] text-slate-500">Safety Net Reserve</span>
            </div>
            <div className="text-2xl sm:text-3xl font-bold font-mono tabular-nums text-amber-300 tracking-tight metric-value-compact">
              {formatCurrency(emergencyFund, currencySymbol, stealthMode)}
            </div>
          </div>
          <div className="mt-3 pt-2.5 border-t border-slate-800/70 flex items-center justify-between text-[11px] text-slate-400">
            <span>Ring-fenced liquidity</span>
            <span className="text-slate-500">Excluded from P&amp;L</span>
          </div>
        </div>

        {/* Card 3: Risk Exposure Breakdown */}
        <div className="fintech-card rounded-xl p-4 sm:p-5 flex flex-col justify-between metric-card-compact">
          <div>
            <div className="flex items-center justify-between text-xs text-slate-400 mb-2.5">
              <span className="font-semibold text-slate-300">Risk Exposure</span>
              <span className="text-[11px] text-slate-500">Low · Medium · High</span>
            </div>

            {/* Proportional Multi-Segment Risk Bar */}
            <div className="h-2 w-full rounded-full bg-slate-900 overflow-hidden flex gap-0.5 mb-3 border border-slate-800/80">
              {lowPct > 0 && (
                <div
                  style={{ width: `${lowPct}%` }}
                  className="bg-emerald-500 h-full transition-all duration-300"
                  title={`Low Risk: ${formatPercent(lowPct, stealthMode)}`}
                />
              )}
              {medPct > 0 && (
                <div
                  style={{ width: `${medPct}%` }}
                  className="bg-sky-500 h-full transition-all duration-300"
                  title={`Medium Risk: ${formatPercent(medPct, stealthMode)}`}
                />
              )}
              {highPct > 0 && (
                <div
                  style={{ width: `${highPct}%` }}
                  className="bg-rose-500 h-full transition-all duration-300"
                  title={`High Risk: ${formatPercent(highPct, stealthMode)}`}
                />
              )}
            </div>
          </div>

          {/* Tabular Risk Rows */}
          <div className="space-y-1.5">
            {([
              { level: 'Low' as RiskLevel, dotColor: 'bg-emerald-400', textColor: 'text-emerald-400' },
              { level: 'Medium' as RiskLevel, dotColor: 'bg-sky-400', textColor: 'text-sky-400' },
              { level: 'High' as RiskLevel, dotColor: 'bg-rose-400', textColor: 'text-rose-400' },
            ]).map(({ level, dotColor, textColor }) => {
              const data = riskBreakdown[level] || { amount: 0, percent: 0 };
              return (
                <div key={level} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <span className={`w-1.5 h-1.5 rounded-full ${dotColor}`} />
                    <span className="text-slate-300 font-medium">{level} Risk</span>
                  </div>
                  <div className="flex items-center gap-2 font-mono tabular-nums">
                    <span className={`font-semibold ${textColor}`}>
                      {formatPercent(data.percent, stealthMode)}
                    </span>
                    <span className="text-slate-600" aria-hidden="true">·</span>
                    <span className="text-slate-400 text-[11px] hidden xs:inline">
                      {formatCurrency(data.amount, currencySymbol, stealthMode)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Card 4: Total Assets Value (Investment Portfolio) + 6-Month Sparkline */}
        <div className="fintech-card rounded-xl p-4 sm:p-5 flex flex-col justify-between metric-card-compact">
          <div>
            <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
              <span className="font-semibold text-emerald-400">Active Portfolio Assets</span>
              {prevTotalPortfolio !== undefined ? (
                <span
                  className={`inline-flex items-center gap-0.5 font-mono tabular-nums text-[11px] font-semibold ${
                    monthChange >= 0 ? 'text-emerald-400' : 'text-rose-400'
                  }`}
                >
                  {monthChange >= 0 ? (
                    <ArrowUpRight className="w-3.5 h-3.5" />
                  ) : (
                    <ArrowDownRight className="w-3.5 h-3.5" />
                  )}
                  {formatPercent(monthChangePercent, stealthMode)} MoM
                </span>
              ) : (
                <span className="text-[11px] text-slate-500">Market Value</span>
              )}
            </div>
            <div className="text-2xl sm:text-3xl font-bold font-mono tabular-nums text-slate-50 tracking-tight metric-value-compact">
              {formatCurrency(totalPortfolio, currencySymbol, stealthMode)}
            </div>
          </div>

          {/* 6-Month Mini Sparkline Trend */}
          <div className="mt-3 pt-2.5 border-t border-slate-800/70">
            <MiniSparkline
              data={portfolioHistory || []}
              currencySymbol={currencySymbol}
              stealthMode={stealthMode}
            />
          </div>
        </div>

        {/* Card 5: Invested Capital Breakdown + 6-Month Monthly Savings Bar Chart */}
        <div className="fintech-card rounded-xl p-4 sm:p-5 flex flex-col justify-between metric-card-compact">
          <div>
            <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
              <span className="font-semibold text-sky-400">Total Principal Invested</span>
              <span
                className={`font-mono tabular-nums text-[11px] ${
                  monthlyMoneyInvested >= 0 ? 'text-sky-400/90' : 'text-rose-400/90'
                }`}
              >
                {monthlyMoneyInvested >= 0 ? '+' : ''}
                {formatCurrency(monthlyMoneyInvested, currencySymbol, stealthMode)} this mo
              </span>
            </div>
            <div className="text-2xl sm:text-3xl font-bold font-mono tabular-nums text-slate-50 tracking-tight metric-value-compact">
              {formatCurrency(totalMoneyInvested, currencySymbol, stealthMode)}
            </div>
          </div>

          {/* 6-Month Monthly Savings Bar Chart */}
          <div className="mt-3 pt-2.5 border-t border-slate-800/70">
            <MonthlySavingsBar
              data={savingsHistory || investedHistory || []}
              currencySymbol={currencySymbol}
              stealthMode={stealthMode}
              label="6M Monthly Savings"
            />
          </div>
        </div>

        {/* Card 6: Floating Profit / Loss — Overall Header 1 on Top + Per-Asset P&L Cycler & Expandable Breakdown on Bottom */}
        <div
          onClick={() => setIsPLModalOpen(true)}
          className="fintech-card hover:border-emerald-500/40 rounded-xl p-4 sm:p-5 cursor-pointer group transition-all flex flex-col justify-between metric-card-compact relative overflow-hidden"
          title="Click to expand full per-asset Floating P&L contribution breakdown"
        >
          {/* Upper Section: Overall Floating P&L (Always Above with Header 1) */}
          <div>
            <div className="flex items-center justify-between text-xs text-slate-400 mb-1.5">
              <span className="font-semibold text-slate-300 group-hover:text-emerald-300 transition-colors">
                Floating P&amp;L
              </span>
              <div className="flex items-center gap-2">
                <span
                  className={`font-mono tabular-nums text-xs font-bold ${
                    isPositivePL ? 'text-emerald-400' : 'text-rose-400'
                  }`}
                >
                  {isPositivePL ? '+' : ''}
                  {formatPercent(floatingPLPercent, stealthMode)} ROI
                </span>
                <span className="inline-flex items-center gap-1 text-[11px] text-slate-500 group-hover:text-emerald-400 transition-colors">
                  <Maximize2 className="w-3 h-3" />
                  <span className="hidden sm:inline">Expand</span>
                </span>
              </div>
            </div>

            <h1
              className={`text-2xl sm:text-3xl font-bold font-mono tabular-nums tracking-tight metric-value-compact m-0 ${
                isPositivePL ? 'text-emerald-400' : 'text-rose-400'
              }`}
            >
              {isPositivePL && floatingPL > 0 ? '+' : ''}
              {formatCurrency(floatingPL, currencySymbol, stealthMode)}
            </h1>
          </div>

          {/* Lower Section: Per-Asset P&L Contribution Cycler (Same interactive pattern as Current Quantity Balances) */}
          <div className="mt-3 pt-2.5 border-t border-slate-800/70">
            {assetPLContributions.length === 0 ? (
              <div className="text-xs text-slate-500 italic py-2">
                No active investment assets to attribute P&amp;L.
              </div>
            ) : (() => {
              const currentIdx =
                ((plAssetIdx % assetPLContributions.length) + assetPLContributions.length) %
                assetPLContributions.length;
              const curAst = assetPLContributions[currentIdx];
              const isAstPositive = curAst.plAmount >= 0;

              return (
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ backgroundColor: curAst.categoryColor || '#10b981' }}
                      />
                      <div className="min-w-0">
                        <div className="font-semibold text-xs text-slate-100 truncate flex items-center gap-1.5">
                          <span className="truncate">{curAst.name}</span>
                          {curAst.tickerSymbol && (
                            <span className="text-[10px] text-slate-400 font-mono tabular-nums font-normal shrink-0">
                              [{curAst.tickerSymbol}]
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-slate-500 truncate">
                          {curAst.categoryName} · Cost {formatCurrency(curAst.investedCost, currencySymbol, stealthMode)}
                        </div>
                      </div>
                    </div>

                    {/* Up & Down Asset Cycling Buttons */}
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setPlAssetIdx(
                            (prev) =>
                              (prev - 1 + assetPLContributions.length) %
                              assetPLContributions.length
                          );
                        }}
                        className="w-6 h-6 flex items-center justify-center rounded-md bg-[#080C14] hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-800 hover:border-slate-700 transition-colors cursor-pointer"
                        title="Previous Asset P&L"
                      >
                        <ChevronUp className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setPlAssetIdx(
                            (prev) => (prev + 1) % assetPLContributions.length
                          );
                        }}
                        className="w-6 h-6 flex items-center justify-center rounded-md bg-[#080C14] hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-800 hover:border-slate-700 transition-colors cursor-pointer"
                        title="Next Asset P&L"
                      >
                        <ChevronDown className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Asset P&L Contribution Amount & Return % */}
                  <div className="mt-1.5 flex items-baseline justify-between gap-2">
                    <div className="flex items-baseline gap-1.5 min-w-0">
                      <span
                        className={`text-base sm:text-lg font-bold font-mono tabular-nums tracking-tight ${
                          curAst.plAmount > 0
                            ? 'text-emerald-400'
                            : curAst.plAmount < 0
                            ? 'text-rose-400'
                            : 'text-slate-400'
                        }`}
                      >
                        {isAstPositive && curAst.plAmount > 0 ? '+' : ''}
                        {formatCurrency(curAst.plAmount, currencySymbol, stealthMode)}
                      </span>
                      <span
                        className={`text-[11px] font-mono tabular-nums font-semibold ${
                          curAst.plAmount > 0
                            ? 'text-emerald-400/90'
                            : curAst.plAmount < 0
                            ? 'text-rose-400/90'
                            : 'text-slate-500'
                        }`}
                      >
                        ({formatPercent(curAst.plPercent, stealthMode)})
                      </span>
                    </div>
                    <span className="text-[11px] font-mono tabular-nums text-slate-500 shrink-0">
                      {currentIdx + 1} / {assetPLContributions.length}
                    </span>
                  </div>
                </div>
              );
            })()}

            <div className="mt-2 pt-2 border-t border-slate-800/60 flex items-center justify-between text-[11px] text-slate-400 group-hover:text-emerald-300 transition-colors">
              <span className="font-mono tabular-nums">
                {assetPLContributions.length} Assets · {profitableCount} Profitable
              </span>
              <span className="font-semibold flex items-center gap-0.5">
                <span>View full breakdown</span> &rarr;
              </span>
            </div>
          </div>
        </div>

      </div>

      {/* Floating P&L Per-Asset Contribution Breakdown Modal */}
      {isPLModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-950/85 backdrop-blur-md animate-in fade-in duration-150">
          <div className="bg-slate-900 border border-slate-700/80 rounded-2xl sm:rounded-3xl shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden">
            
            {/* Modal Header */}
            <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
              <div className="flex items-center gap-2.5">
                <div
                  className={`w-9 h-9 rounded-xl flex items-center justify-center border ${
                    isPositivePL
                      ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400'
                      : 'bg-rose-500/15 border-rose-500/30 text-rose-400'
                  }`}
                >
                  {isPositivePL ? (
                    <TrendingUp className="w-5 h-5" />
                  ) : (
                    <TrendingDown className="w-5 h-5" />
                  )}
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-bold text-slate-100 flex items-center gap-2">
                    <span>Floating P&amp;L Contribution Breakdown</span>
                    <span className="text-xs font-mono font-semibold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/25">
                      {assetPLContributions.length} Assets
                    </span>
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Individual asset profit/loss attribution comparing Base Cash (NTD) cost basis against live market valuation.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsPLModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
                title="Close Window"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Quick Summary Metrics Strip */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 p-4 bg-slate-950/40 border-b border-slate-800/80">
              <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-2.5">
                <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                  Overall Floating P&amp;L
                </div>
                <div
                  className={`text-lg font-bold font-mono tabular-nums mt-0.5 ${
                    isPositivePL ? 'text-emerald-400' : 'text-rose-400'
                  }`}
                >
                  {isPositivePL && floatingPL > 0 ? '+' : ''}
                  {formatCurrency(floatingPL, currencySymbol, stealthMode)}{' '}
                  <span className="text-xs font-semibold">
                    ({formatPercent(floatingPLPercent, stealthMode)})
                  </span>
                </div>
              </div>

              <div className="bg-slate-900/90 border border-sky-500/20 rounded-xl p-2.5">
                <div className="text-[10px] font-semibold text-sky-400 uppercase tracking-wider">
                  Total Principal Invested
                </div>
                <div className="text-lg font-bold font-mono tabular-nums text-sky-300 mt-0.5">
                  {formatCurrency(totalMoneyInvested, currencySymbol, stealthMode)}
                </div>
              </div>

              <div className="bg-slate-900/90 border border-emerald-500/20 rounded-xl p-2.5">
                <div className="text-[10px] font-semibold text-emerald-400 uppercase tracking-wider">
                  Active Portfolio Value
                </div>
                <div className="text-lg font-bold font-mono tabular-nums text-emerald-300 mt-0.5">
                  {formatCurrency(totalPortfolio, currencySymbol, stealthMode)}
                </div>
              </div>

              <div className="bg-slate-900/90 border border-violet-500/20 rounded-xl p-2.5">
                <div className="text-[10px] font-semibold text-violet-400 uppercase tracking-wider">
                  Passive Yield Included
                </div>
                <div className="text-lg font-bold font-mono tabular-nums text-violet-300 mt-0.5">
                  +{formatCurrency(totalDividendIncome, currencySymbol, stealthMode)}
                </div>
              </div>
            </div>

            {/* Search and Filter Controls */}
            <div className="p-3 sm:p-4 border-b border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-2.5 bg-slate-950/20">
              <div className="relative text-xs w-full sm:w-64">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Search asset, ticker, category..."
                  value={plSearch}
                  onChange={(e) => setPlSearch(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 text-slate-200 pl-8 pr-3 py-1.5 rounded-xl text-xs focus:outline-none focus:border-emerald-400"
                />
                {plSearch && (
                  <button
                    onClick={() => setPlSearch('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 text-xs cursor-pointer"
                  >
                    &times;
                  </button>
                )}
              </div>

              {/* Filter Tabs */}
              <div className="flex items-center gap-1 overflow-x-auto w-full sm:w-auto no-scrollbar">
                {[
                  { id: 'all', label: `All (${assetPLContributions.length})` },
                  { id: 'profit', label: `Profitable (${profitableCount})` },
                  { id: 'loss', label: `Loss (${lossCount})` },
                  {
                    id: 'investments',
                    label: `Investments (${assetPLContributions.filter((a) => !a.isCash).length})`,
                  },
                  {
                    id: 'cash',
                    label: `Cash & FX (${assetPLContributions.filter((a) => a.isCash).length})`,
                  },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setPlFilterTab(tab.id as any)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                      plFilterTab === tab.id
                        ? 'bg-emerald-500 text-slate-950 font-bold shadow-sm'
                        : 'bg-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-700'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Scrollable Per-Asset P&L Attribution Table */}
            <div className="flex-1 overflow-y-auto overflow-x-auto p-4">
              {filteredPLAssets.length === 0 ? (
                <div className="p-12 text-center text-slate-500">
                  <TrendingUp className="w-10 h-10 mx-auto text-slate-600 mb-2" />
                  <p className="text-sm font-semibold text-slate-400">No matching assets found</p>
                  <p className="text-xs text-slate-500 mt-1">
                    Try clearing your search query or switching filter tabs.
                  </p>
                </div>
              ) : (
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-950 text-slate-400 font-semibold border-b border-slate-800 uppercase tracking-wider text-[10px]">
                      <th className="p-3">Asset &amp; Category</th>
                      <th className="p-3 text-right">Principal Invested</th>
                      <th className="p-3 text-right">Current Value (Qty &amp; Price)</th>
                      <th className="p-3 text-right">Passive Yield</th>
                      <th className="p-3 text-right">P&amp;L Contribution</th>
                      <th className="p-3 text-right">Return (ROI %)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-sans text-slate-200">
                    {filteredPLAssets.map((ast) => {
                      const isPos = ast.plAmount >= 0;
                      const impactShare =
                        totalAbsPL > 0 ? (Math.abs(ast.plAmount) / totalAbsPL) * 100 : 0;

                      return (
                        <tr key={ast.id} className="hover:bg-slate-800/40 transition-colors">
                          {/* Asset Info */}
                          <td className="p-3">
                            <div className="flex items-center gap-2">
                              <span
                                className="w-2.5 h-2.5 rounded-full shrink-0"
                                style={{ backgroundColor: ast.categoryColor || '#10b981' }}
                              />
                              <div>
                                <div className="font-bold text-slate-100 flex items-center gap-1.5">
                                  <span>{ast.name}</span>
                                  {ast.tickerSymbol && (
                                    <span className="font-mono text-[10px] text-slate-400 bg-slate-800 px-1.5 py-0.2 rounded border border-slate-700">
                                      {ast.tickerSymbol}
                                    </span>
                                  )}
                                </div>
                                <div className="flex items-center gap-1.5 text-[10px] text-slate-400 mt-0.5">
                                  <span>{ast.categoryName}</span>
                                  <span className="text-slate-600">·</span>
                                  <span>{ast.riskLevel} Risk</span>
                                  {ast.isCash && ast.currency && (
                                    <span className="font-mono text-[9px] text-emerald-400 uppercase">
                                      [{ast.currency}]
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          </td>

                          {/* Principal Invested (Cost Basis) */}
                          <td className="p-3 text-right font-mono tabular-nums text-sky-300 font-semibold">
                            {formatCurrency(ast.investedCost, currencySymbol, stealthMode)}
                          </td>

                          {/* Current Market Value + Qty & Unit Price */}
                          <td className="p-3 text-right font-mono tabular-nums">
                            <div className="font-bold text-slate-100">
                              {formatCurrency(ast.currentValue, currencySymbol, stealthMode)}
                            </div>
                            <div className="text-[10px] text-slate-400 mt-0.5">
                              {stealthMode ? '••••' : formatNumberWithCommas(ast.quantity)} units @{' '}
                              {formatCurrency(ast.unitPrice, currencySymbol, stealthMode)}
                            </div>
                          </td>

                          {/* Passive Yield Earned */}
                          <td className="p-3 text-right font-mono tabular-nums">
                            {ast.dividendEarned > 0 ? (
                              <span className="inline-flex items-center gap-1 text-violet-300 font-semibold">
                                <Sparkles className="w-3 h-3 text-violet-400" />
                                +{formatCurrency(ast.dividendEarned, currencySymbol, stealthMode)}
                              </span>
                            ) : (
                              <span className="text-slate-600">—</span>
                            )}
                          </td>

                          {/* P&L Contribution ($) */}
                          <td className="p-3 text-right font-mono tabular-nums">
                            <div
                              className={`text-sm font-bold ${
                                ast.plAmount > 0
                                  ? 'text-emerald-400'
                                  : ast.plAmount < 0
                                  ? 'text-rose-400'
                                  : 'text-slate-400'
                              }`}
                            >
                              {isPos && ast.plAmount > 0 ? '+' : ''}
                              {formatCurrency(ast.plAmount, currencySymbol, stealthMode)}
                            </div>
                            <div className="text-[10px] text-slate-500 mt-0.5">
                              {stealthMode ? '••%' : `${impactShare.toFixed(1)}% of P&L impact`}
                            </div>
                          </td>

                          {/* Return (ROI %) */}
                          <td className="p-3 text-right font-mono tabular-nums">
                            <span
                              className={`inline-flex items-center gap-0.5 px-2 py-0.5 rounded-md text-xs font-bold border ${
                                ast.plAmount > 0
                                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/25'
                                  : ast.plAmount < 0
                                  ? 'bg-rose-500/10 text-rose-400 border-rose-500/25'
                                  : 'bg-slate-800 text-slate-400 border-slate-700'
                              }`}
                            >
                              {formatPercent(ast.plPercent, stealthMode)}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-3 sm:p-4 border-t border-slate-800 bg-slate-950/60 flex items-center justify-between">
              <span className="text-xs text-slate-400">
                Showing {filteredPLAssets.length} of {assetPLContributions.length} active assets
              </span>
              <button
                onClick={() => setIsPLModalOpen(false)}
                className="px-4 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition-all cursor-pointer"
              >
                Close Window
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
