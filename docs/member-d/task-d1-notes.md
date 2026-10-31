# Task D1: Invoice API (Staff & Customer)

## Overview
Implemented the complete Invoices API module according to the specification in `PROJECT_GUIDE.md` and `DESIGN.md`.

## Implemented Endpoints

### 1. `GET /api/invoices`
- **Access**: Any authenticated user (`requireAuth`)
- **Role Enforcement**:
  - `CUSTOMER`: Forces `customer_id = req.user.customerId` and status restricted to `CONFIRMED` or `PAID`.
  - `ADMIN` & `STAFF`: Can view all invoices with full filter support.
- **Filters**:
  - `status`: Filter by status (`DRAFT`, `CONFIRMED`, `PAID`, `CANCELLED`).
  - `customerId`: Filter by customer ID (staff/admin).
  - `subscriptionId`: Filter by subscription ID.
  - `from`: Invoices with `issue_date >= from`.
  - `to`: Invoices with `issue_date <= to`.
  - `overdue`: If `true`, returns `status = 'CONFIRMED' AND due_date < CURRENT_DATE`.
  - `search`: Case-insensitive search on invoice number, customer name, or customer email.
  - `page`, `pageSize`: Standard pagination with max 100 per page.
- **Computed Fields**:
  - `is_overdue`: `(status = 'CONFIRMED' AND due_date < CURRENT_DATE)`
  - `days_overdue`: Difference in days if overdue, else 0
  - `outstanding_balance`: Remaining balance (`total - amount_paid`)

### 2. `GET /api/invoices/:id`
- **Access**: Any authenticated user (own invoice for `CUSTOMER`, any for `ADMIN`/`STAFF`)
- **Returns**: Header details, customer profile, lines with unit price, discount amount, tax rate and amount, applied discounts, and payment history.
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
- **Behavior**: Auto-confirms `DRAFT` invoices before sending; generates PDF invoice and sends email via Nodemailer; records `sent_at = NOW()`.

### 7. `GET /api/invoices/:id/pdf`
- **Access**: Any authenticated user (verified ownership for `CUSTOMER`).
- **Response**: Streams a PDF generated with `pdfkit` styled with Brightloop's corporate design tokens (navy header `#0A2A66`, typography, line breakdown, tax and discount summary, payment receipt table).
