import { useState, useEffect, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import {
  Globe,
  ListPlus,
  Plus,
  X,
  Bell,
  Shield,
  ChevronLeft,
  ChevronRight,
  Activity,
  Palette,
  Cloud,
  CalendarRange,
  Database,
  CircleUserRound,
} from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
import { useI18n, type Locale, type TranslationKeys } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import {
  createTaskTemplate,
  deleteTaskTemplate,
  getSettings,
  getTaskTemplates,
  updateReflectionSchedule,
  updateSettings,
} from "@/lib/v3/repository";
import type { TaskTemplate, UserSettings } from "@/lib/v3/types";
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
import { syncLiveActivitySchedulesRemote } from "@/lib/la-remote";
import { refreshLiveActivities } from "@/lib/live-activity";
import {
  getLiveActivityEnableProgress,
  getLiveActivityGate,
  type LiveActivityGate,
} from "@/lib/live-activity-prefs";
import { LiveActivityDemoPanel } from "@/components/LiveActivityDemoPanel";
import {
  THEME_ACCENTS,
  getThemeAccentId,
  setThemeAccentId,
  type ThemeAccentId,
} from "@/lib/theme-accent";
import { useAuth } from "@/lib/firebase/AuthProvider";
import { useCloudSync } from "@/lib/firebase/SyncProvider";
import { syncStatusI18nKey } from "@/lib/firebase/sync-status";

const APP_VERSION = "1.1.0";
const PREVIEW_LIMIT = 4;

interface Props {
  staticPreview?: boolean;
}

function SectionLabel({ labelKey }: { labelKey: TranslationKeys }) {
  const { t } = useI18n();
  return (
    <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 px-1">
      {t(labelKey)}
    </h2>
  );
}

export default function Settings({ staticPreview = false }: Props) {
  const navigate = useNavigate();
  const location = useLocation();
  const { locale, setLocale, t, formatDateStr } = useI18n();
  const { status } = useAuth();
  const { sync } = useCloudSync();
  const [templates, setTemplates] = useState<TaskTemplate[]>([]);
  const [newText, setNewText] = useState("");
  const [modalText, setModalText] = useState("");
  const [perm, setPerm] = useState<NotificationPermissionState>("prompt");
  const [userEnabled, setUserEnabled] = useState(getNotificationsUserEnabled());
  const [laGate, setLaGate] = useState<LiveActivityGate | null>(null);
  const [listOpen, setListOpen] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [themeAccent, setThemeAccent] = useState<ThemeAccentId>(() => getThemeAccentId());
  const [settings, setSettings] = useState<UserSettings>(() => getSettings());

  const refreshSettings = () => setSettings(getSettings());

  const refreshPermission = async () => {
    if (!isNative()) return;
    const s = await checkPermission();
    setPerm(s);
  };

  const refreshLaGate = async () => {
    if (!isNative() || staticPreview) return;
    try {
      setLaGate(await getLiveActivityGate());
    } catch {
      /* ignore */
    }
  };

  useEffect(() => setTemplates(getTaskTemplates()), []);
  useEffect(() => {
    void refreshPermission();
  }, []);
  useEffect(() => {
    if (!isNative() || staticPreview) return;
    void refreshLaGate();
  }, [staticPreview]);

  useEffect(() => {
    if (staticPreview) return;
    if (location.hash !== "#live-activity") return;
    const timer = window.setTimeout(() => {
      document.getElementById("settings-live-activity")?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 120);
    return () => window.clearTimeout(timer);
  }, [staticPreview, location.hash, location.pathname]);

  useEffect(() => {
    if (!isNative()) return;
    let handle: { remove: () => Promise<void> } | undefined;
    void App.addListener("appStateChange", ({ isActive }) => {
      if (isActive) {
        void refreshPermission();
        void refreshLaGate();
      }
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
        await openAppSettings();
        await refreshPermission();
        return;
      }
      const granted = await ensurePermission();
      await refreshPermission();
      if (granted) {
        updateSettings({ notifications: { ...getSettings().notifications, enabled: true } });
        setNotificationsUserEnabled(true);
        setUserEnabled(true);
        refreshSettings();
        void rescheduleAll();
      }
    } finally {
      setRequesting(false);
    }
  };

  const handleToggleUserEnabled = async (on: boolean) => {
    updateSettings({ notifications: { ...getSettings().notifications, enabled: on } });
    setNotificationsUserEnabled(on);
    setUserEnabled(on);
    refreshSettings();
    void rescheduleAll();
  };

  const languages: { key: Locale; label: string; flag: string }[] = [
    { key: "en", label: t("english"), flag: "🇺🇸" },
    { key: "ja", label: t("japanese"), flag: "🇯🇵" },
  ];

  const handleAdd = () => {
    if (!newText.trim()) return;
    createTaskTemplate({ title: newText });
    setTemplates(getTaskTemplates());
    setNewText("");
    void hideKeyboard();
  };

  const handleModalAdd = () => {
    if (!modalText.trim()) return;
    createTaskTemplate({ title: modalText });
    setTemplates(getTaskTemplates());
    setModalText("");
    void hideKeyboard();
  };

  const onReusableEnter = (
    e: KeyboardEvent<HTMLInputElement>,
    which: "page" | "modal",
  ) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    e.stopPropagation();
    if (which === "page") handleAdd();
    else handleModalAdd();
  };

  const handleRemove = (id: string) => {
    deleteTaskTemplate(id);
    setTemplates(getTaskTemplates());
  };

  const handleThemeSelect = (id: ThemeAccentId) => {
    setThemeAccentId(id);
    setThemeAccent(id);
    refreshSettings();
  };

  const preview = templates.slice(0, PREVIEW_LIMIT);
  const overflow = Math.max(0, templates.length - PREVIEW_LIMIT);
  const schedule = settings.reflectionSchedule;
  const signedIn = status === "signed_in";

  return (
    <div
      className={cn("app-shell-page", staticPreview && "pointer-events-none select-none")}
      aria-hidden={staticPreview || undefined}
    >
      {!staticPreview && (
        <div className="app-shell-header px-2 pb-2">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => navigate(-1)}
              aria-label={t("back")}
              className="p-2 rounded-full text-foreground/70 hover:bg-secondary/70"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <h1 className="text-xl font-bold tracking-tight">{t("appSettings")}</h1>
          </div>
        </div>
      )}

      <div className={cn("space-y-6 animate-fade-in-up pb-8", staticPreview ? "page-scroll px-5" : "app-shell-scroll px-4")}>
        {staticPreview && <h1 className="text-2xl font-bold tracking-tight">{t("appSettings")}</h1>}

        <section>
          <SectionLabel labelKey="settingsSectionAccount" />
          <div className="bg-card rounded-2xl shadow-soft divide-y divide-border/60">
            <button
              type="button"
              onClick={() => navigate("/user")}
              className="w-full flex items-center gap-3 px-4 py-3.5 text-left"
              data-testid="settings-open-account"
            >
              <CircleUserRound className="w-4 h-4 text-muted-foreground shrink-0" />
              <span className="flex-1 text-base">{t("settingsAccountManage")}</span>
              <span className="text-sm text-muted-foreground">
                {signedIn ? t("userAuthSignedIn") : t("userAuthSignedOut")}
              </span>
              <ChevronRight className="w-4 h-4 text-muted-foreground/60" />
            </button>
          </div>
        </section>

        <section>
          <SectionLabel labelKey="settingsSectionCloud" />
          <div className="bg-card rounded-2xl shadow-soft divide-y divide-border/60">
            <div className="flex items-center gap-3 px-4 py-3.5">
              <Cloud className="w-4 h-4 text-muted-foreground shrink-0" />
              <span className="flex-1 text-base">{t("userCloudStatusRow")}</span>
              <span data-testid="settings-sync-status" className="text-sm text-muted-foreground">
                {t(syncStatusI18nKey(sync.status))}
              </span>
            </div>
            <p className="px-4 py-3 text-xs text-muted-foreground">{t("settingsCloudHint")}</p>
            <button
              type="button"
              onClick={() => navigate("/user")}
              className="w-full flex items-center justify-between px-4 py-3.5 text-left text-sm"
            >
              <span>{t("settingsCloudOpenUser")}</span>
              <ChevronRight className="w-4 h-4 text-muted-foreground/60" />
            </button>
          </div>
        </section>

        <section>
          <SectionLabel labelKey="settingsSectionPlanning" />
          <div className="bg-card rounded-2xl shadow-soft mb-3">
            <div className="flex items-center gap-3 px-4 py-3.5">
              <CalendarRange className="w-4 h-4 text-muted-foreground shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-base">{t("settingsWeeklyPlanning")}</p>
                <p className="text-xs text-muted-foreground">{t("settingsWeeklyPlanningDesc")}</p>
              </div>
              <Switch
                checked={settings.weeklyPlanningEnabled}
                data-testid="settings-weekly-planning"
                onCheckedChange={(on) => {
                  updateSettings({ weeklyPlanningEnabled: on });
                  refreshSettings();
                }}
              />
            </div>
          </div>

          <div className="bg-card rounded-2xl p-5 shadow-soft" data-tutorial="reusable-tasks">
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
                  <span className="text-sm">{r.title}</span>
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
                className="w-full mb-3 flex items-center justify-center gap-2 rounded-xl bg-secondary/60 hover:bg-secondary px-4 py-2.5 text-sm font-medium"
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
                className="bg-accent text-accent-foreground rounded-xl px-4 py-2.5 text-sm font-medium flex items-center gap-1"
              >
                <Plus className="w-4 h-4" strokeWidth={2.5} />
                {t("add")}
              </button>
            </div>
          </div>
        </section>

        <section>
          <SectionLabel labelKey="settingsSectionReflection" />
          <div className="bg-card rounded-2xl p-4 shadow-soft space-y-4">
            <div>
              <p className="text-sm font-medium mb-2">{t("settingsReflectionDaily")}</p>
              <div className="flex gap-2 mb-2">
                <button
                  type="button"
                  data-testid="settings-reflection-evening"
                  onClick={() => {
                    updateReflectionSchedule({
                      daily: { ...schedule.daily, timeOfDay: "21:00", scheduleOffsetDays: 0 },
                    });
                    refreshSettings();
                  }}
                  className={cn(
                    "flex-1 min-h-11 rounded-xl text-sm font-medium",
                    (schedule.daily.scheduleOffsetDays ?? 0) === 0
                      ? "bg-accent/10"
                      : "bg-secondary/50 text-muted-foreground",
                  )}
                >
                  {t("reflectionDailyEvening")}
                </button>
                <button
                  type="button"
                  data-testid="settings-reflection-morning"
                  onClick={() => {
                    updateReflectionSchedule({
                      daily: { ...schedule.daily, timeOfDay: "08:00", scheduleOffsetDays: 1 },
                    });
                    refreshSettings();
                  }}
                  className={cn(
                    "flex-1 min-h-11 rounded-xl text-sm font-medium",
                    schedule.daily.scheduleOffsetDays === 1
                      ? "bg-accent/10"
                      : "bg-secondary/50 text-muted-foreground",
                  )}
                >
                  {t("reflectionDailyMorning")}
                </button>
              </div>
              <input
                type="time"
                aria-label={t("reflectionTime")}
                value={schedule.daily.timeOfDay}
                onChange={(e) => {
                  updateReflectionSchedule({ daily: { ...schedule.daily, timeOfDay: e.target.value } });
                  refreshSettings();
                }}
                className="w-full rounded-xl bg-secondary/50 px-3 py-3 text-sm"
              />
            </div>
            <div>
              <p className="text-sm font-medium mb-2">{t("settingsReflectionWeekly")}</p>
              <div className="flex gap-2">
                <select
                  aria-label={t("reflectionWeekday")}
                  data-testid="settings-reflection-weekday"
                  value={schedule.weekly.weekday ?? 0}
                  onChange={(e) => {
                    updateReflectionSchedule({
                      weekly: {
                        ...schedule.weekly,
                        weekday: Number(e.target.value) as 0 | 1 | 2 | 3 | 4 | 5 | 6,
                      },
                    });
                    refreshSettings();
                  }}
                  className="flex-1 rounded-xl bg-secondary/50 px-3 py-3 text-sm"
                >
                  {Array.from({ length: 7 }, (_, d) => (
                    <option key={d} value={d}>
                      {formatDateStr(`2026-09-${String(6 + d).padStart(2, "0")}`, { weekday: "long" })}
                    </option>
                  ))}
                </select>
                <input
                  type="time"
                  aria-label={t("reflectionTime")}
                  value={schedule.weekly.timeOfDay}
                  onChange={(e) => {
                    updateReflectionSchedule({ weekly: { ...schedule.weekly, timeOfDay: e.target.value } });
                    refreshSettings();
                  }}
                  className="flex-1 rounded-xl bg-secondary/50 px-3 py-3 text-sm"
                />
              </div>
            </div>
            {(["monthly", "future"] as const).map((kind) => (
              <div key={kind}>
                <p className="text-sm font-medium mb-2">
                  {kind === "monthly" ? t("settingsReflectionMonthly") : t("settingsReflectionFuture")}
                </p>
                <div className="flex gap-2">
                  <input
                    type="number"
                    min={1}
                    max={31}
                    aria-label={t("reflectionDayOfMonth")}
                    data-testid={`settings-reflection-${kind}-day`}
                    value={schedule[kind].dayOfMonth ?? 1}
                    onChange={(e) => {
                      updateReflectionSchedule({
                        [kind]: { ...schedule[kind], dayOfMonth: Number(e.target.value) },
                      });
                      refreshSettings();
                    }}
                    className="w-20 rounded-xl bg-secondary/50 px-3 py-3 text-sm"
                  />
                  <input
                    type="time"
                    aria-label={t("reflectionTime")}
                    value={schedule[kind].timeOfDay}
                    onChange={(e) => {
                      updateReflectionSchedule({
                        [kind]: { ...schedule[kind], timeOfDay: e.target.value },
                      });
                      refreshSettings();
                    }}
                    className="flex-1 rounded-xl bg-secondary/50 px-3 py-3 text-sm"
                  />
                </div>
              </div>
            ))}
          </div>
        </section>

        {isNative() && (
          <section>
            <SectionLabel labelKey="settingsSectionNotifications" />
            <div className="bg-card rounded-2xl p-5 shadow-soft mb-3">
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
                    {perm === "denied" ? t("notificationsDeniedHint") : t("notificationsPermissionNeeded")}
                  </p>
                  <button
                    type="button"
                    onClick={handleEnableNotifications}
                    disabled={requesting}
                    className="w-full bg-accent text-accent-foreground rounded-xl px-4 py-3 text-sm font-medium disabled:opacity-60"
                  >
                    {perm === "denied" ? t("openSettings") : t("enableNotifications")}
                  </button>
                </>
              )}
            </div>
            <div
              id="settings-live-activity"
              className="bg-card rounded-2xl p-5 shadow-soft scroll-mt-4"
            >
              <div className="flex items-center gap-2 mb-1">
                <Activity className="w-4 h-4 text-accent" />
                <p className="text-sm font-semibold">{t("liveActivitySettingsTitle")}</p>
              </div>
              <div className="mt-2 space-y-2">
                <p className="text-xs text-muted-foreground">
                  {laGate && getLiveActivityEnableProgress(laGate).mode === "reenable"
                    ? t("settingsLaReenableIntro")
                    : t("liveActivitySettingsDemoBody")}
                </p>
                <LiveActivityDemoPanel
                  variant="settings"
                  showChecklist
                  onOutcome={(outcome) => {
                    if (outcome === "allowed") {
                      void refreshLaGate();
                      void refreshLiveActivities()
                        .then(() => syncLiveActivitySchedulesRemote())
                        .catch(() => {
                          void syncLiveActivitySchedulesRemote();
                        });
                    }
                  }}
                  onProgressChange={() => {
                    void getLiveActivityGate().then(setLaGate);
                  }}
                />
              </div>
              <p className="text-xs text-muted-foreground mt-3">{t("remoteLaPermissionHint")}</p>
            </div>
          </section>
        )}

        <section>
          <SectionLabel labelKey="settingsSectionAppearance" />
          <div className="bg-card rounded-2xl p-5 shadow-soft mb-3">
            <div className="flex items-center gap-2 mb-1">
              <Palette className="w-4 h-4 text-accent" />
              <p className="text-sm font-semibold">{t("themeColor")}</p>
            </div>
            <p className="text-xs text-muted-foreground mb-4">{t("themeColorDesc")}</p>
            <div className="grid grid-cols-4 gap-3">
              {THEME_ACCENTS.map((opt) => {
                const selected = themeAccent === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => handleThemeSelect(opt.id)}
                    className={cn(
                      "flex flex-col items-center gap-1.5 rounded-xl px-1 py-2",
                      selected ? "bg-accent/10 ring-1 ring-accent/35" : "hover:bg-secondary/60",
                    )}
                    aria-label={t(opt.labelKey)}
                    aria-pressed={selected}
                  >
                    <span
                      className={cn(
                        "w-9 h-9 rounded-full shadow-soft",
                        selected && "ring-2 ring-offset-2 ring-offset-card ring-accent",
                      )}
                      style={{ backgroundColor: `hsl(${opt.accent})` }}
                    />
                    <span className={cn("text-[10px] font-medium", selected ? "text-accent" : "text-muted-foreground")}>
                      {t(opt.labelKey)}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
          <div className="bg-card rounded-2xl p-5 shadow-soft mb-3">
            <div className="flex items-center gap-2 mb-1">
              <Globe className="w-4 h-4 text-accent" />
              <p className="text-sm font-semibold">{t("language")}</p>
            </div>
            <p className="text-xs text-muted-foreground mb-4">{t("selectLanguage")}</p>
            <div className="space-y-2">
              {languages.map((lang) => (
                <button
                  key={lang.key}
                  onClick={() => {
                    setLocale(lang.key);
                    refreshSettings();
                  }}
                  className={cn(
                    "w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium",
                    locale === lang.key
                      ? "bg-accent/10 text-accent ring-1 ring-accent/30"
                      : "bg-secondary/60 text-foreground hover:bg-secondary",
                  )}
                >
                  <span className="text-lg">{lang.flag}</span>
                  <span>{lang.label}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="bg-card rounded-2xl p-5 shadow-soft">
            <p className="text-sm font-semibold mb-3">{t("settingsWeekStart")}</p>
            <div className="flex gap-2">
              <button
                type="button"
                data-testid="settings-week-sunday"
                onClick={() => {
                  updateSettings({ weekStartsOn: 0 });
                  refreshSettings();
                }}
                className={cn(
                  "flex-1 min-h-11 rounded-xl text-sm",
                  settings.weekStartsOn === 0 ? "bg-accent/10 font-semibold" : "bg-secondary/50 text-muted-foreground",
                )}
              >
                {t("weekStartSunday")}
              </button>
              <button
                type="button"
                data-testid="settings-week-monday"
                onClick={() => {
                  updateSettings({ weekStartsOn: 1 });
                  refreshSettings();
                }}
                className={cn(
                  "flex-1 min-h-11 rounded-xl text-sm",
                  settings.weekStartsOn === 1 ? "bg-accent/10 font-semibold" : "bg-secondary/50 text-muted-foreground",
                )}
              >
                {t("weekStartMonday")}
              </button>
            </div>
          </div>
        </section>

        <section>
          <SectionLabel labelKey="settingsSectionData" />
          <div className="bg-card rounded-2xl p-5 shadow-soft space-y-4">
            <div className="flex items-start gap-3">
              <Cloud className="w-4 h-4 text-accent mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-semibold">{t("settingsDataCloudTitle")}</p>
                <p className="text-xs text-muted-foreground mt-1">{t("settingsDataCloudBody")}</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Database className="w-4 h-4 text-accent mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-semibold">{t("settingsDataDeviceTitle")}</p>
                <p className="text-xs text-muted-foreground mt-1">{t("settingsDataDeviceBody")}</p>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">{t("settingsDataNoDelete")}</p>
          </div>
        </section>

        <section>
          <SectionLabel labelKey="settingsSectionAbout" />
          <div className="bg-card rounded-2xl p-5 shadow-soft">
            <div className="flex items-center gap-2 mb-4">
              <Shield className="w-4 h-4 text-accent" />
              <p className="text-sm font-semibold">{t("about")}</p>
            </div>
            <button
              onClick={() => navigate("/privacy")}
              className="w-full flex items-center justify-between gap-2 bg-secondary/50 rounded-xl px-4 py-3 text-sm"
            >
              <span>{t("privacyPolicy")}</span>
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            </button>
            <p className="text-xs text-muted-foreground mt-3 text-center">
              {t("version")} {APP_VERSION}
            </p>
          </div>
        </section>
      </div>

      {!staticPreview &&
        listOpen &&
        createPortal(
          <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" onClick={() => setListOpen(false)} />
            <div
              data-kb-shell="translate"
              className="relative z-10 w-full max-w-md max-h-[80dvh] bg-background rounded-3xl shadow-float flex flex-col overflow-hidden"
            >
              <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-border/50 shrink-0">
                <h2 className="text-base font-semibold">{t("reusableTasks")}</h2>
                <button type="button" onClick={() => setListOpen(false)} className="p-2 text-muted-foreground">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="settings-modal-scroll min-h-0 flex-1 px-4 py-3 space-y-2">
                {templates.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">{t("addReusable")}</p>
                ) : (
                  templates.map((r) => (
                    <div
                      key={r.id}
                      className="flex items-center justify-between gap-2 bg-secondary/50 rounded-xl px-4 py-2.5"
                    >
                      <span className="text-sm">{r.title}</span>
                      <button
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
                  className="flex-1 bg-secondary/60 rounded-xl px-4 py-2.5 text-base outline-none"
                />
                <button
                  type="button"
                  onClick={handleModalAdd}
                  className="bg-accent text-accent-foreground rounded-xl px-4 py-2.5 text-sm font-medium flex items-center gap-1"
                >
                  <Plus className="w-4 h-4" strokeWidth={2.5} />
                  {t("add")}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
