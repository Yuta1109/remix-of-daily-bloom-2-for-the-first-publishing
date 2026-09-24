import { useMemo, useState, useEffect, useLayoutEffect, useCallback, useRef } from "react";
import { ChevronDown, Minus, Plus, RotateCcw, RotateCw, Sticker, Trash2 } from "lucide-react";
import { addWeeks, startOfWeek } from "date-fns";
import { EventSheet, type EventSheetTarget } from "@/components/EventSheet";
import { CalendarDaySheet } from "@/components/calendar/CalendarDaySheet";
import { CalendarStampLayer } from "@/components/calendar/CalendarStampLayer";
import { DayWallpaperLayer } from "@/components/calendar/DayWallpaperLayer";
import { StampGlyph } from "@/components/calendar/StampGlyph";
import { StampTray } from "@/components/calendar/StampTray";
import { WallpaperPickerSheet } from "@/components/calendar/WallpaperPickerSheet";
import { WeekEventList } from "@/components/WeekEventList";
import { WeekWheel } from "@/components/WeekWheel";
import { WeekNavSwipeHint } from "@/components/WeekNavSwipeHint";
import { FabButton } from "@/components/FabButton";
import { MonthWheel } from "@/components/MonthWheel";
import { UserButton } from "@/components/UserButton";
import { DailyTaskSheet, type DailyTaskSheetRequest } from "@/components/plan/DailyTaskSheet";
import {
  loadEvents,
  eventsForDate,
  eventsInRange,
  colorHslFor,
  type CalendarEvent,
} from "@/lib/events-store";
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
import { getThemeAccentOption, type ThemeAccentId } from "@/lib/theme-accent";
import { tickHaptic } from "@/lib/haptics";
import {
  localDateFromPoint,
  normalizedPointInDateCell,
} from "@/lib/calendar-stamp-drag";
import {
  addMonths as addLocalMonths,
  daysInMonth as localDaysInMonth,
  endOfMonth,
  startOfMonth,
  toLocalDate,
  todayLocalDate,
  type LocalDate,
} from "@/lib/v3/local-date";
import {
  calendarCellMarkers,
  calendarTasksForDate,
  calendarTasksInRange,
  ensureCalendarVisibleOccurrences,
  monthGridLeadingBlanks,
} from "@/lib/v3/calendar-view";
import {
  createStamp,
  countActivity,
  deleteStamp,
  getAppearancesInRange,
  getStamp,
  getStampsInRange,
  getWallpaperForDate,
  recordActivity,
  setWallpaperForDate,
  updateStamp,
} from "@/lib/v3/repository";
import { stampDefinition } from "@/lib/v3/stamp-catalog";
import { STAMP_DRAG_THRESHOLD } from "@/lib/v3/stamp-coords";
import type { CalendarStamp, TaskItem } from "@/lib/v3/types";

function addMonths(date: Date, n: number) {
  return new Date(date.getFullYear(), date.getMonth() + n, 1);
}

function monthKeyOf(d: Date) {
  return `${d.getFullYear()}-${d.getMonth()}`;
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
  return toLocalDate(startOfWeek(anchor, { weekStartsOn }));
}

const WEEK_HINT_SWIPE_PX = 32;

function selectedOffsetInWeek(weekDayKey: string, anchor: Date, weekStartsOn: WeekStartsOn) {
  const start = startOfWeek(anchor, { weekStartsOn });
  const [y, m, d] = weekDayKey.split("-").map(Number);
  const sel = new Date(y, m - 1, d);
  return Math.max(0, Math.min(6, Math.round((sel.getTime() - start.getTime()) / 86_400_000)));
}

function weekdayHeadersFor(weekStartsOn: WeekStartsOn, locale: string) {
  return Array.from({ length: 7 }, (_, i) => {
    const ref = new Date(2024, 0, 7 + weekStartsOn + i);
    return ref.toLocaleDateString(locale === "ja" ? "ja-JP" : "en-US", {
      weekday: "short",
    });
  });
}

interface MonthGridProps {
  year: number;
  month: number;
  events: CalendarEvent[];
  tasksByDate: Map<LocalDate, TaskItem[]>;
  wallpapersByDate: Map<LocalDate, string>;
  stampsByDate: Map<LocalDate, CalendarStamp[]>;
  onDayTap: (date: string) => void;
  faded?: boolean;
  interactive?: boolean;
  weekdayHeaders: string[];
  weekStartsOn: WeekStartsOn;
  locale: string;
  selectedDate?: string;
  dropDate?: string | null;
  selectedStampId?: string;
  onStampSelect: (id: string) => void;
  onStampMovePointerDown: (
    stamp: CalendarStamp,
    event: React.PointerEvent<HTMLButtonElement>,
  ) => void;
  className?: string;
}

function MonthGrid({
  year,
  month,
  events,
  tasksByDate,
  wallpapersByDate,
  stampsByDate,
  onDayTap,
  faded,
  interactive = true,
  weekdayHeaders,
  weekStartsOn,
  locale,
  selectedDate,
  dropDate,
  selectedStampId,
  onStampSelect,
  onStampMovePointerDown,
  className,
}: MonthGridProps) {
  const { t, formatDateStr } = useI18n();
  const today = todayLocalDate();
  const days = useMemo(() => {
    const total = localDaysInMonth(year, month + 1);
    return Array.from({ length: total }, (_, i) =>
      `${year}-${String(month + 1).padStart(2, "0")}-${String(i + 1).padStart(2, "0")}`,
    );
  }, [year, month]);
  const firstDayOffset = monthGridLeadingBlanks(year, month, weekStartsOn);

  const monthEvents = useMemo(() => {
    if (!days.length) return new Map<string, CalendarEvent[]>();
    return eventsInRange(days[0], days[days.length - 1], events);
  }, [days, events]);

  return (
    <div
      className={cn(
        "bg-card rounded-2xl shadow-card overflow-hidden w-full h-full flex flex-col month-grid-fade",
        faded ? "opacity-40 pointer-events-none" : "opacity-100",
        className,
      )}
    >
      <div className="grid grid-cols-7 border-b border-border/60 bg-secondary/30 shrink-0">
        {weekdayHeaders.map((d, i) => {
          const weekday = (weekStartsOn + i) % 7;
          return (
            <div
              key={i}
              className={cn(
                "text-center text-[11px] font-semibold py-2 uppercase tracking-wide",
                weekday === 0 && "text-red-500",
                weekday === 6 && "text-blue-500",
                weekday !== 0 && weekday !== 6 && "text-muted-foreground",
              )}
            >
              {d}
            </div>
          );
        })}
      </div>
      <div className="grid grid-cols-7 auto-rows-fr flex-1 min-h-0">
        {Array.from({ length: firstDayOffset }).map((_, i) => (
          <div
            key={`empty-${i}`}
            className="min-h-0 border-b border-r border-border/40"
          />
        ))}
        {days.map((date, idx) => {
          const dayNum = parseInt(date.split("-")[2], 10);
          const col = (firstDayOffset + idx) % 7;
          const weekday = (weekStartsOn + col) % 7;
          const isToday = date === today;
          const isSelected = date === selectedDate;
          const dayEvents = monthEvents.get(date) ?? [];
          const dayTasks = tasksByDate.get(date) ?? [];
          const markers = calendarCellMarkers(dayTasks, dayEvents);
          const dateLabel = formatDateStr(date, {
            weekday: "long",
            month: "long",
            day: "numeric",
          });
          const a11y = [
            dateLabel,
            isToday ? t("today") : null,
            isSelected ? t("calendarA11ySelected") : null,
            markers.taskCount
              ? `${markers.taskCount} ${t("calendarA11yTasks")}`
              : null,
            markers.eventCount
              ? `${markers.eventCount} ${t("calendarA11yEvents")}`
              : null,
          ]
            .filter(Boolean)
            .join(", ");

          const dayStamps = stampsByDate.get(date) ?? [];
          const wallpaperId = wallpapersByDate.get(date);
          const isDrop = dropDate === date;

          return (
            <div
              key={date}
              data-calendar-date={date}
              className={cn(
                "relative min-h-0 border-b border-r border-border/40",
                col === 6 && "border-r-0",
                isSelected && "bg-accent/10",
                isDrop && "ring-1 ring-inset ring-accent bg-accent/15",
              )}
            >
              <DayWallpaperLayer wallpaperId={wallpaperId} />
              <button
                type="button"
                disabled={!interactive || faded}
                onClick={() => onDayTap(date)}
                aria-label={a11y}
                aria-current={isToday ? "date" : undefined}
                aria-pressed={isSelected}
                className={cn(
                  "relative z-10 w-full h-full min-h-0 p-1 text-left flex flex-col gap-0.5 transition-colors",
                  interactive && !faded && "hover:bg-secondary/30 active:bg-secondary/50",
                )}
              >
              <div className="flex items-center justify-center gap-0.5">
                <span
                  className={cn(
                    "inline-flex items-center justify-center text-[11px] font-semibold w-6 h-6 rounded-full",
                    isToday && "text-accent ring-1 ring-accent/55",
                    !isToday && weekday === 0 && "text-red-500",
                    !isToday && weekday === 6 && "text-blue-500",
                    !isToday && weekday !== 0 && weekday !== 6 && "text-foreground",
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
              <div className="flex-1 flex flex-col items-center justify-start gap-[3px] pt-0.5 min-h-0 overflow-hidden">
                {markers.taskColors.length > 0 && (
                  <div className="flex items-center justify-center gap-[2px]">
                    {markers.taskColors.map((color, i) => {
                      const accent = getThemeAccentOption(color as ThemeAccentId);
                      return (
                        <span
                          key={`t-${date}-${i}`}
                          className="w-[5px] h-[5px] rounded-[1px]"
                          style={{
                            backgroundColor: `hsl(${accent.accent} / ${markers.taskCompleted[i] ? 0.35 : 0.85})`,
                          }}
                          aria-hidden="true"
                        />
                      );
                    })}
                    {markers.allTasksComplete ? (
                      <span className="text-[8px] leading-none text-accent" aria-hidden="true">
                        ✓
                      </span>
                    ) : null}
                  </div>
                )}
                {markers.shownEventCount > 0 && (
                  <div className="flex items-center justify-center gap-[2px]">
                    {Array.from({ length: markers.shownEventCount }).map((_, i) => {
                      const ev = dayEvents[i];
                      return (
                        <span
                          key={`e-${date}-${i}`}
                          className="w-[5px] h-[5px] rounded-full"
                          style={{
                            backgroundColor: `hsl(${colorHslFor(ev?.color)})`,
                          }}
                          aria-hidden="true"
                        />
                      );
                    })}
                  </div>
                )}
              </div>
              </button>
              <CalendarStampLayer
                stamps={dayStamps}
                selectedId={selectedStampId}
                interactive={interactive && !faded}
                onSelect={onStampSelect}
                onMovePointerDown={onStampMovePointerDown}
              />
            </div>
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
  const [, setTaskRev] = useState(0);
  const [pickerOpen, setPickerOpen] = useState(false);

  const [daySheetOpen, setDaySheetOpen] = useState(false);
  const [daySheetDate, setDaySheetDate] = useState<string>(todayLocalDate());

  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetTarget, setSheetTarget] = useState<EventSheetTarget | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [modalDate, setModalDate] = useState<string>(todayLocalDate());
  const [blockDayTaps, setBlockDayTaps] = useState(false);
  const [calView, setCalView] = useState<CalendarViewMode>(() => loadCalendarViewMode());
  const [weekStartsOn, setWeekStartsOn] = useState<WeekStartsOn>(() => loadWeekStartsOn());
  const [weekAnchor, setWeekAnchor] = useState(() => new Date());
  const [weekNavHintOpen, setWeekNavHintOpen] = useState(
    () => loadCalendarViewMode() === "week" && !weekNavSwipeHintSeen(),
  );
  const [weekDayKey, setWeekDayKey] = useState(todayLocalDate);
  const weekHintGesture = useRef({ active: false, startX: 0, startY: 0, maxDx: 0 });
  const reopenDayRef = useRef(false);

  const [taskSheetRequest, setTaskSheetRequest] = useState<DailyTaskSheetRequest | null>(null);
  const [, setDecoRev] = useState(0);
  const refreshDecorations = useCallback(() => setDecoRev((n) => n + 1), []);
  const [stampTrayOpen, setStampTrayOpen] = useState(false);
  const [wallpaperPickerOpen, setWallpaperPickerOpen] = useState(false);
  const [selectedStampId, setSelectedStampId] = useState<string | null>(null);
  const [dropDate, setDropDate] = useState<string | null>(null);
  const [dragGhost, setDragGhost] = useState<{
    definitionId: string;
    x: number;
    y: number;
  } | null>(null);
  const stampMovedRef = useRef(false);
  const dragDefRef = useRef<string | null>(null);

  const refreshEvents = () => setEvents(loadEvents());
  const refreshTasks = useCallback(() => setTaskRev((n) => n + 1), []);
  useEffect(() => {
    refreshEvents();
  }, []);

  useEffect(() => {
    const today = todayLocalDate();
    if (countActivity("calendar_viewed", today) === 0) {
      recordActivity({ type: "calendar_viewed", localDate: today });
    }
  }, []);

  useEffect(() => {
    const sync = () => {
      setBlockDayTaps(isTutorialBlockingCalendarDays());
    };
    sync();
    const id = window.setInterval(sync, 200);
    return () => window.clearInterval(id);
  }, []);

  const overlayOpen =
    daySheetOpen ||
    sheetOpen ||
    modalOpen ||
    !!taskSheetRequest ||
    wallpaperPickerOpen;
  const stampInteraction = stampTrayOpen || !!dragGhost;

  const weekdayHeaders = useMemo(
    () => weekdayHeadersFor(weekStartsOn, locale),
    [locale, weekStartsOn],
  );

  const months = useMemo(
    () => [-1, 0, 1].map((o) => addMonths(viewDate, o)),
    [viewDate],
  );

  const viewMonthStart = startOfMonth(toLocalDate(viewDate));
  const adjacentStart = startOfMonth(addLocalMonths(viewMonthStart, -1));
  const adjacentEnd = endOfMonth(addLocalMonths(viewMonthStart, 1));

  const calendarSeriesRange = useMemo(() => {
    if (calView === "week") {
      const days = weekDaysFromAnchor(weekAnchor, weekStartsOn);
      return { from: toLocalDate(days[0]), to: toLocalDate(days[6]) };
    }
    return { from: viewMonthStart, to: endOfMonth(viewMonthStart) };
  }, [calView, viewMonthStart, weekAnchor, weekStartsOn]);

  useLayoutEffect(() => {
    ensureCalendarVisibleOccurrences(calendarSeriesRange.from, calendarSeriesRange.to);
    refreshTasks();
  }, [calendarSeriesRange, refreshTasks]);

  const tasksByDate = calendarTasksInRange(adjacentStart, adjacentEnd);
  const appearancesByDate = getAppearancesInRange(adjacentStart, adjacentEnd);
  const wallpapersByDate = new Map<LocalDate, string>();
  for (const [date, appearance] of appearancesByDate) {
    if (appearance.wallpaperId) wallpapersByDate.set(date, appearance.wallpaperId);
  }
  const stampsByDate = getStampsInRange(adjacentStart, adjacentEnd);

  const daySheetEvents = eventsForDate(daySheetDate, events);
  const daySheetTasks = calendarTasksForDate(daySheetDate);

  const handleDayTap = (date: string) => {
    if (blockDayTaps || isTutorialBlockingCalendarDays()) return;
    setSelectedStampId(null);
    setDaySheetDate(date);
    setDaySheetOpen(true);
  };

  const openNewEvent = (date: string, reopenDay: boolean) => {
    reopenDayRef.current = reopenDay;
    setDaySheetOpen(false);
    setModalDate(date);
    setTimeout(() => setModalOpen(true), 200);
  };

  const openNewTask = (date: string, reopenDay: boolean) => {
    reopenDayRef.current = reopenDay;
    setDaySheetOpen(false);
    setTimeout(() => {
      setTaskSheetRequest({ mode: "create", date, createdFrom: "calendar" });
    }, 200);
  };

  const openEditTask = (taskId: string, reopenDay: boolean) => {
    reopenDayRef.current = reopenDay;
    setDaySheetOpen(false);
    setTimeout(() => {
      setTaskSheetRequest({ mode: "edit", taskId });
    }, 200);
  };

  const handleEditEvent = (id: string, occurrenceDate: string, reopenDay = false) => {
    reopenDayRef.current = reopenDay;
    setSheetTarget({ mode: "edit", id, occurrenceDate });
    setSheetOpen(true);
  };

  const maybeReopenDay = () => {
    if (!reopenDayRef.current) return;
    reopenDayRef.current = false;
    setTimeout(() => setDaySheetOpen(true), 200);
  };

  const setStampDraggingFlag = (on: boolean) => {
    if (on) document.documentElement.dataset.stampDragging = "1";
    else delete document.documentElement.dataset.stampDragging;
  };

  useEffect(() => {
    return () => setStampDraggingFlag(false);
  }, []);

  const clearDrag = () => {
    setDragGhost(null);
    setDropDate(null);
    setStampDraggingFlag(false);
  };

  const dropNewStamp = (definitionId: string, clientX: number, clientY: number) => {
    const date = localDateFromPoint(clientX, clientY);
    if (!date) {
      clearDrag();
      return;
    }
    const coords = normalizedPointInDateCell(clientX, clientY, date) ?? { x: 0.5, y: 0.68 };
    createStamp({
      date,
      stampDefinitionId: definitionId,
      x: coords.x,
      y: coords.y,
    });
    void tickHaptic();
    refreshDecorations();
    clearDrag();
  };

  const onStampSelect = (id: string) => {
    if (stampMovedRef.current) {
      stampMovedRef.current = false;
      return;
    }
    setSelectedStampId((cur) => (cur === id ? null : id));
  };

  const onStampMovePointerDown = (
    stamp: CalendarStamp,
    event: React.PointerEvent<HTMLButtonElement>,
  ) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    const pointerId = event.pointerId;
    const startX = event.clientX;
    const startY = event.clientY;
    let moved = false;

    const onMove = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return;
      if (!moved) {
        if (Math.hypot(ev.clientX - startX, ev.clientY - startY) < STAMP_DRAG_THRESHOLD) return;
        moved = true;
        stampMovedRef.current = true;
        setStampDraggingFlag(true);
        setDragGhost({
          definitionId: stamp.stampDefinitionId,
          x: ev.clientX,
          y: ev.clientY,
        });
      } else {
        setDragGhost({
          definitionId: stamp.stampDefinitionId,
          x: ev.clientX,
          y: ev.clientY,
        });
        setDropDate(localDateFromPoint(ev.clientX, ev.clientY));
      }
    };

    const onUp = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return;
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      if (!moved) return;
      const date = localDateFromPoint(ev.clientX, ev.clientY);
      if (date) {
        const coords = normalizedPointInDateCell(ev.clientX, ev.clientY, date) ?? {
          x: stamp.x,
          y: stamp.y,
        };
        updateStamp(stamp.id, { date, x: coords.x, y: coords.y });
        void tickHaptic();
        refreshDecorations();
      }
      clearDrag();
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  };

  const openWallpaperPicker = (reopenDay: boolean) => {
    reopenDayRef.current = reopenDay;
    setDaySheetOpen(false);
    setTimeout(() => setWallpaperPickerOpen(true), 200);
  };

  const selectedStamp = selectedStampId ? getStamp(selectedStampId) : undefined;

  const goToday = () => {
    const now = new Date();
    setViewDate(now);
    setWeekAnchor(now);
    setWeekDayKey(todayLocalDate());
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
      setWeekDayKey(todayLocalDate());
    } else {
      setWeekNavHintOpen(false);
    }
  };

  useEffect(() => {
    if (calView === "week") markWeekViewOpened();
  }, [calView]);

  const weekDayOffset = useMemo(
    () => selectedOffsetInWeek(weekDayKey, weekAnchor, weekStartsOn),
    [weekDayKey, weekAnchor, weekStartsOn],
  );

  const weekDayEvents = eventsForDate(weekDayKey, events);
  const weekDayTasks = calendarTasksForDate(weekDayKey);

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
      return toLocalDate(next);
    });
  }, []);

  const applyPickedMonth = useCallback(
    (y: number, m: number) => {
      const d = new Date(y, m, 1);
      setViewDate(d);
      if (calView === "week") {
        setWeekAnchor(d);
        setWeekDayKey(toLocalDate(d));
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
    <div className="app-shell-page">
      <div
        data-tutorial="calendar-stage"
        className="flex-1 min-h-0 flex flex-col"
      >
        <div className="app-shell-header shrink-0 flex items-center justify-between pl-4 pr-3 pb-2">
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
                  pickerOpen && "rotate-180",
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

          <div className="flex items-center gap-1.5 shrink-0 mr-1">
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
              className="text-sm font-semibold text-accent hover:opacity-80 px-3 py-2 rounded-xl bg-accent/10 transition-opacity"
            >
              {t("today")}
            </button>
            <button
              type="button"
              aria-label={t("calendarStamps")}
              aria-pressed={stampTrayOpen}
              onClick={() => {
                setSelectedStampId(null);
                setStampTrayOpen((v) => !v);
              }}
              className={cn(
                "inline-flex items-center justify-center w-9 h-9 rounded-xl transition-colors",
                stampTrayOpen
                  ? "bg-accent text-accent-foreground"
                  : "text-accent bg-accent/10 hover:opacity-80",
              )}
            >
              <Sticker className="w-5 h-5" strokeWidth={1.8} aria-hidden="true" />
            </button>
            <UserButton />
          </div>
        </div>

        {selectedStamp ? (
          <div className="flex items-center gap-1 px-4 pb-2">
            <button
              type="button"
              aria-label={t("calendarStampRotateLeft")}
              className="w-8 h-8 rounded-lg bg-secondary/70 flex items-center justify-center"
              onClick={() => {
                updateStamp(selectedStamp.id, { rotation: selectedStamp.rotation - 15 });
                refreshDecorations();
              }}
            >
              <RotateCcw className="w-4 h-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              aria-label={t("calendarStampRotateRight")}
              className="w-8 h-8 rounded-lg bg-secondary/70 flex items-center justify-center"
              onClick={() => {
                updateStamp(selectedStamp.id, { rotation: selectedStamp.rotation + 15 });
                refreshDecorations();
              }}
            >
              <RotateCw className="w-4 h-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              aria-label={t("calendarStampScaleDown")}
              className="w-8 h-8 rounded-lg bg-secondary/70 flex items-center justify-center"
              onClick={() => {
                updateStamp(selectedStamp.id, { scale: selectedStamp.scale - 0.15 });
                refreshDecorations();
              }}
            >
              <Minus className="w-4 h-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              aria-label={t("calendarStampScaleUp")}
              className="w-8 h-8 rounded-lg bg-secondary/70 flex items-center justify-center"
              onClick={() => {
                updateStamp(selectedStamp.id, { scale: selectedStamp.scale + 0.15 });
                refreshDecorations();
              }}
            >
              <Plus className="w-4 h-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              aria-label={t("calendarStampDelete")}
              className="w-8 h-8 rounded-lg bg-secondary/70 flex items-center justify-center text-red-600 ml-auto"
              onClick={() => {
                deleteStamp(selectedStamp.id);
                setSelectedStampId(null);
                refreshDecorations();
              }}
            >
              <Trash2 className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
        ) : null}

        <div
          className={cn(
            "relative flex-1 min-h-0",
            calView === "week" ? "px-2" : "px-3",
          )}
          style={{
            paddingBottom: stampTrayOpen
              ? "calc(var(--bottom-nav-offset) + 92px)"
              : "var(--bottom-nav-offset)",
          }}
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
                lockSwipe={stampInteraction}
                onWeekStep={onWeekStep}
              >
                {(rel, { faded }) => {
                  const anchor = addWeeks(weekAnchor, rel);
                  const days = weekDaysFromAnchor(anchor, weekStartsOn);
                  const activeDay = days[weekDayOffset] ?? days[0];
                  const activeKey = toLocalDate(activeDay);
                  const listKey = rel === 0 ? weekDayKey : activeKey;
                  const dayEvents = rel === 0 ? weekDayEvents : eventsForDate(listKey, events);
                  const dayTasks = rel === 0 ? weekDayTasks : calendarTasksForDate(listKey);
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
                          const key = toLocalDate(d);
                          const selected = key === (rel === 0 ? weekDayKey : activeKey);
                          const isToday = key === todayLocalDate();
                          const wd = d.toLocaleDateString(locale === "ja" ? "ja-JP" : "en-US", {
                            weekday: "short",
                          });
                          const cellTasks = tasksByDate.get(key) ?? calendarTasksForDate(key);
                          const cellEvents = eventsForDate(key, events);
                          const markers = calendarCellMarkers(cellTasks, cellEvents);
                          const cellWallpaper = wallpapersByDate.get(key);
                          const cellStamps = stampsByDate.get(key) ?? [];
                          return (
                            <div
                              key={key}
                              data-calendar-date={key}
                              className={cn(
                                "relative rounded-xl overflow-hidden",
                                dropDate === key && "ring-1 ring-accent bg-accent/10",
                              )}
                            >
                              <DayWallpaperLayer wallpaperId={cellWallpaper} className="rounded-xl" />
                            <button
                              type="button"
                              disabled={!interactive}
                              onClick={() => {
                                setWeekDayKey(key);
                                if (!blockDayTaps && !isTutorialBlockingCalendarDays()) {
                                  setDaySheetDate(key);
                                }
                              }}
                              aria-label={[
                                formatDate(d, {
                                  weekday: "long",
                                  month: "long",
                                  day: "numeric",
                                }),
                                isToday ? t("today") : null,
                                selected ? t("calendarA11ySelected") : null,
                              ]
                                .filter(Boolean)
                                .join(", ")}
                              aria-pressed={selected}
                              aria-current={isToday ? "date" : undefined}
                              className="relative z-10 flex flex-col items-center gap-0.5 py-1 min-h-[44px] w-full"
                            >
                              <span className="text-[10px] text-muted-foreground">{wd}</span>
                              <span
                                className={cn(
                                  "w-8 h-8 rounded-full text-sm font-semibold inline-flex items-center justify-center",
                                  selected && "bg-accent text-accent-foreground",
                                  !selected && isToday && "text-accent ring-1 ring-accent/55",
                                )}
                              >
                                {d.getDate()}
                              </span>
                              {locale === "ja" && getJapaneseHolidayName(key) ? (
                                <span className="text-[9px] font-bold text-red-600 bg-red-500/15 px-1 py-px rounded leading-none">
                                  祝
                                </span>
                              ) : null}
                              <span className="flex items-center gap-[2px] h-2.5">
                                {markers.taskCount > 0 ? (
                                  <span className="w-[4px] h-[4px] rounded-[1px] bg-foreground/45" aria-hidden="true" />
                                ) : null}
                                {markers.eventCount > 0 ? (
                                  <span className="w-[4px] h-[4px] rounded-full bg-foreground/45" aria-hidden="true" />
                                ) : null}
                              </span>
                            </button>
                            <CalendarStampLayer
                              stamps={cellStamps}
                              selectedId={selectedStampId ?? undefined}
                              interactive={interactive}
                              onSelect={onStampSelect}
                              onMovePointerDown={onStampMovePointerDown}
                            />
                            </div>
                          );
                        })}
                      </div>
                      <WeekEventList
                        date={listKey}
                        tasks={dayTasks}
                        events={dayEvents}
                        wallpaperId={wallpapersByDate.get(listKey)}
                        onEditTask={(id) => {
                          if (!interactive) return;
                          openEditTask(id, false);
                        }}
                        onTasksChanged={refreshTasks}
                        onOpenEvent={(id, occurrenceDate) => {
                          if (!interactive) return;
                          handleEditEvent(id, occurrenceDate);
                        }}
                        onAddTask={() => {
                          if (!interactive) return;
                          openNewTask(listKey, false);
                        }}
                        onAddEvent={() => {
                          if (!interactive) return;
                          openNewEvent(listKey, false);
                        }}
                        onOpenWallpaper={() => {
                          if (!interactive) return;
                          setDaySheetDate(listKey);
                          openWallpaperPicker(false);
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
              lockSwipe={stampInteraction}
              onMonthStep={onMonthStep}
            >
              {(rel, { faded }) => {
                const m = months[rel + 1];
                return (
                  <MonthGrid
                    year={m.getFullYear()}
                    month={m.getMonth()}
                    events={events}
                    tasksByDate={tasksByDate}
                    wallpapersByDate={wallpapersByDate}
                    stampsByDate={stampsByDate}
                    onDayTap={handleDayTap}
                    faded={faded}
                    interactive={rel === 0 && !faded && !blockDayTaps}
                    weekdayHeaders={weekdayHeaders}
                    weekStartsOn={weekStartsOn}
                    locale={locale}
                    selectedDate={daySheetOpen ? daySheetDate : undefined}
                    dropDate={dropDate}
                    selectedStampId={selectedStampId ?? undefined}
                    onStampSelect={onStampSelect}
                    onStampMovePointerDown={onStampMovePointerDown}
                  />
                );
              }}
            </MonthWheel>
          )}
        </div>
      </div>

      {!stampTrayOpen && !dragGhost ? (
      <FabButton
        disabled={blockDayTaps}
        onClick={() => {
          if (blockDayTaps || isTutorialBlockingCalendarDays()) return;
          openNewEvent(calView === "week" ? weekDayKey : todayLocalDate(), false);
        }}
        aria-label={t("addEvent")}
      />
      ) : null}

      <StampTray
        open={stampTrayOpen}
        onClose={() => setStampTrayOpen(false)}
        onDragStart={(definitionId, x, y) => {
          dragDefRef.current = definitionId;
          setStampDraggingFlag(true);
          setDragGhost({ definitionId, x, y });
          void tickHaptic();
        }}
        onDragMove={(x, y) => {
          setDragGhost((g) => (g ? { ...g, x, y } : g));
          setDropDate(localDateFromPoint(x, y));
        }}
        onDragEnd={(x, y) => {
          const id = dragDefRef.current;
          dragDefRef.current = null;
          if (id) dropNewStamp(id, x, y);
          else clearDrag();
        }}
        onDragCancel={clearDrag}
      />

      {dragGhost ? (
        <div
          className="fixed z-[70] pointer-events-none -translate-x-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-background/90 shadow-float flex items-center justify-center"
          style={{ left: dragGhost.x, top: dragGhost.y }}
        >
          <StampGlyph
            iconId={stampDefinition(dragGhost.definitionId)?.icon ?? "star"}
            className="w-6 h-6"
          />
        </div>
      ) : null}

      <CalendarDaySheet
        open={daySheetOpen}
        onOpenChange={setDaySheetOpen}
        date={daySheetDate}
        tasks={daySheetTasks}
        events={daySheetEvents}
        wallpaperId={getWallpaperForDate(daySheetDate)}
        onEditTask={(id) => openEditTask(id, true)}
        onTasksChanged={refreshTasks}
        onEditEvent={(id, occurrenceDate) => handleEditEvent(id, occurrenceDate, true)}
        onAddTask={() => openNewTask(daySheetDate, true)}
        onAddEvent={() => openNewEvent(daySheetDate, true)}
        onOpenWallpaper={() => openWallpaperPicker(true)}
      />

      <WallpaperPickerSheet
        open={wallpaperPickerOpen}
        onOpenChange={(open) => {
          setWallpaperPickerOpen(open);
          if (!open) maybeReopenDay();
        }}
        selectedId={getWallpaperForDate(daySheetDate)}
        onSelect={(id) => {
          setWallpaperForDate(daySheetDate, id);
          refreshDecorations();
          setWallpaperPickerOpen(false);
        }}
      />

      <DailyTaskSheet
        request={taskSheetRequest}
        onOpenChange={(open) => {
          if (!open) {
            setTaskSheetRequest(null);
            maybeReopenDay();
          }
        }}
        onSaved={() => {
          refreshTasks();
        }}
        onChanged={refreshTasks}
      />

      <EventSheet
        open={modalOpen}
        onOpenChange={(open) => {
          setModalOpen(open);
          if (!open) maybeReopenDay();
        }}
        target={modalOpen ? { mode: "new", date: modalDate } : null}
        variant="modal"
        onSaved={refreshEvents}
        onDeleted={refreshEvents}
      />

      <EventSheet
        open={sheetOpen}
        onOpenChange={(open) => {
          setSheetOpen(open);
          if (!open) maybeReopenDay();
        }}
        target={sheetTarget}
        onSaved={refreshEvents}
        onDeleted={refreshEvents}
      />
    </div>
  );
}
