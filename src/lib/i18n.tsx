import { createContext, useContext, useState, type ReactNode } from "react";

export type Locale = "en" | "ja";

const LANG_KEY = "growth-app-lang";

function detectLocale(): Locale {
  try {
    const saved = localStorage.getItem(LANG_KEY);
    if (saved === "ja" || saved === "en") return saved;
  } catch {}
  const nav = navigator.language || "en";
  return nav.startsWith("ja") ? "ja" : "en";
}

const translations = {
  en: {
    today: "Today",
    calendar: "Calendar",
    memoTab: "Memo",
    settings: "Settings",

    streak: "Streak",
    todayLabel: "Today",
    days: "Days",
    todaysTasks: "Today's Tasks",
    startYourDay: "Start your day",
    tapPlusHint: "Use the field below to add your first task",
    whatNeedsDone: "What's on today's list?",
    allTasksComplete: "All tasks done. Well done.",
    addedToToday: "Added to Today",
    alreadyInToday: "Already in today's tasks",
    quickAdd: "Quick Add",

    // Calendar
    noEvents: "No events",
    newEvent: "New event",
    addEvent: "Add event",
    editEvent: "Edit event",
    deleteEvent: "Delete event",
    confirmDelete: "Delete this event?",
    eventTitle: "Title",
    startDate: "Start date",
    endDate: "End date",
    allDay: "All-day",
    startTime: "Starts",
    endTime: "Ends",
    color: "Color",
    reminder: "Reminder",
    repeat: "Repeat",
    location: "Location",
    notes: "Notes",
    save: "Save",
    cancel: "Cancel",
    back: "Back",
    monthView: "Month",
    monthGoals: "This month's goals",
    monthGoalsThis: "This month's goals",
    monthGoalsNext: "Next month's goals",
    monthGoalsLast: "Last month's goals",
    monthGoalsNamed: "{m} goals",
    monthGoalPlaceholder: "Write a goal for this month",
    setNewGoalPrompt: "Set a new goal?",
    goalsCompletedCount: "{n} goals completed",
    yes: "Yes",
    no: "No",

    noReminders: "No reminders",
    addReminder: "Add reminder",
    reminders: "Reminders",
    reminderAt: "At start time",
    reminder5m: "5 min before",
    reminder10m: "10 min before",
    reminder20m: "20 min before",
    reminder30m: "30 min before",
    reminder1h: "1 hour before",
    reminder2h: "2 hours before",
    reminder3h: "3 hours before",
    reminder4h: "4 hours before",
    reminder6h: "6 hours before",
    reminder8h: "8 hours before",
    reminder12h: "12 hours before",
    reminder24h: "1 day before",

    repeatNone: "Never",
    repeatDaily: "Every day",
    repeatWeekly: "Every week",
    repeatMonthly: "Every month",
    repeatMonthlyDay: "Monthly on this day",
    repeatMonthlyWeekday: "Monthly on this weekday",
    repeatYearly: "Every year",
    repeatInvalidDaily: "Daily repeat cannot be used for events that span multiple days.",
    repeatInvalidWeekly: "Weekly repeat cannot be used for events that span 7 or more days.",
    repeatApplyAll: "Apply this change to all repeating events in the series as well?",
    repeatTurnOffConfirm:
      "Turn off repeat from this day onward? Earlier occurrences will stay.",
    deleteRepeatTitleDaily: "This is a daily repeating event.",
    deleteRepeatTitleWeekly: "This is a weekly repeating event.",
    deleteRepeatTitleMonthly: "This is a monthly repeating event.",
    deleteRepeatTitleYearly: "This is a yearly repeating event.",
    deleteRepeatOnlyThis: "Delete this day only",
    deleteRepeatThisAndFuture: "Delete this and all future repeats",
    deleteRepeatSheetHint: "Earlier occurrences stay unless you choose this and future.",

    // Live Activity
    liveActivity: "Live Activity",
    liveActivityShow: "Show on Lock Screen",
    liveActivityHint:
      "Shows a countdown on the Lock Screen. Example: if you choose “1 hour before” and the event starts at 3:00, the card appears at 2:00. If that time is already past when you save, it appears right away. After the start time, “It’s time” stays up to 1 hour (or until you open the app). Max lead window 8 hours.",
    liveActivityForegroundNote: "Requires iOS 17.2 or later.",
    liveActivityOfflineNote:
      "Some features are limited offline. Keep an online connection while a Live Activity is running.",
    la24h: "1 day before",
    la12h: "12 hours before",
    la8h: "8 hours before (max)",
    la6h: "6 hours before",
    la4h: "4 hours before",
    la3h: "3 hours before",
    la2h: "2 hours before",
    la1h: "1 hour before",
    la30m: "30 minutes before",
    la20m: "20 minutes before",
    la10m: "10 minutes before",
    la5m: "5 minutes before",

    // Settings
    language: "Language",
    english: "English",
    japanese: "日本語",
    appSettings: "Settings",
    selectLanguage: "Select your preferred language",
    themeColor: "Theme color",
    themeColorDesc: "Choose an accent color for buttons and highlights.",
    themeAccentOrange: "Orange",
    themeAccentCoral: "Coral",
    themeAccentAmber: "Amber",
    themeAccentLime: "Lime",
    themeAccentTeal: "Teal",
    themeAccentSky: "Sky",
    themeAccentViolet: "Violet",
    themeAccentRose: "Rose",
    reusableTasks: "Reusable Tasks",
    reusableTasksDesc: "Save tasks you use often for one-tap adding",
    addReusable: "Add a reusable task",
    showMore: "Show more",
    add: "Add",
    notifications: "Notifications",
    notificationsPermissionNeeded: "Allow notifications to receive event reminders.",
    enableNotifications: "Enable notifications",
    notificationsDeniedHint: "Notifications were denied. You can enable them in iOS Settings.",
    notificationsEnabled: "Notifications are on",
    disableNotifications: "Turn off notifications",
    notificationsOffWarning: "Notifications are off. Enable them in Settings to receive reminders.",
    tutorialDurationNote: "The tutorial takes about 3 minutes.",
    tutorialSkip: "Skip tutorial",
    tutorialStart: "Get started",
    tutorialLangJa: "日本語",
    tutorialLangEn: "English",
    taskHistory: "Task history",
    taskHistoryHint: "History is kept for 3 months. Pick a month and week.",
    taskHistoryEmpty: "No past tasks yet.",
    bringToToday: "Add",
    bringDayToToday: "Add all",
    historyScore: "Score",
    memoTitlePlaceholder: "Title",
    memoBodyPlaceholder: "Start writing…",
    memoUntitled: "Untitled",
    memoPages: "Memos",
    memoNew: "New memo",
    memoBold: "Bold",
    memoUnderline: "Underline",
    memoBullets: "Bulleted list",
    memoNumbers: "Numbered list",
    memoScan: "AI: read text from photo",
    memoCalculator: "Calculator",
    memoEdit: "Edit",
    memoView: "View",
    memoListTitle: "Memos",
    memoEditList: "Edit",
    memoSaveList: "Save",
    memoAdd: "Add",
    memoNewCategory: "New category",
    memoCategoryNamePrompt: "Choose a name",
    memoPickCategory: "Choose a category",
    memoNewCategoryOption: "Add to a new category",
    memoUntitledCategory: "Untitled",
    memoSearchPlaceholder: "Search memos",
    memoSearchTitle: "Search",
    memoSearchClear: "Clear search",
    memoSearchEmpty: "No memos found",
    memoBackToList: "Back to list",
    memoShare: "Share",
    memoReorder: "Reorder",
    memoClickToEdit: "Tap here to edit",
    memoEditTitle: "Edit title",
    memoChangeColor: "Change color",
    memoLastEdited: "Last edited",
    memoDeleteCategory: "Delete category",
    memoEmptyCategory: "No memos in this category",
    memoUndo: "Undo",
    memoRedo: "Redo",
    memoAlignLeft: "Align left",
    memoAlignCenter: "Center",
    memoAlignRight: "Align right",
    memoInsertResultOnly: "Paste result only",
    memoInsertExpression: "Paste calculation",
    memoOcrEmpty: "No text found in the photo.",
    memoOcrFailed: "Could not read the photo. Try again online.",
    ocrAddImage: "AI image recognition",
    ocrHelp:
      "AI reads handwriting or printed text. On Today it becomes tasks; on Notes it is inserted as text. Complex formulas can be saved as LaTeX in memos. Choose a photo or take a picture.",
    ocrLatexHint: "You can also use this when you want to keep complex formulas in a memo.",
    ocrPickPhotos: "Choose photo",
    ocrTakePhoto: "Take photo",
    ocrReading: "AI is reading the image",
    ocrQuota:
      "Image recognition is at its current limit. Please try again later.",
    ocrUnreadable:
      "Could not read the image well. Try a clearer photo of the handwriting.",
    ocrEmpty: "No text could be read from the image.",
    ocrLowConfidence:
      "The image may not have been recognized correctly. If the result looks wrong, take or choose the photo again.",
    ocrGeneric: "Something went wrong while reading the image. Please try again.",
    ocrAcknowledge: "Got it",
    ocrConfig:
      "Image recognition is not set up on the server (invalid Gemini API key). The developer must register a Google AI Studio key in Firebase.",
    ocrConfigBadFormat:
      "The Gemini API key format is invalid (expected AIza… or AQ.… from Google AI Studio). Run npm run gemini:secret, then npm run deploy.",
    ocrPermission: "Camera or Photos access is off. Enable it in iPhone Settings → Essences.",
    ocrDebugTitle: "Image recognition log (temporary)",
    ocrDebugHint:
      "If image recognition fails, copy this full log and send it. It includes Firebase auth, Gemini quota, API key probe, and every OCR step (no image data).",
    ocrDebugCopy: "Copy full log",
    ocrDebugCopied: "Log copied",
    ocrDebugCopyFailed: "Could not copy — try again",
    ocrDebugClear: "Clear log",
    ocrDebugCleared: "Log cleared",
    ocrDebugEmpty: "No log yet. Try image recognition once, then copy.",
    ocrDebugWebNote: "Web preview — OCR needs the iOS TestFlight build.",
    openSettings: "Open Settings",
    notifDisabledInApp: "Notifications are currently off. Turn them on in Settings to use reminders.",
    eventsCount: "events",
    noEventsOnDay: "No events on this day",
    tapToAdd: "Tap + to add one",
    calendarWeek: "Week",
    calendarMonth: "Month",
    weekNavSwipeHint: "Swipe sideways to change weeks",
    weekStartSunday: "Sunday start",
    weekStartMonday: "Monday start",
    about: "About",
    version: "Version",
    privacyPolicy: "Privacy Policy",
    remoteLaPermissionHint:
      "If iOS asks “Continue allowing Live Activities?”, tap Always Allow. Apps cannot hide that system prompt.",
    localLaOff:
      "Live Activities are disabled for this app. iPhone Settings → Essences → Live Activities → On",
    localLaActive: "Local Live Activity windows active",
    localLaNone: "No event currently inside its lead window",
    endBeforeStart: "End must be after the start. Please fix the date or time.",
    timeRequired: "Please set both start and end times.",
    liveActivityStartInPast:
      "Start time is in the past. Turn off Live Activity, or set a start time in the future.",
    liveActivitySettingsTitle: "Live Activities",
    liveActivitySettingsOn: "Live Activities are on for Essences (controlled in iPhone Settings).",
    liveActivitySettingsOffUser:
      "Live Activities are off in the app. Turn on to show countdowns on the Lock Screen.",
    liveActivitySettingsOffSystem:
      "Live Activities are off in iPhone Settings. Open Settings and turn on Live Activities for Essences.",
    liveActivityEnable: "Enable Live Activities",
    liveActivityOpenSettings: "Open iPhone Settings",
    liveActivityOpenLaSettings: "Open Essences Live Activities settings",
    liveActivityDisabledInApp:
      "Live Activities are off, so Lock Screen countdowns will not appear for this event.",
    liveActivityDisabledSystem:
      "Live Activities are off in iPhone Settings, so Lock Screen countdowns will not appear for this event.",
    liveActivityAllowPrompt:
      "Live Activities are not fully enabled yet. Open Essences Settings to finish the Lock Screen demo, then turn Live Activity on for this event?",
    liveActivityAllowPromptSystem:
      "Live Activities are off in iPhone Settings. Open Essences Settings for the guided enable steps?",
    liveActivityAllowYes: "Open Essences Settings",
    liveActivityAllowNo: "Save without Live Activity",
    liveActivityOnboardingTitle: "Lock Screen countdown",
    liveActivityOnboardingBody:
      "Essences can show a countdown on the Lock Screen before an event. Try a short demo now — this also prepares remote start after you force-quit the app. If iOS asks to continue allowing Live Activities, choose Always Allow.",
    liveActivityTryDemo: "Try a short demo",
    liveActivityOnboardingLater: "Not now",
    tutorialWelcomeTitle: "Welcome to Essences",
    tutorialWelcomeBody:
      "Essences helps you plan your day, keep a calendar, and capture notes — all in one calm place.",
    tutorialWelcomeIntro:
      "In a short tour you will try Today’s tasks, the calendar, reusable shortcuts in Settings, and an optional Lock Screen countdown demo. You can skip anytime.",
    tutorialQuickAdd:
      "Add today’s first task here. Type something and tap Add (or Done on the keyboard).",
    tutorialTaskSelect: "Nice! Tap the task you just added in the list.",
    tutorialTaskControls:
      "The circle checks it off. The × deletes it when the row is selected. Tap to continue.",
    tutorialTaskCheck: "Try the checkbox now — mark the task complete.",
    tutorialStats:
      "Streak = consecutive active days. Today = completion %. Days = total days with tasks. Tap to continue.",
    tutorialNavCalendar: "Open Calendar from the tab bar.",
    tutorialMonthGoals:
      "Month goals sit on top of the calendar. You can expand or collapse them anytime. Tap to continue.",
    tutorialMonthGoalsClose:
      "Collapse the month goals now — tap the chevron (or the minimized bar’s opposite control) to fold it away.",
    tutorialCalendarSwipe:
      "Swipe the calendar up or down to change months. Day taps are paused for this step — swipe once to continue.",
    tutorialCalendarToday: "Tap Today to jump back to the current month.",
    tutorialCalendarFab:
      "The + button creates a new calendar event. (No need to tap it now.) Tap elsewhere to continue.",
    tutorialNavSettings: "Open Settings from the tab bar.",
    tutorialReusableTasks:
      "At the top of Settings, reusable tasks are shortcuts you can add to Today in one tap. Tap to continue.",
    tutorialLaDemoBody:
      "Finally, you can try a short Live Activity demo on the Lock Screen.",
    tutorialLaDemoOfferTitle: "Lock Screen Live Activity demo",
    tutorialLaDemoOfferBody:
      "Would you like to show a short countdown demo on the Lock Screen now? You can also do this later in Settings.",
    tutorialLaDemoStart: "Show Live Activity demo on the Lock Screen",
    tutorialLaDemoPreparingTitle: "Preparing Lock Screen demo…",
    tutorialLaDemoPreparingBody:
      "Starting a short countdown on the Lock Screen. This also prepares remote start after you force-quit the app.",
    tutorialLaDemoPreparingHint: "Please wait a moment",
    tutorialLaDemoReadyBody:
      "Check the Lock Screen. You can continue anytime, or show the demo again.",
    tutorialLaDemoAllowedTitle: "Lock Screen countdown",
    tutorialLaDemoAllowedBody:
      "Live Activities are ready. You can continue.",
    tutorialLaDemoDeniedTitle: "Live Activities turned off",
    tutorialLaDemoDeniedBody:
      "If you deny, Live Activities turn off in Settings. Open iPhone Settings to turn them back on, then try again — or continue.",
    tutorialLaDemoDeniedRetryBody:
      "Live Activities were turned off. Open iPhone Settings to turn them back on, then show the demo again — or tap Next to continue.",
    tutorialLaDemoForceEndedTitle: "Demo finished",
    tutorialLaDemoForceEndedBody:
      "Live Activities were denied twice in a row, so the demo is ending. You can show the demo again later from Settings.",
    tutorialLaDemoFailedBody:
      "Could not start the demo. Try again, or continue and enable later in Settings.",
    tutorialLaDemoShowAgain: "Show Live Activity demo again",
    tutorialLaDemoOnLockScreen: "Shown — check the Lock Screen",
    tutorialLaDemoLater: "Later",
    tutorialLaDemoSettingsHint:
      "You can also enable Live Activities later in Settings with the same guided steps.",
    tutorialLaDemoStarted:
      "Demo started. Check the Lock Screen, then tap Next.",
    tutorialLaDemoNext: "Next",
    tutorialLaDemoRetry: "Try demo again",
    liveActivitySettingsDemoTitle: "Enable Lock Screen countdown",
    liveActivitySettingsDemoBody:
      "Finish these steps to enable Lock Screen countdowns. Each step unlocks the next.",
    liveActivitySettingsDemoSteps:
      "1) On in iPhone Settings  2) Run demo  3) Confirm on Lock Screen  4) Done",
    liveActivityStepSystem: "Turn on Live Activities in iPhone Settings",
    liveActivityStepDemo: "Show the Lock Screen demo",
    liveActivityStepAllow: "Confirm the Live Activity demo on the Lock Screen",
    liveActivityStepDone: "Enabled — ready for calendar events",
    settingsLaReenableIntro:
      "Live Activities were already set up once. Turn them back on in iPhone Settings.",
    settingsLaReenableTitle: "Turn Live Activities back on",
    settingsLaReenableBody:
      "Open Essences in iPhone Settings and turn on Live Activities. You do not need to run the demo again.",
    settingsLaStep1Title: "Step 1 — iPhone Settings",
    settingsLaStep1Body:
      "Open Essences in iPhone Settings and turn on Live Activities. Come back here when it is on.",
    settingsLaStep2Title: "Step 2 — Lock Screen demo",
    settingsLaStep2Body:
      "Show a short demo on the Lock Screen. This prepares Live Activities for when the app is force-quit.",
    settingsLaStep3Title: "Step 3 — Confirm on Lock Screen",
    settingsLaStep3Body:
      "Check the Lock Screen demo. If Live Activities were not turned off, tap Next to finish. You can show the demo again if needed.",
    settingsLaStep4Title: "Ready",
    settingsLaStep4Body: "Live Activities are enabled for calendar events.",
    tutorialDoneTitle: "You’re ready",
    tutorialDoneBody: "That’s the tour. Add events, check tasks, and enjoy Essences. Tap to finish.",
    tutorialTapHint: "Tap anywhere to continue",
    tutorialActionHint: "Follow the highlight to continue",
  },
  ja: {
    today: "今日",
    calendar: "カレンダー",
    memoTab: "メモ",
    settings: "設定",

    streak: "連続",
    todayLabel: "今日",
    days: "日",
    todaysTasks: "今日のタスク",
    startYourDay: "一日を始めよう",
    tapPlusHint: "下の欄から最初のタスクを追加",
    whatNeedsDone: "今日のタスクは？",
    allTasksComplete: "全タスク完了しました。",
    addedToToday: "今日に追加しました",
    alreadyInToday: "すでに今日のタスクに追加済み",
    quickAdd: "クイック追加",

    noEvents: "予定なし",
    newEvent: "新規予定",
    addEvent: "予定を追加",
    editEvent: "予定を編集",
    deleteEvent: "予定を削除",
    confirmDelete: "この予定を削除しますか？",
    eventTitle: "タイトル",
    startDate: "開始日",
    endDate: "終了日",
    allDay: "終日",
    startTime: "開始",
    endTime: "終了",
    color: "カラー",
    reminder: "通知",
    repeat: "繰り返し",
    location: "場所",
    notes: "メモ",
    save: "保存",
    cancel: "キャンセル",
    back: "戻る",
    monthView: "月",
    monthGoals: "今月の目標",
    monthGoalsThis: "今月の目標",
    monthGoalsNext: "来月の目標",
    monthGoalsLast: "先月の目標",
    monthGoalsNamed: "{m}月の目標",
    monthGoalPlaceholder: "今月の目標を書く",
    setNewGoalPrompt: "新たな目標を設定しますか？",
    goalsCompletedCount: "{n}個の目標が達成済み",
    yes: "はい",
    no: "いいえ",

    noReminders: "通知なし",
    addReminder: "通知を追加",
    reminders: "通知",
    reminderAt: "開始時刻に通知",
    reminder5m: "5分前",
    reminder10m: "10分前",
    reminder20m: "20分前",
    reminder30m: "30分前",
    reminder1h: "1時間前",
    reminder2h: "2時間前",
    reminder3h: "3時間前",
    reminder4h: "4時間前",
    reminder6h: "6時間前",
    reminder8h: "8時間前",
    reminder12h: "12時間前",
    reminder24h: "1日前",

    repeatNone: "なし",
    repeatDaily: "毎日",
    repeatWeekly: "毎週",
    repeatMonthly: "毎月",
    repeatMonthlyDay: "毎月この日",
    repeatMonthlyWeekday: "毎月この曜日",
    repeatYearly: "毎年",
    repeatInvalidDaily: "複数日にまたがる予定では「毎日」は設定できません。",
    repeatInvalidWeekly: "7日以上にまたがる予定では「毎週」は設定できません。",
    repeatApplyAll: "この変更を繰り返しの予定にも反映しますか？",
    repeatTurnOffConfirm:
      "この日以降の繰り返しをオフにしますか？（この日より前の予定は残ります）",
    deleteRepeatTitleDaily: "日ごとの繰り返しの予定です。",
    deleteRepeatTitleWeekly: "週ごとの繰り返しの予定です。",
    deleteRepeatTitleMonthly: "月ごとの繰り返しの予定です。",
    deleteRepeatTitleYearly: "年ごとの繰り返しの予定です。",
    deleteRepeatOnlyThis: "この日だけ削除",
    deleteRepeatThisAndFuture: "この日以降の繰り返しをすべて削除",
    deleteRepeatSheetHint: "「この日以降」を選ぶと、この日より前の予定は残ります。",

    // Live Activity
    liveActivity: "ライブアクティビティ",
    liveActivityShow: "ロック画面に表示",
    liveActivityHint:
      "ロック画面にカウントダウンを表示します。例:「1時間前」にすると、15:00の予定は14:00に表示が始まります。保存した時点ですでにその時刻を過ぎている場合は、すぐに表示します。開始時刻のあとは「予定時間になりました」を最大1時間残します（アプリを開くと消えます）。リード表示は最大8時間です。",
    liveActivityForegroundNote: "iOS 17.2 以上が必要です。",
    liveActivityOfflineNote:
      "オフラインでは機能が一部制限されます。ライブアクティビティが作動中はオンライン環境を維持してください。",
    la24h: "1日前",
    la12h: "12時間前",
    la8h: "8時間前（上限）",
    la6h: "6時間前",
    la4h: "4時間前",
    la3h: "3時間前",
    la2h: "2時間前",
    la1h: "1時間前",
    la30m: "30分前",
    la20m: "20分前",
    la10m: "10分前",
    la5m: "5分前",

    language: "言語",
    english: "English",
    japanese: "日本語",
    appSettings: "設定",
    selectLanguage: "言語を選択してください",
    themeColor: "テーマ色",
    themeColorDesc: "ボタンやハイライトに使うアクセントカラーを選べます。",
    themeAccentOrange: "オレンジ",
    themeAccentCoral: "コーラル",
    themeAccentAmber: "アンバー",
    themeAccentLime: "ライム",
    themeAccentTeal: "ティール",
    themeAccentSky: "スカイ",
    themeAccentViolet: "バイオレット",
    themeAccentRose: "ローズ",
    reusableTasks: "定型タスク",
    reusableTasksDesc: "よく使うタスクを保存してワンタップで追加",
    showMore: "さらに表示",
    addReusable: "定型タスクを追加",
    add: "追加",
    notifications: "通知",
    notificationsPermissionNeeded: "予定の通知を受け取るには通知を許可してください。",
    enableNotifications: "通知を有効にする",
    notificationsDeniedHint: "通知が拒否されています。iPhoneの設定から許可できます。",
    notificationsEnabled: "通知はオンです",
    disableNotifications: "通知をオフにする",
    notificationsOffWarning: "通知がオフになっています。設定でオンにするとリマインダーを受け取れます。",
    tutorialDurationNote: "チュートリアルは3分程度です。",
    tutorialSkip: "チュートリアルを飛ばす",
    tutorialStart: "始める",
    tutorialLangJa: "日本語",
    tutorialLangEn: "English",
    taskHistory: "タスクの履歴",
    taskHistoryHint: "履歴は最大3ヶ月です。月と週を選んで表示します。",
    taskHistoryEmpty: "過去のタスクはまだありません。",
    bringToToday: "追加",
    bringDayToToday: "すべて追加",
    historyScore: "達成",
    memoTitlePlaceholder: "タイトル",
    memoBodyPlaceholder: "メモを入力…",
    memoUntitled: "無題",
    memoPages: "メモ一覧",
    memoNew: "新しいメモ",
    memoBold: "太字",
    memoUnderline: "下線",
    memoBullets: "箇条書き",
    memoNumbers: "番号リスト",
    memoScan: "AIが写真から文字を読み取る",
    memoCalculator: "電卓",
    memoEdit: "Edit",
    memoView: "View",
    memoListTitle: "メモ一覧",
    memoEditList: "編集",
    memoSaveList: "保存",
    memoAdd: "追加",
    memoNewCategory: "新しいカテゴリー",
    memoCategoryNamePrompt: "名前を決めてください",
    memoPickCategory: "カテゴリーを選択",
    memoNewCategoryOption: "新しいカテゴリーに入れる",
    memoUntitledCategory: "無題",
    memoSearchPlaceholder: "キーワードで検索",
    memoSearchTitle: "検索",
    memoSearchClear: "検索を終了",
    memoSearchEmpty: "該当するメモがありません",
    memoBackToList: "一覧に戻る",
    memoShare: "共有",
    memoReorder: "並び替え",
    memoClickToEdit: "ここをクリックして編集",
    memoEditTitle: "タイトルの編集",
    memoChangeColor: "カラー変更",
    memoLastEdited: "最終編集日",
    memoDeleteCategory: "カテゴリーを削除",
    memoEmptyCategory: "メモがありません",
    memoUndo: "元に戻す",
    memoRedo: "やり直す",
    memoAlignLeft: "左揃え",
    memoAlignCenter: "中央揃え",
    memoAlignRight: "右揃え",
    memoInsertResultOnly: "結果のみメモに貼る",
    memoInsertExpression: "計算式もメモに貼る",
    memoOcrEmpty: "写真から文字を見つけられませんでした。",
    memoOcrFailed: "読み取れませんでした。オンラインで再試行してください。",
    ocrAddImage: "AI画像認識",
    ocrHelp:
      "AIが手書きや印刷の文字を読み取ります。今日のページではタスクに、メモでは本文に追加します。複雑な数式をメモしたい場合にも利用できます。写真を選ぶか、カメラで撮影してください。",
    ocrLatexHint: "複雑な数式をメモしたい場合にも利用できます。",
    ocrPickPhotos: "写真を選択",
    ocrTakePhoto: "カメラで撮影",
    ocrReading: "AIが画像を読み取っています",
    ocrQuota: "現在、画像認識の利用上限に達しています。しばらくしてからもう一度お試しください。",
    ocrUnreadable:
      "画像をうまく読み取れませんでした。文字がはっきり写っている写真でもう一度お試しください。",
    ocrEmpty: "画像から読み取れた文字はありません。",
    ocrLowConfidence:
      "画像認識が正しくできていない可能性があります。結果に問題がある場合には、再度撮影・選択してください。",
    ocrGeneric: "画像の読み取り中にエラーが発生しました。もう一度お試しください。",
    ocrAcknowledge: "わかった",
    ocrConfig:
      "画像認識のサーバー設定（Gemini APIキー）が無効です。Google AI Studio のキーを Firebase に設定してください。",
    ocrConfigBadFormat:
      "Gemini APIキーの形式が正しくありません（Google AI Studio の AIza… または AQ.… 形式が必要です）。npm run gemini:secret → npm run deploy を実行してください。",
    ocrPermission: "カメラまたは写真へのアクセスがオフです。iPhoneの「設定」→ Essences から許可してください。",
    ocrDebugTitle: "画像認識ログ（一時表示）",
    ocrDebugHint:
      "画像認識がうまくいかないときは、このログをすべてコピーして送ってください。Firebase認証・Gemini枠・APIキー確認・OCRの各ステップが記録されます（画像データは含みません）。",
    ocrDebugCopy: "ログをすべてコピー",
    ocrDebugCopied: "ログをコピーしました",
    ocrDebugCopyFailed: "コピーできませんでした。もう一度お試しください",
    ocrDebugClear: "ログを消去",
    ocrDebugCleared: "ログを消去しました",
    ocrDebugEmpty: "まだログがありません。一度画像認識を試してからコピーしてください。",
    ocrDebugWebNote: "WebプレビューではOCRは動きません。TestFlight版で確認してください。",
    openSettings: "設定を開く",
    notifDisabledInApp: "通知が設定でオフになっています。リマインダーを使うには設定でオンにしてください。",
    eventsCount: "件",
    noEventsOnDay: "この日の予定はありません",
    tapToAdd: "＋をタップして追加",
    calendarWeek: "週",
    calendarMonth: "月",
    weekNavSwipeHint: "横にスワイプして週を切り替え",
    weekStartSunday: "日曜始まり",
    weekStartMonday: "月曜始まり",
    about: "アプリについて",
    version: "バージョン",
    privacyPolicy: "プライバシーポリシー",
    remoteLaPermissionHint:
      "「ライブアクティビティの許可を継続しますか？」と出たら「常に許可」を選んでください。この表示は iOS のシステムUIで、アプリ側では消せません。",
    localLaOff:
      "このアプリの Live Activities がオフです。iPhoneの「設定」→ Essences → Live Activities をオンにしてください",
    localLaActive: "リード時間内の予定あり（端末側は開始を試み済み）",
    localLaNone: "いまリード時間内の予定はありません",
    endBeforeStart: "終了は開始より後にしてください。日付または時刻を修正してください。",
    timeRequired: "開始時刻と終了時刻を入力してください。",
    liveActivityStartInPast:
      "開始時刻が現在より前です。ライブアクティビティをオフにするか、開始時刻をこれから先に修正してください。",
    liveActivitySettingsTitle: "ライブアクティビティ",
    liveActivitySettingsOn:
      "Essences のライブアクティビティはオンです（オン／オフは iPhone の設定で行います）。",
    liveActivitySettingsOffUser:
      "アプリ内でオフです。オンにするとロック画面にカウントダウンを表示します。",
    liveActivitySettingsOffSystem:
      "iPhoneの設定でオフです。「設定」→ Essences → ライブアクティビティ をオンにしてください。",
    liveActivityEnable: "ライブアクティビティを有効にする",
    liveActivityOpenSettings: "iPhoneの設定を開く",
    liveActivityOpenLaSettings: "Essencesのライブアクティビティ設定を開く",
    liveActivityDisabledInApp:
      "ライブアクティビティがオフのため、この予定のロック画面カウントダウンは表示されません。",
    liveActivityDisabledSystem:
      "iPhoneの設定でライブアクティビティがオフのため、この予定のロック画面カウントダウンは表示されません。",
    liveActivityAllowPrompt:
      "ライブアクティビティの有効化がまだ完了していません。アプリ内の設定でロック画面デモを済ませてから、この予定でオンにしますか？",
    liveActivityAllowPromptSystem:
      "iPhoneの設定でライブアクティビティがオフです。アプリ内の設定ページから有効化手順を進めますか？",
    liveActivityAllowYes: "アプリの設定を開く",
    liveActivityAllowNo: "オフのまま保存",
    liveActivityOnboardingTitle: "ロック画面のカウントダウン",
    liveActivityOnboardingBody:
      "予定の前にロック画面へカウントダウンを表示できます。短いデモを試すと、アプリを完全終了したあとのリモート開始の準備にもなります。iOSが「許可を継続しますか？」と聞いたら「常に許可」を選んでください。",
    liveActivityTryDemo: "短いデモを試す",
    liveActivityOnboardingLater: "あとで",
    tutorialWelcomeTitle: "Essences へようこそ",
    tutorialWelcomeBody:
      "Essences は、今日のタスク・カレンダー・メモをひとつのアプリでまとめて扱える生活プランナーです。",
    tutorialWelcomeIntro:
      "これから短い案内で「今日」のタスク追加、カレンダー、設定の定型タスク、ロック画面のカウントダウンデモ（任意）を体験できます。いつでもスキップできます。",
    tutorialQuickAdd:
      "下の「何をしますか？」に今日のタスクを入力し、「追加」またはキーボードの完了で登録してください。",
    tutorialTaskSelect: "追加できました。リストのそのタスクをタップしてください。",
    tutorialTaskControls:
      "左側の丸が完了チェック、選択中に出る × が削除です。内容を確認したら画面をタップして次へ。",
    tutorialTaskCheck: "チェックボックスを押して、タスクを完了にしてみましょう。",
    tutorialStats:
      "連続＝続けた日数、今日＝今日の達成率、日＝タスクのある合計日数です。タップで次へ。",
    tutorialNavCalendar: "下のタブから「カレンダー」を開いてください。",
    tutorialMonthGoals:
      "カレンダー上部は今月の目標です。いつでも開閉できます。タップで次へ。",
    tutorialMonthGoalsClose:
      "今月の目標を閉じてください（右上の折りたたみボタンをタップ）。",
    tutorialCalendarSwipe:
      "カレンダーは上下スワイプで月を切り替えられます。このステップでは日付タップはできません。一度スワイプしてください。",
    tutorialCalendarToday: "「今日」を押すと、いまの月へ戻れます。",
    tutorialCalendarFab:
      "右下の ＋ からも新規予定を追加できます（ここでは押さなくて大丈夫です）。タップで次へ。",
    tutorialNavSettings: "下のタブから「設定」を開いてください。",
    tutorialReusableTasks:
      "設定の一番上にある定型タスクは、今日のリストへワンタップで追加できるショートカットです。タップで次へ。",
    tutorialLaDemoBody:
      "最後に、ロック画面でのライブアクティビティの短いデモを試せます。",
    tutorialLaDemoOfferTitle: "ロック画面のライブアクティビティデモ",
    tutorialLaDemoOfferBody:
      "短いカウントダウンのデモを、いまロック画面に表示しますか？あとから設定でも同じ操作ができます。",
    tutorialLaDemoStart: "ライブアクティビティのデモをロック画面に表示する",
    tutorialLaDemoPreparingTitle: "デモを準備中…",
    tutorialLaDemoPreparingBody:
      "ロック画面に短いカウントダウンを表示します。アプリを完全終了したあとのリモート開始の準備にもなります。",
    tutorialLaDemoPreparingHint: "しばらくお待ちください",
    tutorialLaDemoReadyBody:
      "ロック画面を確認してください。「次へ」で進めます。必要ならデモを再表示できます。",
    tutorialLaDemoAllowedTitle: "ロック画面のカウントダウン",
    tutorialLaDemoAllowedBody:
      "ライブアクティビティの準備ができました。次へ進めます。",
    tutorialLaDemoDeniedTitle: "ライブアクティビティがオフになりました",
    tutorialLaDemoDeniedBody:
      "拒否すると設定でライブアクティビティがオフになります。iPhoneの設定からオンに戻して再表示するか、「次へ」で進んでください。",
    tutorialLaDemoDeniedRetryBody:
      "ライブアクティビティがオフになりました。iPhoneの設定からオンに戻してデモを再表示するか、「次へ」で進んでください。",
    tutorialLaDemoForceEndedTitle: "デモを終了します",
    tutorialLaDemoForceEndedBody:
      "2度連続で拒否されたため、デモの表示を終了します。デモの表示はチュートリアルのあと、設定ページから行えます。",
    tutorialLaDemoFailedBody:
      "デモを開始できませんでした。再試行するか、あとで設定から有効にしてください。",
    tutorialLaDemoShowAgain: "もう一度ライブアクティビティのデモを表示する",
    tutorialLaDemoOnLockScreen: "表示されました。ロック画面を確認してください",
    tutorialLaDemoLater: "後で",
    tutorialLaDemoSettingsHint:
      "設定のライブアクティビティ欄でも、同じ手順で後から有効にできます。",
    tutorialLaDemoStarted:
      "デモを開始しました。ロック画面を確認してから「次へ」を押してください。",
    tutorialLaDemoNext: "次へ",
    tutorialLaDemoRetry: "デモを再試行",
    liveActivitySettingsDemoTitle: "ロック画面のカウントダウンを有効化",
    liveActivitySettingsDemoBody:
      "下のステップを順に完了すると、ロック画面のカウントダウンが使えるようになります。",
    liveActivitySettingsDemoSteps:
      "①iPhone設定でオン ②デモ表示 ③ロック画面で確認 ④完了",
    liveActivityStepSystem: "iPhoneの設定からライブアクティビティをオンにする",
    liveActivityStepDemo: "ライブアクティビティのデモを表示する",
    liveActivityStepAllow: "ロック画面でライブアクティビティのデモを確認する",
    liveActivityStepDone: "有効完了 — カレンダー予定で利用できます",
    settingsLaReenableIntro:
      "一度有効化済みです。iPhoneの設定でライブアクティビティをオンに戻してください。",
    settingsLaReenableTitle: "ライブアクティビティをオンに戻す",
    settingsLaReenableBody:
      "iPhoneの「設定」→ Essences → ライブアクティビティ をオンにしてください。デモは不要です。",
    settingsLaStep1Title: "ステップ1 — iPhoneの設定",
    settingsLaStep1Body:
      "「設定」→ Essences → ライブアクティビティ をオンにし、この画面に戻ってください。",
    settingsLaStep2Title: "ステップ2 — ロック画面のデモ",
    settingsLaStep2Body:
      "短いデモをロック画面に表示します。アプリを完全終了したあとのリモート開始の準備にもなります。",
    settingsLaStep3Title: "ステップ3 — ロック画面で確認",
    settingsLaStep3Body:
      "ロック画面のデモを確認してください。ライブアクティビティがオフでなければ「次へ」で完了できます。必要ならデモを再表示できます。",
    settingsLaStep4Title: "完了",
    settingsLaStep4Body: "ライブアクティビティが有効になりました。カレンダー予定で利用できます。",
    tutorialDoneTitle: "準備完了",
    tutorialDoneBody: "案内は以上です。予定やタスクを追加して Essences を使ってみましょう。タップで終了。",
    tutorialTapHint: "画面をタップして次へ",
    tutorialActionHint: "ハイライト部分を操作して次へ",
  },
} as const;

type TranslationKeys = keyof typeof translations.en;

export type { TranslationKeys };

interface I18nContextType {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: (key: TranslationKeys) => string;
  formatDate: (date: Date, options?: Intl.DateTimeFormatOptions) => string;
  formatDateStr: (iso: string, options?: Intl.DateTimeFormatOptions) => string;
}

const I18nContext = createContext<I18nContextType | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(detectLocale);

  const setLocale = (l: Locale) => {
    setLocaleState(l);
    localStorage.setItem(LANG_KEY, l);
  };

  const t = (key: TranslationKeys): string => {
    return translations[locale][key] || translations.en[key] || key;
  };

  const formatDate = (date: Date, options?: Intl.DateTimeFormatOptions): string => {
    const loc = locale === "ja" ? "ja-JP" : "en-US";
    return date.toLocaleDateString(loc, options);
  };

  const formatDateStr = (iso: string, options?: Intl.DateTimeFormatOptions): string => {
    return formatDate(new Date(iso + (iso.length === 10 ? "T00:00:00" : "")), options);
  };

  return (
    <I18nContext.Provider value={{ locale, setLocale, t, formatDate, formatDateStr }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used within I18nProvider");
  return ctx;
}
