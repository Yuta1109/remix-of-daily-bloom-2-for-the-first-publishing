import { useMemo, useState, useEffect, useCallback } from "react";
import { ChevronDown } from "lucide-react";
import { getDay, startOfMonth } from "date-fns";
import { EventSheet, type EventSheetTarget } from "@/components/EventSheet";
import { DayEventsSheet } from "@/components/DayEventsSheet";
import { FabButton } from "@/components/FabButton";
import { MonthGoalsCard } from "@/components/MonthGoalsCard";
import { MonthWheel } from "@/components/MonthWheel";
import {
  loadEvents,
  eventsForDate,
  eventsInRange,
  colorHslFor,
  type CalendarEvent,
} from "@/lib/events-store";
import { monthKeyFromDate } from "@/lib/month-goals";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

function daysInMonth(year: number, month: number): string[] {
  const total = new Date(year, month + 1, 0).getDate();
  return Array.from({ length: total }, (_, i) =>
    `${year}-${String(month + 1).padStart(2, "0")}-${String(i + 1).padStart(2, "0")}`
  );
}

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function addMonths(date: Date, n: number) {
  return new Date(date.getFullYear(), date.getMonth() + n, 1);
}

function monthKeyOf(d: Date) {
  return `${d.getFullYear()}-${d.getMonth()}`;
}

interface MonthGridProps {
  year: number;
  month: number;
  events: CalendarEvent[];
  onDayTap: (date: string) => void;
  faded?: boolean;
  interactive?: boolean;
  weekdayHeaders: string[];
  className?: string;
}

function MonthGrid({
  year,
  month,
  events,
  onDayTap,
  faded,
  interactive = true,
  weekdayHeaders,
  className,
}: MonthGridProps) {
  const today = todayKey();
  const days = useMemo(() => daysInMonth(year, month), [year, month]);
  const firstDayOfWeek = getDay(startOfMonth(new Date(year, month, 1)));

  const monthEvents = useMemo(() => {
    if (!days.length) return new Map<string, CalendarEvent[]>();
    return eventsInRange(days[0], days[days.length - 1], events);
  }, [days, events]);

  return (
    <div
      className={cn(
        "bg-card rounded-2xl shadow-card overflow-hidden w-full h-full flex flex-col month-grid-fade",
        faded ? "opacity-40 pointer-events-none" : "opacity-100",
        className
      )}
    >
      <div className="grid grid-cols-7 border-b border-border/60 bg-secondary/30 shrink-0">
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
      <div className="grid grid-cols-7 auto-rows-fr flex-1 min-h-0">
        {Array.from({ length: firstDayOfWeek }).map((_, i) => (
          <div
            key={`empty-${i}`}
            className="min-h-0 border-b border-r border-border/40"
          />
        ))}
        {days.map((date, idx) => {
          const dayNum = parseInt(date.split("-")[2]);
          const col = (firstDayOfWeek + idx) % 7;
          const isToday = date === today;
          const dayEvents = monthEvents.get(date) ?? [];
          const shown = dayEvents.slice(0, 3);
          const more = dayEvents.length - shown.length;
          return (
            <button
              key={date}
              type="button"
              disabled={!interactive || faded}
              onClick={() => onDayTap(date)}
              className={cn(
                "min-h-0 p-1 text-left border-b border-r border-border/40 flex flex-col gap-0.5 transition-colors",
                interactive && !faded && "hover:bg-secondary/40 active:bg-secondary/60",
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
                    className="text-[9px] leading-tight px-1 py-[1px] rounded truncate font-medium"
                    style={{
                      backgroundColor: `hsl(${colorHslFor(e.color)} / 0.18)`,
                      color: `hsl(${colorHslFor(e.color)})`,
                    }}
                  >
                    {!e.allDay && e.startTime ? `${e.startTime} ` : ""}
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
  );
}

export default function CalendarPage() {
  const { t, locale, formatDate } = useI18n();

  const [viewDate, setViewDate] = useState(new Date());
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);

  const [daySheetOpen, setDaySheetOpen] = useState(false);
  const [daySheetDate, setDaySheetDate] = useState<string>(todayKey());

  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetTarget, setSheetTarget] = useState<EventSheetTarget | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [modalDate, setModalDate] = useState<string>(todayKey());
  const [goalsMinimized, setGoalsMinimized] = useState(false);

  const refreshEvents = () => setEvents(loadEvents());
  useEffect(() => {
    refreshEvents();
  }, []);

  const onGoalsMinimizedChange = useCallback((m: boolean) => {
    setGoalsMinimized(m);
  }, []);

  const overlayOpen = daySheetOpen || sheetOpen || modalOpen;

  const weekdayHeaders = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) => {
        const ref = new Date(2024, 0, 7 + i);
        return ref.toLocaleDateString(locale === "ja" ? "ja-JP" : "en-US", {
          weekday: "short",
        });
      }),
    [locale]
  );

  const months = useMemo(
    () => [-1, 0, 1].map((o) => addMonths(viewDate, o)),
    [viewDate]
  );
  const daySheetEvents = eventsForDate(daySheetDate, events);

  const handleDayTap = (date: string) => {
    setDaySheetDate(date);
    setDaySheetOpen(true);
  };

  const handleNewEvent = () => {
    setDaySheetOpen(false);
    setModalDate(daySheetDate);
    setTimeout(() => setModalOpen(true), 200);
  };

  const handleEditEvent = (id: string) => {
    setSheetTarget({ mode: "edit", id });
    setSheetOpen(true);
  };

  const goToday = () => setViewDate(new Date());

  const onMonthStep = useCallback((delta: -1 | 1) => {
    setViewDate((d) => addMonths(d, delta));
  }, []);

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();

  const monthOptions = Array.from({ length: 12 }, (_, i) => i);
  const yearOptions = Array.from({ length: 11 }, (_, i) => new Date().getFullYear() - 5 + i);

  return (
    <div className="page-shell flex flex-col">
      <div className="shrink-0 flex items-center justify-between pl-4 pr-3 pb-2">
        <div className="relative flex items-center gap-1 min-w-0">
          <button
            type="button"
            onClick={() => setPickerOpen((v) => !v)}
            className="flex items-center gap-1.5 text-left"
          >
            <h1 className="text-2xl font-bold tracking-tight">
              {formatDate(viewDate, { month: "long", year: "numeric" })}
            </h1>
            <ChevronDown
              className={cn(
                "w-5 h-5 text-muted-foreground shrink-0 transition-transform",
                pickerOpen && "rotate-180"
              )}
            />
          </button>

          {pickerOpen && (
            <>
              <div className="fixed inset-0 z-30" onClick={() => setPickerOpen(false)} />
              <div className="absolute top-full left-0 mt-2 z-40 bg-card rounded-2xl shadow-card border border-border p-4 flex gap-3">
                <select
                  value={month}
                  onChange={(e) => {
                    setViewDate(new Date(year, Number(e.target.value), 1));
                    setPickerOpen(false);
                  }}
                  className="bg-secondary/60 rounded-lg px-3 py-2 text-sm outline-none"
                >
                  {monthOptions.map((m) => (
                    <option key={m} value={m}>
                      {formatDate(new Date(2024, m, 1), { month: "long" })}
                    </option>
                  ))}
                </select>
                <select
                  value={year}
                  onChange={(e) => {
                    setViewDate(new Date(Number(e.target.value), month, 1));
                    setPickerOpen(false);
                  }}
                  className="bg-secondary/60 rounded-lg px-3 py-2 text-sm outline-none"
                >
                  {yearOptions.map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
              </div>
            </>
          )}
        </div>

        <button
          onClick={goToday}
          className="text-sm font-semibold text-accent hover:opacity-80 px-4 py-2 rounded-xl bg-accent/10 transition-opacity shrink-0 mr-1"
        >
          {t("today")}
        </button>
      </div>

      <div className="relative flex-1 min-h-0 px-3 pb-1">
        <MonthWheel
          monthKey={monthKeyOf(viewDate)}
          disabled={overlayOpen}
          onMonthStep={onMonthStep}
        >
          {(rel, { faded }) => {
            const m = months[rel + 1];
            return (
              <MonthGrid
                year={m.getFullYear()}
                month={m.getMonth()}
                events={events}
                onDayTap={handleDayTap}
                faded={faded}
                interactive={rel === 0 && !faded}
                weekdayHeaders={weekdayHeaders}
              />
            );
          }}
        </MonthWheel>

        {/* Overlays the calendar top (~1/7 height); does not push the grid down. */}
        <div
          className="absolute top-0 left-3 right-3 z-20 pointer-events-none"
          style={goalsMinimized ? undefined : { height: "14.2857%" }}
        >
          <div
            className={cn(
              "pointer-events-auto",
              !goalsMinimized && "h-full"
            )}
          >
            <MonthGoalsCard
              monthKey={monthKeyFromDate(viewDate)}
              onMinimizedChange={onGoalsMinimizedChange}
            />
          </div>
        </div>
      </div>

      <FabButton
        onClick={() => {
          setModalDate(todayKey());
          setModalOpen(true);
        }}
        aria-label={t("addEvent")}
      />

      <DayEventsSheet
        open={daySheetOpen}
        onOpenChange={setDaySheetOpen}
        date={daySheetDate}
        events={daySheetEvents}
        onEditEvent={handleEditEvent}
        onNewEvent={handleNewEvent}
      />

      <EventSheet
        open={modalOpen}
        onOpenChange={setModalOpen}
        target={modalOpen ? { mode: "new", date: modalDate } : null}
        variant="modal"
        onSaved={refreshEvents}
        onDeleted={refreshEvents}
      />

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
