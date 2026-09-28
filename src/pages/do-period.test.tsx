import { beforeEach, describe, expect, it } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { I18nProvider } from "@/lib/i18n";
import Plan from "@/pages/Plan";
import Replan from "@/pages/Replan";
import { addDays, todayLocalDate } from "@/lib/v3/local-date";
import {
  completeReflectionSession,
  createReflectionSession,
  createTask,
} from "@/lib/v3/repository";
import { emptyData } from "@/lib/v3/schema";
import { resetEssencesDataCache, saveEssencesData } from "@/lib/v3/storage";

function renderDo() {
  return render(
    <I18nProvider>
      <MemoryRouter initialEntries={["/plan"]}>
        <Routes>
          <Route path="/plan" element={<Plan />} />
          <Route path="/plan/replan" element={<Replan />} />
          <Route path="/plan/reflection/:sessionId" element={<div>review</div>} />
        </Routes>
      </MemoryRouter>
    </I18nProvider>,
  );
}

describe("Do period", () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem("growth-app-lang", "en");
    resetEssencesDataCache();
    saveEssencesData(emptyData());
  });

  it("keeps Do selected under the Planning header and opens a date popup", () => {
    renderDo();
    expect(screen.getByRole("heading", { name: "Planning" })).toBeTruthy();
    expect(screen.getByTestId("cycle-do")).toHaveAttribute("aria-current", "page");
    fireEvent.click(screen.getByRole("tab", { name: "Daily" }));
    fireEvent.click(screen.getByTestId("period-trigger"));
    const popup = screen.getByTestId("period-popup");
    expect(popup.querySelector("[data-today='true']")).toBeTruthy();
    expect(within(popup).getByRole("button", { name: "Today" })).toBeTruthy();
  });

  it("shows task achievement and a completed reflection in words", () => {
    const today = todayLocalDate();
    const session = createReflectionSession({ type: "daily", anchorDate: today });
    completeReflectionSession(session.id);
    createTask({ title: "Write", date: today });
    renderDo();
    fireEvent.click(screen.getByRole("tab", { name: "Daily" }));
    expect(screen.getByTestId("period-achievement")).toHaveTextContent("0 / 1");
    expect(screen.getByTestId("period-reflection")).toHaveTextContent("Reflected");
  });

  it("does not let a past day change task completion, and still opens Replan", () => {
    const yesterday = addDays(todayLocalDate(), -1);
    createTask({ title: "Old", date: yesterday });
    renderDo();
    fireEvent.click(screen.getByRole("tab", { name: "Daily" }));
    fireEvent.click(screen.getByTestId("period-trigger"));
    let popup = screen.getByTestId("period-popup");
    if (!popup.querySelector(`[data-date="${yesterday}"]`)) {
      fireEvent.click(within(popup).getByRole("button", { name: "Previous" }));
      popup = screen.getByTestId("period-popup");
    }
    fireEvent.click(popup.querySelector(`[data-date="${yesterday}"]`) as HTMLElement);
    expect(screen.getByText("Old")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Complete" })).toBeDisabled();

    fireEvent.click(screen.getByText("Old"));
    fireEvent.click(screen.getByTestId("task-replan"));
    expect(screen.getByTestId("cycle-replan")).toHaveAttribute("aria-current", "page");
  });
});
