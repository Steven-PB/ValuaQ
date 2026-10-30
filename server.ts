import express from 'express';
import type { Request, Response } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

app.use(express.json());

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// Cache for FX rates (rates to TWD) with 5-minute TTL
let fxRatesCache: { rates: Record<string, number>; timestamp: number } = {
  rates: {
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
    NTD: 1,
    TWD: 1,
  },
  timestamp: 0,
};

async function getFxRates(): Promise<Record<string, number>> {
  const now = Date.now();
  if (now - fxRatesCache.timestamp < 300000 && Object.keys(fxRatesCache.rates).length > 2) {
    return fxRatesCache.rates;
  }

  const baseRates: Record<string, number> = { ...fxRatesCache.rates };

  // Try Yahoo Finance USD/TWD first
  let usdToTwd = baseRates['USD'] || 32.5;
  try {
    const res = await fetch('https://query1.finance.yahoo.com/v8/finance/chart/TWD=X?interval=1d&range=1d', {
      headers: { 'User-Agent': USER_AGENT }
    });
    if (res.ok) {
      const data = await res.json();
      const price = data.chart?.result?.[0]?.meta?.regularMarketPrice;
      if (price && typeof price === 'number') {
        usdToTwd = Math.round(price * 1000) / 1000;
        baseRates['USD'] = usdToTwd;
        baseRates['USDT'] = usdToTwd;
        baseRates['USDC'] = usdToTwd;
      }
    }
  } catch (err) {
    console.warn('Yahoo FX fetch failed', err);
  }

  // Next query open-er API to get cross-currency rates relative to USD
  try {
    const res = await fetch('https://open.er-api.com/v6/latest/USD');
    if (res.ok) {
      const data = await res.json();
      const erTwd = data.rates?.TWD;
      if (erTwd && typeof erTwd === 'number') {
        usdToTwd = erTwd;
        baseRates['USD'] = erTwd;
        baseRates['USDT'] = erTwd;
        baseRates['USDC'] = erTwd;
      }
      baseRates['TWD'] = 1;
      baseRates['NTD'] = 1;

      const crossCurrencies = ['EUR', 'JPY', 'GBP', 'AUD', 'CAD', 'SGD', 'CNY', 'HKD', 'CHF', 'KRW'];
      for (const cur of crossCurrencies) {
        const curInUsd = data.rates?.[cur];
        if (curInUsd && typeof curInUsd === 'number' && curInUsd > 0) {
          baseRates[cur] = Math.round((usdToTwd / curInUsd) * 10000) / 10000;
        }
      }
    }
  } catch (err) {
    console.warn('Open-er FX fallback failed', err);
  }

  fxRatesCache = { rates: baseRates, timestamp: now };
  return baseRates;
}

async function getUsdTwdRate(): Promise<number> {
  const rates = await getFxRates();
  return rates['USD'] || 32.5;
}

// Map ticker or exchange to suggested asset category & risk
function inferCategoryAndRisk(quote: {
  symbol: string;
  quoteType?: string;
  exchange?: string;
  shortname?: string;
  longname?: string;
}) {
  const symbol = (quote.symbol || '').toUpperCase();
  const type = (quote.quoteType || '').toUpperCase();
  const name = (quote.longname || quote.shortname || '').toLowerCase();
  const exch = (quote.exchange || '').toUpperCase();

  if (symbol.endsWith('.TW') || symbol.endsWith('.TWO') || exch === 'TAIWAN' || exch === 'TAI' || exch === 'TWO') {
    if (type === 'ETF' || name.includes('etf') || name.includes('trust')) {
      return { categoryName: 'Taiwan Equities', riskLevel: 'Medium' as const, color: '#0ea5e9' };
    }
    return { categoryName: 'Taiwan Equities', riskLevel: 'High' as const, color: '#0ea5e9' };
  }

  if (type === 'CRYPTOCURRENCY' || symbol.includes('-USD') || symbol.includes('-USDT') || name.includes('bitcoin') || name.includes('crypto')) {
    return { categoryName: 'Cryptocurrencies', riskLevel: 'High' as const, color: '#f59e0b' };
  }

  if (symbol === 'GC=F' || symbol.startsWith('GOLD') || name.includes('gold') || name.includes('silver') || symbol === 'SI=F') {
    return { categoryName: 'Precious Metals', riskLevel: 'Low' as const, color: '#eab308' };
  }

  if (type === 'ETF' || name.includes('bond') || symbol.includes('BND') || symbol.includes('TLT') || symbol.includes('IEF')) {
    if (name.includes('bond') || name.includes('treasury')) {
      return { categoryName: 'Fixed Income & Bonds', riskLevel: 'Low' as const, color: '#8b5cf6' };
    }
    return { categoryName: 'US Stocks & ETFs', riskLevel: 'Medium' as const, color: '#3b82f6' };
  }

  if (type === 'EQUITY') {
    return { categoryName: 'US Stocks & ETFs', riskLevel: 'High' as const, color: '#3b82f6' };
  }

  return { categoryName: 'Capital Market Assets', riskLevel: 'Medium' as const, color: '#10b981' };
}

// 1. Unified Search Endpoint across Capital Markets (Stocks, ETFs, Crypto, Commodities, Indices)
app.get('/api/market/search', async (req: Request, res: Response) => {
  try {
    const query = ((req.query.q as string) || '').trim();
    if (!query) {
      return res.json({ quotes: [] });
    }

    const usdTwd = await getUsdTwdRate();

    // Query Yahoo Finance Search
    const searchUrl = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}&quotesCount=15&newsCount=0&enableFuzzyQuery=true`;
    const yfRes = await fetch(searchUrl, {
      headers: { 'User-Agent': USER_AGENT }
    });

    let yahooQuotes: any[] = [];
    if (yfRes.ok) {
      const data = await yfRes.json();
      yahooQuotes = data.quotes || [];
    }

    // Format results
    const results = yahooQuotes
      .filter((q) => q.symbol && (q.quoteType === 'EQUITY' || q.quoteType === 'ETF' || q.quoteType === 'CRYPTOCURRENCY' || q.quoteType === 'COMMODITY' || q.quoteType === 'CURRENCY' || q.quoteType === 'INDEX'))
      .map((q) => {
        const catInfo = inferCategoryAndRisk(q);
        return {
          symbol: q.symbol,
          name: q.longname || q.shortname || q.symbol,
          shortname: q.shortname || q.longname || q.symbol,
          exchange: q.exchDisp || q.exchange || 'Market',
          quoteType: q.quoteType,
          categoryName: catInfo.categoryName,
          riskLevel: catInfo.riskLevel,
          categoryColor: catInfo.color,
          currency: q.currency || (q.symbol.endsWith('.TW') ? 'TWD' : 'USD'),
          usdTwdRate: usdTwd,
        };
      });

    // If query looks like a crypto not found or general coin, query CoinGecko search fallback
    if (results.length === 0 || query.toLowerCase().includes('btc') || query.toLowerCase().includes('eth') || query.toLowerCase().includes('sol')) {
      try {
        const cgRes = await fetch(`https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(query)}`);
        if (cgRes.ok) {
          const cgData = await cgRes.json();
          const coins = (cgData.coins || []).slice(0, 5);
          for (const coin of coins) {
            results.push({
              symbol: `${coin.symbol.toUpperCase()}-USD`,
              name: `${coin.name} (${coin.symbol.toUpperCase()})`,
              shortname: coin.name,
              exchange: 'CoinGecko Crypto',
              quoteType: 'CRYPTOCURRENCY',
              categoryName: 'Cryptocurrencies',
              riskLevel: 'High' as const,
              categoryColor: '#f59e0b',
              currency: 'USD',
              usdTwdRate: usdTwd,
            });
          }
        }
      } catch (cgErr) {
        // Ignore fallback error
      }
    }

    return res.json({ quotes: results, usdTwdRate: usdTwd });
  } catch (error: any) {
    console.error('Market search error:', error);
    return res.status(500).json({ error: error.message || 'Failed to search market assets' });
  }
});

// 2. Real-Time Quotes Endpoint (Single or Multiple Comma-Separated Symbols)
app.get('/api/market/quote', async (req: Request, res: Response) => {
  try {
    const symbolsParam = ((req.query.symbols as string) || '').trim();
    if (!symbolsParam) {
      return res.json({ quotes: {} });
    }

    const symbols = symbolsParam.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);
    const usdTwd = await getUsdTwdRate();
    const quotesMap: Record<string, {
      symbol: string;
      price: number;
      priceNTD: number;
      currency: string;
      change?: number;
      changePercent?: number;
      lastUpdated: string;
    }> = {};

    // Fetch in parallel using chart endpoint
    await Promise.all(
      symbols.map(async (sym) => {
        try {
          const res = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=1d&range=1d`, {
            headers: { 'User-Agent': USER_AGENT }
          });
          if (res.ok) {
            const data = await res.json();
            const meta = data.chart?.result?.[0]?.meta;
            if (meta && typeof meta.regularMarketPrice === 'number') {
              const rawPrice = meta.regularMarketPrice;
              const currency = (meta.currency || (sym.endsWith('.TW') ? 'TWD' : 'USD')).toUpperCase();
              
              let priceNTD = rawPrice;
              if (currency === 'USD') {
                priceNTD = rawPrice * usdTwd;
              } else if (currency === 'TWD') {
                priceNTD = rawPrice;
              }

              // Special conversion for Gold futures GC=F (troy oz to grams: 1 troy oz = 31.1034768 grams)
              if (sym === 'GC=F' || sym === 'GOLD') {
                priceNTD = (rawPrice * usdTwd) / 31.1035;
              }

              quotesMap[sym] = {
                symbol: sym,
                price: rawPrice,
                priceNTD: Math.round(priceNTD * 100) / 100,
                currency,
                change: meta.regularMarketPrice - (meta.previousClose || meta.chartPreviousClose || meta.regularMarketPrice),
                changePercent: meta.chartPreviousClose ? ((meta.regularMarketPrice - meta.chartPreviousClose) / meta.chartPreviousClose) * 100 : 0,
                lastUpdated: new Date().toISOString(),
              };
            }
          }
        } catch (err) {
          console.warn(`Failed to fetch quote for ${sym}:`, err);
        }
      })
    );

    return res.json({ quotes: quotesMap, usdTwdRate: usdTwd });
  } catch (error: any) {
    console.error('Quotes fetch error:', error);
    return res.status(500).json({ error: error.message || 'Failed to fetch quotes' });
  }
});

// 3. Historical Price Endpoint (1st day of month price lookup)
app.get('/api/market/historical', async (req: Request, res: Response) => {
  try {
    const symbol = ((req.query.symbol as string) || '').trim().toUpperCase();
    const dateStr = ((req.query.date as string) || '').trim(); // Expected YYYY-MM-01

    if (!symbol || !dateStr) {
      return res.status(400).json({ error: 'symbol and date (YYYY-MM-01) are required' });
    }

    const usdTwd = await getUsdTwdRate();
    const targetDate = new Date(`${dateStr}T00:00:00Z`);
    const p1 = Math.floor(targetDate.getTime() / 1000) - 86400 * 4; // look back 4 days in case 1st falls on a weekend
    const p2 = Math.floor(targetDate.getTime() / 1000) + 86400 * 3;

    const resYf = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?period1=${p1}&period2=${p2}&interval=1d`, {
      headers: { 'User-Agent': USER_AGENT }
    });

    if (resYf.ok) {
      const data = await resYf.json();
      const meta = data.chart?.result?.[0]?.meta;
      const timestamps = data.chart?.result?.[0]?.timestamp || [];
      const closes = data.chart?.result?.[0]?.indicators?.quote?.[0]?.close || [];
      const currency = (meta?.currency || (symbol.endsWith('.TW') ? 'TWD' : 'USD')).toUpperCase();

      if (timestamps.length > 0 && closes.length > 0) {
        // Pick the close price closest to the target date
        let bestClose = closes[closes.length - 1];
        let minDiff = Infinity;
        const targetSec = Math.floor(targetDate.getTime() / 1000);

        for (let i = 0; i < timestamps.length; i++) {
          if (closes[i] !== null && closes[i] !== undefined) {
            const diff = Math.abs(timestamps[i] - targetSec);
            if (diff < minDiff) {
              minDiff = diff;
              bestClose = closes[i];
            }
          }
        }

        let priceNTD = bestClose;
        if (currency === 'USD') {
          priceNTD = bestClose * usdTwd;
        }
        if (symbol === 'GC=F' || symbol === 'GOLD') {
          priceNTD = (bestClose * usdTwd) / 31.1035;
        }

        return res.json({
          symbol,
          date: dateStr,
          rawPrice: bestClose,
          priceNTD: Math.round(priceNTD * 100) / 100,
          currency,
        });
      }
    }

    return res.status(404).json({ error: `Could not retrieve historical price for ${symbol} around ${dateStr}` });
  } catch (error: any) {
    console.error('Historical price error:', error);
    return res.status(500).json({ error: error.message || 'Failed to fetch historical price' });
  }
});

// 4. Currency and FX endpoint
app.get('/api/market/fx', async (_req: Request, res: Response) => {
  const rates = await getFxRates();
  const usdTwd = rates['USD'] || 32.5;
  res.json({
    base: 'USD',
    USD_TWD: usdTwd,
    rates,
    lastUpdated: new Date().toISOString(),
  });
});

// Mount Vite or static serving
async function setupViteOrStatic() {
  const isDev = process.env.NODE_ENV !== 'production';

  if (isDev) {
    process.env.DISABLE_HMR = 'true';
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false,
        ws: false,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`ValuaQ server running at http://0.0.0.0:${PORT} (dev: ${isDev})`);
  });
}

setupViteOrStatic().catch((err) => {
  console.error('Failed to start ValuaQ server:', err);
  process.exit(1);
});
