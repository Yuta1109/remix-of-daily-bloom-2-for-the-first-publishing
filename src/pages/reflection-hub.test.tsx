import { beforeEach, describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { I18nProvider } from "@/lib/i18n";
import ReflectionCenter from "@/pages/ReflectionCenter";
import ReflectionReview from "@/pages/ReflectionReview";
import Replan from "@/pages/Replan";
import { addDays, todayLocalDate } from "@/lib/v3/local-date";
import {
  completeReflectionSession,
  completeTask,
  createReflectionSession,
  createTask,
} from "@/lib/v3/repository";
import { emptyData } from "@/lib/v3/schema";
import { resetEssencesDataCache, saveEssencesData } from "@/lib/v3/storage";

function renderHub() {
  return render(
    <I18nProvider>
      <MemoryRouter initialEntries={["/plan/reflection"]}>
        <Routes>
          <Route path="/plan/reflection" element={<ReflectionCenter />} />
          <Route path="/plan/reflection/:sessionId" element={<ReflectionReview />} />
          <Route path="/plan/replan" element={<Replan />} />
        </Routes>
      </MemoryRouter>
    </I18nProvider>,
  );
}

describe("Reflection hub", () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem("growth-app-lang", "en");
    resetEssencesDataCache();
    saveEssencesData(emptyData());
  });

  it("confirms before starting, then summarizes decisions, Replan, and points", () => {
    const today = todayLocalDate();
    const task = createTask({ title: "Write notes", date: today });
    completeTask(task.id);
    renderHub();

    const todayTarget = screen
      .getAllByTestId("reflection-target")
      .find((node) => node.getAttribute("data-period") === today);
    expect(todayTarget).toBeTruthy();
    fireEvent.click(todayTarget!);

    expect(screen.getByTestId("reflection-start-confirm")).toBeTruthy();
    fireEvent.click(screen.getByTestId("reflection-start-confirm-confirm"));

    expect(screen.getByTestId("reflection-activity")).toHaveTextContent("Today's activity and results");
    expect(screen.getByText("Write notes")).toBeTruthy();
    fireEvent.click(screen.getByTestId("reflection-subject"));
    expect(screen.getByText("Continue this plan as it is")).toBeTruthy();
    fireEvent.click(screen.getByText("Keep"));
    fireEvent.click(screen.getByTestId("reflection-complete"));

    expect(screen.getByTestId("reflection-result")).toHaveTextContent("Keep 1");
    expect(screen.getByTestId("reflection-start-replan")).toHaveTextContent("Start Replan");
    expect(screen.getByTestId("reflection-points-awarded")).toHaveTextContent(
      "You earned 10 points for this reflection.",
    );
    fireEvent.click(screen.getByTestId("reflection-start-replan"));
    expect(screen.getByTestId("cycle-replan")).toHaveAttribute("aria-current", "page");
  });

  it("shows at most five completed reflections and can reopen one", () => {
    const today = todayLocalDate();
    for (let i = 1; i <= 6; i += 1) {
      const session = createReflectionSession({ type: "daily", anchorDate: addDays(today, -i) });
      completeReflectionSession(session.id);
    }
    renderHub();
    fireEvent.click(screen.getByTestId("reflection-past"));
    expect(screen.getAllByTestId("reflection-past-item")).toHaveLength(5);
    fireEvent.click(screen.getAllByTestId("reflection-past-item")[0]);
    expect(screen.getByTestId("reflection-result")).toBeTruthy();
    expect(screen.getByText("Let's reflect!")).toBeTruthy();
  });
});
