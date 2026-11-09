-- Mejoras de la revisión: reservas con un toque, cintura, recompra de suplementos, resumen semanal y avisos de caducidad.
alter table public.planned_sessions add column if not exists reserved boolean not null default false;
alter table public.body_metrics add column if not exists waist_cm numeric(5,1);
alter table public.supplements add column if not exists buy_url text;
alter table public.supplements add column if not exists low_pushed_on date;
alter table public.pantry_items add column if not exists expiry_pushed_on date;

create table if not exists public.weekly_reports (
  user_id uuid not null references auth.users(id) on delete cascade,
  week_start date not null,
  summary jsonb not null,
  text text not null,
  created_at timestamptz not null default now(),
  seen_at timestamptz,
  primary key (user_id, week_start)
);
alter table public.weekly_reports enable row level security;
drop policy if exists "own weekly" on public.weekly_reports;
create policy "own weekly" on public.weekly_reports for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Categorías de HYROX por parejas.
alter table public.profiles drop constraint if exists profiles_hyrox_division_check;
alter table public.profiles add constraint profiles_hyrox_division_check check (hyrox_division is null or hyrox_division in ('open_men','open_women','pro_men','pro_women','doubles_men','doubles_women','doubles_mixed'));
