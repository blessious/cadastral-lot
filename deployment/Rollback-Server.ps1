param([Parameter(Mandatory = $true)][string]$ProjectRoot)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
Import-Module (Join-Path $PSScriptRoot "Deploy.Common.psm1") -Force

function Test-ActivationCompleted {
    param($Before,$After,[string]$ExpectedVersion)
    return [bool]$Before.search.staged.available -and -not [bool]$After.search.staged.available -and [bool]$After.search.active.available -and [string]$After.search.active.version -eq $ExpectedVersion
}
function Test-RollbackCompleted {
    param($Before,$After,[string]$ExpectedVersion)
    return [bool]$Before.search.previous.available -and -not [bool]$After.search.previous.available -and [bool]$After.search.staged.available -and [string]$After.search.active.version -eq $ExpectedVersion
}
function Test-TransitionCompleted {
    param([string]$Action,$Before,$After,[string]$ExpectedVersion)
    if ($Action -eq "activate") { return Test-ActivationCompleted $Before $After $ExpectedVersion }
    return Test-RollbackCompleted $Before $After $ExpectedVersion
}

$root=Resolve-ProjectRoot $ProjectRoot
$lock=$null
$transcriptStarted=$false
$serviceStopAttempted=$false
$dataChanged=$false
$state=$null
$config=$null
$runtime=$null
$currentWeb=$null
$action="rollback"
try {
    Assert-IsAdministrator
    $lock=Enter-DeploymentLock $root
    Start-DeploymentTranscript $root "rollback" | Out-Null
    $transcriptStarted=$true

    $paths=Initialize-DeployLayout $root
    $config=Read-ServerConfig $root
    Test-ServerConfiguration $config
    Import-ServerEnvironment $config
    if (-not (Test-Path -LiteralPath $paths.RuntimeState -PathType Leaf)) { throw "Runtime state is missing. Run install_server_task.bat." }
    $runtime=Get-Content -LiteralPath $paths.RuntimeState -Raw | ConvertFrom-Json
    $state=Read-ReleaseState $root
    if (-not $state -or -not $state.previousRelease) { throw "No previous healthy release is recorded." }
    if ($state.PSObject.Properties.Name -contains "previousDataAction" -and $state.previousDataAction) { $action=[string]$state.previousDataAction }
    if ($action -notin @("rollback","activate")) { throw "Release state has unsupported previousDataAction '$action'." }

    $previous=Assert-PathInside ([string]$state.previousRelease) $paths.Releases
    $current=Assert-PathInside ([string]$state.currentRelease) $paths.Releases
    $previousWeb=Join-Path $previous "boac-gis"
    $currentWeb=Join-Path $current "boac-gis"
    foreach($build in @((Join-Path $previousWeb ".next\BUILD_ID"),(Join-Path $currentWeb ".next\BUILD_ID"))) { if (-not (Test-Path -LiteralPath $build)) { throw "Managed release build is incomplete: $build" } }
    $task=[string]$config.SCHEDULED_TASK_NAME
    if (-not (Get-ScheduledTaskSafe $task)) { throw "Scheduled Task '$task' is not installed." }

    $before=Get-MapLifecycleStatus ([string]$runtime.nodePath) $currentWeb
    $serviceStopAttempted=$true
    Stop-GeoLguService $task ([int]$config.APP_PORT) $root
    try {
        Invoke-NpmScript ([string]$runtime.npmPath) $currentWeb ("map:"+$action) @("--expected-version",[string]$state.previousVersion) -Required | Out-Null
        $dataChanged=$true
    } catch {
        $transitionFailure=$_
        try { $after=Get-MapLifecycleStatus ([string]$runtime.nodePath) $currentWeb; $dataChanged=Test-TransitionCompleted $action $before $after ([string]$state.previousVersion) } catch { $dataChanged=$false }
        if (-not $dataChanged) { throw $transitionFailure }
    }

    $nextAction=if($action -eq "rollback"){"activate"}else{"rollback"}
    $rolled=[ordered]@{
        schemaVersion=2
        currentRelease=[string]$state.previousRelease; currentCommit=[string]$state.previousCommit; currentVersion=[string]$state.previousVersion
        previousRelease=[string]$state.currentRelease; previousCommit=[string]$state.currentCommit; previousVersion=[string]$state.currentVersion
        previousDataAction=$nextAction
        activatedAt=[DateTime]::UtcNow.ToString("o")
    }
    Write-ReleaseState $root $rolled
    Start-GeoLguService $task
    & (Join-Path $PSScriptRoot "Test-Release.ps1") -ProjectRoot $root -ReleasePath $previous -BaseUrl ("http://127.0.0.1:"+$config.APP_PORT) -ExpectedCommit ([string]$rolled.currentCommit) -ExpectedVersion ([string]$rolled.currentVersion) -Target active
    if (Test-TrueValue ([string]$config.DEPLOY_VERIFY_PUBLIC)) { Wait-GeoLguHealth -BaseUrl ([string]$config.PUBLIC_URL) -Target active -TimeoutSeconds ([int]$config.DEPLOY_HEALTH_TIMEOUT_SECONDS) -ExpectedCommit ([string]$rolled.currentCommit) -ExpectedVersion ([string]$rolled.currentVersion) | Out-Null }
    Write-Host "[OK] Switched to previous release $($rolled.currentCommit). The inverse data action '$nextAction' is recorded for a successive rollback."
} catch {
    $failure=$_
    if ($serviceStopAttempted -and $state -and $config) {
        try {
            Stop-GeoLguService ([string]$config.SCHEDULED_TASK_NAME) ([int]$config.APP_PORT) $root
            if ($dataChanged) {
                $inverse=if($action -eq "rollback"){"activate"}else{"rollback"}
                $beforeCompensation=Get-MapLifecycleStatus ([string]$runtime.nodePath) $currentWeb
                try {
                    Invoke-NpmScript ([string]$runtime.npmPath) $currentWeb ("map:"+$inverse) @("--expected-version",[string]$state.currentVersion) -Required | Out-Null
                } catch {
                    $compensationFailure=$_
                    $afterCompensation=Get-MapLifecycleStatus ([string]$runtime.nodePath) $currentWeb
                    if (-not (Test-TransitionCompleted $inverse $beforeCompensation $afterCompensation ([string]$state.currentVersion))) { throw $compensationFailure }
                }
            }
            Write-ReleaseState $root $state
            Start-GeoLguService ([string]$config.SCHEDULED_TASK_NAME)
            Wait-GeoLguHealth -BaseUrl ("http://127.0.0.1:"+$config.APP_PORT) -Target active -TimeoutSeconds ([int]$config.DEPLOY_HEALTH_TIMEOUT_SECONDS) -ExpectedCommit ([string]$state.currentCommit) -ExpectedVersion ([string]$state.currentVersion) | Out-Null
        } catch { Write-Error "Failed to restore the pre-rollback release: $($_.Exception.Message)" }
    }
    throw $failure
} finally {
    if ($transcriptStarted) { try { Stop-Transcript | Out-Null } catch {} }
    if ($lock) { $lock.Dispose() }
}
