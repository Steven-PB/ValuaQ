import { MonthlyRecord, Category, Asset, AppSettings } from '../types';
import { recalculateMonthlyRecords } from './storage';

/**
 * Merges Cloud data (Sync Data) and Local Device data (Data on Device)
 * following the user-requested Set Union formula:
 * Merged = (Sync Data + Data on Device - (Sync Data ∩ Data on Device))
 *
 * Guaranteed Properties:
 * 1. Records existing only in Cloud are never erased by a device with older state.
 * 2. Records created or edited locally on the device are never lost.
 * 3. Overlapping records (Sync Data ∩ Data on Device) are reconciled by latest timestamp / completeness.
 * 4. All months are chronologically sorted and running cumulative capital invested is recalculated.
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
      // (Sync Data) - (Sync Data ∩ Data on Device): Cloud-only record
      mergedList.push(cRec);
      fromCloudOnly++;
      hasChangesFromCloud = true;
    } else if (!cRec && dRec) {
      // (Data on Device) - (Sync Data ∩ Data on Device): Device-only record
      mergedList.push(dRec);
      fromDeviceOnly++;
      hasChangesFromDevice = true;
    } else if (cRec && dRec) {
      // Intersection: (Sync Data ∩ Data on Device)
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
        // Cloud has a strictly newer update for this month
        mergedList.push(cRec);
        hasChangesFromCloud = true;
      } else if (dTime > cTime) {
        // Device has a strictly newer update for this month
        mergedList.push(dRec);
        hasChangesFromDevice = true;
      } else {
        // Timestamps equal or both unset: compare completeness
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
          // If equal count, safely merge fields so no asset values or emergency fund are lost
          const mergedAssetValues = {
            ...(dRec.assetValues || {}),
            ...(cRec.assetValues || {}),
          };
          const mergedAssetInvestedValues = {
            ...(dRec.assetInvestedValues || {}),
            ...(cRec.assetInvestedValues || {}),
          };

          const emergencyFund =
            cRec.emergencyFund !== undefined
              ? cRec.emergencyFund
              : dRec.emergencyFund !== undefined
              ? dRec.emergencyFund
              : 0;

          const mergedRec: MonthlyRecord = {
            id: cRec.id || dRec.id,
            month,
            assetValues: mergedAssetValues,
            assetInvestedValues: mergedAssetInvestedValues,
            monthlyMoneyInvested: cRec.monthlyMoneyInvested || dRec.monthlyMoneyInvested || 0,
            totalMoneyInvested: cRec.totalMoneyInvested || dRec.totalMoneyInvested || 0,
            emergencyFund,
            description: cRec.description || dRec.description || '',
          };
          const createdTime = cRec.createdAt || dRec.createdAt;
          if (createdTime) mergedRec.createdAt = createdTime;
          const updatedTime = cRec.updatedAt || dRec.updatedAt;
          if (updatedTime) mergedRec.updatedAt = updatedTime;

          mergedList.push(mergedRec);
        }
      }
    }
  }

  // Chronologically sort and recompute cumulative investment line
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
  deviceCats: Category[] = []
): Category[] {
  const cloudMap = new Map<string, Category>();
  (cloudCats || []).forEach((c) => {
    if (c && c.id) cloudMap.set(c.id, c);
  });

  const deviceMap = new Map<string, Category>();
  (deviceCats || []).forEach((c) => {
    if (c && c.id) deviceMap.set(c.id, c);
  });

  const allIds = Array.from(new Set([...cloudMap.keys(), ...deviceMap.keys()]));
  const result: Category[] = [];

  for (const id of allIds) {
    const c = cloudMap.get(id);
    const d = deviceMap.get(id);
    if (c && !d) {
      result.push(c);
    } else if (!c && d) {
      result.push(d);
    } else if (c && d) {
      const cTime = c.updatedAt ? new Date(c.updatedAt).getTime() : 0;
      const dTime = d.updatedAt ? new Date(d.updatedAt).getTime() : 0;
      const winner = { ...(dTime > cTime ? d : c) };
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
  deviceAssets: Asset[] = []
): Asset[] {
  const cloudMap = new Map<string, Asset>();
  (cloudAssets || []).forEach((a) => {
    if (a && a.id) cloudMap.set(a.id, a);
  });

  const deviceMap = new Map<string, Asset>();
  (deviceAssets || []).forEach((a) => {
    if (a && a.id) deviceMap.set(a.id, a);
  });

  const allIds = Array.from(new Set([...cloudMap.keys(), ...deviceMap.keys()]));
  const result: Asset[] = [];

  for (const id of allIds) {
    const c = cloudMap.get(id);
    const d = deviceMap.get(id);
    if (c && !d) {
      result.push(c);
    } else if (!c && d) {
      result.push(d);
    } else if (c && d) {
      const cTime = c.updatedAt ? new Date(c.updatedAt).getTime() : 0;
      const dTime = d.updatedAt ? new Date(d.updatedAt).getTime() : 0;
      result.push(dTime > cTime ? d : c);
    }
  }

  return result;
}

export function mergeSettings(
  cloudSettings?: AppSettings,
  deviceSettings?: AppSettings
): AppSettings {
  return {
    currencySymbol: 'NT$',
    stealthMode: deviceSettings?.stealthMode ?? cloudSettings?.stealthMode ?? false,
    defaultChartType: cloudSettings?.defaultChartType || deviceSettings?.defaultChartType || 'all',
    defaultGroupMode: cloudSettings?.defaultGroupMode || deviceSettings?.defaultGroupMode || 'category',
  };
}
