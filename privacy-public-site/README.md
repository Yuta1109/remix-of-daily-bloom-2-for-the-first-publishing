# Essences — Privacy Policy (public site)

This folder is meant to become its **own public** GitHub repository so the App Store privacy policy URL keeps working while the main app repository is private.

## Canonical URL (after setup)

https://yuta1109.github.io/essences-privacy/privacy-policy.html

## Publish once (you run this)

In PowerShell:

```powershell
cd C:\Users\yutaa\remix-of-daily-bloom-2-for-the-first-publishing\privacy-public-site
.\PUBLISH.ps1
```

Then in the browser:

1. Open https://github.com/Yuta1109/essences-privacy/settings/pages  
2. **Source** → **GitHub Actions**  
3. If needed: **Actions** → **Deploy GitHub Pages** → **Run workflow**  
4. Confirm the canonical URL opens  
5. App Store Connect → App Privacy → set the privacy policy URL to that link  
6. Only then: make `remix-of-daily-bloom-2-for-the-first-publishing` **Private**

Keep `essences-privacy` **public** forever (or as long as the app is on the App Store).
