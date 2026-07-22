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

### 11.2 最も疑わしい実装欠陥（ログで確定・2026-07-22）

#### ★ 確定: 署名済み IPA に `aps-environment` が無い

実機ログ:

```text
apnsRegisterError: アプリケーションの有効な“aps-environment”エンタイトルメント文字列が見つかりません
apnsCacheBytes: 0
hasGoogleServiceInfoPlist: true
activitiesEnabled: true
```

意味:

- GoogleService-Info.plist / LA 許可 / 通知許可は OK
- **APNs device token 自体が OS から返らない**（エンタイトルメント欠落）
- そのため FCM / pushToStart / updateToken はすべて ✗（二次症状）

原因: CI が `CODE_SIGNING_ALLOWED=NO` でアーカイブしていた。無署名アーカイブでは `aps-environment` がバイナリに埋め込まれず、export 後の TestFlight でも欠落する既知問題。

**修正:** Release ワークフローで Apple Distribution 署名付きアーカイブに変更 + IPA に `aps-environment` があることを CI で検証。`CODE_SIGN_ENTITLEMENTS = App/App.entitlements` を pbxproj に恒常設定。

**手動確認:** Apple Developer → Identifiers → `com.confast.essences` → **Push Notifications** が有効であること。

#### A〜D（以前の候補・二次）

以前疑っていた APNs→FCM レースや診断クリアは二次。エンタイトルメントが無い限りトークンは永久に取れない。

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
