import { useI18n } from "@/lib/i18n";
import { colorHslFor, type CalendarEvent } from "@/lib/events-store";

type Props = {
  date: string;
  events: CalendarEvent[];
  onOpenEvent: (id: string, date: string) => void;
};

function formatTimeRange(e: CalendarEvent) {
  if (e.allDay) return null;
  if (e.startTime && e.endTime) return `${e.startTime} – ${e.endTime}`;
  if (e.startTime) return e.startTime;
  return null;
}

export function WeekEventList({ date, events, onOpenEvent }: Props) {
  const { t } = useI18n();

  if (!events.length) {
    return (
      <p className="text-sm text-muted-foreground text-center py-10 px-3">{t("noEventsOnDay")}</p>
    );
  }

  return (
    <div className="event-sheet-scroll flex-1 min-h-0 overflow-y-auto overscroll-contain px-3 pb-3 space-y-2">
      {events.map((e) => {
        const time = formatTimeRange(e);
        return (
          <button
            key={e.id + date}
            type="button"
            onClick={() => onOpenEvent(e.id, date)}
            className="w-full text-left rounded-xl px-3 py-2.5 bg-secondary/40 border border-border/50 active:bg-secondary/70"
          >
            <div className="flex items-start gap-2 min-w-0">
              <span
                className="w-1 self-stretch rounded-full shrink-0"
                style={{ backgroundColor: `hsl(${colorHslFor(e.color)})` }}
              />
              <div className="min-w-0 flex-1">
                {time ? (
                  <p
                    className="text-[11px] font-semibold tabular-nums truncate"
                    style={{ color: `hsl(${colorHslFor(e.color)})` }}
                  >
                    {time}
                  </p>
                ) : (
                  <p className="text-[11px] font-semibold text-muted-foreground">{t("allDay")}</p>
                )}
                <p className="text-sm font-medium text-foreground leading-snug break-words">{e.title}</p>
                {e.location ? (
                  <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{e.location}</p>
                ) : null}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
