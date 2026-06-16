# Boac GIS

## Host Binding

This app is configured to bind to `0.0.0.0` for both development and production-style startup.

- `npm run dev`
- `npm run dev:https`
- `npm run start`

You can also use:

- [run.bat](/C:/Users/admin/Videos/CADASTRAL%20LOT%20MAP/boac-gis/run.bat)
- [run-https.bat](/C:/Users/admin/Videos/CADASTRAL%20LOT%20MAP/boac-gis/run-https.bat)

## Credentials

Do not expose this app to the internet with the default `admin/admin` login.

Set these environment variables first:

```powershell
$env:BOAC_GIS_USERNAME="your-user"
$env:BOAC_GIS_PASSWORD="use-a-long-random-password"
```

In production mode, the app will refuse to start with the default credentials.

## Local HTTPS

For Windows local HTTPS:

1. Generate a self-signed PFX:

```powershell
$env:SSL_PFX_PASSPHRASE="change-this"
.\generate-cert.ps1
```

2. Start HTTPS:

```powershell
$env:HOST="0.0.0.0"
$env:SSL_PFX_FILE="certificates\\boac-gis-local.pfx"
$env:SSL_PFX_PASSPHRASE="change-this"
npm run dev:https
```

`run-https.bat` uses the same defaults.

This certificate is suitable for local testing. Browsers outside your machine will only trust it if you manually trust the certificate or CA on those devices.

## Internet Exposure

If you plan to port-forward this app, use a real domain and a publicly trusted certificate.

Recommended setup:

1. Point a domain or subdomain to your public IP.
2. Terminate HTTPS with a reverse proxy such as Caddy, Nginx, or Traefik.
3. Forward external `443` to the reverse proxy, not directly to the Next.js app.
4. Proxy from the reverse proxy to this app on internal HTTP or HTTPS.
5. Set strong `BOAC_GIS_USERNAME` and `BOAC_GIS_PASSWORD`.

Port-forwarding a self-signed certificate directly to the internet will still produce browser security warnings and is not a proper public deployment.
