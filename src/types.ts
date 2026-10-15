export type RiskLevel = 'Low' | 'Medium' | 'High';

export interface Category {
  id: string;
  name: string;
  riskLevel: RiskLevel;
  color: string; // Hex color for chart rendering
  description?: string;
}

export interface Asset {
  id: string;
  name: string;
  categoryId: string;
  currency?: string; // e.g. "USD", "NTD"
  description?: string;
}

export interface MonthlyRecord {
  id: string;
  month: string; // Format: "YYYY-MM", e.g., "2026-01"
  assetValues: Record<string, number>; // assetId -> amount in base currency
  assetInvestedValues?: Record<string, number>; // assetId -> invested capital in base currency
  monthlyMoneyInvested: number; // New capital invested in this month
  totalMoneyInvested: number; // Total cumulative money invested up to this month
  emergencyFund?: number; // Optional safety net cash reserve (excluded from investment P&L and invested capital)
  description?: string;
  createdAt?: string;
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
  currencySymbol: string; // e.g. "NT$" or "$"
  stealthMode: boolean; // Mask values for privacy
  defaultChartType: ChartType;
  defaultGroupMode: ChartGroupMode;
}
