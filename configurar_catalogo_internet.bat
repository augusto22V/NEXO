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
findstr /v /b /c:"CATALOGO_NUBE_URL=" /c:"CATALOGO_PUBLIC_URL=" "%ENVFILE%" > "%ENVFILE%.tmp"
move /y "%ENVFILE%.tmp" "%ENVFILE%" >nul
>> "%ENVFILE%" echo CATALOGO_NUBE_URL=!NEON_URL!
>> "%ENVFILE%" echo CATALOGO_PUBLIC_URL=!WEB_URL!

echo.
echo Guardado. Copiando el catalogo a internet por primera vez (puede tardar por las fotos)...
pushd "%~dp0backend"
node scripts\sincronizar_catalogo.js
popd
echo.
echo Listo. Cerra y volve a abrir el sistema para que el catalogo se actualice solo cada 10 minutos.
echo Link para tus clientes: %WEB_URL%/catalogo
pause
