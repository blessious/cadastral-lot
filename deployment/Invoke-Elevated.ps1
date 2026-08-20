param(
    [Parameter(Mandatory = $true)][string]$ScriptPath,
    [Parameter(Mandatory = $true)][string]$ProjectRoot
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$script = [IO.Path]::GetFullPath($ScriptPath)
$root = [IO.Path]::GetFullPath($ProjectRoot).TrimEnd('\', '/')
if (-not (Test-Path -LiteralPath $script -PathType Leaf)) { throw "Deployment script was not found: $script" }

$principal = [Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
$isAdministrator = $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if ($isAdministrator) {
    & $script -ProjectRoot $root
    exit 0
}

$escapedScript = $script.Replace('"', '\"')
$escapedRoot = $root.Replace('"', '\"')
$arguments = '-NoLogo -NoProfile -ExecutionPolicy Bypass -File "' + $escapedScript + '" -ProjectRoot "' + $escapedRoot + '"'
Write-Host "Administrator approval is required to manage the GeoLGU Scheduled Task and production process."
$process = Start-Process -FilePath "powershell.exe" -ArgumentList $arguments -Verb RunAs -Wait -PassThru
exit $process.ExitCode
