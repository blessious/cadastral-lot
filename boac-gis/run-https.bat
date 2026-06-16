@echo off
set HOST=0.0.0.0
if "%SSL_PFX_FILE%"=="" set SSL_PFX_FILE=%~dp0certificates\boac-gis-local.pfx
if "%SSL_PFX_PASSPHRASE%"=="" set SSL_PFX_PASSPHRASE=changeit
npm run dev:https
pause
