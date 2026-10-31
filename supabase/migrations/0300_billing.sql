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

