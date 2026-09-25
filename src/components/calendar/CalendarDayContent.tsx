import { ChevronRight, Plus } from "lucide-react";
import { useState } from "react";
import { DailyTaskRow } from "@/components/plan/DailyTaskRow";
import { DayWallpaperLayer } from "@/components/calendar/DayWallpaperLayer";
import { colorHslFor, type CalendarEvent } from "@/lib/events-store";
import { useI18n, type TranslationKeys } from "@/lib/i18n";
import { completeTask, getTaskCompletionRate } from "@/lib/v3/repository";
import { wallpaperDefinition } from "@/lib/v3/stamp-catalog";
import { todayLocalDate, type LocalDate } from "@/lib/v3/local-date";
import type { TaskItem } from "@/lib/v3/types";

export interface CalendarDayContentProps {
  date: LocalDate;
  tasks: TaskItem[];
  events: CalendarEvent[];
  wallpaperId?: string;
  onEditTask: (taskId: string) => void;
  onTasksChanged: () => void;
  onEditEvent: (id: string, occurrenceDate: string) => void;
  onAddTask: () => void;
  onAddEvent: () => void;
  onOpenWallpaper: () => void;
}

const PREVIEW = 3;

/**
 * Shared Tasks / Events body for the day sheet and week list.
 * Does not own persisted data — callers pass repository / events-store results.
 */
export function CalendarDayContent({
  date,
  tasks,
  events,
  wallpaperId,
  onEditTask,
  onTasksChanged,
  onEditEvent,
  onAddTask,
  onAddEvent,
  onOpenWallpaper,
}: CalendarDayContentProps) {
  const { t } = useI18n();
  const past = date < todayLocalDate();
  const empty = tasks.length === 0 && events.length === 0;
  const wallpaperLabel = wallpaperId
    ? t((wallpaperDefinition(wallpaperId)?.labelKey ?? "calendarWallpaper") as TranslationKeys)
    : t("wallpaperNone");
  const [showAllEvents, setShowAllEvents] = useState(false);
  const [showAllTasks, setShowAllTasks] = useState(false);
  const visibleEvents = showAllEvents ? events : events.slice(0, PREVIEW);
  const visibleTasks = showAllTasks ? tasks : tasks.slice(0, PREVIEW);
  const rate = getTaskCompletionRate(date);

  const toggleTask = (task: TaskItem) => {
    if (past) return;
    completeTask(task.id, task.status !== "completed");
    onTasksChanged();
  };

  return (
    <div className="space-y-5">
      {wallpaperId ? (
        <div className="relative h-16 rounded-xl overflow-hidden border border-border/40">
          <DayWallpaperLayer wallpaperId={wallpaperId} intensity="sheet" />
        </div>
      ) : null}

      {empty ? (
        <div className="text-center py-8 text-muted-foreground">
          <p className="text-sm font-medium">{t("calendarNothingScheduled")}</p>
        </div>
      ) : null}

      <section aria-label={t("calendarEventsSection")}>
        <h3 className="px-1 mb-1.5 text-[11px] font-semibold tracking-wider uppercase text-muted-foreground">
          {t("calendarEventsSection")}
        </h3>
        {events.length === 0 ? (
          <p className="px-1 text-sm text-muted-foreground">{t("noEventsOnDay")}</p>
        ) : (
          <div className="space-y-2">
            {visibleEvents.map((ev) => (
              <button
                key={ev.id}
                type="button"
                aria-label={`${t("calendarEventKind")}: ${ev.title}`}
                disabled={past}
                onClick={() => {
                  if (past) return;
                  onEditEvent(ev.id, date);
                }}
                className="w-full text-left flex items-start gap-3 bg-secondary/40 hover:bg-secondary rounded-xl px-4 py-3 transition-colors disabled:opacity-60"
              >
                <span
                  className="w-2 h-2 rounded-full shrink-0 mt-1.5"
                  style={{ backgroundColor: `hsl(${colorHslFor(ev.color)})` }}
                  aria-hidden="true"
                />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold truncate">{ev.title}</div>
                </div>
              </button>
            ))}
          </div>
        )}
        {events.length > PREVIEW ? (
          <button
            type="button"
            data-testid="calendar-show-more-events"
            onClick={() => setShowAllEvents((v) => !v)}
            className="mt-2 px-1 text-sm font-medium text-accent"
          >
            {showAllEvents ? t("calendarShowLess") : t("calendarShowMore")}
          </button>
        ) : null}
        {!past ? (
          <button
            type="button"
            onClick={onAddEvent}
            className="mt-2 flex items-center justify-center gap-1.5 w-full rounded-xl px-4 py-3 text-sm font-semibold bg-secondary text-foreground hover:bg-secondary/80"
          >
            <Plus className="w-4 h-4" strokeWidth={2.5} aria-hidden="true" />
            {t("calendarAddEvent")}
          </button>
        ) : null}
      </section>

      <section aria-label={t("calendarTasksSection")}>
        <h3 className="px-1 mb-1.5 text-[11px] font-semibold tracking-wider uppercase text-muted-foreground">
          {t("calendarTasksSection")}
        </h3>
        {past && tasks.length > 0 ? (
          <p className="px-1 mb-2 text-xs text-muted-foreground" data-testid="calendar-past-completion">
            {t("calendarPastCompletion").replace("{n}", String(rate))}
          </p>
        ) : null}
        {tasks.length === 0 ? (
          <p className="px-1 text-sm text-muted-foreground">{t("calendarNoTasksOnDay")}</p>
        ) : (
          <div className="rounded-xl bg-secondary/40 divide-y divide-border/50 overflow-hidden">
            {visibleTasks.map((task) => (
              <div key={task.id} role="group" aria-label={`${t("calendarTaskKind")}: ${task.title}`}>
                <DailyTaskRow
                  task={task}
                  disabled={past}
                  onPress={() => {
                    if (past) return;
                    onEditTask(task.id);
                  }}
                  onToggleComplete={() => toggleTask(task)}
                />
              </div>
            ))}
          </div>
        )}
        {tasks.length > PREVIEW ? (
          <button
            type="button"
            data-testid="calendar-show-more-tasks"
            onClick={() => setShowAllTasks((v) => !v)}
            className="mt-2 px-1 text-sm font-medium text-accent"
          >
            {showAllTasks ? t("calendarShowLess") : t("calendarShowMore")}
          </button>
        ) : null}
        {!past ? (
          <button
            type="button"
            onClick={onAddTask}
            className="mt-2 flex items-center justify-center gap-1.5 w-full rounded-xl px-4 py-3 text-sm font-semibold bg-accent text-accent-foreground hover:opacity-90"
          >
            <Plus className="w-4 h-4" strokeWidth={2.5} aria-hidden="true" />
            {t("calendarAddTask")}
          </button>
        ) : null}
      </section>

      <section aria-label={t("calendarAppearance")}>
        <h3 className="px-1 mb-1.5 text-[11px] font-semibold tracking-wider uppercase text-muted-foreground">
          {t("calendarAppearance")}
        </h3>
        <button
          type="button"
          onClick={onOpenWallpaper}
          className="w-full flex items-center gap-3 rounded-xl px-3 py-2.5 bg-secondary/40 hover:bg-secondary transition-colors"
        >
          <span className="relative w-10 h-10 rounded-lg overflow-hidden border border-border/50 shrink-0">
            {wallpaperId ? (
              <DayWallpaperLayer wallpaperId={wallpaperId} intensity="sheet" />
            ) : (
              <span className="absolute inset-0 bg-background" />
            )}
          </span>
          <span className="flex-1 min-w-0 text-left">
            <span className="block text-sm font-medium">{t("calendarWallpaper")}</span>
            <span className="block text-xs text-muted-foreground truncate">{wallpaperLabel}</span>
          </span>
          <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
        </button>
      </section>
    </div>
  );
}
