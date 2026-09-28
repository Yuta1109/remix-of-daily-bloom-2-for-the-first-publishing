import { beforeEach, describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { SessionScrollKeeper } from "@/components/SessionScrollKeeper";
import { useSessionView } from "@/hooks/use-session-view";
import {
  PLANNING_VIEW,
  recallSessionLocation,
  recallSessionScroll,
  rememberSessionLocation,
  rememberSessionScroll,
  resetSessionNav,
  sessionAreaForPath,
  sessionTabTarget,
} from "@/lib/session-nav";

function LevelProbe() {
  const [level, setLevel] = useSessionView("planning", PLANNING_VIEW.doLevel, "future");
  return (
    <button type="button" onClick={() => setLevel("weekly")}>
      {String(level)}
    </button>
  );
}

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="loc">{location.pathname}</div>;
}

describe("session navigation memory", () => {
  beforeEach(() => {
    resetSessionNav();
  });

  it("maps planning and notes paths, and leaves settings alone", () => {
    expect(sessionAreaForPath("/plan/home")).toBe("planning");
    expect(sessionAreaForPath("/plan/reflection/abc")).toBe("planning");
    expect(sessionAreaForPath("/notes/n/1")).toBe("notes");
    expect(sessionAreaForPath("/settings")).toBeNull();
  });

  it("restores the planning tab and leaves other tabs on their root", () => {
    rememberSessionLocation("planning", "/plan/home");
    rememberSessionLocation("notes", "/note/n/abc");
    expect(sessionTabTarget("/plan", ["/plan"])).toBe("/plan/home");
    expect(sessionTabTarget("/note", ["/note", "/notes"])).toBe("/note");
  });

  it("ignores a remembered path that is not inside the tab", () => {
    rememberSessionLocation("planning", "/settings");
    expect(sessionTabTarget("/plan", ["/plan"])).toBe("/plan");
  });

  it("keeps a view value after the component unmounts", () => {
    const first = render(<LevelProbe />);
    fireEvent.click(screen.getByRole("button"));
    first.unmount();
    render(<LevelProbe />);
    expect(screen.getByRole("button")).toHaveTextContent("weekly");
  });

  it("drops a saved plan path that no longer exists", () => {
    function FocusProbe() {
      const [focus, setFocus] = useSessionView<{ id: string } | null>(
        "planning",
        PLANNING_VIEW.replanFocus,
        null,
        (value) => value === null || value.id === "live",
      );
      return (
        <button type="button" onClick={() => setFocus({ id: "gone" })}>
          {focus?.id ?? "none"}
        </button>
      );
    }
    const first = render(<FocusProbe />);
    fireEvent.click(screen.getByRole("button"));
    first.unmount();
    render(<FocusProbe />);
    expect(screen.getByRole("button")).toHaveTextContent("none");
  });

  it("restores the scroll offset of a planning page", () => {
    rememberSessionLocation("planning", "/plan");
    rememberSessionScroll("planning", "/plan", 240);
    render(
      <MemoryRouter initialEntries={["/plan"]}>
        <SessionScrollKeeper />
        <div className="app-shell-scroll" data-testid="scroller" style={{ height: 100, overflow: "auto" }}>
          <div style={{ height: 800 }} />
        </div>
        <Routes>
          <Route path="*" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByTestId("scroller").scrollTop).toBe(240);
    expect(recallSessionScroll("planning", "/plan")).toBe(240);
    expect(recallSessionLocation("planning")).toBe("/plan");
  });
});
