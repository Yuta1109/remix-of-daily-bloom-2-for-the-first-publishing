import { beforeEach, describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { I18nProvider } from "@/lib/i18n";
import Index from "@/pages/Index";
import RoutineList from "@/pages/RoutineList";
import Plan from "@/pages/Plan";
import PostponeBox from "@/pages/PostponeBox";
import ReflectionCenter from "@/pages/ReflectionCenter";
import { CalendarDayContent } from "@/components/calendar/CalendarDayContent";
import { addDays, todayLocalDate } from "@/lib/v3/local-date";
import {
  CALENDAR_CELL_MARKER_LIMIT,
  calendarCellMarkers,
  calendarDateTapResult,
  calendarEventSpan,
  calendarSelectionHidesDecorations,
  calendarWeekAllowsStamps,
} from "@/lib/v3/calendar-view";
import {
  completeTask,
  createRoutine,
  createTask,
  createTaskTemplate,
  getTask,
  updateSettings,
} from "@/lib/v3/repository";
import { emptyData } from "@/lib/v3/schema";
import { resetEssencesDataCache, saveEssencesData } from "@/lib/v3/storage";
import type { CalendarEvent } from "@/lib/events-store";

function renderPath(path: string, ui: ReactElement) {
  return render(
    <I18nProvider>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/todo" element={<Index />} />
          <Route path="/todo/routines" element={<RoutineList />} />
          <Route path="/plan" element={<Plan />} />
          <Route path="/plan/postpone-box" element={<PostponeBox />} />
          <Route path="/plan/reflection" element={<ReflectionCenter />} />
          <Route path="*" element={ui} />
        </Routes>
      </MemoryRouter>
    </I18nProvider>,
  );
}

describe("Phase 14-A ToDo", () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem("growth-app-lang", "en");
    resetEssencesDataCache();
    saveEssencesData(emptyData());
  });

  it("11. Reflection wording is due/overdue, not Needs Attention", () => {
    renderPath("/plan/reflection", <ReflectionCenter />);
    expect(screen.getByText("Due or overdue reflections")).toBeTruthy();
    expect(screen.queryByText("Needs Attention")).toBeNull();
  });

  it("12. ToDo has Routine / Task / Upcoming sections", () => {
    renderPath("/todo", <Index />);
    expect(screen.getByTestId("todo-routine-section")).toBeTruthy();
    expect(screen.getByTestId("todo-task-section")).toBeTruthy();
    expect(screen.getByTestId("todo-upcoming-section")).toBeTruthy();
  });

  it("13. Completed task remains in the Task section", () => {
    const task = createTask({ title: "Stay here", date: todayLocalDate(), createdFrom: "todo" });
    completeTask(task.id);
    renderPath("/todo", <Index />);
    expect(screen.getByTestId("todo-task-section").textContent).toContain("Stay here");
    expect(screen.queryByRole("heading", { name: "Completed" })).toBeNull();
  });

  it("14. Past history is opened from the clock button", () => {
    renderPath("/todo", <Index />);
    fireEvent.click(screen.getByTestId("todo-history"));
    expect(screen.getByText("Task history")).toBeTruthy();
  });

  it("15. Repeat Task / reusable chips hide when the setting is off", () => {
    createTaskTemplate({ title: "Email professor" });
    const first = renderPath("/todo", <Index />);
    expect(first.getByText("Email professor")).toBeTruthy();
    first.unmount();
    updateSettings({ showTaskTemplatesOnTodo: false });
    const second = renderPath("/todo", <Index />);
    expect(second.queryByText("Email professor")).toBeNull();
  });

  it("16. List and edit navigates to the routine list", () => {
    createRoutine({
      title: "English 30 min",
      icon: "book-open",
      color: "sky",
      frequency: { type: "daily" },
      startDate: "2026-01-01",
    });
    renderPath("/todo", <Index />);
    fireEvent.click(screen.getByTestId("todo-routine-list-edit"));
    expect(screen.getByRole("heading", { name: "Routines" })).toBeTruthy();
    expect(screen.getByTestId("routine-list-row").textContent).toContain("English 30 min");
  });

  it("10. Plan exposes Postpone Box entry", () => {
    renderPath("/plan", <Plan />);
    expect(screen.getByTestId("postpone-box-entry")).toBeTruthy();
  });
});

describe("Phase 14-A Calendar", () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem("growth-app-lang", "en");
    resetEssencesDataCache();
    saveEssencesData(emptyData());
  });

  it("21. month cells show at most four task squares", () => {
    expect(CALENDAR_CELL_MARKER_LIMIT).toBe(4);
    const tasks = [0, 1, 2, 3, 4].map((i) =>
      createTask({ title: `T${i}`, date: "2026-09-25", color: "sky", createdFrom: "calendar" }),
    );
    const markers = calendarCellMarkers(tasks, []);
    expect(markers.shownTasks).toHaveLength(4);
    expect(markers.taskCount).toBe(5);
  });

  it("20. week view does not allow stamps", () => {
    expect(calendarWeekAllowsStamps("week")).toBe(false);
    expect(calendarWeekAllowsStamps("month")).toBe(true);
  });

  it("24. two-step date tap selects first, then opens", () => {
    expect(calendarDateTapResult(null, "2026-09-25")).toBe("select");
    expect(calendarDateTapResult("2026-09-24", "2026-09-25")).toBe("select");
    expect(calendarDateTapResult("2026-09-25", "2026-09-25")).toBe("open");
  });

  it("25. date selection hides stamp and wallpaper", () => {
    expect(calendarSelectionHidesDecorations("2026-09-25", "2026-09-25")).toBe(true);
    expect(calendarSelectionHidesDecorations("2026-09-25", "2026-09-24")).toBe(false);
  });

  it("22–23. event blocks use color and multi-day span roles", () => {
    const event: CalendarEvent = {
      id: "e1",
      title: "Trip",
      date: "2026-09-21",
      endDate: "2026-09-23",
      color: "blue",
    };
    expect(calendarEventSpan(event, "2026-09-21")).toBe("start");
    expect(calendarEventSpan(event, "2026-09-22")).toBe("middle");
    expect(calendarEventSpan(event, "2026-09-23")).toBe("end");
    const markers = calendarCellMarkers([], [event]);
    expect(markers.shownEvents[0].title).toBe("Trip");
    expect(markers.shownEvents[0].color).toBe("blue");
  });

  it("17–19. past days hide add buttons and disable edit/complete", () => {
    const yesterday = addDays(todayLocalDate(), -1);
    const task = createTask({ title: "Old task", date: yesterday, createdFrom: "calendar" });
    completeTask(task.id);
    const stored = getTask(task.id)!;
    const events: CalendarEvent[] = [
      { id: "ev", title: "Old event", date: yesterday, color: "green" },
    ];
    render(
      <I18nProvider>
        <CalendarDayContent
          date={yesterday}
          tasks={[stored]}
          events={events}
          onEditTask={() => {
            throw new Error("edit");
          }}
          onTasksChanged={() => undefined}
          onEditEvent={() => {
            throw new Error("edit-event");
          }}
          onAddTask={() => {
            throw new Error("add-task");
          }}
          onAddEvent={() => {
            throw new Error("add-event");
          }}
          onOpenWallpaper={() => undefined}
        />
      </I18nProvider>,
    );
    expect(screen.queryByRole("button", { name: /Add Task/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Add Event/ })).toBeNull();
    expect(screen.getByTestId("calendar-past-completion").textContent).toMatch(/100/);
    expect(screen.getByRole("button", { name: "Completed" })).toBeDisabled();
  });

  it("26. more-results reveals tasks and events beyond three", () => {
    const today = todayLocalDate();
    const tasks = [0, 1, 2, 3].map((i) =>
      createTask({ title: `Task ${i}`, date: today, createdFrom: "calendar" }),
    );
    const events: CalendarEvent[] = [0, 1, 2, 3].map((i) => ({
      id: `e${i}`,
      title: `Event ${i}`,
      date: today,
      color: "blue",
    }));
    render(
      <I18nProvider>
        <CalendarDayContent
          date={today}
          tasks={tasks}
          events={events}
          onEditTask={() => undefined}
          onTasksChanged={() => undefined}
          onEditEvent={() => undefined}
          onAddTask={() => undefined}
          onAddEvent={() => undefined}
          onOpenWallpaper={() => undefined}
        />
      </I18nProvider>,
    );
    expect(screen.queryByText("Task 3")).toBeNull();
    expect(screen.queryByText("Event 3")).toBeNull();
    fireEvent.click(screen.getByTestId("calendar-show-more-tasks"));
    fireEvent.click(screen.getByTestId("calendar-show-more-events"));
    expect(screen.getByText("Task 3")).toBeTruthy();
    expect(screen.getByText("Event 3")).toBeTruthy();
  });
});
