import { useCallback, useEffect, useRef, useState } from "react";
import { App } from "@capacitor/app";
import { useI18n } from "@/lib/i18n";
import {
  getLiveActivityGate,
  isNativeIos,
  setLiveActivityPermissionOutcome,
  setLiveActivityUserEnabled,
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
  | "failed";

type Props = {
  /** Auto-start demo when mounted */
  autoStart?: boolean;
  className?: string;
  onOutcome?: (outcome: LiveActivityPermissionOutcome, phase: LaDemoPhase) => void;
  /** Called when user can continue (allowed or denied acknowledged) */
  onCanContinueChange?: (can: boolean) => void;
};

/**
 * Shared Lock Screen Live Activity permission demo (tutorial + Settings).
 * Gates “continue” until Always Allow / denial is observed after a Lock Screen visit.
 */
export function LiveActivityDemoPanel({
  autoStart = false,
  className,
  onOutcome,
  onCanContinueChange,
}: Props) {
  const { t } = useI18n();
  const [phase, setPhase] = useState<LaDemoPhase>("idle");
  const [busy, setBusy] = useState(false);
  const startedRef = useRef(false);
  const sawBackgroundRef = useRef(false);
  const outcomeRef = useRef<LiveActivityPermissionOutcome>("unknown");

  const emitOutcome = useCallback(
    (outcome: LiveActivityPermissionOutcome, next: LaDemoPhase) => {
      outcomeRef.current = outcome;
      setLiveActivityPermissionOutcome(outcome);
      onOutcome?.(outcome, next);
      const canContinue =
        outcome === "allowed" || outcome === "denied" || outcome === "skipped";
      onCanContinueChange?.(canContinue);
    },
    [onOutcome, onCanContinueChange],
  );

  const evaluateGate = useCallback(async () => {
    if (!isNativeIos()) {
      setPhase("ready");
      emitOutcome("allowed", "ready");
      return;
    }
    const gate = await getLiveActivityGate();
    const local = getLiveActivityLocalStatus();

    if (!gate.systemEnabled) {
      setPhase("denied");
      emitOutcome("denied", "denied");
      return;
    }

    // “Always Allow” / frequent pushes — strongest signal.
    if (gate.frequentPushesEnabled) {
      setPhase("ready");
      emitOutcome("allowed", "ready");
      return;
    }

    // Returned from Lock Screen with a live card still running → treat as allowed.
    if (sawBackgroundRef.current && (gate.activityCount > 0 || local.activeCount > 0)) {
      setPhase("ready");
      emitOutcome("allowed", "ready");
      return;
    }

    // Demo vanished after leaving without a decision → stay ready but not continue.
    if (sawBackgroundRef.current && gate.activityCount === 0 && local.activeCount === 0) {
      setPhase("ready");
      onCanContinueChange?.(false);
      return;
    }

    setPhase("ready");
    onCanContinueChange?.(false);
  }, [emitOutcome, onCanContinueChange]);

  const runDemo = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setPhase("preparing");
    sawBackgroundRef.current = false;
    onCanContinueChange?.(false);
    try {
      if (!isNativeIos()) {
        setPhase("ready");
        emitOutcome("allowed", "ready");
        return;
      }
      setLiveActivityUserEnabled(true);
      const gate = await getLiveActivityGate();
      if (!gate.systemEnabled) {
        setPhase("denied");
        emitOutcome("denied", "denied");
        return;
      }
      const result = await startDemoLiveActivity({ durationMs: 90_000 });
      if (!result.ok) {
        if (!result.systemEnabled) {
          setPhase("denied");
          emitOutcome("denied", "denied");
        } else {
          setPhase("failed");
          onCanContinueChange?.(false);
        }
        return;
      }
      setPhase("ready");
      // Wait until user visits Lock Screen / answers the system sheet.
      await evaluateGate();
    } catch {
      setPhase("failed");
      onCanContinueChange?.(false);
    } finally {
      setBusy(false);
    }
  }, [busy, emitOutcome, evaluateGate, onCanContinueChange]);

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
        sawBackgroundRef.current = true;
        return;
      }
      void evaluateGate();
    }).then((h) => {
      handle = h;
    });
    const poll = window.setInterval(() => {
      if (phase === "ready" || phase === "preparing") void evaluateGate();
    }, 1500);
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
        : t("liveActivityOnboardingTitle");

  const body =
    phase === "preparing"
      ? t("tutorialLaDemoPreparingBody")
      : phase === "denied"
        ? t("tutorialLaDemoDeniedBody")
        : phase === "failed"
          ? t("tutorialLaDemoFailedBody")
          : outcomeRef.current === "allowed"
            ? t("tutorialLaDemoAllowedBody")
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

      {phase === "denied" && (
        <button
          type="button"
          onClick={() => void openAppSettings()}
          className="w-full rounded-xl bg-secondary/80 px-4 py-2.5 text-sm font-medium"
        >
          {t("liveActivityOpenSettings")}
        </button>
      )}

      {(phase === "ready" || phase === "failed" || phase === "denied") && (
        <button
          type="button"
          disabled={busy}
          onClick={() => void runDemo()}
          className="w-full rounded-xl bg-accent text-accent-foreground px-4 py-3 text-sm font-semibold disabled:opacity-60"
        >
          {t("tutorialLaDemoShowAgain")}
        </button>
      )}

      {phase === "idle" && (
        <button
          type="button"
          disabled={busy}
          onClick={() => void runDemo()}
          className="w-full rounded-xl bg-accent text-accent-foreground px-4 py-3 text-sm font-semibold disabled:opacity-60"
        >
          {t("liveActivityTryDemo")}
        </button>
      )}
    </div>
  );
}
