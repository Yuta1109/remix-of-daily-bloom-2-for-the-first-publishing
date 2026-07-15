import { useMemo, useState, useEffect, useRef, useLayoutEffect, useCallback } from "react";
import { getDay, startOfMonth } from "date-fns";
import { EventSheet, type EventSheetTarget } from "@/components/EventSheet";
import { DayEventsSheet } from "@/components/DayEventsSheet";
import {
  loadEvents,
  eventsForDate,
  eventsInRange,
  colorHslFor,
  type CalendarEvent,
} from "@/lib/events-store";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/* ── helpers ──────────────────────────────────────────────────────────────── */

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

/* ── MonthGrid sub-component ──────────────────────────────────────────────── */

interface MonthGridProps {
  year: number;
  month: number;
  events: CalendarEvent[];
  onDayTap: (date: string) => void;
  faded?: boolean;
  weekdayHeaders: string[];
  locale: string;
}

function MonthGrid({ year, month, events, onDayTap, faded, weekdayHeaders }: MonthGridProps) {
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
        "bg-card rounded-2xl shadow-card overflow-hidden transition-opacity duration-300",
        faded ? "opacity-30 pointer-events-none" : "opacity-100"
      )}
    >
      {/* Weekday headers */}
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

      {/* Day cells */}
      <div className="grid grid-cols-7 auto-rows-fr">
        {Array.from({ length: firstDayOfWeek }).map((_, i) => (
          <div
            key={`empty-${i}`}
            className="min-h-[70px] border-b border-r border-border/40"
          />
        ))}
        {days.map((date, idx) => {
          const dayNum = parseInt(date.split("-")[2]);
          const col = (firstDayOfWeek + idx) % 7;
          const isToday = date === today;
          const dayEvents = monthEvents.get(date) ?? [];
          const shown = dayEvents.slice(0, 2);
          const more = dayEvents.length - shown.length;
          return (
            <button
              key={date}
              onClick={() => onDayTap(date)}
              className={cn(
                "min-h-[70px] p-1 text-left border-b border-r border-border/40 flex flex-col gap-0.5 transition-colors relative hover:bg-secondary/40 active:bg-secondary/60",
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

/* ── Main page ───────────────────────────────────────────────────────────── */

export default function CalendarPage() {
  const { t, locale, formatDate } = useI18n();

  const [viewDate, setViewDate] = useState(new Date());
  const [events, setEvents] = useState<CalendarEvent[]>([]);

  // Day-events bottom sheet
  const [daySheetOpen, setDaySheetOpen] = useState(false);
  const [daySheetDate, setDaySheetDate] = useState<string>(todayKey());

  // Edit/new event drawer
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetTarget, setSheetTarget] = useState<EventSheetTarget | null>(null);

  // New-event popup (modal)
  const [modalOpen, setModalOpen] = useState(false);
  const [modalDate, setModalDate] = useState<string>(todayKey());

  const refreshEvents = () => setEvents(loadEvents());
  useEffect(() => { refreshEvents(); }, []);

  /* ── Swipeable months scroll ──────────────────────────────────────────── */
  const scrollRef = useRef<HTMLDivElement>(null);
  const scrollBlockedRef = useRef(false);

  // On viewDate change: reset scroll to center instantly (no animation).
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const w = el.clientWidth;
    // Temporarily suppress the scrollend handler while we reposition.
    scrollBlockedRef.current = true;
    el.style.scrollBehavior = "auto";
    el.scrollLeft = w;
    requestAnimationFrame(() => {
      el.style.scrollBehavior = "";
      scrollBlockedRef.current = false;
    });
  }, [viewDate]);

  // Detect when the user swipes to prev/next month.
  const scrollTimerRef = useRef<number>();
  const handleScroll = useCallback(() => {
    clearTimeout(scrollTimerRef.current);
    scrollTimerRef.current = window.setTimeout(() => {
      if (scrollBlockedRef.current) return;
      const el = scrollRef.current;
      if (!el) return;
      const w = el.clientWidth;
      if (w === 0) return;
      const snap = Math.round(el.scrollLeft / w);
      if (snap === 0) {
        setViewDate((d) => addMonths(d, -1));
      } else if (snap === 2) {
        setViewDate((d) => addMonths(d, +1));
      }
    }, 120);
  }, []);

  /* ── Weekday headers ──────────────────────────────────────────────────── */
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

  /* ── Event handlers ────────────────────────────────────────────────────── */

  const handleDayTap = (date: string) => {
    setDaySheetDate(date);
    setDaySheetOpen(true);
  };

  const handleNewEvent = () => {
    // Close day sheet, open new-event popup
    setDaySheetOpen(false);
    setModalDate(daySheetDate);
    setTimeout(() => setModalOpen(true), 200);
  };

  const handleEditEvent = (id: string) => {
    setSheetTarget({ mode: "edit", id });
    setSheetOpen(true);
  };

  const goToday = () => {
    setViewDate(new Date());
  };

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();

  // Months rendered: prev, current, next
  const months = useMemo(() => [-1, 0, 1].map((o) => addMonths(viewDate, o)), [viewDate]);

  const daySheetEvents = eventsForDate(daySheetDate, events);

  return (
    <div className="page-shell">

      {/* ── Header ───────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-4 pt-4 pb-3">
        <h1 className="text-xl font-bold tracking-tight">
          {formatDate(viewDate, { month: "long", year: "numeric" })}
        </h1>
        <button
          onClick={goToday}
          className="text-xs font-semibold text-accent hover:opacity-80 px-3 py-1.5 rounded-xl bg-accent/10 transition-opacity"
        >
          {t("today")}
        </button>
      </div>

      {/* ── Swipeable months ─────────────────────────────────────────────── */}
      {/*
        Layout: 3 month cards at 82% width each, with 9% padding on each side.
        When snapped to center card, ~9% of each adjacent card peeks at the edges.
        Adjacent months are faded (opacity:0.3) to emphasise the current month.
      */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="scrollbar-none"
        style={{
          display: "flex",
          overflowX: "scroll",
          scrollSnapType: "x mandatory",
          WebkitOverflowScrolling: "touch",
          paddingLeft: "9%",
          paddingRight: "9%",
          gap: "0",
          flex: "none",
        }}
      >
        {months.map((m, idx) => (
          <div
            key={`${m.getFullYear()}-${m.getMonth()}`}
            style={{
              flex: "0 0 82%",
              scrollSnapAlign: "center",
              scrollSnapStop: "always",
              padding: "0 4px",
            }}
          >
            <MonthGrid
              year={m.getFullYear()}
              month={m.getMonth()}
              events={events}
              onDayTap={handleDayTap}
              faded={idx !== 1}
              weekdayHeaders={weekdayHeaders}
              locale={locale}
            />
          </div>
        ))}
      </div>

      {/* Flex spacer */}
      <div className="flex-1" />

      {/* ── FAB ──────────────────────────────────────────────────────────── */}
      <button
        onClick={() => {
          setModalDate(todayKey());
          setModalOpen(true);
        }}
        aria-label={t("addEvent")}
        className="fixed bottom-24 right-6 w-14 h-14 rounded-full bg-accent text-accent-foreground shadow-float flex items-center justify-center transition-all hover:scale-110 active:scale-95 z-40"
      >
        <span className="text-2xl leading-none font-light">+</span>
      </button>

      {/* ── Day events bottom sheet ──────────────────────────────────────── */}
      <DayEventsSheet
        open={daySheetOpen}
        onOpenChange={setDaySheetOpen}
        date={daySheetDate}
        events={daySheetEvents}
        onEditEvent={handleEditEvent}
        onNewEvent={handleNewEvent}
      />

      {/* ── New event modal (centered popup) ────────────────────────────── */}
      <EventSheet
        open={modalOpen}
        onOpenChange={setModalOpen}
        target={modalOpen ? { mode: "new", date: modalDate } : null}
        variant="modal"
        onSaved={refreshEvents}
        onDeleted={refreshEvents}
      />

      {/* ── Edit event drawer ────────────────────────────────────────────── */}
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
