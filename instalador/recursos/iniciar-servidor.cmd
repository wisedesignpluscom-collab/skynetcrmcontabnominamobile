@echo off
REM Arranque del servidor de Skynet CRM. Lo ejecuta la tarea programada al
REM encender el equipo, y el panel de la bandeja al reiniciar el sistema.
REM
REM No se llama directamente: usa el panel de la bandeja.

setlocal
set RAIZ=%~dp0
cd /d "%RAIZ%"

if not exist "%RAIZ%logs" mkdir "%RAIZ%logs"

REM Rotación simple: el registro anterior se conserva como .1 para poder
REM comparar un arranque con el anterior sin que el archivo crezca sin fin.
if exist "%RAIZ%logs\servidor.log" (
    if exist "%RAIZ%logs\servidor.1.log" del "%RAIZ%logs\servidor.1.log"
    move /y "%RAIZ%logs\servidor.log" "%RAIZ%logs\servidor.1.log" >nul
)

echo [%date% %time%] Iniciando Skynet CRM... >> "%RAIZ%logs\servidor.log"

REM El .env lo lee la propia aplicación (Next carga .env en producción).
"%RAIZ%node\node.exe" "%RAIZ%app\server.js" >> "%RAIZ%logs\servidor.log" 2>&1

echo [%date% %time%] El servidor terminó con codigo %ERRORLEVEL% >> "%RAIZ%logs\servidor.log"
endlocal
