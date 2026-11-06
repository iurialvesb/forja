-- Lista de la compra con estado (marcar comprado → pasa a la despensa) y compensación semanal opcional.
create table public.shopping_lists (
  user_id uuid not null references auth.users(id) on delete cascade,
  week_start date not null,
  shopping_date date not null,
  items jsonb not null default '[]',
  covered jsonb not null default '[]',
  checked text[] not null default '{}',
  updated_at timestamptz not null default now(),
  primary key (user_id, week_start)
);
alter table public.shopping_lists enable row level security;
create policy "own rows" on public.shopping_lists for all using (user_id = auth.uid()) with check (user_id = auth.uid());

alter table public.nutrition_settings add column if not exists compensate boolean not null default false;
alter table public.nutrition_settings add column if not exists shopping_day smallint not null default 6 check (shopping_day between 1 and 7);  -- sábado
alter table public.planned_meals add column if not exists eaten_fraction numeric(3,2);
