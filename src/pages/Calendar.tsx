import { useMemo, useState, useEffect, useCallback, useRef } from "react";
import { ChevronDown } from "lucide-react";
import { addWeeks, getDay, startOfMonth, startOfWeek } from "date-fns";
import { EventSheet, type EventSheetTarget } from "@/components/EventSheet";
import { DayEventsSheet } from "@/components/DayEventsSheet";
import { WeekEventList } from "@/components/WeekEventList";
import { WeekWheel } from "@/components/WeekWheel";
import { WeekNavSwipeHint } from "@/components/WeekNavSwipeHint";
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
import { getJapaneseHolidayName } from "@/lib/jp-holidays";
import {
  loadCalendarViewMode,
  loadWeekStartsOn,
  markWeekNavSwipeHintSeen,
  markWeekViewOpened,
  saveCalendarViewMode,
  saveWeekStartsOn,
  weekNavSwipeHintSeen,
  type CalendarViewMode,
  type WeekStartsOn,
} from "@/lib/calendar-prefs";
import {
  emitTutorial,
  isTutorialActive,
  isTutorialBlockingCalendarDays,
} from "@/lib/tutorial";

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

function toDateKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function weekDaysFromAnchor(anchor: Date, weekStartsOn: WeekStartsOn) {
  const start = startOfWeek(anchor, { weekStartsOn });
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
}

function weekKeyFromAnchor(anchor: Date, weekStartsOn: WeekStartsOn) {
  return toDateKey(startOfWeek(anchor, { weekStartsOn }));
}

const WEEK_HINT_SWIPE_PX = 32;

function selectedOffsetInWeek(weekDayKey: string, anchor: Date, weekStartsOn: WeekStartsOn) {
  const start = startOfWeek(anchor, { weekStartsOn });
  const [y, m, d] = weekDayKey.split("-").map(Number);
  const sel = new Date(y, m - 1, d);
  return Math.max(0, Math.min(6, Math.round((sel.getTime() - start.getTime()) / 86_400_000)));
}

interface MonthGridProps {
  year: number;
  month: number;
  events: CalendarEvent[];
  onDayTap: (date: string) => void;
  faded?: boolean;
  interactive?: boolean;
  weekdayHeaders: string[];
  locale: string;
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
  locale,
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
              <div className="flex items-center justify-center gap-0.5">
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
                {locale === "ja" && getJapaneseHolidayName(date) ? (
                  <span className="text-[9px] font-bold text-red-600 bg-red-500/15 px-1 py-px rounded leading-none">
                    祝
                  </span>
                ) : null}
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
                    {e.title}
                    {!e.allDay && e.startTime ? ` ${e.startTime}` : ""}
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
  const [goalsCollapseSignal, setGoalsCollapseSignal] = useState(0);
  const [blockDayTaps, setBlockDayTaps] = useState(false);
  const goalsCloseEmitted = useRef(false);
  const [calView, setCalView] = useState<CalendarViewMode>(() => loadCalendarViewMode());
  const [weekStartsOn, setWeekStartsOn] = useState<WeekStartsOn>(() => loadWeekStartsOn());
  const [weekAnchor, setWeekAnchor] = useState(() => new Date());
  const [weekNavHintOpen, setWeekNavHintOpen] = useState(
    () => loadCalendarViewMode() === "week" && !weekNavSwipeHintSeen(),
  );
  const [weekDayKey, setWeekDayKey] = useState(todayKey);
  const weekHintGesture = useRef({ active: false, startX: 0, startY: 0, maxDx: 0 });

  const refreshEvents = () => setEvents(loadEvents());
  useEffect(() => {
    refreshEvents();
  }, []);

  const onGoalsMinimizedChange = useCallback((m: boolean) => {
    setGoalsMinimized(m);
  }, []);

  const requestGoalsMinimize = useCallback(() => {
    setGoalsCollapseSignal((n) => n + 1);
  }, []);

  // Minimize month goals while editing / adding events.
  useEffect(() => {
    if (sheetOpen || modalOpen || daySheetOpen) {
      requestGoalsMinimize();
    }
  }, [sheetOpen, modalOpen, daySheetOpen, requestGoalsMinimize]);

  // Calendar swipe coach step: collapse goals + block day taps (swipe only).
  // monthGoalsClose: if already folded, advance once.
  useEffect(() => {
    const sync = () => {
      const step = document.documentElement.dataset.tutorialStep;
      const block = isTutorialBlockingCalendarDays();
      setBlockDayTaps(block);
      if (block) requestGoalsMinimize();
      if (step === "monthGoalsClose") {
        if (goalsMinimized && !goalsCloseEmitted.current) {
          goalsCloseEmitted.current = true;
          emitTutorial("goals-minimized");
        }
      } else {
        goalsCloseEmitted.current = false;
      }
    };
    sync();
    const id = window.setInterval(sync, 200);
    return () => window.clearInterval(id);
  }, [requestGoalsMinimize, goalsMinimized]);

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
    if (blockDayTaps || isTutorialBlockingCalendarDays()) return;
    setDaySheetDate(date);
    setDaySheetOpen(true);
  };

  const handleNewEvent = () => {
    setDaySheetOpen(false);
    setModalDate(daySheetDate);
    setTimeout(() => setModalOpen(true), 200);
  };

  const handleEditEvent = (id: string, occurrenceDate: string) => {
    setSheetTarget({ mode: "edit", id, occurrenceDate });
    setSheetOpen(true);
  };

  const goToday = () => {
    const now = new Date();
    setViewDate(now);
    setWeekAnchor(now);
    setWeekDayKey(todayKey());
    if (isTutorialActive()) emitTutorial("calendar-today");
  };

  const toggleCalView = () => {
    const next = calView === "month" ? "week" : "month";
    setCalView(next);
    saveCalendarViewMode(next);
    if (next === "week") {
      markWeekViewOpened();
      if (!weekNavSwipeHintSeen()) setWeekNavHintOpen(true);
      setWeekAnchor(viewDate);
      setWeekDayKey(todayKey());
    } else {
      setWeekNavHintOpen(false);
    }
  };

  useEffect(() => {
    if (calView === "week") markWeekViewOpened();
  }, [calView]);

  const weekDays = useMemo(
    () => weekDaysFromAnchor(weekAnchor, weekStartsOn),
    [weekAnchor, weekStartsOn],
  );

  const weekDayOffset = useMemo(
    () => selectedOffsetInWeek(weekDayKey, weekAnchor, weekStartsOn),
    [weekDayKey, weekAnchor, weekStartsOn],
  );

  const weekDayEvents = eventsForDate(weekDayKey, events);

  const onWeekStep = useCallback((delta: -1 | 1) => {
    setWeekAnchor((d) => {
      const next = addWeeks(d, delta);
      setViewDate(next);
      return next;
    });
    setWeekDayKey((key) => {
      const [y, m, day] = key.split("-").map(Number);
      const next = new Date(y, m - 1, day);
      next.setDate(next.getDate() + delta * 7);
      return toDateKey(next);
    });
  }, []);

  const applyPickedMonth = useCallback(
    (y: number, m: number) => {
      const d = new Date(y, m, 1);
      setViewDate(d);
      if (calView === "week") {
        setWeekAnchor(d);
        setWeekDayKey(toDateKey(d));
      }
      setPickerOpen(false);
    },
    [calView],
  );

  const dismissWeekNavHint = useCallback(() => {
    markWeekNavSwipeHintSeen();
    setWeekNavHintOpen(false);
  }, []);

  const onWeekHintPointerDownCapture = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!weekNavHintOpen) return;
      weekHintGesture.current = {
        active: true,
        startX: e.clientX,
        startY: e.clientY,
        maxDx: 0,
      };
    },
    [weekNavHintOpen],
  );

  const onWeekHintPointerMoveCapture = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const g = weekHintGesture.current;
      if (!weekNavHintOpen || !g.active) return;
      const dx = e.clientX - g.startX;
      const dy = e.clientY - g.startY;
      g.maxDx = Math.max(g.maxDx, Math.abs(dx));
      if (g.maxDx >= WEEK_HINT_SWIPE_PX && g.maxDx > Math.abs(dy) * 1.15) {
        g.active = false;
        dismissWeekNavHint();
      }
    },
    [weekNavHintOpen, dismissWeekNavHint],
  );

  const onWeekHintPointerEndCapture = useCallback(() => {
    weekHintGesture.current.active = false;
  }, []);

  const onMonthStep = useCallback((delta: -1 | 1) => {
    setViewDate((d) => addMonths(d, delta));
  }, []);

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();

  const monthOptions = Array.from({ length: 12 }, (_, i) => i);
  const yearOptions = Array.from({ length: 11 }, (_, i) => new Date().getFullYear() - 5 + i);

  return (
    <div className="page-shell flex flex-col">
      {/* Highlight span for calendar-swipe coach: month header → above FAB. */}
      <div
        data-tutorial="calendar-stage"
        className="flex-1 min-h-0 flex flex-col"
      >
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
                    onChange={(e) => applyPickedMonth(year, Number(e.target.value))}
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
                    onChange={(e) => applyPickedMonth(Number(e.target.value), month)}
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

          <div className="flex items-center gap-2 shrink-0 mr-1">
            <button
              type="button"
              onClick={toggleCalView}
              className="text-sm font-semibold text-accent hover:opacity-80 px-3 py-2 rounded-xl bg-accent/10 transition-opacity"
            >
              {calView === "month" ? t("calendarWeek") : t("calendarMonth")}
            </button>
            <button
              data-tutorial="calendar-today"
              onClick={goToday}
              className="text-sm font-semibold text-accent hover:opacity-80 px-4 py-2 rounded-xl bg-accent/10 transition-opacity"
            >
              {t("today")}
            </button>
          </div>
        </div>

        <div
          className={cn(
            "relative flex-1 min-h-0 pb-1",
            calView === "week" ? "px-2" : "px-3",
          )}
        >
          {calView === "week" ? (
            <div
              className="relative h-full mt-3"
              onPointerDownCapture={onWeekHintPointerDownCapture}
              onPointerMoveCapture={onWeekHintPointerMoveCapture}
              onPointerUpCapture={onWeekHintPointerEndCapture}
              onPointerCancelCapture={onWeekHintPointerEndCapture}
            >
              <WeekWheel
              weekKey={weekKeyFromAnchor(weekAnchor, weekStartsOn)}
              disabled={overlayOpen}
              onWeekStep={onWeekStep}
            >
              {(rel, { faded }) => {
                const anchor = addWeeks(weekAnchor, rel);
                const days = weekDaysFromAnchor(anchor, weekStartsOn);
                const activeDay = days[weekDayOffset] ?? days[0];
                const activeKey = toDateKey(activeDay);
                const dayEvents = rel === 0 ? weekDayEvents : eventsForDate(activeKey, events);
                const interactive = rel === 0 && !faded;

                return (
                  <div
                    className={cn(
                      "h-full flex flex-col bg-card rounded-2xl shadow-card overflow-hidden",
                      faded && "pointer-events-none",
                    )}
                  >
                    <div className="shrink-0 px-3 pt-2 pb-1">
                      <p className="text-sm font-semibold text-center">
                        {formatDate(days[0], { month: "short", day: "numeric" })}
                        {" – "}
                        {formatDate(days[6], { month: "short", day: "numeric" })}
                      </p>
                    </div>
                    <div className="shrink-0 flex gap-1 px-2 py-2">
                      <button
                        type="button"
                        disabled={!interactive}
                        onClick={() => {
                          setWeekStartsOn(0);
                          saveWeekStartsOn(0);
                        }}
                        className={cn(
                          "flex-1 text-[11px] rounded-lg py-1",
                          weekStartsOn === 0
                            ? "bg-accent/15 text-accent font-semibold"
                            : "text-muted-foreground",
                        )}
                      >
                        {t("weekStartSunday")}
                      </button>
                      <button
                        type="button"
                        disabled={!interactive}
                        onClick={() => {
                          setWeekStartsOn(1);
                          saveWeekStartsOn(1);
                        }}
                        className={cn(
                          "flex-1 text-[11px] rounded-lg py-1",
                          weekStartsOn === 1
                            ? "bg-accent/15 text-accent font-semibold"
                            : "text-muted-foreground",
                        )}
                      >
                        {t("weekStartMonday")}
                      </button>
                    </div>
                    <div className="shrink-0 grid grid-cols-7 px-1 pb-2">
                      {days.map((d) => {
                        const key = toDateKey(d);
                        const selected = key === (rel === 0 ? weekDayKey : activeKey);
                        const isToday = key === todayKey();
                        const wd = d.toLocaleDateString(locale === "ja" ? "ja-JP" : "en-US", {
                          weekday: "short",
                        });
                        return (
                          <button
                            key={key}
                            type="button"
                            disabled={!interactive}
                            onClick={() => setWeekDayKey(key)}
                            className="flex flex-col items-center gap-0.5 py-1"
                          >
                            <span className="text-[10px] text-muted-foreground">{wd}</span>
                            <span
                              className={cn(
                                "w-8 h-8 rounded-full text-sm font-semibold inline-flex items-center justify-center",
                                selected && "bg-accent text-accent-foreground",
                                !selected && isToday && "text-accent",
                              )}
                            >
                              {d.getDate()}
                            </span>
                            {locale === "ja" && getJapaneseHolidayName(key) ? (
                              <span className="text-[9px] font-bold text-red-600 bg-red-500/15 px-1 py-px rounded leading-none">
                                祝
                              </span>
                            ) : (
                              <span className="h-2.5" />
                            )}
                          </button>
                        );
                      })}
                    </div>
                    <WeekEventList
                      date={rel === 0 ? weekDayKey : activeKey}
                      events={dayEvents}
                      onOpenEvent={(id, occurrenceDate) => {
                        if (!interactive) return;
                        handleEditEvent(id, occurrenceDate);
                      }}
                    />
                  </div>
                );
              }}
            </WeekWheel>
              {weekNavHintOpen ? <WeekNavSwipeHint /> : null}
            </div>
          ) : (
            <MonthWheel
              monthKey={monthKeyOf(viewDate)}
              disabled={overlayOpen}
              onMonthStep={onMonthStep}
              onInteractionStart={requestGoalsMinimize}
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
                    interactive={rel === 0 && !faded && !blockDayTaps}
                    weekdayHeaders={weekdayHeaders}
                    locale={locale}
                  />
                );
              }}
            </MonthWheel>
          )}

          {calView === "month" && (
            <div
              className="absolute top-0 left-3 right-3 z-20 pointer-events-none"
              style={goalsMinimized ? undefined : { height: "15%" }}
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
                collapseSignal={goalsCollapseSignal}
              />
            </div>
            </div>
          )}
        </div>
      </div>

      <FabButton
        disabled={blockDayTaps}
        onClick={() => {
          if (blockDayTaps || isTutorialBlockingCalendarDays()) return;
          setModalDate(calView === "week" ? weekDayKey : todayKey());
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
