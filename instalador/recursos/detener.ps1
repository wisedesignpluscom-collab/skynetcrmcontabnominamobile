# Detiene el sistema y NO vuelve hasta confirmarlo (o fallar).
#
#   powershell -ExecutionPolicy Bypass -File detener.ps1 -Raiz "C:\SkynetCRM"
#
# Existe como script aparte porque lo usan tres sitios que no pueden divergir:
# el instalador completo (antes de reemplazar archivos), el actualizador y
# cualquier reparación a mano.
#
# La parte que importa es la ESPERA. Windows no deja sobrescribir un .exe en uso
# ni una DLL cargada: si se copia encima de un node.exe vivo, unos archivos se
# reemplazan y otros no, y la instalación queda mezclada entre dos versiones.
# `schtasks /End` devuelve el control enseguida, antes de que el proceso muera,
# así que confiar en él es justamente el error.

param(
    [Parameter(Mandatory = $true)][string]$Raiz,
    [int]$SegundosMaximo = 30
)

$ErrorActionPreference = "Stop"

$tarea = "SkynetCRM-Servidor"
$config = Join-Path $Raiz "config\instalacion.json"
if (Test-Path $config) {
    $cfg = Get-Content $config -Raw | ConvertFrom-Json
    if ($cfg.tareaServidor) { $tarea = $cfg.tareaServidor }
}

# Solo los node.exe de ESTA instalación: el servidor puede tener otras
# aplicaciones Node y matarlas sería un desastre ajeno.
function Get-NodeDelSistema {
    Get-Process node -ErrorAction SilentlyContinue |
        Where-Object {
            try { $_.Path -and $_.Path.StartsWith($Raiz, [StringComparison]::OrdinalIgnoreCase) }
            catch { $false }   # un proceso de otro usuario niega el acceso a Path
        }
}

& schtasks /End /TN $tarea 2>$null | Out-Null

# La tarea lanza un .cmd que lanza node.exe: terminar la tarea no siempre se
# lleva al nieto por delante.
Get-NodeDelSistema | Stop-Process -Force -ErrorAction SilentlyContinue

$esperado = 0
while ((Get-NodeDelSistema) -and $esperado -lt $SegundosMaximo) {
    Start-Sleep -Seconds 1
    $esperado++
}

$vivos = Get-NodeDelSistema
if ($vivos) {
    Write-Host "El sistema sigue corriendo tras $SegundosMaximo segundos:" -ForegroundColor Red
    foreach ($p in $vivos) { Write-Host "   PID $($p.Id)  $($p.Path)" -ForegroundColor Red }
    Write-Host "Windows no deja reemplazar archivos en uso." -ForegroundColor Red
    Write-Host "Detenlo desde el panel de la bandeja (clic derecho -> Detener) y reintenta." -ForegroundColor Yellow
    exit 1
}

if ($esperado -gt 0) { Write-Host "   Sistema detenido tras $esperado s" }
else { Write-Host "   El sistema no estaba corriendo" }
exit 0
