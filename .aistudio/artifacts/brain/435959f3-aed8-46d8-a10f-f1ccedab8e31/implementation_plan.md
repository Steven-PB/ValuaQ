# Portfolio Rebalancing Feature for ValuaQ

A dedicated, production-grade Portfolio Rebalancing workbench that empowers investors to set target category allocations, monitor allocation drift in real-time against current valuations, and execute both **Cash-Flow Contribution Rebalancing** (deposit-only, zero tax/sales) and **Classic Full Rebalancing** (trim overweight & buy underweight).

---

### User Review & Critical Decisions

> [!IMPORTANT]
> The following architectural decisions have been confirmed and will guide the build:

- **Target Level: Category Level**: Target allocation percentages are assigned to each asset category (e.g., Stocks, Real Estate, Crypto, Cash & Fixed Income), which cleanly groups underlying assets while keeping allocation strategy intuitive and manageable.
- **Navigation Placement: Dedicated Top Navigation Tab**: A dedicated `"Rebalance"` tab will sit alongside *Dashboards*, *Monthly Spreadsheet*, and *Assets & Risk Hierarchy* in the top navigation bar, featuring a balance scale icon (`Scale` / `Sliders`).
- **Rebalance Execution Engines**:
  1. **Cash-Flow / Contribution Mode (Default, Recommended)**: Automatically calculates how to distribute next month's new deposit (or any custom capital injection) exclusively into underweight categories to bring the portfolio back into balance *without selling any holdings*.
  2. **Full Classic Rebalancing Mode**: For quarterly/annual portfolio resets, calculates exact dollar amounts to trim/sell from overweight categories and deploy into underweight categories to achieve a 100% target match immediately.
- **Persistence & Cloud Sync**: Target percentages are stored on Category records (`targetPercent?: number`), automatically syncing to localStorage and Google Firebase Cloud Firestore without breaking existing data, backups, or exports.

---

### 1. Overview & Core Concept

#### What It Does
The Portfolio Rebalancing tool solves the core problem of **portfolio drift**: as market prices fluctuate, higher-performing assets expand beyond their desired risk tolerance, while lower-performing or stable assets shrink. 

Users can:
1. Define their ideal target allocation percentage for each category (with auto-normalization and validation that totals sum to 100%).
2. Instantly see their **Actual vs. Target Allocation** via side-by-side comparison bars, current monetary value, target monetary value, and drift delta (`±X.X%`, `±$Amount`).
3. View clear visual status badges:
   - 🟢 **Balanced**: Within acceptable tolerance (e.g. within ±1.5% of target).
   - 🟡 **Underweight**: Below target; recommended for capital additions.
   - 🔴 **Overweight**: Above target; candidate for profit-taking or pausing new contributions.
4. Use the **Interactive Rebalance Calculator**:
   - Pre-fills with the most recent month's new capital (`monthlyMoneyInvested`) or allows typing any deposit amount.
   - Generates an actionable order list: *"Allocate NT$ 18,500 to Stocks, NT$ 6,500 to Fixed Income, NT$ 0 to Crypto"*.
   - Provides a simulated "After Rebalance" preview bar showing how the portfolio distribution will look once the plan is carried out.

#### Target Audience & Persona
Long-term buy-and-hold investors, passive indexers, and multi-asset wealth builders who practice dollar-cost averaging (DCA) and want disciplined, emotion-free capital allocation.

---

### 2. User Experience & Visual Design

#### Key User Flows

```
┌────────────────────────────────────────────────────────────────────────┐
│                        Top Navigation Bar                              │
│ [ Dashboards ]   [ Monthly Spreadsheet ]   [ Assets Hierarchy ]   [★ Rebalance ] │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ Click
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│ 1. Header & Summary Strip                                              │
│    • Total Portfolio Value  • Overall Drift Score  • Rebalance Status  │
├────────────────────────────────────────────────────────────────────────┤
│ 2. Target Allocation Setup Panel                                       │
│    • Category target % inputs (inline numeric stepper / slider)        │
│    • Live Sum Checker: "Total: 100% [Valid]" (or warning if ≠ 100%)    │
│    • Quick Presets button (e.g. Equal Weight, 60/40 Core, All-Weather)│
├────────────────────────────────────────────────────────────────────────┤
│ 3. Target vs. Actual Allocation Grid (Data-Dense Table + Mini Bars)    │
│    • Category  • Current Value  • Actual %  • Target %  • Drift (±%)   │
│    • Visual Target Bar with Actual Marker                              │
│    • Action Status (Underweight / Balanced / Overweight)               │
├────────────────────────────────────────────────────────────────────────┤
│ 4. Rebalancing Action Planner                                          │
│    Mode Selector: [ ⚡ Deposit Only (No Selling) ]  [ 🔄 Full Rebalance ]│
│    Deposit Input: [ NT$ 30,000 ] (Quick buttons: +5k, +10k, This Month) │
│                                                                        │
│    Action Recommendations Card:                                        │
│    ┌──────────────────────────────────────────────────────────────┐    │
│    │ • Stocks: Add +NT$ 18,500 (Brings from 52% → 58.5%)          │    │
│    │ • Real Estate: Add +NT$ 11,500 (Brings from 23% → 25%)      │    │
│    │ • Crypto: Add NT$ 0 (Hold, currently overweight at 14%)      │    │
│    └──────────────────────────────────────────────────────────────┘    │
│    Interactive "After Rebalance" Visual Projection Comparison          │
└────────────────────────────────────────────────────────────────────────┘
```

#### Visual Identity & Styling
- **Canvas & Surfaces**: Matches ValuaQ's sleek dark theme (`#0B1120` canvas, `#0F172A` cards, `#1E293B` borders).
- **Domain Aesthetic**: High-density financial dashboard layout with crisp tabular figures (`tabular-nums`, `font-mono`).
- **Zero-Pill Restraint**: Drift statuses use clean, unboxed typographic markers and subtle indicators instead of bloated pill badges.
- **Color Discipline**:
  - Emerald (`#10B981`): Balanced allocation / Capital addition recommended.
  - Amber (`#F59E0B`): Moderate drift / Underweight target.
  - Rose (`#F43F5E`): Significant overweight drift (in Full Rebalance mode, indicates trim/sell amount).
  - Blue (`#3B82F6`): Neutral target markers and simulated projection comparisons.
- **Stealth Mode Compliance**: Respects the global stealth privacy mode eye toggle (`***`) for all dollar figures while keeping percentages visible for strategic planning in public.

---

### 3. Key Product Decisions & Mathematical Strategy

#### Decision 1: Optimal Contribution Algorithm (Deposit-Only Water-Filling)
- *Problem*: In deposit-only rebalancing, a fixed deposit $D$ may not be enough to bring all underweight assets fully to target without selling overweight assets.
- *Solution*: A modified **water-filling algorithm**:
  1. Compute the new total portfolio value: $V_{\text{new}} = V_{\text{current}} + D$.
  2. For each category $i$, target value is $T_i = V_{\text{new}} \times (\text{targetPercent}_i / 100)$.
  3. Shortfall is $S_i = \max(0, T_i - V_i)$.
  4. If the sum of shortfalls $\sum S_i \le D$, allocate $S_i$ to each underweight category, and divide any remaining surplus proportionally to target weights.
  5. If $\sum S_i > D$, prioritize categories with the greatest relative deficit, scaling allocations proportionally so exactly $D$ is deployed and no category is assigned negative dollars.

#### Decision 2: Target Storage & Cloud Sync Invariants
- *Problem*: Where should target percentages be stored to ensure zero data loss during sync?
- *Solution*: Store `targetPercent?: number` directly within each `Category` object in `src/types.ts`.
  - Automatically persisted to `localStorage` via existing `saveCategories`.
  - Automatically merged across devices in `src/lib/syncMerge.ts` via category union.
  - Automatically pushed to Google Firestore in `users/{userId}` without modifying security rules.
  - Automatically preserved in JSON system backups and Excel/CSV exports.

---

### 4. Technical Architecture & Component Mapping

```
┌───────────────────────────────────────────────────────────────────────────┐
│                                 App.tsx                                   │
│   • activeTab state: 'dashboard' | 'spreadsheet' | 'hierarchy' | 'rebalance'│
│   • State: categories, assets, records, settings, user                    │
│   • Handler: onUpdateCategoryTarget(categoryId, targetPercent)            │
│   • Handler: onBatchUpdateTargets(Record<string, number>)                 │
└─────────────────────────────────────┬─────────────────────────────────────┘
                                      │
              ┌───────────────────────┴───────────────────────┐
              ▼                                               ▼
┌───────────────────────────────┐               ┌───────────────────────────┐
│     components/Header.tsx     │               │ components/RebalanceView  │
│ • 'Rebalance' Nav button      │               │ • Target Setup Table      │
│ • Scale icon                  │               │ • Target vs Actual Visuals│
│ • Active indicator styling    │               │ • Drift Metrics Matrix    │
└───────────────────────────────┘               │ • Water-filling Engine    │
                                                │ • Mode Toggle             │
                                                │ • Execution Orders Card   │
                                                │ • Projected Distribution  │
                                                └───────────────────────────┘
```

#### Component & Helper Structure
1. `src/types.ts`:
   - Extend `Category` with `targetPercent?: number`.
   - Add rebalance calculation types: `CategoryRebalanceItem`, `RebalanceMode`, `RebalancePlan`.
2. `src/lib/rebalanceEngine.ts`:
   - Pure, thoroughly tested calculation engine:
     - `calculateCategoryActuals(categories, assets, latestRecord)`
     - `calculateCashFlowRebalance(items, depositAmount)`
     - `calculateFullRebalance(items)`
     - `calculatePortfolioDriftScore(items)`
3. `src/components/RebalanceView.tsx`:
   - Main view component rendering the header statistics, target allocation manager, target vs. actual visual progress bars, interactive deposit slider/input, and simulated action summary.
4. `src/components/Header.tsx` & `src/App.tsx`:
   - Wire `'rebalance'` tab navigation, state management, and updates.

---

### 5. Verification & Testing Plan

1. **Algorithm Correctness**:
   - Sum to 100% validation check.
   - Deposit amount equal to $0, small deposit ($100), large deposit ($100,000), and exact balance deposit.
   - Verify that Cash-Flow mode never produces negative allocations (never tells user to sell).
   - Verify that Full Rebalance mode produces exact zero-sum adjustments (Trims = Buys).
2. **Stealth Mode Testing**:
   - Toggle stealth mode and confirm that dollar values become asterisks while percentages, drift deltas, and progress bars remain crisp and operational.
3. **Data Persistence & Export/Import Safety**:
   - Modify targets, refresh page, verify localStorage persistence.
   - Verify CSV and Excel exports continue to work seamlessly.
4. **Applet Compilation & Linting**:
   - Run `compile_applet` and `lint_applet` to guarantee clean zero-error TypeScript build.
