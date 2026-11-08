-- Descuento automático de la despensa: lo que se gastó en cada comida y en el batch, para poder deshacerlo.
alter table public.planned_meals add column if not exists pantry_deduction jsonb;
alter table public.batch_plans
  add column if not exists cooked_at timestamptz,
  add column if not exists pantry_deduction jsonb;
