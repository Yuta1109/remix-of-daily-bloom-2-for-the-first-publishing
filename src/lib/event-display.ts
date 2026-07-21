import type { CalendarEvent } from "./events-store";
import { materializeOccurrence, occurrenceStartForDate } from "./events-store";

function parseYmd(iso: string): { y: number; m: number; d: number } {
  const [y, m, d] = iso.split("-").map(Number);
  return { y, m, d };
}

/** Human-readable schedule string for notifications & calendar lists. */
export function formatEventSchedule(
  e: CalendarEvent,
  locale: "en" | "ja" = "ja",
  /** Keep ⏰ for notification body text; omit when a Clock icon is shown beside it. */
  opts?: { emoji?: boolean },
): string {
  const prefix = opts?.emoji === false ? "" : "⏰ ";

  if (e.allDay) return locale === "ja" ? "終日" : "All day";

  const startDate = e.date;
  const endDate = e.endDate || e.date;
  const startTime = e.startTime ?? "";
  const endTime = e.endTime ?? "";

  const md = (iso: string) => {
    const { m, d } = parseYmd(iso);
    return `${m}/${d}`;
  };

  if (startDate === endDate) {
    if (!startTime && !endTime) return "";
    if (startTime && endTime) return `${prefix}${startTime} - ${endTime}`;
    return `${prefix}${startTime || endTime}`;
  }

  // Multi-day: always "M/D HH:mm - M/D HH:mm" (same style both sides).
  if (startTime && endTime) {
    return `${prefix}${md(startDate)} ${startTime} - ${md(endDate)} ${endTime}`;
  }
  return `${prefix}${md(startDate)} - ${md(endDate)}`;
}

/** Schedule text for a specific calendar day (shifts repeating masters to that occurrence). */
export function formatEventScheduleOnDate(
  e: CalendarEvent,
  viewDate: string,
  locale: "en" | "ja" = "ja",
  opts?: { emoji?: boolean },
): string {
  const occStart = occurrenceStartForDate(e, viewDate);
  const view = occStart ? materializeOccurrence(e, occStart) : e;
  return formatEventSchedule(view, locale, opts);
}
