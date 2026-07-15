import { Drawer as DrawerPrimitive } from "vaul";
import { Clock, MapPin, Plus } from "lucide-react";
import { type CalendarEvent, colorHslFor } from "@/lib/events-store";
import { formatEventSchedule } from "@/lib/event-display";
import { useI18n } from "@/lib/i18n";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  date: string;
  events: CalendarEvent[];
  onEditEvent: (id: string) => void;
  onNewEvent: () => void;
}

export function DayEventsSheet({
  open,
  onOpenChange,
  date,
  events,
  onEditEvent,
  onNewEvent,
}: Props) {
  const { locale, t, formatDateStr } = useI18n();

  const dateLabel = formatDateStr(date, {
    weekday: "long",
    month: "short",
    day: "numeric",
  });

  return (
    <DrawerPrimitive.Root open={open} onOpenChange={onOpenChange} shouldScaleBackground={false}>
      <DrawerPrimitive.Portal>
        <DrawerPrimitive.Overlay className="fixed inset-0 z-50 bg-secondary" />
        <DrawerPrimitive.Content className="fixed inset-x-0 bottom-0 z-50 flex flex-col rounded-t-2xl border bg-background max-h-[65vh] outline-none">
          <div className="mx-auto mt-2.5 h-1.5 w-10 rounded-full bg-muted" />

          <div className="flex items-center justify-between px-5 pt-3 pb-3 border-b border-border/50">
            <DrawerPrimitive.Title className="text-base font-semibold">
              {dateLabel}
            </DrawerPrimitive.Title>
            <button
              onClick={onNewEvent}
              className="flex items-center gap-1.5 bg-accent text-accent-foreground rounded-xl px-3 py-1.5 text-sm font-medium hover:opacity-90 transition-opacity"
            >
              <Plus className="w-4 h-4" strokeWidth={2.5} />
              {t("addEvent")}
            </button>
          </div>

          <div className="flex-1 overflow-y-auto scrollbar-app px-4 py-3">
            {events.length > 0 ? (
              <div className="space-y-2">
                {events.map((ev) => (
                  <button
                    key={ev.id}
                    onClick={() => {
                      onOpenChange(false);
                      setTimeout(() => onEditEvent(ev.id), 100);
                    }}
                    className="w-full text-left flex items-start gap-3 bg-secondary/40 hover:bg-secondary rounded-xl px-4 py-3 transition-colors"
                  >
                    <span
                      className="w-1 self-stretch rounded-full flex-shrink-0 mt-0.5"
                      style={{ backgroundColor: `hsl(${colorHslFor(ev.color)})` }}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold truncate">{ev.title}</div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                        <Clock className="w-3 h-3 flex-shrink-0" />
                        <span className="tabular-nums">
                          {formatEventSchedule(ev, locale)}
                        </span>
                        {ev.location && (
                          <>
                            <MapPin className="w-3 h-3 flex-shrink-0 ml-1" />
                            <span className="truncate">{ev.location}</span>
                          </>
                        )}
                      </div>
                      {ev.notes && (
                        <div className="text-xs text-muted-foreground mt-1 line-clamp-2">
                          {ev.notes}
                        </div>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <p className="text-sm font-medium">{t("noEventsOnDay")}</p>
                <p className="text-xs opacity-60 mt-1">{t("tapToAdd")}</p>
              </div>
            )}
            <div className="h-4" />
          </div>
        </DrawerPrimitive.Content>
      </DrawerPrimitive.Portal>
    </DrawerPrimitive.Root>
  );
}
