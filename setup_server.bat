@echo off
setlocal

set "PROJECT_ROOT=%~dp0"
set "WEB_DIR=%PROJECT_ROOT%boac-gis"
set "VENV_DIR=%PROJECT_ROOT%.venv"
set "LOG_FILE=%PROJECT_ROOT%setup_server.log"

title Cadastral Lot Map Server Setup
cd /d "%PROJECT_ROOT%"

echo ======================================
echo   Cadastral Lot Map Server Setup
echo ======================================
echo.
echo Project:
echo   %PROJECT_ROOT%
echo.
echo Log:
echo   %LOG_FILE%
echo.
> "%LOG_FILE%" echo [%DATE% %TIME%] Starting setup in %PROJECT_ROOT%

if not exist "%PROJECT_ROOT%server_config.env" (
    if exist "%PROJECT_ROOT%.env" (
        echo Creating server_config.env from existing .env...
        copy /Y "%PROJECT_ROOT%.env" "%PROJECT_ROOT%server_config.env" >nul
    ) else (
        echo Creating server_config.env from server_config.example.env...
        copy /Y "%PROJECT_ROOT%server_config.example.env" "%PROJECT_ROOT%server_config.env" >nul
        echo.
        echo [ACTION REQUIRED] Edit this file before continuing:
        echo   %PROJECT_ROOT%server_config.env
        echo.
        echo Set login DB values, PUBLIC_URL, APP_HOST, APP_PORT, and AUTH_SECRET.
        >> "%LOG_FILE%" echo [%DATE% %TIME%] Created server_config.env and stopped for editing.
        goto :fail
    )
)

call "%PROJECT_ROOT%server_config.bat"
if errorlevel 1 (
    echo [ERROR] Failed to load server_config.bat.
    >> "%LOG_FILE%" echo [%DATE% %TIME%] Failed to load server_config.bat.
    goto :fail
)

echo.
echo Setting up Cadastral Lot Map on this server PC...
echo Project:
echo   %PROJECT_ROOT%
echo.

where npm >nul 2>nul
if errorlevel 1 (
    echo [ERROR] Node.js/npm was not found.
    echo Install Node.js LTS first, then run this file again.
    >> "%LOG_FILE%" echo [%DATE% %TIME%] npm was not found.
    goto :fail
)

where py >nul 2>nul
if errorlevel 1 (
    where python >nul 2>nul
    if errorlevel 1 (
        echo [ERROR] Python was not found.
        echo Install Python 3 first, then run this file again.
        >> "%LOG_FILE%" echo [%DATE% %TIME%] Python was not found.
        goto :fail
    )
    set "PYTHON_CMD=python"
) else (
    set "PYTHON_CMD=py -3"
)

if not exist "%WEB_DIR%\package.json" (
    echo [ERROR] Web app folder not found:
    echo   %WEB_DIR%
    >> "%LOG_FILE%" echo [%DATE% %TIME%] Web app folder not found: %WEB_DIR%
    goto :fail
)

echo [1/4] Creating Python virtual environment...
>> "%LOG_FILE%" echo [%DATE% %TIME%] Creating Python virtual environment.
if not exist "%VENV_DIR%\Scripts\python.exe" (
    %PYTHON_CMD% -m venv "%VENV_DIR%"
    if errorlevel 1 (
        echo [ERROR] Failed to create Python virtual environment.
        >> "%LOG_FILE%" echo [%DATE% %TIME%] Failed to create Python virtual environment.
        goto :fail
    )
) else (
    echo Python virtual environment already exists.
)

echo.
echo [2/4] Installing Python dependencies...
>> "%LOG_FILE%" echo [%DATE% %TIME%] Installing Python dependencies.
call "%VENV_DIR%\Scripts\activate.bat"
python -m pip install --upgrade pip
if errorlevel 1 (
    echo [ERROR] Failed to upgrade pip.
    >> "%LOG_FILE%" echo [%DATE% %TIME%] Failed to upgrade pip.
    goto :fail
)
python -m pip install -r "%PROJECT_ROOT%requirements.txt"
if errorlevel 1 (
    echo [ERROR] Failed to install Python requirements.
    >> "%LOG_FILE%" echo [%DATE% %TIME%] Failed to install Python requirements.
    goto :fail
)

echo.
echo [3/4] Installing web app dependencies...
>> "%LOG_FILE%" echo [%DATE% %TIME%] Installing web app dependencies.
pushd "%WEB_DIR%"
if exist "package-lock.json" (
    npm ci
) else (
    npm install
)
if errorlevel 1 (
    popd
    echo [ERROR] Failed to install web app dependencies.
    >> "%LOG_FILE%" echo [%DATE% %TIME%] Failed to install web app dependencies.
    goto :fail
)

echo.
echo [4/4] Building web app...
>> "%LOG_FILE%" echo [%DATE% %TIME%] Building web app.
npm run build
if errorlevel 1 (
    popd
    echo [WARN] Build failed. You can still try running run.bat for development mode.
    >> "%LOG_FILE%" echo [%DATE% %TIME%] Build failed.
    goto :fail
)
popd

echo.
echo [OK] Server setup completed.
>> "%LOG_FILE%" echo [%DATE% %TIME%] Setup completed.
echo.
echo Manual checks:
echo   1. Confirm server_config.env has the server PC MySQL auth and public URL values.
echo   2. Create or update the login user with: cd boac-gis ^&^& npm run auth:setup
echo   3. Start the app with boac-gis\run.bat
echo.
pause
exit /b 0

:fail
echo.
echo [STOPPED] Setup did not complete.
echo Check the messages above and this log file:
echo   %LOG_FILE%
echo.
pause
exit /b 1
