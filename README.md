# Essences

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

- Main app Bundle ID: `com.confast.essences`
- Widget extension Bundle ID: `com.confast.essences.widget`
- Minimum iOS version: 16.1 (required for Live Activities)

### Apple Developer Portal (Live Activities)

Register **two** App IDs (Identifiers → + → App IDs → App):

| App ID | Capabilities |
|--------|-------------|
| `com.confast.essences` | **Live Activities** (Push Notifications optional) |
| `com.confast.essences.widget` | none required (App Groups **not** needed) |

WidgetKit does not appear as a separate portal capability — the widget extension
is identified by its bundle ID and `com.apple.widgetkit-extension` in Info.plist.
App Groups is only needed if the app and widget share data via an app group;
this project passes Live Activity state directly from the main app, so skip it.

## Data & privacy

All data (tasks, events, settings) is stored locally on device via the WebView
`localStorage`. Nothing is sent to a server. See `PRIVACY.md` / the in-app
Privacy Policy for details.
