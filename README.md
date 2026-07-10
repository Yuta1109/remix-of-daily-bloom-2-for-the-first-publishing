# Essentials

A calm calendar for the plans that matter. Schedule events, receive reminders, and keep upcoming plans visible on your iOS Lock Screen with Live Activities.

## Tech stack

- Vite + React + TypeScript
- Tailwind CSS + shadcn/ui
- Capacitor (iOS)
- Local Notifications + ActivityKit Live Activities (iOS native)

## Getting started (web)

```bash
npm install
npm run dev
```

## iOS build

```bash
npm run cap:sync   # build web + sync into the iOS project
npx cap open ios   # open in Xcode (Mac only)
```

iOS builds are produced in CI via GitHub Actions (see `.github/workflows/`).
The app is distributed to the App Store / TestFlight; no local Mac is required.

- Bundle ID: `com.confast.essentials`
- Minimum iOS version: 16.1 (required for Live Activities)

## Data & privacy

All data (tasks, events, settings) is stored locally on device via the WebView
`localStorage`. Nothing is sent to a server. See `PRIVACY.md` / the in-app
Privacy Policy for details.
