@echo off
rem ================================================
rem  Lanzador ALPX Systems (Librería, puerto 3003)
rem ================================================
cd /d "%~dp0"

rem -- Si el backend no responde, arrancarlo en segundo plano --
powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -Command ^
  "$ok=$false; try {$r=Invoke-WebRequest -Uri 'http://localhost:3003/login/login.html' -UseBasicParsing -TimeoutSec 2; $ok=$r.StatusCode -lt 500} catch {$ok=$false}; if(-not $ok){Start-Process -WindowStyle Hidden -FilePath 'node' -ArgumentList 'backend\app.js' -WorkingDirectory '%~dp0'}"

rem -- Lanzar la app Electron apuntando a la carpeta del proyecto --
rem (cd ya nos posicionó en la carpeta de la app; "." indica la app actual)
start "" "%~dp0node_modules\electron\dist\electron.exe" "."

