@echo off
chcp 65001 >nul
REM Copia la base local "libreria_sys" (de tu PC) a la base gratuita de Neon.
REM Uso: doble clic y pegar la direccion de Neon cuando la pida.

setlocal
set "PGBIN="
for /d %%D in ("C:\Program Files\PostgreSQL\*") do if exist "%%D\bin\pg_dump.exe" set "PGBIN=%%D\bin"
if "%PGBIN%"=="" (
  echo No encontre PostgreSQL en "C:\Program Files\PostgreSQL". Instalalo o edita este archivo.
  pause
  exit /b 1
)
echo Usando PostgreSQL de: %PGBIN%
echo.
set /p NEON_URL=Pega la direccion de Neon (empieza con postgresql://) y presiona Enter: 
if "%NEON_URL%"=="" (
  echo No pegaste nada.
  pause
  exit /b 1
)

echo.
echo 1/3 Guardando las fotos de productos dentro de la base...
pushd "%~dp0backend"
node scripts\fotos_a_base.js
if errorlevel 1 (
  popd
  echo No se pudieron copiar las fotos. Revisa que Node y PostgreSQL esten funcionando.
  pause
  exit /b 1
)
popd

set "PGPASSWORD=12345"
echo.
echo 2/3 Copiando la base de tu PC...
"%PGBIN%\pg_dump.exe" -h localhost -U postgres -d libreria_sys --no-owner --no-privileges -f "%TEMP%\libreria_sys_backup.sql"
if errorlevel 1 (
  echo Fallo la copia local. Revisa que PostgreSQL este prendido.
  pause
  exit /b 1
)
set "PGPASSWORD="

echo 3/3 Subiendo a Neon (puede tardar si hay muchas fotos)...
"%PGBIN%\psql.exe" "%NEON_URL%" -v ON_ERROR_STOP=0 -q -f "%TEMP%\libreria_sys_backup.sql"
echo.
echo Listo. Si arriba no hay errores en rojo, la base ya esta en la nube.
echo Copia de respaldo guardada en: %TEMP%\libreria_sys_backup.sql
pause
