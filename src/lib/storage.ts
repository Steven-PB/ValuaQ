import { Category, Asset, MonthlyRecord, AppSettings } from '../types';
import { initialCategories, initialAssets, initialMonthlyRecords, initialSettings } from '../data/initialData';

const STORAGE_KEYS = {
  CATEGORIES: 'asset_tracker_categories_v3',
  ASSETS: 'asset_tracker_assets_v3',
  RECORDS: 'asset_tracker_records_v3',
  SETTINGS: 'asset_tracker_settings_v3',
  DELETED_MONTHS: 'asset_tracker_deleted_months_v3',
};

export function loadDeletedMonths(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.DELETED_MONTHS);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.error('Failed to load deleted months from storage', e);
  }
  return [];
}

export function saveDeletedMonths(months: string[]): void {
  try {
    localStorage.setItem(STORAGE_KEYS.DELETED_MONTHS, JSON.stringify(Array.from(new Set(months))));
  } catch (e) {
    console.error('Failed to save deleted months to storage', e);
  }
}

export function addDeletedMonth(month: string): void {
  const current = loadDeletedMonths();
  if (!current.includes(month)) {
    saveDeletedMonths([...current, month]);
  }
}

export function removeDeletedMonth(month: string): void {
  const current = loadDeletedMonths();
  saveDeletedMonths(current.filter((m) => m !== month));
}

export function loadCategories(): Category[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.CATEGORIES);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.error('Failed to load categories from storage', e);
  }
  return initialCategories;
}

export function saveCategories(categories: Category[]): void {
  try {
    localStorage.setItem(STORAGE_KEYS.CATEGORIES, JSON.stringify(categories));
  } catch (e) {
    console.error('Failed to save categories to storage', e);
  }
}

export function loadAssets(): Asset[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.ASSETS);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.error('Failed to load assets from storage', e);
  }
  return initialAssets;
}

export function saveAssets(assets: Asset[]): void {
  try {
    localStorage.setItem(STORAGE_KEYS.ASSETS, JSON.stringify(assets));
  } catch (e) {
    console.error('Failed to save assets to storage', e);
  }
}

export function recalculateMonthlyRecords(records: MonthlyRecord[]): MonthlyRecord[] {
  // Sort chronologically by month ("YYYY-MM")
  const sorted = [...records].sort((a, b) => a.month.localeCompare(b.month));
  let runningTotalInvested = 0;

  return sorted.map((record) => {
    // 1. Monthly Investment[month] = Sum of Money Invested for each asset for a certain month
    const monthlyMoneyInvested = Object.values(record.assetInvestedValues || {}).reduce(
      (sum, val) => sum + (Number(val) || 0),
      0
    );

    // 2. Total Invested[Month] = Total Invested[Month - 1] + Monthly Investment[Month]
    runningTotalInvested += monthlyMoneyInvested;

    return {
      ...record,
      monthlyMoneyInvested,
      totalMoneyInvested: runningTotalInvested,
    };
  });
}

export function loadMonthlyRecords(): MonthlyRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.RECORDS);
    if (raw) {
      const records: MonthlyRecord[] = JSON.parse(raw);
      // Deduplicate by month string keeping latest/unique entry
      const uniqueMap = new Map<string, MonthlyRecord>();
      records.forEach((r) => uniqueMap.set(r.month, r));
      return recalculateMonthlyRecords(Array.from(uniqueMap.values()));
    }
  } catch (e) {
    console.error('Failed to load monthly records from storage', e);
  }
  const uniqueMap = new Map<string, MonthlyRecord>();
  initialMonthlyRecords.forEach((r) => uniqueMap.set(r.month, r));
  const recalculated = recalculateMonthlyRecords(Array.from(uniqueMap.values()));
  saveMonthlyRecords(recalculated);
  return recalculated;
}

export function saveMonthlyRecords(records: MonthlyRecord[]): void {
  try {
    const recalculated = recalculateMonthlyRecords(records);
    localStorage.setItem(STORAGE_KEYS.RECORDS, JSON.stringify(recalculated));
  } catch (e) {
    console.error('Failed to save monthly records to storage', e);
  }
}

export function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.SETTINGS);
    if (raw) {
      const parsed = JSON.parse(raw);
      return { ...parsed, currencySymbol: 'NT$' };
    }
  } catch (e) {
    console.error('Failed to load settings from storage', e);
  }
  return { ...initialSettings, currencySymbol: 'NT$' };
}

export function saveSettings(settings: AppSettings): void {
  try {
    localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(settings));
  } catch (e) {
    console.error('Failed to save settings to storage', e);
  }
}

export interface BackupData {
  version: string;
  timestamp: string;
  categories: Category[];
  assets: Asset[];
  records: MonthlyRecord[];
  settings: AppSettings;
}

export interface LocalSnapshot {
  id: string;
  name: string;
  timestamp: string;
  recordCount: number;
  assetCount: number;
  categoryCount: number;
  data: BackupData;
}

export function exportAllData(): string {
  const data: BackupData = {
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    categories: loadCategories(),
    assets: loadAssets(),
    records: loadMonthlyRecords(),
    settings: loadSettings(),
  };
  return JSON.stringify(data, null, 2);
}

export function importAllData(jsonString: string): boolean {
  try {
    const parsed = JSON.parse(jsonString) as BackupData;
    if (parsed.categories && parsed.assets && parsed.records) {
      saveCategories(parsed.categories);
      saveAssets(parsed.assets);
      saveMonthlyRecords(parsed.records);
      if (parsed.settings) saveSettings(parsed.settings);
      return true;
    }
  } catch (e) {
    console.error('Invalid backup data format', e);
  }
  return false;
}

export function getLocalSnapshots(): LocalSnapshot[] {
  try {
    const raw = localStorage.getItem('asset_tracker_local_snapshots_v1');
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.error('Failed to load local snapshots', e);
  }
  return [];
}

export function createLocalSnapshot(customName?: string): LocalSnapshot {
  const currentCategories = loadCategories();
  const currentAssets = loadAssets();
  const currentRecords = loadMonthlyRecords();
  const currentSettings = loadSettings();

  const now = new Date();
  const dateStr = now.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  const timeStr = now.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  const defaultName = `Local Backup - ${dateStr} ${timeStr}`;

  const snapshot: LocalSnapshot = {
    id: `snap-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name: customName || defaultName,
    timestamp: now.toISOString(),
    recordCount: currentRecords.length,
    assetCount: currentAssets.length,
    categoryCount: currentCategories.length,
    data: {
      version: '1.0.0',
      timestamp: now.toISOString(),
      categories: currentCategories,
      assets: currentAssets,
      records: currentRecords,
      settings: currentSettings,
    },
  };

  const existing = getLocalSnapshots();
  // Keep up to 25 latest snapshots
  const updated = [snapshot, ...existing].slice(0, 25);
  try {
    localStorage.setItem('asset_tracker_local_snapshots_v1', JSON.stringify(updated));
  } catch (e) {
    console.error('Failed to save local snapshot', e);
  }
  return snapshot;
}

export function restoreLocalSnapshot(id: string): boolean {
  const snapshots = getLocalSnapshots();
  const target = snapshots.find((s) => s.id === id);
  if (!target || !target.data) return false;

  try {
    saveCategories(target.data.categories);
    saveAssets(target.data.assets);
    saveMonthlyRecords(target.data.records);
    if (target.data.settings) saveSettings(target.data.settings);
    return true;
  } catch (e) {
    console.error('Failed to restore local snapshot', e);
    return false;
  }
}

export function deleteLocalSnapshot(id: string): void {
  const snapshots = getLocalSnapshots();
  const updated = snapshots.filter((s) => s.id !== id);
  try {
    localStorage.setItem('asset_tracker_local_snapshots_v1', JSON.stringify(updated));
  } catch (e) {
    console.error('Failed to delete local snapshot', e);
  }
}

export function resetToDemoData(): void {
  try {
    localStorage.removeItem(STORAGE_KEYS.CATEGORIES);
    localStorage.removeItem(STORAGE_KEYS.ASSETS);
    localStorage.removeItem(STORAGE_KEYS.RECORDS);
    localStorage.removeItem(STORAGE_KEYS.SETTINGS);
  } catch (e) {
    console.error('Failed to clear storage keys', e);
  }
  saveCategories(initialCategories);
  saveAssets(initialAssets);
  saveMonthlyRecords(initialMonthlyRecords);
  saveSettings(initialSettings);
}

