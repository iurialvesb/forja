# Forja · Fase 1: arquitectura

## 1. Decisión tecnológica

| Capa | Elección | Por qué |
|---|---|---|
| App iOS | **SwiftUI nativo** (iOS 18+), Swift Charts | HealthKit, entrega en segundo plano (`HKObserverQuery` + `enableBackgroundDelivery`), `HKAnchoredObjectQuery`, el esfuerzo del Watch (`workoutEffortScore`) y una futura app de watchOS (`HKWorkoutSession`) son APIs nativas. En React Native/Expo dependeríamos de librerías de terceros (`react-native-health`) que van por detrás del SDK, y la app del Watch habría que escribirla en Swift de todos modos. |
| Backend | **Supabase** (Postgres + Auth + Storage + Edge Functions en Deno), región UE | Base de datos relacional con RLS por usuario, Sign in with Apple, almacenamiento privado de fotos y funciones donde viven los secretos (clave de Claude, secreto de Strava). Sirve igual para Android. |
| Motor de entrenamiento | **TypeScript puro y determinista** (`engine/`) | Una sola implementación para iOS, Android y el coach IA. Tiene tests (`npm test`) y se ejecuta en las Edge Functions. La IA **no** calcula cargas ni ritmos: los pide al motor. |
| IA | **Claude (Anthropic)** vía Messages API desde las Edge Functions | Visión para leer pizarras y capturas con salida estructurada (herramienta con JSON Schema) y uso de herramientas para que el coach consulte tus datos reales. |
| Android (futuro) | Kotlin + Compose + Health Connect | Reutiliza backend, base de datos y motor sin cambios: solo hay que escribir la app cliente. |

## 2. Limitaciones reales de las integraciones (investigadas en noviembre de 2026)

### Apple HealthKit / Apple Watch
- **No existe una API web**: los datos viven en el iPhone. Solo una app nativa con el permiso de HealthKit puede leerlos, y luego los sube a tu backend. La app incluye esa sincronización (`SyncService`).
- **Necesitas el Apple Developer Program (99 USD/año)**: lo exige TestFlight y la firma de capacidades como HealthKit con entrega en segundo plano. Con una cuenta gratuita el perfil de instalación caduca a los 7 días y la capacidad de HealthKit puede no estar disponible.
- HealthKit **no funciona con datos reales en el simulador**: las pruebas reales se hacen en el iPhone.
- **Permisos de lectura opacos**: iOS no le dice a la app si denegaste un tipo de dato. Si falta HRV o sueño, la app muestra "calidad de datos parcial" en lugar de inventarlos.
- **Apple no expone su puntuación de "recuperación"**. Se lee HRV (SDNN; iOS 27 añade un identificador RMSSD), FC en reposo y fases de sueño, y la recuperación la calcula el motor. El sueño por fases requiere llevar el Watch puesto al dormir.
- **El esfuerzo del entrenamiento** (`workoutEffortScore`, iOS 18) se lee si lo registraste en el Watch y se usa como RPE.
- La entrega en segundo plano es "lo antes posible" según iOS, no instantánea. Al abrir la app también se sincroniza.

### Strava
- **Prohíbe usar sus datos en IA.** La API Policy vigente desde el 1 de junio de 2026 prohíbe usar los datos de su API en cualquier aplicación de IA, incluidos los prompts, la recuperación de contexto (RAG) y la ventana de contexto. Lo mismo vale para datos derivados o anonimizados.
- **Caché máxima de 7 días**, con restricciones para guardarlos más tiempo. Por eso **no sirve para construir el historial centralizado**.
- Desde el 1 de junio de 2026, crear una app de API exige una **suscripción de Strava** (nivel Standard). Las apps nuevas empiezan en "Single Player Mode" (1 atleta), que basta para uso personal. Para más de 10 atletas hace falta revisión de Strava.
- Desde el 1 de septiembre de 2026, **Explore Segments** solo está disponible con Extended Access. Los esfuerzos en segmentos y los *best efforts* de tus propias actividades sí vienen en el detalle de cada actividad.
- Es obligatorio implementar el **webhook de desautorización**. La nueva URL base `https://api-v3.strava.com` estará disponible el 4 de enero de 2027, y los tokens irán solo en cabecera a partir del 1 de junio de 2027. El código ya los envía en cabecera y la URL base es configurable (`STRAVA_API_BASE`).
- La solución que he implementado es esta:
  1. **Apple Health es la fuente de verdad del historial.** Si grabas con el Watch, la actividad llega a HealthKit. Si grabas con la app de Strava, activa en Strava la escritura en Salud para que también llegue.
  2. Strava se conecta de forma opcional por OAuth y webhook para **enlazar** cada actividad con la sesión de Apple Health equivalente (deduplicación) y para **mostrarte a ti** tus segmentos y logros recientes desde una caché que se purga a los 7 días. Esos datos **nunca** llegan al motor ni al coach.
  3. Una captura de pantalla de Strava que subas tú no procede de la API. Es contenido que aportas y se trata como una foto más.

### Entrenos de CrossFit escritos en Strava
- La descripción que escribes en Strava **no se puede leer por la API para interpretarla**: la política de Strava prohíbe usar sus datos en IA y guardarlos más de 7 días.
- Solución: **copias la descripción y la pegas en Forja**, que la ofrece sola al detectar texto nuevo en el portapapeles. A partir de ahí es contenido tuyo, no de la API.
- La interpreta un **motor determinista de CrossFit** (`workoutText.ts`), sin IA:
  - Bloques, incluidas erratas como "FERZA".
  - EMOM/E2MOM con rondas y descansos, AMRAP, For Time con cap, rondas y Tabata.
  - Series como "5x5" y esquemas como "21-15-9".
  - Cargas en cualquier posición ("@ 50 kg", "16KG", "43/29", "%", lb → kg), calorías, metros y variantes (talones elevados, estricto, DB/KB).
- Solo si queda algo dudoso, y con tu permiso, lo revisa Claude. Lo que no se entiende se pregunta.
- La sesión **se une a la del Apple Watch** de ese día: FC y calorías del reloj, más ejercicios, pesos y repeticiones del texto, sin duplicar.
- Opcional: Forja **escribe** la descripción en tu actividad de Strava (permiso `activity:write`). Enviar tu contenido a Strava no está restringido.

### Calendario y WodBuster
- **WodBuster no tiene API para atletas.** Sus APIs (reservas, usuarios, tornos) son para los centros. Lo que sí ofrece al atleta es la **sincronización de sus reservas con el calendario personal** (Perfil → Calendarios). Forja la aprovecha de dos maneras:
  1. **Enlace de suscripción** (si WodBuster lo da como `webcal://` o `https://…ics`): se pega en Forja y `/calendar-sync` lo descarga y lo interpreta.
  2. **Calendario del iPhone** (EventKit): si añades la suscripción, o tu Google Calendar, a la app Calendario del iPhone, Forja lo lee directamente. Así cubrimos también Google sin conectar su API.
- Las clases reservadas pasan a ser **sesiones fijas** del plan, con su hora. Si no hay reservas para una semana, el CrossFit se coloca en los días habituales como "pendiente de reserva" y se reorganiza cuando reservas.
- Los eventos ocupados bloquean una franja cuando no queda un hueco seguido de ≥ 75 min. Un evento de día completo (viaje, feria) bloquea el día entero.
- **No se lee el contenido del WOD** de WodBuster: no hay API y extraerlo de su web iría contra sus condiciones. El WOD entra con una foto (pizarra o captura de la app de WodBuster).

### Bases de datos de alimentos
- **USDA FoodData Central** para alimentos genéricos: clave gratuita, 1.000 peticiones/hora, datos de dominio público, con macros, fibra, vitamina C y magnesio.
- **Open Food Facts** para productos envasados por código de barras: sin clave, 15 lecturas/min, licencia ODbL (hay que citarlo), datos colaborativos e incompletos en algunos productos.
- **La IA no calcula macros.** Solo convierte lo que dices o fotografías en alimentos y gramos. Los macros salen siempre de estas bases y se guardan en caché en la tabla `foods`. Si un alimento no aparece, se pregunta.

### App Store e IA
- La guía 5.1.2(i), revisada en noviembre de 2025, exige **informar y pedir permiso explícito** antes de enviar datos personales a una IA de terceros. La app incluye una pantalla de consentimiento específica, una tabla `consents` y la opción de revocarlo. Sin ese permiso funcionan igual el plan, los cálculos y el registro de entrenamientos.

## 3. Módulos

```
iOS (SwiftUI) ──HealthKit──► SyncService ──► /ingest-session ─┐
     │  foto ─► Storage ─► /parse-photo (Claude visión) ──────┤
     │  check-in ─► checkins ─► /replan                       ├─► Motor (TS) ─► Postgres (RLS)
     │  chat ─► /coach (Claude + herramientas del motor) ─────┤
     │  Progreso ─► /insights                                 │
Strava ─webhook─► /strava-webhook (caché 7 d, solo enlaza) ───┘
```

| Módulo | Dónde | Qué hace |
|---|---|---|
| Carga | `engine/src/load.ts` | Carga interna sRPE (RPE × min). Sin RPE, se estima por % de FC de reserva y se indica la fuente. Carga muscular por regiones (cuádriceps, cadena posterior, gemelos, empuje, tracción, core, agarre e impacto) según ejercicios, repeticiones, pesos y distancias. Fatiga residual de piernas con semivida de 36 h. |
| Forma/fatiga | `fitness.ts` | CTL/ATL/TSB (42/7 días), ACWR con EWMA (7/28), monotonía y *strain* de Foster, km semanales. |
| Recuperación | `readiness.ts` | ln(HRV) de 7 días frente a la línea base de 60 días, FC en reposo frente a la media de 30 días, sueño frente a tu necesidad, check-in, ACWR y fatiga de piernas, con puntuación de 0 a 100 y motivos. Clasifica cada molestia como fatiga normal, agujetas o posible lesión (en este caso recomienda valoración profesional). No diagnostica. |
| Fuerza | `strength.ts` | e1RM (media de Epley y Brzycki, con RIR o RPE) que distingue marca real y estimación. 1RM de trabajo: el mejor de las últimas 6 semanas o el histórico ajustado por desentrenamiento. Carga recomendada según series, repeticiones, RIR y recuperación, con progresión de +2,5 kg. |
| Running | `running.ts` | VDOT (Daniels-Gilbert) calculado con **tus** competiciones, tests o rodajes exigentes, y sus ritmos E/M/T/I/R. Zonas de FC por umbral medido o por Karvonen con tus FC reales. Predicciones (VDOT y Riegel) y distribución de intensidad. Sin datos, programa un test de 5 km en lugar de usar valores genéricos. |
| Periodización | `periodization.ts` | Fases hacia atrás desde cada competición (general, desarrollo, específica, puesta a punto, competición y recuperación). Encadena la media maratón (31/01/2027) y HYROX (16/04/2027), comprime fases si falta tiempo y aplica ciclos 3:1 con semanas de descarga. |
| Planificador | `planner.ts` + `prescriptions.ts` | Monta la semana según fase, objetivos, disponibilidad, días de box y preferencias, y prescribe cada sesión: pasos, ritmos, zonas, series, cargas, descansos, técnica, calentamiento y vuelta a la calma, con su motivo. Respeta estas reglas: como mucho una sesión clave al día, nunca dos sesiones duras de pierna el mismo día, dobles solo con una sesión suave, ≥1 día sin carga y progresión de km ≤ 10 %. |
| Adaptación | `adapt.ts` | **Regla fundamental.** Tras cada sesión o check-in recalcula la fatiga proyectada sobre los próximos 4 días y, si hace falta, intercambia la sesión con un rodaje suave o la degrada, reduce volumen, la sustituye por movilidad o recorta por ACWR. Recoloca las sesiones clave que no hiciste. Cada cambio queda guardado con su motivo y sus datos. |
| Deduplicación | `dedupe.ts` | Busca coincidencias por identificador externo y, si no hay, por solapamiento temporal, duración y distancia. Fusiona las sesiones: HealthKit aporta la fisiología y la foto o el registro manual aportan la estructura. |
| Fotos | `photo.ts` + `/parse-photo` | Claude Vision devuelve un JSON con esquema fijo. El motor normaliza los ejercicios (alias como T2B, C2B, HSPU…) y genera **preguntas** para todo lo ambiguo (pesos "43/29", porcentajes, ejercicios no reconocidos, resultado del WOD, RPE). Solo después crea la sesión. |
| Calendario | `calendar.ts` + `/calendar-sync` + `CalendarService` (iOS) | Interpreta ICS (líneas plegadas, TZID, día completo), clasifica cada evento (clase de CrossFit, otro entreno, ocupado), extrae las clases fijas con su hora, bloquea franjas y reorganiza la semana solo si algo cambia. Opcionalmente exporta el plan a un calendario "Forja". |
| Nutrición: objetivos | `nutrition.ts` | Gasto = basal (Mifflin-St Jeor) + actividad diaria + **entrenamiento planificado** (MET) o medido por el Watch. Modos: definir, mantener, volumen, recomposición, rendimiento. Proteína de 1,8 a 2,2 g/kg y grasa ≥ 20 % de las kcal. **Los hidratos siguen la carga del día**: más en series, tiradas largas y sesiones dobles, y carga previa a la media o a HYROX aunque estés definiendo. Suelo de seguridad en 1,1 × basal. Reparto por comidas con los hidratos cerca del entreno. |
| Nutrición: menú | `meals.ts` + `/menu-plan` + `/meal-update` | La IA propone recetas y las asigna a cada comida usando tu despensa. El motor **ajusta los gramos** de cada ración a los macros de esa franja ese día. Si editas, saltas o comes otra cosa, **reequilibra** el resto del día y da avisos concretos ("te faltan 30 g de proteína: añade 150 g de yogur griego en la merienda"), además del balance semanal. |
| Lista de la compra | `shopping.ts` + `/shopping-list` | Lo que comerás esa semana menos el stock que te quedará **después de lo que aún comes esta semana**. Lo que caduca antes de usarse no cuenta. Incluye un 5 % de margen, agrupa por secciones del súper y propone unidades. Avisa de comprar a mitad de semana o congelar el pescado o la carne de los últimos días. Al marcar como comprado, pasa a la despensa: nevera lo de los 2 próximos días y congelador el resto. |
| Chequeo diario de la dieta | `meals.ts` + `/meal-update` | Por comida: cumplido, a medias (¼, ½, ¾, +25 %), no comido o cambiado, más lo extra que hayas comido. Reajusta las comidas que quedan y te dice qué subir o bajar ("cena: baja patata de 300 a 210 g"). Calcula el cumplimiento del día y, si lo activas, compensa a lo largo de la semana (máx. ±250 kcal/día, nunca en días duros). |
| Despensa y batch cooking | `pantry.ts` + `/pantry` | Inventario por congelador, nevera y despensa, alimentado por dictado, texto, foto o código de barras. Descuenta lo comido y prioriza lo que caduca. Genera la lista de la compra y el **plan del batch**: cantidades totales, orden de tareas aprovechando horno y fuegos en paralelo, y táperes por día (nevera ≤ 3-4 días; los posteriores al congelador, con aviso para descongelar). |
| Suplementos | `supplements.ts` | Según tus últimos 7 días y el entreno de hoy: **colágeno + vitamina C** 30-60 min antes de sesiones con carga en tendones, **vitamina C** si tu ingesta está por debajo de la referencia de la EFSA, **magnesio** por la noche si la dieta no llega a 350 mg, si hay mucha intensidad o si duermes poco. Respeta un máximo diario, avisa del stock y es orientativo. |
| Coach IA | `/coach` | Claude con 12 herramientas (entreno, nutrición, despensa, suplementos y calendario) que leen tu estado, plan, historial, ejercicios, running y objetivos, ajustan el plan **pasando por las reglas del motor** y guardan memoria. El prompt le obliga a no inventar cifras y a justificar con tus datos. Memoria permanente en `coach_memory`, editable y borrable. |

## 4. Base de datos

Migraciones en `supabase/migrations/`. Todas las tablas tienen RLS (`user_id = auth.uid()`). Grupos:

- **Perfil**: `profiles`, `body_metrics`, `physiology` (con historial), `availability`, `injuries`.
- **Planificación**: `goals`, `phases`, `planned_sessions` (pasos en JSON, motivo, estado, `locked`), `plan_changes` (auditoría de cada adaptación con motivo).
- **Entrenamientos**: `sessions`, `session_sources` (unicidad por fuente e id externo, lo que impide duplicados), `session_blocks`, `session_sets` (todas tus series con fecha, para gráficos de progresión), `run_splits`, `personal_records` (reales y estimados, cada mejora en una fila), `exercises` (catálogo de 56 ejercicios generado desde el motor) y `user_exercises`.
- **Salud**: `daily_health`, `checkins`, `readiness_daily`.
- **IA**: `photo_imports`, `coach_threads`, `coach_messages`, `coach_memory`, `consents`.
- **Strava**: `strava_connections`, `strava_tokens` (RLS sin políticas, solo accesible para el servicio), `strava_cache` (con purga diaria de lo que supere 7 días mediante pg_cron).

Copia de seguridad: los datos viven en Postgres (no se pierden al cambiar de iPhone), Supabase hace backups diarios y `/export-data` genera un JSON con todo.

## 5. Cómo funciona el entrenador IA

1. El motor determinista decide el plan y las adaptaciones. Es reproducible, se puede testear y explica sus cambios con números.
2. El LLM conversa: responde preguntas, explica el porqué y puede pedir ajustes, pero siempre a través de herramientas que ejecutan el motor y validan las reglas. Si pides mover una sesión y eso junta dos sesiones duras, la herramienta lo rechaza y el coach te explica el motivo.
3. Cada entrenamiento registrado enriquece el contexto (historial, récords, e1RM, VDOT, fatiga). Además, la memoria explícita guarda preferencias y contexto que le cuentes.

## 6. Heurísticas que conviene calibrar con el uso

1. **Coeficientes de carga muscular por ejercicio** (`exercises.ts`) y **umbrales de fatiga de piernas** (moderada ≥ 140, alta ≥ 250, semivida de 36 h). Son estimaciones razonadas, no valores validados científicamente. Con 4-6 semanas de check-ins de dolor muscular se pueden ajustar.
2. **Pesos de HYROX** por categoría (`prescriptions.ts`): verifícalos con el reglamento de tu temporada.
3. **VDOT con rodajes exigentes**: se aplica un 3 % de descuento y se marca con confianza baja. Lo ideal es una competición o un test.
