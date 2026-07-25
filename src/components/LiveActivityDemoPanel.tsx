import { useCallback, useEffect, useRef, useState } from "react";
import { App } from "@capacitor/app";
import { useI18n } from "@/lib/i18n";
import {
  getLiveActivityEnableProgress,
  getLiveActivityGate,
  isNativeIos,
  markLiveActivityDemoPresented,
  markLiveActivityEnableAllowed,
  markLiveActivityEnableDeferred,
  resetLiveActivityEnableProgress,
  setLiveActivityPermissionOutcome,
  setLiveActivityUserEnabled,
  type LiveActivityEnableProgress,
  type LiveActivityPermissionOutcome,
} from "@/lib/live-activity-prefs";
import { startDemoLiveActivity } from "@/lib/live-activity";
import { openLiveActivitySettings } from "@/lib/notifications";
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
  /** tutorial keeps “後で” + deny copy; settings uses progressive step copy. */
  variant?: "tutorial" | "settings";
  className?: string;
  onOutcome?: (outcome: LiveActivityPermissionOutcome, phase: LaDemoPhase) => void;
  /** True only after Allow confirmed this session (or denied → later). */
  onCanContinueChange?: (can: boolean) => void;
  onProgressChange?: (progress: LiveActivityEnableProgress) => void;
  /** Tutorial: user tapped “後で行う” after deny. */
  onDeferAfterDeny?: () => void;
};

const emptyProgress = (): LiveActivityEnableProgress => ({
  systemOn: false,
  demoPresented: false,
  allowed: false,
  complete: false,
  mode: "full",
  currentStep: 1,
});

/**
 * Lock Screen Live Activity enable flow (tutorial + Settings).
 * Allowed only after: demo started → left app → returned with allow signal.
 */
export function LiveActivityDemoPanel({
  autoStart = false,
  showChecklist = false,
  variant = "tutorial",
  className,
  onOutcome,
  onCanContinueChange,
  onProgressChange,
  onDeferAfterDeny,
}: Props) {
  const { t } = useI18n();
  const isSettings = variant === "settings";
  const [phase, setPhase] = useState<LaDemoPhase>("idle");
  const [busy, setBusy] = useState(false);
  const [displayOutcome, setDisplayOutcome] =
    useState<LiveActivityPermissionOutcome>("unknown");
  const [progress, setProgress] = useState<LiveActivityEnableProgress>(emptyProgress);
  const [flashOnLockScreen, setFlashOnLockScreen] = useState(false);
  const startedRef = useRef(false);
  /** Demo Activity.request succeeded while system LA was on. */
  const demoLiveRef = useRef(false);
  /** When the demo Activity was created (ms). */
  const demoStartedAtRef = useRef(0);
  /** Timestamp when app went inactive after a successful demo (0 = not waiting). */
  const backgroundAfterDemoAtRef = useRef(0);
  /**
   * frequentPushes when demo started. Allow only if it is true after a real
   * Lock Screen stay — and if it was already true, still require that stay
   * (never mark allow from a quick glance / stillLive alone).
   */
  const frequentAtDemoStartRef = useRef(false);
  /** Was system off last evaluate — used to detect Settings toggle without treating it as allow. */
  const wasSystemOffRef = useRef(false);
  const flashTimerRef = useRef<number | null>(null);
  /** Ignore system sheets / quick glance; require a real Lock Screen stay. */
  const MIN_LOCK_SCREEN_BG_MS = 3000;
  /** Activity.request may briefly background for a system sheet — ignore that. */
  const IGNORE_BG_AFTER_DEMO_MS = 1500;

  const clearAllowWatch = useCallback(() => {
    demoLiveRef.current = false;
    demoStartedAtRef.current = 0;
    backgroundAfterDemoAtRef.current = 0;
    frequentAtDemoStartRef.current = false;
  }, []);

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
      if (outcome !== "skipped") {
        // skipped is persisted by markLiveActivityEnableDeferred
        setLiveActivityPermissionOutcome(outcome);
      }
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
      wasSystemOffRef.current = true;
      clearAllowWatch();
      resetLiveActivityEnableProgress();
      if (isSettings) {
        setPhase("idle");
        setDisplayOutcome("denied");
        onCanContinueChange?.(false);
      } else {
        setPhase("denied");
        emitOutcome("denied", "denied");
        onCanContinueChange?.(false);
      }
      await refreshProgress();
      return;
    }

    // System just came back on (e.g. iPhone Settings). That alone is NEVER allow.
    if (wasSystemOffRef.current) {
      wasSystemOffRef.current = false;
      clearAllowWatch();
      if (isSettings && next.mode === "reenable" && next.complete) {
        // Durable demo-done + system on → Settings re-enable complete.
        setPhase("complete");
        emitOutcome("allowed", "complete");
        return;
      }
      // Tutorial / full Settings: require a fresh demo + Always Allow.
      setPhase("idle");
      setDisplayOutcome("unknown");
      onCanContinueChange?.(false);
      return;
    }

    // Settings re-enable path only (already finished demo+allow once).
    if (isSettings && next.mode === "reenable" && next.complete) {
      setPhase("complete");
      emitOutcome("allowed", "complete");
      return;
    }

    // Allow ONLY via iOS “Always Allow” (frequentPushes), after a real Lock Screen
    // stay. Merely seeing the demo card / stillLive must NOT count as allowed.
    if (!demoLiveRef.current || !backgroundAfterDemoAtRef.current) {
      if (phase !== "preparing" && phase !== "denied") {
        setPhase(demoLiveRef.current ? "ready" : phase === "idle" ? "idle" : "ready");
      }
      onCanContinueChange?.(false);
      return;
    }
    const bgMs = Date.now() - backgroundAfterDemoAtRef.current;
    if (bgMs < MIN_LOCK_SCREEN_BG_MS) {
      // System sheet or quick app switch — ignore.
      backgroundAfterDemoAtRef.current = 0;
      setPhase("ready");
      onCanContinueChange?.(false);
      return;
    }

    // frequentPushesEnabled = iOS “Always Allow” / frequent updates.
    // Never treat “card still on Lock Screen” as allow (that was the false positive).
    const alwaysAllow = gate.frequentPushesEnabled;
    const newlyAllowed = alwaysAllow && !frequentAtDemoStartRef.current;
    const alreadyAllowedStay =
      alwaysAllow && frequentAtDemoStartRef.current && bgMs >= MIN_LOCK_SCREEN_BG_MS;
    if (!newlyAllowed && !alreadyAllowedStay) {
      setPhase("ready");
      setDisplayOutcome("unknown");
      backgroundAfterDemoAtRef.current = 0;
      onCanContinueChange?.(false);
      return;
    }
    markLiveActivityEnableAllowed();
    setPhase("complete");
    emitOutcome("allowed", "complete");
    await refreshProgress();
  }, [clearAllowWatch, emitOutcome, isSettings, onCanContinueChange, phase, refreshProgress]);

  const runDemo = useCallback(async (opts?: { fromRetryButton?: boolean }) => {
    if (busy) return;
    setBusy(true);
    setPhase("preparing");
    setDisplayOutcome("unknown");
    setFlashOnLockScreen(false);
    if (flashTimerRef.current) {
      window.clearTimeout(flashTimerRef.current);
      flashTimerRef.current = null;
    }
    clearAllowWatch();
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
        wasSystemOffRef.current = true;
        resetLiveActivityEnableProgress();
        if (isSettings) {
          setPhase("idle");
          setDisplayOutcome("denied");
        } else {
          setPhase("denied");
          emitOutcome("denied", "denied");
        }
        return;
      }
      frequentAtDemoStartRef.current = !!gate.frequentPushesEnabled;
      const result = await startDemoLiveActivity({ durationMs: 90_000 });
      if (!result.ok) {
        if (!result.systemEnabled) {
          wasSystemOffRef.current = true;
          clearAllowWatch();
          resetLiveActivityEnableProgress();
          if (isSettings) {
            setPhase("idle");
            setDisplayOutcome("denied");
          } else {
            setPhase("denied");
            emitOutcome("denied", "denied");
          }
        } else {
          setPhase("failed");
          onCanContinueChange?.(false);
        }
        return;
      }
      // Only a successful demo while system is on can later become "allowed".
      demoLiveRef.current = true;
      demoStartedAtRef.current = Date.now();
      backgroundAfterDemoAtRef.current = 0;
      markLiveActivityDemoPresented();
      setPhase("ready");
      setDisplayOutcome("unknown");
      onCanContinueChange?.(false);
      await refreshProgress();
      // After “Show again”, briefly confirm the Lock Screen card appeared.
      if (opts?.fromRetryButton) {
        setFlashOnLockScreen(true);
        flashTimerRef.current = window.setTimeout(() => {
          setFlashOnLockScreen(false);
          flashTimerRef.current = null;
        }, 2000);
      }
    } catch {
      setPhase("failed");
      onCanContinueChange?.(false);
    } finally {
      setBusy(false);
    }
  }, [busy, clearAllowWatch, emitOutcome, isSettings, onCanContinueChange, refreshProgress]);

  useEffect(() => {
    return () => {
      if (flashTimerRef.current) window.clearTimeout(flashTimerRef.current);
    };
  }, []);

  useEffect(() => {
    void refreshProgress().then(({ next }) => {
      if (isSettings && next.complete) {
        setPhase("complete");
      }
    });
  }, [isSettings, refreshProgress]);

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
        // Only count background after a successful demo (not Settings while denied).
        // Skip the Activity.request system-sheet blip right after demo start.
        if (
          demoLiveRef.current &&
          !backgroundAfterDemoAtRef.current &&
          demoStartedAtRef.current > 0 &&
          Date.now() - demoStartedAtRef.current >= IGNORE_BG_AFTER_DEMO_MS
        ) {
          backgroundAfterDemoAtRef.current = Date.now();
        }
        return;
      }
      void evaluateGate();
    }).then((h) => {
      handle = h;
    });
    // Do not poll-allow while foreground — Always Allow is decided after Lock Screen return.
    const poll = window.setInterval(() => {
      if (isSettings && phase !== "preparing") void refreshProgress();
    }, 2000);
    return () => {
      window.clearInterval(poll);
      void handle?.remove();
    };
  }, [evaluateGate, isSettings, phase, refreshProgress]);

  const Step = ({
    done,
    label,
    n,
    active,
  }: {
    done: boolean;
    label: string;
    n: number;
    active?: boolean;
  }) => (
    <div className="flex items-start gap-2 text-xs">
      <span
        className={cn(
          "mt-0.5 inline-flex w-4 h-4 items-center justify-center rounded-full text-[10px] font-bold shrink-0",
          done
            ? "bg-accent text-accent-foreground"
            : active
              ? "bg-accent/20 text-accent ring-1 ring-accent/40"
              : "bg-secondary text-muted-foreground",
        )}
      >
        {done ? "✓" : n}
      </span>
      <span
        className={cn(
          done ? "text-foreground" : active ? "text-foreground font-medium" : "text-muted-foreground",
        )}
      >
        {label}
      </span>
    </div>
  );

  // ── Settings: always show 4-step checklist (full + reenable + complete) ─
  if (isSettings) {
    const isReenable = progress.mode === "reenable";
    const step = progress.currentStep;
    const stepDone = {
      1: progress.systemOn,
      2: progress.demoPresented,
      3: progress.allowed,
      4: progress.complete,
    };

    let title = t("settingsLaStep1Title");
    let body = t("settingsLaStep1Body");
    if (progress.complete || phase === "complete") {
      title = t("settingsLaStep4Title");
      body = t("settingsLaStep4Body");
    } else if (isReenable && !progress.systemOn) {
      title = t("settingsLaReenableTitle");
      body = t("settingsLaReenableBody");
    } else if (phase === "preparing") {
      title = t("tutorialLaDemoPreparingTitle");
      body = t("tutorialLaDemoPreparingBody");
    } else if (phase === "failed") {
      title = t("liveActivityOnboardingTitle");
      body = t("tutorialLaDemoFailedBody");
    } else if (step === 2) {
      title = t("settingsLaStep2Title");
      body = t("settingsLaStep2Body");
    } else if (step === 3) {
      title = t("settingsLaStep3Title");
      body = t("settingsLaStep3Body");
    } else if (step === 4) {
      title = t("settingsLaStep4Title");
      body = t("settingsLaStep4Body");
    }

    return (
      <div className={cn("space-y-3", className)}>
        {showChecklist && (
          <div className="space-y-1.5 rounded-xl bg-secondary/50 px-3 py-2.5">
            <Step
              n={1}
              done={stepDone[1]}
              active={!progress.complete && step === 1}
              label={t("liveActivityStepSystem")}
            />
            <Step
              n={2}
              done={stepDone[2]}
              active={!progress.complete && !isReenable && step === 2}
              label={t("liveActivityStepDemo")}
            />
            <Step
              n={3}
              done={stepDone[3]}
              active={!progress.complete && !isReenable && step === 3}
              label={t("liveActivityStepAllow")}
            />
            <Step
              n={4}
              done={stepDone[4]}
              active={!progress.complete && step === 4}
              label={t("liveActivityStepDone")}
            />
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

        {!progress.complete && step === 1 && (
          <button
            type="button"
            onClick={() => void openLiveActivitySettings()}
            className="w-full rounded-xl bg-accent text-accent-foreground px-4 py-3 text-sm font-semibold"
          >
            {t("liveActivityOpenLaSettings")}
          </button>
        )}

        {!progress.complete &&
          !isReenable &&
          (step === 2 || step === 3) &&
          phase !== "preparing" && (
          <button
            type="button"
            disabled={busy || !progress.systemOn || flashOnLockScreen}
            onClick={() => void runDemo({ fromRetryButton: step === 3 || phase === "ready" })}
            className="w-full rounded-xl bg-accent text-accent-foreground px-4 py-3 text-sm font-semibold disabled:opacity-60"
          >
            {flashOnLockScreen
              ? t("tutorialLaDemoOnLockScreen")
              : step === 2 && phase === "idle"
                ? t("liveActivityTryDemo")
                : t("tutorialLaDemoShowAgain")}
          </button>
        )}
      </div>
    );
  }

  // ── Tutorial (unchanged copy / Later button) ───────────────────────
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
            onClick={() => void openLiveActivitySettings()}
            className="w-full rounded-xl bg-accent text-accent-foreground px-4 py-3 text-sm font-semibold"
          >
            {t("liveActivityOpenLaSettings")}
          </button>
          <button
            type="button"
            onClick={() => {
              clearAllowWatch();
              markLiveActivityEnableDeferred();
              emitOutcome("skipped", "denied");
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
              disabled={busy || !progress.systemOn || flashOnLockScreen}
              onClick={() => void runDemo({ fromRetryButton: true })}
              className="w-full rounded-xl bg-accent text-accent-foreground px-4 py-3 text-sm font-semibold disabled:opacity-60"
            >
              {flashOnLockScreen
                ? t("tutorialLaDemoOnLockScreen")
                : phase === "idle" && !autoStart
                  ? t("liveActivityTryDemo")
                  : t("tutorialLaDemoShowAgain")}
            </button>
          )}
          {!progress.systemOn && phase !== "denied" && (
            <button
              type="button"
              onClick={() => void openLiveActivitySettings()}
              className="w-full rounded-xl bg-secondary/80 px-4 py-2.5 text-sm font-medium"
            >
              {t("liveActivityOpenLaSettings")}
            </button>
          )}
        </>
      )}
    </div>
  );
}
