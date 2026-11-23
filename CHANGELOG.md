# Changelog

## Más ejercicios de CrossFit y rondas escritas una a una
- Catálogo de 62 a 159 ejercicios: Push/Split/Power/Squat Jerk por separado, S2OH, G2OH, Cluster, Hang Power/Squat Clean y Snatch, pulls, Snatch Balance, Knees to Chest («rodillas al pecho»), K2E, V-ups, Burpees Over Bar, BFB, BBJO, Burpee Pull-ups, Strict/Deficit/Wall-facing HSPU, Chin-ups, Ring Rows, Pegboard, mancuerna y kettlebell (DB Thrusters, DHCJ, Box Step Overs, KB Clean, TGU), sacos, D-ball, cargas, accesorios y más.
- «RONDA 1:», «RONDA 2:»… se entienden: si son iguales se registra una ronda tipo × N con el peso de cada ronda (40-40-40-44 kg); si son distintas, cada ronda va en su grupo.
- Intervalos «4 INTERVALOS (12 MIN)» y «2 minutos ON / 1 minuto OFF»; las listas numeradas («1. 200 m Run») ya no se leen como repeticiones y las frases explicativas pasan a notas.
- «Peso corporal» se anota, no se confunde con el nombre del ejercicio.

## Gráficos legibles (skill dataviz)
- Paleta de gráficos propia y validada para daltonismo y contraste: azul, naranja y verde en orden fijo; rampa de un solo azul para magnitudes.
- Zonas de FC en rampa secuencial (Z1 claro → Z5 oscuro) con barra segmentada.
- Toca o pasa el dedo por cualquier gráfico: línea guía y valor exacto; también con teclado (flechas).
- «Ver datos» bajo cada gráfico abre la tabla con los valores.
- Forma/Fatiga con leyenda; sueño con leyenda (noches cortas en azul claro, ya no en color de alerta) y etiqueta del último valor sin pisar el objetivo.
- Barras finas con extremo redondeado, rejilla discreta, sin degradados; la VFC ya no mezcla área y franja.

## 2026-11-23 · «Fragua tranquila» (frontend-design)
- Fuera el verde lima: la paleta sale del logo. Papel salvia, tinta pizarra, botones y selección en pizarra con texto claro; latón suave solo sobre la banda oscura (anillos, barras, temporizador). Hecho, en verde musgo; avisos en ocre; errores en ladrillo.
- Títulos en minúscula (sin mayúsculas gritonas) y esquinas más suaves (10 px; hojas de 20 px).
- Pestaña actual con fondo salvia en lugar de bloque de color.

## 2026-11-23 · Logo nuevo
- Icono más tranquilo: rayo azul pizarra sobre gris verdoso claro (opción B), también en la pantalla de entrada.

## 2026-11-23 · Pesado en crudo
- Arroz, pasta o legumbre pesados en crudo: el nombre es el alimento («Arroz») y la cantidad dice «80 g en crudo» (Diario, menú, batch, recetas). Las calorías ya eran las del crudo (80 g ≈ 287 kcal). El batch guarda la marca «en crudo» en vez de meterla en el nombre.

## 2026-11-23 · Líquidos en ml
- Leche, bebidas vegetales, zumos, aceite, vinagre, caldo, nata, kéfir…: en toda Nutrición se ven en ml/l en vez de g (Diario, añadir y editar alimento con atajos de 100–500 ml, texto libre, menú, sugerencias, reajustes, compra, lista para compartir, batch, recetas y despensa). Internamente se guardan igual (1 ml ≈ 1 g), así que los macros no cambian.

## 2026-11-23 · «Ya he cocinado» entiende batch reales
- La IA usa el modelo que razona (antes el rápido sin razonamiento) y sabe de rendimientos: pesos en crudo o con hueso → carne cocinada (cuarto trasero ≈ 42 %), piezas ya comidas, caldo triturado con sus verduras repartido en raciones, arroz/pasta en crudo por ración, pescado del día, «al menos N días», verduras al horno repartidas entre cenas.
- El resultado se enseña en una hoja: los cálculos que ha hecho, las comidas por día con sus gramos, lo que necesita aclarar (con botón para responder) y lo que no tiene datos nutricionales. Antes era un aviso que se cortaba a dos líneas y no se veían las preguntas.

## 2026-11-21 · Rediseño completo con Hallmark (tema Sport)
- Nuevo sistema visual «hoja de resultados»: papel gris hormigón frío, tinta azul-negra, un único acento volt siempre como relleno (botón principal, pestaña actual, selección). Títulos en Saira Condensed en mayúsculas, texto en Albert Sans, tiempos y cifras de datos en JetBrains Mono. Fuentes propias (sin Barlow).
- Todo color y tipo pasa por tokens (`web/css/tokens.css`, `base.css`); `app.css` reescrito desde cero (antes 114 fallos del mínimo de Hallmark, ahora 0).
- Composición: la recuperación de Inicio y el resumen del Diario son una banda de tinta a todo el ancho (la firma de la app); el resto, secciones separadas por reglas finas y una regla gruesa por sección, sin tarjetas con sombra. Pestañas como tira con regla y bloque volt en la actual; hojas, avisos y temporizador en el mismo sistema.
- Gráficos de un solo tono (tinta), sin degradados ni brillos; anillo plano. Zonas de pulso en escala de tinta con la Z5 en rojo.
- Icono de la app nuevo: rayo volt sobre tinta. Meta descripción y colores de la PWA en claro.
- El resumen PNG para compartir usa las fuentes nuevas, sin cursiva.

## 2026-11-17 · Nutrición instantánea
- Diagnóstico con los registros reales: cada función del servidor arranca en frío (~2 s; nutrition-day 2,0–2,2 s) y cada acción del Diario esperaba a dos llamadas seguidas (guardar + recalcular la semana) con la pantalla bloqueada.
- Acciones optimistas: «Me lo he comido», «No», «Deshacer», añadir, cambiar, mover, quitar y copiar de ayer se ven al instante (8–17 ms medidos con red simulada de 2 s); el servidor confirma por detrás y, si falla, se avisa y se vuelve a lo guardado. Lo pendiente se ve atenuado y no se puede editar hasta confirmarse.
- La caché ya no se borra tras cada cambio: se marca caducada, se pinta lo que había y se refresca sola (antes, pantalla de carga de 2–4 s tras cada acción).
- Nutrición se precarga al abrir la app (semana, diario de hoy, recientes y alimentos) y el día anterior/siguiente se deja listo para las flechas.
- Servidor: lecturas en paralelo en nutrition-day y en el contexto; las escrituras del reequilibrio (objetivos, menú, avisos) en paralelo y sin hacer esperar a la respuesta.
- Sugerencias del menú más limpias: título, kcal e ingredientes en una línea y un único botón ✓; el resto de opciones (a medias, cambiar, hoy no) al tocar la sugerencia.
- Prueba de velocidad percibida: `SPEED=1 node web-test/run.mjs`.

## 2026-11-17 · Movimiento y sensación nativa (Emil Kowalski)
- Cambio de pantalla más rápido (120/200 ms, 8–12 px) y sin desenfoque de pantalla completa: es lo que más se repite al día.
- Píldora de pestañas 260 ms con curva de movimiento en pantalla; icono de pestaña con la curva propia.
- Fuera la transición de anchura de las barras (animaba layout y nunca llegaba a verse). Anillo sincronizado con la cuenta de cifras (700 ms).
- «Reducir movimiento» completo: avisos y pulsaciones con opacidad en vez de desplazamiento/escala; sin brillo animado en los esqueletos.
- Sensación de app instalada: ya se puede hacer zoom con dos dedos (quitado maximum-scale=1); sin rebote ni «tirar para recargar» de la página, las hojas y carruseles no arrastran la página; sin retardo de toque, sin seleccionar texto ni menú de copiar al mantener pulsado un botón; el teclado de Android redimensiona la vista; sin inflado de letra en horizontal.

## 2026-11-17 · Accesibilidad y uso con una mano (ui-ux-pro-max)
- Nueva auditoría automática (`AUDIT=1 node web-test/run.mjs`): contraste AA, objetivos de toque, nombres accesibles, iconos decorativos y desbordes, en 390 px, 375 px, horizontal y texto grande. Resultado: 0 fallos (antes 246 de contraste y 261 de toque).
- Contraste AA: azul de botones y pestañas activas más profundo (texto blanco ≥ 4,5:1), etiquetas de la barra inferior más claras y a 11,5 px, fechas y textos de los objetivos legibles.
- Todo lo pulsable mide ≥ 40–44 px: botones pequeños, chips, segmentos, desplegables, filas de «Hoy», flechas de día, «Todo/Salud», pasos de la despensa.
- Gráficos con descripción para VoiceOver (anillo, barras, evolución, recorrido); minigráficos ocultos al lector.
- Horizontal y pantallas anchas: columna centrada de 600 px y barra inferior compacta con icono y texto en línea. Con texto grande el aviso del Watch pasa el botón abajo.

## 2026-11-17 · Pulido de interfaz (crítica impeccable 26/40)
- Inicio más limpio: recuperación → aviso del Watch → Hoy → objetivos. «Tu semana» y el último ajuste en una línea plegable; sueño, pasos, actividad, peso y carga en una sola tarjeta «Esta semana» (antes 5); el sueño ya no sale repetido.
- Lenguaje llano y formato español: coma decimal en km, kg y nivel; «1 sesión»; «CrossFit de tarde» en vez de «Afternoon Workout»; ACWR → «Carga esta semana frente a tu media» (en Progreso, con rango sano); VDOT → «Nivel»; UA fuera; «Marcar como leído».
- Entrenos: un único «+» que abre las 4 formas de registrar, con qué hace cada una; el historial queda arriba. Estado vacío que invita a registrar.
- Intensidad como etiqueta neutra con nivel en barras (el rojo queda para problemas). «Recomendada» solo donde aporta (CrossFit sin reservar).
- Reajustes de comidas: lista «antes → después» plegable en lugar de un párrafo.
- Cabecera opaca al hacer scroll; avisos de máximo dos líneas y 3 s.
- Sin vicios genéricos: fuera los brillos de color en botones, el halo azul de fondo, la barra lateral de color y las etiquetas en mayúsculas sobre títulos. Solo el bloque de recuperación lleva color; el resto, superficies planas.
- Flechas y «+» como iconos SVG.

## 2026-11-17 · Resumen de CrossFit con ejercicios
- El PNG de compartir de CrossFit, fuerza o HYROX incluye un resumen de lo que hiciste: por bloque, formato y resultado (AMRAP 12' · 7+13 rondas) y hasta 4 ejercicios con series×reps y kilos (Back Squat 5×5 · 80 kg) o reps totales en el WOD (Thruster 63 reps · 43 kg). Sin calentamiento. Se puede quitar con «Ejercicios».

## 2026-11-16 · Interfaz más viva y resumen para Instagram
- **Compartir resumen** (en el detalle de cada entreno): PNG sin fondo de 1080 px para poner encima de tus fotos. Letras blancas o negras, diseño vertical o en línea, recorrido opcional (carreras), título y fecha opcionales. Vista previa sobre transparente, foto oscura y foto clara. Compartir (Instagram, Fotos…), copiar o descargar.
- Cifras por disciplina: carrera (distancia, ritmo, tiempo), bici (velocidad), natación (ritmo /100 m), CrossFit/HYROX (resultado del WOD, tiempo, FC media o kcal).
- Hojas tipo iOS: entran con la curva del cajón y se cierran arrastrando hacia abajo (por distancia o velocidad), siguiendo el dedo 1:1.
- Avisos que suben desde abajo y se descartan deslizando.
- Barra de pestañas con píldora que se desliza; transiciones entre pantallas hacia el lado de la pestaña; botones que responden al tocar; cifras de Inicio que cuentan al entrar (una vez).
- Tipografía propia (Barlow / Barlow Condensed), números tabulares, iconos SVG en lugar de emojis, etiquetas sin mayúsculas forzadas. Respeta «Reducir movimiento».

## 2026-11-11 (noche) · Sincronización del Watch más rápida
- Intervals.icu se comprueba cada 2 minutos (antes 10) y lo nuevo se procesa en el servidor: al abrir Forja ya está todo. Migración `0019_sync_rapida`.
- Con la app abierta, se vuelve a mirar cada 2 minutos; al volver a la app, como mucho cada 45 s.
- Consultas del contexto e importación filtradas siempre por usuario (necesario para procesar desde el servidor).

## 2026-11-11 · Diario de comidas tipo MyFitnessPal y despensa por unidades o peso
- Nutrición → **Diario**: navegación por días, Objetivo − Comido = Restante, macros, y cada comida con sus alimentos. Cada alimento se cambia (gramos o unidades), se mueve de comida o se quita por separado.
- «＋ Añadir alimento» en cada comida: buscador instantáneo (tus alimentos y recientes primero), cantidad con − / +, unidades o gramos, «Como ayer», escribir/dictar, código de barras y búsqueda en Open Food Facts/USDA.
- El menú aparece como sugerencia en cada comida: «Me lo he comido» lo pasa al diario (y descuenta de casa), «Cambiar» o «No».
- Despensa: cada producto se lleva **de una en una** (huevos, latas, sobres, yogures: − / +) o **por gramos/ml** (pasta, arroz, leche: «Usar» con cantidades rápidas, barra de lo que queda, «He comprado otro paquete»). Lo antiguo se convierte solo.
- Buscador y filtro por lugar en la despensa; la IA y el escáner cuentan lo de dentro del envase (caja de 3 latas = 3 latas).
- Arreglado: deshacer o volver a marcar una comida del menú podía duplicarla en el registro.
- Migración `0018_despensa_modo`.

## 2026-11-10 · Rediseño azul noche, rapidez y salud completa del Watch
- Nuevo diseño: azul oscuro, tarjeta principal con anillo de recuperación, tarjetas con minigráficos, barra de pestañas flotante con iconos, animaciones suaves, icono nuevo.
- Pantalla **Salud** (`#/salud`): sueño (duración, nota, pulso dormido), VFC con tu rango normal, pulso en reposo, pasos, VO₂máx, SpO₂, respiración, grasa corporal y todas las actividades.
- Todo lo que HealthFit sube a Intervals.icu se guarda (columnas nuevas + `extras`); la primera vez se traen 120 días. Migración `0017_salud_completa`.
- Rapidez: las pantallas se pintan al instante con lo último guardado en el móvil y se actualizan solas por detrás; sincronización en paralelo.
- Nutrición → Hoy con anillo de calorías y barras de macros por color.

## 2026-11-09 (tarde) · Registrar comida al instante
- Intérprete de comidas en el móvil (`engine/src/foodText.ts`): cantidades («un», «medio», «200 g», «dos tostadas», «una cucharada»), marcas, cocinado/crudo y la comida («como almuerzo»). Sin esperar al servidor.
- Solo lo que no reconoce va al servidor, y en segundo plano. El teclado no se cierra mientras escribes.
- Servidor: Flash-Lite primero para textos sencillos, límites de tiempo en Gemini (20 s), USDA (5 s) y Open Food Facts (3,5 s); guardar ya no recalcula la semana entera.
- 20 alimentos de diario nuevos (canónigos, wrap de avena Hacendado, pan, arroz cocido, jamón, café…): migración `0016_foods_diario`.

## 2026-11-09 · Revisión completa y mejoras
- Tarjeta «Hoy» en Inicio con checks de entreno, comidas y suplementos; aviso «Añadir WOD» para entrenos del Watch sin pizarra.
- «🎟 Reservé»: marca la clase de CrossFit como reservada y el plan ya no la mueve (`planned_sessions.reserved` + `locked`).
- Pantalla de objetivo (`#/objetivo/<id>`): Media Maratón y HYROX.
- HYROX: estaciones oficiales por categoría, hoja de simulación con parciales, reparto del tiempo objetivo, comparativa por estación.
- Temporizador del box (EMOM, AMRAP, Tabata, For Time) con pitidos, vibración, pantalla encendida y cronómetro por tramos.
- Nutrición: un solo aviso cuando hay reajuste; receta con lo que caduca; compra ordenada por recorrido (Mercadona/Consum).
- Suplementos: stock editable, aviso con ≤ 5 dosis y enlace de recompra.
- Progreso: peso y cintura con tendencia frente al objetivo.
- Resumen semanal automático (domingo 20:00) y bajo demanda en Coach.
- Sin conexión: caché de lecturas, cola de guardado, la sesión no se cierra sin red.
- Exportación: CSV de entrenos y guardado con el menú de compartir del iPhone.
- IA: modelo Pro para coach y resumen (Gemini de pago), conserva las «thought signatures» de Gemini 3 en las herramientas.
- Corregido: «Compartir lista» fallaba sin portapapeles; los avisos tapaban la cabecera.
- Migración `0015_mejoras`.

## Anteriores
Ver `git log`: registro de CrossFit por casillas, Apple Watch vía Intervals.icu, despensa con escáner y descuento automático, comidas fijas/opcionales.
