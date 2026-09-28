import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { I18nProvider } from "@/lib/i18n";
import Index from "@/pages/Index";
import RoutineList from "@/pages/RoutineList";
import { createRoutine, createTask } from "@/lib/v3/repository";
import { emptyData } from "@/lib/v3/schema";
import { resetEssencesDataCache, saveEssencesData } from "@/lib/v3/storage";
import { todayLocalDate } from "@/lib/v3/local-date";

function renderTodo(path = "/todo", lang = "en") {
  localStorage.setItem("growth-app-lang", lang);
  return render(
    <I18nProvider>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/todo" element={<Index />} />
          <Route path="/todo/routines" element={<RoutineList />} />
        </Routes>
      </MemoryRouter>
    </I18nProvider>,
  );
}

describe("Phase 15-B ToDo", () => {
  beforeEach(() => {
    localStorage.clear();
    resetEssencesDataCache();
    saveEssencesData(emptyData());
  });

  it("places the routine completion control on the right", () => {
    createRoutine({
      title: "Stretch",
      icon: "book-open",
      color: "sky",
      frequency: { type: "daily" },
      startDate: "2026-01-01",
    });
    renderTodo();
    const row = screen.getByText("Stretch").closest("div");
    const buttons = row?.querySelectorAll("button");
    expect(buttons?.[buttons.length - 1]?.getAttribute("data-testid")).toBe(
      "routine-completion-control",
    );
    expect(buttons?.[buttons.length - 1]?.className).toContain("ml-auto");
  });

  it("keeps the completion toast below the safe area", () => {
    const css = readFileSync("src/index.css", "utf8");
    const toaster = readFileSync("src/components/ui/sonner.tsx", "utf8");
    expect(css).toContain("env(safe-area-inset-top, 0px) + 5.5rem");
    expect(toaster).toContain("env(safe-area-inset-top, 0px) + 5.5rem");
  });

  it("does not draw circle or target as the task icon", () => {
    createTask({
      title: "Ring",
      date: todayLocalDate(),
      createdFrom: "todo",
      icon: "circle",
    });
    createTask({
      title: "Bullseye",
      date: todayLocalDate(),
      createdFrom: "todo",
      icon: "target",
    });
    renderTodo();
    const section = screen.getByTestId("todo-task-section");
    expect(section.querySelector(".lucide-circle")).toBeNull();
    expect(section.querySelector(".lucide-target")).toBeNull();
    expect(section.querySelectorAll(".lucide-flag").length).toBe(2);
    expect(section.querySelector("[data-testid='task-completion-control']")).toBeTruthy();
  });

  it("names the upcoming section 明日以降のタスク", () => {
    renderTodo("/todo", "ja");
    expect(screen.getByRole("heading", { name: "明日以降のタスク" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "これから" })).toBeNull();
  });

  it("follows the finger on the routine list and uses a glass back button", () => {
    renderTodo("/todo/routines");
    const back = screen.getByTestId("routine-list-back");
    expect(back.className).toContain("liquid-glass");
    expect(back.textContent).toBe("");
    const page = document.querySelector("[data-swipe-page]") as HTMLElement;
    const underlay = document.querySelector("[data-swipe-underlay]") as HTMLElement;
    fireEvent.touchStart(page, { touches: [{ clientX: 8, clientY: 30 }] });
    fireEvent.touchMove(page, { touches: [{ clientX: 120, clientY: 32 }] });
    expect(page.style.transform).toBe("translateX(112px)");
    expect(page.style.borderRadius).toBe("16px");
    expect(underlay.style.transform).toContain("translateX(");
  });

  it("uses liquid glass for the history control, popup, and user button", () => {
    renderTodo();
    const clock = screen.getByTestId("todo-history");
    expect(clock.className).toContain("liquid-glass");
    const user = document.querySelector("button[aria-label='Account'], button[aria-label='アカウント']");
    expect(user?.className).toContain("liquid-glass");
    fireEvent.click(clock);
    const sheet = document.querySelector("[data-vaul-drawer]") as HTMLElement;
    expect(sheet?.className).not.toContain("liquid-glass");
    expect(sheet?.className).toContain("bg-background");
  });
});
