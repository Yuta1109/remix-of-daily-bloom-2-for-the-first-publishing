const VIEW_KEY = "essences-cal-view";
const WEEK_START_KEY = "essences-cal-week-start";
const SWIPE_HINT_KEY = "essences-cal-week-swipe-hint";
const WEEK_VIEW_KEY = "essences-cal-week-view-opened";
const WEEK_NAV_HINT_KEY = "essences-cal-week-nav-hint";

export type CalendarViewMode = "month" | "week";
export type WeekStartsOn = 0 | 1;

export function loadCalendarViewMode(): CalendarViewMode {
  try {
    return localStorage.getItem(VIEW_KEY) === "week" ? "week" : "month";
  } catch {
    return "month";
  }
}

export function saveCalendarViewMode(mode: CalendarViewMode) {
  try {
    localStorage.setItem(VIEW_KEY, mode);
  } catch {
    /* ignore */
  }
}

export function loadWeekStartsOn(): WeekStartsOn {
  try {
    return localStorage.getItem(WEEK_START_KEY) === "1" ? 1 : 0;
  } catch {
    return 0;
  }
}

export function saveWeekStartsOn(value: WeekStartsOn) {
  try {
    localStorage.setItem(WEEK_START_KEY, String(value));
  } catch {
    /* ignore */
  }
}

export function weekSwipeHintSeen(): boolean {
  try {
    return localStorage.getItem(SWIPE_HINT_KEY) === "1";
  } catch {
    return false;
  }
}

export function markWeekSwipeHintSeen() {
  try {
    localStorage.setItem(SWIPE_HINT_KEY, "1");
  } catch {
    /* ignore */
  }
}

export function hasOpenedWeekView(): boolean {
  try {
    return localStorage.getItem(WEEK_VIEW_KEY) === "1";
  } catch {
    return false;
  }
}

export function markWeekViewOpened() {
  try {
    localStorage.setItem(WEEK_VIEW_KEY, "1");
  } catch {
    /* ignore */
  }
}

export function weekNavSwipeHintSeen(): boolean {
  try {
    return localStorage.getItem(WEEK_NAV_HINT_KEY) === "1";
  } catch {
    return false;
  }
}

export function markWeekNavSwipeHintSeen() {
  try {
    localStorage.setItem(WEEK_NAV_HINT_KEY, "1");
  } catch {
    /* ignore */
  }
}
