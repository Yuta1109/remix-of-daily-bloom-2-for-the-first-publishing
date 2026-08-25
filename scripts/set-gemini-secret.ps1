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

Write-Host ""
Write-Host "Gemini OCR needs a Google AI Studio API key in Secret Manager." -ForegroundColor Cyan
Write-Host "Get one here: https://aistudio.google.com/apikey" -ForegroundColor Yellow
Write-Host "Do NOT paste the Firebase Web API key from GoogleService-Info.plist." -ForegroundColor Yellow
Write-Host ""

Remove-Item Env:NODE_OPTIONS -ErrorAction SilentlyContinue
npx firebase functions:secrets:set GEMINI_API_KEY --project todolist-app-project-4fd37
if ($LASTEXITCODE -ne 0) {
  throw "firebase functions:secrets:set failed (exit $LASTEXITCODE). Try: npm run firebase:login"
}

Write-Host ""
Write-Host "Secret saved. Redeploy functions so OCR picks up the new key:" -ForegroundColor Green
Write-Host "  npm run deploy" -ForegroundColor Green
