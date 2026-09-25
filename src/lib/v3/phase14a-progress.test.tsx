import { beforeEach, describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { I18nProvider } from "@/lib/i18n";
import Progress from "@/pages/Progress";
import ProgressAnalytics from "@/pages/ProgressAnalytics";
import ProgressPoints from "@/pages/ProgressPoints";
import { pickAnalyticsComment } from "@/lib/v3/analytics";
import { DAILY_CHALLENGE_COUNT } from "@/lib/v3/challenge-definitions";
import { todayLocalDate } from "@/lib/v3/local-date";
import { pointSeriesFromTransactions } from "@/lib/v3/points-series";
import { PROGRESS_TOP_INCOMPLETE, loadProgressSnapshot } from "@/lib/v3/progress";
import { ensureDailyChallenges, getDailyChallenges } from "@/lib/v3/repository";
import { emptyData } from "@/lib/v3/schema";
import { resetEssencesDataCache, saveEssencesData } from "@/lib/v3/storage";
import type { PointTransaction } from "@/lib/v3/types";

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeEach(() => {
  global.ResizeObserver = ResizeObserverMock as unknown as typeof ResizeObserver;
});

function renderProgressApp(path = "/progress") {
  return render(
    <I18nProvider>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/progress" element={<Progress />} />
          <Route path="/progress/analytics" element={<ProgressAnalytics />} />
          <Route path="/progress/points" element={<ProgressPoints />} />
        </Routes>
      </MemoryRouter>
    </I18nProvider>,
  );
}

describe("Phase 14-A Progress", () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem("growth-app-lang", "en");
    resetEssencesDataCache();
    saveEssencesData(emptyData());
  });

  it("1. Daily Challenge assigns 6", () => {
    const today = todayLocalDate();
    ensureDailyChallenges(today);
    expect(getDailyChallenges(today)).toHaveLength(DAILY_CHALLENGE_COUNT);
    expect(DAILY_CHALLENGE_COUNT).toBe(6);
  });

  it("2. Progress top shows at most 3 incomplete challenges", () => {
    ensureDailyChallenges(todayLocalDate());
    renderProgressApp();
    const rows = screen.getAllByTestId("daily-challenge-row");
    expect(rows.length).toBeLessThanOrEqual(PROGRESS_TOP_INCOMPLETE);
    expect(rows.every((row) => row.getAttribute("data-completed") === "false")).toBe(true);
  });

  it("3. remaining challenges open from the section", () => {
    ensureDailyChallenges(todayLocalDate());
    renderProgressApp();
    fireEvent.click(screen.getByTestId("daily-challenge-section"));
    expect(screen.getByTestId("daily-challenge-section").getAttribute("data-expanded")).toBe(
      "true",
    );
    expect(screen.getAllByTestId("daily-challenge-row").length).toBe(DAILY_CHALLENGE_COUNT);
  });

  it("4. Special Challenge has a single lock icon", () => {
    renderProgressApp();
    const special = screen.getByTestId("special-challenge");
    expect(special.querySelectorAll("svg")).toHaveLength(1);
    expect(special.textContent).not.toContain("🔒");
  });

  it("5. Analytics block opens the detail page", () => {
    renderProgressApp();
    fireEvent.click(screen.getByTestId("progress-analytics"));
    expect(screen.getByRole("heading", { name: "Analytics" })).toBeTruthy();
  });

  it("6. Points block opens the detail page", () => {
    renderProgressApp();
    fireEvent.click(screen.getByTestId("progress-points"));
    expect(screen.getByRole("heading", { name: "Points" })).toBeTruthy();
  });

  it("7–8. cumulative and daily point series stay separate", () => {
    const txs: PointTransaction[] = [
      {
        id: "a",
        amount: 5,
        reason: "challenge",
        createdAt: "2026-09-20T12:00:00.000Z",
      },
      {
        id: "b",
        amount: 5,
        reason: "challenge",
        createdAt: "2026-09-21T12:00:00.000Z",
      },
    ];
    const series = pointSeriesFromTransactions(txs, "2026-09-21");
    expect(series.find((row) => row.date === "2026-09-20")?.earned).toBe(5);
    expect(series.find((row) => row.date === "2026-09-21")?.earned).toBe(5);
    expect(series.find((row) => row.date === "2026-09-21")?.cumulative).toBe(10);
    expect(series.find((row) => row.date === "2026-09-20")?.cumulative).toBe(5);
    const snapshot = loadProgressSnapshot(todayLocalDate());
    expect(snapshot.analytics.commentParams).toBeTruthy();
  });

  it("12. analytics comments follow the same metrics twice", () => {
    const input = {
      activityLast3Days: 0,
      reflectionsThisWeek: 0,
      planningThisWeek: 0,
      taskCompletedThisWeek: 0,
      routineCompletedThisWeek: 0,
      activityThisWeek: 0,
    };
    expect(pickAnalyticsComment(input)).toBe("quiet");
    expect(pickAnalyticsComment(input)).toBe(pickAnalyticsComment(input));
    expect(
      pickAnalyticsComment({
        ...input,
        activityLast3Days: 2,
        activityThisWeek: 4,
        reflectionsThisWeek: 1,
        taskCompletedThisWeek: 4,
      }),
    ).toBe("taskStable");
  });
});
