# Keeps the permanent GitHub Pages link (https://OWNER.github.io/REPO/) pointing at the current tunnel.
# Writes docs/url.txt in the GitHub repo through the GitHub API.
# The token lives only on this PC: %APPDATA%\9rayaverse\github.json (created by setup-github.ps1).
# (ASCII only on purpose: Windows PowerShell 5.1 misreads UTF-8 scripts without BOM.)

$GithubConfigPath = Join-Path $env:APPDATA '9rayaverse\github.json'

function Get-GithubConfig {
  if (-not (Test-Path $GithubConfigPath)) { return $null }
  try { return Get-Content $GithubConfigPath -Raw | ConvertFrom-Json } catch { return $null }
}

function Get-GithubPagesUrl($cfg) {
  return "https://$($cfg.owner).github.io/$($cfg.repo)/"
}

function Update-GithubLink([string]$value) {
  $cfg = Get-GithubConfig
  if (-not $cfg) { return $false }
  [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
  $api = "https://api.github.com/repos/$($cfg.owner)/$($cfg.repo)/contents/docs/url.txt"
  $headers = @{ Authorization = "Bearer $($cfg.token)"; Accept = 'application/vnd.github+json'; 'User-Agent' = '9rayaverse-tunnel' }
  try {
    $sha = $null
    try { $sha = (Invoke-RestMethod -Uri $api -Headers $headers -Method Get).sha } catch { }
    $body = @{
      message = "link: $value"
      content = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes($value))
      branch  = 'main'
    }
    if ($sha) { $body.sha = $sha }
    Invoke-RestMethod -Uri $api -Headers $headers -Method Put -Body ($body | ConvertTo-Json) -ContentType 'application/json' | Out-Null
    return $true
  } catch {
    Write-Host "  ! GitHub link ma tbaddelch: $($_.Exception.Message)" -ForegroundColor DarkYellow
    return $false
  }
}
