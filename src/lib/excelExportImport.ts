import * as XLSX from 'xlsx';
import { Category, Asset, MonthlyRecord, AppSettings } from '../types';
import { recalculateMonthlyRecords, createLocalSnapshot, BackupData } from './storage';

/**
 * Strips formatting (currency symbols, commas, spaces) and parses a number safely.
 */
export function parseCleanNumber(val: any): number {
  if (val === null || val === undefined || val === '') return 0;
  if (typeof val === 'number') return isNaN(val) ? 0 : val;
  const str = String(val).replace(/[^\d.-]/g, '');
  const parsed = parseFloat(str);
  return isNaN(parsed) ? 0 : parsed;
}

/**
 * Normalizes different date/month formats to standard "YYYY-MM".
 * Supports:
 * - "2026-01", "2026/01", "2026.01"
 * - Excel serial date numbers (e.g., 45678)
 * - "Jan 2026" or "January 2026"
 */
export function normalizeMonthString(val: any): string | null {
  if (!val) return null;

  // If it's a number (Excel date code)
  if (typeof val === 'number') {
    try {
      const parsedDate = XLSX.SSF.parse_date_code(val);
      if (parsedDate && parsedDate.y && parsedDate.m) {
        return `${parsedDate.y}-${String(parsedDate.m).padStart(2, '0')}`;
      }
    } catch {
      // Fallback
    }
  }

  const str = String(val).trim();

  // Pattern YYYY-MM or YYYY/MM or YYYY.MM
  const yyyyMmMatch = str.match(/^(\d{4})[-/.](\d{1,2})$/);
  if (yyyyMmMatch) {
    const y = yyyyMmMatch[1];
    const m = String(parseInt(yyyyMmMatch[2], 10)).padStart(2, '0');
    return `${y}-${m}`;
  }

  // Pattern YYYY-MM-DD
  const yyyyMmDdMatch = str.match(/^(\d{4})[-/.](\d{1,2})[-/.]\d{1,2}/);
  if (yyyyMmDdMatch) {
    const y = yyyyMmDdMatch[1];
    const m = String(parseInt(yyyyMmDdMatch[2], 10)).padStart(2, '0');
    return `${y}-${m}`;
  }

  // Try Date parsing (e.g., "Jan 2026", "2026 Jan")
  const parsed = new Date(str);
  if (!isNaN(parsed.getTime()) && parsed.getFullYear() > 1990 && parsed.getFullYear() < 2100) {
    return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}`;
  }

  return null;
}

/**
 * Palette for auto-generating distinct category colors on import.
 */
const CATEGORY_COLOR_PALETTE = [
  '#38bdf8', // Sky Blue
  '#818cf8', // Indigo
  '#34d399', // Emerald
  '#fbbf24', // Amber
  '#f472b6', // Pink
  '#a78bfa', // Purple
  '#f87171', // Red
  '#2dd4bf', // Teal
  '#fb923c', // Orange
];

export type ColumnClassification =
  | { kind: 'month' }
  | { kind: 'emergency' }
  | { kind: 'description' }
  | { kind: 'kpi'; name: string }
  | { kind: 'asset'; categoryName?: string; assetName: string; type: 'value' | 'invested' }
  | { kind: 'unknown'; raw: string };

/**
 * Parses any spreadsheet column header to extract Month, Emergency Fund,
 * Description, KPIs, or Asset & Category associations.
 *
 * Symmetrical format exported by ValuaQ:
 * "[Category Name] Asset Name (Value)"
 * "[Category Name] Asset Name (Invested)"
 *
 * Also supports:
 * - "Category / Asset Name (Value)"
 * - "Asset Name (Value)"
 * - "Asset Name (Invested)"
 * - "Asset Name" (defaults to value)
 */
export function parseColumnHeader(rawHeader: string): ColumnClassification {
  const clean = String(rawHeader || '')
    .replace(/^\uFEFF/, '')
    .replace(/^["']|["']$/g, '')
    .trim();

  if (!clean) return { kind: 'unknown', raw: clean };

  const lower = clean.toLowerCase();

  // 1. Month / Date
  if (['month', 'date', 'period', 'year-month', 'ym', 'month (yyyy-mm)'].includes(lower)) {
    return { kind: 'month' };
  }

  // 2. Emergency Fund
  if (['emergency fund', 'emergency', 'safety net', 'emergencyfund', 'emergency reserve'].includes(lower)) {
    return { kind: 'emergency' };
  }

  // 3. Description / Notes
  if (['description / notes', 'description', 'notes', 'note', 'memo', 'comment'].includes(lower)) {
    return { kind: 'description' };
  }

  // 4. Computed KPI summary columns (exported for spreadsheet readability, not raw assets)
  if ([
    'total portfolio value', 'total invested capital', 'monthly added capital',
    'total value', 'total invested', 'monthly invested',
    'floating p&l', 'floating p&l %', 'floating return %', 'floating return',
    'p&l', 'p&l %', 'roi', 'return %'
  ].includes(lower)) {
    return { kind: 'kpi', name: clean };
  }

  // 5. Asset column parsing
  let assetPart = clean;
  let type: 'value' | 'invested' = 'value';

  if (/\(Invested\)$/i.test(assetPart)) {
    type = 'invested';
    assetPart = assetPart.replace(/\s*\(Invested\)$/i, '').trim();
  } else if (/\(Value\)$/i.test(assetPart)) {
    type = 'value';
    assetPart = assetPart.replace(/\s*\(Value\)$/i, '').trim();
  }

  // Check for category prefix: [Category Name] Asset Name
  let categoryName: string | undefined = undefined;
  let assetName = assetPart;

  const bracketMatch = assetPart.match(/^\[([^\]]+)\]\s*(.+)$/);
  if (bracketMatch) {
    categoryName = bracketMatch[1].trim();
    assetName = bracketMatch[2].trim();
  } else {
    // Check slash or colon: Category / Asset or Category: Asset
    const slashMatch = assetPart.match(/^([^/:]+)\s*[/:]\s*(.+)$/);
    if (slashMatch) {
      categoryName = slashMatch[1].trim();
      assetName = slashMatch[2].trim();
    }
  }

  if (!assetName) {
    return { kind: 'unknown', raw: clean };
  }

  return {
    kind: 'asset',
    categoryName,
    assetName,
    type,
  };
}

/**
 * Formats standard header for an asset with its category:
 * "[Category] Asset Name (Value)" or "[Category] Asset Name (Invested)"
 */
export function formatAssetColumnHeader(
  categoryName: string | undefined,
  assetName: string,
  type: 'Value' | 'Invested'
): string {
  const prefix = categoryName ? `[${categoryName}] ` : '';
  return `${prefix}${assetName} (${type})`;
}

/**
 * Escapes CSV values with double-quotes if they contain commas, quotes, or newlines.
 */
function escapeCSVField(field: any): string {
  if (field === null || field === undefined) return '""';
  const str = String(field);
  return `"${str.replace(/"/g, '""')}"`;
}

/**
 * Generates standard UTF-8 CSV with BOM for seamless opening in Microsoft Excel,
 * Google Sheets, Numbers, and 100% round-trip re-import into ValuaQ.
 */
export function generateCSV(
  categories: Category[],
  assets: Asset[],
  records: MonthlyRecord[]
): string {
  const sortedRecords = [...records].sort((a, b) => a.month.localeCompare(b.month));
  const catMap = new Map<string, Category>(categories.map((c) => [c.id, c]));

  // Standard Header Row:
  // Month, Emergency Fund, KPIs, Asset Value/Invested columns, Description
  const headers = [
    'Month',
    'Emergency Fund',
    'Total Portfolio Value',
    'Total Invested Capital',
    'Monthly Added Capital',
    'Floating P&L',
    'Floating P&L %',
    ...assets.flatMap((ast) => {
      const cat = catMap.get(ast.categoryId);
      const catName = cat?.name;
      return [
        formatAssetColumnHeader(catName, ast.name, 'Value'),
        formatAssetColumnHeader(catName, ast.name, 'Invested'),
      ];
    }),
    'Description / Notes',
  ];

  const rows = sortedRecords.map((rec) => {
    const totalAssetVal = Object.values(rec.assetValues || {}).reduce(
      (sum, v) => sum + (Number(v) || 0),
      0
    );
    const cumulativeInvested = rec.totalMoneyInvested || 0;
    const floatingPL = totalAssetVal - cumulativeInvested;
    const floatingPLPercent = cumulativeInvested > 0 ? (floatingPL / cumulativeInvested) * 100 : 0;

    const rowValues = [
      escapeCSVField(rec.month),
      escapeCSVField(rec.emergencyFund || 0),
      escapeCSVField(Math.round(totalAssetVal)),
      escapeCSVField(Math.round(cumulativeInvested)),
      escapeCSVField(Math.round(rec.monthlyMoneyInvested || 0)),
      escapeCSVField(Math.round(floatingPL)),
      escapeCSVField(`${floatingPLPercent >= 0 ? '+' : ''}${floatingPLPercent.toFixed(2)}%`),
      ...assets.flatMap((ast) => [
        escapeCSVField(rec.assetValues?.[ast.id] ?? 0),
        escapeCSVField(rec.assetInvestedValues?.[ast.id] ?? 0),
      ]),
      escapeCSVField(rec.description || ''),
    ];

    return rowValues.join(',');
  });

  // Prepend UTF-8 BOM (\uFEFF) so Excel parses non-ASCII and currencies correctly
  return '\uFEFF' + [headers.map(escapeCSVField).join(','), ...rows].join('\r\n');
}

/**
 * Downloads the portfolio data as a CSV file.
 */
export function downloadCSVFile(
  categories: Category[],
  assets: Asset[],
  records: MonthlyRecord[],
  fileName?: string
): void {
  const csvContent = generateCSV(categories, assets, records);
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName || `ValuaQ_Monthly_Records_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Generates an empty / sample CSV template demonstrating the exact 1:1 format.
 */
export function downloadCSVTemplate(
  categories: Category[],
  assets: Asset[],
  fileName?: string
): void {
  const sampleRecords: MonthlyRecord[] = [
    {
      id: 'template-sample-1',
      month: '2025-01',
      emergencyFund: 100000,
      assetValues: assets.reduce((acc, a) => ({ ...acc, [a.id]: 50000 }), {}),
      assetInvestedValues: assets.reduce((acc, a) => ({ ...acc, [a.id]: 10000 }), {}),
      monthlyMoneyInvested: 10000 * assets.length,
      totalMoneyInvested: 10000 * assets.length,
      description: 'Example template row (edit or delete before import)',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ];

  const content = generateCSV(categories, assets, sampleRecords);
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName || `ValuaQ_Import_Template.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Generates an Excel workbook (.xlsx) with:
 * - Sheet 1: Monthly Records (symmetrical format matching CSV)
 * - Sheet 2: Categories & Assets (hierarchy metadata)
 * - Sheet 3: System Backup Data (lossless JSON for seamless re-import)
 */
export function generateExcelWorkbook(
  categories: Category[],
  assets: Asset[],
  records: MonthlyRecord[],
  settings: AppSettings
): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();
  const sortedRecords = [...records].sort((a, b) => a.month.localeCompare(b.month));
  const catMap = new Map<string, Category>(categories.map((c) => [c.id, c]));

  // 1. Build Monthly Records Sheet Data (matching CSV column headers)
  const monthlyRows = sortedRecords.map((rec) => {
    const totalAssetVal = Object.values(rec.assetValues || {}).reduce(
      (sum, v) => sum + (Number(v) || 0),
      0
    );
    const cumulativeInvested = rec.totalMoneyInvested || 0;
    const floatingPL = totalAssetVal - cumulativeInvested;
    const floatingPLPercent = cumulativeInvested > 0 ? (floatingPL / cumulativeInvested) * 100 : 0;

    const row: Record<string, any> = {
      'Month': rec.month,
      'Emergency Fund': rec.emergencyFund || 0,
      'Total Portfolio Value': Math.round(totalAssetVal),
      'Total Invested Capital': Math.round(cumulativeInvested),
      'Monthly Added Capital': Math.round(rec.monthlyMoneyInvested || 0),
      'Floating P&L': Math.round(floatingPL),
      'Floating P&L %': `${floatingPLPercent >= 0 ? '+' : ''}${floatingPLPercent.toFixed(2)}%`,
    };

    // Add each asset's value and invested columns with category prefix
    assets.forEach((ast) => {
      const cat = catMap.get(ast.categoryId);
      const catName = cat?.name;
      row[formatAssetColumnHeader(catName, ast.name, 'Value')] = rec.assetValues?.[ast.id] ?? 0;
      row[formatAssetColumnHeader(catName, ast.name, 'Invested')] = rec.assetInvestedValues?.[ast.id] ?? 0;
    });

    row['Description / Notes'] = rec.description || '';
    return row;
  });

  const wsMonthly = XLSX.utils.json_to_sheet(monthlyRows);
  XLSX.utils.book_append_sheet(wb, wsMonthly, 'Monthly Records');

  // 2. Build Categories & Assets Hierarchy Sheet
  const hierarchyRows: Record<string, any>[] = [];
  categories.forEach((cat) => {
    const catAssets = assets.filter((a) => a.categoryId === cat.id);
    if (catAssets.length === 0) {
      hierarchyRows.push({
        'Category Name': cat.name,
        'Risk Level': cat.riskLevel,
        'Target Allocation %': cat.targetPercent ?? 0,
        'Color': cat.color,
        'Asset Name': '',
        'Currency': '',
        'Description': cat.description || '',
      });
    } else {
      catAssets.forEach((ast) => {
        hierarchyRows.push({
          'Category Name': cat.name,
          'Risk Level': cat.riskLevel,
          'Target Allocation %': cat.targetPercent ?? 0,
          'Color': cat.color,
          'Asset Name': ast.name,
          'Currency': ast.currency || 'NTD',
          'Description': ast.description || '',
        });
      });
    }
  });

  const wsHierarchy = XLSX.utils.json_to_sheet(hierarchyRows);
  XLSX.utils.book_append_sheet(wb, wsHierarchy, 'Categories & Assets');

  // 3. Lossless System Backup Data Sheet (for full backup restoration)
  const fullBackup: BackupData = {
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    categories,
    assets,
    records,
    settings,
  };

  const wsBackup = XLSX.utils.json_to_sheet([
    { 'Key': 'ValuaQ_Backup_Payload', 'Data': JSON.stringify(fullBackup) },
    { 'Key': 'Exported_At', 'Data': fullBackup.timestamp },
    { 'Key': 'Total_Months', 'Data': records.length },
    { 'Key': 'Total_Assets', 'Data': assets.length },
  ]);
  XLSX.utils.book_append_sheet(wb, wsBackup, 'System Backup Data');

  return wb;
}

/**
 * Downloads the portfolio data as an Excel (.xlsx) file.
 */
export function downloadExcelFile(
  categories: Category[],
  assets: Asset[],
  records: MonthlyRecord[],
  settings: AppSettings,
  fileName?: string
): void {
  const wb = generateExcelWorkbook(categories, assets, records, settings);
  const name = fileName || `ValuaQ_Portfolio_${new Date().toISOString().slice(0, 10)}.xlsx`;
  XLSX.writeFile(wb, name);
}

/**
 * Helper to read a File (.xlsx, .xls, or .csv) and normalize row headers.
 */
async function parseFileToRawWorkbook(file: File): Promise<{
  wb: XLSX.WorkBook;
  rows: Record<string, any>[];
  headers: string[];
}> {
  let wb: XLSX.WorkBook;

  if (file.name.toLowerCase().endsWith('.csv') || file.type.includes('csv')) {
    const rawText = await file.text();
    // Strip UTF-8 BOM if present
    const cleanText = rawText.replace(/^\uFEFF/, '');
    wb = XLSX.read(cleanText, { type: 'string', raw: false });
  } else {
    const buffer = await file.arrayBuffer();
    wb = XLSX.read(buffer, { type: 'array' });
  }

  // Find target sheet
  const targetSheetName = wb.SheetNames.includes('Monthly Records')
    ? 'Monthly Records'
    : wb.SheetNames[0];

  const sheet = wb.Sheets[targetSheetName];
  if (!sheet) {
    throw new Error('Spreadsheet contains no readable sheets.');
  }

  const rawRows = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, { defval: '' });
  if (rawRows.length === 0) {
    throw new Error('Spreadsheet contains no data rows.');
  }

  // Normalize row keys (strip leading BOM, whitespace, quotes from header keys)
  const normalizedRows = rawRows.map((row) => {
    const cleanRow: Record<string, any> = {};
    Object.keys(row).forEach((k) => {
      const cleanKey = k.replace(/^\uFEFF/, '').replace(/^["']|["']$/g, '').trim();
      cleanRow[cleanKey] = row[k];
    });
    return cleanRow;
  });

  const headers = Object.keys(normalizedRows[0] || {});
  return { wb, rows: normalizedRows, headers };
}

export interface ImportPreviewResult {
  validMonthsCount: number;
  monthsList: string[];
  detectedCategories: string[];
  detectedAssets: { name: string; category?: string }[];
  newAssetsCount: number;
  isFullBackupFound: boolean;
  rawWorkbook?: XLSX.WorkBook;
  rawRows?: Record<string, any>[];
  backupPayload?: BackupData;
}

/**
 * Reads a spreadsheet file (.xlsx, .xls, or .csv) and returns an inspection preview
 * before executing the import.
 */
export async function inspectSpreadsheetFile(
  file: File,
  existingAssets: Asset[]
): Promise<ImportPreviewResult> {
  const { wb, rows, headers } = await parseFileToRawWorkbook(file);

  // 1. Check if it contains the System Backup Data sheet
  if (wb.SheetNames.includes('System Backup Data')) {
    const backupSheet = wb.Sheets['System Backup Data'];
    const backupJson = XLSX.utils.sheet_to_json<any>(backupSheet);
    const backupEntry = backupJson.find((row) => row.Key === 'ValuaQ_Backup_Payload');
    if (backupEntry && backupEntry.Data) {
      try {
        const payload: BackupData = JSON.parse(backupEntry.Data);
        if (payload.records && Array.isArray(payload.records)) {
          return {
            validMonthsCount: payload.records.length,
            monthsList: payload.records.map((r) => r.month),
            detectedCategories: (payload.categories || []).map((c) => c.name),
            detectedAssets: (payload.assets || []).map((a) => ({ name: a.name })),
            newAssetsCount: 0,
            isFullBackupFound: true,
            rawWorkbook: wb,
            backupPayload: payload,
          };
        }
      } catch {
        // Fall back to standard sheet parser
      }
    }
  }

  // 2. Identify Month column
  const monthKey = headers.find((h) => {
    const parsed = parseColumnHeader(h);
    return parsed.kind === 'month';
  });

  if (!monthKey) {
    throw new Error('Could not identify a "Month" or "Date" column in the spreadsheet.');
  }

  const validMonths: string[] = [];
  rows.forEach((row) => {
    const normalized = normalizeMonthString(row[monthKey]);
    if (normalized && !validMonths.includes(normalized)) {
      validMonths.push(normalized);
    }
  });

  if (validMonths.length === 0) {
    throw new Error('No valid month entries (e.g., "YYYY-MM") found in the Month column.');
  }

  // 3. Classify headers and detect assets and categories
  const existingAssetNames = new Set(existingAssets.map((a) => a.name.toLowerCase().trim()));
  const detectedCategorySet = new Set<string>();
  const detectedAssetMap = new Map<string, { name: string; category?: string }>();

  headers.forEach((h) => {
    const classification = parseColumnHeader(h);
    if (classification.kind === 'asset') {
      const { categoryName, assetName } = classification;
      if (categoryName) {
        detectedCategorySet.add(categoryName);
      }
      const key = `${(categoryName || '').toLowerCase()}::${assetName.toLowerCase()}`;
      if (!detectedAssetMap.has(key)) {
        detectedAssetMap.set(key, { name: assetName, category: categoryName });
      }
    }
  });

  const detectedAssetsList = Array.from(detectedAssetMap.values());
  let newAssetsCount = 0;
  detectedAssetsList.forEach((a) => {
    if (!existingAssetNames.has(a.name.toLowerCase().trim())) {
      newAssetsCount++;
    }
  });

  return {
    validMonthsCount: validMonths.length,
    monthsList: validMonths.sort(),
    detectedCategories: Array.from(detectedCategorySet),
    detectedAssets: detectedAssetsList,
    newAssetsCount,
    isFullBackupFound: false,
    rawWorkbook: wb,
    rawRows: rows,
  };
}

export interface ImportSpreadsheetResult {
  success: boolean;
  message: string;
  importedRecordsCount: number;
  newCategoriesCount: number;
  newAssetsCount: number;
  updatedCategories: Category[];
  updatedAssets: Asset[];
  updatedRecords: MonthlyRecord[];
}

/**
 * Executes import of spreadsheet data into local categories, assets, and monthly records.
 * Automatically saves a local backup snapshot before modifying data!
 */
export async function executeSpreadsheetImport(
  file: File,
  existingCategories: Category[],
  existingAssets: Asset[],
  existingRecords: MonthlyRecord[],
  importMode: 'merge' | 'replace' = 'merge'
): Promise<ImportSpreadsheetResult> {
  // First, create an automated safety local snapshot before doing anything!
  createLocalSnapshot(`Auto-backup before spreadsheet import (${new Date().toLocaleTimeString()})`);

  const preview = await inspectSpreadsheetFile(file, existingAssets);

  // If this was a full lossless backup workbook, restore it directly
  if (preview.isFullBackupFound && preview.backupPayload) {
    const payload = preview.backupPayload;
    if (importMode === 'replace') {
      return {
        success: true,
        message: `Successfully restored full backup from Excel with ${payload.records.length} months and ${payload.assets.length} assets!`,
        importedRecordsCount: payload.records.length,
        newCategoriesCount: payload.categories.length - existingCategories.length,
        newAssetsCount: payload.assets.length - existingAssets.length,
        updatedCategories: payload.categories,
        updatedAssets: payload.assets,
        updatedRecords: recalculateMonthlyRecords(payload.records),
      };
    } else {
      // Merge mode for full backup
      const catMap = new Map<string, Category>(existingCategories.map((c) => [c.id, c]));
      (payload.categories || []).forEach((c) => catMap.set(c.id, c));

      const astMap = new Map<string, Asset>(existingAssets.map((a) => [a.id, a]));
      (payload.assets || []).forEach((a) => astMap.set(a.id, a));

      const recMap = new Map<string, MonthlyRecord>(existingRecords.map((r) => [r.month, r]));
      (payload.records || []).forEach((r) => {
        const existing = recMap.get(r.month);
        if (existing) {
          recMap.set(r.month, {
            ...existing,
            ...r,
            assetValues: { ...(existing.assetValues || {}), ...(r.assetValues || {}) },
            assetInvestedValues: { ...(existing.assetInvestedValues || {}), ...(r.assetInvestedValues || {}) },
            updatedAt: new Date().toISOString(),
          });
        } else {
          recMap.set(r.month, r);
        }
      });

      const finalRecords = recalculateMonthlyRecords(Array.from(recMap.values()));
      return {
        success: true,
        message: `Merged ${payload.records.length} months from Excel backup into current portfolio.`,
        importedRecordsCount: payload.records.length,
        newCategoriesCount: catMap.size - existingCategories.length,
        newAssetsCount: astMap.size - existingAssets.length,
        updatedCategories: Array.from(catMap.values()),
        updatedAssets: Array.from(astMap.values()),
        updatedRecords: finalRecords,
      };
    }
  }

  // Parse rows from tabular spreadsheet (CSV or Excel Sheet 1)
  const rows = preview.rawRows || [];
  if (rows.length === 0) {
    throw new Error('No rows found to import.');
  }

  const sampleRow = rows[0];
  const headers = Object.keys(sampleRow);

  let monthKey = '';
  let emergencyKey: string | undefined = undefined;
  let descriptionKey: string | undefined = undefined;

  // Prepare mutable categories and assets
  const mutableCategories = [...existingCategories];
  const mutableAssets = [...existingAssets];

  let colorIndex = mutableCategories.length;

  const getOrCreateCategory = (catName: string): Category => {
    const trimmed = catName.trim();
    const existing = mutableCategories.find(
      (c) => c.name.toLowerCase().trim() === trimmed.toLowerCase()
    );
    if (existing) return existing;

    const newCat: Category = {
      id: `cat-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: trimmed,
      riskLevel: 'Medium',
      color: CATEGORY_COLOR_PALETTE[colorIndex % CATEGORY_COLOR_PALETTE.length],
      description: `Imported category (${trimmed})`,
      updatedAt: new Date().toISOString(),
    };
    colorIndex++;
    mutableCategories.push(newCat);
    return newCat;
  };

  // Ensure default fallback category exists
  let defaultCategory = mutableCategories[0];
  if (!defaultCategory) {
    defaultCategory = getOrCreateCategory('General Investments');
  }

  // Map each column header to target asset & type
  interface ColumnMapping {
    header: string;
    assetId: string;
    type: 'value' | 'invested';
  }

  const assetColumnMappings: ColumnMapping[] = [];

  headers.forEach((h) => {
    const classification = parseColumnHeader(h);

    if (classification.kind === 'month') {
      monthKey = h;
    } else if (classification.kind === 'emergency') {
      emergencyKey = h;
    } else if (classification.kind === 'description') {
      descriptionKey = h;
    } else if (classification.kind === 'asset') {
      const { categoryName, assetName, type } = classification;
      const targetCat = categoryName ? getOrCreateCategory(categoryName) : defaultCategory;

      // Find or create asset
      let targetAsset = mutableAssets.find(
        (a) =>
          a.categoryId === targetCat.id &&
          a.name.toLowerCase().trim() === assetName.toLowerCase().trim()
      );

      // If not in this category, check if asset with same name exists globally
      if (!targetAsset) {
        targetAsset = mutableAssets.find(
          (a) => a.name.toLowerCase().trim() === assetName.toLowerCase().trim()
        );
      }

      // If still not found, create new asset
      if (!targetAsset) {
        targetAsset = {
          id: `ast-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          name: assetName,
          categoryId: targetCat.id,
          currency: 'NTD',
          description: `Imported asset (${assetName})`,
          updatedAt: new Date().toISOString(),
        };
        mutableAssets.push(targetAsset);
      }

      assetColumnMappings.push({
        header: h,
        assetId: targetAsset.id,
        type,
      });
    }
  });

  if (!monthKey) {
    throw new Error('Could not identify a Month column in the file.');
  }

  // Parse each row into a MonthlyRecord
  const parsedRecords: MonthlyRecord[] = [];
  const processedMonths = new Set<string>();

  rows.forEach((row) => {
    const month = normalizeMonthString(row[monthKey]);
    if (!month || processedMonths.has(month)) return;
    processedMonths.add(month);

    const assetValues: Record<string, number> = {};
    const assetInvestedValues: Record<string, number> = {};

    assetColumnMappings.forEach(({ header, assetId, type }) => {
      const val = parseCleanNumber(row[header]);
      if (type === 'value') {
        assetValues[assetId] = val;
      } else {
        assetInvestedValues[assetId] = val;
      }
    });

    const emergencyFund = emergencyKey ? parseCleanNumber(row[emergencyKey]) : 0;
    const description = descriptionKey ? String(row[descriptionKey] || '').trim() : '';

    const newRecord: MonthlyRecord = {
      id: `rec-${month}-${Date.now()}`,
      month,
      assetValues,
      assetInvestedValues,
      monthlyMoneyInvested: 0, // recalculated below
      totalMoneyInvested: 0,   // recalculated below
      emergencyFund,
      description: description || undefined,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    parsedRecords.push(newRecord);
  });

  if (parsedRecords.length === 0) {
    throw new Error('Could not parse any valid monthly records from the provided file.');
  }

  let finalRecords: MonthlyRecord[];
  if (importMode === 'replace') {
    finalRecords = recalculateMonthlyRecords(parsedRecords);
  } else {
    // Merge mode: existing records + parsed records
    const map = new Map<string, MonthlyRecord>();
    existingRecords.forEach((r) => map.set(r.month, r));

    parsedRecords.forEach((importedRec) => {
      const existing = map.get(importedRec.month);
      if (existing) {
        map.set(importedRec.month, {
          ...existing,
          assetValues: { ...existing.assetValues, ...importedRec.assetValues },
          assetInvestedValues: { ...existing.assetInvestedValues, ...importedRec.assetInvestedValues },
          emergencyFund: importedRec.emergencyFund || existing.emergencyFund,
          description: importedRec.description || existing.description,
          updatedAt: new Date().toISOString(),
        });
      } else {
        map.set(importedRec.month, importedRec);
      }
    });

    finalRecords = recalculateMonthlyRecords(Array.from(map.values()));
  }

  return {
    success: true,
    message: `Successfully imported ${parsedRecords.length} month(s) from spreadsheet (${importMode === 'replace' ? 'Replaced' : 'Merged'}).`,
    importedRecordsCount: parsedRecords.length,
    newCategoriesCount: mutableCategories.length - existingCategories.length,
    newAssetsCount: mutableAssets.length - existingAssets.length,
    updatedCategories: mutableCategories,
    updatedAssets: mutableAssets,
    updatedRecords: finalRecords,
  };
}
