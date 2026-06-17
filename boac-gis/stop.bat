@echo off
setlocal
call "%~dp0..\server_config.bat"
set "PORT=%APP_PORT%"
set "FOUND="

for /f "tokens=5" %%P in ('netstat -ano -p tcp ^| findstr /R /C:":%PORT% .*LISTENING"') do (
  set "FOUND=1"
  echo Stopping system on port %PORT% ^(PID %%P^)...
  taskkill /PID %%P /F
)

if not defined FOUND (
  echo No system is currently listening on port %PORT%.
)

pause
