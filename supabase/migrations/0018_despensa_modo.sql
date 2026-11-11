-- Despensa: cada producto se lleva por unidades (huevos, latas, sobres…) o por peso (pasta, arroz, leche…).
alter table public.pantry_items add column if not exists mode text check (mode is null or mode in ('units','weight'));
alter table public.pantry_items add column if not exists package_g numeric;
alter table public.pantry_items add column if not exists unit_label text;
