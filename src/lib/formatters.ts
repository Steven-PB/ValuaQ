/**
 * Format currency values with support for stealth mode
 */
export function formatCurrency(
  value: number,
  currencySymbol: string = 'NT$',
  stealthMode: boolean = false
): string {
  if (stealthMode) {
    return `${currencySymbol} ••••••`;
  }
  
  if (isNaN(value) || value === null || value === undefined) {
    return `${currencySymbol} 0`;
  }

  const isNegative = value < 0;
  const absVal = Math.abs(value);
  
  const formattedNumber = new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 0,
    minimumFractionDigits: 0,
  }).format(absVal);

  return `${isNegative ? '-' : ''}${currencySymbol} ${formattedNumber}`;
}

/**
 * Format compact numbers (e.g. $1.2M, $50K)
 */
export function formatCompactCurrency(
  value: number,
  currencySymbol: string = 'NT$',
  stealthMode: boolean = false
): string {
  if (stealthMode) {
    return `${currencySymbol} •••`;
  }

  if (isNaN(value) || value === null || value === undefined) {
    return `${currencySymbol} 0`;
  }

  const isNegative = value < 0;
  const absVal = Math.abs(value);

  let formatted = '';
  if (absVal >= 1_000_000_000) {
    formatted = `${(absVal / 1_000_000_000).toFixed(2)}B`;
  } else if (absVal >= 1_000_000) {
    formatted = `${(absVal / 1_000_000).toFixed(2)}M`;
  } else if (absVal >= 1_000) {
    formatted = `${(absVal / 1_000).toFixed(1)}K`;
  } else {
    formatted = absVal.toFixed(0);
  }

  return `${isNegative ? '-' : ''}${currencySymbol} ${formatted}`;
}

/**
 * Format percentages (e.g., +15.4%, -2.1%)
 */
export function formatPercent(value: number, stealthMode: boolean = false): string {
  if (stealthMode) return '•••%';
  if (isNaN(value) || !isFinite(value)) return '0.0%';

  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(1)}%`;
}

/**
 * Format month string "2026-01" -> "Jan 2026"
 */
export function formatMonthName(monthStr: string): string {
  if (!monthStr || !monthStr.includes('-')) return monthStr;
  const [year, month] = monthStr.split('-');
  const date = new Date(parseInt(year, 10), parseInt(month, 10) - 1, 1);
  return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

/**
 * Risk level color helpers
 */
export function getRiskLevelBadgeClass(riskLevel: string): string {
  switch (riskLevel) {
    case 'Low':
      return 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800/50';
    case 'Medium':
      return 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-800/50';
    case 'High':
      return 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-400 dark:border-rose-800/50';
    default:
      return 'bg-slate-50 text-slate-700 border-slate-200';
  }
}

export function getRiskLevelColor(riskLevel: string): string {
  switch (riskLevel) {
    case 'Low':
      return '#10b981'; // Emerald
    case 'Medium':
      return '#f59e0b'; // Amber
    case 'High':
      return '#ef4444'; // Rose
    default:
      return '#64748b';
  }
}

/**
 * Live input masking helper: formats a numeric or partial string with thousand separators (commas).
 * Examples:
 * "1000000" -> "1,000,000"
 * "12500.5" -> "12,500.5"
 * "" -> ""
 */
export function formatNumberWithCommas(value: string | number | null | undefined): string {
  if (value === '' || value === null || value === undefined) return '';
  const str = String(value).trim();
  const clean = str.replace(/[^0-9.]/g, '');
  if (!clean) return '';

  const parts = clean.split('.');
  let integerPart = parts[0].replace(/^0+(?=\d)/, '');
  if (integerPart === '') integerPart = '0';
  
  const formattedInteger = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  
  if (parts.length > 1) {
    // Keep decimal point and up to 4 decimal places
    const decimals = parts.slice(1).join('').slice(0, 4);
    return `${formattedInteger}.${decimals}`;
  }
  return formattedInteger;
}

/**
 * Strips commas and parses string into a valid number
 */
export function parseFormattedNumber(val: string | number | null | undefined): number {
  if (val === '' || val === null || val === undefined) return 0;
  if (typeof val === 'number') return isNaN(val) ? 0 : val;
  const num = parseFloat(String(val).replace(/,/g, ''));
  return isNaN(num) ? 0 : num;
}

