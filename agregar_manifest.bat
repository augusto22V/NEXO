@echo off
chcp 65001 >nul
:: Agrega el link del manifest.json en todos los HTML
:: Ejecutar desde la raiz del proyecto (donde esta frontend/)

echo Agregando manifest a todos los HTML...
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0agregar_manifest.ps1"

echo.
echo Listo. manifest.json ya esta en frontend/
pause
