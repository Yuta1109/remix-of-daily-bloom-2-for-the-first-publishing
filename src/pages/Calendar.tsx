import { useMemo, useState, useEffect } from "react";
import { ChevronLeft, ChevronRight, Plus, Clock, MapPin } from "lucide-react";
import { startOfMonth, getDay } from "date-fns";
import { EventSheet, type EventSheetTarget } from "@/components/EventSheet";
import {
  loadEvents,
  eventsForDate,
  eventsInRange,
  colorHslFor,
  type CalendarEvent,
} from "@/lib/events-store";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

function daysInMonth(year: number, month: number): string[] {
  const total = new Date(year, month + 1, 0).getDate();
  const arr: string[] = [];
  for (let d = 1; d <= total; d++) {
    arr.push(`${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
  }
  return arr;
}

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function CalendarPage() {
  const { t, locale, formatDate, formatDateStr } = useI18n();
  const [viewDate, setViewDate] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState<string>(todayKey());
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetTarget, setSheetTarget] = useState<EventSheetTarget | null>(null);

  const refreshEvents = () => setEvents(loadEvents());
  useEffect(() => {
    refreshEvents();
  }, []);

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const days = useMemo(() => daysInMonth(year, month), [year, month]);
  const firstDayOfWeek = getDay(startOfMonth(viewDate));

  const monthEvents = useMemo(() => {
    if (days.length === 0) return new Map<string, CalendarEvent[]>();
    return eventsInRange(days[0], days[days.length - 1], events);
  }, [days, events]);

  const weekdayHeaders = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const refDate = new Date(2024, 0, 7 + i); // Sun Jan 7 2024
      return refDate.toLocaleDateString(locale === "ja" ? "ja-JP" : "en-US", { weekday: "short" });
    });
  }, [locale]);

  const prev = () => setViewDate(new Date(year, month - 1, 1));
  const next = () => setViewDate(new Date(year, month + 1, 1));
  const goToday = () => {
    const now = new Date();
    setViewDate(new Date(now.getFullYear(), now.getMonth(), 1));
    setSelectedDay(todayKey());
  };

  const selectedEvents = eventsForDate(selectedDay, events);

  const openNewFor = (date: string) => {
    setSelectedDay(date);
    setSheetTarget({ mode: "new", date });
    setSheetOpen(true);
  };
  const openEdit = (id: string) => {
    setSheetTarget({ mode: "edit", id });
    setSheetOpen(true);
  };

  return (
    <div className="max-w-2xl mx-auto px-4 pt-6 pb-32 min-h-screen">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold tracking-tight">
          {formatDate(viewDate, { month: "long", year: "numeric" })}
        </h1>
        <div className="flex items-center gap-1">
          <button
            onClick={goToday}
            className="text-xs font-medium text-muted-foreground hover:text-foreground px-3 py-1.5 rounded-lg hover:bg-secondary/60 transition-colors"
          >
            {t("today")}
          </button>
          <button
            onClick={prev}
            className="p-2 text-muted-foreground hover:text-foreground rounded-lg hover:bg-secondary/60"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <button
            onClick={next}
            className="p-2 text-muted-foreground hover:text-foreground rounded-lg hover:bg-secondary/60"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Month grid */}
      <div className="bg-card rounded-2xl shadow-card overflow-hidden mb-5">
        <div className="grid grid-cols-7 border-b border-border/60 bg-secondary/30">
          {weekdayHeaders.map((d, i) => (
            <div
              key={i}
              className={cn(
                "text-center text-[11px] font-semibold py-2 uppercase tracking-wide",
                i === 0 && "text-red-500",
                i === 6 && "text-blue-500",
                i !== 0 && i !== 6 && "text-muted-foreground"
              )}
            >
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 auto-rows-fr">
          {Array.from({ length: firstDayOfWeek }).map((_, i) => (
            <div
              key={`empty-${i}`}
              className="min-h-[78px] border-b border-r border-border/40 last:border-r-0"
            />
          ))}
          {days.map((date, idx) => {
            const dayNum = parseInt(date.split("-")[2]);
            const col = (firstDayOfWeek + idx) % 7;
            const isSelected = selectedDay === date;
            const isToday = date === todayKey();
            const dayEvents = monthEvents.get(date) ?? [];
            const shown = dayEvents.slice(0, 3);
            const more = dayEvents.length - shown.length;
            return (
              <button
                key={date}
                onClick={() => openNewFor(date)}
                className={cn(
                  "min-h-[78px] p-1 text-left border-b border-r border-border/40 last:border-r-0 flex flex-col gap-0.5 transition-colors relative",
                  isSelected ? "bg-accent/10" : "hover:bg-secondary/40",
                  col === 6 && "border-r-0"
                )}
              >
                <div className="flex items-center justify-center">
                  <span
                    className={cn(
                      "inline-flex items-center justify-center text-[11px] font-semibold w-5 h-5 rounded-full",
                      isToday && "bg-accent text-accent-foreground",
                      !isToday && col === 0 && "text-red-500",
                      !isToday && col === 6 && "text-blue-500",
                      !isToday && col !== 0 && col !== 6 && "text-foreground"
                    )}
                  >
                    {dayNum}
                  </span>
                </div>
                <div className="flex-1 space-y-[2px] overflow-hidden">
                  {shown.map((e) => (
                    <div
                      key={e.id + date}
                      onClick={(ev) => {
                        ev.stopPropagation();
                        openEdit(e.id);
                      }}
                      className="text-[9px] leading-tight px-1 py-[1px] rounded truncate font-medium cursor-pointer"
                      style={{
                        backgroundColor: `hsl(${colorHslFor(e.color)} / 0.18)`,
                        color: `hsl(${colorHslFor(e.color)})`,
                      }}
                      title={e.title}
                    >
                      {e.allDay ? "" : (e.startTime ? `${e.startTime} ` : "")}
                      {e.title}
                    </div>
                  ))}
                  {more > 0 && (
                    <div className="text-[9px] text-muted-foreground px-1 leading-tight">
                      +{more}
                    </div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Selected day events */}
      <div className="bg-card rounded-2xl p-5 shadow-soft animate-fade-in-up">
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm font-semibold">
            {formatDateStr(selectedDay, { weekday: "long", month: "short", day: "numeric" })}
          </p>
          <span className="text-xs text-muted-foreground">
            {selectedEvents.length} {selectedEvents.length === 1 ? "event" : "events"}
          </span>
        </div>

        {selectedEvents.length > 0 ? (
          <div className="space-y-2">
            {selectedEvents.map((ev) => (
              <button
                key={ev.id}
                onClick={() => openEdit(ev.id)}
                className="w-full text-left flex items-start gap-3 bg-secondary/40 hover:bg-secondary rounded-xl px-4 py-3 transition-colors"
              >
                <span
                  className="w-1 self-stretch rounded-full flex-shrink-0"
                  style={{ backgroundColor: `hsl(${colorHslFor(ev.color)})` }}
                />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold truncate">{ev.title}</div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                    <Clock className="w-3 h-3" />
                    <span className="tabular-nums">
                      {ev.allDay
                        ? t("allDay")
                        : `${ev.startTime ?? ""}${ev.endTime ? ` – ${ev.endTime}` : ""}`}
                    </span>
                    {ev.location && (
                      <>
                        <MapPin className="w-3 h-3 ml-1" />
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
          <p className="text-sm text-muted-foreground text-center py-8">{t("noEvents")}</p>
        )}
      </div>

      {/* FAB */}
      <button
        onClick={() => openNewFor(selectedDay)}
        aria-label={t("addEvent")}
        className="fixed bottom-24 right-6 w-14 h-14 rounded-full bg-accent text-accent-foreground shadow-float flex items-center justify-center transition-all hover:scale-110 active:scale-95 z-40"
      >
        <Plus className="w-6 h-6" strokeWidth={2.5} />
      </button>

      <EventSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        target={sheetTarget}
        onSaved={refreshEvents}
        onDeleted={refreshEvents}
      />
    </div>
  );
}
