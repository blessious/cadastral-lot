@echo off
setlocal

set "SOURCE=%~dp0"
call "%SOURCE%server_config.bat"
set "DEST=%COPY_DEST%"

echo.
echo Copying Cadastral Lot Map project to:
echo   %DEST%
echo.
echo Progress and results will also be saved to:
echo   %SOURCE%copy_to_server.log
echo.

if not exist "%DEST%" (
    echo Creating destination folder...
    mkdir "%DEST%"
    if errorlevel 1 (
        echo [ERROR] Could not create destination folder.
        echo Check that the destination share is reachable and writable.
        exit /b 1
    )
)

robocopy "%SOURCE%" "%DEST%" /E /Z /FFT /R:2 /W:2 ^
    /ETA /TEE /LOG+:"%SOURCE%copy_to_server.log" ^
    /XD ".git" ".venv" ".agents" ".codex" "node_modules" ".next" "__pycache__" ^
    /XF "*.pyc" "*.pyo" ".DS_Store" "Thumbs.db"

set "RC=%ERRORLEVEL%"
if %RC% LEQ 7 (
    echo.
    echo [OK] Copy completed. Robocopy exit code: %RC%
    echo.
    echo On the server PC:
    echo   1. Edit the DB IP in build_unified_data.py and extract_owner_name.py if needed.
    echo   2. In boac-gis, run npm install once before running the app.
    echo.
    pause
    exit /b 0
)

echo.
echo [ERROR] Copy failed. Robocopy exit code: %RC%
echo See the log above for details.
echo.
pause
exit /b %RC%
