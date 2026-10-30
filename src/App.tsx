import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Trash2, AlertCircle, CheckCircle2, RefreshCw, X, AlertTriangle, GitMerge, Activity } from 'lucide-react';
import { 
  loadCategories, saveCategories, 
  loadAssets, saveAssets, 
  loadMonthlyRecords, saveMonthlyRecords, recalculateMonthlyRecords,
  loadTransactions, saveTransactions,
  loadMonthlyPrices, saveMonthlyPrices,
  loadMonthlyNotes, saveMonthlyNotes, setMonthNote,
  loadSettings, saveSettings, 
  resetToDemoData, resetAllDataToZero,
  loadDeletedMonths, saveDeletedMonths, addDeletedMonth, removeDeletedMonth,
  loadDeletedIds, saveDeletedIds, addDeletedId, DeletedIdsMap
} from './lib/storage';
import { 
  mergeMonthlyRecords, 
  mergeCategories, 
  mergeAssets, 
  mergeSettings,
  mergeTransactions,
  mergeMonthlyPrices,
  mergeMonthlyNotes,
  mergeDeletedIds,
  computeLedgerChecksum,
  computeSyncHealthReport
} from './lib/syncMerge';
import { 
  generateMonthlyRecordsFromLedger,
  isEmergencyFundAsset,
  getAssetBasePrice
} from './lib/ledgerEngine';
import { 
  fetchLiveMarketPrices, 
  loadCachedSpotPrices, 
  saveCachedSpotPrices, 
  setMonthlyPriceSnapshot,
  fetchHistoricalPriceForDate
} from './lib/marketPriceEngine';
import { Category, Asset, MonthlyRecord, AppSettings, FilterState, RiskLevel, ChartType, LedgerTransaction, MonthlyPriceMap, MonthlyNotesMap } from './types';
import { 
  auth, 
  signInWithGoogle, 
  signOutUser, 
  onAuthStateChanged, 
  syncDataToCloud, 
  fetchUserCloudData, 
  subscribeToUserData,
  User,
  UserCloudData
} from './lib/firebase';

import { Header } from './components/Header';
import { MetricsCards, AssetPLContribution } from './components/MetricsCards';
import { FilterBar } from './components/FilterBar';
import { ChartsView } from './components/ChartsView';
import { SpreadsheetView } from './components/SpreadsheetView';
import { LedgerView } from './components/LedgerView';
import { MonthEditorModal } from './components/MonthEditorModal';
import { HierarchyManager } from './components/HierarchyManager';
import { DataManagementModal } from './components/DataManagementModal';
import { LoginScreen } from './components/LoginScreen';
import { RebalanceView } from './components/RebalanceView';
import { SyncHealthModal } from './components/SyncHealthModal';

export default function App() {
  // User Auth & Cloud Sync States
  const [user, setUser] = useState<User | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isCloudLoaded, setIsCloudLoaded] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [syncSuccessMsg, setSyncSuccessMsg] = useState<string | null>(null);
  const [latestCloudSnapshot, setLatestCloudSnapshot] = useState<UserCloudData | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [isSyncHealthOpen, setIsSyncHealthOpen] = useState(false);
  const isUploadingRef = useRef(false);
  const inFlightUploadsRef = useRef(0);
  const uploadQueueRef = useRef<Promise<void>>(Promise.resolve());

  // Core Application Data States
  const [categories, setCategories] = useState<Category[]>(loadCategories);
  const [assets, setAssets] = useState<Asset[]>(loadAssets);
  const [transactions, setTransactions] = useState<LedgerTransaction[]>(loadTransactions);
  const [monthlyPrices, setMonthlyPrices] = useState<MonthlyPriceMap>(loadMonthlyPrices);
  const [monthlyNotes, setMonthlyNotes] = useState<MonthlyNotesMap>(loadMonthlyNotes);
  const [livePrices, setLivePrices] = useState<Record<string, number>>(loadCachedSpotPrices);
  const [settings, setSettings] = useState<AppSettings>(loadSettings);

  // Navigation Tab State (Default: 'ledger' if empty, otherwise 'dashboard')
  const [activeTab, setActiveTab] = useState<'dashboard' | 'ledger' | 'spreadsheet' | 'hierarchy' | 'rebalance'>(() => {
    const localTx = loadTransactions();
    return localTx.length === 0 ? 'ledger' : 'dashboard';
  });
  const hasUserSwitchedTabRef = useRef(false);
  const handleSelectTab = useCallback((tab: 'dashboard' | 'ledger' | 'spreadsheet' | 'hierarchy' | 'rebalance') => {
    hasUserSwitchedTabRef.current = true;
    setActiveTab(tab);
  }, []);

  const [chartType, setChartType] = useState<ChartType>('all');

  // Filter State
  const [filters, setFilters] = useState<FilterState>(() => ({
    categoryIds: loadCategories().map((c) => c.id),
    assetIds: loadAssets().map((a) => a.id),
    riskLevels: ['Low', 'Medium', 'High'],
    searchQuery: '',
  }));

  // Track known category and asset IDs so any newly synced or created items are automatically checked in filters
  const knownCategoryIdsRef = useRef<Set<string>>(new Set(loadCategories().map((c) => c.id)));
  const knownAssetIdsRef = useRef<Set<string>>(new Set(loadAssets().map((a) => a.id)));

  useEffect(() => {
    setFilters((prev) => {
      const allCatIds = categories.map((c) => c.id);
      const allAssetIds = assets.map((a) => a.id);

      const newCatIds = allCatIds.filter((id) => !knownCategoryIdsRef.current.has(id));
      const newAssetIds = allAssetIds.filter((id) => !knownAssetIdsRef.current.has(id));

      allCatIds.forEach((id) => knownCategoryIdsRef.current.add(id));
      allAssetIds.forEach((id) => knownAssetIdsRef.current.add(id));

      const validSelectedCats = prev.categoryIds.filter((id) => allCatIds.includes(id));
      const validSelectedAssets = prev.assetIds.filter((id) => allAssetIds.includes(id));

      // If filters were empty when categories/assets arrived from Cloud Sync, select all
      const nextCatIds =
        validSelectedCats.length === 0 && allCatIds.length > 0
          ? allCatIds
          : Array.from(new Set([...validSelectedCats, ...newCatIds]));

      const nextAssetIds =
        validSelectedAssets.length === 0 && allAssetIds.length > 0
          ? allAssetIds
          : Array.from(new Set([...validSelectedAssets, ...newAssetIds]));

      if (
        nextCatIds.length === prev.categoryIds.length &&
        nextAssetIds.length === prev.assetIds.length &&
        nextCatIds.every((id, idx) => id === prev.categoryIds[idx]) &&
        nextAssetIds.every((id, idx) => id === prev.assetIds[idx])
      ) {
        return prev;
      }

      return {
        ...prev,
        categoryIds: nextCatIds,
        assetIds: nextAssetIds,
      };
    });
  }, [categories, assets]);

  // Ensure v4 zero flag is set without wiping active cloud sessions
  useEffect(() => {
    const flag = localStorage.getItem('valuaq_zero_init_v4');
    if (!flag) {
      localStorage.setItem('valuaq_zero_init_v4', 'true');
    }
  }, []);

  // Auto-heal legacy USD / foreign currency assets where price was defaulted to 1
  useEffect(() => {
    if (assets.length === 0) return;
    let hasHealed = false;
    const healed = assets.map((a) => {
      const curr = (a.currency || '').toUpperCase();
      const isUSD = curr === 'USD' || curr === 'USDT' || curr === 'USDC';
      if (isUSD && (!a.currentPrice || a.currentPrice === 1)) {
        hasHealed = true;
        return { ...a, currentPrice: 32.5 };
      }
      return a;
    });

    if (hasHealed) {
      setAssets(healed);
      saveAssets(healed);
    }
  }, [assets]);

  // Modals
  const [isMonthEditorOpen, setIsMonthEditorOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<MonthlyRecord | null>(null);
  const [isDataModalOpen, setIsDataModalOpen] = useState(false);
  const [deletingRecordId, setDeletingRecordId] = useState<string | null>(null);

  // Derive Monthly Records from Ledger Transactions, Monthly Price Snapshots, and Monthly Decision Notes
  // Rule 2 & 4: 1st of month valuation = Qty on 1st of month * Price on 1st of month
  // Upcoming month shows live real-time market data
  const records: MonthlyRecord[] = useMemo(() => {
    const generated = generateMonthlyRecordsFromLedger(transactions, assets, monthlyPrices, livePrices, monthlyNotes);
    if (generated.length === 0) {
      return loadMonthlyRecords();
    }
    return generated;
  }, [transactions, assets, monthlyPrices, livePrices, monthlyNotes]);

  // Firebase Auth Observer
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (!currentUser) {
        setIsCloudLoaded(false);
        setLatestCloudSnapshot(null);
        setLastSyncedAt(null);
      }
    });
    return () => unsubscribe();
  }, []);

  // Helper to atomically apply a merged state across Categories, Assets, and Transactions
  const applyAtomicLocalMerge = useCallback((cloudData: UserCloudData) => {
    const localDeletedMonths = loadDeletedMonths();
    const finalDeletedMonths = Array.from(
      new Set([...(cloudData.deletedRecordMonths || []), ...localDeletedMonths])
    );
    const finalDeletedIds = mergeDeletedIds(cloudData.deletedIds, loadDeletedIds());
    saveDeletedMonths(finalDeletedMonths);
    saveDeletedIds(finalDeletedIds);

    const currentLocalCats = loadCategories();
    const currentLocalAssets = loadAssets();
    const currentLocalTx = loadTransactions();
    const currentLocalPrices = loadMonthlyPrices();
    const currentLocalNotes = loadMonthlyNotes();
    const currentLocalSettings = loadSettings();

    // 1. Merge Transactions first
    const finalTx = mergeTransactions(
      cloudData.transactions,
      currentLocalTx,
      finalDeletedIds.transactions
    );

    // 2. Merge Assets with referential integrity guard for active transactions
    const finalAssets = mergeAssets(
      cloudData.assets,
      currentLocalAssets,
      finalDeletedIds.assets,
      finalTx
    );

    // 3. Merge Categories with referential integrity guard for active assets
    const finalCats = mergeCategories(
      cloudData.categories,
      currentLocalCats,
      finalDeletedIds.categories,
      finalAssets
    );

    const finalPrices = mergeMonthlyPrices(cloudData.monthlyPrices, currentLocalPrices);
    const finalNotes = mergeMonthlyNotes(cloudData.monthlyNotes, currentLocalNotes);
    const finalSettings = mergeSettings(cloudData.settings, currentLocalSettings);

    // Persist atomically to localStorage before updating React state
    saveCategories(finalCats);
    saveAssets(finalAssets);
    saveTransactions(finalTx);
    saveMonthlyPrices(finalPrices);
    saveMonthlyNotes(finalNotes);
    saveSettings(finalSettings);

    // Apply all state updates in a single synchronous batch
    setCategories(finalCats);
    setAssets(finalAssets);
    setTransactions(finalTx);
    setMonthlyPrices(finalPrices);
    setMonthlyNotes(finalNotes);
    setSettings(finalSettings);

    if (finalTx.length > 0 && !hasUserSwitchedTabRef.current) {
      setActiveTab('dashboard');
    }

    return {
      finalCats,
      finalAssets,
      finalTx,
      finalPrices,
      finalNotes,
      finalSettings,
      finalDeletedMonths,
      finalDeletedIds,
    };
  }, []);

  // Fetch Cloud Data upon connection with Set Union Guard & Tombstone Protection
  useEffect(() => {
    if (!user) {
      setIsCloudLoaded(false);
      setLatestCloudSnapshot(null);
      return;
    }

    setIsCloudLoaded(false);
    setIsSyncing(true);
    setSyncError(null);

    fetchUserCloudData(user.uid, { fromServer: true })
      .then(async (cloudData) => {
        const localDeletedMonths = loadDeletedMonths();
        const localDeletedIds = loadDeletedIds();

        if (cloudData) {
          const {
            finalCats,
            finalAssets,
            finalTx,
            finalPrices,
            finalNotes,
            finalSettings,
            finalDeletedMonths,
            finalDeletedIds,
          } = applyAtomicLocalMerge(cloudData);

          // Seed spot prices from synced assets
          const syncedSpotPrices: Record<string, number> = {};
          finalAssets.forEach((a) => {
            if (a.currentPrice && a.currentPrice > 0) {
              syncedSpotPrices[a.id] = a.currentPrice;
            }
          });
          if (Object.keys(syncedSpotPrices).length > 0) {
            setLivePrices((prev) => ({ ...syncedSpotPrices, ...prev }));
          }

          const freshRecords = generateMonthlyRecordsFromLedger(
            finalTx,
            finalAssets,
            finalPrices,
            { ...syncedSpotPrices, ...livePrices },
            finalNotes
          );

          isUploadingRef.current = true;
          try {
            const syncResult = await syncDataToCloud(user.uid, {
              categories: finalCats,
              assets: finalAssets,
              records: freshRecords,
              transactions: finalTx,
              monthlyPrices: finalPrices,
              monthlyNotes: finalNotes,
              settings: finalSettings,
              deletedRecordMonths: finalDeletedMonths,
              deletedIds: finalDeletedIds,
            });
            if (syncResult) {
              saveCategories(syncResult.categories);
              saveAssets(syncResult.assets);
              saveTransactions(syncResult.transactions);
              saveMonthlyPrices(syncResult.monthlyPrices);
              saveMonthlyNotes(syncResult.monthlyNotes);
              saveSettings(syncResult.settings);
              saveDeletedMonths(syncResult.deletedRecordMonths);
              saveDeletedIds(syncResult.deletedIds);

              setCategories(syncResult.categories);
              setAssets(syncResult.assets);
              setTransactions(syncResult.transactions);
              setMonthlyPrices(syncResult.monthlyPrices);
              setMonthlyNotes(syncResult.monthlyNotes);
              setSettings(syncResult.settings);

              setLatestCloudSnapshot({
                categories: syncResult.categories,
                assets: syncResult.assets,
                records: syncResult.records,
                transactions: syncResult.transactions,
                monthlyPrices: syncResult.monthlyPrices,
                monthlyNotes: syncResult.monthlyNotes,
                settings: syncResult.settings,
                deletedRecordMonths: syncResult.deletedRecordMonths,
                deletedIds: syncResult.deletedIds,
              });
              setLastSyncedAt(new Date().toLocaleTimeString());
            } else {
              setLatestCloudSnapshot({
                categories: finalCats,
                assets: finalAssets,
                records: freshRecords,
                transactions: finalTx,
                monthlyPrices: finalPrices,
                monthlyNotes: finalNotes,
                settings: finalSettings,
                deletedRecordMonths: finalDeletedMonths,
                deletedIds: finalDeletedIds,
              });
              setLastSyncedAt(new Date().toLocaleTimeString());
            }
          } finally {
            isUploadingRef.current = inFlightUploadsRef.current > 0;
          }
        } else {
          // Initialize empty cloud database with current local data
          const currentLocalCats = loadCategories();
          const currentLocalAssets = loadAssets();
          const currentLocalTx = loadTransactions();
          const currentLocalPrices = loadMonthlyPrices();
          const currentLocalNotes = loadMonthlyNotes();
          const currentLocalSettings = loadSettings();
          const freshRecords = generateMonthlyRecordsFromLedger(
            currentLocalTx,
            currentLocalAssets,
            currentLocalPrices,
            livePrices,
            currentLocalNotes
          );

          isUploadingRef.current = true;
          try {
            const syncResult = await syncDataToCloud(user.uid, {
              categories: currentLocalCats,
              assets: currentLocalAssets,
              records: freshRecords,
              transactions: currentLocalTx,
              monthlyPrices: currentLocalPrices,
              monthlyNotes: currentLocalNotes,
              settings: currentLocalSettings,
              deletedRecordMonths: localDeletedMonths,
              deletedIds: localDeletedIds,
            });
            if (syncResult) {
              setLatestCloudSnapshot({
                categories: syncResult.categories,
                assets: syncResult.assets,
                records: syncResult.records,
                transactions: syncResult.transactions,
                monthlyPrices: syncResult.monthlyPrices,
                monthlyNotes: syncResult.monthlyNotes,
                settings: syncResult.settings,
                deletedRecordMonths: syncResult.deletedRecordMonths,
                deletedIds: syncResult.deletedIds,
              });
              setLastSyncedAt(new Date().toLocaleTimeString());
            }
          } finally {
            isUploadingRef.current = inFlightUploadsRef.current > 0;
          }
        }
        setIsCloudLoaded(true);
      })
      .catch((err: any) => {
        console.error('Cloud fetch error:', err);
        setSyncError('Failed to fetch cloud portfolio data. Click Sync to retry.');
      })
      .finally(() => {
        setIsSyncing(false);
      });

    // Real-time Firestore Subscription (Atomic Ledger + Asset + Category application)
    const unsubscribeSnapshot = subscribeToUserData(
      user.uid,
      (cloudData) => {
        if (!cloudData || isUploadingRef.current) return;

        const merged = applyAtomicLocalMerge(cloudData);
        const mergedChecksum = computeLedgerChecksum({
          categories: merged.finalCats,
          assets: merged.finalAssets,
          transactions: merged.finalTx,
        });
        const incomingChecksum = computeLedgerChecksum({
          categories: cloudData.categories || [],
          assets: cloudData.assets || [],
          transactions: cloudData.transactions || [],
        });

        setLatestCloudSnapshot({
          ...cloudData,
          categories: merged.finalCats,
          assets: merged.finalAssets,
          transactions: merged.finalTx,
          monthlyPrices: merged.finalPrices,
          monthlyNotes: merged.finalNotes,
          settings: merged.finalSettings,
          deletedRecordMonths: merged.finalDeletedMonths,
          deletedIds: merged.finalDeletedIds,
        });
        setLastSyncedAt(new Date().toLocaleTimeString());

        if (mergedChecksum !== incomingChecksum && !isUploadingRef.current) {
          const freshRecords = generateMonthlyRecordsFromLedger(
            merged.finalTx,
            merged.finalAssets,
            merged.finalPrices,
            livePrices,
            merged.finalNotes
          );
          syncDataToCloud(user.uid, {
            categories: merged.finalCats,
            assets: merged.finalAssets,
            records: freshRecords,
            transactions: merged.finalTx,
            monthlyPrices: merged.finalPrices,
            monthlyNotes: merged.finalNotes,
            settings: merged.finalSettings,
            deletedRecordMonths: merged.finalDeletedMonths,
            deletedIds: merged.finalDeletedIds,
          }).catch((e) => console.warn('Background reconciliation sync failed:', e));
        }
      },
      (err) => {
        console.error('Firestore real-time subscription error:', err);
      }
    );

    return () => {
      unsubscribeSnapshot();
    };
  }, [user, applyAtomicLocalMerge]);

  // Window Focus / Tab Visibility listener to catch up if Device B was in background
  useEffect(() => {
    if (!user) return;
    const handleVisibilityOrFocus = () => {
      if (document.visibilityState === 'visible' && !isUploadingRef.current) {
        fetchUserCloudData(user.uid, { fromServer: true })
          .then((cloudData) => {
            if (!cloudData || isUploadingRef.current) return;
            const merged = applyAtomicLocalMerge(cloudData);
            const mergedChecksum = computeLedgerChecksum({
              categories: merged.finalCats,
              assets: merged.finalAssets,
              transactions: merged.finalTx,
            });
            const incomingChecksum = computeLedgerChecksum({
              categories: cloudData.categories || [],
              assets: cloudData.assets || [],
              transactions: cloudData.transactions || [],
            });

            setLatestCloudSnapshot({
              ...cloudData,
              categories: merged.finalCats,
              assets: merged.finalAssets,
              transactions: merged.finalTx,
              monthlyPrices: merged.finalPrices,
              monthlyNotes: merged.finalNotes,
              settings: merged.finalSettings,
              deletedRecordMonths: merged.finalDeletedMonths,
              deletedIds: merged.finalDeletedIds,
            });
            setLastSyncedAt(new Date().toLocaleTimeString());

            if (mergedChecksum !== incomingChecksum && !isUploadingRef.current) {
              const freshRecords = generateMonthlyRecordsFromLedger(
                merged.finalTx,
                merged.finalAssets,
                merged.finalPrices,
                livePrices,
                merged.finalNotes
              );
              syncDataToCloud(user.uid, {
                categories: merged.finalCats,
                assets: merged.finalAssets,
                records: freshRecords,
                transactions: merged.finalTx,
                monthlyPrices: merged.finalPrices,
                monthlyNotes: merged.finalNotes,
                settings: merged.finalSettings,
                deletedRecordMonths: merged.finalDeletedMonths,
                deletedIds: merged.finalDeletedIds,
              }).catch((e) => console.warn('Visibility background sync failed:', e));
            }
          })
          .catch((err) => console.warn('Visibility cloud sync check failed:', err));
      }
    };

    window.addEventListener('focus', handleVisibilityOrFocus);
    document.addEventListener('visibilitychange', handleVisibilityOrFocus);
    return () => {
      window.removeEventListener('focus', handleVisibilityOrFocus);
      document.removeEventListener('visibilitychange', handleVisibilityOrFocus);
    };
  }, [user, applyAtomicLocalMerge]);

  // Save changes to localStorage
  useEffect(() => {
    saveCategories(categories);
  }, [categories]);

  useEffect(() => {
    saveAssets(assets);
  }, [assets]);

  useEffect(() => {
    saveTransactions(transactions);
  }, [transactions]);

  useEffect(() => {
    saveMonthlyPrices(monthlyPrices);
  }, [monthlyPrices]);

  useEffect(() => {
    saveMonthlyNotes(monthlyNotes);
  }, [monthlyNotes]);

  useEffect(() => {
    saveMonthlyRecords(records);
  }, [records]);

  useEffect(() => {
    saveSettings(settings);
  }, [settings]);

  // Real-time market prices auto-polling interval (Shortest tested: 1 second)
  useEffect(() => {
    let isCancelled = false;
    let timerId: NodeJS.Timeout | null = null;
    let isFetching = false;

    const pollLivePrices = async () => {
      if (isCancelled || isFetching) return;
      if (assets.length === 0) {
        timerId = setTimeout(pollLivePrices, 1000);
        return;
      }

      isFetching = true;
      try {
        const updated = await fetchLiveMarketPrices(assets, livePrices);
        if (!isCancelled && updated) {
          setLivePrices((prev) => {
            let hasChange = false;
            for (const key in updated) {
              if (updated[key] !== prev[key]) {
                hasChange = true;
                break;
              }
            }
            if (hasChange) {
              saveCachedSpotPrices(updated);
              return updated;
            }
            return prev;
          });
        }
      } catch (err) {
        console.warn('1s live price polling error:', err);
      } finally {
        isFetching = false;
        if (!isCancelled) {
          // Schedule next tick 1s after previous response to prevent queue piling
          timerId = setTimeout(pollLivePrices, 1000);
        }
      }
    };

    // Immediate initial fetch
    pollLivePrices();

    return () => {
      isCancelled = true;
      if (timerId) clearTimeout(timerId);
    };
  }, [assets]);

  // Auto-resolve missing 1st-of-month prices for assets with tickers from market API
  useEffect(() => {
    if (assets.length === 0 || transactions.length === 0) return;

    // Collect all historical months from transactions
    const historicalMonths = new Set<string>();
    transactions.forEach((tx) => {
      if (tx.date && tx.date.length >= 7) {
        historicalMonths.add(tx.date.slice(0, 7));
      }
    });

    const assetsToFetch: { month: string; asset: Asset }[] = [];
    historicalMonths.forEach((month) => {
      assets.forEach((ast) => {
        if (ast.isCash) return;
        const sym = (ast.tickerSymbol || '').trim();
        if (!sym) return;

        // Check if price already exists in monthlyPrices
        if (!monthlyPrices[month] || monthlyPrices[month][ast.id] === undefined) {
          assetsToFetch.push({ month, asset: ast });
        }
      });
    });

    if (assetsToFetch.length === 0) return;

    // Fetch missing historical prices (batch up to 8)
    let isCancelled = false;
    Promise.all(
      assetsToFetch.slice(0, 8).map(async ({ month, asset }) => {
        const hist = await fetchHistoricalPriceForDate(asset.tickerSymbol!, `${month}-01`);
        if (hist && hist.priceNTD > 0) {
          return { month, assetId: asset.id, price: hist.priceNTD };
        }
        return null;
      })
    ).then((results) => {
      if (isCancelled) return;
      const updates = results.filter(Boolean) as { month: string; assetId: string; price: number }[];
      if (updates.length > 0) {
        setMonthlyPrices((prev) => {
          const next = { ...prev };
          updates.forEach(({ month, assetId, price }) => {
            if (!next[month]) next[month] = {};
            if (next[month][assetId] === undefined) {
              next[month][assetId] = price;
            }
          });
          saveMonthlyPrices(next);
          return next;
        });
      }
    });

    return () => {
      isCancelled = true;
    };
  }, [assets, transactions, monthlyPrices]);

  // Serialized Atomic Cloud Upload Queue with Union Guard & Tombstone Protection
  const triggerCloudUpload = (
    nextCategories: Category[] = categories,
    nextAssets: Asset[] = assets,
    nextTx: LedgerTransaction[] = transactions,
    nextPrices: MonthlyPriceMap = monthlyPrices,
    nextSettings: AppSettings = settings,
    overwrite: boolean = false,
    nextNotes: MonthlyNotesMap = monthlyNotes,
    nextDeletedIds?: DeletedIdsMap
  ) => {
    if (!user) return Promise.resolve();
    const uid = user.uid;
    inFlightUploadsRef.current += 1;
    isUploadingRef.current = true;
    setIsSyncing(true);
    setSyncError(null);

    const runUpload = async () => {
      try {
        const deletedMonths = loadDeletedMonths();
        const deletedIds = nextDeletedIds || loadDeletedIds();
        const nextRecords = generateMonthlyRecordsFromLedger(
          nextTx,
          nextAssets,
          nextPrices,
          livePrices,
          nextNotes
        );
        const syncResult = await syncDataToCloud(
          uid,
          {
            categories: nextCategories,
            assets: nextAssets,
            records: nextRecords,
            transactions: nextTx,
            monthlyPrices: nextPrices,
            monthlyNotes: nextNotes,
            settings: nextSettings,
            deletedRecordMonths: deletedMonths,
            deletedIds,
          },
          { overwrite }
        );

        if (syncResult) {
          saveCategories(syncResult.categories);
          saveAssets(syncResult.assets);
          saveTransactions(syncResult.transactions);
          saveMonthlyPrices(syncResult.monthlyPrices);
          saveMonthlyNotes(syncResult.monthlyNotes);
          saveSettings(syncResult.settings);
          saveDeletedMonths(syncResult.deletedRecordMonths);
          saveDeletedIds(syncResult.deletedIds);

          setCategories(syncResult.categories);
          setAssets(syncResult.assets);
          setTransactions(syncResult.transactions);
          setMonthlyPrices(syncResult.monthlyPrices);
          setMonthlyNotes(syncResult.monthlyNotes);
          setSettings(syncResult.settings);

          setLatestCloudSnapshot({
            categories: syncResult.categories,
            assets: syncResult.assets,
            records: syncResult.records,
            transactions: syncResult.transactions,
            monthlyPrices: syncResult.monthlyPrices,
            monthlyNotes: syncResult.monthlyNotes,
            settings: syncResult.settings,
            deletedRecordMonths: syncResult.deletedRecordMonths,
            deletedIds: syncResult.deletedIds,
          });
          setLastSyncedAt(new Date().toLocaleTimeString());
        }
      } catch (err: any) {
        console.error('Cloud upload/sync error:', err);
        setSyncError('Cloud sync encountered an error saving changes. Click Sync in the top bar to retry.');
      } finally {
        inFlightUploadsRef.current = Math.max(0, inFlightUploadsRef.current - 1);
        if (inFlightUploadsRef.current === 0) {
          isUploadingRef.current = false;
          setIsSyncing(false);
        }
      }
    };

    uploadQueueRef.current = uploadQueueRef.current.then(runUpload, runUpload);
    return uploadQueueRef.current;
  };

  // Manual Sync & Atomic Union Reconcile trigger
  const handleManualSync = async () => {
    if (!user) return;
    setIsSyncing(true);
    setSyncError(null);
    isUploadingRef.current = true;
    try {
      const cloudData = await fetchUserCloudData(user.uid, { fromServer: true });
      const localDeletedMonths = loadDeletedMonths();
      const localDeletedIds = loadDeletedIds();

      const currentLocalCats = loadCategories();
      const currentLocalAssets = loadAssets();
      const currentLocalTx = loadTransactions();
      const currentLocalPrices = loadMonthlyPrices();
      const currentLocalNotes = loadMonthlyNotes();
      const currentLocalSettings = loadSettings();

      if (cloudData) {
        const {
          finalCats,
          finalAssets,
          finalTx,
          finalPrices,
          finalNotes,
          finalSettings,
          finalDeletedMonths,
          finalDeletedIds,
        } = applyAtomicLocalMerge(cloudData);

        const freshRecords = generateMonthlyRecordsFromLedger(
          finalTx,
          finalAssets,
          finalPrices,
          livePrices,
          finalNotes
        );

        const syncResult = await syncDataToCloud(user.uid, {
          categories: finalCats,
          assets: finalAssets,
          records: freshRecords,
          transactions: finalTx,
          monthlyPrices: finalPrices,
          monthlyNotes: finalNotes,
          settings: finalSettings,
          deletedRecordMonths: finalDeletedMonths,
          deletedIds: finalDeletedIds,
        });

        if (syncResult) {
          saveCategories(syncResult.categories);
          saveAssets(syncResult.assets);
          saveTransactions(syncResult.transactions);
          saveMonthlyPrices(syncResult.monthlyPrices);
          saveMonthlyNotes(syncResult.monthlyNotes);
          saveSettings(syncResult.settings);
          saveDeletedMonths(syncResult.deletedRecordMonths);
          saveDeletedIds(syncResult.deletedIds);

          setCategories(syncResult.categories);
          setAssets(syncResult.assets);
          setTransactions(syncResult.transactions);
          setMonthlyPrices(syncResult.monthlyPrices);
          setMonthlyNotes(syncResult.monthlyNotes);
          setSettings(syncResult.settings);

          setLatestCloudSnapshot({
            categories: syncResult.categories,
            assets: syncResult.assets,
            records: syncResult.records,
            transactions: syncResult.transactions,
            monthlyPrices: syncResult.monthlyPrices,
            monthlyNotes: syncResult.monthlyNotes,
            settings: syncResult.settings,
            deletedRecordMonths: syncResult.deletedRecordMonths,
            deletedIds: syncResult.deletedIds,
          });
          setLastSyncedAt(new Date().toLocaleTimeString());
        }
      } else {
        const freshRecords = generateMonthlyRecordsFromLedger(
          currentLocalTx,
          currentLocalAssets,
          currentLocalPrices,
          livePrices,
          currentLocalNotes
        );
        const syncResult = await syncDataToCloud(user.uid, {
          categories: currentLocalCats,
          assets: currentLocalAssets,
          records: freshRecords,
          transactions: currentLocalTx,
          monthlyPrices: currentLocalPrices,
          monthlyNotes: currentLocalNotes,
          settings: currentLocalSettings,
          deletedRecordMonths: localDeletedMonths,
          deletedIds: localDeletedIds,
        });
        if (syncResult) {
          setLatestCloudSnapshot({
            categories: syncResult.categories,
            assets: syncResult.assets,
            records: syncResult.records,
            transactions: syncResult.transactions,
            monthlyPrices: syncResult.monthlyPrices,
            monthlyNotes: syncResult.monthlyNotes,
            settings: syncResult.settings,
            deletedRecordMonths: syncResult.deletedRecordMonths,
            deletedIds: syncResult.deletedIds,
          });
          setLastSyncedAt(new Date().toLocaleTimeString());
        }
      }

      setSyncSuccessMsg('Ledger & Cloud Snapshot reconciled atomically.');
      setTimeout(() => setSyncSuccessMsg(null), 3000);
    } catch (err: any) {
      console.error('Manual sync error:', err);
      setSyncError('Manual sync failed. Please check your connection and try again.');
    } finally {
      isUploadingRef.current = inFlightUploadsRef.current > 0;
      if (!isUploadingRef.current) {
        setIsSyncing(false);
      }
    }
  };

  // Explicit Sync Health Reconcile Actions
  const handleVerifyLiveServer = async () => {
    if (!user) return;
    setIsSyncing(true);
    setSyncError(null);
    try {
      const serverSnapshot = await fetchUserCloudData(user.uid, { fromServer: true });
      if (serverSnapshot) {
        setLatestCloudSnapshot(serverSnapshot);
        setLastSyncedAt(new Date().toLocaleTimeString());
      }
    } catch (err) {
      console.error('Server snapshot verification error:', err);
      setSyncError('Could not verify live server snapshot. Please check your connection.');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleReconcilePullCloud = async () => {
    if (!user) return;
    setIsSyncing(true);
    setSyncError(null);
    try {
      const serverSnapshot = await fetchUserCloudData(user.uid, { fromServer: true });
      if (serverSnapshot) {
        const nextCats = serverSnapshot.categories || [];
        const nextAssets = serverSnapshot.assets || [];
        const nextTx = serverSnapshot.transactions || [];
        const nextPrices = serverSnapshot.monthlyPrices || {};
        const nextNotes = serverSnapshot.monthlyNotes || {};
        const nextSettings = serverSnapshot.settings || settings;
        const nextDeletedMonths = serverSnapshot.deletedRecordMonths || [];
        const nextDeletedIds = serverSnapshot.deletedIds || {
          categories: [],
          assets: [],
          transactions: [],
        };

        saveCategories(nextCats);
        saveAssets(nextAssets);
        saveTransactions(nextTx);
        saveMonthlyPrices(nextPrices);
        saveMonthlyNotes(nextNotes);
        saveSettings(nextSettings);
        saveDeletedMonths(nextDeletedMonths);
        saveDeletedIds(nextDeletedIds);

        setCategories(nextCats);
        setAssets(nextAssets);
        setTransactions(nextTx);
        setMonthlyPrices(nextPrices);
        setMonthlyNotes(nextNotes);
        setSettings(nextSettings);

        setLatestCloudSnapshot(serverSnapshot);
        setLastSyncedAt(new Date().toLocaleTimeString());
        setSyncSuccessMsg('Adopted authoritative Cloud Snapshot on this device.');
        setTimeout(() => setSyncSuccessMsg(null), 3000);
      }
    } catch (err) {
      console.error('Pull cloud snapshot error:', err);
      setSyncError('Failed to adopt Cloud Snapshot.');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleReconcilePushLocal = async () => {
    if (!user) return;
    await triggerCloudUpload(
      categories,
      assets,
      transactions,
      monthlyPrices,
      settings,
      true,
      monthlyNotes,
      loadDeletedIds()
    );
    setSyncSuccessMsg('Local Ledger atomically pushed to Cloud Snapshot.');
    setTimeout(() => setSyncSuccessMsg(null), 3000);
  };

  // Continuous Sync Health Monitor Report
  const syncHealth = useMemo(
    () =>
      computeSyncHealthReport({
        isAuthenticated: Boolean(user),
        isSyncing,
        isCloudLoaded,
        localCategories: categories,
        localAssets: assets,
        localTransactions: transactions,
        localDeletedIds: loadDeletedIds(),
        cloudSnapshot: latestCloudSnapshot,
      }),
    [user, isSyncing, isCloudLoaded, categories, assets, transactions, latestCloudSnapshot]
  );

  const handleSignIn = async () => {
    setSyncError(null);
    setIsSyncing(true);
    try {
      await signInWithGoogle();
      setSyncSuccessMsg('Signed in & connected to Google Cloud Sync.');
      setTimeout(() => setSyncSuccessMsg(null), 3500);
    } catch (error: any) {
      console.error('Login failed:', error);
      const code = error?.code || '';
      if (code === 'auth/popup-blocked') {
        setSyncError('Google Sign-In popup was blocked by your browser. Please allow popups for this site and try again.');
      } else if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
        setSyncError('Google Sign-In window was closed before completing sign-in.');
      } else if (code === 'auth/unauthorized-domain') {
        setSyncError('This preview domain is not yet authorized in Firebase Auth settings.');
      } else {
        setSyncError(error?.message || 'Google Sign-In failed. Please allow popups and try again.');
      }
    } finally {
      setIsSyncing(false);
    }
  };

  const handleSignOut = async () => {
    try {
      await signOutUser();
      setUser(null);
      setIsCloudLoaded(false);
      setLatestCloudSnapshot(null);
      setLastSyncedAt(null);
      setSyncError(null);
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  const handleUpdateSettings = (newSettings: Partial<AppSettings>) => {
    setSettings((prev) => {
      const updated = { ...prev, ...newSettings, currencySymbol: 'NT$' };
      triggerCloudUpload(categories, assets, transactions, monthlyPrices, updated, false, monthlyNotes);
      return updated;
    });
  };

  const handleUpdateFilters = (newFilters: Partial<FilterState>) => {
    setFilters((prev) => ({ ...prev, ...newFilters }));
  };

  const handleResetFilters = () => {
    setFilters({
      categoryIds: categories.map((c) => c.id),
      assetIds: assets.map((a) => a.id),
      riskLevels: ['Low', 'Medium', 'High'],
      searchQuery: '',
    });
  };

  // Maps
  const categoryMap = useMemo(() => {
    const map = new Map<string, Category>();
    categories.forEach((c) => map.set(c.id, c));
    return map;
  }, [categories]);

  // Active Asset IDs based on current filters
  const activeAssetIds = useMemo(() => {
    return assets
      .filter((a) => {
        if (!filters.assetIds.includes(a.id)) return false;
        if (!filters.categoryIds.includes(a.categoryId)) return false;
        const cat = categoryMap.get(a.categoryId);
        if (cat && !filters.riskLevels.includes(cat.riskLevel)) return false;
        if (filters.searchQuery) {
          const q = filters.searchQuery.toLowerCase();
          const assetMatch = a.name.toLowerCase().includes(q);
          const catMatch = cat ? cat.name.toLowerCase().includes(q) : false;
          if (!assetMatch && !catMatch) return false;
        }
        return true;
      })
      .map((a) => a.id);
  }, [assets, categoryMap, filters]);

  // Latest Record for KPI cards
  const latestRecord = useMemo(() => {
    if (records.length === 0) return null;
    return records[records.length - 1];
  }, [records]);

  const prevLatestRecord = useMemo(() => {
    if (records.length < 2) return undefined;
    return records[records.length - 2];
  }, [records]);

  // Calculate metrics for latest month under active filters
  const metrics = useMemo(() => {
    if (!latestRecord) {
      return {
        monthName: 'N/A',
        isLive: true,
        totalPortfolio: 0,
        prevTotalPortfolio: undefined,
        totalMoneyInvested: 0,
        monthlyMoneyInvested: 0,
        floatingPL: 0,
        floatingPLPercent: 0,
        totalDividendIncome: 0,
        monthlyDividendIncome: 0,
        emergencyFund: 0,
        totalCapital: 0,
        riskBreakdown: { Low: { amount: 0, percent: 0 }, Medium: { amount: 0, percent: 0 }, High: { amount: 0, percent: 0 } },
        assetPLContributions: [] as AssetPLContribution[],
      };
    }

    const rawValues = latestRecord.assetValues || {};
    let totalPortfolio = 0;
    const riskAmounts: Record<RiskLevel, number> = { Low: 0, Medium: 0, High: 0 };

    assets
      .filter((a) => activeAssetIds.includes(a.id) && !isEmergencyFundAsset(a))
      .forEach((a) => {
        const val = rawValues[a.id] || 0;
        totalPortfolio += val;

        const cat = categoryMap.get(a.categoryId);
        const risk = cat ? cat.riskLevel : 'Low';
        riskAmounts[risk] = (riskAmounts[risk] || 0) + val;
      });

    let prevTotalPortfolio: number | undefined = undefined;
    if (prevLatestRecord) {
      const prevVals = prevLatestRecord.assetValues || {};
      let sum = 0;
      assets
        .filter((a) => activeAssetIds.includes(a.id) && !isEmergencyFundAsset(a))
        .forEach((a) => {
          sum += prevVals[a.id] || 0;
        });
      prevTotalPortfolio = sum;
    }

    const nonEfAssets = assets.filter((a) => !isEmergencyFundAsset(a));
    const activeNonEfAssets = nonEfAssets.filter((a) => activeAssetIds.includes(a.id));
    const isAllSelected = activeNonEfAssets.length === nonEfAssets.length;

    let totalMoneyInvested = 0;
    let monthlyMoneyInvested = 0;
    let totalDividendIncome = 0;
    let monthlyDividendIncome = 0;

    if (isAllSelected) {
      totalMoneyInvested = latestRecord.totalMoneyInvested || 0;
      monthlyMoneyInvested = latestRecord.monthlyMoneyInvested || 0;
      totalDividendIncome = latestRecord.totalDividendIncome || 0;
      monthlyDividendIncome = latestRecord.monthlyDividendIncome || 0;
    } else {
      let cumulativeFilteredInvested = 0;
      records.forEach((r) => {
        const rawInv = r.assetInvestedValues || {};
        activeNonEfAssets.forEach((a) => {
          cumulativeFilteredInvested += Number(rawInv[a.id]) || 0;
        });
      });
      totalMoneyInvested = Math.max(0, Math.round(cumulativeFilteredInvested * 100) / 100);

      const latestInv = latestRecord.assetInvestedValues || {};
      let latestMonthlyFiltered = 0;
      activeNonEfAssets.forEach((a) => {
        latestMonthlyFiltered += Number(latestInv[a.id]) || 0;
      });
      monthlyMoneyInvested = Math.round(latestMonthlyFiltered * 100) / 100;

      // Filter passive dividend/yield income by the selected assets (either received into or generated by the selected assets)
      const activeIdSet = new Set(activeNonEfAssets.map((a) => a.id));
      const latestMonthKey = latestRecord.monthKey;
      transactions.forEach((tx) => {
        if (tx.action !== 'dividend') return;
        const matchesFilter =
          activeIdSet.has(tx.toAssetId) || (Boolean(tx.fromAssetId) && activeIdSet.has(tx.fromAssetId!));
        if (!matchesFilter) return;
        const toAst = assets.find((a) => a.id === tx.toAssetId);
        const unitPrice = toAst?.currentPrice && toAst.currentPrice > 0 ? toAst.currentPrice : 1;
        const divNtd = (Number(tx.toValue) || 0) * unitPrice;
        totalDividendIncome += divNtd;
        if (latestMonthKey && tx.date.slice(0, 7) === latestMonthKey) {
          monthlyDividendIncome += divNtd;
        }
      });
      totalDividendIncome = Math.round(totalDividendIncome * 100) / 100;
      monthlyDividendIncome = Math.round(monthlyDividendIncome * 100) / 100;
    }

    const floatingPL = totalPortfolio - totalMoneyInvested;
    const floatingPLPercent = totalMoneyInvested > 0 ? (floatingPL / totalMoneyInvested) * 100 : 0;

    const riskBreakdown: Record<RiskLevel, { amount: number; percent: number }> = {
      Low: {
        amount: riskAmounts.Low,
        percent: totalPortfolio > 0 ? (riskAmounts.Low / totalPortfolio) * 100 : 0,
      },
      Medium: {
        amount: riskAmounts.Medium,
        percent: totalPortfolio > 0 ? (riskAmounts.Medium / totalPortfolio) * 100 : 0,
      },
      High: {
        amount: riskAmounts.High,
        percent: totalPortfolio > 0 ? (riskAmounts.High / totalPortfolio) * 100 : 0,
      },
    };

    // Compute per-asset P&L contributions for the Floating P&L card cycler & breakdown modal
    const assetPLContributions: AssetPLContribution[] = activeNonEfAssets.map((a) => {
      const cat = categoryMap.get(a.categoryId);
      const isCashAst = Boolean(a.isCash || cat?.isCashCategory);
      const curr = (a.currency || 'NTD').toUpperCase();
      const sym = (a.tickerSymbol || '').toUpperCase();
      const isNtdBaseCash =
        isCashAst && (curr === 'NTD' || curr === 'TWD' || sym === 'NTD' || sym === 'TWD');

      const currentValue = Number(rawValues[a.id]) || 0;
      const quantity = Number(latestRecord.assetQuantities?.[a.id]) || 0;
      const unitPrice = getAssetBasePrice(a, latestRecord.assetPrices, livePrices);

      let rawInvested = 0;
      records.forEach((r) => {
        rawInvested += Number(r.assetInvestedValues?.[a.id]) || 0;
      });
      const investedCost = isNtdBaseCash
        ? Math.max(0, Math.round(currentValue * 100) / 100)
        : Math.max(0, Math.round(rawInvested * 100) / 100);

      let dividendEarned = 0;
      transactions.forEach((tx) => {
        if (tx.action !== 'dividend') return;
        const isSourceOrDest =
          tx.fromAssetId === a.id || (!tx.fromAssetId && tx.toAssetId === a.id);
        if (!isSourceOrDest) return;
        const toAst = assets.find((ast) => ast.id === tx.toAssetId);
        const p = toAst ? getAssetBasePrice(toAst, latestRecord.assetPrices, livePrices) : 1;
        dividendEarned += (Number(tx.toValue) || 0) * p;
      });
      dividendEarned = Math.round(dividendEarned * 100) / 100;

      // Base currency NTD Cash never fluctuates in price (1 NTD = 1 NTD); Floating P&L is strictly 0
      const plAmount = isNtdBaseCash
        ? 0
        : Math.round((currentValue - investedCost) * 100) / 100;
      const plPercent = isNtdBaseCash || investedCost <= 0 ? 0 : (plAmount / investedCost) * 100;

      return {
        id: a.id,
        name: a.name,
        tickerSymbol: a.tickerSymbol,
        currency: a.currency,
        isCash: isCashAst,
        categoryId: a.categoryId,
        categoryName: cat?.name || 'Uncategorized',
        categoryColor: cat?.color || '#10b981',
        riskLevel: cat?.riskLevel || 'Low',
        quantity,
        unitPrice,
        currentValue,
        investedCost,
        dividendEarned,
        plAmount,
        plPercent,
      };
    });

    return {
      monthName: latestRecord.month,
      isLive: Boolean(latestRecord.isLivePending),
      totalPortfolio,
      prevTotalPortfolio,
      totalMoneyInvested,
      monthlyMoneyInvested,
      floatingPL,
      floatingPLPercent,
      totalDividendIncome,
      monthlyDividendIncome,
      emergencyFund: latestRecord.emergencyFund || 0,
      totalCapital: totalPortfolio + (latestRecord.emergencyFund || 0),
      riskBreakdown,
      assetPLContributions,
    };
  }, [records, latestRecord, prevLatestRecord, assets, activeAssetIds, categoryMap, transactions, livePrices]);

  // 6-Month Portfolio Value Trend for Mini Sparkline in KPI Cards
  const sixMonthPortfolioTrend = useMemo(() => {
    if (records.length === 0) return [];
    const last6 = records.slice(-6);
    return last6.map((r) => {
      const rawVals = r.assetValues || {};
      let val = 0;
      assets
        .filter((a) => activeAssetIds.includes(a.id) && !isEmergencyFundAsset(a))
        .forEach((a) => {
          val += Number(rawVals[a.id]) || 0;
        });
      return {
        month: r.month,
        value: val,
        isLive: Boolean(r.isLivePending),
      };
    });
  }, [records, assets, activeAssetIds]);

  // 6-Month Monthly Savings Trend (how much was saved/invested into assets each month)
  // User instruction: exclude the Live in-progress month so the chart strictly shows 6 completed historical months (e.g. May to Oct)
  const sixMonthSavingsTrend = useMemo(() => {
    const finalizedRecords = records.filter((r) => !r.isLivePending);
    if (finalizedRecords.length === 0) return [];
    const nonEfAssets = assets.filter((a) => !isEmergencyFundAsset(a));
    const activeNonEfAssets = nonEfAssets.filter((a) => activeAssetIds.includes(a.id));
    const isAllSelected = activeNonEfAssets.length === nonEfAssets.length;

    const allPoints = finalizedRecords.map((r) => {
      let monthSavings = 0;
      if (isAllSelected) {
        monthSavings = r.monthlyMoneyInvested || 0;
      } else {
        const rawInv = r.assetInvestedValues || {};
        activeNonEfAssets.forEach((a) => {
          monthSavings += Number(rawInv[a.id]) || 0;
        });
        monthSavings = Math.round(monthSavings * 100) / 100;
      }

      return {
        month: r.month,
        value: Math.max(0, monthSavings),
        isLive: false,
      };
    });

    return allPoints.slice(-6);
  }, [records, assets, activeAssetIds]);

  // 6-Month Principal Invested Trend for Total Principal Invested KPI Card
  const sixMonthInvestedTrend = useMemo(() => {
    if (records.length === 0) return [];
    const nonEfAssets = assets.filter((a) => !isEmergencyFundAsset(a));
    const activeNonEfAssets = nonEfAssets.filter((a) => activeAssetIds.includes(a.id));
    const isAllSelected = activeNonEfAssets.length === nonEfAssets.length;

    let runningFiltered = 0;
    const allPoints = records.map((r) => {
      if (isAllSelected) {
        return {
          month: r.month,
          value: r.totalMoneyInvested || 0,
          isLive: Boolean(r.isLivePending),
        };
      }
      const rawInv = r.assetInvestedValues || {};
      activeNonEfAssets.forEach((a) => {
        runningFiltered += Number(rawInv[a.id]) || 0;
      });
      return {
        month: r.month,
        value: Math.max(0, Math.round(runningFiltered * 100) / 100),
        isLive: Boolean(r.isLivePending),
      };
    });

    return allPoints.slice(-6);
  }, [records, assets, activeAssetIds]);

  // Transaction Ledger Handlers
  const handleAddTransaction = (newTx: Omit<LedgerTransaction, 'id' | 'createdAt' | 'updatedAt'>) => {
    const now = new Date().toISOString();
    const tx: LedgerTransaction = {
      ...newTx,
      id: `tx-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      createdAt: now,
      updatedAt: now,
    };
    const nextTx = [...transactions, tx];
    setTransactions(nextTx);
    saveTransactions(nextTx);
    triggerCloudUpload(categories, assets, nextTx, monthlyPrices, settings, false, monthlyNotes);
  };

  const handleEditTransaction = (id: string, updated: Partial<LedgerTransaction>) => {
    const now = new Date().toISOString();
    const nextTx = transactions.map((t) => (t.id === id ? { ...t, ...updated, updatedAt: now } : t));
    setTransactions(nextTx);
    saveTransactions(nextTx);
    triggerCloudUpload(categories, assets, nextTx, monthlyPrices, settings, false, monthlyNotes);
  };

  const handleDeleteTransaction = (id: string) => {
    const nextDeletedIds = addDeletedId('transactions', id);
    const nextTx = transactions.filter((t) => t.id !== id);
    setTransactions(nextTx);
    saveTransactions(nextTx);
    triggerCloudUpload(
      categories,
      assets,
      nextTx,
      monthlyPrices,
      settings,
      false,
      monthlyNotes,
      nextDeletedIds
    );
  };

  // 1st of Month Price Snapshot Handler
  const handleUpdateMonthPrice = (month: string, assetId: string, price: number) => {
    const nextPrices = setMonthlyPriceSnapshot(monthlyPrices, month, assetId, price);
    setMonthlyPrices(nextPrices);
    saveMonthlyPrices(nextPrices);
    triggerCloudUpload(categories, assets, transactions, nextPrices, settings, false, monthlyNotes);
  };

  // Monthly Decision & Asset Reminder Notes Handler
  const handleUpdateMonthNote = (month: string, monthNote: string, assetNotes?: Record<string, string>) => {
    const nextNotes = setMonthNote(monthlyNotes, month, monthNote, assetNotes);
    setMonthlyNotes(nextNotes);
    saveMonthlyNotes(nextNotes);
    triggerCloudUpload(categories, assets, transactions, monthlyPrices, settings, false, nextNotes);
  };

  // Month Record Editor modal handlers (legacy fallback / manual adjustment)
  const handleOpenMonthEditor = (recordToEdit?: MonthlyRecord) => {
    setEditingRecord(recordToEdit || null);
    setIsMonthEditorOpen(true);
  };

  const handleSaveMonthRecord = (recordData: Omit<MonthlyRecord, 'id'>, existingId?: string) => {
    const nowIso = new Date().toISOString();
    const recordMonth = recordData.month;
    removeDeletedMonth(recordMonth);

    const recordToSave: MonthlyRecord = {
      ...recordData,
      id: existingId || `rec-${recordMonth}-${Date.now()}`,
      createdAt: existingId ? recordData.createdAt || nowIso : nowIso,
      updatedAt: nowIso,
    };

    const uniqueMap = new Map<string, MonthlyRecord>();
    records.forEach((r) => uniqueMap.set(r.month, r));
    uniqueMap.set(recordMonth, recordToSave);

    const recalculated = recalculateMonthlyRecords(Array.from(uniqueMap.values()));
    saveMonthlyRecords(recalculated);
    setIsMonthEditorOpen(false);
    setEditingRecord(null);
  };

  const handleDeleteRecord = (id: string) => {
    setDeletingRecordId(id);
  };

  const confirmDeleteRecord = () => {
    if (!deletingRecordId) return;
    const target = records.find((r) => r.id === deletingRecordId);
    if (target) {
      addDeletedMonth(target.month);
    }
    const nextRecords = records.filter((r) => r.id !== deletingRecordId);
    const recalculated = recalculateMonthlyRecords(nextRecords);
    saveMonthlyRecords(recalculated);
    setDeletingRecordId(null);
  };

  const handleDuplicateRecord = (rec: MonthlyRecord) => {
    // Duplicate handler
  };

  // Category CRUD
  const handleAddCategory = (newCat: Omit<Category, 'id'>) => {
    const catObj: Category = { ...newCat, id: `cat-${Date.now()}`, updatedAt: new Date().toISOString() };
    const nextCats = [...categories, catObj];
    setCategories(nextCats);
    saveCategories(nextCats);
    triggerCloudUpload(nextCats, assets, transactions, monthlyPrices, settings, false, monthlyNotes);
  };

  const handleEditCategory = (id: string, updated: Partial<Category>) => {
    const nextCats = categories.map((c) =>
      c.id === id ? { ...c, ...updated, updatedAt: new Date().toISOString() } : c
    );
    setCategories(nextCats);
    saveCategories(nextCats);
    triggerCloudUpload(nextCats, assets, transactions, monthlyPrices, settings, false, monthlyNotes);
  };

  const handleDeleteCategory = (id: string, deleteLinkedAssets: boolean = true) => {
    let nextDeletedIds = addDeletedId('categories', id);
    const nextCats = categories.filter((c) => c.id !== id);
    setCategories(nextCats);
    saveCategories(nextCats);
    if (deleteLinkedAssets) {
      const tiedAssetIds = new Set<string>(
        assets.filter((a) => a.categoryId === id).map((a) => a.id)
      );
      if (tiedAssetIds.size > 0) {
        nextDeletedIds = addDeletedId('assets', Array.from(tiedAssetIds));
        const nextAssets = assets.filter((a) => !tiedAssetIds.has(a.id));
        setAssets(nextAssets);
        saveAssets(nextAssets);
        triggerCloudUpload(
          nextCats,
          nextAssets,
          transactions,
          monthlyPrices,
          settings,
          false,
          monthlyNotes,
          nextDeletedIds
        );
        return;
      }
    }
    triggerCloudUpload(
      nextCats,
      assets,
      transactions,
      monthlyPrices,
      settings,
      false,
      monthlyNotes,
      nextDeletedIds
    );
  };

  // Asset CRUD
  const handleAddAsset = (newAst: Omit<Asset, 'id'>) => {
    const astObj: Asset = { ...newAst, id: `ast-${Date.now()}`, updatedAt: new Date().toISOString() };
    const nextAssets = [...assets, astObj];
    setAssets(nextAssets);
    saveAssets(nextAssets);
    setFilters((prev) => ({
      ...prev,
      categoryIds: Array.from(new Set([...prev.categoryIds, newAst.categoryId])),
      assetIds: Array.from(new Set([...prev.assetIds, astObj.id])),
    }));
    triggerCloudUpload(categories, nextAssets, transactions, monthlyPrices, settings, false, monthlyNotes);
  };

  const handleAddAssetWithCategory = (
    newAst: Omit<Asset, 'id'>,
    newCat?: Omit<Category, 'id'>
  ) => {
    let nextCats = categories;
    let targetCatId = newAst.categoryId;

    if (newCat) {
      targetCatId = `cat-${Date.now()}`;
      const catObj: Category = {
        ...newCat,
        id: targetCatId,
        updatedAt: new Date().toISOString(),
      };
      nextCats = [...categories, catObj];
      setCategories(nextCats);
      saveCategories(nextCats);
    }

    const astObj: Asset = {
      ...newAst,
      categoryId: targetCatId,
      id: `ast-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      updatedAt: new Date().toISOString(),
    };
    const nextAssets = [...assets, astObj];
    setAssets(nextAssets);
    saveAssets(nextAssets);

    if (newAst.currentPrice && !newAst.isCash) {
      setLivePrices((prev) => ({ ...prev, [astObj.id]: newAst.currentPrice! }));
    }

    setFilters((prev) => ({
      ...prev,
      categoryIds: Array.from(new Set([...prev.categoryIds, targetCatId])),
      assetIds: Array.from(new Set([...prev.assetIds, astObj.id])),
    }));

    triggerCloudUpload(nextCats, nextAssets, transactions, monthlyPrices, settings, false, monthlyNotes);
    return astObj;
  };

  const handleEditAsset = (id: string, updated: Partial<Asset>) => {
    const nextAssets = assets.map((a) =>
      a.id === id ? { ...a, ...updated, updatedAt: new Date().toISOString() } : a
    );
    setAssets(nextAssets);
    saveAssets(nextAssets);
    triggerCloudUpload(categories, nextAssets, transactions, monthlyPrices, settings, false, monthlyNotes);
  };

  const handleDeleteAsset = (id: string) => {
    const nextDeletedIds = addDeletedId('assets', id);
    const nextAssets = assets.filter((a) => a.id !== id);
    setAssets(nextAssets);
    saveAssets(nextAssets);
    triggerCloudUpload(
      categories,
      nextAssets,
      transactions,
      monthlyPrices,
      settings,
      false,
      monthlyNotes,
      nextDeletedIds
    );
  };

  const handleReassignAssetAndDelete = (sourceAssetId: string, targetAssetId: string) => {
    const nowIso = new Date().toISOString();
    const nextDeletedIds = addDeletedId('assets', sourceAssetId);
    const nextTx = transactions.map((t) => {
      let changed = false;
      let newFrom = t.fromAssetId;
      let newTo = t.toAssetId;
      if (t.fromAssetId === sourceAssetId) {
        newFrom = targetAssetId;
        changed = true;
      }
      if (t.toAssetId === sourceAssetId) {
        newTo = targetAssetId;
        changed = true;
      }
      return changed ? { ...t, fromAssetId: newFrom, toAssetId: newTo, updatedAt: nowIso } : t;
    });
    setTransactions(nextTx);
    saveTransactions(nextTx);
    const nextAssets = assets.filter((a) => a.id !== sourceAssetId);
    setAssets(nextAssets);
    saveAssets(nextAssets);
    triggerCloudUpload(
      categories,
      nextAssets,
      nextTx,
      monthlyPrices,
      settings,
      false,
      monthlyNotes,
      nextDeletedIds
    );
  };

  const handleReassignCategoryAndDelete = (sourceCategoryId: string, targetCategoryId: string) => {
    const nowIso = new Date().toISOString();
    const nextDeletedIds = addDeletedId('categories', sourceCategoryId);
    const nextAssets = assets.map((a) =>
      a.categoryId === sourceCategoryId
        ? { ...a, categoryId: targetCategoryId, updatedAt: nowIso }
        : a
    );
    setAssets(nextAssets);
    saveAssets(nextAssets);
    const nextCats = categories.filter((c) => c.id !== sourceCategoryId);
    setCategories(nextCats);
    saveCategories(nextCats);
    triggerCloudUpload(
      nextCats,
      nextAssets,
      transactions,
      monthlyPrices,
      settings,
      false,
      monthlyNotes,
      nextDeletedIds
    );
  };

  const handleUpdateCategoryTargets = (updatedCategories: Category[]) => {
    const nowIso = new Date().toISOString();
    const stamped = updatedCategories.map((c) => ({ ...c, updatedAt: nowIso }));
    setCategories(stamped);
    saveCategories(stamped);
    triggerCloudUpload(stamped, assets, transactions, monthlyPrices, settings, false, monthlyNotes);
  };

  // Factory Reset
  const handleResetDemoData = () => {
    resetAllDataToZero();
    knownCategoryIdsRef.current.clear();
    knownAssetIdsRef.current.clear();
    setCategories([]);
    setAssets([]);
    setTransactions([]);
    setMonthlyPrices({});
    setMonthlyNotes({});
    setLivePrices({});
    setFilters({
      categoryIds: [],
      assetIds: [],
      riskLevels: ['Low', 'Medium', 'High'],
      searchQuery: '',
    });
    triggerCloudUpload([], [], [], {}, settings, true, {}, { categories: [], assets: [], transactions: [] });
  };

  const handleRefreshData = () => {
    const nextCats = loadCategories();
    const nextAssets = loadAssets();
    const nextTx = loadTransactions();
    const nextPrices = loadMonthlyPrices();
    const nextNotes = loadMonthlyNotes();
    const nextSettings = loadSettings();

    const restoredSpotPrices: Record<string, number> = {};
    nextAssets.forEach((a) => {
      if (a.currentPrice && a.currentPrice > 0) {
        restoredSpotPrices[a.id] = a.currentPrice;
      }
    });

    knownCategoryIdsRef.current = new Set(nextCats.map((c) => c.id));
    knownAssetIdsRef.current = new Set(nextAssets.map((a) => a.id));

    setCategories(nextCats);
    setAssets(nextAssets);
    setTransactions(nextTx);
    setMonthlyPrices(nextPrices);
    setMonthlyNotes(nextNotes);
    setSettings(nextSettings);
    setLivePrices((prev) => ({ ...prev, ...restoredSpotPrices }));
    setFilters({
      categoryIds: nextCats.map((c) => c.id),
      assetIds: nextAssets.map((a) => a.id),
      riskLevels: ['Low', 'Medium', 'High'],
      searchQuery: '',
    });
    triggerCloudUpload(
      nextCats,
      nextAssets,
      nextTx,
      nextPrices,
      nextSettings,
      true,
      nextNotes,
      { categories: [], assets: [], transactions: [] }
    );
  };

  return (
    <div className="min-h-screen bg-[#080C14] text-slate-100 font-sans selection:bg-emerald-500 selection:text-slate-950">
      
      {/* App Header */}
      <Header
        activeTab={activeTab}
        setActiveTab={handleSelectTab}
        settings={settings}
        onUpdateSettings={handleUpdateSettings}
        onOpenDataModal={() => setIsDataModalOpen(true)}
        onResetDemo={handleResetDemoData}
        totalPortfolioValue={metrics.totalPortfolio}
        floatingPL={metrics.floatingPL}
        floatingPLPercent={metrics.floatingPLPercent}
        user={user}
        onSignIn={handleSignIn}
        onSignOut={handleSignOut}
        isSyncing={isSyncing}
        onManualSync={handleManualSync}
        syncHealth={syncHealth}
        onOpenSyncHealth={() => setIsSyncHealthOpen(true)}
      />

      {/* Main Container */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {syncError && (
          <div className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs">
            <div className="flex items-center gap-2.5 min-w-0">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
              <span className="truncate">{syncError}</span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {user && (
                <button
                  onClick={handleManualSync}
                  disabled={isSyncing}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 font-semibold transition-colors cursor-pointer disabled:opacity-50"
                >
                  <RefreshCw className={`w-3 h-3 ${isSyncing ? 'animate-spin' : ''}`} />
                  <span>Retry Sync</span>
                </button>
              )}
              <button
                onClick={() => setSyncError(null)}
                className="p-1 rounded-lg hover:bg-rose-500/20 text-rose-400 hover:text-rose-200 transition-colors cursor-pointer"
                title="Dismiss"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* Sync Health Drift Alert Banner */}
        {user && isCloudLoaded && !isSyncing && syncHealth.status === 'drift_detected' && (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 py-3 rounded-xl bg-amber-500/10 border border-amber-500/35 text-amber-200 text-xs">
            <div className="flex items-center gap-2.5 min-w-0">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
              <div className="min-w-0">
                <span className="font-bold text-amber-300">
                  Sync Drift Detected ({syncHealth.totalDriftCount}{' '}
                  {syncHealth.totalDriftCount === 1 ? 'difference' : 'differences'})
                </span>
                <span className="text-slate-300 ml-2">
                  Local Ledger <code className="font-mono text-amber-300">#{syncHealth.localChecksum}</code>{' '}
                  differs from Cloud Snapshot{' '}
                  <code className="font-mono text-amber-300">
                    #{syncHealth.cloudChecksum || 'N/A'}
                  </code>
                  .
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => setIsSyncHealthOpen(true)}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-900/80 hover:bg-slate-800 text-slate-200 border border-slate-700 font-semibold transition-colors cursor-pointer"
              >
                <Activity className="w-3 h-3 text-amber-400" />
                <span>Inspect Drift</span>
              </button>
              <button
                onClick={handleManualSync}
                disabled={isSyncing}
                className="inline-flex items-center gap-1 px-3 py-1 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold transition-colors cursor-pointer disabled:opacity-50"
              >
                <GitMerge className="w-3 h-3" />
                <span>Reconcile</span>
              </button>
            </div>
          </div>
        )}

        {syncSuccessMsg && !syncError && (
          <div className="flex items-center justify-between gap-3 px-4 py-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>{syncSuccessMsg}</span>
            </div>
            <button
              onClick={() => setSyncSuccessMsg(null)}
              className="p-1 rounded-lg hover:bg-emerald-500/20 text-emerald-400 hover:text-emerald-200 transition-colors cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
        
        {/* KPI Metrics Summary Bar */}
        <MetricsCards
          monthName={metrics.monthName}
          isLive={metrics.isLive}
          totalPortfolio={metrics.totalPortfolio}
          prevTotalPortfolio={metrics.prevTotalPortfolio}
          totalMoneyInvested={metrics.totalMoneyInvested}
          monthlyMoneyInvested={metrics.monthlyMoneyInvested}
          floatingPL={metrics.floatingPL}
          floatingPLPercent={metrics.floatingPLPercent}
          totalDividendIncome={metrics.totalDividendIncome}
          monthlyDividendIncome={metrics.monthlyDividendIncome}
          emergencyFund={metrics.emergencyFund}
          totalCapital={metrics.totalCapital}
          currencySymbol={settings.currencySymbol}
          stealthMode={settings.stealthMode}
          riskBreakdown={metrics.riskBreakdown}
          portfolioHistory={sixMonthPortfolioTrend}
          investedHistory={sixMonthInvestedTrend}
          savingsHistory={sixMonthSavingsTrend}
          assetPLContributions={metrics.assetPLContributions}
        />

        {/* Global Asset & Category Filter Bar */}
        {(activeTab === 'dashboard' || activeTab === 'spreadsheet') && (
          <FilterBar
            categories={categories}
            assets={assets}
            filters={filters}
            onUpdateFilters={handleUpdateFilters}
            onResetFilters={handleResetFilters}
            isSummaryTab={activeTab === 'dashboard' && chartType === 'all'}
            currencySymbol={settings.currencySymbol}
            stealthMode={settings.stealthMode}
            livePrices={livePrices}
          />
        )}

        {/* Tab 1: Dashboards */}
        {activeTab === 'dashboard' && (
          <ChartsView
            records={records}
            categories={categories}
            assets={assets}
            activeAssetIds={activeAssetIds}
            currencySymbol={settings.currencySymbol}
            stealthMode={settings.stealthMode}
            filters={filters}
            chartType={chartType}
            onChartTypeChange={setChartType}
          />
        )}

        {/* Tab 2: Transaction Ledger (Single Data Entry) */}
        {activeTab === 'ledger' && (
          <LedgerView
            transactions={transactions}
            assets={assets}
            categories={categories}
            currencySymbol={settings.currencySymbol}
            stealthMode={settings.stealthMode}
            onAddTransaction={handleAddTransaction}
            onEditTransaction={handleEditTransaction}
            onDeleteTransaction={handleDeleteTransaction}
            onOpenHierarchyTab={() => setActiveTab('hierarchy')}
            onAddAssetWithCategory={handleAddAssetWithCategory}
            onEditAsset={handleEditAsset}
          />
        )}

        {/* Tab 3: Monthly Spreadsheet */}
        {activeTab === 'spreadsheet' && (
          <SpreadsheetView
            records={records}
            categories={categories}
            assets={assets}
            activeAssetIds={activeAssetIds}
            currencySymbol={settings.currencySymbol}
            stealthMode={settings.stealthMode}
            onOpenMonthEditor={handleOpenMonthEditor}
            onDeleteRecord={handleDeleteRecord}
            onDuplicateRecord={handleDuplicateRecord}
            onUpdateMonthPrice={handleUpdateMonthPrice}
            onUpdateMonthNote={handleUpdateMonthNote}
          />
        )}

        {/* Tab 4: Assets & Risk Hierarchy */}
        {activeTab === 'hierarchy' && (
          <HierarchyManager
            categories={categories}
            assets={assets}
            records={records}
            currencySymbol={settings.currencySymbol}
            onAddCategory={handleAddCategory}
            onEditCategory={handleEditCategory}
            onDeleteCategory={handleDeleteCategory}
            onReassignCategoryAndDelete={handleReassignCategoryAndDelete}
            onAddAsset={handleAddAsset}
            onEditAsset={handleEditAsset}
            onDeleteAsset={handleDeleteAsset}
            onReassignAssetAndDelete={handleReassignAssetAndDelete}
            onAddAssetWithCategory={handleAddAssetWithCategory}
          />
        )}

        {/* Tab 5: Rebalance */}
        {activeTab === 'rebalance' && (
          <RebalanceView
            categories={categories}
            assets={assets}
            records={records}
            currencySymbol={settings.currencySymbol}
            stealthMode={settings.stealthMode}
            onUpdateCategoryTargets={handleUpdateCategoryTargets}
          />
        )}

      </main>

      {/* Modals */}
      <SyncHealthModal
        isOpen={isSyncHealthOpen}
        onClose={() => setIsSyncHealthOpen(false)}
        user={user}
        isSyncing={isSyncing}
        syncHealth={syncHealth}
        lastSyncedAt={lastSyncedAt}
        onReconcileUnion={handleManualSync}
        onReconcilePullCloud={handleReconcilePullCloud}
        onReconcilePushLocal={handleReconcilePushLocal}
        onVerifyLiveServer={handleVerifyLiveServer}
        onSignIn={handleSignIn}
      />

      <MonthEditorModal
        isOpen={isMonthEditorOpen}
        onClose={() => setIsMonthEditorOpen(false)}
        onSave={handleSaveMonthRecord}
        initialRecord={editingRecord}
        latestRecord={latestRecord}
        records={records}
        categories={categories}
        assets={assets}
        currencySymbol={settings.currencySymbol}
      />

      <DataManagementModal
        isOpen={isDataModalOpen}
        onClose={() => setIsDataModalOpen(false)}
        categories={categories}
        assets={assets}
        records={records}
        transactions={transactions}
        monthlyPrices={monthlyPrices}
        settings={settings}
        onRefreshData={handleRefreshData}
        onResetDemo={handleResetDemoData}
      />

      {/* Delete Record Confirmation Modal */}
      {deletingRecordId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="fintech-card rounded-xl shadow-2xl max-w-sm w-full p-6 text-center space-y-4">
            <div className="w-12 h-12 rounded-full bg-rose-500/10 text-rose-400 flex items-center justify-center mx-auto">
              <Trash2 className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-100">Delete Monthly Record</h3>
              <p className="text-xs text-slate-400 mt-1">
                Are you sure you want to delete this record? Timeline totals will automatically recalculate.
              </p>
            </div>
            <div className="flex items-center gap-2 pt-2">
              <button
                onClick={() => setDeletingRecordId(null)}
                className="flex-1 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-lg transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={confirmDeleteRecord}
                className="flex-1 px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold rounded-lg transition-all cursor-pointer"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="border-t border-slate-900/90 bg-[#080C14] py-6 text-center text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>ValuaQ <span aria-hidden="true">·</span> Quantity-Based Wealth &amp; Risk Engine</span>
          <span className="text-slate-600">Base Currency: NTD (NT$)</span>
        </div>
      </footer>

    </div>
  );
}
