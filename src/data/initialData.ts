import { Category, Asset, MonthlyRecord, AppSettings } from '../types';

export const initialCategories: Category[] = [];

export const initialAssets: Asset[] = [];

export const initialMonthlyRecords: MonthlyRecord[] = [];

export const initialSettings: AppSettings = {
  baseCurrency: 'NTD',
  currencySymbol: 'NT$',
  stealthMode: false,
  defaultChartType: 'pie',
  defaultGroupMode: 'category',
};

