import { readFileSync } from "node:fs";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { I18nProvider } from "@/lib/i18n";
import { CalendarDayContent } from "@/components/calendar/CalendarDayContent";
import { ImagePreview } from "@/components/notes/ImagePreview";
import { ConfirmMessage } from "@/components/notes/ConfirmMessage";
import { todayLocalDate } from "@/lib/v3/local-date";

function source(path: string) {
  return readFileSync(path, "utf8");
}

describe("Phase 15-LG-4 interaction", () => {
  it("opens day-popup add actions immediately and routes each plus to its own sheet", () => {
    const day = source("src/components/calendar/CalendarDaySheet.tsx");
    const calendar = source("src/pages/Calendar.tsx");
    expect(day).not.toContain("setTimeout");
    expect(calendar).not.toContain("setTimeout");
    expect(calendar).toContain("setTaskSheetRequest({ mode: \"create\"");
    expect(calendar).toContain("setModalOpen(true)");
    expect(calendar).toContain("liquid-glass-follow");

    const onAddTask = vi.fn();
    const onAddEvent = vi.fn();
    render(
      <I18nProvider>
        <CalendarDayContent
          date={todayLocalDate()}
          tasks={[]}
          events={[]}
          onEditTask={() => undefined}
          onTasksChanged={() => undefined}
          onEditEvent={() => undefined}
          onAddTask={onAddTask}
          onAddEvent={onAddEvent}
          onOpenWallpaper={() => undefined}
        />
      </I18nProvider>,
    );
    fireEvent.click(screen.getByTestId("calendar-add-event"));
    expect(onAddEvent).toHaveBeenCalledTimes(1);
    expect(onAddTask).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("calendar-add-task"));
    expect(onAddTask).toHaveBeenCalledTimes(1);
    expect(onAddEvent).toHaveBeenCalledTimes(1);
  });

  it("keeps save and close on the shared control without a pre-close delay", () => {
    const task = source("src/components/plan/DailyTaskSheet.tsx");
    const event = source("src/components/EventSheet.tsx");
    expect(task).toContain("onSaved(saved)");
    expect(task).toContain("close()");
    expect(task.indexOf("onSaved(saved)")).toBeLessThan(task.indexOf("} catch"));
    expect(event).toContain("<GlassControl");
    expect(event).not.toContain("setTimeout");
  });

  it("closes image preview and delete confirmation from glass controls", () => {
    const onClose = vi.fn();
    const { unmount } = render(
      <ImagePreview src="https://example.com/preview.png" closeLabel="Close preview" onClose={onClose} />,
    );
    const close = screen.getByTestId("note-image-preview-close");
    expect(close.getAttribute("data-glass")).toBe("regular");
    expect(close.textContent).toBe("");
    fireEvent.click(close);
    expect(onClose).toHaveBeenCalledTimes(1);
    unmount();

    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(
      <ConfirmMessage
        open
        message="Delete this note?"
        confirmLabel="Delete"
        cancelLabel="Cancel"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );
    expect(document.querySelector(".liquid-glass-surface")).toBeTruthy();
    fireEvent.click(screen.getByTestId("confirm-message-confirm"));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    const cancel = screen.getAllByRole("button", { name: "Cancel" }).find((button) => button.getAttribute("data-glass"));
    fireEvent.click(cancel!);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("keeps detail backs icon-only and swipe release on the shared spring", () => {
    for (const path of [
      "src/pages/MemoDetailPage.tsx",
      "src/pages/CollectionPage.tsx",
      "src/pages/Privacy.tsx",
    ]) {
      const text = source(path);
      expect(text, path).toContain("GlassControl");
      expect(text, path).not.toMatch(/>\s*\{t\("back"\)\}/);
    }
    const swipe = source("src/components/SwipeBackPage.tsx");
    expect(swipe).toContain("var(--glass-duration)");
    expect(swipe).toContain("var(--glass-spring)");
    expect(swipe).toContain("borderRadius: dx > 0 ? 16 : 0");
    expect(swipe).toContain("if (accept)");
    expect(swipe).not.toContain("0.28s");
    const nav = source("src/components/BottomNav.tsx");
    expect(nav).toContain("liquid-glass-selected-move");
    expect(nav).not.toContain("setTimeout");
  });
});
