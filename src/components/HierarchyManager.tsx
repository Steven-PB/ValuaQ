import React, { useState, useMemo } from 'react';
import { 
  Shield, 
  Tag, 
  Coins, 
  Plus, 
  Edit, 
  Trash2, 
  AlertTriangle,
  Check,
  X,
  Search,
  Sparkles,
  Layers,
  Globe,
  TrendingUp,
  Loader2,
  DollarSign
} from 'lucide-react';
import { Category, Asset, RiskLevel, MonthlyRecord } from '../types';
import { getRiskLevelBadgeClass, formatCurrency, parseFormattedNumber } from '../lib/formatters';
import { AVAILABLE_ASSETS_CATALOG, CatalogAssetTemplate } from '../data/availableAssetsCatalog';
import { searchLiveMarketAssets, fetchLiveMarketQuotes, MarketSearchResult } from '../lib/marketPriceEngine';
import { CustomDropdown } from './CustomDropdown';

export function formatOriginalPrice(price?: number, currency: string = 'NTD'): string {
  if (price === undefined || price === null || isNaN(price) || price === 0) {
    return 'Price unavailable';
  }
  const curr = (currency || 'NTD').toUpperCase();
  if (curr === 'NTD' || curr === 'TWD') {
    return `NT$ ${price.toLocaleString(undefined, { minimumFractionDigits: Number.isInteger(price) ? 0 : 2, maximumFractionDigits: 2 })}`;
  }
  if (curr === 'USD') {
    return `$${price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD`;
  }
  if (curr === 'JPY') {
    return `¥${price.toLocaleString(undefined, { maximumFractionDigits: 0 })} JPY`;
  }
  if (curr === 'EUR') {
    return `€${price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} EUR`;
  }
  if (curr === 'GBP') {
    return `£${price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} GBP`;
  }
  return `${price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${curr}`;
}

const POPULAR_BENCHMARKS = [
  { label: 'Gold', ticker: 'GC=F', icon: '🪙', desc: 'Gold Commodity (COMEX)', currency: 'USD' },
  { label: 'Silver', ticker: 'SI=F', icon: '🥈', desc: 'Silver Commodity (COMEX)', currency: 'USD' },
  { label: 'Taiwan 50', ticker: '0050.TW', icon: '🇹🇼', desc: 'Yuanta Taiwan 50 ETF', currency: 'TWD' },
  { label: 'TSMC', ticker: '2330.TW', icon: '🇹🇼', desc: 'Taiwan Semiconductor', currency: 'TWD' },
  { label: 'S&P 500', ticker: 'VOO', icon: '🇺🇸', desc: 'Vanguard S&P 500', currency: 'USD' },
  { label: 'Nasdaq 100', ticker: 'QQQ', icon: '🇺🇸', desc: 'Invesco QQQ', currency: 'USD' },
  { label: 'Bitcoin', ticker: 'BTC-USD', icon: '₿', desc: 'Bitcoin', currency: 'USD' },
];

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
  onAddAssetWithCategory?: (asset: Omit<Asset, 'id'>, newCategory?: Omit<Category, 'id'>) => void;
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
  onAddAssetWithCategory,
}) => {
  // Category Modal State
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [catName, setCatName] = useState('');
  const [catRisk, setCatRisk] = useState<RiskLevel>('Medium');
  const [catColor, setCatColor] = useState('#3b82f6');
  const [catDesc, setCatDesc] = useState('');
  const [catTargetPercent, setCatTargetPercent] = useState<number>(0);

  // Asset Modal State & Catalog Search State
  const [isAssetModalOpen, setIsAssetModalOpen] = useState(false);
  const [assetModalTab, setAssetModalTab] = useState<'catalog' | 'custom'>('catalog');
  const [catalogSearch, setCatalogSearch] = useState('');
  const [selectedCatalogGroup, setSelectedCatalogGroup] = useState<string>('All');
  const [catalogAddSuccessMsg, setCatalogAddSuccessMsg] = useState<string | null>(null);

  // Live Market API Search state
  const [liveSearchResults, setLiveSearchResults] = useState<MarketSearchResult[]>([]);
  const [isSearchingLive, setIsSearchingLive] = useState(false);
  const [liveQuotesMap, setLiveQuotesMap] = useState<Record<string, { price: number; priceNTD: number; currency?: string }>>({});

  // Debounced live market search effect
  React.useEffect(() => {
    const q = catalogSearch.trim();
    if (q.length < 2) {
      setLiveSearchResults([]);
      setIsSearchingLive(false);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearchingLive(true);
      try {
        const results = await searchLiveMarketAssets(q);
        setLiveSearchResults(results);

        const syms = results.map((r) => r.symbol).slice(0, 10);
        if (syms.length > 0) {
          const quotes = await fetchLiveMarketQuotes(syms);
          setLiveQuotesMap((prev) => ({ ...prev, ...quotes }));
        }
      } catch (err) {
        console.warn('Live asset search error:', err);
      } finally {
        setIsSearchingLive(false);
      }
    }, 280);

    return () => clearTimeout(timer);
  }, [catalogSearch]);

  // Auto-fetch live market quotes every 1 second for catalog templates and current portfolio assets
  React.useEffect(() => {
    let isCancelled = false;
    let timerId: NodeJS.Timeout | null = null;
    let isFetching = false;

    const fetchQuotes = async () => {
      if (isCancelled || isFetching) return;
      const catalogTickers = isAssetModalOpen
        ? AVAILABLE_ASSETS_CATALOG
            .map((i) => i.tickerSymbol)
            .filter((sym): sym is string => !!sym && !sym.startsWith('NTD-') && sym !== 'TWD' && sym !== 'USD')
        : [];
      const portfolioTickers = assets
        .map((a) => a.tickerSymbol)
        .filter((sym): sym is string => !!sym && !sym.startsWith('NTD-') && sym !== 'TWD' && sym !== 'USD');
      const combined = Array.from(new Set([...catalogTickers, ...portfolioTickers]));
      
      if (combined.length === 0) {
        timerId = setTimeout(fetchQuotes, 1000);
        return;
      }

      isFetching = true;
      try {
        const quotes = await fetchLiveMarketQuotes(combined);
        if (!isCancelled && quotes) {
          setLiveQuotesMap((prev) => ({ ...prev, ...quotes }));
        }
      } catch (err) {
        console.warn('Live quotes 1s poll error in HierarchyManager:', err);
      } finally {
        isFetching = false;
        if (!isCancelled) {
          timerId = setTimeout(fetchQuotes, 1000);
        }
      }
    };

    fetchQuotes();
    return () => {
      isCancelled = true;
      if (timerId) clearTimeout(timerId);
    };
  }, [isAssetModalOpen, assets]);

  // Custom Asset Form State
  const [editingAsset, setEditingAsset] = useState<Asset | null>(null);
  const [astName, setAstName] = useState('');
  const [astCatId, setAstCatId] = useState('');
  const [astCurrency, setAstCurrency] = useState('NTD');
  const [astDesc, setAstDesc] = useState('');
  const [astIsCash, setAstIsCash] = useState(false);
  const [astIsEmergencyFund, setAstIsEmergencyFund] = useState(false);
  const [astTicker, setAstTicker] = useState('');
  const [astPrice, setAstPrice] = useState('');
  const [customPricingMode, setCustomPricingMode] = useState<'cash' | 'benchmark' | 'manual'>('benchmark');
  
  // Custom Asset Benchmark Live Search
  const [benchmarkSearchQuery, setBenchmarkSearchQuery] = useState('');
  const [benchmarkSearchResults, setBenchmarkSearchResults] = useState<MarketSearchResult[]>([]);
  const [isSearchingBenchmark, setIsSearchingBenchmark] = useState(false);
  const [selectedBenchmarkDetails, setSelectedBenchmarkDetails] = useState<{ symbol: string; name: string; exchange: string; currency?: string } | null>(null);

  // Debounced search for benchmark to follow in Custom Asset form
  React.useEffect(() => {
    const q = benchmarkSearchQuery.trim();
    if (q.length < 2) {
      setBenchmarkSearchResults([]);
      setIsSearchingBenchmark(false);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearchingBenchmark(true);
      try {
        const results = await searchLiveMarketAssets(q);
        setBenchmarkSearchResults(results);
      } catch (err) {
        console.warn('Benchmark search failed:', err);
      } finally {
        setIsSearchingBenchmark(false);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [benchmarkSearchQuery]);

  const handlePickBenchmark = (sym: string, name?: string, exchange?: string, currency?: string) => {
    setAstTicker(sym);
    setSelectedBenchmarkDetails({
      symbol: sym,
      name: name || sym,
      exchange: exchange || 'Market Asset',
      currency: currency || (sym.endsWith('.TW') || sym.endsWith('.TWO') ? 'TWD' : 'USD')
    });
    setBenchmarkSearchQuery('');
    setBenchmarkSearchResults([]);
    if (!astName.trim() && name) {
      setAstName(name);
    }
    fetchLiveMarketQuotes([sym]).then((quotes) => {
      if (quotes[sym]) {
        setLiveQuotesMap((prev) => ({ ...prev, ...quotes }));
      }
    });
  };

  const handleClearBenchmark = () => {
    setAstTicker('');
    setSelectedBenchmarkDetails(null);
    setBenchmarkSearchQuery('');
    setBenchmarkSearchResults([]);
  };

  // Reassign Guard Modals State
  const [categoryToDeleteGuard, setCategoryToDeleteGuard] = useState<Category | null>(null);
  const [targetCategoryId, setTargetCategoryId] = useState<string>('');
  const [assetToDeleteGuard, setAssetToDeleteGuard] = useState<Asset | null>(null);
  const [targetAssetId, setTargetAssetId] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState('');

  // Catalog groups list
  const catalogGroups = [
    'All',
    'Cash & Deposits',
    'Taiwan Equities',
    'US Stocks & ETFs',
    'Cryptocurrencies',
    'Precious Metals',
    'Fixed Income & Bonds'
  ];

  // Filter catalog items by search and group
  const filteredCatalog = useMemo(() => {
    return AVAILABLE_ASSETS_CATALOG.filter((item) => {
      if (selectedCatalogGroup !== 'All' && item.catalogGroup !== selectedCatalogGroup) {
        return false;
      }
      if (catalogSearch.trim()) {
        const q = catalogSearch.toLowerCase().trim();
        const nameMatch = item.name.toLowerCase().includes(q);
        const tickerMatch = item.tickerSymbol ? item.tickerSymbol.toLowerCase().includes(q) : false;
        const catMatch = item.categoryName.toLowerCase().includes(q);
        const groupMatch = item.catalogGroup.toLowerCase().includes(q);
        if (!nameMatch && !tickerMatch && !catMatch && !groupMatch) {
          return false;
        }
      }
      return true;
    });
  }, [catalogSearch, selectedCatalogGroup]);

  // Filter live search results by selected catalog group
  const filteredLiveSearchResults = useMemo(() => {
    if (selectedCatalogGroup === 'All') return liveSearchResults;
    return liveSearchResults.filter((r) => {
      const sym = r.symbol.toUpperCase();
      const cat = r.categoryName;
      const type = (r.quoteType || '').toUpperCase();
      const exch = (r.exchange || '').toUpperCase();

      if (selectedCatalogGroup === 'Cash & Deposits') {
        return type === 'CURRENCY' || sym === 'TWD=X' || cat === 'Cash & Deposits';
      }
      if (selectedCatalogGroup === 'Taiwan Equities') {
        return cat === 'Taiwan Equities' || sym.endsWith('.TW') || sym.endsWith('.TWO') || exch.includes('TAIWAN') || exch.includes('TAI');
      }
      if (selectedCatalogGroup === 'US Stocks & ETFs') {
        return (cat === 'US Stocks & ETFs' || type === 'EQUITY' || type === 'ETF') && !sym.endsWith('.TW') && !sym.endsWith('.TWO');
      }
      if (selectedCatalogGroup === 'Cryptocurrencies') {
        return cat === 'Cryptocurrencies' || type === 'CRYPTOCURRENCY' || sym.includes('-USD') || exch.includes('COINGECKO');
      }
      if (selectedCatalogGroup === 'Precious Metals') {
        return cat === 'Precious Metals' || sym === 'GC=F' || sym === 'SI=F' || type === 'COMMODITY';
      }
      if (selectedCatalogGroup === 'Fixed Income & Bonds') {
        return cat === 'Fixed Income & Bonds' || sym.includes('BND') || sym.includes('TLT') || sym.includes('IEF');
      }
      return cat === selectedCatalogGroup;
    });
  }, [liveSearchResults, selectedCatalogGroup]);

  // Set of added asset names / tickers to mark "Added"
  const addedAssetKeys = useMemo(() => {
    const set = new Set<string>();
    assets.forEach((a) => {
      set.add(a.name.toLowerCase());
      if (a.tickerSymbol) set.add(a.tickerSymbol.toLowerCase());
    });
    return set;
  }, [assets]);

  // Handle adding asset from available catalog
  const handleAddFromCatalog = (template: CatalogAssetTemplate) => {
    setCatalogAddSuccessMsg(null);

    // Find if a matching category already exists
    const existingCat = categories.find(
      (c) => c.name.toLowerCase() === template.categoryName.toLowerCase()
    );

    if (existingCat) {
      onAddAsset({
        name: template.name,
        categoryId: existingCat.id,
        currency: template.currency || 'NTD',
        description: template.description,
        isCash: template.isCash,
        isEmergencyFund: template.isEmergencyFund,
        tickerSymbol: template.tickerSymbol,
        currentPrice: template.defaultPriceNTD || 1,
      });
    } else {
      if (onAddAssetWithCategory) {
        onAddAssetWithCategory(
          {
            name: template.name,
            categoryId: '',
            currency: template.currency || 'NTD',
            description: template.description,
            isCash: template.isCash,
            isEmergencyFund: template.isEmergencyFund,
            tickerSymbol: template.tickerSymbol,
            currentPrice: template.defaultPriceNTD || 1,
          },
          {
            name: template.categoryName,
            riskLevel: template.riskLevel,
            color: template.categoryColor,
            isCashCategory: template.isCashCategory,
            isEmergencyFundCategory: template.isEmergencyFund,
            description: `${template.categoryName} category`,
          }
        );
      } else {
        onAddCategory({
          name: template.categoryName,
          riskLevel: template.riskLevel,
          color: template.categoryColor,
          isCashCategory: template.isCashCategory,
          isEmergencyFundCategory: template.isEmergencyFund,
        });
        onAddAsset({
          name: template.name,
          categoryId: '',
          currency: template.currency || 'NTD',
          description: template.description,
          isCash: template.isCash,
          isEmergencyFund: template.isEmergencyFund,
          tickerSymbol: template.tickerSymbol,
          currentPrice: template.defaultPriceNTD || 1,
        });
      }
    }

    setCatalogAddSuccessMsg(`Added "${template.name}" to portfolio!`);
    setTimeout(() => {
      setCatalogAddSuccessMsg(null);
    }, 2500);
  };

  // Handle adding asset from live financial market search
  const handleAddFromLiveMarket = (item: MarketSearchResult) => {
    setCatalogAddSuccessMsg(null);

    const existingCat = categories.find(
      (c) => c.name.toLowerCase() === item.categoryName.toLowerCase()
    );

    const defaultItemPrice = item.livePriceNTD || (liveQuotesMap[item.symbol]?.priceNTD) || (item.currency === 'USD' ? 32.5 : 1);

    if (existingCat) {
      onAddAsset({
        name: item.name,
        categoryId: existingCat.id,
        currency: item.currency || 'NTD',
        description: `${item.exchange} · ${item.quoteType}`,
        isCash: false,
        tickerSymbol: item.symbol,
        currentPrice: defaultItemPrice,
      });
    } else {
      if (onAddAssetWithCategory) {
        onAddAssetWithCategory(
          {
            name: item.name,
            categoryId: '',
            currency: item.currency || 'NTD',
            description: `${item.exchange} · ${item.quoteType}`,
            isCash: false,
            tickerSymbol: item.symbol,
            currentPrice: defaultItemPrice,
          },
          {
            name: item.categoryName,
            riskLevel: item.riskLevel,
            color: item.categoryColor,
            isCashCategory: false,
            description: `${item.categoryName} category`,
          }
        );
      } else {
        onAddCategory({
          name: item.categoryName,
          riskLevel: item.riskLevel,
          color: item.categoryColor,
          isCashCategory: false,
        });
        onAddAsset({
          name: item.name,
          categoryId: '',
          currency: item.currency || 'NTD',
          description: `${item.exchange} · ${item.quoteType}`,
          isCash: false,
          tickerSymbol: item.symbol,
          currentPrice: defaultItemPrice,
        });
      }
    }

    setCatalogAddSuccessMsg(`Added "${item.name}" [${item.symbol}] to portfolio!`);
    setTimeout(() => {
      setCatalogAddSuccessMsg(null);
    }, 2500);
  };

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
    setCatalogAddSuccessMsg(null);
    setBenchmarkSearchQuery('');
    setBenchmarkSearchResults([]);
    if (ast) {
      setEditingAsset(ast);
      setAssetModalTab('custom');
      setAstName(ast.name);
      setAstCatId(ast.categoryId);
      const curr = (ast.currency || 'NTD').toUpperCase();
      setAstCurrency(curr);
      setAstDesc(ast.description || '');
      setAstIsCash(!!ast.isCash);
      setAstIsEmergencyFund(!!ast.isEmergencyFund);
      setAstTicker(ast.tickerSymbol || '');
      
      let initPriceStr = '';
      if (ast.currentPrice && ast.currentPrice > 0) {
        initPriceStr = String(ast.currentPrice);
      } else if (curr === 'USD' || curr === 'USDT' || curr === 'USDC') {
        initPriceStr = '32.5';
      } else if (curr === 'JPY') {
        initPriceStr = '0.22';
      } else if (curr === 'EUR') {
        initPriceStr = '35.0';
      } else {
        initPriceStr = '1';
      }
      setAstPrice(initPriceStr);

      if (ast.isCash) {
        setCustomPricingMode('cash');
        setSelectedBenchmarkDetails(null);
      } else if (ast.tickerSymbol) {
        setCustomPricingMode('benchmark');
        setSelectedBenchmarkDetails({
          symbol: ast.tickerSymbol,
          name: ast.name,
          exchange: 'Market Benchmark',
          currency: ast.currency || 'USD'
        });
        fetchLiveMarketQuotes([ast.tickerSymbol]).then((quotes) => {
          if (quotes[ast.tickerSymbol]) {
            setLiveQuotesMap((prev) => ({ ...prev, ...quotes }));
          }
        });
      } else {
        setCustomPricingMode('manual');
        setSelectedBenchmarkDetails(null);
      }
    } else {
      setEditingAsset(null);
      setAssetModalTab('catalog');
      setCatalogSearch('');
      setSelectedCatalogGroup('All');
      setAstName('');
      setAstCatId(categories[0]?.id || '');
      setAstCurrency('NTD');
      setAstDesc('');
      setAstIsCash(false);
      setAstIsEmergencyFund(false);
      setAstTicker('');
      setAstPrice('1');
      setCustomPricingMode('benchmark');
      setSelectedBenchmarkDetails(null);
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
      setErrorMsg('Please select or create a parent category for the asset');
      return;
    }

    const isCashAsset = customPricingMode === 'cash';
    const isEmergencyFundAssetFlag = isCashAsset && astIsEmergencyFund;
    const ticker = customPricingMode === 'benchmark' ? astTicker.trim() : undefined;
    const curr = (astCurrency || 'NTD').toUpperCase();

    let finalPrice = parseFormattedNumber(astPrice);
    if (finalPrice <= 0) {
      if (curr === 'USD' || curr === 'USDT' || curr === 'USDC') {
        finalPrice = 32.5;
      } else if (curr === 'JPY') {
        finalPrice = 0.22;
      } else if (curr === 'EUR') {
        finalPrice = 35.0;
      } else {
        finalPrice = 1;
      }
    }

    if (editingAsset) {
      onEditAsset(editingAsset.id, {
        name: astName,
        categoryId: astCatId,
        currency: astCurrency,
        description: astDesc,
        isCash: isCashAsset,
        isEmergencyFund: isEmergencyFundAssetFlag,
        tickerSymbol: ticker || undefined,
        currentPrice: finalPrice,
      });
    } else {
      onAddAsset({
        name: astName,
        categoryId: astCatId,
        currency: astCurrency,
        description: astDesc,
        isCash: isCashAsset,
        isEmergencyFund: isEmergencyFundAssetFlag,
        tickerSymbol: ticker || undefined,
        currentPrice: finalPrice,
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
            <span>3-Level Asset & Risk Hierarchy Management</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1 max-w-2xl">
            Choose assets from the pre-configured catalog (Taiwan stocks, US ETFs, crypto, gold, cash) or define custom assets.
          </p>
        </div>

        <div className="flex items-center space-x-2 w-full sm:w-auto justify-end">
          <button
            onClick={() => handleOpenCatModal()}
            className="flex items-center gap-1.5 text-xs font-semibold text-slate-100 bg-slate-800 hover:bg-slate-700 px-3.5 py-2 rounded-xl border border-slate-700 transition-all cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5 text-blue-400" />
            <span>Add Category</span>
          </button>

          <button
            onClick={() => handleOpenAssetModal()}
            className="flex items-center gap-1.5 text-xs font-bold text-slate-950 bg-emerald-400 hover:bg-emerald-300 px-4 py-2 rounded-xl shadow-md shadow-emerald-500/20 transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4 stroke-[3]" />
            <span>Add Asset (Catalog)</span>
          </button>
        </div>
      </div>

      {/* Level 3: Risk Level Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {(['Low', 'Medium', 'High'] as RiskLevel[]).map((risk) => {
          const matchedCategories = categories.filter((c) => c.riskLevel === risk);
          const matchedCatIds = new Set(matchedCategories.map((c) => c.id));
          const matchedAssets = assets.filter((a) => matchedCatIds.has(a.categoryId));

          return (
            <div
              key={risk}
              className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-sm space-y-3"
            >
              <div className="flex items-center justify-between">
                <span className={`px-2.5 py-1 rounded-full text-xs font-bold border ${getRiskLevelBadgeClass(risk)}`}>
                  {risk} Risk
                </span>
                <span className="text-xs text-slate-400 font-mono">
                  {matchedCategories.length} Categories &bull; {matchedAssets.length} Assets
                </span>
              </div>

              <div className="text-xs text-slate-400">
                {risk === 'Low' && 'Liquid cash, bank savings, and sovereign treasury debt.'}
                {risk === 'Medium' && 'Gold, precious metals, high dividend funds & commodities.'}
                {risk === 'High' && 'Global growth equities, tech shares & cryptocurrencies.'}
              </div>
            </div>
          );
        })}
      </div>

      {/* Level 2 & 1: Categories and Linked Assets */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2">
            <Layers className="w-4 h-4 text-emerald-400" />
            <span>Configured Categories & Assets</span>
          </h3>
          <span className="text-xs text-slate-400">
            Total {categories.length} Categories &bull; {assets.length} Assets
          </span>
        </div>

        {categories.length === 0 ? (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-10 text-center space-y-3">
            <div className="w-12 h-12 rounded-full bg-slate-800 text-slate-400 flex items-center justify-center mx-auto">
              <Coins className="w-6 h-6" />
            </div>
            <h4 className="text-sm font-bold text-slate-200">No assets or categories configured yet</h4>
            <p className="text-xs text-slate-400 max-w-md mx-auto">
              ValuaQ is starting fresh from 0. Click below to browse and select available assets from our standard catalog, or create custom assets!
            </p>
            <button
              onClick={() => handleOpenAssetModal()}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-400 hover:bg-emerald-300 text-slate-950 text-xs font-bold rounded-xl shadow-md shadow-emerald-500/20 transition-all cursor-pointer"
            >
              <Search className="w-3.5 h-3.5" />
              <span>Browse Available Asset Catalog</span>
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {categories.map((cat) => {
              const catAssets = assets.filter((a) => a.categoryId === cat.id);

              return (
                <div
                  key={cat.id}
                  className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 shadow-sm space-y-4"
                >
                  {/* Category Header */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
                    <div className="flex items-center space-x-2.5">
                      <span
                        className="w-3.5 h-3.5 rounded-full shrink-0"
                        style={{ backgroundColor: cat.color || '#3b82f6' }}
                      />
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="text-sm font-bold text-slate-100">{cat.name}</h4>
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${getRiskLevelBadgeClass(cat.riskLevel)}`}>
                            {cat.riskLevel} Risk
                          </span>
                          {cat.isCashCategory && (
                            <span className="px-1.5 py-0.5 rounded text-[9px] bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 uppercase font-mono font-bold">
                              Cash Category
                            </span>
                          )}
                          {cat.isEmergencyFundCategory && (
                            <span className="px-1.5 py-0.5 rounded text-[9px] bg-amber-500/20 text-amber-400 border border-amber-500/40 uppercase font-mono font-bold">
                              Safety Net (Excluded from P&amp;L)
                            </span>
                          )}
                        </div>
                        {cat.description && (
                          <p className="text-[11px] text-slate-400 mt-0.5">{cat.description}</p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center space-x-1.5 shrink-0">
                      <button
                        onClick={() => handleOpenCatModal(cat)}
                        className="flex items-center space-x-1 px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs transition-colors cursor-pointer"
                      >
                        <Edit className="w-3 h-3 text-blue-400" />
                        <span>Edit</span>
                      </button>
                      <button
                        onClick={() => handleDeleteCategoryAttempt(cat)}
                        className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                        title="Delete category"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Linked Assets List */}
                  <div className="pl-1 sm:pl-2">
                    {catAssets.length === 0 ? (
                      <p className="text-xs text-slate-500 italic py-2">
                        No assets in this category yet. Click "Add Asset" to link one.
                      </p>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
                        {catAssets.map((ast) => (
                          <div
                            key={ast.id}
                            className={`flex items-center justify-between p-3 rounded-xl bg-slate-950/60 border transition-all text-xs ${
                              ast.isEmergencyFund
                                ? 'border-amber-500/30 hover:border-amber-500/50'
                                : 'border-slate-800/80 hover:border-slate-700'
                            }`}
                          >
                            <div className="flex items-center space-x-2 min-w-0">
                              <Coins className={`w-3.5 h-3.5 shrink-0 ${ast.isEmergencyFund ? 'text-amber-400' : 'text-emerald-400'}`} />
                              <div className="truncate">
                                <div className="flex items-center gap-1.5 truncate">
                                  <span className="font-semibold text-slate-200 block truncate">
                                    {ast.name}
                                  </span>
                                  {ast.isEmergencyFund ? (
                                    <span className="text-[9px] px-1 py-0.2 rounded bg-amber-500/20 text-amber-400 border border-amber-500/40 uppercase font-mono font-bold">
                                      Emergency Fund
                                    </span>
                                  ) : ast.isCash ? (
                                    <span className="text-[9px] px-1 py-0.2 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 uppercase font-mono font-bold">
                                      Cash
                                    </span>
                                  ) : null}
                                </div>
                                <div className="text-[10px] text-slate-500 flex items-center gap-1.5 mt-0.5">
                                  {ast.isCash ? (
                                    <span className="text-emerald-400 font-mono font-medium">
                                      {formatOriginalPrice(1, ast.currency || 'NTD')} Cash
                                    </span>
                                  ) : ast.tickerSymbol ? (
                                    <span className="font-mono text-emerald-400 font-medium flex items-center gap-1">
                                      <TrendingUp className="w-2.5 h-2.5" />
                                      {liveQuotesMap[ast.tickerSymbol]?.price
                                        ? formatOriginalPrice(liveQuotesMap[ast.tickerSymbol].price, liveQuotesMap[ast.tickerSymbol].currency || ast.currency || 'USD')
                                        : ast.currentPrice && ast.currentPrice > 1
                                        ? formatOriginalPrice(ast.currentPrice, ast.currency || 'NTD')
                                        : ast.tickerSymbol}
                                    </span>
                                  ) : (
                                    <span className="text-slate-400">Self-Managed</span>
                                  )}
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center space-x-1 shrink-0 ml-2">
                              <button
                                onClick={() => handleOpenAssetModal(ast)}
                                className="p-1 text-slate-400 hover:text-white hover:bg-slate-800 rounded transition-colors cursor-pointer"
                                title="Edit asset"
                              >
                                <Edit className="w-3 h-3" />
                              </button>
                              <button
                                onClick={() => handleDeleteAssetAttempt(ast)}
                                className="p-1 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded transition-colors cursor-pointer"
                                title="Delete asset"
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
        )}
      </div>

      {/* ---------------------------------------------------- */}
      {/* ASSET CATALOG SELECTOR & CUSTOM CREATION MODAL */}
      {/* ---------------------------------------------------- */}
      {isAssetModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden">
            
            {/* Modal Header */}
            <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950/60 shrink-0">
              <div>
                <h3 className="font-bold text-base text-slate-100 flex items-center gap-2">
                  <Coins className="w-4 h-4 text-emerald-400" />
                  <span>{editingAsset ? 'Edit Asset' : 'Add Asset to Portfolio'}</span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Select from pre-configured market assets or create your custom holding.
                </p>
              </div>
              <button
                onClick={() => setIsAssetModalOpen(false)}
                className="text-slate-400 hover:text-white cursor-pointer text-xl leading-none"
              >
                &times;
              </button>
            </div>

            {/* Success toast if added from catalog */}
            {catalogAddSuccessMsg && (
              <div className="bg-emerald-950/80 border-b border-emerald-500/30 px-5 py-2 text-xs text-emerald-300 font-semibold flex items-center gap-1.5 shrink-0">
                <Check className="w-3.5 h-3.5 text-emerald-400" />
                <span>{catalogAddSuccessMsg}</span>
              </div>
            )}

            {/* Tabs (Catalog vs Custom) - Only show if creating new asset */}
            {!editingAsset && (
              <div className="flex border-b border-slate-800 bg-slate-950/40 px-5 pt-3 gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setAssetModalTab('catalog')}
                  className={`pb-2.5 text-xs font-bold transition-all border-b-2 flex items-center gap-1.5 cursor-pointer ${
                    assetModalTab === 'catalog'
                      ? 'border-emerald-400 text-emerald-400 font-bold'
                      : 'border-transparent text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Search className="w-3.5 h-3.5" />
                  <span>Available Asset Catalog ({AVAILABLE_ASSETS_CATALOG.length})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setAssetModalTab('custom')}
                  className={`pb-2.5 text-xs font-bold transition-all border-b-2 flex items-center gap-1.5 cursor-pointer ${
                    assetModalTab === 'custom'
                      ? 'border-emerald-400 text-emerald-400 font-bold'
                      : 'border-transparent text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Create Custom Asset</span>
                </button>
              </div>
            )}

            {/* TAB 1: Searchable Available Asset Catalog */}
            {assetModalTab === 'catalog' && !editingAsset ? (
              <div className="flex-1 flex flex-col overflow-hidden p-4 sm:p-5 space-y-3.5">
                
                {/* Search Bar */}
                <div className="relative shrink-0">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="Search any global asset or ticker (e.g. 2330, NVDA, AAPL, BTC, Gold, VOO, 0050)..."
                    value={catalogSearch}
                    onChange={(e) => setCatalogSearch(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 text-slate-100 pl-9 pr-9 py-2 rounded-xl text-xs focus:outline-none focus:border-emerald-500"
                    autoFocus
                  />
                  {isSearchingLive ? (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2">
                      <Loader2 className="w-3.5 h-3.5 text-emerald-400 animate-spin" />
                    </div>
                  ) : catalogSearch ? (
                    <button
                      onClick={() => setCatalogSearch('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 text-xs"
                    >
                      &times;
                    </button>
                  ) : null}
                </div>

                {/* Live Market API Status Notice */}
                <div className="flex items-center justify-between text-[11px] px-1 text-slate-400 shrink-0">
                  <div className="flex items-center gap-1.5 text-emerald-400 font-semibold">
                    <Globe className="w-3.5 h-3.5 shrink-0" />
                    <span>Real-Time Market API Feed Active (Taiwan TWSE, US Stocks, Crypto, Gold & FX)</span>
                  </div>
                  {isSearchingLive && (
                    <span className="text-[10px] text-emerald-300 animate-pulse">Querying live exchanges...</span>
                  )}
                </div>

                {/* Catalog Group Filters */}
                <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-1 shrink-0">
                  {catalogGroups.map((grp) => (
                    <button
                      key={grp}
                      type="button"
                      onClick={() => setSelectedCatalogGroup(grp)}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold whitespace-nowrap transition-all cursor-pointer ${
                        selectedCatalogGroup === grp
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                          : 'bg-slate-950 text-slate-400 hover:text-slate-200 border border-slate-800'
                      }`}
                    >
                      {grp}
                    </button>
                  ))}
                </div>

                {/* Catalog Asset Cards List */}
                <div className="flex-1 overflow-y-auto pr-1 space-y-3 no-scrollbar">
                  {/* Section A: Live API Search Results */}
                  {liveSearchResults.length > 0 && (
                    <div className="space-y-2 pb-2 border-b border-slate-800/80">
                      {filteredLiveSearchResults.length > 0 ? (
                        <>
                          <div className="flex items-center justify-between text-[11px] font-bold text-emerald-400 px-1">
                            <span className="flex items-center gap-1.5">
                              <TrendingUp className="w-3.5 h-3.5" />
                              Live Financial Market Results {selectedCatalogGroup !== 'All' ? `in ${selectedCatalogGroup}` : ''} ({filteredLiveSearchResults.length})
                            </span>
                            <span className="text-[10px] text-slate-400 font-normal">Real-Time Global Feed</span>
                          </div>

                          {filteredLiveSearchResults.map((result) => {
                            const isAdded =
                              addedAssetKeys.has(result.name.toLowerCase()) ||
                              addedAssetKeys.has(result.symbol.toLowerCase());
                            const quote = liveQuotesMap[result.symbol];

                            return (
                              <div
                                key={result.symbol}
                                className="flex items-center justify-between p-3 rounded-xl bg-slate-900/90 border border-emerald-500/30 hover:border-emerald-500/60 transition-all text-xs"
                              >
                                <div className="flex items-center space-x-2.5 min-w-0 pr-2">
                                  <span
                                    className="w-3 h-3 rounded-full shrink-0"
                                    style={{ backgroundColor: result.categoryColor }}
                                  />
                                  <div className="truncate">
                                    <div className="flex items-center gap-2">
                                      <span className="font-bold text-slate-100 truncate">
                                        {result.name}
                                      </span>
                                      <span className="text-[10px] font-mono font-bold text-emerald-400 bg-emerald-950/40 px-1.5 py-0.5 rounded border border-emerald-500/30">
                                        {result.symbol}
                                      </span>
                                      <span className="text-[9px] text-slate-400 bg-slate-800 px-1 py-0.2 rounded">
                                        {result.exchange}
                                      </span>
                                    </div>
                                    <div className="text-[10px] text-slate-400 flex items-center gap-2 mt-0.5">
                                      <span>{result.categoryName}</span>
                                      <span>&bull;</span>
                                      <span className="text-slate-500">{result.riskLevel} Risk</span>
                                      <span>&bull;</span>
                                      <span className="text-emerald-400 font-mono font-medium flex items-center gap-1">
                                        <TrendingUp className="w-2.5 h-2.5" />
                                        {quote?.price
                                          ? formatOriginalPrice(quote.price, quote.currency || result.currency)
                                          : result.livePrice
                                          ? formatOriginalPrice(result.livePrice, result.currency)
                                          : `${result.symbol}`}
                                      </span>
                                    </div>
                                  </div>
                                </div>

                                <div className="shrink-0">
                                  {isAdded ? (
                                    <span className="px-3 py-1.5 rounded-xl bg-slate-800 text-emerald-400 font-bold text-xs flex items-center gap-1 border border-slate-700">
                                      <Check className="w-3 h-3" /> Added
                                    </span>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => handleAddFromLiveMarket(result)}
                                      className="px-3.5 py-1.5 rounded-xl bg-emerald-400 hover:bg-emerald-300 text-slate-950 font-bold text-xs flex items-center gap-1 shadow-sm shadow-emerald-500/20 transition-all cursor-pointer"
                                    >
                                      <Plus className="w-3.5 h-3.5 stroke-[3]" />
                                      <span>Add</span>
                                    </button>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </>
                      ) : (
                        <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 text-xs text-slate-400 flex items-center justify-between">
                          <div>
                            <span className="text-slate-200 font-medium">No live results under "{selectedCatalogGroup}".</span>
                            <span className="text-[10px] text-slate-500 block mt-0.5">{liveSearchResults.length} live results found in other asset categories.</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => setSelectedCatalogGroup('All')}
                            className="ml-2 px-2.5 py-1 rounded-lg bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 font-semibold text-[11px] whitespace-nowrap cursor-pointer"
                          >
                            Show All ({liveSearchResults.length})
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Section B: Standard Preset Options */}
                  {filteredCatalog.length === 0 && filteredLiveSearchResults.length === 0 ? (
                    <div className="p-8 text-center text-slate-500 text-xs">
                      No assets found matching "{catalogSearch}" in {selectedCatalogGroup}.
                      <div className="mt-3">
                        <button
                          type="button"
                          onClick={() => {
                            setAstName(catalogSearch);
                            setAssetModalTab('custom');
                          }}
                          className="px-3 py-1.5 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 hover:bg-emerald-500/30 font-semibold cursor-pointer text-xs"
                        >
                          &rarr; Create "{catalogSearch}" as a Custom Asset
                        </button>
                      </div>
                    </div>
                  ) : (
                    filteredCatalog.map((item) => {
                      const isAdded =
                        addedAssetKeys.has(item.name.toLowerCase()) ||
                        (item.tickerSymbol && addedAssetKeys.has(item.tickerSymbol.toLowerCase()));

                      return (
                        <div
                          key={item.id}
                          className="flex items-center justify-between p-3 rounded-xl bg-slate-950 border border-slate-800/80 hover:border-slate-700 transition-all text-xs"
                        >
                          <div className="flex items-center space-x-2.5 min-w-0 pr-2">
                            <span
                              className="w-3 h-3 rounded-full shrink-0"
                              style={{ backgroundColor: item.categoryColor }}
                            />
                            <div className="truncate">
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-slate-100 truncate">
                                  {item.name}
                                </span>
                                {item.isCash ? (
                                  <span className="text-[9px] px-1 py-0.2 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 uppercase font-mono font-bold">
                                    Cash
                                  </span>
                                ) : (
                                  item.tickerSymbol && (
                                    <span className="text-[10px] font-mono text-slate-400">
                                      [{item.tickerSymbol}]
                                    </span>
                                  )
                                )}
                              </div>
                              <div className="text-[10px] text-slate-500 flex items-center gap-2 mt-0.5">
                                <span>{item.categoryName}</span>
                                <span>&bull;</span>
                                <span className="text-slate-400">{item.riskLevel} Risk</span>
                                <span>&bull;</span>
                                <span className="text-emerald-400 font-mono font-medium">
                                  {item.isCash
                                    ? `${formatOriginalPrice(1, item.currency || 'NTD')} Cash`
                                    : item.tickerSymbol
                                    ? (liveQuotesMap[item.tickerSymbol]?.price
                                        ? formatOriginalPrice(liveQuotesMap[item.tickerSymbol].price, liveQuotesMap[item.tickerSymbol].currency || item.currency || 'USD')
                                        : item.originalPrice
                                        ? formatOriginalPrice(item.originalPrice, item.currency || 'USD')
                                        : item.tickerSymbol)
                                    : 'Custom Preset'}
                                </span>
                              </div>
                            </div>
                          </div>

                          <div className="shrink-0">
                            {isAdded ? (
                              <span className="px-3 py-1.5 rounded-xl bg-slate-800 text-emerald-400 font-bold text-xs flex items-center gap-1 border border-slate-700">
                                <Check className="w-3 h-3" /> Added
                              </span>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleAddFromCatalog(item)}
                                className="px-3.5 py-1.5 rounded-xl bg-emerald-400 hover:bg-emerald-300 text-slate-950 font-bold text-xs flex items-center gap-1 shadow-sm shadow-emerald-500/20 transition-all cursor-pointer"
                              >
                                <Plus className="w-3.5 h-3.5 stroke-[3]" />
                                <span>Add</span>
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                {/* Footer Notice */}
                <div className="pt-2 border-t border-slate-800 flex items-center justify-between text-xs shrink-0">
                  <span className="text-slate-500 text-[11px]">
                    Adding an asset automatically creates its category if it doesn't already exist.
                  </span>
                  <button
                    type="button"
                    onClick={() => setIsAssetModalOpen(false)}
                    className="px-4 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium cursor-pointer"
                  >
                    Done
                  </button>
                </div>

              </div>
            ) : (
              /* TAB 2: Custom Asset Form */
              <form onSubmit={handleSaveAsset} className="p-5 space-y-4 overflow-y-auto">
                {errorMsg && (
                  <div className="p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs">
                    {errorMsg}
                  </div>
                )}

                <div>
                  <label className="block text-slate-400 font-semibold mb-1 text-xs">Asset Name</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. US Dollar Savings, Bitcoin Cold Storage, Taiwan 50"
                    value={astName}
                    onChange={(e) => setAstName(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 text-slate-100 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 font-semibold mb-1 text-xs">Select Parent Category</label>
                  {categories.length === 0 ? (
                    <div className="p-2.5 rounded-xl bg-amber-950/20 border border-amber-800/40 text-amber-300 text-xs">
                      No categories exist yet. Please use "Add Category" or select an asset from the Available Catalog first!
                    </div>
                  ) : (
                    <CustomDropdown
                      value={astCatId}
                      onChange={setAstCatId}
                      options={categories.map((c) => ({
                        value: c.id,
                        label: c.name,
                        badge: `${c.riskLevel} Risk`,
                        color: c.color,
                      }))}
                      className="w-full"
                      maxHeight="max-h-60"
                      enableSearch={categories.length >= 6}
                    />
                  )}
                </div>

                {/* Asset Price Following Section */}
                <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                      <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
                      <span>What Price Does This Asset Follow?</span>
                    </label>
                    <span className="text-[10px] text-slate-400">Cash link or benchmark search</span>
                  </div>

                  {/* 3 Choice Cards */}
                  <div className="grid grid-cols-3 gap-1.5 p-1 bg-slate-900 rounded-xl border border-slate-800 text-xs font-semibold">
                    <button
                      type="button"
                      onClick={() => {
                        setCustomPricingMode('cash');
                        setAstIsCash(true);
                        setAstTicker('');
                        setSelectedBenchmarkDetails(null);
                      }}
                      className={`py-2 px-2 rounded-lg text-center transition-all cursor-pointer ${
                        customPricingMode === 'cash'
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-sm'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <Coins className="w-3.5 h-3.5 mx-auto mb-1 text-emerald-400" />
                      <span className="block text-[11px] leading-tight font-bold">Follow Cash</span>
                      <span className="text-[9px] text-slate-400 font-normal">NTD, USD, JPY...</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setCustomPricingMode('benchmark');
                        setAstIsCash(false);
                      }}
                      className={`py-2 px-2 rounded-lg text-center transition-all cursor-pointer ${
                        customPricingMode === 'benchmark'
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-sm'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <Globe className="w-3.5 h-3.5 mx-auto mb-1 text-sky-400" />
                      <span className="block text-[11px] leading-tight font-bold">Follow Benchmark</span>
                      <span className="text-[9px] text-slate-400 font-normal">Gold, Stock, Crypto</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setCustomPricingMode('manual');
                        setAstIsCash(false);
                        setAstTicker('');
                        setSelectedBenchmarkDetails(null);
                      }}
                      className={`py-2 px-2 rounded-lg text-center transition-all cursor-pointer ${
                        customPricingMode === 'manual'
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-sm'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <Tag className="w-3.5 h-3.5 mx-auto mb-1 text-amber-400" />
                      <span className="block text-[11px] leading-tight font-bold">Self-Managed</span>
                      <span className="text-[9px] text-slate-400 font-normal">No Market Feed</span>
                    </button>
                  </div>

                  {/* Option 1: Cash (Multi-currency support) */}
                  {customPricingMode === 'cash' && (
                    <div className="p-3.5 rounded-xl bg-slate-900 border border-emerald-500/30 text-xs space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-emerald-300 font-bold">
                          <Coins className="w-4 h-4 text-emerald-400" />
                          <span>Cash Currency: {formatOriginalPrice(1, astCurrency || 'NTD')}</span>
                        </div>
                        <span className="text-[10px] text-slate-400 font-mono">1:1 Face Value</span>
                      </div>

                      <div>
                        <label className="block text-slate-400 font-semibold mb-1.5 text-[11px]">
                          Choose Cash Currency:
                        </label>
                        <div className="flex flex-wrap gap-1.5">
                          {[
                            { code: 'NTD', label: '🇹🇼 NTD (TWD)' },
                            { code: 'USD', label: '🇺🇸 USD' },
                            { code: 'USDT', label: '🪙 USDT (Tether)' },
                            { code: 'USDC', label: '💵 USDC' },
                            { code: 'JPY', label: '🇯🇵 JPY' },
                            { code: 'EUR', label: '🇪🇺 EUR' },
                            { code: 'GBP', label: '🇬🇧 GBP' },
                            { code: 'CNY', label: '🇨🇳 CNY' },
                            { code: 'AUD', label: '🇦🇺 AUD' },
                            { code: 'CAD', label: '🇨🇦 CAD' },
                            { code: 'SGD', label: '🇸🇬 SGD' },
                          ].map((c) => (
                            <button
                              key={c.code}
                              type="button"
                              onClick={() => {
                                setAstCurrency(c.code);
                                if (!astName || astName.startsWith('Cash ')) {
                                  setAstName(`Cash ${c.code}`);
                                }
                                if (c.code === 'USD' || c.code === 'USDT' || c.code === 'USDC') {
                                  setAstPrice('32.5');
                                } else if (c.code === 'JPY') {
                                  setAstPrice('0.22');
                                } else if (c.code === 'EUR') {
                                  setAstPrice('35.0');
                                } else {
                                  setAstPrice('1');
                                }
                              }}
                              className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all cursor-pointer ${
                                (astCurrency || 'NTD').toUpperCase() === c.code
                                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/50 shadow-sm'
                                  : 'bg-slate-950 text-slate-400 hover:text-slate-200 border border-slate-800'
                              }`}
                            >
                              {c.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 pt-1 border-t border-slate-800/80">
                        <label className="text-[11px] text-slate-400 shrink-0">Custom Currency Code:</label>
                        <input
                          type="text"
                          placeholder="e.g. CHF, HKD, KRW"
                          value={astCurrency}
                          onChange={(e) => {
                            const val = e.target.value.toUpperCase();
                            setAstCurrency(val);
                            if (val === 'USD' || val === 'USDT' || val === 'USDC') {
                              setAstPrice('32.5');
                            }
                          }}
                          className="w-24 bg-slate-950 border border-slate-700 text-slate-100 font-mono font-bold text-xs uppercase px-2 py-1 rounded-lg focus:outline-none focus:border-emerald-500"
                        />
                      </div>

                      {/* Foreign Currency Exchange Rate to NTD */}
                      {astCurrency && astCurrency !== 'NTD' && astCurrency !== 'TWD' && (
                        <div className="p-3 rounded-xl bg-slate-950/80 border border-emerald-500/30 space-y-2">
                          <div className="flex items-center justify-between text-[11px]">
                            <span className="text-emerald-300 font-semibold flex items-center gap-1.5">
                              <DollarSign className="w-3.5 h-3.5 text-emerald-400" />
                              Exchange Rate (1 {astCurrency} in NTD):
                            </span>
                            <span className="text-[10px] text-emerald-400 font-mono">
                              1 {astCurrency} = {astPrice || '32.5'} NT$
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-slate-400 font-mono">1 {astCurrency} =</span>
                            <input
                              type="text"
                              placeholder={astCurrency === 'USD' ? '32.5' : '1.0'}
                              value={astPrice}
                              onChange={(e) => setAstPrice(e.target.value)}
                              className="w-28 bg-slate-900 border border-slate-700 text-emerald-400 font-mono font-bold text-xs px-2.5 py-1.5 rounded-lg focus:outline-none focus:border-emerald-500"
                            />
                            <span className="text-xs text-slate-400 font-mono">NT$ (TWD)</span>
                          </div>
                          <p className="text-[10px] text-slate-400">
                            Total Asset calculates: <strong>Quantity &times; Exchange Rate</strong>. Live market feeds will automatically keep this spot price updated!
                          </p>
                        </div>
                      )}

                      <div className="pt-2 border-t border-slate-800/80">
                        <label className="flex items-start gap-2.5 p-2.5 rounded-xl bg-amber-950/20 border border-amber-500/30 cursor-pointer hover:border-amber-500/50 transition-colors">
                          <input
                            type="checkbox"
                            checked={astIsEmergencyFund}
                            onChange={(e) => {
                              const checked = e.target.checked;
                              setAstIsEmergencyFund(checked);
                              if (checked && (!astName || astName.startsWith('Cash '))) {
                                setAstName(`Emergency Fund (${astCurrency || 'NTD'})`);
                              }
                            }}
                            className="mt-0.5 rounded border-amber-500/50 bg-slate-950 text-amber-500 focus:ring-amber-500"
                          />
                          <div>
                            <div className="font-bold text-amber-400 text-xs flex items-center gap-1.5">
                              <span>Mark as Emergency Fund (Safety Net Reserve)</span>
                              <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/20 border border-amber-500/30 text-amber-300 uppercase">
                                Excluded from P&amp;L
                              </span>
                            </div>
                            <p className="text-[10px] text-slate-400 mt-0.5 leading-relaxed">
                              Included in <strong>Total Capital</strong>, but strictly excluded from <strong>Total Assets</strong>, <strong>Total Invested</strong>, <strong>Floating P/L</strong>, and <strong>Rebalancing</strong>.
                            </p>
                          </div>
                        </label>
                      </div>

                      <p className="text-[11px] text-slate-400 pt-1 border-t border-slate-800/60">
                        In the Transaction Ledger, Cash assets are eligible for external capital deposits via the <strong>"Add"</strong> action and can be converted into any investment asset.
                      </p>
                    </div>
                  )}

                  {/* Option 2: Follow Benchmark (Search Bar + Quick Chips) */}
                  {customPricingMode === 'benchmark' && (
                    <div className="space-y-3 pt-1">
                      {/* Selected Benchmark Badge */}
                      {astTicker ? (
                        <div className="p-3 rounded-xl bg-slate-900 border border-emerald-500/40 flex items-center justify-between">
                          <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold font-mono text-xs border border-emerald-500/30">
                              <Check className="w-4 h-4" />
                            </div>
                            <div>
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-bold text-slate-100 text-xs">
                                  {selectedBenchmarkDetails?.name || astTicker}
                                </span>
                                <span className="text-[10px] font-mono font-bold text-emerald-400 bg-emerald-950/40 px-1.5 py-0.5 rounded border border-emerald-500/30">
                                  {astTicker}
                                </span>
                                {liveQuotesMap[astTicker]?.price && (
                                  <span className="text-[11px] font-mono font-bold text-emerald-300 bg-emerald-950/60 px-1.5 py-0.5 rounded border border-emerald-500/40">
                                    {formatOriginalPrice(liveQuotesMap[astTicker].price, liveQuotesMap[astTicker].currency || selectedBenchmarkDetails?.currency || 'USD')}
                                  </span>
                                )}
                              </div>
                              <span className="text-[10px] text-slate-400 block mt-0.5">
                                Asset will track this market price for portfolio valuation.
                              </span>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={handleClearBenchmark}
                            className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs transition-colors cursor-pointer"
                          >
                            Change
                          </button>
                        </div>
                      ) : (
                        <>
                          {/* Benchmark Search Bar */}
                          <div>
                            <label className="block text-slate-400 font-semibold mb-1 text-[11px]">
                              Search Benchmark or Asset to Follow:
                            </label>
                            <div className="relative">
                              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                              <input
                                type="text"
                                placeholder="Search benchmark or ticker (e.g. Gold, 2330, VOO, Bitcoin, NVDA, Silver)..."
                                value={benchmarkSearchQuery}
                                onChange={(e) => setBenchmarkSearchQuery(e.target.value)}
                                className="w-full bg-slate-900 border border-slate-700 text-slate-100 pl-9 pr-9 py-2 rounded-xl text-xs focus:outline-none focus:border-emerald-500"
                              />
                              {isSearchingBenchmark && (
                                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                                  <Loader2 className="w-3.5 h-3.5 text-emerald-400 animate-spin" />
                                </div>
                              )}
                            </div>

                            {/* Live Search Results Dropdown */}
                            {benchmarkSearchResults.length > 0 && (
                              <div className="mt-1.5 max-h-48 overflow-y-auto rounded-xl bg-slate-900 border border-slate-700 divide-y divide-slate-800/80 shadow-lg no-scrollbar">
                                {benchmarkSearchResults.map((res) => (
                                  <button
                                    key={res.symbol}
                                    type="button"
                                    onClick={() => handlePickBenchmark(res.symbol, res.name, res.exchange, res.currency)}
                                    className="w-full px-3 py-2 text-left hover:bg-slate-800/80 flex items-center justify-between transition-colors cursor-pointer"
                                  >
                                    <div className="truncate pr-2">
                                      <div className="flex items-center gap-2">
                                        <span className="font-semibold text-slate-200 text-xs truncate">{res.name}</span>
                                        <span className="text-[10px] font-mono font-bold text-emerald-400 bg-emerald-950/40 px-1 py-0.2 rounded border border-emerald-500/30">
                                          {res.symbol}
                                        </span>
                                        {res.livePrice && (
                                          <span className="text-[10px] font-mono text-emerald-300">
                                            {formatOriginalPrice(res.livePrice, res.currency)}
                                          </span>
                                        )}
                                      </div>
                                      <span className="text-[10px] text-slate-500 block">
                                        {res.exchange} &bull; {res.categoryName}
                                      </span>
                                    </div>
                                    <span className="px-2 py-1 rounded bg-emerald-500/20 text-emerald-400 font-bold text-[11px] shrink-0">
                                      Select
                                    </span>
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>

                          {/* Quick Benchmark Chips */}
                          <div>
                            <label className="block text-slate-400 font-semibold mb-1 text-[11px]">
                              Or Quick Pick Popular Benchmarks:
                            </label>
                            <div className="flex flex-wrap gap-1.5">
                              {POPULAR_BENCHMARKS.map((bm) => {
                                const quote = liveQuotesMap[bm.ticker];
                                return (
                                  <button
                                    key={bm.ticker}
                                    type="button"
                                    onClick={() => handlePickBenchmark(bm.ticker, bm.label, bm.desc, bm.currency)}
                                    className="px-2.5 py-1 rounded-lg text-[11px] font-medium bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-700 flex items-center gap-1.5 transition-all cursor-pointer"
                                  >
                                    <span>{bm.icon}</span>
                                    <span>{bm.label}</span>
                                    <span className="text-[9px] font-mono text-emerald-400 font-semibold">
                                      {quote?.price
                                        ? formatOriginalPrice(quote.price, quote.currency || bm.currency)
                                        : `(${bm.ticker})`}
                                    </span>
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  )}

                  {/* Option 3: Self-Managed */}
                  {customPricingMode === 'manual' && (
                    <div className="p-3.5 rounded-xl bg-slate-900 border border-amber-500/30 text-xs space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-amber-300 font-bold">
                          <Tag className="w-4 h-4 text-amber-400" />
                          <span>Self-Managed Asset (No External Market Feed)</span>
                        </div>
                        <span className="text-[10px] text-slate-400 font-mono">Manual Valuation</span>
                      </div>
                      <p className="text-[11px] text-slate-400">
                        For custom USD holdings (e.g. IBKR USD), private equity, physical assets, or fixed investments. Value in Total Assets is calculated as <strong>Quantity &times; Unit Valuation (NT$)</strong>.
                      </p>

                      <div>
                        <label className="block text-slate-400 font-semibold mb-1.5 text-[11px]">
                          Denominated Currency:
                        </label>
                        <div className="flex flex-wrap gap-1.5">
                          {[
                            { code: 'NTD', label: '🇹🇼 NTD' },
                            { code: 'USD', label: '🇺🇸 USD' },
                            { code: 'USDT', label: '🪙 USDT' },
                            { code: 'EUR', label: '🇪🇺 EUR' },
                            { code: 'JPY', label: '🇯🇵 JPY' },
                          ].map((c) => (
                            <button
                              key={c.code}
                              type="button"
                              onClick={() => {
                                setAstCurrency(c.code);
                                if (c.code === 'USD' || c.code === 'USDT') {
                                  setAstPrice('32.5');
                                } else if (c.code === 'JPY') {
                                  setAstPrice('0.22');
                                } else if (c.code === 'EUR') {
                                  setAstPrice('35.0');
                                } else if (c.code === 'NTD') {
                                  setAstPrice('1');
                                }
                              }}
                              className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all cursor-pointer ${
                                (astCurrency || 'NTD').toUpperCase() === c.code
                                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/50 shadow-sm'
                                  : 'bg-slate-950 text-slate-400 hover:text-slate-200 border border-slate-800'
                              }`}
                            >
                              {c.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800 space-y-2">
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="text-slate-300 font-semibold flex items-center gap-1.5">
                            <DollarSign className="w-3.5 h-3.5 text-amber-400" />
                            Unit Valuation in Portfolio Base Currency (NT$):
                          </span>
                          <span className="text-[10px] text-amber-400 font-mono">
                            1 {astCurrency || 'Unit'} = {astPrice || '1'} NT$
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-slate-400 font-mono">1 {astCurrency || 'Unit'} =</span>
                          <input
                            type="text"
                            placeholder={astCurrency === 'USD' ? '32.5' : '1.0'}
                            value={astPrice}
                            onChange={(e) => setAstPrice(e.target.value)}
                            className="w-28 bg-slate-900 border border-slate-700 text-amber-300 font-mono font-bold text-xs px-2.5 py-1.5 rounded-lg focus:outline-none focus:border-amber-500"
                          />
                          <span className="text-xs text-slate-400 font-mono">NT$ (TWD)</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-slate-400 font-semibold mb-1 text-xs">Description (Optional)</label>
                  <input
                    type="text"
                    placeholder="e.g. Cold wallet, real estate trust, foreign cash account"
                    value={astDesc}
                    onChange={(e) => setAstDesc(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 text-slate-100 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div className="pt-2 flex justify-end space-x-2 border-t border-slate-800">
                  <button
                    type="button"
                    onClick={() => {
                      if (!editingAsset) setAssetModalTab('catalog');
                      else setIsAssetModalOpen(false);
                    }}
                    className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 font-medium text-xs cursor-pointer"
                  >
                    Back to Catalog
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 rounded-xl bg-emerald-400 text-slate-950 font-bold text-xs shadow-md shadow-emerald-500/20 cursor-pointer"
                  >
                    Save Asset
                  </button>
                </div>
              </form>
            )}

          </div>
        </div>
      )}

      {/* ---------------------------------------------------- */}
      {/* CATEGORY MODAL */}
      {/* ---------------------------------------------------- */}
      {isCategoryModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4 text-xs">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-bold text-base text-slate-100 flex items-center gap-2">
                <Tag className="w-4 h-4 text-blue-400" />
                <span>{editingCategory ? 'Edit Category' : 'Add New Category'}</span>
              </h3>
              <button onClick={() => setIsCategoryModalOpen(false)} className="text-slate-400 hover:text-white cursor-pointer">
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
                  placeholder="e.g. Taiwan Equities, US Tech, Cryptocurrencies"
                  value={catName}
                  onChange={(e) => setCatName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 text-slate-100 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-slate-400 font-semibold mb-1">Tied Risk Level</label>
                <CustomDropdown
                  value={catRisk}
                  onChange={(val) => setCatRisk(val as RiskLevel)}
                  options={[
                    { value: 'Low', label: 'Low Risk' },
                    { value: 'Medium', label: 'Medium Risk' },
                    { value: 'High', label: 'High Risk' },
                  ]}
                  className="w-full bg-slate-950 border border-slate-700 text-slate-100 rounded-xl px-3 py-2 text-xs"
                />
              </div>

              <div>
                <label className="block text-slate-400 font-semibold mb-1">Chart Tag Color</label>
                <div className="flex flex-wrap gap-2 mb-2">
                  {colorPalette.map((col) => (
                    <button
                      key={col}
                      type="button"
                      onClick={() => setCatColor(col)}
                      className={`w-6 h-6 rounded-full border-2 transition-transform cursor-pointer ${
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
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
                    placeholder="e.g. 25"
                    value={catTargetPercent === 0 ? '' : String(catTargetPercent)}
                    onChange={(e) => {
                      const clean = e.target.value.replace(/[^0-9.]/g, '').replace(/^0+(?=\d)/, '');
                      const num = parseFloat(clean);
                      if (isNaN(num)) {
                        setCatTargetPercent(0);
                      } else {
                        setCatTargetPercent(Math.min(100, num));
                      }
                    }}
                    className="w-full bg-slate-950 border border-slate-700 text-slate-100 rounded-xl px-3 py-2 pr-8 text-xs font-mono font-bold focus:outline-none focus:border-emerald-500 tabular-nums"
                  />
                  <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-slate-500 font-mono text-xs">
                    %
                  </div>
                </div>
              </div>

              <div className="pt-2 flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setIsCategoryModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 font-medium cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-emerald-400 text-slate-950 font-bold cursor-pointer"
                >
                  Save Category
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
                  <span>Delete Category: {categoryToDeleteGuard.name}</span>
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
                        <CustomDropdown
                          value={targetCategoryId}
                          onChange={setTargetCategoryId}
                          options={availableTargets.map((c) => ({
                            value: c.id,
                            label: c.name,
                            badge: `${c.riskLevel} Risk`,
                            color: c.color,
                          }))}
                          className="flex-1"
                          maxHeight="max-h-60"
                        />
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
                  <span>Delete Asset: {assetToDeleteGuard.name}</span>
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
                        <CustomDropdown
                          value={targetAssetId}
                          onChange={setTargetAssetId}
                          options={availableTargets.map((a) => {
                            const cat = categories.find((c) => c.id === a.categoryId);
                            return {
                              value: a.id,
                              label: a.name,
                              sublabel: cat?.name || 'Uncategorized',
                              color: cat?.color,
                            };
                          })}
                          className="flex-1"
                          maxHeight="max-h-60"
                          enableSearch={availableTargets.length >= 6}
                        />
                        <button
                          type="button"
                          onClick={handleConfirmAssetReassign}
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
                      Delete Asset & Records
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
