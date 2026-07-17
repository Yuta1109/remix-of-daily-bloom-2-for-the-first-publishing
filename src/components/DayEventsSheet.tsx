import { Drawer as DrawerPrimitive } from "vaul";
import { Clock, MapPin, Plus } from "lucide-react";
import { InsetScrollArea } from "@/components/InsetScrollArea";
import { type CalendarEvent, colorHslFor } from "@/lib/events-store";
import { formatEventSchedule } from "@/lib/event-display";
import { useI18n } from "@/lib/i18n";

/** Cap list height ≈ 7 event rows, then scroll (same InsetScrollArea as Today). */
const LIST_MAX_H = "min(52vh, 420px)";

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

  const needsScroll = events.length > 7;

  return (
    <DrawerPrimitive.Root open={open} onOpenChange={onOpenChange} shouldScaleBackground={false}>
      <DrawerPrimitive.Portal>
        <DrawerPrimitive.Overlay className="fixed inset-0 z-50 bg-black/20 backdrop-blur-[1px]" />
        <DrawerPrimitive.Content
          className="fixed inset-x-0 bottom-0 z-50 flex flex-col rounded-t-2xl border bg-background min-h-0 overflow-hidden outline-none"
          style={{ maxHeight: "72vh" }}
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <div className="mx-auto mt-2.5 h-1.5 w-10 rounded-full bg-muted shrink-0 touch-none" />

          <div className="flex items-center justify-between px-5 pt-3 pb-3 border-b border-border/50 shrink-0">
            <DrawerPrimitive.Title className="text-base font-semibold">
              {dateLabel}
            </DrawerPrimitive.Title>
            <button
              type="button"
              onClick={onNewEvent}
              className="flex items-center gap-1.5 bg-accent text-accent-foreground rounded-xl px-3 py-1.5 text-sm font-medium hover:opacity-90 transition-opacity"
            >
              <Plus className="w-4 h-4" strokeWidth={2.5} />
              {t("addEvent")}
            </button>
          </div>

          <div
            className="min-h-0 overflow-hidden flex flex-col"
            style={
              needsScroll
                ? { flex: "1 1 0%", maxHeight: LIST_MAX_H, height: LIST_MAX_H }
                : { flex: "0 1 auto", maxHeight: LIST_MAX_H }
            }
          >
            <InsetScrollArea contentClassName="px-4 py-3 space-y-2" inset={16} vaulNoDrag>
              {events.length > 0 ? (
                events.map((ev) => (
                  <button
                    key={ev.id}
                    type="button"
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
                ))
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <p className="text-sm font-medium">{t("noEventsOnDay")}</p>
                  <p className="text-xs opacity-60 mt-1">{t("tapToAdd")}</p>
                </div>
              )}
            </InsetScrollArea>
          </div>
        </DrawerPrimitive.Content>
      </DrawerPrimitive.Portal>
    </DrawerPrimitive.Root>
  );
}
