/** First-run product tutorial (after notification permission). */

import { getDateKey, saveDayData } from "./store";

const DONE_KEY = "essences-tutorial-done";
const STEP_KEY = "essences-tutorial-step";
const ACTIVE_KEY = "essences-tutorial-in-progress";

export type TutorialAdvance = "tap" | "event" | "action";

export type TutorialStepId =
  | "welcome"
  | "quickAdd"
  | "taskSelect"
  | "taskControls"
  | "taskCheck"
  | "stats"
  | "navCalendar"
  | "monthGoals"
  | "monthGoalsClose"
  | "calendarSwipe"
  | "calendarToday"
  | "calendarFab"
  | "navSettings"
  | "reusableTasks"
  | "laDemo"
  | "done";

export type TutorialStep = {
  id: TutorialStepId;
  /** i18n key for bubble / message body */
  bodyKey: string;
  titleKey?: string;
  /** `data-tutorial` value to highlight; omit for centered message */
  target?: string;
  advance: TutorialAdvance;
  /** CustomEvent name on `tutorialBus` when advance === "event" */
  event?: string;
  /** Ensure this route is active when the step starts */
  route?: string;
  preferBubble: "above" | "below" | "center" | "cover-top";
  /** Block calendar day taps while this step is active */
  blockCalendarDays?: boolean;
};

export const TUTORIAL_STEPS: TutorialStep[] = [
  {
    id: "welcome",
    titleKey: "tutorialWelcomeTitle",
    bodyKey: "tutorialWelcomeBody",
    advance: "tap",
    route: "/",
    preferBubble: "center",
  },
  {
    id: "quickAdd",
    bodyKey: "tutorialQuickAdd",
    target: "quick-add",
    advance: "event",
    event: "task-added",
    route: "/",
    preferBubble: "above",
  },
  {
    id: "taskSelect",
    bodyKey: "tutorialTaskSelect",
    target: "task-item",
    advance: "event",
    event: "task-selected",
    route: "/",
    preferBubble: "below",
  },
  {
    id: "taskControls",
    bodyKey: "tutorialTaskControls",
    target: "task-item",
    advance: "tap",
    route: "/",
    preferBubble: "below",
  },
  {
    id: "taskCheck",
    bodyKey: "tutorialTaskCheck",
    // Full row — highlighting only the checkbox dims the rest of the task
    // so it looks like it vanished after checking.
    target: "task-item",
    advance: "event",
    event: "task-toggled",
    route: "/",
    preferBubble: "below",
  },
  {
    id: "stats",
    bodyKey: "tutorialStats",
    target: "today-stats",
    advance: "tap",
    route: "/",
    preferBubble: "below",
  },
  {
    id: "navCalendar",
    bodyKey: "tutorialNavCalendar",
    target: "nav-calendar",
    advance: "event",
    event: "nav-calendar",
    preferBubble: "above",
  },
  {
    id: "monthGoals",
    bodyKey: "tutorialMonthGoals",
    target: "month-goals",
    advance: "tap",
    route: "/calendar",
    preferBubble: "below",
  },
  {
    id: "monthGoalsClose",
    bodyKey: "tutorialMonthGoalsClose",
    target: "month-goals",
    advance: "event",
    event: "goals-minimized",
    route: "/calendar",
    preferBubble: "below",
  },
  {
    id: "calendarSwipe",
    bodyKey: "tutorialCalendarSwipe",
    target: "calendar-stage",
    advance: "event",
    event: "calendar-swiped",
    route: "/calendar",
    preferBubble: "cover-top",
    blockCalendarDays: true,
  },
  {
    id: "calendarToday",
    bodyKey: "tutorialCalendarToday",
    target: "calendar-today",
    advance: "event",
    event: "calendar-today",
    route: "/calendar",
    preferBubble: "below",
  },
  {
    id: "calendarFab",
    bodyKey: "tutorialCalendarFab",
    target: "calendar-fab",
    advance: "tap",
    route: "/calendar",
    preferBubble: "above",
  },
  {
    id: "navSettings",
    bodyKey: "tutorialNavSettings",
    target: "nav-settings",
    advance: "event",
    event: "nav-settings",
    preferBubble: "above",
  },
  {
    id: "reusableTasks",
    bodyKey: "tutorialReusableTasks",
    target: "reusable-tasks",
    advance: "tap",
    route: "/settings",
    preferBubble: "below",
  },
  {
    id: "laDemo",
    titleKey: "liveActivityOnboardingTitle",
    bodyKey: "tutorialLaDemoBody",
    advance: "action",
    preferBubble: "center",
  },
  {
    id: "done",
    titleKey: "tutorialDoneTitle",
    bodyKey: "tutorialDoneBody",
    advance: "tap",
    route: "/",
    preferBubble: "center",
  },
];

export function isTutorialDone(): boolean {
  try {
    return localStorage.getItem(DONE_KEY) === "true";
  } catch {
    return false;
  }
}

export function setTutorialDone(done = true): void {
  try {
    localStorage.setItem(DONE_KEY, done ? "true" : "false");
    if (done) {
      localStorage.removeItem(STEP_KEY);
      localStorage.removeItem(ACTIVE_KEY);
    }
  } catch {
    /* ignore */
  }
}

export function isTutorialInProgress(): boolean {
  try {
    return localStorage.getItem(ACTIVE_KEY) === "true" && !isTutorialDone();
  } catch {
    return false;
  }
}

export function setTutorialInProgress(active: boolean): void {
  try {
    if (active) localStorage.setItem(ACTIVE_KEY, "true");
    else localStorage.removeItem(ACTIVE_KEY);
  } catch {
    /* ignore */
  }
}

export function getSavedTutorialStepIndex(): number {
  try {
    const raw = localStorage.getItem(STEP_KEY);
    if (raw == null) return 0;
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0) return 0;
    return Math.min(Math.floor(n), TUTORIAL_STEPS.length - 1);
  } catch {
    return 0;
  }
}

export function saveTutorialStepIndex(index: number): void {
  try {
    localStorage.setItem(STEP_KEY, String(index));
  } catch {
    /* ignore */
  }
}

/** Wipe Today tasks created during an unfinished tutorial (survives force-quit). */
export function clearTutorialScratchData(): void {
  try {
    const today = getDateKey(new Date());
    saveDayData(today, { tasks: [], reflection: "" });
  } catch {
    /* ignore */
  }
  try {
    window.dispatchEvent(new CustomEvent("essences-tutorial-data-cleared"));
  } catch {
    /* ignore */
  }
}

type TutorialListener = (name: string, detail?: unknown) => void;

const listeners = new Set<TutorialListener>();

/** Prevents re-bootstrap when the host component remounts mid-tour. */
let bootstrapStarted = false;

export function hasTutorialBootstrapStarted(): boolean {
  return bootstrapStarted;
}

export function markTutorialBootstrapStarted(): void {
  bootstrapStarted = true;
}

export function emitTutorial(name: string, detail?: unknown): void {
  listeners.forEach((fn) => {
    try {
      fn(name, detail);
    } catch {
      /* ignore */
    }
  });
}

export function subscribeTutorial(fn: TutorialListener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function isTutorialActive(): boolean {
  try {
    return document.documentElement.dataset.tutorialActive === "1";
  } catch {
    return false;
  }
}

export function setTutorialActiveFlag(active: boolean): void {
  try {
    if (active) document.documentElement.dataset.tutorialActive = "1";
    else delete document.documentElement.dataset.tutorialActive;
  } catch {
    /* ignore */
  }
}

export function setTutorialStepFlag(stepId: string | null): void {
  try {
    if (stepId) document.documentElement.dataset.tutorialStep = stepId;
    else delete document.documentElement.dataset.tutorialStep;
  } catch {
    /* ignore */
  }
}

/** True while the calendar-swipe coach step is active (block day taps). */
export function isTutorialBlockingCalendarDays(): boolean {
  try {
    return (
      document.documentElement.dataset.tutorialActive === "1" &&
      document.documentElement.dataset.tutorialStep === "calendarSwipe"
    );
  } catch {
    return false;
  }
}
