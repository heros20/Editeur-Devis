@echo off
setlocal
cd /d "%~dp0"

set "PORTABLE=%~dp0release\Devix-1.0.2-Portable.exe"

if exist "%PORTABLE%" (
  start "" "%PORTABLE%"
  exit /b 0
)

if exist "%~dp0node_modules\.bin\electron.cmd" (
  npm run dev
  exit /b %ERRORLEVEL%
)

echo.
echo Devix ne peut pas demarrer.
echo.
echo Solution:
echo 1. npm install
echo 2. npm run portable
echo 3. Relancer ce fichier
echo.
pause
