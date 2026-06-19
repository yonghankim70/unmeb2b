@echo off
setlocal
cd /d "%~dp0"
title B2B Clean Run - localhost:2000
echo Starting B2B Clean Run on http://localhost:2000
echo.

set "NEXT_CMD="
if exist "node_modules\.bin\next.cmd" (
  set "NEXT_CMD=node_modules\.bin\next.cmd"
) else if exist "..\node_modules\.bin\next.cmd" (
  set "NEXT_CMD=..\node_modules\.bin\next.cmd"
) else (
  echo node_modules not found. Run npm install in this folder first.
  echo.
  pause
  exit /b 1
)

echo Using: %NEXT_CMD%
echo Log: %CD%\dev-server.log
echo.

if "%RUN_IMAGE_WARM_ON_START%"=="1" (
  echo Warming optimized storefront image cache...
  node scripts\warm-image-cache.js
  echo.
)

powershell -NoProfile -ExecutionPolicy Bypass -Command "& '%NEXT_CMD%' dev -p 2000 2>&1 | Tee-Object -FilePath 'dev-server.log'; exit $LASTEXITCODE"

echo.
echo Server process ended. Exit code: %ERRORLEVEL%
echo If this was unexpected, keep this window open and check dev-server.log.
echo.
pause
