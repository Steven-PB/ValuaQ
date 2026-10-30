import React, { useState, useMemo, useEffect } from 'react';
import { 
  Plus, 
  ArrowRight, 
  ArrowDownLeft, 
  ArrowUpRight,
  RefreshCw, 
  Edit2, 
  Trash2, 
  Search, 
  Filter, 
  Coins, 
  DollarSign, 
  AlertCircle,
  HelpCircle,
  CheckCircle2,
  Calendar,
  Layers,
  ShieldCheck,
  ShieldAlert,
  Sparkles,
  Maximize2,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  X,
  ChevronUp,
  ChevronDown,
  ChevronRight
} from 'lucide-react';
import { Asset, Category, LedgerTransaction, TransactionType } from '../types';
import { CustomDropdown, DropdownOption } from './CustomDropdown';
import { formatNumberWithCommas, parseFormattedNumber, formatCurrency, isLiveMonth, SUPPORTED_PRICE_CURRENCIES, getAssetPriceCurrency, formatAssetUnitPrice } from '../lib/formatters';
import { 
  isEmergencyFundAsset, 
  getTransactionInvestmentCapitalDelta, 
  getTransactionDividendValueNTD, 
  validateConvertGuardBand,
  getAssetBasePrice 
} from '../lib/ledgerEngine';

interface LedgerViewProps {
  transactions: LedgerTransaction[];
  assets: Asset[];
  categories: Category[];
  currencySymbol: string;
  stealthMode: boolean;
  onAddTransaction: (tx: Omit<LedgerTransaction, 'id' | 'createdAt' | 'updatedAt'>) => void;
  onEditTransaction: (id: string, tx: Partial<LedgerTransaction>) => void;
  onDeleteTransaction: (id: string) => void;
  onOpenHierarchyTab?: () => void;
  onAddAssetWithCategory?: (asset: Omit<Asset, 'id'>, newCategory?: Omit<Category, 'id'>) => Asset | void;
  onEditAsset?: (id: string, updated: Partial<Asset>) => void;
}

export const LedgerView: React.FC<LedgerViewProps> = ({
  transactions,
  assets,
  categories,
  currencySymbol,
  stealthMode,
  onAddTransaction,
  onEditTransaction,
  onDeleteTransaction,
  onOpenHierarchyTab,
  onAddAssetWithCategory,
  onEditAsset,
}) => {
  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTx, setEditingTx] = useState<LedgerTransaction | null>(null);

  // Form Fields
  const [action, setAction] = useState<TransactionType>('add');
  const [date, setDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [fromAssetId, setFromAssetId] = useState<string>('');
  const [fromValueStr, setFromValueStr] = useState<string>('');
  const [toAssetId, setToAssetId] = useState<string>('');
  const [toValueStr, setToValueStr] = useState<string>('');
  const [note, setNote] = useState<string>('');
  const [formError, setFormError] = useState<string>('');

  // Delete Confirmation
  const [deletingTxId, setDeletingTxId] = useState<string | null>(null);

  // Filter State (Multi-select: empty array means 'All')
  const [filterMonths, setFilterMonths] = useState<string[]>([]);
  const [filterActions, setFilterActions] = useState<TransactionType[]>([]);
  const [filterAssetIds, setFilterAssetIds] = useState<string[]>([]);
  const [sortAsc, setSortAsc] = useState<boolean>(false); // default: newest date first

  // Unique month categories present in transactions
  const availableMonths = useMemo(() => {
    const set = new Set<string>();
    transactions.forEach((tx) => {
      if (tx.date && tx.date.length >= 7) {
        set.add(tx.date.slice(0, 7));
      }
    });
    return Array.from(set).sort((a, b) => b.localeCompare(a));
  }, [transactions]);

  // Balances Breakdown Modal State
  const [isBalancesModalOpen, setIsBalancesModalOpen] = useState(false);
  const [balancesSearch, setBalancesSearch] = useState('');
  const [balancesFilterTab, setBalancesFilterTab] = useState<'all' | 'positive' | 'cash' | 'investments'>('all');
  const [balanceAssetIdx, setBalanceAssetIdx] = useState<number>(0);

  const assetMap = useMemo(() => {
    const map = new Map<string, Asset>();
    assets.forEach((a) => map.set(a.id, a));
    return map;
  }, [assets]);

  const categoryMap = useMemo(() => {
    const map = new Map<string, Category>();
    categories.forEach((c) => map.set(c.id, c));
    return map;
  }, [categories]);

  // Month expand / collapse state
  // Default is 'hide' (false) when 'all' months is selected; 'show' (true) when specific months are selected
  const [expandedMonths, setExpandedMonths] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (filterMonths.length === 0) {
      setExpandedMonths({});
    } else {
      const next: Record<string, boolean> = {};
      filterMonths.forEach((m) => {
        next[m] = true;
      });
      setExpandedMonths(next);
    }
  }, [filterMonths]);

  const toggleMonthExpand = (monthKey: string) => {
    setExpandedMonths((prev) => {
      const isDefaultExpanded = filterMonths.length > 0;
      const current = prev[monthKey] ?? isDefaultExpanded;
      return {
        ...prev,
        [monthKey]: !current,
      };
    });
  };

  // Dropdown options with max-height and scrolling
  const monthFilterOptions = useMemo(() => {
    const list: DropdownOption[] = [{ value: 'all', label: 'All Months' }];
    availableMonths.forEach((m) => {
      if (isLiveMonth(m)) {
        list.push({
          value: m,
          label: 'Live',
          color: '#10b981',
          badge: 'LIVE',
        });
        return;
      }
      let label = m;
      if (m.includes('-')) {
        const [y, mon] = m.split('-');
        const d = new Date(parseInt(y, 10), parseInt(mon, 10) - 1, 1);
        label = `${d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })} (${m})`;
      }
      list.push({ value: m, label });
    });
    return list;
  }, [availableMonths]);

  const actionFilterOptions: DropdownOption[] = useMemo(() => [
    { value: 'all', label: 'All Actions' },
    { value: 'add', label: 'Add' },
    { value: 'convert', label: 'Convert' },
    { value: 'withdraw', label: 'Withdraw' },
    { value: 'dividend', label: 'Yield' },
  ], []);

  const assetFilterOptions = useMemo(() => {
    const list: DropdownOption[] = [{ value: 'all', label: 'All Assets' }];
    assets.forEach((a) => {
      const cat = categoryMap.get(a.categoryId);
      const isCash = a.isCash || cat?.isCashCategory;
      list.push({
        value: a.id,
        label: a.name,
        sublabel: a.tickerSymbol ? `Ticker: ${a.tickerSymbol}` : cat?.name,
        color: cat?.color || '#3b82f6',
        badge: isCash && a.currency ? `[${a.currency}]` : a.tickerSymbol || undefined,
      });
    });
    return list;
  }, [assets, categoryMap]);

  // Helper to identify cash & stablecoin assets (NTD, USD, USDT, USDC, etc.)
  const isCashOrStablecoinAsset = (a: Asset) => {
    if (a.isCash) return true;
    const cat = categoryMap.get(a.categoryId);
    if (cat?.isCashCategory) return true;
    const name = (a.name || '').toLowerCase();
    const ticker = (a.tickerSymbol || '').toUpperCase();
    const catName = (cat?.name || '').toLowerCase();
    return (
      ticker === 'USDT' ||
      ticker === 'USDC' ||
      ticker === 'DAI' ||
      ticker === 'BUSD' ||
      ticker === 'USD' ||
      ticker === 'TWD' ||
      ticker === 'NTD' ||
      name.includes('usdt') ||
      name.includes('tether') ||
      name.includes('usdc') ||
      name.includes('stablecoin') ||
      catName.includes('stablecoin')
    );
  };

  // Cash and liquid stablecoin assets available for 'add' action (Rule 2)
  const cashAssets = useMemo(() => {
    return assets.filter((a) => isCashOrStablecoinAsset(a));
  }, [assets, categoryMap]);

  // Calculate current holdings for each asset across all transactions
  const holdings = useMemo(() => {
    const map: Record<string, number> = {};
    const sorted = [...transactions].sort((a, b) => a.date.localeCompare(b.date));

    for (const tx of sorted) {
      if (tx.action === 'add' || tx.action === 'dividend') {
        const val = Number(tx.toValue) || 0;
        map[tx.toAssetId] = (map[tx.toAssetId] || 0) + val;
      } else if (tx.action === 'withdraw') {
        const val = Number(tx.fromValue || tx.toValue) || 0;
        const targetId = tx.fromAssetId || tx.toAssetId;
        if (targetId) {
          map[targetId] = (map[targetId] || 0) - val;
        }
      } else if (tx.action === 'convert') {
        const fVal = Number(tx.fromValue) || 0;
        const tVal = Number(tx.toValue) || 0;
        if (tx.fromAssetId) {
          map[tx.fromAssetId] = (map[tx.fromAssetId] || 0) - fVal;
        }
        map[tx.toAssetId] = (map[tx.toAssetId] || 0) + tVal;
      }
    }

    for (const assetId in map) {
      if (Math.abs(map[assetId]) < 1e-8) {
        map[assetId] = 0;
      }
    }

    return map;
  }, [transactions]);

  // Modal Dropdown options with max-height and scrolling
  const depositToAssetOptions = useMemo(() => {
    const cashList = assets.filter((a) => isCashOrStablecoinAsset(a));
    const otherList = assets.filter((a) => !isCashOrStablecoinAsset(a));
    const formatAst = (ast: Asset) => {
      const isEF = isEmergencyFundAsset(ast);
      const isCash = isCashOrStablecoinAsset(ast);
      const cat = categoryMap.get(ast.categoryId);
      const h = holdings[ast.id] || 0;
      const unitSuffix = isCash && ast.currency ? ` ${ast.currency}` : '';
      return {
        value: ast.id,
        label: `${isEF ? '🛡️' : isCash ? '💵' : '📈'} ${ast.name}`,
        sublabel: `Holding: ${formatNumberWithCommas(h)}${unitSuffix}`,
        badge: isEF ? 'Safety Net' : isCash && ast.currency ? `[${ast.currency}]` : ast.tickerSymbol || undefined,
        color: isEF ? '#f59e0b' : (cat?.color || '#3b82f6'),
      };
    };
    return [...cashList.map(formatAst), ...otherList.map(formatAst)];
  }, [assets, holdings, categoryMap]);

  const yieldSourceAssetOptions = useMemo(() => {
    const list: DropdownOption[] = [
      { value: '', label: 'General Savings Interest / Unspecified' },
    ];
    assets.forEach((ast) => {
      const cat = categoryMap.get(ast.categoryId);
      const isCash = isCashOrStablecoinAsset(ast);
      const unitSuffix = isCash && ast.currency ? ` ${ast.currency}` : '';
      list.push({
        value: ast.id,
        label: ast.name,
        sublabel: ast.tickerSymbol ? `Ticker: ${ast.tickerSymbol}` : `Holding: ${formatNumberWithCommas(holdings[ast.id] || 0)}${unitSuffix}`,
        color: cat?.color,
        badge: isCash ? ast.currency : ast.tickerSymbol || undefined,
      });
    });
    return list;
  }, [assets, holdings, categoryMap]);

  const yieldDestinationAssetOptions = useMemo(() => {
    const list: DropdownOption[] = [
      { value: '', label: 'Select destination asset...' },
    ];
    assets.forEach((ast) => {
      const isEF = isEmergencyFundAsset(ast);
      const isCash = isCashOrStablecoinAsset(ast);
      const cat = categoryMap.get(ast.categoryId);
      list.push({
        value: ast.id,
        label: ast.isCash ? `💵 ${ast.name}` : `📈 ${ast.name} (DRIP / Yield)`,
        sublabel: isEF ? 'Emergency Fund Safety Net' : cat?.name,
        color: isEF ? '#f59e0b' : cat?.color,
        badge: isCash ? ast.currency : ast.tickerSymbol || undefined,
      });
    });
    return list;
  }, [assets, categoryMap]);

  const withdrawFromAssetOptions = useMemo(() => {
    const list: DropdownOption[] = [
      { value: '', label: 'Select asset...' },
    ];
    assets.forEach((ast) => {
      const check = validateConvertGuardBand(transactions, ast, 0, date, editingTx?.id);
      const isEF = isEmergencyFundAsset(ast);
      const isCash = isCashOrStablecoinAsset(ast);
      const cat = categoryMap.get(ast.categoryId);
      const unitSuffix = isCash && ast.currency ? ` ${ast.currency}` : '';
      list.push({
        value: ast.id,
        label: `${isEF ? '🛡️' : isCash ? '💵' : '📈'} ${ast.name}`,
        sublabel: `Available: ${formatNumberWithCommas(check.effectiveAvailable)}${unitSuffix}`,
        color: isEF ? '#f59e0b' : cat?.color,
        badge: isCash ? ast.currency : ast.tickerSymbol || undefined,
      });
    });
    return list;
  }, [assets, transactions, date, editingTx, categoryMap]);

  const convertFromAssetOptions = useMemo(() => {
    const list: DropdownOption[] = [
      { value: '', label: 'Select source asset...' },
    ];
    assets.forEach((ast) => {
      const check = validateConvertGuardBand(transactions, ast, 0, date, editingTx?.id);
      const isEF = isEmergencyFundAsset(ast);
      const isCash = isCashOrStablecoinAsset(ast);
      const cat = categoryMap.get(ast.categoryId);
      const unitSuffix = isCash && ast.currency ? ` ${ast.currency}` : '';
      list.push({
        value: ast.id,
        label: ast.name,
        sublabel: `Available: ${formatNumberWithCommas(check.effectiveAvailable)}${unitSuffix}`,
        color: isEF ? '#f59e0b' : cat?.color,
        badge: isCash ? ast.currency : ast.tickerSymbol || undefined,
      });
    });
    return list;
  }, [assets, transactions, date, editingTx, categoryMap]);

  const convertToAssetOptions = useMemo(() => {
    const list: DropdownOption[] = [
      { value: '', label: 'Select destination asset...' },
    ];
    assets.forEach((ast) => {
      if (ast.id === fromAssetId) return;
      const cat = categoryMap.get(ast.categoryId);
      const isEF = isEmergencyFundAsset(ast);
      const isCash = isCashOrStablecoinAsset(ast);
      list.push({
        value: ast.id,
        label: ast.name,
        sublabel: isEF ? 'Emergency Fund' : cat?.name,
        color: isEF ? '#f59e0b' : cat?.color,
        badge: isCash ? ast.currency : ast.tickerSymbol || undefined,
      });
    });
    return list;
  }, [assets, fromAssetId, categoryMap]);

  // Investment capital deposited (excluding Emergency Fund deposits & Dividends, and accounting for EF transfers)
  const totalDeposits = useMemo(() => {
    const net = transactions.reduce(
      (sum, t) => sum + getTransactionInvestmentCapitalDelta(t, assetMap),
      0
    );
    return Math.max(0, net);
  }, [transactions, assetMap]);

  // Cumulative Passive Yield (Dividends & Interest)
  const totalDividendsEarned = useMemo(() => {
    return transactions.reduce(
      (sum, t) => sum + getTransactionDividendValueNTD(t, assetMap),
      0
    );
  }, [transactions, assetMap]);

  // Emergency Fund assets and current total safety net balance
  const emergencyFundAssets = useMemo(() => {
    return assets.filter((a) => isEmergencyFundAsset(a));
  }, [assets]);

  const totalEmergencyFundBalance = useMemo(() => {
    return emergencyFundAssets.reduce((sum, a) => {
      const price = getAssetBasePrice(a, undefined, undefined, 32.5);
      return sum + (holdings[a.id] || 0) * price;
    }, 0);
  }, [emergencyFundAssets, holdings]);

  // Quick-create Emergency Fund (NTD) asset if none exists
  const handleQuickCreateEmergencyFund = (openDepositModalAfter: boolean = true) => {
    if (!onAddAssetWithCategory) {
      if (onOpenHierarchyTab) onOpenHierarchyTab();
      return;
    }
    const existingEFCat = categories.find(
      (c) => c.isEmergencyFundCategory || c.name.toLowerCase().includes('emergency fund')
    );
    const created = onAddAssetWithCategory(
      {
        name: 'Emergency Fund (NTD)',
        categoryId: existingEFCat?.id || '',
        currency: 'NTD',
        description: 'Safety net cash reserve in NTD. Excluded from P&L, Total Invested, and Rebalancing.',
        isCash: true,
        isEmergencyFund: true,
        tickerSymbol: 'TWD',
        currentPrice: 1,
      },
      existingEFCat
        ? undefined
        : {
            name: 'Emergency Fund (Safety Net)',
            riskLevel: 'Low',
            color: '#f59e0b',
            isCashCategory: true,
            isEmergencyFundCategory: true,
            description: 'Quarantined safety net cash reserve excluded from investment P&L and rebalancing.',
          }
    );

    if (openDepositModalAfter) {
      setEditingTx(null);
      setAction('add');
      setDate(new Date().toISOString().slice(0, 10));
      setFromAssetId('');
      setFromValueStr('');
      if (created && created.id) {
        setToAssetId(created.id);
      }
      setToValueStr('');
      setNote('Emergency Fund safety net deposit');
      setIsModalOpen(true);
    } else if (created && created.id) {
      setToAssetId(created.id);
    }
  };

  // Per-asset convertible check (tracks NTD Cash, USD Cash, and every other asset separately)
  const convertibleAssets = useMemo(() => {
    return assets.filter((a) => {
      const bal = holdings[a.id] || 0;
      const floor = Math.max(0, Number(a.guardBand) || 0);
      return bal > 0 && (floor > 0 ? bal >= floor : bal > 0);
    });
  }, [assets, holdings]);

  const hasCashFound = assets.length >= 2;

  // Filtered assets for the Balances Breakdown Modal
  const filteredBalancesAssets = useMemo(() => {
    return assets.filter((ast) => {
      const qty = holdings[ast.id] || 0;
      const isEF = isEmergencyFundAsset(ast);
      const isCash = ast.isCash || categoryMap.get(ast.categoryId)?.isCashCategory;

      if (balancesFilterTab === 'positive' && qty <= 0) return false;
      if (balancesFilterTab === 'cash' && !isCash && !isEF) return false;
      if (balancesFilterTab === 'investments' && (isCash || isEF)) return false;

      if (balancesSearch.trim()) {
        const q = balancesSearch.toLowerCase();
        const cat = categoryMap.get(ast.categoryId);
        const nameMatch = ast.name.toLowerCase().includes(q);
        const tickerMatch = (ast.tickerSymbol || '').toLowerCase().includes(q);
        const catMatch = (cat?.name || '').toLowerCase().includes(q);
        const currMatch = (ast.currency || '').toLowerCase().includes(q);
        if (!nameMatch && !tickerMatch && !catMatch && !currMatch) {
          return false;
        }
      }
      return true;
    });
  }, [assets, holdings, categoryMap, balancesFilterTab, balancesSearch]);

  const totalHoldingsValue = useMemo(() => {
    return assets.reduce((sum, a) => {
      const qty = holdings[a.id] || 0;
      const price = getAssetBasePrice(a, undefined, undefined, 32.5);
      return sum + qty * price;
    }, 0);
  }, [assets, holdings]);

  const positiveHoldingsCount = useMemo(() => {
    return assets.filter((a) => (holdings[a.id] || 0) > 0).length;
  }, [assets, holdings]);

  const handleOpenConvertWithAsset = (assetId: string) => {
    setIsBalancesModalOpen(false);
    setEditingTx(null);
    setAction('convert');
    setDate(new Date().toISOString().slice(0, 10));
    setFromAssetId(assetId);
    setFromValueStr('');
    const otherAsset = assets.find((a) => a.id !== assetId);
    if (otherAsset) {
      setToAssetId(otherAsset.id);
    }
    setToValueStr('');
    setNote('');
    setIsModalOpen(true);
  };

  const handleOpenDepositWithAsset = (assetId: string) => {
    setIsBalancesModalOpen(false);
    setEditingTx(null);
    setAction('add');
    setDate(new Date().toISOString().slice(0, 10));
    setFromAssetId('');
    setFromValueStr('');
    setToAssetId(assetId);
    setToValueStr('');
    setNote('');
    setIsModalOpen(true);
  };

  // Live Guard Band validation for Convert modal
  const selectedFromAsset = fromAssetId ? assetMap.get(fromAssetId) : undefined;
  const parsedModalFromVal = useMemo(() => parseFormattedNumber(fromValueStr), [fromValueStr]);
  const convertGuardBandCheck = useMemo(() => {
    return validateConvertGuardBand(
      transactions,
      selectedFromAsset,
      parsedModalFromVal,
      date,
      editingTx?.id
    );
  }, [transactions, selectedFromAsset, parsedModalFromVal, date, editingTx]);

  // Filter and sort transactions for display
  const filteredTransactions = useMemo(() => {
    return transactions.filter((tx) => {
      if (filterActions.length > 0 && !filterActions.includes(tx.action)) return false;
      if (filterAssetIds.length > 0) {
        const matchFrom = tx.fromAssetId ? filterAssetIds.includes(tx.fromAssetId) : false;
        const matchTo = tx.toAssetId ? filterAssetIds.includes(tx.toAssetId) : false;
        if (!matchFrom && !matchTo) {
          return false;
        }
      }
      if (filterMonths.length > 0) {
        const txMonth = tx.date && tx.date.length >= 7 ? tx.date.slice(0, 7) : '';
        if (!filterMonths.includes(txMonth)) {
          return false;
        }
      }
      return true;
    }).sort((a, b) => {
      // Primary sort: Date
      const dateCmp = a.date.localeCompare(b.date);
      if (dateCmp !== 0) {
        return sortAsc ? dateCmp : -dateCmp;
      }
      // Secondary tie-breaker for transactions on the same date: Creation timestamp or ID
      const timeA = a.createdAt || a.id || '';
      const timeB = b.createdAt || b.id || '';
      const timeCmp = timeA.localeCompare(timeB);
      if (timeCmp !== 0) {
        return sortAsc ? timeCmp : -timeCmp;
      }
      // Tertiary tie-breaker: ID
      const idA = a.id || '';
      const idB = b.id || '';
      return sortAsc ? idA.localeCompare(idB) : idB.localeCompare(idA);
    });
  }, [transactions, filterActions, filterAssetIds, filterMonths, sortAsc]);

  // Group filtered transactions into month categories
  const groupedTransactionsByMonth = useMemo(() => {
    const groups: {
      monthKey: string;
      monthTitle: string;
      transactions: LedgerTransaction[];
      addCount: number;
      convertCount: number;
      withdrawCount: number;
      dividendCount: number;
    }[] = [];

    const map = new Map<string, LedgerTransaction[]>();

    for (const tx of filteredTransactions) {
      const m = tx.date && tx.date.length >= 7 ? tx.date.slice(0, 7) : 'Unspecified Date';
      if (!map.has(m)) {
        map.set(m, []);
      }
      map.get(m)!.push(tx);
    }

    // Sort month categories based on sortAsc
    const sortedKeys = Array.from(map.keys()).sort((a, b) => {
      if (a === 'Unspecified Date') return 1;
      if (b === 'Unspecified Date') return -1;
      return sortAsc ? a.localeCompare(b) : b.localeCompare(a);
    });

    for (const key of sortedKeys) {
      const txs = map.get(key) || [];
      let addCount = 0;
      let convertCount = 0;
      let withdrawCount = 0;
      let dividendCount = 0;

      for (const t of txs) {
        if (t.action === 'add') addCount++;
        else if (t.action === 'convert') convertCount++;
        else if (t.action === 'withdraw') withdrawCount++;
        else if (t.action === 'dividend') dividendCount++;
      }

      let monthTitle = key;
      if (isLiveMonth(key)) {
        monthTitle = 'Live';
      } else if (key.includes('-')) {
        const [y, m] = key.split('-');
        const d = new Date(parseInt(y, 10), parseInt(m, 10) - 1, 1);
        monthTitle = d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
      }

      groups.push({
        monthKey: key,
        monthTitle,
        transactions: txs,
        addCount,
        convertCount,
        withdrawCount,
        dividendCount,
      });
    }

    return groups;
  }, [filteredTransactions, sortAsc]);

  // Open modal for creating or editing
  const handleOpenModal = (tx?: LedgerTransaction, initialAction: TransactionType = 'add') => {
    setFormError('');
    if (tx) {
      setEditingTx(tx);
      setAction(tx.action);
      setDate(tx.date);
      const withdrawVal = tx.action === 'withdraw' ? (tx.fromValue || tx.toValue) : tx.fromValue;
      setFromAssetId(tx.fromAssetId || (tx.action === 'withdraw' ? tx.toAssetId : ''));
      setFromValueStr(withdrawVal > 0 ? formatNumberWithCommas(withdrawVal) : '');
      setToAssetId(tx.toAssetId);
      setToValueStr(formatNumberWithCommas(tx.toValue));
      setNote(tx.note || '');
    } else {
      setEditingTx(null);
      setAction(initialAction);
      setDate(new Date().toISOString().slice(0, 10));
      setFromAssetId('');
      setFromValueStr('');
      const nonEFCash = cashAssets.find((c) => !isEmergencyFundAsset(c));
      const efAsset = emergencyFundAssets[0];
      if (initialAction === 'withdraw') {
        const defaultWithdraw = efAsset || nonEFCash || assets[0];
        setFromAssetId(defaultWithdraw?.id || '');
        setToAssetId(defaultWithdraw?.id || '');
        setToValueStr('');
        setNote('Emergency Expense');
      } else {
        setToAssetId(nonEFCash?.id || cashAssets[0]?.id || assets[0]?.id || '');
        setToValueStr('');
        setNote(initialAction === 'dividend' ? 'Cash Dividend' : '');
      }
    }
    setIsModalOpen(true);
  };

  const handleSaveModal = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    if (!date) {
      setFormError('Please select a transaction date.');
      return;
    }

    // Action: 'withdraw' (Decrease Emergency Fund or Cash holding)
    if (action === 'withdraw') {
      if (!fromAssetId) {
        setFormError('Please select an asset to withdraw or spend from.');
        return;
      }
      const parsedWithdrawVal = parseFormattedNumber(fromValueStr || toValueStr);
      if (parsedWithdrawVal <= 0) {
        setFormError('Please enter a valid positive quantity to withdraw.');
        return;
      }

      // Enforce per-asset Guard Band (must not drop below 0 or below minimum reserve floor on date)
      const guardResult = validateConvertGuardBand(
        transactions,
        assetMap.get(fromAssetId),
        parsedWithdrawVal,
        date,
        editingTx?.id
      );
      if (!guardResult.isValid) {
        setFormError(
          guardResult.errorMessage ||
            'Guard Band Triggered: Cannot withdraw more than available balance on this date.'
        );
        return;
      }

      if (editingTx) {
        onEditTransaction(editingTx.id, {
          action: 'withdraw',
          date,
          fromAssetId,
          fromValue: parsedWithdrawVal,
          toAssetId: fromAssetId,
          toValue: 0,
          note: note.trim() || 'Emergency / Cash Withdrawal',
        });
      } else {
        onAddTransaction({
          action: 'withdraw',
          date,
          fromAssetId,
          fromValue: parsedWithdrawVal,
          toAssetId: fromAssetId,
          toValue: 0,
          note: note.trim() || 'Emergency / Cash Withdrawal',
        });
      }
      setIsModalOpen(false);
      return;
    }

    const parsedToVal = parseFormattedNumber(toValueStr);
    if (parsedToVal <= 0) {
      setFormError('Please enter a valid positive quantity for the "To" asset.');
      return;
    }

    if (!toAssetId) {
      setFormError('Please select a destination "To" asset.');
      return;
    }

    // Action: 'add' (External Capital Deposit into Cash, Stablecoin, or Asset)
    if (action === 'add') {
      const targetAst = assetMap.get(toAssetId);
      const targetCurr = (targetAst?.currency || 'NTD').toUpperCase();
      const isNtdCashOrEf =
        isEmergencyFundAsset(targetAst) ||
        (Boolean(targetAst?.isCash) && (targetCurr === 'NTD' || targetCurr === 'TWD'));
      const parsedExplicitBasis = !isNtdCashOrEf ? parseFormattedNumber(fromValueStr) : 0;

      if (editingTx) {
        onEditTransaction(editingTx.id, {
          action: 'add',
          date,
          fromAssetId: null,
          fromValue: parsedExplicitBasis > 0 ? parsedExplicitBasis : 0,
          toAssetId,
          toValue: parsedToVal,
          note: note.trim() || undefined,
        });
      } else {
        onAddTransaction({
          action: 'add',
          date,
          fromAssetId: null,
          fromValue: parsedExplicitBasis > 0 ? parsedExplicitBasis : 0,
          toAssetId,
          toValue: parsedToVal,
          note: note.trim() || undefined,
        });
      }
    } else if (action === 'dividend') {
      // Passive Dividend / Interest / Staking / DRIP yield
      if (editingTx) {
        onEditTransaction(editingTx.id, {
          action: 'dividend',
          date,
          fromAssetId: fromAssetId || null,
          fromValue: 0,
          toAssetId,
          toValue: parsedToVal,
          note: note.trim() || 'Dividend / Interest Yield',
        });
      } else {
        onAddTransaction({
          action: 'dividend',
          date,
          fromAssetId: fromAssetId || null,
          fromValue: 0,
          toAssetId,
          toValue: parsedToVal,
          note: note.trim() || 'Dividend / Interest Yield',
        });
      }
    } else {
      // action === 'convert'
      if (!fromAssetId) {
        setFormError('Please select a source "From" asset to convert from.');
        return;
      }
      if (fromAssetId === toAssetId) {
        setFormError('The source "From" and destination "To" assets must be different.');
        return;
      }
      const parsedFromVal = parseFormattedNumber(fromValueStr);
      if (parsedFromVal <= 0) {
        setFormError('Please enter a valid positive quantity to deduct from the "From" asset.');
        return;
      }

      // Enforce per-asset Guard Band (Cash NTD, Cash USD, and any other asset cannot drop below 0 or below its guard band)
      const guardResult = validateConvertGuardBand(
        transactions,
        assetMap.get(fromAssetId),
        parsedFromVal,
        date,
        editingTx?.id
      );
      if (!guardResult.isValid) {
        setFormError(
          guardResult.errorMessage ||
            'Guard Band Triggered: Source asset balance cannot drop below 0 during Convert.'
        );
        return;
      }

      if (editingTx) {
        onEditTransaction(editingTx.id, {
          action: 'convert',
          date,
          fromAssetId,
          fromValue: parsedFromVal,
          toAssetId,
          toValue: parsedToVal,
          note: note.trim() || undefined,
        });
      } else {
        onAddTransaction({
          action: 'convert',
          date,
          fromAssetId,
          fromValue: parsedFromVal,
          toAssetId,
          toValue: parsedToVal,
          note: note.trim() || undefined,
        });
      }
    }

    setIsModalOpen(false);
  };

  const handleConfirmDelete = () => {
    if (!deletingTxId) return;
    onDeleteTransaction(deletingTxId);
    setDeletingTxId(null);
  };

  const addCount = transactions.filter((t) => t.action === 'add').length;
  const convertCount = transactions.filter((t) => t.action === 'convert').length;
  const withdrawCount = transactions.filter((t) => t.action === 'withdraw').length;
  const dividendCount = transactions.filter((t) => t.action === 'dividend').length;

  return (
    <div className="space-y-6 mb-12">
      
      {/* Overview & Quick Metrics Banner */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 sm:gap-4">
        {/* Card 1: Investment Capital Deposited */}
        <div className="fintech-card rounded-xl p-4 sm:p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
              <span className="font-semibold text-slate-300">Capital Deposited</span>
              <span className="text-[11px] text-slate-500">Principal Inflow</span>
            </div>
            <div className="text-2xl font-bold font-mono tabular-nums text-emerald-400 tracking-tight">
              {formatCurrency(totalDeposits, currencySymbol, stealthMode)}
            </div>
          </div>
          <div className="mt-3 pt-2.5 border-t border-slate-800/70 text-[11px] text-slate-400 flex items-center justify-between">
            <span>Out-of-pocket deposits</span>
            <span className="text-slate-500">Excludes EF &amp; Yield</span>
          </div>
        </div>

        {/* Card 2: Passive Income (Dividends & Interest) */}
        <div className="fintech-card rounded-xl p-4 sm:p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
              <span className="font-semibold text-violet-300">Dividends &amp; Yield</span>
              <span className="text-[11px] text-slate-500">Passive Income</span>
            </div>
            <div className="text-2xl font-bold font-mono tabular-nums text-violet-300 tracking-tight">
              {formatCurrency(totalDividendsEarned, currencySymbol, stealthMode)}
            </div>
          </div>
          <div className="mt-3 pt-2.5 border-t border-slate-800/70 flex items-center justify-between text-[11px] text-slate-400">
            <span>
              <strong className="font-mono tabular-nums text-slate-300">{dividendCount}</strong> Payouts <span aria-hidden="true">·</span> Boosts P&amp;L
            </span>
            <button
              type="button"
              onClick={() => handleOpenModal(undefined, 'dividend')}
              className="text-[11px] font-semibold text-violet-300 hover:text-violet-200 bg-violet-500/15 hover:bg-violet-500/25 px-2.5 py-0.5 rounded-md border border-violet-500/30 transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              + Record Yield
            </button>
          </div>
        </div>

        {/* Card 3: Emergency Fund */}
        <div className="fintech-card rounded-xl p-4 sm:p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
              <span className="font-semibold text-amber-400/90">Emergency Fund</span>
              <span className="text-[11px] text-slate-500">Safety Net</span>
            </div>
            <div className="text-2xl font-bold font-mono tabular-nums text-amber-300 tracking-tight">
              {formatCurrency(totalEmergencyFundBalance, currencySymbol, stealthMode)}
            </div>
          </div>
          <div className="mt-3 pt-2.5 border-t border-slate-800/70 flex items-center justify-between gap-2">
            <span className="text-[11px] text-slate-400">Excluded from P&amp;L</span>
            {emergencyFundAssets.length === 0 ? (
              <button
                type="button"
                onClick={() => handleQuickCreateEmergencyFund(true)}
                className="text-[11px] font-semibold text-amber-400 hover:text-amber-300 bg-amber-500/10 hover:bg-amber-500/20 px-2.5 py-0.5 rounded-md border border-amber-500/30 transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                + Setup EF
              </button>
            ) : (
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    setEditingTx(null);
                    setAction('withdraw');
                    setDate(new Date().toISOString().slice(0, 10));
                    setFromAssetId(emergencyFundAssets[0].id);
                    setFromValueStr('');
                    setToAssetId(emergencyFundAssets[0].id);
                    setToValueStr('');
                    setNote('Emergency Expense');
                    setIsModalOpen(true);
                  }}
                  className="w-6 h-6 flex items-center justify-center text-sm font-bold text-rose-400 hover:text-rose-300 bg-rose-500/10 hover:bg-rose-500/20 rounded-md border border-rose-500/30 transition-colors cursor-pointer leading-none"
                  title="Spend from Emergency Fund (-)"
                >
                  &minus;
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEditingTx(null);
                    setAction('add');
                    setDate(new Date().toISOString().slice(0, 10));
                    setFromAssetId('');
                    setFromValueStr('');
                    setToAssetId(emergencyFundAssets[0].id);
                    setToValueStr('');
                    setNote('Emergency Fund deposit');
                    setIsModalOpen(true);
                  }}
                  className="w-6 h-6 flex items-center justify-center text-sm font-bold text-amber-400 hover:text-amber-300 bg-amber-500/10 hover:bg-amber-500/20 rounded-md border border-amber-500/30 transition-colors cursor-pointer leading-none"
                  title="Deposit to Emergency Fund (+)"
                >
                  +
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Card 4: Current Quantity Balances (Clickable for full breakdown, Up/Down for individual asset) */}
        <div
          onClick={() => setIsBalancesModalOpen(true)}
          className="fintech-card hover:border-amber-500/40 rounded-xl p-4 sm:p-5 cursor-pointer group transition-all flex flex-col justify-between relative overflow-hidden"
          title="Click to view full Current Quantity Balances breakdown"
        >
          <div>
            <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
              <span className="font-semibold text-slate-300 group-hover:text-amber-300 transition-colors">
                Current Quantity Balances
              </span>
              <span className="inline-flex items-center gap-1 text-[11px] text-slate-500 group-hover:text-amber-400 transition-colors">
                <Maximize2 className="w-3 h-3" />
                <span className="hidden sm:inline">Expand</span>
              </span>
            </div>

            {assets.length === 0 ? (
              <div className="mt-2 text-xs text-slate-500 italic">No assets defined yet.</div>
            ) : (() => {
              const currentIdx = ((balanceAssetIdx % assets.length) + assets.length) % assets.length;
              const curAst = assets[currentIdx];
              const curQty = holdings[curAst.id] || 0;
              const curCat = categoryMap.get(curAst.categoryId);
              const isEF = isEmergencyFundAsset(curAst);

              return (
                <div className="mt-1">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ backgroundColor: isEF ? '#f59e0b' : (curCat?.color || '#3b82f6') }}
                      />
                      <div className="min-w-0">
                        <div className="font-semibold text-xs sm:text-sm text-slate-100 truncate flex items-center gap-1.5">
                          <span className="truncate">{curAst.name}</span>
                          {isCashOrStablecoinAsset(curAst) && curAst.currency && (
                            <span className="text-[10px] text-slate-400 font-mono tabular-nums font-normal shrink-0">
                              [{curAst.currency}]
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-slate-500 truncate">
                          {curAst.tickerSymbol ? `${curAst.tickerSymbol} · ` : ''}
                          {curCat?.name || (isEF ? 'Emergency Fund' : 'Asset')}
                        </div>
                      </div>
                    </div>

                    {/* Up & Down cycling buttons */}
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setBalanceAssetIdx((prev) => (prev - 1 + assets.length) % assets.length);
                        }}
                        className="w-6 h-6 flex items-center justify-center rounded-md bg-[#080C14] hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-800 hover:border-slate-700 transition-colors cursor-pointer"
                        title="Previous Asset"
                      >
                        <ChevronUp className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setBalanceAssetIdx((prev) => (prev + 1) % assets.length);
                        }}
                        className="w-6 h-6 flex items-center justify-center rounded-md bg-[#080C14] hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-800 hover:border-slate-700 transition-colors cursor-pointer"
                        title="Next Asset"
                      >
                        <ChevronDown className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <div className="mt-1.5 flex items-baseline justify-between">
                    <div className={`text-xl sm:text-2xl font-bold font-mono tabular-nums tracking-tight ${
                      curQty > 0
                        ? (isEF ? 'text-amber-300' : 'text-emerald-400')
                        : curQty < 0
                        ? 'text-rose-400'
                        : 'text-slate-400'
                    }`}>
                      {stealthMode ? '••••' : formatNumberWithCommas(curQty)}
                    </div>
                    <span className="text-[11px] font-mono tabular-nums text-slate-500">
                      {currentIdx + 1} / {assets.length}
                    </span>
                  </div>
                </div>
              );
            })()}
          </div>
          <div className="mt-2.5 pt-2 border-t border-slate-800/70 flex items-center justify-between text-[11px] text-slate-400 group-hover:text-amber-300 transition-colors">
            <span className="font-mono tabular-nums">{assets.length} Positions · {positiveHoldingsCount} Active</span>
            <span className="font-semibold flex items-center gap-0.5">
              <span>View full breakdown</span> &rarr;
            </span>
          </div>
        </div>
      </div>

      {/* Main Ledger Card */}
      <div className="fintech-card rounded-xl overflow-hidden">
        
        {/* Header and Controls Bar */}
        <div className="p-4 sm:p-5 border-b border-slate-800/80 flex flex-col md:flex-row items-center justify-between gap-4 bg-[#080C14]/50">
          <div>
            <h3 className="text-base font-bold text-slate-100 tracking-tight">
              Quantity-Based Transaction Ledger
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Date <span aria-hidden="true">·</span> Action (Add / Convert / Withdraw / Yield) <span aria-hidden="true">·</span> Source <span aria-hidden="true">·</span> Destination Quantity
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 w-full md:w-auto justify-end">
            {/* Month Category Filter (Multi-Choice) */}
            <CustomDropdown
              multiple
              selectedValues={filterMonths}
              onMultiChange={(vals) => setFilterMonths(vals)}
              options={monthFilterOptions}
              className="w-40 sm:w-48"
              maxHeight="max-h-64"
            />

            {/* Action Filter (Multi-Choice) */}
            <CustomDropdown
              multiple
              selectedValues={filterActions}
              onMultiChange={(vals) => setFilterActions(vals as TransactionType[])}
              options={actionFilterOptions}
              className="w-36 sm:w-40"
              maxHeight="max-h-64"
            />

            {/* Asset Filter (Multi-Choice) */}
            <CustomDropdown
              multiple
              selectedValues={filterAssetIds}
              onMultiChange={(vals) => setFilterAssetIds(vals)}
              options={assetFilterOptions}
              className="w-40 sm:w-48"
              maxHeight="max-h-64"
              enableSearch={assets.length >= 6}
            />

            {(filterMonths.length > 0 || filterActions.length > 0 || filterAssetIds.length > 0) && (
              <button
                type="button"
                onClick={() => {
                  setFilterMonths([]);
                  setFilterActions([]);
                  setFilterAssetIds([]);
                }}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 text-[11px] font-semibold transition-all cursor-pointer whitespace-nowrap shrink-0"
                title="Clear all active filters"
              >
                <X className="w-3 h-3" />
                <span>Clear</span>
              </button>
            )}

            {/* Sort Order Button (Ascending or Descending) */}
            <button
              type="button"
              onClick={() => setSortAsc(!sortAsc)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#080C14] hover:bg-slate-900 text-slate-200 hover:text-white border border-slate-800 hover:border-slate-700 text-xs font-medium transition-all cursor-pointer whitespace-nowrap shrink-0"
              title={sortAsc ? 'Sort Order: Ascending (Oldest to Newest). Click to switch to Descending.' : 'Sort Order: Descending (Newest to Oldest). Click to switch to Ascending.'}
            >
              {sortAsc ? (
                <ArrowUp className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              ) : (
                <ArrowDown className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              )}
              <span>{sortAsc ? 'Ascending' : 'Descending'}</span>
            </button>

            {/* Add New Transaction Button */}
            <button
              onClick={() => handleOpenModal()}
              className="flex items-center gap-1.5 text-xs font-semibold text-slate-950 bg-emerald-400 hover:bg-emerald-300 px-4 py-1.5 rounded-lg transition-all cursor-pointer whitespace-nowrap shrink-0"
            >
              <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
              <span>Record</span>
            </button>
          </div>
        </div>

        {/* Ledger Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-[#080C14] text-slate-400 font-semibold border-b border-slate-800/80 text-[11px]">
                <th className="py-3 px-4 w-28 min-w-28">Date</th>
                <th className="py-3 px-4 w-28 min-w-28 text-center">Action</th>
                <th className="py-3 px-4 min-w-48">From (Source &amp; Quantity)</th>
                <th className="py-3 px-4 min-w-48">To (Destination &amp; Quantity)</th>
                <th className="py-3 px-4 min-w-48">Note</th>
                <th className="py-3 px-4 w-24 text-center">Manage</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-800/50 text-slate-200">
              {groupedTransactionsByMonth.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-12 text-center text-slate-500">
                    {transactions.length > 0 && (filterMonths.length > 0 || filterActions.length > 0 || filterAssetIds.length > 0) ? (
                      <div className="flex flex-col items-center justify-center space-y-3">
                        <div className="w-10 h-10 rounded-lg bg-slate-800/80 border border-slate-700/60 flex items-center justify-center text-slate-400">
                          <Filter className="w-5 h-5" />
                        </div>
                        <div className="text-sm font-semibold text-slate-300">No transactions match the selected filters</div>
                        <p className="text-xs text-slate-500 max-w-sm">
                          Try adjusting or resetting your Month, Action, or Asset multi-select filters.
                        </p>
                        <button
                          type="button"
                          onClick={() => {
                            setFilterMonths([]);
                            setFilterActions([]);
                            setFilterAssetIds([]);
                          }}
                          className="mt-1 px-3 py-1.5 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-xs font-semibold text-emerald-400 transition-colors cursor-pointer"
                        >
                          Reset All Filters
                        </button>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center space-y-3">
                        <div className="w-10 h-10 rounded-lg bg-slate-800/80 border border-slate-700/60 flex items-center justify-center text-slate-400">
                          <Coins className="w-5 h-5" />
                        </div>
                        <div className="text-sm font-semibold text-slate-300">No transactions recorded yet</div>
                        <p className="text-xs text-slate-500 max-w-sm">
                          Use <strong>Record</strong> above to deposit capital into your cash asset, convert cash into stocks, ETFs, gold, or crypto, or log dividends &amp; interest.
                        </p>
                        {assets.length === 0 && onOpenHierarchyTab && (
                          <button
                            onClick={onOpenHierarchyTab}
                            className="mt-2 text-xs font-semibold text-emerald-400 hover:text-emerald-300 underline cursor-pointer"
                          >
                            &rarr; Go to Assets &amp; Risk Hierarchy to add assets first
                          </button>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              ) : (
                groupedTransactionsByMonth.map((group) => {
                  const isExpanded = expandedMonths[group.monthKey] ?? (filterMonths.length > 0);

                  return (
                    <React.Fragment key={group.monthKey}>
                      {/* Month Category Header Row (Clickable to show/hide entries) */}
                      <tr 
                        onClick={() => toggleMonthExpand(group.monthKey)}
                        className="border-t border-b border-slate-800/90 bg-[#080C14]/90 cursor-pointer hover:bg-slate-900/90 transition-colors select-none group/month"
                        title={isExpanded ? 'Click to collapse month entries' : 'Click to expand month entries'}
                      >
                        <td colSpan={6} className="px-4 py-2.5">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-2.5">
                              <span className="p-1 rounded bg-slate-800/80 text-slate-400 group-hover/month:text-emerald-400 transition-colors">
                                {isExpanded ? (
                                  <ChevronDown className="w-3.5 h-3.5 text-emerald-400" />
                                ) : (
                                  <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                                )}
                              </span>
                              {isLiveMonth(group.monthKey) ? (
                                <span className="inline-flex items-center gap-2 font-bold text-emerald-400 text-xs sm:text-sm tracking-tight">
                                  <span className="relative flex h-2 w-2">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                                  </span>
                                  <span>Live</span>
                                </span>
                              ) : (
                                <>
                                  <span className="font-bold text-slate-100 text-xs sm:text-sm tracking-tight">
                                    {group.monthTitle}
                                  </span>
                                  <span className="text-slate-600" aria-hidden="true">·</span>
                                  <span className="font-mono tabular-nums text-[11px] text-emerald-400/90 font-medium">
                                    {group.monthKey}
                                  </span>
                                </>
                              )}
                              <span className="text-slate-600" aria-hidden="true">·</span>
                              <span className="text-[11px] text-slate-400 font-mono tabular-nums">
                                {group.transactions.length} {group.transactions.length === 1 ? 'entry' : 'entries'}
                              </span>
                            </div>

                            <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono tabular-nums">
                              {group.addCount > 0 && (
                                <span className="text-emerald-400 font-medium">
                                  +{group.addCount} Add
                                </span>
                              )}
                              {group.convertCount > 0 && (
                                <span className="text-sky-400 font-medium">
                                  {group.convertCount} Convert
                                </span>
                              )}
                              {group.withdrawCount > 0 && (
                                <span className="text-rose-400 font-medium">
                                  -{group.withdrawCount} Withdraw
                                </span>
                              )}
                              {group.dividendCount > 0 && (
                                <span className="text-violet-300 font-medium">
                                  {group.dividendCount} Yield
                                </span>
                              )}
                            </div>
                          </div>
                        </td>
                      </tr>

                      {/* Transaction rows for this month (Show when expanded, Hide when collapsed) */}
                      {isExpanded && group.transactions.map((tx) => {
                      const fromAst = tx.fromAssetId ? assetMap.get(tx.fromAssetId) : null;
                      const toAst = assetMap.get(tx.toAssetId);
                      const isAdd = tx.action === 'add';
                      const isDividend = tx.action === 'dividend';
                      const isWithdraw = tx.action === 'withdraw';

                      return (
                        <tr key={tx.id} className="hover:bg-slate-800/35 transition-colors">
                          {/* Date */}
                          <td className="py-3 px-4 font-mono tabular-nums text-slate-300 font-medium whitespace-nowrap">
                            {tx.date}
                          </td>

                          {/* Action Indicator */}
                          <td className="py-3 px-4 text-center whitespace-nowrap">
                            {isAdd ? (
                              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-400">
                                <ArrowDownLeft className="w-3.5 h-3.5" />
                                Add
                              </span>
                            ) : isWithdraw ? (
                              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-400">
                                <ArrowUpRight className="w-3.5 h-3.5" />
                                Withdraw
                              </span>
                            ) : isDividend ? (
                              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-violet-300">
                                <Sparkles className="w-3.5 h-3.5 text-violet-400" />
                                Yield
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-sky-400">
                                <RefreshCw className="w-3.5 h-3.5" />
                                Convert
                              </span>
                            )}
                          </td>

                          {/* From Asset & Value */}
                          <td className="py-3 px-4">
                            {isAdd ? (
                              <div className="flex flex-col gap-0.5">
                                <span className="text-slate-500 text-[11px]">
                                  &mdash; External Capital Deposit
                                </span>
                                {tx.fromValue > 0 && (
                                  <span className="text-[10px] font-mono text-emerald-400/90">
                                    Principal Basis: NT$ {stealthMode ? '••••' : formatNumberWithCommas(tx.fromValue)}
                                  </span>
                                )}
                              </div>
                            ) : isWithdraw ? (
                              <div className="flex items-center gap-2 font-mono tabular-nums">
                                <span className="font-semibold text-slate-200 font-sans">
                                  {(fromAst || toAst)?.name || 'Cash Asset'}
                                </span>
                                {isEmergencyFundAsset(fromAst || toAst) && (
                                  <span className="text-[10px] text-amber-400 font-sans font-medium">
                                    · EF
                                  </span>
                                )}
                                <span className="text-rose-400 font-semibold">
                                  -{stealthMode ? '••••' : formatNumberWithCommas(tx.fromValue || tx.toValue)}
                                </span>
                              </div>
                            ) : isDividend ? (
                              fromAst ? (
                                <span className="text-[11px] text-violet-300 font-medium">
                                  Yield from {fromAst.name}
                                </span>
                              ) : (
                                <span className="text-slate-500 text-[11px]">
                                  &mdash; Passive Interest / Yield
                                </span>
                              )
                            ) : (
                              <div className="flex items-center gap-2 font-mono tabular-nums">
                                <span className="font-semibold text-slate-200 font-sans">{fromAst?.name || 'Unknown Asset'}</span>
                                <span className="text-rose-400 font-semibold">
                                  -{stealthMode ? '••••' : formatNumberWithCommas(tx.fromValue)}
                                </span>
                              </div>
                            )}
                          </td>

                          {/* To Asset & Value */}
                          <td className="py-3 px-4">
                            {isWithdraw ? (
                              <span className="text-rose-400/80 text-[11px]">
                                &mdash; Emergency Spend / Outflow
                              </span>
                            ) : (
                              <div className="flex items-center gap-2 font-mono tabular-nums">
                                <span className="font-semibold text-slate-100 font-sans">{toAst?.name || 'Unknown Asset'}</span>
                                <span
                                  className={`font-semibold ${
                                    isDividend ? 'text-violet-300' : 'text-emerald-400'
                                  }`}
                                >
                                  +{stealthMode ? '••••' : formatNumberWithCommas(tx.toValue)}
                                </span>
                              </div>
                            )}
                          </td>

                          {/* Note */}
                          <td className="py-3 px-4 text-slate-400 max-w-xs truncate text-[11px]">
                            {tx.note || <span className="text-slate-600">&mdash;</span>}
                          </td>

                          {/* Manage Actions */}
                          <td className="py-3 px-4 text-center whitespace-nowrap">
                            <div className="flex items-center justify-center space-x-1">
                              <button
                                onClick={() => handleOpenModal(tx)}
                                className="p-1.5 text-slate-400 hover:text-emerald-400 hover:bg-slate-800/70 rounded-md transition-colors cursor-pointer"
                                title="Edit this transaction"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => setDeletingTxId(tx.id)}
                                className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-slate-800/70 rounded-md transition-colors cursor-pointer"
                                title="Delete this transaction"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </React.Fragment>
                );
              })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Transaction Add / Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden">
            
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
              <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
                <Coins className="w-5 h-5 text-emerald-400" />
                <span>{editingTx ? 'Edit Transaction' : 'Record New Transaction'}</span>
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-200 text-lg leading-none cursor-pointer"
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleSaveModal} className="p-5 space-y-4">
              
              {/* Action Selection Tabs (Add vs Convert vs Dividend/Interest) */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-2">
                  Select Action
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 p-1 bg-slate-950 rounded-xl border border-slate-800">
                  <button
                    type="button"
                    onClick={() => {
                      setAction('add');
                      if (cashAssets.length > 0 && !cashAssets.some((c) => c.id === toAssetId)) {
                        setToAssetId(cashAssets[0].id);
                      }
                    }}
                    className={`py-2 px-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1 cursor-pointer ${
                      action === 'add'
                        ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <ArrowDownLeft className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">Add</span>
                  </button>

                  <button
                    type="button"
                    disabled={!hasCashFound && !editingTx}
                    onClick={() => {
                      if (!hasCashFound && !editingTx) return;
                      setAction('convert');
                      const firstValidFrom = convertibleAssets[0] || assets[0];
                      if (firstValidFrom) {
                        const nextFromId =
                          fromAssetId && convertibleAssets.some((c) => c.id === fromAssetId)
                            ? fromAssetId
                            : firstValidFrom.id;
                        setFromAssetId(nextFromId);
                        const otherAsset = assets.find((a) => a.id !== nextFromId);
                        if (otherAsset && (!toAssetId || toAssetId === nextFromId)) {
                          setToAssetId(otherAsset.id);
                        }
                      }
                    }}
                    title={!hasCashFound ? 'Convert is unavailable: Need at least 2 assets.' : ''}
                    className={`py-2 px-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1 ${
                      !hasCashFound && !editingTx
                        ? 'opacity-40 cursor-not-allowed bg-slate-900 border border-slate-800 text-slate-500'
                        : action === 'convert'
                        ? 'bg-blue-500 text-white shadow-md shadow-blue-500/20 cursor-pointer'
                        : 'text-slate-400 hover:text-slate-200 cursor-pointer'
                    }`}
                  >
                    <RefreshCw className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">Convert</span>
                  </button>

                  <button
                    type="button"
                    disabled={assets.length === 0}
                    onClick={() => {
                      if (assets.length === 0) return;
                      setAction('withdraw');
                      const efAsset = emergencyFundAssets[0];
                      const nonEFCash = cashAssets.find((c) => !isEmergencyFundAsset(c));
                      const defaultAsset = efAsset || nonEFCash || assets[0];
                      if (defaultAsset) {
                        setFromAssetId(defaultAsset.id);
                        setToAssetId(defaultAsset.id);
                      }
                      if (!note) {
                        setNote('Emergency Expense');
                      }
                    }}
                    className={`py-2 px-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1 ${
                      assets.length === 0
                        ? 'opacity-40 cursor-not-allowed bg-slate-900 border border-slate-800 text-slate-500'
                        : action === 'withdraw'
                        ? 'bg-rose-500 text-white shadow-md shadow-rose-500/20 cursor-pointer'
                        : 'text-slate-400 hover:text-slate-200 cursor-pointer'
                    }`}
                  >
                    <ArrowUpRight className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">Withdraw</span>
                  </button>

                  <button
                    type="button"
                    disabled={assets.length === 0}
                    onClick={() => {
                      if (assets.length === 0) return;
                      setAction('dividend');
                      const nonEFCash = cashAssets.find((c) => !isEmergencyFundAsset(c));
                      if (!toAssetId && (nonEFCash || assets[0])) {
                        setToAssetId((nonEFCash || assets[0]).id);
                      }
                      if (!note) {
                        setNote('Cash Dividend');
                      }
                    }}
                    className={`py-2 px-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1 ${
                      assets.length === 0
                        ? 'opacity-40 cursor-not-allowed bg-slate-900 border border-slate-800 text-slate-500'
                        : action === 'dividend'
                        ? 'bg-violet-500 text-white shadow-md shadow-violet-500/20 cursor-pointer'
                        : 'text-slate-400 hover:text-slate-200 cursor-pointer'
                    }`}
                  >
                    <Sparkles className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">Yield</span>
                  </button>
                </div>
                {!hasCashFound && action === 'convert' && (
                  <p className="text-[11px] text-amber-400 mt-1.5 flex items-center gap-1 font-medium">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    <span>Convert unavailable: Need at least 2 assets defined in your portfolio.</span>
                  </p>
                )}
              </div>

              {/* Date Field */}
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Transaction Date
                </label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  required
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-100 font-mono focus:outline-none focus:border-emerald-500"
                />
              </div>

              {/* If 'Add' Action: From is External Deposit, To is Cash Asset */}
              {action === 'add' && (
                <div className="space-y-3 p-3.5 rounded-xl bg-emerald-950/10 border border-emerald-500/20">
                  <div className="flex items-center justify-between">
                    <div className="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
                      <ArrowDownLeft className="w-4 h-4" />
                      <span>Deposit External Capital into Cash</span>
                    </div>
                    {emergencyFundAssets.length === 0 && onAddAssetWithCategory && (
                      <button
                        type="button"
                        onClick={() => handleQuickCreateEmergencyFund(false)}
                        className="text-[10px] font-bold text-amber-400 hover:text-amber-300 bg-amber-500/10 hover:bg-amber-500/20 px-2 py-0.5 rounded-lg border border-amber-500/30 transition-colors cursor-pointer"
                      >
                        + Create Emergency Fund Asset
                      </button>
                    )}
                  </div>

                  <div>
                    <label className="block text-[11px] font-medium text-slate-400 mb-1">
                      Deposit Into (Cash, Stablecoins like USDT/USDC, or Portfolio Assets)
                    </label>
                    {assets.length === 0 ? (
                      <div className="text-xs text-amber-400 p-2.5 bg-amber-950/20 rounded-lg border border-amber-800/40 space-y-2">
                        <p>
                          No assets found! Go to <strong>Assets &amp; Risk Hierarchy</strong> to add an asset, or quick-create an Emergency Fund asset below:
                        </p>
                        {onAddAssetWithCategory && (
                          <button
                            type="button"
                            onClick={() => handleQuickCreateEmergencyFund(false)}
                            className="px-3 py-1.5 rounded-lg bg-amber-500 text-slate-950 font-bold text-xs cursor-pointer"
                          >
                            + Quick-Create Emergency Fund (NTD)
                          </button>
                        )}
                      </div>
                    ) : (
                      <CustomDropdown
                        value={toAssetId}
                        onChange={(val) => setToAssetId(val)}
                        options={depositToAssetOptions}
                        className="w-full"
                        maxHeight="max-h-60"
                        enableSearch={assets.length >= 6}
                      />
                    )}
                  </div>

                  {isEmergencyFundAsset(assetMap.get(toAssetId)) && (
                    <div className="p-2.5 rounded-lg bg-amber-950/30 border border-amber-500/30 text-[11px] text-amber-300 flex items-start gap-2">
                      <ShieldCheck className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                      <span>
                        <strong>Emergency Fund Safety Net Rule:</strong> This deposit increases your <strong>Emergency Fund</strong> and <strong>Total Capital</strong>, and is strictly excluded from <strong>Total Invested</strong>, <strong>Floating P/L</strong>, and <strong>Rebalancing</strong>.
                      </span>
                    </div>
                  )}

                  {(() => {
                    const selectedToAsset = assetMap.get(toAssetId);
                    const selectedCurr = (selectedToAsset?.currency || 'NTD').toUpperCase();
                    const isNtdCashOrEf =
                      isEmergencyFundAsset(selectedToAsset) ||
                      (Boolean(selectedToAsset?.isCash) && (selectedCurr === 'NTD' || selectedCurr === 'TWD'));

                    return (
                      <div className="space-y-3">
                        <div className={isNtdCashOrEf ? '' : 'grid grid-cols-1 sm:grid-cols-2 gap-3'}>
                          <div>
                            <label className="block text-[11px] font-medium text-slate-400 mb-1">
                              {isNtdCashOrEf
                                ? 'Deposit Amount (NT$)'
                                : `Deposit Quantity (${selectedToAsset?.isCash ? selectedCurr : 'Coins / Shares / Units'})`}
                            </label>
                            <input
                              type="text"
                              placeholder={isNtdCashOrEf ? 'e.g. 50,000' : 'e.g. 0.045 or 1,000'}
                              value={toValueStr}
                              onChange={(e) => setToValueStr(formatNumberWithCommas(e.target.value))}
                              required
                              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm font-mono text-emerald-400 font-bold focus:outline-none focus:border-emerald-500"
                            />
                          </div>

                          {!isNtdCashOrEf && (
                            <div>
                              <label className="block text-[11px] font-medium text-slate-300 mb-1">
                                Principal Invested / Cost Basis (NT$)
                              </label>
                              <input
                                type="text"
                                placeholder="e.g. 140,000 (Optional exact NTD cost)"
                                value={fromValueStr}
                                onChange={(e) => setFromValueStr(formatNumberWithCommas(e.target.value))}
                                className="w-full bg-slate-950 border border-emerald-500/40 rounded-xl px-3 py-2 text-sm font-mono text-slate-100 font-bold focus:outline-none focus:border-emerald-400"
                              />
                            </div>
                          )}
                        </div>

                        {!isNtdCashOrEf && (
                          <div className="p-2.5 rounded-lg bg-slate-900/80 border border-slate-800 text-[11px] text-slate-400 leading-relaxed">
                            <span className="text-emerald-400 font-semibold">Cost Basis Tip:</span> When depositing{' '}
                            <strong className="text-slate-200">{selectedToAsset?.name || 'an asset'}</strong> directly via{' '}
                            <strong>Add</strong> (instead of converting from Cash NTD), enter your exact{' '}
                            <strong className="text-slate-200">Principal Invested in NT$</strong> (e.g., your Binance or brokerage cost basis like <span className="font-mono text-slate-200">140,000</span>) so{' '}
                            <strong>Total Principal Invested</strong> and <strong>Floating P&amp;L</strong> match your exchange account exactly.
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>
              )}

              {/* If 'Dividend / Interest' Action: Passive Portfolio Yield */}
              {action === 'dividend' && (
                <div className="space-y-3.5 p-3.5 rounded-xl bg-violet-950/15 border border-violet-500/25">
                  <div className="text-xs font-bold text-violet-300 flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4 text-violet-400" />
                    <span>Record Dividend, Interest, or Staking Yield</span>
                  </div>

                  <div className="p-2.5 rounded-lg bg-violet-950/30 border border-violet-500/20 text-[11px] text-violet-200/90 leading-relaxed">
                    <strong>Passive Income Rule:</strong> Increases your asset holdings and <strong>Floating P/L (ROI)</strong> without increasing out-of-pocket <strong>Total Money Invested</strong>. Supports both <strong>Cash Dividends / Interest</strong> and <strong>DRIP (Reinvested Shares/Crypto)</strong>.
                  </div>

                  {/* Source Asset Generating Yield (Optional) */}
                  <div>
                    <label className="block text-[11px] font-medium text-slate-400 mb-1">
                      Source Asset Generating Yield (Optional)
                    </label>
                    <CustomDropdown
                      value={fromAssetId}
                      onChange={(val) => setFromAssetId(val)}
                      options={yieldSourceAssetOptions}
                      className="w-full"
                      maxHeight="max-h-60"
                      enableSearch={assets.length >= 6}
                    />
                  </div>

                  {/* Receiving Asset (Cash for Cash Payout, or Stock/Crypto for DRIP/Staking) */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-medium text-slate-400 mb-1">
                        Payout Destination (Received Into)
                      </label>
                      <CustomDropdown
                        value={toAssetId}
                        onChange={(val) => setToAssetId(val)}
                        options={yieldDestinationAssetOptions}
                        className="w-full"
                        maxHeight="max-h-60"
                        enableSearch={assets.length >= 6}
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-medium text-slate-400 mb-1">
                        Quantity / Payout Received
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. 1,500 or 0.15 shares"
                        value={toValueStr}
                        onChange={(e) => setToValueStr(formatNumberWithCommas(e.target.value))}
                        required
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs font-mono text-violet-300 font-bold focus:outline-none focus:border-violet-500"
                      />
                    </div>
                  </div>

                  {/* Quick Yield Type Presets */}
                  <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                    <span className="text-[10px] text-slate-500">Quick tag:</span>
                    {['Cash Dividend', 'High-Yield Interest', 'DRIP Reinvestment', 'Staking Reward'].map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => setNote(preset)}
                        className={`text-[10px] px-2 py-0.5 rounded-md border transition-colors cursor-pointer ${
                          note === preset
                            ? 'bg-violet-500/20 border-violet-500/50 text-violet-300 font-semibold'
                            : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        {preset}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* If 'Withdraw / Emergency' Action: Decrease Cash or Emergency Fund */}
              {action === 'withdraw' && (
                <div className="space-y-4 p-3.5 rounded-xl bg-rose-950/15 border border-rose-500/25">
                  <div className="flex items-center justify-between">
                    <div className="text-xs font-bold text-rose-400 flex items-center gap-1.5">
                      <ShieldAlert className="w-4 h-4 text-rose-400" />
                      <span>Withdraw Cash or Emergency Fund</span>
                    </div>
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-300 border border-amber-500/30 flex items-center gap-1">
                      <ShieldCheck className="w-3 h-3 text-amber-400" />
                      Guard Band (&ge; 0)
                    </span>
                  </div>

                  {/* Context notice */}
                  <div className="p-2.5 rounded-lg bg-rose-950/30 border border-rose-500/20 text-[11px] text-rose-200/90 leading-relaxed space-y-1">
                    {isEmergencyFundAsset(selectedFromAsset) ? (
                      <p>
                        <strong>Emergency Fund Safety Net Rule:</strong> Reduces your <strong>Emergency Fund</strong> reserve and <strong>Total Capital</strong> for unexpected emergencies. It has <strong>zero effect</strong> on your investment Floating P/L, ROI, or Rebalancing.
                      </p>
                    ) : (
                      <p>
                        <strong>Cash Withdrawal Rule:</strong> Decreases your cash holdings and decreases net out-of-pocket capital deposited.
                      </p>
                    )}
                    <p className="text-[10px] text-rose-300/70">
                      Guard Band: Withdrawals cannot exceed the balance available on {date} (&ge; 0 is allowed; withdrawing 100% down to 0 is permitted).
                    </p>
                  </div>

                  {/* Asset to Withdraw From and Quantity */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-medium text-slate-400 mb-1">
                        Asset to Withdraw / Spend From
                      </label>
                      <CustomDropdown
                        value={fromAssetId}
                        onChange={(val) => {
                          setFromAssetId(val);
                          setToAssetId(val);
                        }}
                        options={withdrawFromAssetOptions}
                        className="w-full"
                        maxHeight="max-h-60"
                        enableSearch={assets.length >= 6}
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-medium text-slate-400 mb-1">
                        Withdrawal Quantity / Amount
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. 10,000"
                        value={fromValueStr}
                        onChange={(e) => {
                          const v = formatNumberWithCommas(e.target.value);
                          setFromValueStr(v);
                          setToValueStr(v);
                        }}
                        required
                        className={`w-full bg-slate-950 border rounded-xl px-3 py-2 text-xs font-mono font-bold focus:outline-none ${
                          parsedModalFromVal > 0 && !convertGuardBandCheck.isValid
                            ? 'border-rose-500 text-rose-400 focus:border-rose-400'
                            : 'border-slate-800 text-rose-400 focus:border-rose-500'
                        }`}
                      />
                    </div>
                  </div>

                  {/* Guard Band Live Status for Withdraw */}
                  {selectedFromAsset && (
                    <div
                      className={`p-3 rounded-xl border text-[11px] space-y-2 transition-colors ${
                        parsedModalFromVal > 0 && !convertGuardBandCheck.isValid
                          ? 'bg-rose-950/35 border-rose-500/50 text-rose-200'
                          : 'bg-slate-950/80 border-slate-800 text-slate-300'
                      }`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 font-semibold">
                          <ShieldCheck
                            className={`w-3.5 h-3.5 shrink-0 ${
                              parsedModalFromVal > 0 && !convertGuardBandCheck.isValid
                                ? 'text-rose-400'
                                : 'text-emerald-400'
                            }`}
                          />
                          <span>
                            Guard Band: <strong>{selectedFromAsset.name}</strong>
                          </span>
                        </div>
                        <span
                          className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border ${
                            parsedModalFromVal > 0 && !convertGuardBandCheck.isValid
                              ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                              : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                          }`}
                        >
                          {parsedModalFromVal > 0 && !convertGuardBandCheck.isValid
                            ? convertGuardBandCheck.remainingAfterConvert < 0
                              ? 'BLOCKED: EXCEEDS BALANCE (< 0)'
                              : 'BELOW GUARD BAND FLOOR'
                            : 'GUARD BAND SAFE (≥ 0)'}
                        </span>
                      </div>

                      <div className="grid grid-cols-3 gap-2 font-mono text-[11px] bg-slate-900/90 p-2 rounded-lg border border-slate-800/80">
                        <div>
                          <div className="text-[9px] text-slate-500 uppercase font-sans">Available</div>
                          <div className="text-slate-200 font-bold">
                            {formatNumberWithCommas(convertGuardBandCheck.effectiveAvailable)}
                          </div>
                        </div>
                        <div>
                          <div className="text-[9px] text-slate-500 uppercase font-sans">Withdrawing</div>
                          <div className="text-rose-400 font-bold">
                            -{formatNumberWithCommas(parsedModalFromVal)}
                          </div>
                        </div>
                        <div>
                          <div className="text-[9px] text-slate-500 uppercase font-sans">Remaining (&ge; 0)</div>
                          <div
                            className={`font-bold ${
                              convertGuardBandCheck.remainingAfterConvert < 0 ||
                              (convertGuardBandCheck.guardBandFloor > 0 &&
                                convertGuardBandCheck.remainingAfterConvert < convertGuardBandCheck.guardBandFloor)
                                ? 'text-rose-400'
                                : 'text-emerald-400'
                            }`}
                          >
                            {formatNumberWithCommas(convertGuardBandCheck.remainingAfterConvert)}
                          </div>
                        </div>
                      </div>

                      {parsedModalFromVal > 0 && !convertGuardBandCheck.isValid && (
                        <div className="text-[11px] text-rose-300 font-medium flex items-start gap-1.5 pt-1">
                          <AlertCircle className="w-3.5 h-3.5 text-rose-400 shrink-0 mt-0.5" />
                          <span>{convertGuardBandCheck.errorMessage}</span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Quick Preset Expense Tags */}
                  <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                    <span className="text-[10px] text-slate-500">Quick preset reason:</span>
                    {['Emergency Expense', 'Medical Bill', 'Car Repair', 'Home Maintenance', 'Unplanned Expense', 'Cash Withdrawal'].map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => setNote(preset)}
                        className={`text-[10px] px-2 py-0.5 rounded-md border transition-colors cursor-pointer ${
                          note === preset
                            ? 'bg-rose-500/20 border-rose-500/50 text-rose-300 font-semibold'
                            : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        {preset}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* If 'Convert' Action: From Asset & Value -> To Asset & Value */}
              {action === 'convert' && (
                <div className="space-y-4 p-3.5 rounded-xl bg-blue-950/10 border border-blue-500/20">
                  <div className="flex items-center justify-between">
                    <div className="text-xs font-bold text-blue-400 flex items-center gap-1.5">
                      <RefreshCw className="w-4 h-4" />
                      <span>Convert Asset Holdings</span>
                    </div>
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-300 border border-amber-500/30 flex items-center gap-1">
                      <ShieldCheck className="w-3 h-3 text-amber-400" />
                      Per-Asset Guard Band (&ge; 0)
                    </span>
                  </div>

                  {/* From Section */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-medium text-slate-400 mb-1">
                        From Asset (Tracked Separately)
                      </label>
                      <CustomDropdown
                        value={fromAssetId}
                        onChange={(nextFrom) => {
                          setFromAssetId(nextFrom);
                          if (toAssetId === nextFrom) {
                            const alt = assets.find((a) => a.id !== nextFrom);
                            if (alt) setToAssetId(alt.id);
                          }
                        }}
                        options={convertFromAssetOptions}
                        className="w-full"
                        maxHeight="max-h-60"
                        enableSearch={assets.length >= 6}
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-medium text-slate-400 mb-1">
                        Quantity Deducted
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. 33,500"
                        value={fromValueStr}
                        onChange={(e) => setFromValueStr(formatNumberWithCommas(e.target.value))}
                        required
                        className={`w-full bg-slate-950 border rounded-xl px-3 py-2 text-xs font-mono font-bold focus:outline-none ${
                          parsedModalFromVal > 0 && !convertGuardBandCheck.isValid
                            ? 'border-rose-500 text-rose-400 focus:border-rose-400'
                            : 'border-slate-800 text-rose-400 focus:border-blue-500'
                        }`}
                      />
                    </div>
                  </div>

                  {/* Per-Asset Guard Band Live Protection Status Bar */}
                  {selectedFromAsset && (
                    <div
                      className={`p-3 rounded-xl border text-[11px] space-y-2 transition-colors ${
                        parsedModalFromVal > 0 && !convertGuardBandCheck.isValid
                          ? 'bg-rose-950/35 border-rose-500/50 text-rose-200'
                          : 'bg-slate-950/80 border-slate-800 text-slate-300'
                      }`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 font-semibold">
                          <ShieldCheck
                            className={`w-3.5 h-3.5 shrink-0 ${
                              parsedModalFromVal > 0 && !convertGuardBandCheck.isValid
                                ? 'text-rose-400'
                                : 'text-emerald-400'
                            }`}
                          />
                          <span>
                            Guard Band: <strong>{selectedFromAsset.name}</strong>
                            {isCashOrStablecoinAsset(selectedFromAsset) && selectedFromAsset.currency ? ` (${selectedFromAsset.currency})` : ''}
                          </span>
                        </div>
                        <span
                          className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border ${
                            parsedModalFromVal > 0 && !convertGuardBandCheck.isValid
                              ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                              : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                          }`}
                        >
                          {parsedModalFromVal > 0 && !convertGuardBandCheck.isValid
                            ? convertGuardBandCheck.remainingAfterConvert < 0
                              ? 'BLOCKED: < 0'
                              : 'BELOW GUARD BAND'
                            : 'GUARD BAND SAFE (≥ 0)'}
                        </span>
                      </div>

                      <div className="grid grid-cols-3 gap-2 font-mono text-[11px] bg-slate-900/90 p-2 rounded-lg border border-slate-800/80">
                        <div>
                          <div className="text-[9px] text-slate-500 uppercase font-sans">Available</div>
                          <div className="text-slate-200 font-bold">
                            {formatNumberWithCommas(convertGuardBandCheck.effectiveAvailable)}
                          </div>
                        </div>
                        <div>
                          <div className="text-[9px] text-slate-500 uppercase font-sans">Deducting</div>
                          <div className="text-rose-400 font-bold">
                            -{formatNumberWithCommas(parsedModalFromVal)}
                          </div>
                        </div>
                        <div>
                          <div className="text-[9px] text-slate-500 uppercase font-sans">Remaining (&ge; 0)</div>
                          <div
                            className={`font-bold ${
                              convertGuardBandCheck.remainingAfterConvert < 0 ||
                              (convertGuardBandCheck.guardBandFloor > 0 &&
                                convertGuardBandCheck.remainingAfterConvert < convertGuardBandCheck.guardBandFloor)
                                ? 'text-rose-400'
                                : 'text-emerald-400'
                            }`}
                          >
                            {formatNumberWithCommas(convertGuardBandCheck.remainingAfterConvert)}
                          </div>
                        </div>
                      </div>

                      {/* Optional Custom Guard Band Minimum Reserve Floor per Asset */}
                      <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-800/70">
                        <span className="text-[10px] text-slate-400">
                          Minimum Reserve Floor (must stay &ge; 0{convertGuardBandCheck.guardBandFloor > 0 ? ` and ≥ ${formatNumberWithCommas(convertGuardBandCheck.guardBandFloor)}` : ''}):
                        </span>
                        {onEditAsset && (
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] text-slate-500">Min Floor:</span>
                            <input
                              type="text"
                              placeholder="0"
                              value={
                                selectedFromAsset.guardBand && selectedFromAsset.guardBand > 0
                                  ? formatNumberWithCommas(selectedFromAsset.guardBand)
                                  : ''
                              }
                              onChange={(e) => {
                                const val = parseFormattedNumber(e.target.value);
                                onEditAsset(selectedFromAsset.id, {
                                  guardBand: val > 0 ? val : 0,
                                });
                              }}
                              className="w-24 bg-slate-900 border border-slate-700 rounded-md px-2 py-0.5 text-[10px] font-mono text-amber-300 focus:outline-none focus:border-amber-400"
                              title="Set an optional minimum Guard Band reserve floor for this specific asset"
                            />
                          </div>
                        )}
                      </div>

                      {parsedModalFromVal > 0 && !convertGuardBandCheck.isValid && (
                        <div className="text-[11px] text-rose-300 font-medium flex items-start gap-1.5 pt-1">
                          <AlertCircle className="w-3.5 h-3.5 text-rose-400 shrink-0 mt-0.5" />
                          <span>{convertGuardBandCheck.errorMessage}</span>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="flex items-center justify-center text-slate-600">
                    <ArrowRight className="w-4 h-4 text-blue-400" />
                  </div>

                  {/* To Section */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-medium text-slate-400 mb-1">
                        To Asset (Acquired / Bought)
                      </label>
                      <CustomDropdown
                        value={toAssetId}
                        onChange={(val) => setToAssetId(val)}
                        options={convertToAssetOptions}
                        className="w-full"
                        maxHeight="max-h-60"
                        enableSearch={assets.length >= 6}
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-medium text-slate-400 mb-1">
                        Quantity Acquired
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. 2 shares, 10g, 0.05 BTC"
                        value={toValueStr}
                        onChange={(e) => setToValueStr(formatNumberWithCommas(e.target.value))}
                        required
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs font-mono text-emerald-400 font-bold focus:outline-none focus:border-blue-500"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Note / Description Field */}
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Note / Description (Optional)
                </label>
                <input
                  type="text"
                  placeholder={
                    action === 'dividend'
                      ? 'e.g. Q3 Cash Dividend from 0050.TW'
                      : action === 'withdraw'
                      ? 'e.g. Unexpected medical bill, car repair'
                      : action === 'add'
                      ? 'e.g. Monthly salary deposit'
                      : 'e.g. DCA purchase of VOO'
                  }
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
                />
              </div>

              {/* Error Message Banner */}
              {formError && (
                <div className="p-3 bg-rose-950/40 border border-rose-800/60 rounded-xl text-rose-400 text-xs font-medium flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              {/* Modal Actions */}
              <div className="flex items-center justify-end space-x-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={
                    (action === 'add' && cashAssets.length === 0) ||
                    (action === 'dividend' && assets.length === 0) ||
                    (action === 'convert' && (!fromAssetId || !convertGuardBandCheck.isValid)) ||
                    (action === 'withdraw' && (!fromAssetId || !convertGuardBandCheck.isValid))
                  }
                  className={`px-5 py-2 rounded-xl text-xs font-bold shadow-md transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                    action === 'withdraw'
                      ? 'bg-rose-500 hover:bg-rose-400 text-white shadow-rose-500/20'
                      : action === 'dividend'
                      ? 'bg-violet-500 hover:bg-violet-400 text-white shadow-violet-500/20'
                      : action === 'convert'
                      ? 'bg-blue-500 hover:bg-blue-400 text-white shadow-blue-500/20'
                      : 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-emerald-500/20'
                  }`}
                >
                  {editingTx ? 'Update' : action === 'withdraw' ? 'Record Withdrawal' : 'Record'}
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deletingTxId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl max-w-sm w-full p-6 text-center space-y-4">
            <div className="w-12 h-12 rounded-full bg-rose-500/10 text-rose-400 flex items-center justify-center mx-auto">
              <Trash2 className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-100">Delete Transaction</h3>
              <p className="text-xs text-slate-400 mt-1">
                Are you sure you want to delete this action? Your asset quantity balances and monthly snapshots will automatically recompute.
              </p>
            </div>
            <div className="flex items-center gap-2 pt-2">
              <button
                onClick={() => setDeletingTxId(null)}
                className="flex-1 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmDelete}
                className="flex-1 px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold rounded-xl shadow-md shadow-rose-600/20 transition-all cursor-pointer"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Current Quantity Balances Breakdown Modal Window */}
      {isBalancesModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-950/85 backdrop-blur-md animate-in fade-in duration-150">
          <div className="bg-slate-900 border border-slate-700/80 rounded-2xl sm:rounded-3xl shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden">
            
            {/* Modal Header */}
            <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400">
                  <Layers className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-bold text-slate-100 flex items-center gap-2">
                    <span>Current Quantity Balances</span>
                    <span className="text-xs font-mono font-semibold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/25">
                      {assets.length} Positions
                    </span>
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Real-time quantity holdings, spot prices, and estimated market valuations across all portfolio assets.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsBalancesModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
                title="Close Window"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Quick Metrics Strip */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 p-4 bg-slate-950/40 border-b border-slate-800/80">
              <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-2.5">
                <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Total Positions</div>
                <div className="text-lg font-bold font-mono text-slate-100 mt-0.5">{assets.length}</div>
              </div>
              <div className="bg-slate-900/90 border border-emerald-500/20 rounded-xl p-2.5">
                <div className="text-[10px] font-semibold text-emerald-400 uppercase tracking-wider">Active Holdings (&gt;0)</div>
                <div className="text-lg font-bold font-mono text-emerald-400 mt-0.5">{positiveHoldingsCount}</div>
              </div>
              <div className="bg-slate-900/90 border border-amber-500/20 rounded-xl p-2.5">
                <div className="text-[10px] font-semibold text-amber-400 uppercase tracking-wider">Emergency Fund</div>
                <div className="text-lg font-bold font-mono text-amber-300 mt-0.5">
                  {formatCurrency(totalEmergencyFundBalance, currencySymbol, stealthMode)}
                </div>
              </div>
              <div className="bg-slate-900/90 border border-blue-500/20 rounded-xl p-2.5">
                <div className="text-[10px] font-semibold text-blue-400 uppercase tracking-wider">Est. Total Valuation</div>
                <div className="text-lg font-bold font-mono text-blue-300 mt-0.5">
                  {formatCurrency(totalHoldingsValue, currencySymbol, stealthMode)}
                </div>
              </div>
            </div>

            {/* Search and Filter Controls */}
            <div className="p-3 sm:p-4 border-b border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-2.5 bg-slate-950/20">
              <div className="relative text-xs w-full sm:w-64">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Search asset, ticker, category..."
                  value={balancesSearch}
                  onChange={(e) => setBalancesSearch(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 text-slate-200 pl-8 pr-3 py-1.5 rounded-xl text-xs focus:outline-none focus:border-amber-400"
                />
                {balancesSearch && (
                  <button
                    onClick={() => setBalancesSearch('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 text-xs cursor-pointer"
                  >
                    &times;
                  </button>
                )}
              </div>

              {/* Filter Tabs */}
              <div className="flex items-center gap-1 overflow-x-auto w-full sm:w-auto no-scrollbar">
                {[
                  { id: 'all', label: `All (${assets.length})` },
                  { id: 'positive', label: `Active (${positiveHoldingsCount})` },
                  { id: 'cash', label: `Cash & EF (${assets.filter((a) => a.isCash || isEmergencyFundAsset(a)).length})` },
                  { id: 'investments', label: `Investments (${assets.filter((a) => !a.isCash && !isEmergencyFundAsset(a)).length})` },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setBalancesFilterTab(tab.id as any)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                      balancesFilterTab === tab.id
                        ? 'bg-amber-500 text-slate-950 font-bold shadow-sm'
                        : 'bg-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-700'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Scrollable Holdings Table */}
            <div className="flex-1 overflow-y-auto overflow-x-auto p-4">
              {filteredBalancesAssets.length === 0 ? (
                <div className="p-12 text-center text-slate-500">
                  <Layers className="w-10 h-10 mx-auto text-slate-600 mb-2" />
                  <p className="text-sm font-semibold text-slate-400">No matching assets found</p>
                  <p className="text-xs text-slate-500 mt-1">Try clearing your search query or switching filters.</p>
                </div>
              ) : (
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-950 text-slate-400 font-semibold border-b border-slate-800 uppercase tracking-wider text-[10px]">
                      <th className="p-3">Asset &amp; Category</th>
                      <th className="p-3 text-right">Current Quantity</th>
                      <th className="p-3 text-right">Spot Price</th>
                      <th className="p-3 text-right">Est. Market Value</th>
                      <th className="p-3 text-center">Guard Band</th>
                      <th className="p-3 text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-sans text-slate-200">
                    {filteredBalancesAssets.map((ast) => {
                      const qty = holdings[ast.id] || 0;
                      const cat = categoryMap.get(ast.categoryId);
                      const isEF = isEmergencyFundAsset(ast);
                      const isCash = ast.isCash || cat?.isCashCategory;
                      const price = getAssetBasePrice(ast, undefined, undefined, 32.5);
                      const val = qty * price;
                      const floor = Math.max(0, Number(ast.guardBand) || 0);

                      return (
                        <tr key={ast.id} className="hover:bg-slate-800/40 transition-colors">
                          {/* Asset Info */}
                          <td className="p-3">
                            <div className="flex items-center gap-2">
                              <span
                                className="w-2.5 h-2.5 rounded-full shrink-0"
                                style={{ backgroundColor: isEF ? '#f59e0b' : (cat?.color || '#3b82f6') }}
                              />
                              <div>
                                <div className="font-bold text-slate-100 flex items-center gap-1.5">
                                  <span>{ast.name}</span>
                                  {ast.tickerSymbol && (
                                    <span className="font-mono text-[10px] text-slate-400 bg-slate-800 px-1.5 py-0.2 rounded border border-slate-700">
                                      {ast.tickerSymbol}
                                    </span>
                                  )}
                                </div>
                                <div className="flex items-center gap-1.5 text-[10px] text-slate-400 mt-0.5">
                                  <span>{cat?.name || 'Uncategorized'}</span>
                                  {isEF ? (
                                    <span className="text-[9px] font-bold text-amber-300 bg-amber-500/15 border border-amber-500/30 px-1.5 py-0.2 rounded">
                                      Safety Net
                                    </span>
                                  ) : isCash ? (
                                    <span className="text-[9px] font-bold text-emerald-400 bg-emerald-500/15 border border-emerald-500/30 px-1.5 py-0.2 rounded">
                                      Cash
                                    </span>
                                  ) : null}
                                  {isCash && ast.currency && (
                                    <span className="font-mono text-[9px] text-slate-500 uppercase">
                                      [{ast.currency}]
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          </td>

                          {/* Current Quantity */}
                          <td className="p-3 text-right font-mono">
                            <span
                              className={`text-sm font-bold ${
                                qty > 0
                                  ? isEF
                                    ? 'text-amber-300'
                                    : 'text-emerald-400'
                                  : qty < 0
                                  ? 'text-rose-400'
                                  : 'text-slate-500'
                              }`}
                            >
                              {stealthMode ? '••••' : formatNumberWithCommas(qty)}
                            </span>
                          </td>

                          {/* Spot Price */}
                          <td className="p-3 text-right font-mono text-slate-300 text-xs">
                            {isCash && (ast.currency === 'NTD' || ast.currency === 'TWD') && getAssetPriceCurrency(ast) === 'NTD' ? (
                              <span className="text-slate-500">1.00 (Base)</span>
                            ) : (
                              <div className="flex flex-col items-end gap-0.5">
                                <span className="text-emerald-400 font-semibold">
                                  {formatAssetUnitPrice(price, ast, stealthMode)}
                                </span>
                                {onEditAsset && (
                                  <select
                                    value={getAssetPriceCurrency(ast)}
                                    onChange={(e) => onEditAsset(ast.id, { priceCurrency: e.target.value })}
                                    onClick={(e) => e.stopPropagation()}
                                    title="Change display currency for this asset's spot price"
                                    className="bg-slate-900 border border-slate-700/80 hover:border-indigo-500/60 text-indigo-300 font-mono font-bold text-[9px] rounded px-1 py-0.2 focus:outline-none focus:border-indigo-500 cursor-pointer"
                                  >
                                    {SUPPORTED_PRICE_CURRENCIES.map((c) => (
                                      <option key={c.code} value={c.code}>
                                        {c.code}
                                      </option>
                                    ))}
                                  </select>
                                )}
                              </div>
                            )}
                          </td>

                          {/* Estimated Market Valuation */}
                          <td className="p-3 text-right font-mono font-bold text-slate-100 text-xs">
                            {formatCurrency(val, currencySymbol, stealthMode)}
                          </td>

                          {/* Guard Band Floor */}
                          <td className="p-3 text-center font-mono">
                            <span className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                              {floor > 0 ? `≥ ${formatNumberWithCommas(floor)}` : '≥ 0'}
                            </span>
                          </td>

                          {/* Actions */}
                          <td className="p-3 text-center whitespace-nowrap">
                            <div className="flex items-center justify-center gap-1.5">
                              {qty > 0 && (
                                <button
                                  onClick={() => handleOpenConvertWithAsset(ast.id)}
                                  className="px-2 py-1 bg-blue-500/15 hover:bg-blue-500/25 text-blue-300 border border-blue-500/30 rounded-lg text-[10px] font-semibold flex items-center gap-1 transition-colors cursor-pointer"
                                  title="Convert from this asset"
                                >
                                  <RefreshCw className="w-3 h-3" />
                                  <span>Convert</span>
                                </button>
                              )}
                              {isCash && (
                                <button
                                  onClick={() => handleOpenDepositWithAsset(ast.id)}
                                  className="px-2 py-1 bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/30 rounded-lg text-[10px] font-semibold flex items-center gap-1 transition-colors cursor-pointer"
                                  title="Deposit cash into this asset"
                                >
                                  <ArrowDownLeft className="w-3 h-3" />
                                  <span>Deposit</span>
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-3 sm:p-4 border-t border-slate-800 bg-slate-950/60 flex items-center justify-between">
              <span className="text-xs text-slate-400">
                Showing {filteredBalancesAssets.length} of {assets.length} assets
              </span>
              <button
                onClick={() => setIsBalancesModalOpen(false)}
                className="px-4 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition-all cursor-pointer"
              >
                Close Window
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
};
