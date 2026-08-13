@echo off
setlocal

REM ======================================
REM LGU CAD MAPS START SCRIPT
REM Reverse Proxy Ready
REM ======================================

call "%~dp0..\server_config.bat"

set "HOST=%APP_HOST%"
set "PORT=%APP_PORT%"
set "URL=http://%HOST%:%PORT%"

pushd "%~dp0"

if errorlevel 1 (
    echo Could not open web app folder:
    echo %~dp0
    pause
    exit /b 1
)


echo ======================================
echo   Starting LGU CAD Maps
echo ======================================
echo.
echo Folder: %CD%
echo Local:  %URL%
echo Public: %PUBLIC_URL%
echo.


REM Check if already running

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
"try { $r = Invoke-WebRequest -UseBasicParsing '%URL%' -TimeoutSec 5; if ($r.StatusCode -ge 200 -and $r.StatusCode -lt 500) { exit 0 } else { exit 2 } } catch { exit 1 }"


if %ERRORLEVEL% EQU 0 (

    echo Application already running.
    echo.
    echo Local:
    echo %URL%
    echo.
    echo Public:
    echo %PUBLIC_URL%

    popd
    pause
    exit /b 0
)



REM Check occupied port

for /f "tokens=5" %%P in ('netstat -ano -p tcp ^| findstr /R /C:":%PORT% .*LISTENING"') do set "BUSY_PID=%%P"

if defined BUSY_PID (

    echo Port %PORT% is already used by PID %BUSY_PID%
    echo.
    echo Stop using:
    echo taskkill /PID %BUSY_PID% /F

    popd
    pause
    exit /b 1
)



REM Clear Next cache

if exist ".next" (

    echo Clearing old Next.js cache...

    rmdir /S /Q ".next"

    echo.

)



REM Start NextJS

npx next dev --hostname "%HOST%" --port "%PORT%"


popd

pause
