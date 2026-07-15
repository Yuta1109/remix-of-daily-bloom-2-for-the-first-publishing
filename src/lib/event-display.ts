import type { CalendarEvent } from "./events-store";

function parseYmd(iso: string): { y: number; m: number; d: number } {
  const [y, m, d] = iso.split("-").map(Number);
  return { y, m, d };
}

/** Human-readable schedule string for notifications & calendar lists. */
export function formatEventSchedule(
  e: CalendarEvent,
  locale: "en" | "ja" = "ja"
): string {
  if (e.allDay) return locale === "ja" ? "終日" : "All day";

  const startDate = e.date;
  const endDate = e.endDate || e.date;
  const startTime = e.startTime ?? "";
  const endTime = e.endTime ?? "";

  if (startDate === endDate) {
    if (!startTime && !endTime) return "";
    if (startTime && endTime) return `⏰ ${startTime} - ${endTime}`;
    return `⏰ ${startTime || endTime}`;
  }

  const s = parseYmd(startDate);
  const t = parseYmd(endDate);
  const sameMonth = s.y === t.y && s.m === t.m;

  const dayLabel = (y: number, m: number, d: number, withMonth: boolean) => {
    if (locale === "ja") {
      return withMonth ? `${m}/${d}` : `${d}日`;
    }
    const date = new Date(y, m - 1, d);
    return withMonth
      ? date.toLocaleDateString("en-US", { month: "short", day: "numeric" })
      : date.toLocaleDateString("en-US", { day: "numeric" });
  };

  const startLabel = dayLabel(s.y, s.m, s.d, !sameMonth);
  const endLabel = dayLabel(t.y, t.m, t.d, true);

  if (startTime && endTime) {
    return `⏰ ${startLabel} ${startTime} - ${endLabel} ${endTime}`;
  }
  return `⏰ ${startLabel} - ${endLabel}`;
}
