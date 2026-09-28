import { beforeEach, describe, expect, it } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { I18nProvider } from "@/lib/i18n";
import Plan from "@/pages/Plan";
import PlanHome from "@/pages/PlanHome";
import Replan from "@/pages/Replan";
import { emptyData } from "@/lib/v3/schema";
import {
  completeTask,
  createPlanItem,
  createTask,
  getMainPlan,
  getPlanItem,
  setMainPlan,
  updatePlanItem,
} from "@/lib/v3/repository";
import { resetEssencesDataCache, saveEssencesData } from "@/lib/v3/storage";

function renderHome() {
  return render(
    <I18nProvider>
      <MemoryRouter initialEntries={["/plan/home"]}>
        <Routes>
          <Route path="/plan" element={<Plan />} />
          <Route path="/plan/home" element={<PlanHome />} />
          <Route path="/plan/replan" element={<Replan />} />
        </Routes>
      </MemoryRouter>
    </I18nProvider>,
  );
}

function levels() {
  return screen.getAllByTestId("plan-path-node").map((node) => node.getAttribute("data-level"));
}

describe("Plan home", () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem("growth-app-lang", "en");
    resetEssencesDataCache();
    saveEssencesData(emptyData());
  });

  it("shows the main plan, create, and list — without a level list of its own", () => {
    renderHome();
    expect(screen.getByRole("heading", { name: "Main plan" })).toBeTruthy();
    expect(screen.getByTestId("plan-create")).toHaveTextContent("Create a new plan");
    expect(screen.getByTestId("plan-see-list")).toHaveTextContent("See the list");
    expect(screen.queryByText("Current Plan")).toBeNull();
    expect(screen.queryByTestId("plan-path")).toBeNull();
    expect(screen.queryByRole("tab", { name: "Future" })).toBeNull();
  });

  it("shows only the levels that exist for a monthly main plan", () => {
    const monthly = createPlanItem({
      level: "monthly",
      title: "September",
      periodStart: "2026-09-01",
      periodEnd: "2026-09-30",
    });
    const weekly = createPlanItem({
      level: "weekly",
      title: "This week",
      parentPlanId: monthly.id,
      periodStart: "2026-09-21",
      periodEnd: "2026-09-27",
    });
    createTask({ title: "Write", date: "2026-09-26", parentPlanId: weekly.id });
    setMainPlan({ subjectType: "plan", subjectId: monthly.id });

    renderHome();
    expect(levels()).toEqual(["monthly", "weekly", "daily"]);
    expect(screen.queryByText("Future")).toBeNull();
    expect(screen.getByTestId("plan-replan")).toBeTruthy();
    expect(screen.getByTestId("plan-delete")).toBeTruthy();
  });

  it("shows completion and a postpone outcome on the path", () => {
    const monthly = createPlanItem({ level: "monthly", title: "September" });
    updatePlanItem(monthly.id, { inPostponeBox: true });
    const task = createTask({ title: "Write", date: "2026-09-26" });
    completeTask(task.id, true);
    setMainPlan({ subjectType: "task", subjectId: task.id });

    const { unmount } = renderHome();
    expect(levels()).toEqual(["daily"]);
    expect(screen.getByTestId("plan-path-status")).toHaveTextContent("Completed");
    unmount();

    setMainPlan({ subjectType: "plan", subjectId: monthly.id });
    renderHome();
    expect(screen.getByTestId("plan-path-status")).toHaveTextContent("Postpone");
    expect(screen.queryByText("Future")).toBeNull();
  });

  it("opens Replan and the Do list immediately", () => {
    const monthly = createPlanItem({ level: "monthly", title: "September" });
    setMainPlan({ subjectType: "plan", subjectId: monthly.id });
    renderHome();

    fireEvent.click(screen.getByTestId("plan-replan"));
    expect(screen.getByTestId("cycle-replan")).toHaveAttribute("aria-current", "page");
  });

  it("opens the Do page from See the list", () => {
    renderHome();
    fireEvent.click(screen.getByTestId("plan-see-list"));
    expect(screen.getByTestId("cycle-do")).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("tab", { name: "Future" })).toBeTruthy();
  });

  it("asks before deleting and leaves the plan in place when cancelled", () => {
    const monthly = createPlanItem({ level: "monthly", title: "September" });
    setMainPlan({ subjectType: "plan", subjectId: monthly.id });
    renderHome();

    fireEvent.click(screen.getByTestId("plan-delete"));
    const dialog = screen.getByTestId("plan-delete-confirm");
    expect(dialog).toHaveTextContent("Delete this plan?");
    fireEvent.click(within(dialog).getByText("Cancel"));
    expect(screen.queryByTestId("plan-delete-confirm")).toBeNull();
    expect(getPlanItem(monthly.id)?.status).toBe("active");
    expect(getMainPlan()?.subjectId).toBe(monthly.id);

    fireEvent.click(screen.getByTestId("plan-delete"));
    fireEvent.click(screen.getByTestId("plan-delete-confirm-confirm"));
    expect(screen.getByText("Choose a main plan from the plan edit screen.")).toBeTruthy();
    expect(getPlanItem(monthly.id)?.status).toBe("archived");
    expect(getMainPlan()).toBeNull();
  });

  it("changes the main plan from the plan edit screen", () => {
    const monthly = createPlanItem({ level: "monthly", title: "September" });
    const weekly = createPlanItem({
      level: "weekly",
      title: "This week",
      parentPlanId: monthly.id,
      periodStart: "2026-09-21",
      periodEnd: "2026-09-27",
    });
    setMainPlan({ subjectType: "plan", subjectId: monthly.id });
    renderHome();

    fireEvent.click(within(screen.getByTestId("plan-path")).getByText("This week"));
    fireEvent.click(screen.getByTestId("set-main-plan"));
    expect(getMainPlan()?.subjectId).toBe(weekly.id);
    expect(screen.getByTestId("set-main-plan")).toHaveTextContent("This is the main plan");
  });

  it("reuses the existing create sheet for a chosen level", () => {
    renderHome();
    fireEvent.click(screen.getByTestId("plan-create"));
    fireEvent.click(screen.getByTestId("plan-create-daily"));
    expect(screen.getByText("New Task")).toBeTruthy();
  });
});
