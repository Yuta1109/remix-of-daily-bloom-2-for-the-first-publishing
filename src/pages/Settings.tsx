import { useState, useEffect, useSyncExternalStore, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import {
  Globe,
  ListPlus,
  Plus,
  X,
  Bell,
  Shield,
  ChevronRight,
  Activity,
  Palette,
} from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
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
  fetchRemoteLaDiagnostics,
  formatLaDiagnosticsReport,
  getLiveActivityRemoteStatus,
  initLiveActivityRemote,
  syncLiveActivitySchedulesRemote,
  type RemoteLaDiagnostics,
} from "@/lib/la-remote";
import {
  getLiveActivityLocalStatus,
  refreshLiveActivities,
} from "@/lib/live-activity";
import {
  getLiveActivityEnableProgress,
  getLiveActivityGate,
  type LiveActivityGate,
} from "@/lib/live-activity-prefs";
import { LiveActivityDemoPanel } from "@/components/LiveActivityDemoPanel";
import {
  formatLaDebugLogForCopy,
  getLaDebugLog,
  subscribeLaDebugLog,
} from "@/lib/la-debug-log";
import {
  THEME_ACCENTS,
  getThemeAccentId,
  setThemeAccentId,
  type ThemeAccentId,
} from "@/lib/theme-accent";

const APP_VERSION = "1.0.0";
const PREVIEW_LIMIT = 4;

interface Props {
  staticPreview?: boolean;
}

export default function Settings({ staticPreview = false }: Props) {
  const navigate = useNavigate();
  const location = useLocation();
  const { locale, setLocale, t } = useI18n();
  const [reusable, setReusable] = useState<ReusableTask[]>([]);
  const [newText, setNewText] = useState("");
  const [modalText, setModalText] = useState("");
  const [perm, setPerm] = useState<NotificationPermissionState>("prompt");
  const [userEnabled, setUserEnabled] = useState(getNotificationsUserEnabled());
  const [laGate, setLaGate] = useState<LiveActivityGate | null>(null);
  const [listOpen, setListOpen] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [themeAccent, setThemeAccent] = useState<ThemeAccentId>(() => getThemeAccentId());
  const [laBusy, setLaBusy] = useState(false);
  const [laCopied, setLaCopied] = useState(false);
  const [laDiag, setLaDiag] = useState<RemoteLaDiagnostics | null>(null);
  const [laRemoteTick, setLaRemoteTick] = useState(0);
  const debugLog = useSyncExternalStore(subscribeLaDebugLog, getLaDebugLog, getLaDebugLog);
  const laRemote = getLiveActivityRemoteStatus();
  const laLocal = getLiveActivityLocalStatus();
  void laRemoteTick;
  void debugLog;

  const refreshPermission = async () => {
    if (!isNative()) return;
    const s = await checkPermission();
    setPerm(s);
  };

  const refreshLaDiagnostics = async () => {
    if (!isNative() || staticPreview) return;
    setLaBusy(true);
    try {
      await initLiveActivityRemote();
      const [diag, gate] = await Promise.all([
        fetchRemoteLaDiagnostics(),
        getLiveActivityGate(),
      ]);
      setLaDiag(diag);
      setLaGate(gate);
      setLaRemoteTick((n) => n + 1);
    } finally {
      setLaBusy(false);
    }
  };

  const copyLaLog = async () => {
    const report = formatLaDiagnosticsReport(
      getLiveActivityRemoteStatus(),
      laDiag,
      getLiveActivityLocalStatus(),
      formatLaDebugLogForCopy(),
    );
    try {
      await navigator.clipboard.writeText(report);
      setLaCopied(true);
      window.setTimeout(() => setLaCopied(false), 2000);
    } catch {
      window.prompt("Copy LA log:", report);
    }
  };

  useEffect(() => setReusable(loadReusable()), []);
  useEffect(() => {
    void refreshPermission();
  }, []);
  useEffect(() => {
    if (!isNative() || staticPreview) return;
    void refreshLaDiagnostics();
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
        void refreshLaDiagnostics();
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
    which: "page" | "modal",
  ) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    e.stopPropagation();
    if (which === "page") handleAdd();
    else handleModalAdd();
  };

  const handleRemove = (id: string) => setReusable(removeReusable(id));

  const handleThemeSelect = (id: ThemeAccentId) => {
    setThemeAccentId(id);
    setThemeAccent(id);
  };

  const preview = reusable.slice(0, PREVIEW_LIMIT);
  const overflow = Math.max(0, reusable.length - PREVIEW_LIMIT);

  return (
    <div
      className={cn("page-scroll px-5", staticPreview && "pointer-events-none select-none")}
      aria-hidden={staticPreview || undefined}
    >
      <div className="space-y-6 animate-fade-in-up pb-4">
        <h1 className="text-2xl font-bold tracking-tight">{t("appSettings")}</h1>

        {/* 1. Reusable tasks */}
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

        {/* 2. Notifications */}
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

        {/* 3. Live Activities */}
        {isNative() && (
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
                    void refreshLaDiagnostics();
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
        )}

        {/* 4. Theme color */}
        <div className="bg-card rounded-2xl p-5 shadow-soft">
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
                    "flex flex-col items-center gap-1.5 rounded-xl px-1 py-2 transition-colors",
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
                  <span
                    className={cn(
                      "text-[10px] font-medium leading-tight text-center",
                      selected ? "text-accent" : "text-muted-foreground",
                    )}
                  >
                    {t(opt.labelKey)}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* 5. Language */}
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
                    : "bg-secondary/60 text-foreground hover:bg-secondary",
                )}
              >
                <span className="text-lg">{lang.flag}</span>
                <span>{lang.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* 6. About */}
        <div className="bg-card rounded-2xl p-5 shadow-soft">
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

        {/* 7. LA diagnostics (TestFlight copy) */}
        {isNative() && (
          <div className="bg-card rounded-2xl p-5 shadow-soft mb-6">
            <div className="flex items-center gap-2 mb-1">
              <Activity className="w-4 h-4 text-accent" />
              <p className="text-sm font-semibold">{t("remoteLaStatus")}</p>
            </div>
            <p className="text-xs text-muted-foreground mb-3">{t("remoteLaPermissionHint")}</p>
            <div className="space-y-1.5 text-xs font-mono bg-secondary/50 rounded-xl px-3 py-2.5 mb-3">
              <p>
                {t("remoteLaTokens")}: FCM {laRemote.hasFcmToken ? "✓" : "✗"} · PTS{" "}
                {laRemote.hasPushToStartToken ? "✓" : "✗"} · upd{" "}
                {laRemote.hasUpdateToken ? "✓" : "✗"}
              </p>
              <p>
                local: enabled={String(laLocal.systemEnabled)} count={laLocal.activeCount}
              </p>
              {laDiag?.device && (
                <p className="break-all">
                  lastStart: ok={String(laDiag.device.lastRemoteLaStartOk ?? "-")} alert=
                  {String(laDiag.device.lastRemoteLaStartHadAlert ?? "-")} items=
                  {String(laDiag.device.lastRemoteLaStartItemCount ?? "-")}
                  {laDiag.device.lastRemoteLaStartError
                    ? ` err=${String(laDiag.device.lastRemoteLaStartError).slice(0, 60)}`
                    : ""}
                </p>
              )}
              <p>
                {laRemote.authenticated
                  ? t("remoteLaOk")
                  : laRemote.configPresent
                    ? t("remoteLaWaiting")
                    : t("remoteLaNoConfig")}
              </p>
              {(laRemote.lastError || laLocal.lastError) && (
                <p className="text-destructive break-all">
                  {t("remoteLaError")}: {laRemote.lastError || laLocal.lastError}
                </p>
              )}
              {laDiag?.schedules?.length ? (
                <div className="pt-1 border-t border-border/40 space-y-1">
                  <p>
                    {t("remoteLaSchedules")} ({laDiag.schedules.length})
                  </p>
                  {laDiag.schedules.slice(0, 6).map((s) => (
                    <p key={s.id} className="break-all">
                      {s.status} · {s.title || "?"} · upd=
                      {s.lastRemoteUpdateOk == null
                        ? "-"
                        : s.lastRemoteUpdateOk
                          ? "ok"
                          : "fail"}
                      {s.lastError ? ` · ${String(s.lastError).slice(0, 40)}` : ""}
                    </p>
                  ))}
                </div>
              ) : null}
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => void refreshLaDiagnostics()}
                disabled={laBusy}
                className="flex-1 bg-secondary/60 rounded-xl px-3 py-2.5 text-sm font-medium disabled:opacity-60"
              >
                {t("remoteLaRecheck")}
              </button>
              <button
                type="button"
                onClick={() => void copyLaLog()}
                className="flex-1 bg-accent text-accent-foreground rounded-xl px-3 py-2.5 text-sm font-medium"
              >
                {laCopied ? t("remoteLaCopied") : t("remoteLaCopyLog")}
              </button>
            </div>
            <p className="text-[11px] text-muted-foreground mt-2 leading-relaxed">
              {locale === "ja"
                ? "ログは端末に保存され、予定の削除では消えません。テスト一式のあと「ログをコピー」でまとめて送れます。"
                : "Logs are kept on device and survive deleting events. Copy once after a full test session."}
            </p>
          </div>
        )}
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
          document.body,
        )}
    </div>
  );
}
