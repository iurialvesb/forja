# Forja · Fases 4-6: integraciones, pruebas y publicación

## Qué necesitas (cuentas, claves y costes)
| Servicio | Para qué | Coste |
|---|---|---|
| Mac con **Xcode 26+** | Compilar la app iOS (no se puede compilar fuera de macOS) | — |
| **Apple Developer Program** | Instalar con HealthKit y entrega en segundo plano, TestFlight, App Store | 99 USD/año |
| **Supabase** | Base de datos, Auth, Storage, Edge Functions | Plan gratuito suficiente para uso personal |
| **Anthropic API** | Coach y lectura de fotos | Pago por uso |
| **USDA FoodData Central** | Datos nutricionales de alimentos genéricos | Gratis (clave en fdc.nal.usda.gov/api-key-signup) |
| **Strava** (opcional) | Enlazar actividades y ver segmentos | Requiere suscripción de Strava para crear la app de API |

## 1. Backend (Supabase)
```bash
npm i -g supabase                    # o brew install supabase/tap/supabase
supabase login
supabase init                        # conserva supabase/config.toml de este repo (fusiona los bloques [functions.*])
supabase link --project-ref TU_REF
supabase db push                     # aplica 0001 a 0005 (esquema, ejercicios, nutrición/calendario, alimentos)
./scripts/sync-engine.sh             # copia el motor dentro de las funciones
supabase secrets set ANTHROPIC_API_KEY=sk-ant-... ANTHROPIC_MODEL=claude-sonnet-5-5 USDA_API_KEY=...
supabase functions deploy ingest-session replan parse-photo coach insights export-data \
  calendar-sync nutrition-day nutrition-log meal-update menu-plan pantry parse-workout-text shopping-list
supabase functions deploy strava-auth strava-webhook --no-verify-jwt
```
- Activa **pg_cron** (Database → Extensions) antes de `db push`, o elimina las 2 últimas líneas de la migración y programa la purga a mano.
- **Auth → Providers → Apple**: activa Sign in with Apple y pon el Bundle ID `com.forja.app` en *Client IDs*. En el portal de Apple, activa "Sign in with Apple" en el App ID.

## 2. Strava (opcional)
1. Crea la app en https://www.strava.com/settings/api. Dominio de callback: `TU_REF.supabase.co`.
2. `supabase secrets set STRAVA_CLIENT_ID=... STRAVA_CLIENT_SECRET=... STRAVA_STATE_SECRET=$(openssl rand -hex 32) STRAVA_WEBHOOK_VERIFY_TOKEN=$(openssl rand -hex 16)`
3. Crea la suscripción del webhook (una por app):
```bash
curl -X POST https://www.strava.com/api/v3/push_subscriptions \
  -F client_id=$STRAVA_CLIENT_ID -F client_secret=$STRAVA_CLIENT_SECRET \
  -F callback_url=https://TU_REF.supabase.co/functions/v1/strava-webhook -F verify_token=$STRAVA_WEBHOOK_VERIFY_TOKEN
```
4. En la app de Strava del iPhone: Ajustes → Aplicaciones → **Salud**, activa la escritura de actividades para que entren en tu historial.

## 3. Calendario y WodBuster
1. En la app de WodBuster: Perfil → **Calendarios**. Copia el enlace de sincronización.
2. En Forja: Perfil → Calendario y WodBuster. Pega el enlace y escribe el nombre de tu box como palabra clave. También puedes suscribirte a ese enlace desde el iPhone (Ajustes → Calendario → Cuentas → Añadir calendario suscrito) y activarlo en la lista.
3. Para Google Calendar, añade tu cuenta de Google en Ajustes → Calendario → Cuentas y actívala en Forja.

## 4. App iOS
```bash
brew install xcodegen
cd ios && cp Config/Secrets.xcconfig.example Config/Secrets.xcconfig   # pon SUPABASE_URL y SUPABASE_ANON_KEY
xcodegen                                                               # genera Forja.xcodeproj
open Forja.xcodeproj
```
- En *Signing & Capabilities*: elige tu equipo y comprueba **HealthKit** (+ Background Delivery), **Sign in with Apple** y **Background Modes** (Background fetch y processing).
- Conecta el iPhone, selecciónalo como destino y pulsa ▶︎. La primera vez: Ajustes → General → VPN y gestión de dispositivos → confiar en el desarrollador. Activa además el **Modo desarrollador**.
- La primera compilación puede pedir ajustes menores: el código no se ha podido compilar en el entorno donde se escribió (ver `04-ESTADO.md`).

## 5. Pruebas (Fase 5)
| Qué | Cómo |
|---|---|
| Cálculos del motor | `cd engine && npm test`: 30 tests (incluido tu WOD de ejemplo) (VDOT y ritmos contra las tablas de Daniels, e1RM con tu ejemplo de 100 kg / 80×6, fases media maratón → HYROX, semana coherente, test de 5 km sin datos, **WOD del lunes que adapta las series del martes**, recolocación de sesión perdida, recuperación, agujetas frente a lesión, deduplicación, CTL/ATL/ACWR, lectura de pizarra) |
| Nutrición y calendario | Objetivos por día, carga de hidratos antes de la media, reparto por comidas, ajuste de raciones, reequilibrio y avisos, despensa y lista de la compra, batch con congelación, suplementos y su límite, ICS de WodBuster, franjas bloqueadas, planificador con clases fijas |
| Tipos de las funciones | `tsc` con *shims* de Deno (ya verificado) o `deno check supabase/functions/*/index.ts` |
| Swift | `⌘U` en Xcode (zonas de FC, parciales por km, fechas en Madrid, decodificación de pasos) |
| No duplicar | Graba un rodaje con el Watch y con Strava a la vez, sincroniza y comprueba en Entrenos que sale **una** sesión con dos fuentes (`session_sources`) |
| Adaptación semanal | Registra un WOD de mucha pierna el día antes de unas series: el resultado debe mostrar el cambio y quedar en `plan_changes` |
| Persistencia | Cierra sesión, reinstala la app y vuelve a entrar: todo debe seguir ahí. Exporta el JSON |

## 6. TestFlight y App Store (Fase 6)
1. En App Store Connect crea la app con el Bundle ID `com.forja.app`.
2. En Xcode: *Product → Archive → Distribute App → App Store Connect → Upload*.
3. En TestFlight añádete como tester interno (sin revisión) e instala desde la app TestFlight.
4. Para publicar en la App Store: política de privacidad (URL), etiquetas de privacidad (Salud y forma física, Fotos, Identificadores; "datos vinculados al usuario", sin seguimiento), explicación del uso de HealthKit y del consentimiento de IA (guía 5.1.2(i)) y capturas.

## Variables y secretos
| Nombre | Dónde | Pública |
|---|---|---|
| `SUPABASE_URL`, `SUPABASE_ANON_KEY` | `ios/Config/Secrets.xcconfig` | Sí (RLS protege los datos) |
| `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` | Secretos de Edge Functions | No |
| `USDA_API_KEY` | Secretos de Edge Functions | No |
| `STRAVA_CLIENT_ID`, `STRAVA_CLIENT_SECRET`, `STRAVA_STATE_SECRET`, `STRAVA_WEBHOOK_VERIFY_TOKEN`, `STRAVA_API_BASE` (opcional) | Secretos de Edge Functions | No |
| `SUPABASE_SERVICE_ROLE_KEY` | La inyecta Supabase en las funciones | No: nunca en la app |
