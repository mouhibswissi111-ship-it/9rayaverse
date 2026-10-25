# =====================================================================
#  9rayaverse ON: starts MySQL, Apache, the real-time server and a free
#  Cloudflare Quick Tunnel, then shows the public https link.
#  Keep this window open while people use the site. Close it (or Ctrl+C) to go offline.
#  (ASCII only on purpose: Windows PowerShell 5.1 misreads UTF-8 scripts without BOM.)
# =====================================================================
param([switch]$NoBrowser)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'github-link.ps1')
$app = Split-Path -Parent $PSScriptRoot
$xampp = 'C:\xampp'
$env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User')
$cloudflared = (Get-Command cloudflared -ErrorAction SilentlyContinue).Source
if (-not $cloudflared) { $cloudflared = 'C:\Program Files (x86)\cloudflared\cloudflared.exe' }

function Test-Port([int]$port) { [bool](Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue) }
function Wait-Port([int]$port, [string]$name) {
  for ($i = 0; $i -lt 40; $i++) { if (Test-Port $port) { Write-Host "  [OK] $name" -ForegroundColor Green; return }; Start-Sleep -Milliseconds 500 }
  throw "$name ma ch3elch (port $port). Thabbet fel XAMPP Control Panel."
}

Write-Host ''
Write-Host '  9rayaverse - nch3lou kol chay...' -ForegroundColor Magenta

if (-not (Test-Port 3306)) { Start-Process "$xampp\mysql\bin\mysqld.exe" -ArgumentList '--defaults-file=C:\xampp\mysql\bin\my.ini', '--standalone' -WindowStyle Hidden }
Wait-Port 3306 'MySQL'

if (-not (Test-Port 8090)) {
  Get-Process httpd -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
  Start-Sleep -Milliseconds 500
  Start-Process "$xampp\apache\bin\httpd.exe" -WindowStyle Hidden
}
Wait-Port 8090 'Apache (site 9rayaverse)'

if (-not (Test-Port 8080)) { Start-Process 'node' -ArgumentList 'server.js' -WorkingDirectory "$app\ws-server" -WindowStyle Hidden }
Wait-Port 8080 'Serveur temps reel'

Write-Host '  ... nconnectiw l internet (Cloudflare Tunnel)' -ForegroundColor Magenta
$shown = $false
# cloudflared prints its normal log on stderr. In Windows PowerShell 5.1 every stderr line becomes an
# error record, and with 'Stop' the first one would kill the script. Relax it and let cmd merge the
# streams so we only receive plain text lines.
$ErrorActionPreference = 'Continue'
cmd /c "`"$cloudflared`" tunnel --no-autoupdate --url http://127.0.0.1:8090 2>&1" | ForEach-Object {
  $line = "$_"
  if (-not $shown -and $line -match 'https://[a-z0-9-]+\.trycloudflare\.com') {
    $url = $Matches[0]
    $shown = $true
    Set-Content -Path (Join-Path $PSScriptRoot 'current-url.txt') -Value $url -Encoding Ascii
    $share = $url
    $cfg = Get-GithubConfig
    if ($cfg -and (Update-GithubLink $url)) { $share = Get-GithubPagesUrl $cfg }
    try { Set-Clipboard -Value $share } catch {}
    Write-Host ''
    Write-Host '  =====================================================' -ForegroundColor Green
    if ($share -ne $url) {
      Write-Host "   Lien THABET (ab3athou lel s7ab):  $share" -ForegroundColor Green
      Write-Host "   (ywassel l: $url - yetbadel wa7dou, 30 s 7atta 1 d9)" -ForegroundColor Green
    } else {
      Write-Host "   9rayaverse fel internet:  $url" -ForegroundColor Green
      Write-Host '   L lien yetbaddel kol marra (bech ykoun thabet: setup-github)' -ForegroundColor Yellow
    }
    Write-Host '   (l lien tcopia)' -ForegroundColor Green
    Write-Host '  =====================================================' -ForegroundColor Green
    Write-Host '   Khalli l fenetre hedhi ma7loula. Bech tsakker: sakkerha.' -ForegroundColor Yellow
    Write-Host ''
    if (-not $NoBrowser) { Start-Process $url }
  } elseif ($line -match 'ERR|error') {
    Write-Host "  ! $line" -ForegroundColor DarkYellow
  }
}
