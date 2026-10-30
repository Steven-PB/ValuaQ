import * as XLSX from 'xlsx';
import { Category, Asset, MonthlyRecord, AppSettings } from '../types';
import { getAssetBasePrice } from './ledgerEngine';
import {
  resolveCurrencyCodeFromSymbolOrCode,
  convertPriceFromNTD,
  getAssetPriceCurrency,
} from './formatters';

/**
 * Formats standard header for an asset with its category:
 * "[Category] Asset Name (Value)" or "[Category] Asset Name (Qty)" or "[Category] Asset Name (Price)"
 */
export function formatAssetColumnHeader(
  categoryName: string | undefined,
  assetName: string,
  type: 'Value' | 'Qty' | 'Price' | 'Invested'
): string {
  const prefix = categoryName ? `[${categoryName}] ` : '';
  return `${prefix}${assetName} (${type})`;
}

/**
 * Generates a read-only Excel workbook (.xlsx) from the Monthly Asset & Quantity Spreadsheet:
 * - Sheet 1: Monthly Asset & Quantity Spreadsheet
 * - Sheet 2: Categories & Assets Hierarchy
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
  const baseCode = resolveCurrencyCodeFromSymbolOrCode(settings?.baseCurrency || settings?.currencySymbol || 'NTD');
  const toBase = (valNtd: number) => Math.round(convertPriceFromNTD(valNtd, baseCode) * 100) / 100;

  // 1. Build Monthly Asset & Quantity Spreadsheet Sheet Data
  const monthlyRows = sortedRecords.map((rec) => {
    const totalAssetVal = Object.values(rec.assetValues || {}).reduce(
      (sum, v) => sum + (Number(v) || 0),
      0
    );
    const emergencyFundVal = rec.emergencyFund || 0;
    const totalCapitalVal = totalAssetVal + emergencyFundVal;
    const cumulativeInvested = rec.totalMoneyInvested || 0;
    const floatingPL = totalAssetVal - cumulativeInvested;
    const floatingPLPercent = cumulativeInvested > 0 ? (floatingPL / cumulativeInvested) * 100 : 0;

    const row: Record<string, any> = {
      'Month': rec.month,
      'Base Currency': baseCode,
      'Total Assets': toBase(totalAssetVal),
      'Emergency Fund': toBase(emergencyFundVal),
      'Total Capital': toBase(totalCapitalVal),
      'Monthly Deposit': toBase(rec.monthlyMoneyInvested || 0),
      'Monthly Yield': toBase(rec.monthlyDividendIncome || 0),
      'Total Invested': toBase(cumulativeInvested),
      'Floating P&L': toBase(floatingPL),
      'Floating P&L %': `${floatingPLPercent >= 0 ? '+' : ''}${floatingPLPercent.toFixed(2)}%`,
    };

    // Add each asset's Value, Quantity, and 1st-of-Month Price
    assets.forEach((ast) => {
      const cat = catMap.get(ast.categoryId);
      const catName = cat?.name;
      const val = rec.assetValues?.[ast.id] ?? 0;
      const qty = rec.assetQuantities?.[ast.id] ?? 0;
      const priceNtd = getAssetBasePrice(ast, rec.assetPrices);
      const priceCurr = getAssetPriceCurrency(ast);
      const displayPrice = Math.round(convertPriceFromNTD(priceNtd, priceCurr) * 10000) / 10000;

      row[formatAssetColumnHeader(catName, ast.name, 'Value')] = toBase(val);
      row[formatAssetColumnHeader(catName, ast.name, 'Qty')] = qty;
      row[formatAssetColumnHeader(catName, `${ast.name} [${priceCurr}]`, 'Price')] = displayPrice;
    });

    const assetNotesArray = rec.assetNotes 
      ? Object.entries(rec.assetNotes).map(([astId, n]) => {
          const ast = assets.find((a) => a.id === astId);
          return `${ast?.name || 'Asset'}: ${n}`;
        })
      : [];
    const notesCombined = [
      rec.description && !rec.description.startsWith('Snapshot for ') ? rec.description : '',
      ...assetNotesArray,
    ].filter(Boolean).join(' | ');

    row['Status / Notes'] = rec.isLivePending
      ? 'Real-time live valuation'
      : notesCombined || rec.description || 'Saved snapshot';
    return row;
  });

  const wsMonthly = XLSX.utils.json_to_sheet(monthlyRows);
  XLSX.utils.book_append_sheet(wb, wsMonthly, 'Monthly Spreadsheet');

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
        'Ticker': '',
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
          'Ticker': ast.tickerSymbol || '',
          'Currency': ast.currency || 'NTD',
          'Description': ast.description || '',
        });
      });
    }
  });

  const wsHierarchy = XLSX.utils.json_to_sheet(hierarchyRows);
  XLSX.utils.book_append_sheet(wb, wsHierarchy, 'Categories & Assets');

  return wb;
}

/**
 * Generates and downloads the Monthly Asset & Quantity Spreadsheet as an Excel (.xlsx) file.
 */
export function downloadExcelFile(
  categories: Category[],
  assets: Asset[],
  records: MonthlyRecord[],
  settings: AppSettings,
  fileName?: string
): void {
  const wb = generateExcelWorkbook(categories, assets, records, settings);
  const name = fileName || `ValuaQ_Monthly_Spreadsheet_${new Date().toISOString().slice(0, 10)}.xlsx`;
  XLSX.writeFile(wb, name);
}
