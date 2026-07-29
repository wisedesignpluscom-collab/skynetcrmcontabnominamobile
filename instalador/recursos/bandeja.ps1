# Panel de Skynet CRM en la bandeja de Windows (junto al reloj).
#
# Se ejecuta en la sesión del administrador del servidor, no es el servidor en
# sí: el sistema corre como tarea programada y sigue funcionando aunque esta
# ventana se cierre. Este panel existe para las veces en que el sistema NO
# funciona, así que no depende de que el servidor esté arriba.
#
# Arranque:  powershell -ExecutionPolicy Bypass -WindowStyle Hidden -File bandeja.ps1

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$ErrorActionPreference = "Stop"
$raiz = Split-Path -Parent $PSScriptRoot
$config = Join-Path $raiz "config\instalacion.json"

if (-not (Test-Path $config)) {
    [System.Windows.Forms.MessageBox]::Show(
        "No se encontró la configuración en:`n$config`n`nVuelve a ejecutar el instalador.",
        "Skynet CRM", "OK", "Error") | Out-Null
    exit 1
}

$cfg = Get-Content $config -Raw | ConvertFrom-Json
$puerto = $cfg.puerto
$tarea = $cfg.tareaServidor
$carpetaRespaldos = $cfg.carpetaRespaldos

# ── Utilidades ──────────────────────────────────────────────────────────────

function Get-DireccionAcceso {
    # La IP de la red local por la que entran los usuarios de la oficina
    $ip = (Get-NetIPAddress -AddressFamily IPv4 |
        Where-Object { $_.InterfaceAlias -notmatch "Loopback" -and $_.IPAddress -notmatch "^169\." } |
        Select-Object -First 1).IPAddress
    if (-not $ip) { $ip = "localhost" }
    return "http://${ip}:$puerto"
}

function Test-ServidorArriba {
    try {
        $r = Invoke-WebRequest -Uri "http://localhost:$puerto/login" -UseBasicParsing -TimeoutSec 3
        return $r.StatusCode -eq 200
    } catch {
        return $false
    }
}

function Test-BaseDeDatos {
    $pgIsReady = Join-Path $raiz "postgres\bin\pg_isready.exe"
    if (-not (Test-Path $pgIsReady)) { return $false }
    & $pgIsReady -h localhost -p $cfg.puertoBd -q 2>$null
    return $LASTEXITCODE -eq 0
}

function Iniciar-Servidor {
    & schtasks /Run /TN $tarea | Out-Null
    Start-Sleep -Seconds 4
}

function Detener-Servidor {
    & schtasks /End /TN $tarea 2>$null | Out-Null
    # La tarea lanza node.exe; al terminarla puede quedar el proceso hijo
    Get-Process node -ErrorAction SilentlyContinue |
        Where-Object { $_.Path -like "$raiz*" } |
        Stop-Process -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 2
}

function Respaldar-Ahora {
    $script = Join-Path $PSScriptRoot "respaldo.ps1"
    $salida = & powershell -ExecutionPolicy Bypass -File $script 2>&1 | Out-String
    return $salida
}

# ── Icono ───────────────────────────────────────────────────────────────────

function New-Icono([string]$color) {
    # Círculo del color del estado, dibujado al vuelo (sin archivos .ico)
    $bmp = New-Object System.Drawing.Bitmap 16, 16
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = "AntiAlias"
    $brocha = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromName($color))
    $g.FillEllipse($brocha, 2, 2, 12, 12)
    $g.Dispose()
    return [System.Drawing.Icon]::FromHandle($bmp.GetHicon())
}

$iconoVerde = New-Icono "SeaGreen"
$iconoRojo = New-Icono "Firebrick"
$iconoGris = New-Icono "Gray"

$bandeja = New-Object System.Windows.Forms.NotifyIcon
$bandeja.Icon = $iconoGris
$bandeja.Text = "Skynet CRM"
$bandeja.Visible = $true

$menu = New-Object System.Windows.Forms.ContextMenuStrip
$bandeja.ContextMenuStrip = $menu

function Add-Item([string]$texto, [scriptblock]$accion) {
    $item = $menu.Items.Add($texto)
    $item.add_Click($accion)
    return $item
}

$itemEstado = Add-Item "Comprobando…" { }
$itemEstado.Enabled = $false
$menu.Items.Add("-") | Out-Null

Add-Item "Abrir el sistema" { Start-Process (Get-DireccionAcceso) } | Out-Null

Add-Item "Copiar la dirección para los usuarios" {
    $d = Get-DireccionAcceso
    Set-Clipboard -Value $d
    $bandeja.ShowBalloonTip(4000, "Skynet CRM",
        "Dirección copiada: $d`nLos usuarios la abren en su navegador.", "Info")
} | Out-Null

$menu.Items.Add("-") | Out-Null

Add-Item "Iniciar el servidor" {
    $bandeja.ShowBalloonTip(3000, "Skynet CRM", "Iniciando…", "Info")
    Iniciar-Servidor
    Actualizar-Estado
} | Out-Null

Add-Item "Detener el servidor" {
    $r = [System.Windows.Forms.MessageBox]::Show(
        "Se detendrá el sistema y los usuarios perderán el acceso.`n`n¿Continuar?",
        "Skynet CRM", "YesNo", "Warning")
    if ($r -eq "Yes") {
        Detener-Servidor
        Actualizar-Estado
    }
} | Out-Null

Add-Item "Reiniciar el servidor" {
    Detener-Servidor
    Iniciar-Servidor
    Actualizar-Estado
} | Out-Null

$menu.Items.Add("-") | Out-Null

Add-Item "Respaldar la base de datos ahora" {
    $bandeja.ShowBalloonTip(3000, "Skynet CRM", "Generando el respaldo…", "Info")
    $salida = Respaldar-Ahora
    $bandeja.ShowBalloonTip(6000, "Skynet CRM", $salida.Trim(), "Info")
} | Out-Null

Add-Item "Abrir la carpeta de respaldos" {
    if (-not (Test-Path $carpetaRespaldos)) { New-Item -ItemType Directory -Path $carpetaRespaldos | Out-Null }
    Start-Process explorer.exe $carpetaRespaldos
} | Out-Null

Add-Item "Ver los datos del equipo (para la licencia)" {
    $lic = Join-Path $raiz "licencia.lic"
    $estado = if (Test-Path $lic) { "Hay un archivo de licencia instalado." }
              else { "Todavía no hay licencia instalada." }
    $placa = (Get-CimInstance Win32_ComputerSystemProduct).UUID
    $disco = (Get-CimInstance Win32_DiskDrive | Sort-Object DeviceID | Select-Object -First 1).SerialNumber
    $red = (Get-NetAdapter | Where-Object Status -eq "Up" | Select-Object -First 1).MacAddress
    $texto = "$estado`n`nDatos de este equipo (envíalos a tu proveedor):`n`n" +
             "Placa: $placa`nDisco: $disco`nRed:   $red"
    Set-Clipboard -Value $texto
    [System.Windows.Forms.MessageBox]::Show(
        "$texto`n`n(Ya se copiaron al portapapeles)", "Skynet CRM - Licencia", "OK", "Information") | Out-Null
} | Out-Null

Add-Item "Ver el registro de errores" {
    $log = Join-Path $raiz "logs\servidor.log"
    if (Test-Path $log) { Start-Process notepad.exe $log }
    else { [System.Windows.Forms.MessageBox]::Show("Todavía no hay registro.", "Skynet CRM") | Out-Null }
} | Out-Null

$menu.Items.Add("-") | Out-Null

Add-Item "Cerrar este panel (el sistema sigue funcionando)" {
    $bandeja.Visible = $false
    [System.Windows.Forms.Application]::Exit()
} | Out-Null

# ── Estado ──────────────────────────────────────────────────────────────────

function Actualizar-Estado {
    $bd = Test-BaseDeDatos
    $app = Test-ServidorArriba

    if ($app -and $bd) {
        $bandeja.Icon = $iconoVerde
        $itemEstado.Text = "● Funcionando · $(Get-DireccionAcceso)"
        $bandeja.Text = "Skynet CRM · funcionando"
    } elseif ($bd -and -not $app) {
        $bandeja.Icon = $iconoRojo
        $itemEstado.Text = "● El sistema está detenido (la base sí responde)"
        $bandeja.Text = "Skynet CRM · detenido"
    } elseif ($app -and -not $bd) {
        $bandeja.Icon = $iconoRojo
        $itemEstado.Text = "● La base de datos no responde"
        $bandeja.Text = "Skynet CRM · base de datos caída"
    } else {
        $bandeja.Icon = $iconoRojo
        $itemEstado.Text = "● Detenido (sistema y base de datos)"
        $bandeja.Text = "Skynet CRM · detenido"
    }
}

# Revisa cada 30 segundos; el icono cambia de color solo
$temporizador = New-Object System.Windows.Forms.Timer
$temporizador.Interval = 30000
$temporizador.add_Tick({ Actualizar-Estado })
$temporizador.Start()

Actualizar-Estado
$bandeja.add_DoubleClick({ Start-Process (Get-DireccionAcceso) })

[System.Windows.Forms.Application]::Run()
$bandeja.Visible = $false
