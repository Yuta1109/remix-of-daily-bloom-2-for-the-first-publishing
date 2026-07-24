/** First-run product tutorial (after notification permission). */

const DONE_KEY = "essences-tutorial-done";

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
  preferBubble: "above" | "below" | "center";
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
    target: "task-checkbox",
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
    id: "calendarSwipe",
    bodyKey: "tutorialCalendarSwipe",
    target: "calendar-swipe",
    advance: "event",
    event: "calendar-swiped",
    route: "/calendar",
    preferBubble: "above",
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
  } catch {
    /* ignore */
  }
}

type TutorialListener = (name: string, detail?: unknown) => void;

const listeners = new Set<TutorialListener>();

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
