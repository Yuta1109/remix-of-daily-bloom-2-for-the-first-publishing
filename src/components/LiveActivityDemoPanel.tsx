import { useCallback, useEffect, useRef, useState } from "react";
import { App } from "@capacitor/app";
import { useI18n } from "@/lib/i18n";
import {
  getLiveActivityEnableProgress,
  getLiveActivityGate,
  isNativeIos,
  markLiveActivityDemoPresented,
  markLiveActivityEnableAllowed,
  resetLiveActivityEnableProgress,
  setLiveActivityPermissionOutcome,
  setLiveActivityUserEnabled,
  type LiveActivityEnableProgress,
  type LiveActivityPermissionOutcome,
} from "@/lib/live-activity-prefs";
import { getLiveActivityLocalStatus, startDemoLiveActivity } from "@/lib/live-activity";
import { openAppSettings } from "@/lib/notifications";
import { cn } from "@/lib/utils";

export type LaDemoPhase =
  | "idle"
  | "preparing"
  | "ready"
  | "denied"
  | "failed"
  | "complete";

type Props = {
  /** Auto-start demo when mounted (tutorial). */
  autoStart?: boolean;
  /** Show the 4-step checklist (Settings). */
  showChecklist?: boolean;
  className?: string;
  onOutcome?: (outcome: LiveActivityPermissionOutcome, phase: LaDemoPhase) => void;
  /** True only after Allow confirmed this session (or denied → later). */
  onCanContinueChange?: (can: boolean) => void;
  onProgressChange?: (progress: LiveActivityEnableProgress) => void;
  /** Tutorial: user tapped “後で行う” after deny. */
  onDeferAfterDeny?: () => void;
};

/**
 * Lock Screen Live Activity enable flow (tutorial + Settings).
 * Allowed only after: demo started → left app → returned with allow signal.
 */
export function LiveActivityDemoPanel({
  autoStart = false,
  showChecklist = false,
  className,
  onOutcome,
  onCanContinueChange,
  onProgressChange,
  onDeferAfterDeny,
}: Props) {
  const { t } = useI18n();
  const [phase, setPhase] = useState<LaDemoPhase>("idle");
  const [busy, setBusy] = useState(false);
  const [displayOutcome, setDisplayOutcome] =
    useState<LiveActivityPermissionOutcome>("unknown");
  const [progress, setProgress] = useState<LiveActivityEnableProgress>({
    systemOn: false,
    demoPresented: false,
    allowed: false,
    complete: false,
  });
  const startedRef = useRef(false);
  const demoSessionRef = useRef(false);
  const sawBackgroundRef = useRef(false);

  const refreshProgress = useCallback(async () => {
    const gate = await getLiveActivityGate();
    const next = getLiveActivityEnableProgress(gate);
    setProgress(next);
    onProgressChange?.(next);
    return { gate, next };
  }, [onProgressChange]);

  const emitOutcome = useCallback(
    (outcome: LiveActivityPermissionOutcome, next: LaDemoPhase) => {
      setDisplayOutcome(outcome);
      setLiveActivityPermissionOutcome(outcome);
      onOutcome?.(outcome, next);
      onCanContinueChange?.(outcome === "allowed" || outcome === "skipped");
    },
    [onOutcome, onCanContinueChange],
  );

  const evaluateGate = useCallback(async () => {
    if (!isNativeIos()) {
      markLiveActivityDemoPresented();
      markLiveActivityEnableAllowed();
      setPhase("complete");
      emitOutcome("allowed", "complete");
      await refreshProgress();
      return;
    }

    const { gate, next } = await refreshProgress();

    if (!gate.systemEnabled) {
      resetLiveActivityEnableProgress();
      setPhase("denied");
      emitOutcome("denied", "denied");
      onCanContinueChange?.(false);
      await refreshProgress();
      return;
    }

    // Never treat as allowed until the user left for Lock Screen after a demo.
    if (!demoSessionRef.current || !sawBackgroundRef.current) {
      if (phase !== "preparing" && phase !== "denied") {
        setPhase(demoSessionRef.current ? "ready" : phase === "idle" ? "idle" : "ready");
      }
      onCanContinueChange?.(false);
      return;
    }

    const local = getLiveActivityLocalStatus();
    const stillLive = gate.activityCount > 0 || local.activeCount > 0;
    const alwaysAllow = gate.frequentPushesEnabled;

    if (alwaysAllow || stillLive) {
      markLiveActivityEnableAllowed();
      setPhase("complete");
      emitOutcome("allowed", "complete");
      await refreshProgress();
      return;
    }

    // Left Lock Screen with no card and system still on — need another demo.
    setPhase("ready");
    setDisplayOutcome("unknown");
    onCanContinueChange?.(false);
    void next;
  }, [emitOutcome, onCanContinueChange, phase, refreshProgress]);

  const runDemo = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setPhase("preparing");
    setDisplayOutcome("unknown");
    sawBackgroundRef.current = false;
    demoSessionRef.current = true;
    onCanContinueChange?.(false);
    try {
      if (!isNativeIos()) {
        markLiveActivityDemoPresented();
        markLiveActivityEnableAllowed();
        setPhase("complete");
        emitOutcome("allowed", "complete");
        return;
      }
      setLiveActivityUserEnabled(true);
      const gate = await getLiveActivityGate();
      if (!gate.systemEnabled) {
        resetLiveActivityEnableProgress();
        setPhase("denied");
        emitOutcome("denied", "denied");
        return;
      }
      const result = await startDemoLiveActivity({ durationMs: 90_000 });
      if (!result.ok) {
        if (!result.systemEnabled) {
          resetLiveActivityEnableProgress();
          setPhase("denied");
          emitOutcome("denied", "denied");
        } else {
          setPhase("failed");
          onCanContinueChange?.(false);
        }
        return;
      }
      markLiveActivityDemoPresented();
      setPhase("ready");
      setDisplayOutcome("unknown");
      onCanContinueChange?.(false);
      await refreshProgress();
    } catch {
      setPhase("failed");
      onCanContinueChange?.(false);
    } finally {
      setBusy(false);
    }
  }, [busy, emitOutcome, onCanContinueChange, refreshProgress]);

  useEffect(() => {
    void refreshProgress();
  }, [refreshProgress]);

  useEffect(() => {
    if (!autoStart || startedRef.current) return;
    startedRef.current = true;
    void runDemo();
  }, [autoStart, runDemo]);

  useEffect(() => {
    if (!isNativeIos()) return;
    let handle: { remove: () => Promise<void> } | undefined;
    void App.addListener("appStateChange", ({ isActive }) => {
      if (!isActive) {
        if (demoSessionRef.current) sawBackgroundRef.current = true;
        return;
      }
      void evaluateGate();
    }).then((h) => {
      handle = h;
    });
    const poll = window.setInterval(() => {
      if (phase === "ready" || phase === "preparing") void evaluateGate();
    }, 2000);
    return () => {
      window.clearInterval(poll);
      void handle?.remove();
    };
  }, [evaluateGate, phase]);

  const title =
    phase === "preparing"
      ? t("tutorialLaDemoPreparingTitle")
      : phase === "denied"
        ? t("tutorialLaDemoDeniedTitle")
        : phase === "complete"
          ? t("tutorialLaDemoAllowedTitle")
          : t("liveActivityOnboardingTitle");

  const body =
    phase === "preparing"
      ? t("tutorialLaDemoPreparingBody")
      : phase === "denied"
        ? t("tutorialLaDemoDeniedBody")
        : phase === "failed"
          ? t("tutorialLaDemoFailedBody")
          : phase === "complete" || displayOutcome === "allowed"
            ? t("tutorialLaDemoAllowedBody")
            : t("tutorialLaDemoReadyBody");

  const Step = ({
    done,
    label,
    n,
  }: {
    done: boolean;
    label: string;
    n: number;
  }) => (
    <div className="flex items-start gap-2 text-xs">
      <span
        className={cn(
          "mt-0.5 inline-flex w-4 h-4 items-center justify-center rounded-full text-[10px] font-bold shrink-0",
          done
            ? "bg-accent text-accent-foreground"
            : "bg-secondary text-muted-foreground",
        )}
      >
        {done ? "✓" : n}
      </span>
      <span className={cn(done ? "text-foreground" : "text-muted-foreground")}>{label}</span>
    </div>
  );

  return (
    <div className={cn("space-y-3", className)}>
      {showChecklist && (
        <div className="space-y-1.5 rounded-xl bg-secondary/50 px-3 py-2.5">
          <Step n={1} done={progress.systemOn} label={t("liveActivityStepSystem")} />
          <Step n={2} done={progress.demoPresented} label={t("liveActivityStepDemo")} />
          <Step n={3} done={progress.allowed} label={t("liveActivityStepAllow")} />
          <Step n={4} done={progress.complete} label={t("liveActivityStepDone")} />
        </div>
      )}

      <div>
        <p className="text-sm font-semibold mb-1">{title}</p>
        <p className="text-sm leading-relaxed text-foreground/90">{body}</p>
      </div>

      {phase === "preparing" && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="inline-block w-3.5 h-3.5 rounded-full border-2 border-accent border-t-transparent animate-spin" />
          {t("tutorialLaDemoPreparingHint")}
        </div>
      )}

      {phase === "denied" ? (
        <>
          <button
            type="button"
            onClick={() => void openAppSettings()}
            className="w-full rounded-xl bg-accent text-accent-foreground px-4 py-3 text-sm font-semibold"
          >
            {t("liveActivityOpenSettings")}
          </button>
          <button
            type="button"
            onClick={() => {
              setLiveActivityPermissionOutcome("skipped");
              onDeferAfterDeny?.();
            }}
            className="w-full rounded-xl bg-secondary/80 px-4 py-2.5 text-sm font-medium"
          >
            {t("tutorialLaDemoLater")}
          </button>
        </>
      ) : (
        <>
          {(phase === "ready" ||
            phase === "failed" ||
            phase === "idle" ||
            phase === "complete") && (
            <button
              type="button"
              disabled={busy || !progress.systemOn}
              onClick={() => void runDemo()}
              className="w-full rounded-xl bg-accent text-accent-foreground px-4 py-3 text-sm font-semibold disabled:opacity-60"
            >
              {phase === "idle" && !autoStart
                ? t("liveActivityTryDemo")
                : t("tutorialLaDemoShowAgain")}
            </button>
          )}
          {!progress.systemOn && phase !== "denied" && (
            <button
              type="button"
              onClick={() => void openAppSettings()}
              className="w-full rounded-xl bg-secondary/80 px-4 py-2.5 text-sm font-medium"
            >
              {t("liveActivityOpenSettings")}
            </button>
          )}
        </>
      )}
    </div>
  );
}
