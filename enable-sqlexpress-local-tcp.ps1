$ErrorActionPreference = "Stop"

$tcpBase = "HKLM:\SOFTWARE\Microsoft\Microsoft SQL Server\MSSQL17.SQLEXPRESS\MSSQLServer\SuperSocketNetLib\Tcp"

Set-ItemProperty -Path $tcpBase -Name Enabled -Value 1
Set-ItemProperty -Path $tcpBase -Name ListenOnAllIPs -Value 0

Get-ChildItem $tcpBase |
  Where-Object { $_.PSChildName -like "IP*" -and $_.PSChildName -ne "IPAll" } |
  ForEach-Object {
    $props = Get-ItemProperty $_.PSPath
    if ($props.IpAddress -eq "127.0.0.1") {
      Set-ItemProperty -Path $_.PSPath -Name Enabled -Value 1
      Set-ItemProperty -Path $_.PSPath -Name TcpDynamicPorts -Value ""
      Set-ItemProperty -Path $_.PSPath -Name TcpPort -Value "1433"
    } else {
      Set-ItemProperty -Path $_.PSPath -Name Enabled -Value 0
      Set-ItemProperty -Path $_.PSPath -Name TcpDynamicPorts -Value ""
      Set-ItemProperty -Path $_.PSPath -Name TcpPort -Value ""
    }
  }

Set-ItemProperty -Path "$tcpBase\IPAll" -Name TcpDynamicPorts -Value ""
Set-ItemProperty -Path "$tcpBase\IPAll" -Name TcpPort -Value ""

Restart-Service -Name "MSSQL`$SQLEXPRESS" -Force
Start-Sleep -Seconds 5

$listener = netstat -ano -p tcp | Select-String -Pattern "127\.0\.0\.1:1433\s+.*LISTENING"
if (-not $listener) {
  throw "SQLEXPRESS restarted, but 127.0.0.1:1433 is not listening."
}

Write-Host "SQLEXPRESS is now listening on 127.0.0.1:1433."
Read-Host "Press Enter to close"
