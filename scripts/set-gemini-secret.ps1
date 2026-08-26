# Register Google AI Studio API key as Firebase secret GEMINI_API_KEY.
# This is NOT the Firebase Web API key (VITE_FIREBASE_* / GoogleService-Info).
#
# 1. Open https://aistudio.google.com/apikey and create a key for project
#    todolist-app-project-4fd37 (or any project with Generative Language API).
# 2. Run: npm run gemini:secret
# 3. Redeploy: npm run deploy

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

function Test-GeminiApiKeyFormat([string]$Key) {
  $k = $Key.Trim().Trim('"').Trim("'")
  if (-not $k) { return @{ ok = $false; reason = "empty" } }
  if ($k.Length -lt 30) { return @{ ok = $false; reason = "too-short" } }
  if ($k -notmatch '^AIza[0-9A-Za-z_-]+$') {
    if ($k.StartsWith("AQ.") -or $k.StartsWith("ya29.")) {
      return @{ ok = $false; reason = "oauth-token" }
    }
    return @{ ok = $false; reason = "bad-format" }
  }
  return @{ ok = $true; reason = $null }
}

Remove-Item Env:NODE_OPTIONS -ErrorAction SilentlyContinue

$Keepalive = Find-KeepaliveFile
if (-not $Keepalive) {
  throw "Keepalive preload file not found in $RepoRoot (expected no-keepalive.cjs)."
}

Write-Host ""
Write-Host "Gemini OCR needs a Google AI Studio API key in Secret Manager." -ForegroundColor Cyan
Write-Host "Get one here: https://aistudio.google.com/apikey" -ForegroundColor Yellow
Write-Host "Do NOT paste the Firebase Web API key from GoogleService-Info.plist." -ForegroundColor Yellow
Write-Host "Do NOT paste OAuth/access tokens (often start with AQ. or ya29.)." -ForegroundColor Yellow
Write-Host ""
Write-Host "Repo: $RepoRoot" -ForegroundColor Cyan
Write-Host "Project: $ProjectId" -ForegroundColor Cyan

$apiKey = $null
while ($true) {
  $apiKey = Read-Host "Paste Google AI Studio API key (starts with AIza)"
  $check = Test-GeminiApiKeyFormat $apiKey
  if ($check.ok) { break }
  switch ($check.reason) {
    "empty" { Write-Host "Key cannot be empty." -ForegroundColor Red }
    "too-short" { Write-Host "Key is too short. Copy the full AIza key from Google AI Studio." -ForegroundColor Red }
    "oauth-token" {
      Write-Host "That looks like an OAuth/access token, not an API key." -ForegroundColor Red
      Write-Host "Create a key at https://aistudio.google.com/apikey (starts with AIza)." -ForegroundColor Yellow
    }
    default {
      Write-Host "Invalid format. Google AI Studio keys start with AIza." -ForegroundColor Red
    }
  }
}

$apiKey = $apiKey.Trim().Trim('"').Trim("'")

# Node on Windows needs --use-system-ca for Firebase/Google HTTPS (same as npm run deploy).
$env:NODE_OPTIONS = "--use-system-ca --require=$Keepalive"

Write-Host "Checking Firebase login..." -ForegroundColor Cyan
npx firebase login:list --project $ProjectId | Out-Host
if ($LASTEXITCODE -ne 0) {
  Remove-Item Env:NODE_OPTIONS -ErrorAction SilentlyContinue
  throw "Not logged in. Run: npm run firebase:login"
}

Write-Host "Setting secret GEMINI_API_KEY..." -ForegroundColor Cyan
$apiKey | npx firebase functions:secrets:set GEMINI_API_KEY --project $ProjectId --data-file -
$code = $LASTEXITCODE

Remove-Item Env:NODE_OPTIONS -ErrorAction SilentlyContinue

if ($code -ne 0) {
  Write-Host ""
  Write-Host "Secret set failed. Try:" -ForegroundColor Yellow
  Write-Host "  npm run firebase:login" -ForegroundColor Yellow
  Write-Host "  npm run gemini:secret" -ForegroundColor Yellow
  throw "firebase functions:secrets:set failed (exit $code)"
}

Write-Host ""
Write-Host "Secret saved. Redeploy functions so OCR picks up the new key:" -ForegroundColor Green
Write-Host "  npm run deploy" -ForegroundColor Green
