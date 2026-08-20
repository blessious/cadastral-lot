@echo off
setlocal

set "PROJECT_ROOT=%~dp0"
set "ROLLBACK_SCRIPT=%PROJECT_ROOT%deployment\Rollback-Server.ps1"
set "ELEVATION_SCRIPT=%PROJECT_ROOT%deployment\Invoke-Elevated.ps1"

if not exist "%ROLLBACK_SCRIPT%" (
    echo [ERROR] Deployment rollback script was not found:
    echo   %ROLLBACK_SCRIPT%
    exit /b 1
)
if not exist "%ELEVATION_SCRIPT%" (
    echo [ERROR] Elevation helper was not found:
    echo   %ELEVATION_SCRIPT%
    exit /b 1
)

powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%ELEVATION_SCRIPT%" -ScriptPath "%ROLLBACK_SCRIPT%" -ProjectRoot "%PROJECT_ROOT%"
exit /b %ERRORLEVEL%
