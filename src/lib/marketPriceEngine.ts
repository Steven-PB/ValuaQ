import { Asset, MonthlyPriceMap, RiskLevel } from '../types';

const SPOT_PRICE_CACHE_KEY = 'valuaq_spot_prices_cache_v2';

export interface MarketSearchResult {
  symbol: string;
  name: string;
  shortname: string;
  exchange: string;
  quoteType: string;
  categoryName: string;
  riskLevel: RiskLevel;
  categoryColor: string;
  currency: string;
  usdTwdRate: number;
  livePrice?: number;
  livePriceNTD?: number;
}

export function loadCachedSpotPrices(): Record<string, number> {
  try {
    const raw = localStorage.getItem(SPOT_PRICE_CACHE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.error('Failed to load spot prices cache', e);
  }
  return {};
}

export function saveCachedSpotPrices(prices: Record<string, number>): void {
  try {
    localStorage.setItem(SPOT_PRICE_CACHE_KEY, JSON.stringify(prices));
  } catch (e) {
    console.error('Failed to save spot prices cache', e);
  }
}

/**
 * Searches real-time capital market assets across global exchanges, US stocks, Taiwan equities,
 * crypto, and commodities via the server-side market API.
 */
export async function searchLiveMarketAssets(query: string): Promise<MarketSearchResult[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  try {
    const res = await fetch(`/api/market/search?q=${encodeURIComponent(trimmed)}`);
    if (res.ok) {
      const data = await res.json();
      const quotes = data.quotes || [];
      return quotes;
    }
  } catch (err) {
    console.warn('API market search failed, falling back to local catalog', err);
  }

  return [];
}

/**
 * Fetches real-time price quotes for given ticker symbols.
 */
export async function fetchLiveMarketQuotes(
  symbols: string[]
): Promise<Record<string, { price: number; priceNTD: number; currency: string; changePercent?: number }>> {
  if (symbols.length === 0) return {};

  try {
    const res = await fetch(`/api/market/quote?symbols=${encodeURIComponent(symbols.join(','))}`);
    if (res.ok) {
      const data = await res.json();
      return data.quotes || {};
    }
  } catch (err) {
    console.warn('Failed to fetch market quotes from server API', err);
  }

  return {};
}

/**
 * Fetches historical price on the 1st day of a given month (YYYY-MM-01) for an asset.
 */
export async function fetchHistoricalPriceForDate(
  symbol: string,
  dateStr: string
): Promise<{ priceNTD: number; rawPrice: number; currency: string } | null> {
  try {
    const res = await fetch(`/api/market/historical?symbol=${encodeURIComponent(symbol)}&date=${encodeURIComponent(dateStr)}`);
    if (res.ok) {
      const data = await res.json();
      return {
        priceNTD: data.priceNTD,
        rawPrice: data.rawPrice,
        currency: data.currency,
      };
    }
  } catch (err) {
    console.warn(`Historical lookup failed for ${symbol} on ${dateStr}`, err);
  }
  return null;
}

const FX_RATES_CACHE_KEY = 'valuaq_fx_rates_cache_v1';

export function loadCachedFxRates(): Record<string, number> {
  const defaults: Record<string, number> = {
    USD: 32.5,
    USDT: 32.5,
    USDC: 32.5,
    IDR: 0.002,
    EUR: 35.0,
    JPY: 0.215,
    GBP: 42.0,
    AUD: 21.5,
    CAD: 23.5,
    SGD: 24.5,
    CNY: 4.5,
    HKD: 4.15,
    NTD: 1,
    TWD: 1,
  };
  try {
    const raw = localStorage.getItem(FX_RATES_CACHE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        return { ...defaults, ...parsed, NTD: 1, TWD: 1 };
      }
    }
  } catch (e) {
    console.error('Failed to load FX rates cache', e);
  }
  return defaults;
}

export function saveCachedFxRates(rates: Record<string, number>): void {
  try {
    localStorage.setItem(FX_RATES_CACHE_KEY, JSON.stringify({ ...rates, NTD: 1, TWD: 1 }));
  } catch (e) {
    console.error('Failed to save FX rates cache', e);
  }
}

/**
 * Fetches real-time FX currency conversion rates relative to NTD (TWD).
 */
export async function fetchLiveFxRates(): Promise<Record<string, number>> {
  try {
    const res = await fetch('/api/market/fx');
    if (res.ok) {
      const data = await res.json();
      if (data.rates && typeof data.rates === 'object') {
        saveCachedFxRates(data.rates);
        return data.rates;
      }
      if (data.USD_TWD) {
        const nextRates = {
          ...loadCachedFxRates(),
          USD: data.USD_TWD,
          USDT: data.USD_TWD,
          USDC: data.USD_TWD,
          NTD: 1,
          TWD: 1,
        };
        saveCachedFxRates(nextRates);
        return nextRates;
      }
    }
  } catch (err) {
    console.warn('Failed to fetch live FX rates:', err);
  }
  return loadCachedFxRates();
}

/**
 * Fetches real-time prices for assets with ticker symbols and foreign currency holdings
 * using live server-side market feeds and FX rates. Denominated in NT$ (TWD).
 */
export async function fetchLiveMarketPrices(
  assets: Asset[],
  currentCache: Record<string, number> = {}
): Promise<Record<string, number>> {
  const updatedPrices: Record<string, number> = { ...currentCache };

  // Fetch live FX rates table
  let fxRates: Record<string, number> = loadCachedFxRates();
  try {
    const liveRates = await fetchLiveFxRates();
    if (liveRates && Object.keys(liveRates).length > 0) {
      fxRates = { ...fxRates, ...liveRates };
    }
  } catch {
    // fallback to default
  }

  // Identify symbols to query for market benchmark quotes
  const symbolToAssetIds: Record<string, string[]> = {};

  assets.forEach((a) => {
    const curr = (a.currency || 'NTD').toUpperCase();
    const isNtd = curr === 'NTD' || curr === 'TWD';
    const sym = (a.tickerSymbol || '').trim().toUpperCase();

    // Case 1: Cash in NTD / TWD -> always exactly 1.00 base
    if (a.isCash && isNtd) {
      updatedPrices[a.id] = 1;
      return;
    }

    // Case 2: Cash in foreign currency (e.g. USD, USDT, USDC, IDR, EUR, JPY)
    if (a.isCash) {
      const rate =
        fxRates[curr] ||
        (curr === 'USD' || curr === 'USDT' || curr === 'USDC'
          ? fxRates['USD'] || 32.5
          : a.currentPrice && a.currentPrice > 0 && a.currentPrice !== 1
          ? a.currentPrice
          : 1);
      updatedPrices[a.id] = rate;
      return;
    }

    // Case 3: Asset has a market equity/crypto/commodity ticker symbol
    if (sym && sym !== 'USD' && sym !== 'TWD' && !sym.startsWith('NTD-')) {
      if (!symbolToAssetIds[sym]) symbolToAssetIds[sym] = [];
      symbolToAssetIds[sym].push(a.id);
      return;
    }

    // Case 4: Custom / self-managed non-cash asset without a live market ticker (e.g. custom USD holding)
    if (curr === 'USD' || curr === 'USDT' || curr === 'USDC') {
      const usdRate = fxRates['USD'] || 32.5;
      updatedPrices[a.id] =
        a.currentPrice && a.currentPrice > 1 ? a.currentPrice : usdRate;
    } else if (a.currentPrice !== undefined && a.currentPrice > 0) {
      updatedPrices[a.id] = a.currentPrice;
    } else {
      updatedPrices[a.id] = fxRates[curr] || 1;
    }
  });

  // Query live market quotes for assets with symbols
  const uniqueSymbols = Object.keys(symbolToAssetIds);
  if (uniqueSymbols.length > 0) {
    try {
      const quotes = await fetchLiveMarketQuotes(uniqueSymbols);
      Object.entries(quotes).forEach(([sym, quoteData]) => {
        const assetIds = symbolToAssetIds[sym] || [];
        assetIds.forEach((id) => {
          if (quoteData && typeof quoteData.priceNTD === 'number' && quoteData.priceNTD > 0) {
            updatedPrices[id] = quoteData.priceNTD;
          }
        });
      });
    } catch (err) {
      console.warn('Real-time quote batch update error', err);
    }
  }

  saveCachedSpotPrices(updatedPrices);
  return updatedPrices;
}

/**
 * Saves or updates a 1st-of-month price snapshot for a specific month and asset.
 */
export function setMonthlyPriceSnapshot(
  monthlyPrices: MonthlyPriceMap,
  month: string,
  assetId: string,
  price: number
): MonthlyPriceMap {
  const currentMonthPrices = { ...(monthlyPrices[month] || {}) };
  currentMonthPrices[assetId] = price;

  return {
    ...monthlyPrices,
    [month]: currentMonthPrices,
  };
}
