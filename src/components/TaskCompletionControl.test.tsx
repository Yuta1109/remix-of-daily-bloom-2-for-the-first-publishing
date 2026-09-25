import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { TaskCompletionControl } from "./TaskCompletionControl";

describe("Phase 14-B task completion control", () => {
  it("places the control on the right and uses a circle when unchecked", () => {
    render(
      <div className="flex">
        <span>Task</span>
        <TaskCompletionControl
          completed={false}
          color="#7c5cbf"
          label="Complete"
          onToggle={() => {}}
        />
      </div>,
    );
    const button = screen.getByTestId("task-completion-control");
    expect(button.className).toContain("ml-auto");
    expect(button.getAttribute("data-completed")).toBe("false");
    const mark = button.querySelector("span");
    expect(mark?.className).toContain("rounded-full");
    expect(mark?.querySelector("svg")).toBeNull();
  });

  it("shows a check and the completion animation class when completed", async () => {
    const onToggle = vi.fn();
    render(
      <TaskCompletionControl completed color="#7c5cbf" label="Undo" onToggle={onToggle} />,
    );
    const button = screen.getByTestId("task-completion-control");
    expect(button.querySelector("svg")).toBeTruthy();
    expect(button.querySelector("span")?.className).toContain("animate-check-pop");
    fireEvent.click(button);
    expect(onToggle).toHaveBeenCalledOnce();
  });
});
