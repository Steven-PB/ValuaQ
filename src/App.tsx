import React, { useState, useEffect, useMemo } from 'react';
import { Trash2 } from 'lucide-react';
import { 
  loadCategories, saveCategories, 
  loadAssets, saveAssets, 
  loadMonthlyRecords, saveMonthlyRecords, recalculateMonthlyRecords,
  loadSettings, saveSettings, 
  resetToDemoData,
  loadDeletedMonths, saveDeletedMonths, addDeletedMonth, removeDeletedMonth 
} from './lib/storage';
import { 
  mergeMonthlyRecords, 
  mergeCategories, 
  mergeAssets, 
  mergeSettings 
} from './lib/syncMerge';
import { Category, Asset, MonthlyRecord, AppSettings, FilterState, RiskLevel, ChartType } from './types';
import { 
  auth, 
  signInWithGoogle, 
  signOutUser, 
  onAuthStateChanged, 
  syncDataToCloud, 
  fetchUserCloudData, 
  subscribeToUserData,
  User 
} from './lib/firebase';

import { Header } from './components/Header';
import { MetricsCards } from './components/MetricsCards';
import { FilterBar } from './components/FilterBar';
import { ChartsView } from './components/ChartsView';
import { SpreadsheetView } from './components/SpreadsheetView';
import { MonthEditorModal } from './components/MonthEditorModal';
import { HierarchyManager } from './components/HierarchyManager';
import { DataManagementModal } from './components/DataManagementModal';
import { LoginScreen } from './components/LoginScreen';

export default function App() {
  // User Auth & Cloud Sync States
  const [user, setUser] = useState<User | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isCloudLoaded, setIsCloudLoaded] = useState(false);

  // Core Application Data States
  const [categories, setCategories] = useState<Category[]>(loadCategories);
  const [assets, setAssets] = useState<Asset[]>(loadAssets);
  const [records, setRecords] = useState<MonthlyRecord[]>(loadMonthlyRecords);
  const [settings, setSettings] = useState<AppSettings>(loadSettings);

  // Navigation Tab State
  const [activeTab, setActiveTab] = useState<'dashboard' | 'spreadsheet' | 'hierarchy'>('dashboard');
  const [chartType, setChartType] = useState<ChartType>('all');

  // Filter State
  const [filters, setFilters] = useState<FilterState>(() => ({
    categoryIds: loadCategories().map((c) => c.id),
    assetIds: loadAssets().map((a) => a.id),
    riskLevels: ['Low', 'Medium', 'High'],
    searchQuery: '',
  }));

  // Modals
  const [isMonthEditorOpen, setIsMonthEditorOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<MonthlyRecord | null>(null);
  const [isDataModalOpen, setIsDataModalOpen] = useState(false);
  const [deletingRecordId, setDeletingRecordId] = useState<string | null>(null);

  // Firebase Auth Observer
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (!currentUser) {
        setIsCloudLoaded(false);
      }
    });
    return () => unsubscribe();
  }, []);

  // Fetch Cloud Data upon connection with Set Union Guard:
  // (Sync Data + Data on Device - (Sync Data ∩ Data on Device))
  // Plus real-time subscription so updates from Device A propagate immediately to Device B!
  useEffect(() => {
    if (!user) {
      setIsCloudLoaded(false);
      return;
    }

    setIsSyncing(true);

    // Initial union merge
    fetchUserCloudData(user.uid)
      .then(async (cloudData) => {
        const localDeletedMonths = loadDeletedMonths();

        if (cloudData) {
          const finalDeletedMonths = Array.from(
            new Set([...(cloudData.deletedRecordMonths || []), ...localDeletedMonths])
          );
          saveDeletedMonths(finalDeletedMonths);

          const currentLocalRecords = loadMonthlyRecords();
          const currentLocalCats = loadCategories();
          const currentLocalAssets = loadAssets();
          const currentLocalSettings = loadSettings();

          // Set Union Guard: (Sync Data + Data on Device - (Sync Data ∩ Data on Device))
          const recordMerge = mergeMonthlyRecords(
            cloudData.records,
            currentLocalRecords,
            finalDeletedMonths
          );
          const finalCats = mergeCategories(cloudData.categories, currentLocalCats);
          const finalAssets = mergeAssets(cloudData.assets, currentLocalAssets);
          const finalSettings = mergeSettings(cloudData.settings, currentLocalSettings);

          setCategories(finalCats);
          setAssets(finalAssets);
          setRecords(recordMerge.merged);
          setSettings(finalSettings);

          saveCategories(finalCats);
          saveAssets(finalAssets);
          saveMonthlyRecords(recordMerge.merged);
          saveSettings(finalSettings);

          // If Device has local months or updates not yet in Cloud, save the merged union to Cloud
          if (recordMerge.hasChangesFromDevice) {
            await syncDataToCloud(user.uid, {
              categories: finalCats,
              assets: finalAssets,
              records: recordMerge.merged,
              settings: finalSettings,
              deletedRecordMonths: finalDeletedMonths,
            });
          }
        } else if (!isCloudLoaded) {
          // Initialize empty cloud database with current local data
          await syncDataToCloud(user.uid, {
            categories,
            assets,
            records,
            settings,
            deletedRecordMonths: localDeletedMonths,
          });
        }
        setIsCloudLoaded(true);
      })
      .catch((err) => {
        console.error("Cloud fetch error:", err);
      })
      .finally(() => {
        setIsSyncing(false);
      });

    // Real-time Firestore Subscription:
    // If Device A adds a month, Device B receives it and merges in real-time!
    const unsubscribeSnapshot = subscribeToUserData(
      user.uid,
      (cloudData) => {
        if (!cloudData) return;
        const localDeletedMonths = loadDeletedMonths();
        const finalDeletedMonths = Array.from(
          new Set([...(cloudData.deletedRecordMonths || []), ...localDeletedMonths])
        );

        setRecords((prevDeviceRecords) => {
          const recordMerge = mergeMonthlyRecords(
            cloudData.records,
            prevDeviceRecords,
            finalDeletedMonths
          );
          if (recordMerge.hasChangesFromCloud) {
            saveMonthlyRecords(recordMerge.merged);
            return recordMerge.merged;
          }
          return prevDeviceRecords;
        });

        setCategories((prevDeviceCats) => {
          const finalCats = mergeCategories(cloudData.categories, prevDeviceCats);
          saveCategories(finalCats);
          return finalCats;
        });

        setAssets((prevDeviceAssets) => {
          const finalAssets = mergeAssets(cloudData.assets, prevDeviceAssets);
          saveAssets(finalAssets);
          return finalAssets;
        });
      },
      (err) => console.error("Firestore real-time subscription error:", err)
    );

    return () => {
      unsubscribeSnapshot();
    };
  }, [user]);

  // Window Focus / Tab Visibility listener to catch up if Device B was in background
  useEffect(() => {
    if (!user) return;
    const handleVisibilityOrFocus = () => {
      if (document.visibilityState === 'visible') {
        fetchUserCloudData(user.uid).then((cloudData) => {
          if (!cloudData) return;
          const localDeletedMonths = loadDeletedMonths();
          const finalDeletedMonths = Array.from(
            new Set([...(cloudData.deletedRecordMonths || []), ...localDeletedMonths])
          );
          setRecords((prev) => {
            const res = mergeMonthlyRecords(cloudData.records, prev, finalDeletedMonths);
            if (res.hasChangesFromCloud) {
              saveMonthlyRecords(res.merged);
              return res.merged;
            }
            return prev;
          });
        });
      }
    };

    window.addEventListener('focus', handleVisibilityOrFocus);
    document.addEventListener('visibilitychange', handleVisibilityOrFocus);
    return () => {
      window.removeEventListener('focus', handleVisibilityOrFocus);
      document.removeEventListener('visibilitychange', handleVisibilityOrFocus);
    };
  }, [user]);

  // Save changes to localStorage
  useEffect(() => {
    saveCategories(categories);
  }, [categories]);

  useEffect(() => {
    saveAssets(assets);
  }, [assets]);

  useEffect(() => {
    saveMonthlyRecords(records);
  }, [records]);

  useEffect(() => {
    saveSettings(settings);
  }, [settings]);

  // Cloud Upload with Union Guard: Reads cloud first and merges (Cloud + Device - (Cloud ∩ Device))
  const triggerCloudUpload = async (
    nextCategories: Category[] = categories,
    nextAssets: Asset[] = assets,
    nextRecords: MonthlyRecord[] = records,
    nextSettings: AppSettings = settings
  ) => {
    if (!user) return;
    setIsSyncing(true);
    try {
      const deletedMonths = loadDeletedMonths();
      const syncResult = await syncDataToCloud(user.uid, {
        categories: nextCategories,
        assets: nextAssets,
        records: nextRecords,
        settings: nextSettings,
        deletedRecordMonths: deletedMonths,
      });

      if (syncResult) {
        setCategories(syncResult.categories);
        setAssets(syncResult.assets);
        setRecords(syncResult.records);
        setSettings(syncResult.settings);
        saveCategories(syncResult.categories);
        saveAssets(syncResult.assets);
        saveMonthlyRecords(syncResult.records);
        saveSettings(syncResult.settings);
        saveDeletedMonths(syncResult.deletedRecordMonths);
      }
    } catch (err) {
      console.error("Cloud upload/sync error:", err);
    } finally {
      setIsSyncing(false);
    }
  };

  // Manual Sync trigger for user
  const handleManualSync = async () => {
    if (!user) return;
    setIsSyncing(true);
    try {
      const cloudData = await fetchUserCloudData(user.uid);
      const localDeletedMonths = loadDeletedMonths();
      if (cloudData) {
        const finalDeletedMonths = Array.from(
          new Set([...(cloudData.deletedRecordMonths || []), ...localDeletedMonths])
        );
        saveDeletedMonths(finalDeletedMonths);

        const currentLocalRecords = loadMonthlyRecords();
        const currentLocalCats = loadCategories();
        const currentLocalAssets = loadAssets();
        const currentLocalSettings = loadSettings();

        const recordMerge = mergeMonthlyRecords(
          cloudData.records,
          currentLocalRecords,
          finalDeletedMonths
        );
        const finalCats = mergeCategories(cloudData.categories, currentLocalCats);
        const finalAssets = mergeAssets(cloudData.assets, currentLocalAssets);
        const finalSettings = mergeSettings(cloudData.settings, currentLocalSettings);

        setCategories(finalCats);
        setAssets(finalAssets);
        setRecords(recordMerge.merged);
        setSettings(finalSettings);

        saveCategories(finalCats);
        saveAssets(finalAssets);
        saveMonthlyRecords(recordMerge.merged);
        saveSettings(finalSettings);

        await syncDataToCloud(user.uid, {
          categories: finalCats,
          assets: finalAssets,
          records: recordMerge.merged,
          settings: finalSettings,
          deletedRecordMonths: finalDeletedMonths,
        });
      }
    } catch (err) {
      console.error("Manual sync error:", err);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleSignIn = async () => {
    try {
      await signInWithGoogle();
    } catch (e) {
      console.error("Sign in error:", e);
    }
  };

  const handleSignOut = async () => {
    try {
      await signOutUser();
    } catch (e) {
      console.error("Sign out error:", e);
    }
  };

  // Keep filters updated when assets/categories are added or deleted
  useEffect(() => {
    const validCatIds = new Set(categories.map((c) => c.id));
    const validAstIds = new Set(assets.map((a) => a.id));

    setFilters((prev) => ({
      ...prev,
      categoryIds: Array.from(new Set([...prev.categoryIds, ...validCatIds])).filter((id) => validCatIds.has(id)),
      assetIds: Array.from(new Set([...prev.assetIds, ...validAstIds])).filter((id) => validAstIds.has(id)),
    }));
  }, [categories, assets]);

  // ----------------------------------------------------
  // FILTERED ASSETS & COMPUTED METRICS
  // ----------------------------------------------------
  const categoryMap = useMemo(() => {
    const map = new Map<string, Category>();
    categories.forEach((c) => map.set(c.id, c));
    return map;
  }, [categories]);

  const activeAssetIds = useMemo(() => {
    const query = filters.searchQuery.toLowerCase().trim();

    return assets
      .filter((asset) => {
        // Must be in selected assetIds
        if (!filters.assetIds.includes(asset.id)) return false;

        const cat = categoryMap.get(asset.categoryId);
        if (!cat) return false;

        // Must be in selected categoryIds
        if (!filters.categoryIds.includes(cat.id)) return false;

        // Must match selected risk level
        if (!filters.riskLevels.includes(cat.riskLevel)) return false;

        // Search Query filter
        if (query) {
          const matchAsset = asset.name.toLowerCase().includes(query);
          const matchCat = cat.name.toLowerCase().includes(query);
          return matchAsset || matchCat;
        }

        return true;
      })
      .map((a) => a.id);
  }, [assets, categoryMap, filters]);

  // Latest Month Record
  const latestRecord = useMemo(() => {
    if (records.length === 0) return null;
    return records[records.length - 1]; // Sorted chronologically
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
        totalPortfolio: 0,
        prevTotalPortfolio: undefined,
        totalMoneyInvested: 0,
        monthlyMoneyInvested: 0,
        floatingPL: 0,
        floatingPLPercent: 0,
        emergencyFund: 0,
        totalCapital: 0,
        riskBreakdown: { Low: { amount: 0, percent: 0 }, Medium: { amount: 0, percent: 0 }, High: { amount: 0, percent: 0 } },
      };
    }

    const rawValues = latestRecord.assetValues || {};
    let totalPortfolio = 0;

    const riskAmounts: Record<RiskLevel, number> = { Low: 0, Medium: 0, High: 0 };

    assets
      .filter((a) => activeAssetIds.includes(a.id))
      .forEach((a) => {
        const val = rawValues[a.id] || 0;
        totalPortfolio += val;

        const cat = categoryMap.get(a.categoryId);
        const risk = cat ? cat.riskLevel : 'Low';
        riskAmounts[risk] = (riskAmounts[risk] || 0) + val;
      });

    // Previous month total
    let prevTotalPortfolio: number | undefined = undefined;
    if (prevLatestRecord) {
      const prevVals = prevLatestRecord.assetValues || {};
      let sum = 0;
      assets
        .filter((a) => activeAssetIds.includes(a.id))
        .forEach((a) => {
          sum += prevVals[a.id] || 0;
        });
      prevTotalPortfolio = sum;
    }

    // Calculate cumulative Total Money Invested and latest Monthly Investment under active filters
    let totalMoneyInvested = 0;
    let monthlyMoneyInvested = 0;

    records.forEach((r) => {
      let recordMonthlyInvested = 0;
      const rawInv = r.assetInvestedValues || {};
      assets
        .filter((a) => activeAssetIds.includes(a.id))
        .forEach((a) => {
          recordMonthlyInvested += rawInv[a.id] || 0;
        });
      if (activeAssetIds.length === assets.length && recordMonthlyInvested === 0 && (r.monthlyMoneyInvested || 0) > 0) {
        recordMonthlyInvested = r.monthlyMoneyInvested || 0;
      }
      totalMoneyInvested += recordMonthlyInvested;

      if (latestRecord && r.id === latestRecord.id) {
        monthlyMoneyInvested = recordMonthlyInvested;
      }
    });

    if (activeAssetIds.length === assets.length && totalMoneyInvested === 0 && latestRecord && (latestRecord.totalMoneyInvested || 0) > 0) {
      totalMoneyInvested = latestRecord.totalMoneyInvested || 0;
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

    const emergencyFund = latestRecord.emergencyFund || 0;
    const totalCapital = totalPortfolio + emergencyFund;

    return {
      monthName: latestRecord.month,
      totalPortfolio,
      prevTotalPortfolio,
      totalMoneyInvested,
      monthlyMoneyInvested,
      floatingPL,
      floatingPLPercent,
      emergencyFund,
      totalCapital,
      riskBreakdown,
    };
  }, [latestRecord, prevLatestRecord, assets, activeAssetIds, categoryMap]);

  // ----------------------------------------------------
  // ACTION HANDLERS
  // ----------------------------------------------------
  const handleUpdateSettings = (newSettings: Partial<AppSettings>) => {
    const nextSettings = { ...settings, ...newSettings };
    setSettings(nextSettings);
    triggerCloudUpload(categories, assets, records, nextSettings);
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

  // Month Record Handlers
  const handleOpenMonthEditor = (recordToEdit?: MonthlyRecord) => {
    setEditingRecord(recordToEdit || null);
    setIsMonthEditorOpen(true);
  };

  const handleSaveMonthRecord = (
    data: Omit<MonthlyRecord, 'id'>,
    existingId?: string
  ) => {
    const nowIso = new Date().toISOString();
    removeDeletedMonth(data.month);
    let nextRecords = [...records];
    if (existingId) {
      nextRecords = nextRecords.map((r) =>
        r.id === existingId ? { ...r, ...data, updatedAt: nowIso } : r
      );
    } else {
      const newRecord: MonthlyRecord = {
        ...data,
        id: `rec-${data.month}-${Date.now()}`,
        createdAt: nowIso,
        updatedAt: nowIso,
      };
      const existsIndex = nextRecords.findIndex((r) => r.month === data.month);
      if (existsIndex >= 0) {
        nextRecords[existsIndex] = { ...nextRecords[existsIndex], ...data, updatedAt: nowIso };
      } else {
        nextRecords = [...nextRecords, newRecord];
      }
    }
    const uniqueMap = new Map<string, MonthlyRecord>();
    nextRecords.forEach((r) => uniqueMap.set(r.month, r));
    const recalculated = recalculateMonthlyRecords(Array.from(uniqueMap.values()));
    setRecords(recalculated);
    triggerCloudUpload(categories, assets, recalculated, settings);
  };

  const handleDeleteRecord = (id: string) => {
    setDeletingRecordId(id);
  };

  const confirmDeleteRecord = () => {
    if (deletingRecordId) {
      const rec = records.find((r) => r.id === deletingRecordId);
      if (rec) {
        addDeletedMonth(rec.month);
      }
      const recalculated = recalculateMonthlyRecords(records.filter((r) => r.id !== deletingRecordId));
      setRecords(recalculated);
      setDeletingRecordId(null);
      triggerCloudUpload(categories, assets, recalculated, settings);
    }
  };

  const handleDuplicateRecord = (rec: MonthlyRecord) => {
    // Determine the next available month after the last record
    const sorted = [...records].sort((a, b) => a.month.localeCompare(b.month));
    const baseMonth = sorted.length > 0 ? sorted[sorted.length - 1].month : rec.month;
    const [yr, mo] = baseMonth.split('-');
    let yrNum = parseInt(yr, 10);
    let moNum = parseInt(mo, 10) + 1;
    if (moNum > 12) {
      moNum = 1;
      yrNum += 1;
    }
    const nextMonth = `${yrNum}-${String(moNum).padStart(2, '0')}`;
    removeDeletedMonth(nextMonth);
    const nowIso = new Date().toISOString();

    const duplicatedInvested = { ...(rec.assetInvestedValues || {}) };

    const newRecord: MonthlyRecord = {
      id: `rec-${nextMonth}-${Date.now()}`,
      month: nextMonth,
      assetValues: { ...(rec.assetValues || {}) },
      assetInvestedValues: duplicatedInvested,
      monthlyMoneyInvested: 0,
      totalMoneyInvested: 0,
      emergencyFund: rec.emergencyFund || 0,
      description: `Duplicated from ${rec.month}`,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    const uniqueMap = new Map<string, MonthlyRecord>();
    records.forEach((r) => uniqueMap.set(r.month, r));
    uniqueMap.set(newRecord.month, newRecord);
    const recalculated = recalculateMonthlyRecords(Array.from(uniqueMap.values()));
    setRecords(recalculated);
    triggerCloudUpload(categories, assets, recalculated, settings);
  };

  // Category CRUD
  const handleAddCategory = (newCat: Omit<Category, 'id'>) => {
    const catObj: Category = { ...newCat, id: `cat-${Date.now()}`, updatedAt: new Date().toISOString() };
    const nextCats = [...categories, catObj];
    setCategories(nextCats);
    triggerCloudUpload(nextCats, assets, records, settings);
  };

  const handleEditCategory = (id: string, updated: Partial<Category>) => {
    const nextCats = categories.map((c) =>
      c.id === id ? { ...c, ...updated, updatedAt: new Date().toISOString() } : c
    );
    setCategories(nextCats);
    triggerCloudUpload(nextCats, assets, records, settings);
  };

  const handleDeleteCategory = (id: string, deleteLinkedAssets: boolean = true) => {
    const nextCats = categories.filter((c) => c.id !== id);
    setCategories(nextCats);
    if (deleteLinkedAssets) {
      const tiedAssetIds = new Set(assets.filter((a) => a.categoryId === id).map((a) => a.id));
      if (tiedAssetIds.size > 0) {
        const nextAssets = assets.filter((a) => !tiedAssetIds.has(a.id));
        setAssets(nextAssets);
        const nextRecords = records.map((rec) => {
          const newAssetVals = { ...(rec.assetValues || {}) };
          const newInvestedVals = { ...(rec.assetInvestedValues || {}) };
          Array.from(tiedAssetIds).forEach((astId: string) => {
            delete newAssetVals[astId];
            delete newInvestedVals[astId];
          });
          return {
            ...rec,
            assetValues: newAssetVals,
            assetInvestedValues: newInvestedVals,
          };
        });
        setRecords(nextRecords);
        triggerCloudUpload(nextCats, nextAssets, nextRecords, settings);
        return;
      }
    }
    triggerCloudUpload(nextCats, assets, records, settings);
  };

  // Asset CRUD
  const handleAddAsset = (newAst: Omit<Asset, 'id'>) => {
    const astObj: Asset = { ...newAst, id: `ast-${Date.now()}`, updatedAt: new Date().toISOString() };
    const nextAssets = [...assets, astObj];
    setAssets(nextAssets);
    triggerCloudUpload(categories, nextAssets, records, settings);
  };

  const handleEditAsset = (id: string, updated: Partial<Asset>) => {
    const nextAssets = assets.map((a) =>
      a.id === id ? { ...a, ...updated, updatedAt: new Date().toISOString() } : a
    );
    setAssets(nextAssets);
    triggerCloudUpload(categories, nextAssets, records, settings);
  };

  const handleDeleteAsset = (id: string) => {
    const nextAssets = assets.filter((a) => a.id !== id);
    setAssets(nextAssets);
    const nextRecords = records.map((rec) => {
      const newAssetVals = { ...(rec.assetValues || {}) };
      delete newAssetVals[id];
      const newInvestedVals = { ...(rec.assetInvestedValues || {}) };
      delete newInvestedVals[id];
      return {
        ...rec,
        assetValues: newAssetVals,
        assetInvestedValues: newInvestedVals,
      };
    });
    setRecords(nextRecords);
    triggerCloudUpload(categories, nextAssets, nextRecords, settings);
  };

  const handleReassignAssetAndDelete = (sourceAssetId: string, targetAssetId: string) => {
    const nextRecords = records.map((rec) => {
      const oldSrcVal = rec.assetValues?.[sourceAssetId] || 0;
      const oldTargetVal = rec.assetValues?.[targetAssetId] || 0;
      const newAssetVals = { ...(rec.assetValues || {}) };
      delete newAssetVals[sourceAssetId];
      newAssetVals[targetAssetId] = oldTargetVal + oldSrcVal;

      const oldSrcInv = rec.assetInvestedValues?.[sourceAssetId] || 0;
      const oldTargetInv = rec.assetInvestedValues?.[targetAssetId] || 0;
      const newInvestedVals = { ...(rec.assetInvestedValues || {}) };
      delete newInvestedVals[sourceAssetId];
      newInvestedVals[targetAssetId] = oldTargetInv + oldSrcInv;

      return {
        ...rec,
        assetValues: newAssetVals,
        assetInvestedValues: newInvestedVals,
      };
    });
    setRecords(nextRecords);
    const nextAssets = assets.filter((a) => a.id !== sourceAssetId);
    setAssets(nextAssets);
    triggerCloudUpload(categories, nextAssets, nextRecords, settings);
  };

  const handleReassignCategoryAndDelete = (sourceCategoryId: string, targetCategoryId: string) => {
    const nextAssets = assets.map((a) => (a.categoryId === sourceCategoryId ? { ...a, categoryId: targetCategoryId } : a));
    setAssets(nextAssets);
    const nextCats = categories.filter((c) => c.id !== sourceCategoryId);
    setCategories(nextCats);
    triggerCloudUpload(nextCats, nextAssets, records, settings);
  };

  // Reset to Demo
  const handleResetDemoData = () => {
    resetToDemoData();
    saveDeletedMonths([]);
    const nextCats = loadCategories();
    const nextAssets = loadAssets();
    const nextRecords = loadMonthlyRecords();
    const nextSettings = loadSettings();
    setCategories(nextCats);
    setAssets(nextAssets);
    setRecords(nextRecords);
    setSettings(nextSettings);
    setFilters({
      categoryIds: nextCats.map((c) => c.id),
      assetIds: nextAssets.map((a) => a.id),
      riskLevels: ['Low', 'Medium', 'High'],
      searchQuery: '',
    });
    triggerCloudUpload(nextCats, nextAssets, nextRecords, nextSettings);
  };

  const handleRefreshData = () => {
    const nextCats = loadCategories();
    const nextAssets = loadAssets();
    const nextRecords = loadMonthlyRecords();
    const nextSettings = loadSettings();
    setCategories(nextCats);
    setAssets(nextAssets);
    setRecords(nextRecords);
    setSettings(nextSettings);
    triggerCloudUpload(nextCats, nextAssets, nextRecords, nextSettings);
  };

  const handleApplyImportedData = (
    newCats: Category[],
    newAssets: Asset[],
    newRecords: MonthlyRecord[]
  ) => {
    saveCategories(newCats);
    saveAssets(newAssets);
    saveMonthlyRecords(newRecords);
    setCategories(newCats);
    setAssets(newAssets);
    setRecords(newRecords);
    setFilters((prev) => ({
      ...prev,
      categoryIds: newCats.map((c) => c.id),
      assetIds: newAssets.map((a) => a.id),
    }));
    triggerCloudUpload(newCats, newAssets, newRecords, settings);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans selection:bg-emerald-500 selection:text-slate-950">
      
      {/* App Header */}
      <Header
        activeTab={activeTab}
        setActiveTab={setActiveTab}
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
      />

      {/* Main Container */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        
        {/* KPI Metrics Summary Bar */}
        <MetricsCards
          monthName={metrics.monthName}
          totalPortfolio={metrics.totalPortfolio}
          prevTotalPortfolio={metrics.prevTotalPortfolio}
          totalMoneyInvested={metrics.totalMoneyInvested}
          monthlyMoneyInvested={metrics.monthlyMoneyInvested}
          floatingPL={metrics.floatingPL}
          floatingPLPercent={metrics.floatingPLPercent}
          emergencyFund={metrics.emergencyFund}
          totalCapital={metrics.totalCapital}
          currencySymbol={settings.currencySymbol}
          stealthMode={settings.stealthMode}
          riskBreakdown={metrics.riskBreakdown}
        />

        {/* Global Asset & Category Filter Bar */}
        <FilterBar
          categories={categories}
          assets={assets}
          filters={filters}
          onUpdateFilters={handleUpdateFilters}
          onResetFilters={handleResetFilters}
          isSummaryTab={activeTab === 'dashboard' && chartType === 'all'}
        />

        {/* Active Tab View Rendering */}
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
            onOpenDataModal={() => setIsDataModalOpen(true)}
          />
        )}

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
          />
        )}

      </main>

      {/* Modals */}
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
        settings={settings}
        onApplyImportedData={handleApplyImportedData}
        onRefreshData={handleRefreshData}
        onResetDemo={handleResetDemoData}
      />

      {/* Delete Record Confirmation Modal */}
      {deletingRecordId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl max-w-sm w-full p-6 text-center space-y-4">
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
                className="flex-1 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={confirmDeleteRecord}
                className="flex-1 px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold rounded-xl shadow-md shadow-rose-600/20 transition-all cursor-pointer"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="border-t border-slate-900 bg-slate-950 py-6 text-center text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>Monthly Asset & Investment Portfolio Tracker</span>
          <span className="text-slate-600">3-Level Hierarchy: Risk Levels &rarr; Categories &rarr; Assets</span>
        </div>
      </footer>

    </div>
  );
}
