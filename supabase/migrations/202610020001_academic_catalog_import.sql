-- Academic source catalog only. Does not create saleable products/stock/users.
-- Apply on the selected development database; never replay M1.
-- Rollback: detach consumers first, export these two tables, then drop the new
-- schema in a separately approved maintenance operation. No existing tables change.
create schema catalog_import;
revoke all on schema catalog_import from public, anon, authenticated;

create table catalog_import.datasets (
  dataset_key text primary key check (dataset_key ~ '^amazon-2023-[a-f0-9]{12}$'),
  source_sha256 text not null check (source_sha256 ~ '^[a-f0-9]{64}$'),
  source_url text not null check (source_url = 'https://amazon-reviews-2023.github.io/'),
  expected_products integer not null check (expected_products > 0),
  imported_at timestamptz not null default now()
);
create table catalog_import.products (
  dataset_key text not null references catalog_import.datasets(dataset_key),
  source_id text not null check (source_id ~ '^[A-Z0-9]{10}$'),
  title text not null check (char_length(title) between 1 and 500),
  category text not null check (category in ('All_Beauty', 'Electronics', 'Cell_Phones_and_Accessories', 'Home_and_Kitchen', 'Grocery_and_Gourmet_Food')),
  category_name_vi text not null check (char_length(category_name_vi) between 1 and 100),
  description text not null check (char_length(description) <= 8007),
  features jsonb not null check (jsonb_typeof(features) = 'array' and jsonb_array_length(features) <= 8),
  source_categories jsonb not null check (jsonb_typeof(source_categories) = 'array' and jsonb_array_length(source_categories) <= 10),
  image_urls jsonb not null check (jsonb_typeof(image_urls) = 'array' and jsonb_array_length(image_urls) between 1 and 12),
  price_usd numeric(18,4) check (price_usd > 0 and price_usd <> 'NaN'::numeric),
  source_currency text not null default 'USD' check (source_currency = 'USD'),
  store_name text not null check (char_length(store_name) <= 200),
  average_rating real check (average_rating between 0 and 5),
  primary key (dataset_key, source_id)
);
create index catalog_import_products_category_idx on catalog_import.products(dataset_key, category);
alter table catalog_import.datasets enable row level security;
alter table catalog_import.products enable row level security;
revoke all on all tables in schema catalog_import from public, anon, authenticated, service_role;
grant usage on schema catalog_import to service_role;
grant select on catalog_import.datasets, catalog_import.products to service_role;
comment on schema catalog_import is 'Academic Amazon source fixtures; not saleable catalog. No browser grants or RLS bypass for users.';
