# Instalar Skynet CRM en un servidor local (Windows + Docker)

> ## ⚠️ Esta ya NO es la forma recomendada de instalar
>
> **Usa el instalador `SkynetCRM-Setup.exe`** (ver `instalador/README.md`). Es un
> asistente gráfico en español: doble clic, responder cuatro pantallas, listo.
> Lleva Node y PostgreSQL dentro, así que en el servidor **no hay que instalar
> Docker ni nada más**.
>
> Docker se dejó documentado aquí solo como respaldo. En la práctica añade tres
> puntos de fallo que no aportan nada en un servidor de oficina:
>
> - **WSL 2 y la virtualización.** Docker Desktop la exige, y en muchos PCs viene
>   desactivada en la BIOS. Eso no se arregla desde Windows: hay que entrar a la
>   BIOS del servidor.
> - **La espera de `app-1` y la base.** `docker compose up` construye la imagen
>   dentro del contenedor y espera a que PostgreSQL responda. Si `.env` tiene mal
>   `DB_PASSWORD`, la app se queda reintentando en «Esperando a la base de
>   datos…» sin decir por qué.
> - **Docker Desktop tiene que estar abierto** para que el sistema arranque tras
>   un reinicio del servidor. El instalador, en cambio, registra PostgreSQL como
>   servicio de Windows y el sistema como tarea al arranque.

La app y su base de datos PostgreSQL corren juntas en Docker. En el servidor solo
instalas Docker una vez; el resto es un comando. Los usuarios de la oficina entran
desde su navegador por la red local.

---

## Requisitos

- Un PC **siempre encendido** en la oficina (8 GB RAM o más), con **IP fija** en la red.
- **Windows 10/11 Pro** (o Windows Server) con virtualización activada.
- **Docker Desktop** (gratis): https://www.docker.com/products/docker-desktop/
  - Al instalar, deja activado **WSL 2**.

---

## Paso 1 · Copiar el proyecto al servidor

Copia la carpeta del proyecto al servidor (por USB, red, o con Git). Debe quedar,
por ejemplo, en `C:\skynet-crm`.

> Si usas Git: `git clone <url-del-repo> C:\skynet-crm`

---

## Paso 2 · Crear el archivo de configuración `.env`

1. Abre la carpeta `C:\skynet-crm` en el Explorador.
2. Abre **PowerShell** ahí (clic derecho en la carpeta → *Abrir en Terminal*), y copia la plantilla:
   ```powershell
   Copy-Item .env.server.example .env
   ```
3. Genera la clave de sesión (cópiala):
   ```powershell
   -join ((1..32) | ForEach-Object { '{0:x2}' -f (Get-Random -Maximum 256) })
   ```
4. Abre el archivo `.env` con el Bloc de notas y completa **dos valores**:
   - `DB_PASSWORD` → una clave fuerte (solo letras y números).
   - `AUTH_SECRET` → los 64 caracteres que generaste.

   Guarda y cierra.

---

## Paso 3 · Levantar el sistema

En la misma PowerShell, dentro de `C:\skynet-crm`:

```powershell
docker compose up -d --build
```

La **primera vez** tarda varios minutos (descarga y compila). Cuando termine, la app
crea las tablas y siembra los datos de ejemplo automáticamente.

Para ver que arrancó bien:
```powershell
docker compose ps
docker compose logs -f app
```
(Verás `🚀 Iniciando Skynet CRM…`. Sal del log con `Ctrl + C`.)

---

## Paso 4 · Entrar

- **En el propio servidor:** http://localhost:3000
- **Desde otra computadora de la oficina:** `http://IP-DEL-SERVIDOR:3000`
  (por ejemplo `http://192.168.1.50:3000`).

Inicia sesión con:

| Rol        | Correo               | Contraseña |
|------------|----------------------|------------|
| Admin      | admin@skynetcrm.com   | admin123   |
| Supervisor | supervisor@test.com  | prueba123  |
| Vendedor   | vendedor@test.com    | prueba123  |

> ⚠️ **Cambia todas las contraseñas** desde **Usuarios** apenas entres.

---

## Paso 5 · Que otras PC puedan entrar (firewall)

En el servidor, permite el puerto 3000 (una sola vez, en PowerShell **como administrador**):

```powershell
New-NetFirewallRule -DisplayName "Skynet CRM" -Direction Inbound -Protocol TCP -LocalPort 3000 -Action Allow
```

---

## Paso 6 · Que arranque solo (encendido 24/7)

1. En **Docker Desktop → Settings → General**, activa **“Start Docker Desktop when you log in”**.
2. Los contenedores ya están en `restart: always`: se reinician solos tras un apagón,
   siempre que Docker esté corriendo.
3. **Importante (Windows):** Docker Desktop necesita que haya una **sesión de Windows
   iniciada**. Para un servidor desatendido, configura el **inicio de sesión
   automático** de Windows en esa cuenta, o usa **Windows Server**. (Si prefieres algo
   100% desatendido sin esto, avísame y lo montamos en Linux.)

---

## Respaldos (¡importante para datos de un contador!)

Copia de seguridad de la base a un archivo, cuando quieras:

```powershell
docker compose exec -T db pg_dump -U skynet skynet_crm > "C:\respaldos\skynet-$(Get-Date -Format yyyy-MM-dd).sql"
```

Automatízalo con el **Programador de tareas de Windows** (diario). Guarda también una
copia del archivo `.env`. Para restaurar en una base nueva:

```powershell
Get-Content "C:\respaldos\skynet-XXXX.sql" | docker compose exec -T db psql -U skynet -d skynet_crm
```

---

## Actualizar a una versión nueva

1. Reemplaza la carpeta por la versión nueva (o `git pull`).
2. Reconstruye y reinicia:
   ```powershell
   docker compose up -d --build
   ```
   Los datos se conservan (viven en el volumen de PostgreSQL, no en la imagen).

---

## Comandos útiles

| Acción                        | Comando                          |
|-------------------------------|----------------------------------|
| Ver estado                    | `docker compose ps`              |
| Ver registros de la app       | `docker compose logs -f app`     |
| Detener                       | `docker compose stop`            |
| Encender de nuevo             | `docker compose start`           |
| Apagar y borrar contenedores  | `docker compose down`            |
| (⚠️ borrar TODO incl. datos)  | `docker compose down -v`         |

---

## Notas honestas

- **Sin internet, funciona igual**: todo corre en la red local. La app no necesita
  salir a internet para operar (WhatsApp sí abre wa.me en el navegador del usuario).
- **HTTPS**: en la red local va por `http://`. Por eso `COOKIE_SECURE=false`. Si más
  adelante quieres HTTPS con un nombre bonito (`crm.despacho.local`), se agrega Caddy;
  pídemelo.
- **Automatizaciones por tiempo** (vencimientos, leads fríos): corren mientras alguien
  tenga la app abierta. Para dispararlas 24/7 sin nadie mirando, se añade una tarea
  programada que “toca” el sistema; lo vemos si lo necesitas.
- **No expongas este puerto a internet** sin protección: está pensado para la red
  interna de la oficina.
