# Essences

A calm calendar for the plans that matter. Schedule events, receive reminders, and keep upcoming plans visible on your iOS Lock Screen with Live Activities.

## Tech stack

- Vite + React + TypeScript
- Tailwind CSS + shadcn/ui
- Capacitor (iOS)
- Local Notifications + ActivityKit Live Activities (iOS native)
- Firebase (`todolist-app-project-4fd37`) for ActivityKit push-to-start when the app is killed

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

- Main app Bundle ID: `com.confast.essences`
- Widget extension Bundle ID: `com.confast.essences.widget`
- Minimum iOS version: **17.2** (ActivityKit push-to-start)

### Lead window behavior (important)

`showAt = max(eventStart − lead, now)`.

| Setting | Event time | Result |
|---------|------------|--------|
| Lead **4 hours** | Event in **3 hours** | Already inside the window → **starts immediately on save** (and remote status `due`) |
| Lead **4 hours** | Event in **5 hours** | Starts in **1 hour** (at start − 4h), including via push if the app is killed |

### GitHub Secrets — `GoogleService-Info.plist`

Do **not** commit the plist. Put a Base64 copy in GitHub Actions secrets.

**1. Encode on your PC (PowerShell)**

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("C:\path\to\GoogleService-Info.plist")) | Set-Clipboard
```

(The Base64 string is now on the clipboard.)

**2. Add the secret**

GitHub → repo → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**

| Name | Value |
|------|--------|
| `GOOGLE_SERVICE_INFO_PLIST` | paste the Base64 string |

CI writes `ios/App/App/GoogleService-Info.plist` before Xcode build (`setup_widget.rb` bundles it).

**3. Firebase web config (for schedule sync from the app)**

1. Firebase Console → Project settings → **Add app** → **Web** (`</>`).
2. Copy the `firebaseConfig` object.
3. New secret `FIREBASE_WEB_CONFIG` = one-line JSON, e.g.

```json
{"apiKey":"...","authDomain":"todolist-app-project-4fd37.firebaseapp.com","projectId":"todolist-app-project-4fd37","storageBucket":"...","messagingSenderId":"...","appId":"..."}
```

Locally you can use `.env.local` (see `.env.example`).

### Firebase Console checklist (your side)

1. **Authentication** → Sign-in method → enable **Anonymous**.
2. **Firestore** → Create database (production mode is fine; we deploy `firestore.rules`).
3. Upgrade to **Blaze** if you have not (needed for scheduled Cloud Functions).
4. APNs Auth Key already uploaded under Cloud Messaging — good.
5. Deploy backend (from a machine with Firebase CLI logged in):

```bash
cd functions && npm install && cd ..
npx firebase login
npx firebase deploy --only functions,firestore --project todolist-app-project-4fd37
```

### Apple Developer Portal

| App ID | Capabilities |
|--------|-------------|
| `com.confast.essences` | **Push Notifications** (skip SSL certificate creation; use Auth Key) |
| `com.confast.essences.widget` | registered only |

`NSSupportsLiveActivities` is already in the app `Info.plist`. Widget target is wired by CI.

### Live Activity design notes

| Constraint | Handling |
|------------|----------|
| Lock Screen Live Activity | `EssentialsWidgetLiveActivity` (no Dynamic Island design) |
| Active ≤ 8h / Lock Screen ≤ 12h total | Lead capped at 8h |
| Already inside lead when saving | Immediate local start + Firestore `due` → Cloud Function push |
| App killed at future `showAt` | Cloud Function `dispatchLiveActivities` (every 1 min) + FCM |

**Note:** Kill-state push also needs an **FCM registration token** on the device doc (in addition to the ActivityKit push-to-start token). Token upload for push-to-start is implemented; wiring Firebase Messaging for the FCM token is the next native step if pushes log `Missing tokens` in Functions.

### Next steps after Functions deploy

1. Confirm GitHub secrets `GOOGLE_SERVICE_INFO_PLIST` and `FIREBASE_WEB_CONFIG` are set.
2. Push / run **iOS Release** so TestFlight includes `@capacitor-firebase/messaging`.
3. On device (iOS 17.2+): open Essences once, allow notifications, create an event with Live Activity + short lead, then lock / kill the app and wait for `showAt`.
4. In Firestore Console → `devices` → your anonymous uid: both `fcmToken` and `pushToStartToken` should be non-null after first launch.

If Functions logs show `Missing tokens`, the device has not registered FCM yet — open the app once with notification permission granted.

## Data & privacy

Tasks/events stay in on-device `localStorage` by default. With Firebase Live Activity sync enabled, the app also sends an anonymous device id, push tokens, and schedule metadata (title, times, color) to Firebase to start Lock Screen activities. Update the in-app Privacy Policy before shipping that path widely.
