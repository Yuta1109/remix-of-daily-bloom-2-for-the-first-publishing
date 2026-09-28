import { beforeEach, describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { I18nProvider } from "@/lib/i18n";
import Plan from "@/pages/Plan";
import PlanHome from "@/pages/PlanHome";
import Replan from "@/pages/Replan";
import ReflectionCenter from "@/pages/ReflectionCenter";
import { emptyData } from "@/lib/v3/schema";
import { resetEssencesDataCache, saveEssencesData } from "@/lib/v3/storage";

function renderCycle(path = "/plan") {
  return render(
    <I18nProvider>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/plan" element={<Plan />} />
          <Route path="/plan/home" element={<PlanHome />} />
          <Route path="/plan/reflection" element={<ReflectionCenter />} />
          <Route path="/plan/replan" element={<Replan />} />
        </Routes>
      </MemoryRouter>
    </I18nProvider>,
  );
}

describe("Plan cycle navigation", () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem("growth-app-lang", "en");
    resetEssencesDataCache();
    saveEssencesData(emptyData());
  });

  it("shows Plan, Do, Reflection, and Replan on Do, with Do selected", () => {
    renderCycle("/plan");
    expect(screen.getByRole("navigation", { name: "Plan, Do, Reflection, Replan" })).toBeTruthy();
    expect(screen.getByTestId("cycle-do")).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("heading", { name: "Planning" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Do" })).toBeNull();
    expect(screen.getByRole("tab", { name: "Future" })).toBeTruthy();
    expect(screen.queryByRole("tab", { name: "Reflection" })).toBeNull();
  });

  it("opens Plan, Reflection, and Replan immediately from the cycle", () => {
    renderCycle("/plan");
    fireEvent.click(screen.getByTestId("cycle-plan"));
    expect(screen.getByRole("heading", { name: "Planning" })).toBeTruthy();
    expect(screen.getByTestId("cycle-plan")).toHaveAttribute("aria-current", "page");

    fireEvent.click(screen.getByTestId("cycle-reflection"));
    expect(screen.getByTestId("cycle-reflection")).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("tab", { name: "Daily" })).toBeTruthy();

    fireEvent.click(screen.getByTestId("cycle-replan"));
    expect(screen.getByTestId("cycle-replan")).toHaveAttribute("aria-current", "page");

    fireEvent.click(screen.getByTestId("cycle-do"));
    expect(screen.getByTestId("cycle-do")).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("tab", { name: "Future" })).toBeTruthy();
  });
});
