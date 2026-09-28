import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { I18nProvider } from "@/lib/i18n";
import Progress from "@/pages/Progress";
import ProgressAnalytics from "@/pages/ProgressAnalytics";
import ProgressPoints from "@/pages/ProgressPoints";
import type { EssencesAuthState } from "@/lib/firebase/auth-types";
import { DAILY_CHALLENGE_COUNT } from "@/lib/v3/challenge-definitions";
import { todayLocalDate } from "@/lib/v3/local-date";
import { PROGRESS_TOP_INCOMPLETE, loadProgressSnapshot } from "@/lib/v3/progress";
import {
  addPointTransaction,
  completeTask,
  createPlanItem,
  createTask,
  ensureDailyChallenges,
  getDailyChallenges,
} from "@/lib/v3/repository";
import { emptyData } from "@/lib/v3/schema";
import { resetEssencesDataCache, saveEssencesData } from "@/lib/v3/storage";

const authBox = vi.hoisted(() => ({
  state: {
    status: "signed_out",
    user: null,
    errorMessage: null,
  } as EssencesAuthState,
}));

vi.mock("@/lib/firebase/firebase-auth", () => ({
  getAuthState: () => authBox.state,
  subscribeAuthState: (listener: (state: EssencesAuthState) => void) => {
    listener(authBox.state);
    return () => {};
  },
}));

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

describe("Phase 15-A Progress", () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem("growth-app-lang", "en");
    resetEssencesDataCache();
    saveEssencesData(emptyData());
    authBox.state = { status: "signed_out", user: null, errorMessage: null };
  });

  it("assigns 6 daily challenges and keeps the top to incomplete slots", () => {
    const today = todayLocalDate();
    ensureDailyChallenges(today);
    expect(getDailyChallenges(today)).toHaveLength(DAILY_CHALLENGE_COUNT);
    const task = createTask({ title: "Done", date: today });
    completeTask(task.id);
    const snapshot = loadProgressSnapshot(today);
    expect(snapshot.topIncomplete.length).toBeLessThanOrEqual(PROGRESS_TOP_INCOMPLETE);
    expect(snapshot.topIncomplete.every((row) => !row.completed)).toBe(true);
    expect(snapshot.daily).toHaveLength(6);
    renderProgressApp();
    const closed = screen.getAllByTestId("daily-challenge-row");
    expect(closed.length).toBeLessThanOrEqual(3);
    expect(closed.every((row) => row.getAttribute("data-completed") === "false")).toBe(true);
    fireEvent.click(screen.getByTestId("daily-challenge-section"));
    expect(screen.getAllByTestId("daily-challenge-row")).toHaveLength(6);
    expect(document.querySelector('[data-challenge-id="challenge.task_created"]')?.getAttribute("data-completed")).toBe("true");
  });

  it("greets without a name when signed out", () => {
    renderProgressApp();
    expect(screen.getByTestId("progress-greeting").textContent).toBe("Hello!");
  });

  it("greets with the Firebase displayName", () => {
    authBox.state = {
      status: "signed_in",
      user: { uid: "u1", email: "a@b.c", displayName: "Yuta", photoURL: null },
      errorMessage: null,
    };
    renderProgressApp();
    expect(screen.getByTestId("progress-greeting").textContent).toBe("Hello, Yuta!");
  });

  it("summarizes only today's activity", () => {
    const today = todayLocalDate();
    const task = createTask({ title: "One", date: today });
    completeTask(task.id);
    createPlanItem({ level: "future", title: "Later", futureTarget: { type: "someday" } });
    addPointTransaction({ amount: 4, reason: "bonus" });
    renderProgressApp();
    const snapshot = loadProgressSnapshot(today);
    expect(screen.getByTestId("today-task-rate").textContent).toBe(`${snapshot.today.taskCompletionRate}%`);
    expect(screen.getByTestId("today-challenge-rate").textContent).toBe(`${snapshot.today.challengeCompletionRate}%`);
    expect(screen.getByTestId("today-points").textContent).toBe(String(snapshot.today.pointsEarned));
    expect(screen.getByTestId("today-planned").textContent).toBe(String(snapshot.today.plannedCount));
    expect(snapshot.today.taskCompletionRate).toBe(100);
    expect(snapshot.today.plannedCount).toBe(1);
    expect(snapshot.today.pointsEarned).toBeGreaterThan(0);
    expect(snapshot.today.challengeCompletionRate).toBeGreaterThan(0);
  });

  it("opens analytics and points, and the glass back control has no label text", () => {
    renderProgressApp();
    fireEvent.click(screen.getByTestId("progress-analytics"));
    expect(screen.getByRole("heading", { level: 1, name: "Analytics" })).toBeTruthy();
    const back = screen.getByTestId("progress-detail-back");
    expect(back.className).toContain("liquid-glass");
    expect(back.textContent).toBe("");
    fireEvent.click(back);
    expect(screen.getByRole("heading", { name: "Progress" })).toBeTruthy();

    fireEvent.click(screen.getByTestId("progress-points"));
    expect(screen.getByRole("heading", { level: 1, name: "Points" })).toBeTruthy();
    fireEvent.click(screen.getByTestId("progress-detail-back"));
    expect(screen.getByRole("heading", { name: "Progress" })).toBeTruthy();
    expect(screen.getByLabelText("Account").className).toContain("liquid-glass");
  });

  it("slides the previous page with the finger and rounds the detail page", () => {
    renderProgressApp("/progress/analytics");
    const page = document.querySelector("[data-swipe-page]") as HTMLElement;
    const underlay = document.querySelector("[data-swipe-underlay]") as HTMLElement;
    fireEvent.touchStart(page, { touches: [{ clientX: 10, clientY: 40 }] });
    fireEvent.touchMove(page, { touches: [{ clientX: 140, clientY: 42 }] });
    expect(page.style.transform).toBe("translateX(130px)");
    expect(page.style.borderRadius).toBe("16px");
    expect(underlay.style.transform).toContain("translateX(");
    expect(underlay.style.transform).not.toBe("translateX(0px)");
  });
});
