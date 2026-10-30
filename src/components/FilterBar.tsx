import React, { useState } from 'react';
import { CheckSquare, Square, Search, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react';
import { Category, Asset, RiskLevel, FilterState } from '../types';
import { formatCurrency, formatAssetUnitPrice } from '../lib/formatters';
import { getAssetBasePrice } from '../lib/ledgerEngine';

interface FilterBarProps {
  categories: Category[];
  assets: Asset[];
  filters: FilterState;
  onUpdateFilters: (newFilters: Partial<FilterState>) => void;
  onResetFilters: () => void;
  isSummaryTab?: boolean;
  currencySymbol?: string;
  stealthMode?: boolean;
  livePrices?: Record<string, number>;
}

export const FilterBar: React.FC<FilterBarProps> = ({
  categories,
  assets,
  filters,
  onUpdateFilters,
  onResetFilters,
  isSummaryTab = false,
  currencySymbol = 'NT$',
  stealthMode = false,
  livePrices,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const riskLevels: RiskLevel[] = ['Low', 'Medium', 'High'];

  const handleToggleRisk = (risk: RiskLevel) => {
    const isRiskActive = filters.riskLevels.includes(risk);
    let newRiskLevels: RiskLevel[];
    if (isRiskActive) {
      newRiskLevels = filters.riskLevels.filter((r) => r !== risk);
    } else {
      newRiskLevels = [...filters.riskLevels, risk];
    }

    const catsInRisk = categories.filter((c) => c.riskLevel === risk).map((c) => c.id);
    const assetsInRisk = assets.filter((a) => catsInRisk.includes(a.categoryId)).map((a) => a.id);

    let newCategoryIds: string[];
    let newAssetIds: string[];

    if (isRiskActive) {
      newCategoryIds = filters.categoryIds.filter((id) => !catsInRisk.includes(id));
      newAssetIds = filters.assetIds.filter((id) => !assetsInRisk.includes(id));
    } else {
      newCategoryIds = Array.from(new Set([...filters.categoryIds, ...catsInRisk]));
      newAssetIds = Array.from(new Set([...filters.assetIds, ...assetsInRisk]));
    }

    onUpdateFilters({
      riskLevels: newRiskLevels,
      categoryIds: newCategoryIds,
      assetIds: newAssetIds,
    });
  };

  const handleToggleCategory = (catId: string) => {
    const isCatActive = filters.categoryIds.includes(catId);
    let newCategoryIds: string[];
    let newAssetIds: string[];

    const catAssetIds = assets.filter((a) => a.categoryId === catId).map((a) => a.id);

    if (isCatActive) {
      newCategoryIds = filters.categoryIds.filter((id) => id !== catId);
      newAssetIds = filters.assetIds.filter((id) => !catAssetIds.includes(id));
    } else {
      newCategoryIds = [...filters.categoryIds, catId];
      newAssetIds = Array.from(new Set([...filters.assetIds, ...catAssetIds]));
    }

    const targetCategory = categories.find((c) => c.id === catId);
    let newRiskLevels = [...filters.riskLevels];

    if (targetCategory) {
      const risk = targetCategory.riskLevel;
      const catsForRisk = categories.filter((c) => c.riskLevel === risk).map((c) => c.id);
      const hasActiveCatInRisk = catsForRisk.some((id) => newCategoryIds.includes(id));

      if (hasActiveCatInRisk) {
        if (!newRiskLevels.includes(risk)) {
          newRiskLevels.push(risk);
        }
      } else {
        newRiskLevels = newRiskLevels.filter((r) => r !== risk);
      }
    }

    onUpdateFilters({
      riskLevels: newRiskLevels,
      categoryIds: newCategoryIds,
      assetIds: newAssetIds,
    });
  };

  const handleToggleAsset = (assetId: string) => {
    const isAssetActive = filters.assetIds.includes(assetId);
    let newAssetIds: string[];

    if (isAssetActive) {
      newAssetIds = filters.assetIds.filter((id) => id !== assetId);
    } else {
      newAssetIds = [...filters.assetIds, assetId];
    }

    const targetAsset = assets.find((a) => a.id === assetId);
    let newCategoryIds = [...filters.categoryIds];
    let newRiskLevels = [...filters.riskLevels];

    if (targetAsset) {
      const catId = targetAsset.categoryId;
      const catAssetIds = assets.filter((a) => a.categoryId === catId).map((a) => a.id);
      const hasActiveAssetInCat = catAssetIds.some((id) => newAssetIds.includes(id));

      if (hasActiveAssetInCat) {
        if (!newCategoryIds.includes(catId)) {
          newCategoryIds.push(catId);
        }
      } else {
        newCategoryIds = newCategoryIds.filter((id) => id !== catId);
      }

      const targetCategory = categories.find((c) => c.id === catId);
      if (targetCategory) {
        const risk = targetCategory.riskLevel;
        const catsForRisk = categories.filter((c) => c.riskLevel === risk).map((c) => c.id);
        const hasActiveCatInRisk = catsForRisk.some((id) => newCategoryIds.includes(id));

        if (hasActiveCatInRisk) {
          if (!newRiskLevels.includes(risk)) {
            newRiskLevels.push(risk);
          }
        } else {
          newRiskLevels = newRiskLevels.filter((r) => r !== risk);
        }
      }
    }

    onUpdateFilters({
      riskLevels: newRiskLevels,
      categoryIds: newCategoryIds,
      assetIds: newAssetIds,
    });
  };

  const totalAssetsCount = assets.length + (isSummaryTab ? 1 : 0);
  const activeAssetsCount = filters.assetIds.length + (isSummaryTab && filters.includeEmergencyFund !== false ? 1 : 0);
  const isFiltered =
    activeAssetsCount < totalAssetsCount ||
    filters.categoryIds.length < categories.length ||
    filters.riskLevels.length < riskLevels.length ||
    filters.searchQuery !== '' ||
    (isSummaryTab && filters.includeEmergencyFund === false);

  return (
    <div className="fintech-card rounded-xl px-4 py-3 mb-6">
      
      {/* Top Filter Bar Controls */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
        
        {/* Search & Active Count */}
        <div className="flex items-center gap-3.5 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-64">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Filter assets or categories..."
              value={filters.searchQuery}
              onChange={(e) => onUpdateFilters({ searchQuery: e.target.value })}
              className="w-full bg-[#080C14] border border-slate-800 text-slate-200 text-xs rounded-lg pl-8 pr-3 py-1.5 focus:outline-none focus:border-emerald-500/60 transition-colors"
            />
          </div>

          <div className="text-xs text-slate-400 whitespace-nowrap font-mono tabular-nums">
            <span>Showing </span>
            <strong className="text-emerald-400 font-semibold">{activeAssetsCount}</strong>
            <span className="text-slate-600"> / </span>
            <span>{totalAssetsCount} Assets</span>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
          {isFiltered && (
            <button
              onClick={onResetFilters}
              className="flex items-center gap-1.5 text-xs text-amber-400 hover:text-amber-300 bg-amber-500/10 hover:bg-amber-500/20 px-3 py-1.5 rounded-lg border border-amber-500/20 transition-all font-medium whitespace-nowrap shrink-0 cursor-pointer"
            >
              <RefreshCw className="w-3 h-3" />
              <span>Reset Filter</span>
            </button>
          )}

          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="flex items-center gap-1.5 text-xs text-slate-200 hover:text-white bg-slate-800/70 hover:bg-slate-800 px-3 py-1.5 rounded-lg border border-slate-700/80 transition-all font-medium whitespace-nowrap shrink-0 cursor-pointer"
          >
            <span>Filter By Category &amp; Risk</span>
            {isExpanded ? <ChevronUp className="w-3.5 h-3.5 text-emerald-400" /> : <ChevronDown className="w-3.5 h-3.5 text-slate-400" />}
          </button>
        </div>
      </div>

      {/* Expanded Filter Panel */}
      {isExpanded && (
        <div className="mt-3.5 pt-3.5 border-t border-slate-800/80 space-y-4 animate-in fade-in duration-150">
          
          {/* Risk Level Filter Section */}
          <div>
            <label className="text-xs font-semibold text-slate-300 mb-2 block">
              Risk Level
            </label>
            <div className="flex flex-wrap gap-2">
              {riskLevels.map((risk) => {
                const isActive = filters.riskLevels.includes(risk);
                return (
                  <button
                    key={risk}
                    onClick={() => handleToggleRisk(risk)}
                    className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition-all font-medium whitespace-nowrap shrink-0 cursor-pointer ${
                      isActive
                        ? 'bg-slate-800/90 border-emerald-500/40 text-slate-100'
                        : 'bg-[#080C14] border-slate-800 text-slate-500 hover:border-slate-700'
                    }`}
                  >
                    {isActive ? <CheckSquare className="w-3.5 h-3.5 text-emerald-400" /> : <Square className="w-3.5 h-3.5 text-slate-600" />}
                    <span>{risk} Risk</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Category Filter Section */}
          <div>
            <label className="text-xs font-semibold text-slate-300 mb-2 block">
              Asset Categories
            </label>
            <div className="flex flex-wrap gap-2">
              {categories.map((cat) => {
                const isActive = filters.categoryIds.includes(cat.id);
                return (
                  <button
                    key={cat.id}
                    onClick={() => handleToggleCategory(cat.id)}
                    className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition-all font-medium whitespace-nowrap shrink-0 cursor-pointer ${
                      isActive
                        ? 'bg-slate-800/90 border-slate-700 text-slate-100'
                        : 'bg-[#080C14] border-slate-800 text-slate-500 hover:border-slate-700'
                    }`}
                  >
                    <span
                      className="w-2 h-2 rounded-full"
                      style={{ backgroundColor: isActive ? cat.color : '#475569' }}
                    />
                    <span>{cat.name}</span>
                    <span className="text-slate-600" aria-hidden="true">·</span>
                    <span className="text-[11px] text-slate-400 font-normal">
                      {cat.riskLevel}
                    </span>
                  </button>
                );
              })}
              {isSummaryTab && (
                <button
                  key="emergency-fund-cat"
                  onClick={() =>
                    onUpdateFilters({
                      includeEmergencyFund: filters.includeEmergencyFund === false ? true : false,
                    })
                  }
                  className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition-all font-medium whitespace-nowrap shrink-0 cursor-pointer ${
                    filters.includeEmergencyFund !== false
                      ? 'bg-slate-800/90 border-slate-700 text-slate-100'
                      : 'bg-[#080C14] border-slate-800 text-slate-500 hover:border-slate-700'
                  }`}
                >
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{
                      backgroundColor:
                        filters.includeEmergencyFund !== false ? '#10b981' : '#475569',
                    }}
                  />
                  <span>Emergency Fund</span>
                  <span className="text-slate-600" aria-hidden="true">·</span>
                  <span className="text-[11px] text-slate-400 font-normal">
                    Low
                  </span>
                </button>
              )}
            </div>
          </div>

          {/* Individual Assets Filter */}
          <div>
            <label className="text-xs font-semibold text-slate-300 mb-2 block">
              Individual Assets
            </label>
            <div className="flex flex-wrap gap-2">
              {assets.map((asset) => {
                const isActive = filters.assetIds.includes(asset.id);
                const category = categories.find((c) => c.id === asset.categoryId);
                const curr = (asset.currency || 'NTD').toUpperCase();
                const isBaseCash = Boolean(asset.isCash && (curr === 'NTD' || curr === 'TWD'));
                const unitPrice = getAssetBasePrice(asset, undefined, livePrices);
                return (
                  <button
                    key={asset.id}
                    onClick={() => handleToggleAsset(asset.id)}
                    className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border transition-all whitespace-nowrap shrink-0 cursor-pointer ${
                      isActive
                        ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30 font-medium'
                        : 'bg-[#080C14] text-slate-500 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    {isActive ? <CheckSquare className="w-3 h-3 text-emerald-400" /> : <Square className="w-3 h-3 text-slate-600" />}
                    <span>{asset.name}</span>
                    {category && (
                      <>
                        <span className="text-slate-600" aria-hidden="true">·</span>
                        <span className="text-[11px] text-slate-400 font-normal">
                          {category.name}
                        </span>
                      </>
                    )}
                    {!isBaseCash && (
                      <>
                        <span className="text-slate-600" aria-hidden="true">·</span>
                        <span className="text-[11px] font-mono tabular-nums text-emerald-400 font-semibold">
                          {formatAssetUnitPrice(unitPrice, asset, stealthMode)}
                        </span>
                      </>
                    )}
                  </button>
                );
              })}
              {isSummaryTab && (
                <button
                  key="emergency-fund-asset"
                  onClick={() =>
                    onUpdateFilters({
                      includeEmergencyFund: filters.includeEmergencyFund === false ? true : false,
                    })
                  }
                  className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border transition-all whitespace-nowrap shrink-0 cursor-pointer ${
                    filters.includeEmergencyFund !== false
                      ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30 font-medium'
                      : 'bg-[#080C14] text-slate-500 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  {filters.includeEmergencyFund !== false ? (
                    <CheckSquare className="w-3 h-3 text-emerald-400" />
                  ) : (
                    <Square className="w-3 h-3 text-slate-600" />
                  )}
                  <span>Emergency Fund</span>
                  <span className="text-slate-600" aria-hidden="true">·</span>
                  <span className="text-[11px] text-slate-400 font-normal">
                    Cash Reserve
                  </span>
                </button>
              )}
            </div>
          </div>

        </div>
      )}

    </div>
  );
};
