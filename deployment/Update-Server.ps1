param([Parameter(Mandatory = $true)][string]$ProjectRoot,[switch]$SetupInvocation)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
Import-Module (Join-Path $PSScriptRoot "Deploy.Common.psm1") -Force

function Test-SamePath {
    param([AllowNull()][string]$Left,[AllowNull()][string]$Right)
    if (-not $Left -or -not $Right) { return $false }
    return [IO.Path]::GetFullPath($Left).TrimEnd('\','/').Equals([IO.Path]::GetFullPath($Right).TrimEnd('\','/'),[StringComparison]::OrdinalIgnoreCase)
}

function Get-DatasetVersionForRelease {
    param([string]$NodePath,[string]$WebRoot)
    $script=Join-Path $WebRoot "scripts\dataset-version.mjs"
    Push-Location -LiteralPath $WebRoot
    try { $output=@(& $NodePath $script); $code=$LASTEXITCODE } finally { Pop-Location }
    if ($code -ne 0) { throw "Could not determine the release dataset version (exit $code)." }
    return ($output -join "").Trim()
}

function Get-RegisteredWorktreePaths {
    param([string]$GitPath,[string]$RepositoryRoot)
    $lines=@(& $GitPath -C $RepositoryRoot worktree list --porcelain); if ($LASTEXITCODE -ne 0) { throw "Could not list Git worktrees." }
    return @($lines | Where-Object { $_ -like "worktree *" } | ForEach-Object { [IO.Path]::GetFullPath($_.Substring(9).Trim()).TrimEnd('\','/') })
}

function Assert-ReleaseWorktree {
    param([string]$GitPath,[string]$RepositoryRoot,[string]$ReleasePath,[string]$ExpectedCommit,[string]$ReleasesRoot)
    $resolved=Assert-PathInside $ReleasePath $ReleasesRoot
    $item=Get-Item -LiteralPath $resolved -ErrorAction Stop
    if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw "Release path must not be a junction or symbolic link: $resolved" }
    $registered=Get-RegisteredWorktreePaths $GitPath $RepositoryRoot
    if (-not ($registered | Where-Object { Test-SamePath $_ $resolved })) { throw "Existing release is not a registered Git worktree: $resolved" }
    $head=(& $GitPath -C $resolved rev-parse HEAD).Trim(); if ($LASTEXITCODE -ne 0 -or $head -ne $ExpectedCommit) { throw "Release worktree HEAD '$head' does not match '$ExpectedCommit'." }
    $dirty=@(& $GitPath -C $resolved status --porcelain --untracked-files=no); if ($LASTEXITCODE -ne 0 -or $dirty.Count) { throw "Release worktree contains tracked changes: $resolved" }
}

function Test-ActivationCompleted {
    param($Before,$After,[string]$ExpectedVersion)
    return [bool]$Before.search.staged.available -and -not [bool]$After.search.staged.available -and [bool]$After.search.active.available -and [string]$After.search.active.version -eq $ExpectedVersion
}

function Test-RollbackCompleted {
    param($Before,$After,[string]$ExpectedVersion)
    return [bool]$Before.search.previous.available -and -not [bool]$After.search.previous.available -and [bool]$After.search.staged.available -and [string]$After.search.active.version -eq $ExpectedVersion
}

$root=Resolve-ProjectRoot $ProjectRoot
$lock=$null
$transcriptStarted=$false
$candidate=$null
$release=$null
$activated=$false
$switchAttempted=$false
$oldState=$null
$config=$null
$runtime=$null
$preActivationStatus=$null
$version=""
$commit=""
try {
    Assert-IsAdministrator
    $lock=Enter-DeploymentLock $root
    Start-DeploymentTranscript $root "update" | Out-Null
    $transcriptStarted=$true

    $paths=Initialize-DeployLayout $root
    $config=Read-ServerConfig $root
    Test-ServerConfiguration $config
    Import-ServerEnvironment $config
    if (-not (Test-Path -LiteralPath $paths.RuntimeState)) { Write-JsonFileAtomic $paths.RuntimeState (Get-RuntimeInfo $root) }
    $runtime=Get-Content -LiteralPath $paths.RuntimeState -Raw | ConvertFrom-Json
    foreach($runtimePath in @([string]$runtime.nodePath,[string]$runtime.npmPath,[string]$runtime.gitPath)) { if (-not (Test-Path -LiteralPath $runtimePath -PathType Leaf)) { throw "Recorded runtime path no longer exists: $runtimePath. Run install_server_task.bat again." } }
    $taskName=[string]$config.SCHEDULED_TASK_NAME
    if (-not (Get-ScheduledTaskSafe $taskName)) { throw "Scheduled Task '$taskName' is not installed. Run install_server_task.bat as Administrator." }

    $branch=(& ([string]$runtime.gitPath) -C $root branch --show-current).Trim()
    if ($LASTEXITCODE -ne 0 -or $branch -ne [string]$config.DEPLOY_BRANCH) { throw "Deploy from branch '$($config.DEPLOY_BRANCH)'; current branch is '$branch'." }
    $dirty=@(& ([string]$runtime.gitPath) -C $root status --porcelain --untracked-files=no)
    if ($LASTEXITCODE -ne 0 -or $dirty.Count) { throw "Tracked files are modified. Commit or restore them before deploying.`n$($dirty -join [Environment]::NewLine)" }
    $commit=(& ([string]$runtime.gitPath) -C $root rev-parse HEAD).Trim()
    if ($commit -notmatch '^[0-9a-f]{40}$') { throw "Could not resolve the pulled Git commit." }

    $oldState=Read-ReleaseState $root
    $release=Join-Path $paths.Releases $commit
    if ($oldState -and (Test-SamePath ([string]$oldState.currentRelease) $release)) {
        $release=Join-Path $paths.Releases ($commit+"-"+[DateTime]::UtcNow.ToString("yyyyMMddHHmmssfff"))
    }
    Assert-PathInside $release $paths.Releases | Out-Null
    if (Test-Path -LiteralPath $release) {
        Assert-ReleaseWorktree ([string]$runtime.gitPath) $root $release $commit $paths.Releases
    } else {
        Invoke-ExternalCommand ([string]$runtime.gitPath) @("-C",$root,"worktree","add","--detach",$release,$commit) $root "create release worktree"
        Assert-ReleaseWorktree ([string]$runtime.gitPath) $root $release $commit $paths.Releases
    }
    $web=Join-Path $release "boac-gis"
    foreach($required in @("package.json","package-lock.json","public\geojson\index.json","public\geojson\search_index.json")) {
        if (-not (Test-Path -LiteralPath (Join-Path $web $required))) { throw "Release is missing $required." }
    }

    Write-Host "[1/8] Installing locked dependencies in isolated release..."
    # NODE_ENV is intentionally production for runtime processes, but release
    # validation also needs TypeScript, ESLint, tests, and Playwright.
    Invoke-ExternalCommand ([string]$runtime.npmPath) @("ci","--include=dev","--no-audit","--no-fund") $web "npm ci"
    Write-Host "[2/8] Running source and dataset checks..."
    foreach($script in @("typecheck","lint","test","verify:data")) { Invoke-NpmScript ([string]$runtime.npmPath) $web $script @() -Required | Out-Null }
    Write-Host "[3/8] Building production release..."
    Invoke-NpmScript ([string]$runtime.npmPath) $web "build" @() -Required | Out-Null
    $version=Get-DatasetVersionForRelease ([string]$runtime.nodePath) $web
    if ($version -notmatch '^[A-Za-z0-9._-]{6,64}$') { throw "Could not determine the release dataset version." }
    $env:RELEASE_COMMIT=$commit; $env:GIT_COMMIT=$commit

    Write-Host "[4/8] Applying idempotent migrations and staging search data..."
    Invoke-NpmScript ([string]$runtime.npmPath) $web "db:migrate" @() -Required | Out-Null
    if ($oldState -and $oldState.PSObject.Properties.Name -contains "previousDataAction" -and [string]$oldState.previousDataAction -eq "activate") {
        # A successful manual rollback keeps its inverse dataset in the staging slot.
        # The next stage operation necessarily replaces that slot, so stop advertising
        # the superseded release before the database transition begins.
        $oldState=[pscustomobject][ordered]@{
            schemaVersion=2; currentRelease=[string]$oldState.currentRelease; currentCommit=[string]$oldState.currentCommit; currentVersion=[string]$oldState.currentVersion
            previousRelease=$null; previousCommit=$null; previousVersion=$null; previousDataAction=$null
            activatedAt=[string]$oldState.activatedAt; recoveryReason="superseded-staged-rollback"
        }
        Write-ReleaseState $root $oldState
    }
    Invoke-NpmScript ([string]$runtime.npmPath) $web "map:stage" @("--expected-version",$version) -Required | Out-Null

    Write-Host "[5/8] Starting candidate on localhost:$($config.APP_CANDIDATE_PORT)..."
    Assert-PortAvailable ([int]$config.APP_CANDIDATE_PORT)
    $candidateOut=Join-Path $paths.Logs "candidate-$($commit.Substring(0,12)).stdout.log"
    $candidateErr=Join-Path $paths.Logs "candidate-$($commit.Substring(0,12)).stderr.log"
    $next=Join-Path $web "node_modules\next\dist\bin\next"
    $arguments='"'+$next+'" start -H "127.0.0.1" -p '+[string]$config.APP_CANDIDATE_PORT
    # Give the candidate its own hidden process window. Sharing the setup
    # console lets nested npm/Playwright commands interfere with the Next
    # process group on Windows PowerShell 5.1.
    $candidate=Start-Process -FilePath ([string]$runtime.nodePath) -ArgumentList $arguments -WorkingDirectory $web -RedirectStandardOutput $candidateOut -RedirectStandardError $candidateErr -PassThru -WindowStyle Hidden
    & (Join-Path $PSScriptRoot "Test-Release.ps1") -ProjectRoot $root -ReleasePath $release -BaseUrl ("http://127.0.0.1:"+$config.APP_CANDIDATE_PORT) -ExpectedCommit $commit -ExpectedVersion $version -Target staged -Process $candidate
    if ($candidate -and -not $candidate.HasExited) { Stop-Process -Id $candidate.Id -Force; $candidate.WaitForExit() }
    $candidate=$null

    Write-Host "[6/8] Switching production release..."
    $unmanagedProductionPids=@()
    if (-not $oldState) { $unmanagedProductionPids=@(Get-ListeningProcessIds ([int]$config.APP_PORT)) }
    if ($unmanagedProductionPids.Count) {
        if (-not $SetupInvocation) { throw "An unmanaged process is using the production port. Run setup_server.bat for the one-time managed-service handoff." }
        Write-Warning "First setup will replace the previously launched app on port $($config.APP_PORT) after the candidate has passed every pre-switch check. Emergency recovery remains available from the pre-deployment Git commit."
    }
    $preActivationStatus=Get-MapLifecycleStatus ([string]$runtime.nodePath) $web
    $switchAttempted=$true
    Stop-GeoLguService $taskName ([int]$config.APP_PORT) $root
    try {
        Invoke-NpmScript ([string]$runtime.npmPath) $web "map:activate" @("--expected-version",$version) -Required | Out-Null
        $activated=$true
    } catch {
        $activationFailure=$_
        try { $after=Get-MapLifecycleStatus ([string]$runtime.nodePath) $web; $activated=Test-ActivationCompleted $preActivationStatus $after $version } catch { $activated=$false }
        throw $activationFailure
    }

    $newState=[ordered]@{
        schemaVersion=2; currentRelease=$release; currentCommit=$commit; currentVersion=$version
        previousRelease=if($oldState){[string]$oldState.currentRelease}else{$null}
        previousCommit=if($oldState){[string]$oldState.currentCommit}else{$null}
        previousVersion=if($oldState){[string]$oldState.currentVersion}else{$null}
        previousDataAction=if($oldState){"rollback"}else{$null}
        activatedAt=[DateTime]::UtcNow.ToString("o")
    }
    Write-ReleaseState $root $newState
    Start-GeoLguService $taskName

    Write-Host "[7/8] Verifying local and public production health..."
    & (Join-Path $PSScriptRoot "Test-Release.ps1") -ProjectRoot $root -ReleasePath $release -BaseUrl ("http://127.0.0.1:"+$config.APP_PORT) -ExpectedCommit $commit -ExpectedVersion $version -Target active
    if (Test-TrueValue ([string]$config.DEPLOY_VERIFY_PUBLIC)) {
        Wait-GeoLguHealth -BaseUrl ([string]$config.PUBLIC_URL) -Target active -TimeoutSeconds ([int]$config.DEPLOY_HEALTH_TIMEOUT_SECONDS) -ExpectedCommit $commit -ExpectedVersion $version | Out-Null
    }

    Write-Host "[8/8] Retaining current and previous releases..."
    try {
        $keep=@($release); if ($oldState -and $oldState.currentRelease) { $keep += [string]$oldState.currentRelease }
        $stale=@(Get-ChildItem -LiteralPath $paths.Releases -Directory -ErrorAction SilentlyContinue | Where-Object {
            $directory=$_
            -not ($keep | Where-Object { Test-SamePath $_ $directory.FullName })
        })
        if ($stale.Count) {
            Write-Warning "Release is healthy. Skipping old-release cleanup for $($stale.Count) retained director$(if($stale.Count -eq 1){'y'}else{'ies'}) to avoid delaying production activation."
        }
    } catch { Write-Warning "Release is healthy, but release-retention inspection was incomplete: $($_.Exception.Message)" }
    Write-Host "[OK] Release $commit is active and healthy."
} catch {
    $failure=$_
    if ($candidate -and -not $candidate.HasExited) { try { Stop-Process -Id $candidate.Id -Force; $candidate.WaitForExit() } catch {} }
    if ($switchAttempted -and $config) {
        if ($activated) {
            try {
                Stop-GeoLguService ([string]$config.SCHEDULED_TASK_NAME) ([int]$config.APP_PORT) $root
                $priorVersion=if($oldState){[string]$oldState.currentVersion}else{[string]$preActivationStatus.search.active.version}
                $beforeRollback=Get-MapLifecycleStatus ([string]$runtime.nodePath) $web
                try {
                    $arguments=@(); if($priorVersion){$arguments=@("--expected-version",$priorVersion)}
                    Invoke-NpmScript ([string]$runtime.npmPath) $web "map:rollback" $arguments -Required | Out-Null
                } catch {
                    $rollbackFailure=$_; $afterRollback=Get-MapLifecycleStatus ([string]$runtime.nodePath) $web
                    if (-not (Test-RollbackCompleted $beforeRollback $afterRollback $priorVersion)) { throw $rollbackFailure }
                }
                if ($oldState) {
                    $recovered=[ordered]@{ schemaVersion=2; currentRelease=[string]$oldState.currentRelease; currentCommit=[string]$oldState.currentCommit; currentVersion=[string]$oldState.currentVersion; previousRelease=$null; previousCommit=$null; previousVersion=$null; previousDataAction=$null; activatedAt=[DateTime]::UtcNow.ToString("o"); recoveryReason="failed-deployment" }
                    Write-ReleaseState $root $recovered
                    Start-GeoLguService ([string]$config.SCHEDULED_TASK_NAME)
                    Wait-GeoLguHealth -BaseUrl ("http://127.0.0.1:"+$config.APP_PORT) -Target active -TimeoutSeconds ([int]$config.DEPLOY_HEALTH_TIMEOUT_SECONDS) -ExpectedCommit ([string]$recovered.currentCommit) -ExpectedVersion ([string]$recovered.currentVersion) | Out-Null
                } elseif (Test-Path -LiteralPath (Get-DeployPaths $root).CurrentState) {
                    Remove-Item -LiteralPath (Get-DeployPaths $root).CurrentState -Force
                }
            } catch { Write-Error "Automatic rollback also failed: $($_.Exception.Message)" }
        } elseif ($oldState) {
            try {
                Write-ReleaseState $root $oldState
                Start-GeoLguService ([string]$config.SCHEDULED_TASK_NAME)
                Wait-GeoLguHealth -BaseUrl ("http://127.0.0.1:"+$config.APP_PORT) -Target active -TimeoutSeconds ([int]$config.DEPLOY_HEALTH_TIMEOUT_SECONDS) -ExpectedCommit ([string]$oldState.currentCommit) -ExpectedVersion ([string]$oldState.currentVersion) | Out-Null
            } catch { Write-Error "The prior service could not be restarted: $($_.Exception.Message)" }
        }
    }
    throw $failure
} finally {
    if ($transcriptStarted) { try { Stop-Transcript | Out-Null } catch {} }
    if ($lock) { $lock.Dispose() }
}
