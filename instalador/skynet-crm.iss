; Instalador de Skynet CRM para el servidor de la oficina.
;
; Compilar con Inno Setup 6:   iscc instalador\skynet-crm.iss
; Antes hay que correr:        npm run empaquetar
;
; Produce instalador\salida\SkynetCRM-Setup.exe

#define AppNombre "Skynet CRM"
#define AppVersion "1.0.0"
#define AppEditor "Skynet Lab"
#define NodeVersion "22.11.0"
#define PgVersion "16.4-1"

[Setup]
AppId={{8F3A1C22-5D7E-4B90-A1F6-9C2E4D8B7A31}
AppName={#AppNombre}
AppVersion={#AppVersion}
AppPublisher={#AppEditor}
DefaultDirName=C:\SkynetCRM
DefaultGroupName={#AppNombre}
DisableProgramGroupPage=yes
OutputDir=salida
OutputBaseFilename=SkynetCRM-Setup
Compression=lzma2/max
SolidCompression=yes
WizardStyle=modern
; El servidor es de 64 bits y los binarios de Node y PostgreSQL también
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
; Instala servicios y escribe en Archivos de programa: requiere administrador
PrivilegesRequired=admin
UninstallDisplayName={#AppNombre}
; Espacio: app + Node + PostgreSQL + margen para los datos
ExtraDiskSpaceRequired=1200000000

[Languages]
Name: "es"; MessagesFile: "compiler:Languages\Spanish.isl"

[Types]
Name: "completa"; Description: "Instalación completa (recomendada)"
Name: "soloapp"; Description: "Solo el sistema (la base de datos ya existe en este servidor)"
Name: "personalizada"; Description: "Personalizada"; Flags: iscustom

[Components]
Name: "sistema"; Description: "Sistema Skynet CRM"; Types: completa soloapp personalizada; Flags: fixed
Name: "basedatos"; Description: "Base de datos PostgreSQL {#PgVersion}"; Types: completa personalizada
Name: "panel"; Description: "Panel de administración en la bandeja"; Types: completa soloapp personalizada
Name: "respaldos"; Description: "Respaldo automático diario"; Types: completa personalizada
Name: "firewall"; Description: "Abrir el puerto en el firewall (red local)"; Types: completa personalizada
Name: "demo"; Description: "Cargar datos de demostración (para probar el sistema)"; Types: personalizada

[Tasks]
Name: "iniciarpanel"; Description: "Abrir el panel de administración al iniciar Windows"; GroupDescription: "Al terminar:"; Components: panel

[Files]
Source: "..\dist\windows\app\*"; DestDir: "{app}\app"; Flags: ignoreversion recursesubdirs createallsubdirs; Components: sistema
Source: "..\dist\windows\prisma\*"; DestDir: "{app}\prisma"; Flags: ignoreversion recursesubdirs createallsubdirs; Components: sistema
Source: "..\dist\windows\node_modules\*"; DestDir: "{app}\node_modules"; Flags: ignoreversion recursesubdirs createallsubdirs; Components: sistema
Source: "..\dist\windows\semillas\*"; DestDir: "{app}\semillas"; Flags: ignoreversion recursesubdirs createallsubdirs; Components: sistema
Source: "..\dist\windows\instalador\*"; DestDir: "{app}\instalador"; Flags: ignoreversion recursesubdirs createallsubdirs; Components: sistema
Source: "..\dist\windows\iniciar-servidor.cmd"; DestDir: "{app}"; Flags: ignoreversion; Components: sistema
Source: "..\dist\windows\version.json"; DestDir: "{app}"; Flags: ignoreversion; Components: sistema
Source: "..\dist\windows\skynet.ico"; DestDir: "{app}"; Flags: ignoreversion; Components: sistema
Source: "..\dist\windows\node\*"; DestDir: "{app}\node"; Flags: ignoreversion recursesubdirs createallsubdirs; Components: sistema
Source: "..\dist\windows\postgres\*"; DestDir: "{app}\postgres"; Flags: ignoreversion recursesubdirs createallsubdirs; Components: basedatos
Source: "..\MIGRACIONES.md"; DestDir: "{app}\documentacion"; Flags: ignoreversion; Components: sistema
; PostgreSQL para Windows depende del runtime de Visual C++; sin él, initdb
; falla con un error de DLL que no dice nada útil.
Source: "..\dist\windows\vc_redist.x64.exe"; DestDir: "{tmp}"; Flags: deleteafterinstall; Components: basedatos

[Icons]
Name: "{group}\Panel de {#AppNombre}"; Filename: "powershell.exe"; \
  Parameters: "-ExecutionPolicy Bypass -WindowStyle Hidden -File ""{app}\instalador\bandeja.ps1"""; \
  IconFilename: "{app}\skynet.ico"; Components: panel
Name: "{group}\Abrir el sistema"; Filename: "http://localhost:{code:PuertoElegido}/"
Name: "{group}\Carpeta de respaldos"; Filename: "{code:CarpetaDatosElegida}\respaldos"; Components: respaldos
Name: "{group}\Desinstalar {#AppNombre}"; Filename: "{uninstallexe}"
Name: "{commonstartup}\Panel de {#AppNombre}"; Filename: "powershell.exe"; \
  Parameters: "-ExecutionPolicy Bypass -WindowStyle Hidden -File ""{app}\instalador\bandeja.ps1"""; \
  Tasks: iniciarpanel

[Run]
Filename: "{tmp}\vc_redist.x64.exe"; Parameters: "/install /quiet /norestart"; \
  StatusMsg: "Instalando el runtime que necesita PostgreSQL..."; \
  Flags: waituntilterminated; Components: basedatos
Filename: "powershell.exe"; \
  Parameters: "-ExecutionPolicy Bypass -NoProfile -File ""{app}\instalador\configurar.ps1"" {code:ParametrosConfiguracion}"; \
  StatusMsg: "Preparando la base de datos y arrancando el sistema (puede tardar unos minutos)..."; \
  Flags: waituntilterminated runhidden
Filename: "powershell.exe"; \
  Parameters: "-ExecutionPolicy Bypass -WindowStyle Hidden -File ""{app}\instalador\bandeja.ps1"""; \
  Description: "Abrir el panel de administración"; Flags: postinstall nowait skipifsilent runasoriginaluser
Filename: "http://localhost:{code:PuertoElegido}/"; \
  Description: "Abrir el sistema en el navegador"; Flags: postinstall shellexec nowait skipifsilent

[UninstallRun]
Filename: "powershell.exe"; \
  Parameters: "-ExecutionPolicy Bypass -File ""{app}\instalador\desinstalar.ps1"" -Raiz ""{app}"""; \
  Flags: waituntilterminated runhidden

[Code]
var
  PaginaConfig: TInputQueryWizardPage;
  PaginaGerente: TInputQueryWizardPage;
  PaginaDatos: TInputDirWizardPage;

procedure InitializeWizard;
begin
  PaginaConfig := CreateInputQueryPage(wpSelectComponents,
    'Configuración del servidor',
    'Estos datos definen cómo entran los usuarios y cómo se protege la base.',
    'Puedes dejar los valores propuestos si no tienes un motivo para cambiarlos.');

  PaginaConfig.Add('Puerto del sistema (los usuarios entrarán por él):', False);
  PaginaConfig.Add('Puerto de la base de datos:', False);
  PaginaConfig.Add('Contraseña de la base de datos:', True);
  PaginaConfig.Add('Repetir la contraseña de la base de datos:', True);

  PaginaConfig.Values[0] := '3000';
  { 5433 y no 5432: si el servidor ya tiene otro PostgreSQL instalado, no chocan }
  PaginaConfig.Values[1] := '5433';

  PaginaGerente := CreateInputQueryPage(PaginaConfig.ID,
    'Usuario Gerente',
    'La primera cuenta del sistema, con acceso a todo.',
    'Con estos datos entrará el gerente la primera vez. Se pueden crear más usuarios después, desde el propio sistema.');

  PaginaGerente.Add('Correo del gerente:', False);
  PaginaGerente.Add('Contraseña:', True);
  PaginaGerente.Add('Repetir la contraseña:', True);

  PaginaDatos := CreateInputDirPage(PaginaGerente.ID,
    'Carpeta de datos',
    'Dónde se guardan la base de datos y los respaldos.',
    'Conviene que esté en un disco con espacio y, si es posible, distinto al del sistema operativo.',
    False, '');
  PaginaDatos.Add('Carpeta de datos:');
  PaginaDatos.Values[0] := 'C:\SkynetCRM-datos';
end;

function EsNumero(const S: String): Boolean;
var
  I: Integer;
begin
  Result := Length(S) > 0;
  for I := 1 to Length(S) do
    if (S[I] < '0') or (S[I] > '9') then
      Result := False;
end;

function NextButtonClick(CurPageID: Integer): Boolean;
var
  Puerto, PuertoBd: Integer;
begin
  Result := True;
  if CurPageID = PaginaGerente.ID then
  begin
    if (Pos('@', PaginaGerente.Values[0]) = 0) or (Pos('.', PaginaGerente.Values[0]) = 0) then
    begin
      MsgBox('Escribe un correo válido para el gerente.', mbError, MB_OK);
      Result := False;
      Exit;
    end;
    if Length(PaginaGerente.Values[1]) < 8 then
    begin
      MsgBox('La contraseña del gerente debe tener al menos 8 caracteres.', mbError, MB_OK);
      Result := False;
      Exit;
    end;
    if PaginaGerente.Values[1] <> PaginaGerente.Values[2] then
    begin
      MsgBox('Las dos contraseñas no coinciden.', mbError, MB_OK);
      Result := False;
      Exit;
    end;
  end;

  if CurPageID = PaginaConfig.ID then
  begin
    if not EsNumero(PaginaConfig.Values[0]) or not EsNumero(PaginaConfig.Values[1]) then
    begin
      MsgBox('Los puertos deben ser números.', mbError, MB_OK);
      Result := False;
      Exit;
    end;
    Puerto := StrToInt(PaginaConfig.Values[0]);
    PuertoBd := StrToInt(PaginaConfig.Values[1]);
    if (Puerto < 1024) or (Puerto > 65535) or (PuertoBd < 1024) or (PuertoBd > 65535) then
    begin
      MsgBox('Los puertos deben estar entre 1024 y 65535.', mbError, MB_OK);
      Result := False;
      Exit;
    end;
    if Puerto = PuertoBd then
    begin
      MsgBox('El sistema y la base de datos no pueden usar el mismo puerto.', mbError, MB_OK);
      Result := False;
      Exit;
    end;
    if Length(PaginaConfig.Values[2]) < 8 then
    begin
      MsgBox('La contraseña de la base de datos debe tener al menos 8 caracteres.', mbError, MB_OK);
      Result := False;
      Exit;
    end;
    if PaginaConfig.Values[2] <> PaginaConfig.Values[3] then
    begin
      MsgBox('Las dos contraseñas no coinciden.', mbError, MB_OK);
      Result := False;
      Exit;
    end;
  end;
end;

function PuertoElegido(Param: String): String;
begin
  Result := PaginaConfig.Values[0];
end;

function CarpetaDatosElegida(Param: String): String;
begin
  Result := PaginaDatos.Values[0];
end;

{ Parámetros que recibe configurar.ps1 }
function ParametrosConfiguracion(Param: String): String;
begin
  Result := '-Raiz "' + ExpandConstant('{app}') + '"' +
            ' -ClaveBd "' + PaginaConfig.Values[2] + '"' +
            ' -Puerto ' + PaginaConfig.Values[0] +
            ' -PuertoBd ' + PaginaConfig.Values[1] +
            ' -CarpetaDatos "' + PaginaDatos.Values[0] + '"' +
            ' -CorreoGerente "' + PaginaGerente.Values[0] + '"' +
            ' -ClaveGerente "' + PaginaGerente.Values[1] + '"';
  if WizardIsComponentSelected('firewall') then
    Result := Result + ' -AbrirFirewall';
  if WizardIsComponentSelected('demo') then
    Result := Result + ' -CargarDemo';
end;

{ Resumen antes de instalar: que el administrador vea qué va a pasar }
function UpdateReadyMemo(Space, NewLine, MemoUserInfoInfo, MemoDirInfo,
  MemoTypeInfo, MemoComponentsInfo, MemoGroupInfo, MemoTasksInfo: String): String;
begin
  Result := MemoDirInfo + NewLine + NewLine +
    'Configuración:' + NewLine +
    Space + 'Puerto del sistema: ' + PaginaConfig.Values[0] + NewLine +
    Space + 'Puerto de la base de datos: ' + PaginaConfig.Values[1] + NewLine +
    Space + 'Carpeta de datos: ' + PaginaDatos.Values[0] + NewLine +
    Space + 'Gerente: ' + PaginaGerente.Values[0] + NewLine + NewLine +
    MemoComponentsInfo + NewLine + NewLine + MemoTasksInfo;
end;
