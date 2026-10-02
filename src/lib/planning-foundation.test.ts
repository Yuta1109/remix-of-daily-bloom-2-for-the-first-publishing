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
    expect(planningShell.indexOf("PlanningHeader(")).toBeLessThan(planningShell.indexOf("PlanningIndex("));
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
    expect(future).toContain("presentationDetents([.large])");
    expect(future).toContain(".tabViewStyle(.page(indexDisplayMode: .never))");
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
    expect(periodPage).toContain(".tabViewStyle(.page(indexDisplayMode: .never))");
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
    expect(periodPage).toContain("ReflectionResultView");
    expect(periodPage).toContain("isReflectionComplete");
    expect(periodPage).not.toContain("今月の進捗");
    expect(models).toContain("var reflectionDisposition");
    expect(models).toContain("var goal: String");
    expect(periodPage).toContain("Weeklyをなくす");
    expect(periodPage).toContain("PlanningRoute.weeklySettings");
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
    expect(reflectionPage).toContain("達成");
    expect(reflectionPage).toContain("振り返り結果");
    expect(reflectionPage).toContain("Button(\"Replan\")");
    expect(reflectionPage).toContain("写真 & 一言");
    expect(reflectionPage).toContain("なんでも日記");
    expect(reflectionPage).toContain("addMemory");
    expect(reflectionPage).toContain("updateHistoricalDecision");
    expect(reflectionPage).toContain("振り返りを始めますか？");
    expect(reflectionPage).toContain("今日はやめとく");
    expect(reflectionPage).toContain("今週はやめとく");
    expect(reflectionPage).toContain("今月はやめとく");
    expect(reflectionPage).toContain("今年はやめとく");
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
    expect(planningShell.indexOf("PlanningHeader(")).toBeLessThan(planningShell.indexOf("HStack(alignment: .top"));
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
    expect(reflectionPage).toContain("忙しい日はだれにでもあります。");
  });

  it("keeps month cards on a stable grid and pages years and periods", () => {
    expect(chrome).toContain("static let rowCount = 6");
    expect(chrome).toContain("static let columnCount = 7");
    expect(future).toContain("PlanningCalendarGrid.matrix");
    expect(future).toContain("indexDisplayMode: .never");
    expect(periodPage).toContain("indexDisplayMode: .never");
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
    expect(models).toContain("TemporaryPlanningSamples.install");
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
    expect(plans).toContain("icon: .check");
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
    const section = periodPage.slice(periodPage.indexOf("func itemSection"), periodPage.indexOf("func sectionTitle"));
    expect(section).not.toContain("追加");
    expect(section).toContain("onTapGesture");
    expect(periodPage).toContain("PeriodItemListSheet");
    expect(period).toContain("case .monthly: [.plan, .create, .postpone]");
    expect(period).toContain("case .weekly: [.plan, .create, .postpone, .monthly]");
    expect(period).toContain("case .daily: [.periods, .create, .postpone]");
    expect(period).toContain("func importSources");
    expect(models).toContain("copiedAlready");
  });

  it("protects daily completion and shares the editor model", () => {
    expect(period).toContain("bucket != .daily");
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
    expect(plans).toContain(".alert(PlanningText.string(.discardTitle)");
    expect(plans).not.toContain("confirmationDialog");
    expect(planText).toContain("この変更を破棄しますか？");
    expect(planText).toContain("キャンセル");
    const request = plans.slice(plans.indexOf("private func requestClose"), plans.indexOf("private func leave"));
    expect(request).toContain("confirmDiscard = true");
    expect(request.indexOf("confirmDiscard = true")).toBeLessThan(request.indexOf("leave()"));
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

  it("transfers only a saved clean plan and never auto-saves", () => {
    const editor = plans.slice(plans.indexOf("struct PlanEditorPage"), plans.indexOf("enum PlanBulletFilter"));
    expect(editor).toContain("private var canTransfer: Bool");
    expect(editor).toContain("!isNewPlan && snapshot() == savedSnapshot");
    expect(editor).toContain(".disabled(!canTransfer)");
    expect(editor).toContain("plan.hasBeenSaved");
    expect(editor).toContain("PlanBulletFilter.reflectable(plan.bullets)");
    expect(editor).not.toContain("reflectable(bullets)");
    const reflect = editor.slice(editor.indexOf("private func reflect"), editor.indexOf("private func requestClose"));
    expect(reflect).not.toContain("session.save(");
    const save = editor.slice(editor.indexOf("private func save"), editor.indexOf("private func reflect"));
    expect(save.match(/session\.save\(/g)).toHaveLength(1);
    expect(save.match(/navigation\.pop\(\)/g)).toHaveLength(1);
    expect(save).not.toContain("leave()");
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
    expect(chrome).toContain("presentationDetents([.height(height)])");
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

  it("makes Help header transparent and fixed", () => {
    const header = help.slice(0, help.indexOf("ScrollView"));
    expect(header).toContain("PlanningText.string(.planningHelpTitle)");
    expect(help).not.toContain("ultraThinMaterial");
    expect(header).not.toContain(".background(");
  });

  it("keeps the app portrait-only on iPhone and localizes ja/en", () => {
    const plist = readFileSync("ios/App/App/Info.plist", "utf8");
    const phone = plist.slice(plist.indexOf("<key>UISupportedInterfaceOrientations</key>"), plist.indexOf("<key>UISupportedInterfaceOrientations~ipad</key>"));
    expect(phone).toContain("UIInterfaceOrientationPortrait");
    expect(phone).not.toContain("Landscape");
    expect(plist).toContain("<string>en</string>");
    expect(planText).toContain("isEnglish");
  });

  it("centralizes geometry in tokens", () => {
    for (const token of ["height: CGFloat = 72", "titleSize: CGFloat = 34", "depth: CGFloat = 28", "trailingMargin: CGFloat = 4", "seamWidth: CGFloat = 2", "buttonHeight: CGFloat = 52"]) {
      expect(tokens).toContain(token);
    }
  });
});
