# Forja: entrenador personal y nutrición (running · CrossFit · HYROX)

**Documentación viva:** [ARCHITECTURE.md](ARCHITECTURE.md) · [DATABASE_SCHEMA.md](DATABASE_SCHEMA.md) · [ROADMAP.md](ROADMAP.md) · [CHANGELOG.md](CHANGELOG.md) · reglas de trabajo en [CLAUDE.md](CLAUDE.md).

**Puesta en marcha (web app):** [docs/05-WEB-GRATIS.md](docs/05-WEB-GRATIS.md). La carpeta `docs/` y `ios/` son históricas (primera versión nativa).

- `web/`: web app instalable (PWA) sin dependencias ni compilación
- `engine/`: motor determinista en TypeScript (plan, adaptación, fuerza, ritmos, intérprete de WODs, nutrición, compra, batch, suplementos) con tests → `cd engine && npm test`
- `supabase/`: base de datos con RLS y funciones (IA con Gemini o Claude, Atajo de Apple Salud, calendario, push)
- `.github/workflows/deploy.yml`: despliegue gratuito con un botón
- `ios/`: app nativa SwiftUI (opcional; necesita la cuenta de desarrollador de Apple)
- `docs/`: arquitectura, diseño, estado
