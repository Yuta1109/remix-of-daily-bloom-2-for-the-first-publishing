# Creates public repo Yuta1109/essences-privacy and pushes this folder.
# Prerequisite: gh auth login

$ErrorActionPreference = "Continue"
Set-Location $PSScriptRoot

gh auth status
if ($LASTEXITCODE -ne 0) {
  Write-Host "Run: gh auth login"
  exit 1
}

if (-not (Test-Path .git)) {
  git init -b main
}

git add index.html privacy-policy.html README.md .gitignore PUBLISH.ps1 .github
git status --short

# Commit only if there is something to commit
git diff --cached --quiet
if ($LASTEXITCODE -ne 0) {
  git commit -m "Add Essences public privacy policy site."
} elseif (-not (git rev-parse HEAD 2>$null)) {
  git commit -m "Add Essences public privacy policy site."
}

# Detect whether the remote repo already exists (exit 0 = exists).
# Do not treat "not found" stderr as a terminating PowerShell error.
$ErrorActionPreference = "SilentlyContinue"
gh repo view Yuta1109/essences-privacy 1>$null 2>$null
$repoExists = ($LASTEXITCODE -eq 0)
$ErrorActionPreference = "Continue"

if ($repoExists) {
  Write-Host "Repo already exists. Pushing to origin..."
  git remote remove origin 2>$null
  git remote add origin https://github.com/Yuta1109/essences-privacy.git
  git push -u origin main
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
} else {
  Write-Host "Creating public repo Yuta1109/essences-privacy..."
  gh repo create essences-privacy --public --source=. --remote=origin --push
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

Write-Host ""
Write-Host "Done pushing."
Write-Host "Next: Settings → Pages → Source: GitHub Actions"
Write-Host "URL: https://yuta1109.github.io/essences-privacy/privacy-policy.html"
