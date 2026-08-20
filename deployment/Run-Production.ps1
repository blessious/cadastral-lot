param([Parameter(Mandatory = $true)][string]$ProjectRoot)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
Import-Module (Join-Path $PSScriptRoot "Deploy.Common.psm1") -Force

function Rotate-Log {
    param([string]$Path,[int]$MaxBytes,[int]$Keep)
    if (-not (Test-Path -LiteralPath $Path) -or (Get-Item -LiteralPath $Path).Length -lt $MaxBytes) { return }
    for ($index=$Keep-1; $index -ge 1; $index--) {
        $from="$Path.$index"; $to="$Path.$($index+1)"
        if (Test-Path -LiteralPath $from) { Move-Item -LiteralPath $from -Destination $to -Force }
    }
    Move-Item -LiteralPath $Path -Destination "$Path.1" -Force
}

$root=Resolve-ProjectRoot $ProjectRoot
$paths=Initialize-DeployLayout $root
$config=Read-ServerConfig $root
Test-ServerConfiguration $config
Import-ServerEnvironment $config

if (-not (Test-Path -LiteralPath $paths.RuntimeState)) { throw "Runtime state is missing. Run install_server_task.bat." }
$runtime=Get-Content -LiteralPath $paths.RuntimeState -Raw | ConvertFrom-Json
$state=Read-ReleaseState $root
if (-not $state -or -not $state.currentRelease) { throw "No active release is recorded. Run update_server.bat." }
$release=Assert-PathInside ([string]$state.currentRelease) $paths.Releases
$web=Join-Path $release "boac-gis"
foreach ($required in @((Join-Path $web "package.json"),(Join-Path $web ".next\BUILD_ID"),(Join-Path $web "node_modules\next\dist\bin\next"))) {
    if (-not (Test-Path -LiteralPath $required)) { throw "Active release is incomplete: $required" }
}

$env:APP_HOST=[string]$config.APP_HOST
$env:APP_PORT=[string]$config.APP_PORT
$env:RELEASE_COMMIT=[string]$state.currentCommit
$env:GIT_COMMIT=[string]$state.currentCommit

$maxBytes=[int]$config.DEPLOY_LOG_MAX_MB*1MB; $keep=[Math]::Max(1,[int]$config.DEPLOY_LOG_FILES_TO_KEEP)
$stdout=Join-Path $paths.Logs "production.stdout.log"; $stderr=Join-Path $paths.Logs "production.stderr.log"
Rotate-Log $stdout $maxBytes $keep; Rotate-Log $stderr $maxBytes $keep

$next=Join-Path $web "node_modules\next\dist\bin\next"
$arguments='"'+$next+'" start -H "'+[string]$config.APP_HOST+'" -p '+[string]$config.APP_PORT
$process=Start-Process -FilePath ([string]$runtime.nodePath) -ArgumentList $arguments -WorkingDirectory $web -RedirectStandardOutput $stdout -RedirectStandardError $stderr -PassThru -NoNewWindow
$process.WaitForExit()
exit $process.ExitCode
