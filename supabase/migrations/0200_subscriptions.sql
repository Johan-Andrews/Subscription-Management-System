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

