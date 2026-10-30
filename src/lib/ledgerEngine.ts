import { Asset, LedgerTransaction, MonthlyPriceMap, MonthlyRecord, MonthlyNotesMap } from '../types';

/**
 * Determines whether an asset is designated as an Emergency Fund (Safety Net Reserve).
 * Emergency Fund assets are:
 * - Included in Total Capital (Total Capital = Total Assets + Emergency Fund)
 * - Strictly excluded from Total Assets (Investments), Total Money Invested, Floating P/L, and Rebalancing.
 */
export function isEmergencyFundAsset(asset?: Asset | null): boolean {
  if (!asset) return false;
  if (asset.isEmergencyFund) return true;
  const lower = (asset.name || '').toLowerCase();
  return (
    lower.includes('emergency fund') ||
    lower.includes('emergency reserve') ||
    lower.includes('safety net')
  );
}

/**
 * Calculates cumulative asset quantities up to a specific date (inclusive).
 * If targetDate is not provided, calculates current holdings across all transactions.
 *
 * Rules:
 * - 'add': Deposited into toAssetId (+toValue)
 * - 'dividend': Passive yield/dividend added into toAssetId (+toValue), 0 deducted from fromAssetId
 * - 'convert': Deducted from fromAssetId (-fromValue), added to toAssetId (+toValue)
 */
export function calculateHoldingsAtDate(
  transactions: LedgerTransaction[],
  targetDate?: string
): Record<string, number> {
  const holdings: Record<string, number> = {};

  const sorted = [...transactions].sort((a, b) => a.date.localeCompare(b.date));

  for (const tx of sorted) {
    if (targetDate && tx.date > targetDate) {
      continue;
    }

    if (tx.action === 'add' || tx.action === 'dividend') {
      const toVal = Number(tx.toValue) || 0;
      holdings[tx.toAssetId] = (holdings[tx.toAssetId] || 0) + toVal;
    } else if (tx.action === 'convert') {
      const fromVal = Number(tx.fromValue) || 0;
      const toVal = Number(tx.toValue) || 0;

      if (tx.fromAssetId) {
        holdings[tx.fromAssetId] = (holdings[tx.fromAssetId] || 0) - fromVal;
      }
      holdings[tx.toAssetId] = (holdings[tx.toAssetId] || 0) + toVal;
    } else if (tx.action === 'withdraw') {
      const deductVal = Number(tx.fromValue || tx.toValue) || 0;
      const targetId = tx.fromAssetId || tx.toAssetId;
      if (targetId) {
        holdings[targetId] = (holdings[targetId] || 0) - deductVal;
      }
    }
  }

  // Clean up tiny floating point precision artifacts (e.g., 0.0000000000001)
  for (const assetId in holdings) {
    if (Math.abs(holdings[assetId]) < 1e-8) {
      holdings[assetId] = 0;
    }
  }

  return holdings;
}

export interface GuardBandValidationResult {
  isValid: boolean;
  availableAtDate: number;
  currentHolding: number;
  effectiveAvailable: number;
  remainingAfterConvert: number;
  guardBandFloor: number;
  reason?: 'empty' | 'negative' | 'below_guard_band';
  errorMessage?: string;
}

/**
 * Validates that converting `fromValue` from `fromAsset` on `txDate` will NOT cause
 * that specific asset (Cash NTD, Cash USD, or any other asset, tracked independently)
 * to drop below 0 (>= 0 is allowed, 0 is included) or below its configured Guard Band floor at `txDate`
 * or at any subsequent point in the ledger timeline.
 */
export function validateConvertGuardBand(
  transactions: LedgerTransaction[],
  fromAsset: Asset | undefined,
  fromValue: number,
  txDate?: string,
  excludeTxId?: string
): GuardBandValidationResult {
  const filteredTx = excludeTxId
    ? transactions.filter((t) => t.id !== excludeTxId)
    : transactions;

  if (!fromAsset) {
    return {
      isValid: false,
      availableAtDate: 0,
      currentHolding: 0,
      effectiveAvailable: 0,
      remainingAfterConvert: 0,
      guardBandFloor: 0,
      reason: 'empty',
      errorMessage: 'Please select a source asset to convert from.',
    };
  }

  const assetId = fromAsset.id;
  const assetLabel = `${fromAsset.name}${fromAsset.currency ? ` (${fromAsset.currency})` : ''}`;
  const guardBandFloor = Math.max(0, Number(fromAsset.guardBand) || 0);

  // Current holding across all transactions
  const allHoldings = calculateHoldingsAtDate(filteredTx);
  const currentHolding = allHoldings[assetId] || 0;

  // Holding on txDate (if specified) - strictly the amount available on that day
  const dateHoldings = txDate ? calculateHoldingsAtDate(filteredTx, txDate) : allHoldings;
  const availableAtDate = dateHoldings[assetId] || 0;

  // The available amount to convert on txDate is the balance available on that day (>= 0)
  const effectiveAvailable = Math.max(0, txDate ? availableAtDate : currentHolding);
  const deduct = Math.max(0, Number(fromValue) || 0);
  const rawRemaining = effectiveAvailable - deduct;
  const remainingAfterConvert = Math.abs(rawRemaining) < 1e-8 ? 0 : rawRemaining;

  if (effectiveAvailable <= 0) {
    return {
      isValid: false,
      availableAtDate,
      currentHolding,
      effectiveAvailable,
      remainingAfterConvert,
      guardBandFloor,
      reason: 'empty',
      errorMessage: `Guard Band Locked: ${assetLabel} has 0 available balance to convert on ${txDate || 'this date'}.`,
    };
  }

  if (deduct > 0 && remainingAfterConvert < 0) {
    return {
      isValid: false,
      availableAtDate,
      currentHolding,
      effectiveAvailable,
      remainingAfterConvert,
      guardBandFloor,
      reason: 'negative',
      errorMessage: `Guard Band Triggered: Deducting ${deduct.toLocaleString()} exceeds available ${assetLabel} balance (${effectiveAvailable.toLocaleString()}) on ${txDate || 'this date'}. Balance cannot drop below 0.`,
    };
  }

  if (deduct > 0 && guardBandFloor > 0 && remainingAfterConvert < guardBandFloor) {
    return {
      isValid: false,
      availableAtDate,
      currentHolding,
      effectiveAvailable,
      remainingAfterConvert,
      guardBandFloor,
      reason: 'below_guard_band',
      errorMessage: `Guard Band Triggered: Converting ${deduct.toLocaleString()} leaves ${remainingAfterConvert.toLocaleString()} in ${assetLabel}, which is below its Guard Band floor of ${guardBandFloor.toLocaleString()}.`,
    };
  }

  return {
    isValid: true,
    availableAtDate,
    currentHolding,
    effectiveAvailable,
    remainingAfterConvert,
    guardBandFloor,
  };
}

/**
 * Calculates net investment capital delta for a single transaction in base currency (NTD).
 * - 'add' into non-Emergency-Fund cash/asset: +toValue * rate
 * - 'add' into Emergency Fund cash: 0 (quarantined from investment capital)
 * - 'dividend': 0 (organic portfolio yield; increases asset holdings & Floating P/L without increasing out-of-pocket capital invested)
 * - 'withdraw' from non-EF: -fromValue * rate
 * - 'withdraw' from EF: 0 (safety net spend has zero impact on investment capital)
 * - 'convert' from non-EF to EF: -fromValue * rate (moved out of investments into safety net)
 * - 'convert' from EF to non-EF: +fromValue * rate (moved from safety net into investments)
 */
export function getTransactionInvestmentCapitalDelta(
  tx: LedgerTransaction,
  assetMap: Map<string, Asset>,
  defaultUsdRate: number = 32.5
): number {
  const toAsset = assetMap.get(tx.toAssetId);
  const fromAsset = tx.fromAssetId ? assetMap.get(tx.fromAssetId) : undefined;
  const isToEF = isEmergencyFundAsset(toAsset);
  const isFromEF = isEmergencyFundAsset(fromAsset);

  const getAssetRate = (ast: Asset | undefined): number => {
    if (!ast) return 1;
    const curr = (ast.currency || 'NTD').toUpperCase();
    if (curr === 'NTD' || curr === 'TWD') return 1;
    if (ast.currentPrice && ast.currentPrice > 1) return ast.currentPrice;
    if (curr === 'USD' || curr === 'USDT' || curr === 'USDC') return defaultUsdRate;
    if (curr === 'EUR') return 35.0;
    if (curr === 'JPY') return 0.22;
    return ast.currentPrice || 1;
  };

  if (tx.action === 'add') {
    if (isToEF) return 0;
    const curr = (toAsset?.currency || 'NTD').toUpperCase();
    const isNtdCash = Boolean(toAsset?.isCash) && (curr === 'NTD' || curr === 'TWD');
    if (!isNtdCash && Number(tx.fromValue) > 0) {
      return Number(tx.fromValue);
    }
    const rate = getAssetRate(toAsset);
    return (Number(tx.toValue) || 0) * rate;
  }

  if (tx.action === 'dividend') {
    return 0;
  }

  if (tx.action === 'withdraw') {
    const asset = fromAsset || toAsset;
    // Withdrawing from Emergency Fund has 0 impact on investment capital
    if (isEmergencyFundAsset(asset)) return 0;
    // Withdrawing from investment cash or asset decreases net out-of-pocket capital invested
    const val = Number(tx.fromValue || tx.toValue) || 0;
    const rate = getAssetRate(asset);
    return -val * rate;
  }

  if (tx.action === 'convert') {
    if (!isFromEF && isToEF) {
      const rate = getAssetRate(fromAsset);
      return -((Number(tx.fromValue) || 0) * rate);
    }
    if (isFromEF && !isToEF) {
      const rate = getAssetRate(fromAsset);
      return (Number(tx.fromValue) || 0) * rate;
    }
  }

  return 0;
}

/**
 * Calculates the base-currency (NTD) value of a 'dividend' transaction for investment assets
 * (excluding Emergency Fund interest so investment yield metrics remain purely investment-focused).
 */
export function getTransactionDividendValueNTD(
  tx: LedgerTransaction,
  assetMap: Map<string, Asset>,
  priceLookup?: Record<string, number>
): number {
  if (tx.action !== 'dividend') return 0;
  const toAsset = assetMap.get(tx.toAssetId);
  if (isEmergencyFundAsset(toAsset)) return 0;

  const qty = Number(tx.toValue) || 0;
  if (!toAsset) return qty;

  const curr = (toAsset.currency || 'NTD').toUpperCase();
  const isNtdCash = toAsset.isCash && (curr === 'NTD' || curr === 'TWD');
  if (isNtdCash) return qty;

  const price =
    (priceLookup && priceLookup[toAsset.id] !== undefined
      ? priceLookup[toAsset.id]
      : toAsset.currentPrice) || 1;
  return qty * price;
}

/**
 * Calculates cumulative money invested (excluding Emergency Fund) up to a target date.
 */
export function calculateInvestedAtDate(
  transactions: LedgerTransaction[],
  targetDate?: string,
  assets: Asset[] = []
): { monthlyDeposits: Record<string, number>; totalInvestedUpToDate: number } {
  let totalInvestedUpToDate = 0;
  const monthlyDeposits: Record<string, number> = {};

  const assetMap = new Map<string, Asset>();
  assets.forEach((a) => assetMap.set(a.id, a));

  const sorted = [...transactions].sort((a, b) => a.date.localeCompare(b.date));

  for (const tx of sorted) {
    if (targetDate && tx.date > targetDate) {
      continue;
    }

    const delta =
      assetMap.size > 0
        ? getTransactionInvestmentCapitalDelta(tx, assetMap)
        : tx.action === 'add'
        ? Number(tx.toValue) || 0
        : 0;

    if (delta !== 0) {
      totalInvestedUpToDate += delta;
      const monthKey = tx.date.slice(0, 7); // "YYYY-MM"
      monthlyDeposits[monthKey] = (monthlyDeposits[monthKey] || 0) + delta;
    }
  }

  return { monthlyDeposits, totalInvestedUpToDate: Math.max(0, totalInvestedUpToDate) };
}

/**
 * Computes all unique historical months that have occurred up to today, plus the upcoming live month.
 * The active/upcoming live month is November (now is November), e.g. '2026-11'.
 * Historical months are completed past months up to October (e.g. May through Oct 2026).
 */
export function getTimelineMonths(
  transactions: LedgerTransaction[],
  savedPrices: MonthlyPriceMap
): { historicalMonths: string[]; liveUpcomingMonth: string } {
  const now = new Date();
  let liveYear = now.getFullYear();
  let liveMonthNum = now.getMonth() + 1; // 1 - 12

  // The upcoming/live month is November (now is November), e.g. '2026-11'
  if (liveYear === 2026 && liveMonthNum <= 11) {
    liveMonthNum = 11;
  }
  const liveUpcomingMonth = `${liveYear}-${String(liveMonthNum).padStart(2, '0')}`;

  const monthsSet = new Set<string>();

  // Ensure completed historical months prior to the live month exist (e.g. May to Oct)
  if (liveUpcomingMonth === '2026-11') {
    ['2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10'].forEach((m) => {
      monthsSet.add(m);
    });
  } else {
    // Collect previous 6 months before live upcoming month
    const [ly, lm] = liveUpcomingMonth.split('-').map(Number);
    for (let i = 6; i >= 1; i--) {
      let dMonth = lm - i;
      let dYear = ly;
      while (dMonth <= 0) {
        dMonth += 12;
        dYear -= 1;
      }
      monthsSet.add(`${dYear}-${String(dMonth).padStart(2, '0')}`);
    }
  }

  // Collect all months from transactions (except the live month)
  transactions.forEach((tx) => {
    if (tx.date && tx.date.length >= 7) {
      const txMonth = tx.date.slice(0, 7);
      if (txMonth !== liveUpcomingMonth) {
        monthsSet.add(txMonth);
      }
    }
  });

  // Collect all months from saved prices (except the live month)
  Object.keys(savedPrices || {}).forEach((m) => {
    if (m !== liveUpcomingMonth) {
      monthsSet.add(m);
    }
  });

  // Ensure liveUpcomingMonth is strictly removed from historical months so it sits as the live row
  monthsSet.delete(liveUpcomingMonth);

  // Sort chronologically
  const historicalMonths = Array.from(monthsSet).sort();

  return { historicalMonths, liveUpcomingMonth };
}

/**
/**
 * Resolves the unit valuation price in base currency (NTD) for an asset.
 * Guarantees that USD and foreign currency assets (like Cash USD, IBKR USD)
 * are properly converted using exchange rates instead of erroneously being priced at 1 NTD.
 */
export function getAssetBasePrice(
  asset: Asset,
  savedPricesForMonth?: Record<string, number>,
  livePricesLookup?: Record<string, number>,
  defaultUsdRate: number = 32.5
): number {
  const curr = (asset.currency || 'NTD').toUpperCase();
  const isNtd = curr === 'NTD' || curr === 'TWD';
  if (asset.isCash && isNtd) {
    return 1;
  }

  // 1. Check saved snapshot for this historical month
  if (savedPricesForMonth && savedPricesForMonth[asset.id] !== undefined) {
    const p = savedPricesForMonth[asset.id];
    // If currency is USD/USDT and saved price was erroneously stored as 1, correct it to defaultUsdRate
    if ((curr === 'USD' || curr === 'USDT' || curr === 'USDC') && p === 1) {
      return defaultUsdRate;
    }
    if (p > 0) return p;
  }

  // 2. Check live prices cache
  if (livePricesLookup && livePricesLookup[asset.id] !== undefined) {
    const p = livePricesLookup[asset.id];
    if ((curr === 'USD' || curr === 'USDT' || curr === 'USDC') && p === 1) {
      return defaultUsdRate;
    }
    if (p > 0) return p;
  }

  // 3. Check asset.currentPrice
  if (asset.currentPrice !== undefined && asset.currentPrice > 0) {
    if ((curr === 'USD' || curr === 'USDT' || curr === 'USDC') && asset.currentPrice === 1) {
      return defaultUsdRate;
    }
    return asset.currentPrice;
  }

  // 4. Default exchange rates by currency
  if (curr === 'USD' || curr === 'USDT' || curr === 'USDC') {
    return defaultUsdRate;
  }
  if (curr === 'EUR') return 35.0;
  if (curr === 'JPY') return 0.22;
  if (curr === 'GBP') return 42.0;
  if (curr === 'AUD') return 21.5;
  if (curr === 'CAD') return 23.5;
  if (curr === 'SGD') return 24.5;

  return 1;
}

/**
 * Generates MonthlyRecord[] from transactions, asset definitions, saved monthly prices, and live prices.
 *
 * Emergency Fund & Dividend Rules Enforced:
 * 1. Emergency Fund assets (`isEmergencyFundAsset`) are accumulated into `record.emergencyFund`.
 * 2. `record.assetValues` only contains investment assets (excluding Emergency Fund).
 * 3. `monthlyMoneyInvested` and `totalMoneyInvested` strictly exclude Emergency Fund deposits and Dividend/Interest yield.
 * 4. `monthlyDividendIncome` and `totalDividendIncome` track passive yield added to investment assets.
 */
export function generateMonthlyRecordsFromLedger(
  transactions: LedgerTransaction[],
  assets: Asset[],
  monthlyPrices: MonthlyPriceMap,
  livePrices: Record<string, number>,
  monthlyNotes: MonthlyNotesMap = {}
): MonthlyRecord[] {
  const { historicalMonths, liveUpcomingMonth } = getTimelineMonths(transactions, monthlyPrices);

  const assetMap = new Map<string, Asset>();
  assets.forEach((a) => assetMap.set(a.id, a));

  const records: MonthlyRecord[] = [];
  let runningInvested = 0;
  let runningDividends = 0;
  let prevDay1Date: string | null = null;

  const isNtdCashAsset = (ast: Asset | undefined): boolean => {
    if (!ast) return false;
    const curr = (ast.currency || 'NTD').toUpperCase();
    const sym = (ast.tickerSymbol || '').toUpperCase();
    return Boolean(ast.isCash) && (curr === 'NTD' || curr === 'TWD' || sym === 'TWD' || sym === 'NTD');
  };

  const isForeignCashOrStableAsset = (ast: Asset | undefined): boolean => {
    if (!ast || isNtdCashAsset(ast)) return false;
    const curr = (ast.currency || '').toUpperCase();
    const sym = (ast.tickerSymbol || '').toUpperCase();
    const name = (ast.name || '').toLowerCase();
    return (
      Boolean(ast.isCash) ||
      sym === 'USDT' ||
      sym === 'USDC' ||
      sym === 'USD' ||
      sym === 'BUSD' ||
      sym === 'DAI' ||
      name.includes('usdt') ||
      name.includes('usdc') ||
      name.includes('cash usd') ||
      (Boolean(ast.isCash) && curr !== 'NTD' && curr !== 'TWD')
    );
  };

  const getAssetRate = (ast: Asset | undefined, defaultUsdRate: number = 32.5): number => {
    if (!ast) return 1;
    const curr = (ast.currency || 'NTD').toUpperCase();
    if (curr === 'NTD' || curr === 'TWD') return 1;
    if (ast.currentPrice && ast.currentPrice > 1) return ast.currentPrice;
    if (curr === 'USD' || curr === 'USDT' || curr === 'USDC') return defaultUsdRate;
    if (curr === 'EUR') return 35.0;
    if (curr === 'JPY') return 0.22;
    return ast.currentPrice || 1;
  };

  // ============================================================================
  // HYBRID ALGORITHM:
  // 1. Recursive DAG Chain-Rule Unit-Cost Resolver (with cycle detection)
  // 2. Chronological Principal-First FIFO Lot-Tracking Engine
  // ============================================================================

  // Build backwards adjacency list: for any asset C, record all incoming conversions (P -> C)
  // and direct explicit-NTD deposits so we can recursively resolve UnitCost_NTD(C) = Sum(UnitCost_NTD(P) * fromVal) / Sum(toVal)
  interface IncomingConversionEdge {
    fromAssetId: string;
    fromValue: number;
    toValue: number;
  }
  const incomingEdgesByAsset = new Map<string, IncomingConversionEdge[]>();
  const directExplicitNtdByAsset = new Map<string, { totalNtd: number; totalQty: number }>();

  for (const tx of transactions) {
    if (tx.action === 'add' && tx.toAssetId) {
      const tAst = assetMap.get(tx.toAssetId);
      const toVal = Number(tx.toValue) || 0;
      const explicitNtd = Number(tx.fromValue) || 0;
      if (toVal > 0 && !isNtdCashAsset(tAst) && explicitNtd > 0) {
        const cur = directExplicitNtdByAsset.get(tx.toAssetId) || { totalNtd: 0, totalQty: 0 };
        cur.totalNtd += explicitNtd;
        cur.totalQty += toVal;
        directExplicitNtdByAsset.set(tx.toAssetId, cur);
      }
    } else if (tx.action === 'convert' && tx.fromAssetId && tx.toAssetId) {
      const fromVal = Number(tx.fromValue) || 0;
      const toVal = Number(tx.toValue) || 0;
      if (fromVal > 0 && toVal > 0 && tx.fromAssetId !== tx.toAssetId) {
        const list = incomingEdgesByAsset.get(tx.toAssetId) || [];
        list.push({
          fromAssetId: tx.fromAssetId,
          fromValue: fromVal,
          toValue: toVal,
        });
        incomingEdgesByAsset.set(tx.toAssetId, list);
      }
    }
  }

  const resolvedChainUnitCostCache = new Map<string, number>();

  /**
   * Recursively resolves the Base Cash (NTD) unit cost of `assetId` by walking
   * backwards along all incoming conversion chains (C <- B <- A (NTD)) using the chain rule:
   *   BaseNTD(B -> C) = resolveChainUnitCostNTD(B) * fromValue
   *   UnitCostNTD(C)  = Sum(BaseNTD) / Sum(toValue)
   * Includes `visited` cycle guard to prevent infinite recursion on round-trip trades (e.g. USDT <-> BTC).
   */
  const resolveChainUnitCostNTD = (assetId: string, visited: Set<string> = new Set()): number => {
    const ast = assetMap.get(assetId);
    if (!ast) return 1;
    if (isNtdCashAsset(ast)) return 1;
    if (resolvedChainUnitCostCache.has(assetId)) {
      return resolvedChainUnitCostCache.get(assetId)!;
    }
    if (visited.has(assetId)) {
      // Cycle detected (e.g. round-trip conversion A -> B -> A); break cycle using fallback rate
      return getAssetRate(ast);
    }

    const nextVisited = new Set(visited);
    nextVisited.add(assetId);

    let totalBaseNtd = 0;
    let totalUnitsAcquired = 0;

    // 1. Include any direct 'add' with explicit NTD principal
    const direct = directExplicitNtdByAsset.get(assetId);
    if (direct && direct.totalQty > 0 && direct.totalNtd > 0) {
      totalBaseNtd += direct.totalNtd;
      totalUnitsAcquired += direct.totalQty;
    }

    // 2. Recursively accumulate from all incoming conversion edges (P -> assetId)
    const edges = incomingEdgesByAsset.get(assetId) || [];
    for (const edge of edges) {
      // Skip edges that form an immediate 2-hop cycle back to an already-visited ancestor
      if (nextVisited.has(edge.fromAssetId)) continue;
      const parentUnitCostNTD = resolveChainUnitCostNTD(edge.fromAssetId, nextVisited);
      if (parentUnitCostNTD > 0) {
        totalBaseNtd += parentUnitCostNTD * edge.fromValue;
        totalUnitsAcquired += edge.toValue;
      }
    }

    const unitCost =
      totalUnitsAcquired > 1e-8 && totalBaseNtd > 0
        ? totalBaseNtd / totalUnitsAcquired
        : getAssetRate(ast);

    if (visited.size === 0) {
      resolvedChainUnitCostCache.set(assetId, unitCost);
    }
    return unitCost;
  };

  // Pre-warm the recursive cache for all assets
  assets.forEach((a) => {
    resolveChainUnitCostNTD(a.id);
  });

  // Group transactions by date and topologically sort same-date conversion chains
  // so multi-hop conversions on the same date (e.g. NTD -> IDR -> USDT -> BTC) always execute in causal order.
  const getTxPriority = (tx: LedgerTransaction): number => {
    if (tx.action === 'add' || tx.action === 'dividend') return 1;
    if (tx.action === 'convert') {
      const fAst = tx.fromAssetId ? assetMap.get(tx.fromAssetId) : undefined;
      const tAst = assetMap.get(tx.toAssetId);
      if (isNtdCashAsset(fAst) && isForeignCashOrStableAsset(tAst)) return 2;
      if (isNtdCashAsset(fAst)) return 3;
      if (isForeignCashOrStableAsset(fAst) && isForeignCashOrStableAsset(tAst)) return 4;
      if (isForeignCashOrStableAsset(fAst)) return 5;
      return 6;
    }
    if (tx.action === 'withdraw') return 7;
    return 6;
  };

  const sortSameDateTopologically = (dayTxs: LedgerTransaction[]): LedgerTransaction[] => {
    if (dayTxs.length <= 1) return dayTxs;
    const baseSorted = [...dayTxs].sort((a, b) => {
      const prioCmp = getTxPriority(a) - getTxPriority(b);
      if (prioCmp !== 0) return prioCmp;
      const timeA = a.createdAt || a.id || '';
      const timeB = b.createdAt || b.id || '';
      return timeA.localeCompare(timeB);
    });

    // Kahn's topological sort for same-date convert chains (if tx A produces toAssetId that tx B consumes as fromAssetId)
    const n = baseSorted.length;
    const inDegree = new Array<number>(n).fill(0);
    const adj: number[][] = Array.from({ length: n }, () => []);

    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        if (i === j) continue;
        const txA = baseSorted[i];
        const txB = baseSorted[j];
        if (
          (txA.action === 'add' || txA.action === 'dividend' || txA.action === 'convert') &&
          txB.action === 'convert' &&
          txA.toAssetId &&
          txA.toAssetId === txB.fromAssetId &&
          txA.fromAssetId !== txB.toAssetId
        ) {
          adj[i].push(j);
          inDegree[j]++;
        }
      }
    }

    const result: LedgerTransaction[] = [];
    const used = new Array<boolean>(n).fill(false);

    for (let step = 0; step < n; step++) {
      let pick = -1;
      for (let i = 0; i < n; i++) {
        if (!used[i] && inDegree[i] === 0) {
          pick = i;
          break;
        }
      }
      if (pick === -1) {
        for (let i = 0; i < n; i++) {
          if (!used[i]) {
            pick = i;
            break;
          }
        }
      }
      used[pick] = true;
      result.push(baseSorted[pick]);
      for (const next of adj[pick]) {
        inDegree[next]--;
      }
    }

    return result;
  };

  const sortedTransactions: LedgerTransaction[] = (() => {
    const byDate = new Map<string, LedgerTransaction[]>();
    for (const tx of transactions) {
      const d = tx.date || '';
      const list = byDate.get(d);
      if (list) list.push(tx);
      else byDate.set(d, [tx]);
    }
    const dates = Array.from(byDate.keys()).sort((a, b) => a.localeCompare(b));
    const out: LedgerTransaction[] = [];
    for (const d of dates) {
      out.push(...sortSameDateTopologically(byDate.get(d)!));
    }
    return out;
  })();

  // ============================================================================
  // FIFO COST-LOT INVENTORY ENGINE
  // Each asset holds an ordered queue of lots: { qty, costNTD }.
  // - Paid lots (costNTD > 0) are consumed in FIFO order first when converting,
  //   ensuring 100% of out-of-pocket Base Cash (NTD) propagates cleanly along
  //   multi-hop chains (NTD -> IDR -> USDT -> BTC) without dilution from zero-cost dividends.
  // - Total Base Cash (NTD) invested in any asset C is strictly the sum of `lot.costNTD`
  //   in `lotQueues[C]` (guaranteed >= 0).
  // ============================================================================
  interface CostLot {
    qty: number;
    costNTD: number;
  }

  const lotQueues: Record<string, CostLot[]> = {};
  const runningCostBasis: Record<string, number> = {};
  const lastKnownUnitCostNTD: Record<string, number> = {};
  const pendingDeficitQty: Record<string, number> = {};

  assets.forEach((a) => {
    lotQueues[a.id] = [];
    runningCostBasis[a.id] = 0;
    lastKnownUnitCostNTD[a.id] = resolveChainUnitCostNTD(a.id);
    pendingDeficitQty[a.id] = 0;
  });

  const syncAssetBasisFromLots = (assetId: string) => {
    const q = lotQueues[assetId] || [];
    let totalCost = 0;
    let totalQty = 0;
    for (const lot of q) {
      if (lot.qty > 1e-10) {
        totalCost += Math.max(0, lot.costNTD);
        totalQty += lot.qty;
      }
    }
    runningCostBasis[assetId] = totalCost;
    if (totalQty > 1e-8 && totalCost > 0) {
      lastKnownUnitCostNTD[assetId] = totalCost / totalQty;
    }
  };

  const pushLot = (assetId: string, qty: number, costNTD: number) => {
    if (qty <= 1e-10) return;
    let effectiveQty = qty;
    let effectiveCost = Math.max(0, costNTD);

    // If an earlier same-month or out-of-order conversion consumed units before this deposit arrived,
    // absorb the deficit first so phantom cost basis is never left behind in the source asset.
    const deficit = pendingDeficitQty[assetId] || 0;
    if (deficit > 1e-10) {
      if (deficit >= effectiveQty - 1e-10) {
        pendingDeficitQty[assetId] = Math.max(0, deficit - effectiveQty);
        syncAssetBasisFromLots(assetId);
        return;
      } else {
        const remainingFraction = (effectiveQty - deficit) / effectiveQty;
        effectiveQty -= deficit;
        effectiveCost *= remainingFraction;
        pendingDeficitQty[assetId] = 0;
      }
    }

    if (!lotQueues[assetId]) lotQueues[assetId] = [];
    lotQueues[assetId].push({
      qty: effectiveQty,
      costNTD: Math.max(0, effectiveCost),
    });
    syncAssetBasisFromLots(assetId);
  };

  /**
   * Consumes `consumeQty` units from `assetId`'s lot queue and returns the exact
   * Base Cash (NTD) principal carried by those consumed units.
   * - Consumes paid-principal lots (costNTD > 0) in FIFO order first, then zero-cost yield lots.
   * - If `consumeQty` exceeds available lots in the queue, uses `lastKnownUnitCostNTD`
   *   (or recursive DAG chain-rule unit cost) for the deficit quantity and records `pendingDeficitQty`.
   */
  const consumeLotsAndExtractCostNTD = (assetId: string, consumeQty: number): number => {
    const ast = assetMap.get(assetId);
    if (consumeQty <= 1e-10) return 0;

    if (isNtdCashAsset(ast)) {
      // Base Cash (NTD): 1 unit is always 1 NTD
      const q = lotQueues[assetId] || [];
      let rem = consumeQty;
      for (const lot of q) {
        if (rem <= 1e-10) break;
        const take = Math.min(lot.qty, rem);
        lot.qty -= take;
        lot.costNTD = Math.max(0, lot.costNTD - take);
        rem -= take;
      }
      if (rem > 1e-8) {
        pendingDeficitQty[assetId] = (pendingDeficitQty[assetId] || 0) + rem;
      }
      lotQueues[assetId] = q.filter((l) => l.qty > 1e-10);
      syncAssetBasisFromLots(assetId);
      return consumeQty;
    }

    const q = lotQueues[assetId] || [];
    let remainingToConsume = consumeQty;
    let extractedCostNTD = 0;

    // Pass 1: Consume paid-principal lots (costNTD > 0) in FIFO order
    for (const lot of q) {
      if (remainingToConsume <= 1e-10) break;
      if (lot.qty <= 1e-10 || lot.costNTD <= 1e-10) continue;

      if (lot.qty <= remainingToConsume + 1e-10) {
        extractedCostNTD += lot.costNTD;
        remainingToConsume = Math.max(0, remainingToConsume - lot.qty);
        lot.qty = 0;
        lot.costNTD = 0;
      } else {
        const fraction = remainingToConsume / lot.qty;
        const costTaken = lot.costNTD * fraction;
        extractedCostNTD += costTaken;
        lot.costNTD = Math.max(0, lot.costNTD - costTaken);
        lot.qty -= remainingToConsume;
        remainingToConsume = 0;
      }
    }

    // Pass 2: If more quantity is still needed, consume from zero-cost (dividend/yield) lots
    if (remainingToConsume > 1e-10) {
      for (const lot of q) {
        if (remainingToConsume <= 1e-10) break;
        if (lot.qty <= 1e-10) continue;
        const take = Math.min(lot.qty, remainingToConsume);
        lot.qty -= take;
        remainingToConsume = Math.max(0, remainingToConsume - take);
      }
    }

    // Clean up empty lots and update runningCostBasis
    lotQueues[assetId] = q.filter((l) => l.qty > 1e-10);
    syncAssetBasisFromLots(assetId);

    // Pass 3: If transaction consumed more units than were present in the queue
    // (e.g. out-of-order entry or unrecorded initial balance), value the shortfall
    // using the recursive chain-rule unit cost in NTD and record the deficit quantity.
    if (remainingToConsume > 1e-8) {
      pendingDeficitQty[assetId] = (pendingDeficitQty[assetId] || 0) + remainingToConsume;
      const fallbackUnitCost =
        lastKnownUnitCostNTD[assetId] !== undefined && lastKnownUnitCostNTD[assetId] > 0
          ? lastKnownUnitCostNTD[assetId]
          : resolveChainUnitCostNTD(assetId);
      extractedCostNTD += remainingToConsume * fallbackUnitCost;
    }

    return extractedCostNTD;
  };

  const applyTxToCostBasis = (tx: LedgerTransaction) => {
    const toAsset = assetMap.get(tx.toAssetId);
    const fromAsset = tx.fromAssetId ? assetMap.get(tx.fromAssetId) : undefined;
    const isToEF = isEmergencyFundAsset(toAsset);
    const isFromEF = isEmergencyFundAsset(fromAsset);

    if (tx.action === 'add') {
      const toVal = Number(tx.toValue) || 0;
      const explicitCostNTD = Number(tx.fromValue) || 0;
      if (!isToEF && toVal > 0) {
        let cap = 0;
        if (isNtdCashAsset(toAsset)) {
          cap = toVal;
        } else if (explicitCostNTD > 0) {
          cap = explicitCostNTD;
        } else {
          cap = toVal * resolveChainUnitCostNTD(tx.toAssetId);
        }
        pushLot(tx.toAssetId, toVal, cap);
      }
    } else if (tx.action === 'dividend') {
      const toVal = Number(tx.toValue) || 0;
      if (!isToEF && toVal > 0) {
        // Dividend / passive yield adds units with 0 out-of-pocket NTD principal cost
        // (unless deposited as NTD Cash face value)
        const cap = isNtdCashAsset(toAsset) ? toVal : 0;
        pushLot(tx.toAssetId, toVal, cap);
      }
    } else if (tx.action === 'withdraw') {
      const targetId = tx.fromAssetId || tx.toAssetId;
      const targetAsset = fromAsset || toAsset;
      const deductVal = Number(tx.fromValue || tx.toValue) || 0;
      if (targetId && deductVal > 0 && !isEmergencyFundAsset(targetAsset)) {
        consumeLotsAndExtractCostNTD(targetId, deductVal);
      }
    } else if (tx.action === 'convert') {
      const fromVal = Number(tx.fromValue) || 0;
      const toVal = Number(tx.toValue) || 0;
      const fromId = tx.fromAssetId || '';
      const toId = tx.toAssetId;

      if (!isFromEF && !isToEF) {
        // Extract exact Base Cash (NTD) from the source asset's FIFO lots (with recursive chain-rule fallback)
        const transferredBasisNTD = fromId
          ? consumeLotsAndExtractCostNTD(fromId, fromVal)
          : fromVal;

        // Push the new lot onto the destination asset carrying that exact NTD cost basis
        if (toVal > 0) {
          pushLot(toId, toVal, transferredBasisNTD);
        }
      } else if (isFromEF && !isToEF) {
        const unitCost = fromId ? resolveChainUnitCostNTD(fromId) : 1;
        if (toVal > 0) {
          pushLot(toId, toVal, fromVal * unitCost);
        }
      } else if (!isFromEF && isToEF && fromId) {
        consumeLotsAndExtractCostNTD(fromId, fromVal);
      }
    }
  };

  for (const month of historicalMonths) {
    const day1Date = `${month}-01`;

    // Strictly 1st of month cumulative quantity (only transactions with date <= YYYY-MM-01)
    const effectiveQuantities = calculateHoldingsAtDate(transactions, day1Date);

    const prices: Record<string, number> = {};
    const assetValues: Record<string, number> = {};
    let monthEmergencyFund = 0;

    const monthSavedPrices = monthlyPrices[month] || {};

    assets.forEach((asset) => {
      const price = getAssetBasePrice(asset, monthSavedPrices, livePrices);
      prices[asset.id] = price;
      const qty = effectiveQuantities[asset.id] || 0;
      const val = qty * price;

      if (isEmergencyFundAsset(asset)) {
        monthEmergencyFund += val;
      } else {
        assetValues[asset.id] = val;
      }
    });

    // Transactions that settled into this 1st-of-month snapshot (up to YYYY-MM-01 inclusive)
    const periodTransactions = sortedTransactions.filter((t) => {
      if (!t.date) return false;
      if (prevDay1Date) {
        return t.date > prevDay1Date && t.date <= day1Date;
      }
      return t.date <= day1Date;
    });

    const prevAssetCostBasis = { ...runningCostBasis };
    periodTransactions.forEach((tx) => applyTxToCostBasis(tx));

    const assetInvestedValues: Record<string, number> = {};
    assets.forEach((asset) => {
      if (!isEmergencyFundAsset(asset)) {
        if (isNtdCashAsset(asset)) {
          runningCostBasis[asset.id] = Math.max(0, assetValues[asset.id] || 0);
        }
        const curB = runningCostBasis[asset.id] || 0;
        const prevB = prevAssetCostBasis[asset.id] || 0;
        assetInvestedValues[asset.id] = curB - prevB;
      }
    });

    const monthDeposits = periodTransactions.reduce(
      (sum, t) => sum + getTransactionInvestmentCapitalDelta(t, assetMap),
      0
    );

    // Passive dividend/interest yield earned up to this 1st-of-month snapshot
    const monthDividends = periodTransactions.reduce(
      (sum, t) => sum + getTransactionDividendValueNTD(t, assetMap, prices),
      0
    );

    runningInvested = Math.max(0, runningInvested + monthDeposits);
    runningDividends += monthDividends;
    prevDay1Date = day1Date;

    const noteData = monthlyNotes[month];
    const monthNoteText = noteData?.monthNote !== undefined ? noteData.monthNote : `Snapshot for ${month}-01`;

    records.push({
      id: `rec-${month}`,
      month,
      assetValues,
      assetQuantities: effectiveQuantities,
      assetPrices: prices,
      assetInvestedValues,
      monthlyMoneyInvested: Math.max(0, monthDeposits),
      totalMoneyInvested: runningInvested,
      monthlyDividendIncome: monthDividends,
      totalDividendIncome: runningDividends,
      emergencyFund: monthEmergencyFund,
      isLivePending: false,
      description: monthNoteText,
      assetNotes: noteData?.assetNotes || {},
    });
  }

  // Now create the upcoming live month record (includes all transactions after the latest 1st-of-month snapshot)
  const currentLiveHoldings = calculateHoldingsAtDate(transactions);
  const liveAssetValues: Record<string, number> = {};
  const liveAssetPrices: Record<string, number> = {};
  let liveEmergencyFund = 0;

  assets.forEach((asset) => {
    const price = getAssetBasePrice(asset, undefined, livePrices);
    liveAssetPrices[asset.id] = price;
    const qty = currentLiveHoldings[asset.id] || 0;
    const val = qty * price;

    if (isEmergencyFundAsset(asset)) {
      liveEmergencyFund += val;
    } else {
      liveAssetValues[asset.id] = val;
    }
  });

  const livePeriodTransactions = sortedTransactions.filter((t) => {
    if (!t.date) return false;
    return prevDay1Date ? t.date > prevDay1Date : true;
  });

  const prevLiveCostBasis = { ...runningCostBasis };
  livePeriodTransactions.forEach((tx) => applyTxToCostBasis(tx));

  const liveAssetInvestedValues: Record<string, number> = {};
  assets.forEach((asset) => {
    if (!isEmergencyFundAsset(asset)) {
      if (isNtdCashAsset(asset)) {
        runningCostBasis[asset.id] = Math.max(0, liveAssetValues[asset.id] || 0);
      }
      const curB = runningCostBasis[asset.id] || 0;
      const prevB = prevLiveCostBasis[asset.id] || 0;
      liveAssetInvestedValues[asset.id] = curB - prevB;
    }
  });

  const liveMonthlyDeposits = Math.max(
    0,
    livePeriodTransactions.reduce(
      (sum, t) => sum + getTransactionInvestmentCapitalDelta(t, assetMap),
      0
    )
  );

  const liveMonthlyDividends = livePeriodTransactions.reduce(
    (sum, t) => sum + getTransactionDividendValueNTD(t, assetMap, liveAssetPrices),
    0
  );

  const totalDepositsAllTime = Math.max(
    0,
    transactions.reduce((sum, t) => sum + getTransactionInvestmentCapitalDelta(t, assetMap), 0)
  );

  const totalDividendsAllTime = transactions.reduce(
    (sum, t) => sum + getTransactionDividendValueNTD(t, assetMap, liveAssetPrices),
    0
  );

  const liveNoteData = monthlyNotes[liveUpcomingMonth];
  const liveMonthNoteText =
    liveNoteData?.monthNote !== undefined
      ? liveNoteData.monthNote
      : `Upcoming Live Real-Time Data (${liveUpcomingMonth})`;

  records.push({
    id: `rec-live-${liveUpcomingMonth}`,
    month: liveUpcomingMonth,
    assetValues: liveAssetValues,
    assetQuantities: currentLiveHoldings,
    assetPrices: liveAssetPrices,
    assetInvestedValues: liveAssetInvestedValues,
    monthlyMoneyInvested: liveMonthlyDeposits,
    totalMoneyInvested: totalDepositsAllTime,
    monthlyDividendIncome: liveMonthlyDividends,
    totalDividendIncome: totalDividendsAllTime,
    emergencyFund: liveEmergencyFund,
    isLivePending: true,
    description: liveMonthNoteText,
    assetNotes: liveNoteData?.assetNotes || {},
  });

  return records;
}
