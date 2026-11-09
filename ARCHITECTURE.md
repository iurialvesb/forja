# Arquitectura de Forja

Plataforma personal de entrenamiento (running, CrossFit, HYROX), nutrición, recuperación y cocina. **Monolito modular**: una base de datos, un motor de cálculo y varios módulos que comparten información. Sin microservicios.

## Capas

| Capa | Qué es | Dónde |
|---|---|---|
| Interfaz | PWA en vanilla JS (sin framework ni build), móvil primero. Instalada en el iPhone desde Safari | `web/` (GitHub Pages) |
| Lógica de negocio | **Motor determinista en TypeScript**: carga, fatiga, readiness, 1RM, VDOT y ritmos, periodización, planificador y adaptación, nutrición por día de carga, despensa, compra, suplementos, intérprete de pizarras, HYROX, paneles de objetivo, resumen semanal | `engine/src` (tests en `engine/test`) |
| Backend | Supabase Edge Functions (Deno). Aplican reglas, escriben en la base de datos y llaman a la IA. Las claves viven aquí, nunca en el navegador | `supabase/functions` |
| Datos | Postgres con RLS en todas las tablas | `supabase/migrations`, ver `DATABASE_SCHEMA.md` |
| IA | Gemini (cuenta de pago). **Interpreta y redacta; no calcula**: macros, cargas, ritmos y cambios del plan salen del motor | `supabase/functions/_shared/ai.ts` |
| Integraciones | Apple Watch → HealthFit → Intervals.icu → Forja (cron cada 10 min). Calendario ICS (WodBuster, Google). Open Food Facts y USDA para alimentos. Web Push | `_shared/intervals.ts`, `calendar-sync`, `_shared/off.ts`, `push-send` |

El mismo motor se usa en tres sitios: tests (Node), backend (`scripts/sync-engine.sh` lo copia a `_shared/engine`) y navegador (`scripts/build-web-engine.mjs` lo convierte a JS en `web/js/engine`, para interpretar pizarras al instante y sin conexión). **No se duplican cálculos**: si algo se calcula, vive en el motor.

## Módulos

| Módulo | Motor | Funciones | Pantallas |
|---|---|---|---|
| Entrenamiento | planner, adapt, periodization, prescriptions, strength, running, logbook, workoutText, hyrox, dedupe | `replan`, `ingest-session`, `parse-workout-text`, `parse-photo`, `insights`, `goal` | Inicio, Plan, Entrenos, Objetivo (`web/js/screens.js`, `logbook.js`, `timer.js`, `goals.js`) |
| Recuperación | readiness, load, fitness | `process-inbox`, `intervals-sync` | Inicio (anillo), check-in |
| Nutrición | nutrition, meals, foods, supplements | `nutrition-day`, `nutrition-log`, `meal-update`, `menu-plan` | Nutrición → Hoy, Menú, Suplementos |
| Cocina | pantry, shopping | `pantry`, `shopping-list`, `menu-plan` (batch) | Nutrición → Compra, Batch, Despensa |
| Planificación de vida | calendar | `calendar-sync` | Plan, Perfil → Calendario |
| Coach e informes | weekly (+ todo lo anterior como herramientas) | `coach`, `weekly`, `push-send` | Coach, Inicio |

## Niveles de decisión

| Nivel | Qué hace el sistema solo | Ejemplos |
|---|---|---|
| Automático | Importar, calcular, descontar | Entrenos del Watch, readiness, marcar hecha la sesión del plan, descontar la despensa al comer o cocinar |
| Recomendación (explicada) | Ajustar y avisar con el motivo | Cambiar unas series por un rodaje suave por fatiga de piernas, reajustar raciones del resto del día. Queda en `plan_changes` / avisos |
| Autorización | Solo si tú lo pides o confirmas | Cambiar objetivos o tiempo objetivo, mover sesiones a petición en el coach, borrar datos |

La IA nunca modifica datos históricos ni objetivos por su cuenta. Cada cambio del plan registra el motivo, el antes y el después.

## Flujo diario

1. Cada 10 min: Intervals.icu → `intervals_inbox` → sesiones y salud (HRV, sueño, FC reposo) → readiness → reconciliación del plan.
2. 8:00: notificación con el plan del día. 9:00: lo que caduca y suplementos que se acaban.
3. Al abrir la app: sincroniza, envía la cola sin conexión, recalcula y reajusta.
4. Domingo 20:00: resumen semanal (motor + redacción de la IA) en Coach e Inicio.

## Sin conexión

- La interfaz se sirve desde el service worker (`web/sw.js`).
- Las lecturas se guardan en la Cache API (`forja-data`): sin red se muestra lo último leído.
- Guardar un entreno y marcar comidas va a una cola (`localStorage forja:outbox`) que se envía al volver la cobertura.
- Los borradores de registro se autoguardan en el móvil y en `workout_drafts`.

## Seguridad y datos

- RLS en todas las tablas; las funciones validan al usuario con su JWT (`requireUser`). El cron usa `x-cron-secret`.
- Claves (Gemini, USDA, VAPID, Intervals) solo como secretos de Supabase o en la tabla del usuario con RLS.
- Consentimiento explícito antes de enviar datos a la IA (`consents`).
- Exportación completa (JSON) y de entrenos (CSV) desde Perfil. El plan gratuito de Supabase no hace copias: exporta de vez en cuando.

## Despliegue y pruebas

- Push a `main` → GitHub Actions: migraciones, secretos, funciones y web (`.github/workflows/deploy.yml`).
- `cd engine && npm test`: tests del motor.
- `node web-test/run.mjs`: la web en Chrome con tamaño de iPhone y un backend simulado alimentado por el motor real (capturas en `web-test/shots`). `MONKEY=1` pulsa todos los botones de todas las pantallas.
