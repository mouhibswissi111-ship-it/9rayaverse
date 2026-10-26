# One-time setup: lets "9rayaverse ON" update the permanent GitHub Pages link automatically.
# You paste your GitHub token here; it is saved only on this PC (%APPDATA%\9rayaverse\github.json).
# (ASCII only on purpose: Windows PowerShell 5.1 misreads UTF-8 scripts without BOM.)
. (Join-Path $PSScriptRoot 'github-link.ps1')
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

function Get-HttpStatus($err) {
  try { return [int]$err.Exception.Response.StatusCode } catch { return 0 }
}

Write-Host ''
Write-Host '  9rayaverse - lien thabet b GitHub Pages' -ForegroundColor Magenta
Write-Host '  (ken t7eb tsakker: Ctrl+C)' -ForegroundColor DarkGray
Write-Host ''

$owner = 'mouhibswissi111-ship-it'
$repo = '9rayaverse'
$in = Read-Host "  Username GitHub [Entree = $owner]"
if ($in.Trim()) { $owner = $in.Trim() }
$in = Read-Host "  Esm l repository [Entree = $repo]"
if ($in.Trim()) { $repo = $in.Trim() }

# 1) Repository exists?
try {
  Invoke-RestMethod -Uri "https://api.github.com/repos/$owner/$repo" -Headers @{ 'User-Agent' = '9rayaverse-tunnel' } | Out-Null
  Write-Host "  [OK] Repository l9ineh: github.com/$owner/$repo" -ForegroundColor Green
} catch {
  Write-Host "  [X] Repository github.com/$owner/$repo mouch mawjoud. Thabbet fel username w l esm (bla espaces)." -ForegroundColor Red
  Read-Host '  Entree bech tsakker'; exit 1
}

# 2) Token: retry until it works
while ($true) {
  Write-Host ''
  Write-Host '  Colli l token (Ctrl+V walla clic droit), ma yodhharch wenti tcolli - normal.' -ForegroundColor Cyan
  $secure = Read-Host '  Token' -AsSecureString
  $token = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)).Trim()
  if (-not $token) { Write-Host '  [X] Ma colliit chay. 3awed.' -ForegroundColor Red; continue }
  if ($token -notmatch '^(github_pat_|ghp_)') {
    Write-Host "  [X] L token lezem yebda b github_pat_ (walla ghp_). Colliit $($token.Length) 7arf - thabbet elli copiit l token kemel." -ForegroundColor Red
    continue
  }
  $headers = @{ Authorization = "Bearer $token"; Accept = 'application/vnd.github+json'; 'User-Agent' = '9rayaverse-tunnel' }
  try {
    $me = Invoke-RestMethod -Uri 'https://api.github.com/user' -Headers $headers
  } catch {
    Write-Host '  [X] GitHub ma 9belch l token (ghalet, mnfassekh walla wfe). A3mel wa7ed jdid w colli kemel.' -ForegroundColor Red
    continue
  }
  if ($me.login -ne $owner) { Write-Host "  [!] L token mta3 '$($me.login)' mouch '$owner'." -ForegroundColor Yellow }

  # 3) Can it write docs/url.txt?
  New-Item -ItemType Directory -Force (Split-Path $GithubConfigPath) | Out-Null
  @{ owner = $owner; repo = $repo; token = $token } | ConvertTo-Json | Set-Content -Path $GithubConfigPath -Encoding Ascii
  if (Update-GithubLink 'offline') { break }
  Remove-Item $GithubConfigPath -ErrorAction SilentlyContinue
  Write-Host '  [X] L token ykhdem ama ma 3andouch l 7a9 yekteb fel repository.' -ForegroundColor Red
  Write-Host "      Fi GitHub, fel token: Repository access = Only select -> $repo, w Permissions -> Contents = Read and write." -ForegroundColor Red
  Write-Host '      Baddel l token (walla a3mel jdid) w colli men jdid.' -ForegroundColor Red
}

Write-Host ''
Write-Host '  [OK] Kol chay mriguel!' -ForegroundColor Green
Write-Host "  L lien thabet mte3ek: https://$owner.github.io/$repo/" -ForegroundColor Green
Write-Host '  Mel tawa, "9rayaverse ON" ybaddlou wa7dou kol marra.' -ForegroundColor Green
Read-Host '  Entree bech tsakker'
