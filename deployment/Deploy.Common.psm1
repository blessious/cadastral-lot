Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Resolve-ProjectRoot {
    param([Parameter(Mandatory = $true)][string]$ProjectRoot)
    return [IO.Path]::GetFullPath($ProjectRoot).TrimEnd('\', '/')
}

function Get-DeployPaths {
    param([Parameter(Mandatory = $true)][string]$ProjectRoot)
    $root = Resolve-ProjectRoot $ProjectRoot
    $deploy = Join-Path $root ".deploy"
    [pscustomobject]@{
        ProjectRoot = $root; WebRoot = Join-Path $root "boac-gis"; DeployRoot = $deploy
        Releases = Join-Path $deploy "releases"; State = Join-Path $deploy "state"
        Logs = Join-Path $deploy "logs"; Quarantine = Join-Path $deploy "quarantine"
        CurrentState = Join-Path $deploy "state\current-release.json"
        RuntimeState = Join-Path $deploy "state\runtime.json"
        LockFile = Join-Path $deploy "state\deployment.lock"
    }
}

function Initialize-DeployLayout {
    param([Parameter(Mandatory = $true)][string]$ProjectRoot)
    $paths = Get-DeployPaths $ProjectRoot
    foreach ($dir in @($paths.DeployRoot, $paths.Releases, $paths.State, $paths.Logs, $paths.Quarantine)) {
        if (-not (Test-Path -LiteralPath $dir -PathType Container)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
    }
    return $paths
}

function Assert-PathInside {
    param([string]$Path, [string]$Parent)
    $child = [IO.Path]::GetFullPath($Path).TrimEnd('\', '/')
    $root = [IO.Path]::GetFullPath($Parent).TrimEnd('\', '/')
    if (-not $child.StartsWith($root + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
        throw "Unsafe path '$child': expected a child of '$root'."
    }
    return $child
}

function Read-ServerConfig {
    param([string]$ProjectRoot)
    $path = Join-Path (Resolve-ProjectRoot $ProjectRoot) "server_config.env"
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw "Missing server configuration: $path" }
    $config = @{}
    foreach ($raw in Get-Content -LiteralPath $path) {
        $line = $raw.Trim()
        if (-not $line -or $line.StartsWith("#") -or -not $line.Contains("=")) { continue }
        $at = $line.IndexOf("="); $key = $line.Substring(0, $at).Trim(); $value = $line.Substring($at + 1).Trim()
        if ($value.Length -ge 2 -and (($value[0] -eq '"' -and $value[$value.Length - 1] -eq '"') -or ($value[0] -eq "'" -and $value[$value.Length - 1] -eq "'"))) { $value = $value.Substring(1, $value.Length - 2) }
        if ($key -notmatch '^[A-Za-z_][A-Za-z0-9_]*$') { throw "Invalid variable name in server_config.env: $key" }
        $config[$key] = $value
    }
    $defaults = @{ APP_HOST="127.0.0.1"; APP_PORT="3005"; APP_CANDIDATE_PORT="3006"; PUBLIC_URL="http://127.0.0.1:3005"; SCHEDULED_TASK_NAME="GeoLGU-CadMap"; DEPLOY_BRANCH="main"; DEPLOY_RELEASES_TO_KEEP="2"; DEPLOY_HEALTH_TIMEOUT_SECONDS="60"; DEPLOY_VERIFY_PUBLIC="true"; DEPLOY_RUN_RESPONSIVE_TESTS="true"; DEPLOY_BROWSER_CHANNEL="msedge"; DEPLOY_LOG_MAX_MB="10"; DEPLOY_LOG_FILES_TO_KEEP="5"; NEXT_ALLOWED_DEV_ORIGINS="localhost,127.0.0.1" }
    foreach ($entry in $defaults.GetEnumerator()) { if (-not $config.ContainsKey($entry.Key) -or [string]::IsNullOrWhiteSpace([string]$config[$entry.Key])) { $config[$entry.Key] = $entry.Value } }
    return $config
}

function Import-ServerEnvironment {
    param([hashtable]$Config)
    foreach ($key in $Config.Keys) { [Environment]::SetEnvironmentVariable([string]$key, [string]$Config[$key], "Process") }
    $env:NODE_ENV = "production"; $env:NEXT_TELEMETRY_DISABLED = "1"
}

function Test-TrueValue { param([AllowNull()][string]$Value) return @("1","true","yes","on") -contains ([string]$Value).Trim().ToLowerInvariant() }

function Assert-IsAdministrator {
    $principal = [Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
    if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
        throw "This operation must run as Administrator. Use the root BAT wrapper so Windows can request elevation."
    }
}

function Test-ServerConfiguration {
    param([hashtable]$Config)
    foreach ($key in @("DB_HOST","DB_PORT","DB_DATABASE","DB_USERNAME","AUTH_SECRET","PUBLIC_URL")) {
        if (-not $Config.ContainsKey($key) -or [string]::IsNullOrWhiteSpace([string]$Config[$key])) { throw "server_config.env is missing required value $key." }
    }
    if ([string]$Config.AUTH_SECRET -like "change-this*" -or ([string]$Config.AUTH_SECRET).Length -lt 32) { throw "AUTH_SECRET must be a unique random value of at least 32 characters." }
    foreach ($key in @("DB_PORT","APP_PORT","APP_CANDIDATE_PORT")) { $port=0; if (-not [int]::TryParse([string]$Config[$key],[ref]$port) -or $port -lt 1 -or $port -gt 65535) { throw "$key must be a valid TCP port." } }
    if ([int]$Config.APP_PORT -eq [int]$Config.APP_CANDIDATE_PORT) { throw "APP_PORT and APP_CANDIDATE_PORT must differ." }
    $uri=$null; if (-not [Uri]::TryCreate([string]$Config.PUBLIC_URL,[UriKind]::Absolute,[ref]$uri) -or $uri.Scheme -notin @("http","https")) { throw "PUBLIC_URL must be an absolute HTTP(S) URL." }
    if ([int]$Config.DEPLOY_RELEASES_TO_KEEP -lt 2) { throw "DEPLOY_RELEASES_TO_KEEP must be at least 2." }
}

function Get-CommandPath { param([string]$Name) $command=Get-Command $Name -ErrorAction Stop | Select-Object -First 1; if (-not $command.Source) { throw "Could not resolve $Name." }; return [IO.Path]::GetFullPath($command.Source) }

function Get-RuntimeInfo {
    param([string]$ProjectRoot)
    if ($PSVersionTable.PSVersion -lt [Version]"5.1") { throw "Windows PowerShell 5.1 or newer is required." }
    $node=Get-CommandPath "node.exe"; $version=(& $node --version).Trim()
    $parsedVersion=$null
    if ($version -match '^v(?<semver>\d+\.\d+\.\d+)') { $parsedVersion=[Version]$Matches.semver }
    if ($LASTEXITCODE -ne 0 -or -not $parsedVersion -or $parsedVersion -lt [Version]"20.9.0") { throw "Node.js 20.9.0 or newer is required; found $version." }
    [ordered]@{ schemaVersion=1; projectRoot=Resolve-ProjectRoot $ProjectRoot; nodePath=$node; npmPath=Get-CommandPath "npm.cmd"; gitPath=Get-CommandPath "git.exe"; powershellPath=[Diagnostics.Process]::GetCurrentProcess().MainModule.FileName; nodeVersion=$version; recordedAt=[DateTime]::UtcNow.ToString("o") }
}

function Write-AtomicText {
    param([string]$Path,[string]$Content)
    $dir=Split-Path -Parent $Path; if (-not (Test-Path -LiteralPath $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
    $temp=Join-Path $dir (([IO.Path]::GetFileName($Path))+"."+[Guid]::NewGuid().ToString("N")+".tmp")
    [IO.File]::WriteAllText($temp,$Content,(New-Object Text.UTF8Encoding($false)))
    try { if (Test-Path -LiteralPath $Path) { $backup=$Path+".replace-backup"; if (Test-Path -LiteralPath $backup) { Remove-Item -LiteralPath $backup -Force }; [IO.File]::Replace($temp,$Path,$backup,$true); if (Test-Path -LiteralPath $backup) { Remove-Item -LiteralPath $backup -Force } } else { Move-Item -LiteralPath $temp -Destination $Path } } finally { if (Test-Path -LiteralPath $temp) { Remove-Item -LiteralPath $temp -Force } }
}
function Write-JsonFileAtomic { param([string]$Path,$Value) Write-AtomicText $Path (($Value | ConvertTo-Json -Depth 10)+[Environment]::NewLine) }
function Read-ReleaseState { param([string]$ProjectRoot) $path=(Get-DeployPaths $ProjectRoot).CurrentState; if (-not (Test-Path -LiteralPath $path)) { return $null }; return Get-Content -LiteralPath $path -Raw | ConvertFrom-Json }
function Write-ReleaseState { param([string]$ProjectRoot,$State) $paths=Initialize-DeployLayout $ProjectRoot; Write-JsonFileAtomic $paths.CurrentState $State }

function Enter-DeploymentLock {
    param([string]$ProjectRoot)
    $path=(Initialize-DeployLayout $ProjectRoot).LockFile
    try { return [IO.File]::Open($path,[IO.FileMode]::OpenOrCreate,[IO.FileAccess]::ReadWrite,[IO.FileShare]::None) } catch [IO.IOException] { throw "Another setup, update, or rollback is already running." }
}

function Invoke-ExternalCommand {
    param([string]$FilePath,[string[]]$Arguments=@(),[string]$WorkingDirectory="",[string]$Description="command")
    if ($WorkingDirectory) { Push-Location -LiteralPath $WorkingDirectory }
    try {
        # Write native output to the host so callers may suppress the helper's
        # Boolean return value without also hiding build/test diagnostics.
        & $FilePath @Arguments 2>&1 | ForEach-Object { Write-Host $_ }
        $code=$LASTEXITCODE
    } finally { if ($WorkingDirectory) { Pop-Location } }
    if ($code -ne 0) { throw "$Description failed with exit code $code." }
}
function Get-PackageScripts { param([string]$WebRoot) $pkg=Get-Content -LiteralPath (Join-Path $WebRoot "package.json") -Raw | ConvertFrom-Json; if (-not $pkg.scripts) { return @() }; return @($pkg.scripts.PSObject.Properties | ForEach-Object {$_.Name}) }
function Invoke-NpmScript {
    param([string]$NpmPath,[string]$WebRoot,[string]$Script,[string[]]$ScriptArguments=@(),[switch]$Required)
    if ((Get-PackageScripts $WebRoot) -notcontains $Script) { if ($Required) { throw "Required npm script '$Script' is missing." }; return $false }
    $args=@("run",$Script); if ($ScriptArguments.Count) { $args += "--"; $args += $ScriptArguments }
    Invoke-ExternalCommand $NpmPath $args $WebRoot "npm run $Script"; return $true
}

function Get-MapLifecycleStatus {
    param(
        [Parameter(Mandatory = $true)][string]$NodePath,
        [Parameter(Mandatory = $true)][string]$WebRoot
    )
    $script = Join-Path $WebRoot "scripts\map-data-lifecycle.mjs"
    if (-not (Test-Path -LiteralPath $script -PathType Leaf)) { throw "Map lifecycle script is missing: $script" }
    Push-Location -LiteralPath $WebRoot
    try {
        $output = @(& $NodePath $script status)
        $code = $LASTEXITCODE
    } finally {
        Pop-Location
    }
    if ($code -ne 0) { throw "Map lifecycle status failed with exit code $code." }
    try {
        return ($output -join [Environment]::NewLine) | ConvertFrom-Json
    } catch {
        throw "Map lifecycle status did not return valid JSON: $($_.Exception.Message)"
    }
}

function Get-ListeningProcessIds {
    param([int]$Port)
    if (Get-Command Get-NetTCPConnection -ErrorAction SilentlyContinue) { return @(Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique) }
    $ids=@(); foreach ($line in (& netstat.exe -ano -p tcp)) { if ($line -match ":$Port\s+.*LISTENING\s+(?<pid>\d+)\s*$") { $ids += [int]$Matches.pid } }; return @($ids | Select-Object -Unique)
}
function Assert-PortAvailable { param([int]$Port) $ids=@(Get-ListeningProcessIds $Port); if ($ids.Count) { throw "Port $Port is already in use by PID(s): $($ids -join ', ')." } }
function Get-ScheduledTaskSafe { param([string]$TaskName) return Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue }

function Stop-GeoLguService {
    param([string]$TaskName,[int]$Port,[string]$ProjectRoot)
    $task=Get-ScheduledTaskSafe $TaskName; if ($task -and $task.State -ne "Disabled") { Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue }
    Start-Sleep -Milliseconds 750
    foreach ($id in @(Get-ListeningProcessIds $Port)) {
        $info=Get-CimInstance Win32_Process -Filter "ProcessId = $id" -ErrorAction SilentlyContinue; $cmd=if($info){[string]$info.CommandLine}else{""}
        if (-not $cmd -or $cmd -notmatch '(?i)(next(?:\.cmd|\.js)?\s+start|next\\dist\\bin\\next|boac-gis)') { throw "Refusing to stop unexpected PID $id on production port $Port. Command: $cmd" }
        Stop-Process -Id $id -Force
    }
    $until=[DateTime]::UtcNow.AddSeconds(10); while (@(Get-ListeningProcessIds $Port).Count -and [DateTime]::UtcNow -lt $until) { Start-Sleep -Milliseconds 250 }
    if (@(Get-ListeningProcessIds $Port).Count) { throw "Production port $Port did not stop within 10 seconds." }
}
function Start-GeoLguService {
    param([string]$TaskName)
    $task=Get-ScheduledTaskSafe $TaskName
    if (-not $task) { throw "Scheduled Task '$TaskName' is not installed. Run install_server_task.bat as Administrator." }
    if ($task.State -eq "Disabled") { throw "Scheduled Task '$TaskName' is disabled." }
    if ($task.State -ne "Running") { Start-ScheduledTask -TaskName $TaskName }
}

function Wait-GeoLguHealth {
    param([string]$BaseUrl,[ValidateSet("active","staged")][string]$Target="active",[int]$TimeoutSeconds,[string]$ExpectedCommit="",[string]$ExpectedVersion="",[Diagnostics.Process]$Process=$null)
    $uri=$BaseUrl.TrimEnd('/')+"/api/health?target="+$Target; $until=[DateTime]::UtcNow.AddSeconds($TimeoutSeconds); $last="No response."
    do {
        if ($Process -and $Process.HasExited) { throw "Candidate server exited with code $($Process.ExitCode)." }
        try {
            $response=Invoke-WebRequest -Uri $uri -UseBasicParsing -TimeoutSec 10 -Headers @{"Cache-Control"="no-cache"}; $body=$response.Content | ConvertFrom-Json
            if ($response.StatusCode -ne 200 -or $body.status -ne "ok" -or [string]$body.target -ne $Target) { throw "Health status/target was not ready." }
            if ($ExpectedCommit -and [string]$body.release.commit -ne $ExpectedCommit) { throw "Health commit did not match $ExpectedCommit." }
            if ($ExpectedVersion -and ([string]$body.dataset.publishedVersion -ne $ExpectedVersion -or [string]$body.dataset.targetVersion -ne $ExpectedVersion -or -not [bool]$body.dataset.versionAgreement)) { throw "Dataset version agreement failed for $ExpectedVersion." }
            return $body
        } catch { $last=$_.Exception.Message; Start-Sleep -Seconds 1 }
    } while ([DateTime]::UtcNow -lt $until)
    throw "Health check timed out at $uri. Last error: $last"
}

function Start-DeploymentTranscript { param([string]$ProjectRoot,[string]$Prefix) $paths=Initialize-DeployLayout $ProjectRoot; $path=Join-Path $paths.Logs ("$Prefix-"+[DateTime]::Now.ToString("yyyyMMdd-HHmmss")+".log"); Start-Transcript -LiteralPath $path -Append | Out-Null; return $path }

Export-ModuleMember -Function *
