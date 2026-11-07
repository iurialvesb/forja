-- Apple Watch automático: HealthFit sube cada entreno (y la salud diaria) a Intervals.icu; Forja lo recoge de ahí.
create table if not exists public.intervals_connections (
  user_id uuid primary key references auth.users(id) on delete cascade,
  athlete_id text not null,
  api_key text not null,
  connected_at timestamptz not null default now(),
  history_from date,
  last_pull_at timestamptz,
  last_error text
);
alter table public.intervals_connections enable row level security;
create policy "own connection" on public.intervals_connections for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Buzón: lo que llega de Intervals.icu se procesa con los permisos del usuario (al abrir Forja o al sincronizar).
create table if not exists public.intervals_inbox (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('activity','wellness')),
  external_id text not null,
  payload jsonb not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  result jsonb,
  unique (user_id, kind, external_id)
);
create index if not exists intervals_inbox_pending on public.intervals_inbox (user_id, processed_at, received_at);
alter table public.intervals_inbox enable row level security;
create policy "own inbox" on public.intervals_inbox for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Detalle del Apple Watch por sesión.
alter table public.sessions
  add column if not exists moving_s integer,
  add column if not exists avg_speed_mps numeric(6,3),
  add column if not exists max_speed_mps numeric(6,3),
  add column if not exists avg_power numeric,
  add column if not exists device text;

create table if not exists public.session_laps (
  session_id uuid not null references public.sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  idx smallint not null,
  kind text,
  start_s integer, duration_s integer not null, moving_s integer,
  distance_m numeric, avg_hr smallint, max_hr smallint, avg_speed_mps numeric(6,3), avg_cadence numeric(5,1), avg_power numeric,
  elev_gain_m numeric, elev_loss_m numeric,
  primary key (session_id, idx)
);
alter table public.session_laps enable row level security;
create policy "own laps" on public.session_laps for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create table if not exists public.session_streams (
  session_id uuid primary key references public.sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  series jsonb,            -- {t, hr, pace, alt, cad, w, d} reducidas a ~600 puntos
  route jsonb,             -- [[lat, lon], …] reducida a ~500 puntos
  zones jsonb,             -- {method, bounds, seconds}
  updated_at timestamptz not null default now()
);
alter table public.session_streams enable row level security;
create policy "own streams" on public.session_streams for all using (user_id = auth.uid()) with check (user_id = auth.uid());

alter table public.daily_health add column if not exists avg_sleeping_hr smallint;

-- Cada 10 minutos: recoger entrenos nuevos de Intervals.icu y avisar al móvil.
select cron.schedule('forja-intervals', '*/10 * * * *', $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/intervals-sync',
    headers := jsonb_build_object('content-type', 'application/json', 'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')),
    body := '{"action":"pull"}'::jsonb)
$$);
