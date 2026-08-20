param(
    [Parameter(Mandatory = $true)][string]$ProjectRoot,
    [Parameter(Mandatory = $true)][string]$ReleasePath,
    [Parameter(Mandatory = $true)][string]$BaseUrl,
    [Parameter(Mandatory = $true)][string]$ExpectedCommit,
    [Parameter(Mandatory = $true)][string]$ExpectedVersion,
    [ValidateSet("active","staged")][string]$Target = "active",
    [switch]$SkipNpm,
    [System.Diagnostics.Process]$Process = $null
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
Import-Module (Join-Path $PSScriptRoot "Deploy.Common.psm1") -Force
$root=Resolve-ProjectRoot $ProjectRoot
$config=Read-ServerConfig $root
Import-ServerEnvironment $config
$runtime=Get-Content -LiteralPath (Get-DeployPaths $root).RuntimeState -Raw | ConvertFrom-Json
$timeout=[int]$config.DEPLOY_HEALTH_TIMEOUT_SECONDS
Wait-GeoLguHealth -BaseUrl $BaseUrl -Target $Target -TimeoutSeconds $timeout -ExpectedCommit $ExpectedCommit -ExpectedVersion $ExpectedVersion -Process $Process | Out-Null
if (-not $SkipNpm) {
    $web=Join-Path $ReleasePath "boac-gis"
    Invoke-NpmScript -NpmPath ([string]$runtime.npmPath) -WebRoot $web -Script "verify:release" -Required -ScriptArguments @("--base-url",$BaseUrl,"--target",$Target,"--expected-version",$ExpectedVersion,"--expected-commit",$ExpectedCommit) | Out-Null
    if (Test-TrueValue ([string]$config.DEPLOY_RUN_RESPONSIVE_TESTS)) {
        $priorBaseUrl=$env:PLAYWRIGHT_BASE_URL
        $priorChannel=$env:DEPLOY_BROWSER_CHANNEL
        $priorManageServer=$env:PLAYWRIGHT_MANAGE_SERVER
        try {
            $env:PLAYWRIGHT_BASE_URL=$BaseUrl
            $env:DEPLOY_BROWSER_CHANNEL=[string]$config.DEPLOY_BROWSER_CHANNEL
            Wait-GeoLguHealth -BaseUrl $BaseUrl -Target $Target -TimeoutSeconds $timeout -ExpectedCommit $ExpectedCommit -ExpectedVersion $ExpectedVersion -Process $Process | Out-Null
            if ($Process) {
                Write-Host "[CHECK] Candidate PID $($Process.Id) passed API verification. Handing temporary server ownership to Playwright."
                if (-not $Process.HasExited) { Stop-Process -Id $Process.Id -Force; $Process.WaitForExit() }
                $env:PLAYWRIGHT_MANAGE_SERVER="true"
            } else {
                $env:PLAYWRIGHT_MANAGE_SERVER="false"
            }
            Invoke-NpmScript -NpmPath ([string]$runtime.npmPath) -WebRoot $web -Script "test:responsive" -Required | Out-Null
            if (-not $Process) { Wait-GeoLguHealth -BaseUrl $BaseUrl -Target $Target -TimeoutSeconds $timeout -ExpectedCommit $ExpectedCommit -ExpectedVersion $ExpectedVersion | Out-Null }
        } finally {
            $env:PLAYWRIGHT_BASE_URL=$priorBaseUrl
            $env:DEPLOY_BROWSER_CHANNEL=$priorChannel
            $env:PLAYWRIGHT_MANAGE_SERVER=$priorManageServer
        }
    }
}
Write-Host "[OK] $Target release verification passed at $BaseUrl."
