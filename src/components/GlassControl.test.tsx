import { readFileSync } from "node:fs";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { GlassControl } from "@/components/GlassControl";

const css = readFileSync("src/index.css", "utf8");

describe("Liquid Glass control", () => {
  it("renders regular, prominent, and bar variants with an accessible name", () => {
    const { rerender } = render(<GlassControl aria-label="Back">B</GlassControl>);
    const regular = screen.getByRole("button", { name: "Back" });
    expect(regular.getAttribute("data-glass")).toBe("regular");
    expect(regular.className).toContain("liquid-glass");
    expect(regular.className).toContain("liquid-glass-regular");

    rerender(
      <GlassControl variant="prominent" size="prominent" aria-label="Add">
        +
      </GlassControl>,
    );
    const plus = screen.getByRole("button", { name: "Add" });
    expect(plus.getAttribute("data-glass")).toBe("prominent");
    expect(plus.className).toContain("liquid-glass-accent");
    expect(plus.className).toContain("liquid-glass-prominent-size");

    rerender(
      <GlassControl variant="bar" aria-label="Tabs">
        Tabs
      </GlassControl>,
    );
    expect(screen.getByRole("button", { name: "Tabs" }).className).toContain("liquid-glass-bar");

    rerender(
      <GlassControl size="label" aria-label="Today">
        Today
      </GlassControl>,
    );
    const label = screen.getByRole("button", { name: "Today" });
    expect(label.className).toContain("liquid-glass-label");
    expect(label.className).not.toContain("liquid-glass-regular");
    expect(label.textContent).toBe("Today");
  });

  it("marks the pressed state and skips it while disabled", () => {
    const { rerender } = render(<GlassControl aria-label="Back">B</GlassControl>);
    const button = screen.getByRole("button", { name: "Back" });
    fireEvent.pointerDown(button);
    expect(button.getAttribute("data-pressed")).toBe("true");
    fireEvent.pointerUp(button);
    expect(button.getAttribute("data-pressed")).toBeNull();

    rerender(
      <GlassControl aria-label="Back" disabled>
        B
      </GlassControl>,
    );
    const disabled = screen.getByRole("button", { name: "Back" });
    expect(disabled).toBeDisabled();
    fireEvent.pointerDown(disabled);
    expect(disabled.getAttribute("data-pressed")).toBeNull();
  });

  it("defines selected tint, press scale, and reduced motion in the shared stylesheet", () => {
    expect(css).toContain(".liquid-glass-selected");
    expect(css).toContain(".liquid-glass-label");
    expect(css).toContain(".liquid-glass-surface");
    expect(css).toContain("scale(var(--glass-pressed-scale))");
    expect(css).toContain("--glass-pressed-scale: 0.96");
    expect(css).toContain("--glass-duration: 180ms");
    expect(css).toContain("--glass-pill-duration: 220ms");
    expect(css).toContain("--glass-spring: cubic-bezier(0.32, 1.12, 0.56, 1)");
    expect(css).toContain(".liquid-glass-follow");
    expect(css).toContain(".liquid-glass-selected-move");
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
    const reduceAt = css.indexOf("@media (prefers-reduced-motion: reduce)");
    const pressedStop = css.indexOf(
      '.liquid-glass[data-pressed="true"]:not(:disabled):not([aria-disabled="true"])',
      reduceAt,
    );
    expect(pressedStop).toBeGreaterThan(reduceAt);
    expect(css.slice(pressedStop, pressedStop + 240)).toContain("transform: none");
    expect(css).toContain("@media (prefers-reduced-transparency: reduce)");
    expect(css).not.toContain("hsl(var(--background) / 0.72)");
    expect(css).not.toContain("hsl(var(--accent) / 0.92)");
  });
});
