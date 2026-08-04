# Respaldo de la base de datos. Lo corre la tarea diaria y el panel de bandeja.
#
# Un CRM que lleva obligaciones fiscales y facturación no puede depender de que
# alguien se acuerde de respaldar: por eso esto es automático y con retención.

$ErrorActionPreference = "Stop"
$raiz = Split-Path -Parent $PSScriptRoot
$cfg = Get-Content (Join-Path $raiz "config\instalacion.json") -Raw | ConvertFrom-Json

$pgDump = Join-Path $raiz "postgres\bin\pg_dump.exe"
$carpeta = $cfg.carpetaRespaldos
$diasQueSeGuardan = 30

New-Item -ItemType Directory -Force -Path $carpeta | Out-Null

# La clave sale del .env, no se repite en dos sitios
$linea = Select-String -Path (Join-Path $raiz ".env") -Pattern "^DIRECT_URL=(.+)$"
if (-not $linea) { throw "No se encontró DIRECT_URL en el archivo .env" }
$url = $linea.Matches.Groups[1].Value
if ($url -match "postgresql://([^:]+):([^@]+)@") {
    $usuario = $Matches[1]
    $env:PGPASSWORD = $Matches[2]
} else {
    throw "No se pudo leer el usuario y la clave desde DIRECT_URL"
}

$sello = Get-Date -Format "yyyy-MM-dd_HHmm"
$archivo = Join-Path $carpeta "skynet_crm_$sello.dump"

# Formato custom (-Fc): comprimido y restaurable con pg_restore tabla por tabla
& $pgDump -h localhost -p $cfg.puertoBd -U $usuario -d $cfg.nombreBd -Fc -f $archivo
if ($LASTEXITCODE -ne 0) { throw "pg_dump falló con código $LASTEXITCODE" }

$tamano = [math]::Round((Get-Item $archivo).Length / 1MB, 1)

# Un respaldo que no se puede leer no es un respaldo: se comprueba el archivo
& (Join-Path $raiz "postgres\bin\pg_restore.exe") --list $archivo > $null 2>&1
if ($LASTEXITCODE -ne 0) {
    Remove-Item $archivo -Force
    throw "El respaldo salió corrupto y se descartó. Revisa el espacio en disco."
}

# Retención: se borra lo más viejo que el plazo
$viejos = Get-ChildItem $carpeta -Filter "skynet_crm_*.dump" |
    Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-$diasQueSeGuardan) }
$viejos | Remove-Item -Force
$quedan = (Get-ChildItem $carpeta -Filter "skynet_crm_*.dump").Count

Write-Output "Respaldo listo: $(Split-Path $archivo -Leaf) ($tamano MB). Se conservan $quedan de los últimos $diasQueSeGuardan días."
