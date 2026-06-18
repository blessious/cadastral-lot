@echo off
rem Edit this file when moving the project to another server PC.

set "COPY_DEST=\\192.168.0.26\Public\CADASTRAL LOT MAP"

set "DB_SERVER=192.168.1.93,1433"
set "DB_DATABASE=etracs_boac"
set "DB_USERNAME=etracs_user"
set "DB_PASSWORD=Etracs@2025!"

set "APP_HOST=0.0.0.0"
set "APP_PORT=3005"
set "PUBLIC_URL=http://lguboacnas.myqnapcloud.com:3005"
set "NEXT_ALLOWED_DEV_ORIGINS=localhost,127.0.0.1,192.168.1.93,lguboacnas.myqnapcloud.com"

rem User credentials are stored in dbo.gis_users. Keep only the session signing secret here.
set "AUTH_SECRET=bPj5xyIQzB1qt9DajEzg4D7RvbYJc590iSPyUwah3aqAvRvQY77NEZWlJNcXnpL7"
