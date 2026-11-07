-- Sesiones del plan marcadas como hechas a mano (sin entreno registrado detrás).
alter table public.planned_sessions add column if not exists done_manually boolean not null default false;
