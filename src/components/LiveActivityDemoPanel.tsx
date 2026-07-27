import { useCallback, useEffect, useRef, useState } from "react";
import { Check } from "lucide-react";
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
  | "offer"
  | "idle"
  | "preparing"
  | "ready"
  | "denied"
  | "failed"
  | "forceEnded"
  | "complete";

type Props = {
  /** Show the 4-step checklist (Settings). */
  showChecklist?: boolean;
  /** tutorial = opt-in + Next outside; settings = progressive steps. */
  variant?: "tutorial" | "settings";
  className?: string;
  onOutcome?: (outcome: LiveActivityPermissionOutcome, phase: LaDemoPhase) => void;
  /** Tutorial: whether parent “Next” should be enabled. */
  onCanContinueChange?: (can: boolean) => void;
  onProgressChange?: (progress: LiveActivityEnableProgress) => void;
  /** Tutorial: user skipped the demo (“Later” on offer, or after force-end Next). */
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

const MAX_DENIES = 2;

/**
 * Lock Screen Live Activity enable flow (tutorial + Settings).
 * Always Allow is no longer required — success = demo started while system LA is on.
 * Two consecutive denials (system LA turned off) end the re-show option.
 */
export function LiveActivityDemoPanel({
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
  const [phase, setPhase] = useState<LaDemoPhase>(isSettings ? "idle" : "offer");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<LiveActivityEnableProgress>(emptyProgress);
  const [flashOnLockScreen, setFlashOnLockScreen] = useState(false);
  const [denyCount, setDenyCount] = useState(0);
  const denyCountRef = useRef(0);
  const flashTimerRef = useRef<number | null>(null);
  /** True after a successful demo start while system LA was on. */
  const demoSucceededRef = useRef(false);

  const refreshProgress = useCallback(async () => {
    const gate = await getLiveActivityGate();
    const next = getLiveActivityEnableProgress(gate);
    setProgress(next);
    onProgressChange?.(next);
    return { gate, next };
  }, [onProgressChange]);

  const emitOutcome = useCallback(
    (outcome: LiveActivityPermissionOutcome, next: LaDemoPhase) => {
      if (outcome !== "skipped") {
        setLiveActivityPermissionOutcome(outcome);
      }
      onOutcome?.(outcome, next);
    },
    [onOutcome],
  );

  const bumpDeny = useCallback(() => {
    const n = denyCountRef.current + 1;
    denyCountRef.current = n;
    setDenyCount(n);
    return n;
  }, []);

  const handleDenied = useCallback(
    async (opts?: { fromDemoStart?: boolean }) => {
      demoSucceededRef.current = false;
      resetLiveActivityEnableProgress();
      const n = bumpDeny();
      await refreshProgress();

      if (n >= MAX_DENIES) {
        setPhase("forceEnded");
        onCanContinueChange?.(true);
        emitOutcome("denied", "forceEnded");
        return;
      }

      setPhase("denied");
      // Tutorial: Next stays available. Settings: continue only when system is on.
      onCanContinueChange?.(true);
      if (opts?.fromDemoStart) {
        emitOutcome("denied", "denied");
      }
    },
    [bumpDeny, emitOutcome, onCanContinueChange, refreshProgress],
  );

  const runDemo = useCallback(
    async (opts?: { fromRetryButton?: boolean }) => {
      if (busy) return;
      if (denyCountRef.current >= MAX_DENIES) {
        setPhase("forceEnded");
        onCanContinueChange?.(true);
        return;
      }

      setBusy(true);
      setPhase("preparing");
      setFlashOnLockScreen(false);
      if (flashTimerRef.current) {
        window.clearTimeout(flashTimerRef.current);
        flashTimerRef.current = null;
      }
      // While preparing, keep Next available in tutorial (no allow gate).
      if (!isSettings) onCanContinueChange?.(true);

      try {
        if (!isNativeIos()) {
          markLiveActivityDemoPresented();
          markLiveActivityEnableAllowed();
          demoSucceededRef.current = true;
          setPhase("complete");
          emitOutcome("allowed", "complete");
          onCanContinueChange?.(true);
          await refreshProgress();
          return;
        }

        setLiveActivityUserEnabled(true);
        const gate = await getLiveActivityGate();
        if (!gate.systemEnabled) {
          await handleDenied({ fromDemoStart: true });
          return;
        }

        const result = await startDemoLiveActivity({ durationMs: 90_000 });
        if (!result.ok) {
          if (!result.systemEnabled) {
            await handleDenied({ fromDemoStart: true });
          } else {
            setPhase("failed");
            onCanContinueChange?.(true);
          }
          return;
        }

        // Re-check: user may have denied during Activity.request.
        const after = await getLiveActivityGate();
        if (!after.systemEnabled) {
          await handleDenied({ fromDemoStart: true });
          return;
        }

        demoSucceededRef.current = true;
        markLiveActivityDemoPresented();
        setPhase("ready");
        emitOutcome("allowed", "ready");
        onCanContinueChange?.(true);
        await refreshProgress();

        if (opts?.fromRetryButton) {
          setFlashOnLockScreen(true);
          flashTimerRef.current = window.setTimeout(() => {
            setFlashOnLockScreen(false);
            flashTimerRef.current = null;
          }, 1000);
        }
      } catch {
        setPhase("failed");
        onCanContinueChange?.(true);
      } finally {
        setBusy(false);
      }
    },
    [
      busy,
      emitOutcome,
      handleDenied,
      isSettings,
      onCanContinueChange,
      refreshProgress,
    ],
  );

  const finishSettingsEnable = useCallback(async () => {
    const gate = await getLiveActivityGate();
    if (!gate.systemEnabled) {
      await handleDenied();
      return;
    }
    markLiveActivityEnableAllowed();
    setPhase("complete");
    emitOutcome("allowed", "complete");
    await refreshProgress();
  }, [emitOutcome, handleDenied, refreshProgress]);

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
    // Only hide Next on the initial offer screen — do not re-arm this when
    // parent re-creates callbacks (that was wiping Next after a successful demo).
  }, [isSettings, refreshProgress]);

  useEffect(() => {
    if (isSettings) return;
    if (phase === "offer") onCanContinueChange?.(false);
    else if (
      phase === "preparing" ||
      phase === "ready" ||
      phase === "denied" ||
      phase === "forceEnded" ||
      phase === "failed" ||
      phase === "complete"
    ) {
      onCanContinueChange?.(true);
    }
  }, [isSettings, onCanContinueChange, phase]);

  useEffect(() => {
    if (!isNativeIos()) return;
    let handle: { remove: () => Promise<void> } | undefined;
    void App.addListener("appStateChange", ({ isActive }) => {
      if (!isActive) return;
      void (async () => {
        const { gate, next } = await refreshProgress();
        if (isSettings && next.mode === "reenable" && next.complete) {
          setPhase("complete");
          emitOutcome("allowed", "complete");
          return;
        }
        if (!gate.systemEnabled) {
          // Turning LA off in Settings mid-flow — count as a deny only if we
          // already had a live demo this session (user rejected / disabled).
          if (demoSucceededRef.current || phase === "ready" || phase === "preparing") {
            demoSucceededRef.current = false;
            if (phase !== "forceEnded" && denyCountRef.current < MAX_DENIES) {
              await handleDenied();
            } else if (denyCountRef.current >= MAX_DENIES) {
              setPhase("forceEnded");
              onCanContinueChange?.(true);
            }
          }
          return;
        }
        // System came back on after a deny — return to a state where demo can run.
        if (phase === "denied") {
          setPhase(isSettings ? "idle" : "ready");
        }
      })();
    }).then((h) => {
      handle = h;
    });
    const poll = window.setInterval(() => {
      if (isSettings && phase !== "preparing") void refreshProgress();
    }, 2000);
    return () => {
      window.clearInterval(poll);
      void handle?.remove();
    };
  }, [
    emitOutcome,
    handleDenied,
    isSettings,
    onCanContinueChange,
    phase,
    refreshProgress,
  ]);

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

  const DemoFlashConfirm = () => (
    <div
      role="status"
      className="flex w-full items-center justify-center gap-2 rounded-xl bg-accent px-4 py-3 text-sm font-semibold text-accent-foreground animate-fade-in-up"
    >
      <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-accent-foreground/15 animate-check-pop">
        <Check className="h-3.5 w-3.5" strokeWidth={3} />
      </span>
      <span>{t("tutorialLaDemoOnLockScreen")}</span>
    </div>
  );

  const canShowAgain = denyCount < MAX_DENIES && phase !== "forceEnded";

  // ── Settings ───────────────────────────────────────────────────────
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
    } else if (phase === "forceEnded") {
      title = t("tutorialLaDemoForceEndedTitle");
      body = t("tutorialLaDemoForceEndedBody");
    } else if (isReenable && !progress.systemOn) {
      title = t("settingsLaReenableTitle");
      body = t("settingsLaReenableBody");
    } else if (phase === "preparing") {
      title = t("tutorialLaDemoPreparingTitle");
      body = t("tutorialLaDemoPreparingBody");
    } else if (phase === "failed") {
      title = t("liveActivityOnboardingTitle");
      body = t("tutorialLaDemoFailedBody");
    } else if (phase === "denied") {
      title = t("tutorialLaDemoDeniedTitle");
      body = t("tutorialLaDemoDeniedRetryBody");
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

    const showDemoButton =
      !progress.complete &&
      !isReenable &&
      phase !== "preparing" &&
      phase !== "forceEnded" &&
      (step === 2 || step === 3 || phase === "denied" || phase === "failed" || phase === "ready");

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

        {phase === "denied" && denyCount < MAX_DENIES && (
          <button
            type="button"
            onClick={() => void openLiveActivitySettings()}
            className="w-full rounded-xl bg-secondary/80 px-4 py-2.5 text-sm font-medium"
          >
            {t("liveActivityOpenLaSettings")}
          </button>
        )}

        {showDemoButton &&
          canShowAgain &&
          (flashOnLockScreen ? (
            <DemoFlashConfirm />
          ) : (
            <button
              type="button"
              disabled={busy || (!progress.systemOn && phase !== "denied")}
              onClick={() =>
                void runDemo({
                  fromRetryButton: step === 3 || phase === "ready" || phase === "denied",
                })
              }
              className="w-full rounded-xl bg-accent text-accent-foreground px-4 py-3 text-sm font-semibold disabled:opacity-60"
            >
              {step === 2 && phase === "idle"
                ? t("liveActivityTryDemo")
                : t("tutorialLaDemoShowAgain")}
            </button>
          ))}

        {/* Step 3 continue: enabled when system LA is on after a demo. */}
        {!progress.complete &&
          !isReenable &&
          progress.demoPresented &&
          phase !== "preparing" &&
          phase !== "forceEnded" && (
            <button
              type="button"
              disabled={!progress.systemOn || busy}
              onClick={() => void finishSettingsEnable()}
              className="w-full rounded-xl bg-accent text-accent-foreground px-4 py-3 text-sm font-semibold disabled:opacity-40"
            >
              {t("tutorialLaDemoNext")}
            </button>
          )}
      </div>
    );
  }

  // ── Tutorial ───────────────────────────────────────────────────────
  if (phase === "offer") {
    return (
      <div className={cn("space-y-3", className)}>
        <div>
          <p className="text-sm font-semibold mb-1">{t("tutorialLaDemoOfferTitle")}</p>
          <p className="text-sm leading-relaxed text-foreground/90">
            {t("tutorialLaDemoOfferBody")}
          </p>
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={() => void runDemo()}
          className="w-full rounded-xl bg-accent text-accent-foreground px-4 py-3 text-sm font-semibold disabled:opacity-60"
        >
          {t("tutorialLaDemoStart")}
        </button>
        <button
          type="button"
          onClick={() => {
            markLiveActivityEnableDeferred();
            emitOutcome("skipped", "offer");
            onDeferAfterDeny?.();
          }}
          className="w-full rounded-xl bg-secondary/80 px-4 py-2.5 text-sm font-medium"
        >
          {t("tutorialLaDemoLater")}
        </button>
      </div>
    );
  }

  const title =
    phase === "preparing"
      ? t("tutorialLaDemoPreparingTitle")
      : phase === "forceEnded"
        ? t("tutorialLaDemoForceEndedTitle")
        : phase === "denied"
          ? t("tutorialLaDemoDeniedTitle")
          : phase === "complete"
            ? t("tutorialLaDemoAllowedTitle")
            : t("liveActivityOnboardingTitle");

  const body =
    phase === "preparing"
      ? t("tutorialLaDemoPreparingBody")
      : phase === "forceEnded"
        ? t("tutorialLaDemoForceEndedBody")
        : phase === "denied"
          ? t("tutorialLaDemoDeniedRetryBody")
          : phase === "failed"
            ? t("tutorialLaDemoFailedBody")
            : t("tutorialLaDemoReadyBody");

  return (
    <div className={cn("space-y-3", className)}>
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

      {phase === "denied" && canShowAgain && (
        <button
          type="button"
          onClick={() => void openLiveActivitySettings()}
          className="w-full rounded-xl bg-secondary/80 px-4 py-2.5 text-sm font-medium"
        >
          {t("liveActivityOpenLaSettings")}
        </button>
      )}

      {phase !== "preparing" &&
        phase !== "forceEnded" &&
        canShowAgain &&
        (flashOnLockScreen ? (
          <DemoFlashConfirm />
        ) : (
          <button
            type="button"
            disabled={busy || (!progress.systemOn && phase !== "denied" && phase !== "failed")}
            onClick={() => void runDemo({ fromRetryButton: phase !== "idle" })}
            className="w-full rounded-xl bg-accent text-accent-foreground px-4 py-3 text-sm font-semibold disabled:opacity-60"
          >
            {phase === "idle" ? t("liveActivityTryDemo") : t("tutorialLaDemoShowAgain")}
          </button>
        ))}
    </div>
  );
}
