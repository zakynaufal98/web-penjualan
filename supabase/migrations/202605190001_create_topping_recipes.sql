create extension if not exists pgcrypto;

create table if not exists public.topping_recipes (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  batch_size numeric not null default 1 check (batch_size > 0),
  overhead_pct numeric not null default 0 check (overhead_pct >= 0),
  margin_pct numeric not null default 0 check (margin_pct >= 0),
  hpp_per_unit numeric not null default 0 check (hpp_per_unit >= 0),
  suggested_price numeric not null default 0 check (suggested_price >= 0),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.topping_recipe_items (
  id uuid primary key default gen_random_uuid(),
  topping_recipe_id uuid not null references public.topping_recipes(id) on delete cascade,
  ingredient_master_id uuid not null references public.ingredient_masters(id) on delete restrict,
  ingredient_name text not null,
  quantity_per_unit numeric not null check (quantity_per_unit > 0),
  unit text not null default 'gr',
  cost_per_unit numeric not null default 0 check (cost_per_unit >= 0),
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.production_log_toppings (
  id uuid primary key default gen_random_uuid(),
  production_log_id uuid not null references public.production_logs(id) on delete cascade,
  ingredient_master_id uuid not null references public.ingredient_masters(id) on delete restrict,
  name text not null,
  quantity_per_unit numeric not null check (quantity_per_unit > 0),
  unit text not null default 'gr',
  cost_per_unit numeric not null default 0 check (cost_per_unit >= 0),
  created_at timestamptz not null default now()
);

create index if not exists topping_recipe_items_recipe_idx
  on public.topping_recipe_items(topping_recipe_id);

create index if not exists topping_recipe_items_master_idx
  on public.topping_recipe_items(ingredient_master_id);

create index if not exists production_log_toppings_log_idx
  on public.production_log_toppings(production_log_id);

create index if not exists production_log_toppings_master_idx
  on public.production_log_toppings(ingredient_master_id);

create unique index if not exists topping_recipes_created_by_name_idx
  on public.topping_recipes(created_by, lower(name));

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_topping_recipes_updated_at on public.topping_recipes;
create trigger set_topping_recipes_updated_at
before update on public.topping_recipes
for each row execute function public.set_updated_at();

alter table public.topping_recipes enable row level security;
alter table public.topping_recipe_items enable row level security;
alter table public.production_log_toppings enable row level security;

drop policy if exists "Allow authenticated read topping recipes" on public.topping_recipes;
create policy "Allow authenticated read topping recipes"
on public.topping_recipes for select
to authenticated
using (true);

drop policy if exists "Allow authenticated insert topping recipes" on public.topping_recipes;
create policy "Allow authenticated insert topping recipes"
on public.topping_recipes for insert
to authenticated
with check (true);

drop policy if exists "Allow authenticated update topping recipes" on public.topping_recipes;
create policy "Allow authenticated update topping recipes"
on public.topping_recipes for update
to authenticated
using (true)
with check (true);

drop policy if exists "Allow authenticated delete topping recipes" on public.topping_recipes;
create policy "Allow authenticated delete topping recipes"
on public.topping_recipes for delete
to authenticated
using (true);

drop policy if exists "Allow authenticated read topping recipe items" on public.topping_recipe_items;
create policy "Allow authenticated read topping recipe items"
on public.topping_recipe_items for select
to authenticated
using (true);

drop policy if exists "Allow authenticated insert topping recipe items" on public.topping_recipe_items;
create policy "Allow authenticated insert topping recipe items"
on public.topping_recipe_items for insert
to authenticated
with check (true);

drop policy if exists "Allow authenticated update topping recipe items" on public.topping_recipe_items;
create policy "Allow authenticated update topping recipe items"
on public.topping_recipe_items for update
to authenticated
using (true)
with check (true);

drop policy if exists "Allow authenticated delete topping recipe items" on public.topping_recipe_items;
create policy "Allow authenticated delete topping recipe items"
on public.topping_recipe_items for delete
to authenticated
using (true);

drop policy if exists "Allow authenticated read production log toppings" on public.production_log_toppings;
create policy "Allow authenticated read production log toppings"
on public.production_log_toppings for select
to authenticated
using (true);

drop policy if exists "Allow authenticated insert production log toppings" on public.production_log_toppings;
create policy "Allow authenticated insert production log toppings"
on public.production_log_toppings for insert
to authenticated
with check (true);

drop policy if exists "Allow authenticated update production log toppings" on public.production_log_toppings;
create policy "Allow authenticated update production log toppings"
on public.production_log_toppings for update
to authenticated
using (true)
with check (true);

drop policy if exists "Allow authenticated delete production log toppings" on public.production_log_toppings;
create policy "Allow authenticated delete production log toppings"
on public.production_log_toppings for delete
to authenticated
using (true);
