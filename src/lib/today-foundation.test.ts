import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function rate(achieved, elapsed) {
  if (elapsed <= 0) return 0;
  return Math.min(100, Math.max(0, Math.round((achieved / elapsed) * 100)));
}

function applyWeekday(everyDay, days, choice) {
  if (choice === "every") return { everyDay: true, days: [] };
  const next = new Set(everyDay ? [] : days);
  if (next.has(choice)) next.delete(choice);
  else next.add(choice);
  return { everyDay: false, days: [...next] };
}

function shiftDay(key, delta) {
  const [year, month, day] = key.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + delta);
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

describe("today and routine foundation", () => {
  const today = readFileSync("ios/App/App/Native/Features/Today/TodayPages.swift", "utf8");
  const rules = readFileSync("ios/App/App/Native/Features/Today/TodayRules.swift", "utf8");
  const planning = readFileSync("ios/App/App/Native/Features/Planning/PlanningShell.swift", "utf8");
  const root = readFileSync("ios/App/App/Native/App/NativeAppRoot.swift", "utf8");
  const memory = readFileSync("ios/App/App/Native/Features/Planning/ReflectionFlow.swift", "utf8");
  const pages = readFileSync("ios/App/App/Native/Features/Planning/ReflectionPages.swift", "utf8");
  const period = readFileSync("ios/App/App/Native/Features/Planning/PlanningPeriod.swift", "utf8");

  it("shares one planning session and keeps today sections independent", () => {
    expect(root).toContain(".environmentObject(appState.planningSession)");
    expect(planning).toContain("@EnvironmentObject private var session: PlanningSession");
    expect(today).toContain("Button(\"一覧を見る\")");
    expect(today).toContain("PeriodListCheckbox");
    expect(today).toContain("session.toggleRoutine");
    expect(today).toContain("session.setCompleted");
    expect(today).not.toContain("chevron.up");
    expect(today).not.toContain("chevron.down");
    expect(rules).toContain("func todayTasks()");
    expect(rules).toContain("func copyTaskToToday");
    expect(rules).toContain("todayCopiedOrigins.contains(token)");
  });

  it("reuses the planning popover shape and task editor", () => {
    expect(today).toContain("cornerRadius: 22");
    expect(today).toContain("glassEffect(.regular, in: shape)");
    expect(today).toContain(".ultraThinMaterial");
    expect(today).not.toContain("triangle");
    expect(today).toContain("PlanningItemEditorSheet");
    expect(today).toContain("今日のタスクを追加");
    expect(today).toContain("クイックメモを追加");
    expect(today).toContain("DragGesture(minimumDistance: 14)");
    expect(today).toContain("plusOffset = .zero");
  });

  it("computes routine weekdays, rates, and calendar shifts", () => {
    expect(rules).toContain("return (true, [])");
    expect(rules).toContain("guard elapsed > 0 else { return 0 }");
    expect(rules).toContain("todayDayBoundaryHour");
    expect(rules).toContain("value: -14");
    expect(period).toContain("calendar.date(byAdding: .day, value: delta, to: date)");
    const every = applyWeekday(true, [], 2);
    expect(every.everyDay).toBe(false);
    expect(every.days).toEqual([2]);
    const back = applyWeekday(false, [2, 4], "every");
    expect(back.everyDay).toBe(true);
    expect(back.days).toEqual([]);
    const cleared = applyWeekday(false, [2], 2);
    expect(cleared.everyDay).toBe(false);
    expect(cleared.days).toEqual([]);
    expect(rate(22, 26)).toBe(85);
    expect(rate(0, 0)).toBe(0);
    expect(shiftDay("2026-10-10", -1)).toBe("2026-10-09");
    expect(shiftDay("2026-10-10", -2)).toBe("2026-10-08");
    expect(shiftDay("2026-10-10", -3)).toBe("2026-10-07");
    expect(shiftDay("2026-03-01", -1)).toBe("2026-02-28");
    expect(shiftDay("2026-01-01", -1)).toBe("2025-12-31");
  });

  it("opens the memory editor that matches the tapped choice", () => {
    expect(memory).toContain("func prepareMemoryEditor");
    expect(memory).toContain("memoryEntries[index].kind = kind");
    expect(pages).toContain("session.prepareMemoryEditor(scope: scope, kind: kind)");
    expect(memory).toContain("static func window(aperture: CGSize, ratio: CGFloat)");
    expect(pages).toContain("PhotoMemoryFraming.window");
    expect(pages).toContain(".frame(width: usableBody, alignment: .center)");
  });
});
