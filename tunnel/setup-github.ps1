# One-time setup: lets "9rayaverse ON" update the permanent GitHub Pages link automatically.
# You paste your GitHub token here; it is saved only on this PC (%APPDATA%\9rayaverse\github.json).
# (ASCII only on purpose: Windows PowerShell 5.1 misreads UTF-8 scripts without BOM.)
. (Join-Path $PSScriptRoot 'github-link.ps1')
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

Write-Host ''
Write-Host '  9rayaverse - lien thabet b GitHub Pages' -ForegroundColor Magenta
Write-Host ''
$owner = Read-Host '  Username GitHub mte3ek [mouhibswissi111-ship-it]'
if (-not $owner) { $owner = 'mouhibswissi111-ship-it' }
$repo = Read-Host '  Esm l repository [9rayaverse]'
if (-not $repo) { $repo = '9rayaverse' }
$secure = Read-Host '  Colli l token (github_pat_...) w enzel Entree' -AsSecureString
$token = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)).Trim()
if (-not $token) { Write-Host '  Ma 7attitch token.' -ForegroundColor Red; Read-Host '  Entree bech tsakker'; exit 1 }

$headers = @{ Authorization = "Bearer $token"; Accept = 'application/vnd.github+json'; 'User-Agent' = '9rayaverse-tunnel' }
try {
  Invoke-RestMethod -Uri "https://api.github.com/repos/$owner/$repo" -Headers $headers -Method Get | Out-Null
} catch {
  Write-Host "  Token walla repository ghalet: $($_.Exception.Message)" -ForegroundColor Red
  Read-Host '  Entree bech tsakker'; exit 1
}

New-Item -ItemType Directory -Force (Split-Path $GithubConfigPath) | Out-Null
@{ owner = $owner; repo = $repo; token = $token } | ConvertTo-Json | Set-Content -Path $GithubConfigPath -Encoding Ascii

if (Update-GithubLink 'offline') {
  Write-Host ''
  Write-Host '  [OK] Kol chay mriguel!' -ForegroundColor Green
  Write-Host "  L lien thabet mte3ek: $(Get-GithubPagesUrl ([pscustomobject]@{ owner = $owner; repo = $repo }))" -ForegroundColor Green
  Write-Host '  Mel tawa, "9rayaverse ON" ybaddlou wa7dou kol marra.' -ForegroundColor Green
} else {
  Write-Host '  Token ykhdem ama ma najjamtech nekteb docs/url.txt. Thabbet elli 3tit "Contents: Read and write".' -ForegroundColor Red
}
Read-Host '  Entree bech tsakker'
