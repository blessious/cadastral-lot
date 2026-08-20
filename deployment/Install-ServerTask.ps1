param([Parameter(Mandatory = $true)][string]$ProjectRoot,[switch]$NoStart)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
Import-Module (Join-Path $PSScriptRoot "Deploy.Common.psm1") -Force

Assert-IsAdministrator

$root=Resolve-ProjectRoot $ProjectRoot
$paths=Initialize-DeployLayout $root
$config=Read-ServerConfig $root
Test-ServerConfiguration $config
$runtime=Get-RuntimeInfo $root
Write-JsonFileAtomic $paths.RuntimeState $runtime

$runner=Join-Path $root "deployment\Run-Production.ps1"
if (-not (Test-Path -LiteralPath $runner)) { throw "Task runner not found: $runner" }
$taskName=[string]$config.SCHEDULED_TASK_NAME
$arguments='-NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "'+$runner+'" -ProjectRoot "'+$root+'"'
$action=New-ScheduledTaskAction -Execute ([string]$runtime.powershellPath) -Argument $arguments
$trigger=New-ScheduledTaskTrigger -AtStartup
$settings=New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew
$taskPrincipal=New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest
Register-ScheduledTask -TaskName $taskName -Description "GeoLGU cadastral map production service" -Action $action -Trigger $trigger -Settings $settings -Principal $taskPrincipal -Force | Out-Null
Write-Host "[OK] Scheduled Task '$taskName' is registered for startup."
if (-not $NoStart -and (Read-ReleaseState $root)) { Start-GeoLguService $taskName }
