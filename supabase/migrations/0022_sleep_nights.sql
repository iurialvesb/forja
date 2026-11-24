-- Fases del sueño por noche (llegan del Atajo de Apple Salud; Intervals.icu no las da). date = día en que te despiertas.
create table if not exists public.sleep_nights (
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  asleep_min numeric(6,1),
  deep_min numeric(6,1),
  rem_min numeric(6,1),
  core_min numeric(6,1),
  awake_min numeric(6,1),
  in_bed_min numeric(6,1),
  bedtime timestamptz,
  wake_time timestamptz,
  source text not null default 'healthkit',
  updated_at timestamptz not null default now(),
  primary key (user_id, date)
);
alter table public.sleep_nights enable row level security;
create policy "own rows" on public.sleep_nights for all using (user_id = auth.uid()) with check (user_id = auth.uid());
