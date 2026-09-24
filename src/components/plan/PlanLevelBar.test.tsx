import { beforeEach, describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { I18nProvider } from "@/lib/i18n";
import { PlanLevelBar, type PlanUiLevel } from "@/components/plan/PlanLevelBar";
import { useState } from "react";

function Harness({ showWeekly }: { showWeekly: boolean }) {
  const [value, setValue] = useState<PlanUiLevel>("future");
  return (
    <I18nProvider>
      <PlanLevelBar value={value} onChange={setValue} showWeekly={showWeekly} />
    </I18nProvider>
  );
}

describe("PlanLevelBar", () => {
  beforeEach(() => {
    localStorage.setItem("growth-app-lang", "en");
  });
  it("shows Future, Monthly, Weekly, and Daily when Weekly planning is on", () => {
    render(<Harness showWeekly />);
    const tabs = screen.getAllByRole("tab");
    expect(tabs.map((t) => t.textContent)).toEqual(["Future", "Monthly", "Weekly", "Daily"]);
  });

  it("hides Weekly when the setting is off, without removing Daily", () => {
    render(<Harness showWeekly={false} />);
    const tabs = screen.getAllByRole("tab");
    expect(tabs.map((t) => t.textContent)).toEqual(["Future", "Monthly", "Daily"]);
    expect(screen.queryByRole("tab", { name: "Weekly" })).toBeNull();
  });

  it("lets the user move between Future, Monthly, and Weekly without leaving Plan", () => {
    render(<Harness showWeekly />);
    fireEvent.click(screen.getByRole("tab", { name: "Monthly" }));
    expect(screen.getByRole("tab", { name: "Monthly" })).toHaveAttribute("aria-selected", "true");
    fireEvent.click(screen.getByRole("tab", { name: "Weekly" }));
    expect(screen.getByRole("tab", { name: "Weekly" })).toHaveAttribute("aria-selected", "true");
    fireEvent.click(screen.getByRole("tab", { name: "Future" }));
    expect(screen.getByRole("tab", { name: "Future" })).toHaveAttribute("aria-selected", "true");
  });
});
