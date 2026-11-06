-- Versión web gratuita: buzón de Apple Salud vía Atajos (iOS Shortcuts), notificaciones Web Push y cron.

-- Token personal para el Atajo (se guarda solo el hash).
create table public.ingest_tokens (
  user_id uuid primary key references auth.users(id) on delete cascade,
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);
alter table public.ingest_tokens enable row level security;
create policy "own token" on public.ingest_tokens for select using (user_id = auth.uid());

-- Datos que envía el Atajo; se procesan al abrir la app (con tus permisos, no con los del servidor).
create table public.health_inbox (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  payload jsonb not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  result jsonb
);
alter table public.health_inbox enable row level security;
create policy "own inbox" on public.health_inbox for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);
alter table public.push_subscriptions enable row level security;
create policy "own subs" on public.push_subscriptions for all using (user_id = auth.uid()) with check (user_id = auth.uid());

alter table public.nutrition_alerts add column if not exists pushed_at timestamptz;

-- La versión web usa Gemini por defecto: los consentimientos antiguos de otro proveedor no valen.
alter table public.consents add column if not exists provider text;

-- Recordatorios: cada hora (minuto 5) se llama a push-send. Requiere las extensiones pg_cron y pg_net
-- y los secretos del vault "project_url" y "cron_secret" (ver docs/05-WEB-GRATIS.md).
create extension if not exists pg_net;
select cron.schedule('forja-push', '5 * * * *', $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/push-send',
    headers := jsonb_build_object('content-type', 'application/json', 'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')),
    body := '{}'::jsonb)
$$);
