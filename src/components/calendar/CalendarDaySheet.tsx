import { useEffect } from "react";
import { Drawer as DrawerPrimitive } from "vaul";
import { CalendarDayContent } from "@/components/calendar/CalendarDayContent";
import { useI18n } from "@/lib/i18n";
import { getJapaneseHolidayName } from "@/lib/jp-holidays";
import { setOverlayChrome } from "@/lib/overlay-chrome";
import type { CalendarEvent } from "@/lib/events-store";
import type { LocalDate } from "@/lib/v3/local-date";
import type { TaskItem } from "@/lib/v3/types";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  date: LocalDate;
  tasks: TaskItem[];
  events: CalendarEvent[];
  onEditTask: (taskId: string) => void;
  onTasksChanged: () => void;
  onEditEvent: (id: string, occurrenceDate: string) => void;
  onAddTask: () => void;
  onAddEvent: () => void;
  wallpaperId?: string;
  onOpenWallpaper: () => void;
}

/**
 * Date detail sheet. Receives tasks and events; persistence stays in
 * the V3 repository and events-store handlers passed by the caller.
 */
export function CalendarDaySheet({
  open,
  onOpenChange,
  date,
  tasks,
  events,
  onEditTask,
  onTasksChanged,
  onEditEvent,
  onAddTask,
  onAddEvent,
  wallpaperId,
  onOpenWallpaper,
}: Props) {
  const { locale, formatDateStr } = useI18n();
  const holidayName = locale === "ja" ? getJapaneseHolidayName(date) : null;
  const dateLabel = formatDateStr(date, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  useEffect(() => {
    if (!open) return;
    setOverlayChrome(true);
    return () => setOverlayChrome(false);
  }, [open]);

  return (
    <DrawerPrimitive.Root open={open} onOpenChange={onOpenChange} shouldScaleBackground={false}>
      <DrawerPrimitive.Portal>
        <DrawerPrimitive.Overlay className="fixed inset-0 z-50 bg-black/20 backdrop-blur-[1px]" />
        <DrawerPrimitive.Content
          className="fixed inset-x-0 bottom-0 z-50 flex flex-col rounded-t-2xl border bg-background max-h-[78vh] min-h-0 overflow-hidden outline-none"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <div className="mx-auto mt-2.5 h-1.5 w-10 rounded-full bg-muted shrink-0 touch-none" />

          <div className="flex items-center justify-between px-5 pt-3 pb-3 border-b border-border/50 shrink-0">
            <DrawerPrimitive.Title className="text-base font-semibold flex items-center gap-1.5 flex-wrap">
              {dateLabel}
              {holidayName ? (
                <span className="text-xs font-semibold text-red-600">{holidayName}</span>
              ) : null}
            </DrawerPrimitive.Title>
          </div>

          <div
            className="event-sheet-scroll min-h-0 overflow-y-scroll overscroll-contain px-4 py-3"
            style={{ flex: "1 1 0%" }}
            data-vaul-no-drag=""
            onPointerDown={(e) => e.stopPropagation()}
          >
            <CalendarDayContent
              date={date}
              tasks={tasks}
              events={events}
              onEditTask={(id) => {
                onOpenChange(false);
                setTimeout(() => onEditTask(id), 180);
              }}
              onTasksChanged={onTasksChanged}
              onEditEvent={(id, occurrenceDate) => {
                onOpenChange(false);
                setTimeout(() => onEditEvent(id, occurrenceDate), 180);
              }}
              onAddTask={() => {
                onOpenChange(false);
                setTimeout(() => onAddTask(), 180);
              }}
              onAddEvent={() => {
                onOpenChange(false);
                setTimeout(() => onAddEvent(), 180);
              }}
              wallpaperId={wallpaperId}
              onOpenWallpaper={() => {
                onOpenChange(false);
                setTimeout(() => onOpenWallpaper(), 180);
              }}
            />
            <div className="h-4" />
          </div>
        </DrawerPrimitive.Content>
      </DrawerPrimitive.Portal>
    </DrawerPrimitive.Root>
  );
}
