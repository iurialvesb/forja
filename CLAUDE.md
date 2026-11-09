# Cómo trabajar en Forja

Lee primero `ARCHITECTURE.md`, `DATABASE_SCHEMA.md` y `ROADMAP.md`. Usuario: Iuri (español de España, respuestas directas).

Reglas:
1. Antes de cambiar algo, mira quién lo usa (motor, funciones, web, tests).
2. Base de datos: solo migraciones nuevas en `supabase/migrations/`, compatibles con los datos existentes. Nunca borrar columnas ni datos sin migrar antes.
3. Los cálculos van en `engine/src` (una sola vez) con su test. Funciones y web los importan; no se reescriben.
4. La IA interpreta y redacta; no decide cargas, macros ni cambios del plan.
5. Todo cambio automático del plan deja rastro en `plan_changes` con su motivo.
6. Tras cambiar el motor: `bash scripts/sync-engine.sh && node scripts/build-web-engine.mjs && (cd engine && npm test)`.
7. Tras cambiar la web: `node web-test/run.mjs` (y `MONKEY=1` para pulsar todo) sin errores de JavaScript; revisa las capturas.
8. Móvil primero (390 px). Textos en español, números con coma decimal.
9. Actualiza `CHANGELOG.md` y `ROADMAP.md` en cada entrega.
10. Despliegue: push a `main` (GitHub Actions). Comprueba el run con `gh api repos/iurialvesb/forja/actions/runs`.
