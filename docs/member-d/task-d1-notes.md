# Task D1: Invoice API (Staff & Customer)

## Overview
Implemented the complete Invoices API module according to the specification in `PROJECT_GUIDE.md` (Section 14) and `DESIGN.md`.

## Implemented Endpoints

### 1. `GET /api/invoices`
- **Access**: Any authenticated user (`requireAuth`)
- **Role Enforcement**:
  - `CUSTOMER`: Forces `customer_id = req.user.customerId` and status restricted to `CONFIRMED` or `PAID`.
  - If a customer requests a status outside their permissions (such as `DRAFT` or `CANCELLED`), the service returns zero results rather than falling back to unpermitted data.
  - `ADMIN` & `STAFF`: Can view all invoices with full filter support.
- **Filters**:
  - `status`: Filter by status (`DRAFT`, `CONFIRMED`, `PAID`, `CANCELLED`).
  - `customerId`: Filter by customer ID (staff/admin).
  - `subscriptionId`: Filter by subscription ID.
  - `from`: Invoices with `issue_date >= from`.
  - `to`: Invoices with `issue_date <= to`.
  - `overdue`: If `true`, filters `status = 'CONFIRMED' AND due_date < CURRENT_DATE`.
  - `search`: Case-insensitive search on invoice number, customer name, or customer email.
  - `page`, `pageSize`: Standard pagination with max 100 per page.
- **Computed Fields & Normalization**:
  - Both snake_case and camelCase aliases are provided for maximum compatibility (`isOverdue` and `is_overdue`, `daysOverdue` and `days_overdue`, `outstandingBalance` and `outstanding_balance`, `subscriptionNumber`, `customerId`, `subscriptionId`).
  - `is_overdue`: `(status = 'CONFIRMED' AND due_date < CURRENT_DATE)`
  - `days_overdue`: Difference in days if overdue, else 0
  - `outstanding_balance`: Remaining balance (`total - amount_paid`)

### 2. `GET /api/invoices/:id`
- **Access**: Any authenticated user (own invoice for `CUSTOMER`, any for `ADMIN`/`STAFF`)
- **Returns**: Header details, customer profile, lines with unit price, discount amount, tax rate and amount, applied discount object (`discount`, `appliedDiscount`), discount list (`discounts`), and payment history (`payments`).
- **Security**: 404 returned if a customer attempts to access another customer's invoice or an unconfirmed/draft invoice.

### 3. `POST /api/invoices/:id/confirm`
- **Access**: `ADMIN`, `STAFF`
- **Validation**: Enforces `DRAFT` status; returns `409 CONFLICT` if already confirmed, paid, or cancelled.
- **Action**: Sets `status = 'CONFIRMED'`, `confirmed_at = NOW()`.

### 4. `POST /api/invoices/confirm-bulk`
- **Access**: `ADMIN`, `STAFF`
- **Body**: `{ ids?: string[] }` (optional array of invoice IDs; confirms all drafts if omitted).
- **Action**: Bulk updates matching DRAFT invoices to CONFIRMED in a single SQL operation.

### 5. `POST /api/invoices/:id/cancel`
- **Access**: `ADMIN`, `STAFF`
- **Validation**:
  - Blocks cancellation if completed payments exist (`409 CONFLICT`).
  - Blocks cancellation if status is `PAID` or already `CANCELLED`.
- **Action**: Sets `status = 'CANCELLED'`, `cancelled_at = NOW()`.

### 6. `POST /api/invoices/:id/send`
- **Access**: `ADMIN`, `STAFF`
- **Design Decision**: Auto-confirms `DRAFT` invoices before sending (issuance implies confirmation); rejects `CANCELLED` invoices with `409 CONFLICT`.
- **Action**: Generates PDF invoice, sends email via Nodemailer (`sendMail` with simulation fallback in dev), records `sent_at = NOW()`.

### 7. `GET /api/invoices/:id/pdf`
- **Access**: Any authenticated user (verified ownership for `CUSTOMER`).
- **Response**: Streams a PDF generated with `pdfkit` styled with Brightloop's corporate design tokens (navy header `#0A2A66`, typography, line breakdown, tax and discount summary, payment receipt table).

---

## Test Verification

1. **Unit Tests**: `backend/src/modules/invoices/__tests__/invoices.test.js`
   - Tests `generateInvoicePdfBuffer` with full invoice attributes and minimal edge cases.
   - Verifies valid PDF buffer with `%PDF-` header and layout safety.

2. **Integration Tests**: `backend/src/modules/invoices/__tests__/invoices-api.test.js`
   - Validates live database queries, role enforcement, customer data scoping, SQL-computed overdue fields, transitions, 404/409 errors, and bulk confirmation.
   - All tests run and pass cleanly with automatic teardown of test fixtures.
