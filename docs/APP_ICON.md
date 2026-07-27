# App icon (TestFlight / home screen) — no Mac required

The iOS **home-screen / TestFlight icon** is baked into the app binary.
**App Store Connect cannot replace it by itself** (there is no “upload icon only”
field for the springboard icon). On Windows, use GitHub Actions.

## What we already did in this repo

- Logo is installed at:
  `ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png`
  (1024×1024, opaque PNG — App Store rejects transparent icons)
- Source copy (optional reference): `docs/essences-app-icon-source.png`

## How to get it on TestFlight (Windows)

1. Commit + push the icon (already done when you asked to ship).
2. Open GitHub → repository → **Actions**.
3. Run workflow **iOS Release (App Store / TestFlight)** (`workflow_dispatch`).
4. Wait for the build to finish and appear in App Store Connect → TestFlight.
5. Install that build on the device. The new icon appears with that build
   (not with older TestFlight builds still installed).

## App Store Connect “App Information” images

Those marketing screenshots / optional assets are separate from the home-screen
icon. The springboard icon still comes only from the IPA’s `AppIcon` asset.

## Replacing the icon later

1. Replace `AppIcon-512@2x.png` with a new **1024×1024 PNG without transparency**.
2. Commit, push, re-run **iOS Release**.
