# Essences Live Activity / FCM — Gemini debug pack

Generated: 2026-07-22T02:50:28.209Z

## Symptom (device)
- Settings: Firestore connected, but `FCM ✗ · pushToStart ✗ · updateToken ✗`
- Error: `FCM: The operation couldn't be completed. No APNS token specified before fetching FCM Token`
- Notifications toggle is ON; local LA window may show as started.

## Ask for Gemini
1. Why does APNs device token never reach Firebase Messaging (`Messaging.apnsToken`)?
2. Is the AppDelegate cache + rebroadcast + Messaging patch sufficient, or is something else required (entitlements, provisioning, plist)?
3. Concrete code/config changes to make FCM✓ then pushToStart✓ on a real device.

## Constraints
Do NOT revert:
- `EventSheet.tsx` / `select.tsx` confirm UX
- `EssentialsWidgetLiveActivity.swift` relative labels (`X時間Y分後`)

---



========== FILE: docs/LIVE_ACTIVITY_DESIGN_AND_ISSUES.md ==========

```markdown
# Essences Live Activity — 設計と現状の問題（技術メモ）

**対象リポジトリ:** `remix-of-daily-bloom-2-for-the-first-publishing`  
**アプリ:** Essences (`com.confast.essences`)  
**Firebase プロジェクト:** `todolist-app-project-4fd37`  
**Functions リージョン:** `asia-northeast1`  
**文書作成日:** 2026-07-22  
**関連コミット例:** `822547e`（ロック画面相対表記復帰・カレンダー確認タップ修正）

> 旧文書 `docs/LIVE_ACTIVITY_TECHNICAL_BRIEF.md` は **古い**（`Text(timerInterval:)` 前提・リモート更新なし、と書いてある）。**このファイルを正とする。**

---

## 0. この文書の目的

Gemini 等に相談するための現状共有用。以下を正確に記述する。

1. ライブアクティビティ（LA）の **現行アーキテクチャ**
2. ロック画面表示（「X時間Y分後」）の仕組みと更新経路
3. 端末側 Settings に出る診断（`FCM✗ · pushToStart✗ · updateToken✗`）の意味
4. **自動更新が効かない** ときに疑うべき原因と設計上の制約
5. 意図的に固定している UI 方針（勝手に戻さないこと）

---

## 1. プロダクト要件（ユーザー視点）

| 要件 | 期待動作 |
|------|----------|
| 予定のリード時間内に入ったら | ロック画面に LA が出る（アプリ未起動でも） |
| 表示中 | 「2時間30分後」のような **日本語の相対残り時間** が時間経過で変わる |
| 開始時刻到達 | 「予定時間になりました」に切り替わる（アプリ未起動でも） |
| カレンダー編集 | 確認ダイアログのボタンがタップできる（見た目は現行のまま） |

**制約（Apple / 技術）:**

- カスタム文字列の「X時間Y分後」は、システムタイマー（`Text(timerInterval:)`）のように **OS が勝手に毎秒/毎分書き換えない**。
- アプリが **kill** されているとき、表示を進めるには原則 **ActivityKit の push update**（または限られた Timeline 再描画）が必要。
- Push-to-start（未起動から LA を開始）は **iOS 17.2+** と ActivityKit の push-to-start トークンが必要。

---

## 2. 固定 UI 方針（変更禁止）

ユーザー指示（2026-07-22）: **「戻して」と言われるまで以下を元に戻さない。**

1. **カレンダー確認 UI**  
   - 繰り返し削除シート・保存時確認は、Vaul Drawer 外の `window.confirm` / body portal に戻さない。  
   - Drawer **内側**でタップ可能なシート／Select の portal 先を Drawer 内にする実装を維持。
2. **ロック画面の相対表記**  
   - `Text(timerInterval:)`（`2:50` 形式）に戻さない。  
   - 「X時間Y分後」／「まもなく」／「予定時間になりました」を維持。

実装箇所:

- `src/components/EventSheet.tsx`
- `src/components/ui/select.tsx`
- `ios/App/EssentialsWidget/EssentialsWidgetLiveActivity.swift`

---

## 3. 全体アーキテクチャ（概要）

```
[Web / Capacitor JS]
  EventSheet 保存
    → refreshLiveActivities()          … ローカル ActivityKit start/update/end
    → scheduleLiveActivityBoundaries() … JS タイマ（showAt / start / end）
    → syncLiveActivitySchedulesRemote()… Firestore laSchedules 書き込み

[Native iOS]
  AppDelegate / LiveActivitiesPlugin
    → LiveActivityPushTokenCenter      … push-to-start トークン監視（プロセス寿命）
    → LiveActivityRefreshCenter        … 60秒 heartbeat + updateToken 監視
  EssentialsWidget (Widget Extension)
    → LockScreenView                   … 相対文言の描画

[Firebase]
  Auth（匿名） + Firestore
    devices/{uid}                      … fcmToken / pushToStartToken / liveActivityUpdateToken
    laSchedules/{deviceUid}_{eventId}  … 予定ウィンドウと status
  Cloud Functions (asia-northeast1)
    onLaScheduleWrite
    dispatchLiveActivityTask           … showAt で start push
    refreshLiveActivityTask            … 約60秒ごと update push / 開始時 arrived
```

**表示面:** ロック画面のみ（Dynamic Island は空スタブ）。

---

## 4. 経路別：何がローカルで、何がリモート必須か

| 動作 | アプリが生きている | アプリが kill |
|------|-------------------|---------------|
| リード時間内に LA を開始 | ローカル `Activity.request` で可能 | **要** FCM + push-to-start push |
| 「X時間Y分後」を進める | ローカル heartbeat（`tick` 更新）+ TimelineView | **要** FCM update + updateToken（ほぼ必須） |
| 「予定時間になりました」 | ローカル境界タイマ / phase 更新 | **要** refresh が `phase=arrived` を push |
| 終了・クリア | ローカル end | リモート end は実質未実装に近い |

Settings スクショで典型的に見えている状態:

- Firestore 接続済み・リード時間内の予定あり（端末は開始を試み済み）
- しかし **`FCM✗ · pushToStart✗ · updateToken✗`**
- エラー: `LA: push-to-start token not available yet`
- ヒント: ActivityKit push-to-start 未取得 / APNs→FCM 未取得

この状態では **kill 後の自動開始・自動更新は両方とも成立しない**。  
ローカル開始が成功していれば、**フォアグラウンド中だけ**相対表示が動く可能性がある。

---

## 5. トークン三種類（最重要）

| 名前 | 取得元 | Firestore フィールド | 用途 |
|------|--------|----------------------|------|
| **FCM** | `@capacitor-firebase/messaging` → `getToken` / `tokenReceived`（APNs 登録後） | `devices/{uid}.fcmToken` | FCM メッセージの宛先 `token`（start/update 共通の外側） |
| **pushToStart** | `Activity.pushToStartTokenUpdates`（iOS 17.2+） | `devices/{uid}.pushToStartToken` | APNs `liveActivityToken`、**`event: "start"`** |
| **updateToken** | 各 Activity の `pushTokenUpdates` | `devices/{uid}.liveActivityUpdateToken` | APNs `liveActivityToken`、**`event: "update"`** |

### ルール

- **start** には FCM + pushToStart の **両方が必須**（Functions `sendStartForSchedule`）。
- **update（相対表示のキル時更新）** には FCM + updateToken の **両方が必須**（`sendUpdateForSchedule`）。
- `updateToken✗` 単体は、**まだ push 付きで LA が一度も始まっていない**ときは正常なこともある。
- `upsertDeviceDoc` は **null で既存トークンを上書きしない**（過去のバグ対策）。

### 取得コードの所在

| トークン | Native | JS |
|----------|--------|-----|
| pushToStart | `ios/App/App/LiveActivities/LiveActivityPushTokenCenter.swift` | `src/lib/la-remote.ts`（listener / poll） |
| updateToken | `LiveActivityRefreshCenter.swift` → Notification → Plugin | `la-remote.ts` |
| FCM | Firebase Messaging + `AppDelegate.registerForRemoteNotifications` | `src/lib/fcm.ts` |

---

## 6. ContentState（ロック画面データ）

共有型: `EssencesWidgetAttributes`  
定義: `ios/App/App/LiveActivities/EssentialsAttributes.swift`  
APNs `attributes-type`: **`EssencesWidgetAttributes`**

```text
ContentState
  items: [{ title, startEpochMs, color }]   // ローカルは最大3件、CF start は原則1件
  overflow: Int
  locale: "ja" | "en"
  tick: Int          // 再描画強制用。View は値を読まないが、更新で ActivityKit が再レンダーする
  phase: "countdown" | "arrived"
```

---

## 7. ロック画面 UI（現行・固定）

ファイル: `ios/App/EssentialsWidget/EssentialsWidgetLiveActivity.swift`

相対文言ロジック `relativeRemainingText`:

| 条件 | 日本語 | 英語 |
|------|--------|------|
| `phase == "arrived"` または残り ≤ 0 | 予定時間になりました | It's time |
| 残り < 60 秒 | まもなく | soon |
| 時間+分 | X時間Y分後 | in Xh Ym |
| 時間のみ | X時間後 | in Xh |
| 分のみ | X分後 | in Xm |

描画は `TimelineView(.periodic(..., by: 60))` で包んでいるが、**kill 状態での確実な進行は保証されない**。設計上の本命は:

1. プロセス生存時: `LiveActivityRefreshCenter` が約60秒ごとに `tick` を bump して `Activity.update`
2. プロセス死亡時: Cloud Functions の `refreshLiveActivityTask` が約60秒ごとに FCM `event: "update"`

---

## 8. ローカル側フロー（詳細）

### 8.1 ウィンドウ計算

`src/lib/live-activity-window.ts`

```text
startEpochMs  = 予定開始
endEpochMs    = start + 30分（リンガー。開始後もしばらく「予定時間になりました」を残す）
windowOpen    = start − leadMinutes（上限 8時間 = Apple の active LA 制限に合わせる）
showAtEpochMs = max(windowOpen, min(now, start)) 系のクランプ
activeNow     = showAt ≤ now < start
visibleNow    = showAt ≤ now < end
```

### 8.2 JS

| 関数 | ファイル | 役割 |
|------|----------|------|
| `refreshLiveActivities` | `src/lib/live-activity.ts` | 今見える窓を集めて `LiveActivities.startOrUpdate` / なければ end |
| `scheduleLiveActivityBoundaries` | 同上 | showAt / start / end の JS タイマ |
| `initLiveActivityRemote` | `src/lib/la-remote.ts` | 匿名 Auth、トークン待ち、devices 書き込み |
| `syncLiveActivitySchedulesRemote` | 同上 | `laSchedules` を delete+rewrite |
| `initFcmRegistration` | `src/lib/fcm.ts` | 通知許可・FCM トークン取得・upload |
| `native-bootstrap` | `src/lib/native-bootstrap.ts` | 起動時に上記を接続 |

### 8.3 Native Plugin

`ios/App/App/LiveActivities/LiveActivitiesPlugin.swift`

- `startOrUpdate`: `Activity.request(..., pushType: .token)`（失敗時は `pushType: nil` にフォールバック）
- `endAll`, `areEnabled`, `getPushToStartToken`, `startPushToStartTokenUpdates`
- Listeners: `pushToStartToken`, `liveActivityUpdateToken`

### 8.4 Heartbeat

`LiveActivityRefreshCenter.swift`（iOS 16.2+）

- 約60秒ごとに全 active Activity の `tick` をインクリメントして `update`
- アプリプロセスが生きている間だけ有効
- `AppDelegate` / Plugin load / start 成功後に `start()` / `noteActivitiesChanged()`

---

## 9. リモート側フロー（Cloud Functions）

ファイル: `functions/index.js`  
定数例: `BUNDLE_ID = "com.confast.essences"`, `REFRESH_INTERVAL_MS = 60_000`

### 9.1 `onLaScheduleWrite`（`laSchedules/{id}`）

- pending/due で `showAt ≤ now` → 即 `sendStartForSchedule`
- `showAt > now` → Cloud Tasks で `dispatchLiveActivityTask` を showAt に予約
- 期限切れ・削除 → タスク取消

### 9.2 Start push（`sendStartForSchedule`）

必要: `device.fcmToken` + `device.pushToStartToken`

```text
FCM token: fcmToken
apns.liveActivityToken: pushToStartToken
headers:
  apns-push-type: liveactivity
  apns-topic: com.confast.essences.push-type.liveactivity
  apns-priority: 10
aps:
  event: start
  attributes-type: EssencesWidgetAttributes
  content-state: { items, overflow, locale, tick, phase }
```

成功後: schedule `status: started`、60秒後から refresh チェーン、開始時刻に arrived 用 refresh。

### 9.3 Update push（`sendUpdateForSchedule`）

必要: `device.fcmToken` + `device.liveActivityUpdateToken`

```text
aps.event: update
liveActivityToken: liveActivityUpdateToken
content-state.phase: countdown | arrived
```

開始時刻以降は `arrived` を一度送って refresh 停止。

### 9.4 Firestore

| コレクション | 内容 |
|--------------|------|
| `devices/{anonymousUid}` | トークン類・updatedAt |
| `laSchedules/{deviceUid}_{eventId}` | showAt / start / end / status / deviceId 等 |

Rules: 自デバイスのみ R/W（`firestore.rules`）。

---

## 10. Settings 診断の読み方

UI: `src/pages/Settings.tsx`  
データ: `getLiveActivityRemoteStatus()` / `getLiveActivityLocalStatus()`

| 表示 | 意味 |
|------|------|
| Firestore に接続済み | 匿名 Auth + web config OK |
| リード時間内の予定あり（端末側は開始を試み済み） | ローカル窓があり `refreshLiveActivities` が動いた／動こうとした |
| FCM ✓/✗ | メモリ上に FCM トークンがあるか（＝upload 済み想定） |
| pushToStart ✓/✗ | ActivityKit push-to-start を取得できているか |
| updateToken ✓/✗ | 稼働中 LA の update push トークンがあるか |
| `LA: push-to-start token not available yet` | 起動後ポーリングでも pushToStart が来なかった |
| FCM✗ ヒント | 通知許可後に APNs→FCM が必要 |
| LA✗ ヒント | iOS 17.2+ かつ「設定 > Essences > ライブアクティビティ」オンが必要 |

**再チェック**は: ローカル refresh → FCM 再初期化 → remote 再初期化 → ステータス再読込。

---

## 11. 現状の主問題（自動更新が改善しない）

### 11.1 観測事実（ユーザー端末・2026-07-22 付近）

- カレンダー確認タップ修正と「X時間Y分後」表記は **反映済み**（UI 側は新ビルドに入っている）。
- Settings では Firestore OK なのに **トークン3つとも ✗**。
- よって **リモート経路（kill 時の開始・毎分 update）が死んでいる**。
- 相対表記がロック画面に出ていても、「アプリを開かないと進まない／開始に切り替わらない」は **トークン欠落と整合的**。

### 11.2 最も疑わしい実装欠陥（2026-07-22 調査で特定・修正中）

#### A. APNs → FCM の起動レース（FCM✗ の本命）

1. `AppDelegate.didFinishLaunching` がすぐ `registerForRemoteNotifications()` する。
2. APNs が **Capacitor Firebase Messaging の `load()` より先に** device token を返す。
3. プラグインは `.capacitorDidRegisterForRemoteNotifications` を `load()` で購読するため、**最初の APNs 通知を取りこぼす**。
4. `Messaging.messaging().apnsToken` が未設定のまま → `getToken()` が空／エラー → FCM✗。
5. JS の Firebase Auth / Firestore は `VITE_FIREBASE_WEB_CONFIG` だけで動くため、「Firestore 接続済み」でも FCM✗ になりうる（観測と一致）。

**修正:** `APNsDeviceTokenCache`（UserDefaults）+ Messaging init 時にキャッシュ適用 + APNs 通知の遅延再送 + JS 側で `apnsTokenReceived` 待ち。

#### B. 診断エラーが schedule sync 成功で消える

`upsertDeviceDoc` / `syncLiveActivitySchedulesRemote` が成功時に `lastError = null` しており、トークン未取得のヒントが消える／上書きされることがあった。  
（✗ フラグ自体は in-memory なので残るが、原因メッセージが不安定。）

**修正:** FCM:/LA: 系の診断はトークンが揃うまで消さない。

#### C. `packageClassList` から LiveActivities / App が欠落しうる

`cap sync` は npm プラグインしか `packageClassList` に入れない。`LiveActivitiesPlugin` と vendored `AppPlugin` は `setup_widget.rb` 後付けが必須。  
リポジトリ上の `capacitor.config.json` に欠けている状態があり、CI で setup_widget を忘れると LA プラグインが死ぬ。

**修正:** 設定に恒常登録 + `npm run cap:sync` が `setup_widget.rb` まで実行。

#### D. updateToken✗ は二次症状

`Activity.request(pushType: .token)` が失敗すると **黙って `pushType: nil` にフォールバック**するため、ローカル表示はできても updateToken が一生出ない。APNs/FCM 未準備だと起きやすい。

### 11.3 トークン欠落のその他の候補

1. **iOS の Essences「ライブアクティビティ」がオフ** → pushToStart ストリームが来ない。
2. **`GoogleService-Info.plist` が IPA に無い** → Messaging が configure スキップ。
3. **SPM `/app` 衝突で Messaging 欠落**（対策済みだが手順逸脱で再発しうる）。
4. **iOS < 17.2** → push-to-start API 無し。

---

## 12. Capacitor / SPM / CI の現行方針（トークン修復の前提）

| 項目 | 内容 |
|------|------|
| Messaging | `@capacitor-firebase/messaging` を include。`@capacitor-firebase/app` は使わない |
| App プラグイン | `VendoredAppPlugin`（`AppPlugin.swift` を CapApp-SPM に vendor） |
| スクリプト | `npm run cap:sync` → `ensure-spm-firebase-app-link.mjs` |
| Widget セットアップ | `ios/scripts/setup_widget.rb`（entitlements, NSSupportsLiveActivities, packageClassList） |
| Plist | CI で `GoogleService-Info.plist` を書き込んでから sync/build |
| patch | Messaging が plist 無しで `FirebaseApp.configure()` して落ちないよう patch-package |

Entitlements / Info（目安）:

- `aps-environment`: production  
- `NSSupportsLiveActivities`: true  
- `NSSupportsLiveActivitiesFrequentUpdates`: true  
- background: `remote-notification`  
- APNs topic: `com.confast.essences.push-type.liveactivity`  
- Widget bundle: `com.confast.essences.widget`

---

## 13. Cloud Functions 再デプロイ要否

| 変更内容 | Functions 再デプロイ |
|----------|----------------------|
| カレンダー確認タップ / Select portal | 不要 |
| ロック画面「X時間Y分後」文言 | 不要（Widget のネイティブ再ビルドが必要） |
| `functions/index.js` の refresh/phase を **まだ本番に出していない** | **必要** |
| トークン取得・SPM・Messaging 修正 | 不要（アプリ再配布が必要）。ただし Functions が古いと update チェーンが無い |

**自動更新トラブルの一次原因がトークン ✗✗✗ のときは、先にアプリ側トークン修復。**  
Functions は「既に minute refresh + arrived が入った版」が本番にあれば追加作業は不要。

---

## 14. デバッグチェックリスト（Gemini / 開発者向け）

1. 端末 iOS バージョン ≥ 17.2 か  
2. 設定 → Essences → ライブアクティビティ **オン**  
3. 通知オンのまま Settings「再チェック」  
4. Firestore `devices/{uid}` を直視: `fcmToken` / `pushToStartToken` / `liveActivityUpdateToken` が null でないか  
5. TestFlight ビルドで CapApp-SPM `Package.swift` に Messaging と VendoredAppPlugin があるか（CI ログ）  
6. `GoogleService-Info.plist` が App ターゲットに含まれるか  
7. LA が一度ローカル起動したあと `updateToken` が ✓ になるか  
8. `laSchedules` の status が `pending` → `started` / `error` のどれか  
9. Functions ログで `sendStartForSchedule` / `sendUpdateForSchedule` の欠落トークン警告  
10. 相対表示の進行テスト:  
    - アプリ前面: 1分待って文言が変わるか（heartbeat）  
    - アプリ kill: 1分待って変わるか（update push）

---

## 15. 主要ファイル索引

| パス | 役割 |
|------|------|
| `src/lib/live-activity.ts` | ローカル LA 制御 |
| `src/lib/live-activity-window.ts` | リード時間ウィンドウ |
| `src/lib/la-remote.ts` | devices / laSchedules / 診断 |
| `src/lib/fcm.ts` | FCM 登録 |
| `src/lib/native-bootstrap.ts` | 起動配線 |
| `src/pages/Settings.tsx` | 診断 UI |
| `src/components/EventSheet.tsx` | LA トグル・保存（確認 UI 固定方針） |
| `ios/App/EssentialsWidget/EssentialsWidgetLiveActivity.swift` | 相対文言 UI（固定方針） |
| `ios/App/App/LiveActivities/LiveActivitiesPlugin.swift` | Capacitor プラグイン |
| `ios/App/App/LiveActivities/LiveActivityPushTokenCenter.swift` | push-to-start |
| `ios/App/App/LiveActivities/LiveActivityRefreshCenter.swift` | heartbeat + updateToken |
| `ios/App/App/LiveActivities/EssentialsAttributes.swift` | 共有 Attributes |
| `ios/App/App/AppDelegate.swift` | 早期 start / APNs |
| `ios/scripts/setup_widget.rb` | Widget・plist・packageClassList |
| `scripts/ensure-spm-firebase-app-link.mjs` | SPM 衝突回避 |
| `functions/index.js` | start/update push |
| `firestore.rules` | devices / laSchedules ACL |

---

## 16. Gemini に投げるときの短い要約（コピペ用）

```text
Essences (Capacitor + ActivityKit) の Live Activity は二系統。
(A) アプリ生存時: Activity.request + 60秒 heartbeat で ContentState.tick を更新し、
    ロック画面はカスタム相対文言「X時間Y分後」を描画。
(B) アプリ kill 時: Firestore devices の FCM + pushToStart で start、
    FCM + updateToken で 60秒ごとの update。Cloud Functions が担当。

現状の問題: Settings で Firestore 接続は成功しているが
FCM✗ / pushToStart✗ / updateToken✗。
エラー「push-to-start token not available yet」。
そのため kill 後の自動開始・相対表示の自動更新が動かない。
UI の「X時間Y分後」復帰は完了済み。自動更新のブロッカーはトークン取得/アップロード。

過去に SPM で Capacitor App と Firebase App の identity 衝突があり Messaging が欠落したことがある。
現行は VendoredAppPlugin + ensure-spm-firebase-app-link.mjs で回避。
```

---

## 17. 次の打ち手（提案・未実施）

文書化のみ。実装は別判断。

1. **実機で `devices` ドキュメントを確認**し、null がクライアント未取得か upload 失敗かを切り分ける  
2. Xcode / TestFlight で Messaging リンクと plist 同梱を検証  
3. pushToStart が来ない場合: OS の LA 設定・17.2・`LiveActivityPushTokenCenter` が AppDelegate から start されているかを確認  
4. FCM だけ直っても pushToStart が ✗ なら kill 開始は不可  
5. 両方 ✓ でも updateToken ✗ のままなら、start はできても **相対文言のキル時更新は不可**（一度 push 付きで LA を起動してトークン採取が必要）

---

*End of document.*

```


========== FILE: src/lib/fcm.ts ==========

```typescript
import { Capacitor } from "@capacitor/core";
import { FirebaseMessaging } from "@capacitor-firebase/messaging";
import { setRemoteFcmToken, setRemoteDiagnosticHint } from "./la-remote";
import { LiveActivities } from "./live-activity";
import { laDebugLog } from "./la-debug-log";

let listenersBound = false;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

async function fetchFcmTokenWithRetry(attempts = 12): Promise<string | null> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      laDebugLog("fcm", `getToken attempt ${i + 1}/${attempts}…`);
      const { token } = await FirebaseMessaging.getToken();
      if (token) {
        laDebugLog("fcm", `getToken OK (len=${token.length})`, "ok");
        return token;
      }
      laDebugLog("fcm", `getToken returned empty`, "warn");
    } catch (err) {
      lastErr = err;
      laDebugLog("fcm", `getToken error: ${errMsg(err)}`, "error");
    }
    await sleep(750 * (i + 1));
  }
  if (lastErr) throw lastErr;
  return null;
}

async function readNativeDebug(): Promise<Record<string, unknown> | null> {
  try {
    const info = await (
      LiveActivities as unknown as {
        getTokenDebugInfo: () => Promise<Record<string, unknown>>;
      }
    ).getTokenDebugInfo();
    laDebugLog(
      "native",
      `debug apnsBytes=${info.apnsCacheBytes} plist=${info.hasGoogleServiceInfoPlist} ` +
        `LA.enabled=${info.activitiesEnabled} pts=${info.hasPushToStartToken} ` +
        `ios=${info.iosVersion} apnsErr=${info.apnsRegisterError ?? "none"}`,
    );
    return info;
  } catch (err) {
    laDebugLog("native", `getTokenDebugInfo failed: ${errMsg(err)}`, "error");
    return null;
  }
}

async function rebroadcastApns(): Promise<boolean> {
  try {
    const result = await (
      LiveActivities as unknown as {
        rebroadcastApnsToken: () => Promise<{
          rebroadcast: boolean;
          apnsCacheBytes: number;
          apnsRegisterError?: string;
        }>;
      }
    ).rebroadcastApnsToken();
    laDebugLog(
      "apns",
      `rebroadcast=${result.rebroadcast} cacheBytes=${result.apnsCacheBytes}` +
        (result.apnsRegisterError ? ` err=${result.apnsRegisterError}` : ""),
      result.rebroadcast ? "ok" : "warn",
    );
    return result.rebroadcast;
  } catch (err) {
    laDebugLog("apns", `rebroadcastApnsToken failed: ${errMsg(err)}`, "error");
    return false;
  }
}

/**
 * Wait until native Messaging has an APNs device token (or timeout).
 */
async function waitForApnsToken(timeoutMs = 15_000): Promise<boolean> {
  return new Promise((resolve) => {
    let done = false;
    let handle: { remove: () => Promise<void> } | undefined;
    const finish = (ok: boolean) => {
      if (done) return;
      done = true;
      void handle?.remove();
      laDebugLog("apns", ok ? "apnsTokenReceived fired" : `apns wait timed out (${timeoutMs}ms)`, ok ? "ok" : "warn");
      resolve(ok);
    };
    const timer = setTimeout(() => finish(false), timeoutMs);
    void FirebaseMessaging.addListener("apnsTokenReceived", () => {
      clearTimeout(timer);
      finish(true);
    })
      .then((h) => {
        handle = h;
      })
      .catch((err) => {
        clearTimeout(timer);
        laDebugLog("apns", `apnsTokenReceived listener failed: ${errMsg(err)}`, "error");
        finish(false);
      });
  });
}

/**
 * Request notification permission (if needed) and upload the FCM registration
 * token to Firestore via setRemoteFcmToken.
 */
export async function initFcmRegistration(): Promise<void> {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== "ios") {
    return;
  }

  laDebugLog("fcm", "initFcmRegistration start");

  try {
    const perm = await FirebaseMessaging.checkPermissions();
    laDebugLog("fcm", `permission=${perm.receive}`);
    if (perm.receive !== "granted") {
      const req = await FirebaseMessaging.requestPermissions();
      laDebugLog("fcm", `requestPermissions → ${req.receive}`);
      if (req.receive !== "granted") {
        setRemoteDiagnosticHint("FCM: notification permission not granted");
        laDebugLog("fcm", "aborted: permission not granted", "error");
        return;
      }
    }

    try {
      await FirebaseMessaging.requestPermissions();
    } catch {
      /* already granted */
    }

    if (!listenersBound) {
      listenersBound = true;
      await FirebaseMessaging.addListener("tokenReceived", (event) => {
        if (event.token) {
          laDebugLog("fcm", `tokenReceived event (len=${event.token.length})`, "ok");
          setRemoteFcmToken(event.token);
        }
      });
      try {
        await FirebaseMessaging.addListener("apnsTokenReceived", (ev) => {
          const len =
            ev && typeof ev === "object" && "token" in ev
              ? String((ev as { token?: string }).token ?? "").length
              : 0;
          laDebugLog("apns", `apnsTokenReceived event (hexLen≈${len})`, "ok");
          void fetchFcmTokenWithRetry(6).then((token) => {
            if (token) setRemoteFcmToken(token);
          });
        });
      } catch (err) {
        laDebugLog("apns", `could not add apnsTokenReceived: ${errMsg(err)}`, "warn");
      }
    }

    const before = await readNativeDebug();
    const hadCache = Number(before?.apnsCacheBytes ?? 0) > 0;
    if (!hadCache) {
      laDebugLog(
        "apns",
        "No APNs device token cached yet — will wait / rebroadcast. " +
          "If this stays 0, didRegisterForRemoteNotifications never ran (check apnsRegisterError).",
        "warn",
      );
    }

    // Ask Messaging plugin to see the cached APNs token again BEFORE getToken.
    await rebroadcastApns();
    const apnsOk = hadCache || (await waitForApnsToken(12_000));

    if (!apnsOk) {
      const after = await readNativeDebug();
      const apnsErr = after?.apnsRegisterError;
      const hint = apnsErr
        ? `FCM: APNs registration failed — ${String(apnsErr)}`
        : "FCM: No APNS token specified before fetching FCM Token (APNs device token never arrived). Check Push entitlement, GoogleService-Info.plist in IPA, and that the device can reach APNs.";
      setRemoteDiagnosticHint(hint);
      laDebugLog("fcm", `skip getToken — no APNs yet. ${hint}`, "error");
      // Still try once so the exact Firebase error stays visible if any.
    }

    const token = await fetchFcmTokenWithRetry(apnsOk ? 12 : 3);
    if (token) {
      setRemoteFcmToken(token);
      laDebugLog("fcm", "FCM token stored for Firestore upload", "ok");
    } else {
      const after = await readNativeDebug();
      const hint =
        after?.apnsRegisterError
          ? `FCM: APNs failed — ${String(after.apnsRegisterError)}`
          : Number(after?.apnsCacheBytes ?? 0) === 0
            ? "FCM: No APNS token specified before fetching FCM Token (cache still empty)"
            : "FCM: getToken empty after retries despite APNs cache — Messaging may not have received apnsToken (plugin load / patch).";
      setRemoteDiagnosticHint(hint);
      laDebugLog("fcm", hint, "error");
    }
  } catch (err) {
    const msg = errMsg(err);
    console.warn("[fcm] registration failed:", msg);
    setRemoteDiagnosticHint(`FCM: ${msg}`);
    laDebugLog("fcm", `registration failed: ${msg}`, "error");
  }
}

```


========== FILE: src/lib/la-remote.ts ==========

```typescript
import { Capacitor } from "@capacitor/core";
import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import {
  getAuth,
  initializeAuth,
  indexedDBLocalPersistence,
  signInAnonymously,
  type Auth,
} from "firebase/auth";
import {
  getFirestore,
  doc,
  setDoc,
  collection,
  writeBatch,
  getDocs,
  query,
  where,
  type Firestore,
} from "firebase/firestore";
import { LiveActivities, isLiveActivitySupported, currentLocale } from "./live-activity";
import { collectLiveActivityWindows } from "./live-activity-window";
import { laDebugLog } from "./la-debug-log";

/**
 * Remote Live Activity scheduling via Firebase (project todolist-app-project-4fd37).
 *
 * showAtEpochMs = max(start − lead, now) so enabling LA inside an already-open
 * window (lead 4h, event in 3h) schedules an immediate push / local start.
 *
 * Requires VITE_FIREBASE_WEB_CONFIG baked at Vite build time (CI derives it from
 * GoogleService-Info.plist and/or FIREBASE_WEB_CONFIG secret). Without it the
 * app never talks to Firestore — Usage stays at zero.
 */

const PROJECT_ID = "todolist-app-project-4fd37";

export type FirebaseWebConfig = {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket?: string;
  messagingSenderId: string;
  appId: string;
};

export type LiveActivityRemoteStatus = {
  supported: boolean;
  configPresent: boolean;
  projectId: string | null;
  authenticated: boolean;
  deviceUid: string | null;
  hasFcmToken: boolean;
  hasPushToStartToken: boolean;
  hasUpdateToken: boolean;
  lastError: string | null;
  lastSyncAt: number | null;
  diagnosticHint: string | null;
};

function readWebConfig(): FirebaseWebConfig | null {
  const raw = import.meta.env.VITE_FIREBASE_WEB_CONFIG as string | undefined;
  if (raw?.trim()) {
    try {
      const parsed = JSON.parse(raw) as FirebaseWebConfig;
      if (parsed?.apiKey && parsed?.projectId && parsed?.appId && parsed?.messagingSenderId) {
        return {
          ...parsed,
          authDomain: parsed.authDomain || `${parsed.projectId}.firebaseapp.com`,
        };
      }
      console.warn("[la-remote] VITE_FIREBASE_WEB_CONFIG missing required keys");
    } catch {
      console.warn("[la-remote] Invalid VITE_FIREBASE_WEB_CONFIG JSON");
    }
  }
  const apiKey = import.meta.env.VITE_FIREBASE_API_KEY as string | undefined;
  const appId = import.meta.env.VITE_FIREBASE_APP_ID as string | undefined;
  const messagingSenderId = import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID as string | undefined;
  if (!apiKey || !appId || !messagingSenderId) return null;
  return {
    apiKey,
    authDomain: (import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string) || `${PROJECT_ID}.firebaseapp.com`,
    projectId: (import.meta.env.VITE_FIREBASE_PROJECT_ID as string) || PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET as string | undefined,
    messagingSenderId,
    appId,
  };
}

let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let db: Firestore | null = null;
let initPromise: Promise<boolean> | null = null;
let deviceUid: string | null = null;
let pushToStartToken: string | null = null;
let fcmToken: string | null = null;
let liveActivityUpdateToken: string | null = null;
let lastError: string | null = null;
let lastSyncAt: number | null = null;
let cachedConfig: FirebaseWebConfig | null | undefined;
let pushToStartListenerBound = false;
let updateTokenListenerBound = false;
let diagnosticHint: string | null = null;

function webConfig(): FirebaseWebConfig | null {
  if (cachedConfig === undefined) cachedConfig = readWebConfig();
  return cachedConfig;
}

function setError(err: unknown): void {
  const code =
    err && typeof err === "object" && "code" in err
      ? String((err as { code?: string }).code)
      : "";
  const msg = err instanceof Error ? err.message : String(err);
  lastError = code ? `${code}: ${msg}` : msg;
  console.warn("[la-remote]", lastError);
}

/** Surface non-fatal FCM / token hints in Settings without clearing Auth success. */
export function setRemoteDiagnosticHint(hint: string): void {
  diagnosticHint = hint;
  if (!deviceUid) {
    lastError = hint;
    return;
  }
  // Keep Auth/Firestore success visible; append token hint.
  if (
    !lastError ||
    lastError.startsWith("FCM:") ||
    lastError.startsWith("FirebaseApp:") ||
    lastError.startsWith("LA:")
  ) {
    lastError = hint;
  }
}

export function getLiveActivityRemoteStatus(): LiveActivityRemoteStatus {
  const config = webConfig();
  return {
    supported: isLiveActivitySupported(),
    configPresent: !!config,
    projectId: config?.projectId ?? null,
    authenticated: !!deviceUid,
    deviceUid,
    hasFcmToken: !!fcmToken,
    hasPushToStartToken: !!pushToStartToken,
    hasUpdateToken: !!liveActivityUpdateToken,
    lastError,
    lastSyncAt,
    diagnosticHint,
  };
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    promise.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

function getOrInitAuth(firebaseApp: FirebaseApp): Auth {
  try {
    // WKWebView: default getAuth() persistence can hang; indexedDB is reliable.
    return initializeAuth(firebaseApp, {
      persistence: indexedDBLocalPersistence,
    });
  } catch {
    return getAuth(firebaseApp);
  }
}

async function ensureFirebase(): Promise<boolean> {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    if (!isLiveActivitySupported()) return false;
    const config = webConfig();
    if (!config) {
      lastError =
        "Firebase web config missing in this build (VITE_FIREBASE_WEB_CONFIG). Rebuild after CI plist/config fix.";
      console.info("[la-remote]", lastError);
      return false;
    }
    app = getApps().length ? getApps()[0]! : initializeApp(config);
    auth = getOrInitAuth(app);
    db = getFirestore(app);
    await withTimeout(
      (async () => {
        if (auth!.currentUser) {
          deviceUid = auth!.currentUser.uid;
          lastError = null;
          return;
        }
        const cred = await signInAnonymously(auth!);
        deviceUid = cred.user.uid;
        lastError = null;
      })(),
      30_000,
      "Firebase Auth",
    );
    return true;
  })().catch((err) => {
    setError(err);
    initPromise = null;
    return false;
  });
  return initPromise;
}

async function upsertDeviceDoc(): Promise<void> {
  if (!db || !deviceUid) return;
  try {
    // Never write null over a real token — boot races used to wipe FCM/LA tokens.
    const payload: Record<string, unknown> = {
      platform: Capacitor.getPlatform(),
      updatedAt: Date.now(),
    };
    if (pushToStartToken) payload.pushToStartToken = pushToStartToken;
    if (fcmToken) payload.fcmToken = fcmToken;
    if (liveActivityUpdateToken) payload.liveActivityUpdateToken = liveActivityUpdateToken;

    await setDoc(doc(db, "devices", deviceUid), payload, { merge: true });
    lastSyncAt = Date.now();
    // Do NOT clear FCM/LA token diagnostics here — schedule sync can succeed
    // while tokens are still missing (the exact Settings FCM✗ · LA✗ case).
    if (fcmToken && pushToStartToken && lastError?.startsWith("LA:")) {
      lastError = null;
      diagnosticHint = null;
    }
    if (fcmToken && lastError?.startsWith("FCM:")) {
      lastError = null;
      if (diagnosticHint?.startsWith("FCM:")) diagnosticHint = null;
    }
  } catch (err) {
    setError(err);
  }
}

/**
 * Call once on native boot. Starts push-to-start token observation and
 * syncs schedules to Firestore when config is present.
 */
async function ingestPushToStartToken(token: string | null | undefined): Promise<void> {
  if (!token) return;
  pushToStartToken = token;
  laDebugLog("la", `pushToStart ingested (len=${token.length})`, "ok");
  const ok = await ensureFirebase();
  if (ok) {
    await upsertDeviceDoc();
    await syncLiveActivitySchedulesRemote();
  }
}

export async function initLiveActivityRemote(): Promise<void> {
  if (!isLiveActivitySupported()) return;
  laDebugLog("la", "initLiveActivityRemote start");

  try {
    const cap = LiveActivities as unknown as {
      addListener?: (
        event: string,
        cb: (data: { token: string }) => void,
      ) => Promise<{ remove: () => void }>;
    };
    // Register the listener BEFORE starting updates so the first token is not missed.
    if (cap.addListener && !pushToStartListenerBound) {
      pushToStartListenerBound = true;
      await cap.addListener("pushToStartToken", (data) => {
        void ingestPushToStartToken(data.token);
      });
      laDebugLog("la", "pushToStartToken listener bound");
    }
    if (cap.addListener && !updateTokenListenerBound) {
      updateTokenListenerBound = true;
      await cap.addListener("liveActivityUpdateToken", (data) => {
        if (!data.token) return;
        liveActivityUpdateToken = data.token;
        laDebugLog("la", `updateToken ingested (len=${data.token.length})`, "ok");
        void ensureFirebase().then((ok) => {
          if (ok) void upsertDeviceDoc();
        });
      });
      laDebugLog("la", "liveActivityUpdateToken listener bound");
    }
    await LiveActivities.startPushToStartTokenUpdates();

    // Poll — ActivityKit often emits push-to-start several seconds after launch.
    for (let i = 0; i < 20 && !pushToStartToken; i++) {
      try {
        const { token } = await LiveActivities.getPushToStartToken();
        if (token) {
          await ingestPushToStartToken(token);
          break;
        }
        if (i === 0 || i === 4 || i === 9 || i === 19) {
          laDebugLog("la", `pushToStart poll ${i + 1}/20 — still empty`);
        }
      } catch (err) {
        laDebugLog(
          "la",
          `getPushToStartToken failed: ${err instanceof Error ? err.message : String(err)}`,
          "error",
        );
      }
      await new Promise((r) => setTimeout(r, 1500));
    }
    if (!pushToStartToken) {
      try {
        const { enabled } = await LiveActivities.areEnabled();
        if (!enabled) {
          setRemoteDiagnosticHint(
            "LA: Live Activities are OFF for Essences (iOS Settings → Essences → Live Activities). push-to-start token will not arrive.",
          );
          laDebugLog("la", "activitiesEnabled=false", "error");
        } else {
          setRemoteDiagnosticHint(
            "LA: push-to-start token not available yet (iOS 17.2+, Live Activities On, and ActivityKit must emit a token — reopen app / Recheck after a minute)",
          );
          laDebugLog("la", "activitiesEnabled=true but no pushToStart yet", "warn");
        }
      } catch (err) {
        setRemoteDiagnosticHint(
          "LA: push-to-start token not available yet (LiveActivities plugin may be missing from packageClassList — run setup_widget.rb after cap sync)",
        );
        laDebugLog(
          "la",
          `areEnabled failed: ${err instanceof Error ? err.message : String(err)}`,
          "error",
        );
      }
    }
  } catch (err) {
    setError(err);
    laDebugLog(
      "la",
      `initLiveActivityRemote error: ${err instanceof Error ? err.message : String(err)}`,
      "error",
    );
  }

  const ok = await ensureFirebase();
  laDebugLog("la", `firebase ensure → ${ok} uid=${deviceUid?.slice(0, 8) ?? "none"}`);
  if (!ok) return;
  await upsertDeviceDoc();
  await syncLiveActivitySchedulesRemote();
}

/** Replace this device's pending LA schedules in Firestore. */
export async function syncLiveActivitySchedulesRemote(): Promise<void> {
  const ok = await ensureFirebase();
  if (!ok || !db || !deviceUid) return;

  try {
    const now = new Date();
    const locale = currentLocale();
    // Only schedule remote push for not-yet-started windows.
    const windows = collectLiveActivityWindows(now).filter((w) => w.activeNow || w.showAtEpochMs > now.getTime());

    const existing = await getDocs(
      query(collection(db, "laSchedules"), where("deviceId", "==", deviceUid)),
    );
    const batch = writeBatch(db);
    existing.forEach((d) => batch.delete(d.ref));

    for (const w of windows) {
      if (w.startEpochMs <= now.getTime()) continue; // don't re-push after start
      const ref = doc(collection(db, "laSchedules"), `${deviceUid}_${w.eventId}`);
      batch.set(ref, {
        deviceId: deviceUid,
        eventId: w.eventId,
        title: w.title,
        color: w.color,
        locale,
        showAtEpochMs: w.showAtEpochMs,
        endAtEpochMs: w.endEpochMs,
        startEpochMs: w.startEpochMs,
        status: w.activeNow ? "due" : "pending",
        updatedAt: Date.now(),
      });
    }
    await batch.commit();
    lastSyncAt = Date.now();
    // Preserve token-acquisition diagnostics (FCM✗ / pushToStart✗).
    if (
      lastError &&
      (lastError.startsWith("FCM:") ||
        lastError.startsWith("LA:") ||
        lastError.startsWith("FirebaseApp:"))
    ) {
      /* keep */
    } else {
      lastError = null;
    }
  } catch (err) {
    setError(err);
  }
}

/** Optional: set FCM token from native Messaging when available. */
export function setRemoteFcmToken(token: string | null): void {
  if (!token) return;
  fcmToken = token;
  diagnosticHint = null;
  void ensureFirebase().then(async (ok) => {
    if (!ok) return;
    await upsertDeviceDoc();
    // Re-write schedules so Cloud Functions retry any stuck "due" rows.
    await syncLiveActivitySchedulesRemote();
  });
}

```


========== FILE: src/lib/la-debug-log.ts ==========

```typescript
/**
 * In-app diagnostic ring buffer for Live Activity / FCM token debugging.
 * Shown on Settings so TestFlight devices can report what failed without Xcode.
 */

export type LaDebugLevel = "info" | "warn" | "error" | "ok";

export type LaDebugEntry = {
  id: number;
  at: number;
  level: LaDebugLevel;
  source: string;
  message: string;
};

const MAX = 80;
let seq = 0;
const entries: LaDebugEntry[] = [];
const listeners = new Set<() => void>();

function notify(): void {
  listeners.forEach((l) => l());
}

export function laDebugLog(
  source: string,
  message: string,
  level: LaDebugLevel = "info",
): void {
  seq += 1;
  entries.push({ id: seq, at: Date.now(), level, source, message });
  while (entries.length > MAX) entries.shift();
  console[level === "error" ? "error" : level === "warn" ? "warn" : "log"](
    `[la-debug:${source}] ${message}`,
  );
  notify();
}

export function getLaDebugLog(): readonly LaDebugEntry[] {
  return entries;
}

export function clearLaDebugLog(): void {
  entries.length = 0;
  notify();
}

export function subscribeLaDebugLog(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function formatLaDebugLogForCopy(): string {
  return entries
    .map((e) => {
      const t = new Date(e.at).toISOString().slice(11, 23);
      return `${t} [${e.level}] ${e.source}: ${e.message}`;
    })
    .join("\n");
}

```


========== FILE: src/lib/live-activity.ts ==========

```typescript
import { Capacitor, registerPlugin } from "@capacitor/core";
import { collectLiveActivityWindows } from "./live-activity-window";

/**
 * Live Activity design (ActivityKit / Apple HIG):
 *
 * - Minimum iOS 17.2 (ActivityKit push-to-start; no wake-notification fallback).
 * - One shared Lock Screen activity (max 3 event rows).
 * - If the user enables LA while already inside the lead window (e.g. lead=4h
 *   but event is in 3h), we start **immediately** on save (and remote push
 *   uses showAt=now). Future windows are scheduled for start − lead.
 * - Target path: Firebase / APNs push-to-start when killed.
 * - Active ≤ 8h; Lock Screen may linger ≤ 12h total.
 */

const MAX_ITEMS = 3;

export interface LiveActivityItem {
  title: string;
  startEpochMs: number;
  color: string;
}

export interface LiveActivityPayload {
  locale: "en" | "ja";
  items: LiveActivityItem[];
  overflow: number;
  endEpochMs: number;
  /** "countdown" | "arrived" — Lock Screen copy after event start. */
  phase?: "countdown" | "arrived";
}

export interface LiveActivitiesPlugin {
  areEnabled(): Promise<{ enabled: boolean }>;
  startOrUpdate(payload: LiveActivityPayload): Promise<{ activityId: string | null }>;
  endAll(): Promise<void>;
  /** Observe ActivityKit push-to-start token (iOS 17.2+). */
  startPushToStartTokenUpdates(): Promise<void>;
  /** Cached push-to-start token if ActivityKit has already emitted one. */
  getPushToStartToken(): Promise<{ token: string | null }>;
  /** Native APNs / LA snapshot for Settings diagnostics. */
  getTokenDebugInfo(): Promise<{
    apnsCacheBytes?: number;
    apnsRegisterError?: string | null;
    hasGoogleServiceInfoPlist?: boolean;
    activitiesEnabled?: boolean;
    activeActivityCount?: number;
    hasPushToStartToken?: boolean;
    iosVersion?: string;
    [key: string]: unknown;
  }>;
  /** Re-post cached APNs token to Firebase Messaging. */
  rebroadcastApnsToken(): Promise<{
    rebroadcast: boolean;
    apnsCacheBytes: number;
    apnsRegisterError?: string;
  }>;
}

export const LiveActivities = registerPlugin<LiveActivitiesPlugin>("LiveActivities");

export function isLiveActivitySupported(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "ios";
}

function currentLocale(): "en" | "ja" {
  try {
    const saved = localStorage.getItem("growth-app-lang");
    if (saved === "ja" || saved === "en") return saved;
  } catch {
    /* ignore */
  }
  return (navigator.language || "en").startsWith("ja") ? "ja" : "en";
}

/**
 * Items still on the Lock Screen: lead window through post-start linger.
 * Pre-start → countdown; after start (linger) → arrived phase.
 * Opening the app after linger ends clears the card.
 */
function collectVisibleItems(now: Date): {
  items: LiveActivityItem[];
  phase: "countdown" | "arrived";
} {
  const windows = collectLiveActivityWindows(now)
    .filter((w) => w.visibleNow)
    .sort((a, b) => a.startEpochMs - b.startEpochMs);
  const nowMs = now.getTime();
  const anyCounting = windows.some((w) => nowMs < w.startEpochMs);
  return {
    items: windows.map((w) => ({
      title: w.title,
      startEpochMs: w.startEpochMs,
      color: w.color,
    })),
    phase: anyCounting ? "countdown" : "arrived",
  };
}

/** Milliseconds until the next Live Activity window opens or closes. */
export function msUntilNextLiveActivityBoundary(from = new Date()): number | null {
  const now = from.getTime();
  let nextMs: number | null = null;

  for (const w of collectLiveActivityWindows(from)) {
    for (const boundary of [w.showAtEpochMs, w.startEpochMs, w.endEpochMs]) {
      if (boundary > now) {
        nextMs = nextMs === null ? boundary : Math.min(nextMs, boundary);
      }
    }
  }

  if (nextMs === null) return null;
  return Math.max(nextMs - now + 300, 1000);
}

let boundaryTimer: ReturnType<typeof setTimeout> | undefined;

function scheduleNextBoundary(): void {
  clearTimeout(boundaryTimer);
  const ms = msUntilNextLiveActivityBoundary();
  if (ms === null) return;
  boundaryTimer = setTimeout(() => {
    void refreshLiveActivities().finally(scheduleNextBoundary);
  }, ms);
}

export function scheduleLiveActivityBoundaries(): void {
  if (!isLiveActivitySupported()) return;
  scheduleNextBoundary();
}

export function stopLiveActivityBoundaries(): void {
  if (boundaryTimer) clearTimeout(boundaryTimer);
  boundaryTimer = undefined;
}

/**
 * Starts/updates/ends Live Activities for events already in their lead window.
 * Called after save: if lead=4h and event is in 3h, starts immediately.
 */
export type LiveActivityLocalStatus = {
  supported: boolean;
  systemEnabled: boolean | null;
  activeCount: number;
  lastError: string | null;
};

let lastLocalError: string | null = null;
let lastSystemEnabled: boolean | null = null;
let lastActiveCount = 0;

export function getLiveActivityLocalStatus(): LiveActivityLocalStatus {
  return {
    supported: isLiveActivitySupported(),
    systemEnabled: lastSystemEnabled,
    activeCount: lastActiveCount,
    lastError: lastLocalError,
  };
}

export async function refreshLiveActivities(): Promise<void> {
  if (!isLiveActivitySupported()) return;

  try {
    const { enabled } = await LiveActivities.areEnabled();
    lastSystemEnabled = enabled;
    if (!enabled) {
      lastLocalError =
        "Live Activities are off for Essences in iOS Settings → Essences → Live Activities";
      scheduleNextBoundary();
      return;
    }
  } catch (err) {
    lastLocalError = err instanceof Error ? err.message : String(err);
    scheduleNextBoundary();
    return;
  }

  const now = new Date();
  const { items: visible, phase } = collectVisibleItems(now);
  lastActiveCount = visible.length;

  if (visible.length === 0) {
    try {
      await LiveActivities.endAll();
      lastLocalError = null;
    } catch {
      /* ignore */
    }
    scheduleNextBoundary();
    return;
  }

  const items = visible.slice(0, MAX_ITEMS);
  const overflow = visible.length - items.length;
  // Keep ActivityKit alive through post-start linger for "It's time".
  const endEpochMs =
    collectLiveActivityWindows(now)
      .filter((w) => w.visibleNow)
      .map((w) => w.endEpochMs)
      .sort((a, b) => a - b)[0] ??
    (items[0]?.startEpochMs ?? now.getTime()) + 30 * 60_000;

  try {
    await LiveActivities.startOrUpdate({
      locale: currentLocale(),
      items,
      overflow,
      endEpochMs,
      phase,
    });
    lastLocalError = null;
  } catch (err) {
    lastLocalError = err instanceof Error ? err.message : String(err);
    console.warn("[LiveActivity] startOrUpdate failed:", err);
  }

  scheduleNextBoundary();
}

export { currentLocale };

```


========== FILE: src/lib/live-activity-window.ts ==========

```typescript
import {
  effectiveLiveActivityLeadMinutes,
  loadEvents,
  upcomingOccurrenceStarts,
  type CalendarEvent,
  type LiveActivityLead,
} from "./events-store";

/**
 * After event start, keep the Lock Screen card briefly so the widget can show
 * "It's time" instead of the system stale spinner. Cleared when the user opens
 * the app (refresh ends activities with no visible windows) or linger elapses.
 */
export const LIVE_ACTIVITY_LINGER_MS = 30 * 60_000;

/**
 * Live Activity lead window for one occurrence.
 *
 * Example: lead = 4h, event starts in 3h → window already open → showAt = now
 * (display immediately on save / push). If the event is 5h away, showAt =
 * start − 4h (future), and the activity starts then (push-to-start when killed).
 */
export interface LiveActivityWindow {
  eventId: string;
  title: string;
  color: string;
  startEpochMs: number;
  /** When the LA should appear (never after start; never before window open). */
  showAtEpochMs: number;
  /** When the LA should dismiss if the app never opens (start + linger). */
  endEpochMs: number;
  leadMinutes: number;
  /** True when inside [showAt, start) — schedule push / local start. */
  activeNow: boolean;
  /** True when the Lock Screen should still show (includes post-start linger). */
  visibleNow: boolean;
}

export function computeLiveActivityWindow(
  event: CalendarEvent,
  now = new Date(),
): LiveActivityWindow | null {
  if (!event.liveActivity || event.allDay) return null;
  const leadMinutes = effectiveLiveActivityLeadMinutes(event.liveActivityLead);
  // Include current occurrence even if start just passed (linger window).
  const [next] = upcomingOccurrenceStarts(event, new Date(now.getTime() - LIVE_ACTIVITY_LINGER_MS), 14, 1);
  if (!next) return null;

  const startEpochMs = next.getTime();
  const endEpochMs = startEpochMs + LIVE_ACTIVITY_LINGER_MS;
  const windowOpen = startEpochMs - leadMinutes * 60_000;
  const nowMs = now.getTime();
  if (nowMs >= endEpochMs) return null;

  // Already inside the lead window → start immediately (not wait until "4h before").
  const showAtEpochMs = Math.max(windowOpen, Math.min(nowMs, startEpochMs));
  return {
    eventId: event.id,
    title: event.title,
    color: event.color || "blue",
    startEpochMs,
    showAtEpochMs,
    endEpochMs,
    leadMinutes,
    activeNow: nowMs >= showAtEpochMs && nowMs < startEpochMs,
    visibleNow: nowMs >= showAtEpochMs && nowMs < endEpochMs,
  };
}

/** All LA-enabled events with a future (or current) display window. */
export function collectLiveActivityWindows(now = new Date()): LiveActivityWindow[] {
  const windows: LiveActivityWindow[] = [];
  for (const event of loadEvents()) {
    const w = computeLiveActivityWindow(event, now);
    if (w) windows.push(w);
  }
  windows.sort((a, b) => a.showAtEpochMs - b.showAtEpochMs);
  return windows;
}

/** Clamp a stored lead for UI / remote sync (max 8h). */
export function clampedLead(lead?: LiveActivityLead): LiveActivityLead {
  const mins = effectiveLiveActivityLeadMinutes(lead);
  if (mins >= 480) return "8h";
  return lead ?? "1h";
}

```


========== FILE: src/lib/native-bootstrap.ts ==========

```typescript
import { Capacitor } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";
import { App } from "@capacitor/app";
import { SplashScreen } from "@capacitor/splash-screen";
import { StatusBar, Style } from "@capacitor/status-bar";
import { rescheduleAll } from "./notifications";
import {
  refreshLiveActivities,
  scheduleLiveActivityBoundaries,
  stopLiveActivityBoundaries,
} from "./live-activity";
import { initLiveActivityRemote, syncLiveActivitySchedulesRemote } from "./la-remote";
import { initFcmRegistration } from "./fcm";
import { initKeyboardAvoidance } from "./keyboard-avoidance";

function syncSchedules() {
  void rescheduleAll();
  void refreshLiveActivities();
  void syncLiveActivitySchedulesRemote();
}

export async function initNative(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;

  // Keyboard listeners live inside initKeyboardAvoidance (resize: none + root shift).
  initKeyboardAvoidance();

  try {
    await StatusBar.setOverlaysWebView({ overlay: true });
    await StatusBar.setStyle({ style: Style.Light });
  } catch { /* not available */ }

  try {
    await SplashScreen.hide();
  } catch { /* not available */ }

  try {
    await LocalNotifications.addListener("localNotificationActionPerformed", () => {
      syncSchedules();
    });
    await LocalNotifications.addListener("localNotificationReceived", () => {
      void refreshLiveActivities();
    });
  } catch { /* notifications plugin not available */ }

  syncSchedules();
  scheduleLiveActivityBoundaries();
  // FCM before remote LA sync so devices/{uid}.fcmToken is more likely present
  // when Cloud Functions evaluate start eligibility.
  await initFcmRegistration();
  await initLiveActivityRemote();

  App.addListener("appStateChange", ({ isActive }) => {
    if (isActive) {
      // Opening the app (or tapping the Live Activity) drops arrived rows.
      syncSchedules();
      scheduleLiveActivityBoundaries();
      void initFcmRegistration();
      void initLiveActivityRemote();
    } else {
      stopLiveActivityBoundaries();
    }
  });
  App.addListener("resume", () => syncSchedules());
  App.addListener("appUrlOpen", () => {
    syncSchedules();
  });
}

```


========== FILE: src/pages/Settings.tsx ==========

```typescript
import { useState, useEffect, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { Globe, ListPlus, Plus, X, Bell, Shield, ChevronRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useI18n, type Locale } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { loadReusable, addReusable, removeReusable, type ReusableTask } from "@/lib/reusable-tasks";
import {
  checkPermission,
  ensurePermission,
  openAppSettings,
  isNative,
  rescheduleAll,
  getNotificationsUserEnabled,
  setNotificationsUserEnabled,
  type NotificationPermissionState,
} from "@/lib/notifications";
import { Switch } from "@/components/ui/switch";
import { hideKeyboard, scrollInputAboveKeyboard } from "@/lib/keyboard-avoidance";
import { App } from "@capacitor/app";
import {
  getLiveActivityRemoteStatus,
  initLiveActivityRemote,
  type LiveActivityRemoteStatus,
} from "@/lib/la-remote";
import {
  getLiveActivityLocalStatus,
  isLiveActivitySupported,
  refreshLiveActivities,
  type LiveActivityLocalStatus,
} from "@/lib/live-activity";
import { initFcmRegistration } from "@/lib/fcm";
import {
  clearLaDebugLog,
  formatLaDebugLogForCopy,
  getLaDebugLog,
  laDebugLog,
  subscribeLaDebugLog,
  type LaDebugEntry,
} from "@/lib/la-debug-log";
import { LiveActivities } from "@/lib/live-activity";

const APP_VERSION = "1.0.0";
const PREVIEW_LIMIT = 4;

interface Props {
  staticPreview?: boolean;
}

export default function Settings({ staticPreview = false }: Props) {
  const navigate = useNavigate();
  const { locale, setLocale, t } = useI18n();
  const [reusable, setReusable] = useState<ReusableTask[]>([]);
  const [newText, setNewText] = useState("");
  const [modalText, setModalText] = useState("");
  const [perm, setPerm] = useState<NotificationPermissionState>("prompt");
  const [userEnabled, setUserEnabled] = useState(getNotificationsUserEnabled());
  const [listOpen, setListOpen] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const showLaStatus = isLiveActivitySupported();
  const [remoteStatus, setRemoteStatus] = useState<LiveActivityRemoteStatus | null>(() =>
    isLiveActivitySupported() ? getLiveActivityRemoteStatus() : null,
  );
  const [localStatus, setLocalStatus] = useState<LiveActivityLocalStatus | null>(() =>
    isLiveActivitySupported() ? getLiveActivityLocalStatus() : null,
  );
  const [debugLog, setDebugLog] = useState<readonly LaDebugEntry[]>(() => getLaDebugLog());
  const [nativeDebugJson, setNativeDebugJson] = useState<string>("");
  const [copyHint, setCopyHint] = useState<string | null>(null);

  useEffect(() => subscribeLaDebugLog(() => setDebugLog([...getLaDebugLog()])), []);

  const refreshPermission = async () => {
    if (!isNative()) return;
    const s = await checkPermission();
    setPerm(s);
  };

  const refreshLaStatus = async () => {
    if (!showLaStatus) {
      setRemoteStatus(null);
      setLocalStatus(null);
      return;
    }
    clearLaDebugLog();
    laDebugLog("ui", "Recheck tapped");
    // Paint status immediately — never hide the card while Auth/Firestore hangs.
    setRemoteStatus(getLiveActivityRemoteStatus());
    setLocalStatus(getLiveActivityLocalStatus());
    try {
      const info = await LiveActivities.getTokenDebugInfo();
      setNativeDebugJson(JSON.stringify(info, null, 2));
      laDebugLog("ui", `native snapshot: ${JSON.stringify(info)}`);
    } catch (err) {
      setNativeDebugJson(`getTokenDebugInfo failed: ${err instanceof Error ? err.message : String(err)}`);
      laDebugLog("ui", `native snapshot failed: ${err instanceof Error ? err.message : String(err)}`, "error");
    }
    try {
      await refreshLiveActivities();
      setLocalStatus(getLiveActivityLocalStatus());
    } catch {
      /* ignore */
    }
    try {
      await initFcmRegistration();
    } catch {
      /* ignore */
    }
    try {
      await initLiveActivityRemote();
    } catch {
      /* ignore */
    }
    setLocalStatus(getLiveActivityLocalStatus());
    setRemoteStatus(getLiveActivityRemoteStatus());
    laDebugLog("ui", "Recheck finished");
  };

  const copyDebugLog = async () => {
    const text = [
      "=== Essences LA / FCM debug ===",
      `at: ${new Date().toISOString()}`,
      `remote: ${JSON.stringify(getLiveActivityRemoteStatus(), null, 2)}`,
      `local: ${JSON.stringify(getLiveActivityLocalStatus(), null, 2)}`,
      `native: ${nativeDebugJson || "(none)"}`,
      "--- log ---",
      formatLaDebugLogForCopy(),
    ].join("\n");
    try {
      await navigator.clipboard.writeText(text);
      setCopyHint(locale === "ja" ? "ログをコピーしました" : "Copied");
    } catch {
      setCopyHint(locale === "ja" ? "コピーに失敗しました" : "Copy failed");
    }
    setTimeout(() => setCopyHint(null), 2000);
  };

  useEffect(() => setReusable(loadReusable()), []);
  useEffect(() => {
    void refreshPermission();
    if (showLaStatus) {
      setRemoteStatus(getLiveActivityRemoteStatus());
      setLocalStatus(getLiveActivityLocalStatus());
      void refreshLaStatus();
    }
  }, []);

  useEffect(() => {
    if (!isNative()) return;
    let handle: { remove: () => Promise<void> } | undefined;
    void App.addListener("appStateChange", ({ isActive }) => {
      if (isActive) void refreshPermission();
    }).then((h) => {
      handle = h;
    });
    return () => {
      void handle?.remove();
    };
  }, []);

  const handleEnableNotifications = async () => {
    if (requesting) return;
    setRequesting(true);
    try {
      const current = await checkPermission();
      if (current === "denied") {
        // iOS won't show the dialog again — open system Settings instead.
        await openAppSettings();
        await refreshPermission();
        return;
      }
      const granted = await ensurePermission();
      await refreshPermission();
      if (granted) {
        setNotificationsUserEnabled(true);
        setUserEnabled(true);
        void rescheduleAll();
      }
    } finally {
      setRequesting(false);
    }
  };

  const handleToggleUserEnabled = async (on: boolean) => {
    setNotificationsUserEnabled(on);
    setUserEnabled(on);
    void rescheduleAll();
  };

  const languages: { key: Locale; label: string; flag: string }[] = [
    { key: "en", label: t("english"), flag: "🇺🇸" },
    { key: "ja", label: t("japanese"), flag: "🇯🇵" },
  ];

  const handleAdd = () => {
    if (!newText.trim()) return;
    setReusable(addReusable(newText));
    setNewText("");
    void hideKeyboard();
  };

  const handleModalAdd = () => {
    if (!modalText.trim()) return;
    setReusable(addReusable(modalText));
    setModalText("");
    void hideKeyboard();
  };

  const onReusableEnter = (
    e: KeyboardEvent<HTMLInputElement>,
    which: "page" | "modal"
  ) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    e.stopPropagation();
    if (which === "page") handleAdd();
    else handleModalAdd();
  };

  const handleRemove = (id: string) => setReusable(removeReusable(id));

  const preview = reusable.slice(0, PREVIEW_LIMIT);
  const overflow = Math.max(0, reusable.length - PREVIEW_LIMIT);

  return (
    <div
      className={cn("page-scroll px-5", staticPreview && "pointer-events-none select-none")}
      aria-hidden={staticPreview || undefined}
    >
      <div className="space-y-6 animate-fade-in-up pb-4">
        <h1 className="text-2xl font-bold tracking-tight">{t("appSettings")}</h1>

        <div className="bg-card rounded-2xl p-5 shadow-soft">
          <div className="flex items-center gap-2 mb-1">
            <Globe className="w-4 h-4 text-accent" />
            <p className="text-sm font-semibold">{t("language")}</p>
          </div>
          <p className="text-xs text-muted-foreground mb-4">{t("selectLanguage")}</p>
          <div className="space-y-2">
            {languages.map((lang) => (
              <button
                key={lang.key}
                onClick={() => setLocale(lang.key)}
                className={cn(
                  "w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors",
                  locale === lang.key
                    ? "bg-accent/10 text-accent ring-1 ring-accent/30"
                    : "bg-secondary/60 text-foreground hover:bg-secondary"
                )}
              >
                <span className="text-lg">{lang.flag}</span>
                <span>{lang.label}</span>
              </button>
            ))}
          </div>
        </div>

        {isNative() && (
          <div className="bg-card rounded-2xl p-5 shadow-soft">
            <div className="flex items-center gap-2 mb-1">
              <Bell className="w-4 h-4 text-accent" />
              <p className="text-sm font-semibold">{t("notifications")}</p>
            </div>

            {perm === "granted" ? (
              <div className="flex items-center justify-between pt-1">
                <p className="text-xs text-muted-foreground flex-1 pr-3">
                  {userEnabled ? t("notificationsEnabled") : t("notificationsOffWarning")}
                </p>
                <Switch checked={userEnabled} onCheckedChange={handleToggleUserEnabled} />
              </div>
            ) : (
              <>
                <p className="text-xs text-muted-foreground mb-4">
                  {perm === "denied"
                    ? t("notificationsDeniedHint")
                    : t("notificationsPermissionNeeded")}
                </p>
                <button
                  type="button"
                  onClick={handleEnableNotifications}
                  disabled={requesting}
                  className="w-full bg-accent text-accent-foreground rounded-xl px-4 py-3 text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-60"
                >
                  {perm === "denied" ? t("openSettings") : t("enableNotifications")}
                </button>
              </>
            )}
          </div>
        )}

        <div className="bg-card rounded-2xl p-5 shadow-soft">
          <div className="flex items-center gap-2 mb-1">
            <ListPlus className="w-4 h-4 text-accent" />
            <p className="text-sm font-semibold">{t("reusableTasks")}</p>
          </div>
          <p className="text-xs text-muted-foreground mb-4">{t("reusableTasksDesc")}</p>

          <div className="space-y-2 mb-3">
            {preview.map((r) => (
              <div
                key={r.id}
                className="flex items-center justify-between gap-2 bg-secondary/50 rounded-xl px-4 py-2.5"
              >
                <span className="text-sm">{r.text}</span>
                <button
                  onClick={() => handleRemove(r.id)}
                  className="text-muted-foreground hover:text-destructive p-1"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>

          {overflow > 0 && (
            <button
              type="button"
              onClick={() => setListOpen(true)}
              className="w-full mb-3 flex items-center justify-center gap-2 rounded-xl bg-secondary/60 hover:bg-secondary px-4 py-2.5 text-sm font-medium transition-colors"
            >
              <span className="text-accent font-semibold">+{overflow}</span>
              <span>{t("showMore")}</span>
            </button>
          )}

          <div className="flex items-center gap-2">
            <input
              value={newText}
              onChange={(e) => setNewText(e.target.value)}
              onFocus={(e) => scrollInputAboveKeyboard(e.currentTarget)}
              enterKeyHint="done"
              onKeyDown={(e) => onReusableEnter(e, "page")}
              placeholder={t("addReusable")}
              className="flex-1 bg-secondary/60 rounded-xl px-4 py-2.5 text-base outline-none placeholder:text-muted-foreground/50"
            />
            <button
              type="button"
              onClick={handleAdd}
              className="bg-accent text-accent-foreground rounded-xl px-4 py-2.5 text-sm font-medium flex items-center gap-1 hover:opacity-90 transition-opacity"
            >
              <Plus className="w-4 h-4" strokeWidth={2.5} />
              {t("add")}
            </button>
          </div>
        </div>

        {showLaStatus && (
          <div className="bg-card rounded-2xl p-5 shadow-soft">
            <p className="text-sm font-semibold mb-2">{t("remoteLaStatus")}</p>
            <p className="text-xs text-muted-foreground leading-relaxed mb-2">
              {localStatus?.systemEnabled === false
                ? t("localLaOff")
                : localStatus?.lastError
                  ? `${t("remoteLaError")}: ${localStatus.lastError}`
                  : (localStatus?.activeCount ?? 0) > 0
                    ? t("localLaActive")
                    : t("localLaNone")}
            </p>
            <p className="text-xs text-muted-foreground leading-relaxed">
              {!remoteStatus?.configPresent
                ? t("remoteLaNoConfig")
                : remoteStatus.authenticated
                  ? t("remoteLaOk")
                  : remoteStatus.lastError
                    ? `${t("remoteLaError")}: ${remoteStatus.lastError}`
                    : t("remoteLaWaiting")}
            </p>
            {remoteStatus?.projectId && (
              <div className="mt-2 space-y-1 text-[11px] text-muted-foreground/90 font-mono break-all">
                <p>
                  {remoteStatus.projectId}
                  {remoteStatus.deviceUid ? ` · uid ${remoteStatus.deviceUid.slice(0, 8)}…` : ""}
                </p>
                <p>
                  FCM {remoteStatus.hasFcmToken ? "✓" : "✗"}
                  {" · "}
                  pushToStart {remoteStatus.hasPushToStartToken ? "✓" : "✗"}
                  {" · "}
                  updateToken {remoteStatus.hasUpdateToken ? "✓" : "✗"}
                </p>
                {remoteStatus.lastSyncAt ? (
                  <p>lastSync {new Date(remoteStatus.lastSyncAt).toLocaleString()}</p>
                ) : null}
                {(remoteStatus.diagnosticHint || remoteStatus.lastError) && (
                  <p className="text-destructive/90 whitespace-pre-wrap">
                    {remoteStatus.diagnosticHint || remoteStatus.lastError}
                  </p>
                )}
                {!remoteStatus.hasFcmToken && (
                  <p className="text-muted-foreground whitespace-pre-wrap">
                    {locale === "ja"
                      ? "FCM✗: 通知許可後に APNs→FCM トークンが必要です。「再チェック」を押すか、通知を一度オフ→オンにしてください。"
                      : "FCM✗: Needs APNs→FCM token after notification permission. Tap Recheck or toggle notifications."}
                  </p>
                )}
                {!remoteStatus.hasPushToStartToken && (
                  <p className="text-muted-foreground whitespace-pre-wrap">
                    {locale === "ja"
                      ? "LA✗: ActivityKit の push-to-start トークン未取得（iOS 17.2+ / Live Activities オンが必要）。"
                      : "LA✗: No ActivityKit push-to-start token yet (needs iOS 17.2+ and Live Activities On)."}
                  </p>
                )}
              </div>
            )}
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => void refreshLaStatus()}
                className="text-xs text-accent font-medium"
              >
                {locale === "ja" ? "再チェック" : "Recheck"}
              </button>
              <button
                type="button"
                onClick={() => void copyDebugLog()}
                className="text-xs text-muted-foreground font-medium underline-offset-2 hover:underline"
              >
                {locale === "ja" ? "ログをコピー" : "Copy log"}
              </button>
              {copyHint && (
                <span className="text-[11px] text-muted-foreground">{copyHint}</span>
              )}
            </div>
            {(nativeDebugJson || debugLog.length > 0) && (
              <div className="mt-3 rounded-xl bg-secondary/40 p-3 max-h-64 overflow-y-auto">
                <p className="text-[10px] font-semibold text-muted-foreground mb-1.5">
                  {locale === "ja" ? "診断ログ（詳細）" : "Diagnostic log"}
                </p>
                {nativeDebugJson ? (
                  <pre className="text-[10px] font-mono text-muted-foreground/90 whitespace-pre-wrap break-all mb-2">
                    {nativeDebugJson}
                  </pre>
                ) : null}
                <div className="space-y-1">
                  {debugLog.map((e) => (
                    <p
                      key={e.id}
                      className={cn(
                        "text-[10px] font-mono leading-snug break-all",
                        e.level === "error" && "text-destructive",
                        e.level === "warn" && "text-amber-700 dark:text-amber-400",
                        e.level === "ok" && "text-emerald-700 dark:text-emerald-400",
                        e.level === "info" && "text-muted-foreground",
                      )}
                    >
                      {new Date(e.at).toLocaleTimeString()} [{e.source}] {e.message}
                    </p>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        <div className="bg-card rounded-2xl p-5 shadow-soft mb-6">
          <div className="flex items-center gap-2 mb-4">
            <Shield className="w-4 h-4 text-accent" />
            <p className="text-sm font-semibold">{t("about")}</p>
          </div>
          <button
            onClick={() => navigate("/privacy")}
            className="w-full flex items-center justify-between gap-2 bg-secondary/50 rounded-xl px-4 py-3 text-sm hover:bg-secondary transition-colors"
          >
            <span>{t("privacyPolicy")}</span>
            <ChevronRight className="w-4 h-4 text-muted-foreground" />
          </button>
          <p className="text-xs text-muted-foreground mt-3 text-center">
            {t("version")} {APP_VERSION}
          </p>
        </div>
      </div>

      {!staticPreview &&
        listOpen &&
        createPortal(
          <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center p-4">
            <div
              className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
              onClick={() => setListOpen(false)}
            />
            <div
              data-kb-shell="translate"
              className="relative z-10 w-full max-w-md max-h-[80dvh] bg-background rounded-3xl shadow-float flex flex-col overflow-hidden"
            >
              <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-border/50 shrink-0">
                <h2 className="text-base font-semibold">{t("reusableTasks")}</h2>
                <button
                  type="button"
                  onClick={() => setListOpen(false)}
                  className="p-2 text-muted-foreground hover:text-foreground"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="settings-modal-scroll min-h-0 flex-1 px-4 py-3 space-y-2">
                {reusable.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">
                    {t("addReusable")}
                  </p>
                ) : (
                  reusable.map((r) => (
                    <div
                      key={r.id}
                      className="flex items-center justify-between gap-2 bg-secondary/50 rounded-xl px-4 py-2.5"
                    >
                      <span className="text-sm">{r.text}</span>
                      <button
                        type="button"
                        onClick={() => handleRemove(r.id)}
                        className="text-muted-foreground hover:text-destructive p-1"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ))
                )}
              </div>

              <div className="shrink-0 border-t border-border/50 px-4 py-3 flex items-center gap-2">
                <input
                  value={modalText}
                  onChange={(e) => setModalText(e.target.value)}
                  onFocus={(e) => scrollInputAboveKeyboard(e.currentTarget)}
                  enterKeyHint="done"
                  onKeyDown={(e) => onReusableEnter(e, "modal")}
                  placeholder={t("addReusable")}
                  className="flex-1 bg-secondary/60 rounded-xl px-4 py-2.5 text-base outline-none placeholder:text-muted-foreground/50"
                />
                <button
                  type="button"
                  onClick={handleModalAdd}
                  className="bg-accent text-accent-foreground rounded-xl px-4 py-2.5 text-sm font-medium flex items-center gap-1 hover:opacity-90 transition-opacity"
                >
                  <Plus className="w-4 h-4" strokeWidth={2.5} />
                  {t("add")}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}

```


========== FILE: ios/App/App/AppDelegate.swift ==========

```swift
import UIKit
import UserNotifications
import Capacitor

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        // Start ActivityKit push-to-start token observation early and keep the
        // Task alive for the process lifetime (see LiveActivityPushTokenCenter).
        LiveActivityPushTokenCenter.start()
        if #available(iOS 16.2, *) {
            LiveActivityRefreshCenter.start()
        }
        // Always request the APNs device token. FCM getToken() needs it; waiting
        // only for "authorized" delayed registration and left Settings at FCM✗.
        application.registerForRemoteNotifications()
        return true
    }

    func applicationWillResignActive(_ application: UIApplication) {
    }

    func applicationDidEnterBackground(_ application: UIApplication) {
    }

    func applicationWillEnterForeground(_ application: UIApplication) {
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
        application.registerForRemoteNotifications()
        if #available(iOS 16.2, *) {
            LiveActivityRefreshCenter.start()
            LiveActivityRefreshCenter.noteActivitiesChanged()
        }
        // Re-broadcast cached push-to-start so JS listeners attached after the
        // first ActivityKit emission still receive a token.
        LiveActivityPushTokenCenter.start()
    }

    func applicationWillTerminate(_ application: UIApplication) {
    }

    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        return ApplicationDelegateProxy.shared.application(app, open: url, options: options)
    }

    func application(_ application: UIApplication, continue userActivity: NSUserActivity, restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        return ApplicationDelegateProxy.shared.application(application, continue: userActivity, restorationHandler: restorationHandler)
    }

    // MARK: - Remote notifications (FCM / Live Activity push-to-start)

    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        // Cache first — Capacitor Firebase Messaging may not be listening yet.
        APNsDeviceTokenCache.store(deviceToken)
        NotificationCenter.default.post(name: .capacitorDidRegisterForRemoteNotifications, object: deviceToken)
        // Second post after a beat in case the plugin observer registered mid-flight.
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
            NotificationCenter.default.post(
                name: .capacitorDidRegisterForRemoteNotifications,
                object: deviceToken
            )
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 2.0) {
            _ = APNsDeviceTokenCache.rebroadcastToCapacitor()
        }
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        APNsDeviceTokenCache.storeFailure(error)
        NotificationCenter.default.post(name: .capacitorDidFailToRegisterForRemoteNotifications, object: error)
        NSLog("[Essences] APNs registration failed: \(error.localizedDescription)")
    }

    func application(_ application: UIApplication, didReceiveRemoteNotification userInfo: [AnyHashable: Any], fetchCompletionHandler completionHandler: @escaping (UIBackgroundFetchResult) -> Void) {
        NotificationCenter.default.post(
            name: Notification.Name("didReceiveRemoteNotification"),
            object: completionHandler,
            userInfo: userInfo
        )
    }
}

```


========== FILE: ios/App/App/LiveActivities/APNsDeviceTokenCache.swift ==========

```swift
import Foundation
import Capacitor

/// Survives the race where APNs delivers the device token before
/// `FirebaseMessagingPlugin.load()` registers its NotificationCenter observer.
///
/// Without this cache, `Messaging.messaging().apnsToken` stays nil → FCM
/// `getToken()` fails forever and Settings shows FCM✗ even when notifications
/// are allowed and Firestore (JS SDK) works.
enum APNsDeviceTokenCache {
    private static let defaultsKey = "essences.apnsDeviceToken"
    private static let errorKey = "essences.apnsRegisterError"
    private static let okAtKey = "essences.apnsRegisterOkAt"
    private static let failAtKey = "essences.apnsRegisterFailAt"
    private static let lock = NSLock()
    private static var memory: Data?

    static func store(_ deviceToken: Data) {
        lock.lock()
        memory = deviceToken
        lock.unlock()
        UserDefaults.standard.set(deviceToken, forKey: defaultsKey)
        UserDefaults.standard.removeObject(forKey: errorKey)
        UserDefaults.standard.set(Date().timeIntervalSince1970, forKey: okAtKey)
    }

    static func storeFailure(_ error: Error) {
        UserDefaults.standard.set(error.localizedDescription, forKey: errorKey)
        UserDefaults.standard.set(Date().timeIntervalSince1970, forKey: failAtKey)
    }

    static func current() -> Data? {
        lock.lock()
        let mem = memory
        lock.unlock()
        if let mem { return mem }
        return UserDefaults.standard.data(forKey: defaultsKey)
    }

    static func lastError() -> String? {
        UserDefaults.standard.string(forKey: errorKey)
    }

    static func debugDictionary() -> [String: Any] {
        let token = current()
        let hexPrefix: Any
        if let token {
            hexPrefix = token.prefix(6).map { String(format: "%02x", $0) }.joined()
        } else {
            hexPrefix = NSNull()
        }
        return [
            "apnsCacheBytes": token?.count ?? 0,
            "apnsCacheHexPrefix": hexPrefix,
            "apnsRegisterError": lastError() as Any,
            "apnsOkAt": UserDefaults.standard.double(forKey: okAtKey),
            "apnsFailAt": UserDefaults.standard.double(forKey: failAtKey),
            "hasGoogleServiceInfoPlist": Bundle.main.path(forResource: "GoogleService-Info", ofType: "plist") != nil,
        ]
    }

    /// Re-post so FirebaseMessagingPlugin.didRegister can set Messaging.apnsToken.
    static func rebroadcastToCapacitor() -> Bool {
        guard let token = current() else { return false }
        NotificationCenter.default.post(
            name: .capacitorDidRegisterForRemoteNotifications,
            object: token
        )
        return true
    }
}

```


========== FILE: ios/App/App/LiveActivities/LiveActivityPushTokenCenter.swift ==========

```swift
import Foundation
import ActivityKit

extension Notification.Name {
    /// Posted whenever ActivityKit emits a push-to-start token (hex string in userInfo["token"]).
    static let essencesPushToStartToken = Notification.Name("EssencesPushToStartToken")
}

/// Long-lived owner of the ActivityKit `pushToStartTokenUpdates` Task.
///
/// Holding the Task only on a CAPPlugin (or a local function) lets the system
/// cancel it when the bridge/plugin tears down in background — a common cause
/// of missing push-to-start tokens on device. This center is started from
/// AppDelegate and keeps a strong Task for the process lifetime.
enum LiveActivityPushTokenCenter {
    private static var task: Task<Void, Never>?
    private static var lastToken: String?
    private static let lock = NSLock()

    static var currentToken: String? {
        lock.lock()
        defer { lock.unlock() }
        return lastToken
    }

    static func start() {
        if #available(iOS 17.2, *) {
            startObserving()
        }
    }

    /// Re-notify listeners with the cached token (if any) without restarting the stream.
    static func rebroadcastCachedToken() {
        lock.lock()
        let cached = lastToken
        lock.unlock()
        guard let cached else { return }
        NotificationCenter.default.post(
            name: .essencesPushToStartToken,
            object: nil,
            userInfo: ["token": cached]
        )
    }

    @available(iOS 17.2, *)
    private static func startObserving() {
        lock.lock()
        let alreadyRunning = task != nil
        let cached = lastToken
        lock.unlock()

        if alreadyRunning {
            if let cached {
                NotificationCenter.default.post(
                    name: .essencesPushToStartToken,
                    object: nil,
                    userInfo: ["token": cached]
                )
            }
            return
        }

        let newTask = Task.detached(priority: .utility) {
            NSLog("[Essences LA] Watching Activity.pushToStartTokenUpdates…")
            for await tokenData in Activity<EssencesWidgetAttributes>.pushToStartTokenUpdates {
                let token = tokenData.map { String(format: "%02x", $0) }.joined()
                lock.lock()
                lastToken = token
                lock.unlock()
                NSLog("[Essences LA] push-to-start token received (\(token.count / 2) bytes)")
                NotificationCenter.default.post(
                    name: .essencesPushToStartToken,
                    object: nil,
                    userInfo: ["token": token]
                )
            }
            NSLog("[Essences LA] pushToStartTokenUpdates sequence ended")
            lock.lock()
            task = nil
            lock.unlock()
        }

        lock.lock()
        if task == nil {
            task = newTask
        } else {
            newTask.cancel()
        }
        lock.unlock()
    }
}

```


========== FILE: ios/App/App/LiveActivities/LiveActivityRefreshCenter.swift ==========

```swift
import Foundation
import ActivityKit

extension Notification.Name {
    /// Posted when an active Live Activity emits an APNs update push token (hex).
    static let essencesLiveActivityUpdateToken = Notification.Name("EssencesLiveActivityUpdateToken")
}

/// Keeps Lock Screen relative countdown fresh without `Text(timerInterval:)`.
///
/// 1. Heartbeat: every ~60s re-`update`s active activities with an incremented
///    `tick` so SwiftUI rebuilds (works while the app process is alive).
/// 2. Observes per-activity `pushTokenUpdates` so JS can upload the token for
///    remote FCM `event: "update"` refreshes when the app is killed.
@available(iOS 16.2, *)
enum LiveActivityRefreshCenter {
    private static var heartbeat: Task<Void, Never>?
    private static var tokenWatchers: [String: Task<Void, Never>] = [:]
    private static let lock = NSLock()

    static func start() {
        lock.lock()
        let running = heartbeat != nil
        lock.unlock()
        if !running {
            startHeartbeat()
        }
        watchExistingActivities()
    }

    /// Call after request/update so new activities get token watchers.
    static func noteActivitiesChanged() {
        watchExistingActivities()
    }

    private static func startHeartbeat() {
        let task = Task.detached(priority: .utility) {
            // Immediate first refresh so Lock Screen is not stuck on the initial label.
            await bumpTicks()
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: 60_000_000_000)
                await bumpTicks()
            }
        }
        lock.lock()
        heartbeat = task
        lock.unlock()
    }

    private static func watchExistingActivities() {
        for activity in Activity<EssencesWidgetAttributes>.activities {
            watchPushToken(for: activity)
        }
    }

    private static func watchPushToken(for activity: Activity<EssencesWidgetAttributes>) {
        lock.lock()
        let already = tokenWatchers[activity.id] != nil
        lock.unlock()
        if already { return }

        let id = activity.id
        let task = Task.detached(priority: .utility) {
            for await tokenData in activity.pushTokenUpdates {
                let token = tokenData.map { String(format: "%02x", $0) }.joined()
                NotificationCenter.default.post(
                    name: .essencesLiveActivityUpdateToken,
                    object: nil,
                    userInfo: ["token": token, "activityId": id]
                )
            }
            lock.lock()
            tokenWatchers[id] = nil
            lock.unlock()
        }
        lock.lock()
        tokenWatchers[id] = task
        lock.unlock()
    }

    private static func bumpTicks() async {
        for activity in Activity<EssencesWidgetAttributes>.activities {
            let current = activity.content.state
            let next = EssencesWidgetAttributes.ContentState(
                items: current.items,
                overflow: current.overflow,
                locale: current.locale,
                tick: current.tick &+ 1,
                phase: current.phase
            )
            await activity.update(
                ActivityContent(state: next, staleDate: activity.content.staleDate)
            )
        }
    }
}

```


========== FILE: ios/App/App/LiveActivities/LiveActivitiesPlugin.swift ==========

```swift
import Foundation
import Capacitor
import ActivityKit
import UIKit

/// Capacitor bridge for Lock Screen Live Activities.
/// JS name: `LiveActivities` (see src/lib/live-activity.ts).
///
/// - Foreground start/update when already inside the lead window (e.g. lead 4h,
///   event in 3h → start immediately on save).
/// - push-to-start token observation via `LiveActivityPushTokenCenter` (iOS 17.2+).
@objc(LiveActivitiesPlugin)
public class LiveActivitiesPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "LiveActivitiesPlugin"
    public let jsName = "LiveActivities"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "areEnabled", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "startOrUpdate", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "endAll", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "startPushToStartTokenUpdates", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getPushToStartToken", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getTokenDebugInfo", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "rebroadcastApnsToken", returnType: CAPPluginReturnPromise),
    ]

    private var endWorkItem: DispatchWorkItem?
    private var arrivedWorkItem: DispatchWorkItem?
    private var tokenObserver: NSObjectProtocol?
    private var updateTokenObserver: NSObjectProtocol?

    public override func load() {
        super.load()
        tokenObserver = NotificationCenter.default.addObserver(
            forName: .essencesPushToStartToken,
            object: nil,
            queue: .main
        ) { [weak self] note in
            guard let token = note.userInfo?["token"] as? String else { return }
            self?.notifyListeners("pushToStartToken", data: ["token": token])
        }
        updateTokenObserver = NotificationCenter.default.addObserver(
            forName: .essencesLiveActivityUpdateToken,
            object: nil,
            queue: .main
        ) { [weak self] note in
            guard let token = note.userInfo?["token"] as? String else { return }
            self?.notifyListeners("liveActivityUpdateToken", data: ["token": token])
        }
        LiveActivityPushTokenCenter.start()
        if #available(iOS 16.2, *) {
            LiveActivityRefreshCenter.start()
        }
    }

    deinit {
        if let tokenObserver {
            NotificationCenter.default.removeObserver(tokenObserver)
        }
        if let updateTokenObserver {
            NotificationCenter.default.removeObserver(updateTokenObserver)
        }
    }

    @objc func areEnabled(_ call: CAPPluginCall) {
        if #available(iOS 16.1, *) {
            call.resolve(["enabled": ActivityAuthorizationInfo().areActivitiesEnabled])
        } else {
            call.resolve(["enabled": false])
        }
    }

    @objc func startPushToStartTokenUpdates(_ call: CAPPluginCall) {
        guard #available(iOS 17.2, *) else {
            call.resolve()
            return
        }
        LiveActivityPushTokenCenter.start()
        if let token = LiveActivityPushTokenCenter.currentToken {
            notifyListeners("pushToStartToken", data: ["token": token])
        }
        call.resolve()
    }

    @objc func getPushToStartToken(_ call: CAPPluginCall) {
        guard #available(iOS 17.2, *) else {
            call.resolve(["token": NSNull()])
            return
        }
        LiveActivityPushTokenCenter.start()
        if let token = LiveActivityPushTokenCenter.currentToken {
            call.resolve(["token": token])
        } else {
            call.resolve(["token": NSNull()])
        }
    }

    /// Snapshot for Settings / Gemini debugging (APNs cache, LA enablement, etc.).
    @objc func getTokenDebugInfo(_ call: CAPPluginCall) {
        var info = APNsDeviceTokenCache.debugDictionary()
        info["iosVersion"] = UIDevice.current.systemVersion
        if #available(iOS 16.1, *) {
            info["activitiesEnabled"] = ActivityAuthorizationInfo().areActivitiesEnabled
            info["activeActivityCount"] = Activity<EssencesWidgetAttributes>.activities.count
        } else {
            info["activitiesEnabled"] = false
            info["activeActivityCount"] = 0
        }
        if #available(iOS 17.2, *) {
            let pts = LiveActivityPushTokenCenter.currentToken
            info["hasPushToStartToken"] = pts != nil
            info["pushToStartPrefix"] = pts.map { String($0.prefix(12)) } as Any
        } else {
            info["hasPushToStartToken"] = false
            info["pushToStartPrefix"] = NSNull()
            info["pushToStartNote"] = "iOS < 17.2"
        }
        call.resolve(info)
    }

    /// Force Capacitor Firebase Messaging to see the cached APNs device token again.
    @objc func rebroadcastApnsToken(_ call: CAPPluginCall) {
        UIApplication.shared.registerForRemoteNotifications()
        let ok = APNsDeviceTokenCache.rebroadcastToCapacitor()
        call.resolve([
            "rebroadcast": ok,
            "apnsCacheBytes": APNsDeviceTokenCache.current()?.count ?? 0,
            "apnsRegisterError": APNsDeviceTokenCache.lastError() as Any,
        ])
    }

    @objc func startOrUpdate(_ call: CAPPluginCall) {
        guard #available(iOS 16.1, *) else {
            call.resolve(["activityId": NSNull()])
            return
        }

        guard ActivityAuthorizationInfo().areActivitiesEnabled else {
            call.resolve(["activityId": NSNull()])
            return
        }

        let locale = call.getString("locale", "en")
        let overflow = call.getInt("overflow", 0)
        guard let rawItems = call.getArray("items") as? [[String: Any]] else {
            call.reject("Invalid items payload")
            return
        }

        var items: [EssencesWidgetAttributes.Item] = []
        for obj in rawItems {
            let title = obj["title"] as? String ?? ""
            let start: Double
            if let d = obj["startEpochMs"] as? Double {
                start = d
            } else if let n = obj["startEpochMs"] as? NSNumber {
                start = n.doubleValue
            } else {
                start = 0
            }
            let color = obj["color"] as? String ?? "blue"
            items.append(.init(title: title, startEpochMs: start, color: color))
        }

        guard !items.isEmpty else {
            Task { await self.endAllActivities() }
            call.resolve(["activityId": NSNull()])
            return
        }

        let state = EssencesWidgetAttributes.ContentState(
            items: items,
            overflow: overflow,
            locale: locale,
            tick: 0,
            phase: call.getString("phase", "countdown")
        )

        let earliestStart: Date? = {
            guard let earliest = items.map(\.startEpochMs).min(), earliest > 0 else {
                return nil
            }
            return Date(timeIntervalSince1970: earliest / 1000.0)
        }()

        // Linger past event start so Lock Screen can show "It's time" without
        // the system stale spinner (staleDate must be after the start instant).
        let endDate: Date = {
            if let endMs = call.getDouble("endEpochMs"), endMs > 0 {
                return Date(timeIntervalSince1970: endMs / 1000.0)
            }
            if let start = earliestStart {
                return start.addingTimeInterval(30 * 60)
            }
            return Date().addingTimeInterval(60)
        }()

        let staleDate = endDate
        let relevance: Double = {
            guard let start = earliestStart else { return 0 }
            let hours = max(0, start.timeIntervalSinceNow / 3600.0)
            return max(0, 100.0 - hours)
        }()

        Task {
            do {
                let activityId = try await self.apply(
                    state: state,
                    staleDate: staleDate,
                    relevanceScore: relevance
                )
                if #available(iOS 16.2, *) {
                    LiveActivityRefreshCenter.start()
                    LiveActivityRefreshCenter.noteActivitiesChanged()
                }
                if let start = earliestStart {
                    self.scheduleArrived(at: start, locale: locale)
                }
                self.scheduleEnd(at: endDate)
                call.resolve(["activityId": activityId as Any])
            } catch {
                call.reject("Live Activity error: \(error.localizedDescription)")
            }
        }
    }

    @objc func endAll(_ call: CAPPluginCall) {
        guard #available(iOS 16.1, *) else {
            call.resolve()
            return
        }
        endWorkItem?.cancel()
        endWorkItem = nil
        Task {
            await self.endAllActivities()
            call.resolve()
        }
    }

    @available(iOS 16.1, *)
    private func apply(
        state: EssencesWidgetAttributes.ContentState,
        staleDate: Date?,
        relevanceScore: Double
    ) async throws -> String {
        if let existing = Activity<EssencesWidgetAttributes>.activities.first {
            if #available(iOS 16.2, *) {
                await existing.update(
                    ActivityContent(
                        state: state,
                        staleDate: staleDate,
                        relevanceScore: relevanceScore
                    )
                )
            } else {
                await existing.update(using: state)
            }
            return existing.id
        }

        // Prefer .token for later push updates. If APNs/push entitlement is not
        // ready, Activity.request(..., pushType: .token) can fail entirely and
        // the Lock Screen never appears — fall back to a local-only activity.
        if #available(iOS 16.2, *) {
            let content = ActivityContent(
                state: state,
                staleDate: staleDate,
                relevanceScore: relevanceScore
            )
            let attrs = EssencesWidgetAttributes(name: "Essences")
            do {
                let activity = try Activity.request(
                    attributes: attrs,
                    content: content,
                    pushType: .token
                )
                return activity.id
            } catch {
                NSLog("[Essences LA] Activity.request(pushType:.token) failed: \(error.localizedDescription) — falling back to local-only (no updateToken)")
                let activity = try Activity.request(
                    attributes: attrs,
                    content: content,
                    pushType: nil
                )
                return activity.id
            }
        } else {
            let attrs = EssencesWidgetAttributes(name: "Essences")
            do {
                let activity = try Activity.request(
                    attributes: attrs,
                    contentState: state,
                    pushType: .token
                )
                return activity.id
            } catch {
                let activity = try Activity.request(
                    attributes: attrs,
                    contentState: state,
                    pushType: nil
                )
                return activity.id
            }
        }
    }

    @available(iOS 16.1, *)
    private func endAllActivities() async {
        for activity in Activity<EssencesWidgetAttributes>.activities {
            if #available(iOS 16.2, *) {
                await activity.end(nil, dismissalPolicy: .immediate)
            } else {
                await activity.end(dismissalPolicy: .immediate)
            }
        }
    }

    private func scheduleArrived(at date: Date, locale: String) {
        arrivedWorkItem?.cancel()
        let delay = date.timeIntervalSinceNow
        let work = DispatchWorkItem { [weak self] in
            guard let self else { return }
            if #available(iOS 16.2, *) {
                Task {
                    for activity in Activity<EssencesWidgetAttributes>.activities {
                        let cur = activity.content.state
                        let next = EssencesWidgetAttributes.ContentState(
                            items: cur.items,
                            overflow: cur.overflow,
                            locale: locale.isEmpty ? cur.locale : locale,
                            tick: cur.tick &+ 1,
                            phase: "arrived"
                        )
                        await activity.update(
                            ActivityContent(state: next, staleDate: activity.content.staleDate)
                        )
                    }
                }
            }
        }
        arrivedWorkItem = work
        if delay <= 0 {
            DispatchQueue.main.async(execute: work)
        } else {
            DispatchQueue.main.asyncAfter(deadline: .now() + min(delay, 8 * 60 * 60), execute: work)
        }
    }

    private func scheduleEnd(at date: Date) {
        endWorkItem?.cancel()
        let delay = date.timeIntervalSinceNow
        if delay <= 0 {
            if #available(iOS 16.1, *) {
                Task { await self.endAllActivities() }
            }
            return
        }
        let capped = min(delay, 8 * 60 * 60)
        let work = DispatchWorkItem { [weak self] in
            guard let self else { return }
            if #available(iOS 16.1, *) {
                Task { await self.endAllActivities() }
            }
        }
        endWorkItem = work
        DispatchQueue.main.asyncAfter(deadline: .now() + capped, execute: work)
    }
}

```


========== FILE: ios/App/App/LiveActivities/EssentialsAttributes.swift ==========

```swift
import Foundation
import ActivityKit

/// Shared Live Activity definition. Compiled into BOTH the app target
/// (start/update/end) and the widget extension (Lock Screen presentation).
///
/// System limits (Apple): active ≤ ~8h; Lock Screen may linger ≤ ~12h total.
/// App deployment target is iOS 17.2+ (push-to-start). JS clamps leads to 8h.
@available(iOS 16.1, *)
public struct EssencesWidgetAttributes: ActivityAttributes {
    public struct ContentState: Codable, Hashable {
        /// Up to 3 upcoming events, soonest first.
        public var items: [Item]
        /// Additional events hidden beyond the shown ones.
        public var overflow: Int
        /// UI language, synced with the in-app language setting ("en" | "ja").
        public var locale: String
        /// Bumped by the app (or remote update push) to force Lock Screen redraw.
        public var tick: Int
        /// "countdown" | "arrived" — flipped at event start (local work item or push).
        public var phase: String

        public init(items: [Item], overflow: Int, locale: String, tick: Int = 0, phase: String = "countdown") {
            self.items = items
            self.overflow = overflow
            self.locale = locale
            self.tick = tick
            self.phase = phase
        }

        /// Accept older payloads that omit `tick` / `phase` (FCM / prior builds).
        public init(from decoder: Decoder) throws {
            let c = try decoder.container(keyedBy: CodingKeys.self)
            items = try c.decode([Item].self, forKey: .items)
            overflow = try c.decode(Int.self, forKey: .overflow)
            locale = try c.decode(String.self, forKey: .locale)
            tick = try c.decodeIfPresent(Int.self, forKey: .tick) ?? 0
            phase = try c.decodeIfPresent(String.self, forKey: .phase) ?? "countdown"
        }
    }

    public struct Item: Codable, Hashable {
        public var title: String
        /// Event start time as epoch milliseconds (used for the countdown).
        public var startEpochMs: Double
        /// Color token key (blue/green/orange/pink/purple/red/teal/gray).
        public var color: String

        public init(title: String, startEpochMs: Double, color: String) {
            self.title = title
            self.startEpochMs = startEpochMs
            self.color = color
        }

        public var startDate: Date {
            Date(timeIntervalSince1970: startEpochMs / 1000.0)
        }
    }

    public var name: String

    public init(name: String = "Essences") {
        self.name = name
    }
}

```


========== FILE: ios/App/EssentialsWidget/EssentialsWidgetLiveActivity.swift ==========

```swift
import ActivityKit
import WidgetKit
import SwiftUI

@available(iOS 16.1, *)
private enum EssencesLAStyle {
    static let background = Color(red: 0.980, green: 0.973, blue: 0.961)
    static let title = Color(red: 0.08, green: 0.09, blue: 0.12)
    static let muted = Color(red: 0.42, green: 0.43, blue: 0.46)
    static let accent = Color(red: 0.92, green: 0.48, blue: 0.22)
}

@available(iOS 16.1, *)
private func colorFor(_ key: String) -> Color {
    switch key {
    case "green": return Color(hue: 145 / 360, saturation: 0.55, brightness: 0.55)
    case "orange": return EssencesLAStyle.accent
    case "pink": return Color(hue: 335 / 360, saturation: 0.70, brightness: 0.72)
    case "purple": return Color(hue: 265 / 360, saturation: 0.55, brightness: 0.65)
    case "red": return Color(hue: 0 / 360, saturation: 0.70, brightness: 0.68)
    case "teal": return Color(hue: 180 / 360, saturation: 0.55, brightness: 0.55)
    case "gray": return Color(hue: 220 / 360, saturation: 0.08, brightness: 0.50)
    default: return Color(hue: 212 / 360, saturation: 0.75, brightness: 0.62)
    }
}

@available(iOS 16.1, *)
private func headerText(_ locale: String) -> String {
    locale == "ja" ? "今後の予定" : "Upcoming"
}

@available(iOS 16.1, *)
private func arrivedText(_ locale: String) -> String {
    locale == "ja" ? "予定時間になりました" : "It's time"
}

@available(iOS 16.1, *)
private func overflowText(_ locale: String, _ n: Int) -> String {
    locale == "ja" ? "ほか\(n)件" : "+\(n) more"
}

/// Human relative countdown: "2時間30分後" / "まもなく" / "It's time".
@available(iOS 16.1, *)
private func relativeRemainingText(to target: Date, now: Date, locale: String) -> String {
    let secs = target.timeIntervalSince(now)
    if secs <= 0 {
        return arrivedText(locale)
    }
    if secs < 60 {
        return locale == "ja" ? "まもなく" : "soon"
    }

    let totalMinutes = Int(secs / 60)
    let hours = totalMinutes / 60
    let minutes = totalMinutes % 60

    if locale == "ja" {
        if hours > 0 && minutes > 0 { return "\(hours)時間\(minutes)分後" }
        if hours > 0 { return "\(hours)時間後" }
        return "\(totalMinutes)分後"
    }

    if hours > 0 && minutes > 0 { return "in \(hours)h \(minutes)m" }
    if hours > 0 { return "in \(hours)h" }
    return "in \(totalMinutes)m"
}

@available(iOS 16.1, *)
private struct CountdownOrArrivedLabel: View {
    let target: Date
    let locale: String
    let phase: String

    var body: some View {
        // Periodic redraw so the relative label advances while the system
        // allows Live Activity timeline refreshes (and after push/local update).
        TimelineView(.periodic(from: .now, by: 60)) { context in
            Text(
                phase == "arrived"
                    ? arrivedText(locale)
                    : relativeRemainingText(to: target, now: context.date, locale: locale)
            )
        }
        .font(.caption.weight(.semibold))
        .foregroundStyle(EssencesLAStyle.accent)
        .lineLimit(1)
        .minimumScaleFactor(0.85)
    }
}

@available(iOS 16.1, *)
struct LockScreenView: View {
    let state: EssencesWidgetAttributes.ContentState

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 5) {
                Image(systemName: "calendar")
                    .font(.caption2.weight(.semibold))
                    .foregroundStyle(EssencesLAStyle.accent)
                Text(headerText(state.locale))
                    .font(.caption2.weight(.bold))
                    .foregroundStyle(EssencesLAStyle.muted)
                Spacer(minLength: 0)
            }

            ForEach(Array(state.items.enumerated()), id: \.offset) { _, item in
                HStack(alignment: .center, spacing: 8) {
                    Capsule()
                        .fill(colorFor(item.color))
                        .frame(width: 3, height: 22)

                    Text(item.title)
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(EssencesLAStyle.title)
                        .lineLimit(1)

                    Spacer(minLength: 6)

                    CountdownOrArrivedLabel(
                        target: item.startDate,
                        locale: state.locale,
                        phase: state.phase
                    )
                    .frame(minWidth: 72, alignment: .trailing)
                }
            }

            if state.overflow > 0 {
                Text(overflowText(state.locale, state.overflow))
                    .font(.caption2.weight(.medium))
                    .foregroundStyle(EssencesLAStyle.muted)
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(EssencesLAStyle.background)
    }
}

@available(iOS 16.1, *)
struct EssencesWidgetLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: EssencesWidgetAttributes.self) { context in
            LockScreenView(state: context.state)
                .widgetURL(URL(string: "essences://live-activity"))
                .activityBackgroundTint(EssencesLAStyle.background)
                .activitySystemActionForegroundColor(EssencesLAStyle.title)
        } dynamicIsland: { _ in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    EmptyView()
                }
            } compactLeading: {
                EmptyView()
            } compactTrailing: {
                EmptyView()
            } minimal: {
                EmptyView()
            }
        }
    }
}

```


========== FILE: ios/App/App/App.entitlements ==========

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>aps-environment</key>
	<string>production</string>
</dict>
</plist>

```


========== FILE: ios/App/CapApp-SPM/Package.swift ==========

```swift
// swift-tools-version: 5.9
import PackageDescription

// DO NOT MODIFY THIS FILE - managed by Capacitor CLI commands
let package = Package(
    name: "CapApp-SPM",
    platforms: [.iOS(.v17)],
    products: [
        .library(
            name: "CapApp-SPM",
            targets: ["CapApp-SPM"])
    ],
    dependencies: [
        .package(url: "https://github.com/ionic-team/capacitor-swift-pm.git", exact: "8.4.1"),
        .package(name: "CapacitorFirebaseMessaging", path: "../../../node_modules/@capacitor-firebase/messaging"),
        .package(name: "CapacitorHaptics", path: "../../../node_modules/@capacitor/haptics"),
        .package(name: "CapacitorKeyboard", path: "../../../node_modules/@capacitor/keyboard"),
        .package(name: "CapacitorLocalNotifications", path: "../../../node_modules/@capacitor/local-notifications"),
        .package(name: "CapacitorSplashScreen", path: "../../../node_modules/@capacitor/splash-screen"),
        .package(name: "CapacitorStatusBar", path: "../../../node_modules/@capacitor/status-bar"),
        .package(name: "CapacitorNativeSettings", path: "../../../node_modules/capacitor-native-settings")
    ],
    targets: [
        .target(
            name: "VendoredAppPlugin",
            dependencies: [
                .product(name: "Capacitor", package: "capacitor-swift-pm"),
                .product(name: "Cordova", package: "capacitor-swift-pm")
            ],
            path: "Sources/VendoredAppPlugin"
        ),
        .target(
            name: "CapApp-SPM",
            dependencies: [
                "VendoredAppPlugin",
                .product(name: "Capacitor", package: "capacitor-swift-pm"),
                .product(name: "Cordova", package: "capacitor-swift-pm"),
                .product(name: "CapacitorFirebaseMessaging", package: "CapacitorFirebaseMessaging"),
                .product(name: "CapacitorHaptics", package: "CapacitorHaptics"),
                .product(name: "CapacitorKeyboard", package: "CapacitorKeyboard"),
                .product(name: "CapacitorLocalNotifications", package: "CapacitorLocalNotifications"),
                .product(name: "CapacitorSplashScreen", package: "CapacitorSplashScreen"),
                .product(name: "CapacitorStatusBar", package: "CapacitorStatusBar"),
                .product(name: "CapacitorNativeSettings", package: "CapacitorNativeSettings")
            ]
        )
    ]
)

```


========== FILE: capacitor.config.ts ==========

```typescript
import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.confast.essences",
  appName: "Essences",
  webDir: "dist",
  ios: {
    // Handle safe areas in CSS only — "always" double-counted insets and caused
    // intermittent black bars + oversized bottom gaps on notched iPhones.
    contentInset: "never",
    // Exclude packages whose npm folder basename is "app" — SwiftPM identity
    // collision under ios/App/CapApp-SPM. @capacitor/app is vendored into
    // CapApp-SPM by scripts/ensure-spm-firebase-app-link.mjs instead.
    includePlugins: [
      "@capacitor-firebase/messaging",
      "@capacitor/haptics",
      "@capacitor/keyboard",
      "@capacitor/local-notifications",
      "@capacitor/splash-screen",
      "@capacitor/status-bar",
      "capacitor-native-settings",
    ],
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 600,
      backgroundColor: "#faf8f5",
      showSpinner: false,
    },
    LocalNotifications: {
      smallIcon: "ic_stat_icon",
    },
    Keyboard: {
      // Do not resize the WebView — we lift #root ourselves so the whole UI
      // (including the focused field) moves above the keyboard together.
      resize: "none",
      resizeOnFullScreen: false,
    },
    FirebaseMessaging: {
      // Live Activity pushes are silent to the banner; empty keeps alerts quiet.
      presentationOptions: [],
    },
  },
};

export default config;
```


========== FILE: scripts/ensure-spm-firebase-app-link.mjs ==========

```javascript
/**
 * Avoid SwiftPM identity "app" entirely.
 *
 * CapApp-SPM lives under ios/App/, and any local package path ending in `/app`
 * (node_modules/@capacitor/app or @capacitor-firebase/app) collides as identity
 * "app". Capacitor's symlink workaround is unreliable on CI/Xcode 26.
 *
 * Fix: do NOT add @capacitor/app as a path package. Copy AppPlugin.swift into
 * CapApp-SPM as a local target `VendoredAppPlugin` instead.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const capAppSpm = path.join(root, "ios", "App", "CapApp-SPM");
const packageSwiftPath = path.join(capAppSpm, "Package.swift");
const vendorDir = path.join(capAppSpm, "Sources", "VendoredAppPlugin");
const vendorFile = path.join(vendorDir, "AppPlugin.swift");
const npmAppPlugin = path.join(
  root,
  "node_modules",
  "@capacitor",
  "app",
  "ios",
  "Sources",
  "AppPlugin",
  "AppPlugin.swift",
);

function vendorAppPluginSource() {
  if (!fs.existsSync(npmAppPlugin)) {
    throw new Error(`Missing ${npmAppPlugin}. Run npm ci first.`);
  }
  fs.mkdirSync(vendorDir, { recursive: true });
  fs.copyFileSync(npmAppPlugin, vendorFile);
  console.log("[spm] Vendored AppPlugin.swift → CapApp-SPM/Sources/VendoredAppPlugin/");
}

function rewritePackageSwift() {
  if (!fs.existsSync(packageSwiftPath)) {
    throw new Error(`Missing ${packageSwiftPath}. Run npx cap sync ios first.`);
  }

  let text = fs.readFileSync(packageSwiftPath, "utf8");
  text = text.replace(/\\\\/g, "/").replace(/\\/g, "/");

  // Drop any external CapacitorApp package path (basename "app" → SPM collision).
  text = text.replace(
    /\n\s*\.package\(name:\s*"CapacitorApp",\s*path:\s*"[^"]+"\),?/g,
    "",
  );
  text = text.replace(
    /\n\s*\.product\(name:\s*"CapacitorApp",\s*package:\s*"CapacitorApp"\),?/g,
    "",
  );

  // Ensure VendoredAppPlugin local target exists.
  if (!text.includes('name: "VendoredAppPlugin"')) {
    text = text.replace(
      /targets:\s*\[\s*\n\s*\.target\(\s*\n\s*name:\s*"CapApp-SPM",/,
      `targets: [
        .target(
            name: "VendoredAppPlugin",
            dependencies: [
                .product(name: "Capacitor", package: "capacitor-swift-pm"),
                .product(name: "Cordova", package: "capacitor-swift-pm")
            ],
            path: "Sources/VendoredAppPlugin"
        ),
        .target(
            name: "CapApp-SPM",`,
    );
  }

  // Ensure CapApp-SPM depends on VendoredAppPlugin (not just that the string appears).
  const capAppDependsOnVendor =
    /\.target\(\s*\n\s*name:\s*"CapApp-SPM",\s*\n\s*dependencies:\s*\[[^\]]*"VendoredAppPlugin"/s.test(
      text,
    );
  if (!capAppDependsOnVendor) {
    text = text.replace(
      /(\.target\(\s*\n\s*name:\s*"CapApp-SPM",\s*\n\s*dependencies:\s*\[)/,
      `$1
                "VendoredAppPlugin",`,
    );
  }

  // Clean leftover empty commas / double commas from removals.
  text = text.replace(/,(\s*\n\s*\])/g, "$1");
  text = text.replace(/,(\s*,)/g, ",");

  if (!text.includes("CapacitorFirebaseMessaging")) {
    throw new Error("Package.swift missing CapacitorFirebaseMessaging");
  }
  if (text.includes("node_modules/@capacitor/app") || text.includes("node_modules/@capacitor-firebase/app")) {
    throw new Error("Package.swift still references a package path ending in /app");
  }
  if ([...text.matchAll(/path:\s*"([^"]+\/app)"/g)].length) {
    throw new Error('Package.swift still has path basename "app"');
  }
  if (!text.includes("VendoredAppPlugin")) {
    throw new Error("Package.swift missing VendoredAppPlugin target");
  }
  if (!fs.existsSync(vendorFile)) {
    throw new Error("Vendored AppPlugin.swift missing on disk");
  }

  fs.writeFileSync(packageSwiftPath, text);
  console.log("[spm] Package.swift uses VendoredAppPlugin (no external /app package)");
}

vendorAppPluginSource();
rewritePackageSwift();
console.log("[spm] CapApp-SPM package identities OK.");

```


========== FILE: ios/scripts/setup_widget.rb ==========

```ruby
#!/usr/bin/env ruby
# frozen_string_literal: true

# Idempotently wires the Essentials Live Activity into the Capacitor iOS project:
#   * adds the ActivityKit plugin + shared attributes to the App target
#   * creates the "EssentialsWidget" widget-extension target (iOS 17.2+)
#   * embeds the widget extension into the app
#   * sets CODE_SIGN_ENTITLEMENTS for the main app
#
# Run from the `ios/App` directory:
#   gem install xcodeproj
#   ruby ../scripts/setup_widget.rb
#
# Safe to run repeatedly; existing wiring is detected and skipped.
#
# iOS 17.2+ is required for ActivityKit push-to-start (start Live Activities
# while the app is killed, via APNs / Firebase).

require "xcodeproj"
require "json"

APP_NAME = "App"
WIDGET_NAME = "EssentialsWidget"
APP_BUNDLE_ID = "com.confast.essences"
# Lowercase suffix — Apple Developer Portal rejects some mixed-case IDs.
WIDGET_BUNDLE_ID = "com.confast.essences.widget"
DEPLOYMENT_TARGET = "17.2"
SWIFT_VERSION = "5.0"

project_path = File.expand_path("App.xcodeproj", Dir.pwd)
abort("Cannot find #{project_path}") unless File.exist?(project_path)

project = Xcodeproj::Project.open(project_path)
app_target = project.targets.find { |t| t.name == APP_NAME }
abort("App target not found") unless app_target

# --- Enforce deployment target everywhere -----------------------------------
(project.build_configurations + app_target.build_configurations).each do |cfg|
  cfg.build_settings["IPHONEOS_DEPLOYMENT_TARGET"] = DEPLOYMENT_TARGET
  cfg.build_settings["CODE_SIGN_ENTITLEMENTS"] = "#{APP_NAME}/App.entitlements"
end

# --- Helper: find or create a file reference under a group ------------------
def ref_for(project, group, absolute_path, relative_name)
  existing = project.files.find { |f| f.real_path.to_s == absolute_path.to_s }
  return existing if existing

  group.new_reference(relative_name)
end

app_group = project.main_group[APP_NAME] || project.main_group.new_group(APP_NAME, APP_NAME)

# --- Entitlements file reference (not compiled) -----------------------------
entitlements_path = File.expand_path("App/App.entitlements", Dir.pwd)
unless project.files.any? { |f| f.real_path.to_s == entitlements_path.to_s }
  app_group.new_reference("App.entitlements")
end

# --- 1. Add plugin + shared attributes to the App target --------------------
la_group = app_group["LiveActivities"] || app_group.new_group("LiveActivities", "LiveActivities")

attributes_path = File.expand_path("App/LiveActivities/EssentialsAttributes.swift", Dir.pwd)
plugin_path = File.expand_path("App/LiveActivities/LiveActivitiesPlugin.swift", Dir.pwd)
token_center_path = File.expand_path("App/LiveActivities/LiveActivityPushTokenCenter.swift", Dir.pwd)
refresh_center_path = File.expand_path("App/LiveActivities/LiveActivityRefreshCenter.swift", Dir.pwd)
apns_cache_path = File.expand_path("App/LiveActivities/APNsDeviceTokenCache.swift", Dir.pwd)

attributes_ref = ref_for(project, la_group, attributes_path, "EssentialsAttributes.swift")
plugin_ref = ref_for(project, la_group, plugin_path, "LiveActivitiesPlugin.swift")
token_center_ref = ref_for(project, la_group, token_center_path, "LiveActivityPushTokenCenter.swift")
refresh_center_ref = ref_for(project, la_group, refresh_center_path, "LiveActivityRefreshCenter.swift")
apns_cache_ref = ref_for(project, la_group, apns_cache_path, "APNsDeviceTokenCache.swift")

app_sources = app_target.source_build_phase
[attributes_ref, plugin_ref, token_center_ref, refresh_center_ref, apns_cache_ref].each do |ref|
  next if app_sources.files_references.include?(ref)

  app_sources.add_file_reference(ref)
end

# --- ActivityKit on the main app target -------------------------------------
%w[ActivityKit].each do |fw|
  already = app_target.frameworks_build_phase.files.any? do |bf|
    bf.display_name == "#{fw}.framework"
  end
  app_target.add_system_framework(fw) unless already
end

# --- 2. Create the widget extension target ----------------------------------
widget_target = project.targets.find { |t| t.name == WIDGET_NAME }

unless widget_target
  widget_target = project.new_target(
    :app_extension,
    WIDGET_NAME,
    :ios,
    DEPLOYMENT_TARGET
  )
end

widget_target.build_configurations.each do |cfg|
  bs = cfg.build_settings
  bs["PRODUCT_BUNDLE_IDENTIFIER"] = WIDGET_BUNDLE_ID
  bs["PRODUCT_NAME"] = "$(TARGET_NAME)"
  bs["INFOPLIST_FILE"] = "#{WIDGET_NAME}/Info.plist"
  bs["IPHONEOS_DEPLOYMENT_TARGET"] = DEPLOYMENT_TARGET
  bs["SWIFT_VERSION"] = SWIFT_VERSION
  bs["TARGETED_DEVICE_FAMILY"] = "1,2"
  bs["CODE_SIGN_STYLE"] = "Automatic"
  bs["GENERATE_INFOPLIST_FILE"] = "NO"
  bs["SKIP_INSTALL"] = "YES"
  bs["CURRENT_PROJECT_VERSION"] = "1"
  bs["MARKETING_VERSION"] = "1.0"
  bs["LD_RUNPATH_SEARCH_PATHS"] = [
    "$(inherited)",
    "@executable_path/Frameworks",
    "@executable_path/../../Frameworks",
  ]
end

# --- 3. Widget source files -------------------------------------------------
widget_group = project.main_group[WIDGET_NAME] || project.main_group.new_group(WIDGET_NAME, WIDGET_NAME)

bundle_path = File.expand_path("#{WIDGET_NAME}/EssentialsWidgetBundle.swift", Dir.pwd)
live_path = File.expand_path("#{WIDGET_NAME}/EssentialsWidgetLiveActivity.swift", Dir.pwd)

bundle_ref = ref_for(project, widget_group, bundle_path, "EssentialsWidgetBundle.swift")
live_ref = ref_for(project, widget_group, live_path, "EssentialsWidgetLiveActivity.swift")

widget_sources = widget_target.source_build_phase
# The shared attributes file is compiled into the widget too.
[bundle_ref, live_ref, attributes_ref].each do |ref|
  next if widget_sources.files_references.include?(ref)

  widget_sources.add_file_reference(ref)
end

# Ensure the widget Info.plist reference exists in the group (not compiled).
unless project.files.any? { |f| f.real_path.to_s == File.expand_path("#{WIDGET_NAME}/Info.plist", Dir.pwd).to_s }
  widget_group.new_reference("Info.plist")
end

# --- 4. Frameworks the widget links against ---------------------------------
%w[WidgetKit SwiftUI ActivityKit].each do |fw|
  already = widget_target.frameworks_build_phase.files.any? do |bf|
    bf.display_name == "#{fw}.framework"
  end
  widget_target.add_system_framework(fw) unless already
end

# --- 5. Embed the widget extension into the app -----------------------------
unless app_target.dependencies.any? { |d| d.target == widget_target }
  app_target.add_dependency(widget_target)
end

embed_phase = app_target.copy_files_build_phases.find { |p| p.name == "Embed App Extensions" }
unless embed_phase
  embed_phase = app_target.new_copy_files_build_phase("Embed App Extensions")
  embed_phase.symbol_dst_subfolder_spec = :plug_ins # PlugIns (spec 13)
end

appex_ref = widget_target.product_reference
already_embedded = embed_phase.files_references.include?(appex_ref)
unless already_embedded
  build_file = embed_phase.add_file_reference(appex_ref)
  build_file.settings = { "ATTRIBUTES" => ["RemoveHeadersOnCopy"] }
end

# --- GoogleService-Info.plist (CI secret or local) ---------------------------
# Always wire into Copy Bundle Resources so the IPA includes it when the file
# exists at archive time. Writing the file AFTER this script used to leave it
# off the target → FirebaseMessaging.configure() crashed on every launch.
plist_path = File.expand_path("App/GoogleService-Info.plist", Dir.pwd)
plist_ref = project.files.find { |f| f.path.to_s.end_with?("GoogleService-Info.plist") }
unless plist_ref
  plist_ref = app_group.new_reference("GoogleService-Info.plist")
end
resources = app_target.resources_build_phase
unless resources.files_references.include?(plist_ref)
  resources.add_file_reference(plist_ref)
end
if File.exist?(plist_path)
  puts "Bundled GoogleService-Info.plist into App target."
else
  puts "WARNING: GoogleService-Info.plist not on disk yet — wired in Xcode; write the file before archive."
end

project.save
puts "EssencesWidget wiring complete."

# --- Register in-app Capacitor plugin (not an npm package) -------------------
# Capacitor 8 only loads classes listed in capacitor.config.json packageClassList.
# `cap sync` fills that list from node_modules plugins and never sees App/*.swift,
# so without this step JS gets: "LiveActivities" plugin is not implemented on ios.
cap_json_path = File.expand_path("App/capacitor.config.json", Dir.pwd)
if File.exist?(cap_json_path)
  cap_json = JSON.parse(File.read(cap_json_path))
  class_list = Array(cap_json["packageClassList"])
  # In-app plugin + Firebase plugins required for FCM / remote Live Activity.
  required_plugins = %w[
    LiveActivitiesPlugin
    FirebaseMessagingPlugin
    AppPlugin
  ]
  added = []
  required_plugins.each do |name|
    next if class_list.include?(name)

    class_list << name
    added << name
  end
  if added.any?
    cap_json["packageClassList"] = class_list
    File.write(cap_json_path, JSON.pretty_generate(cap_json) + "\n")
    puts "Registered in packageClassList: #{added.join(', ')}"
  else
    puts "Capacitor packageClassList already has Live Activities + Firebase plugins."
  end
else
  puts "WARNING: #{cap_json_path} missing — run npx cap sync ios first."
end

# Fail loudly if Firebase Messaging never made it into CapApp-SPM (common when
# experimental SPM symlink options fail with EPERM and abort Package.swift write).
# cwd is ios/App (see workflow working-directory), so CapApp-SPM sits next to App/.
package_swift = File.expand_path("CapApp-SPM/Package.swift", Dir.pwd)
unless File.exist?(package_swift)
  abort "ERROR: #{package_swift} missing — run npx cap sync ios first."
end
pkg = File.read(package_swift)
%w[CapacitorFirebaseMessaging].each do |name|
  next if pkg.include?(name)

  abort <<~MSG
    ERROR: #{name} is missing from CapApp-SPM/Package.swift.
    FCM / Live Activity push tokens will stay null on device.
    Run: npx cap sync ios && node scripts/ensure-spm-firebase-app-link.mjs
  MSG
end
unless pkg.include?("VendoredAppPlugin")
  abort "ERROR: CapApp-SPM must vendor AppPlugin as VendoredAppPlugin (no /app package path)."
end
if pkg.match(%r{path:\s*"[^"]*/app"}) || pkg.include?("node_modules/@capacitor/app")
  abort <<~MSG
    ERROR: Package.swift still references a path ending in /app.
    Run: node scripts/ensure-spm-firebase-app-link.mjs
  MSG
end
puts "Verified CapApp-SPM uses VendoredAppPlugin (no SPM identity app)."

```


========== FILE: patches/@capacitor-firebase+messaging+8.3.0.patch ==========

```diff
diff --git a/node_modules/@capacitor-firebase/messaging/ios/Plugin/FirebaseMessaging.swift b/node_modules/@capacitor-firebase/messaging/ios/Plugin/FirebaseMessaging.swift
index 6c8d642..58d01e8 100644
--- a/node_modules/@capacitor-firebase/messaging/ios/Plugin/FirebaseMessaging.swift
+++ b/node_modules/@capacitor-firebase/messaging/ios/Plugin/FirebaseMessaging.swift
@@ -14,11 +14,21 @@ import FirebaseCore
         self.config = config
         super.init()
         if FirebaseApp.app() == nil {
-            FirebaseApp.configure()
+            if Bundle.main.path(forResource: "GoogleService-Info", ofType: "plist") != nil {
+                FirebaseApp.configure()
+            } else {
+                print("[FirebaseMessaging] GoogleService-Info.plist missing from bundle - skipping Firebase Messaging init")
+                return
+            }
         }
         UIApplication.shared.registerForRemoteNotifications()
         Messaging.messaging().delegate = self
         self.plugin.bridge?.notificationRouter.pushNotificationHandler = self
+        // Apply APNs token cached by AppDelegate before this plugin's observer existed.
+        if let cached = UserDefaults.standard.data(forKey: "essences.apnsDeviceToken") {
+            Messaging.messaging().apnsToken = cached
+            print("[FirebaseMessaging] Applied cached APNs device token (\(cached.count) bytes)")
+        }
     }
 
     public func requestPermissions(completion: @escaping (_ granted: Bool, _ error: Error?) -> Void) {

```


========== FILE: functions/index.js ==========

```javascript
/**
 * Essences Live Activity dispatcher (Firebase project: todolist-app-project-4fd37).
 *
 * Schedules use showAtEpochMs = max(start − lead, now).
 * Future windows are enqueued as Cloud Tasks that fire at showAt (exact).
 * Already-due writes push immediately via onLaScheduleWrite.
 *
 * Payload shape:
 *   https://firebase.google.com/docs/cloud-messaging/customize-messages/live-activity
 *
 * Deploy:
 *   cd functions && npm i && firebase deploy --only functions,firestore
 */

import { initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { getMessaging } from "firebase-admin/messaging";
import { getFunctions } from "firebase-admin/functions";
import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { onTaskDispatched } from "firebase-functions/v2/tasks";
import { setGlobalOptions } from "firebase-functions/v2/options";
import { logger } from "firebase-functions";
import { GoogleAuth } from "google-auth-library";

initializeApp();

const REGION = "asia-northeast1";
setGlobalOptions({ region: REGION });

const db = getFirestore();
const messaging = getMessaging();

/** Must match the Swift `ActivityAttributes` type name exactly. */
const ATTRIBUTES_TYPE = "EssencesWidgetAttributes";
const BUNDLE_ID = "com.confast.essences";
/** Exported task-queue function name — must match `taskQueue(...)` below. */
const TASK_FN = "dispatchLiveActivityTask";
const REFRESH_FN = "refreshLiveActivityTask";
/** Remote Lock Screen redraw every minute (custom relative labels need Activity.update). */
const REFRESH_INTERVAL_MS = 60 * 1000;

let googleAuth;

/** Resolve the Cloud Run URI for a 2nd-gen function (needed when enqueuing). */
async function getFunctionUrl(name, location = REGION) {
  if (!googleAuth) {
    googleAuth = new GoogleAuth({
      scopes: "https://www.googleapis.com/auth/cloud-platform",
    });
  }
  const projectId = await googleAuth.getProjectId();
  const url =
    "https://cloudfunctions.googleapis.com/v2beta/" +
    `projects/${projectId}/locations/${location}/functions/${name}`;
  const client = await googleAuth.getClient();
  const res = await client.request({ url });
  const uri = res.data?.serviceConfig?.uri;
  if (!uri) {
    throw new Error(`Unable to retrieve uri for function at ${url}`);
  }
  return uri;
}

function taskQueue() {
  return getFunctions().taskQueue(`locations/${REGION}/functions/${TASK_FN}`);
}

function refreshTaskQueue() {
  return getFunctions().taskQueue(`locations/${REGION}/functions/${REFRESH_FN}`);
}

function buildContentState(data, tick = 0, phase = "countdown") {
  return {
    items: [
      {
        title: String(data.title || ""),
        startEpochMs: Number(data.startEpochMs),
        color: String(data.color || "blue"),
      },
    ],
    overflow: 0,
    locale: String(data.locale || "ja"),
    tick: Number(tick) || 0,
    phase: String(phase || "countdown"),
  };
}

async function enqueueRefresh(scheduleId, atMs) {
  if (atMs <= Date.now()) atMs = Date.now() + 15_000;
  const uri = await getFunctionUrl(REFRESH_FN);
  await refreshTaskQueue().enqueue(
    { scheduleId },
    {
      scheduleTime: new Date(atMs),
      dispatchDeadlineSeconds: 60 * 5,
      uri,
    },
  );
}

/**
 * Cloud Tasks IDs must be [A-Za-z0-9_-]+. Reverse the schedule id so sequential
 * Firestore ids do not hotspot the queue; append showAt for uniqueness when
 * the lead window changes (deleted ids cannot be reused for ~1h).
 */
function makeTaskId(scheduleId, showAtEpochMs) {
  const reversed = String(scheduleId).split("").reverse().join("");
  const safe = reversed.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 400);
  return `${safe}-${Number(showAtEpochMs)}`;
}

async function deleteTaskBestEffort(taskId) {
  if (!taskId) return;
  try {
    await taskQueue().delete(taskId);
  } catch (err) {
    // Already ran / missing — fine.
    logger.info("deleteTask ignored", { taskId, message: String(err?.message || err) });
  }
}

async function enqueueAtShowAt(scheduleId, data) {
  const showAt = Number(data.showAtEpochMs);
  const taskId = makeTaskId(scheduleId, showAt);
  if (data.cloudTaskId && data.cloudTaskId !== taskId) {
    await deleteTaskBestEffort(data.cloudTaskId);
  }

  const uri = await getFunctionUrl(TASK_FN);
  try {
    await taskQueue().enqueue(
      { scheduleId },
      {
        id: taskId,
        scheduleTime: new Date(showAt),
        dispatchDeadlineSeconds: 60 * 5,
        uri,
      },
    );
  } catch (err) {
    // Same id still reserved (~1h after delete/execute) — try without fixed id.
    const code = err?.code || err?.errorInfo?.code;
    if (String(code).includes("already-exists") || /already.exists/i.test(String(err?.message))) {
      logger.warn("task id collision; enqueue without id", { scheduleId, taskId });
      await taskQueue().enqueue(
        { scheduleId },
        {
          scheduleTime: new Date(showAt),
          dispatchDeadlineSeconds: 60 * 5,
          uri,
        },
      );
      await db.collection("laSchedules").doc(scheduleId).update({
        cloudTaskId: FieldValue.delete(),
        taskEnqueuedForShowAt: showAt,
        updatedAt: Date.now(),
      });
      return;
    }
    throw err;
  }

  await db.collection("laSchedules").doc(scheduleId).update({
    cloudTaskId: taskId,
    taskEnqueuedForShowAt: showAt,
    updatedAt: Date.now(),
  });
}

async function sendStartForSchedule(scheduleId, data) {
  const deviceSnap = await db.collection("devices").doc(data.deviceId).get();
  if (!deviceSnap.exists) {
    logger.warn("No device doc", data.deviceId);
    return false;
  }
  const device = deviceSnap.data() || {};
  const fcmToken = device.fcmToken;
  const liveToken = device.pushToStartToken;
  if (!fcmToken || !liveToken) {
    logger.warn("Missing tokens for device", data.deviceId, {
      hasFcm: !!fcmToken,
      hasLive: !!liveToken,
    });
    return false;
  }

  const nowSec = Math.floor(Date.now() / 1000);
  const staleSec = Math.floor(Number(data.endAtEpochMs) / 1000);
  const contentState = buildContentState(data, 0);

  try {
    await messaging.send({
      token: fcmToken,
      apns: {
        liveActivityToken: liveToken,
        headers: {
          "apns-push-type": "liveactivity",
          "apns-topic": `${BUNDLE_ID}.push-type.liveactivity`,
          "apns-priority": "10",
        },
        payload: {
          aps: {
            timestamp: nowSec,
            event: "start",
            "content-state": contentState,
            "attributes-type": ATTRIBUTES_TYPE,
            attributes: { name: "Essences" },
            "stale-date": staleSec,
            alert: {
              title: data.locale === "en" ? "Upcoming" : "今後の予定",
              body: String(data.title || ""),
            },
          },
        },
      },
    });
    await db.collection("laSchedules").doc(scheduleId).update({
      status: "started",
      startedAt: Date.now(),
      lastError: FieldValue.delete(),
      cloudTaskId: FieldValue.delete(),
    });
    const nextRefresh = Date.now() + REFRESH_INTERVAL_MS;
    if (nextRefresh < Number(data.startEpochMs)) {
      try {
        await enqueueRefresh(scheduleId, nextRefresh);
      } catch (err) {
        logger.warn("Failed to enqueue LA refresh", err);
      }
    }
    // Flip Lock Screen to "arrived" at event start even if the app is killed.
    const startAt = Number(data.startEpochMs);
    if (startAt > Date.now()) {
      try {
        await enqueueRefresh(scheduleId, startAt);
      } catch (err) {
        logger.warn("Failed to enqueue LA arrived tick", err);
      }
    }
    return true;
  } catch (err) {
    logger.error("FCM live activity start failed", err);
    await db.collection("laSchedules").doc(scheduleId).update({
      lastError: String(err?.message || err),
      status: "error",
    });
    return false;
  }
}

async function sendUpdateForSchedule(scheduleId, data, phase = "countdown") {
  const deviceSnap = await db.collection("devices").doc(data.deviceId).get();
  if (!deviceSnap.exists) return false;
  const device = deviceSnap.data() || {};
  const fcmToken = device.fcmToken;
  const updateToken = device.liveActivityUpdateToken;
  if (!fcmToken || !updateToken) {
    logger.info("Skip LA refresh — missing update token", scheduleId, {
      hasFcm: !!fcmToken,
      hasUpdate: !!updateToken,
    });
    return false;
  }

  const nowSec = Math.floor(Date.now() / 1000);
  const staleSec = Math.floor(Number(data.endAtEpochMs) / 1000);
  try {
    await messaging.send({
      token: fcmToken,
      apns: {
        liveActivityToken: updateToken,
        headers: {
          "apns-push-type": "liveactivity",
          "apns-topic": `${BUNDLE_ID}.push-type.liveactivity`,
          "apns-priority": "10",
        },
        payload: {
          aps: {
            timestamp: nowSec,
            event: "update",
            "content-state": buildContentState(data, Date.now(), phase),
            "stale-date": staleSec,
          },
        },
      },
    });
    return true;
  } catch (err) {
    logger.warn("FCM live activity update failed", scheduleId, err);
    return false;
  }
}

/**
 * Fires at showAt (enqueued by onLaScheduleWrite).
 * Payload: { scheduleId: string }
 */
export const dispatchLiveActivityTask = onTaskDispatched(
  {
    retryConfig: {
      maxAttempts: 5,
      minBackoffSeconds: 30,
    },
    rateLimits: {
      maxConcurrentDispatches: 10,
    },
  },
  async (req) => {
    const scheduleId = req.data?.scheduleId;
    if (!scheduleId) {
      logger.warn("Task missing scheduleId");
      return;
    }
    const snap = await db.collection("laSchedules").doc(scheduleId).get();
    if (!snap.exists) {
      logger.info("Schedule gone; skip", scheduleId);
      return;
    }
    const data = snap.data();
    if (data.status !== "pending" && data.status !== "due") {
      logger.info("Schedule not pending/due; skip", scheduleId, data.status);
      return;
    }
    const now = Date.now();
    if (Number(data.endAtEpochMs) <= now) {
      await snap.ref.update({ status: "expired", cloudTaskId: FieldValue.delete() });
      return;
    }
    // Early dispatch (clock skew) — still OK if showAt is within a minute; otherwise re-enqueue.
    if (Number(data.showAtEpochMs) > now + 60_000) {
      logger.info("Task early; re-enqueue", scheduleId);
      await enqueueAtShowAt(scheduleId, data);
      return;
    }
    await sendStartForSchedule(scheduleId, data);
  },
);

/**
 * Every ~1 minute while a Live Activity is active: FCM `update` bumps `tick`
 * so Lock Screen relative labels redraw without relying on TimelineView.
 */
export const refreshLiveActivityTask = onTaskDispatched(
  {
    retryConfig: {
      maxAttempts: 3,
      minBackoffSeconds: 60,
    },
    rateLimits: {
      maxConcurrentDispatches: 10,
    },
  },
  async (req) => {
    const scheduleId = req.data?.scheduleId;
    if (!scheduleId) return;
    const snap = await db.collection("laSchedules").doc(scheduleId).get();
    if (!snap.exists) return;
    const data = snap.data();
    if (data.status !== "started") return;
    const now = Date.now();
    if (Number(data.startEpochMs) <= now) {
      // At/after start → mark arrived once, then stop refreshing.
      await sendUpdateForSchedule(scheduleId, data, "arrived");
      return;
    }

    await sendUpdateForSchedule(scheduleId, data, "countdown");

    const next = now + REFRESH_INTERVAL_MS;
    if (next < Number(data.startEpochMs)) {
      try {
        await enqueueRefresh(scheduleId, next);
      } catch (err) {
        logger.warn("Failed to re-enqueue LA refresh", err);
      }
    } else if (Number(data.startEpochMs) > now) {
      try {
        await enqueueRefresh(scheduleId, Number(data.startEpochMs));
      } catch (err) {
        logger.warn("Failed to enqueue LA arrived", err);
      }
    }
  },
);

/**
 * On every laSchedules write:
 *  - due now → push immediately
 *  - future showAt → enqueue Cloud Task at showAt
 *  - delete / non-pending → cancel pending task
 */
export const onLaScheduleWrite = onDocumentWritten(
  "laSchedules/{scheduleId}",
  async (event) => {
    const scheduleId = event.params.scheduleId;
    const before = event.data?.before?.exists ? event.data.before.data() : null;
    const afterSnap = event.data?.after;
    const after = afterSnap?.exists ? afterSnap.data() : null;

    if (!after) {
      await deleteTaskBestEffort(before?.cloudTaskId);
      return;
    }

    // Ignore metadata-only updates and title/color edits (payload is read at fire time).
    if (
      before &&
      before.showAtEpochMs === after.showAtEpochMs &&
      before.status === after.status &&
      before.endAtEpochMs === after.endAtEpochMs &&
      before.deviceId === after.deviceId
    ) {
      return;
    }

    if (after.status !== "pending" && after.status !== "due") {
      await deleteTaskBestEffort(after.cloudTaskId || before?.cloudTaskId);
      return;
    }

    const now = Date.now();
    if (Number(after.endAtEpochMs) <= now) {
      await deleteTaskBestEffort(after.cloudTaskId || before?.cloudTaskId);
      return;
    }

    if (Number(after.showAtEpochMs) <= now) {
      await deleteTaskBestEffort(after.cloudTaskId || before?.cloudTaskId);
      await sendStartForSchedule(scheduleId, after);
      return;
    }

    // Already enqueued for this exact showAt — nothing to do.
    if (
      after.taskEnqueuedForShowAt === after.showAtEpochMs &&
      after.cloudTaskId
    ) {
      return;
    }

    try {
      await enqueueAtShowAt(scheduleId, after);
      logger.info("Enqueued LA task", {
        scheduleId,
        showAtEpochMs: after.showAtEpochMs,
      });
    } catch (err) {
      logger.error("Failed to enqueue LA task", err);
      await afterSnap.ref.update({
        lastError: `enqueue: ${String(err?.message || err)}`,
      });
    }
  },
);

```
