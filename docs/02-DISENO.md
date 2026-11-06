# Forja · Fase 2: diseño

## Sistema visual (`ios/Forja/Design/Theme.swift`)
- **Modo oscuro**, fondo casi negro (#0A0A0D) y tarjetas #1A1A1F con borde de 8 % de blanco y radio de 20 pt.
- **Acento** naranja Forja (#FF6B3D). **Semánticos**: verde/ámbar/rojo para recuperación e intensidad, azul para running, naranja para CrossFit, morado para HYROX/híbrido y ámbar para fuerza.
- Tipografía del sistema (SF), cifras `monospacedDigit` y jerarquía `title2 bold` para métricas y `caption` en gris al 62 % para etiquetas.
- Componentes: `Card`, `StatTile`, `RingGauge`, `Tag`, `SectionTitle`, `EmptyState`, `PlannedRow`, `SessionRowView` y `StepView` (con pasos anidados).

## Navegación (5 pestañas: el iPhone no muestra más sin pasar a "Más")
1. **Inicio**: anillo de recuperación, nutrición de hoy (kcal, proteína, hidratos, siguiente comida, suplementos) (puntuación, nivel y motivo principal), sesiones de hoy, carga semanal (km reales y planificados, carga en UA, ACWR, barra de fatiga de piernas), progreso hacia cada objetivo (días restantes, fase actual, barra), último ajuste del entrenador y últimas actividades. Botón + para check-in o foto.
2. **Calendario**: tira de fases, selector de semana, días con puntos por disciplina, detalle del día (planificado y realizado). Detalle de la sesión: objetivo, duración, km, estrés de piernas, **"Por qué esta sesión"**, pasos con ritmos, zonas, series, pesos y descansos, y el botón **"No puedo hacerla"** (recoloca el plan).
3. **Entrenos** (con selector Historial | Progreso): historial agrupado por semana con filtro por disciplina. Detalle con métricas, bloques y series. Alta **pegando texto** (descripción de Strava → interpretación → vínculo con la sesión del Watch), **desde foto** (cámara o fototeca → lectura → preguntas → registro) o **manual** (18 disciplinas, bloques con ejercicios del catálogo y búsqueda por alias). Al guardar se muestran los récords nuevos y los cambios del plan con su motivo.
   - **Progreso**: Running (VDOT y sus fuentes, ritmos, predicciones, km semanales, evolución del ritmo, distribución de intensidad), Fuerza (1RM real, estimado y de trabajo, gráfico de e1RM, % de evolución y carga sugerida), Carga (CTL/ATL y ACWR con franja segura) y Récords (reales y estimados).
4. **Nutrición** (Hoy | Menú | Compra | Batch | Despensa | Suplementos, con el objetivo en el icono de diana):
   - **Hoy**: kcal y macros frente al objetivo, avisos, **reajustes de lo que queda**, comidas con Cumplido / A medias / No / Editar, "He comido algo extra", cumplimiento del día, registrar por texto, foto o código de barras, y por qué esos objetivos.
   - **Menú**: semana completa con totales por día. Al tocar una comida puedes cambiar gramos, cambiarla por otra receta, fijarla o saltarla, y el resto se reajusta.
   - **Compra**: por secciones del súper, con lo que necesitas, lo que tienes y lo que compras; marcar, pasar a la despensa y compartir.
   - **Batch**: genera el menú y el batch del domingo. Muestra el plan de cocina minuto a minuto, cantidades totales, táperes (nevera o congelador) y la lista de la compra para compartir.
   - **Despensa**: congelador, nevera y despensa con caducidades. Añadir por dictado o texto ("tengo…"), foto o a mano.
   - **Suplementos**: qué tomar hoy, cuándo y por qué; marcar como tomado (descuenta stock) y gestionar los que tienes.
5. **Coach**: chat con preguntas sugeridas. Si no hay consentimiento, pantalla que explica qué se envía y a quién.

**Perfil** (icono de persona en Inicio): datos personales y físicos, fisiología con historial, disponibilidad semanal (franjas, minutos, días de box), preferencias (dobles, CrossFit por semana, categoría HYROX, sueño), lesiones, objetivos (crear, editar, eliminar, con replanificación automática), Apple Health, Calendario y WodBuster, Strava, privacidad e IA (consentimiento y memoria del coach) y exportación.

Además: **Recuperación** (desde el anillo): motivos, check-in con molestias detalladas y gráficos de 60 días de HRV, FC en reposo y sueño. **Onboarding** en 5 pasos: Health, IA, FC, disponibilidad y objetivos, con tus dos objetivos ya precargados.
