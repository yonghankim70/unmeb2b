@echo off
setlocal
cd /d "%~dp0"
if exist "node_modules\.bin\tsc.cmd" (
  node_modules\.bin\tsc.cmd --noEmit --pretty false --incremental false
) else if exist "..\node_modules\.bin\tsc.cmd" (
  ..\node_modules\.bin\tsc.cmd --noEmit --pretty false --incremental false
) else (
  echo node_modules not found. Run npm install in this folder first.
  exit /b 1
)
