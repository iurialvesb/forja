# Forja web: gratis y sin Mac

Forja funciona como una web que guardas en la pantalla de inicio del iPhone, igual que una app. Todo es gratis:

| Pieza | Servicio gratuito | Para qué |
|---|---|---|
| Web app | **GitHub Pages** | Abre Forja en el móvil (repositorio público: el código no contiene datos ni claves privadas) |
| Base de datos, cuentas, fotos y servidor | **Supabase** (plan Free) | Tus datos, con acceso solo para ti |
| IA | **Google Gemini** (nivel gratuito de AI Studio) | Coach, lectura de fotos, comida en texto libre y menús. **Google puede usar lo que envíes para mejorar sus productos.** Se puede desactivar en Perfil → Privacidad e IA |
| Alimentos | **USDA FoodData Central** + **Open Food Facts** | Macros, vitamina C y magnesio reales |
| Apple Salud | **Atajos** de iOS | Envía cada día HRV, FC en reposo, sueño, pasos y kcal |
| Clases y agenda | Enlace de calendario de **WodBuster** y de **Google Calendar** (iCal) | Clases fijas y huecos libres |
| Publicación | **GitHub Actions** | Despliega todo con un botón |

**Qué cambia respecto a la app nativa:**
- **Apple Salud llega con el Atajo**, no de forma automática.
- **Los entrenos del Watch:** pega el texto o regístralos a mano (o añádelos al Atajo si tu iOS lo permite).
- **Sin Strava:** su API ahora exige suscripción. Para tus WODs, copia la descripción y pégala.
- **Sin escáner de código de barras en vivo:** escribe el número o haz una foto de la etiqueta.
- **Notificaciones:** funcionan desde iOS 16.4, y solo abriendo Forja desde el icono de la pantalla de inicio.

## Paso a paso (todo desde el navegador; el iPhone vale, un ordenador es más cómodo)

**1. Supabase** (supabase.com → Start your project)
- Crea un proyecto en la región *Central EU (Frankfurt)* y **apunta la contraseña de la base de datos**.
- En **Project Settings → General**, copia el *Project ID*.
- En **Project Settings → API**, copia la *Project URL* y la clave **anon / publishable**.
- En **Account (tu avatar) → Access Tokens**, crea un token.

**2. Claves gratuitas**
- Gemini: en aistudio.google.com → *Get API key* → *Create API key*.
- USDA: en fdc.nal.usda.gov/api-key-signup (te llega por email).

**3. GitHub** (github.com, cuenta gratuita)
- Crea un repositorio **público** llamado `forja` y sube el contenido de esta carpeta. Si conectas GitHub en el chat, lo subo yo.
- En **Settings → Secrets and variables → Actions → New repository secret**, añade estos secretos:
  - `SUPABASE_ACCESS_TOKEN`
  - `SUPABASE_PROJECT_ID`
  - `SUPABASE_DB_PASSWORD`
  - `SUPABASE_URL`
  - `SUPABASE_ANON_KEY`
  - `GEMINI_API_KEY`
  - `USDA_API_KEY`
  - `CRON_SECRET` (una frase larga cualquiera)
- En **Settings → Pages → Build and deployment → Source**, elige **GitHub Actions**.
- En **Actions → Desplegar Forja → Run workflow**, espera a que salgan tres ✔. Al final te da la dirección: `https://TU-USUARIO.github.io/forja/`.

**4. Últimos ajustes en Supabase**
- En **Authentication → URL Configuration → Site URL**, pon la dirección de tu Forja.
- Para las notificaciones, ve a **SQL Editor** y ejecuta esto, cambiando los dos valores:
  ```sql
  select vault.create_secret('https://TU-PROYECTO.supabase.co', 'project_url');
  select vault.create_secret('LA-MISMA-FRASE-DE-CRON_SECRET', 'cron_secret');
  ```

**5. En el iPhone**
- Abre la dirección en **Safari**, pulsa **Compartir → Añadir a pantalla de inicio** y abre Forja desde el icono.
- Crea tu cuenta, confirma el email y entra. El asistente inicial ya trae tus objetivos (Media de Castellón y HYROX).
- En **Perfil → Apple Salud**, crea el token y monta el Atajo siguiendo los pasos que aparecen ahí.
- En **Perfil → Calendario**, pega el enlace de WodBuster (Perfil → Calendarios) y, si quieres, la dirección iCal secreta de Google Calendar.
- En **Perfil → Notificaciones**, actívalas.

## Límites de los planes gratuitos
- **Supabase Free** pausa el proyecto si pasa una semana sin uso. Usándolo a diario no pasa; si ocurre, se reactiva desde el panel.
- **Gemini gratis** tiene límites de peticiones por minuto y por día. Si se superan, Forja avisa y el resto sigue funcionando.
- **GitHub Pages** solo es gratis con el repositorio público. El código no contiene claves privadas: la *anon key* es pública por diseño y la seguridad la da RLS.

## Pendiente de comprobar en tu iPhone
- Que WodBuster te dé un enlace de suscripción (iCal) en Perfil → Calendarios.
- Qué entrenos ofrece la app Atajos en tu versión de iOS.
- Las notificaciones push.

La web ya está probada en Chrome con tamaño de iPhone y datos simulados: todas las pantallas cargan sin errores. Falta probarla contra tu Supabase real.
