import { beforeEach, describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { I18nProvider } from "@/lib/i18n";
import { BottomNav } from "@/components/BottomNav";
import { emptyData } from "@/lib/v3/schema";
import { resetEssencesDataCache, saveEssencesData } from "@/lib/v3/storage";

/**
 * Selection must come from the route, not from any independent tab state.
 * These tests render the real router + i18n providers rather than mocking
 * `useLocation`, so a regression in the route→tab mapping fails here first.
 */
function renderNavAt(initialPath: string) {
  return render(
    <I18nProvider>
      <MemoryRouter initialEntries={[initialPath]}>
        <Routes>
          <Route path="*" element={<BottomNav />} />
        </Routes>
      </MemoryRouter>
    </I18nProvider>,
  );
}

function currentTab() {
  return screen.getByRole("button", { current: "page" });
}

describe("BottomNav", () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem("growth-app-lang", "en");
    resetEssencesDataCache();
    saveEssencesData(emptyData());
  });

  it("renders exactly five tabs in the fixed order", () => {
    renderNavAt("/");
    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(5);
    expect(buttons.map((b) => b.textContent)).toEqual([
      "Progress",
      "Plan",
      "ToDo",
      "Calendar",
      "Note",
    ]);
  });

  it("marks Progress active at the root route", () => {
    renderNavAt("/");
    expect(currentTab().textContent).toBe("Progress");
  });

  it("marks Progress active at /progress", () => {
    renderNavAt("/progress");
    expect(currentTab().textContent).toBe("Progress");
  });

  it("marks Plan active at /plan", () => {
    renderNavAt("/plan");
    expect(currentTab().textContent).toBe("Plan");
  });

  it("marks ToDo active at /todo", () => {
    renderNavAt("/todo");
    expect(currentTab().textContent).toBe("ToDo");
  });

  it("marks Calendar active at /calendar", () => {
    renderNavAt("/calendar");
    expect(currentTab().textContent).toBe("Calendar");
  });

  it("marks Note active at the new /note path", () => {
    renderNavAt("/note");
    expect(currentTab().textContent).toBe("Note");
  });

  it("marks Note active for legacy /notes deep links", () => {
    renderNavAt("/notes/some-memo-id");
    expect(currentTab().textContent).toBe("Note");
  });

  it("has no active tab on an unrelated route like /settings", () => {
    renderNavAt("/settings");
    expect(screen.queryByRole("button", { current: "page" })).toBeNull();
  });

  it("marks Plan active on /plan/reflection", () => {
    renderNavAt("/plan/reflection");
    expect(currentTab().textContent).toBe("Plan");
  });

  it("marks Plan active on a Reflection review route", () => {
    renderNavAt("/plan/reflection/session-1");
    expect(currentTab().textContent).toBe("Plan");
  });

  it("navigates when a tab is pressed", () => {
    render(
      <I18nProvider>
        <MemoryRouter initialEntries={["/progress"]}>
          <Routes>
            <Route path="*" element={<BottomNav />} />
          </Routes>
        </MemoryRouter>
      </I18nProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Calendar" }));
    expect(currentTab().textContent).toBe("Calendar");
  });

  it("exposes an accessible label for the navigation landmark", () => {
    renderNavAt("/");
    expect(screen.getByRole("navigation")).toHaveAccessibleName("Main navigation");
  });
});
