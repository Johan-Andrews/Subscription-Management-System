# Brightloop Subscription Management System: Team Build Guide

> **How to use this file (read first)**
> This file is the single source of truth for a 4-person team building the project with Google Antigravity.
> 1. Put it in the repo root as `PROJECT_GUIDE.md`.
> 2. Each person opens their IDE and tells Antigravity: *"Read PROJECT_GUIDE.md. I am **Member X**. Do only the work in the section `MEMBER X`, and obey section 2 (Agent Operating Rules)."*
> 3. Member A goes first and finishes **Phase 0 (skeleton)**. Members B, C, D start their parts only after Phase 0 is merged to `main`.

---

## 0. Table of contents

1. Project summary and what we are building
2. Agent Operating Rules (the AI must obey these)
3. Roles and permissions
4. Tech stack and decisions
5. Repository structure and folder ownership
6. Git workflow (how to push without conflicts)
7. Environment variables and Supabase setup
8. Business rules (shared by everyone)
9. API contract
10. Database schema (migrations)
11. MEMBER A: Foundation, Auth, Roles, Shell
12. MEMBER B: Catalog (products, variants, taxes, plans, discounts)
13. MEMBER C: Quotations, Subscriptions, Billing engine
14. MEMBER D: Invoices, Payments (QR flow), Reports
15. Integration, seeding, performance
16. Demo script and final checklist

---

## 1. Project summary

**Brightloop Software** sells software on subscription (monthly or yearly plans, add-ons, product variants). Today they use spreadsheets, forget renewals, type invoices by hand, match payments by scrolling bank statements, and build revenue reports manually.

We build one web platform that covers the whole lifecycle:

```
Catalog (products, variants, plans, taxes, discounts)
   -> Quotation template -> Subscription (Draft > Quotation > Confirmed > Active > Closed)
   -> Automatic invoices (Draft > Confirmed > Paid)
   -> Payments (QR confirmation flow)
   -> Dashboard and reports
```

**Three user types**
- **Admin**: controls everything, is the only one who can create staff and discounts.
- **Internal staff**: day-to-day work, limited access.
- **Customer**: portal showing only their own subscriptions and invoices; can pay invoices.

**Non-negotiable requirements from the problem statement**
- Unique email per account. Password **more than 8 characters** (minimum 9) with an uppercase letter, a lowercase letter and a special character. Password reset link sent to the registered email.
- Role-based access, enforced on the **backend**.
- Products with name, type, sales price, cost price, notes, and **variants** (e.g. brand "Odoo" adds 560).
- Plans: price, billing period (daily/weekly/monthly/yearly), minimum quantity, available-from/to dates, and per-plan flags (auto-close, closable early, pausable, renewable).
- Quotation templates (plan and product lines, validity in days).
- Subscriptions with auto-number, customer, plan, start and expiry date, payment terms, lines (product, qty, unit price, tax, amount), and status flow Draft > Quotation > Confirmed > Active > Closed.
- Invoices created automatically from subscriptions, taxes auto-calculated, actions confirm/cancel/send/print, status Draft > Confirmed > Paid. **Never billed twice, never skipped.**
- Discounts (admin only): fixed or percentage, min purchase or quantity, dates, usage limit, per product or whole subscription, applied automatically on the next invoice, stop when expired or exhausted.
- Payments recorded with method, amount, date, note against the right invoice; paid vs outstanding visible any time.
- Dashboard: active subscriptions, revenue, payments, overdue invoices, with filters and summary. **Every page under 2 seconds with thousands of subscriptions.**

**Payment option we chose (simulated QR flow)**
On an invoice, the customer clicks **Pay**. A modal shows a QR code that encodes `https://<app-url>/pay/<invoiceId>`. Scanning it opens a confirmation page with the invoice number, amount, and two buttons: **Paid** and **Not paid**. "Paid" calls the backend, which records a payment and marks the invoice Paid. "Not paid" changes nothing. This is a **simulated gateway** and must be labelled so in the README and the demo.

---

## 2. Agent Operating Rules (Antigravity must obey)

1. **Identify the member first.** If the user has not said which member they are (A, B, C or D), ask once, then proceed. Work only on that member's section.
2. **Touch only owned paths** (section 5). Never edit a file owned by another member. If a change in someone else's area is needed, stop and tell the user to message that member.
3. **Never edit shared files** (`backend/src/app.js`, `frontend/src/App.jsx`, `package.json`, lockfiles, `lib/`, `middleware/`, `components/`) unless you are Member A. Everything is pre-wired so other members never need to.
4. **Do not install new npm packages.** All dependencies are installed in Phase 0. If one is missing, tell the user to ask Member A.
5. **Follow the API contract (section 9) and schema (section 10) exactly.** Same paths, same field names, same response shapes. Do not invent alternatives.
6. **Money**: use the helpers in `backend/src/lib/money.js` (integer paise internally, DECIMAL(12,2) in the database). Never use floating-point arithmetic for money.
7. **Authorization is server-side.** Customer endpoints take `customer_id` from the authenticated user, never from the request body or query string.
8. **Never commit secrets.** No `.env`, no service role key in code or in the frontend.
9. **Work in small steps.** After each task: run it, test it (curl or the UI), then commit with a conventional message (`feat:`, `fix:`, `chore:`).
10. **Before every push** run `bash scripts/check-owned-paths.sh <A|B|C|D>`. If it fails, fix the change; do not push.
11. **Never push to `main` directly** (except Member A during Phase 0). Push to your own branch and open a pull request.
12. **Stubs are replaced, not recreated.** Phase 0 creates stub files in every module. Fill in the stub in your own module; do not create parallel files elsewhere.
13. When the task is finished, report: what was built, endpoints/pages added, how to test it, and anything the other members must know.

---

## 3. Roles and permissions

| Capability | Admin | Staff | Customer |
|---|:-:|:-:|:-:|
| Create staff accounts | Yes | No | No |
| Create / edit / delete discounts | Yes | No (read only) | No |
| Create / edit taxes | Yes | No (read only) | No |
| Create / edit products, variants, plans | Yes | No (read only) | No |
| Create / edit quotation templates | Yes | Yes | No |
| Manage customers | Yes | Yes | Own profile only |
| Create subscriptions, change status | Yes | Yes | Own: pause/resume/close/renew only if plan flag allows |
| View subscriptions | All | All | Own only |
| Run billing manually | Yes | Yes | No |
| Confirm / cancel / send / print invoices | Yes | Yes | Print own only |
| View invoices | All | All | Own, only Confirmed or Paid |
| Pay invoice (QR flow) | n/a | n/a | Own invoices only |
| Record manual payment / void payment | Yes | Yes | No |
| Dashboard and reports | Yes | Yes | No |

This is our documented rule set where the statement is silent. Put the same table in the README.

---

## 4. Tech stack and decisions

| Layer | Choice |
|---|---|
| Frontend | React 18 + Vite, Tailwind CSS, React Router, Axios, `@supabase/supabase-js` (auth only), `qrcode.react`, `recharts`, `react-hot-toast` |
| Backend | Node 20 + Express, `zod` validation, `pg` (direct Postgres with transactions), `@supabase/supabase-js` (admin auth API), `node-cron`, `nodemailer`, `pdfkit`, `cors`, `helmet`, `dotenv`, `morgan` |
| Database and Auth | **Supabase** (hosted Postgres + Supabase Auth) |
| Language | JavaScript (CommonJS in backend, ESM in frontend) |

**Key architecture decisions**
- The frontend **never queries database tables directly**. It talks to our Express API, and uses Supabase only for login, forgot-password and session. All tables have RLS enabled with no policies, so the public anon key cannot read data.
- The backend connects to Postgres with `DATABASE_URL` (Supabase pooler string) through `pg`, so we can use real transactions. It verifies each request's Supabase JWT and loads the user's role from `profiles`.
- **Public signup in Supabase is disabled.** Customers sign up through `POST /api/auth/signup` (so our password rules are enforced). Staff are created through the admin-only endpoint.
- **Password reset**: the frontend calls `supabase.auth.resetPasswordForEmail(email, { redirectTo: FRONTEND_URL + '/reset-password' })`. The reset page then sends the new password to `POST /api/auth/reset-password` (with the recovery session token), where the backend validates our password rules and sets it with the admin API. This stops anyone bypassing the rules by calling Supabase directly.
- Pick the Supabase region nearest to the users (e.g. Mumbai `ap-south-1`) to help the 2-second target.

---

## 5. Repository structure and folder ownership

```
/
├── PROJECT_GUIDE.md
├── README.md                      (A)
├── .gitignore                     (A)
├── .github/CODEOWNERS             (A)
├── scripts/check-owned-paths.sh   (A)
├── docs/
│   ├── member-a/  member-b/  member-c/  member-d/   (each member's notes, screenshots)
├── supabase/
│   ├── config.toml
│   └── migrations/
│       ├── 0001_foundation.sql    (A range: 0001-0099)
│       ├── 0100_catalog.sql       (B range: 0100-0199)
│       ├── 0200_subscriptions.sql (C range: 0200-0299)
│       └── 0300_billing.sql       (D range: 0300-0399)
├── backend/
│   ├── package.json  .env.example
│   ├── scripts/
│   │   ├── seed-admin.js          (A)
│   │   ├── seed-catalog.js        (B)
│   │   └── seed-bulk.js           (D)
│   └── src/
│       ├── server.js  app.js      (A)
│       ├── config/                (A)
│       ├── db/                    (A)  pool.js, withTransaction
│       ├── lib/                   (A)  errors, asyncHandler, pagination, money, supabaseAdmin, mailer
│       ├── middleware/            (A)  requireAuth, requireRole, validate, errorHandler
│       ├── jobs/
│       │   ├── scheduler.js       (A)  registers jobs from the files below
│       │   ├── billing.job.js     (C)
│       │   └── autoclose.job.js   (C)
│       └── modules/
│           ├── auth/              (A)
│           ├── users/             (A)  staff + customers
│           ├── catalog/           (B)  products, variants, taxes, plans, discounts, pricing.service.js
│           ├── subscriptions/     (C)  templates + subscriptions
│           ├── billing/           (C)  billing engine
│           ├── invoices/          (D)
│           ├── payments/          (D)
│           └── reports/           (D)
└── frontend/
    ├── package.json  .env.example
    └── src/
        ├── main.jsx  App.jsx  index.css   (A)
        ├── lib/                   (A)  api.js, supabase.js, AuthContext.jsx
        ├── components/            (A)  shared UI: Button, Input, Table, Modal, Badge, Pagination, StatusBadge, PageHeader
        ├── layouts/               (A)  AdminLayout, PortalLayout, ProtectedRoute
        └── pages/
            ├── auth/              (A)  login, signup, forgot, reset
            ├── users/             (A)  staff list/create, customers
            ├── catalog/           (B)
            ├── subscriptions/     (C)  includes portal/ for customer subscription pages
            ├── invoices/          (D)  includes portal/ for customer invoice pages
            ├── payments/          (D)  includes PayConfirmPage (the QR landing page)
            └── reports/           (D)  dashboard
```

**Ownership rule:** every file belongs to exactly one member. The paths above are the only places each member writes. Anything not listed under B, C or D belongs to A.

**How modules plug in without shared-file edits**
- Backend: `app.js` mounts every module router at `/api` from a fixed list. Each module's `index.js` exports an Express router that defines its own full sub-paths (for example `router.get('/products', ...)`).
- Frontend: each `pages/<module>/routes.jsx` exports `routes` and `navItems`. `App.jsx` and the layouts read them from every module.

---

## 6. Git workflow (no conflicts)

**One-time (Member A, after Phase 0)**
- GitHub > Settings > Branches > protect `main`: require a pull request and 1 approval; block force-push.
- Add `.github/CODEOWNERS` mapping each folder to its owner's GitHub username.

**Branch naming:** `a/<feature>`, `b/<feature>`, `c/<feature>`, `d/<feature>`, e.g. `b/plans-crud`, `d/pay-confirm-page`.

**Daily loop for every member**
```bash
git checkout main
git pull origin main
git checkout -b b/plans-crud          # one branch per feature
# ... work (only in your owned folders) ...
git add -A
git commit -m "feat(catalog): plans CRUD with period and flags"
git fetch origin
git rebase origin/main                # resolve locally if needed
bash scripts/check-owned-paths.sh B   # must print OK
git push -u origin b/plans-crud
# open a Pull Request into main; another member approves; squash and merge
```

**Rules**
- Push small PRs at least daily. Merge fast; do not let branches live for days.
- Never `git push --force` on a shared branch. Never commit `.env`, `node_modules`, `dist`.
- **Lockfiles and package.json** are touched only by Member A (all dependencies are installed in Phase 0). If a lockfile conflict ever appears, take `main`'s version (`git checkout origin/main -- package-lock.json`) and run `npm install`.
- **Migrations**: each member only creates files inside their own number range and only alters their own tables. Never edit a migration that is already merged; add a new file (e.g. `0101_catalog_add_notes.sql`). Member A is the **database gatekeeper**: after pulling `main`, A runs `supabase db push --include-all`. Others message A when they merge a migration.
- If you need a change in someone else's area, message that member; do not edit their files.

**`scripts/check-owned-paths.sh`** (Member A commits this in Phase 0)
```bash
#!/usr/bin/env bash
# usage: bash scripts/check-owned-paths.sh A|B|C|D
me="$1"
[ -z "$me" ] && { echo "usage: $0 A|B|C|D"; exit 1; }
owner_of() {
  case "$1" in
    backend/src/modules/catalog/*|backend/scripts/seed-catalog.js|frontend/src/pages/catalog/*|supabase/migrations/01*|docs/member-b/*) echo B;;
    backend/src/modules/subscriptions/*|backend/src/modules/billing/*|backend/src/jobs/billing.job.js|backend/src/jobs/autoclose.job.js|frontend/src/pages/subscriptions/*|supabase/migrations/02*|docs/member-c/*) echo C;;
    backend/src/modules/invoices/*|backend/src/modules/payments/*|backend/src/modules/reports/*|backend/scripts/seed-bulk.js|frontend/src/pages/invoices/*|frontend/src/pages/payments/*|frontend/src/pages/reports/*|supabase/migrations/03*|docs/member-d/*) echo D;;
    *) echo A;;
  esac
}
bad=0
for f in $(git diff --name-only origin/main...HEAD); do
  o=$(owner_of "$f")
  if [ "$o" != "$me" ]; then echo "NOT YOURS ($o owns): $f"; bad=1; fi
done
[ $bad -eq 0 ] && echo "OK: all changed files are owned by $me" || { echo "Fix before pushing."; exit 1; }
```
(Member A skips this check only for the Phase 0 skeleton commits.)

---

## 7. Environment variables and Supabase setup

### 7.1 Member A creates the Supabase project
1. Create a project at supabase.com (region nearest to users). Save the database password.
2. **Authentication > Providers > Email**: enable email provider; **turn OFF "Allow new users to sign up"** (we create users through the backend); set minimum password length to 9. Leave the "required characters" option at default (our backend enforces uppercase/lowercase/special).
3. **Authentication > URL Configuration**: Site URL = `http://localhost:5173`; add the deployed URL later; add `http://localhost:5173/reset-password` to Redirect URLs.
4. Collect: Project URL, anon key, service role key, and the **pooler connection string** (Project Settings > Database > Connection string > Transaction pooler).
5. Share these **privately** (not in git, not in the group's public channel) with B, C, D. Each puts them in their own local `.env` files.

### 7.2 `backend/.env.example`
```
PORT=4000
NODE_ENV=development
FRONTEND_URL=http://localhost:5173
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
DATABASE_URL=            # Supabase pooler connection string
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
MAIL_FROM="Brightloop <no-reply@brightloop.test>"
CRON_ENABLED=true
BILLING_CRON=0 1 * * *   # daily 01:00
AUTO_CONFIRM_INVOICES=true
ADMIN_EMAIL=admin@brightloop.test
ADMIN_PASSWORD=Admin@12345
```

### 7.3 `frontend/.env.example`
```
VITE_API_URL=http://localhost:4000/api
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

### 7.4 Running locally
```bash
# backend
cd backend && cp .env.example .env && npm install && npm run dev
# frontend (new terminal)
cd frontend && cp .env.example .env && npm install && npm run dev
```
`.env` is git-ignored. Only `.env.example` is committed.

---

## 8. Business rules (shared by everyone)

**Passwords:** regex `^(?=.*[a-z])(?=.*[A-Z])(?=.*[^A-Za-z0-9]).{9,}$`. Emails lower-cased and unique.

**Money:** DECIMAL(12,2) in DB. In JS, convert to integer paise with `lib/money.js`, calculate, convert back. Currency INR.

**Line math (per line):**
```
gross     = quantity * unit_price
discount  = discount_amount allocated to the line (>= 0, <= gross)
net       = gross - discount
tax       = PERCENT: net * rate / 100 ; FIXED: flat tax amount per line
line_total= net + tax          (invoice_lines.amount stores net; totals stored on invoice)
invoice.subtotal = sum(gross) ; discount_total = sum(discount) ; tax_total = sum(tax)
invoice.total    = subtotal - discount_total + tax_total
```

**Unit price snapshot:** `unit_price = product.sales_price + variant.extra_price` at the time the subscription line is created. Tax rate and type are copied onto the subscription line. Invoices copy from subscription lines. Later catalog edits never change existing records.

**Subscription statuses and transitions** (enforced in ONE service, illegal jumps rejected with 409):
```
DRAFT -> QUOTATION -> CONFIRMED -> ACTIVE -> CLOSED
DRAFT -> CLOSED (discard)      QUOTATION -> CLOSED (rejected/expired)
```
- DRAFT: being prepared. QUOTATION: sent to the customer (has `quotation_valid_until`).
- CONFIRMED: accepted; sets `next_billing_date = start_date`.
- ACTIVE: running and billable. Set by the daily job when `start_date <= today`, or manually via the Activate button.
- CLOSED: ended. Early close is allowed only if `plan.closable` is true. Auto close at expiry only if `plan.auto_close` is true.
- Pause/resume use `is_paused` (not a new status) and need `plan.pausable`. Paused subscriptions are skipped by billing.
- Renew needs `plan.renewable`: extends `expiry_date` by the original term (`expiry_date - start_date`) and reopens a CLOSED-by-expiry subscription to ACTIVE.
- Every transition writes a row in `subscription_status_history`.

**Invoice statuses:** `DRAFT -> CONFIRMED -> PAID`, plus `CANCELLED` (from DRAFT or CONFIRMED with no completed payments).
- Billing creates DRAFT invoices; with `AUTO_CONFIRM_INVOICES=true` they are created as CONFIRMED immediately. There is also a bulk "Confirm all drafts" action.
- Customers see only CONFIRMED and PAID invoices. Only CONFIRMED invoices can be paid.
- Invoice becomes PAID when `amount_paid >= total`. Voiding a payment recalculates and can move it back to CONFIRMED.

**Overdue (derived, never stored):** `status = 'CONFIRMED' AND due_date < current_date`.
**Due date:** `issue_date + payment terms` (`IMMEDIATE`=0, `NET_15`=15, `NET_30`=30, `NET_60`=60 days).

**Billing period and next billing date:** invoice period = `[next_billing_date, next_billing_date + 1 period - 1 day]`. After invoicing, `next_billing_date += 1 period` (day/week/month/year). If several periods were missed, the engine bills each missed period, oldest first (catch-up), so nothing is skipped.

**Discounts:** eligible if `is_active`, today within start/end (null = open), `usage_limit IS NULL OR times_used < usage_limit`, total quantity >= `min_qty`, and subtotal >= `min_purchase`. Scope `PRODUCT` applies only to lines of listed products; scope `SUBSCRIPTION` applies to the whole subtotal (allocated across lines proportionally, last line absorbs rounding). **Rule: at most one discount per invoice, the one with the largest saving.** `times_used` increments inside the invoice-creation transaction.

**Revenue and outstanding:** revenue = sum of COMPLETED payments in the date range. Outstanding = sum of `total - amount_paid` over CONFIRMED invoices. MRR = active subscriptions' line amounts normalised to monthly (daily x30, weekly x52/12, monthly x1, yearly /12).

**Error format (all endpoints):**
```json
{ "error": { "code": "VALIDATION_ERROR", "message": "Password must ...", "details": [] } }
```
Codes: `VALIDATION_ERROR` 400, `UNAUTHENTICATED` 401, `FORBIDDEN` 403, `NOT_FOUND` 404, `CONFLICT` 409, `INTERNAL` 500.
**Success:** `{ "data": ... }`. **Lists:** `{ "data": [...], "page": 1, "pageSize": 20, "total": 134 }` using `?page=1&pageSize=20` (max 100). Every list endpoint is paginated.

---

## 9. API contract

All routes are prefixed with `/api`. Auth header: `Authorization: Bearer <supabase access token>`. "Any" means any logged-in user; customers are always restricted to their own data.

### Auth and users (Member A)
| Method | Path | Who | Notes |
|---|---|---|---|
| POST | `/auth/signup` | Public | `{email,password,fullName,phone?}` creates auth user, profile (role CUSTOMER) and customer row |
| POST | `/auth/reset-password` | Recovery token | `{password}` validates rules, sets via admin API |
| GET | `/auth/me` | Any | `{id,email,fullName,role,customerId}` |
| GET | `/users/staff` | Admin | list staff |
| POST | `/users/staff` | Admin | `{email,password,fullName}` creates STAFF |
| PATCH | `/users/staff/:id` | Admin | update name, `isActive` |
| GET | `/customers` | Admin, Staff | `?search=&page=` |
| POST | `/customers` | Admin, Staff | create customer record (optionally without login) |
| GET | `/customers/:id` | Admin, Staff | |
| PATCH | `/customers/:id` | Admin, Staff | |
| GET / PATCH | `/me/customer` | Customer | own profile |

### Catalog (Member B)
| Method | Path | Who |
|---|---|---|
| GET | `/products`, `/products/:id` | Admin, Staff |
| POST / PATCH / DELETE | `/products`, `/products/:id` | Admin |
| POST / PATCH / DELETE | `/products/:id/variants`, `/variants/:variantId` | Admin |
| GET / POST / PATCH / DELETE | `/taxes`, `/taxes/:id` | read: Admin, Staff; write: Admin |
| GET | `/plans`, `/plans/:id`, `/plans/available` | Admin, Staff |
| POST / PATCH / DELETE | `/plans`, `/plans/:id` | Admin |
| GET | `/discounts`, `/discounts/:id` | Admin, Staff |
| POST / PATCH / DELETE | `/discounts`, `/discounts/:id` | **Admin only** |

Product body: `{name,type,salesPrice,costPrice,notes,taxId,variants:[{attribute,value,extraPrice}]}`.
Plan body: `{name,price,billingPeriod,minQty,availableFrom,availableTo,autoClose,closable,pausable,renewable,isActive}`.
Discount body: `{name,type,value,minPurchase,minQty,startDate,endDate,usageLimit,scope,productIds:[]}`.

**Exported service for Member C** (`backend/src/modules/catalog/pricing.service.js`), signatures are fixed:
```js
getUnitPrice(client, { productId, variantId })        // -> Number-like string "1560.00" (sales_price + extra_price)
getTaxForProduct(client, productId)                   // -> { taxId, rate, type } | { taxId:null, rate:'0', type:'PERCENT' }
findBestDiscount(client, { lines, subtotal, totalQty, onDate })
   // lines: [{ productId, quantity, gross }] ; subtotal in paise-safe string
   // -> { discountId, name, lineAllocations:[{ index, amount }], total } | null
```
`client` is a `pg` client inside the caller's transaction (so the discount read participates in the same transaction).

### Subscriptions and billing (Member C)
| Method | Path | Who | Notes |
|---|---|---|---|
| GET/POST/PATCH/DELETE | `/quotation-templates`, `/quotation-templates/:id` | Admin, Staff | `{name,planId,validityDays,lines:[{productId,variantId,quantity}]}` |
| GET | `/subscriptions` | Any | filters: `status,customerId,planId,search`; customers see own only |
| GET | `/subscriptions/:id` | Any | customers: own only |
| POST | `/subscriptions` | Admin, Staff | `{customerId,planId,templateId?,startDate,expiryDate,paymentTerms,lines?}`; with `templateId`, lines and plan are prefilled |
| PATCH | `/subscriptions/:id` | Admin, Staff | only while DRAFT or QUOTATION |
| POST | `/subscriptions/:id/send-quotation` | Admin, Staff | DRAFT -> QUOTATION |
| POST | `/subscriptions/:id/confirm` | Admin, Staff | QUOTATION -> CONFIRMED |
| POST | `/subscriptions/:id/activate` | Admin, Staff | CONFIRMED -> ACTIVE |
| POST | `/subscriptions/:id/close` | Admin, Staff, owner Customer | plan.closable |
| POST | `/subscriptions/:id/pause`, `/resume` | Admin, Staff, owner Customer | plan.pausable |
| POST | `/subscriptions/:id/renew` | Admin, Staff, owner Customer | plan.renewable |
| GET | `/subscriptions/:id/history` | Any (own) | status timeline |
| POST | `/billing/run` | Admin, Staff | manual "Run billing now"; returns the run summary |
| GET | `/billing/runs` | Admin, Staff | run history |

### Invoices, payments, reports (Member D)
| Method | Path | Who | Notes |
|---|---|---|---|
| GET | `/invoices` | Any | filters: `status,customerId,subscriptionId,from,to,overdue=true,search`; customers: own, CONFIRMED/PAID only |
| GET | `/invoices/:id` | Any | with lines, payments; customers: own only |
| POST | `/invoices/:id/confirm` | Admin, Staff | DRAFT -> CONFIRMED |
| POST | `/invoices/confirm-bulk` | Admin, Staff | confirm all drafts (optional `ids`) |
| POST | `/invoices/:id/cancel` | Admin, Staff | |
| POST | `/invoices/:id/send` | Admin, Staff | emails PDF to customer, sets `sent_at` |
| GET | `/invoices/:id/pdf` | Any (own) | PDF stream used for Print |
| POST | `/invoices/:id/pay` | Customer (own) | the QR "Paid" action; body is empty, amount comes from the DB |
| GET | `/payments` | Admin, Staff | filters: `invoiceId,method,status,from,to` |
| POST | `/payments` | Admin, Staff | manual record `{invoiceId,method,amount,paidOn,note}` |
| POST | `/payments/:id/void` | Admin, Staff | `{reason}` |
| GET | `/reports/summary` | Admin, Staff | counts and sums, filters `from,to,planId,customerId` |
| GET | `/reports/active-subscriptions` | Admin, Staff | paginated |
| GET | `/reports/revenue` | Admin, Staff | grouped by `day|month` |
| GET | `/reports/payments` | Admin, Staff | paginated |
| GET | `/reports/overdue-invoices` | Admin, Staff | paginated, with days overdue |

`/reports/summary` returns: `{activeSubscriptions, mrr, revenue, outstanding, overdueCount, overdueAmount, invoicesByStatus:{...}, paymentsByMethod:{...}}`.

---

## 10. Database schema (migrations)

Member A commits these four files in **Phase 0** exactly as written and runs `supabase db push`. After that each member owns edits to their own tables via new files in their own number range.

### `supabase/migrations/0001_foundation.sql` (A)
```sql
create extension if not exists pgcrypto;

create or replace function set_updated_at() returns trigger as $$
begin new.updated_at = now(); return new; end;
$$ language plpgsql;

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  full_name text not null,
  phone text,
  role text not null default 'CUSTOMER' check (role in ('ADMIN','STAFF','CUSTOMER')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_profiles_updated before update on profiles
  for each row execute function set_updated_at();

create table customers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references profiles(id) on delete set null,
  name text not null,
  email text unique,
  phone text,
  company text,
  address text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_customers_updated before update on customers
  for each row execute function set_updated_at();

create sequence subscription_number_seq start 1000;
create sequence invoice_number_seq start 1000;

-- Frontend uses the anon key only for auth. No table is readable through it.
alter table profiles enable row level security;
alter table customers enable row level security;
```

### `supabase/migrations/0100_catalog.sql` (B)
```sql
create table taxes (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type text not null default 'PERCENT' check (type in ('PERCENT','FIXED')), -- FIXED = flat amount per line
  rate numeric(8,2) not null check (rate >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type text not null check (type in ('SERVICE','SOFTWARE','ADDON','GOODS')),
  sales_price numeric(12,2) not null check (sales_price >= 0),
  cost_price numeric(12,2) not null default 0 check (cost_price >= 0),
  notes text,
  tax_id uuid references taxes(id),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  attribute text not null,            -- e.g. 'Brand'
  value text not null,                -- e.g. 'Odoo'
  extra_price numeric(12,2) not null default 0,   -- e.g. 560
  unique (product_id, attribute, value)
);

create table plans (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  price numeric(12,2) not null check (price >= 0),
  billing_period text not null check (billing_period in ('DAILY','WEEKLY','MONTHLY','YEARLY')),
  min_qty integer not null default 1 check (min_qty >= 1),
  available_from date,
  available_to date,
  auto_close boolean not null default false,
  closable boolean not null default false,
  pausable boolean not null default false,
  renewable boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (available_to is null or available_from is null or available_to >= available_from)
);

create table discounts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type text not null check (type in ('FIXED','PERCENT')),
  value numeric(12,2) not null check (value > 0),
  min_purchase numeric(12,2) not null default 0,
  min_qty integer not null default 0,
  start_date date,
  end_date date,
  usage_limit integer,                -- null = unlimited
  times_used integer not null default 0,
  scope text not null check (scope in ('PRODUCT','SUBSCRIPTION')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date is null or start_date is null or end_date >= start_date)
);

create table discount_products (
  discount_id uuid not null references discounts(id) on delete cascade,
  product_id uuid not null references products(id) on delete cascade,
  primary key (discount_id, product_id)
);

create index idx_products_active on products(is_active);
create index idx_variants_product on product_variants(product_id);
create index idx_plans_active on plans(is_active, available_from, available_to);
create index idx_discounts_active on discounts(is_active, start_date, end_date);

alter table taxes enable row level security;
alter table products enable row level security;
alter table product_variants enable row level security;
alter table plans enable row level security;
alter table discounts enable row level security;
alter table discount_products enable row level security;
```

### `supabase/migrations/0200_subscriptions.sql` (C)
```sql
create table quotation_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  plan_id uuid not null references plans(id),
  validity_days integer not null default 30 check (validity_days > 0),
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table quotation_template_lines (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references quotation_templates(id) on delete cascade,
  product_id uuid not null references products(id),
  variant_id uuid references product_variants(id),
  quantity integer not null default 1 check (quantity > 0)
);

create table subscriptions (
  id uuid primary key default gen_random_uuid(),
  number text not null unique default ('SUB-' || lpad(nextval('subscription_number_seq')::text, 6, '0')),
  customer_id uuid not null references customers(id),
  plan_id uuid not null references plans(id),
  template_id uuid references quotation_templates(id),
  start_date date not null,
  expiry_date date,
  next_billing_date date,
  payment_terms text not null default 'NET_15' check (payment_terms in ('IMMEDIATE','NET_15','NET_30','NET_60')),
  status text not null default 'DRAFT' check (status in ('DRAFT','QUOTATION','CONFIRMED','ACTIVE','CLOSED')),
  is_paused boolean not null default false,
  quotation_valid_until date,
  notes text,
  created_by uuid references profiles(id),
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (expiry_date is null or expiry_date >= start_date)
);

create table subscription_lines (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references subscriptions(id) on delete cascade,
  product_id uuid not null references products(id),
  variant_id uuid references product_variants(id),
  description text not null,
  quantity integer not null check (quantity > 0),
  unit_price numeric(12,2) not null,          -- snapshot: sales_price + variant extra
  tax_id uuid references taxes(id),
  tax_rate numeric(8,2) not null default 0,   -- snapshot
  tax_type text not null default 'PERCENT' check (tax_type in ('PERCENT','FIXED')),
  amount numeric(12,2) not null               -- quantity * unit_price (before tax)
);

create table subscription_status_history (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references subscriptions(id) on delete cascade,
  from_status text,
  to_status text not null,
  action text,                                 -- 'confirm','pause','renew', ...
  changed_by uuid references profiles(id),
  changed_at timestamptz not null default now()
);

create table billing_runs (
  id uuid primary key default gen_random_uuid(),
  triggered_by text not null check (triggered_by in ('CRON','MANUAL')),
  triggered_user uuid references profiles(id),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  due_count integer not null default 0,
  invoices_created integer not null default 0,
  skipped_existing integer not null default 0,
  failed integer not null default 0,
  details jsonb
);

create trigger trg_subscriptions_updated before update on subscriptions
  for each row execute function set_updated_at();

create index idx_subs_status on subscriptions(status);
create index idx_subs_customer on subscriptions(customer_id);
create index idx_subs_plan on subscriptions(plan_id);
create index idx_subs_due on subscriptions(next_billing_date) where status = 'ACTIVE' and is_paused = false;
create index idx_sublines_sub on subscription_lines(subscription_id);
create index idx_history_sub on subscription_status_history(subscription_id);

alter table quotation_templates enable row level security;
alter table quotation_template_lines enable row level security;
alter table subscriptions enable row level security;
alter table subscription_lines enable row level security;
alter table subscription_status_history enable row level security;
alter table billing_runs enable row level security;
```

### `supabase/migrations/0300_billing.sql` (D)
```sql
create table invoices (
  id uuid primary key default gen_random_uuid(),
  number text not null unique default ('INV-' || lpad(nextval('invoice_number_seq')::text, 6, '0')),
  subscription_id uuid not null references subscriptions(id),
  customer_id uuid not null references customers(id),
  period_start date not null,
  period_end date not null,
  issue_date date not null default current_date,
  due_date date not null,
  subtotal numeric(12,2) not null default 0,
  discount_total numeric(12,2) not null default 0,
  tax_total numeric(12,2) not null default 0,
  total numeric(12,2) not null default 0,
  amount_paid numeric(12,2) not null default 0,
  status text not null default 'DRAFT' check (status in ('DRAFT','CONFIRMED','PAID','CANCELLED')),
  sent_at timestamptz,
  confirmed_at timestamptz,
  paid_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_invoice_period unique (subscription_id, period_start)   -- prevents double billing
);
create trigger trg_invoices_updated before update on invoices
  for each row execute function set_updated_at();

create table invoice_lines (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references invoices(id) on delete cascade,
  product_id uuid references products(id),
  description text not null,
  quantity integer not null,
  unit_price numeric(12,2) not null,
  discount_amount numeric(12,2) not null default 0,
  tax_rate numeric(8,2) not null default 0,
  tax_type text not null default 'PERCENT',
  tax_amount numeric(12,2) not null default 0,
  amount numeric(12,2) not null               -- net = qty*unit_price - discount (before tax)
);

create table invoice_discounts (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references invoices(id) on delete cascade,
  discount_id uuid not null references discounts(id),
  name text not null,
  amount numeric(12,2) not null
);

create table payments (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references invoices(id),
  method text not null check (method in ('QR','CASH','CARD','BANK_TRANSFER','UPI','OTHER')),
  amount numeric(12,2) not null check (amount > 0),
  paid_on timestamptz not null default now(),
  note text,
  source text not null default 'MANUAL_STAFF' check (source in ('PORTAL_SELF_CONFIRMED','MANUAL_STAFF')),
  status text not null default 'COMPLETED' check (status in ('COMPLETED','VOIDED')),
  recorded_by uuid references profiles(id),
  voided_by uuid references profiles(id),
  voided_at timestamptz,
  void_reason text,
  created_at timestamptz not null default now()
);

create index idx_inv_status_due on invoices(status, due_date);
create index idx_inv_overdue on invoices(due_date) where status = 'CONFIRMED';
create index idx_inv_customer on invoices(customer_id);
create index idx_inv_sub on invoices(subscription_id);
create index idx_inv_issue on invoices(issue_date);
create index idx_invlines_inv on invoice_lines(invoice_id);
create index idx_pay_invoice on payments(invoice_id);
create index idx_pay_paid_on on payments(paid_on) where status = 'COMPLETED';

alter table invoices enable row level security;
alter table invoice_lines enable row level security;
alter table invoice_discounts enable row level security;
alter table payments enable row level security;
```

---

# 11. MEMBER A: Foundation, Auth, Roles, Shell

**Starting prompt for Antigravity:** *"Read PROJECT_GUIDE.md. I am Member A. Do Phase 0 first, then Phase 1. Obey section 2."*

**Owns:** everything not listed under B, C or D. Specifically `backend/src/{server.js,app.js,config,db,lib,middleware}`, `backend/src/jobs/scheduler.js`, `backend/src/modules/{auth,users}`, `backend/scripts/seed-admin.js`, `frontend/src/{main.jsx,App.jsx,index.css,lib,components,layouts}`, `frontend/src/pages/{auth,users}`, `supabase/migrations/00xx`, root files, `.github`, `scripts/`, `docs/member-a`.

## Phase 0: Skeleton (target: 1 to 2 hours; everyone else is waiting on this, so keep it minimal and push fast)

Push directly to `main`. Then turn on branch protection.

1. **Repo root:** `.gitignore` (node_modules, dist, .env, .DS_Store, .vscode), `README.md` (stub), `PROJECT_GUIDE.md`, `.github/CODEOWNERS` (placeholders for 4 usernames), `scripts/check-owned-paths.sh` (copy from section 6), `docs/member-{a,b,c,d}/.gitkeep`.
2. **Supabase:** create the project per section 7.1. Commit the four migration files from section 10 and `supabase/config.toml` (`supabase init`). Link with `supabase link --project-ref <ref>` and run `supabase db push --include-all`. Confirm all tables exist in the dashboard.
3. **Backend scaffold** (`cd backend && npm init -y`). Install **all** dependencies now:
   `express cors helmet morgan dotenv zod pg @supabase/supabase-js node-cron nodemailer pdfkit` and dev `nodemon`. Scripts: `dev` (nodemon src/server.js), `start`.
   - `src/config/env.js`: loads and validates env vars.
   - `src/db/pool.js`: exports `pool`, `query(text, params)`, and `withTransaction(async (client) => {...})` (BEGIN/COMMIT/ROLLBACK, release in `finally`).
   - `src/lib/`: `errors.js` (`AppError` with `status`, `code`; helpers `badRequest`, `forbidden`, `notFound`, `conflict`), `asyncHandler.js`, `pagination.js` (`parsePaging(req.query)` returns `{page,pageSize,limit,offset}`, `pageResult(data,page,pageSize,total)`), `money.js` (`toPaise(str|number)`, `fromPaise(int) -> "123.45"`, `mulPaise`, `percentOf`), `supabaseAdmin.js` (service-role client), `mailer.js` (`sendMail({to,subject,html,attachments})`).
   - `src/middleware/`: `requireAuth.js` (verify the bearer token with `supabaseAdmin.auth.getUser(token)`, load profile with role/isActive and `customerId`, attach `req.user = {id,email,role,customerId}`; 401 if missing/invalid, 403 if inactive), `requireRole.js` (`requireRole('ADMIN','STAFF')`), `validate.js` (zod body/query validator), `errorHandler.js` (outputs the error format in section 8).
   - `src/app.js`: cors (origin `FRONTEND_URL`), helmet, json, morgan, `GET /api/health`, then:
     ```js
     const modules = ['auth','users','catalog','subscriptions','billing','invoices','payments','reports'];
     modules.forEach((m) => app.use('/api', require(`./modules/${m}`)));
     app.use(errorHandler);
     ```
   - **Stub every module**: `src/modules/<m>/index.js` exporting an empty `express.Router()` (so the app boots). Also create the stub `src/modules/catalog/pricing.service.js` with the three exported functions from section 9 (returning safe defaults: price `'0.00'`, tax `{taxId:null,rate:'0',type:'PERCENT'}`, discount `null`) so Member C is never blocked.
   - `src/jobs/scheduler.js`: if `CRON_ENABLED=true`, schedule `BILLING_CRON` calling `require('./billing.job').runDaily()` and `require('./autoclose.job')` is called from inside the billing job. Create stubs `billing.job.js` (exports `runDaily = async () => {}`) and `autoclose.job.js` (exports `run = async () => {}`) so C only fills them in.
   - `src/server.js`: start server and the scheduler.
   - `.env.example` from section 7.2.
4. **Frontend scaffold** (`npm create vite@latest frontend -- --template react`). Install **all** dependencies now:
   `react-router-dom axios @supabase/supabase-js qrcode.react recharts react-hot-toast` and dev `tailwindcss postcss autoprefixer` (configure Tailwind).
   - `src/lib/api.js`: Axios instance, base `VITE_API_URL`, adds the Supabase access token to every request, unwraps `{data}`, shows toast on `error.message`.
   - `src/lib/supabase.js`, `src/lib/AuthContext.jsx` (session, `user` from `/auth/me`, `login`, `logout`, `role`).
   - `src/components/`: Button, Input, Select, Textarea, Table (with empty/loading states), Pagination, Modal, Badge, StatusBadge (color per status), PageHeader, Card, Spinner, ConfirmDialog.
   - `src/layouts/`: `ProtectedRoute` (redirects to `/login?next=<current path>` if unauthenticated; checks `roles`), `AdminLayout` (sidebar from all modules' `navItems`, filtered by role), `PortalLayout` (customer top nav).
   - **Module registry in `App.jsx`:**
     ```jsx
     import * as auth from './pages/auth/routes';
     import * as users from './pages/users/routes';
     import * as catalog from './pages/catalog/routes';
     import * as subscriptions from './pages/subscriptions/routes';
     import * as invoices from './pages/invoices/routes';
     import * as payments from './pages/payments/routes';
     import * as reports from './pages/reports/routes';
     const modules = [auth, users, catalog, subscriptions, invoices, payments, reports];
     ```
     Each `routes.jsx` exports:
     ```jsx
     export const routes = [
       // area: 'public' | 'admin' (Admin+Staff layout) | 'portal' (Customer layout)
       { path: '/products', element: <ProductList />, area: 'admin', roles: ['ADMIN','STAFF'] },
     ];
     export const navItems = [ { label: 'Products', path: '/products', roles: ['ADMIN','STAFF'], group: 'Catalog' } ];
     ```
     `App.jsx` builds the router from every module's `routes`, wrapping by `area`/`roles`. Create a `routes.jsx` stub in every `pages/<module>/` exporting empty arrays.
   - `.env.example` from section 7.3. After login, redirect Admin/Staff to `/dashboard`, Customer to `/portal/subscriptions`, honouring `?next=`.
5. **Verify:** `npm run dev` in both folders boots with no errors; `/api/health` returns `{data:{ok:true}}`. Commit, push to `main`, announce "Phase 0 done" to the team, then enable branch protection.

## Phase 1: Auth, roles, staff, customers (branch `a/auth`)

**Backend (`modules/auth`, `modules/users`)** implementing the endpoints in section 9:
- `POST /auth/signup`: zod-validate (email, password regex from section 8, fullName). Check duplicate email (case-insensitive) and return `409 CONFLICT` "An account with this email already exists." Create the user with `supabaseAdmin.auth.admin.createUser({email,password,email_confirm:true})`, then in one transaction insert `profiles` (role forced to `CUSTOMER`; ignore any role in the body) and `customers` (linked via `user_id`). If a DB step fails, delete the auth user (rollback).
- `POST /auth/reset-password`: requires a valid Supabase recovery token via `requireAuth`; validate the password rules; call `supabaseAdmin.auth.admin.updateUserById(id,{password})`.
- `GET /auth/me`.
- `POST /users/staff` (Admin only): same validation, role `STAFF`. `GET /users/staff`, `PATCH /users/staff/:id` (Admin only).
- Customers CRUD for Admin/Staff with search and pagination; `GET/PATCH /me/customer` for the logged-in customer.
- `scripts/seed-admin.js`: creates the admin account from `ADMIN_EMAIL`/`ADMIN_PASSWORD` with role `ADMIN` (idempotent). Run it once; tell the team the credentials.

**Frontend (`pages/auth`, `pages/users`)**
- Login, Signup (live password-rule checklist showing the 4 rules), Forgot password (calls `supabase.auth.resetPasswordForEmail`), Reset password page (reads recovery session, posts to `/auth/reset-password`, shows rule errors).
- Admin: Staff list + "Add staff" modal (visible to Admin only). Staff/Admin: Customers list, create, edit.
- Customer: simple "My profile" page at `/portal/profile`.

**Acceptance**
- [ ] Duplicate email rejected with a clear message
- [ ] Passwords with 8 or fewer characters, or missing upper/lower/special, are rejected by the API (test with curl, not only the UI)
- [ ] Reset email arrives; new weak password is rejected; strong one works
- [ ] A STAFF token gets 403 on `POST /users/staff`
- [ ] A CUSTOMER token gets 403 on any admin route
- [ ] Signup body containing `"role":"ADMIN"` still creates a CUSTOMER

## Phase 2: Integration support and deployment (after B, C, D have merged work)
- Review and merge PRs quickly; act as database gatekeeper (`supabase db push --include-all` after migration merges).
- Write `README.md`: setup steps, env variables, seed commands, role permission table, assumptions (section 8), "simulated QR payment" disclaimer, demo credentials.
- Deploy: backend on Render/Railway, frontend on Vercel/Netlify; set `FRONTEND_URL`, CORS, Supabase Site URL and Redirect URLs, `VITE_API_URL`. A deployed HTTPS URL makes the QR scannable from a phone during the demo.
- Final cross-role test pass (section 16).

---

# 12. MEMBER B: Catalog (products, variants, taxes, plans, discounts)

**Starting prompt for Antigravity:** *"Read PROJECT_GUIDE.md. I am Member B. Do the work in section MEMBER B only. Phase 0 is already merged. Obey section 2."*

**Owns:** `backend/src/modules/catalog/`, `backend/scripts/seed-catalog.js`, `frontend/src/pages/catalog/`, `supabase/migrations/01xx`, `docs/member-b/`.
**Do not touch:** anything else. If you need a shared helper changed, ask Member A.
**Branches:** `b/taxes`, `b/products-variants`, `b/plans`, `b/discounts`, `b/pricing-service`.

## Task B1: Taxes (admin-defined rules)
- API: `/taxes` CRUD (write Admin only, read Admin+Staff). Validate `type` and `rate >= 0`; soft-disable with `isActive` rather than hard-deleting taxes used by products.
- UI `/taxes`: table + create/edit modal. Staff sees it read-only (hide the buttons, but the backend must also enforce it).

## Task B2: Products and variants
- API: `/products` CRUD with pagination, `search`, `type` filter; product body includes nested `variants`. `/products/:id/variants` and `/variants/:variantId` for add/edit/remove. Unique `(product, attribute, value)`. Return products with their variants and tax.
- Prevent deleting a product used by subscription lines or invoices; return 409 and suggest deactivating (`isActive=false`).
- UI `/products`: list with search/filter; `/products/new` and `/products/:id/edit`: form with name, type, sales price, cost price, notes, tax dropdown, and a dynamic variants table (attribute, value, extra price). Example to demo: Product "Business Suite", variant Brand = Odoo, extra price 560.
- Show margin (sales - cost) in the list.

## Task B3: Plans
- API: `/plans` CRUD, plus `GET /plans/available` returning plans that are `is_active` and where today is within `available_from`/`available_to` (null means open). Validate period enum, `min_qty >= 1`, date order.
- Flags `autoClose`, `closable`, `pausable`, `renewable` are stored per plan (the admin decides plan by plan).
- UI `/plans`: list showing period, price, availability window, and flag chips; form with four period options, min quantity, two date pickers, and four toggles with short help text (e.g. "Auto-close: subscription closes by itself at its expiry date").

## Task B4: Discounts (Admin only)
- API: `/discounts` CRUD. **All writes require `requireRole('ADMIN')`**; reads allowed for Staff. Validate `type`, `value > 0` (and `<= 100` when PERCENT), dates, `usageLimit >= 1 or null`, `scope`; when scope is `PRODUCT` require at least one product in `productIds`. Return `timesUsed` and a computed `status`: `ACTIVE | UPCOMING | EXPIRED | EXHAUSTED | DISABLED`.
- UI `/discounts`: list with status badge and usage (`3 / 10`); form with type, value, min purchase, min quantity, start/end date, usage limit, scope, and a product multi-select when scope is Product. Staff sees read-only.

## Task B5: Pricing service (critical for Member C)
Replace the stub in `modules/catalog/pricing.service.js`, keeping the signatures from section 9:
- `getUnitPrice(client, {productId, variantId})`: `sales_price + coalesce(variant.extra_price,0)`; verify the variant belongs to the product; use `client.query` so it works inside C's transaction.
- `getTaxForProduct(client, productId)`: returns the product's active tax or the zero tax.
- `findBestDiscount(client, {lines, subtotal, totalQty, onDate})`: implement the eligibility and "best single discount" rules from section 8. Lock the discount rows with `FOR UPDATE` so concurrent billing cannot exceed `usage_limit`. For SUBSCRIPTION scope, allocate the amount across lines proportionally using integer paise, with the last line absorbing rounding. Do **not** increment `times_used` here; C does that in the invoice transaction.
- Write a small script or test file in `backend/src/modules/catalog/__tests__/pricing.test.js` (plain node assert is fine) covering: fixed vs percent, expired, exhausted, min quantity, min purchase, product-scope vs subscription-scope.

## Task B6: Seed data
`backend/scripts/seed-catalog.js` (idempotent): taxes (GST 18% and GST 5%), 3 products (e.g. "Business Suite" with Brand variants Odoo +560 and Zoho +300, "CRM Add-on", "Analytics Add-on"), 4 plans (Monthly, Yearly, Weekly, Daily; set flags differently across them), and 2 discounts (10% for 10+ seats, flat 500 off orders over 5000). The demo and Member D's bulk seed use these.

**Acceptance for Member B**
- [ ] Odoo variant adds 560 to the unit price from `getUnitPrice`
- [ ] A STAFF token cannot create a discount (403), tested with curl
- [ ] Plans accept all four periods, min qty, date window and four flags
- [ ] Expired, exhausted and not-yet-started discounts are never returned by `findBestDiscount`
- [ ] Every list endpoint is paginated; every page loads in under 2 seconds
**Hand-off message to team when B5 merges:** "pricing.service is real; C can integrate."

---

# 13. MEMBER C: Quotations, Subscriptions, Billing engine

**Starting prompt for Antigravity:** *"Read PROJECT_GUIDE.md. I am Member C. Do the work in section MEMBER C only. Phase 0 is already merged. Obey section 2."*

**Owns:** `backend/src/modules/{subscriptions,billing}/`, `backend/src/jobs/{billing.job.js,autoclose.job.js}`, `frontend/src/pages/subscriptions/` (including `portal/`), `supabase/migrations/02xx`, `docs/member-c/`.
**Depends on:** Member B's `pricing.service.js` (a working stub exists from Phase 0, so you can start immediately and get real values once B merges). The tables for invoices exist already from `0300_billing.sql`.
**Branches:** `c/templates`, `c/subscriptions-crud`, `c/lifecycle`, `c/billing-engine`, `c/portal-subscriptions`.

## Task C1: Quotation templates
- API `/quotation-templates` CRUD (Admin+Staff). A template has a plan, `validityDays`, and lines (product, optional variant, quantity). Replace lines atomically on update.
- UI `/quotation-templates`: list; form with plan dropdown (available plans only), validity days, and an editable lines table.

## Task C2: Subscriptions CRUD
- `POST /subscriptions`: if `templateId` is given, prefill plan and lines from the template and set `quotation_valid_until = today + validity_days`. For each line call `getUnitPrice` and `getTaxForProduct` and **store the snapshots** on `subscription_lines` (`unit_price`, `tax_id`, `tax_rate`, `tax_type`, `amount = qty * unit_price`). Enforce `quantity >= plan.min_qty`. Status starts `DRAFT`. Number comes from the DB default (`SUB-001000`...). Write the first history row.
- `GET /subscriptions` with filters (`status, customerId, planId, search`) and pagination. **Customers automatically see only their own** (use `req.user.customerId`; ignore any `customerId` query value for customers).
- `GET /subscriptions/:id` returns header, lines, totals, customer, plan, and the status history. Customers: 404 if not theirs.
- `PATCH` only while DRAFT or QUOTATION (recompute line snapshots if lines change).

## Task C3: Lifecycle service (single source of truth)
One file `subscriptions/subscription.lifecycle.js` with an `ALLOWED` transitions map and a `transition(client, id, action, user)` function used by every endpoint. It must:
- reject illegal jumps with 409 and a message naming the current and requested status;
- on `confirm`: set `next_billing_date = start_date`; on `activate`: require CONFIRMED;
- `close` early only if `plan.closable` (else 403 "This plan does not allow early closing"); `pause`/`resume` only if `plan.pausable`; `renew` only if `plan.renewable` (extend `expiry_date` by the original term; if the subscription was CLOSED by expiry, set it back to ACTIVE and recompute `next_billing_date` as the next unbilled period);
- for customers, verify ownership first, and allow only `close`, `pause`, `resume`, `renew`;
- write a `subscription_status_history` row for every change.

## Task C4: Billing engine (the heart of the system)
File `billing/billing.service.js` exposes `runBilling({ trigger: 'CRON'|'MANUAL', userId })`. Algorithm:
1. Insert a `billing_runs` row.
2. **Activate due**: `UPDATE subscriptions SET status='ACTIVE' WHERE status='CONFIRMED' AND start_date <= current_date` (write history rows).
3. **Find due**: ids where `status='ACTIVE' AND is_paused=false AND next_billing_date <= current_date AND (expiry_date IS NULL OR next_billing_date <= expiry_date)`, ordered by `next_billing_date`. Process in batches (e.g. 200) so hundreds or thousands are fine.
4. **For each subscription, its own transaction** (`withTransaction`), and one failure must not stop the others (catch, count in `failed`, store the message in `details`):
   ```
   SELECT ... FROM subscriptions WHERE id=$1 FOR UPDATE      -- lock, then re-check it is still due
   WHILE next_billing_date <= today AND next_billing_date <= expiry_date(or open):
       period_start = next_billing_date; period_end = period_start + 1 period - 1 day
       build lines from subscription_lines (snapshots; description includes variant)
       gross per line; totalQty; subtotal
       discount = findBestDiscount(client, {...})            -- from Member B
       per-line discount, tax per line (rules in section 8), totals via lib/money
       due_date = issue_date + payment terms
       INSERT INTO invoices (...) ON CONFLICT (subscription_id, period_start) DO NOTHING RETURNING id
       if no row returned -> skipped_existing++ and still advance next_billing_date
       else insert invoice_lines, insert invoice_discounts,
            UPDATE discounts SET times_used = times_used + 1
                 WHERE id=$1 AND (usage_limit IS NULL OR times_used < usage_limit)
            (if 0 rows updated -> the discount just ran out: recompute this invoice without it)
       status = AUTO_CONFIRM_INVOICES ? 'CONFIRMED' (confirmed_at=now()) : 'DRAFT'
       next_billing_date = next_billing_date + 1 period
   UPDATE subscriptions SET next_billing_date = ...
   ```
5. Call `autoclose.job.run()`.
6. Finish the `billing_runs` row and return `{runId, dueCount, invoicesCreated, skippedExisting, failed}`.

**Idempotency proof (must be demonstrable):** running the billing twice in a row creates zero new invoices the second time.
- `jobs/billing.job.js`: `runDaily = () => runBilling({trigger:'CRON'})`.
- `jobs/autoclose.job.js`: closes `ACTIVE` subscriptions where `expiry_date < current_date` and the plan has `auto_close = true` (history row action `auto_close`), and also closes `QUOTATION` subscriptions whose `quotation_valid_until` has passed.
- `POST /billing/run` (Admin, Staff) and `GET /billing/runs`.

## Task C5: Frontend (staff side)
- `/subscriptions`: table with number, customer, plan, status badge, next billing date, filters (status, plan, customer search), pagination.
- `/subscriptions/new`: choose customer, optionally a template (prefills plan and lines), dates, payment terms, editable lines with live unit price (variant selector), tax and amount, and a totals box.
- `/subscriptions/:id`: details, lines, **status stepper** (Draft > Quotation > Confirmed > Active > Closed highlighting the current stage so anyone on the team sees where it stands), action buttons that appear only when allowed (Send quotation, Confirm, Activate, Pause/Resume, Close, Renew), and a history timeline. Also list its invoices (call `GET /invoices?subscriptionId=`; shown once D merges).
- `/billing`: "Run billing now" button, last run summary cards, and a runs table. Show the result toast "N invoices created, M already billed".

## Task C6: Customer portal pages (in `pages/subscriptions/portal/`)
- `/portal/subscriptions`: the customer's own subscriptions as cards with status, plan, next billing date, amount.
- `/portal/subscriptions/:id`: lines, status stepper, and only the allowed buttons (Pause, Resume, Close, Renew) based on plan flags; confirm dialogs.
- Register both in `pages/subscriptions/routes.jsx` with `area:'portal'`, `roles:['CUSTOMER']` and add portal nav items.

**Acceptance for Member C**
- [ ] Subscription numbers auto-generate and are unique
- [ ] Template creates a subscription with correct plan, lines and quotation validity
- [ ] Illegal status jumps return 409; flags gate pause/close/renew; customers cannot act on others' subscriptions
- [ ] Billing run produces invoices with lines, tax and totals filled in; a second run creates none
- [ ] A subscription 3 periods behind gets 3 invoices (catch-up); a paused one gets none
- [ ] Discount appears on the next invoice automatically, `times_used` increments, and it stops at the usage limit or end date
- [ ] Billing 1,000 due subscriptions completes without timing out (test with D's bulk seed)

---

# 14. MEMBER D: Invoices, Payments (QR flow), Reports

**Starting prompt for Antigravity:** *"Read PROJECT_GUIDE.md. I am Member D. Do the work in section MEMBER D only. Phase 0 is already merged. Obey section 2."*

**Owns:** `backend/src/modules/{invoices,payments,reports}/`, `backend/scripts/seed-bulk.js`, `frontend/src/pages/{invoices,payments,reports}/` (including `invoices/portal/`), `supabase/migrations/03xx`, `docs/member-d/`.
**Depends on:** C's billing engine creates the invoices; until it merges, insert test invoices with SQL or your own seed script.
**Branches:** `d/invoices-api`, `d/invoice-pdf-email`, `d/payments-qr`, `d/reports`, `d/bulk-seed`, `d/invoice-ui`.

## Task D1: Invoice API (staff and customer)
- `GET /invoices` with filters (`status, customerId, subscriptionId, from, to, overdue, search`) and pagination. Include `isOverdue` and `daysOverdue` computed in SQL. **Customers: forced `customer_id = req.user.customerId` and status IN (CONFIRMED, PAID).**
- `GET /invoices/:id`: header, customer, lines, applied discount, payments, outstanding balance; 404 for another customer's invoice.
- Actions (Admin/Staff), each validating the current status and returning 409 on illegal moves:
  - `POST /invoices/:id/confirm` (DRAFT -> CONFIRMED, set `confirmed_at`)
  - `POST /invoices/confirm-bulk` (all DRAFT, or the given `ids`) in one SQL update
  - `POST /invoices/:id/cancel` (not allowed if it has COMPLETED payments)
  - `POST /invoices/:id/send` (emails the PDF with Nodemailer; sets `sent_at`; if DRAFT, confirm first or reject, your choice, document it)
  - `GET /invoices/:id/pdf` using `pdfkit`: company header, customer, number, dates, lines table, discount, tax, total, paid, balance.

## Task D2: Payments and the QR "Paid / Not paid" flow
**`POST /invoices/:id/pay` (Customer only), inside one `withTransaction`:**
1. `SELECT ... FROM invoices WHERE id=$1 FOR UPDATE`.
2. 404 if the invoice does not belong to `req.user.customerId`.
3. 409 unless `status = 'CONFIRMED'` (already paid, cancelled or draft are rejected; this also stops double clicks).
4. Compute `amountDue = total - amount_paid` **from the database**; ignore any amount from the client.
5. Insert `payments` (`method='QR'`, `amount=amountDue`, `paid_on=now()`, `note='Confirmed via QR (simulated)'`, `source='PORTAL_SELF_CONFIRMED'`, `recorded_by=req.user.id`).
6. Update the invoice: `amount_paid = amount_paid + amountDue`, `status='PAID'`, `paid_at=now()`.
7. Return the updated invoice. Optionally email a receipt (do not fail the payment if the email fails).

**Staff side**
- `POST /payments` manual record (method, amount, `paidOn`, note) against a CONFIRMED invoice; reject amount > outstanding; when `amount_paid >= total` set PAID.
- `POST /payments/:id/void` `{reason}`: mark VOIDED, recompute `amount_paid` as the sum of COMPLETED payments, and move PAID back to CONFIRMED if needed. Write who and why.
- `GET /payments` with filters and pagination.

**Frontend**
- `pages/payments/PayConfirmPage.jsx` at route `/pay/:invoiceId` (`area:'portal'`, role CUSTOMER; the ProtectedRoute redirects unauthenticated users to login and returns here). It shows the invoice number, customer, and **amount due**, with two buttons: **Paid** (calls `POST /invoices/:id/pay`, then shows a success screen and a link to the invoice) and **Not paid** (navigates back, no API call). Show a small "Simulated payment" notice.
- In the customer invoice detail, the **Pay** button opens a Modal with `<QRCodeSVG value={`${window.location.origin}/pay/${invoice.id}`} />`, the invoice number, the amount, and the text "Scan with your phone, or open the link". Include a copyable link. Disable Pay when the invoice is not CONFIRMED. After returning, refetch so the status updates to Paid.
- Staff: "Record payment" modal on the invoice page and a Payments list page `/payments` with a Void action.
- Note for phone scanning: `localhost` will not open on a phone. Use the deployed URL, or your laptop's LAN IP on the same Wi-Fi.

## Task D3: Reports and dashboard (performance-critical)
All numbers come from **SQL aggregates** (`COUNT`, `SUM`, `GROUP BY`, `FILTER`), never from loading rows into JS. Every list is paginated.
- `GET /reports/summary` returns the fields listed in section 9. Example MRR query: sum of active, non-paused subscription line amounts, multiplied by the period factor via a `CASE` on `plans.billing_period`.
- `GET /reports/revenue?from&to&groupBy=day|month` (sum of COMPLETED payments), `GET /reports/active-subscriptions`, `GET /reports/payments`, `GET /reports/overdue-invoices` (CONFIRMED and due_date < current_date, sorted by days overdue desc).
- Use `EXPLAIN ANALYZE` on each query against the bulk seed; if any sequential scan appears on a large table, add an index via a new `03xx` migration.
- **Dashboard UI `/dashboard`** (Admin and Staff landing page): KPI cards (Active subscriptions, MRR, Revenue this period, Outstanding, Overdue count and amount), a revenue bar/line chart (recharts), invoices-by-status and payments-by-method breakdowns, filters (date range, plan, customer), and an Overdue invoices table with "days overdue" and a quick link to open each invoice. Also tabs or links to Active subscriptions and Payments tables with the same filters.
- Show loading skeletons; fetch the KPI request and the tables in parallel.

## Task D4: Invoice UI
- Staff `/invoices`: filters (status, overdue, date range, customer), status badges, pagination, row actions Confirm / Cancel / Send / Print, and a "Confirm all drafts" button. `/invoices/:id`: full view with lines, tax and discount breakdown, payments table, outstanding amount, action buttons shown only when the action is valid.
- **Print**: fetch `/invoices/:id/pdf` with Axios as a blob and open it with `window.open(URL.createObjectURL(blob))` (a plain link cannot send the auth header).
- Portal `pages/invoices/portal/`: `/portal/invoices` (list with Paid/Outstanding tabs, overdue highlighted) and `/portal/invoices/:id` (detail, Print, **Pay** button). Register with `area:'portal'`, `roles:['CUSTOMER']`.

## Task D5: Bulk seed for performance proof
`backend/scripts/seed-bulk.js` (idempotent, takes `--subs=5000`): using `generate_series` and set-based SQL (not row-by-row loops) create customers, subscriptions (mix of statuses and periods) with lines, then invoices (mix of DRAFT/CONFIRMED/PAID/overdue) and payments for the paid ones. Use existing plans and products from B's seed. Aim for 5,000+ subscriptions and 15,000+ invoices; it should finish within a minute. Record page timings in `docs/member-d/performance.md`.

**Acceptance for Member D**
- [ ] Customer sees only their own CONFIRMED/PAID invoices; another customer's invoice id returns 404
- [ ] Pressing **Paid** records a payment (method QR, amount from DB, date, note), marks the invoice Paid, and the dashboard numbers change
- [ ] Pressing **Not paid** changes nothing; double-clicking Paid creates one payment only
- [ ] Confirm, cancel, send (email arrives) and print (PDF) all work; illegal transitions return 409
- [ ] Voiding a payment returns the invoice to outstanding
- [ ] Dashboard shows active subscriptions, revenue, outstanding, payments, overdue with working filters
- [ ] With 5,000+ subscriptions, every page and report responds in under 2 seconds (timings documented)

---

# 15. Integration, seeding, performance

**Integration order (everyone, after Phase 0)**
1. A merges auth. B, C, D can then test with real tokens (`seed-admin`, then signup a customer).
2. B merges taxes/products/plans first (so C can create subscriptions), then discounts and the pricing service.
3. C merges subscriptions, then the billing engine. D merges invoices and payments in parallel.
4. Integration session (all 4 together, 1 hour): run seeds, create a subscription from a template, run billing, confirm, pay via QR, check the dashboard.

**Seed order:** `seed-admin.js` (A) > `seed-catalog.js` (B) > create a few customers and subscriptions in the UI > `seed-bulk.js` (D).

**Performance checklist (owned jointly, measured by D)**
- Pagination on every list; no `SELECT *` without `LIMIT`.
- Aggregates in SQL; the indexes from section 10 exist.
- Use the Supabase pooler `DATABASE_URL`; reuse one `pg` Pool (max about 10).
- Dashboard issues requests in parallel; avoid N+1 queries (join customer and plan names in the list query).
- Measure with browser DevTools Network tab on the bulk-seeded database. Target under 2 seconds per page.

**Troubleshooting**
- *Merge conflict in a file you do not own*: you edited someone else's file. Revert it (`git checkout origin/main -- <file>`) and message the owner.
- *Lockfile conflict*: take main's version, then `npm install`.
- *Migration out of sync*: ask Member A to run `supabase db push --include-all`.
- *401 on every call*: the frontend is not sending the Supabase access token, or the backend `.env` project keys differ from the frontend's.
- *QR page unreachable on phone*: use the deployed URL or LAN IP, and add it to CORS and Supabase redirect URLs.

---

# 16. Demo script and final checklist

**Demo flow (follow the story of the problem statement)**
1. Customer signs up (show duplicate email and weak password rejected), logs in, tries forgot password.
2. Admin logs in; creates a staff member; shows staff cannot create discounts.
3. Admin creates a product with the Odoo variant (+560), a plan, a tax, and a discount.
4. Staff creates a quotation template, builds a subscription from it, moves it Draft > Quotation > Confirmed > Active.
5. Press **Run billing now**: invoices appear with lines, tax and the discount. Press it again: zero new invoices.
6. Customer logs into the portal: sees only their own subscriptions and invoices; pauses/closes where the plan allows.
7. Customer presses **Pay**, scans the QR on a phone, taps **Paid**: invoice turns Paid.
8. Staff records a manual cash payment on another invoice; voids a payment.
9. Finance lead opens the dashboard: active subscriptions, MRR, revenue, outstanding, overdue; applies filters; shows the 5,000+ record timing.
10. State clearly: "The QR payment is a simulated gateway."

**Final checklist (map to the statement)**
- [ ] Unique email; password more than 8 chars with upper, lower and special; reset link emailed
- [ ] Admin, Staff and Customer roles enforced on the backend; only Admin creates staff and discounts
- [ ] Products with variants (Odoo +560); plans with 4 periods, min qty, availability dates and 4 flags
- [ ] Quotation template to subscription; auto number; full status flow visible
- [ ] Invoices auto-generated with taxes and totals; no double billing; no skipped periods
- [ ] Invoice confirm, cancel, send, print; Draft > Confirmed > Paid
- [ ] Discounts auto-applied, stop on expiry or usage limit; usage counted transactionally
- [ ] Payments recorded with method, amount, date, note; paid vs outstanding visible
- [ ] Dashboard with filters and summary; under 2 seconds with thousands of records
- [ ] README with setup, assumptions, permissions table, simulated-payment note
- [ ] No secrets committed; `.env.example` present; every member's work merged via PRs
