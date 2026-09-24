import { beforeEach, describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { MemoryRouter } from "react-router-dom";
import { I18nProvider } from "@/lib/i18n";
import Index from "@/pages/Index";
import { addDays, formatLocalDate, todayLocalDate } from "@/lib/v3/local-date";
import { completeTask, createRoutine, createTask } from "@/lib/v3/repository";
import { emptyData } from "@/lib/v3/schema";
import { resetEssencesDataCache, saveEssencesData } from "@/lib/v3/storage";

function renderTodo(ui: ReactElement = <Index />) {
  return render(
    <I18nProvider>
      <MemoryRouter initialEntries={["/todo"]}>{ui}</MemoryRouter>
    </I18nProvider>,
  );
}

describe("Phase 6 ToDo UI", () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem("growth-app-lang", "en");
    resetEssencesDataCache();
    saveEssencesData(emptyData());
  });

  it("31. Routine appears above Tasks when a routine is active", () => {
    createRoutine({
      title: "English 30 min",
      icon: "book-open",
      color: "sky",
      frequency: { type: "daily" },
      startDate: "2026-01-01",
    });
    createTask({ title: "Email professor", date: todayLocalDate(), createdFrom: "todo" });
    renderTodo();
    const headings = screen.getAllByRole("heading").map((node) => node.textContent);
    expect(headings.indexOf("Routine")).toBeGreaterThan(-1);
    expect(headings.indexOf("Tasks")).toBeGreaterThan(-1);
    expect(headings.indexOf("Routine")).toBeLessThan(headings.indexOf("Tasks"));
    expect(screen.getByText("English 30 min")).toBeTruthy();
    expect(screen.getByText("Email professor")).toBeTruthy();
  });

  it("32. Add menu distinguishes Task, Routine, and Repeat Task", () => {
    renderTodo();
    fireEvent.click(screen.getByRole("button", { name: /^\+ Add$/ }));
    expect(screen.getByRole("button", { name: /Something to do once/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /daily or weekly habit/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /repeats monthly or yearly/ })).toBeTruthy();
  });

  it("33. Upcoming groups future TaskItems by date", () => {
    const today = todayLocalDate();
    const first = addDays(today, 1);
    const second = addDays(today, 3);
    createTask({ title: "Submit application", date: first, createdFrom: "todo" });
    createTask({ title: "Email professor", date: second, createdFrom: "todo" });
    renderTodo();
    expect(screen.getByRole("heading", { name: "Upcoming" })).toBeTruthy();
    expect(screen.getByText(formatLocalDate(first, "en", { month: "short", day: "numeric" }))).toBeTruthy();
    expect(screen.getByText(formatLocalDate(second, "en", { month: "short", day: "numeric" }))).toBeTruthy();
    expect(screen.getByText("Submit application")).toBeTruthy();
    expect(screen.getByText("Email professor")).toBeTruthy();
  });

  it("34. Completed is collapsed by default", () => {
    const today = todayLocalDate();
    const task = createTask({ title: "Read introduction", date: today, createdFrom: "todo" });
    completeTask(task.id);
    renderTodo();
    expect(screen.getByRole("heading", { name: "Completed" })).toBeTruthy();
    expect(screen.getByText("1 tasks")).toBeTruthy();
    expect(screen.queryByText("Read introduction")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Completed/ }));
    expect(screen.getByText("Read introduction")).toBeTruthy();
  });

  it("uses the App Shell header with UserButton and no History control", () => {
    renderTodo();
    expect(screen.getByRole("heading", { name: "ToDo" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Account" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Task history" })).toBeNull();
    expect(screen.queryByText("Streak")).toBeNull();
  });
});
