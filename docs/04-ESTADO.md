# Estado real del proyecto

**Versión web gratuita (recomendada):** la web app (`web/`) está probada en Chrome con tamaño de iPhone, datos generados por el motor real y 17 pantallas o flujos sin errores de JavaScript. El backend (Gemini, Atajo de Salud, push) compila pero falta probarlo contra tu Supabase. Guía en `05-WEB-GRATIS.md`.

Leyenda: ✅ implementado y **verificado** aquí · 🟡 implementado pero **sin ejecutar** (requiere Mac/Xcode o un proyecto de Supabase) · ⏳ pendiente

| Área | Estado | Detalle |
|---|---|---|
| Motor: carga, fatiga, recuperación, 1RM, VDOT/ritmos, zonas, periodización, planificador, adaptación, deduplicación, lectura de fotos | ✅ | `engine/`: TypeScript estricto sin errores y 30 tests que pasan |
| Motor de nutrición (objetivos según el entreno, reparto, raciones, reequilibrio, despensa, batch, suplementos) y calendario (ICS, clases fijas, franjas) | ✅ | Incluido en esos 30 tests |
| Funciones de nutrición y calendario (nutrition-day, nutrition-log, meal-update, menu-plan, pantry, calendar-sync) + migraciones 0003/0004 | 🟡 | Compilan con `tsc`. Falta desplegar y probar con USDA, Open Food Facts y Claude reales |
| App iOS: pestaña Nutrición completa, escáner de código de barras, avisos locales, EventKit (leer agenda y exportar plan), ajustes de WodBuster | 🟡 | Escrita, sin compilar |
| Intérprete de textos de CrossFit, lista de la compra proyectada, chequeo diario y compensación | ✅ | Tests con tu WOD de ejemplo (EMOM 10' de fuerza y EMOM 24' de 4 rondas) |
| Pegar entreno + vincular con el Watch + escribir en Strava; pantalla Compra; acciones Cumplido / A medias / No | 🟡 | Escrito; falta compilar y desplegar |
| Extensión "Compartir con Forja" desde otras apps | ⏳ | Hoy se usa copiar → pegar (Forja lo detecta) |
| Lectura del contenido del WOD desde WodBuster | ⏳ | No hay API de atleta; el WOD se registra con foto |
| Esquema de base de datos con RLS + catálogo de ejercicios | 🟡 | `supabase/migrations/`: revisado, no aplicado a una base real |
| Edge Functions (ingest-session, replan, parse-photo, coach, insights, export-data, strava-auth, strava-webhook) | 🟡 | Compilan con `tsc` (tipos de Supabase simulados). Falta desplegarlas y probarlas contra Supabase y la API de Claude |
| App iOS SwiftUI: navegación, onboarding, Sign in with Apple, check-in, registro manual, foto → preguntas → registro, coach, progreso con gráficos, perfil completo, exportación | 🟡 | ~3.600 líneas de Swift **escritas pero no compiladas** (aquí no hay Xcode). La primera compilación puede pedir ajustes menores de la API de supabase-swift |
| HealthKit: permisos, importación incremental, FC/zonas, parciales por km, cadencia, desnivel, esfuerzo del Watch, HRV, FC en reposo, sueño, pasos, kcal, VO2max, peso, entrega en segundo plano | 🟡 | Solo se puede probar en un iPhone real |
| Strava: OAuth, webhook, caché de 7 días, enlace antiduplicados, desautorización | 🟡 | Requiere tu app de Strava y suscripción |
| App de watchOS (ver el entreno del día y grabarlo desde el reloj) | ⏳ | Los datos del Watch ya llegan por HealthKit. Una app propia para el reloj es el siguiente paso (`HKWorkoutSession` + WatchConnectivity) |
| Notificaciones push ("tu plan ha cambiado") | ⏳ | Hoy los cambios se ven en la app (aviso y tarjeta del coach) |
| Modo sin conexión | ⏳ | Necesita conexión para leer y escribir. Falta una caché local (SwiftData) con cola de escritura |
| Inglés | ⏳ | Textos en español; `CFBundleLocalizations` ya declara `en` |
| Android | ⏳ | El backend y el motor sirven tal cual. Falta el cliente (Kotlin + Health Connect) |

En la versión no hay datos ficticios. Lo único precargado son tus dos objetivos en el onboarding, que puedes desmarcar. Sin datos, la app lo dice ("sin datos", "haz un test de 5 km") en lugar de inventar.
