@echo off
setlocal
cd /d "%~dp0"
if exist "node_modules\.bin\next.cmd" (
  node_modules\.bin\next.cmd build
) else if exist "..\node_modules\.bin\next.cmd" (
  ..\node_modules\.bin\next.cmd build
) else (
  echo node_modules not found. Run npm install in this folder first.
  exit /b 1
)
