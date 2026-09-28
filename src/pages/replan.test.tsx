import { beforeEach, describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { I18nProvider } from "@/lib/i18n";
import PostponeBox from "@/pages/PostponeBox";
import Replan from "@/pages/Replan";
import { emptyData } from "@/lib/v3/schema";
import { localMonthEnd, localMonthStart } from "@/lib/v3/local-date";
import {
  breakdownPlanItem,
  createPlanItem,
  getPlanItem,
  getPlanItems,
  setMainPlan,
  updatePlanItem,
} from "@/lib/v3/repository";
import { loadEssencesData, resetEssencesDataCache, saveEssencesData } from "@/lib/v3/storage";

function renderReplan() {
  return render(
    <I18nProvider>
      <MemoryRouter initialEntries={["/plan/replan"]}>
        <Routes>
          <Route path="/plan/replan" element={<Replan />} />
          <Route path="/plan/postpone-box" element={<PostponeBox />} />
        </Routes>
      </MemoryRouter>
    </I18nProvider>,
  );
}

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem("growth-app-lang", "en");
  resetEssencesDataCache();
  saveEssencesData(emptyData());
});

describe("Replan page", () => {
  it("shows a monthly path without adding Future, then detaches a child", () => {
    const monthly = createPlanItem({
      level: "monthly",
      title: "September",
      periodStart: localMonthStart("2026-09"),
      periodEnd: localMonthEnd("2026-09"),
    });
    const weekly = breakdownPlanItem(monthly.id, {
      title: "Read",
      periodStart: "2026-09-21",
      periodEnd: "2026-09-27",
    });
    setMainPlan({ subjectType: "plan", subjectId: monthly.id });
    renderReplan();

    expect(screen.getByTestId("replan-level-chain").textContent).toBe("Monthly → Weekly");
    expect(screen.getAllByTestId("replan-path-node").map((node) => node.getAttribute("data-level"))).toEqual([
      "monthly",
      "weekly",
    ]);
    expect(screen.getByTestId("replan-edit")).toBeTruthy();
    expect(screen.getByTestId("replan-add")).toBeTruthy();
    expect(screen.getByTestId("replan-decompose")).toBeEnabled();

    fireEvent.click(screen.getByText("Read"));
    fireEvent.click(screen.getByTestId("replan-move"));
    fireEvent.change(screen.getByTestId("replan-move-parent"), { target: { value: "" } });
    fireEvent.click(screen.getByTestId("replan-move-apply"));

    expect(getPlanItem(weekly.id)?.parentPlanId).toBeUndefined();
    expect(getPlanItems({ level: "future" })).toHaveLength(0);
  });

  it("opens the Postpone Box without a date field and groups items there", () => {
    const first = createPlanItem({
      level: "weekly",
      title: "First",
      periodStart: "2026-09-07",
      periodEnd: "2026-09-13",
    });
    const second = createPlanItem({
      level: "weekly",
      title: "Second",
      periodStart: "2026-09-14",
      periodEnd: "2026-09-20",
    });
    updatePlanItem(first.id, { inPostponeBox: true });
    updatePlanItem(second.id, { inPostponeBox: true });
    renderReplan();

    fireEvent.click(screen.getByTestId("replan-postpone"));
    expect(screen.getByRole("heading", { name: "Postpone Box" })).toBeTruthy();
    expect(screen.getByText("A date is not required.")).toBeTruthy();
    expect(document.querySelector('input[type="date"]')).toBeNull();

    fireEvent.click(screen.getByRole("checkbox", { name: "First" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Second" }));
    fireEvent.change(screen.getByTestId("postpone-group-title"), { target: { value: "Held" } });
    fireEvent.click(screen.getByTestId("postpone-group-apply"));

    const held = Object.values(loadEssencesData().plans).find((plan) => plan.title === "Held");
    expect(held?.level).toBe("monthly");
    expect(held?.inPostponeBox).toBe(true);
    expect(held?.periodStart).toBeUndefined();
    expect(getPlanItem(first.id)?.parentPlanId).toBe(held?.id);
    expect(getPlanItem(first.id)?.inPostponeBox).toBe(true);
  });
});
