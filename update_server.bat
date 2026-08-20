@echo off
setlocal

set "PROJECT_ROOT=%~dp0"
set "UPDATE_SCRIPT=%PROJECT_ROOT%deployment\Update-Server.ps1"
set "ELEVATION_SCRIPT=%PROJECT_ROOT%deployment\Invoke-Elevated.ps1"

if not exist "%UPDATE_SCRIPT%" (
    echo [ERROR] Deployment updater was not found:
    echo   %UPDATE_SCRIPT%
    echo.
    pause
    exit /b 1
)
if not exist "%ELEVATION_SCRIPT%" (
    echo [ERROR] Elevation helper was not found:
    echo   %ELEVATION_SCRIPT%
    echo.
    pause
    exit /b 1
)

powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%ELEVATION_SCRIPT%" -ScriptPath "%UPDATE_SCRIPT%" -ProjectRoot "%PROJECT_ROOT%"
set "RESULT=%ERRORLEVEL%"
if not "%RESULT%"=="0" (
    echo.
    echo [STOPPED] Server update did not complete. Review the message and the log under .deploy\logs.
    echo [TIP] For the complete error, run update_server.bat from an Administrator Command Prompt.
    echo.
    pause
)
exit /b %RESULT%
