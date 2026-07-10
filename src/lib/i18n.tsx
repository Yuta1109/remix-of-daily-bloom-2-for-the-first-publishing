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

    language: "言語",
    english: "English",
    japanese: "日本語",
    appSettings: "設定",
    selectLanguage: "言語を選択してください",
    reusableTasks: "定型タスク",
    reusableTasksDesc: "よく使うタスクを保存してワンタップで追加",
    addReusable: "定型タスクを追加",
    add: "追加",
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
