@echo off
setlocal

set "PROJECT_ROOT=%~dp0"
set "INSTALL_SCRIPT=%PROJECT_ROOT%deployment\Install-ServerTask.ps1"
set "ELEVATION_SCRIPT=%PROJECT_ROOT%deployment\Invoke-Elevated.ps1"

if not exist "%INSTALL_SCRIPT%" (
    echo [ERROR] Scheduled Task installer was not found:
    echo   %INSTALL_SCRIPT%
    exit /b 1
)
if not exist "%ELEVATION_SCRIPT%" (
    echo [ERROR] Elevation helper was not found:
    echo   %ELEVATION_SCRIPT%
    exit /b 1
)

powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%ELEVATION_SCRIPT%" -ScriptPath "%INSTALL_SCRIPT%" -ProjectRoot "%PROJECT_ROOT%"
exit /b %ERRORLEVEL%
