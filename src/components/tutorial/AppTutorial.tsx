import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { CoachOverlay } from "@/components/tutorial/CoachOverlay";
import { useI18n, type TranslationKeys } from "@/lib/i18n";
import {
  ensurePermission,
  isNative,
  openAppSettings,
} from "@/lib/notifications";
import {
  getLiveActivityGate,
  isNativeIos,
  setLiveActivityOnboardingDone,
  setLiveActivityUserEnabled,
} from "@/lib/live-activity-prefs";
import { startDemoLiveActivity } from "@/lib/live-activity";
import {
  clearTutorialScratchData,
  getSavedTutorialStepIndex,
  hasTutorialBootstrapStarted,
  isTutorialDone,
  markTutorialBootstrapStarted,
  saveTutorialStepIndex,
  setTutorialActiveFlag,
  setTutorialDone,
  setTutorialInProgress,
  setTutorialStepFlag,
  subscribeTutorial,
  TUTORIAL_STEPS,
  type TutorialStep,
} from "@/lib/tutorial";

/**
 * First-run coach-mark tour. Starts after notification permission.
 * Progress is persisted so route changes / remounts do not reset to welcome.
 */
export function AppTutorial() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const location = useLocation();
  const [running, setRunning] = useState(false);
  const [index, setIndex] = useState(0);
  const [laBusy, setLaBusy] = useState(false);
  const [laDemoReady, setLaDemoReady] = useState(false);
  const [laDemoFailed, setLaDemoFailed] = useState(false);
  const advancingRef = useRef(false);
  const laAutoStartedRef = useRef(false);

  const step: TutorialStep | null = running ? TUTORIAL_STEPS[index] ?? null : null;

  const finish = useCallback(() => {
    setTutorialDone(true);
    setLiveActivityOnboardingDone(true);
    setTutorialActiveFlag(false);
    setTutorialInProgress(false);
    setTutorialStepFlag(null);
    setRunning(false);
    advancingRef.current = false;
    navigate("/", { replace: true });
  }, [navigate]);

  const goNext = useCallback(() => {
    if (advancingRef.current) return;
    advancingRef.current = true;
    setIndex((i) => {
      if (i >= TUTORIAL_STEPS.length - 1) {
        queueMicrotask(finish);
        return i;
      }
      const next = i + 1;
      saveTutorialStepIndex(next);
      queueMicrotask(() => {
        advancingRef.current = false;
      });
      return next;
    });
  }, [finish]);

  useEffect(() => {
    if (!isNative()) return;
    if (isTutorialDone()) return;

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      if (cancelled || isTutorialDone()) return;

      if (hasTutorialBootstrapStarted()) {
        const saved = getSavedTutorialStepIndex();
        setIndex(saved);
        setTutorialActiveFlag(true);
        setTutorialInProgress(true);
        advancingRef.current = false;
        setRunning(true);
        return;
      }

      markTutorialBootstrapStarted();
      try {
        await ensurePermission();
      } catch {
        /* continue */
      }
      if (cancelled || isTutorialDone()) return;

      clearTutorialScratchData();
      saveTutorialStepIndex(0);
      setTutorialInProgress(true);
      setTutorialActiveFlag(true);
      advancingRef.current = false;
      setIndex(0);
      setRunning(true);
      navigate("/", { replace: true });
    }, 700);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!running || !step) {
      setTutorialStepFlag(null);
      return;
    }
    setTutorialStepFlag(step.id);
  }, [running, step?.id]);

  useEffect(() => {
    if (!running || !step?.route) return;
    if (location.pathname === step.route) return;
    navigate(step.route);
  }, [running, step?.id, step?.route, location.pathname, navigate]);

  useEffect(() => {
    if (!running || !step || step.advance !== "event" || !step.event) return;
    const want = step.event;
    advancingRef.current = false;
    return subscribeTutorial((name) => {
      if (name !== want) return;
      // Let the checkbox animation / selection paint before advancing.
      if (want === "task-toggled") {
        window.setTimeout(() => goNext(), 450);
      } else {
        goNext();
      }
    });
  }, [running, step?.id, step?.advance, step?.event, goNext]);

  useEffect(() => {
    if (!running || !step || step.advance !== "event" || !step.target) return;
    const timer = window.setTimeout(() => {
      const el = document.querySelector(`[data-tutorial="${step.target}"]`);
      if (!el) goNext();
    }, 12000);
    return () => window.clearTimeout(timer);
  }, [running, step?.id, step?.advance, step?.target, goNext]);

  const runLaDemo = useCallback(async () => {
    if (laBusy) return;
    setLaBusy(true);
    setLaDemoFailed(false);
    try {
      if (!isNativeIos()) {
        setLaDemoReady(true);
        return;
      }
      setLiveActivityUserEnabled(true);
      const gate = await getLiveActivityGate();
      if (!gate.systemEnabled) {
        await openAppSettings();
        setLaDemoFailed(true);
        return;
      }
      const result = await startDemoLiveActivity({ durationMs: 60_000 });
      if (!result.ok) {
        setLaDemoFailed(true);
        return;
      }
      setLaDemoReady(true);
    } catch {
      setLaDemoFailed(true);
    } finally {
      setLaBusy(false);
    }
  }, [laBusy]);

  // Auto-start the Lock Screen demo when entering the laDemo step.
  useEffect(() => {
    if (!running || step?.id !== "laDemo") {
      laAutoStartedRef.current = false;
      setLaDemoReady(false);
      setLaDemoFailed(false);
      return;
    }
    if (laAutoStartedRef.current) return;
    laAutoStartedRef.current = true;
    void runLaDemo();
  }, [running, step?.id, runLaDemo]);

  const overlay = useMemo(() => {
    if (!step) return null;
    const title = step.titleKey ? t(step.titleKey as TranslationKeys) : undefined;
    const isTap = step.advance === "tap";
    const isEvent = step.advance === "event";
    const isAction = step.advance === "action";

    let body = t(step.bodyKey as TranslationKeys);
    if (step.id === "laDemo" && laDemoReady) {
      body = t("tutorialLaDemoStarted");
    }

    let hint: string | undefined;
    if (isTap) hint = t("tutorialTapHint");
    if (isEvent) hint = t("tutorialActionHint");

    const actions =
      isAction && step.id === "laDemo" ? (
        <>
          {laDemoReady ? (
            <button
              type="button"
              onClick={() => goNext()}
              className="w-full rounded-xl bg-accent text-accent-foreground px-4 py-3 text-sm font-semibold"
            >
              {t("tutorialLaDemoNext")}
            </button>
          ) : (
            <button
              type="button"
              disabled={laBusy}
              onClick={() => void runLaDemo()}
              className="w-full rounded-xl bg-accent text-accent-foreground px-4 py-3 text-sm font-semibold disabled:opacity-60"
            >
              {laDemoFailed ? t("tutorialLaDemoRetry") : t("liveActivityTryDemo")}
            </button>
          )}
          <button
            type="button"
            disabled={laBusy}
            onClick={() => {
              setLiveActivityOnboardingDone(true);
              goNext();
            }}
            className="w-full rounded-xl bg-secondary/80 px-4 py-2.5 text-sm font-medium"
          >
            {t("liveActivityOnboardingLater")}
          </button>
        </>
      ) : null;

    return (
      <CoachOverlay
        key={step.id}
        targetSelector={step.target ? `[data-tutorial="${step.target}"]` : null}
        captureOutsideClick={isTap}
        allowThrough={isEvent}
        bubblePlacement={step.preferBubble}
        title={title}
        body={body}
        hint={isAction ? undefined : hint}
        actions={actions}
        onOutsideTap={isTap ? goNext : undefined}
      />
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, t, laBusy, laDemoReady, laDemoFailed, goNext, runLaDemo]);

  if (!running || !step) return null;
  return overlay;
}
