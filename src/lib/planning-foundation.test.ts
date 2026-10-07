import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const planningRoot = "ios/App/App/Native/Features/Planning";
const shell = readFileSync("ios/App/App/Native/App/AppShell.swift", "utf8");
const models = readFileSync(`${planningRoot}/PlanningModels.swift`, "utf8");
const planningShell = readFileSync(`${planningRoot}/PlanningShell.swift`, "utf8");
const plans = readFileSync(`${planningRoot}/PlanPages.swift`, "utf8");
const future = readFileSync(`${planningRoot}/FuturePages.swift`, "utf8");
const help = readFileSync(`${planningRoot}/PlanningHelpPage.swift`, "utf8");
const planText = readFileSync(`${planningRoot}/PlanningText.swift`, "utf8");
const tokens = readFileSync(`${planningRoot}/PlanningDesignTokens.swift`, "utf8");
const helpText = planText;
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
    expect(models).toContain("static let maximumDepth = 2");
    expect(models).toContain("static let maximumBadgeCount = 99");
    expect(models).toContain("static let monthCount = 12");
    expect(models).toContain("case monthlyTask");
    expect(models).toContain("case weeklyEvent");
    expect(models).toContain("case dailyTask");
    expect(models).toContain("case dailyEvent");
    expect(models).toContain("var goal: String");
    expect(planningShell).toContain("Text(\"Planning\")");
    expect(planningShell).toContain("icon: .postpone");
    expect(planningShell).toContain("icon: .help");
    expect(planningShell).toContain("icon: .user");
    expect(planningShell).toContain("PlanningPalette.paper");
    expect(planningShell).toContain(".rotationEffect(.degrees(90))");
    expect(planningShell).toContain(".planningFixedHeader");
    expect(chrome).toContain("safeAreaBar(edge: .top");
    expect(planningShell).not.toContain("ultraThinMaterial");
    expect(planningShell).toContain("次回のアップデートをお楽しみに");
    expect(planningShell).toContain("navigationDestination(for: PlanningRoute.self)");
    expect(shell).toContain("NavigationStack(path: $navigation.path)");
    expect(helpText).toContain("Planning の使い方");
    expect(help).toContain("PlanningText.string(.planningHelpTitle)");
    expect(postpone).toContain("Tasks");
    expect(postpone).toContain("Events");
    expect(planText).toContain("プランを新規作成");
    expect(plans).toContain("PlanningRoute.planEditor");
    expect(planText).toContain("タスク・予定に反映");
    expect(models).toContain("プラン全体を移動する必要はありません。");
    expect(future).toContain("count: 3");
    expect(future).toContain("PlanningSystemSheetChrome");
    expect(future).not.toContain("presentationDetents([.large])");
    expect(future).toContain("PlanningSwipePageHost");
    expect(future).not.toContain(".tabViewStyle(.page");
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
    expect(period).toContain("func assignPeriod");
    expect(periodPage).toContain("periodSelection");
  });

  it("uses one page for Monthly, Weekly, and Daily and keeps system tabs", () => {
    expect(planningShell).toContain("PeriodPlannerPage(session: session, bucket: .monthly)");
    expect(planningShell).toContain("PeriodPlannerPage(session: session, bucket: .weekly)");
    expect(planningShell).toContain("PeriodPlannerPage(session: session, bucket: .daily)");
    expect(shell).toContain(".tabItem");
    expect(shell).not.toContain("NativeFloatingTabBar");
    expect(periodPage).toContain("chevron.left");
    expect(periodPage).toContain("chevron.right");
    expect(periodPage).toContain("PlanningSwipePageHost");
    expect(periodPage).not.toContain(".tabViewStyle(.page");
    expect(periodPage).not.toContain("DragGesture");
  });

  it("lists the source choices and copies a Plan into Daily", () => {
    expect(addSources("monthly")).toEqual(["Planから追加", "新しく追加", "先送りボックスから追加"]);
    expect(addSources("weekly")).toContain("Monthlyから追加");
    expect(addSources("daily")).not.toContain("Planから追加");
    expect(period).toContain("case .daily: [.periods, .create, .postpone]");
    expect(models).toContain("case dailyTask");
    expect(periodPage).toContain("retrievePostponed");
    expect(periodPage).toContain("copyMonthlyTasks");
  });

  it("allows Monthly, Weekly, and Daily completion edits from one source", () => {
    expect(period).toContain("Daily Planning and Today share");
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
    expect(periodPage).toContain("ReflectionPeriodSummary");
    expect(periodPage).toContain("isReflectionComplete");
    expect(periodPage).not.toContain("今月の進捗");
    expect(models).toContain("var reflectionDisposition");
    expect(models).toContain("var goal: String");
    expect(periodPage).not.toContain("Weeklyをなくす");
    expect(models).toContain("static let maximumDepth = 2");
  });
});

const reflection = readFileSync(`${planningRoot}/ReflectionFlow.swift`, "utf8");
const reflectionPage = readFileSync(`${planningRoot}/ReflectionPages.swift`, "utf8");

function activePrompt(activity: boolean, due: boolean, completed: boolean, skipped: boolean): boolean {
  return activity && due && !completed && !skipped;
}

function badge(activity: boolean, outstanding: boolean, completed: boolean, skipped: boolean): number {
  return outstanding && activity && !completed && !skipped ? 1 : 0;
}

describe("planning reflection", () => {
  it("requires activity, ignores skips, and caps the badge", () => {
    expect(activePrompt(false, true, false, false)).toBe(false);
    expect(badge(false, true, false, false)).toBe(0);
    expect(badge(true, true, false, true)).toBe(0);
    expect(badge(true, true, true, false)).toBe(0);
    expect(Math.min(99, 120)).toBe(99);
    expect(reflection).toContain("hasMeaningfulActivity && due && !completed && !skipped");
    expect(reflection).toContain("historyLimit = 5");
  });

  it("keeps completion separate and reconciles keep, postpone, and stop", () => {
    expect(reflection).toContain("var completed: Bool");
    expect(reflection).toContain("disposition: ReflectionDisposition");
    expect(reflection).toContain("ensureContinuation");
    expect(reflection).toContain("ensurePostpone");
    expect(reflection).toContain("case .stop");
    expect(reflection).toContain("sourceEventID");
    expect(reflection).toContain("matchesPostpone");
    expect(reflectionPage).not.toContain("今月の進捗");
    expect(reflectionPage).not.toContain("主な項目");
    expect(reflectionPage).not.toContain("この期間の記録");
    expect(reflectionPage).toContain(".reflectionResult");
    expect(planText).toContain("振り返り結果");
    expect(reflectionPage).not.toContain("Button(\"Replan\")");
    expect(reflectionPage).toContain("addMemory");
    expect(reflectionPage).toContain("updateHistoricalDecision");
    expect(reflectionPage).toContain("PlanningReflectionDueCard");
    expect(reflectionPage).toContain("PlanningTokens.ReflectionDue.height");
    expect(reflectionPage).not.toContain("Index.length");
    expect(reflection).toContain("canCompleteReflection");
    expect(reflection).toContain("classificationCounts");
    expect(reflection).toContain("skipReflection");
    expect(planText).toContain("写真 & 一言");
    expect(planText).toContain("なんでも日記");
    expect(planText).toContain("今月は記録がありませんでした");
    expect(planText).toContain("今週は記録がありませんでした");
    expect(planText).toContain("今日は記録がありませんでした");
    expect(planText).not.toContain("今月はまだ記録がありません");
  });
});

const appState = readFileSync("ios/App/App/Native/App/AppState.swift", "utf8");
const chrome = readFileSync(`${planningRoot}/PlanningChrome.swift`, "utf8");
const samples = readFileSync(`${planningRoot}/TemporaryPlanningSamples.swift`, "utf8");

function periodHasEnded(bucket: Bucket, key: string, today: string): boolean {
  if (bucket === "daily") return key < today;
  if (bucket === "weekly") {
    const [year, month, day] = key.split("-").map(Number);
    const end = new Date(Date.UTC(year, month - 1, day + 7));
    const endKey = `${end.getUTCFullYear()}-${String(end.getUTCMonth() + 1).padStart(2, "0")}-${String(end.getUTCDate()).padStart(2, "0")}`;
    return endKey <= today;
  }
  const [year, month] = key.split("-").map(Number);
  const next = new Date(Date.UTC(year, month, 1));
  const nextKey = `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}`;
  return `${nextKey}-01` <= today;
}

describe("planning blueprint fidelity", () => {
  it("pops only when a route exists", () => {
    expect(appState).toContain("guard !isPopping, path.count > 0 else { return }");
    expect(plans).toContain("navigation.pop()");
    expect(help).toContain("navigation.pop()");
    expect(postpone).toContain("navigation.pop()");
    expect(planningShell).toContain("navigation.pop()");
    expect(reflectionPage).toContain("navigation.pop()");
    expect(plans).not.toContain("removeLast");
    expect(future).not.toContain("removeLast");
  });

  it("places the header above a rotated index and uses the fixed paper palette", () => {
    expect(planningShell).toContain(".planningFixedHeader");
    expect(chrome).toContain("safeAreaBar(edge: .top");
    expect(planningShell).toContain(".rotationEffect(.degrees(90))");
    expect(chrome).toContain("enum PlanningPalette");
    expect(planningShell).not.toContain("PlanningGlyph");
    expect(periodPage).not.toContain("PlanningGlyph");
    expect(plans).not.toContain("PlanningGlyph");
  });

  it("shows memory UI only after a period has ended", () => {
    expect(periodHasEnded("daily", "2026-09-30", "2026-10-01")).toBe(true);
    expect(periodHasEnded("daily", "2026-10-02", "2026-10-01")).toBe(false);
    expect(periodHasEnded("monthly", "2026-09", "2026-10-01")).toBe(true);
    expect(periodHasEnded("monthly", "2026-11", "2026-10-01")).toBe(false);
    expect(chrome).toContain("func periodHasEnded");
    expect(periodPage).toContain("periodHasEnded");
    expect(periodPage).toContain("NoActivityMemorySection");
    expect(planText).toContain("忙しい日はだれにでもあります。");
    expect(planText).toContain("忙しい週はだれにでもあります。");
  });

  it("keeps month cards on a stable grid and pages years and periods", () => {
    expect(chrome).toContain("static let rowCount = 6");
    expect(chrome).toContain("static let columnCount = 7");
    expect(future).toContain("PlanningCalendarGrid.matrix");
    expect(future).toContain("PlanningSwipePageHost");
    expect(periodPage).toContain("PlanningSwipePageHost");
    expect(chrome).toContain("struct PlanningSwipePageHost");
    expect(future).toContain("fixedHeight: 260");
    expect(periodPage).toContain("fixedHeight: bucket == .daily ? 460 : 280");
  });

  it("seeds previous reflected periods without writing Firebase", () => {
    expect(samples).toContain("TEMPORARY");
    expect(samples).toContain("reflectionCompleted: true");
    expect(samples).toContain(".keep");
    expect(samples).toContain(".postpone");
    expect(samples).toContain(".stop");
    expect(samples).not.toContain("Firebase");
    expect(samples).toContain("isSample: true");
    expect(samples).toContain("その日の写真を1枚選び、一言だけ残せる記録です。");
    expect(samples).toContain("なんでも日記（例）");
    expect(samples).toContain("static func install");
    expect(samples).toContain("func seedSamplePeriod");
    expect(samples).toContain("if session.periodRecords.contains");
    expect(samples).not.toContain("record.hasMeaningfulActivity = true");
    expect(samples).toContain("isSample: true");
    expect(samples).not.toContain("session.postponed =");
    expect(samples).not.toContain("session.periodItems =");
    expect(models).toContain("TemporaryPlanningSamples.install");
    expect(periodPage).toContain("PlanningReflectionDueCard");
    expect(periodPage).toContain("PlanningTokens.contentInset");
    expect(periodPage).toContain("isActivePrompt");
    expect(tokens).toContain("minimumMultiple: CGFloat = 1.5");
    expect(tokens).toContain("maximumMultiple: CGFloat = 2.0");
    expect(tokens).toContain("tabBarFallback: CGFloat = 49");
    expect(appState).toContain("guard !isPopping, path.count > 0 else { return }");
    expect(appState).toContain("DispatchQueue.main.async {");
  });
});

const itemSheets = readFileSync(`${planningRoot}/PlanningItemSheets.swift`, "utf8");

function toggleSelection(id: string, bullets: { id: string; children: string[] }[], selected: string[]): string[] {
  const next = new Set(selected);
  const parent = bullets.find((bullet) => bullet.id === id);
  if (parent) {
    if (next.has(id)) {
      next.delete(id);
      parent.children.forEach((child) => next.delete(child));
    } else {
      next.add(id);
      parent.children.forEach((child) => next.add(child));
    }
    return [...next];
  }
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return [...next];
}

describe("planning item editor", () => {
  it("keeps two levels and copies a plan instead of moving it", () => {
    expect(models).toContain("static let maximumDepth = 2");
    expect(plans).toContain("clamped");
    expect(plans).toContain("PlanningSavePill(action: save)");
    expect(plans).not.toContain("session.plans[index].bullets = before");
    expect(plans).toContain("includeChildren: false");
    expect(plans).toContain("Text(\"Daily\")");
    expect(models).toContain("copiedAlready");
    expect(plans).not.toContain("字下げ");
  });

  it("selects a parent with its subtasks and allows a subtask to be cleared", () => {
    const bullets = [{ id: "parent", children: ["child"] }];
    const withParent = toggleSelection("parent", bullets, []);
    expect(withParent).toEqual(expect.arrayContaining(["parent", "child"]));
    const withoutChild = toggleSelection("child", bullets, withParent);
    expect(withoutChild).toContain("parent");
    expect(withoutChild).not.toContain("child");
    expect(itemSheets).toContain("func afterToggle");
  });

  it("opens sheets from the section and keeps the source lists", () => {
    const section = periodPage.slice(periodPage.indexOf("func periodListSection"), periodPage.indexOf("private struct PeriodParentTimeline"));
    expect(section).not.toContain("追加");
    expect(section).toContain("chevron.down");
    expect(section).not.toContain("件");
    expect(periodPage).toContain("PeriodItemListSheet");
    expect(itemSheets).toContain("PlanningSystemSheetChrome(");
    expect(itemSheets).toContain("ForEach(PlanIconColor.allCases)");
    expect(itemSheets).toContain("if kind == .task");
    expect(periodPage).toContain("PeriodItemListSheet");
    expect(period).toContain("case .monthly: [.plan, .create, .postpone]");
    expect(period).toContain("case .weekly: [.plan, .create, .postpone, .monthly]");
    expect(period).toContain("case .daily: [.periods, .create, .postpone]");
    expect(period).toContain("func importSources");
    expect(models).toContain("copiedAlready");
  });

  it("protects daily completion and shares the editor model", () => {
    expect(period).toContain("Daily Planning and Today share");
    expect(itemSheets).toContain("allowsCompletionToggle");
    expect(itemSheets).toContain("Today completion");
    expect(itemSheets).not.toContain("Event status");
    expect(itemSheets).toContain("checkmark.square.fill");
    expect(help).toContain("親項目と、その下のサブタスク");
    expect(help).toContain("Monthly / Weekly / Dailyへコピー");
    expect(help).not.toContain("最大3段階");
    expect(help).not.toContain("見通し");
    expect(itemSheets).toContain("struct PlanningItemEditorSheet");
    expect(itemSheets).toContain("existingID");
    expect(itemSheets).toContain("開始時刻");
    expect(itemSheets).toContain("終了時刻");
    expect(itemSheets).toContain("～");
    const symbols = itemSheets.slice(itemSheets.indexOf("static let symbols"), itemSheets.indexOf("enum PlanningRangeText"));
    expect(symbols.split(",").length).toBeGreaterThanOrEqual(20);
    expect(itemSheets).toContain("shouldAppendNextRow");
    expect(plans).toContain("shouldAppendNextRow");
  });
});

// ---------------------------------------------------------------------------
// Planning Blueprint 1
// ---------------------------------------------------------------------------

interface MirrorPlan {
  id: string;
  title: string;
  memo: string;
  bullets: string[];
  updatedAt: number;
  hasBeenSaved: boolean;
  iconID?: string;
}

const ICONS = ["leaf", "book", "house", "heart", "airplane", "briefcase"];

const savedNewestFirst = (plans: MirrorPlan[]) =>
  plans.filter((plan) => plan.hasBeenSaved).sort((a, b) => b.updatedAt - a.updatedAt);
const previewPlans = (plans: MirrorPlan[]) => savedNewestFirst(plans).slice(0, 5);
const resolvedIcon = (plan: MirrorPlan) => (plan.iconID && ICONS.includes(plan.iconID) ? plan.iconID : "leaf");
const searchPlans = (plans: MirrorPlan[], query: string) => {
  const needle = query.trim().toLowerCase();
  if (!needle) return plans;
  return plans.filter((plan) => [plan.title, plan.memo, ...plan.bullets].some((text) => text.toLowerCase().includes(needle)));
};

const makePlans = (count: number): MirrorPlan[] =>
  Array.from({ length: count }, (_, index) => ({
    id: `p${index}`,
    title: `Plan ${index}`,
    memo: "",
    bullets: [],
    updatedAt: index,
    hasBeenSaved: true,
  }));

describe("planning blueprint 1", () => {
  it("fixes the real Back crash: environment object wraps the NavigationStack", () => {
    const tabRoot = shell.slice(shell.indexOf("private struct NativeTabRoot"));
    const stackEnd = tabRoot.indexOf("NavigationStack(path: $navigation.path)");
    expect(stackEnd).toBeGreaterThan(-1);
    // `.environmentObject(navigation)` must come after the stack's closing brace, not inside its content.
    const afterStack = tabRoot.slice(stackEnd);
    expect(afterStack.indexOf("nativeFeatureRoot(for: tab)")).toBeLessThan(afterStack.indexOf(".environmentObject(navigation)"));
    expect(afterStack).toMatch(/\}\s*\.environmentObject\(navigation\)/);
    expect(planningShell).toContain(".environmentObject(navigation)");
    expect(planningShell).toContain("case .planList:");
    expect(planningShell).toContain("case .planTransfer");
  });

  it("uses one pop contract for every Blueprint Back button", () => {
    expect(postpone).not.toContain("path.isEmpty");
    expect(postpone).toContain("navigation.pop()");
    expect(plans).toContain("navigation.pop()");
    expect(plans).not.toContain("removeLast");
    expect(plans).not.toContain("dismiss()\n        navigation.pop()");
  });

  it("asks before discarding with a standard alert and no navigation change first", () => {
    expect(plans).toContain("PlanningDiscardConfirmation.present");
    expect(plans).not.toContain("confirmationDialog");
    expect(planText).toContain("この変更を破棄しますか？");
    expect(planText).toContain("キャンセル");
    const request = plans.slice(plans.indexOf("private func requestClose"), plans.indexOf("private func leave"));
    expect(request).toContain("PlanningDiscardConfirmation.present { leave() }");
    expect(request.indexOf("PlanningDiscardConfirmation.present")).toBeLessThan(request.indexOf("leave()"));
  });

  it("shows at most five newest plans and keeps the list visible when empty", () => {
    const plans12 = makePlans(12);
    const preview = previewPlans(plans12);
    expect(preview).toHaveLength(5);
    expect(preview.map((plan) => plan.id)).toEqual(["p11", "p10", "p9", "p8", "p7"]);
    expect(previewPlans([])).toEqual([]);
    expect(previewPlans([{ ...makePlans(1)[0], hasBeenSaved: false }])).toEqual([]);
    expect(plans).toContain("planListContainer");
    expect(plans).toContain("PlanningText.string(.noPlans)");
    expect(plans).toContain("PlanningText.string(.planListTitle)");
    expect(models).toContain("prefix(PlanningTokens.PlanMain.previewLimit)");
    expect(tokens).toContain("previewLimit = 5");
  });

  it("opens the list from the header chevron and the editor from the whole card", () => {
    expect(plans).toContain("PlanningRoute.planList");
    expect(plans).toContain("PlanCardRow");
    expect(plans).not.toContain("ellipsis");
    expect(plans).not.toContain("Menu {");
    const card = plans.slice(plans.indexOf("private struct PlanCardRow"), plans.indexOf("// MARK: - Plan main page"));
    expect(card).toContain("Button(action: onOpen)");
    expect(card).not.toContain("chevron");
  });

  it("persists the icon with a safe default for old plans", () => {
    expect(resolvedIcon({ ...makePlans(1)[0] })).toBe("leaf");
    expect(resolvedIcon({ ...makePlans(1)[0], iconID: "unknown" })).toBe("leaf");
    expect(resolvedIcon({ ...makePlans(1)[0], iconID: "book" })).toBe("book");
    expect(models).toContain("var iconID: String");
    expect(models).toContain("iconID: String = PlanIconCatalog.defaultID");
    expect(plans).toContain("iconID: iconID");
  });

  it("searches title, memo, and bullets on the list page", () => {
    const list: MirrorPlan[] = [
      { ...makePlans(1)[0], title: "旅行", bullets: ["ホテル"] },
      { ...makePlans(2)[1], title: "仕事", memo: "資料" },
    ];
    expect(searchPlans(list, "旅")).toHaveLength(1);
    expect(searchPlans(list, "ホテル")).toHaveLength(1);
    expect(searchPlans(list, "資料")).toHaveLength(1);
    expect(searchPlans(list, "")).toHaveLength(2);
    expect(planText).toContain("プランを検索…");
  });

  it("renders the index as rectangles with real z-order and English labels", () => {
    expect(chrome).not.toContain("inset: CGFloat = 9");
    expect(chrome).toContain("struct PlanningIndexTabOutline");
    expect(planningShell).toContain(".zIndex(1)");
    expect(planningShell).toContain(".zIndex(session.section == section ? 2 : 0)");
    expect(planningShell).toContain("PlanningTokens.Index");
    for (const label of ["Plan", "Future", "Monthly", "Weekly", "Daily"]) {
      expect(models).toContain(`"${label}"`);
    }
    expect(planText).not.toContain("indexTitle");
  });

  it("saves from transfer without popping, and the check still pops once", () => {
    const editor = plans.slice(plans.indexOf("struct PlanEditorPage"), plans.indexOf("enum PlanBulletReturn"));
    const save = editor.slice(editor.indexOf("private func save"), editor.indexOf("private func reflect"));
    const reflect = editor.slice(editor.indexOf("private func reflect"), editor.indexOf("private func requestClose"));
    expect(save.match(/session\.save\(/g)).toHaveLength(1);
    expect(save.match(/navigation\.pop\(\)/g)).toHaveLength(1);
    expect(reflect).toContain("session.save(");
    expect(reflect).toContain("needsSave");
    expect(reflect).not.toContain("navigation.pop()");
    expect(reflect).toContain("PlanningRoute.planTransfer");
    expect(editor).not.toContain("saveBeforeReflect");
  });

  it("keeps editor and selection pages full screen without the tab bar", () => {
    const editor = plans.slice(plans.indexOf("struct PlanEditorPage"), plans.indexOf("enum PlanBulletFilter"));
    const selection = plans.slice(plans.indexOf("struct PlanTransferSelectionPage"), plans.indexOf("// MARK: - Destination sheet"));
    expect(editor).toContain(".toolbar(.hidden, for: .tabBar)");
    expect(selection).toContain(".toolbar(.hidden, for: .tabBar)");
    const list = plans.slice(plans.indexOf("struct PlanFullListPage"), plans.indexOf("// MARK: - Plan new / edit page"));
    expect(list).not.toContain(".toolbar(.hidden, for: .tabBar)");
    expect(editor).toContain("session.save(");
    expect(selection).not.toContain("session.save(");
  });

  it("selects parents with subtasks and requires the persistent destination button", () => {
    expect(toggleSelection("p", [{ id: "p", children: ["c"] }], [])).toEqual(expect.arrayContaining(["p", "c"]));
    expect(plans).toContain("PlanningText.string(.chooseDestination)");
    expect(planText).toContain("反映先を選ぶ");
    expect(planText).toContain("反映する項目を選択");
    expect(plans).toContain(".disabled(selected.isEmpty)");
    expect(plans).toContain("showingDestination = true");
    expect(plans).toContain("PlanningSelection.afterToggle");
  });

  it("builds the destination sheet with a native sheet, three sections, and no chevrons", () => {
    const sheet = plans.slice(plans.indexOf("private struct PlanDestinationSheet"));
    expect(sheet).toContain("PlanningSystemSheetChrome");
    expect(sheet).not.toContain("PlanningSheetChrome(");
    expect(sheet).not.toContain("chevron");
    expect(sheet).not.toContain("presentationBackground");
    expect(planText).toContain("1. 反映先の種類");
    expect(planText).toContain("2. 反映先のスコープ");
    expect(planText).toContain("3. 期間を選択");
    expect(sheet).toContain(".pickerStyle(.wheel)");
    expect(chrome).toContain("struct PlanningSystemSheetChrome");
    expect(chrome).not.toContain("presentationSizing(.fitted)");
    expect(chrome).toContain("presentationDetents([.height(max(presentedHeight, 1))])");
    expect(plans).toContain("onDismiss");
    expect(plans).toContain("popAfterDismiss");
  });

  it("copies with stable identity and explicit period keys", () => {
    expect(models).toContain("periodKey explicitKey: String? = nil");
    expect(models).toContain("copiedAlready");
    expect(models).toContain("logicalID");
    expect(models).not.toMatch(/plans\.removeAll \{[^}]*bullet/);
  });

  it("never adds a transparent full-screen overlay for the keyboard", () => {
    expect(chrome).toContain("background(PlanningKeyboardDismissInstaller().allowsHitTesting(false))");
    expect(chrome).toContain("cancelsTouchesInView = false");
    for (const source of [planningShell, plans, help, periodPage, future]) {
      expect(source).not.toContain("PlanningDismissKeyboard");
      expect(source).not.toMatch(/Color\.clear\s*\.ignoresSafeArea/);
      expect(source).not.toMatch(/\.overlay\s*\{\s*Color\.clear/);
    }
  });

  it("hides scroll indicators on the Plan pages", () => {
    expect(chrome).toContain("scrollIndicators(.hidden)");
    expect((plans.match(/\.planningScroll\(\)/g) ?? []).length).toBeGreaterThanOrEqual(4);
  });

  it("makes Help use the shared Planning toolbar chrome", () => {
    expect(help).toContain("planningPageChrome");
    expect(help).toContain("navigation.pop()");
    expect(help).not.toContain("ultraThinMaterial");
    expect(help).not.toContain("PlanningTranslucentHeader");
  });

  it("keeps the app portrait-only on iPhone and localizes ja/en", () => {
    const plist = readFileSync("ios/App/App/Info.plist", "utf8");
    const phone = plist.slice(plist.indexOf("<key>UISupportedInterfaceOrientations</key>"), plist.indexOf("<key>UISupportedInterfaceOrientations~ipad</key>"));
    expect(phone).toContain("UIInterfaceOrientationPortrait");
    expect(phone).not.toContain("Landscape");
    expect(plist).toContain("<string>en</string>");
    expect(planText).toContain("isEnglish");
  });

  it("keeps six pastel icon colours and a rose default", () => {
    expect(models).toContain("var iconColorID: String");
    expect(models).toContain("iconColorID: String = PlanIconColor.defaultID");
    expect(chrome).toContain("static let defaultID = PlanIconColor.rose.rawValue");
    expect(chrome).toContain("case rose, peach, yellow, mint, sky, lavender");
    expect(plans).toContain("PlanIconColor.resolved(plan.resolvedIconColorID).color");
    expect(plans).toContain("iconColorID: iconColorID");
    expect(planText).toContain("カラー");
  });

  it("shows a remaining-plan count only above five", () => {
    const remaining = (total: number) => Math.max(0, total - 5);
    expect(remaining(5)).toBe(0);
    expect(remaining(6)).toBe(1);
    expect(remaining(8)).toBe(3);
    expect(remaining(15)).toBe(10);
    expect(planText).toContain("他\\(count)プラン");
    expect(plans).toContain("PlanningText.morePlans(remaining)");
    expect(tokens).toContain("previewLimit = 5");
  });

  it("uses return to add a child and a second return to start the next parent", () => {
    expect(plans).toContain("enum PlanBulletReturn");
    expect(plans).toContain("children.insert(created, at: childIndex + 1)");
    expect(plans).toContain("children.remove(at: childIndex)");
    expect(plans).toContain("next.insert(parent, at: parentIndex + 1)");
    expect(models).toContain("static let maximumDepth = 2");
    expect(plans).not.toContain("grandchildren");
  });

  it("offers only the current and future transfer periods", () => {
    expect(plans).toContain("enum PlanTransferCalendar");
    expect(plans).toContain("return key < current ? current : key");
    expect(plans).toContain("in: PlanTransferCalendar.earliestDay()...");
    expect(plans).toContain("PlanTransferCalendar.weeks()");
    expect(plans).toContain("PlanTransferCalendar.months(in: year)");
    expect(plans).not.toContain("(-26...52)");
  });

  it("keeps the frozen index geometry and the navigation crash fix", () => {
    for (const token of ["depth: CGFloat = 30.8", "length: CGFloat = 90", "trailingMargin: CGFloat = 4", "cornerRadius: CGFloat = 7.5", "seamWidth: CGFloat = 2"]) {
      expect(tokens).toContain(token);
    }
    expect(planningShell).toContain(".zIndex(session.section == section ? 2 : 0)");
    expect(shell).toMatch(/\}\s*\.environmentObject\(navigation\)/);
    expect(planningShell).toContain(".environmentObject(navigation)");
    expect(shell).not.toContain("PlanningNavigationAppearance");
    expect(chrome).not.toContain("planningFixedLight()");
    expect(planningShell).not.toContain("preferredColorScheme");
    expect(postpone).toContain("navigation.pop()");
    expect(postpone).not.toContain("removeLast");
  });

  it("keeps a fixed 3 by 4 Future year of 6 by 7 calendars", () => {
    expect(future).toContain("count: 3");
    expect(chrome).toContain("static let rowCount = 6");
    expect(chrome).toContain("static let columnCount = 7");
    expect(future).toContain("PlanningCalendarGrid.matrix");
    expect(future).toContain("PlanningCalendarGrid.rowCount");
    expect(tokens).toContain("cardHeight: CGFloat = 120");
    expect(future).toContain("PlanningSectionIntro(title: \"Future\"");
    expect(planText).toContain("これからの1年を見通して");
    expect(future).toContain("fixedHeight: 260");
    expect(future).toContain("PlanningSwipePageHost");
    expect(future).not.toContain(".tabViewStyle(.page");
  });

  it("shares the monthly goal and updates an event in place", () => {
    expect(models).toContain("Exactly one goal. This is the Monthly page goal");
    expect(future).toContain("session.setGoal(goal, year: year, month: month)");
    expect(future).toContain("session.addEvent(record)");
    expect(future).toContain("id: existing?.id ?? UUID()");
    expect(future).not.toContain("events.removeAll");
    expect(future).toContain("enum FutureEventOrder");
    expect(future).toContain("case (nil, _)");
  });

  it("rejects an empty event and an end before its start", () => {
    expect(future).toContain("enum FutureEventValidation");
    expect(future).toContain("endMinutes >= startMinutes");
    expect(future).toContain("static func isOrdered(");
    expect(models).toContain("var endYear: Int?");
    expect(future).toContain("PlanningText.string(.unset)");
    expect(future).toContain("interactiveDismissDisabled(isDirty)");
    expect(future).toContain("PlanningDiscardConfirmation.present");
    expect(future).toContain("PlanIconColor.allCases");
    expect(future).not.toContain("preferredColorScheme");
  });

  it("accepts ranges that cross a month or a year and keeps one id", () => {
    const stamp = (year: number, month: number, day: number) => year * 1_000_000 + month * 10_000 + day * 100;
    const ordered = (
      start: [number, number, number, number?],
      end: [number, number, number, number?],
    ) => {
      const startDate = stamp(start[0], start[1], start[2]);
      const endDate = stamp(end[0], end[1], end[2]);
      if (endDate !== startDate) return endDate > startDate;
      if (start[3] == null || end[3] == null) return true;
      return end[3] >= start[3];
    };
    expect(ordered([2026, 10, 7, 600], [2026, 10, 7, 660])).toBe(true);
    expect(ordered([2026, 10, 7], [2026, 10, 9])).toBe(true);
    expect(ordered([2026, 10, 30], [2026, 11, 2])).toBe(true);
    expect(ordered([2026, 12, 30], [2027, 1, 2])).toBe(true);
    expect(ordered([2026, 12, 31, 23 * 60], [2027, 1, 1, 60])).toBe(true);
    expect(ordered([2026, 10, 9], [2026, 10, 7])).toBe(false);
    expect(ordered([2026, 12, 31, 60], [2026, 12, 31, 30])).toBe(false);
    const event = { id: "same", year: 2026, month: 12, startDay: 30, endYear: 2027, endMonth: 1, endDay: 2 };
    const intersects = (year: number, month: number) => {
      const start = stamp(event.year, event.month, event.startDay);
      const end = stamp(event.endYear, event.endMonth, event.endDay);
      return start <= stamp(year, month, 31) && end >= stamp(year, month, 1);
    };
    expect(intersects(2026, 12)).toBe(true);
    expect(intersects(2027, 1)).toBe(true);
    expect(intersects(2026, 11)).toBe(false);
    expect(event.id).toBe("same");
    expect(future).toContain("event.endYear ?? event.year");
    expect(future).toContain("id: existing?.id ?? UUID()");
    expect(future).not.toContain("events.removeAll");
  });

  it("centralizes geometry in tokens", () => {
    for (const token of ["height: CGFloat = 72", "titleSize: CGFloat = 34", "depth: CGFloat = 30.8", "trailingMargin: CGFloat = 4", "seamWidth: CGFloat = 2", "buttonHeight: CGFloat = 52"]) {
      expect(tokens).toContain(token);
    }
  });
});

describe("planning TestFlight header, sheets, and index", () => {
  it("removes the transfer selection top check", () => {
    const selection = plans.slice(
      plans.indexOf("struct PlanTransferSelectionPage"),
      plans.indexOf("// MARK: - Destination sheet"),
    );
    expect(selection).not.toContain("NativeGlassIconButton");
    expect(selection).not.toContain("icon: .check");
    expect(selection).toContain("planningPageChrome(title: PlanningText.string(.selectItemsTitle)");
    expect(selection).toContain("PlanningText.string(.chooseDestination)");
    expect(planText).toContain("反映する項目を選択");
  });

  it("labels Plan save as 保存 and still saves once then pops once", () => {
    expect(planText).toContain('.save: ("保存", "Save")');
    expect(plans).toContain("PlanningSavePill(action: save)");
    const editor = plans.slice(plans.indexOf("struct PlanEditorPage"), plans.indexOf("enum PlanBulletReturn"));
    const save = editor.slice(editor.indexOf("private func save"), editor.indexOf("private func reflect"));
    expect(save.match(/session\.save\(/g)).toHaveLength(1);
    expect(save.match(/navigation\.pop\(\)/g)).toHaveLength(1);
    expect(editor).not.toContain("icon: .check");
  });

  it("enlarges every index tab inward and keeps the screen-edge gap", () => {
    expect(tokens).toContain("static let depth: CGFloat = 30.8");
    expect(tokens).toContain("static let length: CGFloat = 90");
    expect(tokens).toContain("static let trailingMargin: CGFloat = 4");
    expect(tokens).toContain("static var columnWidth: CGFloat { depth + trailingMargin }");
    expect(planningShell).toContain("frame(width: PlanningTokens.Index.depth, height: PlanningTokens.Index.length)");
    expect(planningShell).toContain(".zIndex(1)");
    expect(planningShell).toContain(".zIndex(session.section == section ? 2 : 0)");
    expect(chrome).toContain("struct PlanningIndexTabShape");
  });

  it("shares one clear index host and does not paint a period column", () => {
    expect(chrome).toContain("struct PlanningIndexHost");
    expect(planningShell).toContain("PlanningIndexHost");
    expect(planningShell).toContain(".background(Color.clear)");
    for (const page of ["PlanListPage", "FutureYearPage"]) {
      expect(planningShell).toContain(page);
    }
    expect(planningShell).toContain("bucket: .monthly");
    expect(planningShell).toContain("bucket: .weekly");
    expect(planningShell).toContain("bucket: .daily");
    expect(future).not.toContain("PlanningIndexSurface");
    expect(periodPage).not.toContain("PlanningIndexSurface");
    expect(future).not.toContain(".background(PlanningPalette.future)");
    expect(periodPage).not.toContain(".background(PlanningPalette.monthly)");
    expect(periodPage).not.toContain(".background(PlanningPalette.weekly)");
    expect(periodPage).not.toContain(".background(PlanningPalette.daily)");
  });

  it("fits destination and period-picker sheets to their content", () => {
    const system = chrome.slice(
      chrome.indexOf("struct PlanningSystemSheetChrome"),
      chrome.indexOf("struct PlanningHeadingIconSlot"),
    );
    expect(chrome).not.toContain("presentationSizing(.fitted)");
    expect(system).toContain("guard !keyboardObstructing");
    expect(system).not.toContain("bottomSafeArea");
    expect(system).not.toContain("Color.clear.frame(height: PlanningTokens.Sheet.bottomInset)");
    expect(system).not.toContain(".medium");
    expect(system).not.toContain(".large");
    expect(system).not.toContain("maxHeight: .infinity");
    expect(system).not.toContain("430");
    const destination = plans.slice(
      plans.indexOf("private struct PlanDestinationSheet"),
      plans.indexOf("enum PlanTransferCalendar"),
    );
    expect(destination).not.toContain("Spacer(");
    expect(destination).toContain("PlanningSystemSheetChrome(");
    const picker = plans.slice(plans.indexOf("private struct PlanPeriodPickerSheet"));
    expect(picker).toContain("case .monthly:");
    expect(picker).toContain("case .weekly:");
    expect(picker).toContain("case .daily:");
    expect(picker).toContain("PlanningSystemSheetChrome(");
    expect(picker).not.toContain("periodPickerHeight");
    expect(picker).not.toContain(".medium");
    expect(future).toContain("fixedHeight: 260");
  });

  it("keeps Back on navigation.pop and the shared header chrome", () => {
    expect(shell).toMatch(/\}\s*\.environmentObject\(navigation\)/);
    expect(planningShell).toContain(".environmentObject(navigation)");
    for (const source of [plans, help, postpone]) {
      expect(source).toContain("navigation.pop()");
      expect(source).not.toContain("removeLast");
    }
    expect(future).not.toContain("removeLast");
    expect(chrome).toContain("safeAreaBar(edge: .top");
    expect(chrome).toContain("toolbarBackground(.ultraThinMaterial, for: .navigationBar)");
    expect(shell).not.toContain("preferredColorScheme");
    expect(planningShell).not.toContain("preferredColorScheme");
    expect(chrome).toContain("struct PlanningPageChrome");
    expect(plans).toContain("planningPageChrome");
    expect(help).toContain("planningPageChrome");
    expect(postpone).toContain("planningPageChrome");
    expect(periodPage).toContain("PlanningSectionIntro(");
    expect(periodPage).not.toContain("planningFixedHeader");
    expect(tokens).toContain("static let topGap: CGFloat = 10");
    expect(plans).toContain("PlanningTokens.Search.topGap");
    expect(plans).toContain("proxy.scrollTo(id, anchor: .bottom)");
    expect(plans).not.toContain("focusClearance");
    expect(plans).toContain("struct PlanningOutlineTextField");
    expect(plans).toContain("return false");
    expect(plans).toContain("onEmptyDelete");
    expect(plans).toContain("PlanBulletReturn.backspace");
    expect(plans).toContain("outlineFocus.requestFocus");
    expect(plans).toContain("focusThenRemove");
    expect(plans).not.toContain("DispatchQueue.main.async { focusedID = focus }");
    expect(plans).toContain("PlanningGlassAction(title:");
    expect(chrome).toContain("struct PlanningGlassAction");
    expect(chrome).toContain(".buttonStyle(.glassProminent)");
    expect(appState).toContain("DispatchQueue.main.async {");
  });
});

describe("planning TestFlight future, discard, and flicker", () => {
  it("reuses Plan intro spacing for Future and the period title row", () => {
    expect(chrome).toContain("struct PlanningSectionIntro");
    expect(chrome).toContain("PlanningTokens.PlanIntro.topGap");
    expect(chrome).toContain("PlanningTokens.PlanMain.titleToParagraph");
    expect(future).toContain("PlanningSectionIntro(title: \"Future\"");
    expect(plans).toContain("PlanningSectionIntro(");
    expect(periodPage).toContain("PlanningSectionIntro(");
    expect(planText).toContain("今月の予定ややることを整理して、1か月の流れを見通しましょう。");
    expect(planText).toContain("今週の予定ややることを整理して、1週間の流れを見通しましょう。");
    expect(planText).toContain("今日の予定とやることを確認して、1日の流れを整えましょう。");
  });

  it("marks one day as a one-cell band and bands a longer range in event colour", () => {
    expect(tokens).toContain("cardHeight: CGFloat = 120");
    expect(future).toContain("bandRole(column: column, eventID: eventID, rowWinners: winners)");
    expect(future).not.toContain("width: 4, height: 4");
    expect(future).toContain("colors[winner.id] = winner.colorID");
    expect(future).not.toContain("PlanningPalette.future");
    expect(future).toContain("opacity(0.26)");
    expect(future).toContain("enum FutureCalendarMarks");
    expect(future).toContain("events.first { covers($0, year: year, month: month, day: day) }");
    const stamp = (year: number, month: number, day: number) => year * 10_000 + month * 100 + day;
    const covers = (start: [number, number, number], end: [number, number, number], day: [number, number, number]) =>
      stamp(...start) <= stamp(...day) && stamp(...day) <= stamp(...end);
    const october = [7, 8, 9, 10].every((day) => covers([2026, 10, 7], [2026, 10, 10], [2026, 10, day]));
    expect(october).toBe(true);
    expect(covers([2026, 9, 29], [2026, 10, 3], [2026, 10, 1])).toBe(true);
    expect(covers([2026, 9, 29], [2026, 10, 3], [2026, 9, 28])).toBe(false);
    expect(covers([2026, 12, 30], [2027, 1, 2], [2027, 1, 2])).toBe(true);
    const winners = ["later", "earlier"];
    const first = winners.find((event) => event === "earlier" || event === "later");
    expect(first).toBe("later");
    const ordered = [
      { id: "first", covers: true },
      { id: "second", covers: true },
    ];
    expect(ordered.find((event) => event.covers)?.id).toBe("first");
    const row = ["range", "range", "range", null];
    const role = (column: number) => {
      const previous = column > 0 ? row[column - 1] : null;
      const next = column < row.length - 1 ? row[column + 1] : null;
      const starts = previous !== "range";
      const ends = next !== "range";
      if (starts && ends) return "both";
      if (starts) return "leading";
      if (ends) return "trailing";
      return "middle";
    };
    expect(role(0)).toBe("leading");
    expect(role(1)).toBe("middle");
    expect(role(2)).toBe("trailing");
    expect(role(0)).not.toBe(role(2));
  });

  it("uses one sheet chrome, a one-line goal, and a single date-sheet height", () => {
    expect(future).toContain(".lineLimit(1)");
    expect(future).toContain("PlanningTokens.Editor.fieldHeight");
    expect(future).toContain("showsControls: editingEventID == nil");
    expect(future).toContain("showsControls: !pickingStart && !pickingEnd");
    expect(future).toContain("displayedComponents: .date");
    expect(future).toContain("displayedComponents: .hourAndMinute");
    expect(future).toContain("if includesTime");
    expect(future).toContain("PlanningTokens.Sheet.timeWheelHeight");
    expect(future).not.toContain("presentationDetents([.medium, .large])");
    expect(chrome).toContain("presentationDetents([.height(max(presentedHeight, 1))])");
    expect(chrome).toContain("view.tintColor = .label");
    expect(chrome).toContain("style: .cancel");
    expect(chrome).toContain("style: .destructive");
  });

  it("clears editor focus before transfer and keeps the index and Back contract", () => {
    const reflect = plans.slice(plans.indexOf("private func reflect"), plans.indexOf("private func requestClose"));
    expect(reflect.indexOf("focusedID = nil")).toBeLessThan(reflect.indexOf("navigation.path.append"));
    expect(reflect).toContain("DispatchQueue.main.async");
    expect(shell).toContain(".environmentObject(navigation)");
    expect(plans).not.toContain("removeLast");
    expect(tokens).toContain("depth: CGFloat = 30.8");
    expect(tokens).toContain("length: CGFloat = 90");
    expect(tokens).toContain("trailingMargin: CGFloat = 4");
  });
});

describe("planning chrome polish", () => {
  const glass = readFileSync("ios/App/App/Native/Components/Glass/NativeGlassComponents.swift", "utf8");

  it("uses a 44pt circular Back control with a 44pt hit target", () => {
    expect(chrome).toContain("NativeGlassIconButton(icon: .back, accessibilityLabel: \"Back\", action: onBack)");
    expect(glass).toContain(".frame(width: PlanningTokens.Header.buttonVisual, height: PlanningTokens.Header.buttonVisual)");
    expect(tokens).toContain("static let buttonVisual: CGFloat = 44");
    expect(glass).toContain(".frame(minWidth: 44, minHeight: 44)");
  });

  it("keeps the popup header outside the body and whites only the Future editors", () => {
    expect(chrome).toContain("VStack(spacing: 0)");
    expect(chrome).not.toContain(".overlay(alignment: .top)");
    expect(chrome).toContain("PlanningTokens.Sheet.headerHeight");
    expect(chrome).toContain(".background(Color.clear)");
    expect(chrome).toContain("func planningExtendingSurface");
    expect(chrome).toContain(".ignoresSafeArea(.keyboard, edges: .bottom)");
    const surface = chrome.slice(chrome.indexOf("func planningExtendingSurface"), chrome.indexOf("func planningFixedHeader"));
    expect(surface).toContain(".ignoresSafeArea(.keyboard, edges: .bottom)");
    expect(surface).not.toContain("ScrollView");
    expect(future).toContain("bodySurface: Color.white");
    const moment = future.slice(future.indexOf("struct FutureMomentPicker"));
    expect(moment).not.toContain("bodySurface: Color.white");
  });

  it("keeps outline focus and waits once for glass feedback", () => {
    expect(plans).toContain("textFieldShouldReturn");
    expect(plans).toContain("return false");
    expect(plans).toContain("onEmptyDelete");
    const apply = plans.slice(plans.indexOf("private func apply"), plans.indexOf("struct PlanningOutlineTextField"));
    expect(apply).not.toContain("focusedID = nil");
    expect(glass).toContain("static let duration: TimeInterval = 0.22");
    expect(glass).toContain("NativeGlassFeedback.perform");
    expect(glass).toContain("transitionPending");
    expect(glass).not.toContain("isScheduled");
    expect(plans).toContain("PlanningOutlineFocusCoordinator");
    expect(plans).toContain("pendingFocusID");
    expect(plans).toContain("return false");
    const icon = glass.slice(glass.indexOf("struct NativeGlassIconButton"), glass.indexOf("struct NativeGlassTextButton"));
    expect(icon).toContain(".frame(width: PlanningTokens.Header.buttonVisual, height: PlanningTokens.Header.buttonVisual)");
    expect(icon).toContain("PlanningPalette.accent");
    expect(icon).toContain(".buttonStyle(.plain)");
    expect(icon).toContain(".frame(minWidth: 44, minHeight: 44)");
    expect(icon).toContain(".buttonStyle(.glass)");
    expect(icon).toContain(".buttonBorderShape(.circle)");
    expect(icon).toContain("icon == .back");
    expect(tokens).toContain("static let outlineRowSpacing: CGFloat = 2");
    expect(tokens).toContain("static let parentRowHeight: CGFloat = 32");
  });
});

describe("planning period visual rebuild", () => {
  const sheets = readFileSync(`${planningRoot}/PlanningItemSheets.swift`, "utf8");

  it("keeps the period label on one centered line between fixed arrow zones", () => {
    const bar = periodPage.slice(periodPage.indexOf("func periodBar"), periodPage.indexOf("func periodBody"));
    expect(bar).toContain("ZStack");
    expect(bar).toContain(".lineLimit(1)");
    expect(bar).toContain("PlanningTokens.PeriodSelector.arrowZone");
    expect(bar).toContain("PlanningTokens.PeriodSelector.labelScaleFloor");
    expect(tokens).toContain("enum PeriodSelector");
    expect(tokens).toContain("static let arrowZone: CGFloat = 44");
  });

  it("drops the Weekly removal control and uses the app accent", () => {
    expect(periodPage).not.toContain("Weeklyをなくす");
    expect(periodPage).toContain("PlanningPalette.accent");
    expect(chrome).toContain("static let accent = Color(red: 0.916, green: 0.524, blue: 0.244)");
  });

  it("opens blocks by tap and keeps ellipsis off the period overview", () => {
    expect(periodPage).toContain("onTapGesture");
    expect(periodPage).not.toContain("ellipsis");
    expect(sheets).not.toContain("ellipsis");
    expect(reflectionPage).not.toContain("ellipsis");
  });

  it("edits a stored reflection from 振り返りを編集 without a progress summary", () => {
    expect(reflectionPage).toContain("振り返りを編集");
    expect(reflectionPage).toContain("PlanningRoute.reflectionEdit");
    expect(reflectionPage).not.toContain("進捗サマリー");
    expect(reflectionPage).not.toContain("主な項目");
    expect(planText).toContain("今月は記録がありませんでした");
    expect(planText).toContain("今週は記録がありませんでした");
    expect(planText).toContain("今日は記録がありませんでした");
  });

  it("seeds nine previous sample periods and never overwrites a real one", () => {
    expect(samples).toContain("by: -1");
    expect(samples).toContain("by: -2");
    expect(samples).toContain("by: -3");
    expect(samples).toContain("PlanningBucket.monthly, .weekly, .daily");
    expect(samples).toContain("朝のストレッチ");
    expect(samples).toContain("本を2冊読む");
    expect(samples).toContain("部屋を整理する");
    expect(samples).toContain("チームミーティング");
    expect(samples).toContain("友人と食事");
    expect(samples).toContain("その日の写真を1枚選び、一言だけ残せる記録です。");
    expect(samples).toContain("なんでも日記は、形式を決めずにその日・週・月の出来事や考えたことを自由に残すための記録です。");
    expect(samples).toContain("isSample: true");
    expect(samples).toContain("if session.periodRecords.contains");
    expect(samples).not.toContain("Firebase");
  });

  it("keeps the right index, due card, and shared chrome", () => {
    expect(tokens).toContain("depth: CGFloat = 30.8");
    expect(tokens).toContain("length: CGFloat = 90");
    expect(tokens).toContain("trailingMargin: CGFloat = 4");
    expect(tokens).toContain("static let minimumMultiple: CGFloat = 1.5");
    expect(tokens).toContain("static let maximumMultiple: CGFloat = 2.0");
    expect(periodPage).toContain("PlanningReflectionDueCard");
    expect(reflectionPage).toContain("glassEffect");
    expect(chrome).toContain("VStack(spacing: 0)");
    expect(chrome).not.toContain(".overlay(alignment: .top)");
    expect(chrome).toContain("PlanningTokens.Sheet.headerHeight");
  });
});

describe("planning header icon and sheet geometry", () => {
  const chrome = readFileSync(`${planningRoot}/PlanningChrome.swift`, "utf8");
  const glass = readFileSync("ios/App/App/Native/Components/Glass/NativeGlassComponents.swift", "utf8");
  const tokens = readFileSync(`${planningRoot}/PlanningDesignTokens.swift`, "utf8");
  const shell = readFileSync(`${planningRoot}/PlanningShell.swift`, "utf8");
  const future = readFileSync(`${planningRoot}/FuturePages.swift`, "utf8");
  const period = readFileSync(`${planningRoot}/PeriodPlannerPage.swift`, "utf8");
  const plans = readFileSync(`${planningRoot}/PlanPages.swift`, "utf8");

  it("extends Planning paper behind the top and bottom safe areas across the shell", () => {
    const surface = chrome.slice(chrome.indexOf("func planningExtendingSurface"), chrome.indexOf("func planningFixedHeader"));
    expect(surface).toContain(".ignoresSafeArea(.container, edges: [.top, .bottom])");
    expect(surface).toContain(".ignoresSafeArea(.keyboard, edges: .bottom)");
    expect(surface).not.toContain("ScrollView");
    expect(shell).toContain("PlanningIndex(session: session)");
    expect(shell).toContain(".planningExtendingSurface(PlanningPalette.paper)");
    expect(shell).not.toContain(".planningRootSafeArea()");
  });

  it("does not add a second top content margin under the Planning header", () => {
    expect(chrome).not.toContain("planningInitialScrollTopInset");
    expect(chrome).not.toContain("PlanningViewportMetrics");
    expect(chrome).not.toContain("rootSafeTop + PlanningTokens.Header.height");
    expect(chrome).not.toContain(".contentMargins(.top, inset, for: .scrollContent)");
    expect(future).not.toContain(".planningInitialScrollMargin()");
    expect(period).not.toContain(".planningInitialScrollMargin()");
    expect(future).not.toContain(".padding(.top, 72)");
    expect(period).not.toContain(".padding(.top, 72)");
    expect(plans).not.toContain(".planningInitialScrollMargin()");
  });

  it("uses one 44pt accent icon button and hides the iOS 26 Back platter", () => {
    expect(tokens).toContain("static let buttonVisual: CGFloat = 44");
    expect(glass).toContain(".font(.system(size: 17, weight: .semibold))");
    expect(glass).toContain("PlanningPalette.accent");
    expect(chrome).toContain("NativeGlassIconButton(icon: .back, accessibilityLabel: \"Back\", action: onBack)");
    expect(chrome).toContain(".sharedBackgroundVisibility(.hidden)");
    const icon = glass.slice(glass.indexOf("struct NativeGlassIconButton"), glass.indexOf("struct NativeGlassTextButton"));
    expect(icon).toContain(".buttonStyle(.plain)");
    expect(icon).toContain(".buttonStyle(.glass)");
    expect(icon).toContain(".buttonBorderShape(.circle)");
    expect(icon).not.toContain(".regular.interactive()");
    expect(icon).not.toContain("scaleEffect");
  });

  it("puts Planning paper outside pushed page chrome", () => {
    const editor = plans.slice(plans.indexOf("struct PlanEditorPage"), plans.indexOf("// MARK: Sections"));
    const chromeAt = editor.indexOf(".planningPageChrome(");
    const surfaceAt = editor.indexOf(".planningExtendingSurface(PlanningPalette.paper)");
    expect(chromeAt).toBeGreaterThan(-1);
    expect(surfaceAt).toBeGreaterThan(chromeAt);
    const help = readFileSync(`${planningRoot}/PlanningHelpPage.swift`, "utf8");
    expect(help.indexOf(".planningExtendingSurface(PlanningPalette.paper)")).toBeGreaterThan(help.indexOf(".planningPageChrome("));
  });

  it("keeps a real clear sheet header and body-only keyboard overlap", () => {
    const sheet = chrome.slice(chrome.indexOf("struct PlanningSystemSheetChrome"), chrome.indexOf("struct PlanningHeadingIconSlot"));
    expect(sheet).toContain("VStack(spacing: 0)");
    expect(sheet).not.toContain(".overlay(alignment: .top)");
    expect(sheet).not.toContain(".padding(.top, PlanningTokens.Sheet.headerHeight)");
    expect(tokens).toContain("static let headerHeight: CGFloat = 76");
    expect(tokens).toContain("static let controlDiameter: CGFloat = 44");
    expect(sheet).toContain(".background(Color.clear)");
    expect(sheet).toContain(".ignoresSafeArea(.keyboard, edges: .bottom)");
    expect(sheet).toContain("PlanningSheetViewport(maximumVisible: $maximumVisibleSheetHeight, keyboardObstructing: $keyboardObstructing)");
    expect(sheet).toContain("private var bodyViewportHeight");
    expect(sheet).not.toContain(".contentMargins(.bottom, keyboardOverlap, for: .scrollContent)");
    expect(sheet.indexOf("controls")).toBeLessThan(sheet.indexOf("ScrollView"));
    expect(sheet).toContain(".presentationDetents([.height(max(presentedHeight, 1))])");
    expect(sheet).toContain("guard !keyboardObstructing");
  });
});

describe("planning interaction stability", () => {
  const chrome = readFileSync(`${planningRoot}/PlanningChrome.swift`, "utf8");
  const glass = readFileSync("ios/App/App/Native/Components/Glass/NativeGlassComponents.swift", "utf8");
  const tokens = readFileSync(`${planningRoot}/PlanningDesignTokens.swift`, "utf8");
  const plans = readFileSync(`${planningRoot}/PlanPages.swift`, "utf8");
  const future = readFileSync(`${planningRoot}/FuturePages.swift`, "utf8");
  const period = readFileSync(`${planningRoot}/PeriodPlannerPage.swift`, "utf8");
  const shell = readFileSync(`${planningRoot}/PlanningShell.swift`, "utf8");

  it("clamps the sheet to the visible region and keeps the header out of the body", () => {
    const sheet = chrome.slice(chrome.indexOf("struct PlanningSystemSheetChrome"), chrome.indexOf("struct PlanningHeadingIconSlot"));
    expect(sheet).toContain("min(max(stableHeight, 1), maximumVisibleSheetHeight)");
    expect(sheet).toContain("presentedHeight - PlanningTokens.Sheet.headerHeight");
    expect(chrome).toContain("PlanningTokens.Sheet.platterTopGap");
    expect(sheet).toContain("VStack(spacing: 0)");
    expect(sheet.indexOf("controls")).toBeLessThan(sheet.indexOf("ScrollView"));
    expect(sheet).not.toContain(".overlay(alignment: .top)");
    expect(future).toContain("maximumBody: PlanningTokens.Sheet.maximumBody");
  });

  it("dismisses the keyboard before a transition and not on outline focus moves", () => {
    expect(glass).toContain("enum PlanningTransition");
    expect(glass).toContain("resignFirstResponder");
    const transition = glass.slice(glass.indexOf("enum PlanningTransition"), glass.indexOf("enum NativeGlassIcon"));
    expect(transition.indexOf("resignFirstResponder")).toBeLessThan(transition.indexOf("NativeGlassFeedback.perform"));
    const submit = plans.slice(plans.indexOf("func textFieldShouldReturn"), plans.indexOf("func textField("));
    expect(submit).toContain("return false");
    expect(submit).not.toContain("PlanningTransition");
    expect(submit).not.toContain("resignFirstResponder");
    const backspace = plans.slice(plans.indexOf("func textField(_ textField: UITextField, shouldChangeCharactersIn"), plans.indexOf("enum PlanBulletReturn"));
    expect(backspace).toContain("handleEmptyDelete");
    expect(backspace).not.toContain("PlanningTransition");
  });

  it("keeps glass feedback local to the tapped control", () => {
    expect(glass).not.toContain("isScheduled");
    expect(glass).toContain("guard !transitionPending else { return }");
    expect(glass).toContain("Button(action: invoke)");
    expect(glass).not.toContain("DragGesture");
    expect(shell).toContain("NativeGlassIconButton(icon: .postpone, accessibilityLabel: \"Postpone Box\", waitsForGlassFeedback: true, action: onPostpone)");
    const icon = glass.slice(glass.indexOf("struct NativeGlassIconButton"), glass.indexOf("struct NativeGlassTextButton"));
    expect(icon).not.toContain(".regular.interactive()");
  });

  it("shares Plan's intro gap on every Planning section", () => {
    expect(tokens).toContain("static let topGap: CGFloat = 17.5");
    expect(tokens).not.toContain("11.725");
    expect(tokens).toContain("static let titleTop: CGFloat = 35");
    expect(future).toContain("topGap: PlanningTokens.PlanIntro.topGap");
    expect(period).toContain("topGap: PlanningTokens.PlanIntro.topGap");
    const planIntro = plans.slice(plans.indexOf("PlanningSectionIntro("), plans.indexOf("PlanningHeadingIconSlot"));
    expect(planIntro).not.toContain("PeriodIntro.topGap");
  });
});

describe("planning period lists and reflection windows", () => {
  const periodPage = readFileSync(`${planningRoot}/PeriodPlannerPage.swift`, "utf8");
  const reflectionPage = readFileSync(`${planningRoot}/ReflectionPages.swift`, "utf8");
  const reflection = readFileSync(`${planningRoot}/ReflectionFlow.swift`, "utf8");
  const tokens = readFileSync(`${planningRoot}/PlanningDesignTokens.swift`, "utf8");
  const samples = readFileSync(`${planningRoot}/TemporaryPlanningSamples.swift`, "utf8");

  function editable(dates: number[], limit: number): number[] {
    return [...dates].sort((left, right) => right - left).slice(0, limit);
  }

  it("uses a parent timeline and collapsible sections without counts", () => {
    expect(periodPage).toContain("chevron.down");
    expect(periodPage).toContain("struct PeriodParentTimeline");
    expect(tokens).toContain("static let timelineGap: CGFloat = 5");
    expect(tokens).toContain("static let subtaskIndent: CGFloat = 16");
    expect(periodPage).toContain("showsIcon: false");
    const timeline = periodPage.slice(periodPage.indexOf("struct PeriodParentTimeline"), periodPage.indexOf("struct PeriodEventRow"));
    expect(timeline).toContain("connectsToNext");
    expect(timeline).not.toContain("Divider(");
    const header = periodPage.slice(periodPage.indexOf("func periodListSection"), periodPage.indexOf("struct PeriodParentTimeline"));
    expect(header).not.toContain("件");
    expect(periodPage).toContain("PlanningTransition.perform(action)");
  });

  it("splits reflection into overview, classification, and snapshot detail", () => {
    expect(reflectionPage).toContain("Button(action: action)");
    const overview = reflectionPage.slice(reflectionPage.indexOf("private var overviewPage"), reflectionPage.indexOf("private var classificationPage"));
    expect(overview).toContain("ReflectionProgressRing");
    expect(overview).toContain("\"ToDo\"");
    expect(overview).toContain("\"予定\"");
    const classification = reflectionPage.slice(reflectionPage.indexOf("private var classificationPage"), reflectionPage.indexOf("private var detailPage"));
    expect(classification).not.toContain("ReflectionProgressRing");
    expect(classification).toContain("\"ToDo\"");
    expect(classification).toContain("\"予定\"");
    expect(reflectionPage).toContain("item.completed ? \"完了\" : \"未完了\"");
    expect(reflection).toContain("canCompleteReflection");
    expect(reflectionPage).toContain("維持");
    expect(reflectionPage).toContain("先送り");
    expect(reflectionPage).toContain("終了");
    expect(reflectionPage).not.toContain("主な項目");
    expect(reflectionPage).not.toContain("Button(\"Replan\")");
    expect(reflectionPage).toContain("session.decisions(for: scope)");
  });

  it("keeps rolling completed-reflection edit windows", () => {
    expect(editable([8, 7, 6, 5, 4, 3, 2, 1], 7)).toEqual([8, 7, 6, 5, 4, 3, 2]);
    expect(editable([8, 7, 6, 5, 4, 3, 2, 1], 7)).not.toContain(1);
    expect(editable([5, 4, 3, 2, 1], 4)).toEqual([5, 4, 3, 2]);
    expect(editable([5, 4, 3, 2, 1], 4)).not.toContain(1);
    expect(editable([2, 1], 1)).toEqual([2]);
    expect(reflection).toContain("case .daily: 7");
    expect(reflection).toContain("case .weekly: 4");
    expect(reflection).toContain("case .monthly: 1");
    expect(reflectionPage).toContain("振り返りの編集");
  });

  it("keeps photo and diary off the task lists", () => {
    const body = periodPage.slice(periodPage.indexOf("func periodBody"), periodPage.indexOf("func monthlyGoal"));
    expect(body).toContain("SavedPeriodMemory");
    expect(body.indexOf("if let entry")).toBeLessThan(body.indexOf("periodListSection"));
    expect(reflectionPage).toContain("一言を入力");
    expect(reflectionPage).toContain("PlanningRoute.planningMemory");
    expect(samples).toContain("kind: .photoNote");
    expect(samples).toContain("kind: .diary");
    const photo = samples.slice(samples.indexOf("func seedDemoPhoto"), samples.indexOf("func seedDemoDiary"));
    expect(photo).not.toContain("periodItems.append");
    const diary = samples.slice(samples.indexOf("func seedDemoDiary"), samples.indexOf("func demoSkyImage"));
    expect(diary).not.toContain("periodItems.append");
  });
});

describe("phase C-3 reflection and popups", () => {
  it("replaces completed period lists with the shared summary", () => {
    const body = periodPage.slice(periodPage.indexOf("func periodBody"), periodPage.indexOf("func monthlyGoal"));
    expect(body).toContain("ReflectionPeriodSummary");
    expect(body.indexOf("if reflected")).toBeLessThan(body.indexOf("periodListSection"));
    expect(reflectionPage).toContain("詳細を見る");
    expect(reflectionPage).toContain("struct ReflectionAchievementCard");
    expect(reflectionPage).toContain("struct ReflectionClassificationCard");
    expect(reflectionPage).toContain("全体の達成率");
    expect(reflectionPage).toContain("振り返りの分類結果");
    expect(tokens).toContain("static let ringDiameter: CGFloat = 112");
    expect(tokens).toContain("static let blockHeight: CGFloat = 82");
  });

  it("builds one detail page from the same cards and snapshot titles", () => {
    const detail = reflectionPage.slice(reflectionPage.indexOf("private var detailPage"), reflectionPage.indexOf("private var periodContext"));
    expect(detail).toContain("ReflectionAchievementCard");
    expect(detail).toContain("ReflectionClassificationCard");
    expect(detail).toContain("ToDo の振り返り結果");
    expect(detail).toContain("予定 の振り返り結果");
    expect(detail).toContain("振り返りの編集");
    expect(detail).not.toContain("editBucket");
    expect(detail).not.toContain("主な項目");
    expect(detail).not.toContain("Replan");
    expect(reflectionPage).toContain("該当する項目はありません");
    expect(reflectionPage).toContain("session.decisions(for: scope)");
  });

  it("uses the rolling window and an inline alert", () => {
    expect(reflection).toContain("func reflectionIsEditable");
    expect(reflection).toContain("case .daily: 7");
    expect(reflection).toContain("case .weekly: 4");
    expect(reflection).toContain("case .monthly: 1");
    expect(reflectionPage).toContain("この振り返りは現在編集できます。");
    expect(reflectionPage).toContain("この振り返りの編集可能期間は終了しています。");
    expect(reflectionPage).toContain("編集可能範囲は Daily 7件 / Weekly 4件 / Monthly 1件です。");
    expect(reflectionPage).toContain("編集可能範囲: Daily 7件 / Weekly 4件 / Monthly 1件");
    expect(reflectionPage).toContain("新しい振り返りが追加されると、古いものから編集できなくなります。");
  });

  it("rebuilds the list popup around a plus and a parent timeline", () => {
    expect(itemSheets).toContain("centerTitle: \"ToDo・予定\"");
    expect(itemSheets).toContain("confirmIcon: .plus");
    expect(itemSheets).toContain("checkmark.square.fill");
    expect(itemSheets).toContain("checkmark.circle.fill");
    expect(itemSheets).toContain("connectsToNext");
    expect(itemSheets).toContain("listSubtaskIndent");
    expect(itemSheets).toContain("timelineGap");
    const row = itemSheets.slice(itemSheets.indexOf("func parentTimelineRow"), itemSheets.indexOf("func timelineSpan"));
    expect(row).not.toContain("ellipsis");
    expect(row).not.toContain("Divider(");
  });

  it("anchors the source popover and keeps the list sheet open", () => {
    expect(itemSheets).toContain("presentationCompactAdaptation(.popover)");
    expect(itemSheets).toContain("showingSources = false");
    expect(period).toContain("case .monthly: [.plan, .create, .postpone]");
    expect(period).toContain("case .weekly: [.plan, .create, .postpone, .monthly]");
    expect(period).toContain("case .daily: [.periods, .create, .postpone]");
    expect(addSources("daily")).not.toContain("Planから追加");
  });

  it("rebuilds the editor, date popup, and subtask focus rules", () => {
    expect(itemSheets).toContain("タスクを追加");
    expect(itemSheets).toContain("予定を追加");
    expect(itemSheets).toContain("if kind == .task");
    expect(itemSheets).toContain("struct PlanningDateTimePopup");
    expect(itemSheets).toContain("開始日時");
    expect(itemSheets).toContain("終了日時");
    expect(itemSheets).toContain("shouldAppendNextRow");
    expect(itemSheets).toContain("requestFocus(previous)");
    expect(itemSheets).toContain("resignFirstResponder");
    expect(itemSheets).toContain("PlanningTransition.perform { editingDate = field }");
  });

  it("keeps source pages in selection mode", () => {
    const source = itemSheets.slice(itemSheets.indexOf("struct PeriodSourceSelectionSheet"), itemSheets.indexOf("private enum PlanningDateField"));
    expect(source).toContain("plan.title");
    expect(source).toContain("afterToggle");
    expect(source).toContain("postponeSection(.monthly");
    expect(source).toContain("postponeSection(.weekly");
    expect(source).toContain("postponeSection(.daily");
    expect(source).not.toContain("editingID");
    expect(period).toContain("Parent on checks children");
    expect(period).toContain("Children never check the parent");
  });
});

describe("planning root viewport repair", () => {
  const chrome = readFileSync(`${planningRoot}/PlanningChrome.swift`, "utf8");
  const glass = readFileSync("ios/App/App/Native/Components/Glass/NativeGlassComponents.swift", "utf8");
  const tokens = readFileSync(`${planningRoot}/PlanningDesignTokens.swift`, "utf8");
  const future = readFileSync(`${planningRoot}/FuturePages.swift`, "utf8");
  const periodPage = readFileSync(`${planningRoot}/PeriodPlannerPage.swift`, "utf8");
  const models = readFileSync(`${planningRoot}/PlanningModels.swift`, "utf8");
  const shell = readFileSync(`${planningRoot}/PlanningShell.swift`, "utf8");

  it("gives icon buttons the system glass style without a nested interactive gesture", () => {
    const icon = glass.slice(glass.indexOf("struct NativeGlassIconButton"), glass.indexOf("struct NativeGlassTextButton"));
    expect(icon).toContain(".buttonStyle(.glass)");
    expect(icon).toContain(".buttonBorderShape(.circle)");
    expect(icon).toContain("Button(action: invoke)");
    expect(icon).not.toContain(".regular.interactive()");
    expect(icon).not.toContain("scaleEffect");
    expect(icon).toContain("guard !transitionPending else { return }");
    expect(glass).not.toContain("isScheduled");
    expect(chrome).toContain(".sharedBackgroundVisibility(.hidden)");
  });

  it("keeps one Plan intro gap for Future and period pages", () => {
    expect(tokens).toContain("static let topGap: CGFloat = 17.5");
    expect(tokens).not.toContain("11.725");
    expect(chrome).toContain("PlanningTokens.PlanIntro.topGap");
    expect(future).toContain("topGap: PlanningTokens.PlanIntro.topGap");
    expect(periodPage).toContain("topGap: PlanningTokens.PlanIntro.topGap");
  });

  it("pages by finger-follow without a horizontal ScrollView", () => {
    const host = chrome.slice(chrome.indexOf("struct PlanningSwipePageHost"), chrome.indexOf("private struct PlanningHorizontalPanInstaller"));
    expect(host).toContain("content(selection)");
    expect(host).toContain("if translation != 0");
    expect(host).not.toContain("ScrollView(");
    expect(host).not.toContain(".containerRelativeFrame");
    expect(host).not.toContain("ForEach(pages, id: \\.self)");
    expect(chrome).not.toContain("enum PlanningViewportMetrics");
    expect(chrome).not.toContain("struct PlanningHorizontalPager");
    expect(shell).not.toContain(".planningRootSafeArea()");
    expect(future).not.toContain("scrollPosition");
    expect(periodPage).not.toContain("ScrollViewReader");
  });

  it("floats the reflection due card without shrinking the pager", () => {
    const page = periodPage.slice(periodPage.indexOf("var body: some View"), periodPage.indexOf("private var pageKeys"));
    expect(page).toContain(".overlay(alignment: .bottom)");
    expect(page).toContain("PlanningReflectionDueCard");
    expect(page).not.toContain("safeAreaInset");
    expect(periodPage).toContain("PlanningTokens.ReflectionDue.height(tabBar: tabBarHeight)");
  });

  it("caches Future year calendars across view recreation", () => {
    expect(future).toContain("struct FutureYearCalendarSnapshot");
    expect(future).toContain("final class FutureCalendarCache");
    expect(future).toContain("existing.revision == revision");
    expect(models).toContain("let futureCalendars = FutureCalendarCache()");
    expect(models).toContain("futureCalendarRevision");
    expect(models).toContain("func futureCalendar(year: Int)");
    const cell = future.slice(future.indexOf("private struct FutureMonthCell"), future.indexOf("private struct FutureRangeBand"));
    expect(cell).not.toContain("FutureCalendarMarks.winner");
    expect(cell).toContain("Canvas");
    expect(cell).toContain("bandRole(column: column, eventID: eventID, rowWinners: winners)");
    expect(cell).not.toContain("ForEach(0..<PlanningCalendarGrid.rowCount");
  });

  it("keeps the current vertical page as the Planning scroll root", () => {
    const plans = readFileSync(`${planningRoot}/PlanPages.swift`, "utf8");
    expect(plans).toContain("ScrollView");
    expect(future).toContain("ScrollView");
    expect(periodPage).toContain("ScrollView");
    expect(future).not.toContain("ScrollView(.horizontal)");
    expect(periodPage).not.toContain("ScrollView(.horizontal)");
    expect(future).not.toContain(".toolbarBackground");
    expect(periodPage).not.toContain(".toolbarBackground");
    expect(future).not.toContain(".ultraThinMaterial");
    expect(periodPage).not.toContain(".ultraThinMaterial");
    expect(shell).toContain("PlanningSectionPage(session: session)");
    expect(shell).toContain("PlanningIndex(session: session)");
  });

  it("changes the logical page only after a horizontal settle", () => {
    const host = chrome.slice(chrome.indexOf("struct PlanningSwipePageHost"), chrome.indexOf("private struct PlanningHorizontalPanInstaller"));
    const pan = chrome.slice(chrome.indexOf("private struct PlanningHorizontalPanInstaller"), chrome.indexOf("struct PlanningSystemSheetChrome"));
    expect(pan).toContain("abs(translation.x) > abs(translation.y)");
    expect(host).toContain("if !ended");
    expect(host).toContain("selection = page");
    expect(host.indexOf("if !ended")).toBeLessThan(host.indexOf("selection = page"));
    expect(host).toContain(".allowsHitTesting(false)");
  });

  it("sizes system glass from the symbol and keeps a 44pt hit slot", () => {
    const icon = glass.slice(glass.indexOf("struct NativeGlassIconButton"), glass.indexOf("// fallback platter"));
    expect(icon).toContain(".controlSize(.regular)");
    expect(icon).toContain(".font(.system(size: 17, weight: .semibold))");
    expect(icon).toContain(".buttonStyle(.glass)");
    expect(icon).toContain(".buttonBorderShape(.circle)");
    expect(icon).not.toContain("buttonVisual");
    expect(icon).not.toContain(".regular.interactive()");
    expect(glass).toContain(".frame(minWidth: 44, minHeight: 44)");
    expect(glass).toContain("guard !transitionPending else { return }");
  });

  it("shows the selected Future year before neighbor preparation", () => {
    const select = models.slice(models.indexOf("func select("), models.indexOf("func futureCalendar"));
    expect(select).toContain("isWarm(year: year, revision: revision)");
    expect(select).not.toContain("prepare(around:");
    expect(select).toContain("prepareNeighbors(around: year");
    expect(select).toContain("DispatchQueue.main.async");
    expect(future).toContain("func prepareNeighbors");
    expect(models).toContain("let futureCalendars = FutureCalendarCache()");
  });

  it("clears only the period scroll content for the floating due card", () => {
    expect(periodPage).toContain(".overlay(alignment: .bottom)");
    expect(periodPage).toContain(".padding(.bottom, session.isActivePrompt(ReflectionScope.period(bucket, key)) ? PlanningTokens.ReflectionDue.height(tabBar: tabBarHeight) + 24 : 0)");
    expect(periodPage).not.toContain("safeAreaInset");
  });
});
