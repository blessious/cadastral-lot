@echo off
setlocal

set "PROJECT_ROOT=%~dp0"
set "UPDATE_SCRIPT=%PROJECT_ROOT%deployment\Update-Server.ps1"
set "ELEVATION_SCRIPT=%PROJECT_ROOT%deployment\Invoke-Elevated.ps1"

if not exist "%UPDATE_SCRIPT%" (
    echo [ERROR] Deployment updater was not found:
    echo   %UPDATE_SCRIPT%
    exit /b 1
)
if not exist "%ELEVATION_SCRIPT%" (
    echo [ERROR] Elevation helper was not found:
    echo   %ELEVATION_SCRIPT%
    exit /b 1
)

powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%ELEVATION_SCRIPT%" -ScriptPath "%UPDATE_SCRIPT%" -ProjectRoot "%PROJECT_ROOT%"
exit /b %ERRORLEVEL%
