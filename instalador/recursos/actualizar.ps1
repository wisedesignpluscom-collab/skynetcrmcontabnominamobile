# Actualiza una instalación existente de Skynet CRM.
#
#   powershell -ExecutionPolicy Bypass -File actualizar.ps1 `
#       -Raiz "C:\SkynetCRM" -Origen "C:\SkynetCRM\.actualizacion"
#
# Reemplaza SOLO la aplicación, el esquema y las semillas. No toca la base de
# datos ni su carpeta, ni el .env, ni la configuración, ni la licencia: por eso
# no pide contraseñas — las lee de la instalación, como hace respaldo.ps1.
#
# El orden importa y es el punto entero de este script:
#
#   1. respaldar   — antes de tocar nada, y si el respaldo falla se aborta
#   2. detener     — y COMPROBAR que node.exe murió de verdad. Windows no deja
#                    sobrescribir un ejecutable en uso: si se copia encima de un
#                    proceso vivo, la instalación queda a medias
#   3. apartar     — la versión actual se renombra, no se borra: es el rescate
#   4. copiar      — la nueva aplicación
#   5. migrar      — migrate deploy (solo aplica lo que falte)
#   6. arrancar    — y no declarar éxito hasta que el sistema responda
#
# Si algo falla entre el paso 3 y el 6, se restaura la versión anterior y se
# vuelve a levantar. Lo que las migraciones ya hayan aplicado NO se deshace
# solo: para eso está el respaldo del paso 1.

param(
    [Parameter(Mandatory = $true)][string]$Raiz,
    [Parameter(Mandatory = $true)][string]$Origen,
    # Para reintentar una actualización cuando ya se respaldó hace un momento.
    [switch]$SinRespaldo
)

$ErrorActionPreference = "Stop"
function Paso($t) { Write-Host "`n== $t" -ForegroundColor Cyan }
function Aviso($t) { Write-Host "   $t" -ForegroundColor Yellow }
function Bien($t) { Write-Host "   $t" -ForegroundColor Green }

# Carpetas que sustituye la actualización. El resto de la instalación
# —.env, config, logs, postgres, node, la carpeta de datos y la licencia— no se
# toca: son del servidor, no de la versión.
$CARPETAS = @("app", "prisma", "semillas")

# ── 0. Comprobaciones previas ───────────────────────────────────────────────

Paso "Comprobando la instalación"

$config = Join-Path $Raiz "config\instalacion.json"
$envFile = Join-Path $Raiz ".env"
if (-not (Test-Path $config)) {
    throw "No parece haber una instalación en $Raiz (falta config\instalacion.json). Usa el instalador completo."
}
if (-not (Test-Path $envFile)) {
    throw "Falta $envFile. Usa el instalador completo."
}
foreach ($c in $CARPETAS) {
    if (-not (Test-Path (Join-Path $Origen $c))) {
        throw "El paquete de actualización está incompleto: falta $c en $Origen."
    }
}

$cfg = Get-Content $config -Raw | ConvertFrom-Json
$puerto = $cfg.puerto
$tarea = $cfg.tareaServidor
$node = Join-Path $Raiz "node\node.exe"

# Node y Prisma viven fuera de las carpetas que esta actualización reemplaza.
# Si la versión nueva los necesita distintos, este paquete no alcanza y hay que
# mandar el instalador completo: mejor decirlo ahora que dejar el sistema roto.
$manifiestoNuevo = Join-Path $Origen "actualizacion.json"
$versionInstalada = Join-Path $Raiz "version.json"
if ((Test-Path $manifiestoNuevo) -and (Test-Path $versionInstalada)) {
    $nuevo = Get-Content $manifiestoNuevo -Raw | ConvertFrom-Json
    $viejo = Get-Content $versionInstalada -Raw | ConvertFrom-Json
    if ($nuevo.nodeVersion -and $viejo.nodeVersion -and $nuevo.nodeVersion -ne $viejo.nodeVersion) {
        throw ("Esta actualización necesita Node $($nuevo.nodeVersion) y el servidor tiene $($viejo.nodeVersion).`n" +
               "Una actualización ligera no cambia el runtime: usa el instalador completo.")
    }
    if ($nuevo.prismaVersion -and $viejo.prismaVersion -and $nuevo.prismaVersion -ne $viejo.prismaVersion) {
        throw ("Esta actualización necesita Prisma $($nuevo.prismaVersion) y el servidor tiene $($viejo.prismaVersion).`n" +
               "El motor de migraciones va fuera de la aplicación: usa el instalador completo.")
    }
    Bien "Versión $($viejo.version) → $($nuevo.version)"
}

# ── 1. Respaldo ─────────────────────────────────────────────────────────────

if ($SinRespaldo) {
    Aviso "Respaldo omitido a petición de quien ejecuta (-SinRespaldo)."
} else {
    Paso "Respaldando la base de datos antes de tocar nada"
    $respaldo = Join-Path $Raiz "instalador\respaldo.ps1"
    if (-not (Test-Path $respaldo)) {
        throw "No se encontró $respaldo. No se actualiza sin respaldo."
    }
    # respaldo.ps1 ya verifica que el archivo se pueda leer y revienta si no
    & powershell.exe -ExecutionPolicy Bypass -NoProfile -File $respaldo
    if ($LASTEXITCODE -ne 0) {
        throw "El respaldo falló. La actualización se detiene: no se toca un sistema que no se puede restaurar."
    }
    Bien "Respaldo verificado"
}

# ── 2. Detener el sistema ───────────────────────────────────────────────────

Paso "Deteniendo el sistema"

# detener.ps1 no vuelve hasta confirmar que node.exe murió. Es el mismo script
# que usa el instalador completo: la espera es demasiado importante para tenerla
# escrita en dos sitios que puedan divergir.
$detener = Join-Path $PSScriptRoot "detener.ps1"
if (-not (Test-Path $detener)) { throw "No se encontró $detener." }
& powershell.exe -ExecutionPolicy Bypass -NoProfile -File $detener -Raiz $Raiz
if ($LASTEXITCODE -ne 0) {
    throw "No se pudo detener el sistema. No se toca nada: la instalación sigue intacta."
}
Bien "Sistema detenido"

# ── 3. Apartar la versión actual ────────────────────────────────────────────

Paso "Apartando la versión actual"

$apartadas = @()
try {
    foreach ($c in $CARPETAS) {
        $actual = Join-Path $Raiz $c
        $previa = Join-Path $Raiz "$c.anterior"
        if (Test-Path $previa) { Remove-Item $previa -Recurse -Force }
        if (Test-Path $actual) {
            Move-Item $actual $previa -Force
            $apartadas += $c
        }
    }
    Bien "$($apartadas.Count) carpetas apartadas (se borran al terminar bien)"
} catch {
    # Todavía no se copió nada nuevo: se devuelve lo apartado y se sale limpio
    foreach ($c in $apartadas) {
        $previa = Join-Path $Raiz "$c.anterior"
        if (Test-Path $previa) { Move-Item $previa (Join-Path $Raiz $c) -Force }
    }
    & schtasks /Run /TN $tarea 2>$null | Out-Null
    throw "No se pudo apartar la versión actual: $($_.Exception.Message). No se cambió nada."
}

# A partir de aquí cualquier fallo restaura lo apartado.
function Restaurar-Version {
    Aviso "Restaurando la versión anterior…"
    # Detener PRIMERO. El fallo puede venir del paso 6, con el sistema ya
    # arrancado: entonces node.exe tiene los archivos bloqueados y el borrado
    # fallaría justo cuando hace falta que funcione.
    & powershell.exe -ExecutionPolicy Bypass -NoProfile -File $detener -Raiz $Raiz | Out-Null
    foreach ($c in $CARPETAS) {
        $actual = Join-Path $Raiz $c
        $previa = Join-Path $Raiz "$c.anterior"
        if (Test-Path $previa) {
            if (Test-Path $actual) { Remove-Item $actual -Recurse -Force -ErrorAction SilentlyContinue }
            Move-Item $previa $actual -Force
        }
    }
    & schtasks /Run /TN $tarea 2>$null | Out-Null
}

try {
    # ── 4. Copiar la versión nueva ──────────────────────────────────────────

    Paso "Instalando la versión nueva"
    foreach ($c in $CARPETAS) {
        Copy-Item (Join-Path $Origen $c) (Join-Path $Raiz $c) -Recurse -Force
    }
    if (Test-Path $manifiestoNuevo) {
        Copy-Item $manifiestoNuevo (Join-Path $Raiz "version.json") -Force
    }
    Bien "Aplicación reemplazada"

    # ── 5. Migraciones ──────────────────────────────────────────────────────

    Paso "Aplicando las migraciones que falten"
    # Las credenciales salen del .env instalado: por eso esto no pregunta nada.
    $linea = Select-String -Path $envFile -Pattern "^DIRECT_URL=(.+)$"
    if (-not $linea) { throw "No se encontró DIRECT_URL en $envFile" }
    $directo = $linea.Matches.Groups[1].Value.Trim('"').Trim("'")
    $lineaApp = Select-String -Path $envFile -Pattern "^DATABASE_URL=(.+)$"
    if (-not $lineaApp) { throw "No se encontró DATABASE_URL en $envFile" }

    Push-Location $Raiz
    try {
        $env:DATABASE_URL = $lineaApp.Matches.Groups[1].Value.Trim('"').Trim("'")
        $env:DIRECT_URL = $directo
        # El motor va en el paquete: este servidor puede no tener salida a internet
        $motor = Join-Path $Raiz "node_modules\@prisma\engines\schema-engine-windows.exe"
        if (Test-Path $motor) { $env:PRISMA_SCHEMA_ENGINE_BINARY = $motor }

        & $node (Join-Path $Raiz "node_modules\prisma\build\index.js") `
            migrate deploy --schema=(Join-Path $Raiz "prisma\schema.postgres.prisma")
        if ($LASTEXITCODE -ne 0) { throw "Las migraciones fallaron con código $LASTEXITCODE" }
    } finally {
        Pop-Location
    }
    Bien "Base de datos al día"

    # ── 6. Arrancar y comprobar ─────────────────────────────────────────────

    Paso "Arrancando el sistema"
    & schtasks /Run /TN $tarea | Out-Null

    $arriba = $false
    for ($i = 0; $i -lt 45; $i++) {
        Start-Sleep -Seconds 2
        try {
            $r = Invoke-WebRequest -Uri "http://localhost:$puerto/login" -UseBasicParsing -TimeoutSec 3
            if ($r.StatusCode -eq 200) { $arriba = $true; break }
        } catch { }
    }
    if (-not $arriba) {
        throw "El sistema no respondió en el puerto $puerto tras 90 segundos."
    }
    Bien "El sistema responde"

} catch {
    $motivo = $_.Exception.Message
    Write-Host "`n!! La actualización falló: $motivo" -ForegroundColor Red
    Restaurar-Version
    Write-Host ""
    Write-Host "Se restauró la versión anterior." -ForegroundColor Yellow
    Write-Host "OJO: si el fallo fue DESPUÉS de las migraciones, la base ya tiene" -ForegroundColor Yellow
    Write-Host "los cambios nuevos y hay que restaurarla desde el respaldo del paso 1" -ForegroundColor Yellow
    Write-Host "(carpeta de respaldos, el .dump más reciente)." -ForegroundColor Yellow
    exit 1
}

# ── 7. Limpieza ─────────────────────────────────────────────────────────────

Paso "Limpiando"
foreach ($c in $CARPETAS) {
    $previa = Join-Path $Raiz "$c.anterior"
    if (Test-Path $previa) { Remove-Item $previa -Recurse -Force -ErrorAction SilentlyContinue }
}
if (Test-Path $Origen) { Remove-Item $Origen -Recurse -Force -ErrorAction SilentlyContinue }

Write-Host ""
Write-Host "== Skynet CRM actualizado y funcionando ==" -ForegroundColor Green
Write-Host "   Los usuarios pueden seguir trabajando normalmente." -ForegroundColor Green
exit 0
