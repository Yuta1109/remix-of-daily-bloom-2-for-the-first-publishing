# Deploy Cloud Functions + Firestore rules for Essences.
# Always uses THIS repo (the folder that contains this script), even if you
# started PowerShell in remix-of-daily-bloom or another directory.
#
# From anywhere:
#   powershell -ExecutionPolicy Bypass -File C:\Users\yutaa\remix-of-daily-bloom-2-for-the-first-publishing\scripts\deploy-functions.ps1
#
# From this repo:
#   npm run deploy
#   .\deploy-functions.cmd

$ErrorActionPreference = "Stop"

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
Set-Location $RepoRoot

$ProjectId = "todolist-app-project-4fd37"

function Find-KeepaliveFile {
  foreach ($name in @("no-keepalive.cjs", "no-keepalive.cjs", "no-keepalive.js")) {
    $candidate = Join-Path $RepoRoot $name
    if (Test-Path $candidate) { return $candidate }
  }
  return $null
}

# Leftover NODE_OPTIONS from a previous command (wrong folder / missing preload) break Node.
Remove-Item Env:NODE_OPTIONS -ErrorAction SilentlyContinue

$Keepalive = Find-KeepaliveFile
if (-not $Keepalive) {
  throw "Keepalive preload file not found in $RepoRoot (expected no-keepalive.cjs)."
}
if (-not (Test-Path (Join-Path $RepoRoot "firebase.json"))) {
  throw "firebase.json not found in $RepoRoot"
}
if (-not (Test-Path (Join-Path $RepoRoot "functions\index.js"))) {
  throw "functions\index.js not found in $RepoRoot"
}

Write-Host "Repo: $RepoRoot" -ForegroundColor Cyan
Write-Host "Project: $ProjectId" -ForegroundColor Cyan
Write-Host "Keepalive: $Keepalive" -ForegroundColor Cyan

Write-Host "Installing functions dependencies..." -ForegroundColor Cyan
Push-Location (Join-Path $RepoRoot "functions")
try {
  npm install
  if ($LASTEXITCODE -ne 0) { throw "npm install failed (exit $LASTEXITCODE)" }
} finally {
  Pop-Location
}

# Absolute --require so it still works after npm cd's around.
$env:NODE_OPTIONS = "--use-system-ca --require=$Keepalive"

Write-Host "Deploying functions and Firestore rules..." -ForegroundColor Cyan
npx firebase deploy --only functions,firestore:rules --project $ProjectId
$deployExit = $LASTEXITCODE

Remove-Item Env:NODE_OPTIONS -ErrorAction SilentlyContinue

if ($deployExit -ne 0) {
  Write-Host ""
  Write-Host "Deploy failed. From THIS repo, log in then retry:" -ForegroundColor Yellow
  Write-Host "  cd `"$RepoRoot`"" -ForegroundColor Yellow
  Write-Host "  npm run firebase:login" -ForegroundColor Yellow
  Write-Host "  npm run deploy" -ForegroundColor Yellow
  throw "firebase deploy failed (exit $deployExit)"
}

Write-Host "Done." -ForegroundColor Green
Write-Host ""
Write-Host "OCR requires GEMINI_API_KEY (Google AI Studio, not Firebase Web API key)." -ForegroundColor Yellow
Write-Host "  npm run gemini:secret   # first time or when key changes" -ForegroundColor Yellow
Write-Host "  npm run deploy          # again after setting the secret" -ForegroundColor Yellow
