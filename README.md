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
npm run build
npx cap sync ios
cd ios/App && gem install xcodeproj && ruby ../scripts/setup_widget.rb   # Mac only
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

### TestFlight: Live Activities checklist

**Before running iOS Release (GitHub Actions)**

1. **App Store Connect** — App exists for `com.confast.essences`.
2. **Developer Portal → Identifiers**
   - `com.confast.essences` → Capabilities → **Live Activities** enabled.
   - `com.confast.essences.widget` → registered (no extra capabilities).
3. **GitHub Secrets** — `APP_STORE_CONNECT_KEY_ID`, `APP_STORE_CONNECT_ISSUER_ID`, `APP_STORE_CONNECT_PRIVATE_KEY`, `APPLE_TEAM_ID`.
4. **Push `main`** — confirm **iOS Simulator Build** workflow passes (compiles widget + plugin).

**On your iPhone (TestFlight build)**

1. Install from TestFlight.
2. **Settings → Essences → Notifications** → Allow.
3. **Settings → Face ID & Passcode → Live Activities** (or **Settings → Essences**) → Live Activities allowed.
4. In the app: create a timed event **5–10 minutes from now**, enable **Live Activity**, lead time **5 minutes before**.
5. **Open the app once** when inside the lead window (or tap the wake notification).
6. Lock the screen — you should see the countdown on the Lock Screen / Dynamic Island.

**If nothing appears**

- Confirm iOS **16.1+** and a **physical device** (Simulator Live Activities are limited).
- Confirm the event is **not all-day** and has a **start time**.
- Open the app while inside the lead window (iOS requires foreground to *start* without push).
- Check **Focus / Do Not Disturb** is not blocking Live Activities.

## Data & privacy

All data (tasks, events, settings) is stored locally on device via the WebView
`localStorage`. Nothing is sent to a server. See `PRIVACY.md` / the in-app
Privacy Policy for details.
