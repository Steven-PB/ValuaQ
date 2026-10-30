# ValuaQ Institutional FinTech UI Elevation

A comprehensive visual and spatial refinement of the ValuaQ 3-Level Portfolio & Risk Engine, elevating the interface to an institutional-grade FinTech dark aesthetic while preserving every core valuation, ledger, and cloud synchronization capability.

### User Review & Critical Decisions

> [!IMPORTANT]
> The following architectural and aesthetic choices have been locked in based on your preferences and will guide the visual overhaul without altering any underlying portfolio calculations or data models.

- **Confirmed Decision 1 — Aesthetic Direction**: **Institutional FinTech Dark (Obsidian & Emerald)** featuring deep obsidian surfaces (`#090D16` / `#0F172A`), crisp hairline borders (`#1E293B`), high-contrast emerald accents (`#10B981`), and strict `tabular-nums` monospace alignment for all financial figures.
- **Confirmed Decision 2 — Navigation & Layout**: **Streamlined Top Navigation with Unified Workspace** combining brand identity, single-line view navigation links, and essential workspace controls into a cohesive, uncluttered header bar.
- **Confirmed Decision 3 — Priority Focus Areas**: **Top KPI Summary Cards & Net Worth Banner**, **Transaction Ledger Table & Monthly Groupings**, and **Portfolio Charts & Interactive Data Visualizations**, while ensuring visual harmony across the Monthly Spreadsheet and Hierarchy views.

---

### 1. Overview & Core Concept

- **What It Does**: Transforms the visual presentation of ValuaQ into a precision financial workstation. It replaces generic multi-pill clutter and heavy nested boxes with clean typographic hierarchy, scannable tabular data grids, and balanced executive KPI strips.
- **Target Audience / Persona**: Quantitative and long-term personal investors managing multi-currency assets (NTD, USD, stocks, ETFs, crypto, gold) who value speed, clarity, and institutional-grade visual discipline.
- **Key Value**: Faster visual scanning of net worth, floating P&L, and monthly ledger activity through reduced visual noise, aligned decimal columns, and refined interactive controls.

---

### 2. User Experience & Visual Design

- **Key User Flows**:
  1. **Unified Top Bar & Workspace Utility**: Users switch effortlessly between *Dashboards*, *Transaction Ledger*, *Monthly Spreadsheet*, *Assets & Risk*, and *Rebalance* from a single-row navigation header, with quick access to Stealth Mode, Cloud Sync, and Data Backup in a secondary utility strip or compact right-hand action zone.
  2. **Executive Net Worth & KPI Strip**: On the Dashboard and Ledger views, users immediately see primary capital figures formatted with crisp tabular numerals, clean inline metadata separators (`·`), and proportional risk distribution bars instead of stacked pill badges.
  3. **High-Density Collapsible Transaction Ledger**: Users filter by Month, Action, or Asset in a unified command bar, expand or collapse monthly ledger groups with a single tap, and cycle through single-asset holdings in the *Current Quantity Balances* card using tactile up/down steppers or open the full breakdown modal.
  4. **Interactive Portfolio Charts**: Users inspect asset allocation and historical growth curves with refined dark-slate tooltips, clean segmented chart toggles, and uncluttered axis typography.

- **Visual Identity & Theme**:
  - *Aesthetic Direction*: **Institutional FinTech Dark** — inspired by modern quantitative wealth platforms (Linear, Mercury, Stripe Financial).
  - *Color Palette & Mood*:
    - **60% Dominant Canvas**: Deep Obsidian (`#080C14` / `slate-950`) for the primary viewport background.
    - **30% Structural Surfaces**: Elevated Slate (`#0F172A` / `slate-900`) with crisp 1px hairline borders (`rgba(148, 163, 184, 0.12)`) and subtle top-edge specular highlights.
    - **10% Semantic Accents**: Emerald (`#10B981`) for positive P&L, active navigation states, and primary CTAs; Violet (`#8B5CF6`) for passive dividend yield; Amber (`#F59E0B`) for Emergency Fund safety reserves; Rose (`#F43F5E`) for withdrawals and drawdowns.
  - *Typography & Hierarchy*:
    - **Display & UI Structure**: `Plus Jakarta Sans` for crisp, modern headings, navigation links, and card titles (`tracking-tight`, `font-semibold`).
    - **Financial Data & Telemetry**: `JetBrains Mono` with `font-variant-numeric: tabular-nums` enforced across all currency values, quantities, percentages, dates, and table columns so decimal points align vertically.
  - *Component Styling & Layout*:
    - **Zero-Pill Metadata Discipline**: Replace static rounded pill enclosures on informational labels (such as timestamps, entry counts, and secondary descriptions) with clean inline typography separated by subtle middots (`·`).
    - **Single-Elevation Depth**: Flat, structured cards separated by 1px hairline borders and consistent `16px–24px` spatial rhythm, eliminating cards nested inside cards or decorative blurred background blobs.

- **Interactive Feedback & Motion**:
  - Fast, responsive `150ms` transitions (`cubic-bezier(0.16, 1, 0.3, 1)`) on table row hovers, collapsible monthly headers, and segmented control switches.
  - Tactile hover states on the single-asset balance cycler and emergency fund `+` / `−` quick-action buttons.

---

### 3. Key Product Decisions & Trade-Offs

- **Decision 1: Streamlined Single-Row Navigation + Contextual Workspace Utility**
  - *Chosen Approach*: Consolidate the primary navigation tabs and brand identity into a clean top bar, moving secondary utilities (Currency indicator, Backup/Restore, Factory Reset) into a compact, non-intrusive utility group.
  - *Why*: Eliminates the multi-row header clutter on desktop and keeps vertical viewport space focused on financial data and charts.
  - *Alternatives Considered*: Full collapsible left sidebar (passed over to honor your preference for a streamlined top navigation bar).

- **Decision 2: Proportional Risk Bar & Unboxed Metadata in KPI Cards**
  - *Chosen Approach*: Upgrade the 6 Dashboard KPI cards and 4 Ledger Overview cards to use clean typographic kickers, `tabular-nums` hero numbers, and a visual horizontal progress bar for *Risk Distribution* (`Low` / `Medium` / `High`).
  - *Why*: Removes decorative background blur orbs and static pill clutter, allowing the eye to lock onto Total Capital, Floating P&L, and MoM performance immediately.
  - *Alternatives Considered*: Keeping stacked pill badges for risk levels (harder to scan proportions at a glance).

- **Decision 3: High-Density Tabular Ledger with Refined Month Headers**
  - *Chosen Approach*: Style the Transaction Ledger as an institutional blotter with right-aligned numeric quantity columns, subtle action indicators, and sleek collapsible month group headers showing inline summary counts (`+Add · Convert · Withdraw · Yield`).
  - *Why*: Preserves all existing collapsible behaviors (`All Months` defaults to hidden; specific month defaults to shown) while dramatically improving horizontal scannability and professional polish.

---

### 4. Technical Architecture & Data Strategy *(Technical Reference)*

- **Architecture & Component Diagram**:

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                        ValuaQ Application Shell (App)                        │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │           Streamlined Top Header & Unified Navigation Bar              │  │
│  │  [ValuaQ Brand]  ──  [Dashboards | Ledger | Sheet | Assets | Rebalance]│  │
│  │                      [Stealth Toggle | Cloud Sync | Data Utilities]    │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
│                                      │                                       │
│         ┌────────────────────────────┼────────────────────────────┐          │
│         ▼                            ▼                            ▼          │
│  ┌──────────────────────┐ ┌────────────────────────┐ ┌────────────────────┐  │
│  │   Dashboard View     │ │  Transaction Ledger    │ │  Secondary Views   │  │
│  │  ┌────────────────┐  │ │  ┌──────────────────┐  │ │  ┌──────────────┐  │  │
│  │  │ Executive KPI  │  │ │  │ 4-Card Summary   │  │ │  │ Spreadsheet  │  │  │
│  │  │ 6-Card Grid &  │  │ │  │ Banner + 1-Asset │  │ │  │ Matrix       │  │  │
│  │  │ Risk Bar       │  │ │  │ Cycler (Up/Down) │  │ │  ├──────────────┤  │  │
│  │  ├────────────────┤  │ │  ├──────────────────┤  │ │  │ Risk & Asset │  │  │
│  │  │ Interactive    │  │ │  │ Filter Toolbar   │  │ │  │ Hierarchy    │  │  │
│  │  │ Filter Strip   │  │ │  │ (Max-H Dropdowns)│  │ │  ├──────────────┤  │  │
│  │  ├────────────────┤  │ │  ├──────────────────┤  │ │  │ Portfolio    │  │  │
│  │  │ Portfolio Pie  │  │ │  │ Collapsible      │  │ │  │ Rebalancing  │  │  │
│  │  │ & Growth Charts│  │ │  │ Monthly Blotter  │  │ │  └──────────────┘  │  │
│  │  └────────────────┘  │ │  └──────────────────┘  │ └────────────────────┘  │
│  └──────────────────────┘ └────────────────────────┘                         │
└──────────────────────────────────────────────────────────────────────────────┘
```

- **Data Model & State**:
  - Zero breaking changes to `Category`, `Asset`, `LedgerTransaction`, `MonthlyRecord`, or `MonthlyPriceMap`.
  - Preserves all USD/foreign currency valuation logic, 1st-of-month snapshot rules, Emergency Fund P&L exclusion, and Firebase Union-Guard cloud synchronization.
- **Interactive Component & State Mapping**:
  - **Header Navigation & Utilities**: Active tab switching, Stealth Mode masking (`••••`), Google Cloud Sync trigger, and Backup/Restore modal triggers remain 100% wired.
  - **Ledger Overview & Blotter**: Preserves the 4-card overview grid, compact `-` / `+` Emergency Fund triggers, single-asset carousel (`ChevronUp` / `ChevronDown` with `stopPropagation` and full-card modal click), simplified Action labels (`Add`, `Convert`, `Withdraw`, `Yield`), directional Sort button (`ArrowUp` / `ArrowDown`), and collapsible monthly headers without `(Tap to show/hide)` text.
  - **CustomDropdown**: Enhances the scrollable (`max-h-60`) dropdown menu styling to match the new obsidian-and-emerald surface tokens across all views and modals.

---

### 5. Live Timeline & 6M Monthly Savings Chart Precision

- **Live In-Progress Month (`2026-11`)**:
  - The upcoming ongoing month (**November 2026**) is designated as the `Live` month (`isLivePending: true`).
  - Displays real-time spot prices, live portfolio valuation, and the pulsating `LIVE` badge in the Spreadsheet and Stacked Bar charts.
- **Finalized Historical Months (May to October 2026)**:
  - October 2026 and prior months are treated as closed 1st-of-month snapshot records (`isLivePending: false`).
- **6M Monthly Savings Bar Chart**:
  - Excludes the `isLivePending` month so the visualization strictly reflects the 6 completed historical months (**May to October 2026**).
  - Calculates stability statistics (average, standard deviation, and trajectory) solely against finalized, closed months to prevent distortion from intra-month partial savings.

---

### Verification
- `tsc --noEmit`: 0 TypeScript errors.
- `npm run build`: Vite production build passed cleanly.
- Live month correctly isolated to November (`2026-11`).
- 6M savings chart correctly displays May, Jun, Jul, Aug, Sep, Oct (`2026-05` to `2026-10`).
