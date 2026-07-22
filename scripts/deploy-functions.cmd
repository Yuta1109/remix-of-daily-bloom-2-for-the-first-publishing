@echo off
REM Deploy Cloud Functions (Windows cmd / double-click friendly).
REM Equivalent of: .\scripts\deploy-functions.ps1

cd /d "%~dp0.."
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0deploy-functions.ps1"
if errorlevel 1 exit /b %errorlevel%
