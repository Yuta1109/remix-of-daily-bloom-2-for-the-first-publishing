# Release checklist (source of truth)

Use this list before every TestFlight / App Store build.
Windows + Cursor can complete the Code gate. Firebase deploy, Apple signing,
and device checks are operational steps — not “verified on this PC”.

Architecture is frozen at Phase 12. Phase 13 is operational preflight only.

Run `npm run preflight` (`node scripts/release-preflight.mjs`) before dispatch.
It must not print secret values.

Cursor must **not** run `firebase deploy`, `git push`, or App Store Connect upload.

---

## Code gate

- [ ] Vitest (`npx vitest run`)
- [ ] functions (`node --test functions/quota-logic.test.js`)
- [ ] TypeScript (`npx tsc --noEmit`)
- [ ] lint (`npm run lint`) — 0 errors
- [ ] build (`npm run build`)
- [ ] release preflight (`npm run preflight`)

Optional: Firestore/Storage rules emulator

- [ ] `npm run test:rules` (starts Firebase emulators; skipped in default Vitest unless `FIRESTORE_EMULATOR_HOST` is set)

Phase 12 already passed Vitest / functions / TypeScript / lint / Vite build.
Re-run the full code gate only if application code changes.

---

## Release environment (audit)

| Item | Current |
| --- | --- |
| Firebase project | `todolist-app-project-4fd37` (`.firebaserc` default; `firebase.json` has no projectId) |
| iOS bundle ID | `com.confast.essences` (`capacitor.config.ts`, App pbxproj Debug+Release) |
| Widget bundle ID | `com.confast.essences.widget` (wired in CI by `setup_widget.rb`) |
| package.json version | `1.1.0` |
| CFBundleShortVersionString | `$(MARKETING_VERSION)` → **1.1** in App pbxproj |
| CFBundleVersion | `$(CURRENT_PROJECT_VERSION)` → **33** in App pbxproj |
| Node (CI) | **22** (`actions/setup-node`); not pinned in `package.json` `engines` |
| npm install strategy | CI: **`npm ci`** (requires `package-lock.json`). Local README: `npm install` |
| cap sync | After web build + plist write; then SPM fix, `apply-google-signin-ios.mjs`, widget ruby |
| plist injection | Secret → `ios/App/App/GoogleService-Info.plist` **before** Vite config and `cap sync` |
| Firebase web config | `scripts/build-firebase-web-config.mjs` from optional `FIREBASE_WEB_CONFIG` **or** the plist |
| iOS signing | Release: unsigned archive → ad-hoc entitlements (`aps-environment`) → `exportArchive` method `app-store` + ASC API |
| App Store Connect upload | `xcrun altool --upload-app` in `ios-release.yml` |

**Build number:** CI does **not** auto-increment `CURRENT_PROJECT_VERSION`.
Uploading the same **1.1 (33)** twice is a TestFlight **BLOCKER**. If 33 already
exists on App Store Connect, increment App `CURRENT_PROJECT_VERSION` before the
next dispatch. Do not change the scheme otherwise.

`setup_widget.rb` still seeds widget `MARKETING_VERSION` 1.0 / `CURRENT_PROJECT_VERSION` 1
when wiring the extension. App Store uniqueness for this IPA is the **App** target
(1.1 / 33). Treat widget mismatch as a watch item, not a version-scheme change.

Windows **cannot** verify that a macOS runner archive actually succeeded.

---

## Firebase gate

Project: `todolist-app-project-4fd37`  
Bundle: `com.confast.essences`

User-run commands (authenticated Firebase CLI on Windows — not Cursor):

```powershell
cd C:\Users\yutaa\remix-of-daily-bloom-2-for-the-first-publishing
npx firebase login
npx firebase use todolist-app-project-4fd37
npx firebase deploy --only firestore:rules,storage
```

That matches `firebase.json` (`firestore.rules` + `storage.rules`). Equivalent:
`npx firebase deploy --only firestore:rules,storage:rules`.

Do **not** include `functions` in this rules-only deploy unless you intend to
ship Live Activity Cloud Functions in the same step.

- [ ] `firestore.rules` deployed to project `todolist-app-project-4fd37`
- [ ] `storage.rules` deployed to the same project
- [ ] Firebase project confirmed (Google provider enabled)
- [ ] iOS app Bundle ID confirmed: `com.confast.essences`
- [ ] App Check enforcement is still **off** (not this release)
- [ ] `storage.rules` is git-tracked before push (working copy may have been untracked)

---

## CI gate

Canonical secret names (from workflows only):

| Secret name | Purpose | iOS Release | iOS Simulator |
| --- | --- | --- | --- |
| `GOOGLE_SERVICE_INFO_PLIST` | Base64 of `GoogleService-Info.plist` | **Required** | Optional (skip) |
| `FIREBASE_WEB_CONFIG` | Optional one-line web config JSON | Optional | Optional |
| `APP_STORE_CONNECT_KEY_ID` | ASC API key ID | **Required** | unused |
| `APP_STORE_CONNECT_ISSUER_ID` | ASC API issuer ID | **Required** | unused |
| `APP_STORE_CONNECT_PRIVATE_KEY` | `.p8` contents | **Required** | unused |
| `APPLE_TEAM_ID` | Apple Developer Team ID | **Required** | unused |

- [ ] Secret `GOOGLE_SERVICE_INFO_PLIST` (Base64 of `GoogleService-Info.plist`)
- [ ] Optional `FIREBASE_WEB_CONFIG` if plist-derived web config is not enough
- [ ] Apple signing secrets: `APP_STORE_CONNECT_KEY_ID`, `APP_STORE_CONNECT_ISSUER_ID`, `APP_STORE_CONNECT_PRIVATE_KEY`, `APPLE_TEAM_ID`
- [ ] GitHub Actions `ios-release.yml` / `ios-simulator-build.yml` paths still valid
- [ ] Do **not** invent or commit Apple signing material

### workflow_dispatch (iOS Release)

`ios-release.yml` already has `on: workflow_dispatch` only (no push trigger —
leave that unchanged).

1. GitHub
2. Actions
3. **iOS Release**
4. Run workflow

Simulator workflow is a separate unsigned compile check (`workflow_dispatch` +
push to `main` with path filters). Do not use it to ship TestFlight.

---

## GoogleService-Info.plist

- git tracked: **no** (`.gitignore` includes `GoogleService-Info.plist` and `ios/App/App/GoogleService-Info.plist`)
- CI generates `ios/App/App/GoogleService-Info.plist` from `GOOGLE_SERVICE_INFO_PLIST`
- Must exist **before** `cap sync` and before `setup_widget.rb`
- Bundled into the **App** target only (`setup_widget.rb`). Widget / Live Activity targets do not need it
- Checked-in `project.pbxproj` does not list the plist; CI wires it at build time

Scripts (no rewrite in Phase 13):

| Script | Role |
| --- | --- |
| `scripts/google-signin-plist.mjs` | Pure parse/inject helpers + dummy SAMPLE for tests. **Not** the CI entrypoint. |
| `scripts/apply-google-signin-ios.mjs` | **Canonical** runtime/CI script. Writes `GIDClientID` + reversed URL scheme into `Info.plist`. Missing plist → exit 0 no-op. |
| `ios/scripts/setup_widget.rb` | Adds the plist file reference to the **App** Xcode target. |

---

## TestFlight gate

- [ ] Signed IPA uploaded from `ios-release.yml`
- [ ] TestFlight install on a physical iPhone
- [ ] Smoke Test A–K in `docs/TESTFLIGHT.md` (do not skip ahead)
- [ ] Native Google Sign-In
- [ ] First cloud upload (`users/{uid}/...`)
- [ ] Reinstall restore with the same Google account
- [ ] Image restore (Note + Quick Memo)
- [ ] A/B isolation (sign out A → sign in B → back to A)
- [ ] Offline recovery (Airplane Mode → edit → Sync now)

See `docs/TESTFLIGHT.md` for the device script (Smoke A–K, then scenarios 1–16).

Store / Ads / Subscription TestFlight checks wait until Smoke Test passes.

---

## Blocker classification

### BLOCKER

- build fails
- signing fails
- Firebase rules unavailable (missing file, failed deploy, or project mismatch)
- Google Sign-In fails
- data restore fails
- account isolation fails
- data loss
- image restore fails
- security issue (open rules, leaked secrets, cross-user read/write)
- TestFlight **duplicate build number** (same `CFBundleVersion` already on App Store Connect)

### NON-BLOCKER

- cosmetic UI issue
- animation issue
- untranslated minor string
- warning (compiler, lint warning, preflight WARN)
- performance improvement that doesn't lose data

---

## Release hygiene

- [ ] no debug credentials in source
- [ ] no Firebase private keys in git
- [ ] no `GoogleService-Info.plist` in git
- [ ] no `.env.local` in git
- [ ] no secrets / OAuth tokens / emails in `console.log`
- [ ] legacy writes audited (`mindful-todo-data`, `reusable-tasks`, `essences-memo-library-v2`, `essences-memos`)
- [ ] `functions/node_modules` and other install artifacts are **not** committed (working-tree changes)

### Secret / tracked-file audit (Phase 13)

`git ls-files` on this working tree:

- `GoogleService-Info.plist` — **not tracked** (gitignored)
- `.env.local` — **not tracked** (gitignored)
- Service Account JSON / `.p8` / `credentials.json` — **not tracked**
- `storage.rules` — **present on disk**, historically **untracked**; add before commit
- `functions/node_modules` — **already tracked** via `.gitignore` exceptions (`!functions/node_modules/`). Do **not** stage diffs. Do not commit emulator JARs, `dist`, or debug logs.

### Legacy write audit (Phase 13)

New UI / `src/lib/v3/repository.ts` does **not** write:

- `mindful-todo-data`
- `reusable-tasks`
- `essences-memo-library-v2`
- `essences-memos`

Exceptions (compatibility only):

- **Read / migration:** `src/lib/v3/legacy-migration.ts`, `legacy-memo-archive.ts`, `storage.ts` catch-up merge. May **read** leftover keys; new rows are saved to `essences-app-data-v3`.
- **Legacy helpers still able to write, but not called from routed UI:** `saveDayData` (`src/lib/store.ts`), `saveReusable` / `addReusable` (`src/lib/reusable-tasks.ts`), `saveMemoLibrary` (`src/lib/notes-store.ts`). `MemoListPage` is **unrouted**. Routed Notes editor (`MemoDetailPage`) writes V3 via `updateNote` / `deleteNote`. `htmlToPlainText` / `normalizeNoteHtml` imports are not key writes.
- **Onboarding welcome memo loaders** in `notes-store` may still `saveRaw` if someone calls `loadMemoLibrary()` (unrouted path).

---

## Files not to commit

- `functions/node_modules/**` (even though gitignore currently re-includes them)
- `dist/`
- `.env.local` / `.env` (keep `.env.example`)
- `GoogleService-Info.plist`
- Firebase / Apple private keys, `.p8`, service-account JSON
- debug logs, `firebase-debug.log`, emulator JARs

**Do include** on the next commit (when the user asks): docs, `scripts/release-preflight.mjs`, `package.json` script, `storage.rules` if still untracked, and already-modified release yaml/docs — not application feature code.
