import { beforeEach, describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { I18nProvider } from "@/lib/i18n";
import Progress from "@/pages/Progress";
import { addDays, todayLocalDate } from "@/lib/v3/local-date";
import {
  completeTask,
  createTask,
  ensureDailyChallenges,
  getDailyChallenges,
  getPointBalance,
  getTaskStreak,
} from "@/lib/v3/repository";
import { emptyData } from "@/lib/v3/schema";
import { loadEssencesData, resetEssencesDataCache, saveEssencesData } from "@/lib/v3/storage";

function renderProgress() {
  return render(
    <I18nProvider>
      <MemoryRouter initialEntries={["/progress"]}>
        <Progress />
      </MemoryRouter>
    </I18nProvider>,
  );
}

describe("Progress page", () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem("growth-app-lang", "en");
    resetEssencesDataCache();
    saveEssencesData(emptyData());
  });

  it("18. reflects Daily Challenge completed state from activity, not a tap", () => {
    const today = todayLocalDate();
    ensureDailyChallenges(today);
    const task = createTask({ title: "Send email", date: today });
    completeTask(task.id);
    renderProgress();
    const created = document.querySelector('[data-challenge-id="challenge.task_created"]');
    expect(created).toBeNull();
    fireEvent.click(screen.getByTestId("daily-challenge-section"));
    const createdOpen = document.querySelector('[data-challenge-id="challenge.task_created"]');
    expect(createdOpen).toBeTruthy();
    expect(createdOpen?.getAttribute("data-completed")).toBe("true");
    expect(createdOpen?.querySelector("button")).toBeNull();
    expect(screen.getByLabelText(/Create a task, Clear/)).toBeTruthy();
    expect(screen.getAllByText("+5 pts").length).toBeGreaterThan(0);
  });

  it("19. shows Special Challenge as locked / coming soon", () => {
    const first = renderProgress();
    const special = screen.getByTestId("special-challenge");
    expect(special.getAttribute("data-state")).toBe("locked");
    expect(screen.getByText("Special Challenge — coming soon")).toBeTruthy();
    expect(screen.getByText("Special Challenges are locked for now.")).toBeTruthy();
    first.unmount();

    const data = loadEssencesData();
    data.user.specialChallengeState = "comingSoon";
    saveEssencesData(data);
    resetEssencesDataCache();
    renderProgress();
    expect(screen.getByTestId("special-challenge").getAttribute("data-state")).toBe("comingSoon");
    expect(screen.getByText("Special Challenges will arrive in a later update.")).toBeTruthy();
  });

  it("20. shows the current points summary from the ledger", () => {
    const today = todayLocalDate();
    ensureDailyChallenges(today);
    const task = createTask({ title: "Send email", date: today });
    completeTask(task.id);
    renderProgress();
    const points = screen.getByTestId("progress-points");
    expect(points.textContent).toMatch(String(getPointBalance()));
    expect(points.textContent).toMatch(/pts/);
  });
});

describe("17. streak uses local dates", () => {
  beforeEach(() => {
    localStorage.clear();
    resetEssencesDataCache();
    saveEssencesData(emptyData());
  });

  it("counts consecutive local days of completed listed tasks", () => {
    const today = todayLocalDate();
    const yesterday = addDays(today, -1);
    const t1 = createTask({ title: "today", date: today });
    completeTask(t1.id);
    const t2 = createTask({ title: "yesterday", date: yesterday });
    completeTask(t2.id);
    expect(getTaskStreak(today)).toBe(2);
    expect(getDailyChallenges(today).length).toBeGreaterThanOrEqual(0);
  });
});
