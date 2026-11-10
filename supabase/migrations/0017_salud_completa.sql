-- Todo lo que HealthFit sube a Intervals.icu desde el Apple Watch: sueño (puntuación, calidad), SpO2, respiración,
-- grasa corporal, VO2max, kcal y cualquier otro dato (extras, tal cual llega).
alter table public.daily_health add column if not exists sleep_score smallint;
alter table public.daily_health add column if not exists sleep_quality smallint;
alter table public.daily_health add column if not exists avg_sleeping_hr smallint;
alter table public.daily_health add column if not exists spo2 numeric(4,1);
alter table public.daily_health add column if not exists respiration numeric(4,1);
alter table public.daily_health add column if not exists body_fat numeric(4,1);
alter table public.daily_health add column if not exists kcal_consumed numeric;
alter table public.daily_health add column if not exists extras jsonb;
alter table public.intervals_connections add column if not exists wellness_backfill_at timestamptz;
