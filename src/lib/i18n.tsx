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
    tapPlusHint: "Tap + to add your first task",
    whatNeedsDone: "What needs to be done?",
    allTasksComplete: "🎉 All tasks complete!",
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

    reminderNone: "None",
    reminderAt: "At time of event",
    reminder5m: "5 minutes before",
    reminder15m: "15 minutes before",
    reminder30m: "30 minutes before",
    reminder1h: "1 hour before",
    reminder1d: "1 day before",

    repeatNone: "Never",
    repeatDaily: "Every day",
    repeatWeekly: "Every week",
    repeatMonthly: "Every month",
    repeatYearly: "Every year",

    // Live Activity
    liveActivity: "Live Activity",
    liveActivityShow: "Show on Lock Screen",
    liveActivityHint: "Shows a countdown to this event on your Lock Screen.",
    la24h: "1 day before",
    la12h: "12 hours before",
    la8h: "8 hours before",
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
    add: "Add",
    notifications: "Notifications",
    notificationsPermissionNeeded: "Allow notifications to receive event reminders.",
    enableNotifications: "Enable notifications",
    notificationsEnabled: "Notifications are on",
    about: "About",
    version: "Version",
    privacyPolicy: "Privacy Policy",
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
    tapPlusHint: "＋をタップして最初のタスクを追加",
    whatNeedsDone: "何をしますか？",
    allTasksComplete: "🎉 全タスク完了！",
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

    reminderNone: "なし",
    reminderAt: "開始時刻",
    reminder5m: "5分前",
    reminder15m: "15分前",
    reminder30m: "30分前",
    reminder1h: "1時間前",
    reminder1d: "1日前",

    repeatNone: "なし",
    repeatDaily: "毎日",
    repeatWeekly: "毎週",
    repeatMonthly: "毎月",
    repeatYearly: "毎年",

    // Live Activity
    liveActivity: "ライブアクティビティ",
    liveActivityShow: "ロック画面に表示",
    liveActivityHint: "この予定までのカウントダウンをロック画面に表示します。",
    la24h: "1日前",
    la12h: "12時間前",
    la8h: "8時間前",
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
    addReusable: "定型タスクを追加",
    add: "追加",
    notifications: "通知",
    notificationsPermissionNeeded: "予定の通知を受け取るには通知を許可してください。",
    enableNotifications: "通知を有効にする",
    notificationsEnabled: "通知はオンです",
    about: "アプリについて",
    version: "バージョン",
    privacyPolicy: "プライバシーポリシー",
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
