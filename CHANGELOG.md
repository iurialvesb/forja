# Changelog

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
