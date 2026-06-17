@echo off
setlocal
cd /d "%~dp0"

set "PORTABLE=%~dp0release\L'Atelier du Bois 1.0.1.exe"

if exist "%PORTABLE%" (
  start "" "%PORTABLE%"
  exit /b 0
)

if exist "%~dp0node_modules\.bin\electron.cmd" (
  npm run dev
  exit /b %ERRORLEVEL%
)

echo.
echo L'Atelier du Bois ne peut pas demarrer.
echo.
echo Solution:
echo 1. npm install
echo 2. npm run dev
echo 3. Relancer ce fichier
echo.
pause
