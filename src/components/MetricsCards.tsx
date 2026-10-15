import React from 'react';
import { Wallet, TrendingUp, DollarSign, PiggyBank, AlertTriangle, ArrowUpRight, ArrowDownRight, ShieldCheck, Landmark } from 'lucide-react';
import { formatCurrency, formatPercent, getRiskLevelBadgeClass } from '../lib/formatters';
import { RiskLevel } from '../types';

interface MetricsCardsProps {
  monthName: string;
  totalPortfolio: number;
  prevTotalPortfolio?: number;
  totalMoneyInvested: number;
  monthlyMoneyInvested: number;
  floatingPL: number;
  floatingPLPercent: number;
  emergencyFund: number;
  totalCapital: number;
  currencySymbol: string;
  stealthMode: boolean;
  riskBreakdown: Record<RiskLevel, { amount: number; percent: number }>;
}

export const MetricsCards: React.FC<MetricsCardsProps> = ({
  monthName,
  totalPortfolio,
  prevTotalPortfolio,
  totalMoneyInvested,
  monthlyMoneyInvested,
  floatingPL,
  floatingPLPercent,
  emergencyFund,
  totalCapital,
  currencySymbol,
  stealthMode,
  riskBreakdown,
}) => {
  const monthChange = prevTotalPortfolio !== undefined ? totalPortfolio - prevTotalPortfolio : 0;
  const monthChangePercent = prevTotalPortfolio && prevTotalPortfolio > 0 ? (monthChange / prevTotalPortfolio) * 100 : 0;
  const isPositivePL = floatingPL >= 0;

  return (
    <div className="grid grid-cols-1 xs:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
      
      {/* Row 1, Card 1: Total Capital (Assets + Emergency Fund) */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3.5 sm:p-5 shadow-sm relative overflow-hidden group metric-card-compact">
        <div className="absolute -right-4 -bottom-4 w-24 h-24 bg-blue-500/5 rounded-full blur-xl group-hover:bg-blue-500/10 transition-all"></div>
        <div className="flex items-center justify-between mb-2 sm:mb-3">
          <span className="text-[11px] sm:text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1 sm:gap-1.5 metric-label-compact">
            <Landmark className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-blue-400" />
            Total Capital
          </span>
          <span className="text-[10px] sm:text-xs font-medium text-slate-400 bg-slate-800 px-1.5 sm:px-2 py-0.5 rounded-md">
            Assets + EF
          </span>
        </div>
        <div className="text-xl sm:text-2xl lg:text-3xl font-extrabold text-slate-50 tracking-tight metric-value-compact">
          {formatCurrency(totalCapital, currencySymbol, stealthMode)}
        </div>
        <p className="text-[10px] sm:text-xs text-slate-400 mt-1.5 sm:mt-2">
          Total Assets + Emergency Fund reserve
        </p>
      </div>

      {/* Row 1, Card 2: Emergency Fund (Safety Net Cash Reserve) */}
      <div className="bg-slate-900 border border-amber-500/20 rounded-2xl p-3.5 sm:p-5 shadow-sm relative overflow-hidden group metric-card-compact">
        <div className="absolute -right-4 -bottom-4 w-24 h-24 bg-amber-500/5 rounded-full blur-xl group-hover:bg-amber-500/10 transition-all"></div>
        <div className="flex items-center justify-between mb-2 sm:mb-3">
          <span className="text-[11px] sm:text-xs font-semibold text-amber-400 uppercase tracking-wider flex items-center gap-1 sm:gap-1.5 metric-label-compact">
            <ShieldCheck className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-amber-400" />
            Emergency Fund
          </span>
          <span className="inline-flex items-center text-[10px] sm:text-xs font-semibold px-1.5 sm:px-2 py-0.5 rounded-full border bg-amber-500/10 text-amber-400 border-amber-500/20">
            Safety Net
          </span>
        </div>
        <div className="text-xl sm:text-2xl lg:text-3xl font-extrabold text-amber-300 tracking-tight metric-value-compact">
          {formatCurrency(emergencyFund, currencySymbol, stealthMode)}
        </div>
        <p className="text-[10px] sm:text-xs text-slate-400 mt-1.5 sm:mt-2">
          Excluded from P&amp;L &amp; invested capital
        </p>
      </div>

      {/* Row 1, Card 3: Risk Exposure Breakdown */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3.5 sm:p-5 shadow-sm flex flex-col justify-between metric-card-compact">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[11px] sm:text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1 sm:gap-1.5 metric-label-compact">
            <AlertTriangle className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-amber-400" />
            Risk Distribution
          </span>
        </div>

        {/* Risk Level Pills */}
        <div className="space-y-1 sm:space-y-1.5 my-auto">
          {(['Low', 'Medium', 'High'] as RiskLevel[]).map((risk) => {
            const data = riskBreakdown[risk] || { amount: 0, percent: 0 };
            return (
              <div key={risk} className="flex items-center justify-between text-[11px] sm:text-xs">
                <span className={`px-1.5 sm:px-2 py-0.5 rounded-md border font-semibold text-[10px] sm:text-xs ${getRiskLevelBadgeClass(risk)}`}>
                  {risk} Risk
                </span>
                <div className="flex items-center space-x-1.5 sm:space-x-2 font-mono">
                  <span className="text-slate-300 font-semibold">{formatPercent(data.percent, stealthMode)}</span>
                  <span className="text-slate-500 font-normal hidden xs:inline">
                    ({formatCurrency(data.amount, currencySymbol, stealthMode)})
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Row 2, Card 1: Total Assets Value (Investment Portfolio) */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3.5 sm:p-5 shadow-sm relative overflow-hidden group metric-card-compact">
        <div className="absolute -right-4 -bottom-4 w-24 h-24 bg-emerald-500/5 rounded-full blur-xl group-hover:bg-emerald-500/10 transition-all"></div>
        <div className="flex items-center justify-between mb-2 sm:mb-3">
          <span className="text-[11px] sm:text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1 sm:gap-1.5 metric-label-compact">
            <Wallet className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-400" />
            Total Assets ({monthName})
          </span>
          {prevTotalPortfolio !== undefined && (
            <span
              className={`inline-flex items-center gap-0.5 text-[10px] sm:text-xs font-semibold px-1.5 sm:px-2 py-0.5 rounded-full border ${
                monthChange >= 0
                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                  : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
              }`}
            >
              {monthChange >= 0 ? <ArrowUpRight className="w-2.5 h-2.5 sm:w-3 sm:h-3" /> : <ArrowDownRight className="w-2.5 h-2.5 sm:w-3 sm:h-3" />}
              {formatPercent(monthChangePercent, stealthMode)} MoM
            </span>
          )}
        </div>
        <div className="text-xl sm:text-2xl lg:text-3xl font-extrabold text-slate-50 tracking-tight metric-value-compact">
          {formatCurrency(totalPortfolio, currencySymbol, stealthMode)}
        </div>
        <p className="text-[10px] sm:text-xs text-slate-400 mt-1.5 sm:mt-2">
          Investment assets net worth
        </p>
      </div>

      {/* Row 2, Card 2: Invested Capital Breakdown */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3.5 sm:p-5 shadow-sm relative overflow-hidden group metric-card-compact">
        <div className="flex items-center justify-between mb-2 sm:mb-3">
          <span className="text-[11px] sm:text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1 sm:gap-1.5 metric-label-compact">
            <PiggyBank className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-blue-400" />
            Total Invested
          </span>
          <span className="text-[10px] sm:text-xs font-medium text-slate-400 bg-slate-800 px-1.5 sm:px-2 py-0.5 rounded-md">
            +{formatCurrency(monthlyMoneyInvested, currencySymbol, stealthMode)}
          </span>
        </div>
        <div className="text-xl sm:text-2xl lg:text-3xl font-extrabold text-slate-50 tracking-tight metric-value-compact">
          {formatCurrency(totalMoneyInvested, currencySymbol, stealthMode)}
        </div>
        <p className="text-[10px] sm:text-xs text-slate-400 mt-1.5 sm:mt-2">
          Cumulative capital in investments
        </p>
      </div>

      {/* Row 2, Card 3: Floating Profit / Loss (Excluding EF) */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3.5 sm:p-5 shadow-sm relative overflow-hidden group metric-card-compact">
        <div className={`absolute -right-4 -bottom-4 w-24 h-24 rounded-full blur-xl transition-all ${
          isPositivePL ? 'bg-emerald-500/5 group-hover:bg-emerald-500/10' : 'bg-rose-500/5 group-hover:bg-rose-500/10'
        }`}></div>
        <div className="flex items-center justify-between mb-2 sm:mb-3">
          <span className="text-[11px] sm:text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1 sm:gap-1.5 metric-label-compact">
            <TrendingUp className={`w-3.5 h-3.5 sm:w-4 sm:h-4 ${isPositivePL ? 'text-emerald-400' : 'text-rose-400'}`} />
            Floating P / L
          </span>
          <span
            className={`inline-flex items-center gap-0.5 text-[10px] sm:text-xs font-bold px-1.5 sm:px-2 py-0.5 rounded-full border ${
              isPositivePL
                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
            }`}
          >
            {formatPercent(floatingPLPercent, stealthMode)} ROI
          </span>
        </div>
        <div className={`text-xl sm:text-2xl lg:text-3xl font-extrabold tracking-tight metric-value-compact ${
          isPositivePL ? 'text-emerald-400' : 'text-rose-400'
        }`}>
          {formatCurrency(floatingPL, currencySymbol, stealthMode)}
        </div>
        <p className="text-[10px] sm:text-xs text-slate-400 mt-1.5 sm:mt-2">
          Assets minus Total Money Invested
        </p>
      </div>

    </div>
  );
};
