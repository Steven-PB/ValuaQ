import { MonthlyRecord, Category, Asset, AppSettings, LedgerTransaction, MonthlyPriceMap, MonthlyNotesMap } from '../types';
import { recalculateMonthlyRecords, DeletedIdsMap } from './storage';
import { normalizeCurrencyCode, getCurrencySymbolForCode } from './formatters';

/**
 * Merges Cloud data (Sync Data) and Local Device data (Data on Device)
 * following the user-requested Set Union formula:
 * Merged = (Sync Data + Data on Device - (Sync Data ∩ Data on Device)) - Tombstoned Deletions
 *
 * Guaranteed Properties:
 * 1. Records existing only in Cloud (and not tombstoned) are never erased by a device with older state.
 * 2. Records created or edited locally on the device are never lost.
 * 3. Overlapping records (Sync Data ∩ Data on Device) are reconciled by latest timestamp / completeness.
 * 4. Items explicitly deleted by the user (tracked in DeletedIdsMap) are never resurrected by Cloud Sync.
 */

export interface MergeStats {
  fromCloudOnly: number;
  fromDeviceOnly: number;
  inBothReconciled: number;
  totalResult: number;
}

export interface MonthlyRecordMergeResult {
  merged: MonthlyRecord[];
  stats: MergeStats;
  hasChangesFromCloud: boolean;
  hasChangesFromDevice: boolean;
}

export function mergeDeletedIds(
  cloudDeleted?: Partial<DeletedIdsMap>,
  deviceDeleted?: Partial<DeletedIdsMap>
): DeletedIdsMap {
  return {
    categories: Array.from(
      new Set([...(cloudDeleted?.categories || []), ...(deviceDeleted?.categories || [])])
    ),
    assets: Array.from(
      new Set([...(cloudDeleted?.assets || []), ...(deviceDeleted?.assets || [])])
    ),
    transactions: Array.from(
      new Set([...(cloudDeleted?.transactions || []), ...(deviceDeleted?.transactions || [])])
    ),
  };
}

export function mergeMonthlyRecords(
  cloudRecords: MonthlyRecord[] = [],
  deviceRecords: MonthlyRecord[] = [],
  deletedMonths: string[] = []
): MonthlyRecordMergeResult {
  const deletedSet = new Set(deletedMonths || []);

  // Filter out any tombstoned deleted records
  const validCloud = (cloudRecords || []).filter((r) => r && r.month && !deletedSet.has(r.month));
  const validDevice = (deviceRecords || []).filter((r) => r && r.month && !deletedSet.has(r.month));

  const cloudMap = new Map<string, MonthlyRecord>();
  validCloud.forEach((r) => cloudMap.set(r.month, r));

  const deviceMap = new Map<string, MonthlyRecord>();
  validDevice.forEach((r) => deviceMap.set(r.month, r));

  const allMonths = Array.from(new Set([...cloudMap.keys(), ...deviceMap.keys()])).sort();

  let fromCloudOnly = 0;
  let fromDeviceOnly = 0;
  let inBothReconciled = 0;
  let hasChangesFromCloud = false;
  let hasChangesFromDevice = false;

  const mergedList: MonthlyRecord[] = [];

  for (const month of allMonths) {
    const cRec = cloudMap.get(month);
    const dRec = deviceMap.get(month);

    if (cRec && !dRec) {
      mergedList.push(cRec);
      fromCloudOnly++;
      hasChangesFromCloud = true;
    } else if (!cRec && dRec) {
      mergedList.push(dRec);
      fromDeviceOnly++;
      hasChangesFromDevice = true;
    } else if (cRec && dRec) {
      inBothReconciled++;

      const cTime = cRec.updatedAt
        ? new Date(cRec.updatedAt).getTime()
        : cRec.createdAt
        ? new Date(cRec.createdAt).getTime()
        : 0;

      const dTime = dRec.updatedAt
        ? new Date(dRec.updatedAt).getTime()
        : dRec.createdAt
        ? new Date(dRec.createdAt).getTime()
        : 0;

      if (cTime > dTime) {
        mergedList.push(cRec);
        hasChangesFromCloud = true;
      } else if (dTime > cTime) {
        mergedList.push(dRec);
        hasChangesFromDevice = true;
      } else {
        const cAssetCount = Object.keys(cRec.assetValues || {}).filter(
          (k) => (cRec.assetValues[k] || 0) > 0
        ).length;
        const dAssetCount = Object.keys(dRec.assetValues || {}).filter(
          (k) => (dRec.assetValues[k] || 0) > 0
        ).length;

        if (dAssetCount > cAssetCount) {
          mergedList.push(dRec);
          hasChangesFromDevice = true;
        } else if (cAssetCount > dAssetCount) {
          mergedList.push(cRec);
          hasChangesFromCloud = true;
        } else {
          const mergedAssetValues = {
            ...(cRec.assetValues || {}),
            ...(dRec.assetValues || {}),
          };
          const mergedAssetInvestedValues = {
            ...(cRec.assetInvestedValues || {}),
            ...(dRec.assetInvestedValues || {}),
          };

          const emergencyFund =
            dRec.emergencyFund !== undefined
              ? dRec.emergencyFund
              : cRec.emergencyFund !== undefined
              ? cRec.emergencyFund
              : 0;

          const mergedRec: MonthlyRecord = {
            id: dRec.id || cRec.id,
            month,
            assetValues: mergedAssetValues,
            assetInvestedValues: mergedAssetInvestedValues,
            monthlyMoneyInvested: dRec.monthlyMoneyInvested ?? cRec.monthlyMoneyInvested ?? 0,
            totalMoneyInvested: dRec.totalMoneyInvested ?? cRec.totalMoneyInvested ?? 0,
            emergencyFund,
            description: dRec.description || cRec.description || '',
          };
          const createdTime = dRec.createdAt || cRec.createdAt;
          if (createdTime) mergedRec.createdAt = createdTime;
          const updatedTime = dRec.updatedAt || cRec.updatedAt;
          if (updatedTime) mergedRec.updatedAt = updatedTime;

          mergedList.push(mergedRec);
        }
      }
    }
  }

  const recalculated = recalculateMonthlyRecords(mergedList);

  return {
    merged: recalculated,
    stats: {
      fromCloudOnly,
      fromDeviceOnly,
      inBothReconciled,
      totalResult: recalculated.length,
    },
    hasChangesFromCloud,
    hasChangesFromDevice,
  };
}

export function mergeCategories(
  cloudCats: Category[] = [],
  deviceCats: Category[] = [],
  deletedCategoryIds: string[] = [],
  activeAssets: Asset[] = []
): Category[] {
  // Referential Integrity Guard: Never delete a category that is actively referenced by a surviving asset
  const referencedCatIds = new Set<string>(
    (activeAssets || []).map((a) => a?.categoryId).filter((id): id is string => Boolean(id))
  );
  const deletedSet = new Set(
    (deletedCategoryIds || []).filter((id) => !referencedCatIds.has(id))
  );

  const cloudMap = new Map<string, Category>();
  (cloudCats || []).forEach((c) => {
    if (c && c.id && !deletedSet.has(c.id)) cloudMap.set(c.id, c);
  });

  const deviceMap = new Map<string, Category>();
  (deviceCats || []).forEach((c) => {
    if (c && c.id && !deletedSet.has(c.id)) deviceMap.set(c.id, c);
  });

  const allIds = Array.from(new Set([...cloudMap.keys(), ...deviceMap.keys()]));
  const result: Category[] = [];

  for (const id of allIds) {
    if (deletedSet.has(id)) continue;
    const c = cloudMap.get(id);
    const d = deviceMap.get(id);
    if (c && !d) {
      result.push(c);
    } else if (!c && d) {
      result.push(d);
    } else if (c && d) {
      const cTime = c.updatedAt ? new Date(c.updatedAt).getTime() : 0;
      const dTime = d.updatedAt ? new Date(d.updatedAt).getTime() : 0;
      const winner = { ...(dTime >= cTime ? d : c) };
      if (winner.targetPercent === undefined && (d.targetPercent !== undefined || c.targetPercent !== undefined)) {
        winner.targetPercent = d.targetPercent !== undefined ? d.targetPercent : c.targetPercent;
      }
      result.push(winner);
    }
  }

  return result;
}

export function mergeAssets(
  cloudAssets: Asset[] = [],
  deviceAssets: Asset[] = [],
  deletedAssetIds: string[] = [],
  activeTransactions: LedgerTransaction[] = []
): Asset[] {
  // Referential Integrity Guard: Never delete an asset that is actively referenced by a surviving transaction
  const referencedAssetIds = new Set<string>();
  (activeTransactions || []).forEach((tx) => {
    if (tx?.toAssetId) referencedAssetIds.add(tx.toAssetId);
    if (tx?.fromAssetId) referencedAssetIds.add(tx.fromAssetId);
  });

  const deletedSet = new Set(
    (deletedAssetIds || []).filter((id) => !referencedAssetIds.has(id))
  );

  const cloudMap = new Map<string, Asset>();
  (cloudAssets || []).forEach((a) => {
    if (a && a.id && !deletedSet.has(a.id)) cloudMap.set(a.id, a);
  });

  const deviceMap = new Map<string, Asset>();
  (deviceAssets || []).forEach((a) => {
    if (a && a.id && !deletedSet.has(a.id)) deviceMap.set(a.id, a);
  });

  const allIds = Array.from(new Set([...cloudMap.keys(), ...deviceMap.keys()]));
  const result: Asset[] = [];

  for (const id of allIds) {
    if (deletedSet.has(id)) continue;
    const c = cloudMap.get(id);
    const d = deviceMap.get(id);
    if (c && !d) {
      result.push(c);
    } else if (!c && d) {
      result.push(d);
    } else if (c && d) {
      const cTime = c.updatedAt ? new Date(c.updatedAt).getTime() : 0;
      const dTime = d.updatedAt ? new Date(d.updatedAt).getTime() : 0;
      const winner = { ...(dTime >= cTime ? d : c) };
      if (!winner.priceCurrency && (d.priceCurrency || c.priceCurrency)) {
        winner.priceCurrency = d.priceCurrency || c.priceCurrency;
      }
      result.push(winner);
    }
  }

  return result;
}

export function mergeSettings(
  cloudSettings?: AppSettings,
  deviceSettings?: AppSettings
): AppSettings {
  const chosenBase =
    deviceSettings?.baseCurrency ||
    cloudSettings?.baseCurrency ||
    deviceSettings?.currencySymbol ||
    cloudSettings?.currencySymbol ||
    'NTD';
  const baseCode = normalizeCurrencyCode(chosenBase);
  return {
    baseCurrency: baseCode,
    currencySymbol: getCurrencySymbolForCode(baseCode),
    stealthMode: deviceSettings?.stealthMode ?? cloudSettings?.stealthMode ?? false,
    defaultChartType: deviceSettings?.defaultChartType || cloudSettings?.defaultChartType || 'all',
    defaultGroupMode: deviceSettings?.defaultGroupMode || cloudSettings?.defaultGroupMode || 'category',
  };
}

export function mergeTransactions(
  cloudTx: LedgerTransaction[] = [],
  deviceTx: LedgerTransaction[] = [],
  deletedTxIds: string[] = []
): LedgerTransaction[] {
  const deletedSet = new Set(deletedTxIds || []);
  const cloudMap = new Map<string, LedgerTransaction>();
  (cloudTx || []).forEach((t) => {
    if (t && t.id && !deletedSet.has(t.id)) cloudMap.set(t.id, t);
  });

  const deviceMap = new Map<string, LedgerTransaction>();
  (deviceTx || []).forEach((t) => {
    if (t && t.id && !deletedSet.has(t.id)) deviceMap.set(t.id, t);
  });

  const allIds = Array.from(new Set([...cloudMap.keys(), ...deviceMap.keys()]));
  const result: LedgerTransaction[] = [];

  for (const id of allIds) {
    if (deletedSet.has(id)) continue;
    const c = cloudMap.get(id);
    const d = deviceMap.get(id);
    if (c && !d) {
      result.push(c);
    } else if (!c && d) {
      result.push(d);
    } else if (c && d) {
      const cTime = c.updatedAt ? new Date(c.updatedAt).getTime() : c.createdAt ? new Date(c.createdAt).getTime() : 0;
      const dTime = d.updatedAt ? new Date(d.updatedAt).getTime() : d.createdAt ? new Date(d.createdAt).getTime() : 0;
      result.push(dTime >= cTime ? d : c);
    }
  }

  // Sort by date ascending, then id for deterministic ordering
  return result.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
}

export function mergeMonthlyPrices(
  cloudPrices: MonthlyPriceMap = {},
  devicePrices: MonthlyPriceMap = {}
): MonthlyPriceMap {
  const result: MonthlyPriceMap = { ...(cloudPrices || {}) };

  for (const month of Object.keys(devicePrices || {})) {
    result[month] = {
      ...(result[month] || {}),
      ...(devicePrices[month] || {}),
    };
  }

  return result;
}

export function mergeMonthlyNotes(
  cloudNotes: MonthlyNotesMap = {},
  deviceNotes: MonthlyNotesMap = {}
): MonthlyNotesMap {
  const allMonths = Array.from(
    new Set([...Object.keys(cloudNotes || {}), ...Object.keys(deviceNotes || {})])
  );
  const result: MonthlyNotesMap = {};

  for (const m of allMonths) {
    const c = cloudNotes?.[m];
    const d = deviceNotes?.[m];
    if (c && !d) {
      result[m] = c;
    } else if (!c && d) {
      result[m] = d;
    } else if (c && d) {
      const cTime = c.updatedAt ? new Date(c.updatedAt).getTime() : 0;
      const dTime = d.updatedAt ? new Date(d.updatedAt).getTime() : 0;
      result[m] = {
        monthNote: dTime >= cTime ? (d.monthNote ?? c.monthNote) : (c.monthNote ?? d.monthNote),
        assetNotes: {
          ...(c.assetNotes || {}),
          ...(d.assetNotes || {}),
          ...(dTime >= cTime ? (d.assetNotes || {}) : (c.assetNotes || {})),
        },
        updatedAt: dTime >= cTime ? (d.updatedAt || c.updatedAt) : (c.updatedAt || d.updatedAt),
      };
    }
  }

  return result;
}

/**
 * Canonical normalizers & deterministic FNV-1a checksum for Sync Health monitoring
 */
function fnv1aHex(str: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).toUpperCase().padStart(8, '0');
}

function normalizeNumber(val: unknown, decimals: number = 6): number {
  if (val === undefined || val === null || val === '') return 0;
  const num = Number(val);
  if (Number.isNaN(num) || !Number.isFinite(num) || Math.abs(num) < 1e-9) return 0;
  const factor = Math.pow(10, decimals);
  return Math.round(num * factor) / factor;
}

function canonicalizeCategory(c: Category): string {
  return JSON.stringify({
    id: String(c.id || '').trim(),
    name: String(c.name || '').trim(),
    riskLevel: c.riskLevel || 'Low',
    color: String(c.color || '').trim().toLowerCase(),
    isCashCategory: Boolean(c.isCashCategory),
    targetPercent: normalizeNumber(c.targetPercent, 2),
  });
}

function canonicalizeAsset(a: Asset): string {
  const rawPriceCurr = String(a.priceCurrency || 'NTD').trim().toUpperCase();
  const normPriceCurr = rawPriceCurr === 'TWD' ? 'NTD' : rawPriceCurr;
  return JSON.stringify({
    id: String(a.id || '').trim(),
    name: String(a.name || '').trim(),
    categoryId: String(a.categoryId || '').trim(),
    tickerSymbol: String(a.tickerSymbol || '').trim().toUpperCase(),
    currency: String(a.currency || 'NTD').trim().toUpperCase(),
    priceCurrency: normPriceCurr,
    isCash: Boolean(a.isCash),
  });
}

function canonicalizeTransaction(t: LedgerTransaction): string {
  const rawFromId = String(t.fromAssetId || '').trim();
  const rawToId = String(t.toAssetId || '').trim();
  return JSON.stringify({
    id: String(t.id || '').trim(),
    date: String(t.date || '').trim(),
    action: t.action || 'add',
    fromAssetId: rawFromId || null,
    fromValue: normalizeNumber(t.fromValue, 6),
    toAssetId: rawToId,
    toValue: normalizeNumber(t.toValue, 6),
    note: String(t.note || '').trim(),
  });
}

function describeObjectDiff(localCanon: string, cloudCanon: string): string {
  try {
    const lObj = JSON.parse(localCanon) as Record<string, any>;
    const cObj = JSON.parse(cloudCanon) as Record<string, any>;
    const diffs: string[] = [];
    for (const key of Object.keys(lObj)) {
      if (key === 'id') continue;
      if (lObj[key] !== cObj[key]) {
        diffs.push(`${key}: local "${lObj[key] ?? ''}" vs cloud "${cObj[key] ?? ''}"`);
      }
    }
    return diffs.length > 0 ? diffs.join(', ') : 'Metadata differs';
  } catch {
    return 'Metadata differs between Local and Cloud';
  }
}

export function computeLedgerChecksum(state: {
  categories: Category[];
  assets: Asset[];
  transactions: LedgerTransaction[];
}): string {
  const cats = [...(state.categories || [])]
    .filter((c) => c && c.id)
    .sort((a, b) => String(a.id).localeCompare(String(b.id)))
    .map(canonicalizeCategory);

  const asts = [...(state.assets || [])]
    .filter((a) => a && a.id)
    .sort((a, b) => String(a.id).localeCompare(String(b.id)))
    .map(canonicalizeAsset);

  const txs = [...(state.transactions || [])]
    .filter((t) => t && t.id)
    .sort((a, b) => String(a.id).localeCompare(String(b.id)))
    .map(canonicalizeTransaction);

  return fnv1aHex(JSON.stringify({ cats, asts, txs }));
}

export interface SyncDriftItem {
  id: string;
  entityType: 'transaction' | 'asset' | 'category' | 'orphan_ref';
  driftType: 'local_only' | 'cloud_only' | 'modified' | 'orphaned';
  label: string;
  detail: string;
}

export interface SyncHealthReport {
  status: 'unauthenticated' | 'syncing' | 'initializing' | 'healthy' | 'drift_detected';
  isHealthy: boolean;
  localChecksum: string;
  cloudChecksum: string | null;
  totalDriftCount: number;
  counts: {
    localTransactions: number;
    cloudTransactions: number;
    localAssets: number;
    cloudAssets: number;
    localCategories: number;
    cloudCategories: number;
  };
  deltas: {
    txLocalOnly: LedgerTransaction[];
    txCloudOnly: LedgerTransaction[];
    txModified: LedgerTransaction[];
    assetsLocalOnly: Asset[];
    assetsCloudOnly: Asset[];
    assetsModified: Asset[];
    categoriesLocalOnly: Category[];
    categoriesCloudOnly: Category[];
    categoriesModified: Category[];
    orphanedTransactions: LedgerTransaction[];
    orphanedAssets: Asset[];
  };
  driftItems: SyncDriftItem[];
}

export function computeSyncHealthReport(params: {
  isAuthenticated: boolean;
  isSyncing: boolean;
  isCloudLoaded: boolean;
  localCategories: Category[];
  localAssets: Asset[];
  localTransactions: LedgerTransaction[];
  localDeletedIds?: Partial<DeletedIdsMap>;
  cloudSnapshot: {
    categories?: Category[];
    assets?: Asset[];
    transactions?: LedgerTransaction[];
    deletedIds?: Partial<DeletedIdsMap>;
  } | null;
}): SyncHealthReport {
  const {
    isAuthenticated,
    isSyncing,
    isCloudLoaded,
    localCategories = [],
    localAssets = [],
    localTransactions = [],
    localDeletedIds,
    cloudSnapshot,
  } = params;

  // Deduplicate local arrays by ID
  const dedupLocalCats = Array.from(
    new Map((localCategories || []).filter((c) => c && c.id).map((c) => [c.id, c])).values()
  );
  const dedupLocalAssets = Array.from(
    new Map((localAssets || []).filter((a) => a && a.id).map((a) => [a.id, a])).values()
  );
  const dedupLocalTx = Array.from(
    new Map((localTransactions || []).filter((t) => t && t.id).map((t) => [t.id, t])).values()
  );

  const localChecksum = computeLedgerChecksum({
    categories: dedupLocalCats,
    assets: dedupLocalAssets,
    transactions: dedupLocalTx,
  });

  // Check local referential integrity for informational diagnostics
  const localAssetIdSet = new Set(dedupLocalAssets.map((a) => a.id));
  const localCatIdSet = new Set(dedupLocalCats.map((c) => c.id));

  const orphanedTransactions = dedupLocalTx.filter(
    (tx) =>
      (tx.toAssetId && !localAssetIdSet.has(tx.toAssetId)) ||
      (tx.fromAssetId && !localAssetIdSet.has(tx.fromAssetId))
  );
  const orphanedAssets = dedupLocalAssets.filter(
    (a) => a.categoryId && !localCatIdSet.has(a.categoryId)
  );

  if (!isAuthenticated) {
    return {
      status: 'unauthenticated',
      isHealthy: true,
      localChecksum,
      cloudChecksum: null,
      totalDriftCount: 0,
      counts: {
        localTransactions: dedupLocalTx.length,
        cloudTransactions: 0,
        localAssets: dedupLocalAssets.length,
        cloudAssets: 0,
        localCategories: dedupLocalCats.length,
        cloudCategories: 0,
      },
      deltas: {
        txLocalOnly: [],
        txCloudOnly: [],
        txModified: [],
        assetsLocalOnly: [],
        assetsCloudOnly: [],
        assetsModified: [],
        categoriesLocalOnly: [],
        categoriesCloudOnly: [],
        categoriesModified: [],
        orphanedTransactions,
        orphanedAssets,
      },
      driftItems: [],
    };
  }

  if (!isCloudLoaded || !cloudSnapshot) {
    return {
      status: isSyncing ? 'syncing' : 'initializing',
      isHealthy: true,
      localChecksum,
      cloudChecksum: null,
      totalDriftCount: 0,
      counts: {
        localTransactions: dedupLocalTx.length,
        cloudTransactions: 0,
        localAssets: dedupLocalAssets.length,
        cloudAssets: 0,
        localCategories: dedupLocalCats.length,
        cloudCategories: 0,
      },
      deltas: {
        txLocalOnly: [],
        txCloudOnly: [],
        txModified: [],
        assetsLocalOnly: [],
        assetsCloudOnly: [],
        assetsModified: [],
        categoriesLocalOnly: [],
        categoriesCloudOnly: [],
        categoriesModified: [],
        orphanedTransactions,
        orphanedAssets,
      },
      driftItems: [],
    };
  }

  // Apply unified tombstones to cloudSnapshot so deleted items are never flagged as cloud_only drift
  const combinedDeleted = mergeDeletedIds(cloudSnapshot.deletedIds, localDeletedIds);
  const deletedTxSet = new Set(combinedDeleted.transactions || []);

  const cloudTransactions = Array.from(
    new Map(
      (cloudSnapshot.transactions || [])
        .filter((t) => t && t.id && !deletedTxSet.has(t.id))
        .map((t) => [t.id, t])
    ).values()
  );

  // Referential integrity guard for cloud assets and categories (matching mergeAssets/mergeCategories)
  const activeTxAssetIds = new Set<string>();
  [...dedupLocalTx, ...cloudTransactions].forEach((tx) => {
    if (tx?.toAssetId) activeTxAssetIds.add(tx.toAssetId);
    if (tx?.fromAssetId) activeTxAssetIds.add(tx.fromAssetId);
  });
  const deletedAssetSet = new Set(
    (combinedDeleted.assets || []).filter((id) => !activeTxAssetIds.has(id))
  );

  const cloudAssets = Array.from(
    new Map(
      (cloudSnapshot.assets || [])
        .filter((a) => a && a.id && !deletedAssetSet.has(a.id))
        .map((a) => [a.id, a])
    ).values()
  );

  const activeAssetCatIds = new Set<string>();
  [...dedupLocalAssets, ...cloudAssets].forEach((a) => {
    if (a?.categoryId) activeAssetCatIds.add(a.categoryId);
  });
  const deletedCatSet = new Set(
    (combinedDeleted.categories || []).filter((id) => !activeAssetCatIds.has(id))
  );

  const cloudCategories = Array.from(
    new Map(
      (cloudSnapshot.categories || [])
        .filter((c) => c && c.id && !deletedCatSet.has(c.id))
        .map((c) => [c.id, c])
    ).values()
  );

  const cloudChecksum = computeLedgerChecksum({
    categories: cloudCategories,
    assets: cloudAssets,
    transactions: cloudTransactions,
  });

  // Compare Transactions
  const localTxMap = new Map<string, LedgerTransaction>();
  dedupLocalTx.forEach((t) => localTxMap.set(t.id, t));
  const cloudTxMap = new Map<string, LedgerTransaction>();
  cloudTransactions.forEach((t) => cloudTxMap.set(t.id, t));

  const txLocalOnly: LedgerTransaction[] = [];
  const txCloudOnly: LedgerTransaction[] = [];
  const txModified: LedgerTransaction[] = [];
  const txDiffDetails = new Map<string, string>();

  localTxMap.forEach((lTx, id) => {
    const cTx = cloudTxMap.get(id);
    if (!cTx) {
      txLocalOnly.push(lTx);
    } else {
      const lCanon = canonicalizeTransaction(lTx);
      const cCanon = canonicalizeTransaction(cTx);
      if (lCanon !== cCanon) {
        txModified.push(lTx);
        txDiffDetails.set(id, describeObjectDiff(lCanon, cCanon));
      }
    }
  });
  cloudTxMap.forEach((cTx, id) => {
    if (!localTxMap.has(id)) {
      txCloudOnly.push(cTx);
    }
  });

  // Compare Assets
  const localAssetMap = new Map<string, Asset>();
  dedupLocalAssets.forEach((a) => localAssetMap.set(a.id, a));
  const cloudAssetMap = new Map<string, Asset>();
  cloudAssets.forEach((a) => cloudAssetMap.set(a.id, a));

  const assetsLocalOnly: Asset[] = [];
  const assetsCloudOnly: Asset[] = [];
  const assetsModified: Asset[] = [];
  const assetDiffDetails = new Map<string, string>();

  localAssetMap.forEach((lAst, id) => {
    const cAst = cloudAssetMap.get(id);
    if (!cAst) {
      assetsLocalOnly.push(lAst);
    } else {
      const lCanon = canonicalizeAsset(lAst);
      const cCanon = canonicalizeAsset(cAst);
      if (lCanon !== cCanon) {
        assetsModified.push(lAst);
        assetDiffDetails.set(id, describeObjectDiff(lCanon, cCanon));
      }
    }
  });
  cloudAssetMap.forEach((cAst, id) => {
    if (!localAssetMap.has(id)) {
      assetsCloudOnly.push(cAst);
    }
  });

  // Compare Categories
  const localCatMap = new Map<string, Category>();
  dedupLocalCats.forEach((c) => localCatMap.set(c.id, c));
  const cloudCatMap = new Map<string, Category>();
  cloudCategories.forEach((c) => cloudCatMap.set(c.id, c));

  const categoriesLocalOnly: Category[] = [];
  const categoriesCloudOnly: Category[] = [];
  const categoriesModified: Category[] = [];
  const catDiffDetails = new Map<string, string>();

  localCatMap.forEach((lCat, id) => {
    const cCat = cloudCatMap.get(id);
    if (!cCat) {
      categoriesLocalOnly.push(lCat);
    } else {
      const lCanon = canonicalizeCategory(lCat);
      const cCanon = canonicalizeCategory(cCat);
      if (lCanon !== cCanon) {
        categoriesModified.push(lCat);
        catDiffDetails.set(id, describeObjectDiff(lCanon, cCanon));
      }
    }
  });
  cloudCatMap.forEach((cCat, id) => {
    if (!localCatMap.has(id)) {
      categoriesCloudOnly.push(cCat);
    }
  });

  // Build human-readable drift items list (strictly Local vs Cloud divergences)
  const driftItems: SyncDriftItem[] = [];
  const combinedAssetMap = new Map<string, Asset>([...cloudAssetMap, ...localAssetMap]);

  txLocalOnly.forEach((tx) => {
    const toName = combinedAssetMap.get(tx.toAssetId)?.name || tx.toAssetId;
    driftItems.push({
      id: `tx-local-${tx.id}`,
      entityType: 'transaction',
      driftType: 'local_only',
      label: `Transaction (${tx.date} · ${tx.action.toUpperCase()})`,
      detail: `Exists only on Local Device → ${tx.toValue} ${toName}`,
    });
  });

  txCloudOnly.forEach((tx) => {
    const toName = combinedAssetMap.get(tx.toAssetId)?.name || tx.toAssetId;
    driftItems.push({
      id: `tx-cloud-${tx.id}`,
      entityType: 'transaction',
      driftType: 'cloud_only',
      label: `Transaction (${tx.date} · ${tx.action.toUpperCase()})`,
      detail: `Exists only in Cloud Snapshot → ${tx.toValue} ${toName}`,
    });
  });

  txModified.forEach((tx) => {
    const diffDesc = txDiffDetails.get(tx.id) || 'Modified between Local & Cloud';
    driftItems.push({
      id: `tx-mod-${tx.id}`,
      entityType: 'transaction',
      driftType: 'modified',
      label: `Transaction (${tx.date} · ${tx.action.toUpperCase()})`,
      detail: diffDesc,
    });
  });

  assetsLocalOnly.forEach((a) => {
    driftItems.push({
      id: `ast-local-${a.id}`,
      entityType: 'asset',
      driftType: 'local_only',
      label: `Asset: ${a.name}`,
      detail: `Exists only on Local Device (${a.currency || 'NTD'})`,
    });
  });

  assetsCloudOnly.forEach((a) => {
    driftItems.push({
      id: `ast-cloud-${a.id}`,
      entityType: 'asset',
      driftType: 'cloud_only',
      label: `Asset: ${a.name}`,
      detail: `Exists only in Cloud Snapshot (${a.currency || 'NTD'})`,
    });
  });

  assetsModified.forEach((a) => {
    driftItems.push({
      id: `ast-mod-${a.id}`,
      entityType: 'asset',
      driftType: 'modified',
      label: `Asset: ${a.name}`,
      detail: assetDiffDetails.get(a.id) || 'Asset metadata differs between Local and Cloud',
    });
  });

  categoriesLocalOnly.forEach((c) => {
    driftItems.push({
      id: `cat-local-${c.id}`,
      entityType: 'category',
      driftType: 'local_only',
      label: `Category: ${c.name}`,
      detail: `Exists only on Local Device (${c.riskLevel} Risk)`,
    });
  });

  categoriesCloudOnly.forEach((c) => {
    driftItems.push({
      id: `cat-cloud-${c.id}`,
      entityType: 'category',
      driftType: 'cloud_only',
      label: `Category: ${c.name}`,
      detail: `Exists only in Cloud Snapshot (${c.riskLevel} Risk)`,
    });
  });

  categoriesModified.forEach((c) => {
    driftItems.push({
      id: `cat-mod-${c.id}`,
      entityType: 'category',
      driftType: 'modified',
      label: `Category: ${c.name}`,
      detail: catDiffDetails.get(c.id) || 'Category configuration differs between Local and Cloud',
    });
  });

  const totalDriftCount = driftItems.length;
  const isHealthy = totalDriftCount === 0 && localChecksum === cloudChecksum;

  return {
    status: isSyncing ? 'syncing' : isHealthy ? 'healthy' : 'drift_detected',
    isHealthy,
    localChecksum,
    cloudChecksum,
    totalDriftCount,
    counts: {
      localTransactions: dedupLocalTx.length,
      cloudTransactions: cloudTransactions.length,
      localAssets: dedupLocalAssets.length,
      cloudAssets: cloudAssets.length,
      localCategories: dedupLocalCats.length,
      cloudCategories: cloudCategories.length,
    },
    deltas: {
      txLocalOnly,
      txCloudOnly,
      txModified,
      assetsLocalOnly,
      assetsCloudOnly,
      assetsModified,
      categoriesLocalOnly,
      categoriesCloudOnly,
      categoriesModified,
      orphanedTransactions,
      orphanedAssets,
    },
    driftItems,
  };
}

