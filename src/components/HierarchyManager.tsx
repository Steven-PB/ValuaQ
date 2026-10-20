import React, { useState } from 'react';
import { 
  Shield, 
  Tag, 
  Coins, 
  Plus, 
  Edit, 
  Trash2, 
  ChevronRight, 
  Info, 
  AlertTriangle,
  Check,
  X
} from 'lucide-react';
import { Category, Asset, RiskLevel, MonthlyRecord } from '../types';
import { getRiskLevelBadgeClass, getRiskLevelColor, formatCurrency } from '../lib/formatters';

interface HierarchyManagerProps {
  categories: Category[];
  assets: Asset[];
  records: MonthlyRecord[];
  currencySymbol: string;
  onAddCategory: (category: Omit<Category, 'id'>) => void;
  onEditCategory: (id: string, updated: Partial<Category>) => void;
  onDeleteCategory: (id: string) => void;
  onReassignCategoryAndDelete: (sourceCategoryId: string, targetCategoryId: string) => void;
  onAddAsset: (asset: Omit<Asset, 'id'>) => void;
  onEditAsset: (id: string, updated: Partial<Asset>) => void;
  onDeleteAsset: (id: string) => void;
  onReassignAssetAndDelete: (sourceAssetId: string, targetAssetId: string) => void;
}

export const HierarchyManager: React.FC<HierarchyManagerProps> = ({
  categories,
  assets,
  records,
  currencySymbol,
  onAddCategory,
  onEditCategory,
  onDeleteCategory,
  onReassignCategoryAndDelete,
  onAddAsset,
  onEditAsset,
  onDeleteAsset,
  onReassignAssetAndDelete,
}) => {
  // Category Modal State
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [catName, setCatName] = useState('');
  const [catRisk, setCatRisk] = useState<RiskLevel>('Medium');
  const [catColor, setCatColor] = useState('#3b82f6');
  const [catDesc, setCatDesc] = useState('');
  const [catTargetPercent, setCatTargetPercent] = useState<number>(0);

  // Asset Modal State
  const [isAssetModalOpen, setIsAssetModalOpen] = useState(false);
  const [editingAsset, setEditingAsset] = useState<Asset | null>(null);
  const [astName, setAstName] = useState('');
  const [astCatId, setAstCatId] = useState('');
  const [astCurrency, setAstCurrency] = useState('NTD');
  const [astDesc, setAstDesc] = useState('');

  // Reassign Guard Modals State
  const [categoryToDeleteGuard, setCategoryToDeleteGuard] = useState<Category | null>(null);
  const [targetCategoryId, setTargetCategoryId] = useState<string>('');

  const [assetToDeleteGuard, setAssetToDeleteGuard] = useState<Asset | null>(null);
  const [targetAssetId, setTargetAssetId] = useState<string>('');

  const [errorMsg, setErrorMsg] = useState('');

  // Category Deletion Handler
  const handleDeleteCategoryAttempt = (cat: Category) => {
    const availableTargets = categories.filter((c) => c.id !== cat.id);
    setCategoryToDeleteGuard(cat);
    if (availableTargets.length > 0) {
      setTargetCategoryId(availableTargets[0].id);
    } else {
      setTargetCategoryId('');
    }
  };

  const handleConfirmDirectCategoryDelete = () => {
    if (!categoryToDeleteGuard) return;
    onDeleteCategory(categoryToDeleteGuard.id);
    setCategoryToDeleteGuard(null);
  };

  const handleConfirmCategoryReassign = () => {
    if (!categoryToDeleteGuard || !targetCategoryId) return;
    onReassignCategoryAndDelete(categoryToDeleteGuard.id, targetCategoryId);
    setCategoryToDeleteGuard(null);
  };

  // Asset Deletion Handler
  const handleDeleteAssetAttempt = (ast: Asset) => {
    const availableTargets = assets.filter((a) => a.id !== ast.id);
    setAssetToDeleteGuard(ast);
    if (availableTargets.length > 0) {
      setTargetAssetId(availableTargets[0].id);
    } else {
      setTargetAssetId('');
    }
  };

  const handleConfirmDirectAssetDelete = () => {
    if (!assetToDeleteGuard) return;
    onDeleteAsset(assetToDeleteGuard.id);
    setAssetToDeleteGuard(null);
  };

  const handleConfirmAssetReassign = () => {
    if (!assetToDeleteGuard || !targetAssetId) return;
    onReassignAssetAndDelete(assetToDeleteGuard.id, targetAssetId);
    setAssetToDeleteGuard(null);
  };

  // Predefined color palette for categories
  const colorPalette = [
    '#10b981', '#3b82f6', '#8b5cf6', '#f59e0b', '#ec4899',
    '#06b6d4', '#14b8a6', '#6366f1', '#a855f7', '#f43f5e',
    '#0284c7', '#d97706', '#059669', '#7c3aed', '#e11d48'
  ];

  // Open Category Modal
  const handleOpenCatModal = (cat?: Category) => {
    setErrorMsg('');
    if (cat) {
      setEditingCategory(cat);
      setCatName(cat.name);
      setCatRisk(cat.riskLevel);
      setCatColor(cat.color || '#3b82f6');
      setCatDesc(cat.description || '');
      setCatTargetPercent(cat.targetPercent ?? 0);
    } else {
      setEditingCategory(null);
      setCatName('');
      setCatRisk('Medium');
      setCatColor('#3b82f6');
      setCatDesc('');
      setCatTargetPercent(0);
    }
    setIsCategoryModalOpen(true);
  };

  const handleSaveCategory = (e: React.FormEvent) => {
    e.preventDefault();
    if (!catName.trim()) {
      setErrorMsg('Category name is required');
      return;
    }

    if (editingCategory) {
      onEditCategory(editingCategory.id, {
        name: catName,
        riskLevel: catRisk,
        color: catColor,
        description: catDesc,
        targetPercent: Number(catTargetPercent) || 0,
      });
    } else {
      onAddCategory({
        name: catName,
        riskLevel: catRisk,
        color: catColor,
        description: catDesc,
        targetPercent: Number(catTargetPercent) || 0,
      });
    }
    setIsCategoryModalOpen(false);
  };

  // Open Asset Modal
  const handleOpenAssetModal = (ast?: Asset) => {
    setErrorMsg('');
    if (ast) {
      setEditingAsset(ast);
      setAstName(ast.name);
      setAstCatId(ast.categoryId);
      setAstCurrency(ast.currency || 'NTD');
      setAstDesc(ast.description || '');
    } else {
      setEditingAsset(null);
      setAstName('');
      setAstCatId(categories[0]?.id || '');
      setAstCurrency('NTD');
      setAstDesc('');
    }
    setIsAssetModalOpen(true);
  };

  const handleSaveAsset = (e: React.FormEvent) => {
    e.preventDefault();
    if (!astName.trim()) {
      setErrorMsg('Asset name is required');
      return;
    }
    if (!astCatId) {
      setErrorMsg('Please assign a category for the asset');
      return;
    }

    if (editingAsset) {
      onEditAsset(editingAsset.id, {
        name: astName,
        categoryId: astCatId,
        currency: astCurrency,
        description: astDesc,
      });
    } else {
      onAddAsset({
        name: astName,
        categoryId: astCatId,
        currency: astCurrency,
        description: astDesc,
      });
    }
    setIsAssetModalOpen(false);
  };

  return (
    <div className="space-y-8 mb-12">
      
      {/* Overview Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-50 flex items-center gap-2">
            <Shield className="w-5 h-5 text-emerald-400" />
            3-Level Asset & Risk Hierarchy Management
          </h2>
          <p className="text-xs text-slate-400 mt-1 max-w-2xl">
            <strong>Level 3 (Risk Level)</strong> &rarr; <strong>Level 2 (Categories)</strong> &rarr; <strong>Level 1 (Assets)</strong>. 
            Assets are grouped into categories, and each category defines the asset risk exposure.
          </p>
        </div>

        <div className="flex items-center space-x-2 w-full sm:w-auto justify-end">
          <button
            onClick={() => handleOpenCatModal()}
            className="flex items-center gap-1.5 text-xs font-semibold text-slate-100 bg-slate-800 hover:bg-slate-700 px-3.5 py-2 rounded-xl border border-slate-700 transition-all"
          >
            <Plus className="w-3.5 h-3.5 text-blue-400" />
            <span>Add Category</span>
          </button>

          <button
            onClick={() => handleOpenAssetModal()}
            className="flex items-center gap-1.5 text-xs font-bold text-slate-950 bg-emerald-400 hover:bg-emerald-300 px-4 py-2 rounded-xl shadow-md shadow-emerald-500/20 transition-all"
          >
            <Plus className="w-4 h-4 stroke-[3]" />
            <span>Add Asset</span>
          </button>
        </div>
      </div>

      {/* Level 3: Risk Level Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {(['Low', 'Medium', 'High'] as RiskLevel[]).map((risk) => {
          const matchedCategories = categories.filter((c) => c.riskLevel === risk);
          const matchedAssets = assets.filter((a) => {
            const cat = categories.find((c) => c.id === a.categoryId);
            return cat?.riskLevel === risk;
          });

          return (
            <div
              key={risk}
              className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 shadow-sm relative overflow-hidden"
            >
              <div
                className="absolute top-0 left-0 right-0 h-1"
                style={{ backgroundColor: getRiskLevelColor(risk) }}
              />
              <div className="flex items-center justify-between mb-2">
                <span className={`px-2.5 py-1 text-xs font-bold rounded-lg border ${getRiskLevelBadgeClass(risk)}`}>
                  {risk} Risk Level
                </span>
                <span className="text-xs text-slate-400 font-mono">
                  {matchedCategories.length} Categories · {matchedAssets.length} Assets
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-2">
                {risk === 'Low' && 'Principal preservation, cash reserves, high stability.'}
                {risk === 'Medium' && 'Balanced growth, index funds, real estate, commodities.'}
                {risk === 'High' && 'Capital appreciation, crypto assets, growth tech equities.'}
              </p>
            </div>
          );
        })}
      </div>

      {/* Level 2 & 1 Tree View */}
      <div className="space-y-4">
        <h3 className="text-sm font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
          <Tag className="w-4 h-4 text-emerald-400" />
          Categories & Assets
        </h3>

        <div className="grid grid-cols-1 gap-4">
          {categories.map((cat) => {
            const catAssets = assets.filter((a) => a.categoryId === cat.id);

            return (
              <div
                key={cat.id}
                className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-sm hover:border-slate-700/80 transition-all space-y-3"
              >
                {/* Category Header */}
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 border-b border-slate-800/80 pb-3">
                  <div className="flex items-center space-x-3">
                    <span
                      className="w-3.5 h-3.5 rounded-full shrink-0 shadow-sm"
                      style={{ backgroundColor: cat.color }}
                    />
                    <div>
                      <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                        <h4 className="text-base font-bold text-slate-100">{cat.name}</h4>
                        <span className={`px-2 py-0.5 text-[10px] font-semibold rounded border ${getRiskLevelBadgeClass(cat.riskLevel)}`}>
                          {cat.riskLevel} Risk
                        </span>
                        {typeof cat.targetPercent === 'number' && cat.targetPercent > 0 && (
                          <span className="px-2 py-0.5 text-[10px] font-semibold rounded bg-slate-800 text-emerald-400 border border-emerald-500/30 font-mono">
                            Target: {cat.targetPercent}%
                          </span>
                        )}
                      </div>
                      {cat.description && (
                        <p className="text-xs text-slate-400 mt-0.5">{cat.description}</p>
                      )}
                    </div>
                  </div>

                  {/* Category Actions */}
                  <div className="flex items-center space-x-2 self-end sm:self-auto">
                    <button
                      onClick={() => handleOpenCatModal(cat)}
                      className="flex items-center gap-1 text-xs text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 px-2.5 py-1.5 rounded-lg border border-slate-700 transition-colors"
                    >
                      <Edit className="w-3 h-3 text-blue-400" />
                      <span>Edit Category</span>
                    </button>
                    <button
                      onClick={() => handleDeleteCategoryAttempt(cat)}
                      className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded-lg transition-colors"
                      title="Delete category"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Linked Assets List */}
                <div className="pl-2 sm:pl-4">
                  <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block mb-2">
                    Assets inside {cat.name} ({catAssets.length}):
                  </span>

                  {catAssets.length === 0 ? (
                    <p className="text-xs text-slate-500 italic py-2">
                      No assets in this category yet. Click "Add Asset" to link one.
                    </p>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
                      {catAssets.map((ast) => (
                        <div
                          key={ast.id}
                          className="flex items-center justify-between p-2.5 rounded-xl bg-slate-950/60 border border-slate-800/80 hover:border-slate-700 transition-all text-xs"
                        >
                          <div className="flex items-center space-x-2 min-w-0">
                            <Coins className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                            <div className="truncate">
                              <span className="font-semibold text-slate-200 block truncate">
                                {ast.name}
                              </span>
                              <span className="text-[10px] text-slate-500 block">
                                Currency: {ast.currency || 'Base'}
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center space-x-1 shrink-0 ml-2">
                            <button
                              onClick={() => handleOpenAssetModal(ast)}
                              className="p-1 text-slate-400 hover:text-white hover:bg-slate-800 rounded transition-colors"
                            >
                              <Edit className="w-3 h-3" />
                            </button>
                            <button
                              onClick={() => handleDeleteAssetAttempt(ast)}
                              className="p-1 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded transition-colors"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

              </div>
            );
          })}
        </div>
      </div>

      {/* ---------------------------------------------------- */}
      {/* CATEGORY MODAL */}
      {/* ---------------------------------------------------- */}
      {isCategoryModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4 text-xs">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-bold text-base text-slate-100 flex items-center gap-2">
                <Tag className="w-4 h-4 text-blue-400" />
                {editingCategory ? 'Edit Category' : 'Add New Category'}
              </h3>
              <button onClick={() => setIsCategoryModalOpen(false)} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            {errorMsg && (
              <div className="p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400">
                {errorMsg}
              </div>
            )}

            <form onSubmit={handleSaveCategory} className="space-y-4">
              <div>
                <label className="block text-slate-400 font-semibold mb-1">Category Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. US Stocks, Crypto, Real Estate"
                  value={catName}
                  onChange={(e) => setCatName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 text-slate-100 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-slate-400 font-semibold mb-1">Tied Risk Level</label>
                <select
                  value={catRisk}
                  onChange={(e) => setCatRisk(e.target.value as RiskLevel)}
                  className="w-full bg-slate-950 border border-slate-700 text-slate-100 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-emerald-500"
                >
                  <option value="Low">Low Risk</option>
                  <option value="Medium">Medium Risk</option>
                  <option value="High">High Risk</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-400 font-semibold mb-1">Chart Tag Color</label>
                <div className="flex flex-wrap gap-2 mb-2">
                  {colorPalette.map((col) => (
                    <button
                      key={col}
                      type="button"
                      onClick={() => setCatColor(col)}
                      className={`w-6 h-6 rounded-full border-2 transition-transform ${
                        catColor === col ? 'scale-110 border-white shadow-md' : 'border-transparent hover:scale-105'
                      }`}
                      style={{ backgroundColor: col }}
                    />
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-slate-400 font-semibold mb-1">Target Portfolio Allocation % (Optional)</label>
                <div className="relative">
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="1"
                    placeholder="e.g. 25"
                    value={catTargetPercent || ''}
                    onChange={(e) => setCatTargetPercent(parseFloat(e.target.value) || 0)}
                    className="w-full bg-slate-950 border border-slate-700 text-slate-100 rounded-xl px-3 py-2 pr-8 text-xs font-mono font-bold focus:outline-none focus:border-emerald-500"
                  />
                  <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-slate-500 font-mono text-xs">
                    %
                  </div>
                </div>
                <p className="text-[10px] text-slate-500 mt-1">Used by the Rebalancer to detect drift and plan deposits.</p>
              </div>

              <div>
                <label className="block text-slate-400 font-semibold mb-1">Description (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. Long term equity investments"
                  value={catDesc}
                  onChange={(e) => setCatDesc(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 text-slate-100 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="pt-2 flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setIsCategoryModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-emerald-400 text-slate-950 font-bold"
                >
                  Save Category
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ---------------------------------------------------- */}
      {/* ASSET MODAL */}
      {/* ---------------------------------------------------- */}
      {isAssetModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4 text-xs">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-bold text-base text-slate-100 flex items-center gap-2">
                <Coins className="w-4 h-4 text-emerald-400" />
                {editingAsset ? 'Edit Asset' : 'Add New Asset'}
              </h3>
              <button onClick={() => setIsAssetModalOpen(false)} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            {errorMsg && (
              <div className="p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400">
                {errorMsg}
              </div>
            )}

            <form onSubmit={handleSaveAsset} className="space-y-4">
              <div>
                <label className="block text-slate-400 font-semibold mb-1">Asset Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Bitcoin, Emergency Cash, VOO ETF"
                  value={astName}
                  onChange={(e) => setAstName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 text-slate-100 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-slate-400 font-semibold mb-1">Select Parent Category</label>
                <select
                  value={astCatId}
                  onChange={(e) => setAstCatId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 text-slate-100 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-emerald-500"
                >
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.riskLevel} Risk)
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-400 font-semibold mb-1">Description (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. Cold wallet stored BTC"
                  value={astDesc}
                  onChange={(e) => setAstDesc(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 text-slate-100 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="pt-2 flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setIsAssetModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-emerald-400 text-slate-950 font-bold"
                >
                  Save Asset
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* ---------------------------------------------------- */}
      {/* CATEGORY DELETE CONFIRMATION & REASSIGN MODAL */}
      {/* ---------------------------------------------------- */}
      {categoryToDeleteGuard && (() => {
        const linkedAssets = assets.filter((a) => a.categoryId === categoryToDeleteGuard.id);
        const availableTargets = categories.filter((c) => c.id !== categoryToDeleteGuard.id);

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4 text-xs">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <h3 className="font-bold text-base text-rose-400 flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5" />
                  Delete Category: {categoryToDeleteGuard.name}
                </h3>
                <button onClick={() => setCategoryToDeleteGuard(null)} className="text-slate-400 hover:text-white cursor-pointer">
                  <X className="w-4 h-4" />
                </button>
              </div>

              {linkedAssets.length > 0 ? (
                <div className="space-y-4">
                  <p className="text-slate-300 leading-relaxed">
                    Category <strong className="text-white">{categoryToDeleteGuard.name}</strong> currently has <strong className="text-amber-400">{linkedAssets.length} linked asset(s)</strong> ({linkedAssets.map((a) => a.name).join(', ')}).
                  </p>

                  {availableTargets.length > 0 && (
                    <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 space-y-2.5">
                      <label className="block text-slate-300 font-semibold">Move linked assets to another category:</label>
                      <div className="flex gap-2">
                        <select
                          value={targetCategoryId}
                          onChange={(e) => setTargetCategoryId(e.target.value)}
                          className="flex-1 bg-slate-900 border border-slate-700 text-slate-100 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-amber-500"
                        >
                          {availableTargets.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name} ({c.riskLevel} Risk)
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={handleConfirmCategoryReassign}
                          className="px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold transition-all shrink-0 cursor-pointer"
                        >
                          Reassign & Keep
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="flex items-center justify-between pt-3 border-t border-slate-800">
                    <button
                      type="button"
                      onClick={() => setCategoryToDeleteGuard(null)}
                      className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 font-medium hover:bg-slate-700 transition-colors cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleConfirmDirectCategoryDelete}
                      className="px-4 py-2 rounded-xl bg-rose-500 hover:bg-rose-600 text-white font-bold transition-all cursor-pointer"
                    >
                      Delete Category & Assets
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <p className="text-slate-300 leading-relaxed">
                    Are you sure you want to delete category <strong className="text-white">{categoryToDeleteGuard.name}</strong>?
                  </p>
                  <div className="flex justify-end space-x-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setCategoryToDeleteGuard(null)}
                      className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 font-medium hover:bg-slate-700 transition-colors cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleConfirmDirectCategoryDelete}
                      className="px-4 py-2 rounded-xl bg-rose-500 hover:bg-rose-600 text-white font-bold transition-colors cursor-pointer"
                    >
                      Confirm Delete
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* ---------------------------------------------------- */}
      {/* ASSET DELETE CONFIRMATION & REASSIGN MODAL */}
      {/* ---------------------------------------------------- */}
      {assetToDeleteGuard && (() => {
        const totalVal = records.reduce((sum, r) => sum + (r.assetValues?.[assetToDeleteGuard.id] || 0), 0);
        const availableTargets = assets.filter((a) => a.id !== assetToDeleteGuard.id);

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4 text-xs">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <h3 className="font-bold text-base text-rose-400 flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5" />
                  Delete Asset: {assetToDeleteGuard.name}
                </h3>
                <button onClick={() => setAssetToDeleteGuard(null)} className="text-slate-400 hover:text-white cursor-pointer">
                  <X className="w-4 h-4" />
                </button>
              </div>

              {totalVal > 0 ? (
                <div className="space-y-4">
                  <p className="text-slate-300 leading-relaxed">
                    Asset <strong className="text-white">{assetToDeleteGuard.name}</strong> has recorded spreadsheet data.
                  </p>

                  {availableTargets.length > 0 && (
                    <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 space-y-2.5">
                      <label className="block text-slate-300 font-semibold">Transfer historical records to another asset:</label>
                      <div className="flex gap-2">
                        <select
                          value={targetAssetId}
                          onChange={(e) => setTargetAssetId(e.target.value)}
                          className="flex-1 bg-slate-900 border border-slate-700 text-slate-100 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-amber-500"
                        >
                          {availableTargets.map((a) => {
                            const cat = categories.find((c) => c.id === a.categoryId);
                            return (
                              <option key={a.id} value={a.id}>
                                {a.name} ({cat?.name || 'Uncategorized'})
                              </option>
                            );
                          })}
                        </select>
                        <button
                          type="button"
                          onClick={handleConfirmAssetReassign}
                          className="px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold transition-all shrink-0 cursor-pointer"
                        >
                          Transfer & Keep
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="flex items-center justify-between pt-3 border-t border-slate-800">
                    <button
                      type="button"
                      onClick={() => setAssetToDeleteGuard(null)}
                      className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 font-medium hover:bg-slate-700 transition-colors cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleConfirmDirectAssetDelete}
                      className="px-4 py-2 rounded-xl bg-rose-500 hover:bg-rose-600 text-white font-bold transition-all cursor-pointer"
                    >
                      Delete Asset & Clear Data
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <p className="text-slate-300 leading-relaxed">
                    Are you sure you want to delete asset <strong className="text-white">{assetToDeleteGuard.name}</strong>?
                  </p>
                  <div className="flex justify-end space-x-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setAssetToDeleteGuard(null)}
                      className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 font-medium hover:bg-slate-700 transition-colors cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleConfirmDirectAssetDelete}
                      className="px-4 py-2 rounded-xl bg-rose-500 hover:bg-rose-600 text-white font-bold transition-colors cursor-pointer"
                    >
                      Confirm Delete
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      })()}

    </div>
  );
};
