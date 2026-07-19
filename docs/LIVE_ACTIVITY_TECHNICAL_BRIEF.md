# Essences — Live Activity Technical Brief

**Audience:** External review (e.g. Gemini Pro) of architecture correctness  
**App:** Essences (`com.confast.essences`)  
**Repo:** `remix-of-daily-bloom-2-for-the-first-publishing`  
**Firebase project:** `todolist-app-project-4fd37`  
**Platform:** iOS 17.2+ (Capacitor 8 + ActivityKit widget extension)  
**Presentation target:** Lock Screen only (Dynamic Island UI intentionally empty; API still requires a `dynamicIsland` closure)

---

## 1. Product intent

When a calendar event has **Live Activity enabled** and is not all-day:

1. At time `showAt = max(eventStart − lead, now)`, a Lock Screen Live Activity appears.
2. The UI shows up to **3** upcoming LA-enabled events (title + color dot + **system countdown timer** to each event’s start).
3. When the soonest event’s **start time** is reached, the activity is **ended** (not kept until the event’s end time).
4. If the app is **foregrounded** inside the lead window, ActivityKit starts/updates **locally**.
5. If the app is **killed / backgrounded** before `showAt`, a **Firebase Cloud Function** sends an ActivityKit **push-to-start** via FCM → APNs.

Reminders (local notifications) are a **separate** feature and must not be confused with Live Activities.

---

## 2. Direct answers to design questions

### 2.1 “Is update frequency too high, so the connection fails? Should countdown be a Clock-app-style timer?”

**Countdown already is a system timer (Clock-style).**  
Lock Screen UI uses SwiftUI:

```swift
Text(timerInterval: Date.now...target, countsDown: true)
```

That is rendered by the system. It does **not** require FCM/APNs pushes every second (or every minute) to tick the countdown.

What runs on a schedule is **only the decision to start** the Live Activity when the app is not running:

| Mechanism | Interval | Purpose |
|-----------|----------|---------|
| Cloud Function `dispatchLiveActivities` | every **1 minute** | Poll Firestore for schedules with `showAtEpochMs <= now` and send **one** push-to-start |
| JS `scheduleLiveActivityBoundaries` | at next window open/close | Local start/end while app process is alive |
| System `Text(timerInterval:)` | continuous UI | Countdown digits; no network |

**Conclusion:** Minute-level Cloud Scheduler polling is **not** “countdown auto-update.” It cannot cause APNs rate-limit failure for ticking timers. Apple’s ActivityKit update budget matters for **content-state push updates** after start; this app does **not** send periodic update pushes for the countdown.

### 2.2 “What does the Live Activity show, and for how long?”

**Current product behavior:**

| Phase | Shown? | What |
|-------|--------|------|
| Before `showAt` | No | Nothing |
| `showAt` ≤ now < **event start** | Yes | Lock Screen card: header (“まもなくの予定” / “Upcoming”), up to 3 rows (color, title, countdown to **start**) |
| After **event start** | No (ended) | Activity is ended at `endEpochMs = startEpochMs` |
| During event until event **end** time | No | **Not implemented** — end time is unused for LA |

So: it is a **pre-start countdown**, not an “in-progress until end” tracker (unlike a sports score or delivery ETA that continues through the event).

---

## 3. Apple / system constraints (as implemented)

| Constraint | Handling in Essences |
|------------|----------------------|
| Live Activities require iOS 16.1+; **push-to-start** requires **iOS 17.2+** | Deployment target **17.2**; no wake-notification fallback |
| Active Live Activity ≤ ~**8 hours** | Lead options clamped via `effectiveLiveActivityLeadMinutes` → max 480 min |
| Lock Screen may linger ≤ ~**12 hours** total after inactive | Documented; dismissal tied to end-at-start |
| `NSSupportsLiveActivities` | `true` in app `Info.plist` |
| Push Notifications capability | `aps-environment` = `production` in entitlements; `UIBackgroundModes` includes `remote-notification` |
| Widget extension | Bundle ID `com.confast.essences.widget`; embeds `EssencesWidgetAttributes` |
| Dynamic Island | Required by `ActivityConfiguration` API; **views are `EmptyView()`** (no DI product design) |
| Attributes type name in push payload | Must be exactly `EssencesWidgetAttributes` |

---

## 4. Data model

### 4.1 On-device event (`localStorage` key `calendar-events`)

Relevant fields on `CalendarEvent`:

- `liveActivity?: boolean`
- `liveActivityLead?: "24h" \| "12h" \| "8h" \| … \| "5m"` (UI may offer >8h; **effective** lead clamped to 8h)
- Timed events only (`allDay` → LA disabled)

### 4.2 Window computation (`src/lib/live-activity-window.ts`)

For each LA-enabled timed event with a future occurrence:

```
startEpochMs  = next occurrence start
windowOpen    = startEpochMs − leadMinutes
showAtEpochMs = max(windowOpen, now)     // already-in-window → immediate
endEpochMs    = startEpochMs             // end at start, not event end
activeNow     = showAt ≤ now < start
```

Example: lead = 4h, event in 3h → `showAt = now`, `activeNow = true` → local start on save + remote status `due`.

### 4.3 Firestore

**Collection `devices/{anonymousUid}`** (client write; Auth Anonymous):

```json
{
  "fcmToken": "<FCM registration token>",
  "pushToStartToken": "<ActivityKit push-to-start token, hex string>",
  "platform": "ios",
  "updatedAt": 0
}
```

**Collection `laSchedules/{deviceUid}_{eventId}`** (client replace-on-sync):

```json
{
  "deviceId": "<uid>",
  "eventId": "<id>",
  "title": "...",
  "color": "blue",
  "locale": "ja",
  "showAtEpochMs": 0,
  "endAtEpochMs": 0,
  "startEpochMs": 0,
  "status": "pending" | "due" | "started" | "error",
  "updatedAt": 0,
  "startedAt": 0,
  "lastError": "..."
}
```

Sync strategy (`syncLiveActivitySchedulesRemote`): delete all schedules for `deviceId`, then write current windows. Status `due` if `activeNow`, else `pending`.

Security rules: user may R/W only own `devices/{uid}` and `laSchedules` where `deviceId == auth.uid`.

---

## 5. Native (Swift) architecture

### 5.1 Shared attributes

File: `ios/App/App/LiveActivities/EssentialsAttributes.swift`  
Type: `EssencesWidgetAttributes: ActivityAttributes`

- Static attributes: `{ name: String }` (default `"Essences"`)
- `ContentState`: `{ items: [Item], overflow: Int, locale: String }`
- `Item`: `{ title: String, startEpochMs: Double, color: String }`

Compiled into **both** App target and `EssentialsWidget` extension.

### 5.2 Capacitor plugin

`LiveActivitiesPlugin` (`jsName: "LiveActivities"`):

| Method | Behavior |
|--------|----------|
| `areEnabled` | `ActivityAuthorizationInfo().areActivitiesEnabled` |
| `startOrUpdate` | Update existing activity or `Activity.request(..., pushType: .token)` with up to 3 items; schedule local end at `endEpochMs` |
| `endAll` | End all `Activity<EssencesWidgetAttributes>` immediately |
| `startPushToStartTokenUpdates` | Ensures token center running; re-emits cached token to JS |

### 5.3 Push-to-start token lifecycle (Pitfall B mitigation)

`LiveActivityPushTokenCenter` (process-lifetime singleton):

- Started from `AppDelegate.didFinishLaunching` **and** plugin `load()`
- Holds a **strong** `Task` over `Activity<EssencesWidgetAttributes>.pushToStartTokenUpdates`
- Posts `Notification.Name.essencesPushToStartToken` with hex token
- Plugin forwards to JS listener `pushToStartToken`

Rationale: unstructured Tasks owned only by a short-lived plugin/scope are a known cause of lost tokens after backgrounding.

### 5.4 Widget UI

`EssentialsWidgetLiveActivity`:

- Lock Screen: `LockScreenView` + `Text(timerInterval:countsDown:)`
- Dynamic Island: empty stubs only

### 5.5 Local end

After local start, `DispatchWorkItem` ends activities at `min(delay, 8h)` from `endEpochMs` (event start).

---

## 6. JavaScript / Capacitor bridge

### 6.1 Boot (`native-bootstrap.ts`)

On iOS native:

1. `refreshLiveActivities()` — local ActivityKit sync for currently active windows  
2. `scheduleLiveActivityBoundaries()` — timer to next boundary  
3. `initLiveActivityRemote()` — Firebase anon auth + token observe + schedule sync  
4. `initFcmRegistration()` — permission + FCM token → `setRemoteFcmToken`

### 6.2 Local refresh (`live-activity.ts`)

`collectActiveItems` → windows with `activeNow` → `startOrUpdate` or `endAll`.  
Max 3 items; `overflow = active.length - 3`.

### 6.3 Remote (`la-remote.ts`)

- Requires `VITE_FIREBASE_WEB_CONFIG` (injected in CI from secret `FIREBASE_WEB_CONFIG`)
- Anonymous Auth → `deviceUid`
- Uploads `fcmToken` + `pushToStartToken` to `devices/{uid}`
- Upserts `laSchedules`

### 6.4 FCM (`fcm.ts` + `@capacitor-firebase/messaging`)

- Patched (patch-package) to skip `FirebaseApp.configure()` if `GoogleService-Info.plist` missing from bundle (launch-crash mitigation)
- CI writes plist **before** `setup_widget.rb` and verifies it is in the Xcode project

---

## 7. Cloud Functions (FCM Live Activity start)

Region: `asia-northeast1`

### 7.1 Triggers

1. **`onLaScheduleWrite`** — on `laSchedules/{id}` write, if status is `pending`/`due` and `showAt <= now < endAt`, send start immediately  
2. **`dispatchLiveActivities`** — Cloud Scheduler **every 15 minutes**, equality query on `status` then filter `showAt` in memory (avoids composite-index failures)

### 7.2 Send path (must match Firebase + Apple docs)

```
messaging.send({
  token: device.fcmToken,                    // FCM registration token
  apns: {
    liveActivityToken: device.pushToStartToken,  // ActivityKit push-to-start token
    headers: {
      "apns-push-type": "liveactivity",
      "apns-topic": "com.confast.essences.push-type.liveactivity",
      "apns-priority": "10",
    },
    payload: {
      aps: {
        timestamp: <unix sec>,
        event: "start",
        "content-state": { items, overflow, locale },  // Codable-compatible
        "attributes-type": "EssencesWidgetAttributes",
        attributes: { name: "Essences" },
        "stale-date": <endAt unix sec>,
        alert: { title, body },
      }
    }
  }
})
```

**Both tokens are required.** Missing either → log warn, no send, schedule not marked `started`.

On success: `status = "started"`. On failure: `status = "error"`, `lastError` set.

### 7.3 What is NOT sent

- No periodic `event: "update"` pushes for countdown (system timer handles UI)
- No `event: "end"` push (local end + stale-date; remote end not implemented)
- No broadcast/channel push

---

## 8. CI / release wiring (observed healthy)

GitHub Actions `ios-release.yml`:

1. `npm ci` (applies patch-package)  
2. `npm run build` with `VITE_FIREBASE_WEB_CONFIG`  
3. `npx cap sync ios`  
4. Write `GoogleService-Info.plist` from secret `GOOGLE_SERVICE_INFO_PLIST`  
5. `ruby ../scripts/setup_widget.rb` → widget target + **bundle plist into App**  
6. Verify plist present in `project.pbxproj`  
7. Archive / export / TestFlight upload  

Log line `Bundled GoogleService-Info.plist into App target` + `EssencesWidget wiring complete` means **Xcode project wiring succeeded**. It does **not** prove runtime push-to-start or APNs delivery.

---

## 9. End-to-end timelines

### 9.1 App open, already inside lead window

```
User saves event (LA on, lead 4h, start in 3h)
  → refreshLiveActivities() → Activity.request / update (local)
  → sync laSchedules status=due
  → onLaScheduleWrite may also FCM push-to-start (redundant if local already showed)
  → Lock Screen shows Text(timerInterval) until start
  → at start: local endWorkItem ends activity
```

### 9.2 App killed, showAt in the future

```
User saves event (lead 1h, start in 3h) then force-quits
  → devices doc has fcmToken + pushToStartToken (from earlier open)
  → laSchedules status=pending, showAt = start−1h
  → every 1 min: dispatchLiveActivities
  → when showAt ≤ now: FCM start with live_activity_token
  → APNs delivers → system starts LA → Lock Screen UI
```

---

## 10. Known failure modes / debug checklist

| Check | Where | Expected |
|-------|-------|----------|
| iOS Settings → Essences → Live Activities | Device | Allowed (not Off) |
| Notification permission | Device / app | Granted (needed for FCM path) |
| `devices/{uid}.fcmToken` | Firestore | Non-null after open |
| `devices/{uid}.pushToStartToken` | Firestore | Non-null after open (hex) |
| `laSchedules` rows | Firestore | Appear after save with LA |
| `status` / `lastError` | Firestore | `started` or `error` + message |
| Functions logs | GCP / Firebase | `FCM live activity start failed` or `sent` |
| APNs key in Firebase Console | Cloud Messaging | Apple auth key uploaded for this app |
| Bundle ID / topic | Code | `com.confast.essences.push-type.liveactivity` |
| Attributes type | Payload vs Swift | Exact string `EssencesWidgetAttributes` |
| content-state keys | Payload vs Codable | `items[].title/startEpochMs/color`, `overflow`, `locale` |
| Widget extension signed & embedded | IPA | Present in archive |
| TestFlight build includes recent native fixes | Version | Token center + plist order commits |

**Important:** If `pushToStartToken` is null, Cloud Functions will never start a killed-app LA. Local start should still work when the app is open inside the lead window — if **even local** LA never appears, the issue is ActivityKit enablement / widget extension / `areActivitiesEnabled`, not FCM polling frequency.

---

## 11. Explicit non-goals / intentional omissions

- No Dynamic Island product UI  
- No Live Activity spanning event start → event end  
- No ActivityKit push **updates** for countdown  
- No Android Live Activities  
- Event payload itself stays primarily on-device; only LA schedule metadata + tokens go to Firebase  

---

## 12. Key source files

| Area | Path |
|------|------|
| Window math | `src/lib/live-activity-window.ts` |
| Local ActivityKit JS | `src/lib/live-activity.ts` |
| Firebase client | `src/lib/la-remote.ts`, `src/lib/fcm.ts` |
| Boot | `src/lib/native-bootstrap.ts` |
| Event fields / lead clamp | `src/lib/events-store.ts` |
| UI copy | `src/lib/i18n.tsx` (`liveActivityHint`, …) |
| Event sheet toggle | `src/components/EventSheet.tsx` |
| Attributes | `ios/App/App/LiveActivities/EssentialsAttributes.swift` |
| Plugin | `ios/App/App/LiveActivities/LiveActivitiesPlugin.swift` |
| Token center | `ios/App/App/LiveActivities/LiveActivityPushTokenCenter.swift` |
| AppDelegate | `ios/App/App/AppDelegate.swift` |
| Widget UI | `ios/App/EssentialsWidget/EssentialsWidgetLiveActivity.swift` |
| Xcode wire script | `ios/scripts/setup_widget.rb` |
| Cloud Functions | `functions/index.js` |
| Rules | `firestore.rules` |
| CI | `.github/workflows/ios-release.yml` |

---

## 13. Official references used in this design

1. [Starting and updating Live Activities with ActivityKit push notifications](https://developer.apple.com/documentation/activitykit/starting-and-updating-live-activities-with-activitykit-push-notifications)  
2. [Get started with Live Activity — Firebase Cloud Messaging](https://firebase.google.com/docs/cloud-messaging/customize-messages/live-activity)  
3. Apple: `apns-push-type: liveactivity`, `apns-topic: <bundleId>.push-type.liveactivity`  
4. Firebase: message requires **FCM token** + `apns.live_activity_token` (push-to-start or update token)

---

## 14. Review prompts for Gemini Pro

Please evaluate:

1. Is ending the Live Activity at **event start** (not event end) consistent with ActivityKit best practices for a pre-start countdown?  
2. Is polling Firestore every **1 minute** for push-to-start acceptable vs. Cloud Tasks / exact scheduling? Any risk of duplicate starts?  
3. Is `content-state` with nested `items[]` and `startEpochMs` as JSON numbers safe for ActivityKit’s default Codable decoding (no custom strategies)?  
4. Given Lock Screen uses `Text(timerInterval:)`, is omitting `event: "update"` pushes correct?  
5. Are there missing pieces for reliable push-to-start on TestFlight (production APNs): e.g. `input-push-token`, alert localization shape, stale-date semantics, or token refresh after reinstall?  
6. Could empty Dynamic Island views cause the system to suppress Lock Screen presentation on non-Island devices? (Hypothesis to confirm/reject.)  
7. Given both local `Activity.request` and remote push-to-start may fire for `due` schedules, is double-start handling correct (update existing vs. second activity)?

---

*End of brief.*
