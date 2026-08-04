# Configuración del servidor tras copiar los archivos. Lo llama el instalador,
# pero también sirve para reparar una instalación: es idempotente.
#
#   powershell -ExecutionPolicy Bypass -File configurar.ps1 `
#       -Raiz "C:\SkynetCRM" -ClaveBd "..." -Puerto 3000 -PuertoBd 5433 `
#       -CarpetaDatos "D:\SkynetCRM-datos" -AbrirFirewall -CargarDemo

param(
    [Parameter(Mandatory = $true)][string]$Raiz,
    # El instalador NO la pasa por aquí: llega en SKYNET_CLAVE_BD (ver abajo).
    # Se conserva como parámetro para poder reparar una instalación a mano.
    [string]$ClaveBd = "",
    [int]$Puerto = 3000,
    # 5433 y no 5432: si el servidor ya tiene otro PostgreSQL, no chocan
    [int]$PuertoBd = 5433,
    [string]$CarpetaDatos = "",
    # Credenciales del Gerente: sin esto el sistema quedaría con la clave por
    # defecto, que es pública en el repositorio.
    [string]$CorreoGerente = "",
    [string]$ClaveGerente = "",
    [switch]$AbrirFirewall,
    [switch]$CargarDemo,
    # El instalador lo pasa cuando el administrador desmarca el componente de
    # respaldo automático. Por defecto SÍ se programa: es lo que protege los
    # datos de la firma.
    [switch]$SinRespaldos
)

$ErrorActionPreference = "Stop"
function Paso($texto) { Write-Host "`n== $texto" -ForegroundColor Cyan }
function Aviso($texto) { Write-Host "   $texto" -ForegroundColor Yellow }

# Las contraseñas llegan por variables de entorno y no como argumentos: la línea
# de comandos de un proceso la puede leer cualquier usuario del servidor
# (Administrador de tareas, Get-CimInstance Win32_Process). Los parámetros
# siguen funcionando para reparar una instalación desde PowerShell a mano.
if (-not $ClaveBd -and $env:SKYNET_CLAVE_BD) { $ClaveBd = $env:SKYNET_CLAVE_BD }
if (-not $ClaveGerente -and $env:SKYNET_CLAVE_GERENTE) { $ClaveGerente = $env:SKYNET_CLAVE_GERENTE }

if (-not $ClaveBd) {
    throw "Falta la contraseña de la base de datos (parámetro -ClaveBd o variable SKYNET_CLAVE_BD)."
}

if (-not $CarpetaDatos) { $CarpetaDatos = Join-Path $Raiz "datos" }
$pgBin = Join-Path $Raiz "postgres\bin"
$pgData = Join-Path $CarpetaDatos "postgres"
$carpetaRespaldos = Join-Path $CarpetaDatos "respaldos"
$logs = Join-Path $Raiz "logs"
$node = Join-Path $Raiz "node\node.exe"
$usuarioBd = "skynet"
$nombreBd = "skynet_crm"
$servicioBd = "SkynetCRM-PostgreSQL"
$tareaServidor = "SkynetCRM-Servidor"

New-Item -ItemType Directory -Force -Path $CarpetaDatos, $carpetaRespaldos, $logs | Out-Null

# ── 1. Base de datos ────────────────────────────────────────────────────────

Paso "Preparando PostgreSQL"

if (-not (Test-Path (Join-Path $pgData "PG_VERSION"))) {
    # initdb necesita la clave en un archivo (no la acepta por parámetro)
    $archivoClave = Join-Path $env:TEMP "skynet-pg-clave.txt"
    Set-Content -Path $archivoClave -Value $ClaveBd -NoNewline -Encoding ASCII
    try {
        & (Join-Path $pgBin "initdb.exe") `
            --pgdata="$pgData" --username=$usuarioBd --pwfile="$archivoClave" `
            --encoding=UTF8 --locale=C --auth=scram-sha-256 | Out-Null
        if ($LASTEXITCODE -ne 0) { throw "initdb falló con código $LASTEXITCODE" }
    } finally {
        Remove-Item $archivoClave -Force -ErrorAction SilentlyContinue
    }

    # Ajustes para ~30 usuarios concurrentes en un servidor de oficina
    $conf = Join-Path $pgData "postgresql.conf"
    Add-Content $conf @"

# ── Ajustes de Skynet CRM ──────────────────────────────────────────────
port = $PuertoBd
listen_addresses = 'localhost'          # solo la app entra a la base
max_connections = 100                   # 30 usuarios usan muy pocas: el pool las comparte
shared_buffers = 512MB
work_mem = 8MB
maintenance_work_mem = 128MB
effective_cache_size = 2GB
# Registro de consultas lentas: ayuda a diagnosticar sin llenar el disco
log_min_duration_statement = 2000
"@
    Write-Host "   Base creada en $pgData"
} else {
    Write-Host "   Ya existía una base en $pgData (se conserva)"
}

Paso "Registrando el servicio de la base de datos"
$yaExiste = & sc.exe query $servicioBd 2>$null | Select-String "SERVICE_NAME"
if (-not $yaExiste) {
    & (Join-Path $pgBin "pg_ctl.exe") register -N $servicioBd -D "$pgData" -S auto | Out-Null
}
& sc.exe failure $servicioBd reset= 86400 actions= restart/5000/restart/15000/restart/60000 | Out-Null
Start-Service $servicioBd -ErrorAction SilentlyContinue

# Esperar a que acepte conexiones
$intentos = 0
do {
    Start-Sleep -Seconds 2
    & (Join-Path $pgBin "pg_isready.exe") -h localhost -p $PuertoBd -q 2>$null
    $listo = $LASTEXITCODE -eq 0
    $intentos++
} until ($listo -or $intentos -ge 20)
if (-not $listo) { throw "PostgreSQL no respondió tras 40 segundos. Revisa $pgData\log" }
Write-Host "   PostgreSQL responde en el puerto $PuertoBd"

Paso "Creando la base de datos del sistema"
$env:PGPASSWORD = $ClaveBd
$existe = & (Join-Path $pgBin "psql.exe") -h localhost -p $PuertoBd -U $usuarioBd -d postgres -tAc `
    "SELECT 1 FROM pg_database WHERE datname='$nombreBd'"
if ($existe -ne "1") {
    & (Join-Path $pgBin "createdb.exe") -h localhost -p $PuertoBd -U $usuarioBd $nombreBd
    Write-Host "   Base '$nombreBd' creada"
} else {
    Write-Host "   La base '$nombreBd' ya existía"
}

# ── 2. Configuración de la aplicación ───────────────────────────────────────

Paso "Escribiendo la configuración"

$env = Join-Path $Raiz ".env"
if (Test-Path $env) {
    # Actualizar sin perder la clave de sesión: si se regenera, todos los
    # usuarios pierden la sesión abierta.
    $secretoActual = (Select-String -Path $env -Pattern "^AUTH_SECRET=(.+)$").Matches.Groups[1].Value
}
if (-not $secretoActual) {
    $bytes = New-Object byte[] 32
    [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
    $secretoActual = -join ($bytes | ForEach-Object { "{0:x2}" -f $_ })
}

$urlBd = "postgresql://${usuarioBd}:${ClaveBd}@localhost:${PuertoBd}/${nombreBd}?schema=public&connection_limit=20"
@"
# Generado por el instalador de Skynet CRM. Si cambias algo, reinicia el sistema
# desde el panel de la bandeja.
NODE_ENV=production
DATABASE_URL=$urlBd
DIRECT_URL=postgresql://${usuarioBd}:${ClaveBd}@localhost:${PuertoBd}/${nombreBd}?schema=public
AUTH_SECRET=$secretoActual
# La red local va por HTTP: la cookie de sesión no puede exigir HTTPS
COOKIE_SECURE=false
PORT=$Puerto
# Raíz de la instalación: la app la usa para encontrar licencia.lic (server.js
# se sitúa en la subcarpeta app/, así que no puede deducirla del directorio)
SKYNET_RAIZ=$Raiz
"@ | Set-Content -Path $env -Encoding UTF8

# Configuración que lee el panel de la bandeja
$carpetaConfig = Join-Path $Raiz "config"
New-Item -ItemType Directory -Force -Path $carpetaConfig | Out-Null
@{
    puerto           = $Puerto
    puertoBd         = $PuertoBd
    usuarioBd        = $usuarioBd
    nombreBd         = $nombreBd
    servicioBd       = $servicioBd
    tareaServidor    = $tareaServidor
    carpetaDatos     = $CarpetaDatos
    carpetaRespaldos = $carpetaRespaldos
} | ConvertTo-Json | Set-Content -Path (Join-Path $carpetaConfig "instalacion.json") -Encoding UTF8

# ── 3. Esquema y datos iniciales ────────────────────────────────────────────

Paso "Aplicando las migraciones de la base de datos"
Push-Location $Raiz
$env:DATABASE_URL = $urlBd
$env:DIRECT_URL = "postgresql://${usuarioBd}:${ClaveBd}@localhost:${PuertoBd}/${nombreBd}?schema=public"

# El motor de migraciones va en el paquete (lo descarga el empaquetado). Se le
# indica la ruta exacta para que Prisma no intente resolverlo por su cuenta ni,
# peor, bajárselo de internet: este servidor puede no tener salida a la red.
$motorEsquema = Join-Path $Raiz "node_modules\@prisma\engines\schema-engine-windows.exe"
if (Test-Path $motorEsquema) {
    $env:PRISMA_SCHEMA_ENGINE_BINARY = $motorEsquema
} else {
    Aviso "No se encontró $motorEsquema; Prisma intentará descargarlo."
}
try {
    & $node (Join-Path $Raiz "node_modules\prisma\build\index.js") `
        migrate deploy --schema=(Join-Path $Raiz "prisma\schema.postgres.prisma")
    if ($LASTEXITCODE -ne 0) { throw "Las migraciones fallaron con código $LASTEXITCODE" }

    $marcador = Join-Path $CarpetaDatos ".sembrado"
    if (-not (Test-Path $marcador)) {
        Paso "Cargando los datos iniciales"
        # Instalación real: solo el Gerente, nunca los usuarios de prueba
        $env:SIN_USUARIOS_PRUEBA = "1"
        if ($CorreoGerente) { $env:ADMIN_EMAIL = $CorreoGerente }
        if ($ClaveGerente) { $env:ADMIN_PASSWORD = $ClaveGerente }
        & $node (Join-Path $Raiz "semillas\sembrar.js") $(if ($CargarDemo) { "--demo" } else { "" })
        $env:ADMIN_PASSWORD = $null
        if ($LASTEXITCODE -ne 0) { Aviso "Los datos iniciales fallaron; el sistema arranca igual." }
        else { Set-Content -Path $marcador -Value (Get-Date -Format s) }
    } else {
        Write-Host "   Ya había datos: no se vuelven a sembrar"
    }
} finally {
    Pop-Location
}

# ── 4. Arranque automático ──────────────────────────────────────────────────

Paso "Programando el arranque automático del sistema"

# Tarea programada en vez de servicio de Windows: node.exe no implementa el
# protocolo de servicios, así que un servicio "real" necesitaría un envoltorio
# de terceros (NSSM). La tarea al arranque, corriendo como SYSTEM y con
# reintentos, cumple lo mismo sin agregar binarios que mantener.
$lanzador = Join-Path $Raiz "iniciar-servidor.cmd"
& schtasks /Delete /TN $tareaServidor /F 2>$null | Out-Null
& schtasks /Create /TN $tareaServidor /TR "`"$lanzador`"" /SC ONSTART /RU SYSTEM /RL HIGHEST /F | Out-Null

# Reintentar cada minuto si el proceso se cae
$t = New-Object -ComObject Schedule.Service
$t.Connect()
$carpeta = $t.GetFolder("\")
$def = $carpeta.GetTask($tareaServidor).Definition
$def.Settings.RestartInterval = "PT1M"
$def.Settings.RestartCount = 999
$def.Settings.ExecutionTimeLimit = "PT0S"   # sin límite de duración
$def.Settings.DisallowStartIfOnBatteries = $false
$def.Settings.StopIfGoingOnBatteries = $false
$carpeta.RegisterTaskDefinition($tareaServidor, $def, 4, "SYSTEM", $null, 5) | Out-Null

if ($SinRespaldos) {
    Paso "Respaldo automático: desactivado a petición del instalador"
    & schtasks /Delete /TN "SkynetCRM-Respaldo" /F 2>$null | Out-Null
    Aviso "Nadie está respaldando esta base. Progámalo desde el panel de la bandeja."
} else {
    Paso "Programando el respaldo diario"
    $respaldo = Join-Path $Raiz "instalador\respaldo.ps1"
    & schtasks /Delete /TN "SkynetCRM-Respaldo" /F 2>$null | Out-Null
    & schtasks /Create /TN "SkynetCRM-Respaldo" `
        /TR "powershell -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$respaldo`"" `
        /SC DAILY /ST 22:00 /RU SYSTEM /RL HIGHEST /F | Out-Null
    Write-Host "   Respaldo diario a las 10:00 p.m. en $carpetaRespaldos"
}

# ── 5. Red ──────────────────────────────────────────────────────────────────

if ($AbrirFirewall) {
    Paso "Abriendo el puerto $Puerto en el firewall"
    Remove-NetFirewallRule -DisplayName "Skynet CRM" -ErrorAction SilentlyContinue
    New-NetFirewallRule -DisplayName "Skynet CRM" -Direction Inbound -Protocol TCP `
        -LocalPort $Puerto -Action Allow -Profile Private, Domain | Out-Null
    Aviso "Abierto solo en redes privadas y de dominio, no en redes públicas."
}

# ── 5b. Comprobaciones del entorno ──────────────────────────────────────────

Paso "Revisando la configuración del servidor"

$zona = (Get-TimeZone).Id
if ($zona -notmatch "Venezuela|SA Western|Caracas") {
    Aviso "La zona horaria del servidor es '$zona'."
    Aviso "El cálculo de vencimientos fiscales usa la fecha local: si no es la de"
    Aviso "Venezuela, las fechas límite pueden salir corridas un día."
}

$ipFija = Get-NetIPAddress -AddressFamily IPv4 |
    Where-Object { $_.InterfaceAlias -notmatch "Loopback" -and $_.PrefixOrigin -eq "Dhcp" }
if ($ipFija) {
    Aviso "Este servidor tiene IP por DHCP: puede cambiar al reiniciar el router y"
    Aviso "los usuarios perderían el acceso. Conviene fijarle una IP en la red."
}

# ── 6. Arrancar ─────────────────────────────────────────────────────────────

Paso "Iniciando el sistema"
& schtasks /Run /TN $tareaServidor | Out-Null

$intentos = 0
do {
    Start-Sleep -Seconds 3
    try {
        $r = Invoke-WebRequest "http://localhost:$Puerto/login" -UseBasicParsing -TimeoutSec 3
        $arriba = $r.StatusCode -eq 200
    } catch { $arriba = $false }
    $intentos++
} until ($arriba -or $intentos -ge 20)

$ip = (Get-NetIPAddress -AddressFamily IPv4 |
    Where-Object { $_.InterfaceAlias -notmatch "Loopback" -and $_.IPAddress -notmatch "^169\." } |
    Select-Object -First 1).IPAddress
if (-not $ip) { $ip = "localhost" }

# La dirección de acceso, para que el instalador la muestre al terminar. El
# panel de la bandeja NO lee este archivo: la recalcula cada vez, porque si la
# IP del servidor cambia, un valor congelado aquí mandaría a los usuarios a una
# dirección muerta.
Set-Content -Path (Join-Path $carpetaConfig "acceso.txt") `
    -Value "http://${ip}:$Puerto" -NoNewline -Encoding ASCII

if ($arriba) {
    Write-Host "`n✓ Skynet CRM está funcionando." -ForegroundColor Green
    Write-Host "  Los usuarios entran desde su navegador a:  http://${ip}:$Puerto" -ForegroundColor Green
} else {
    Aviso "El sistema no respondió todavía. Revisa $logs\servidor.log"
    exit 1
}
