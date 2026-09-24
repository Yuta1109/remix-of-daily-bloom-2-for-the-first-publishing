# TestFlight runbook (Phase 13)

Windows + Cursor can finish TypeScript, web, Capacitor config, security rules
tests, and GitHub Actions **syntax**. There is **no local Mac / Xcode** in this
development setup, so native Google Sign-In is **not** claimed as verified on
the PC.

This file is the user-facing TestFlight runbook. Operational gates live in
`docs/RELEASE_CHECKLIST.md`. Architecture is frozen at Phase 12.

Ship an IPA with **iOS Release** (`workflow_dispatch`) → TestFlight → physical
iPhone. Do **not** run `firebase deploy`, `git push`, or App Store Connect
upload from Cursor.

Do **not** commit `GoogleService-Info.plist`. CI injects it from the existing
secret `GOOGLE_SERVICE_INFO_PLIST` (Base64). Optional `FIREBASE_WEB_CONFIG`
overrides the plist-derived web config.

App Check enforcement is **not** enabled. Store / Ads / Subscription are **not**
part of the first TestFlight. Finish **Smoke Test A–K** before any of those.

---

## Firebase configuration: development vs production / TestFlight

| Surface | Where config comes from |
| --- | --- |
| Local Vite (`npm run dev` / `npm run build` on Windows) | `VITE_FIREBASE_WEB_CONFIG` or `VITE_FIREBASE_*` in `.env.local`. If missing, Sign-In is disabled and User page shows the config-missing hint. |
| TestFlight / App Store IPA | macOS CI writes `GoogleService-Info.plist` from `GOOGLE_SERVICE_INFO_PLIST`, then `scripts/build-firebase-web-config.mjs --write-env` bakes the same project into the web bundle (`todolist-app-project-4fd37`). Optional `FIREBASE_WEB_CONFIG` overrides that derivation. |
| Native iOS Firebase / Google Sign-In | `GoogleService-Info.plist` in the Xcode **App** target (CI-only; widget / Live Activity targets do not need it). URL scheme / `GIDClientID` injected by canonical script `scripts/apply-google-signin-ios.mjs`. Helpers live in `scripts/google-signin-plist.mjs`. |

Do not log email, OAuth tokens, access tokens, or Firebase credentials.
Firebase UID is shown only in a debug (`import.meta.env.DEV`) details block on User.

This split is **by design**, not a defect: local Windows builds cannot exercise
the native Google SDK. Missing config locally is expected; a TestFlight IPA
without the injected plist would be a configuration bug.

---

## A. Firebase preparation

Project: `todolist-app-project-4fd37`  
iOS Bundle ID: `com.confast.essences`

Run these on a machine where **you** are logged into Firebase CLI (not Cursor).

```powershell
cd C:\Users\yutaa\remix-of-daily-bloom-2-for-the-first-publishing
npx firebase login
npx firebase use todolist-app-project-4fd37
npx firebase deploy --only firestore:rules,storage
```

`firebase.json` maps `firestore.rules` and `storage.rules`. `--only storage`
deploys Storage rules. Equivalent: `--only firestore:rules,storage:rules`.

Checklist:

- [ ] Authentication → Google provider **enabled** (Anonymous may stay on for Live Activity device docs; V3 user data still requires Google via rules)
- [ ] Firestore database exists
- [ ] Storage default bucket exists
- [ ] Rules deploy succeeded for Firestore + Storage
- [ ] App Check enforcement remains **off**

Do not deploy Cloud Functions in this rules-only step unless you intentionally
need Live Activity kill-state push. First TestFlight Smoke Test is about Auth +
V3 sync, not Store / Ads.

---

## B. GitHub preparation

Canonical secret **names** come only from the workflows. Do not invent extra
names. Never paste secret **values** into this repo or into chat.

| Secret name | Purpose | Required / optional |
| --- | --- | --- |
| `GOOGLE_SERVICE_INFO_PLIST` | Base64 of `GoogleService-Info.plist`. Written to `ios/App/App/GoogleService-Info.plist` **before** Vite config + `cap sync`. | **Required** for iOS Release. Optional on Simulator (job skips if unset). |
| `FIREBASE_WEB_CONFIG` | Optional one-line Firebase web config JSON. Overrides plist-derived `VITE_FIREBASE_WEB_CONFIG`. | Optional (both workflows). |
| `APP_STORE_CONNECT_KEY_ID` | App Store Connect API key ID (for export + `altool`). | **Required** for iOS Release. |
| `APP_STORE_CONNECT_ISSUER_ID` | App Store Connect API issuer ID. | **Required** for iOS Release. |
| `APP_STORE_CONNECT_PRIVATE_KEY` | Contents of AuthKey_XXXX.p8 (paste as-is). | **Required** for iOS Release. |
| `APPLE_TEAM_ID` | 10-character Apple Developer Team ID (`DEVELOPMENT_TEAM`). | **Required** for iOS Release. |

`deploy-pages.yml` uses no repository secrets.

Also:

- [ ] Branch / commit you want to ship is on GitHub (Cursor will not push)
- [ ] `storage.rules` is included in that commit if it was previously untracked
- [ ] `CURRENT_PROJECT_VERSION` in `ios/App/App.xcodeproj/project.pbxproj` is **not** already used on App Store Connect for marketing version 1.2 (today: **1**). Duplicate TestFlight build numbers are a **BLOCKER** — increment before dispatch if 1 already exists for 1.2
- [ ] iOS OAuth client in Firebase / Google Cloud is for bundle `com.confast.essences`

### Dispatch iOS Release

1. GitHub
2. Actions
3. **iOS Release** (`iOS Release (App Store / TestFlight)`)
4. Run workflow

Do not confuse this with **iOS Simulator Build**, which is unsigned compile-only.

---

## C. Build

Release workflow (`ios-release.yml`) is **workflow_dispatch only** (no push
trigger). Intended order:

1. checkout
2. Node 22
3. `npm ci`
4. Firebase web config (`build-firebase-web-config.mjs`, from plist and/or `FIREBASE_WEB_CONFIG`)
5. `GoogleService-Info.plist` injection from `GOOGLE_SERVICE_INFO_PLIST`
6. `npm run build`
7. `npx cap sync ios`
8. iOS dependency / SPM / widget preparation
9. signing (unsigned archive → ad-hoc entitlements → App Store export via ASC API)
10. archive
11. IPA
12. App Store Connect upload (`altool --upload-app`)

Windows cannot verify that the macOS runner archive actually succeeded. Treat
GitHub Actions logs as the source of truth after you dispatch.

Simulator workflow (`ios-simulator-build.yml`): unsigned `xcodebuild build` for
iOS Simulator on `macos-15`. It may skip plist/web-config. It does **not**
sign, export, or upload. Push to `main` (path-filtered) + `workflow_dispatch`.

---

## D. TestFlight install

- [ ] GitHub Action **iOS Release** is green
- [ ] Build appears in App Store Connect → TestFlight
- [ ] Install on a **physical iPhone** (iOS 17.2+)
- [ ] Use two Google accounts for account-isolation tests

---

## E. Test scenarios

Run **Smoke Test A–K** first. If any Smoke step fails, stop. Do not start Store /
Ads / Subscription verification.

Fill **Actual** and **pass/fail** on device. Windows cannot fill these.

### Smoke Test (first TestFlight only)

#### A. Fresh install → app launches

- Expected: App opens to the main UI without crashing.
- Actual:
- Result: [ ] pass / [ ] fail

#### B. Signed out → all 5 tabs work

- Expected: Progress, Plan, ToDo, Calendar, Notes (and User) work locally. User
  shows **Googleでサインイン** and **この端末のみ**.
- Actual:
- Result: [ ] pass / [ ] fail

#### C. Google Sign-In → authenticated

- Expected: Native Google Sign-In completes. User is signed in.
- Actual:
- Result: [ ] pass / [ ] fail

#### D. Create Task, Plan, Note, Quick Memo

- Expected: All four create and remain after leaving the screen.
- Actual:
- Result: [ ] pass / [ ] fail

#### E. Sync → Firestore data exists

- Expected: Sync shows **同期済み** / **クラウドに保存されています**. Console
  `users/{uid}/...` has documents. Paths use Firebase UID, never email.
- Actual:
- Result: [ ] pass / [ ] fail

#### F. App restart → auth remains

- Expected: Force-quit and reopen; still signed in.
- Actual:
- Result: [ ] pass / [ ] fail

#### G. Delete app / reinstall → sign in again

- Expected: After TestFlight reinstall, Google Sign-In with the **same** account works.
- Actual:
- Result: [ ] pass / [ ] fail

#### H. Restore → data returns

- Expected: Task / Plan / Note / Quick Memo text from step D returns.
- Actual:
- Result: [ ] pass / [ ] fail

#### I. Note image → Storage upload / restore

- Expected: Image on a Note uploads; after reinstall + sign-in it displays (not a
  broken local URI).
- Actual:
- Result: [ ] pass / [ ] fail

#### J. Sign out → local data remains

- Expected: Banner that **この端末のデータは削除されません**; rows stay; sync
  returns to **この端末のみ**.
- Actual:
- Result: [ ] pass / [ ] fail

#### K. A → B account switch → no cross-user data

- Expected: B does not receive A’s data in B’s Firestore. Switching back to A
  still shows A’s data.
- Actual:
- Result: [ ] pass / [ ] fail

---

### Full scenarios (after Smoke Test)

#### 1. Fresh install / signed out

- Expected: Same as Smoke A + B.
- Actual:
- Result: [ ] pass / [ ] fail

#### 2. Normal local usage

- Expected: Create / edit / complete Task, Plan, Note, Quick Memo while signed
  out. Data survives tab switches.
- Actual:
- Result: [ ] pass / [ ] fail

#### 3. Google Sign-In

- Expected: Native Google UI / account picker; returns to User signed in.
- Actual:
- Result: [ ] pass / [ ] fail

#### 4. Initial cloud sync

- Expected: After Sign-In, local V3 data uploads under `users/{uid}/...`.
- Actual:
- Result: [ ] pass / [ ] fail

#### 5. App restart

- Expected: Auth persistence; no duplicate empty cloud overwrite of good local data.
- Actual:
- Result: [ ] pass / [ ] fail

#### 6. Delete / reinstall

- Expected: App gone from device; TestFlight reinstall is a clean local store.
- Actual:
- Result: [ ] pass / [ ] fail

#### 7. Restore

- Expected: Same Google account restores V3 rows.
- Actual:
- Result: [ ] pass / [ ] fail

#### 8. Image restore

- Expected: Note + Quick Memo images return from Firebase Storage.
- Actual:
- Result: [ ] pass / [ ] fail

#### 9. Sign out

- Expected: Same as Smoke J. Cloud is not wiped from the server by sign-out.
- Actual:
- Result: [ ] pass / [ ] fail

#### 10. Account A/B

- Expected: Same as Smoke K. No merge of A into B.
- Actual:
- Result: [ ] pass / [ ] fail

#### 11. Offline / reconnect

- Expected: Airplane Mode → edit → network on → wait or **今すぐ同期** →
  **同期済み**. Errors are generic retry copy, not raw Firestore dumps.
- Actual:
- Result: [ ] pass / [ ] fail

#### 12. Notes migration

- Expected: If old `essences-memo-library-v2` / `essences-memos` exist on device,
  they appear as migrated / archive notes. New Notes UI does not keep writing
  those keys.
- Actual:
- Result: [ ] pass / [ ] fail

#### 13. Quick Memo conversion

- Expected: Convert to Task / Plan / Event. Original Quick Memo remains.
  `convertedTargets` keeps multiple targets (legacy pointer still readable).
- Actual:
- Result: [ ] pass / [ ] fail

#### 14. Reflection

- Expected: Reflection schedule / catch-up from User settings still works.
- Actual:
- Result: [ ] pass / [ ] fail

#### 15. Calendar

- Expected: Events create/edit/delete inside EventSheet (confirm / repeat-delete
  stay in the drawer). V3 is canonical.
- Actual:
- Result: [ ] pass / [ ] fail

#### 16. Live Activity / notifications

- Expected: Lock Screen uses custom relative labels (`X時間Y分後` / `まもなく` /
  `予定時間になりました`), not a `Text(timerInterval:)` countdown. Notifications
  fire on a physical device.
- Actual:
- Result: [ ] pass / [ ] fail

---

## Windows / CI — can confirm

- `npm ci` / `npm install`
- TypeScript (`npx tsc --noEmit`)
- Vitest (`npx vitest run`)
- functions (`node --test functions/quota-logic.test.js`)
- lint (`npm run lint`) — 0 errors
- Vite build (`npm run build`)
- `node scripts/release-preflight.mjs`
- Rules **static** tests (ownership, no `if true`, Google provider condition)
- Rules **emulator** tests when Java + Firebase CLI are available (`npm run test:rules`)
- `npx cap sync ios` compatible `cap:sync` script (plist may be absent locally; `apply-google-signin-ios.mjs` no-ops)
- Plist injection script (`GOOGLE_SERVICE_INFO_PLIST` Base64 → `ios/App/App/GoogleService-Info.plist`)
- Workflow configuration (`ios-release.yml`, `ios-simulator-build.yml`): Node 22, `npm ci`, web build, `cap sync`, SPM fix, Google Sign-In scheme, widget ruby, signing inputs
- Firebase config structure (`firebase.json` → `firestore.rules` + `storage.rules`)
- Unsigned simulator build on a **macOS GitHub runner** (not this Windows PC)
- Signed TestFlight upload when Apple signing secrets exist (do not invent them)

This Windows environment **cannot** prove that a macOS runner archive succeeded.

## TestFlight-only verification (not confirmed on Windows)

These stay **unverified** until a real device run. They are not known-broken in
code; they simply cannot be proven here. Do not mark them pass from Cursor.

- native Google Sign-In
- Google OAuth redirect
- Firebase Auth UID
- auth persistence
- initial Firestore upload
- Firestore restore after reinstall
- Firebase Storage image restore
- A/B account isolation on real device
- offline reconnect
- notifications
- Live Activity
- camera / photo attachment on physical device

## Required GitHub secrets

Same table as section B. Native Google Sign-In also needs the iOS OAuth client
in Firebase / Google Cloud for bundle `com.confast.essences` (reversed client
URL scheme is injected from the plist in CI).
