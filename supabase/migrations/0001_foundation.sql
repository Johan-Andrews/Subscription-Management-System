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

