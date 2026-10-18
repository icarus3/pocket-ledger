@echo off
title Build Pocket Ledger for Android
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\build-apk.ps1" -UseBundledAssets
if errorlevel 1 (
  echo.
  echo Build did not finish. Read the message above and README.md for setup instructions.
) else (
  echo.
  echo Your APK is in the releases folder. Copy it to your tablet and open it in Files.
)
pause
