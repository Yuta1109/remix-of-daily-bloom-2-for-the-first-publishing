import { CalendarDayContent } from "@/components/calendar/CalendarDayContent";
import type { CalendarEvent } from "@/lib/events-store";
import type { LocalDate } from "@/lib/v3/local-date";
import type { TaskItem } from "@/lib/v3/types";

type Props = {
  date: LocalDate;
  tasks: TaskItem[];
  events: CalendarEvent[];
  wallpaperId?: string;
  onEditTask: (taskId: string) => void;
  onTasksChanged: () => void;
  onOpenEvent: (id: string, date: string) => void;
  onAddTask: () => void;
  onAddEvent: () => void;
  onOpenWallpaper: () => void;
};

export function WeekEventList({
  date,
  tasks,
  events,
  wallpaperId,
  onEditTask,
  onTasksChanged,
  onOpenEvent,
  onAddTask,
  onAddEvent,
  onOpenWallpaper,
}: Props) {
  return (
    <div className="event-sheet-scroll flex-1 min-h-0 overflow-y-auto overscroll-contain px-3 pb-3">
      <CalendarDayContent
        date={date}
        tasks={tasks}
        events={events}
        wallpaperId={wallpaperId}
        onEditTask={onEditTask}
        onTasksChanged={onTasksChanged}
        onEditEvent={onOpenEvent}
        onAddTask={onAddTask}
        onAddEvent={onAddEvent}
        onOpenWallpaper={onOpenWallpaper}
      />
    </div>
  );
}
