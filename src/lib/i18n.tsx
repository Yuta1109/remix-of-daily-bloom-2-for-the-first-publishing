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
    settings: "Settings",

    streak: "Streak",
    todayLabel: "Today",
    days: "Days",
    todaysTasks: "Today's Tasks",
    startYourDay: "Start your day",
    tapPlusHint: "Use the field below to add your first task",
    whatNeedsDone: "What needs to be done?",
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
      "Shows a countdown on the Lock Screen. Example: if you choose “1 hour before” and the event starts at 3:00, the card appears at 2:00. If that time is already past when you save, it appears right away. Stays active up to 8 hours.",
    liveActivityForegroundNote: "Requires iOS 17.2 or later.",
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
    openSettings: "Open Settings",
    notifDisabledInApp: "Notifications are currently off. Turn them on in Settings to use reminders.",
    eventsCount: "events",
    noEventsOnDay: "No events on this day",
    tapToAdd: "Tap + to add one",
    about: "About",
    version: "Version",
    privacyPolicy: "Privacy Policy",
    remoteLaStatus: "Live Activity status",
    remoteLaOk: "Connected to Firestore",
    remoteLaNoConfig: "Firebase config missing in this build",
    remoteLaAuthFail: "Sign-in failed (enable Anonymous Auth?)",
    remoteLaWaiting: "Connecting…",
    remoteLaError: "Error",
    remoteLaRecheck: "Refresh diagnostics",
    remoteLaCopyLog: "Copy log",
    remoteLaCopied: "Copied",
    remoteLaTokens: "Tokens",
    remoteLaSchedules: "Schedules",
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
  },
  ja: {
    today: "今日",
    calendar: "カレンダー",
    settings: "設定",

    streak: "連続",
    todayLabel: "今日",
    days: "日",
    todaysTasks: "今日のタスク",
    startYourDay: "一日を始めよう",
    tapPlusHint: "下の欄から最初のタスクを追加",
    whatNeedsDone: "何をしますか？",
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
      "ロック画面にカウントダウンを表示します。例:「1時間前」にすると、15:00の予定は14:00に表示が始まります。保存した時点ですでにその時刻を過ぎている場合は、すぐに表示します。表示は最大8時間です。",
    liveActivityForegroundNote: "iOS 17.2 以上が必要です。",
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
    openSettings: "設定を開く",
    notifDisabledInApp: "通知が設定でオフになっています。リマインダーを使うには設定でオンにしてください。",
    eventsCount: "件",
    noEventsOnDay: "この日の予定はありません",
    tapToAdd: "＋をタップして追加",
    about: "アプリについて",
    version: "バージョン",
    privacyPolicy: "プライバシーポリシー",
    remoteLaStatus: "ライブアクティビティの状態",
    remoteLaOk: "Firestore に接続済み",
    remoteLaNoConfig: "このビルドに Firebase 設定がありません",
    remoteLaAuthFail: "サインイン失敗（Anonymous 認証を有効化してください）",
    remoteLaWaiting: "接続中…",
    remoteLaError: "エラー",
    remoteLaRecheck: "診断を更新",
    remoteLaCopyLog: "ログをコピー",
    remoteLaCopied: "コピーしました",
    remoteLaTokens: "トークン",
    remoteLaSchedules: "スケジュール",
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
  },
} as const;

type TranslationKeys = keyof typeof translations.en;

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
