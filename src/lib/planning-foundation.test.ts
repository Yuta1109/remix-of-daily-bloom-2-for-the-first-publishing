import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const planningRoot = "ios/App/App/Native/Features/Planning";
const shell = readFileSync("ios/App/App/Native/App/AppShell.swift", "utf8");
const models = readFileSync(`${planningRoot}/PlanningModels.swift`, "utf8");
const planningShell = readFileSync(`${planningRoot}/PlanningShell.swift`, "utf8");
const plans = readFileSync(`${planningRoot}/PlanPages.swift`, "utf8");
const future = readFileSync(`${planningRoot}/FuturePages.swift`, "utf8");
const help = readFileSync(`${planningRoot}/PlanningHelpPage.swift`, "utf8");
const postpone = readFileSync(`${planningRoot}/PostponeBoxPage.swift`, "utf8");

type Section = "plan" | "future" | "monthly" | "weekly" | "daily" | "plus";

function visibleIndex(weeklyEnabled: boolean): Section[] {
  const items: Section[] = ["plan", "future", "monthly"];
  if (weeklyEnabled) items.push("weekly");
  items.push("daily", "plus");
  return items;
}

function displayedReflectionBadge(
  section: Section,
  obligations: { section: Section; unresolved: boolean; hasMeaningfulActivity: boolean; count: number }[],
): number {
  if (!["future", "monthly", "weekly", "daily"].includes(section)) return 0;
  const total = obligations.reduce((partial, obligation) => {
    if (obligation.section !== section || !obligation.unresolved || !obligation.hasMeaningfulActivity) return partial;
    return partial + Math.max(0, obligation.count);
  }, 0);
  return Math.min(99, total);
}

describe("planning foundation rules", () => {
  it("orders the right-edge index and hides Weekly without duplicating +", () => {
    expect(visibleIndex(true)).toEqual(["plan", "future", "monthly", "weekly", "daily", "plus"]);
    expect(visibleIndex(false)).toEqual(["plan", "future", "monthly", "daily", "plus"]);
    expect(visibleIndex(true).filter((item) => item === "plus")).toHaveLength(1);
  });

  it("caps unresolved active reflection badges at 99 and ignores inactive periods", () => {
    expect(
      displayedReflectionBadge("monthly", [
        { section: "monthly", unresolved: true, hasMeaningfulActivity: true, count: 120 },
      ]),
    ).toBe(99);
    expect(
      displayedReflectionBadge("daily", [
        { section: "daily", unresolved: true, hasMeaningfulActivity: false, count: 4 },
      ]),
    ).toBe(0);
    expect(displayedReflectionBadge("plan", [])).toBe(0);
  });

  it("keeps the Apple system tab bar and does not restore a custom tab bar", () => {
    expect(shell).toContain(".tabItem");
    expect(shell).not.toContain("NativeFloatingTabBar");
    expect(shell).not.toContain(".toolbar(.hidden, for: .tabBar)");
    expect(planningShell).not.toContain("NativeFloatingTabBar");
  });

  it("matches the native planning shell contracts", () => {
    expect(models).toContain("static let maximumDepth = 3");
    expect(models).toContain("static let maximumBadgeCount = 99");
    expect(models).toContain("static let monthCount = 12");
    expect(models).toContain("case monthlyTask");
    expect(models).toContain("case weeklyEvent");
    expect(models).not.toContain("case dailyTask");
    expect(models).not.toContain("case dailyEvent");
    expect(models).toContain("var goal: String");
    expect(planningShell).toContain("Text(\"Planning\")");
    expect(planningShell).toContain("icon: .postpone");
    expect(planningShell).toContain("icon: .help");
    expect(planningShell).toContain("icon: .user");
    expect(planningShell).toContain("Color.black : Color.white");
    expect(planningShell).not.toContain("ultraThinMaterial");
    expect(planningShell).toContain("次回のアップデートをお楽しみに");
    expect(planningShell).toContain("navigationDestination(for: PlanningRoute.self)");
    expect(shell).toContain("NavigationStack(path: $navigation.path)");
    expect(help).toContain("Planningの使い方");
    expect(postpone).toContain("Tasks");
    expect(postpone).toContain("Events");
    expect(plans).toContain("プランを新規作成");
    expect(plans).toContain("PlanningRoute.planEditor");
    expect(plans).not.toContain(".sheet");
    expect(plans).toContain("PlanningRules.transferExplanation");
    expect(models).toContain("プラン全体を移動する必要はありません。");
    expect(future).toContain("count: 3");
    expect(future).toContain("detents: [.large]");
    expect(future).toContain("目標は1つ");
  });
});

const period = readFileSync(`${planningRoot}/PlanningPeriod.swift`, "utf8");
const periodPage = readFileSync(`${planningRoot}/PeriodPlannerPage.swift`, "utf8");

type Bucket = "monthly" | "weekly" | "daily";

function shiftPeriod(key: string, bucket: Bucket, delta: number): string {
  if (bucket === "monthly") {
    const [year, month] = key.split("-").map(Number);
    const date = new Date(Date.UTC(year, month - 1 + delta, 1));
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
  }
  const [year, month, day] = key.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + (bucket === "weekly" ? delta * 7 : delta)));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function addSources(bucket: Bucket): string[] {
  if (bucket === "monthly") return ["Planから追加", "新しく追加", "先送りボックスから追加"];
  if (bucket === "weekly") return ["Planから追加", "新しく追加", "先送りボックスから追加", "Monthlyから追加"];
  return ["Monthly / Weeklyから追加", "新しく追加", "先送りボックスから追加"];
}

function periodBadge(hasMeaningfulActivity: boolean, outstanding: boolean, completed: boolean): number {
  return outstanding && hasMeaningfulActivity && !completed ? 1 : 0;
}

function completionFraction(nodes: { completed: boolean; children: { completed: boolean }[] }[]): number {
  const leaves = nodes.flatMap((node) => (node.children.length === 0 ? [node] : node.children));
  if (leaves.length === 0) return 0;
  return leaves.filter((node) => node.completed).length / leaves.length;
}

describe("planning period pages", () => {
  it("moves month, week, and day keys without resetting a stored period", () => {
    expect(shiftPeriod("2025-09", "monthly", 1)).toBe("2025-10");
    expect(shiftPeriod("2025-09", "monthly", -1)).toBe("2025-08");
    expect(shiftPeriod("2025-09-29", "weekly", 1)).toBe("2025-10-06");
    expect(shiftPeriod("2025-09-30", "daily", 1)).toBe("2025-10-01");
    expect(period).toContain("func assignPeriod");
    expect(planningShell).toContain("monthlyPeriodKey");
    expect(models).toContain("planning.monthlyPeriod");
    expect(periodPage).not.toContain("PeriodCalendar.currentKey");
  });

  it("uses one page for Monthly, Weekly, and Daily and keeps system tabs", () => {
    expect(planningShell).toContain("PeriodPlannerPage(session: session, bucket: .monthly)");
    expect(planningShell).toContain("PeriodPlannerPage(session: session, bucket: .weekly)");
    expect(planningShell).toContain("PeriodPlannerPage(session: session, bucket: .daily)");
    expect(shell).toContain(".tabItem");
    expect(shell).not.toContain("NativeFloatingTabBar");
    expect(periodPage).toContain("chevron.left");
    expect(periodPage).toContain("chevron.right");
    expect(periodPage).toContain("DragGesture");
  });

  it("lists the source choices and blocks a direct Plan transfer to Daily", () => {
    expect(addSources("monthly")).toEqual(["Planから追加", "新しく追加", "先送りボックスから追加"]);
    expect(addSources("weekly")).toContain("Monthlyから追加");
    expect(addSources("daily")).not.toContain("Planから追加");
    expect(period).toContain("case .daily: [.periods, .create, .postpone]");
    expect(models).not.toContain("case dailyTask");
    expect(periodPage).toContain("retrievePostponed");
    expect(periodPage).toContain("copyMonthlyTasks");
  });

  it("allows Monthly and Weekly completion edits and only displays Daily completion", () => {
    expect(period).toContain("bucket != .daily");
    expect(period).toContain("func setCompleted");
    expect(period).toContain("func applyExternalDailyCompletion");
    expect(periodPage).toContain("PeriodTypeGlyph");
    expect(periodPage).toContain("Text(\"完了\")");
    expect(completionFraction([
      { completed: false, children: [{ completed: true }, { completed: false }] },
    ])).toBe(0.5);
    expect(period).toContain("flattenedLeaves");
  });

  it("keeps reflection separate from completion and ignores inactive periods", () => {
    expect(periodBadge(false, true, false)).toBe(0);
    expect(periodBadge(true, true, false)).toBe(1);
    expect(periodBadge(true, true, true)).toBe(0);
    expect(periodPage).toContain("振り返り結果");
    expect(periodPage).toContain("isReflectionComplete");
    expect(periodPage).not.toContain("今月の進捗");
    expect(models).toContain("var reflectionDisposition");
    expect(models).toContain("var goal: String");
    expect(periodPage).toContain("Weeklyをなくす");
    expect(periodPage).toContain("PlanningRoute.weeklySettings");
    expect(models).toContain("static let maximumDepth = 3");
  });
});
