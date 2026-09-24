import { describe, expect, it } from "vitest";
import { TUTORIAL_STEPS } from "@/lib/tutorial";

describe("Phase 6.1 ToDo tutorial", () => {
  it("does not target the removed streak / today-stats card", () => {
    expect(TUTORIAL_STEPS.some((step) => step.target === "today-stats")).toBe(false);
    expect(TUTORIAL_STEPS.some((step) => step.target === "quick-add")).toBe(false);
    const ids: string[] = TUTORIAL_STEPS.map((step) => step.id);
    expect(ids).not.toContain("stats");
  });

  it("covers the new ToDo add control and layout", () => {
    const add = TUTORIAL_STEPS.find((step) => step.id === "quickAdd");
    expect(add?.target).toBe("todo-add");
    expect(add?.event).toBe("task-added");
    expect(add?.route).toBe("/todo");

    const layout = TUTORIAL_STEPS.find((step) => step.id === "todoLayout");
    expect(layout?.target).toBe("todo-layout");
    expect(layout?.route).toBe("/todo");
  });

  it("still places Plan Monthly immediately after Calendar nav", () => {
    const afterCalendarNav = TUTORIAL_STEPS.findIndex((s) => s.id === "navCalendar");
    expect(TUTORIAL_STEPS.findIndex((s) => s.id === "planMonthly")).toBe(afterCalendarNav + 1);
  });
});
