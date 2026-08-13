@echo off
rem Shared loader for local server settings.
rem Prefer server_config.local.bat for batch syntax or server_config.env for KEY=VALUE syntax.

if exist "%~dp0server_config.local.bat" (
    call "%~dp0server_config.local.bat"
    goto :defaults
)

if exist "%~dp0server_config.env" (
    for /f "usebackq tokens=1,* delims==" %%A in (`findstr /R /V /C:"^[ ]*#" /C:"^[ ]*$" "%~dp0server_config.env"`) do (
        if not "%%A"=="" set "%%A=%%B"
    )
)

:defaults
if not defined COPY_DEST set "COPY_DEST=\\192.168.0.26\Public\CADASTRAL LOT MAP"

if not defined APP_HOST set "APP_HOST=127.0.0.1"
if not defined APP_PORT set "APP_PORT=3005"
if not defined PUBLIC_URL set "PUBLIC_URL=http://127.0.0.1:%APP_PORT%"
if not defined NEXT_ALLOWED_DEV_ORIGINS set "NEXT_ALLOWED_DEV_ORIGINS=localhost,127.0.0.1"
