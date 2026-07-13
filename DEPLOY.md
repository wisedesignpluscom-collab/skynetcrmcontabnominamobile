# Desplegar Skynet CRM en la nube (Vercel + Supabase)

Guía para subir el CRM a producción. Tres servicios, todos con capa gratis:

| Servicio | Para qué | Cuenta |
| --- | --- | --- |
| **GitHub** | Control de versiones (el código) | del cliente |
| **Supabase** | Base de datos PostgreSQL | del cliente |
| **Vercel** | Hospedaje de la app (acceso web) | del cliente |

> Todo lo marcado con 🧑‍💻 lo hace el cliente en **su** cuenta (crear proyectos,
> pegar secretos). El desarrollador no puede iniciar sesión por él.

---

## 1. GitHub — subir el código 🧑‍💻

1. El cliente crea un repositorio **vacío y privado** en su cuenta de GitHub
   (ej. `skynet-crm`). Sin README ni .gitignore.
2. Apuntar este proyecto a ese repo y subir:

   ```bash
   cd "/ruta/al/proyecto/nogui-crm"
   git remote add cliente https://github.com/<usuario-cliente>/skynet-crm.git
   git push cliente main
   ```

   (Si pide login, el cliente usa su usuario y un **token** de GitHub, no la contraseña.)

---

## 2. Supabase — la base de datos 🧑‍💻

1. En [supabase.com](https://supabase.com) → **New project**. Elige nombre,
   región cercana y define la **contraseña de la base** (guárdala).
2. Cuando termine, ve a **Project Settings → Database → Connection string** y copia:
   - **Transaction** (pooler, puerto **6543**) → será `DATABASE_URL` (añádele `?pgbouncer=true`)
   - **Direct connection** (puerto **5432**) → será `DIRECT_URL`
3. **Crear las tablas + el usuario admin** (una sola vez). En el proyecto local,
   con las dos URLs exportadas, corre:

   ```bash
   export DATABASE_URL="...pooler...6543/postgres?pgbouncer=true"
   export DIRECT_URL="...db...5432/postgres"
   npm run setup:prod-db
   ```

   Esto crea todas las tablas, siembra el **usuario admin** y las **reglas del
   sistema** (sin datos de demo). Al terminar, restaura tu cliente local con
   `npx prisma generate`.

   > ¿Quieres datos de ejemplo para probar? Usa `npm run setup:prod-db:demo`.
   > **Cambia la contraseña del admin** después del primer ingreso.

---

## 3. Vercel — publicar la app 🧑‍💻

1. En [vercel.com](https://vercel.com) → **Add New → Project** → importa el repo
   de GitHub del paso 1. Vercel detecta Next.js solo (usa el `vercel.json` incluido).
2. En **Environment Variables** pega (ver `.env.production.example`):

   | Variable | Valor |
   | --- | --- |
   | `DATABASE_URL` | pooler de Supabase (6543, con `?pgbouncer=true`) |
   | `DIRECT_URL` | conexión directa de Supabase (5432) |
   | `AUTH_SECRET` | `openssl rand -hex 32` |
   | `CRON_SECRET` | `openssl rand -hex 32` |
   | `COOKIE_SECURE` | `true` |

3. **Deploy**. Al terminar tendrás una URL tipo `https://skynet-crm.vercel.app`.
   Entra con el usuario admin sembrado en el paso 2.

---

## 4. Cron — correos programados y automatizaciones ⏰

En serverless las funciones se congelan entre peticiones, así que el planificador
de fondo no corre solo. Un **cron externo** debe golpear `/api/cron` cada minuto.

**Opción recomendada (gratis, cualquier plan): [cron-job.org](https://cron-job.org)**

1. Crear cuenta → **Create cronjob**.
2. URL: `https://<tu-app>.vercel.app/api/cron?key=<CRON_SECRET>`
   (el mismo `CRON_SECRET` de Vercel).
3. Schedule: **cada 1 minuto**. Guardar.

Con eso, los correos programados salen a su hora y las automatizaciones por tiempo
se disparan aunque nadie tenga el CRM abierto.

> Alternativa: si el cliente tiene **Vercel Pro**, se puede usar Vercel Cron
> nativo añadiendo `crons` a `vercel.json`. En el plan gratis (Hobby) el cron
> nativo es de baja frecuencia, por eso usamos el externo.

---

## Comprobaciones tras el despliegue

- [ ] Entra al CRM con el admin y cambia su contraseña.
- [ ] Configura al menos una **cuenta de correo saliente** en /configuracion.
- [ ] Verifica el cron: abre `https://<app>.vercel.app/api/cron?key=<CRON_SECRET>`
      en el navegador → debe responder `{"ok":true,...}` (sin el key correcto, 401).
- [ ] Crea un contacto de prueba y envía un correo programado a 2 min → debe llegar.

## Actualizaciones futuras

Cada `git push cliente main` dispara un nuevo deploy automático en Vercel.
Si cambia el esquema de la base, corre de nuevo `npm run setup:prod-db` (hace
`db push`, que **no borra datos**; solo aplica los cambios de estructura).
