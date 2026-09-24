import { beforeEach, describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { MemoryRouter } from "react-router-dom";
import { I18nProvider } from "@/lib/i18n";
import Plan from "@/pages/Plan";
import ReflectionCenter from "@/pages/ReflectionCenter";
import { addDays, todayLocalDate } from "@/lib/v3/local-date";
import { createTask } from "@/lib/v3/repository";
import { emptyData } from "@/lib/v3/schema";
import { resetEssencesDataCache, saveEssencesData } from "@/lib/v3/storage";

function renderAt(ui: ReactElement, path: string) {
  return render(
    <I18nProvider>
      <MemoryRouter initialEntries={[path]}>{ui}</MemoryRouter>
    </I18nProvider>,
  );
}

describe("Reflection Plan entry and center", () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem("growth-app-lang", "en");
    resetEssencesDataCache();
    saveEssencesData(emptyData());
  });

  it("shows a secondary Reflection action on Plan, not a sixth tab", () => {
    renderAt(<Plan />, "/plan");
    expect(screen.getByRole("button", { name: /Reflection/ })).toBeTruthy();
    expect(screen.queryByRole("tab", { name: "Reflection" })).toBeNull();
  });

  it("lists Daily / Weekly / Monthly / Future plus Needs Attention", () => {
    renderAt(<ReflectionCenter />, "/plan/reflection");
    expect(screen.getByRole("heading", { name: "Reflection" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Daily" })).toHaveAttribute("aria-selected", "true");
    fireEvent.click(screen.getByRole("tab", { name: "Weekly" }));
    expect(screen.getByRole("tab", { name: "Weekly" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "Monthly" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Future" })).toBeTruthy();
    expect(screen.getByText("Needs Attention")).toBeTruthy();
    expect(screen.getByText("Schedule")).toBeTruthy();
  });

  it("shows a catch-up summary for Daily reviews older than the recent window", () => {
    createTask({ title: "old paper", date: addDays(todayLocalDate(), -40) });
    renderAt(<ReflectionCenter />, "/plan/reflection");
    expect(screen.getByText(/Daily Reflections are waiting/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Review together" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "One at a time" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Skip past" })).toBeTruthy();
  });
});
