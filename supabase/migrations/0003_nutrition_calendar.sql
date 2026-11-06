-- Forja · nutrición (objetivos, registro, menú semanal, despensa, batch cooking, suplementos) y calendario.

-- ============ Calendario ============
create table public.calendar_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  ics_urls text[] not null default '{}',                 -- p. ej. la suscripción de WodBuster (Perfil → Calendarios)
  device_calendars text[] not null default '{}',         -- calendarios del iPhone que se leen (EventKit)
  crossfit_keywords text[] not null default '{crossfit,wod,"cross training"}',
  crossfit_calendars text[] not null default '{wodbuster}',
  export_plan boolean not null default false,            -- escribir el plan de Forja en un calendario "Forja"
  last_hash text,
  updated_at timestamptz not null default now()
);

create table public.calendar_events (
  user_id uuid not null references auth.users(id) on delete cascade,
  uid text not null,
  title text not null,
  start_at timestamptz not null,
  end_at timestamptz not null,
  all_day boolean not null default false,
  calendar text,
  kind text not null check (kind in ('crossfit_class','other_training','busy','ignore')),
  source text not null check (source in ('device','ics')),
  synced_at timestamptz not null default now(),
  primary key (user_id, uid)
);
create index on public.calendar_events (user_id, start_at);

-- ============ Nutrición ============
create table public.nutrition_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  mode text not null default 'mantenimiento' check (mode in ('definicion','mantenimiento','volumen','recomposicion','rendimiento')),
  rate_kg_per_week numeric(3,2),
  protein_g_per_kg numeric(3,1),
  fat_g_per_kg numeric(3,1),
  activity_factor numeric(3,2) not null default 1.40,
  meal_slots text[] not null default '{desayuno,comida,merienda,cena}',
  batch_day smallint not null default 7 check (batch_day between 1 and 7),   -- domingo
  dislikes text[] not null default '{}',
  intolerances text[] not null default '{}',
  max_supplements_per_day smallint,
  notify boolean not null default true,
  updated_at timestamptz not null default now()
);

-- Historial de objetivos (definir → volumen → …) para ver la evolución.
create table public.nutrition_goal_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  mode text not null,
  from_date date not null,
  note text
);

-- Alimentos: globales (owner null, resueltos de USDA/Open Food Facts o de referencia) o propios del usuario.
create table public.foods (
  id text primary key,
  owner uuid references auth.users(id) on delete cascade,
  name text not null,
  kcal numeric not null, protein numeric not null, carbs numeric not null, fat numeric not null,
  fiber numeric, vit_c_mg numeric, magnesium_mg numeric,
  unit_grams numeric,
  source text not null check (source in ('usda','off','custom','reference','estimate')),
  source_ref text,
  search_terms text[] not null default '{}',
  created_at timestamptz not null default now()
);
create index on public.foods using gin (search_terms);

create table public.recipes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  ingredients jsonb not null,           -- [{foodId,name,grams,role}] por ración base
  steps jsonb not null default '[]',    -- [{text,minutes,hands,equipment}]
  fridge_days smallint not null default 3,
  freezable boolean not null default true,
  tags text[] not null default '{}',
  favorite boolean not null default false,
  source text not null default 'ia' check (source in ('ia','usuario')),
  created_at timestamptz not null default now()
);

create table public.planned_meals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  slot text not null,
  recipe_id uuid references public.recipes(id) on delete set null,
  title text not null,
  ingredients jsonb not null,           -- gramos ya ajustados a tus macros
  status text not null default 'planned' check (status in ('planned','eaten','edited','skipped')),
  locked boolean not null default false,
  from_batch boolean not null default false,
  updated_at timestamptz not null default now(),
  unique (user_id, date, slot)
);

create table public.food_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  slot text,
  eaten_at timestamptz not null default now(),
  items jsonb not null,                 -- [{foodId,name,grams,macros,confidence}]
  kcal numeric not null, protein numeric not null, carbs numeric not null, fat numeric not null,
  fiber numeric, vit_c_mg numeric, magnesium_mg numeric,
  source text not null check (source in ('texto','foto','codigo','menu','manual')),
  photo_path text,
  planned_meal_id uuid references public.planned_meals(id) on delete set null,
  created_at timestamptz not null default now()
);
create index on public.food_logs (user_id, date);

create table public.day_targets (
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  kcal numeric not null, protein numeric not null, carbs numeric not null, fat numeric not null, fiber numeric,
  load text not null,
  explanation jsonb not null default '[]',
  computed_at timestamptz not null default now(),
  primary key (user_id, date)
);

create table public.pantry_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  food_id text references public.foods(id),
  location text not null check (location in ('congelador','nevera','despensa')),
  quantity_g numeric, units numeric, unit_grams numeric,
  expires_on date, opened_on date,
  updated_at timestamptz not null default now()
);
create index on public.pantry_items (user_id, location);

create table public.batch_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  week_start date not null,
  cook_date date not null,
  plan jsonb not null,                  -- tareas, táperes, totales, avisos
  shopping jsonb not null default '[]',
  created_at timestamptz not null default now(),
  unique (user_id, week_start)
);

create table public.supplements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null,                   -- vitamina_c | magnesio | colageno | creatina | omega3 | vitamina_d | otro
  name text not null,
  dose_text text not null,
  stock integer,
  active boolean not null default true
);

create table public.supplement_logs (
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  supplement_id uuid not null references public.supplements(id) on delete cascade,
  taken boolean not null default true,
  primary key (user_id, date, supplement_id)
);

create table public.nutrition_alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  slot text,
  level text not null,
  message text not null,
  read boolean not null default false,
  created_at timestamptz not null default now()
);

-- ============ RLS ============
do $$
declare t text;
begin
  foreach t in array array['calendar_settings','calendar_events','nutrition_settings','nutrition_goal_history','recipes','planned_meals',
    'food_logs','day_targets','pantry_items','batch_plans','supplements','supplement_logs','nutrition_alerts']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "own rows" on public.%I for all using (user_id = auth.uid()) with check (user_id = auth.uid())', t);
  end loop;
end $$;

alter table public.foods enable row level security;
create policy "read shared or own foods" on public.foods for select using (owner is null or owner = auth.uid());
create policy "write own foods" on public.foods for insert with check (owner = auth.uid());
create policy "update own foods" on public.foods for update using (owner = auth.uid());
-- Los alimentos globales (owner null) solo los inserta el servicio (Edge Functions) al resolverlos en USDA / Open Food Facts.

create trigger t_planned_meals before update on public.planned_meals for each row execute function public.touch_updated_at();
create trigger t_pantry before update on public.pantry_items for each row execute function public.touch_updated_at();
create trigger t_nut_settings before update on public.nutrition_settings for each row execute function public.touch_updated_at();

-- Hora fija en sesiones planificadas (clases reservadas).
alter table public.planned_sessions add column if not exists start_local text;
alter table public.planned_sessions add column if not exists from_calendar boolean not null default false;
