-- Forja · esquema inicial (Supabase / PostgreSQL 15+)
-- Todas las tablas de usuario tienen RLS: cada usuario solo ve y modifica sus filas.

create extension if not exists "pgcrypto";

-- ============ Perfil ============
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  birth_date date,
  sex text check (sex in ('male','female')),
  height_cm numeric(5,1),
  experience text,                                  -- texto libre: años y disciplinas
  sports_preferences text[] default '{running,crossfit,hybrid}',
  hyrox_division text check (hyrox_division in ('open_men','open_women','pro_men','pro_women')),
  allow_doubles boolean not null default true,
  crossfit_per_week smallint not null default 3 check (crossfit_per_week between 0 and 7),
  sleep_need_h numeric(3,1) not null default 7.5,
  locale text not null default 'es',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.body_metrics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  weight_kg numeric(5,2),
  body_fat_pct numeric(4,1),
  lean_mass_kg numeric(5,2),
  source text not null default 'manual',            -- manual | healthkit
  unique (user_id, date, source)
);

-- Fisiología con historial (las recomendaciones usan el valor vigente y su evolución).
create table public.physiology (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  effective_from date not null,
  hr_rest smallint, hr_max smallint, lthr smallint,
  vo2max numeric(4,1),
  method text,                                      -- 'medida', 'test de campo', 'healthkit'
  unique (user_id, effective_from)
);

create table public.availability (
  user_id uuid not null references auth.users(id) on delete cascade,
  weekday smallint not null check (weekday between 1 and 7),
  am boolean not null default false,
  pm boolean not null default false,
  max_minutes smallint not null default 60,
  box_class boolean not null default false,
  preferred_time time,
  primary key (user_id, weekday)
);

create table public.injuries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  area text not null,
  description text,
  started_on date,
  resolved_on date,
  avoid_regions text[] default '{}',
  notes text,
  created_at timestamptz not null default now()
);

-- ============ Objetivos y planificación ============
create table public.goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  type text not null check (type in ('half_marathon','marathon','10k','5k','hyrox','crossfit_comp','strength','general')),
  date date not null,
  priority text not null default 'A' check (priority in ('A','B','C')),
  distance_m numeric,
  target_time_s integer,
  notes text,
  status text not null default 'active' check (status in ('active','completed','cancelled')),
  result_time_s integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.goals (user_id, date);

create table public.phases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  goal_id uuid references public.goals(id) on delete set null,
  kind text not null,
  start_date date not null,
  end_date date not null,
  focus text not null,
  secondary text,
  generated_at timestamptz not null default now()
);
create index on public.phases (user_id, start_date);

create table public.planned_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  engine_key text not null,                         -- id determinista del motor
  week_start date not null,
  date date not null,
  slot text not null check (slot in ('am','pm')),
  type text not null,
  discipline text not null,
  title text not null,
  objective text,
  intensity text,
  est_minutes smallint,
  leg_stress smallint,
  key boolean not null default false,
  planned_km numeric(5,1),
  steps jsonb not null default '[]',
  rationale text,
  status text not null default 'planned' check (status in ('planned','done','skipped','modified')),
  completed_session_id uuid,
  locked boolean not null default false,            -- el usuario la fijó: el motor no la mueve
  updated_at timestamptz not null default now(),
  unique (user_id, engine_key)
);
create index on public.planned_sessions (user_id, date);

create table public.plan_changes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  planned_session_id uuid references public.planned_sessions(id) on delete set null,
  date date,
  trigger text not null check (trigger in ('session','checkin','goal_change','missed','manual','weekly')),
  action text not null,
  reason text not null,
  data jsonb default '{}',
  before jsonb, after jsonb,
  created_at timestamptz not null default now()
);
create index on public.plan_changes (user_id, created_at desc);

-- ============ Entrenamientos realizados ============
create table public.exercises (
  id text primary key,
  name text not null,
  category text not null,
  unit text not null,
  aliases text[] not null default '{}',
  pr_tracked text
);

create table public.user_exercises (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  maps_to text references public.exercises(id),     -- si equivale a uno del catálogo
  category text,
  unique (user_id, name)
);

create table public.sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  started_at timestamptz not null,
  duration_s integer not null check (duration_s > 0),
  discipline text not null,
  title text,
  rpe numeric(3,1) check (rpe between 1 and 10),
  avg_hr smallint, max_hr smallint,
  hr_zone_s integer[],
  distance_m numeric,
  elevation_gain_m numeric, elevation_loss_m numeric,
  cadence_spm numeric(5,1),
  avg_stride_m numeric(4,2),
  active_kcal numeric,
  is_race boolean not null default false,
  is_time_trial boolean not null default false,
  notes text,
  primary_source text not null default 'manual' check (primary_source in ('manual','healthkit','strava','photo')),
  -- valores derivados por el motor (recalculables)
  internal_load numeric, load_source text,
  leg_index numeric, region_load jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index on public.sessions (user_id, started_at desc) where deleted_at is null;

-- Cada fuente que aportó datos a una sesión (clave para no duplicar).
create table public.session_sources (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid not null references public.sessions(id) on delete cascade,
  source text not null check (source in ('healthkit','strava','photo','manual')),
  external_id text not null,                        -- HKWorkout UUID, id de actividad Strava, id de import
  imported_at timestamptz not null default now(),
  unique (user_id, source, external_id)
);

create table public.session_blocks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid not null references public.sessions(id) on delete cascade,
  position smallint not null,
  kind text not null,
  format text,
  title text,
  time_cap_s integer, rounds numeric,
  result_text text, result_time_s integer, result_rounds integer, result_reps integer,
  notes text
);
create index on public.session_blocks (session_id);

create table public.session_sets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid not null references public.sessions(id) on delete cascade,
  block_id uuid not null references public.session_blocks(id) on delete cascade,
  position smallint not null,
  exercise_id text references public.exercises(id),
  custom_exercise_id uuid references public.user_exercises(id),
  reps integer, load_kg numeric(6,2), distance_m numeric, duration_s integer, calories numeric,
  rpe numeric(3,1), rir smallint,
  is_warmup boolean not null default false,
  performed_on date not null                        -- desnormalizado para consultas de progresión
);
create index on public.session_sets (user_id, exercise_id, performed_on);

create table public.run_splits (
  session_id uuid not null references public.sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  km_index smallint not null,
  duration_s numeric not null,
  avg_hr smallint, cadence_spm numeric(5,1), elevation_delta_m numeric,
  primary key (session_id, km_index)
);

-- Récords (reales y estimados), con historial: cada mejora es una fila.
create table public.personal_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  metric text not null,                             -- 'back_squat:1rm', 'back_squat:5rm', 'pull_up:max_reps', 'run:5k', 'run:half'
  value numeric not null,
  unit text not null,                               -- kg | reps | s | m
  kind text not null check (kind in ('actual','estimated')),
  achieved_on date not null,
  session_id uuid references public.sessions(id) on delete set null,
  detail text
);
create index on public.personal_records (user_id, metric, achieved_on);

-- ============ Salud y recuperación ============
create table public.daily_health (
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  hrv_ms numeric(5,1), hrv_method text check (hrv_method in ('sdnn','rmssd')),
  rhr smallint,
  sleep_h numeric(4,2), sleep_efficiency numeric(3,2), sleep_stages jsonb,
  steps integer, active_kcal numeric, exercise_min integer,
  vo2max numeric(4,1),
  source text not null default 'healthkit',
  updated_at timestamptz not null default now(),
  primary key (user_id, date)
);

create table public.checkins (
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  fatigue smallint not null check (fatigue between 1 and 5),
  soreness smallint not null check (soreness between 1 and 5),
  stress smallint not null check (stress between 1 and 5),
  motivation smallint not null check (motivation between 1 and 5),
  sleep_quality smallint not null check (sleep_quality between 1 and 5),
  pains jsonb not null default '[]',
  note text,
  created_at timestamptz not null default now(),
  primary key (user_id, date)
);

create table public.readiness_daily (
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  score smallint not null, level text not null,
  reasons jsonb not null, pains jsonb, data_quality text,
  acwr numeric(4,2), ctl numeric, atl numeric, tsb numeric, leg_fatigue numeric,
  computed_at timestamptz not null default now(),
  primary key (user_id, date)
);

-- ============ Fotos (pizarra / capturas) ============
create table public.photo_imports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  storage_path text not null,
  status text not null default 'uploaded' check (status in ('uploaded','parsing','needs_answers','confirmed','failed','discarded')),
  parsed jsonb, questions jsonb, answers jsonb,
  session_id uuid references public.sessions(id) on delete set null,
  model text, error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============ Coach IA ============
create table public.coach_threads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text,
  created_at timestamptz not null default now()
);
create table public.coach_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  thread_id uuid not null references public.coach_threads(id) on delete cascade,
  role text not null check (role in ('user','assistant')),
  content jsonb not null,                           -- bloques de texto/herramientas
  created_at timestamptz not null default now()
);
create index on public.coach_messages (thread_id, created_at);

-- Memoria deportiva explícita: hechos que el coach aprende de ti (editable y borrable).
create table public.coach_memory (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  fact text not null,
  category text not null default 'general',         -- preferencia, molestia, contexto, objetivo
  source_message_id uuid references public.coach_messages(id) on delete set null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.consents (
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('ai_processing','health_sync','strava')),
  version text not null,
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  primary key (user_id, kind, version)
);

-- ============ Strava (restringido por su API Policy) ============
create table public.strava_connections (
  user_id uuid primary key references auth.users(id) on delete cascade,
  athlete_id bigint not null unique,
  scopes text not null,
  connected_at timestamptz not null default now()
);
-- Tokens: RLS activado SIN políticas → invisibles para la app; solo el service role (Edge Functions) los lee.
create table public.strava_tokens (
  user_id uuid primary key references auth.users(id) on delete cascade,
  access_token text not null,
  refresh_token text not null,
  expires_at timestamptz not null
);
-- Caché de actividades de Strava: máx. 7 días (API Policy) y NUNCA se envía al coach IA.
create table public.strava_cache (
  user_id uuid not null references auth.users(id) on delete cascade,
  activity_id bigint not null,
  payload jsonb not null,
  fetched_at timestamptz not null default now(),
  primary key (user_id, activity_id)
);

-- ============ RLS ============
do $$
declare t text;
begin
  foreach t in array array['body_metrics','physiology','availability','injuries','goals','phases','planned_sessions',
    'plan_changes','user_exercises','sessions','session_sources','session_blocks','session_sets','run_splits',
    'personal_records','daily_health','checkins','readiness_daily','photo_imports','coach_threads','coach_messages',
    'coach_memory','consents','strava_connections','strava_cache']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "own rows" on public.%I for all using (user_id = auth.uid()) with check (user_id = auth.uid())', t);
  end loop;
end $$;

alter table public.profiles enable row level security;
create policy "own profile" on public.profiles for all using (id = auth.uid()) with check (id = auth.uid());

alter table public.exercises enable row level security;
create policy "catalog readable" on public.exercises for select using (auth.role() = 'authenticated');

alter table public.strava_tokens enable row level security;
revoke all on public.strava_tokens from anon, authenticated;

-- strava_cache: el cliente solo lee; escribe la Edge Function con service role.
drop policy "own rows" on public.strava_cache;
create policy "read own cache" on public.strava_cache for select using (user_id = auth.uid());

-- ============ Utilidades ============
create or replace function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
create trigger t_profiles before update on public.profiles for each row execute function public.touch_updated_at();
create trigger t_goals before update on public.goals for each row execute function public.touch_updated_at();
create trigger t_sessions before update on public.sessions for each row execute function public.touch_updated_at();
create trigger t_planned before update on public.planned_sessions for each row execute function public.touch_updated_at();
create trigger t_photos before update on public.photo_imports for each row execute function public.touch_updated_at();

-- Crear perfil al registrarse.
create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
begin insert into public.profiles (id) values (new.id) on conflict do nothing; return new; end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- Bucket privado para fotos de entrenamientos.
insert into storage.buckets (id, name, public) values ('workout-photos', 'workout-photos', false) on conflict do nothing;
create policy "own photos read" on storage.objects for select using (bucket_id = 'workout-photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "own photos write" on storage.objects for insert with check (bucket_id = 'workout-photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "own photos delete" on storage.objects for delete using (bucket_id = 'workout-photos' and (storage.foldername(name))[1] = auth.uid()::text);

-- Purga diaria de la caché de Strava (> 7 días). Requiere la extensión pg_cron (Dashboard → Database → Extensions).
create extension if not exists pg_cron;
select cron.schedule('purge-strava-cache', '15 3 * * *', $$delete from public.strava_cache where fetched_at < now() - interval '7 days'$$);
