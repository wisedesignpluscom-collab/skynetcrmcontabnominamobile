# Limpieza al desinstalar: quita los servicios y las tareas programadas.
#
# NO borra la carpeta de datos ni los respaldos: la contabilidad de los clientes
# de la firma no se borra porque alguien desinstaló el programa. Si de verdad
# hay que eliminarla, se hace a mano y a conciencia.

param([Parameter(Mandatory = $true)][string]$Raiz)

$ErrorActionPreference = "SilentlyContinue"
$config = Join-Path $Raiz "config\instalacion.json"

if (Test-Path $config) {
    $cfg = Get-Content $config -Raw | ConvertFrom-Json
    $servicioBd = $cfg.servicioBd
    $tarea = $cfg.tareaServidor
    $datos = $cfg.carpetaDatos
} else {
    $servicioBd = "SkynetCRM-PostgreSQL"
    $tarea = "SkynetCRM-Servidor"
}

# 1. Detener el sistema
& schtasks /End /TN $tarea 2>$null | Out-Null
& schtasks /Delete /TN $tarea /F 2>$null | Out-Null
& schtasks /Delete /TN "SkynetCRM-Respaldo" /F 2>$null | Out-Null
Get-Process node | Where-Object { $_.Path -like "$Raiz*" } | Stop-Process -Force

# 2. Detener y quitar el servicio de PostgreSQL (los datos se quedan)
Stop-Service $servicioBd -Force
$pgCtl = Join-Path $Raiz "postgres\bin\pg_ctl.exe"
if (Test-Path $pgCtl) { & $pgCtl unregister -N $servicioBd | Out-Null }
& sc.exe delete $servicioBd 2>$null | Out-Null

# 3. Regla del firewall
Remove-NetFirewallRule -DisplayName "Skynet CRM"

if ($datos -and (Test-Path $datos)) {
    Write-Output "Los datos y respaldos NO se borraron: siguen en $datos"
}
