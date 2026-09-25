import { beforeEach, describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { AuthProvider } from "@/lib/firebase/AuthProvider";
import { I18nProvider } from "@/lib/i18n";
import Settings from "@/pages/Settings";
import { LEGACY_KEYS } from "@/lib/v3/legacy-migration";
import { getPlanItem, getSettings, createPlanItem } from "@/lib/v3/repository";
import { emptyData } from "@/lib/v3/schema";
import { resetEssencesDataCache, saveEssencesData } from "@/lib/v3/storage";
import { resetSyncModuleForTests } from "@/lib/firebase/sync";

function renderSettings() {
  return render(
    <I18nProvider>
      <AuthProvider>
        <MemoryRouter>
          <Settings />
        </MemoryRouter>
      </AuthProvider>
    </I18nProvider>,
  );
}

describe("Phase 11 Settings", () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem("growth-app-lang", "en");
    resetEssencesDataCache();
    resetSyncModuleForTests();
    saveEssencesData(emptyData());
  });

  it("1. Weekly toggle writes V3 and keeps Weekly PlanItems", () => {
    const weekly = createPlanItem({
      level: "weekly",
      title: "Keep me",
      periodStart: "2026-09-21",
      periodEnd: "2026-09-27",
    });
    renderSettings();
    const toggle = screen.getByTestId("settings-weekly-planning");
    fireEvent.click(toggle);
    expect(getSettings().weeklyPlanningEnabled).toBe(false);
    expect(getPlanItem(weekly.id)?.title).toBe("Keep me");
    expect(localStorage.getItem(LEGACY_KEYS.reusable)).toBeNull();
  });

  it("2. Reflection settings write UserSettings without changing session semantics", () => {
    renderSettings();
    fireEvent.click(screen.getByTestId("settings-reflection-morning"));
    expect(getSettings().reflectionSchedule.daily.scheduleOffsetDays).toBe(1);
    fireEvent.change(screen.getByTestId("settings-reflection-weekday"), { target: { value: "3" } });
    expect(getSettings().reflectionSchedule.weekly.weekday).toBe(3);
    fireEvent.change(screen.getByTestId("settings-reflection-monthly-day"), { target: { value: "15" } });
    expect(getSettings().reflectionSchedule.monthly.dayOfMonth).toBe(15);
    fireEvent.change(screen.getByTestId("settings-reflection-future-day"), { target: { value: "20" } });
    expect(getSettings().reflectionSchedule.future.dayOfMonth).toBe(20);
  });

  it("3. signed-out settings still load grouped sections", () => {
    renderSettings();
    expect(screen.getByText("Account")).toBeTruthy();
    expect(screen.getByText("Cloud / Sync")).toBeTruthy();
    expect(screen.getByTestId("settings-sync-status").textContent).toMatch(/Local only/i);
    expect(screen.queryByText("Delete account")).toBeNull();
  });

  it("shows a switch for reusable tasks on ToDo", () => {
    renderSettings();
    const toggle = screen.getByTestId("settings-show-templates-todo");
    expect(getSettings().showTaskTemplatesOnTodo).toBe(true);
    fireEvent.click(toggle);
    expect(getSettings().showTaskTemplatesOnTodo).toBe(false);
  });

  it("4. Settings creates a V3 TaskTemplate and does not write reusable-tasks", () => {
    renderSettings();
    fireEvent.change(screen.getAllByPlaceholderText("Add a reusable task")[0], {
      target: { value: "Email professor" },
    });
    fireEvent.click(screen.getAllByRole("button", { name: "Add" })[0]);
    expect(localStorage.getItem(LEGACY_KEYS.reusable)).toBeNull();
    expect(screen.getByText("Email professor")).toBeTruthy();
  });
});
