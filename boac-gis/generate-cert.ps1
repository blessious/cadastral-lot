$ErrorActionPreference = "Stop"

$certDir = Join-Path $PSScriptRoot "certificates"
$pfxPath = Join-Path $certDir "boac-gis-local.pfx"
$password = if ($env:SSL_PFX_PASSPHRASE) { $env:SSL_PFX_PASSPHRASE } else { "changeit" }

if (-not (Test-Path $certDir)) {
  New-Item -ItemType Directory -Path $certDir | Out-Null
}

$dnsNames = @(
  "localhost",
  "127.0.0.1"
)

if ($env:PUBLIC_HOSTNAME) {
  $dnsNames += $env:PUBLIC_HOSTNAME
}

$cert = New-SelfSignedCertificate `
  -DnsName $dnsNames `
  -CertStoreLocation "Cert:\CurrentUser\My" `
  -FriendlyName "boac-gis-local" `
  -NotAfter (Get-Date).AddYears(2) `
  -KeyAlgorithm RSA `
  -KeyLength 2048 `
  -HashAlgorithm SHA256

$securePassword = ConvertTo-SecureString -String $password -Force -AsPlainText

Export-PfxCertificate `
  -Cert $cert `
  -FilePath $pfxPath `
  -Password $securePassword | Out-Null

Write-Host "Created certificate: $pfxPath"
Write-Host "Passphrase: $password"
