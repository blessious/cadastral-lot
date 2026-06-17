@echo off
setlocal
call "%~dp0..\server_config.bat"
set "HOST=%APP_HOST%"
set "PORT=%APP_PORT%"

if "%HOST%"=="" set "HOST=0.0.0.0"
if "%PORT%"=="" set "PORT=3005"
if "%PUBLIC_URL%"=="" set "PUBLIC_URL=http://127.0.0.1:%PORT%"
set "URL=http://127.0.0.1:%PORT%"

pushd "%~dp0"
if errorlevel 1 (
  echo Could not open web app folder:
  echo %~dp0
  pause
  exit /b 1
)

echo Starting Boac GIS app...
echo Folder: %CD%
echo Local:  %URL%
echo Public: %PUBLIC_URL%
echo.

powershell -NoProfile -ExecutionPolicy Bypass -Command "try { $r = Invoke-WebRequest -UseBasicParsing '%URL%' -TimeoutSec 5; if ($r.StatusCode -ge 200 -and $r.StatusCode -lt 500) { exit 0 } else { exit 2 } } catch { exit 1 }"
if %ERRORLEVEL% EQU 0 (
  echo App is already running.
  echo Local:  %URL%
  echo Public: %PUBLIC_URL%
  popd
  pause
  exit /b 0
)

for /f "tokens=5" %%P in ('netstat -ano -p tcp ^| findstr /R /C:":%PORT% .*LISTENING"') do set "BUSY_PID=%%P"
if defined BUSY_PID (
  echo Port %PORT% is already in use by PID %BUSY_PID%, but the app did not respond at %URL%.
  echo Stop that stale process, then run this file again:
  echo taskkill /PID %BUSY_PID% /F
  popd
  pause
  exit /b 1
)

if exist ".next" (
  echo Clearing old Next.js build cache...
  rmdir /S /Q ".next"
  if errorlevel 1 (
    echo [WARN] Could not clear .next. Close any running Node/Next process, then run this file again.
  )
  echo.
)

npx next dev --hostname "%HOST%" --port "%PORT%"
popd
pause
