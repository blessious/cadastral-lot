$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$statusPath = Join-Path $projectRoot "repair-sqlexpress-auth.status.txt"
$configPath = Join-Path $projectRoot "server_config.env"
$serverReg = "HKLM:\SOFTWARE\Microsoft\Microsoft SQL Server\MSSQL17.SQLEXPRESS\MSSQLServer"

function Read-ServerConfig {
  if (-not (Test-Path -LiteralPath $configPath)) {
    throw "Missing server_config.env. Copy server_config.example.env to server_config.env and set DB_DATABASE, DB_USERNAME, and DB_PASSWORD."
  }

  $config = @{}
  Get-Content -LiteralPath $configPath | ForEach-Object {
    $line = $_.Trim()
    if (-not $line -or $line.StartsWith("#") -or -not $line.Contains("=")) {
      return
    }
    $key, $value = $line.Split("=", 2)
    $config[$key.Trim()] = $value.Trim()
  }

  foreach ($required in @("DB_DATABASE", "DB_USERNAME", "DB_PASSWORD")) {
    if (-not $config[$required]) {
      throw "Missing $required in server_config.env."
    }
  }

  return $config
}

function Quote-SqlName($name) {
  return "[" + $name.Replace("]", "]]") + "]"
}

function Quote-SqlString($value) {
  return "N'" + $value.Replace("'", "''") + "'"
}

function Write-Status($message) {
  $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
  Add-Content -LiteralPath $statusPath -Value "[$timestamp] $message"
}

$config = Read-ServerConfig
$dbName = $config["DB_DATABASE"]
$loginName = $config["DB_USERNAME"]
$loginPassword = $config["DB_PASSWORD"]
$quotedDbName = Quote-SqlName $dbName
$quotedLoginName = Quote-SqlName $loginName
$loginNameLiteral = Quote-SqlString $loginName
$loginNameLiteralForDynamicSql = $loginNameLiteral.Replace("'", "''")
$loginPasswordLiteral = Quote-SqlString $loginPassword

try {
  Set-Content -LiteralPath $statusPath -Value "Starting SQLEXPRESS auth repair..."

  Set-ItemProperty -Path $serverReg -Name LoginMode -Value 2
  Write-Status "Set SQL Server authentication mode to Mixed Mode."

  Restart-Service -Name "MSSQL`$SQLEXPRESS" -Force
  Start-Sleep -Seconds 8
  Write-Status "Restarted SQL Server (SQLEXPRESS)."

  $connectionString = "Server=127.0.0.1,1433;Database=master;Integrated Security=True;TrustServerCertificate=True;Encrypt=False;Connection Timeout=10"
  $connection = New-Object System.Data.SqlClient.SqlConnection $connectionString
  $connection.Open()

  $command = $connection.CreateCommand()
  $command.CommandText = @"
IF DB_ID($(Quote-SqlString $dbName)) IS NULL
  THROW 51000, 'Configured database does not exist.', 1;

IF SUSER_ID($loginNameLiteral) IS NULL
BEGIN
  CREATE LOGIN $quotedLoginName WITH PASSWORD = $loginPasswordLiteral, CHECK_POLICY = OFF, CHECK_EXPIRATION = OFF;
END
ELSE
BEGIN
  ALTER LOGIN $quotedLoginName WITH PASSWORD = $loginPasswordLiteral, CHECK_POLICY = OFF, CHECK_EXPIRATION = OFF;
  ALTER LOGIN $quotedLoginName ENABLE;
END

DECLARE @sql nvarchar(max) = N'
USE $quotedDbName;
IF USER_ID($loginNameLiteralForDynamicSql) IS NULL
  CREATE USER $quotedLoginName FOR LOGIN $quotedLoginName;
ALTER ROLE db_owner ADD MEMBER $quotedLoginName;
';
EXEC sp_executesql @sql;
"@
  [void]$command.ExecuteNonQuery()
  $connection.Close()
  Write-Status "Created or repaired SQL login and database user for $loginName."

  $test = New-Object System.Data.SqlClient.SqlConnection "Server=127.0.0.1,1433;Database=$dbName;User ID=$loginName;Password=$loginPassword;TrustServerCertificate=True;Encrypt=False;Connection Timeout=10"
  $test.Open()
  $test.Close()
  Write-Status "SUCCESS: $loginName can connect to $dbName on 127.0.0.1:1433."
} catch {
  Write-Status "FAILED: $($_.Exception.Message)"
  if ($_.Exception.InnerException) {
    Write-Status "INNER: $($_.Exception.InnerException.Message)"
  }
  throw
}
