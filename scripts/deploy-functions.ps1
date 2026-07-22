# Deploy Firebase Cloud Functions the same way as README / prior successful deploys.
# Usage:
#   cd C:\Users\yutaa\remix-of-daily-bloom-2-for-the-first-publishing
#   .\scripts\deploy-functions.ps1
#
# If auth fails:
#   $env:NODE_OPTIONS = "--use-system-ca --require=$PWD\no-keepalive.cjs"
#   npx firebase login --reauth

$ErrorActionPreference = "Stop"

$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $RepoRoot

$ProjectId = "todolist-app-project-4fd37"
$Keepalive = Join-Path $RepoRoot "no-keepalive.cjs"

Write-Host "Repo: $RepoRoot" -ForegroundColor Cyan
Write-Host "Project: $ProjectId" -ForegroundColor Cyan

if (-not (Test-Path (Join-Path $RepoRoot "firebase.json"))) {
  throw "firebase.json not found."
}
if (-not (Test-Path $Keepalive)) {
  throw "no-keepalive.cjs not found at repo root."
}
if (-not (Test-Path (Join-Path $RepoRoot "functions\index.js"))) {
  throw "functions\index.js not found."
}

# Absolute path so --require still works after cd into functions/.
# Parent shells often set "./no-keepalive.cjs" which breaks npm install there.
$FirebaseNodeOptions = "--use-system-ca --require=$Keepalive"
$SavedNodeOptions = $env:NODE_OPTIONS

Write-Host "Installing functions dependencies..." -ForegroundColor Cyan
Push-Location (Join-Path $RepoRoot "functions")
try {
  # Clear NODE_OPTIONS for npm — no-keepalive is only needed for firebase CLI TLS.
  Remove-Item Env:NODE_OPTIONS -ErrorAction SilentlyContinue
  npm install
  if ($LASTEXITCODE -ne 0) { throw "npm install failed (exit $LASTEXITCODE)" }
} finally {
  Pop-Location
  if ($null -ne $SavedNodeOptions -and $SavedNodeOptions -ne "") {
    $env:NODE_OPTIONS = $SavedNodeOptions
  }
}

Write-Host "Deploying Cloud Functions via npx firebase..." -ForegroundColor Cyan
Set-Location $RepoRoot
$env:NODE_OPTIONS = $FirebaseNodeOptions
npx firebase deploy --only functions --project $ProjectId
$deployExit = $LASTEXITCODE

# Restore whatever the user had before this script.
if ($null -ne $SavedNodeOptions -and $SavedNodeOptions -ne "") {
  $env:NODE_OPTIONS = $SavedNodeOptions
} else {
  Remove-Item Env:NODE_OPTIONS -ErrorAction SilentlyContinue
}

if ($deployExit -ne 0) {
  Write-Host ""
  Write-Host "Deploy failed. If you saw Authentication Error, run:" -ForegroundColor Yellow
  Write-Host '  $env:NODE_OPTIONS = "--use-system-ca --require=$PWD\no-keepalive.cjs"' -ForegroundColor Yellow
  Write-Host "  npx firebase login --reauth" -ForegroundColor Yellow
  Write-Host "Then re-run .\scripts\deploy-functions.ps1" -ForegroundColor Yellow
  throw "firebase deploy failed (exit $deployExit)"
}

Write-Host "Done." -ForegroundColor Green
