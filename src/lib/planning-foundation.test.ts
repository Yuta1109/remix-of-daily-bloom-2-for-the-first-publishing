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
