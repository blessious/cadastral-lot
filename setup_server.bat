@echo off
setlocal

set "PROJECT_ROOT=%~dp0"
set "SETUP_SCRIPT=%PROJECT_ROOT%deployment\Setup-Server.ps1"
set "ELEVATION_SCRIPT=%PROJECT_ROOT%deployment\Invoke-Elevated.ps1"

title GeoLGU Production Server Setup

if not exist "%SETUP_SCRIPT%" (
    echo [ERROR] Deployment setup script was not found:
    echo   %SETUP_SCRIPT%
    exit /b 1
)
if not exist "%ELEVATION_SCRIPT%" (
    echo [ERROR] Elevation helper was not found:
    echo   %ELEVATION_SCRIPT%
    exit /b 1
)

powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%ELEVATION_SCRIPT%" -ScriptPath "%SETUP_SCRIPT%" -ProjectRoot "%PROJECT_ROOT%"
set "RESULT=%ERRORLEVEL%"

if not "%RESULT%"=="0" (
    echo.
    echo [STOPPED] Server setup did not complete. Review the message and the log under .deploy\logs.
    exit /b %RESULT%
)

echo.
echo [OK] GeoLGU production server setup completed.
exit /b 0
