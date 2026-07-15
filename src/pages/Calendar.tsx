import { useMemo, useState, useEffect, useRef, useLayoutEffect, useCallback } from "react";
import { ChevronDown } from "lucide-react";
import { getDay, startOfMonth } from "date-fns";
import { EventSheet, type EventSheetTarget } from "@/components/EventSheet";
import { DayEventsSheet } from "@/components/DayEventsSheet";
import { FabButton } from "@/components/FabButton";
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

interface MonthGridProps {
  year: number;
  month: number;
  events: CalendarEvent[];
  onDayTap: (date: string) => void;
  faded?: boolean;
  weekdayHeaders: string[];
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
        "bg-card rounded-2xl shadow-card overflow-hidden w-full month-grid-fade",
        faded ? "opacity-35 pointer-events-none" : "opacity-100"
      )}
    >
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
            className="min-h-[78px] border-b border-r border-border/40"
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
              onClick={() => onDayTap(date)}
              className={cn(
                "min-h-[78px] p-1 text-left border-b border-r border-border/40 flex flex-col gap-0.5 transition-colors hover:bg-secondary/40 active:bg-secondary/60",
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

  const refreshEvents = () => setEvents(loadEvents());
  useEffect(() => { refreshEvents(); }, []);

  const scrollRef = useRef<HTMLDivElement>(null);
  const scrollBlockedRef = useRef(false);
  const scrollEndTimerRef = useRef<number>();
  const [isScrolling, setIsScrolling] = useState(false);
  const [viewportH, setViewportH] = useState(0);

  const overlayOpen = daySheetOpen || sheetOpen || modalOpen;
  const peekPx = viewportH / 15;
  const panelStride = viewportH + peekPx * 2;

  const measureViewport = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setViewportH(el.clientHeight);
  }, []);

  useLayoutEffect(() => {
    measureViewport();
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(measureViewport);
    ro.observe(el);
    return () => ro.disconnect();
  }, [measureViewport]);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el || overlayOpen || panelStride === 0) return;
    scrollBlockedRef.current = true;
    el.style.scrollBehavior = "auto";
    el.scrollTop = panelStride;
    requestAnimationFrame(() => {
      el.style.scrollBehavior = "";
      scrollBlockedRef.current = false;
      setIsScrolling(false);
    });
  }, [viewDate, overlayOpen, panelStride]);

  const snapToNearest = useCallback(() => {
    const el = scrollRef.current;
    if (!el || overlayOpen || panelStride === 0) return;

    const nearest = Math.max(0, Math.min(2, Math.round(el.scrollTop / panelStride)));

    scrollBlockedRef.current = true;
    el.style.scrollBehavior = "smooth";
    el.scrollTop = nearest * panelStride;

    window.setTimeout(() => {
      el.style.scrollBehavior = "";
      scrollBlockedRef.current = false;
      setIsScrolling(false);
      if (nearest === 0) setViewDate((d) => addMonths(d, -1));
      else if (nearest === 2) setViewDate((d) => addMonths(d, +1));
    }, 260);
  }, [overlayOpen, panelStride]);

  const handleScroll = useCallback(() => {
    if (overlayOpen || scrollBlockedRef.current) return;
    setIsScrolling(true);
    clearTimeout(scrollEndTimerRef.current);
    scrollEndTimerRef.current = window.setTimeout(snapToNearest, 100);
  }, [overlayOpen, snapToNearest]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScrollEnd = () => {
      if (!scrollBlockedRef.current) snapToNearest();
    };
    el.addEventListener("scrollend", onScrollEnd);
    return () => el.removeEventListener("scrollend", onScrollEnd);
  }, [snapToNearest]);

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

  const months = useMemo(() => [-1, 0, 1].map((o) => addMonths(viewDate, o)), [viewDate]);
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

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();

  const monthOptions = Array.from({ length: 12 }, (_, i) => i);
  const yearOptions = Array.from({ length: 11 }, (_, i) => new Date().getFullYear() - 5 + i);

  return (
    <div className="page-shell flex flex-col">
      {/* Header */}
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

      {/* Vertical month carousel */}
      <div className="flex-1 min-h-0 px-3 pb-1">
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="h-full month-carousel overflow-y-auto scrollbar-none"
        >
          {months.map((m, idx) => (
            <div
              key={`${m.getFullYear()}-${m.getMonth()}`}
              className="month-carousel-panel"
              style={{ minHeight: panelStride || "100%" }}
            >
              <div style={{ height: peekPx || 0 }} className="shrink-0" aria-hidden />
              <div
                className="shrink-0 flex items-center justify-center px-0.5"
                style={{ height: viewportH || undefined, minHeight: viewportH || undefined }}
              >
                <MonthGrid
                  year={m.getFullYear()}
                  month={m.getMonth()}
                  events={events}
                  onDayTap={handleDayTap}
                  faded={isScrolling || idx !== 1}
                  weekdayHeaders={weekdayHeaders}
                />
              </div>
              <div style={{ height: peekPx || 0 }} className="shrink-0" aria-hidden />
            </div>
          ))}
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
