@echo off
setlocal

REM ======================================
REM LGU CAD MAPS START SCRIPT
REM Rebuilds and restarts the pulled version
REM ======================================

title LGU CAD Maps

call "%~dp0..\server_config.bat"
if errorlevel 1 (
    echo [ERROR] Could not load server_config.bat.
    pause
    exit /b 1
)

set "HOST=%APP_HOST%"
set "PORT=%APP_PORT%"
set "URL=http://%HOST%:%PORT%"

pushd "%~dp0"
if errorlevel 1 (
    echo [ERROR] Could not open web app folder:
    echo %~dp0
    pause
    exit /b 1
)

echo ======================================
echo   Starting LGU CAD Maps
echo ======================================
echo.
echo Folder:  %CD%
echo Local:   %URL%
echo Public:  %PUBLIC_URL%
echo.

where npm >nul 2>nul
if errorlevel 1 (
    echo [ERROR] Node.js/npm was not found.
    echo Install Node.js LTS first, then run this file again.
    popd
    pause
    exit /b 1
)

echo Checking existing app process on port %PORT%...
set "FOUND="
for /f "tokens=5" %%P in ('netstat -ano -p tcp ^| findstr /R /C:":%PORT% .*LISTENING"') do (
    set "FOUND=1"
    echo Stopping existing process PID %%P...
    taskkill /PID %%P /F
)

if not defined FOUND (
    echo No existing process found on port %PORT%.
)

echo.
echo Installing dependencies if needed...
if not exist "node_modules\next" (
    if exist "package-lock.json" (
        call npm ci
    ) else (
        call npm install
    )
    if errorlevel 1 (
        echo [ERROR] Failed to install web app dependencies.
        popd
        pause
        exit /b 1
    )
) else (
    echo Dependencies already installed.
)

echo.
echo Building latest pulled code...
call npm run build
if errorlevel 1 (
    echo [ERROR] Build failed. Fix the error above before starting the app.
    popd
    pause
    exit /b 1
)

echo.
echo Starting production server...
echo Press Ctrl+C to stop this window-run server.
echo.
if exist "node_modules\.bin\next.cmd" (
    call "node_modules\.bin\next.cmd" start -H "%HOST%" -p "%PORT%"
) else (
    call npx next start -H "%HOST%" -p "%PORT%"
)

echo.
echo [STOPPED] Next server exited with code %ERRORLEVEL%.
echo If this was not intentional, check the error above.
echo.

popd
pause
