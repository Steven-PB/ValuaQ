export type RiskLevel = 'Low' | 'Medium' | 'High';

export interface Category {
  id: string;
  name: string;
  riskLevel: RiskLevel;
  color: string; // Hex color for chart rendering
  description?: string;
  updatedAt?: string;
  targetPercent?: number; // Desired target portfolio allocation % (0 - 100)
  isCashCategory?: boolean;
  isEmergencyFundCategory?: boolean; // Quarantined safety net category excluded from P&L & Rebalancing
}

export interface Asset {
  id: string;
  name: string;
  categoryId: string;
  tickerSymbol?: string; // e.g. "BTC", "ETH", "VOO", "2330.TW", "GC=F"
  isCash?: boolean; // Whether this asset is Cash (used for the 'Add' action constraint)
  isEmergencyFund?: boolean; // Safety net cash reserve (excluded from investment P&L, Total Invested & Rebalancing)
  guardBand?: number; // Optional minimum reserve floor (>= 0 guard band) for Convert deductions
  currentPrice?: number; // Latest known spot price in base currency (default 1 for cash)
  currency?: string; // e.g. "USD", "NTD"
  priceCurrency?: string; // Display currency for this asset's unit price (e.g. "NTD", "USD", "JPY", "EUR")
  description?: string;
  updatedAt?: string;
}

export type TransactionType = 'add' | 'convert' | 'dividend' | 'withdraw';

export interface LedgerTransaction {
  id: string;
  date: string; // YYYY-MM-DD
  action: TransactionType;
  fromAssetId?: string | null; // null for 'add'; source asset for 'convert'/'withdraw' or optional yield source for 'dividend'
  fromValue: number; // Quantity of fromAsset (0 for 'add' and 'dividend', withdrawn amount for 'withdraw')
  toAssetId: string; // Target asset ID
  toValue: number; // Quantity of toAsset
  note?: string;
  createdAt?: string;
  updatedAt?: string;
}

export type MonthlyPriceMap = Record<string, Record<string, number>>; // month (YYYY-MM) -> assetId -> price

export interface MonthNoteData {
  monthNote?: string; // Overall monthly strategy & decision reminder
  assetNotes?: Record<string, string>; // assetId -> reminder note on why this asset decision was made
  updatedAt?: string;
}

export type MonthlyNotesMap = Record<string, MonthNoteData>; // month (YYYY-MM) -> MonthNoteData

export interface MonthlyRecord {
  id: string;
  month: string; // Format: "YYYY-MM", e.g., "2026-01"
  assetValues: Record<string, number>; // assetId -> valuation in base currency (Qty * Price)
  assetQuantities?: Record<string, number>; // assetId -> cumulative quantity
  assetPrices?: Record<string, number>; // assetId -> price on 1st day of month
  assetInvestedValues?: Record<string, number>; // assetId -> invested capital in base currency
  monthlyMoneyInvested: number; // New capital invested in this month
  totalMoneyInvested: number; // Total cumulative money invested up to this month
  monthlyDividendIncome?: number; // Passive dividend/interest yield earned in this month (in base currency)
  totalDividendIncome?: number; // Cumulative passive dividend/interest yield earned up to this month
  emergencyFund?: number; // Optional safety net cash reserve (excluded from investment P&L)
  description?: string; // Month decision note / reminder
  assetNotes?: Record<string, string>; // assetId -> reminder note for this month
  isLivePending?: boolean; // Whether this record represents the upcoming/current live month
  createdAt?: string;
  updatedAt?: string;
}

export type ChartGroupMode = 'asset' | 'category' | 'risk';
export type ChartType = 'pie' | 'stackedBar' | 'all';

export interface FilterState {
  categoryIds: string[]; // Enabled category IDs
  assetIds: string[]; // Enabled asset IDs
  riskLevels: RiskLevel[]; // Enabled risk levels
  searchQuery: string;
  includeEmergencyFund?: boolean; // Whether to include emergency fund in Summary tab
}

export interface AppSettings {
  baseCurrency?: string; // e.g. "NTD", "IDR", "USD", "JPY", "EUR"
  currencySymbol: string; // e.g. "NT$", "Rp", "US$"
  stealthMode: boolean; // Mask values for privacy
  defaultChartType: ChartType;
  defaultGroupMode: ChartGroupMode;
}

export type RebalanceMode = 'cashflow' | 'full';

export interface CategoryRebalanceItem {
  categoryId: string;
  categoryName: string;
  categoryColor: string;
  riskLevel: RiskLevel;
  currentValue: number;
  actualPercent: number;
  targetPercent: number;
  targetValue: number;
  driftPercent: number; // actualPercent - targetPercent
  status: 'underweight' | 'balanced' | 'overweight';
  // Calculated action based on chosen mode and deposit
  actionAmount: number; // positive = buy/deposit, negative = sell/trim
  projectedValue: number;
  projectedPercent: number;
}

export interface RebalanceAnalysis {
  items: CategoryRebalanceItem[];
  totalCurrentValue: number;
  totalTargetPercent: number;
  isTargetValid: boolean; // whether target percentages sum to 100%
  overallDriftScore: number; // average absolute drift percentage across categories
  depositAmount: number;
  mode: RebalanceMode;
  totalNewPortfolioValue: number;
}

