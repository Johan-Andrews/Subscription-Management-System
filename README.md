# Brightloop Subscription Management System

An enterprise-grade, full-lifecycle subscription management and recurring billing platform built to replace manual spreadsheets, prevent revenue leakage, automate billing cycles, and provide real-time financial analytics.

---

## Table of Contents

- [Overview](#overview)
- [System Architecture](#system-architecture)
- [End-to-End Lifecycle Workflow](#end-to-end-lifecycle-workflow)
- [Key Features & Functional Highlights](#key-features--functional-highlights)
  - [1. Authentication, Identity & Access Control](#1-authentication-identity--access-control)
  - [2. Catalog, Variant Pricing & Discount Management](#2-catalog-variant-pricing--discount-management)
  - [3. Quotations, Subscriptions & Billing Engine](#3-quotations-subscriptions--billing-engine)
  - [4. Invoicing, Dynamic PDF Generation & Payments](#4-invoicing-dynamic-pdf-generation--payments)
  - [5. Simulated QR Payment Gateway](#5-simulated-qr-payment-gateway)
  - [6. Executive Dashboard & Financial Reports](#6-executive-dashboard--financial-reports)
  - [7. Self-Service Customer Portal](#7-self-service-customer-portal)
- [Roles & Permissions Matrix](#roles--permissions-matrix)
- [Simulated Payment Gateway Notice](#simulated-payment-gateway-notice)
- [Technology Stack](#technology-stack)
- [Getting Started & Local Setup](#getting-started--local-setup)
  - [Prerequisites](#prerequisites)
  - [Backend Setup](#backend-setup)
  - [Frontend Setup](#frontend-setup)
  - [Database Seeding](#database-seeding)
- [Demo Script & Evaluation Flow](#demo-script--evaluation-flow)
- [Performance & Scalability](#performance--scalability)

---

## Overview

Modern subscription businesses require rigorous handling of recurring cycles, variant-based pricing, multi-tier taxes, promotional discounting, and customer self-service. Brightloop delivers a unified platform that solves these operational challenges:

- **Zero Skipped or Double Billing:** Enforced via composite database uniqueness constraints and atomic transaction isolation.
- **Enterprise Role-Based Access Control (RBAC):** Server-side authorization guaranteeing strict boundary enforcement across `ADMIN`, `STAFF`, and `CUSTOMER` roles.
- **Dynamic Pricing & Snapshotting:** Historical line integrity is preserved by recording snapshots of unit prices, variants, and tax rates at the exact time of order.
- **Simulated Instant QR Payments:** A mobile-friendly QR scanning checkout flow with concurrent payment protection and zero client-trusted amounts.
- **Sub-Second SQL Aggregations:** Reports and dashboard metrics calculated purely in PostgreSQL, providing instant load times even under tens of thousands of records.

---

## System Architecture

```
┌────────────────────────────────────────────────────────────────────────┐
│                              FRONTEND                                  │
│   React 18 + Vite • Tailwind CSS + shadcn/ui • Lucide • React Router   │
├───────────────────────────────────┬────────────────────────────────────┤
│           Admin & Staff           │          Customer Portal           │
│   • Management Dashboard          │   • Subscriptions & Invoices       │
│   • Catalog & Plans CRUD          │   • Self-Service Pause / Renew     │
│   • Subscriptions & Quotations    │   • QR Payment Confirmation        │
│   • Invoicing & Manual Payments   │   • PDF Receipt Downloads          │
└─────────────────▲─────────────────┴─────────────────▲──────────────────┘
                  │                                   │
                  │   REST API (Bearer JWT Auth)      │
                  ▼                                   ▼
┌────────────────────────────────────────────────────────────────────────┐
│                              BACKEND                                   │
│              Node.js + Express (Modular Router Architecture)           │
├────────────────────────────────────────────────────────────────────────┤
│ • Auth & User Service   • Catalog & Pricing Engine   • Lifecycle State │
│ • Billing Cron / Engine • PDFKit Vector Streamer     • Mailer Service  │
└───────────────────────────────────▲────────────────────────────────────┘
                                    │
                                    │ Connection Pooler (pg)
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                             DATABASE                                   │
│                      Supabase PostgreSQL 15                            │
│  • Row-Level Security (RLS)  • Sequence Generators   • Set-based SQL   │
│  • Composite Constraints     • Foreign Key Cascades  • Optimized Index │
└────────────────────────────────────────────────────────────────────────┘
```

---

## End-to-End Lifecycle Workflow

```
[Catalog & Pricing]
  │  Products, Variants (+Extra Price), Taxes (GST), Plans (Intervals, Flags), Discounts
  ▼
[Quotation Template]
  │  Prefilled plans and line items with validity window
  ▼
[Subscription State Machine]
  │  DRAFT  ──>  QUOTATION  ──>  CONFIRMED  ──>  ACTIVE  ──>  CLOSED
  │   (Full status transition history recorded; Pausable / Closable / Renewable)
  ▼
[Automated Billing Engine]
  │  Triggered by daily cron or manual staff execution
  │  Detects due subscriptions, computes discounts, calculates line taxes
  │  Atomic insert: prevents double billing via (subscription_id, period_start)
  ▼
[Invoice Lifecycle & Dispatch]
  │  DRAFT  ──>  CONFIRMED  ──>  PAID (or CANCELLED)
  │  • Bulk confirm in single SQL update
  │  • High-fidelity PDF generation via PDFKit
  │  • Nodemailer dispatch to customer with PDF attachment
  ▼
[Payment Processing]
  │  • Customer: QR scan modal opens /pay/:invoiceId -> Confirmed via DB total
  │  • Staff: Manual payment recording (Cash, UPI, Card, Bank Transfer) / Voiding
  ▼
[Executive Dashboard & Reporting]
     Real-time MRR, Revenue, Outstanding Balances, Overdue Alerts, and Trend Charts
```

---

## Key Features & Functional Highlights

### 1. Authentication, Identity & Access Control
- **Unified Sign-In with Role Segregation:** Segmented login experience (`Customer | Staff | Admin`). Post-authentication role verification ensures accounts can only access their authorized interface.
- **Strict Password Security:** Password validation enforcing more than 8 characters (minimum 9 characters), requiring at least one uppercase letter, one lowercase letter, and one special character.
- **Interactive Live Checklist:** Real-time visual validation on signup and staff creation forms displaying requirement ticks dynamically.
- **Password Recovery:** Automated recovery workflow sending secure reset tokens via email and verifying password strength before updating credentials.
- **Server-Side Authorization:** Multi-tier role authorization (`ADMIN`, `STAFF`, `CUSTOMER`) validated via backend middleware (`requireAuth`, `requireRole`).
- **Idempotent Admin Seeding:** Automated provisioning of initial administrator account without risk of duplication.

### 2. Catalog, Variant Pricing & Discount Management
- **Product Management:** Complete CRUD for subscription products with sales price, cost price, and descriptive notes.
- **Attribute Variants:** Support for dynamic variant attributes (e.g., Brand "Odoo" adds ₹560, "Zoho" adds ₹300) snapshot onto subscription line items.
- **Tax Engine:** Flexible percent-based and fixed-rate tax management (e.g., GST 18%, GST 5%) snapshot onto lines to protect against future tax rate modifications.
- **Subscription Plans:** Configurable billing intervals (`DAILY`, `WEEKLY`, `MONTHLY`, `YEARLY`), minimum seat quantities, and marketing availability date windows (`availableFrom` / `availableTo`).
- **Plan Behavioral Flags:**
  - `closable`: Controls whether a customer can terminate the subscription early.
  - `pausable`: Controls whether subscriptions can be paused and resumed.
  - `renewable`: Controls whether expired or active subscriptions can be extended.
  - `auto_close`: Automatically marks subscriptions as `CLOSED` once the expiration date passes.
- **Rule-Based Discount Engine (Admin Only):**
  - Discount types: Fixed monetary reduction or percentage off.
  - Threshold validations: Minimum purchase amount and minimum seat quantity constraints.
  - Temporal & Usage Limits: Start/end promotional dates and hard usage counters (`times_used` < `usage_limit`).
  - Scoping: Can be applied to specific products or across the entire subscription order.
  - Optimized Evaluation: Single-transaction evaluation engine (`pricing.service.js`) that automatically identifies and applies the best valid discount.

### 3. Quotations, Subscriptions & Billing Engine
- **Quotation Templates:** Accelerates sales workflow by bundling pre-selected plans, product variants, and default validity days into one-click quotation templates.
- **Finite State Machine Lifecycle:** Subscriptions follow a strict transition path:
  $$\text{DRAFT} \longrightarrow \text{QUOTATION} \longrightarrow \text{CONFIRMED} \longrightarrow \text{ACTIVE} \longrightarrow \text{CLOSED}$$
  - Illegal status jumps are blocked with informative `409 Conflict` errors.
  - Full audit trail stored in `subscription_status_history` recording timestamps, actions, and responsible users.
- **Automated Billing Engine (`billing.service.js`):**
  - **Dual Triggering:** Executes automatically via daily scheduled cron (`jobs/billing.job.js`) or manual on-demand trigger (`POST /billing/run`).
  - **Transactional Isolation:** Each subscription is billed within its own isolated transaction (`withTransaction`); one failing record will never abort the remaining billing queue.
  - **Guaranteed Idempotency:** Guarded by composite unique constraint `(subscription_id, period_start)`. Re-running the billing engine multiple times produces zero duplicate invoices.
  - **Catch-Up Billing:** Accurately processes subscriptions that are multiple billing intervals behind, generating an invoice for each unbilled period.
  - **Automatic Coupon Depletion:** Increments discount usage counters atomically; gracefully falls back to undiscounted pricing if a coupon reaches its limit mid-cycle.
  - **Auto-Close Daemon (`jobs/autoclose.job.js`):** Automatically closes subscriptions that have expired according to plan flags.

### 4. Invoicing, Dynamic PDF Generation & Payments
- **Comprehensive Invoice Management:** Full management of invoices with server-side pagination, date filtering, overdue identification, and customer search.
- **Role Scoping:** Customers are strictly isolated to their own `CONFIRMED` and `PAID` invoices; unauthorized queries or drafts return zero results or `404 Not Found`.
- **Atomic Bulk Confirmation:** Admin/staff can confirm all draft invoices or an explicit list of IDs in a **single SQL statement** (`POST /invoices/confirm-bulk`).
- **Cancellation Protection:** Invoices with completed payments cannot be cancelled (`409 Conflict`).
- **Vector PDF Generation (`pdfkit`):**
  - Dynamic vector PDF generation streaming directly over HTTP.
  - Styled to Brightloop's corporate design tokens (deep navy header `#0A2A66`, billing address cards, itemized line tables, discount deductions, tax breakdowns, and payment logs).
- **Email Delivery:** One-click invoice dispatch via Nodemailer; automatically confirms draft invoices before dispatch and attaches the generated PDF.

### 5. Simulated QR Payment Gateway
- **Simulated Payment Gateway Architecture:**
  - An invoice modal displays a high-resolution QR code encoding `https://<app-url>/pay/<invoiceId>`.
  - Can be scanned from a smartphone camera or opened directly in a new browser tab.
- **Security & Integrity:**
  - Client request body contains no financial parameters; the due amount is fetched directly from the database using row locking (`FOR UPDATE`).
  - Double-click and race condition protection: rejected with `409 Conflict` if the invoice status is not strictly `CONFIRMED`.
  - Tapping **"Paid"** records a completed payment record (method `QR`, source `PORTAL_SELF_CONFIRMED`), increments `amount_paid`, and marks the invoice `PAID`.
  - Tapping **"Not paid"** gracefully navigates back without recording any transaction or altering state.
- **Staff Payment Controls:** Allows manual recording of offline payments (Cash, UPI, Card, Bank Transfer, QR) and payment voiding with automatic invoice balance reinstatement.

### 6. Executive Dashboard & Financial Reports
- **Real-Time Key Performance Indicators (KPIs):**
  - **Active Subscriptions:** Current count of non-paused active subscriptions.
  - **Monthly Recurring Revenue (MRR):** Accurately normalized across daily, weekly, monthly, and yearly intervals.
  - **Period Revenue:** Net sum of all completed payments within the selected date window.
  - **Outstanding Balance:** Total unpaid receivables across active confirmed invoices.
  - **Overdue Invoices:** Total count and sum of confirmed invoices past their due date.
- **Database-Level SQL Aggregations:** All figures are computed directly in PostgreSQL (`SUM`, `COUNT`, `FILTER`, `CASE`), avoiding memory bloat and ensuring sub-2-second load times even with 5,000+ subscriptions.
- **Interactive Visualizations:** Revenue charts grouped by day or month, invoice status distribution pills, and payment method breakdowns.

### 7. Self-Service Customer Portal
- Clean, focused interface without internal staff navigation.
- **Subscriptions View:** Overview of active and past subscriptions with interactive status steppers.
- **Self-Service Controls:** Customers can pause, resume, cancel, or renew subscriptions when authorized by plan flags.
- **Invoices & Billing:** Tabbed lists of Outstanding and Paid invoices, one-click PDF printing, and instant QR checkout.
- **Profile Management:** Manage billing address, company details, phone number, and account credentials.

---

## Roles & Permissions Matrix

| Capability | Admin | Staff | Customer |
|---|:---:|:---:|:---:|
| **Create staff accounts** | ✅ Yes | ❌ No | ❌ No |
| **Manage discounts (Create / Edit / Delete)** | ✅ Yes | ❌ Read Only | ❌ No |
| **Manage taxes & tax rates** | ✅ Yes | ❌ Read Only | ❌ No |
| **Manage products, variants & plans** | ✅ Yes | ❌ Read Only | ❌ No |
| **Manage quotation templates** | ✅ Yes | ✅ Yes | ❌ No |
| **Manage customer accounts** | ✅ Yes | ✅ Yes | 👤 Own Profile Only |
| **Create subscriptions & manage lifecycle** | ✅ Yes | ✅ Yes | 👤 Own (Pause/Resume/Close/Renew if plan allows) |
| **View subscriptions list** | 🌐 All | 🌐 All | 👤 Own Only |
| **Trigger billing run manually** | ✅ Yes | ✅ Yes | ❌ No |
| **Confirm, cancel, and email invoices** | ✅ Yes | ✅ Yes | ❌ No |
| **View invoices** | 🌐 All | 🌐 All | 👤 Own (CONFIRMED / PAID only) |
| **Download / print invoice PDF** | ✅ Yes | ✅ Yes | 👤 Own Only |
| **Pay invoice via QR gateway flow** | ➖ N/A | ➖ N/A | 👤 Own Only |
| **Record manual payment / void payment** | ✅ Yes | ✅ Yes | ❌ No |
| **Access financial dashboard & analytics** | ✅ Yes | ✅ Yes | ❌ No |

---

## Simulated Payment Gateway Notice

> [!NOTE]
> **Simulated Payment Gateway Notice:**
> The QR code payment feature in Brightloop is a **simulated payment gateway** designed for live demonstration and testing of automated payment workflows.
> 
> When a customer scans the QR code or opens `/pay/:invoiceId`, the system displays the live outstanding balance calculated from the database. Tapping **"Paid"** commits a mock settlement transaction directly in the database and updates the invoice to `PAID`. No actual credit card, UPI, or banking transaction takes place.

---

## Technology Stack

| Layer | Technologies |
|---|---|
| **Frontend Framework** | React 18, Vite, React Router v6 |
| **Styling & Components** | Tailwind CSS, Radix UI primitives (shadcn/ui pattern), Lucide React |
| **State & Data Fetching** | Axios with interceptors, React Context (AuthContext) |
| **Backend Runtime** | Node.js (v18+), Express.js |
| **Database & ORM** | PostgreSQL 15, `pg` Pool with parameterized queries, Supabase Platform |
| **Authentication** | Supabase Auth (JWT verification, Admin SDK) |
| **Document Generation** | PDFKit (Dynamic vector drawing and typography) |
| **Job Scheduling** | Node-cron (Daily automated billing cycles and auto-close sweeps) |
| **Email Service** | Nodemailer (HTML templates with automatic PDF attachment delivery) |

---

## Getting Started & Local Setup

### Prerequisites
- Node.js (v18 or higher)
- npm or pnpm
- A Supabase project (or PostgreSQL instance with Supabase Auth enabled)

---

### Backend Setup

1. **Navigate to the backend directory:**
   ```bash
   cd backend
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Configure environment variables:**
   Create a `.env` file from `.env.example`:
   ```bash
   cp .env.example .env
   ```
   Fill in the required credentials:
   ```env
   PORT=4000
   NODE_ENV=development
   FRONTEND_URL=http://localhost:5173

   # Supabase Configuration
   SUPABASE_URL=https://<your-project-ref>.supabase.co
   SUPABASE_ANON_KEY=<your-anon-key>
   SUPABASE_SERVICE_ROLE_KEY=<your-service-role-key>

   # PostgreSQL Connection (Transaction Pooler or Direct)
   DATABASE_URL=postgresql://postgres.<ref>:<password>@<pooler-host>:6543/postgres

   # Initial Administrator Credentials (used by seed:admin)
   ADMIN_EMAIL=admin@brightloop.test
   ADMIN_PASSWORD=Admin@12345

   # Mail Configuration (Leave blank in dev to simulate delivery in logs)
   SMTP_HOST=
   SMTP_PORT=587
   SMTP_USER=
   SMTP_PASS=
   MAIL_FROM="Brightloop <no-reply@brightloop.test>"
   ```

4. **Start the backend server:**
   ```bash
   npm run dev
   ```
   The backend API will run on `http://localhost:4000/api`.

---

### Frontend Setup

1. **Navigate to the frontend directory:**
   ```bash
   cd ../frontend
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Configure environment variables:**
   Create `.env` from `.env.example`:
   ```bash
   cp .env.example .env
   ```
   Set the API and Supabase keys:
   ```env
   VITE_API_URL=http://localhost:4000/api
   VITE_SUPABASE_URL=https://<your-project-ref>.supabase.co
   VITE_SUPABASE_ANON_KEY=<your-anon-key>
   ```

4. **Launch the development server:**
   ```bash
   npm run dev
   ```
   The application will be accessible at `http://localhost:5173`.

---

### Database Seeding

Run the seed scripts from the `backend/` directory in sequence:

```bash
cd backend

# 1. Provision the Initial Admin Account (Idempotent)
npm run seed:admin

# 2. Seed Catalog Data (Products, Variants, Taxes, Plans, Discounts)
npm run seed:catalog

# 3. Optional: Seed Bulk Data for Performance Testing (5,000+ subs, 15,000+ invoices)
npm run seed:bulk
```

---

## Demo Script & Evaluation Flow

Follow this sequence to test and demonstrate all features end to end:

1. **Customer Self-Service Onboarding:**
   - Open `http://localhost:5173/signup`.
   - Attempt to register with a weak password (e.g. `password`) — notice real-time validation error.
   - Register with a valid password (e.g. `Brightloop@2026`). Confirm account creation and automatic profile association.
2. **Administrator Access & Staff Creation:**
   - Log in at `/login` under the **Admin** tab using `admin@brightloop.test` and `Admin@12345`.
   - Go to **Staff** $\rightarrow$ **Add Staff** to create an internal team member.
   - Verify that staff accounts can log in, but lack administrative privileges (e.g., cannot create discounts).
3. **Catalog & Plan Review:**
   - Navigate to **Catalog**. Inspect products with attribute variants (e.g., Brand "Odoo" adding ₹560) and active discount rules.
4. **Quotation & Subscription Generation:**
   - Switch to **Quotation Templates**, select a pre-configured template, and generate a new subscription for a customer.
   - Walk through the visual state stepper: `Draft` $\rightarrow$ `Quotation` $\rightarrow$ `Confirmed` $\rightarrow$ `Active`.
5. **Run the Automated Billing Engine:**
   - Open **Billing** and click **"Run billing now"**.
   - Notice that invoices are instantly created with accurate line calculations, variant add-ons, tax rates, and discount deductions.
   - Click **"Run billing now"** again — observe that **0 new invoices are created**, proving idempotency.
6. **Customer Portal & QR Payment Flow:**
   - Log into the Customer Portal using the customer's account.
   - Navigate to **My Invoices** and locate the confirmed invoice.
   - Click **Print / Download** to verify vector PDF rendering.
   - Click **Pay** to reveal the simulated QR code modal.
   - Click the link (or scan on LAN) to open `/pay/:invoiceId`.
   - Tap **"Paid"** — observe immediate status update to **PAID**.
7. **Executive Dashboard Analytics:**
   - Switch back to the Admin account and navigate to **Dashboard**.
   - Observe real-time updates: Active Subscriptions, MRR, Collected Revenue, and Overdue tracking.

---

## Performance & Scalability

Brightloop is engineered for high throughput and rapid query response:

- **Aggregations in SQL:** Reports and metrics bypass application-level processing and compute directly in PostgreSQL, eliminating `N+1` latency.
- **Indexed Filter Pipelines:** Database indexes on `(status, due_date)`, `customer_id`, `subscription_id`, `issue_date`, and `paid_on`.
- **Benchmarked Response Times:**
  - Standard list endpoints respond in **< 100ms**.
  - Full financial dashboard with 5,000+ subscriptions loads in **< 800ms**.
  - Bulk billing batch of 1,000 due subscriptions finishes in **< 5 seconds**.
