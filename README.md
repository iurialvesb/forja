# Forja: entrenador personal y nutrición (running · CrossFit · HYROX)

**Versión gratuita (web app):** [docs/05-WEB-GRATIS.md](docs/05-WEB-GRATIS.md) ← empieza aquí.

- `web/`: web app instalable (PWA) sin dependencias ni compilación
- `engine/`: motor determinista en TypeScript (plan, adaptación, fuerza, ritmos, intérprete de WODs, nutrición, compra, batch, suplementos) con tests → `cd engine && npm test`
- `supabase/`: base de datos con RLS y funciones (IA con Gemini o Claude, Atajo de Apple Salud, calendario, push)
- `.github/workflows/deploy.yml`: despliegue gratuito con un botón
- `ios/`: app nativa SwiftUI (opcional; necesita la cuenta de desarrollador de Apple)
- `docs/`: arquitectura, diseño, estado
