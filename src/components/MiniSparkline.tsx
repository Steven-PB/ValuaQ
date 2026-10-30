import React, { useState } from 'react';
import { ArrowUpRight, ArrowDownRight, TrendingUp } from 'lucide-react';
import { formatCurrency, formatPercent } from '../lib/formatters';

export interface SparklinePoint {
  month: string;
  value: number;
  isLive?: boolean;
}

interface MiniSparklineProps {
  data: SparklinePoint[];
  currencySymbol: string;
  stealthMode: boolean;
  className?: string;
  label?: string;
  colorScheme?: 'auto' | 'sky';
}

export const MiniSparkline: React.FC<MiniSparklineProps> = ({
  data,
  currencySymbol,
  stealthMode,
  className = '',
  label = '6-Month Trend',
  colorScheme = 'auto',
}) => {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  // If no data or all 0s, show graceful placeholder
  if (!data || data.length === 0) {
    return (
      <div className={`flex items-center justify-between text-[11px] text-slate-500 ${className}`}>
        <span className="flex items-center gap-1">
          <TrendingUp className="w-3 h-3 text-slate-600" />
          <span>6M Trend</span>
        </span>
        <span className="text-[10px] text-slate-600">No history yet</span>
      </div>
    );
  }

  // Calculate 6-month performance metrics
  const firstPoint = data[0];
  const lastPoint = data[data.length - 1];
  const sixMonthChange = lastPoint.value - firstPoint.value;
  const sixMonthPercent =
    firstPoint.value > 0 ? (sixMonthChange / firstPoint.value) * 100 : 0;
  const isPositive = sixMonthChange >= 0;

  // Formatting month names (e.g. "2024-05" -> "May '24" or "2026-11" -> "Live")
  const formatMonthShort = (monthStr: string, isLivePoint?: boolean) => {
    if (!monthStr) return '';
    if (isLivePoint || monthStr === '2026-11' || monthStr.toLowerCase() === 'live') {
      return 'Live';
    }
    const parts = monthStr.split('-');
    if (parts.length === 2) {
      const year = parts[0].slice(-2);
      const monthNum = parseInt(parts[1], 10);
      const monthNames = [
        'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
        'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
      ];
      if (monthNum >= 1 && monthNum <= 12) {
        return `${monthNames[monthNum - 1]} '${year}`;
      }
    }
    return monthStr;
  };

  // Dimensions for SVG coordinate mapping
  const width = 220;
  const height = 40;
  const padX = 6;
  const padY = 6;

  // Value boundaries with 10% breathing room
  const values = data.map((d) => d.value);
  const minVal = Math.min(...values);
  const maxVal = Math.max(...values);
  const valRange = maxVal - minVal;

  // Single-point edge case
  if (data.length === 1) {
    return (
      <div className={`space-y-1.5 ${className}`}>
        <div className="flex items-center justify-between text-[11px]">
          <span className="text-slate-400 font-medium flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
            6M Trend
          </span>
          <span className="text-[10px] text-slate-500 font-mono">1 mo recorded</span>
        </div>
        <div className="h-8 flex items-center justify-center border border-dashed border-slate-800 rounded-lg text-[10px] text-slate-500">
          Accumulating 6-month trend data
        </div>
      </div>
    );
  }

  // Generate coordinate points
  const points = data.map((d, i) => {
    const x = padX + (i / (data.length - 1)) * (width - 2 * padX);
    const normalized = valRange > 0 ? (d.value - minVal) / valRange : 0.5;
    const y = height - padY - normalized * (height - 2 * padY);
    return { x, y, ...d };
  });

  // Build smooth cubic Bezier path
  let pathD = `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i === 0 ? i : i - 1];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2 < points.length ? i + 2 : i + 1];

    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;

    pathD += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
  }

  // Gradient area closed path
  const areaD = `${pathD} L ${points[points.length - 1].x.toFixed(1)} ${height} L ${points[0].x.toFixed(1)} ${height} Z`;

  // Colors based on trend or colorScheme
  const strokeColor =
    colorScheme === 'sky' ? '#38bdf8' : isPositive ? '#10b981' : '#f43f5e';
  const gradientId = `sparkline-grad-${colorScheme === 'sky' ? 'sky' : isPositive ? 'emerald' : 'rose'}`;

  // Currently active point (either hovered or the latest live point)
  const activePoint = hoveredIndex !== null ? points[hoveredIndex] : points[points.length - 1];

  return (
    <div className={`space-y-1 ${className}`}>
      {/* Top Header: 6M Performance Overview Label & Badge */}
      <div className="flex items-center justify-between text-[11px]">
        <div className="flex items-center gap-1.5 text-slate-400">
          <span
            className={`w-1.5 h-1.5 rounded-full animate-pulse ${
              colorScheme === 'sky' ? 'bg-sky-400' : 'bg-emerald-400'
            }`}
          ></span>
          <span className="font-semibold uppercase tracking-wider text-[10px] text-slate-400">
            {label}
          </span>
          <span className="text-[10px] text-slate-500 font-mono">
            ({data.length} mo)
          </span>
        </div>

        <div className="flex items-center gap-1">
          <span
            className={`inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full border ${
              colorScheme === 'sky'
                ? 'bg-sky-500/10 text-sky-400 border-sky-500/20'
                : isPositive
                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
            }`}
            title={`6-Month Change: ${isPositive ? '+' : ''}${formatCurrency(sixMonthChange, currencySymbol, stealthMode)}`}
          >
            {isPositive ? (
              <ArrowUpRight className="w-2.5 h-2.5" />
            ) : (
              <ArrowDownRight className="w-2.5 h-2.5" />
            )}
            {formatPercent(sixMonthPercent, stealthMode)} 6M
          </span>
        </div>
      </div>

      {/* Interactive Sparkline SVG Container */}
      <div
        className="relative h-10 w-full group/spark cursor-crosshair select-none"
        onMouseLeave={() => setHoveredIndex(null)}
      >
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-full overflow-visible"
          preserveAspectRatio="none"
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop
                offset="0%"
                stopColor={strokeColor}
                stopOpacity={0.28}
              />
              <stop
                offset="100%"
                stopColor={strokeColor}
                stopOpacity={0.0}
              />
            </linearGradient>
          </defs>

          {/* Area fill */}
          <path d={areaD} fill={`url(#${gradientId})`} />

          {/* Sparkline curve */}
          <path
            d={pathD}
            fill="none"
            stroke={strokeColor}
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Vertical guideline on hover */}
          {hoveredIndex !== null && (
            <line
              x1={activePoint.x}
              y1={padY}
              x2={activePoint.x}
              y2={height - padY}
              stroke="#64748b"
              strokeWidth="1"
              strokeDasharray="2,2"
              opacity="0.8"
            />
          )}

          {/* Pulsing indicator on latest live point when not hovered */}
          {hoveredIndex === null && (
            <g>
              <circle
                cx={points[points.length - 1].x}
                cy={points[points.length - 1].y}
                r="5"
                fill={strokeColor}
                opacity="0.35"
                className="animate-ping"
              />
              <circle
                cx={points[points.length - 1].x}
                cy={points[points.length - 1].y}
                r="3"
                fill={strokeColor}
                stroke="#0f172a"
                strokeWidth="1.5"
              />
            </g>
          )}

          {/* Active hovered point dot */}
          {hoveredIndex !== null && (
            <circle
              cx={activePoint.x}
              cy={activePoint.y}
              r="3.5"
              fill={strokeColor}
              stroke="#0f172a"
              strokeWidth="2"
            />
          )}

          {/* Transparent hit target areas for smooth hovering */}
          {points.map((p, idx) => (
            <circle
              key={p.month}
              cx={p.x}
              cy={p.y}
              r="14"
              fill="transparent"
              className="cursor-pointer"
              onMouseEnter={() => setHoveredIndex(idx)}
              onTouchStart={() => setHoveredIndex(idx)}
            />
          ))}
        </svg>

        {/* Hover Tooltip / Detail Overlay */}
        {hoveredIndex !== null ? (
          <div
            className="absolute -top-7 transform -translate-x-1/2 pointer-events-none z-10 whitespace-nowrap bg-slate-950/95 border border-slate-700/80 px-2 py-0.5 rounded shadow-lg text-[10px] font-mono flex items-center gap-1.5 backdrop-blur-sm"
            style={{
              left: `${(activePoint.x / width) * 100}%`,
            }}
          >
            {activePoint.isLive || activePoint.month === '2026-11' ? (
              <span className="inline-flex items-center gap-1 text-emerald-400 font-sans font-semibold">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                <span>Live</span>
              </span>
            ) : (
              <span className="text-slate-400 font-sans font-medium">
                {formatMonthShort(activePoint.month)}
              </span>
            )}
            <span className="text-slate-100 font-bold">
              {formatCurrency(activePoint.value, currencySymbol, stealthMode)}
            </span>
          </div>
        ) : (
          /* Subtle Month Range Footer */
          <div className="flex items-center justify-between text-[9px] text-slate-500 font-mono px-1 -mt-0.5">
            <span>{formatMonthShort(firstPoint.month, firstPoint.isLive)}</span>
            {lastPoint.isLive || lastPoint.month === '2026-11' ? (
              <span className="inline-flex items-center gap-1 text-emerald-400 font-semibold">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <span>Live</span>
              </span>
            ) : (
              <span className="flex items-center gap-1 text-slate-400">
                {formatMonthShort(lastPoint.month)}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
