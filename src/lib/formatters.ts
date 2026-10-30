/**
 * Format currency values (stored canonically in NTD) into the active Multi-Currency Base
 * with support for stealth mode.
 */
export function formatCurrency(
  value: number,
  currencySymbol: string = 'NT$',
  stealthMode: boolean = false
): string {
  const baseCode = resolveCurrencyCodeFromSymbolOrCode(currencySymbol);
  const displaySymbol = getCurrencySymbolForCode(baseCode);

  if (stealthMode) {
    return `${displaySymbol} ••••••`;
  }

  if (isNaN(value) || value === null || value === undefined) {
    return `${displaySymbol} 0`;
  }

  const converted = convertPriceFromNTD(value, baseCode);
  const isNegative = converted < 0;
  const absVal = Math.abs(converted);

  const isZeroDecimalCurrency = baseCode === 'NTD' || baseCode === 'JPY' || baseCode === 'IDR';
  const showDecimals = !isZeroDecimalCurrency && absVal > 0 && absVal < 100;

  const formattedNumber = new Intl.NumberFormat('en-US', {
    maximumFractionDigits: showDecimals ? 2 : 0,
    minimumFractionDigits: showDecimals && !Number.isInteger(Math.round(absVal * 100) / 100) ? 2 : 0,
  }).format(absVal);

  return `${isNegative ? '-' : ''}${displaySymbol} ${formattedNumber}`;
}

/**
 * Format compact numbers (e.g. $1.2M, $50K, Rp 250M, Rp 1.5B) in the active Multi-Currency Base
 */
export function formatCompactCurrency(
  value: number,
  currencySymbol: string = 'NT$',
  stealthMode: boolean = false
): string {
  const baseCode = resolveCurrencyCodeFromSymbolOrCode(currencySymbol);
  const displaySymbol = getCurrencySymbolForCode(baseCode);

  if (stealthMode) {
    return `${displaySymbol} •••`;
  }

  if (isNaN(value) || value === null || value === undefined) {
    return `${displaySymbol} 0`;
  }

  const converted = convertPriceFromNTD(value, baseCode);
  const isNegative = converted < 0;
  const absVal = Math.abs(converted);

  let formatted = '';
  if (absVal >= 1_000_000_000_000) {
    formatted = `${(absVal / 1_000_000_000_000).toFixed(2)}T`;
  } else if (absVal >= 1_000_000_000) {
    formatted = `${(absVal / 1_000_000_000).toFixed(2)}B`;
  } else if (absVal >= 1_000_000) {
    formatted = `${(absVal / 1_000_000).toFixed(2)}M`;
  } else if (absVal >= 1_000) {
    formatted = `${(absVal / 1_000).toFixed(1)}K`;
  } else if (absVal > 0 && absVal < 10 && baseCode !== 'NTD' && baseCode !== 'JPY' && baseCode !== 'IDR') {
    formatted = absVal.toFixed(2);
  } else {
    formatted = absVal.toFixed(0);
  }

  return `${isNegative ? '-' : ''}${displaySymbol} ${formatted}`;
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
 * Checks whether a month key corresponds to the current live period (2026-11)
 */
export function isLiveMonth(monthStr?: string | null): boolean {
  if (!monthStr) return false;
  const trimmed = monthStr.trim();
  return trimmed === '2026-11' || trimmed.toLowerCase() === 'live';
}

/**
 * Format month string "2026-01" -> "Jan 2026", or "2026-11" -> "Live"
 */
export function formatMonthName(monthStr: string): string {
  if (!monthStr) return monthStr;
  if (isLiveMonth(monthStr)) return 'Live';
  if (!monthStr.includes('-')) return monthStr;
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

export const SUPPORTED_PRICE_CURRENCIES = [
  { code: 'NTD', symbol: 'NT$', label: 'NTD (NT$)' },
  { code: 'IDR', symbol: 'Rp', label: 'IDR (Rp)' },
  { code: 'USD', symbol: 'US$', label: 'USD (US$)' },
  { code: 'JPY', symbol: '¥', label: 'JPY (¥)' },
  { code: 'EUR', symbol: '€', label: 'EUR (€)' },
  { code: 'GBP', symbol: '£', label: 'GBP (£)' },
  { code: 'HKD', symbol: 'HK$', label: 'HKD (HK$)' },
  { code: 'SGD', symbol: 'S$', label: 'SGD (S$)' },
  { code: 'AUD', symbol: 'A$', label: 'AUD (A$)' },
  { code: 'CAD', symbol: 'C$', label: 'CAD (C$)' },
  { code: 'CNY', symbol: 'CN¥', label: 'CNY (CN¥)' },
] as const;

export const SUPPORTED_BASE_CURRENCIES = SUPPORTED_PRICE_CURRENCIES;

const DEFAULT_FX_RATES_TO_NTD: Record<string, number> = {
  NTD: 1,
  TWD: 1,
  IDR: 0.002,
  USD: 32.5,
  USDT: 32.5,
  USDC: 32.5,
  EUR: 35.0,
  JPY: 0.215,
  GBP: 42.0,
  AUD: 21.5,
  CAD: 23.5,
  SGD: 24.5,
  CNY: 4.5,
  HKD: 4.15,
  CHF: 36.5,
  KRW: 0.024,
};

export function normalizeCurrencyCode(code?: string | null): string {
  if (!code) return 'NTD';
  const upper = code.trim().toUpperCase();
  if (!upper || upper === 'TWD' || upper === 'NT$') return 'NTD';
  if (upper === 'RP') return 'IDR';
  if (upper === 'US$' || upper === '$') return 'USD';
  if (upper === '¥') return 'JPY';
  if (upper === '€') return 'EUR';
  if (upper === '£') return 'GBP';
  if (upper === 'HK$') return 'HKD';
  if (upper === 'S$') return 'SGD';
  if (upper === 'A$') return 'AUD';
  if (upper === 'C$') return 'CAD';
  if (upper === 'CN¥' || upper === 'RMB') return 'CNY';
  return upper;
}

export function resolveCurrencyCodeFromSymbolOrCode(symbolOrCode?: string | null): string {
  return normalizeCurrencyCode(symbolOrCode);
}

/**
 * Returns the configured display currency for an asset's unit price (defaults to 'NTD' unless configured).
 */
export function getAssetPriceCurrency(
  asset?: { priceCurrency?: string; currency?: string } | null
): string {
  if (!asset) return 'NTD';
  if (asset.priceCurrency && asset.priceCurrency.trim()) {
    return normalizeCurrencyCode(asset.priceCurrency);
  }
  return 'NTD';
}

export function getCurrencySymbolForCode(code?: string | null): string {
  const norm = normalizeCurrencyCode(code);
  switch (norm) {
    case 'NTD':
      return 'NT$';
    case 'IDR':
      return 'Rp';
    case 'USD':
    case 'USDT':
    case 'USDC':
      return 'US$';
    case 'JPY':
      return '¥';
    case 'EUR':
      return '€';
    case 'GBP':
      return '£';
    case 'HKD':
      return 'HK$';
    case 'SGD':
      return 'S$';
    case 'AUD':
      return 'A$';
    case 'CAD':
      return 'C$';
    case 'CNY':
      return 'CN¥';
    default:
      return norm;
  }
}

export function getFxRateToNTD(
  currencyCode?: string | null,
  customFxRates?: Record<string, number>
): number {
  const norm = normalizeCurrencyCode(currencyCode);
  if (norm === 'NTD') return 1;

  if (customFxRates && customFxRates[norm] && customFxRates[norm] > 0) {
    return customFxRates[norm];
  }

  try {
    const raw = localStorage.getItem('valuaq_fx_rates_cache_v1');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed[norm] === 'number' && parsed[norm] > 0) {
        return parsed[norm];
      }
      if ((norm === 'USDT' || norm === 'USDC') && typeof parsed['USD'] === 'number' && parsed['USD'] > 0) {
        return parsed['USD'];
      }
    }
  } catch {
    // ignore storage read error
  }

  return DEFAULT_FX_RATES_TO_NTD[norm] || 1;
}

/**
 * Converts a base NTD unit price into the target display currency.
 */
export function convertPriceFromNTD(
  priceInNTD: number,
  targetCurrency?: string | null,
  customFxRates?: Record<string, number>
): number {
  if (!priceInNTD || isNaN(priceInNTD)) return 0;
  const norm = normalizeCurrencyCode(targetCurrency);
  if (norm === 'NTD') return priceInNTD;
  const rate = getFxRateToNTD(norm, customFxRates);
  return rate > 0 ? priceInNTD / rate : priceInNTD;
}

/**
 * Converts a unit price from a display currency back into base NTD.
 */
export function convertPriceToNTD(
  priceInCurrency: number,
  sourceCurrency?: string | null,
  customFxRates?: Record<string, number>
): number {
  if (!priceInCurrency || isNaN(priceInCurrency)) return 0;
  const norm = normalizeCurrencyCode(sourceCurrency);
  if (norm === 'NTD') return priceInCurrency;
  const rate = getFxRateToNTD(norm, customFxRates);
  return rate > 0 ? priceInCurrency * rate : priceInCurrency;
}

/**
 * Formats an asset's unit price (stored internally in base NTD) in the asset's chosen display currency.
 */
export function formatAssetUnitPrice(
  priceInNTD: number,
  assetOrCurrency?: { priceCurrency?: string; currency?: string; isCash?: boolean } | string | null,
  stealthMode: boolean = false,
  customFxRates?: Record<string, number>
): string {
  const targetCurr =
    typeof assetOrCurrency === 'string'
      ? normalizeCurrencyCode(assetOrCurrency)
      : getAssetPriceCurrency(assetOrCurrency);
  const sym = getCurrencySymbolForCode(targetCurr);

  if (stealthMode) {
    return `${sym} ••••`;
  }

  if (isNaN(priceInNTD) || priceInNTD === null || priceInNTD === undefined) {
    return `${sym} 0`;
  }

  const converted = convertPriceFromNTD(priceInNTD, targetCurr, customFxRates);
  const isNegative = converted < 0;
  const absVal = Math.abs(converted);

  let minDecimals = 0;
  let maxDecimals = 2;

  if (targetCurr === 'NTD') {
    if (absVal >= 100 && Math.abs(absVal - Math.round(absVal)) < 0.01) {
      minDecimals = 0;
      maxDecimals = 0;
    } else if (absVal > 0 && absVal < 1) {
      minDecimals = 2;
      maxDecimals = 4;
    } else {
      minDecimals = Number.isInteger(Math.round(absVal * 100) / 100) ? 0 : 2;
      maxDecimals = 2;
    }
  } else if (targetCurr === 'JPY' || targetCurr === 'IDR') {
    minDecimals = absVal >= 10 ? 0 : 2;
    maxDecimals = absVal >= 10 ? 0 : 4;
  } else {
    if (absVal > 0 && absVal < 1) {
      minDecimals = 2;
      maxDecimals = 4;
    } else {
      minDecimals = 2;
      maxDecimals = 2;
    }
  }

  const formattedNumber = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: minDecimals,
    maximumFractionDigits: maxDecimals,
  }).format(absVal);

  return `${isNegative ? '-' : ''}${sym} ${formattedNumber}`;
}


