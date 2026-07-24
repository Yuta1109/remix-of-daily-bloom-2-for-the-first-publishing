import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { CoachOverlay } from "@/components/tutorial/CoachOverlay";
import { LiveActivityDemoPanel } from "@/components/LiveActivityDemoPanel";
import { useI18n, type TranslationKeys } from "@/lib/i18n";
import { ensurePermission, isNative } from "@/lib/notifications";
import { setLiveActivityOnboardingDone } from "@/lib/live-activity-prefs";
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
  const [laAllowed, setLaAllowed] = useState(false);
  const advancingRef = useRef(false);

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

  useEffect(() => {
    if (step?.id !== "laDemo") setLaAllowed(false);
  }, [step?.id]);

  const overlay = useMemo(() => {
    if (!step) return null;
    const isTap = step.advance === "tap";
    const isEvent = step.advance === "event";
    const isAction = step.advance === "action";
    const isBookend = step.id === "welcome" || step.id === "done";

    if (step.id === "laDemo") {
      return (
        <CoachOverlay
          key={step.id}
          targetSelector={null}
          captureOutsideClick={false}
          allowThrough={false}
          bubblePlacement="center"
          title={undefined}
          body=""
          actions={
            <>
              <LiveActivityDemoPanel
                autoStart
                showChecklist={false}
                onOutcome={(outcome) => {
                  setLaAllowed(outcome === "allowed");
                }}
                onCanContinueChange={(can) => {
                  if (can) setLaAllowed(true);
                }}
                onDeferAfterDeny={() => {
                  setLiveActivityOnboardingDone(true);
                  goNext();
                }}
              />
              <button
                type="button"
                disabled={!laAllowed}
                onClick={() => {
                  setLiveActivityOnboardingDone(true);
                  goNext();
                }}
                className="w-full rounded-xl bg-accent text-accent-foreground px-4 py-3 text-sm font-semibold disabled:opacity-40"
              >
                {t("tutorialLaDemoNext")}
              </button>
            </>
          }
        />
      );
    }

    const title = step.titleKey ? t(step.titleKey as TranslationKeys) : undefined;
    const body = t(step.bodyKey as TranslationKeys);
    let hint: string | undefined;
    if (isTap) hint = t("tutorialTapHint");
    if (isEvent) hint = t("tutorialActionHint");

    return (
      <CoachOverlay
        key={`${step.id}-${isBookend ? "bookend" : "step"}`}
        targetSelector={step.target ? `[data-tutorial="${step.target}"]` : null}
        captureOutsideClick={isTap}
        allowThrough={isEvent}
        bubblePlacement={step.preferBubble}
        title={title}
        body={body}
        hint={isAction ? undefined : hint}
        onOutsideTap={isTap ? goNext : undefined}
      />
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, t, laAllowed, goNext]);

  if (!running || !step) return null;
  return overlay;
}
