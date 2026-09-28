import { readFileSync } from "node:fs";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { ConfirmMessage } from "@/components/notes/ConfirmMessage";
import { I18nProvider } from "@/lib/i18n";
import { BottomNav } from "@/components/BottomNav";

const css = readFileSync("src/index.css", "utf8");

function source(path: string) {
  return readFileSync(path, "utf8");
}

describe("Phase 15-LG-3 shared Liquid Glass", () => {
  it("keeps confirmation copy flat and the surface plus actions on the shared material", () => {
    render(
      <ConfirmMessage
        open
        message="Delete this note?"
        confirmLabel="Delete"
        cancelLabel="Cancel"
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    );
    const dialog = screen.getByTestId("confirm-message");
    const surface = dialog.querySelector(".liquid-glass-surface");
    expect(surface).toBeTruthy();
    expect(surface?.querySelector("p")?.className ?? "").not.toContain("liquid-glass");
    const actions = screen.getAllByRole("button").filter((button) => button.getAttribute("data-glass"));
    expect(actions.length).toBe(2);
    for (const action of actions) {
      expect(action.className).toContain("liquid-glass");
      expect(action.className).toContain("liquid-glass-label");
    }
  });

  it("uses the bar material and an inner selected pill on the bottom tab", () => {
    render(
      <MemoryRouter initialEntries={["/calendar"]}>
        <I18nProvider>
          <BottomNav />
        </I18nProvider>
      </MemoryRouter>,
    );
    const nav = screen.getByRole("navigation");
    expect(nav.className).toContain("liquid-glass-bar");
    expect(nav.className).not.toContain("liquid-glass-accent");
    expect(screen.getByRole("button", { current: "page" })).toBeTruthy();
    const pill = nav.querySelector(".liquid-glass-selected");
    expect(pill?.className).toContain("liquid-glass-selected-move");
  });

  it("keeps push backs icon-only on the shared regular control", () => {
    const backs = [
      "src/pages/ProgressAnalytics.tsx",
      "src/pages/ProgressPoints.tsx",
      "src/pages/RoutineList.tsx",
      "src/pages/Privacy.tsx",
      "src/pages/User.tsx",
      "src/pages/Settings.tsx",
      "src/pages/MemoDetailPage.tsx",
      "src/pages/QuickMemoPage.tsx",
      "src/pages/CollectionPage.tsx",
      "src/pages/NotesSearchPage.tsx",
      "src/pages/PostponeBox.tsx",
    ];
    for (const path of backs) {
      const text = source(path);
      expect(text, path).toContain("GlassControl");
      expect(text, path).not.toMatch(/>\s*\{t\("back"\)\}/);
      expect(text, path).not.toMatch(/>\s*戻る\s*</);
    }
  });

  it("wires plus, user, and calendar header controls to the shared variants", () => {
    expect(source("src/components/FabButton.tsx")).toContain('variant="prominent"');
    expect(source("src/components/plan/PlanFab.tsx")).toContain('variant="prominent"');
    expect(source("src/pages/NotesHomePage.tsx")).toContain('variant="prominent"');
    expect(source("src/components/UserButton.tsx")).toContain('variant="regular"');
    expect(source("src/pages/Calendar.tsx")).toContain("GlassControl");
    expect(source("src/pages/Index.tsx")).toContain("GlassControl");
    expect(css).toContain("--glass-pressed-scale: 0.96");
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
  });
});
