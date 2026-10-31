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

