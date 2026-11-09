# Roadmap

Estado: ✅ hecho · 🔜 siguiente · 💡 idea

## Hecho
| Área | Estado |
|---|---|
| Plan adaptativo (running + CrossFit + HYROX), readiness, fatiga de piernas, reconciliación plan ↔ realizado | ✅ |
| Apple Watch automático (HealthFit → Intervals.icu), detalle de carrera, unir con registros manuales | ✅ |
| Registro de CrossFit por casillas, intérprete de pizarras, historial por ejercicio | ✅ |
| Nutrición por día de carga, menú, batch, despensa con escáner y descuento automático, compra por recorrido del súper | ✅ |
| Suplementos con stock, aviso de reposición y enlace de compra | ✅ |
| Tarjeta «Hoy» (entreno + comidas + suplementos con check), «Reservé» en WodBuster con un toque | ✅ |
| Paneles de objetivo: Media Maratón (predicción, tirada larga, hitos) y HYROX (estaciones vs objetivo, simulaciones) | ✅ |
| Simulación HYROX con parciales y cronómetro por tramos; temporizador EMOM/AMRAP/Tabata/For Time | ✅ |
| Peso y cintura con tendencia frente al objetivo | ✅ |
| Resumen semanal (domingo 20:00), avisos de caducidad con receta propuesta | ✅ |
| Modo sin conexión (lecturas en caché + cola de guardado) | ✅ |
| Exportación JSON completa y CSV de entrenos | ✅ |
| Coach con modelo Pro (Gemini de pago) y Flash de reserva | ✅ |

## Siguiente
| Área | Por qué |
|---|---|
| 🔜 Confirmación en el coach antes de mover sesiones o cambiar objetivos | Nivel «autorización» explícito |
| 🔜 Informe mensual (tendencias de 4 semanas, récords, cumplimiento) | Visión a medio plazo |
| 🔜 Copia de seguridad automática semanal (exportación a Drive o email) | El plan gratuito de Supabase no hace backups |
| 🔜 Monitorización de errores de las funciones (tabla `error_logs` + aviso) | Hoy los fallos solo se ven en el móvil |

## Ideas
| Área | Nota |
|---|---|
| 💡 Escaneo de tickets de la compra | Actualizar despensa sin escanear producto a producto |
| 💡 Presupuesto de comida | Precio por producto de Open Food Facts / tickets |
| 💡 Voz en el coach | Dictado del iPhone ya funciona en el cuadro de texto |
| 💡 Eventos internos entre módulos | Hoy se encadenan en `replan`/`meal-update`; formalizarlo si crece |
