param([Parameter(Mandatory = $true)][string]$ProjectRoot)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
$root=[IO.Path]::GetFullPath($ProjectRoot).TrimEnd('\','/')
$config=Join-Path $root "server_config.env"
if (-not (Test-Path -LiteralPath $config)) {
    Copy-Item -LiteralPath (Join-Path $root "server_config.example.env") -Destination $config
    Write-Host "[ACTION REQUIRED] Edit $config with this server's MySQL credentials and AUTH_SECRET, then run setup_server.bat again."
    exit 2
}

Import-Module (Join-Path $PSScriptRoot "Deploy.Common.psm1") -Force
Assert-IsAdministrator
$settings=Read-ServerConfig $root
Test-ServerConfiguration $settings
Get-RuntimeInfo $root | Out-Null
& (Join-Path $PSScriptRoot "Install-ServerTask.ps1") -ProjectRoot $root -NoStart
& (Join-Path $PSScriptRoot "Update-Server.ps1") -ProjectRoot $root -SetupInvocation
Write-Host "[OK] Setup, task registration, database verification, and initial health checks passed."
