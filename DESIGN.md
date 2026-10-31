# DESIGN.md: Brightloop Subscription Management System

Source of truth for all UI. Every page and component MUST follow this file.
Style reference: enterprise "CRM workspace" look (dark navy icon rail, white rounded cards on a light grey canvas, blue pill buttons, chevron progress path). Take the STYLE only. Never use any third-party logo, brand name or icon artwork.

## 1. Stack rules
- React + Tailwind CSS + shadcn/ui (Radix). Icons: lucide-react only. No other UI libraries.
- Font: Inter (400/500/600/700). Fallback: system-ui.
- NEVER hardcode colors, radii, shadows or font sizes. Use the tokens below only.
- Before creating any component, check /components/ui and reuse it. Do not invent new styles.

## 2. Design tokens (put in globals.css, map into tailwind.config)

```css
:root {
  /* Brand */
  --primary: #0B5CFF;          /* primary buttons, active tab, links */
  --primary-hover: #0848C7;
  --primary-soft: #E5EFFF;     /* selected row, hover tint */
  --link: #0A5BC4;

  /* Shell */
  --rail-bg: #0A2A66;          /* left icon rail */
  --rail-icon: #FFFFFF;
  --rail-active-outline: #FFFFFF;

  /* Surfaces */
  --canvas: #F3F4F6;           /* page background */
  --card: #FFFFFF;
  --border: #E1E5EB;
  --muted-text: #5C667A;
  --text: #181B25;

  /* Status */
  --success: #0F9D58;  --success-soft: #DDF5E7;
  --warning: #F5A524;  --warning-soft: #FFF1D6;
  --danger:  #D92D20;  --danger-soft:  #FDEBEA;
  --info:    #0B5CFF;  --info-soft:    #E5EFFF;
  --neutral: #5C667A;  --neutral-soft: #EDEFF3;

  /* Progress path */
  --path-done: #A8F0E0;        /* completed step (mint) with check icon */
  --path-current: #0A2A66;     /* current step (navy), white text */
  --path-todo: #E5E7EB;        /* future step (grey) */

  /* AI / highlight glow (optional, use sparingly) */
  --glow: linear-gradient(135deg, #E9E3FF 0%, #FBE4F3 100%);

  --radius-card: 16px;
  --radius-input: 8px;
  --radius-pill: 999px;
  --shadow-card: 0 1px 2px rgba(16,24,40,.06);
  --shadow-popover: 0 8px 24px rgba(16,24,40,.12);
}
```

## 3. Typography
- Page/record title: 28px / 600
- Section title (card heading): 20px / 600
- KPI big number: 40px / 700
- Body: 14px / 400. Labels: 12px / 500, color --muted-text
- Links: --link, underline on hover. Numbers use tabular-nums.

## 4. App shell (all admin/staff pages)
1. **Left rail** (96px wide, --rail-bg): icon on top, 12px label below, white. Active item = rounded-square white outline around icon.
   Items: Home, Subscriptions, Invoices, Payments, Products & Plans, Customers, Reports, Admin (admin only), More.
2. **Top bar** (white, 56px): centered rounded search input (border --border, 8px radius, max-w 520px), right side: quick-add (+), notifications bell, help, settings, avatar.
3. **Module tab bar** (below top bar, white): module name large on the left (e.g. "Billing"), then horizontal tabs. Active tab = --primary text + 3px --primary underline. Tabs with sub-lists show a small chevron.
4. **Canvas** (--canvas): content sits in white cards, 16px radius, 24px padding, 16 to 24px gaps.

## 5. Components
- **Buttons**: pill shape (radius-pill), 36px high.
  - Primary: solid --primary, white text, optional leading check/plus icon.
  - Secondary: white, 1px --primary border, --primary text.
  - Split button group: Edit | Clone | v (joined pills sharing borders).
- **Inputs/selects**: 8px radius, 1px --border, focus ring 2px --primary.
- **Status badge**: pill, 12px/500, soft background + strong text.
  - Draft = neutral, Quotation = info, Confirmed = indigo/info, Active = success, Closed = neutral (darker), Paid = success, Overdue = danger, Paused = warning.
- **Progress path (chevron stepper)**: horizontal chevron-shaped steps. Done = --path-done with check, current = --path-current with white text, todo = --path-todo. Use for the subscription lifecycle: Draft > Quotation > Confirmed > Active > Closed, and for invoices: Draft > Confirmed > Paid. A primary pill button "Mark Stage as Complete" sits at the right end.
- **KPI tile**: white card with 1px border, label 12px muted, value 28 to 40px bold. The selected/primary tile is solid --primary with white text. Optional tiny trend line.
- **Alert banner**: --danger-soft background, 12px radius, text 14px with the important amount in bold --danger. Use for overdue invoices, expiring subscriptions.
- **Data table**: white card, header row 12px/600 muted, row height 56px, 1px bottom borders, hover/selected row = --primary-soft. Row action = outlined pill button on the right. Server-side pagination, filters above the table, skeleton loading.
- **Record header**: round colored icon (40px) + small type label ("Subscription") above a 28px title; right side = Follow/New Note/Edit/Clone button group.
- **Key-fields strip**: 4 to 5 label/value pairs in a row under the header (Customer, Amount, Next invoice date, Plan, Owner).
- **Tabs inside cards**: underline style, same as the module tab bar.
- **Popover/list with counts**: white, 12px radius, --shadow-popover, rows with colored circle icon + label + count chip (--neutral-soft, 8px radius).
- **Empty states**: simple icon, one line of text, one primary pill button.

## 6. Page templates
**Dashboard (finance lead)**: greeting + "needs attention" count. Left card: KPI tiles stack (Active subscriptions, MRR, Collected, Outstanding) + large chart (revenue vs. target) + red alert banner ("12 invoices are overdue, 48,200 outstanding"). Right card: action panel with CTA. Below: "Overdue invoices" table with filters.

**List pages (Subscriptions, Invoices, Payments, Plans, Products, Customers)**: page title + filter chips + search, primary pill "New ...", table card, pagination.

**Record detail (Subscription, Invoice)**: Record header > key-fields strip > progress path card > two-column area. Left (2/3): tabs (Lines, Invoices, Payments, Activity, Details). Right (1/3): related/summary card (totals, tax, discount applied, payment status).

**Customer portal** (role = customer): NO left rail. Top nav only (My Subscriptions, My Invoices, Payments, Profile), same tokens, bigger cards, clear "Pay" and "Download" pill buttons.

**Auth pages**: centered white card (max-w 420px) on --canvas, same inputs and pill buttons.

## 7. Rules for the AI assistant
1. Read this file before building or editing any UI.
2. Build shared components first (AppShell, Rail, TopBar, ModuleTabs, Button, Input, StatusBadge, PathStepper, KpiTile, AlertBanner, DataTable, Card, PageHeader, RecordHeader). Reuse them everywhere.
3. Use the finished Dashboard page as the visual reference for every other page.
4. No inline hex colors, no new fonts, no new libraries, no gradients except --glow.
5. Every page must have loading (skeleton), empty and error states.
6. Keep responses under 2 seconds: paginate, filter on the server, never render unbounded lists.
7. After each page, compare against sections 4 to 6 and fix any drift before moving on.
