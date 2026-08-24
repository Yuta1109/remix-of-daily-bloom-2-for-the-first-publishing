# Firebase login using the keepalive preload in THIS repo.
$ErrorActionPreference = "Stop"

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
Set-Location $RepoRoot
Remove-Item Env:NODE_OPTIONS -ErrorAction SilentlyContinue

$Keepalive = $null
foreach ($name in @("no-keepalive.cjs", "no-keepalive.cjs")) {
  $candidate = Join-Path $RepoRoot $name
  if (Test-Path $candidate) { $Keepalive = $candidate; break }
}
if (-not $Keepalive) { throw "Keepalive file not found in $RepoRoot" }

$env:NODE_OPTIONS = "--use-system-ca --require=$Keepalive"
Write-Host "Repo: $RepoRoot" -ForegroundColor Cyan
npx firebase login --reauth
$code = $LASTEXITCODE
Remove-Item Env:NODE_OPTIONS -ErrorAction SilentlyContinue
if ($code -ne 0) { throw "firebase login failed (exit $code)" }
