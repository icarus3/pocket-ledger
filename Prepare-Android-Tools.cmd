@echo off
title Prepare Pocket Ledger Android build tools
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\prepare-android.ps1"
if errorlevel 1 (
  echo.
  echo Preparation did not finish. The details are in build-tools\setup.log.
  echo Tell the assistant what happened; you do not need to start over.
) else (
  echo.
  echo Preparation complete. Tell the assistant: Build tools are ready.
)
pause
