import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
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
  isTutorialDone,
  setTutorialActiveFlag,
  setTutorialDone,
  subscribeTutorial,
  TUTORIAL_STEPS,
  type TutorialStep,
} from "@/lib/tutorial";

/**
 * First-run coach-mark tour. Starts after notification permission.
 * Live Activity demo is the last interactive beat before the closing message.
 */
export function AppTutorial() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [running, setRunning] = useState(false);
  const [index, setIndex] = useState(0);
  const [laBusy, setLaBusy] = useState(false);
  const advancingRef = useRef(false);

  const step: TutorialStep | null = running ? TUTORIAL_STEPS[index] ?? null : null;

  const finish = useCallback(() => {
    setTutorialDone(true);
    setLiveActivityOnboardingDone(true);
    setTutorialActiveFlag(false);
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
      queueMicrotask(() => {
        advancingRef.current = false;
      });
      return i + 1;
    });
  }, [finish]);

  useEffect(() => {
    if (!isNative()) return;
    if (isTutorialDone()) return;

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        await ensurePermission();
      } catch {
        /* continue tour even if permission UI fails */
      }
      if (cancelled || isTutorialDone()) return;
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
  }, [navigate]);

  useEffect(() => {
    if (!running || !step) return;
    if (step.route) navigate(step.route);
  }, [running, step?.id, step?.route, navigate]);

  useEffect(() => {
    if (!running || !step || step.advance !== "event" || !step.event) return;
    const want = step.event;
    advancingRef.current = false;
    return subscribeTutorial((name) => {
      if (name === want) goNext();
    });
  }, [running, step?.id, step?.advance, step?.event, goNext]);

  // Soft escape: if an interactive target never appears, skip after 8s.
  useEffect(() => {
    if (!running || !step || step.advance !== "event" || !step.target) return;
    const timer = window.setTimeout(() => {
      const el = document.querySelector(`[data-tutorial="${step.target}"]`);
      if (!el) goNext();
    }, 8000);
    return () => window.clearTimeout(timer);
  }, [running, step?.id, step?.advance, step?.target, goNext]);

  const onLaTry = async () => {
    if (laBusy) return;
    setLaBusy(true);
    try {
      if (!isNativeIos()) {
        goNext();
        return;
      }
      setLiveActivityUserEnabled(true);
      const gate = await getLiveActivityGate();
      if (!gate.systemEnabled) {
        await openAppSettings();
        goNext();
        return;
      }
      await startDemoLiveActivity({ durationMs: 40_000 });
      goNext();
    } catch {
      goNext();
    } finally {
      setLaBusy(false);
    }
  };

  const onLaSkip = () => {
    setLiveActivityOnboardingDone(true);
    goNext();
  };

  const overlay = useMemo(() => {
    if (!step) return null;
    const title = step.titleKey ? t(step.titleKey as TranslationKeys) : undefined;
    const body = t(step.bodyKey as TranslationKeys);
    const isTap = step.advance === "tap";
    const isEvent = step.advance === "event";
    const isAction = step.advance === "action";

    let hint: string | undefined;
    if (isTap) hint = t("tutorialTapHint");
    if (isEvent) hint = t("tutorialActionHint");

    const actions =
      isAction && step.id === "laDemo" ? (
        <>
          {isNativeIos() && (
            <button
              type="button"
              disabled={laBusy}
              onClick={() => void onLaTry()}
              className="w-full rounded-xl bg-accent text-accent-foreground px-4 py-3 text-sm font-semibold disabled:opacity-60"
            >
              {t("liveActivityTryDemo")}
            </button>
          )}
          <button
            type="button"
            disabled={laBusy}
            onClick={onLaSkip}
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional step-bound UI
  }, [step, t, laBusy, goNext]);

  if (!running || !step) return null;
  return overlay;
}
