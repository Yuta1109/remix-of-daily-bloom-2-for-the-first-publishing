import { ChevronRight, Clock, MapPin, Plus } from "lucide-react";
import { DailyTaskRow } from "@/components/plan/DailyTaskRow";
import { DayWallpaperLayer } from "@/components/calendar/DayWallpaperLayer";
import { formatEventScheduleOnDate } from "@/lib/event-display";
import { colorHslFor, type CalendarEvent } from "@/lib/events-store";
import { useI18n, type TranslationKeys } from "@/lib/i18n";
import { completeTask } from "@/lib/v3/repository";
import { wallpaperDefinition } from "@/lib/v3/stamp-catalog";
import type { LocalDate } from "@/lib/v3/local-date";
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
  const { locale, t } = useI18n();
  const empty = tasks.length === 0 && events.length === 0;
  const wallpaperLabel = wallpaperId
    ? t((wallpaperDefinition(wallpaperId)?.labelKey ?? "calendarWallpaper") as TranslationKeys)
    : t("wallpaperNone");

  const toggleTask = (task: TaskItem) => {
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
      ) : (
        <>
          <section aria-label={t("calendarTasksSection")}>
            <h3 className="px-1 mb-1.5 text-[11px] font-semibold tracking-wider uppercase text-muted-foreground">
              {t("calendarTasksSection")}
            </h3>
            {tasks.length === 0 ? (
              <p className="px-1 text-sm text-muted-foreground">{t("calendarNoTasksOnDay")}</p>
            ) : (
              <div className="rounded-xl bg-secondary/40 divide-y divide-border/50 overflow-hidden">
                {tasks.map((task) => (
                  <div key={task.id} role="group" aria-label={`${t("calendarTaskKind")}: ${task.title}`}>
                    <DailyTaskRow
                      task={task}
                      onPress={() => onEditTask(task.id)}
                      onToggleComplete={() => toggleTask(task)}
                    />
                  </div>
                ))}
              </div>
            )}
          </section>

          <section aria-label={t("calendarEventsSection")}>
            <h3 className="px-1 mb-1.5 text-[11px] font-semibold tracking-wider uppercase text-muted-foreground">
              {t("calendarEventsSection")}
            </h3>
            {events.length === 0 ? (
              <p className="px-1 text-sm text-muted-foreground">{t("noEventsOnDay")}</p>
            ) : (
              <div className="space-y-2">
                {events.map((ev) => (
                  <button
                    key={ev.id}
                    type="button"
                    aria-label={`${t("calendarEventKind")}: ${ev.title}`}
                    onClick={() => onEditEvent(ev.id, date)}
                    className="w-full text-left flex items-start gap-3 bg-secondary/40 hover:bg-secondary rounded-xl px-4 py-3 transition-colors"
                  >
                    <span
                      className="w-2 h-2 rounded-full shrink-0 mt-1.5"
                      style={{ backgroundColor: `hsl(${colorHslFor(ev.color)})` }}
                      aria-hidden="true"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold truncate">{ev.title}</div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                        <Clock className="w-3 h-3 flex-shrink-0" aria-hidden="true" />
                        <span className="tabular-nums">
                          {formatEventScheduleOnDate(ev, date, locale, { emoji: false })}
                        </span>
                        {ev.location && (
                          <>
                            <MapPin className="w-3 h-3 flex-shrink-0 ml-1" aria-hidden="true" />
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
            )}
          </section>
        </>
      )}

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
          <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" aria-hidden="true" />
        </button>
      </section>

      <div className="flex flex-col gap-2 pt-1">
        <button
          type="button"
          onClick={onAddTask}
          className="flex items-center justify-center gap-1.5 w-full rounded-xl px-4 py-3 text-sm font-semibold bg-accent text-accent-foreground hover:opacity-90 transition-opacity"
        >
          <Plus className="w-4 h-4" strokeWidth={2.5} aria-hidden="true" />
          {t("calendarAddTask")}
        </button>
        <button
          type="button"
          onClick={onAddEvent}
          className="flex items-center justify-center gap-1.5 w-full rounded-xl px-4 py-3 text-sm font-semibold bg-secondary text-foreground hover:bg-secondary/80 transition-colors"
        >
          <Plus className="w-4 h-4" strokeWidth={2.5} aria-hidden="true" />
          {t("calendarAddEvent")}
        </button>
      </div>
    </div>
  );
}
