// GET /push-config → clave pública VAPID para suscribirse a notificaciones.
import { handler, json } from '../_shared/supabase.ts';
Deno.serve(handler(async () => json({ publicKey: Deno.env.get('VAPID_PUBLIC_KEY') ?? null })));
