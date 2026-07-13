# Desplegar Skynet CRM en Netlify (ambiente de pruebas)

Guía para poner la app en línea y usarla como en un entorno real. La base de datos
es **PostgreSQL en Neon** (gratis); el sitio corre en **Netlify** (gratis).

Tiempo estimado: ~20 minutos. Solo necesitas un navegador y la terminal para **un**
comando.

---

## Antes de empezar: dos cosas que debes saber

1. **La base de datos ya NO es el archivo local.** En Netlify se usa PostgreSQL en
   la nube. Tu desarrollo local sigue igual (SQLite); esto es aparte.
2. **Las automatizaciones tardan unos segundos.** El motor guarda las acciones al
   instante, pero las ejecuta en el siguiente "latido" de la campanita (mientras
   tengas una pestaña abierta). Es normal que una notificación automática aparezca
   unos segundos después. Para probar funciona perfecto.

---

## Paso 1 · Crear la base de datos en Neon

1. Entra a **https://neon.tech** y crea una cuenta (puedes usar tu GitHub).
2. Botón **Create project**. Ponle un nombre (ej. `skynet-crm`). Región: la más
   cercana. Crear.
3. Al terminar te muestra la **connection string**. Copia la que dice
   **Connection string** (empieza por `postgresql://...`). Guárdala, la usarás dos
   veces.
   - Si te da a elegir, usa la opción **"Direct connection"** (sin `-pooler`) para
     estas pruebas; es la más simple.

> Esa cadena es una contraseña: no la subas a GitHub ni la compartas.

---

## Paso 2 · Crear las tablas y los datos de prueba en Neon

Esto se hace **una sola vez**, desde tu computadora. Abre la terminal en la carpeta
del proyecto y corre (reemplazando la URL por la tuya de Neon):

```bash
cd ~/Projects/skynet-crm
DATABASE_URL="postgresql://...tu-cadena-de-neon..." npm run setup:prod-db
```

Eso crea todas las tablas, los usuarios y los datos demo (contactos, pipeline,
automatizaciones) en Neon. Al terminar **regenera solo tu entorno local**, así que
tu `npm run dev` de siempre sigue funcionando con SQLite sin cambios.

Usuarios que quedan creados:

| Rol        | Correo                | Contraseña |
|------------|-----------------------|------------|
| Admin      | admin@skynetcrm.com    | admin123   |
| Supervisor | supervisor@test.com   | prueba123  |
| Vendedor   | vendedor@test.com     | prueba123  |

> ⚠️ Cambia estas contraseñas desde **/usuarios** apenas entres.

---

## Paso 3 · Generar la clave de sesión

En la terminal:

```bash
openssl rand -hex 32
```

Copia el resultado (64 caracteres). Es el valor de `AUTH_SECRET`.

---

## Paso 4 · Conectar el repo en Netlify

1. Entra a **https://app.netlify.com** y crea cuenta (con GitHub).
2. **Add new site → Import an existing project → GitHub**, y elige el repo
   `skynet-crm`.
3. Netlify detecta Next.js solo. **No cambies** el comando de build: ya viene del
   archivo `netlify.toml` incluido (`npm run build:netlify`).
4. Antes de desplegar, abre **Add environment variables** (o luego en
   *Site configuration → Environment variables*) y agrega **dos**:

   | Clave           | Valor                                          |
   |-----------------|------------------------------------------------|
   | `DATABASE_URL`  | tu connection string de Neon (la del Paso 1)   |
   | `AUTH_SECRET`   | los 64 caracteres del Paso 3                   |

5. **Deploy site**. El primer build tarda 2-4 minutos.

---

## Paso 5 · Entrar y probar

1. Netlify te da una URL tipo `https://tu-sitio.netlify.app`.
2. Ábrela → te lleva al login → entra con `admin@skynetcrm.com` / `admin123`.
3. Ve a **/usuarios** y cambia las contraseñas.
4. Prueba el pipeline, las automatizaciones (recuerda: se ejecutan en segundos),
   el import/export, los permisos entrando como supervisor, etc.

---

## Actualizar el sitio después

Cada vez que hagas `git push` a la rama `main`, Netlify **reconstruye y publica
solo**. No hay que hacer nada más.

Si cambiaste el **modelo de datos** (`prisma/schema.prisma`), aplica el cambio a
Neon corriendo otra vez, una sola vez:

```bash
DATABASE_URL="postgresql://...neon..." npm run setup:prod-db
```

> Ojo: `setup:prod-db` reejecuta los seeds (reescribe los datos demo). Si ya
> cargaste datos reales de prueba que quieras conservar, usa solo
> `... prisma db push --schema=prisma/schema.postgres.prisma` en lugar del comando
> completo para actualizar el esquema sin tocar los datos.

---

## Notas y límites

- **Costo:** Neon y Netlify tienen plan gratuito suficiente para pruebas.
- **Automatizaciones en el tiempo** (leads fríos, deals estancados): dependen del
  "latido" de la campanita, que ocurre cuando alguien tiene la app abierta. En un
  ambiente de pruebas eso basta; para un uso productivo 24/7 sin nadie mirando,
  haría falta un cron externo (fase futura).
- **Rendimiento:** el caché de reglas se reinicia por petición en serverless. Es
  correcto (nunca sirve datos viejos), solo sin la ganancia de velocidad que sí
  tiene en un servidor persistente.
- Si más adelante quieres un entorno productivo "de verdad" (queue instantánea,
  crons, servidor siempre encendido), un host persistente como **Railway** o
  **Render** encaja mejor con este motor de automatizaciones. Netlify es ideal para
  **probar**, que es lo que buscas ahora.
