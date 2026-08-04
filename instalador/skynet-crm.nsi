; Instalador de Skynet CRM para el servidor de la oficina.
;
; Se compila DESDE macOS o Linux con NSIS:   npm run instalador
; (equivale a:  makensis instalador/skynet-crm.nsi)
;
; Antes hay que correr:  npm run empaquetar
; Produce:               instalador/salida/SkynetCRM-Setup.exe
;
; Por qué NSIS y no Inno Setup: Inno solo compila en Windows, así que había que
; mover el proyecto a otra máquina para generar el .exe. NSIS compila en el
; mismo Mac donde se desarrolla y produce un .exe idéntico en función.
;
; El instalador NO usa Docker: lleva dentro Node y PostgreSQL, así que en el
; servidor del cliente no hay nada que descargar ni ningún requisito previo.

Unicode true

!include "MUI2.nsh"
!include "nsDialogs.nsh"
!include "LogicLib.nsh"
!include "Sections.nsh"
!include "x64.nsh"
!include "WinVer.nsh"
!include "FileFunc.nsh"

!define NOMBRE      "Skynet CRM"
!ifndef VERSION
  !define VERSION   "1.0.0"
!endif
!define EDITOR      "Skynet Lab"
!define PG_VERSION  "16.4"
!define REGKEY      "Software\Microsoft\Windows\CurrentVersion\Uninstall\SkynetCRM"

Name "${NOMBRE}"
Caption "Instalación de ${NOMBRE}"
BrandingText "${EDITOR} · ${NOMBRE} ${VERSION}"
OutFile "salida/SkynetCRM-Setup.exe"
InstallDir "C:\SkynetCRM"
InstallDirRegKey HKLM "${REGKEY}" "InstallLocation"

; Instala servicios de Windows y tareas programadas: requiere administrador.
RequestExecutionLevel admin

; El paquete ronda los 450 MB; la compresión sólida lo deja en ~200 MB.
SetCompressor /SOLID lzma
SetCompressorDictSize 64

VIProductVersion "1.0.0.0"
VIAddVersionKey /LANG=1034 "ProductName"     "${NOMBRE}"
VIAddVersionKey /LANG=1034 "CompanyName"     "${EDITOR}"
VIAddVersionKey /LANG=1034 "FileDescription" "Instalador de ${NOMBRE}"
VIAddVersionKey /LANG=1034 "FileVersion"     "${VERSION}"
VIAddVersionKey /LANG=1034 "LegalCopyright"  "${EDITOR}"

; ── Variables del asistente ──────────────────────────────────────────────────

Var Dialogo
Var PuertoApp
Var PuertoBd
Var ClaveBd
Var CorreoGerente
Var ClaveGerente
Var CarpetaDatos
Var DireccionAcceso

Var CtlPuertoApp
Var CtlPuertoBd
Var CtlClaveBd
Var CtlClaveBd2
Var CtlCorreo
Var CtlClaveGte
Var CtlClaveGte2
Var CtlCarpetaDatos

; ── Apariencia ───────────────────────────────────────────────────────────────

!define MUI_ABORTWARNING
!define MUI_ABORTWARNING_TEXT "¿Seguro que quieres cancelar la instalación de ${NOMBRE}?"
!define MUI_ICON   "recursos/skynet.ico"
!define MUI_UNICON "recursos/skynet.ico"

!define MUI_WELCOMEPAGE_TITLE "Instalación de ${NOMBRE}"
!define MUI_WELCOMEPAGE_TEXT  "Este asistente deja el servidor de la oficina listo para trabajar.$\r$\n$\r$\nInstala el sistema, su base de datos PostgreSQL ${PG_VERSION} y el panel de administración. No necesitas instalar nada antes: Node y PostgreSQL vienen dentro de este instalador.$\r$\n$\r$\nLos usuarios entrarán después desde el navegador de sus computadoras, sin instalar nada en ellas.$\r$\n$\r$\nPulsa Siguiente para continuar."

!define MUI_DIRECTORYPAGE_TEXT_TOP "Aquí se instala el programa. Los datos de la firma (base de datos y respaldos) se guardan en otra carpeta, que eliges más adelante."
!define MUI_DIRECTORYPAGE_TEXT_DESTINATION "Carpeta del programa"

!define MUI_FINISHPAGE_TITLE "${NOMBRE} quedó instalado"
!define MUI_FINISHPAGE_RUN
!define MUI_FINISHPAGE_RUN_TEXT "Abrir el sistema en el navegador"
!define MUI_FINISHPAGE_RUN_FUNCTION AbrirNavegador
!define MUI_FINISHPAGE_SHOWREADME
!define MUI_FINISHPAGE_SHOWREADME_TEXT "Abrir el panel de administración (junto al reloj)"
!define MUI_FINISHPAGE_SHOWREADME_FUNCTION AbrirPanel

; ── Páginas ──────────────────────────────────────────────────────────────────

!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_COMPONENTS
!insertmacro MUI_PAGE_DIRECTORY
Page custom PaginaConfig   PaginaConfigSalir
Page custom PaginaGerente  PaginaGerenteSalir
Page custom PaginaDatos    PaginaDatosSalir
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH

!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES

!insertmacro MUI_LANGUAGE "Spanish"

; ── Tipos de instalación ─────────────────────────────────────────────────────

InstType "Instalación completa (recomendada)"
InstType "Solo el sistema (este servidor ya tiene PostgreSQL)"

; ── Secciones ────────────────────────────────────────────────────────────────

; Cuando esto es una ACTUALIZACIÓN, el sistema está corriendo y Windows no deja
; sobrescribir un node.exe en uso ni la DLL del motor de Prisma que tiene
; cargada: unos archivos se reemplazarían y otros no, dejando la instalación
; mezclada entre dos versiones. Hay que detenerlo ANTES de copiar nada.
Section "-Detener el sistema" SEC_DETENER
  ReadRegStr $R9 HKLM "${REGKEY}" "InstallLocation"
  ${If} $R9 != ""
    DetailPrint "Deteniendo el sistema instalado antes de reemplazar archivos..."
    SetOutPath "$PLUGINSDIR"
    File "recursos/detener.ps1"
    nsExec::ExecToLog 'powershell.exe -ExecutionPolicy Bypass -NoProfile -File "$PLUGINSDIR\detener.ps1" -Raiz "$R9"'
    Pop $0
    ${If} $0 != 0
      MessageBox MB_ICONSTOP|MB_OK \
        "No se pudo detener ${NOMBRE}, que está funcionando en este servidor.$\r$\n$\r$\nSi se copiaran los archivos ahora, la instalación quedaría a medias entre dos versiones.$\r$\n$\r$\nDetenlo desde el panel de la bandeja (clic derecho sobre el icono → Detener) y vuelve a ejecutar este instalador."
      Abort "Actualización cancelada: el sistema sigue funcionando con la versión anterior."
    ${EndIf}
  ${EndIf}
SectionEnd

Section "Sistema ${NOMBRE}" SEC_SISTEMA
  SectionIn 1 2 RO
  SetOutPath "$INSTDIR"
  File "/oname=version.json" "../dist/windows/version.json"
  File "/oname=skynet.ico"   "../dist/windows/skynet.ico"
  File "../dist/windows/iniciar-servidor.cmd"

  SetOutPath "$INSTDIR\app"
  File /r "../dist/windows/app/*"

  SetOutPath "$INSTDIR\prisma"
  File /r "../dist/windows/prisma/*"

  SetOutPath "$INSTDIR\node_modules"
  File /r "../dist/windows/node_modules/*"

  SetOutPath "$INSTDIR\semillas"
  File /r "../dist/windows/semillas/*"

  SetOutPath "$INSTDIR\instalador"
  File /r "../dist/windows/instalador/*"

  ; El servidor no instala Node: va dentro del paquete.
  SetOutPath "$INSTDIR\node"
  File /r "../dist/windows/node/*"

  SetOutPath "$INSTDIR\documentacion"
  File "../MIGRACIONES.md"

  CreateDirectory "$INSTDIR\logs"
  CreateDirectory "$INSTDIR\config"
SectionEnd

Section "Base de datos PostgreSQL ${PG_VERSION}" SEC_BD
  SectionIn 1
  SetOutPath "$INSTDIR\postgres"
  File /r "../dist/windows/postgres/*"

  ; PostgreSQL para Windows depende del runtime de Visual C++: sin él initdb
  ; falla con un error de DLL que no orienta a nadie.
  SetOutPath "$PLUGINSDIR"
  File "../dist/windows/vc_redist.x64.exe"
  DetailPrint "Instalando el runtime de Visual C++ que necesita PostgreSQL..."
  nsExec::ExecToLog '"$PLUGINSDIR\vc_redist.x64.exe" /install /quiet /norestart'
  Pop $0
SectionEnd

Section "Panel de administración en la bandeja" SEC_PANEL
  SectionIn 1 2
  CreateDirectory "$SMPROGRAMS\${NOMBRE}"
  CreateShortcut "$SMPROGRAMS\${NOMBRE}\Panel de ${NOMBRE}.lnk" \
    "powershell.exe" \
    '-ExecutionPolicy Bypass -WindowStyle Hidden -File "$INSTDIR\instalador\bandeja.ps1"' \
    "$INSTDIR\skynet.ico"
SectionEnd

Section "Abrir el panel al iniciar Windows" SEC_INICIO
  SectionIn 1 2
  CreateShortcut "$SMSTARTUP\Panel de ${NOMBRE}.lnk" \
    "powershell.exe" \
    '-ExecutionPolicy Bypass -WindowStyle Hidden -File "$INSTDIR\instalador\bandeja.ps1"' \
    "$INSTDIR\skynet.ico"
SectionEnd

Section "Respaldo automático diario" SEC_RESPALDOS
  SectionIn 1 2
SectionEnd

Section "Abrir el puerto en el firewall (red local)" SEC_FIREWALL
  SectionIn 1 2
SectionEnd

Section /o "Cargar datos de demostración" SEC_DEMO
SectionEnd

; Sección oculta: hace el trabajo de verdad una vez copiados los archivos.
Section "-Configurar" SEC_CONFIG
  DetailPrint "Preparando la base de datos y arrancando el sistema."
  DetailPrint "Esto tarda unos minutos. No cierres esta ventana."

  ; Las dos contraseñas viajan por variables de entorno, NO por la línea de
  ; comandos: cualquier usuario del servidor puede leer la línea de comandos de
  ; un proceso ajeno (Administrador de tareas, Get-CimInstance Win32_Process),
  ; y ahí quedarían la clave de la base y la del Gerente en texto plano.
  ; Además así no hay que escapar comillas ni $ dentro de la contraseña.
  ; El plugin System solo sabe leer los registros $0-$9 / $R0-$R9 (r0-r19), no
  ; las variables con nombre: por eso se copian antes.
  StrCpy $1 $ClaveBd
  StrCpy $2 $ClaveGerente
  System::Call 'kernel32::SetEnvironmentVariable(t "SKYNET_CLAVE_BD", t r1)i.r0'
  System::Call 'kernel32::SetEnvironmentVariable(t "SKYNET_CLAVE_GERENTE", t r2)i.r0'
  StrCpy $1 ""
  StrCpy $2 ""

  StrCpy $R0 '-Raiz "$INSTDIR" -Puerto $PuertoApp -PuertoBd $PuertoBd'
  StrCpy $R0 '$R0 -CarpetaDatos "$CarpetaDatos"'
  StrCpy $R0 '$R0 -CorreoGerente "$CorreoGerente"'

  ${If} ${SectionIsSelected} ${SEC_FIREWALL}
    StrCpy $R0 "$R0 -AbrirFirewall"
  ${EndIf}
  ${If} ${SectionIsSelected} ${SEC_DEMO}
    StrCpy $R0 "$R0 -CargarDemo"
  ${EndIf}
  ${IfNot} ${SectionIsSelected} ${SEC_RESPALDOS}
    StrCpy $R0 "$R0 -SinRespaldos"
  ${EndIf}

  nsExec::ExecToLog 'powershell.exe -ExecutionPolicy Bypass -NoProfile -File "$INSTDIR\instalador\configurar.ps1" $R0'
  Pop $0

  ; Las contraseñas no siguen vivas en el entorno del instalador más de lo
  ; imprescindible.
  System::Call 'kernel32::SetEnvironmentVariable(t "SKYNET_CLAVE_BD", i 0)i.r1'
  System::Call 'kernel32::SetEnvironmentVariable(t "SKYNET_CLAVE_GERENTE", i 0)i.r1'

  ${If} $0 != 0
    DetailPrint "La configuración terminó con errores (código $0)."
    MessageBox MB_ICONEXCLAMATION|MB_OK \
      "Los archivos se copiaron, pero la configuración del servidor no terminó bien.$\r$\n$\r$\nRevisa el detalle en esta misma ventana (botón «Mostrar detalles») y el archivo:$\r$\n$INSTDIR\logs\servidor.log$\r$\n$\r$\nPuedes reintentar sin reinstalar: abre PowerShell como administrador y ejecuta$\r$\n$INSTDIR\instalador\configurar.ps1"
  ${Else}
    ; configurar.ps1 deja aquí la dirección que deben usar los usuarios.
    ${If} ${FileExists} "$INSTDIR\config\acceso.txt"
      FileOpen $1 "$INSTDIR\config\acceso.txt" r
      FileRead $1 $DireccionAcceso
      FileClose $1
    ${EndIf}
    ${If} $DireccionAcceso == ""
      StrCpy $DireccionAcceso "http://localhost:$PuertoApp"
    ${EndIf}
    MessageBox MB_ICONINFORMATION|MB_OK \
      "${NOMBRE} está funcionando.$\r$\n$\r$\nLos usuarios de la oficina entran desde su navegador a:$\r$\n$\r$\n     $DireccionAcceso$\r$\n$\r$\nEntra la primera vez con el correo del Gerente que escribiste."
  ${EndIf}
SectionEnd

Section "-Registro" SEC_REGISTRO
  WriteUninstaller "$INSTDIR\Desinstalar.exe"

  ${If} $DireccionAcceso == ""
    StrCpy $DireccionAcceso "http://localhost:$PuertoApp"
  ${EndIf}

  CreateDirectory "$SMPROGRAMS\${NOMBRE}"
  ; Un acceso a una dirección web es un .url, no un .lnk: el .lnk espera una ruta
  ; de disco y Windows lo dejaría roto.
  FileOpen $3 "$SMPROGRAMS\${NOMBRE}\Abrir el sistema.url" w
  FileWrite $3 "[InternetShortcut]$\r$\nURL=$DireccionAcceso$\r$\n"
  FileClose $3
  CreateShortcut "$SMPROGRAMS\${NOMBRE}\Carpeta de respaldos.lnk" "$CarpetaDatos\respaldos"
  CreateShortcut "$SMPROGRAMS\${NOMBRE}\Desinstalar ${NOMBRE}.lnk" "$INSTDIR\Desinstalar.exe"

  WriteRegStr HKLM "${REGKEY}" "DisplayName"     "${NOMBRE}"
  WriteRegStr HKLM "${REGKEY}" "DisplayVersion"  "${VERSION}"
  WriteRegStr HKLM "${REGKEY}" "Publisher"       "${EDITOR}"
  WriteRegStr HKLM "${REGKEY}" "DisplayIcon"     "$INSTDIR\skynet.ico"
  WriteRegStr HKLM "${REGKEY}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKLM "${REGKEY}" "UninstallString" '"$INSTDIR\Desinstalar.exe"'
  ; Los lee .onInit en la próxima actualización para no proponer otra carpeta de
  ; datos ni otros puertos.
  WriteRegStr HKLM "${REGKEY}" "DataLocation" "$CarpetaDatos"
  WriteRegStr HKLM "${REGKEY}" "Puerto"       "$PuertoApp"
  WriteRegStr HKLM "${REGKEY}" "PuertoBd"     "$PuertoBd"
  WriteRegDWORD HKLM "${REGKEY}" "NoModify" 1
  WriteRegDWORD HKLM "${REGKEY}" "NoRepair" 1

  ${GetSize} "$INSTDIR" "/S=0K" $0 $1 $2
  IntFmt $0 "0x%08X" $0
  WriteRegDWORD HKLM "${REGKEY}" "EstimatedSize" "$0"
SectionEnd

; ── Descripciones de los componentes ─────────────────────────────────────────

!insertmacro MUI_FUNCTION_DESCRIPTION_BEGIN
  !insertmacro MUI_DESCRIPTION_TEXT ${SEC_SISTEMA} \
    "El programa y el runtime de Node que lo ejecuta. Imprescindible."
  !insertmacro MUI_DESCRIPTION_TEXT ${SEC_BD} \
    "PostgreSQL, donde se guardan los clientes, obligaciones y facturación. Desmárcalo solo si este servidor ya tiene un PostgreSQL que vas a reutilizar."
  !insertmacro MUI_DESCRIPTION_TEXT ${SEC_PANEL} \
    "Un icono junto al reloj para ver el estado, iniciar o detener el sistema, respaldar y copiar la dirección de acceso."
  !insertmacro MUI_DESCRIPTION_TEXT ${SEC_INICIO} \
    "El panel aparece solo cada vez que alguien entra a Windows en este servidor."
  !insertmacro MUI_DESCRIPTION_TEXT ${SEC_RESPALDOS} \
    "Copia de seguridad todos los días a las 10:00 p.m., conservando los últimos 30 días."
  !insertmacro MUI_DESCRIPTION_TEXT ${SEC_FIREWALL} \
    "Permite que las demás computadoras de la oficina entren al sistema. Se abre solo en redes privadas y de dominio, nunca en redes públicas."
  !insertmacro MUI_DESCRIPTION_TEXT ${SEC_DEMO} \
    "Carga clientes y obligaciones de ejemplo para probar el sistema. NO lo marques en una instalación real."
!insertmacro MUI_FUNCTION_DESCRIPTION_END

; ── Arranque ─────────────────────────────────────────────────────────────────

Function .onInit
  ; Los accesos directos son del servidor, no de quien instala: van al menú y al
  ; arranque de TODOS los usuarios.
  SetShellVarContext all

  ; La sección de la base de datos extrae ahí el runtime de Visual C++.
  InitPluginsDir

  ${IfNot} ${RunningX64}
    MessageBox MB_ICONSTOP|MB_OK "${NOMBRE} necesita un Windows de 64 bits.$\r$\nEste equipo es de 32 bits."
    Abort
  ${EndIf}
  ${IfNot} ${AtLeastWin10}
    MessageBox MB_ICONEXCLAMATION|MB_YESNO \
      "Este servidor tiene una versión de Windows anterior a Windows 10 / Server 2016.$\r$\nNo está probada. ¿Continuar de todas formas?" \
      IDYES +2
    Abort
  ${EndIf}

  ; Valores propuestos.
  StrCpy $PuertoApp "3000"
  ; 5433 y no 5432: si el servidor ya tiene otro PostgreSQL, no chocan.
  StrCpy $PuertoBd "5433"
  StrCpy $CarpetaDatos "C:\SkynetCRM-datos"

  ; Si ya hay una instalación, se recuperan SUS valores, no los propuestos.
  ; Esto es lo que evita el peor accidente posible al actualizar: si el
  ; administrador puso los datos en D:\ y la actualización volviera al C:\ por
  ; defecto, initdb crearía una base nueva y VACÍA, y la contabilidad de la
  ; firma parecería haber desaparecido.
  ReadRegStr $0 HKLM "${REGKEY}" "InstallLocation"
  ${If} $0 != ""
    ReadRegStr $1 HKLM "${REGKEY}" "DataLocation"
    ${If} $1 != ""
      StrCpy $CarpetaDatos $1
    ${EndIf}
    ReadRegStr $1 HKLM "${REGKEY}" "Puerto"
    ${If} $1 != ""
      StrCpy $PuertoApp $1
    ${EndIf}
    ReadRegStr $1 HKLM "${REGKEY}" "PuertoBd"
    ${If} $1 != ""
      StrCpy $PuertoBd $1
    ${EndIf}

    MessageBox MB_ICONINFORMATION|MB_OK \
      "Ya hay una instalación de ${NOMBRE} en:$\r$\n$0$\r$\n$\r$\nEste asistente la actualizará. Los datos NO se borran: las migraciones se aplican solas y la información existente se conserva.$\r$\n$\r$\nLos puertos y la carpeta de datos vienen ya rellenados con los de la instalación actual. Déjalos como están: cambiar la carpeta de datos haría que el sistema arrancara con una base vacía.$\r$\n$\r$\nLa contraseña de la base debe ser la MISMA de antes.$\r$\n$\r$\nAun así, conviene respaldar antes desde el panel de la bandeja."
  ${EndIf}
FunctionEnd

; ── Página: configuración del servidor ───────────────────────────────────────

Function PaginaConfig
  !insertmacro MUI_HEADER_TEXT "Configuración del servidor" \
    "Cómo entran los usuarios y cómo se protege la base de datos."

  nsDialogs::Create 1018
  Pop $Dialogo
  ${If} $Dialogo == error
    Abort
  ${EndIf}

  ${NSD_CreateLabel} 0 0 100% 24u \
    "Puedes dejar los valores propuestos si no tienes un motivo para cambiarlos. La contraseña de la base de datos la usa solo el programa: no la tendrás que escribir a diario."
  Pop $0

  ${NSD_CreateLabel} 0 32u 45% 12u "Puerto del sistema (por él entran los usuarios):"
  Pop $0
  ${NSD_CreateNumber} 47% 30u 20% 12u "$PuertoApp"
  Pop $CtlPuertoApp

  ${NSD_CreateLabel} 0 50u 45% 12u "Puerto de la base de datos:"
  Pop $0
  ${NSD_CreateNumber} 47% 48u 20% 12u "$PuertoBd"
  Pop $CtlPuertoBd

  ${NSD_CreateLabel} 0 74u 45% 12u "Contraseña de la base de datos:"
  Pop $0
  ${NSD_CreatePassword} 47% 72u 50% 12u "$ClaveBd"
  Pop $CtlClaveBd

  ${NSD_CreateLabel} 0 92u 45% 12u "Repetir la contraseña:"
  Pop $0
  ${NSD_CreatePassword} 47% 90u 50% 12u "$ClaveBd"
  Pop $CtlClaveBd2

  ${NSD_CreateLabel} 0 110u 100% 12u "Mínimo 8 caracteres."
  Pop $0

  nsDialogs::Show
FunctionEnd

Function PaginaConfigSalir
  ${NSD_GetText} $CtlPuertoApp $PuertoApp
  ${NSD_GetText} $CtlPuertoBd  $PuertoBd
  ${NSD_GetText} $CtlClaveBd   $ClaveBd
  ${NSD_GetText} $CtlClaveBd2  $R1

  Push $PuertoApp
  Call EsNumero
  Pop $R2
  Push $PuertoBd
  Call EsNumero
  Pop $R3
  ${If} $R2 == 0
  ${OrIf} $R3 == 0
    MessageBox MB_ICONEXCLAMATION|MB_OK "Los puertos deben ser números."
    Abort
  ${EndIf}

  ${If} $PuertoApp < 1024
  ${OrIf} $PuertoApp > 65535
  ${OrIf} $PuertoBd < 1024
  ${OrIf} $PuertoBd > 65535
    MessageBox MB_ICONEXCLAMATION|MB_OK "Los puertos deben estar entre 1024 y 65535."
    Abort
  ${EndIf}

  ${If} $PuertoApp == $PuertoBd
    MessageBox MB_ICONEXCLAMATION|MB_OK "El sistema y la base de datos no pueden usar el mismo puerto."
    Abort
  ${EndIf}

  StrLen $R2 $ClaveBd
  ${If} $R2 < 8
    MessageBox MB_ICONEXCLAMATION|MB_OK "La contraseña de la base de datos debe tener al menos 8 caracteres."
    Abort
  ${EndIf}

  ; S!= y no !=: la comparación normal de NSIS ignora mayúsculas, y dos
  ; contraseñas que solo difieren en eso NO son la misma contraseña.
  ${If} $ClaveBd S!= $R1
    MessageBox MB_ICONEXCLAMATION|MB_OK "Las dos contraseñas no coinciden."
    Abort
  ${EndIf}
FunctionEnd

; ── Página: usuario Gerente ──────────────────────────────────────────────────

Function PaginaGerente
  !insertmacro MUI_HEADER_TEXT "Usuario Gerente" \
    "La primera cuenta del sistema, con acceso a todo."

  nsDialogs::Create 1018
  Pop $Dialogo
  ${If} $Dialogo == error
    Abort
  ${EndIf}

  ${NSD_CreateLabel} 0 0 100% 24u \
    "Con estos datos entrará el gerente la primera vez. Después, desde el propio sistema, se crean las cuentas de los supervisores y analistas."
  Pop $0

  ${NSD_CreateLabel} 0 32u 30% 12u "Correo del gerente:"
  Pop $0
  ${NSD_CreateText} 32% 30u 66% 12u "$CorreoGerente"
  Pop $CtlCorreo

  ${NSD_CreateLabel} 0 52u 30% 12u "Contraseña:"
  Pop $0
  ${NSD_CreatePassword} 32% 50u 66% 12u "$ClaveGerente"
  Pop $CtlClaveGte

  ${NSD_CreateLabel} 0 72u 30% 12u "Repetir la contraseña:"
  Pop $0
  ${NSD_CreatePassword} 32% 70u 66% 12u "$ClaveGerente"
  Pop $CtlClaveGte2

  ${NSD_CreateLabel} 0 92u 100% 24u \
    "Mínimo 8 caracteres. Anótala: no hay forma de recuperarla desde el propio sistema."
  Pop $0

  nsDialogs::Show
FunctionEnd

Function PaginaGerenteSalir
  ${NSD_GetText} $CtlCorreo    $CorreoGerente
  ${NSD_GetText} $CtlClaveGte  $ClaveGerente
  ${NSD_GetText} $CtlClaveGte2 $R1

  Push $CorreoGerente
  Push "@"
  Call Contiene
  Pop $R2
  Push $CorreoGerente
  Push "."
  Call Contiene
  Pop $R3
  ${If} $R2 == 0
  ${OrIf} $R3 == 0
    MessageBox MB_ICONEXCLAMATION|MB_OK "Escribe un correo válido para el gerente."
    Abort
  ${EndIf}

  StrLen $R2 $ClaveGerente
  ${If} $R2 < 8
    MessageBox MB_ICONEXCLAMATION|MB_OK "La contraseña del gerente debe tener al menos 8 caracteres."
    Abort
  ${EndIf}

  ${If} $ClaveGerente S!= $R1
    MessageBox MB_ICONEXCLAMATION|MB_OK "Las dos contraseñas no coinciden."
    Abort
  ${EndIf}
FunctionEnd

; ── Página: carpeta de datos ─────────────────────────────────────────────────

Function PaginaDatos
  !insertmacro MUI_HEADER_TEXT "Carpeta de datos" \
    "Dónde viven la base de datos y los respaldos."

  nsDialogs::Create 1018
  Pop $Dialogo
  ${If} $Dialogo == error
    Abort
  ${EndIf}

  ${NSD_CreateLabel} 0 0 100% 32u \
    "Conviene que esté en un disco con espacio y, si es posible, distinto al del sistema operativo: si Windows falla, los datos de la firma siguen intactos.$\r$\nAl desinstalar, esta carpeta NO se borra."
  Pop $0

  ${NSD_CreateDirRequest} 0 40u 80% 12u "$CarpetaDatos"
  Pop $CtlCarpetaDatos

  ${NSD_CreateBrowseButton} 82% 40u 18% 12u "Examinar..."
  Pop $0
  ${NSD_OnClick} $0 ElegirCarpetaDatos

  nsDialogs::Show
FunctionEnd

Function ElegirCarpetaDatos
  ${NSD_GetText} $CtlCarpetaDatos $0
  nsDialogs::SelectFolderDialog "Carpeta donde se guardan la base de datos y los respaldos" "$0"
  Pop $1
  ${If} $1 != error
    ${NSD_SetText} $CtlCarpetaDatos "$1"
  ${EndIf}
FunctionEnd

Function PaginaDatosSalir
  ${NSD_GetText} $CtlCarpetaDatos $CarpetaDatos
  ${If} $CarpetaDatos == ""
    MessageBox MB_ICONEXCLAMATION|MB_OK "Indica una carpeta para los datos."
    Abort
  ${EndIf}
FunctionEnd

; ── Acciones de la página final ──────────────────────────────────────────────

Function AbrirNavegador
  ExecShell "open" "$DireccionAcceso"
FunctionEnd

Function AbrirPanel
  Exec 'powershell.exe -ExecutionPolicy Bypass -WindowStyle Hidden -File "$INSTDIR\instalador\bandeja.ps1"'
FunctionEnd

; ── Utilidades ───────────────────────────────────────────────────────────────

; Devuelve 1 si la cadena está formada solo por dígitos, 0 si no.
Function EsNumero
  Exch $R0
  Push $R1
  Push $R2
  Push $R3
  Push $R4
  StrLen $R3 $R0
  ${If} $R3 == 0
    StrCpy $R0 0
    Goto fin
  ${EndIf}
  StrCpy $R1 0
  bucle:
    StrCpy $R2 $R0 1 $R1
    ; Un carácter es dígito si al convertirlo a entero y de vuelta a texto
    ; sigue siendo el mismo carácter ("a" se convierte en 0, "5" en 5).
    IntOp $R2 $R2 + 0
    StrCpy $R4 $R0 1 $R1
    ${If} $R2 != $R4
      StrCpy $R0 0
      Goto fin
    ${EndIf}
    IntOp $R1 $R1 + 1
    ${If} $R1 < $R3
      Goto bucle
    ${EndIf}
  StrCpy $R0 1
  fin:
  Pop $R4
  Pop $R3
  Pop $R2
  Pop $R1
  Exch $R0
FunctionEnd

; Devuelve 1 si la cadena (abajo en la pila) contiene el carácter (arriba).
Function Contiene
  Exch $R0        ; carácter buscado
  Exch
  Exch $R1        ; cadena
  Push $R2
  Push $R3
  Push $R4
  Push $R5
  StrLen $R3 $R1
  StrCpy $R2 0
  StrCpy $R4 0
  ${If} $R3 == 0
    Goto fin
  ${EndIf}
  bucle:
    StrCpy $R5 $R1 1 $R2
    ${If} $R5 == $R0
      StrCpy $R4 1
      Goto fin
    ${EndIf}
    IntOp $R2 $R2 + 1
    ${If} $R2 < $R3
      Goto bucle
    ${EndIf}
  fin:
  StrCpy $R0 $R4
  Pop $R5
  Pop $R4
  Pop $R3
  Pop $R2
  Pop $R1
  Exch $R0
FunctionEnd

; ── Desinstalación ───────────────────────────────────────────────────────────

Function un.onInit
  SetShellVarContext all
FunctionEnd

Section "Uninstall"
  ; Detiene la tarea del servidor, el servicio de PostgreSQL y borra las tareas
  ; programadas. La carpeta de datos NO se toca: la contabilidad de los clientes
  ; de la firma no se borra porque alguien desinstaló un programa.
  nsExec::ExecToLog 'powershell.exe -ExecutionPolicy Bypass -NoProfile -File "$INSTDIR\instalador\desinstalar.ps1" -Raiz "$INSTDIR"'
  Pop $0

  Delete "$SMPROGRAMS\${NOMBRE}\Panel de ${NOMBRE}.lnk"
  Delete "$SMPROGRAMS\${NOMBRE}\Abrir el sistema.url"
  Delete "$SMPROGRAMS\${NOMBRE}\Carpeta de respaldos.lnk"
  Delete "$SMPROGRAMS\${NOMBRE}\Desinstalar ${NOMBRE}.lnk"
  RMDir  "$SMPROGRAMS\${NOMBRE}"
  Delete "$SMSTARTUP\Panel de ${NOMBRE}.lnk"

  RMDir /r "$INSTDIR\app"
  RMDir /r "$INSTDIR\node"
  RMDir /r "$INSTDIR\postgres"
  RMDir /r "$INSTDIR\node_modules"
  RMDir /r "$INSTDIR\prisma"
  RMDir /r "$INSTDIR\semillas"
  RMDir /r "$INSTDIR\instalador"
  RMDir /r "$INSTDIR\documentacion"
  RMDir /r "$INSTDIR\logs"
  RMDir /r "$INSTDIR\config"
  Delete "$INSTDIR\iniciar-servidor.cmd"
  Delete "$INSTDIR\version.json"
  Delete "$INSTDIR\skynet.ico"
  Delete "$INSTDIR\.env"
  Delete "$INSTDIR\Desinstalar.exe"
  RMDir "$INSTDIR"

  DeleteRegKey HKLM "${REGKEY}"

  MessageBox MB_ICONINFORMATION|MB_OK \
    "${NOMBRE} se desinstaló.$\r$\n$\r$\nLa carpeta de datos y los respaldos NO se borraron. Si de verdad quieres eliminarlos, hazlo a mano."
SectionEnd
