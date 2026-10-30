import React, { useState, useMemo } from 'react';
import { ArrowUpRight, ArrowDownRight, Minus, BarChart2 } from 'lucide-react';
import { formatCurrency, formatCompactCurrency } from '../lib/formatters';

export interface MonthlySavingsPoint {
  month: string;
  value: number;
  isLive?: boolean;
}

interface MonthlySavingsBarProps {
  data: MonthlySavingsPoint[];
  currencySymbol: string;
  stealthMode: boolean;
  className?: string;
  label?: string;
}

export const MonthlySavingsBar: React.FC<MonthlySavingsBarProps> = ({
  data,
  currencySymbol,
  stealthMode,
  className = '',
  label = '6M Monthly Savings',
}) => {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  const validData = useMemo(() => data || [], [data]);

  // Compute 6-month statistical metrics (average, stability, trajectory)
  const stats = useMemo(() => {
    if (validData.length === 0) {
      return {
        avg: 0,
        trend: 'neutral' as 'stable' | 'increasing' | 'decreasing' | 'neutral',
        trendText: 'No data',
        trendPercent: 0,
        sixMonthTotal: 0,
        latestVal: 0,
      };
    }

    const values = validData.map((d) => d.value);
    const nonLive = validData.filter((d) => !d.isLive);
    const finalizedValues = nonLive.length > 0 ? nonLive.map((d) => d.value) : values;

    const sum = finalizedValues.reduce((acc, v) => acc + v, 0);
    const avg = sum / (finalizedValues.length || 1);
    const sixMonthTotal = values.reduce((acc, v) => acc + v, 0);
    const latest = validData[validData.length - 1];
    const latestVal = latest?.value || 0;

    if (finalizedValues.length <= 1) {
      return {
        avg,
        trend: 'neutral' as const,
        trendText: avg > 0 ? '1 mo recorded' : 'No data',
        trendPercent: 0,
        sixMonthTotal,
        latestVal,
      };
    }

    // Standard deviation & coefficient of variation to check stability
    const variance =
      finalizedValues.reduce((acc, v) => acc + Math.pow(v - avg, 2), 0) /
      finalizedValues.length;
    const stdDev = Math.sqrt(variance);
    const cv = avg > 0 ? stdDev / avg : 0;

    // Compare second half vs first half of history to determine trajectory direction
    const mid = Math.floor(finalizedValues.length / 2);
    const firstHalf = finalizedValues.slice(0, mid);
    const secondHalf = finalizedValues.slice(mid);
    const firstAvg = firstHalf.reduce((a, b) => a + b, 0) / (firstHalf.length || 1);
    const secondAvg = secondHalf.reduce((a, b) => a + b, 0) / (secondHalf.length || 1);

    const halfDelta = secondAvg - firstAvg;
    const halfDeltaPct = firstAvg > 0 ? (halfDelta / firstAvg) * 100 : secondAvg > 0 ? 100 : 0;

    let trend: 'stable' | 'increasing' | 'decreasing' | 'neutral' = 'stable';
    let trendText = 'Stable';

    if (avg <= 0) {
      trend = 'neutral';
      trendText = 'No savings';
    } else if (cv < 0.20 || Math.abs(halfDeltaPct) < 12) {
      trend = 'stable';
      trendText = 'Stable';
    } else if (halfDeltaPct >= 12) {
      trend = 'increasing';
      trendText = `+${Math.round(halfDeltaPct)}%`;
    } else {
      trend = 'decreasing';
      trendText = `${Math.round(halfDeltaPct)}%`;
    }

    return {
      avg,
      trend,
      trendText,
      trendPercent: halfDeltaPct,
      sixMonthTotal,
      latestVal,
    };
  }, [validData]);

  // If no data, show graceful placeholder
  if (validData.length === 0) {
    return (
      <div className={`flex items-center justify-between text-[11px] text-slate-500 ${className}`}>
        <span className="flex items-center gap-1.5">
          <BarChart2 className="w-3.5 h-3.5 text-slate-600" />
          <span className="font-semibold">{label}</span>
        </span>
        <span className="text-[10px] text-slate-600">No savings history yet</span>
      </div>
    );
  }

  // Format month helpers
  const formatMonthShort = (monthStr: string) => {
    if (!monthStr) return '';
    const parts = monthStr.split('-');
    if (parts.length === 2) {
      const monthNum = parseInt(parts[1], 10);
      const monthNames = [
        'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
        'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
      ];
      if (monthNum >= 1 && monthNum <= 12) {
        return monthNames[monthNum - 1];
      }
    }
    return monthStr;
  };

  const formatMonthFull = (monthStr: string) => {
    if (!monthStr) return '';
    const parts = monthStr.split('-');
    if (parts.length === 2) {
      const yr = parts[0].slice(-2);
      const monthNum = parseInt(parts[1], 10);
      const monthNames = [
        'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
        'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
      ];
      if (monthNum >= 1 && monthNum <= 12) {
        return `${monthNames[monthNum - 1]} '${yr}`;
      }
    }
    return monthStr;
  };

  // Dimensions for SVG
  const width = 240;
  const height = 48;
  const bottomAxisHeight = 14;
  const chartHeight = height - bottomAxisHeight; // 34px for bars
  const count = validData.length;
  const colWidth = width / Math.max(1, count);
  const barWidth = Math.min(22, Math.max(13, colWidth * 0.58));

  // Max value for scale ceiling (with 15% breathing room above highest bar or average)
  const maxVal = Math.max(
    ...validData.map((d) => d.value),
    stats.avg * 1.15,
    1000
  );

  // Average line Y coordinate
  const avgY = stats.avg > 0 ? chartHeight - (stats.avg / maxVal) * (chartHeight - 4) : null;

  // Active point for tooltip
  const activePoint = hoveredIndex !== null ? validData[hoveredIndex] : null;
  const activeColCenter =
    hoveredIndex !== null
      ? hoveredIndex * colWidth + colWidth / 2
      : width / 2;

  return (
    <div className={`space-y-1.5 ${className}`}>
      {/* Top Header: Title + Stability / Trajectory Badge */}
      <div className="flex items-center justify-between text-[11px]">
        <div className="flex items-center gap-1.5 text-slate-400">
          <span className="w-1.5 h-1.5 rounded-full bg-sky-400 animate-pulse" />
          <span className="font-semibold uppercase tracking-wider text-[10px] text-slate-300">
            {label}
          </span>
          <span className="text-[10px] text-slate-500 font-mono">
            ({validData.length} mo)
          </span>
        </div>

        {/* Trajectory Badge */}
        <div className="flex items-center gap-1.5">
          {stats.trend === 'increasing' && (
            <span
              className="inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-md border bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
              title={`Savings trending up (${stats.trendText} vs earlier months)`}
            >
              <ArrowUpRight className="w-2.5 h-2.5" />
              <span>Increasing ({stats.trendText})</span>
            </span>
          )}

          {stats.trend === 'decreasing' && (
            <span
              className="inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-md border bg-rose-500/10 text-rose-400 border-rose-500/20"
              title={`Savings trending down (${stats.trendText} vs earlier months)`}
            >
              <ArrowDownRight className="w-2.5 h-2.5" />
              <span>Decreasing ({stats.trendText})</span>
            </span>
          )}

          {stats.trend === 'stable' && (
            <span
              className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-md border bg-sky-500/10 text-sky-400 border-sky-500/20"
              title={`Consistent savings rate (6-month avg: ${formatCurrency(stats.avg, currencySymbol, stealthMode)}/mo)`}
            >
              <Minus className="w-2.5 h-2.5" />
              <span>Stable (~{formatCompactCurrency(stats.avg, currencySymbol, stealthMode)}/mo)</span>
            </span>
          )}

          {stats.trend === 'neutral' && (
            <span className="text-[10px] text-slate-500 font-mono">
              {stats.trendText}
            </span>
          )}
        </div>
      </div>

      {/* SVG Bar Chart Area */}
      <div
        className="relative h-12 w-full select-none cursor-pointer"
        onMouseLeave={() => setHoveredIndex(null)}
      >
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-full overflow-visible"
          preserveAspectRatio="none"
        >
          <defs>
            {/* Sky Gradient for Normal Bars */}
            <linearGradient id="savings-bar-gradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#38bdf8" stopOpacity={1} />
              <stop offset="100%" stopColor="#0284c7" stopOpacity={0.85} />
            </linearGradient>

            {/* Hovered Bar Gradient */}
            <linearGradient id="savings-bar-gradient-hover" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#7dd3fc" stopOpacity={1} />
              <stop offset="100%" stopColor="#38bdf8" stopOpacity={0.95} />
            </linearGradient>

            {/* Live In-Progress Bar Gradient */}
            <linearGradient id="savings-bar-gradient-live" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#38bdf8" stopOpacity={0.7} />
              <stop offset="100%" stopColor="#0369a1" stopOpacity={0.45} />
            </linearGradient>
          </defs>

          {/* Baseline horizontal grid line */}
          <line
            x1={0}
            y1={chartHeight}
            x2={width}
            y2={chartHeight}
            stroke="#1e293b"
            strokeWidth="1"
          />

          {/* Average Benchmark Dashed Line (visual reference for stability) */}
          {avgY !== null && avgY > 4 && avgY < chartHeight - 2 && (
            <g>
              <line
                x1={0}
                y1={avgY}
                x2={width}
                y2={avgY}
                stroke="#64748b"
                strokeWidth="1"
                strokeDasharray="2 3"
                opacity="0.55"
              />
            </g>
          )}

          {/* Render Individual Monthly Savings Bars */}
          {validData.map((d, idx) => {
            const x = idx * colWidth + (colWidth - barWidth) / 2;
            const barVal = Math.max(0, d.value);
            const rawBarHeight = maxVal > 0 ? (barVal / maxVal) * (chartHeight - 4) : 0;
            const barH = barVal > 0 ? Math.max(3, rawBarHeight) : 1;
            const y = chartHeight - barH;
            const isHovered = hoveredIndex === idx;
            const isLive = Boolean(d.isLive);

            return (
              <g key={d.month}>
                {/* Bar Element */}
                {barVal > 0 ? (
                  <rect
                    x={x}
                    y={y}
                    width={barWidth}
                    height={barH}
                    rx="2"
                    ry="2"
                    fill={
                      isHovered
                        ? 'url(#savings-bar-gradient-hover)'
                        : isLive
                        ? 'url(#savings-bar-gradient-live)'
                        : 'url(#savings-bar-gradient)'
                    }
                    stroke={isHovered ? '#bae6fd' : isLive ? '#38bdf8' : 'none'}
                    strokeWidth={isHovered ? 1.5 : isLive ? 1.25 : 0}
                    strokeDasharray={isLive && !isHovered ? '2 1.5' : undefined}
                    className="transition-all duration-150"
                  />
                ) : (
                  /* Zero savings baseline notch */
                  <rect
                    x={x}
                    y={chartHeight - 1.5}
                    width={barWidth}
                    height={1.5}
                    rx="1"
                    ry="1"
                    fill="#475569"
                    opacity={0.6}
                  />
                )}

                {/* Pulsing indicator on top of Live ongoing month */}
                {isLive && barVal > 0 && (
                  <circle
                    cx={x + barWidth / 2}
                    cy={y - 2.5}
                    r="1.5"
                    fill="#38bdf8"
                    className="animate-pulse"
                  />
                )}

                {/* Short month label below baseline */}
                <text
                  x={x + barWidth / 2}
                  y={height - 2}
                  textAnchor="middle"
                  fill={isHovered ? '#38bdf8' : isLive ? '#7dd3fc' : '#64748b'}
                  className={`text-[9px] font-mono tracking-tight transition-colors ${
                    isHovered ? 'font-bold' : isLive ? 'font-semibold' : 'font-normal'
                  }`}
                >
                  {formatMonthShort(d.month)}
                  {isLive && '*'}
                </text>

                {/* Invisible broad hit-target for smooth touch & mouse hover */}
                <rect
                  x={idx * colWidth}
                  y={0}
                  width={colWidth}
                  height={height}
                  fill="transparent"
                  className="cursor-pointer"
                  onMouseEnter={() => setHoveredIndex(idx)}
                  onTouchStart={() => setHoveredIndex(idx)}
                />
              </g>
            );
          })}
        </svg>

        {/* Hover Tooltip Overlay */}
        {activePoint && (
          <div
            className="absolute -top-7 transform -translate-x-1/2 pointer-events-none z-20 whitespace-nowrap bg-slate-950/95 border border-slate-700/90 px-2 py-0.5 rounded-md shadow-xl text-[10px] font-mono flex items-center gap-1.5 backdrop-blur-sm"
            style={{
              left: `${Math.max(16, Math.min(84, (activeColCenter / width) * 100))}%`,
            }}
          >
            <span className="text-slate-400 font-sans font-medium">
              {formatMonthFull(activePoint.month)}
            </span>
            <span className="text-sky-300 font-bold">
              {formatCurrency(activePoint.value, currencySymbol, stealthMode)}
            </span>
            {activePoint.isLive ? (
              <span className="text-[9px] text-sky-400 font-semibold bg-sky-500/10 px-1 rounded border border-sky-500/20">
                In-Progress
              </span>
            ) : stats.avg > 0 ? (
              <span
                className={`text-[9px] font-semibold ${
                  activePoint.value >= stats.avg ? 'text-emerald-400' : 'text-slate-400'
                }`}
              >
                {activePoint.value >= stats.avg ? '+' : ''}
                {Math.round(((activePoint.value - stats.avg) / stats.avg) * 100)}% vs avg
              </span>
            ) : null}
          </div>
        )}
      </div>

      {/* Subtle Legend / Benchmark Caption */}
      <div className="flex items-center justify-between text-[9px] text-slate-500 font-mono px-0.5">
        <span className="flex items-center gap-1">
          <span className="w-2 h-0.5 border-b border-dashed border-slate-500 inline-block" />
          <span>Dashed line = 6M avg</span>
        </span>
        <span className="text-slate-400">
          Total: {formatCompactCurrency(stats.sixMonthTotal, currencySymbol, stealthMode)} saved
        </span>
      </div>
    </div>
  );
};
