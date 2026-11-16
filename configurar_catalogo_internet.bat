@echo off
chcp 65001 >nul
REM Conecta el sistema de esta PC con el catalogo en internet.
REM El sistema sigue usando la base de la PC; solo copia los productos al catalogo online
REM y lee de alli los pedidos de los clientes.
REM Uso: doble clic, pegar la direccion de Neon cuando la pida.

setlocal EnableDelayedExpansion
set "ENVFILE=%~dp0backend\.env"
set "DEFAULT_WEB=https://libreria-sys.onrender.com"

echo.
echo === Catalogo en internet ===
echo.
set /p NEON_URL=Pega la direccion de Neon (empieza con postgresql://) y presiona Enter:
if "!NEON_URL!"=="" (
  echo No pegaste nada.
  pause
  exit /b 1
)
set /p WEB_URL=Direccion de la pagina en Render [Enter = %DEFAULT_WEB%]:
if "%WEB_URL%"=="" set "WEB_URL=%DEFAULT_WEB%"

if not exist "%ENVFILE%" type nul > "%ENVFILE%"
REM Quitar valores anteriores y agregar los nuevos
findstr /v /b /c:"CATALOGO_NUBE_URL=" /c:"CATALOGO_PUBLIC_URL=" /c:"CATALOGO_SISTEMA_DIR=" "%ENVFILE%" > "%ENVFILE%.tmp"
move /y "%ENVFILE%.tmp" "%ENVFILE%" >nul
>> "%ENVFILE%" echo CATALOGO_NUBE_URL=!NEON_URL!
>> "%ENVFILE%" echo CATALOGO_PUBLIC_URL=!WEB_URL!
REM Si el sistema de todos los dias esta en la carpeta LibreriaSys de al lado, tomar de ahi las fotos nuevas.
if exist "%~dp0..\LibreriaSys\backend" (
  for %%I in ("%~dp0..\LibreriaSys") do >> "%ENVFILE%" echo CATALOGO_SISTEMA_DIR=%%~fI
)

echo.
echo Guardado. Copiando el catalogo a internet por primera vez (puede tardar por las fotos)...
pushd "%~dp0backend"
node scripts\sincronizar_catalogo.js
popd

REM Copia automatica cada 10 minutos, aunque el sistema este cerrado (sin ventanas).
set "VBS=%~dp0backend\scripts\sincronizar_catalogo_oculto.vbs"
> "%VBS%" echo Set sh = CreateObject("WScript.Shell")
>> "%VBS%" echo sh.CurrentDirectory = "%~dp0backend"
>> "%VBS%" echo sh.Run "cmd /c node scripts\sincronizar_catalogo.js > scripts\ultima_sincronizacion.log 2>&1", 0, True
schtasks /create /f /sc minute /mo 10 /tn "NEXO Catalogo internet" /tr "wscript.exe \"%VBS%\"" >nul
if errorlevel 1 (
  echo No se pudo programar la copia automatica. El sistema abierto igual la hace cada 10 minutos.
) else (
  echo Copia automatica programada: cada 10 minutos.
)

echo.
echo Listo. Las fotos, precios y stock se copian solos a internet cada 10 minutos.
echo Link para tus clientes: %WEB_URL%/catalogo
pause
