; Actualizador de Skynet CRM: reemplaza la aplicación de un servidor que YA
; tiene el sistema instalado.
;
; Se compila desde macOS o Linux:   npm run actualizador
; Antes hay que correr:             npm run actualizacion
; Produce:                          instalador/salida/SkynetCRM-Actualizar.exe
;
; POR QUÉ EXISTE, SI EL INSTALADOR COMPLETO YA SABE ACTUALIZAR
;
; Porque el instalador completo pesa ~450 MB comprimidos y tres cuartas partes
; son Node y PostgreSQL, que no cambian entre versiones del CRM. Este paquete
; lleva solo la aplicación. Además no pregunta nada: las credenciales salen del
; .env instalado, así que el técnico no necesita recordar la contraseña de la
; base del día de la instalación.
;
; Todo el trabajo delicado —respaldar, detener, apartar, migrar, arrancar y
; deshacer si algo falla— vive en instalador/recursos/actualizar.ps1. Este guion
; solo extrae los archivos y lo llama.

Unicode true

!include "MUI2.nsh"
!include "LogicLib.nsh"
!include "x64.nsh"
!include "FileFunc.nsh"

!define NOMBRE  "Skynet CRM"
!ifndef VERSION
  !define VERSION "1.0.0"
!endif
!define EDITOR  "Skynet Lab"
!define REGKEY  "Software\Microsoft\Windows\CurrentVersion\Uninstall\SkynetCRM"

Name "${NOMBRE} — Actualización"
Caption "Actualizar ${NOMBRE} a la versión ${VERSION}"
BrandingText "${EDITOR} · Actualización ${VERSION}"
OutFile "salida/SkynetCRM-Actualizar.exe"

; La carpeta NO la elige el usuario: es donde ya está instalado el sistema.
; Ponerla a mano es la forma más fácil de dejar dos instalaciones a medias.
InstallDir "C:\SkynetCRM"
InstallDirRegKey HKLM "${REGKEY}" "InstallLocation"

; Detiene tareas programadas y escribe en Archivos de programa: requiere admin.
RequestExecutionLevel admin

SetCompressor /SOLID lzma
SetCompressorDictSize 64

VIProductVersion "1.0.0.0"
VIAddVersionKey /LANG=1034 "ProductName"     "${NOMBRE}"
VIAddVersionKey /LANG=1034 "CompanyName"     "${EDITOR}"
VIAddVersionKey /LANG=1034 "FileDescription" "Actualización de ${NOMBRE}"
VIAddVersionKey /LANG=1034 "FileVersion"     "${VERSION}"
VIAddVersionKey /LANG=1034 "LegalCopyright"  "${EDITOR}"

Var Instalada

; ── Páginas ──────────────────────────────────────────────────────────────────

!define MUI_ICON "recursos\skynet.ico"
!define MUI_ABORTWARNING

!define MUI_WELCOMEPAGE_TITLE "Actualizar ${NOMBRE}"
!define MUI_WELCOMEPAGE_TEXT "Este asistente actualiza ${NOMBRE} a la versión ${VERSION}.$\r$\n$\r$\nQué hace, en este orden:$\r$\n$\r$\n    1. Respalda la base de datos y comprueba que el respaldo se pueda leer.$\r$\n    2. Detiene el sistema y espera a que termine de verdad.$\r$\n    3. Reemplaza la aplicación.$\r$\n    4. Aplica las migraciones que falten.$\r$\n    5. Lo vuelve a arrancar y comprueba que responda.$\r$\n$\r$\nSi algo falla, deja la versión anterior funcionando.$\r$\n$\r$\nLos datos, la configuración y la licencia NO se tocan. No hace falta la contraseña de la base: se lee de la instalación.$\r$\n$\r$\nLos usuarios estarán sin servicio unos minutos. Conviene avisarles antes."
!insertmacro MUI_PAGE_WELCOME

!define MUI_PAGE_HEADER_TEXT "Actualizando"
!define MUI_PAGE_HEADER_SUBTEXT "No cierres esta ventana."
!define MUI_INSTFILESPAGE_FINISHHEADER_TEXT "Actualización terminada"
!insertmacro MUI_PAGE_INSTFILES

!define MUI_FINISHPAGE_TITLE "${NOMBRE} actualizado"
!define MUI_FINISHPAGE_TEXT "El sistema está funcionando con la versión ${VERSION}.$\r$\n$\r$\nLos usuarios de la oficina pueden seguir trabajando con la misma dirección de siempre. Si tenían el navegador abierto, basta con recargar la página."
!insertmacro MUI_PAGE_FINISH

!insertmacro MUI_LANGUAGE "Spanish"

; ── Comprobaciones ───────────────────────────────────────────────────────────

Function .onInit
  SetShellVarContext all

  ${IfNot} ${RunningX64}
    MessageBox MB_ICONSTOP|MB_OK "${NOMBRE} necesita un Windows de 64 bits."
    Abort
  ${EndIf}

  ; Sin instalación previa esto no tiene nada que actualizar. Se dice claro,
  ; porque el error alternativo (copiar la app suelta en una carpeta vacía) deja
  ; un montón de archivos que no arrancan y nadie sabe por qué.
  ReadRegStr $Instalada HKLM "${REGKEY}" "InstallLocation"
  ${If} $Instalada == ""
    MessageBox MB_ICONSTOP|MB_OK \
      "En este equipo no hay ninguna instalación de ${NOMBRE}.$\r$\n$\r$\nEsta actualización solo sirve para un servidor que ya lo tiene funcionando.$\r$\n$\r$\nPara instalarlo por primera vez usa SkynetCRM-Setup.exe."
    Abort
  ${EndIf}
  StrCpy $INSTDIR $Instalada

  ${IfNot} ${FileExists} "$INSTDIR\config\instalacion.json"
    MessageBox MB_ICONSTOP|MB_OK \
      "Se encontró $INSTDIR en el registro, pero le falta config\instalacion.json.$\r$\n$\r$\nLa instalación está incompleta: usa el instalador completo."
    Abort
  ${EndIf}
FunctionEnd

; ── Actualización ────────────────────────────────────────────────────────────

Section "Actualizar" SEC_ACTUALIZAR
  DetailPrint "Instalación encontrada en $INSTDIR"

  ; Los archivos nuevos se dejan aparte y actualizar.ps1 los mueve a su sitio
  ; cuando el sistema esté detenido. Copiarlos directamente encima es
  ; exactamente el error que este actualizador viene a evitar: Windows no deja
  ; reemplazar un ejecutable en uso y la instalación quedaría a medias.
  DetailPrint "Extrayendo la versión nueva…"
  RMDir /r "$INSTDIR\.actualizacion"

  SetOutPath "$INSTDIR\.actualizacion\app"
  File /r "../dist/actualizacion/app/*"
  SetOutPath "$INSTDIR\.actualizacion\prisma"
  File /r "../dist/actualizacion/prisma/*"
  SetOutPath "$INSTDIR\.actualizacion\semillas"
  File /r "../dist/actualizacion/semillas/*"
  SetOutPath "$INSTDIR\.actualizacion"
  File "../dist/actualizacion/actualizacion.json"

  ; Los dos scripts viajan en el paquete: la instalación del cliente puede ser
  ; anterior a que existieran. No se sobrescribe nada más de instalador\ porque
  ; el panel de la bandeja tiene bandeja.ps1 abierto y Windows lo bloquea.
  SetOutPath "$INSTDIR\instalador"
  File "recursos/actualizar.ps1"
  File "recursos/detener.ps1"

  DetailPrint "Respaldando, deteniendo y actualizando. Esto tarda unos minutos."
  nsExec::ExecToLog 'powershell.exe -ExecutionPolicy Bypass -NoProfile -File "$INSTDIR\instalador\actualizar.ps1" -Raiz "$INSTDIR" -Origen "$INSTDIR\.actualizacion"'
  Pop $0

  ${If} $0 != 0
    ; actualizar.ps1 ya restauró la versión anterior antes de salir con error.
    RMDir /r "$INSTDIR\.actualizacion"
    DetailPrint "La actualización falló con código $0."
    MessageBox MB_ICONEXCLAMATION|MB_OK \
      "La actualización NO se aplicó.$\r$\n$\r$\nEl sistema quedó con la versión anterior, funcionando.$\r$\n$\r$\nEl motivo está en esta ventana (botón «Mostrar detalles»).$\r$\n$\r$\nSi el fallo ocurrió después de aplicar las migraciones, hay que restaurar la base desde el respaldo que se hizo al empezar: está en la carpeta de respaldos, es el .dump más reciente."
    Abort "Actualización cancelada: el sistema sigue con la versión anterior."
  ${EndIf}

  ; La versión que quedó instalada, para que el próximo actualizador la lea.
  WriteRegStr HKLM "${REGKEY}" "DisplayVersion" "${VERSION}"
  DetailPrint "Sistema actualizado a la versión ${VERSION} y funcionando."
SectionEnd
