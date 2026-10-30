import { Category, Asset, MonthlyRecord, AppSettings, LedgerTransaction, MonthlyPriceMap, MonthlyNotesMap } from '../types';
import { initialCategories, initialAssets, initialMonthlyRecords, initialSettings } from '../data/initialData';

const STORAGE_KEYS = {
  CATEGORIES: 'valuaq_categories_v4_zero',
  ASSETS: 'valuaq_assets_v4_zero',
  RECORDS: 'valuaq_records_v4_zero',
  SETTINGS: 'valuaq_settings_v4_zero',
  DELETED_MONTHS: 'valuaq_deleted_months_v4_zero',
  TRANSACTIONS: 'valuaq_transactions_v4_zero',
  MONTHLY_PRICES: 'valuaq_monthly_prices_v4_zero',
  MONTHLY_NOTES: 'valuaq_monthly_notes_v4_zero',
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

export function loadTransactions(): LedgerTransaction[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.TRANSACTIONS);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.error('Failed to load transactions from storage', e);
  }
  return [];
}

export function saveTransactions(transactions: LedgerTransaction[]): void {
  try {
    localStorage.setItem(STORAGE_KEYS.TRANSACTIONS, JSON.stringify(transactions));
  } catch (e) {
    console.error('Failed to save transactions to storage', e);
  }
}

export function loadMonthlyPrices(): MonthlyPriceMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.MONTHLY_PRICES);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.error('Failed to load monthly prices from storage', e);
  }
  return {};
}

export function saveMonthlyPrices(prices: MonthlyPriceMap): void {
  try {
    localStorage.setItem(STORAGE_KEYS.MONTHLY_PRICES, JSON.stringify(prices));
  } catch (e) {
    console.error('Failed to save monthly prices to storage', e);
  }
}

export function loadMonthlyNotes(): MonthlyNotesMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.MONTHLY_NOTES);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.error('Failed to load monthly notes from storage', e);
  }
  return {};
}

export function saveMonthlyNotes(notes: MonthlyNotesMap): void {
  try {
    localStorage.setItem(STORAGE_KEYS.MONTHLY_NOTES, JSON.stringify(notes));
  } catch (e) {
    console.error('Failed to save monthly notes to storage', e);
  }
}

export function setMonthNote(
  existingNotes: MonthlyNotesMap,
  month: string,
  monthNote?: string,
  assetNotes?: Record<string, string>
): MonthlyNotesMap {
  const next: MonthlyNotesMap = { ...existingNotes };
  const current = next[month] || {};
  next[month] = {
    monthNote: monthNote !== undefined ? monthNote : current.monthNote,
    assetNotes: assetNotes !== undefined ? assetNotes : current.assetNotes || {},
    updatedAt: new Date().toISOString(),
  };
  return next;
}

export function recalculateMonthlyRecords(records: MonthlyRecord[]): MonthlyRecord[] {
  // Sort chronologically by month ("YYYY-MM")
  const sorted = [...records].sort((a, b) => a.month.localeCompare(b.month));
  let runningTotalInvested = 0;

  return sorted.map((record) => {
    // 1. Monthly Investment[month] = Sum of Money Invested for each asset for a certain month (or direct deposit amount)
    let monthlyMoneyInvested = record.monthlyMoneyInvested;
    if (monthlyMoneyInvested === undefined || monthlyMoneyInvested === 0) {
      monthlyMoneyInvested = Object.values(record.assetInvestedValues || {}).reduce(
        (sum, val) => sum + (Number(val) || 0),
        0
      );
    }

    // 2. Total Invested[Month] = Total Invested[Month - 1] + Monthly Investment[Month]
    runningTotalInvested += (monthlyMoneyInvested || 0);

    return {
      ...record,
      monthlyMoneyInvested: monthlyMoneyInvested || 0,
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
  return [];
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
  transactions?: LedgerTransaction[];
  monthlyPrices?: MonthlyPriceMap;
  monthlyNotes?: MonthlyNotesMap;
  deletedRecordMonths?: string[];
  settings: AppSettings;
}

export interface LocalSnapshot {
  id: string;
  name: string;
  timestamp: string;
  recordCount: number;
  assetCount: number;
  categoryCount: number;
  transactionCount?: number;
  data: BackupData;
}

export function exportAllData(): string {
  const data: BackupData = {
    version: '2.0.0',
    timestamp: new Date().toISOString(),
    categories: loadCategories(),
    assets: loadAssets(),
    transactions: loadTransactions(),
    monthlyPrices: loadMonthlyPrices(),
    monthlyNotes: loadMonthlyNotes(),
    records: loadMonthlyRecords(),
    deletedRecordMonths: loadDeletedMonths(),
    settings: loadSettings(),
  };
  return JSON.stringify(data, null, 2);
}

export function parseAndValidateBackupJson(jsonString: string): {
  valid: boolean;
  data?: BackupData;
  error?: string;
} {
  try {
    const parsed = JSON.parse(jsonString);
    if (!parsed || typeof parsed !== 'object') {
      return { valid: false, error: 'Backup content must be a valid JSON object.' };
    }
    if (!Array.isArray(parsed.categories) || !Array.isArray(parsed.assets)) {
      return {
        valid: false,
        error: 'Missing required configuration arrays ("categories" and "assets").',
      };
    }
    const normalized: BackupData = {
      version: parsed.version || '2.0.0',
      timestamp: parsed.timestamp || new Date().toISOString(),
      categories: parsed.categories,
      assets: parsed.assets,
      transactions: Array.isArray(parsed.transactions) ? parsed.transactions : [],
      monthlyPrices:
        parsed.monthlyPrices && typeof parsed.monthlyPrices === 'object'
          ? parsed.monthlyPrices
          : {},
      monthlyNotes:
        parsed.monthlyNotes && typeof parsed.monthlyNotes === 'object'
          ? parsed.monthlyNotes
          : {},
      records: Array.isArray(parsed.records) ? parsed.records : [],
      deletedRecordMonths: Array.isArray(parsed.deletedRecordMonths)
        ? parsed.deletedRecordMonths
        : [],
      settings:
        parsed.settings && typeof parsed.settings === 'object'
          ? { ...initialSettings, ...parsed.settings, currencySymbol: 'NT$' }
          : { ...initialSettings, currencySymbol: 'NT$' },
    };
    return { valid: true, data: normalized };
  } catch (e: any) {
    return {
      valid: false,
      error: e?.message || 'Invalid JSON syntax.',
    };
  }
}

export function importAllData(jsonString: string): boolean {
  const validation = parseAndValidateBackupJson(jsonString);
  if (!validation.valid || !validation.data) {
    return false;
  }
  const { data } = validation;
  try {
    saveCategories(data.categories);
    saveAssets(data.assets);
    saveTransactions(data.transactions || []);
    saveMonthlyPrices(data.monthlyPrices || {});
    saveMonthlyNotes(data.monthlyNotes || {});
    saveMonthlyRecords(data.records || []);
    saveDeletedMonths(data.deletedRecordMonths || []);
    saveSettings(data.settings);
    return true;
  } catch (e) {
    console.error('Failed to restore backup data to storage', e);
    return false;
  }
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
  const currentTransactions = loadTransactions();
  const currentMonthlyPrices = loadMonthlyPrices();
  const currentMonthlyNotes = loadMonthlyNotes();
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
    transactionCount: currentTransactions.length,
    data: {
      version: '2.0.0',
      timestamp: now.toISOString(),
      categories: currentCategories,
      assets: currentAssets,
      records: currentRecords,
      transactions: currentTransactions,
      monthlyPrices: currentMonthlyPrices,
      monthlyNotes: currentMonthlyNotes,
      settings: currentSettings,
    },
  };

  const existing = getLocalSnapshots();
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
    if (target.data.transactions) saveTransactions(target.data.transactions);
    if (target.data.monthlyPrices) saveMonthlyPrices(target.data.monthlyPrices);
    if (target.data.monthlyNotes) saveMonthlyNotes(target.data.monthlyNotes);
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

export function resetAllDataToZero(): void {
  try {
    localStorage.removeItem(STORAGE_KEYS.CATEGORIES);
    localStorage.removeItem(STORAGE_KEYS.ASSETS);
    localStorage.removeItem(STORAGE_KEYS.RECORDS);
    localStorage.removeItem(STORAGE_KEYS.SETTINGS);
    localStorage.removeItem(STORAGE_KEYS.DELETED_MONTHS);
    localStorage.removeItem(STORAGE_KEYS.TRANSACTIONS);
    localStorage.removeItem(STORAGE_KEYS.MONTHLY_PRICES);
    localStorage.removeItem(STORAGE_KEYS.MONTHLY_NOTES);
  } catch (e) {
    console.error('Failed to clear storage keys', e);
  }
  saveCategories([]);
  saveAssets([]);
  saveMonthlyRecords([]);
  saveTransactions([]);
  saveMonthlyPrices({});
  saveMonthlyNotes({});
  saveDeletedMonths([]);
  saveSettings(initialSettings);
}

export function resetToDemoData(): void {
  resetAllDataToZero();
}
