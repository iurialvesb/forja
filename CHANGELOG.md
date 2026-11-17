# Changelog

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
