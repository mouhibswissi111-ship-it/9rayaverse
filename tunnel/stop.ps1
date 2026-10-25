# 9rayaverse OFF: stops the tunnel, the real-time server, Apache and MySQL.
# (ASCII only on purpose: Windows PowerShell 5.1 misreads UTF-8 scripts without BOM.)
Get-Process cloudflared -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -match 'server\.js' } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
Get-Process httpd -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
& 'C:\xampp\mysql\bin\mysqladmin.exe' -u root shutdown 2>$null
Remove-Item (Join-Path $PSScriptRoot 'current-url.txt') -ErrorAction SilentlyContinue
. (Join-Path $PSScriptRoot 'github-link.ps1')
if (Get-GithubConfig) { [void](Update-GithubLink 'offline') }   # the permanent link now says "msakker tawa"
Write-Host '9rayaverse msakker. Bslema!' -ForegroundColor Magenta
Start-Sleep 2
