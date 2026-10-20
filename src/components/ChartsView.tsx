import React, { useState, useMemo, useRef } from 'react';
import {
  PieChart as PieChartIcon,
  BarChart3,
  Calendar,
  Layers,
  Info,
  DollarSign,
  TrendingUp,
  ZoomIn,
  ZoomOut,
  RotateCcw,
} from 'lucide-react';
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  Legend,
  BarChart,
  Bar,
  ComposedChart,
  Line,
  LabelList,
  XAxis,
  YAxis,
  CartesianGrid,
} from 'recharts';
import {
  Category,
  Asset,
  MonthlyRecord,
  ChartGroupMode,
  ChartType,
  RiskLevel,
  FilterState,
} from '../types';
import {
  formatCurrency,
  formatCompactCurrency,
  formatMonthName,
  getRiskLevelColor,
} from '../lib/formatters';

interface ChartsViewProps {
  records: MonthlyRecord[];
  categories: Category[];
  assets: Asset[];
  activeAssetIds: string[]; // Filtered asset IDs
  currencySymbol: string;
  stealthMode: boolean;
  filters?: FilterState;
  chartType?: ChartType;
  onChartTypeChange?: (type: ChartType) => void;
}

export const ChartsView: React.FC<ChartsViewProps> = ({
  records,
  categories,
  assets,
  activeAssetIds,
  currencySymbol,
  stealthMode,
  filters,
  chartType: externalChartType,
  onChartTypeChange,
}) => {
  const [internalChartType, setInternalChartType] = useState<ChartType>('all');
  const chartType = externalChartType ?? internalChartType;

  const showEmergencyFund = filters?.includeEmergencyFund !== false;

  const handleSetChartType = (type: ChartType) => {
    setInternalChartType(type);
    onChartTypeChange?.(type);
  };
  const [groupMode, setGroupMode] = useState<ChartGroupMode>('category');
  const [barTimeScale, setBarTimeScale] = useState<'monthly' | 'yearly'>('monthly');
  const [barYearMode, setBarYearMode] = useState<'all' | 'single'>('all');
  const [zoomLevel, setZoomLevel] = useState<number>(1);

  // Available unique years in chronological order
  const availableYears = useMemo(() => {
    const set = new Set<string>();
    records.forEach((r) => {
      if (r.month && r.month.includes('-')) {
        set.add(r.month.split('-')[0]);
      }
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [records]);

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const zoomLevelRef = useRef<number>(zoomLevel);

  React.useEffect(() => {
    zoomLevelRef.current = zoomLevel;
  }, [zoomLevel]);

  React.useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollLeft = scrollContainerRef.current.scrollWidth;
    }
  }, [barYearMode, barTimeScale, chartType]);

  // Reset zoom when switching timescale or year
  React.useEffect(() => {
    setZoomLevel(1);
  }, [barYearMode, barTimeScale]);

  // Native wheel handler for scroll-to-zoom (mouse wheel & trackpad pinch) + mobile multi-touch pinch
  React.useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const handleWheelNative = (e: WheelEvent) => {
      // Shift + Scroll -> Smooth horizontal panning across graph
      if (e.shiftKey) {
        e.preventDefault();
        container.scrollLeft += (e.deltaY || e.deltaX) * 1.5;
        return;
      }

      // Vertical Wheel Scroll -> Zoom In / Out for All Years or Yearly View
      if (barTimeScale === 'yearly' || barYearMode === 'all') {
        if (e.ctrlKey || (Math.abs(e.deltaY) > Math.abs(e.deltaX) && Math.abs(e.deltaY) > 2)) {
          e.preventDefault();
          const zoomStep = e.ctrlKey
            ? e.deltaY * -0.01 // Trackpad smooth pinch
            : e.deltaY < 0 ? 0.15 : -0.15; // Mouse scroll wheel
          setZoomLevel((prev) => {
            const next = prev + zoomStep;
            return Math.min(3, Math.max(0.25, Number(next.toFixed(2))));
          });
        }
      }
    };

    // Touch event handlers for mobile/tablet multi-touch pinch-to-zoom
    let initialTouchDistance = 0;
    let initialZoomOnTouch = 1;

    const getTouchDistance = (touches: TouchList) => {
      const dx = touches[0].clientX - touches[1].clientX;
      const dy = touches[0].clientY - touches[1].clientY;
      return Math.hypot(dx, dy);
    };

    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2 && (barTimeScale === 'yearly' || barYearMode === 'all')) {
        initialTouchDistance = getTouchDistance(e.touches);
        initialZoomOnTouch = zoomLevelRef.current;
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 2 && (barTimeScale === 'yearly' || barYearMode === 'all')) {
        e.preventDefault();
        const currentDistance = getTouchDistance(e.touches);
        if (initialTouchDistance > 0) {
          const scaleFactor = currentDistance / initialTouchDistance;
          const nextZoom = Math.min(
            3,
            Math.max(0.25, Number((initialZoomOnTouch * scaleFactor).toFixed(2)))
          );
          setZoomLevel(nextZoom);
        }
      }
    };

    container.addEventListener('wheel', handleWheelNative, { passive: false });
    container.addEventListener('touchstart', handleTouchStart, { passive: false });
    container.addEventListener('touchmove', handleTouchMove, { passive: false });

    return () => {
      container.removeEventListener('wheel', handleWheelNative);
      container.removeEventListener('touchstart', handleTouchStart);
      container.removeEventListener('touchmove', handleTouchMove);
    };
  }, [barTimeScale, barYearMode, chartType]);

  // ----------------------------------------------------
  // PIE CHART YEAR & MONTH SELECTION (DYNAMIC)
  // ----------------------------------------------------
  const pieAvailableYears = useMemo(() => {
    const yearsSet = new Set<string>();
    records.forEach((r) => {
      if (r.month && r.month.includes('-')) {
        yearsSet.add(r.month.split('-')[0]);
      }
    });
    return Array.from(yearsSet).sort((a: string, b: string) => b.localeCompare(a));
  }, [records]);

  const [pieSelectedYear, setPieSelectedYear] = useState<string>(() => {
    const set = new Set<string>();
    records.forEach((r) => {
      if (r.month && r.month.includes('-')) {
        set.add(r.month.split('-')[0]);
      }
    });
    const sorted = Array.from(set).sort((a: string, b: string) => b.localeCompare(a));
    return sorted[0] || '2026';
  });

  React.useEffect(() => {
    if (pieAvailableYears.length > 0 && !pieAvailableYears.includes(pieSelectedYear)) {
      setPieSelectedYear(pieAvailableYears[0]);
    }
  }, [pieAvailableYears, pieSelectedYear]);

  const pieAvailableMonths = useMemo(() => {
    if (!pieSelectedYear) return [];
    const filtered: string[] = records
      .filter((r) => r.month && r.month.startsWith(`${pieSelectedYear}-`))
      .map((r) => r.month);
    
    const unique: string[] = Array.from(new Set<string>(filtered)).sort((a: string, b: string) => b.localeCompare(a));
    return unique.map((m: string) => {
      const [yr, mo] = m.split('-');
      const date = new Date(parseInt(yr, 10), parseInt(mo, 10) - 1, 1);
      const monthName = date.toLocaleDateString('en-US', { month: 'short' });
      return {
        fullMonth: m,
        monthNum: mo,
        monthName,
        label: `${mo} - ${monthName}`,
      };
    });
  }, [records, pieSelectedYear]);

  const [pieSelectedMonthNum, setPieSelectedMonthNum] = useState<string>(() => {
    if (pieAvailableMonths.length > 0) return pieAvailableMonths[0].monthNum;
    return '07';
  });

  React.useEffect(() => {
    if (pieAvailableMonths.length > 0) {
      const exists = pieAvailableMonths.some((m) => m.monthNum === pieSelectedMonthNum);
      if (!exists) {
        setPieSelectedMonthNum(pieAvailableMonths[0].monthNum);
      }
    }
  }, [pieAvailableMonths, pieSelectedMonthNum]);

  const selectedMonth = useMemo(() => {
    if (!pieSelectedYear || !pieSelectedMonthNum) {
      return records[records.length - 1]?.month || '';
    }
    return `${pieSelectedYear}-${pieSelectedMonthNum}`;
  }, [pieSelectedYear, pieSelectedMonthNum, records]);

  // Fallback if selectedMonth is not in available records
  const activeMonthRecord = useMemo(() => {
    return records.find((r) => r.month === selectedMonth) || records[records.length - 1];
  }, [records, selectedMonth]);

  // Color map helpers
  const categoryMap = useMemo(() => {
    const map = new Map<string, Category>();
    categories.forEach((c) => map.set(c.id, c));
    return map;
  }, [categories]);

  const assetMap = useMemo(() => {
    const map = new Map<string, Asset>();
    assets.forEach((a) => map.set(a.id, a));
    return map;
  }, [assets]);

  // Palette generator for assets if not specified
  const assetColors = useMemo(() => {
    const colors = [
      '#10b981', '#3b82f6', '#8b5cf6', '#f59e0b', '#ec4899', 
      '#06b6d4', '#14b8a6', '#6366f1', '#a855f7', '#f43f5e',
      '#0284c7', '#d97706', '#059669', '#7c3aed'
    ];
    const map: Record<string, string> = {};
    assets.forEach((ast, idx) => {
      // Inherit category color if possible, or pick from palette
      const cat = categoryMap.get(ast.categoryId);
      map[ast.id] = cat ? cat.color : colors[idx % colors.length];
    });
    return map;
  }, [assets, categoryMap]);

  // ----------------------------------------------------
  // PIE CHART DATA CALCULATION
  // ----------------------------------------------------
  const pieChartData = useMemo(() => {
    if (!activeMonthRecord) return [];

    const rawValues = activeMonthRecord.assetValues || {};

    if (groupMode === 'asset') {
      const items = assets
        .filter((a) => activeAssetIds.includes(a.id))
        .map((a) => {
          const val = rawValues[a.id] || 0;
          const cat = categoryMap.get(a.categoryId);
          return {
            id: a.id,
            name: a.name,
            value: val,
            color: assetColors[a.id] || '#10b981',
            categoryName: cat?.name || 'Unassigned',
            riskLevel: cat?.riskLevel || 'Low',
          };
        })
        .filter((item) => item.value > 0);

      if (showEmergencyFund) {
        const efVal = activeMonthRecord.emergencyFund || 0;
        if (efVal > 0) {
          items.push({
            id: 'emergency-fund',
            name: 'Emergency Fund',
            value: efVal,
            color: '#10b981',
            categoryName: 'Safety Net',
            riskLevel: 'Low' as RiskLevel,
          });
        }
      }

      const total = items.reduce((acc, curr) => acc + curr.value, 0);
      return items
        .map((item) => ({
          ...item,
          percentage: total > 0 ? (item.value / total) * 100 : 0,
        }))
        .sort((a, b) => b.value - a.value);
    }

    if (groupMode === 'category') {
      const catTotals: Record<string, number> = {};
      assets
        .filter((a) => activeAssetIds.includes(a.id))
        .forEach((a) => {
          const val = rawValues[a.id] || 0;
          catTotals[a.categoryId] = (catTotals[a.categoryId] || 0) + val;
        });

      const items = categories
        .map((cat) => {
          const val = catTotals[cat.id] || 0;
          return {
            id: cat.id,
            name: cat.name,
            value: val,
            color: cat.color,
            riskLevel: cat.riskLevel,
          };
        })
        .filter((item) => item.value > 0);

      if (showEmergencyFund) {
        const efVal = activeMonthRecord.emergencyFund || 0;
        if (efVal > 0) {
          items.push({
            id: 'emergency-fund',
            name: 'Emergency Fund',
            value: efVal,
            color: '#10b981',
            riskLevel: 'Low' as RiskLevel,
          });
        }
      }

      const total = items.reduce((acc, curr) => acc + curr.value, 0);
      return items
        .map((item) => ({
          ...item,
          percentage: total > 0 ? (item.value / total) * 100 : 0,
        }))
        .sort((a, b) => b.value - a.value);
    }

    if (groupMode === 'risk') {
      const riskTotals: Record<RiskLevel, number> = { Low: 0, Medium: 0, High: 0 };
      assets
        .filter((a) => activeAssetIds.includes(a.id))
        .forEach((a) => {
          const val = rawValues[a.id] || 0;
          const cat = categoryMap.get(a.categoryId);
          const risk = cat ? cat.riskLevel : 'Low';
          riskTotals[risk] = (riskTotals[risk] || 0) + val;
        });

      if (showEmergencyFund) {
        const efVal = activeMonthRecord.emergencyFund || 0;
        if (efVal > 0) {
          riskTotals['Low'] += efVal;
        }
      }

      const items = (['Low', 'Medium', 'High'] as RiskLevel[])
        .map((risk) => ({
          id: risk,
          name: `${risk} Risk`,
          value: riskTotals[risk],
          color: getRiskLevelColor(risk),
          riskLevel: risk,
        }))
        .filter((item) => item.value > 0);

      const total = items.reduce((acc, curr) => acc + curr.value, 0);
      return items
        .map((item) => ({
          ...item,
          percentage: total > 0 ? (item.value / total) * 100 : 0,
        }))
        .sort((a, b) => b.value - a.value);
    }

    return [];
  }, [activeMonthRecord, groupMode, assets, activeAssetIds, categoryMap, assetColors, categories, showEmergencyFund]);

  const totalPieValue = useMemo(() => {
    return pieChartData.reduce((sum, item) => sum + item.value, 0);
  }, [pieChartData]);

  // ----------------------------------------------------
  // STACKED BAR CHART DATA CALCULATION
  // ----------------------------------------------------
  const { barChartData, stackKeys } = useMemo(() => {
    // Determine unique stack keys and their colors based on groupMode
    let keys: { id: string; name: string; color: string }[] = [];

    if (groupMode === 'asset') {
      keys = assets
        .filter((a) => activeAssetIds.includes(a.id))
        .map((a) => ({
          id: a.id,
          name: a.name,
          color: assetColors[a.id] || '#10b981',
        }));
      if (showEmergencyFund) {
        keys.push({
          id: 'emergency-fund',
          name: 'Emergency Fund',
          color: '#10b981',
        });
      }
    } else if (groupMode === 'category') {
      keys = categories.map((cat) => ({
        id: cat.id,
        name: cat.name,
        color: cat.color,
      }));
      if (showEmergencyFund) {
        keys.push({
          id: 'emergency-fund',
          name: 'Emergency Fund',
          color: '#10b981',
        });
      }
    } else if (groupMode === 'risk') {
      keys = (['Low', 'Medium', 'High'] as RiskLevel[]).map((risk) => ({
        id: risk,
        name: `${risk} Risk`,
        color: getRiskLevelColor(risk),
      }));
    }

    // Determine target records based on barTimeScale and barSelectedYear
    const sortedChronological = [...records].sort((a, b) => a.month.localeCompare(b.month));

    let processedRecords: MonthlyRecord[] = [];
    if (barTimeScale === 'monthly') {
      const yearsToProcess = barYearMode === 'single' && pieSelectedYear
        ? [pieSelectedYear]
        : availableYears.length > 0 ? availableYears : ['2026'];

      const allMonths: string[] = [];
      yearsToProcess.forEach((yr) => {
        for (let i = 1; i <= 12; i++) {
          const mNum = String(i).padStart(2, '0');
          allMonths.push(`${yr}-${mNum}`);
        }
      });

      processedRecords = allMonths.map((m) => {
        const found = sortedChronological.find((r) => r.month === m);
        if (found) return found;
        return {
          id: `rec-stub-${m}`,
          month: m,
          assetValues: {},
          assetInvestedValues: {},
          monthlyMoneyInvested: 0,
          totalMoneyInvested: 0,
          description: '',
        };
      });
    } else {
      // Yearly view: Group by year, select the latest monthly record of each year as the year-end snapshot
      const yearMap = new Map<string, MonthlyRecord>();
      sortedChronological.forEach((r) => {
        if (r.month && r.month.includes('-')) {
          const yr = r.month.split('-')[0];
          yearMap.set(yr, r); // overwrites with the latest record in that year
        }
      });
      processedRecords = Array.from(yearMap.values());
    }

    // Build data points
    const chartRows = processedRecords.map((rec) => {
      const isStub = rec.id.startsWith('rec-stub-') || Object.keys(rec.assetValues || {}).length === 0;

      const label = barTimeScale === 'yearly'
        ? `${rec.month.split('-')[0]} Year-End`
        : formatMonthName(rec.month);

      if (isStub) {
        const rowData: Record<string, any> = {
          month: rec.month,
          monthLabel: label,
          isStub: true,
          totalInvested: null,
          totalAssetVal: null,
        };
        keys.forEach((k) => {
          rowData[k.id] = null;
        });
        return rowData;
      }

      // Compute total cumulative invested capital dynamically for active filtered assets up to this month
      const recChronoIdx = sortedChronological.findIndex((r) => r.month === rec.month);
      let filteredTotalInvested = 0;
      if (recChronoIdx >= 0) {
        for (let i = 0; i <= recChronoIdx; i++) {
          const r = sortedChronological[i];
          const rawInv = r.assetInvestedValues || {};
          let mInv = 0;
          assets
            .filter((a) => activeAssetIds.includes(a.id))
            .forEach((a) => {
              mInv += rawInv[a.id] || 0;
            });
          if (activeAssetIds.length === assets.length && mInv === 0 && (r.monthlyMoneyInvested || 0) > 0) {
            mInv = r.monthlyMoneyInvested || 0;
          }
          filteredTotalInvested += mInv;
        }
      }
      if (activeAssetIds.length === assets.length && filteredTotalInvested === 0 && (rec.totalMoneyInvested || 0) > 0) {
        filteredTotalInvested = rec.totalMoneyInvested || 0;
      }

      const rowData: Record<string, any> = {
        month: rec.month,
        monthLabel: label,
        isStub: false,
        totalInvested: filteredTotalInvested,
      };

      const rawValues = rec.assetValues || {};

      if (groupMode === 'asset') {
        assets
          .filter((a) => activeAssetIds.includes(a.id))
          .forEach((a) => {
            rowData[a.id] = rawValues[a.id] || 0;
          });
        if (showEmergencyFund) {
          rowData['emergency-fund'] = rec.emergencyFund || 0;
        }
      } else if (groupMode === 'category') {
        categories.forEach((cat) => {
          let sum = 0;
          assets
            .filter((a) => activeAssetIds.includes(a.id) && a.categoryId === cat.id)
            .forEach((a) => {
              sum += rawValues[a.id] || 0;
            });
          rowData[cat.id] = sum;
        });
        if (showEmergencyFund) {
          rowData['emergency-fund'] = rec.emergencyFund || 0;
        }
      } else if (groupMode === 'risk') {
        (['Low', 'Medium', 'High'] as RiskLevel[]).forEach((risk) => {
          let sum = 0;
          assets
            .filter((a) => {
              if (!activeAssetIds.includes(a.id)) return false;
              const cat = categoryMap.get(a.categoryId);
              return cat?.riskLevel === risk;
            })
            .forEach((a) => {
              sum += rawValues[a.id] || 0;
            });
          rowData[risk] = sum;
        });
        if (showEmergencyFund) {
          rowData['Low'] = (rowData['Low'] || 0) + (rec.emergencyFund || 0);
        }
      }

      // Compute total sum for this row
      let totalAssetVal = 0;
      keys.forEach((k) => {
        totalAssetVal += rowData[k.id] || 0;
      });
      rowData.totalAssetVal = totalAssetVal;

      return rowData;
    });

    const activeRows = chartRows.filter((r) => !r.isStub && (r.totalAssetVal || 0) > 0);
    const latestRow = activeRows.length > 0 ? activeRows[activeRows.length - 1] : (chartRows.length > 0 ? chartRows[chartRows.length - 1] : null);
    const keyTotals = new Map<string, number>();
    keys.forEach((k) => keyTotals.set(k.id, 0));
    chartRows.forEach((row) => {
      keys.forEach((k) => {
        keyTotals.set(k.id, (keyTotals.get(k.id) || 0) + (Number(row[k.id]) || 0));
      });
    });

    if (groupMode === 'risk') {
      const riskOrder: Record<string, number> = { Low: 0, Medium: 1, High: 2 };
      keys.sort((a, b) => (riskOrder[a.id] ?? 99) - (riskOrder[b.id] ?? 99));
    } else {
      keys.sort((a, b) => {
        const latestB = latestRow ? (Number(latestRow[b.id]) || 0) : 0;
        const latestA = latestRow ? (Number(latestRow[a.id]) || 0) : 0;
        if (latestB !== latestA) {
          return latestB - latestA;
        }
        const valB = keyTotals.get(b.id) || 0;
        const valA = keyTotals.get(a.id) || 0;
        return valB - valA;
      });
    }

    return { barChartData: chartRows, stackKeys: keys };
  }, [records, groupMode, assets, activeAssetIds, categories, categoryMap, assetColors, barTimeScale, barYearMode, pieSelectedYear, showEmergencyFund]);

  const yMax = useMemo(() => {
    if (!barChartData || barChartData.length === 0) return 1000;
    let max = 0;
    barChartData.forEach((d) => {
      const assetVal = Number(d.totalAssetVal) || 0;
      const invVal = Number(d.totalInvested) || 0;
      if (assetVal > max) max = assetVal;
      if (invVal > max) max = invVal;
    });
    return max > 0 ? Math.ceil(max * 1.08) : 1000;
  }, [barChartData]);

  // Selected bar data point for highlighting stacked bar in growth chart (only active in Both Views mode)
  const selectedBarData = useMemo(() => {
    if (chartType !== 'all') return null;
    if (!barChartData || barChartData.length === 0) return null;
    if (barTimeScale === 'yearly') {
      return barChartData.find((d) => d.month && d.month.split('-')[0] === pieSelectedYear);
    }
    return barChartData.find((d) => d.month === selectedMonth);
  }, [chartType, barChartData, barTimeScale, pieSelectedYear, selectedMonth]);

  const selectedMonthLabel = selectedBarData?.monthLabel;

  // Auto-scroll growth chart container to bring highlighted bar into view
  React.useEffect(() => {
    if (scrollContainerRef.current && barChartData.length > 0 && selectedBarData) {
      const selectedIdx = barChartData.findIndex((d) => d.month === selectedBarData.month);
      if (selectedIdx >= 0) {
        const container = scrollContainerRef.current;
        const targetScrollLeft = (selectedIdx / barChartData.length) * container.scrollWidth - container.clientWidth / 2;
        container.scrollTo({ left: Math.max(0, targetScrollLeft), behavior: 'smooth' });
      }
    }
  }, [selectedBarData, barChartData]);

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-6 shadow-md mb-8">
      
      {/* Visualizations Toolbar */}
      <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4 border-b border-slate-800 pb-4 mb-6">
        
        <div className="flex flex-wrap items-center gap-3">
          {/* Toggle between Summary (Both), Portfolio & Asset Growth */}
          <div className="flex items-center space-x-1.5 bg-slate-950 p-1 rounded-xl border border-slate-800">
            <button
              onClick={() => handleSetChartType('all')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                chartType === 'all'
                  ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Layers className="w-4 h-4" />
              <span>Summary</span>
            </button>

            <button
              onClick={() => handleSetChartType('pie')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                chartType === 'pie'
                  ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <PieChartIcon className="w-4 h-4" />
              <span>Portfolio</span>
            </button>

            <button
              onClick={() => handleSetChartType('stackedBar')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                chartType === 'stackedBar'
                  ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <BarChart3 className="w-4 h-4" />
              <span>Asset Growth</span>
            </button>
          </div>
        </div>

        {/* Grouping Mode Switcher (Assets / Categories / Risk Level) */}
        <div className="flex items-center space-x-2">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider hidden sm:inline flex items-center gap-1">
            <Layers className="w-3.5 h-3.5 text-emerald-400" />
            Group By:
          </span>
          <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800">
            <button
              onClick={() => setGroupMode('asset')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                groupMode === 'asset'
                  ? 'bg-slate-800 text-emerald-400 font-semibold border border-slate-700'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Assets
            </button>
            <button
              onClick={() => setGroupMode('category')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                groupMode === 'category'
                  ? 'bg-slate-800 text-emerald-400 font-semibold border border-slate-700'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Categories
            </button>
            <button
              onClick={() => setGroupMode('risk')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                groupMode === 'risk'
                  ? 'bg-slate-800 text-emerald-400 font-semibold border border-slate-700'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Risk Levels
            </button>
          </div>
        </div>

        {/* Sub-toolbar Controls: Shared Year & Month Selectors (Parent area above both Portfolio & Asset Growth) */}
        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          {/* Shared Year Dropdown */}
          <div className="flex items-center space-x-2 bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs shadow-sm">
            <Calendar className="w-3.5 h-3.5 text-emerald-400" />
            <span className="text-slate-400 font-medium">Year:</span>
            <select
              value={pieSelectedYear}
              onChange={(e) => setPieSelectedYear(e.target.value)}
              className="bg-transparent text-slate-200 font-semibold focus:outline-none cursor-pointer"
            >
              {pieAvailableYears.map((yr) => (
                <option key={yr} value={yr} className="bg-slate-900 text-slate-200">
                  {yr}
                </option>
              ))}
            </select>
          </div>

          {/* Shared Month Dropdown */}
          <div className="flex items-center space-x-2 bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs shadow-sm">
            <span className="text-slate-400 font-medium">Month:</span>
            <select
              value={pieSelectedMonthNum}
              onChange={(e) => setPieSelectedMonthNum(e.target.value)}
              className="bg-transparent text-slate-200 font-semibold focus:outline-none cursor-pointer"
            >
              {pieAvailableMonths.map((m) => (
                <option key={m.monthNum} value={m.monthNum} className="bg-slate-900 text-slate-200">
                  {m.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Charts Section Container */}
      <div className={chartType === 'all' ? "grid grid-cols-1 xl:grid-cols-2 gap-8" : ""}>

        {/* ---------------------------------------------------- */}
        {/* PIE CHART RENDER */}
        {/* ---------------------------------------------------- */}
        {(chartType === 'pie' || chartType === 'all') && (
          <div className={chartType === 'all' ? "bg-slate-950/40 p-5 rounded-2xl border border-slate-800/80" : ""}>
            {chartType === 'all' && (
              <div className="flex items-center justify-between mb-4 border-b border-slate-800/80 pb-3">
                <div className="flex items-center gap-2">
                  <PieChartIcon className="w-4 h-4 text-emerald-400" />
                  <span className="text-xs font-bold text-slate-200 uppercase tracking-wider">Portfolio</span>
                </div>
              </div>
            )}
            {pieChartData.length === 0 ? (
              <div className="py-16 text-center text-slate-500 text-sm flex flex-col items-center justify-center">
                <Info className="w-8 h-8 text-slate-600 mb-2" />
                <p>No active asset values for {formatMonthName(selectedMonth)} under current filter.</p>
                <p className="text-xs text-slate-600 mt-1">Try enabling more assets in the filter bar above.</p>
              </div>
            ) : (
              <div className={chartType !== 'all' ? "grid grid-cols-1 lg:grid-cols-12 gap-6 items-center" : "flex flex-col lg:flex-row lg:items-center gap-6"}>
                
                {/* Pie / Donut Canvas */}
                <div className={chartType !== 'all' ? "lg:col-span-7 h-80 relative flex items-center justify-center" : "w-full lg:w-1/2 h-80 relative flex items-center justify-center"}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                    <Pie
                      data={pieChartData}
                      cx="50%"
                      cy="50%"
                      innerRadius={65}
                      outerRadius={108}
                      paddingAngle={3}
                      dataKey="value"
                      nameKey="name"
                      stroke="#0f172a"
                      strokeWidth={2}
                      isAnimationActive={false}
                      labelLine={false}
                      label={({ cx, cy, midAngle, innerRadius, outerRadius, percent, fill, payload }: any) => {
                        if (percent < 0.005) return null;
                        const percentText = `${(percent * 100).toFixed(0)}%`;
                        const RADIAN = Math.PI / 180;
                        const isSmall = percent < 0.08;
                        const sliceColor = payload?.color || fill || '#10b981';

                        if (!isSmall) {
                          // Large slice: prominent text centered inside
                          const radius = innerRadius + (outerRadius - innerRadius) * 0.52;
                          const x = cx + radius * Math.cos(-midAngle * RADIAN);
                          const y = cy + radius * Math.sin(-midAngle * RADIAN);
                          return (
                            <text
                              x={x}
                              y={y}
                              fill="#ffffff"
                              textAnchor="middle"
                              dominantBaseline="central"
                              className="text-xs sm:text-sm font-black font-mono tracking-tight pointer-events-none drop-shadow-[0_2px_4px_rgba(0,0,0,0.95)]"
                            >
                              {percentText}
                            </text>
                          );
                        }

                        // Small slice (< 8%): leader line with anchor dot pointing outside in the slice's color
                        const cos = Math.cos(-midAngle * RADIAN);
                        const sin = Math.sin(-midAngle * RADIAN);

                        const x0 = cx + (outerRadius + 3) * cos;
                        const y0 = cy + (outerRadius + 3) * sin;

                        const x1 = cx + (outerRadius + 18) * cos;
                        const y1 = cy + (outerRadius + 18) * sin;

                        const isRight = cos >= 0;
                        const x2 = x1 + (isRight ? 12 : -12);
                        const y2 = y1;

                        const textX = x2 + (isRight ? 4 : -4);
                        const textY = y2;
                        const textAnchor = isRight ? 'start' : 'end';

                        return (
                          <g className="pointer-events-none">
                            <path
                              d={`M${x0},${y0} L${x1},${y1} L${x2},${y2}`}
                              stroke={sliceColor}
                              strokeWidth={1.5}
                              fill="none"
                              strokeDasharray="2 2"
                            />
                            <circle cx={x0} cy={y0} r={2.5} fill={sliceColor} />
                            <text
                              x={textX}
                              y={textY}
                              fill="#ffffff"
                              textAnchor={textAnchor}
                              dominantBaseline="central"
                              className="text-xs font-black font-mono tracking-tight drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)]"
                            >
                              {percentText}
                            </text>
                          </g>
                        );
                      }}
                    >
                      {pieChartData.map((entry) => (
                        <Cell key={entry.id} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      isAnimationActive={false}
                      animationDuration={0}
                      wrapperStyle={{ zIndex: 1000, pointerEvents: 'none', transition: 'none' }}
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          const data = payload[0].payload;
                          return (
                            <div className="bg-slate-950 border border-slate-800 p-3 rounded-xl shadow-2xl text-xs space-y-1 relative z-50 pointer-events-none">
                              <div className="flex items-center gap-2">
                                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: data.color }} />
                                <span className="font-bold text-slate-100">{data.name}</span>
                              </div>
                              <div className="text-slate-300 font-mono font-medium">
                                {formatCurrency(data.value, currencySymbol, stealthMode)}
                                {` (${data.percentage.toFixed(1)}%)`}
                              </div>
                              {data.categoryName && (
                                <div className="text-[10px] text-slate-400">
                                  Category: {data.categoryName}
                                </div>
                              )}
                              <div className="text-[10px] text-slate-400">
                                Risk Level: <span className="font-semibold text-slate-200">{data.riskLevel} Risk</span>
                              </div>
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>

                {/* Donut Center Total Portfolio Overlay (z-0 to not block tooltip overlay) */}
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-center z-0 px-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 max-w-[115px] truncate">
                    Total Portfolio
                  </span>
                  {(() => {
                    const formattedTotal = formatCurrency(totalPieValue, currencySymbol, stealthMode);
                    const len = formattedTotal.length;
                    let sizeClass = "text-base sm:text-lg";
                    if (len > 18) sizeClass = "text-[10px] sm:text-xs";
                    else if (len > 13) sizeClass = "text-xs sm:text-sm";
                    else if (len > 9) sizeClass = "text-sm sm:text-base";

                    return (
                      <span className={`font-extrabold text-slate-50 tracking-tight max-w-[115px] truncate leading-tight my-0.5 ${sizeClass}`}>
                        {formattedTotal}
                      </span>
                    );
                  })()}
                  <span className="text-[10px] text-emerald-400 font-medium max-w-[115px] truncate">
                    {formatMonthName(selectedMonth)}
                  </span>
                </div>
              </div>

              {/* Pie Legend & Ratio List with Custom Aesthetic Scrollbar */}
              <div className={chartType !== 'all' ? "lg:col-span-5 space-y-2 max-h-80 overflow-y-auto custom-scrollbar pr-2.5" : "w-full lg:w-1/2 space-y-2 max-h-80 overflow-y-auto custom-scrollbar pr-2.5"}>
                <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 sticky top-0 bg-slate-900/95 py-1 backdrop-blur-xs z-10">
                  {groupMode === 'asset' && 'Asset Allocation Ratio'}
                  {groupMode === 'category' && 'Category Allocation Ratio'}
                  {groupMode === 'risk' && 'Risk Level Exposure Ratio'}
                </h4>

                {pieChartData.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between p-2.5 rounded-xl bg-slate-950/70 border border-slate-800/80 hover:border-emerald-500/40 hover:bg-slate-900/90 transition-none text-xs"
                  >
                    <div className="flex items-center space-x-2.5 min-w-0">
                      <span
                        className="w-3 h-3 rounded-md shrink-0"
                        style={{ backgroundColor: item.color }}
                      />
                      <div className="truncate">
                        <span className="font-semibold text-slate-200 block truncate">
                          {item.name}
                        </span>
                        {item.categoryName && (
                          <span className="text-[10px] text-slate-400 block truncate">
                            {item.categoryName} ({item.riskLevel} Risk)
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="text-right shrink-0 font-mono ml-2">
                      <div className="font-bold text-slate-100">
                        {item.percentage.toFixed(1)}%
                      </div>
                      <div className="text-[11px] text-slate-400">
                        {formatCurrency(item.value, currencySymbol, stealthMode)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

            </div>
          )}
        </div>
      )}

      {/* ---------------------------------------------------- */}
      {/* STACKED BAR CHART RENDER */}
      {/* ---------------------------------------------------- */}
      {(chartType === 'stackedBar' || chartType === 'all') && (
        <div className={`space-y-4 ${chartType === 'all' ? "bg-slate-950/40 p-5 rounded-2xl border border-slate-800/80" : ""}`}>
          {(chartType === 'all' || chartType === 'stackedBar') && (
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3 border-b border-slate-800/80 pb-3">
              <div className="flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-emerald-400" />
                <span className="text-xs font-bold text-slate-200 uppercase tracking-wider">Asset Growth</span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center space-x-1 bg-slate-900 p-1 rounded-lg border border-slate-800 text-xs font-semibold">
                  <button
                    onClick={() => setBarTimeScale('monthly')}
                    className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${
                      barTimeScale === 'monthly'
                        ? 'bg-emerald-500 text-slate-950 shadow-xs font-bold'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Monthly
                  </button>
                  <button
                    onClick={() => setBarTimeScale('yearly')}
                    className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${
                      barTimeScale === 'yearly'
                        ? 'bg-emerald-500 text-slate-950 shadow-xs font-bold'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Yearly
                  </button>
                </div>

                <div
                  className={`flex items-center space-x-1 bg-slate-900 p-1 rounded-lg border border-slate-800 text-xs font-semibold transition-all duration-200 ${
                    barTimeScale === 'monthly' ? 'opacity-100' : 'invisible pointer-events-none'
                  }`}
                >
                  <button
                    onClick={() => setBarYearMode('all')}
                    className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${
                      barYearMode === 'all'
                        ? 'bg-emerald-500 text-slate-950 shadow-xs font-bold'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    All Years
                  </button>
                  <button
                    onClick={() => setBarYearMode('single')}
                    className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${
                      barYearMode === 'single'
                        ? 'bg-emerald-500 text-slate-950 shadow-xs font-bold'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Single Year ({pieSelectedYear})
                  </button>
                </div>

                <div
                  className={`flex items-center gap-1 bg-slate-900 p-1 rounded-lg border border-slate-800 text-xs select-none transition-all duration-200 ${
                    barTimeScale === 'yearly' || barYearMode === 'all'
                      ? 'opacity-100'
                      : 'invisible pointer-events-none'
                  }`}
                >
                  <span className="text-[10px] text-slate-400 uppercase font-semibold px-1">Zoom:</span>
                  <button
                    onClick={() => setZoomLevel((prev) => Math.max(0.25, Number((prev - 0.25).toFixed(2))))}
                    disabled={zoomLevel <= 0.25}
                    className="p-1 rounded-md text-slate-400 hover:text-white disabled:opacity-30 cursor-pointer"
                    title="Zoom Out"
                  >
                    <ZoomOut className="w-3.5 h-3.5" />
                  </button>
                  <span className="font-mono text-[11px] font-bold text-emerald-400 min-w-8 text-center">
                    {Math.round(zoomLevel * 100)}%
                  </span>
                  <button
                    onClick={() => setZoomLevel((prev) => Math.min(3, Number((prev + 0.25).toFixed(2))))}
                    disabled={zoomLevel >= 3}
                    className="p-1 rounded-md text-slate-400 hover:text-white disabled:opacity-30 cursor-pointer"
                    title="Zoom In"
                  >
                    <ZoomIn className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          )}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between text-xs text-slate-400 gap-1 mb-2">
            <span>
              {barTimeScale === 'yearly'
                ? 'Year-over-Year Portfolio Growth & Year-End Capital Invested'
                : `Monthly Portfolio Growth & Capital Invested ${barYearMode === 'all' ? '(All Years)' : `(${pieSelectedYear})`}`}
            </span>
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-1 font-semibold text-emerald-400">
                <span className="w-3 h-0.5 border-b-2 border-dashed border-emerald-400 inline-block"></span>
                Dashed Line = Capital Invested
              </span>
              <span className="text-slate-500">|</span>
              <span className="text-slate-300 font-medium">Stacked by {groupMode}</span>
            </div>
          </div>

          {/* Chart Container with Pinned Y-Axis and Scrollable Data */}
          <div className="border border-slate-800/80 rounded-xl bg-slate-900/40 p-2 sm:p-3 space-y-3">
            <div className="flex flex-row items-stretch w-full overflow-hidden relative">
              {/* Pinned Y-Axis on the left */}
              <div className="w-[84px] shrink-0 h-80 bg-slate-900/90 z-10 border-r border-slate-800/60 select-none pr-1">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart
                    data={barChartData}
                    margin={{ top: 25, right: 0, left: 2, bottom: 35 }}
                  >
                    <XAxis hide dataKey="monthLabel" height={30} />
                    <YAxis
                      domain={[0, yMax]}
                      stroke="#94a3b8"
                      fontSize={11}
                      tickLine={false}
                      axisLine={false}
                      width={78}
                      tickFormatter={(val) => formatCompactCurrency(val, currencySymbol, stealthMode)}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>

              {/* Scrollable X-Axis and Bars area on the right */}
              <div ref={scrollContainerRef} className="flex-1 overflow-x-auto custom-scrollbar">
                <div
                  className="h-80 transition-all duration-300 ease-out"
                  style={{
                    width: barChartData.length > 12 || (barTimeScale === 'yearly' || barYearMode === 'all')
                      ? `${(barChartData.length > 12 ? (barChartData.length / 12) * 100 : 100) * ((barTimeScale === 'yearly' || barYearMode === 'all') ? zoomLevel : 1)}%`
                      : '100%',
                    minWidth: '100%',
                  }}
                >
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart
                      data={barChartData}
                      margin={{ top: 25, right: 25, left: 15, bottom: 35 }}
                      barCategoryGap={barTimeScale === 'yearly' ? "35%" : "15%"}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                      <XAxis
                        dataKey="monthLabel"
                        stroke="#64748b"
                        fontSize={11}
                        tickLine={false}
                        interval={0}
                        height={30}
                        tickFormatter={(value, index) => {
                          if (barTimeScale === 'yearly') {
                            return value.replace(' Year-End', '');
                          }
                          if (chartType === 'all' && barTimeScale === 'monthly') {
                            const item = barChartData[index];
                            if (!item || !item.month) return '';
                            const parts = item.month.split('-');
                            const yr = parts[0];
                            const mo = parseInt(parts[1], 10);
                            if (mo === 3) return barYearMode === 'all' ? `'${yr.slice(2)} Q1` : 'Q1';
                            if (mo === 6) return barYearMode === 'all' ? `'${yr.slice(2)} Q2` : 'Q2';
                            if (mo === 9) return barYearMode === 'all' ? `'${yr.slice(2)} Q3` : 'Q3';
                            if (mo === 12) return barYearMode === 'all' ? `'${yr.slice(2)} Q4` : 'Q4';
                            return '';
                          }
                          if (zoomLevel < 0.6) {
                            const item = barChartData[index];
                            if (!item || !item.month) return '';
                            const year = item.month.split('-')[0];
                            const prevItem = barChartData[index - 1];
                            const prevYear = prevItem?.month ? prevItem.month.split('-')[0] : null;
                            if (year !== prevYear) {
                              return year;
                            }
                            return '';
                          }
                          return value;
                        }}
                      />
                      <YAxis hide domain={[0, yMax]} />
                      <Tooltip
                        isAnimationActive={false}
                        animationDuration={0}
                        wrapperStyle={{ zIndex: 1000, pointerEvents: 'none', transition: 'none' }}
                        content={({ active, payload, label }: any) => {
                          if (active && payload && payload.length) {
                            const dataPoint = payload[0].payload;

                            if (dataPoint.isStub) {
                              return (
                                <div className="bg-slate-950 border border-slate-800 p-3 rounded-xl shadow-xl text-xs font-mono text-slate-400">
                                  <div className="font-bold text-slate-200">{label}</div>
                                  <div className="text-[11px] text-slate-500 mt-1 italic">No recorded data for this period</div>
                                </div>
                              );
                            }

                            const totalVal = Number(dataPoint.totalAssetVal) || 0;
                            const totalInvested = Number(dataPoint.totalInvested) || 0;
                            const floatingPL = totalVal - totalInvested;
                            const plPercent = totalInvested > 0 ? (floatingPL / totalInvested) * 100 : 0;
                            const isPositive = floatingPL >= 0;

                            const stackEntries = payload
                              .filter((p: any) => p.dataKey !== 'totalInvested' && p.dataKey !== 'totalAssetVal' && (Number(p.value) || 0) > 0)
                              .sort((a: any, b: any) => (Number(b.value) || 0) - (Number(a.value) || 0));

                            return (
                              <div className="bg-slate-950 border border-slate-800 p-3.5 rounded-xl shadow-2xl text-xs space-y-2.5 min-w-56 pointer-events-none relative z-50">
                                <div className="border-b border-slate-800 pb-2">
                                  <div className="font-bold text-slate-100 flex items-center justify-between">
                                    <span>{label}</span>
                                    <span className="text-emerald-400 font-mono">
                                      {formatCurrency(totalVal, currencySymbol, stealthMode)}
                                    </span>
                                  </div>
                                  {!showEmergencyFund && (
                                    <>
                                      <div className="flex items-center justify-between text-[11px] mt-1 font-mono">
                                        <span className="text-slate-400">Total Capital Invested:</span>
                                        <span className="text-blue-400 font-semibold">
                                          {formatCurrency(totalInvested, currencySymbol, stealthMode)}
                                        </span>
                                      </div>
                                      <div className="flex items-center justify-between text-[11px] mt-0.5 font-mono font-bold">
                                        <span className="text-slate-400">Net Floating P / L:</span>
                                        <span className={isPositive ? 'text-emerald-400' : 'text-rose-400'}>
                                          {isPositive ? '+' : ''}{formatCurrency(floatingPL, currencySymbol, stealthMode)} ({isPositive ? '+' : ''}{plPercent.toFixed(1)}%)
                                        </span>
                                      </div>
                                    </>
                                  )}
                                </div>

                                <div className="space-y-1 max-h-40 overflow-y-auto">
                                  <span className="text-[10px] text-slate-500 uppercase tracking-wider block font-semibold">
                                    Breakdown ({groupMode}):
                                  </span>
                                  {stackEntries.map((entry, idx) => {
                                    const val = Number(entry.value) || 0;
                                    const share = totalVal > 0 ? (val / totalVal) * 100 : 0;
                                    return (
                                      <div key={`${entry.dataKey || entry.name}-${idx}`} className="flex items-center justify-between font-mono text-[11px]">
                                        <div className="flex items-center gap-1.5 truncate max-w-[140px]">
                                          <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: entry.color }} />
                                          <span className="text-slate-300 truncate">{entry.name}:</span>
                                        </div>
                                        <div className="text-right">
                                          <span className="text-slate-100 font-semibold">
                                            {formatCurrency(val, currencySymbol, stealthMode)}
                                          </span>
                                          <span className="text-[10px] text-slate-400 ml-1 font-normal">
                                            ({share.toFixed(1)}%)
                                          </span>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            );
                          }
                          return null;
                        }}
                      />
                      {stackKeys.map((keyObj, idx) => {
                        const isLastBar = idx === stackKeys.length - 1;
                        return (
                          <Bar
                            key={keyObj.id}
                            dataKey={keyObj.id}
                            name={keyObj.name}
                            stackId="portfolioStack"
                            fill={keyObj.color}
                            radius={isLastBar ? [4, 4, 0, 0] : [0, 0, 0, 0]}
                            maxBarSize={barTimeScale === 'yearly' ? 48 : 36}
                            isAnimationActive={false}
                          >
                            {barChartData.map((entry, cellIdx) => {
                              const isSelected = chartType === 'all' && (
                                barTimeScale === 'yearly'
                                  ? entry.month && entry.month.split('-')[0] === pieSelectedYear
                                  : entry.month === selectedMonth
                              );
                              return (
                                <Cell
                                  key={`cell-${cellIdx}`}
                                  fill={keyObj.color}
                                  fillOpacity={selectedBarData ? (isSelected ? 1 : 0.45) : 1}
                                  stroke={isSelected ? '#34d399' : 'none'}
                                  strokeWidth={isSelected ? 1.5 : 0}
                                  className="cursor-pointer transition-all duration-200"
                                  onClick={() => {
                                    if (entry.month && entry.month.includes('-')) {
                                      const [yr, mo] = entry.month.split('-');
                                      setPieSelectedYear(yr);
                                      setPieSelectedMonthNum(mo);
                                    }
                                  }}
                                />
                              );
                            })}
                          </Bar>
                        );
                      })}
                      {/* Invisible unstacked line to reliably render Total Asset Value Label at the true top of every stacked column */}
                      <Line
                        type="monotone"
                        dataKey="totalAssetVal"
                        stroke="none"
                        dot={false}
                        activeDot={false}
                        legendType="none"
                        isAnimationActive={false}
                      >
                        <LabelList
                          dataKey="totalAssetVal"
                          position="top"
                          offset={6}
                          formatter={(val: any) => {
                            if (val === null || val === undefined) return '';
                            const num = Number(val);
                            return num > 0 ? formatCompactCurrency(num, currencySymbol, stealthMode) : '';
                          }}
                          style={{ fill: '#34d399', fontSize: 10, fontWeight: 700, fontFamily: 'monospace' }}
                        />
                      </Line>
                      {!showEmergencyFund && (
                        <Line
                          type="monotone"
                          dataKey="totalInvested"
                          name="Total Capital Invested"
                          stroke="#38bdf8"
                          strokeWidth={2.5}
                          strokeDasharray="4 4"
                          connectNulls={false}
                          dot={{ r: 4, fill: '#38bdf8', strokeWidth: 2, stroke: '#0f172a' }}
                          activeDot={{ r: 6, fill: '#38bdf8' }}
                          isAnimationActive={false}
                        />
                      )}
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            {/* Pinned Legend at the bottom */}
            <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 pt-3 pb-1 text-xs border-t border-slate-800/60 text-slate-300">
              {stackKeys.map((keyObj) => (
                <div key={keyObj.id} className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-xs shrink-0" style={{ backgroundColor: keyObj.color }} />
                  <span className="text-slate-300 font-medium">{keyObj.name}</span>
                </div>
              ))}
              {!showEmergencyFund && (
                <div className="flex items-center gap-1.5">
                  <span className="w-3.5 h-0.5 border-b-2 border-dashed border-[#38bdf8] inline-block shrink-0" />
                  <span className="text-slate-300 font-medium">Total Capital Invested</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      </div>

    </div>
  );
};
