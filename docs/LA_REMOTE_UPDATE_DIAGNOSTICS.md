# Live Activity remote update diagnostics (kill path)

## What the Firestore error means

Your schedule showed:

```text
lastRemoteUpdateOk: false
lastRemoteUpdateError: Request is missing required authentication credential...
```

Cloud Functions logs map this to:

```text
messaging/third-party-auth-error
```

That is **not** “Firebase CLI login expired” and **not** “device token missing”.
It means **FCM could not authenticate to Apple APNs** with the APNs key configured
on the Firebase project. FCM wraps Apple’s failure in a Google-looking OAuth message.

Until APNs Auth Key (.p8) Key ID + Team ID are correct for app `com.confast.essences`,
**no kill-state Lock Screen update can succeed**, even when FCM ✓ · pushToStart ✓ · updateToken ✓.

## Fix (Firebase Console — required)

1. [Firebase Console](https://console.firebase.google.com/) → project `todolist-app-project-4fd37`
2. Project settings (gear) → **Cloud Messaging**
3. Apple app configuration for **`com.confast.essences`**
4. Upload **APNs Authentication Key** (`.p8` from Apple Developer → Keys, with APNs enabled)
5. Enter the exact **Key ID** and **Team ID**
6. Prefer a key that covers **Sandbox & Production** (TestFlight uses production APNs)

Then wait ~1 minute and force-quit the app during an active LA. Firestore should show
`lastRemoteUpdateOk: true`.

## Two refresh paths (expected behavior)

| App state | Who redraws Lock Screen |
|-----------|-------------------------|
| Process alive | Local heartbeat `Activity.update` (~60s) |
| Force-quit | FCM Live Activity `event: "update"` via Cloud Functions |

## Release diagnostics design

Cloud Functions write results that Settings can copy **without Xcode**:

| Location | Fields |
|----------|--------|
| `laSchedules/{id}` | `lastRemoteUpdateOk`, `lastRemoteUpdateCode`, `lastRemoteUpdateError`, `lastRemoteUpdateHint`, `lastRemoteUpdateAt` |
| `devices/{uid}` | `lastRemoteLaAttempt`, `remoteLaAttempts[]` (ring, last 12) |

Settings → **再チェック** pulls those docs into the in-app log.
Settings → **ログをコピー** includes a `server:` JSON block with attempts + schedules.

### How to send a useful release log

1. Trigger an LA (lead window).
2. Force-quit Essences.
3. Wait 1–2 minutes (sweep / refresh).
4. Reopen → Settings → 再チェック → ログをコピー → paste.

Look for `server.lastAttempt.code` / `lastRemoteUpdateHint`.

## Code notes

- `refreshLiveActivityTask` must **not** mark `status: "arrived"` when the FCM send fails
  (otherwise retries stop). Fixed to mark arrived only on success.
- `sweepLiveActivityRefresh` also retries failed `arrived` rows.
