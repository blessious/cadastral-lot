@echo off
setlocal

set "PROJECT_ROOT=%~dp0"
set "WEB_DIR=%PROJECT_ROOT%boac-gis"
set "VENV_DIR=%PROJECT_ROOT%.venv"
call "%PROJECT_ROOT%server_config.bat"

echo.
echo Setting up Cadastral Lot Map on this server PC...
echo Project:
echo   %PROJECT_ROOT%
echo.

where npm >nul 2>nul
if errorlevel 1 (
    echo [ERROR] Node.js/npm was not found.
    echo Install Node.js LTS first, then run this file again.
    exit /b 1
)

where py >nul 2>nul
if errorlevel 1 (
    where python >nul 2>nul
    if errorlevel 1 (
        echo [ERROR] Python was not found.
        echo Install Python 3 first, then run this file again.
        exit /b 1
    )
    set "PYTHON_CMD=python"
) else (
    set "PYTHON_CMD=py -3"
)

if not exist "%WEB_DIR%\package.json" (
    echo [ERROR] Web app folder not found:
    echo   %WEB_DIR%
    exit /b 1
)

echo [1/4] Creating Python virtual environment...
if not exist "%VENV_DIR%\Scripts\python.exe" (
    %PYTHON_CMD% -m venv "%VENV_DIR%"
    if errorlevel 1 (
        echo [ERROR] Failed to create Python virtual environment.
        exit /b 1
    )
) else (
    echo Python virtual environment already exists.
)

echo.
echo [2/4] Installing Python dependencies...
call "%VENV_DIR%\Scripts\activate.bat"
python -m pip install --upgrade pip
if errorlevel 1 exit /b 1
python -m pip install -r "%PROJECT_ROOT%requirements.txt"
if errorlevel 1 exit /b 1

echo.
echo [3/4] Installing web app dependencies...
pushd "%WEB_DIR%"
if exist "package-lock.json" (
    npm ci
) else (
    npm install
)
if errorlevel 1 (
    popd
    echo [ERROR] Failed to install web app dependencies.
    exit /b 1
)

echo.
echo [4/4] Building web app...
copy /Y "%PROJECT_ROOT%server_config.env" "%WEB_DIR%\.env.local" >nul
npm run build
if errorlevel 1 (
    popd
    echo [WARN] Build failed. You can still try running run.bat for development mode.
    exit /b 1
)
popd

echo.
echo [OK] Server setup completed.
echo.
echo Manual checks:
echo   1. Install Microsoft ODBC Driver for SQL Server if pyodbc cannot connect.
echo   2. Edit the DB IP in build_unified_data.py and extract_owner_name.py if needed.
echo   3. Start the app with boac-gis\run.bat
echo.
pause
