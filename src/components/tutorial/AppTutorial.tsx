import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { CoachOverlay } from "@/components/tutorial/CoachOverlay";
import {
  LiveActivityDemoPanel,
  type LaDemoPhase,
} from "@/components/LiveActivityDemoPanel";
import { useI18n, type TranslationKeys } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { ensurePermission, isNative } from "@/lib/notifications";
import {
  markLiveActivityEnableAllowed,
  markLiveActivityEnableDeferred,
  setLiveActivityOnboardingDone,
} from "@/lib/live-activity-prefs";
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
  TUTORIAL_RESTART_EVENT,
  TUTORIAL_STEPS,
  type TutorialStep,
} from "@/lib/tutorial";

/**
 * First-run coach-mark tour. Starts after notification permission.
 * Progress is persisted so route changes / remounts do not reset to welcome.
 */
export function AppTutorial() {
  const { t, locale, setLocale } = useI18n();
  const navigate = useNavigate();
  const location = useLocation();
  const [running, setRunning] = useState(false);
  const [index, setIndex] = useState(0);
  /** Offer screen hides parent Next; after start, Next is always available. */
  const [laShowNext, setLaShowNext] = useState(false);
  const [laPhase, setLaPhase] = useState<LaDemoPhase>("offer");
  const laDemoSucceededRef = useRef(false);
  const advancingRef = useRef(false);
  const replayRef = useRef(false);

  const step: TutorialStep | null = running ? TUTORIAL_STEPS[index] ?? null : null;

  const finish = useCallback(() => {
    setTutorialDone(true);
    setLiveActivityOnboardingDone(true);
    setTutorialActiveFlag(false);
    setTutorialInProgress(false);
    setTutorialStepFlag(null);
    setRunning(false);
    advancingRef.current = false;
    replayRef.current = false;
    navigate("/", { replace: true });
  }, [navigate]);

  const skipTour = useCallback(() => {
    if (!replayRef.current) {
      clearTutorialScratchData();
      markLiveActivityEnableDeferred();
    }
    finish();
  }, [finish]);

  const startTourFrom = useCallback(
    (opts: { wipeScratch: boolean; replay: boolean }) => {
      replayRef.current = opts.replay;
      if (opts.wipeScratch) clearTutorialScratchData();
      markTutorialBootstrapStarted();
      saveTutorialStepIndex(0);
      setTutorialInProgress(true);
      setTutorialActiveFlag(true);
      advancingRef.current = false;
      setLaShowNext(false);
      setLaPhase("offer");
      laDemoSucceededRef.current = false;
      setIndex(0);
      setRunning(true);
      navigate("/", { replace: true });
    },
    [navigate],
  );

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

      startTourFrom({ wipeScratch: true, replay: false });
    }, 700);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onRestart = () => {
      startTourFrom({ wipeScratch: false, replay: true });
    };
    window.addEventListener(TUTORIAL_RESTART_EVENT, onRestart);
    return () => window.removeEventListener(TUTORIAL_RESTART_EVENT, onRestart);
  }, [startTourFrom]);

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
    if (step?.id !== "laDemo") {
      setLaShowNext(false);
      setLaPhase("offer");
      laDemoSucceededRef.current = false;
    }
  }, [step?.id]);

  const finishLaStep = useCallback(() => {
    setLiveActivityOnboardingDone(true);
    if (laPhase === "forceEnded" || !laDemoSucceededRef.current) {
      markLiveActivityEnableDeferred();
    } else {
      markLiveActivityEnableAllowed();
    }
    goNext();
  }, [goNext, laPhase]);

  const overlay = useMemo(() => {
    if (!step) return null;
    const isWelcome = step.id === "welcome";
    const isTap = step.advance === "tap";
    const isEvent = step.advance === "event";
    const isAction = step.advance === "action";
    const isBookend = step.id === "welcome" || step.id === "done";

    if (step.id === "laDemo") {
      const showNext =
        laShowNext &&
        laPhase !== "offer" &&
        (laPhase === "preparing" ||
          laPhase === "ready" ||
          laPhase === "denied" ||
          laPhase === "forceEnded" ||
          laPhase === "failed" ||
          laPhase === "complete" ||
          laDemoSucceededRef.current);
      const tapToAdvance = laPhase === "forceEnded";

      return (
        <CoachOverlay
          key={step.id}
          targetSelector={null}
          captureOutsideClick={tapToAdvance}
          allowThrough={false}
          bubblePlacement="center"
          title={undefined}
          body=""
          hint={tapToAdvance ? t("tutorialTapHint") : undefined}
          onOutsideTap={tapToAdvance ? finishLaStep : undefined}
          actions={
            <>
              <LiveActivityDemoPanel
                showChecklist={false}
                onOutcome={(outcome, phase) => {
                  setLaPhase(phase);
                  if (phase === "ready" || phase === "complete") {
                    laDemoSucceededRef.current = true;
                    setLaShowNext(true);
                  }
                  if (phase === "denied" || phase === "forceEnded") {
                    if (phase === "forceEnded") {
                      laDemoSucceededRef.current = false;
                    }
                    setLaShowNext(true);
                  }
                  if (outcome === "allowed" && phase === "ready") {
                    laDemoSucceededRef.current = true;
                    setLaShowNext(true);
                  }
                }}
                onCanContinueChange={(can) => {
                  setLaShowNext(can);
                  if (can) {
                    setLaPhase((p) => (p === "offer" ? "preparing" : p));
                  }
                }}
                onDeferAfterDeny={() => {
                  setLiveActivityOnboardingDone(true);
                  markLiveActivityEnableDeferred();
                  goNext();
                }}
              />
              {showNext && (
                <button
                  type="button"
                  onClick={finishLaStep}
                  className="w-full rounded-xl bg-accent text-accent-foreground px-4 py-3 text-sm font-semibold"
                >
                  {t("tutorialLaDemoNext")}
                </button>
              )}
            </>
          }
        />
      );
    }

    const title = step.titleKey ? t(step.titleKey as TranslationKeys) : undefined;
    const body = t(step.bodyKey as TranslationKeys);

    return (
      <CoachOverlay
        key={`${step.id}-${isBookend ? "bookend" : "step"}`}
        targetSelector={step.target ? `[data-tutorial="${step.target}"]` : null}
        captureOutsideClick={isTap && !isWelcome}
        allowThrough={isEvent}
        bubblePlacement={step.preferBubble}
        bookend={isWelcome}
        title={title}
        body={body}
        hint={isAction || isWelcome ? undefined : isTap ? t("tutorialTapHint") : isEvent ? t("tutorialActionHint") : undefined}
        onOutsideTap={isTap && !isWelcome ? goNext : undefined}
        actions={
          step.id === "welcome" ? (
            <>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setLocale("ja")}
                  className={cn(
                    "flex-1 rounded-xl px-3 py-2.5 text-sm font-medium",
                    locale === "ja" ? "bg-accent text-accent-foreground" : "bg-secondary",
                  )}
                >
                  {t("tutorialLangJa")}
                </button>
                <button
                  type="button"
                  onClick={() => setLocale("en")}
                  className={cn(
                    "flex-1 rounded-xl px-3 py-2.5 text-sm font-medium",
                    locale === "en" ? "bg-accent text-accent-foreground" : "bg-secondary",
                  )}
                >
                  {t("tutorialLangEn")}
                </button>
              </div>
              <p className="text-sm leading-relaxed text-foreground/85">{t("tutorialWelcomeIntro")}</p>
              <p className="text-xs text-muted-foreground leading-relaxed">{t("tutorialDurationNote")}</p>
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={goNext}
                  className="flex-1 rounded-xl bg-accent text-accent-foreground px-4 py-3 text-sm font-semibold"
                >
                  {t("tutorialStart")}
                </button>
                <button
                  type="button"
                  onClick={skipTour}
                  className="flex-1 rounded-xl bg-secondary px-4 py-3 text-sm font-medium"
                >
                  {t("tutorialSkip")}
                </button>
              </div>
            </>
          ) : undefined
        }
      />
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, t, locale, laShowNext, laPhase, goNext, finishLaStep, skipTour]);

  if (!running || !step) return null;
  return overlay;
}
