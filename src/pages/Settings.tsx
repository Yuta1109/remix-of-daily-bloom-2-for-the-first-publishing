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
  fetchRemoteLaDiagnostics,
  type LiveActivityRemoteStatus,
  type RemoteLaDiagnostics,
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
  const [remoteDiag, setRemoteDiag] = useState<RemoteLaDiagnostics | null>(null);
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
    // After APNs/FCM are ready, refresh again so a local-only LA can be
    // recreated with pushType:.token and yield updateToken.
    try {
      await refreshLiveActivities();
      const { token } = await LiveActivities.getUpdateToken();
      if (token) {
        laDebugLog("ui", `updateToken after relaunch poll (len=${token.length})`, "ok");
      } else {
        laDebugLog("ui", "updateToken still empty after relaunch poll", "warn");
      }
    } catch {
      /* ignore */
    }
    setLocalStatus(getLiveActivityLocalStatus());
    setRemoteStatus(getLiveActivityRemoteStatus());
    try {
      const diag = await fetchRemoteLaDiagnostics();
      setRemoteDiag(diag);
    } catch {
      setRemoteDiag(null);
    }
    setRemoteStatus(getLiveActivityRemoteStatus());
    laDebugLog("ui", "Recheck finished");
  };

  const copyDebugLog = async () => {
    let diag = remoteDiag;
    try {
      diag = (await fetchRemoteLaDiagnostics()) ?? diag;
      setRemoteDiag(diag);
    } catch {
      /* keep previous */
    }
    const text = [
      "=== Essences LA / FCM debug ===",
      `at: ${new Date().toISOString()}`,
      `remote: ${JSON.stringify(getLiveActivityRemoteStatus(), null, 2)}`,
      `local: ${JSON.stringify(getLiveActivityLocalStatus(), null, 2)}`,
      `native: ${nativeDebugJson || "(none)"}`,
      `server: ${diag ? JSON.stringify(diag, null, 2) : "(none — open Recheck after Cloud Functions run)"}`,
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
                {remoteDiag?.lastAttempt && !remoteDiag.lastAttempt.ok && (
                  <p className="text-destructive/90 whitespace-pre-wrap mt-1">
                    {locale === "ja"
                      ? `サーバー更新失敗: ${remoteDiag.lastAttempt.code || "error"}`
                      : `Server update failed: ${remoteDiag.lastAttempt.code || "error"}`}
                    {remoteDiag.lastAttempt.hint
                      ? `\n${remoteDiag.lastAttempt.hint}`
                      : remoteDiag.lastAttempt.error
                        ? `\n${remoteDiag.lastAttempt.error}`
                        : ""}
                  </p>
                )}
                {nativeDebugJson.includes("aps-environment") && (
                  <p className="text-destructive/90 whitespace-pre-wrap mt-1">
                    {locale === "ja"
                      ? "根本原因: 署名済みアプリに Push 用 aps-environment エンタイトルメントがありません。CI の無署名アーカイブが原因でした。Apple Developer → Identifiers → com.confast.essences で Push Notifications を有効にし、修正後の TestFlight を入れ直してください。"
                      : "Root cause: signed app is missing the aps-environment Push entitlement (unsigned CI archives strip it). Enable Push Notifications on App ID com.confast.essences, then install a newly signed TestFlight build."}
                  </p>
                )}
                {!remoteStatus.hasFcmToken && !nativeDebugJson.includes("aps-environment") && (
                  <p className="text-muted-foreground whitespace-pre-wrap">
                    {locale === "ja"
                      ? "FCM✗: 通知許可後に APNs→FCM トークンが必要です。「再チェック」を押すか、通知を一度オフ→オンにしてください。"
                      : "FCM✗: Needs APNs→FCM token after notification permission. Tap Recheck or toggle notifications."}
                  </p>
                )}
                {!remoteStatus.hasPushToStartToken && (
                  <p className="text-muted-foreground whitespace-pre-wrap">
                    {locale === "ja"
                      ? "LA✗: ActivityKit の push-to-start トークン未取得（iOS 17.2+ / Live Activities オンが必要）。FCM/APNs が直るまでリモート開始は動きません。"
                      : "LA✗: No ActivityKit push-to-start token yet (needs iOS 17.2+ and Live Activities On). Remote start waits on FCM/APNs."}
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
