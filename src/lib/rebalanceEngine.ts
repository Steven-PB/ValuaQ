import { Category, Asset, MonthlyRecord, RebalanceMode, CategoryRebalanceItem, RebalanceAnalysis } from '../types';

/**
 * Computes the aggregated current value of each category based on the latest monthly record.
 */
export function computeCategoryValues(
  categories: Category[],
  assets: Asset[],
  latestRecord?: MonthlyRecord
): Record<string, number> {
  const categoryValues: Record<string, number> = {};
  
  // Initialize with 0
  categories.forEach((cat) => {
    categoryValues[cat.id] = 0;
  });

  if (!latestRecord || !latestRecord.assetValues) {
    return categoryValues;
  }

  // Create an assetId -> categoryId lookup map
  const assetCategoryMap = new Map<string, string>();
  assets.forEach((asset) => {
    assetCategoryMap.set(asset.id, asset.categoryId);
  });

  // Sum asset values by category
  Object.entries(latestRecord.assetValues).forEach(([assetId, rawValue]) => {
    const val = typeof rawValue === 'number' && !isNaN(rawValue) ? rawValue : 0;
    const catId = assetCategoryMap.get(assetId);
    if (catId && categoryValues[catId] !== undefined) {
      categoryValues[catId] += val;
    }
  });

  return categoryValues;
}

/**
 * Categorizes the allocation status based on drift delta with a tolerance margin (default 5%).
 */
export function getCategoryStatus(
  driftPercent: number,
  tolerance: number = 5
): 'underweight' | 'balanced' | 'overweight' {
  if (driftPercent < -tolerance) return 'underweight';
  if (driftPercent > tolerance) return 'overweight';
  return 'balanced';
}

/**
 * Calculates full rebalancing analytics, supporting both Cash-Flow (Deposit-Only)
 * and Classic Full Rebalancing (Trim/Sell & Buy).
 */
export function calculateRebalance(
  categories: Category[],
  assets: Asset[],
  latestRecord?: MonthlyRecord,
  depositAmount: number = 0,
  mode: RebalanceMode = 'cashflow',
  tolerance: number = 5
): RebalanceAnalysis {
  if (!categories || categories.length === 0) {
    return {
      items: [],
      totalCurrentValue: 0,
      totalTargetPercent: 0,
      isTargetValid: false,
      overallDriftScore: 0,
      depositAmount: 0,
      mode,
      totalNewPortfolioValue: 0,
    };
  }

  const categoryValues = computeCategoryValues(categories, assets, latestRecord);
  
  // Calculate total portfolio value across all categories
  let totalCurrentValue = 0;
  categories.forEach((cat) => {
    totalCurrentValue += categoryValues[cat.id] || 0;
  });

  // Target sum check
  let totalTargetPercent = 0;
  categories.forEach((cat) => {
    totalTargetPercent += cat.targetPercent ?? 0;
  });
  const isTargetValid = Math.abs(totalTargetPercent - 100) < 0.05;

  const validDeposit = Math.max(0, isNaN(depositAmount) ? 0 : depositAmount);
  const totalNewPortfolioValue = totalCurrentValue + validDeposit;

  // Build preliminary items
  const preliminaryItems = categories.map((cat) => {
    const val = categoryValues[cat.id] || 0;
    const actualPercent = totalCurrentValue > 0 ? (val / totalCurrentValue) * 100 : 0;
    const targetPercent = cat.targetPercent ?? 0;
    const targetValue = totalCurrentValue > 0 ? (totalCurrentValue * targetPercent) / 100 : 0;
    const driftPercent = actualPercent - targetPercent;
    const status = getCategoryStatus(driftPercent, tolerance);

    return {
      categoryId: cat.id,
      categoryName: cat.name,
      categoryColor: cat.color,
      riskLevel: cat.riskLevel,
      currentValue: val,
      actualPercent,
      targetPercent,
      targetValue,
      driftPercent,
      status,
      actionAmount: 0,
      projectedValue: val,
      projectedPercent: 0,
    };
  });

  // Calculate Actions based on chosen mode
  if (mode === 'full') {
    // Classic Rebalance: Brings each category directly to its target proportion of the new total
    preliminaryItems.forEach((item) => {
      const targetInNewPortfolio = (totalNewPortfolioValue * item.targetPercent) / 100;
      const action = targetInNewPortfolio - item.currentValue;
      item.actionAmount = Math.round(action * 100) / 100;
      item.projectedValue = Math.max(0, item.currentValue + item.actionAmount);
    });
  } else {
    // Cash-Flow / Deposit-Only Rebalancing (Water-filling):
    // Never sell overweight assets; inject deposit strictly into underweight categories.
    const targetWeights = preliminaryItems.map((item) => item.targetPercent);
    const weightSum = targetWeights.reduce((a, b) => a + b, 0);

    // Calculate dollar deficits against the new total portfolio target
    const deficits = preliminaryItems.map((item) => {
      const targetInNewPortfolio = weightSum > 0 ? (totalNewPortfolioValue * item.targetPercent) / weightSum : 0;
      return Math.max(0, targetInNewPortfolio - item.currentValue);
    });

    const totalDeficit = deficits.reduce((a, b) => a + b, 0);

    if (validDeposit > 0) {
      if (totalDeficit > 0) {
        if (validDeposit <= totalDeficit) {
          // Deposit is not enough to fill all deficits completely: distribute proportionally to deficit
          preliminaryItems.forEach((item, idx) => {
            const allocated = validDeposit * (deficits[idx] / totalDeficit);
            item.actionAmount = Math.round(allocated * 100) / 100;
          });
        } else {
          // Deposit covers all deficits: fill every deficit, and allocate remainder by target weight
          const surplus = validDeposit - totalDeficit;
          preliminaryItems.forEach((item, idx) => {
            const weightShare = weightSum > 0 ? item.targetPercent / weightSum : 1 / preliminaryItems.length;
            const allocated = deficits[idx] + surplus * weightShare;
            item.actionAmount = Math.round(allocated * 100) / 100;
          });
        }
      } else {
        // No deficits (all categories already at or above targets): distribute by target weight
        preliminaryItems.forEach((item) => {
          const weightShare = weightSum > 0 ? item.targetPercent / weightSum : 1 / preliminaryItems.length;
          const allocated = validDeposit * weightShare;
          item.actionAmount = Math.round(allocated * 100) / 100;
        });
      }
    } else {
      // 0 deposit
      preliminaryItems.forEach((item) => {
        item.actionAmount = 0;
      });
    }

    // Set projected values
    preliminaryItems.forEach((item) => {
      item.projectedValue = item.currentValue + item.actionAmount;
    });
  }

  // Calculate projected percentages
  const finalProjectedTotal = preliminaryItems.reduce((acc, it) => acc + it.projectedValue, 0);
  preliminaryItems.forEach((item) => {
    item.projectedPercent = finalProjectedTotal > 0 ? (item.projectedValue / finalProjectedTotal) * 100 : 0;
  });

  // Calculate Overall Drift Score (average absolute drift)
  const totalAbsoluteDrift = preliminaryItems.reduce((acc, it) => acc + Math.abs(it.driftPercent), 0);
  const overallDriftScore = preliminaryItems.length > 0 ? totalAbsoluteDrift / preliminaryItems.length : 0;

  return {
    items: preliminaryItems,
    totalCurrentValue,
    totalTargetPercent,
    isTargetValid,
    overallDriftScore,
    depositAmount: validDeposit,
    mode,
    totalNewPortfolioValue,
  };
}

/**
 * Helper to generate target presets
 */
export function getTargetPresets(categories: Category[]): { label: string; description: string; targets: Record<string, number> }[] {
  if (!categories || categories.length === 0) return [];

  // Equal Weight
  const equalPercent = Math.round((100 / categories.length) * 10) / 10;
  const equalTargets: Record<string, number> = {};
  let equalSum = 0;
  categories.forEach((cat, idx) => {
    if (idx === categories.length - 1) {
      equalTargets[cat.id] = Math.max(0, Math.round((100 - equalSum) * 10) / 10);
    } else {
      equalTargets[cat.id] = equalPercent;
      equalSum += equalPercent;
    }
  });

  // Current Actual Weights
  // (Sets targets equal to current actual distribution)
  return [
    {
      label: 'Equal Weight',
      description: `Evenly divide 100% across all ${categories.length} categories (~${equalPercent}% each)`,
      targets: equalTargets,
    },
  ];
}
