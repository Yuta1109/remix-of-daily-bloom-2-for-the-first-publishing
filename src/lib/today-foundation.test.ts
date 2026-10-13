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
  if (next.size === 0) return { everyDay: true, days: [] };
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
  const models = readFileSync("ios/App/App/Native/Features/Planning/PlanningModels.swift", "utf8");
  const periodPage = readFileSync("ios/App/App/Native/Features/Planning/PeriodPlannerPage.swift", "utf8");
  const glass = readFileSync("ios/App/App/Native/Components/Glass/NativeGlassComponents.swift", "utf8");

  it("shares one planning session and keeps today sections independent", () => {
    expect(root).toContain(".environmentObject(appState.planningSession)");
    expect(planning).toContain("@EnvironmentObject private var session: PlanningSession");
    expect(today).toContain("Button(\"一覧を見る\")");
    expect(today).toContain("PlanningPeriodTaskList");
    expect(today).toContain("session.toggleRoutine");
    expect(today).toContain("session.setCompleted");
    expect(today).toContain("showsChevron: false");
    expect(today).toContain("showsChevron: true");
    expect(today).toContain("Text(\"Today\")");
    expect(today).toContain("PlanningPalette.paper");
    expect(models).toContain("todayRoutineExpanded = true");
    expect(models).toContain("todayTasksExpanded = true");
    expect(models).toContain("todayMemosExpanded = true");
    expect(rules).toContain("func todayTasks()");
    expect(rules).toContain("next.createdAt = existing.createdAt");
    expect(rules).toContain("func todayImportDraft");
    expect(rules).not.toContain("func copyTaskToToday");
  });

  it("uses a fixed glass add control and the shared task editor", () => {
    const main = today.slice(0, today.indexOf("struct TodayRoutineListPage"));
    const sheets = readFileSync("ios/App/App/Native/Features/Planning/PlanningItemSheets.swift", "utf8");
    expect(main).not.toContain("DragGesture");
    expect(main).not.toContain("plusOffset");
    expect(main).toContain("ZStack(alignment: .top)");
    expect(main).toContain(".frame(height: PlanningTokens.Header.height, alignment: .center)");
    expect(main).toContain(".frame(height: PlanningTokens.Header.height + 30, alignment: .center)");
    expect(main).toContain("Text(\"Today\")");
    expect(main).toContain(".font(.system(size: 15.5))");
    expect(today).toContain("PlanningGlassMorphMenu(");
    expect(today).toContain("identity: \"today-add\"");
    expect(today).toContain("expandsUpward: true");
    expect(sheets).toContain("PlanningGlassMorphMenu(");
    expect(sheets).toContain("expandsUpward: false");
    expect(glass).toContain("struct PlanningGlassMorphMenu");
    expect(glass).toContain("GlassEffectContainer(spacing: 40.0)");
    expect(glass).toContain("glassEffectID(\"\\(identity).source\", in: morph)");
    expect(glass).toContain("glassEffectID(\"\\(identity).menu\", in: morph)");
    expect(glass).toContain("glassEffectTransition(.matchedGeometry)");
    expect(glass).toContain("withAnimation(.smooth(duration: 0.5))");
    expect(glass).toContain("static func update");
    const chart = today.slice(today.indexOf("func monthChart"), today.indexOf("func monthColumn"));
    expect(chart).toContain(".frame(width: 36)");
    expect(chart).toContain("spacing: 10");
    expect(glass).toContain(".glassEffect(.regular.interactive(), in: Circle())");
    expect(glass).toContain("RoundedRectangle(cornerRadius: 22, style: .continuous)");
    expect(glass).not.toContain("plateWidth");
    expect(glass).not.toContain(".animation(");
    expect(glass).toContain("if isPresented");
    expect(glass).toContain(".ultraThinMaterial");
    expect(glass).toContain(".frame(minHeight: 48)");
    expect(glass).toContain(".contentShape(Rectangle())");
    expect(glass).toContain(".padding(.horizontal, 18)");
    expect(glass).toContain(".frame(width: 262)");
    expect(today).not.toContain("triangle");
    expect(today).not.toContain("TodayGlassAddControl");
    expect(today).toContain("PlanningItemEditorSheet");
    expect(today).toContain("今日のタスクを追加");
    expect(today).toContain("クイックメモを追加");
    expect(today).toContain("追加した時間");
    expect(today).toContain("Added at");
    expect(today).not.toContain("追加時間");
    expect(today).toContain("showsConfirm: false");
    expect(today).toContain("session.todayImportDraft(from: node)");
    expect(today).toContain("onClose: { copying = nil }");
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
    expect(cleared.everyDay).toBe(true);
    expect(cleared.days).toEqual([]);
    expect(rate(22, 26)).toBe(85);
    expect(rate(0, 0)).toBe(0);
    expect(shiftDay("2026-10-10", -1)).toBe("2026-10-09");
    expect(shiftDay("2026-10-10", -2)).toBe("2026-10-08");
    expect(shiftDay("2026-10-10", -3)).toBe("2026-10-07");
    expect(shiftDay("2026-03-01", -1)).toBe("2026-02-28");
    expect(shiftDay("2026-01-01", -1)).toBe("2025-12-31");
    expect(historyHeading("2026-10-12", "2026-10-12")).toBe("今日 10月12日（月）");
    expect(historyHeading("2026-10-11", "2026-10-12")).toBe("昨日 10月11日（日）");
    expect(historyHeading("2026-10-08", "2026-10-12")).toBe("2026年10月8日（木）");
    const imported = clearedImport({ startDay: 8, endDay: 9, startMinutes: 60, endMinutes: 90, children: [{ title: "子", startDay: 8, startMinutes: 30 }] });
    expect(imported.startDay).toBeNull();
    expect(imported.endDay).toBeNull();
    expect(imported.startMinutes).toBeNull();
    expect(imported.endMinutes).toBeNull();
    expect(imported.children[0].startDay).toBeNull();
    expect(imported.children[0].startMinutes).toBeNull();
    expect(imported.children[0].id).not.toBe("child");
  });

  it("opens the memory editor that matches the tapped choice", () => {
    expect(memory).toContain("func prepareMemoryEditor");
    expect(memory).toContain("memoryEntries[index].kind = kind");
    expect(pages).toContain("session.prepareMemoryEditor(scope: scope, kind: kind)");
    expect(memory).toContain("static func window(aperture: CGSize, ratio: CGFloat)");
    expect(pages).toContain("PhotoMemoryFraming.window");
    expect(pages).toContain(".frame(width: usableBody, alignment: .center)");
    expect(glass).toContain("UISelectionFeedbackGenerator");
    const completion = period.slice(period.indexOf("func setCompleted"), period.indexOf("func applyExternalDailyCompletion"));
    expect(completion).not.toContain("PlanningHaptics");
    expect(periodPage).toContain("PlanningHaptics.selection()");
    expect(today).toContain("PlanningHaptics.selection()");
    expect(rules).toContain("draft.startDay = nil");
    expect(rules).toContain("draft.endDay = nil");
    expect(rules).toContain("startDay: nil, endDay: nil, startMinutes: nil, endMinutes: nil");
    expect(rules).toContain("enum TodayHistoryLabel");
  });

  it("colors routine achievement and keeps six months plus shared editor", () => {
    expect(tone(0)).toBe("neutral");
    expect(tone(1)).toBe("red");
    expect(tone(24)).toBe("red");
    expect(tone(25)).toBe("purple");
    expect(tone(49)).toBe("purple");
    expect(tone(50)).toBe("blue");
    expect(tone(74)).toBe("blue");
    expect(tone(75)).toBe("green");
    expect(tone(99)).toBe("green");
    expect(tone(100)).toBe("green");
    expect(monthKeys(2026, 1, 6)).toEqual(["2025-08", "2025-09", "2025-10", "2025-11", "2025-12", "2026-01"]);
    expect(monthKeys(2026, 10, 6)).toEqual(["2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10"]);
    expect(rules).toContain("if next.isEmpty { return (true, []) }");
    expect(rules).toContain("static func monthAvailable");
    expect(rules).toContain("static func name(for percent: Int)");
    expect(today).toContain("struct RoutineTimePopup");
    expect(today).toContain("struct TodayRoutineSheet");
    expect(today).toContain("isNew ? \"ルーティンを追加\" : \"ルーティンを編集\"");
    expect(today).not.toContain("Stepper(");
    expect(today).not.toContain("DragGesture");
    expect(today).toContain("過去6か月");
    expect(today).toContain("Text(\"100%\")");
    expect(today).toContain("Text(\"0%\")");
    const column = today.slice(today.indexOf("func monthColumn"), today.indexOf("func weekCard"));
    expect(column.indexOf("ZStack(alignment: .bottom)")).toBeLessThan(column.indexOf("percent.map"));
    expect(column).toContain("monthBarLabelGap");
    expect(column).toContain("?? \"—\"");
    const week = today.slice(today.indexOf("func weekCard"), today.indexOf("func routineSectionTitle"));
    expect(week).toContain("Text(\"\\(rate)%\")");
    expect(week).toContain(".frame(height: 84)");
    expect(week).not.toContain("monthBarLabelGap");
    expect(fillWidth(200, 0)).toBe(0);
    expect(fillWidth(200, 1)).toBe(13);
    expect(fillWidth(200, 25)).toBe(50);
    expect(fillWidth(200, 50)).toBe(100);
    expect(fillWidth(200, 75)).toBe(150);
    expect(fillWidth(200, 99)).toBe(198);
    expect(fillWidth(200, 100)).toBe(200);
    expect(today).toContain("trackWidth * progress");
    expect(today).toContain("isolatesTrailingGlass: true");
    const chrome = readFileSync("ios/App/App/Native/Features/Planning/PlanningChrome.swift", "utf8");
    expect(chrome).toContain("isolatesTrailingGlass");
    expect(chrome).toContain(".sharedBackgroundVisibility(.hidden)");
    expect(chrome).toContain("trailing.frame(width: 44, height: 44)");
    expect(glass).toContain(".frame(minWidth: 44, minHeight: 44)");
    const memo = today.slice(today.indexOf("struct TodayMemoSheet"), today.indexOf("struct TodayPastTasksSheet"));
    expect(memo).toContain("if !isNew");
    expect(memo).toContain("cornerRadius: 14");
    expect(memo).toContain("postponeDeleteConfirm");
    expect(memo).toContain(".frame(height: 52)");
    expect(today).toContain("RoutineAchievementTone.monthLabel");
    expect(today).toContain("if !isNew");
    expect(today).toContain("TodayFixedAddButton");
    expect(today).toContain(".padding(16)");
    const editor = today.slice(today.indexOf("struct TodayRoutineSheet"), today.indexOf("struct TodayMemoSheet"));
    expect(editor).toContain("PlanningDiscardConfirmation.present");
    expect(editor).toContain("end > start");
    expect(dailySchedule(null, 9 * 60, null)).toBe("9:00");
    expect(dailySchedule(null, 9 * 60, 10 * 60 + 15)).toBe("9:00〜10:15");
    expect(dailySchedule(null, null, null)).toBeNull();
    expect(dailySchedule(12, 9 * 60, 10 * 60)).toBe("date");
    expect(period).toContain("if bucket == .daily, day == nil");
    expect(periodPage).toContain("subtaskSchedule(bucket: bucket");
  });
});

function fillWidth(trackWidth, percent) {
  const progress = Math.min(Math.max(percent, 0), 100) / 100;
  if (percent <= 0) return 0;
  if (percent >= 100) return trackWidth;
  return Math.max(13, trackWidth * progress);
}

function dailySchedule(day, minutes, endMinutes) {
  if (day == null) {
    if (minutes == null) return null;
    const start = `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, "0")}`;
    if (endMinutes == null) return start;
    const end = `${Math.floor(endMinutes / 60)}:${String(endMinutes % 60).padStart(2, "0")}`;
    return `${start}〜${end}`;
  }
  return "date";
}

function tone(percent) {
  if (percent <= 0) return "neutral";
  if (percent < 25) return "red";
  if (percent < 50) return "purple";
  if (percent < 75) return "blue";
  return "green";
}

function monthKeys(year, month, count) {
  const keys = [];
  for (let offset = count - 1; offset >= 0; offset -= 1) {
    const date = new Date(Date.UTC(year, month - 1 - offset, 1));
    const y = date.getUTCFullYear();
    const m = String(date.getUTCMonth() + 1).padStart(2, "0");
    keys.push(`${y}-${m}`);
  }
  return keys;
}

function historyHeading(key, todayKey) {
  const [year, month, day] = key.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  const weekday = ["日", "月", "火", "水", "木", "金", "土"][date.getUTCDay()];
  if (key === todayKey) return `今日 ${month}月${day}日（${weekday}）`;
  if (key === shiftDay(todayKey, -1)) return `昨日 ${month}月${day}日（${weekday}）`;
  return `${year}年${month}月${day}日（${weekday}）`;
}

function clearedImport(source) {
  return {
    startDay: null,
    endDay: null,
    startMinutes: null,
    endMinutes: null,
    children: source.children.map((child) => ({
      id: `${child.title}-copy`,
      title: child.title,
      startDay: null,
      endDay: null,
      startMinutes: null,
      endMinutes: null,
    })),
  };
}
