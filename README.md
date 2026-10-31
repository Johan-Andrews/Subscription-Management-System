# Brightloop Subscription Management System

Enterprise subscription management platform covering catalog, quotations, subscriptions, billing engine, automated invoices, simulated QR payments, and real-time executive dashboard.

## Roles and Permissions

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

> **Payment Gateway Notice:**
> The QR code flow simulates a payment gateway integration for demo purposes. Tapping "Paid" confirms payment against the verified invoice due amount in the database.

## Architecture

- **Frontend:** React 18, Vite, Tailwind CSS, Lucide React, Axios, React Router, Supabase Auth.
- **Backend:** Node.js, Express, Postgres (`pg`), Zod, Supabase Admin SDK, Node-cron, Nodemailer, PDFKit.
- **Database:** Supabase PostgreSQL with Row Level Security (RLS) enabled.
