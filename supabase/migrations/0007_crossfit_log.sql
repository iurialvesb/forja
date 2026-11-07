-- Fase 1 CrossFit: estructura desglosada (rondas, series, minutos), objetivo frente a realizado,
-- borradores con autoguardado e historial de modificaciones. Solo añade columnas: nada existente cambia.

-- Bloques: apartado, escalado, plantilla prescrita y resultado.
alter table public.session_blocks
  add column if not exists part text check (part in ('strength','wod','endurance','other')),
  add column if not exists scaling text check (scaling in ('rx','scaled')),
  add column if not exists duration_min numeric,
  add column if not exists interval_s integer,
  add column if not exists capped boolean not null default false,
  add column if not exists prescribed jsonb;            -- estructura completa tal como se registró (para reabrir y editar)

-- Series: ronda/minuto, objetivo frente a realizado, estado y origen.
alter table public.session_sets
  add column if not exists round_no smallint,
  add column if not exists set_label text,              -- "Serie 2", "Ronda 3", "Min 5"
  add column if not exists unit text check (unit in ('reps','cal','m','s')),
  add column if not exists target_reps numeric,         -- en la unidad de la fila (reps, cal, m o s)
  add column if not exists target_load_kg numeric(6,2),
  add column if not exists target_pct numeric(5,1),
  add column if not exists target_text text,            -- "43/29", "RX", etc.
  add column if not exists status text not null default 'done' check (status in ('done','partial','skipped')),
  add column if not exists split_s integer,
  add column if not exists origin text not null default 'manual' check (origin in ('manual','ai','text','healthkit'));
create index if not exists session_sets_exercise_hist on public.session_sets (user_id, exercise_id, performed_on desc);

-- Borradores: el registro en curso se guarda solo y se recupera al volver.
create table if not exists public.workout_drafts (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);
create index if not exists workout_drafts_user on public.workout_drafts (user_id, updated_at desc);
alter table public.workout_drafts enable row level security;
create policy "own drafts" on public.workout_drafts for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Historial de modificaciones de cada entreno: valor anterior, nuevo, quién y cuándo.
create table if not exists public.session_edits (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid not null references public.sessions(id) on delete cascade,
  edited_at timestamptz not null default now(),
  actor text not null default 'usuario',
  field text not null,
  old_value jsonb,
  new_value jsonb
);
create index if not exists session_edits_session on public.session_edits (session_id, edited_at desc);
alter table public.session_edits enable row level security;
create policy "own edits read" on public.session_edits for select using (user_id = auth.uid());
create policy "own edits insert" on public.session_edits for insert with check (user_id = auth.uid());

-- Cambios en los datos generales de la sesión: se registran solos.
create or replace function public.log_session_edit() returns trigger language plpgsql security definer set search_path = public as $$
declare f text;
begin
  foreach f in array array['title','rpe','duration_s','started_at','discipline','notes','distance_m','deleted_at'] loop
    if (to_jsonb(old) -> f) is distinct from (to_jsonb(new) -> f) then
      insert into public.session_edits (user_id, session_id, actor, field, old_value, new_value)
      values (new.user_id, new.id, case when auth.uid() is null then 'sistema' else 'usuario' end, f, to_jsonb(old) -> f, to_jsonb(new) -> f);
    end if;
  end loop;
  return new;
end $$;
drop trigger if exists sessions_edit_log on public.sessions;
create trigger sessions_edit_log after update on public.sessions for each row execute function public.log_session_edit();
