# Creates public repo Yuta1109/essences-privacy and pushes this folder.
# Prerequisite: gh auth login

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

gh auth status
if ($LASTEXITCODE -ne 0) {
  Write-Host "Run: gh auth login"
  exit 1
}

if (-not (Test-Path .git)) {
  git init -b main
}

git add index.html privacy-policy.html README.md .github
git status
git commit -m "Add Essences public privacy policy site." 2>$null
if ($LASTEXITCODE -ne 0) {
  # commit may fail if nothing new; continue if HEAD exists
  git rev-parse HEAD | Out-Null
}

$existing = gh repo view Yuta1109/essences-privacy 2>$null
if ($LASTEXITCODE -eq 0) {
  Write-Host "Repo already exists. Pushing to origin..."
  git remote remove origin 2>$null
  git remote add origin https://github.com/Yuta1109/essences-privacy.git
  git push -u origin main
} else {
  gh repo create essences-privacy --public --source=. --remote=origin --push
}

Write-Host ""
Write-Host "Done pushing."
Write-Host "Next: Settings → Pages → Source: GitHub Actions"
Write-Host "URL: https://yuta1109.github.io/essences-privacy/privacy-policy.html"
