@echo off
setlocal

for %%I in ("%~dp0.") do set "PROJECT_ROOT=%%~fI"
set "INSTALL_SCRIPT=%PROJECT_ROOT%\deployment\Install-ServerTask.ps1"
set "ELEVATION_SCRIPT=%PROJECT_ROOT%\deployment\Invoke-Elevated.ps1"

if not exist "%INSTALL_SCRIPT%" (
    echo [ERROR] Scheduled Task installer was not found:
    echo   %INSTALL_SCRIPT%
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

powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%ELEVATION_SCRIPT%" -ScriptPath "%INSTALL_SCRIPT%" -ProjectRoot "%PROJECT_ROOT%"
set "RESULT=%ERRORLEVEL%"
if not "%RESULT%"=="0" (
    echo.
    echo [STOPPED] Scheduled Task installation did not complete. Review the message and the log under .deploy\logs.
    echo [TIP] For the complete error, run install_server_task.bat from an Administrator Command Prompt.
    echo.
    pause
)
exit /b %RESULT%
