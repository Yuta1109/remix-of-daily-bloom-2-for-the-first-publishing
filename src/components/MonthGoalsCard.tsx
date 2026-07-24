import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Check, ChevronDown, ChevronUp, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";
import {
  loadMonthGoals,
  monthGoalsHeading,
  saveMonthGoals,
  type MonthGoal,
  type MonthGoalsBundle,
} from "@/lib/month-goals";
import { hideKeyboard } from "@/lib/keyboard-avoidance";
import { emitTutorial, isTutorialActive } from "@/lib/tutorial";

interface Props {
  monthKey: string;
  onMinimizedChange?: (minimized: boolean) => void;
  collapseSignal?: number;
}

type PromptState = { goalId: string } | null;

/** Trailing column width — always reserved once any goal history exists. */
const TRAIL = "w-8";

function PageDots({ count, active }: { count: number; active: number }) {
  if (count < 2) return null;
  return (
    <div className="flex items-center justify-center gap-1.5 h-3 shrink-0">
      {Array.from({ length: count }, (_, i) => (
        <span
          key={i}
          className={cn(
            "h-1.5 rounded-full transition-all",
            i === active ? "w-3.5 bg-accent" : "w-1.5 bg-muted-foreground/30"
          )}
        />
      ))}
    </div>
  );
}

function GoalRowShell({
  leading,
  children,
  reserveTrail,
  trailing,
}: {
  leading: ReactNode;
  children: ReactNode;
  /** Keep right column even when empty so rows don't shift. */
  reserveTrail: boolean;
  trailing?: ReactNode;
}) {
  return (
    <div className="flex items-center gap-2 min-h-[36px] w-full box-border">
      <div className={cn("flex-shrink-0 h-8 flex items-center justify-center", TRAIL)}>
        {leading}
      </div>
      <div className="flex-1 min-w-0">{children}</div>
      {reserveTrail && (
        <div className={cn("flex-shrink-0 h-8 flex items-center justify-center", TRAIL)}>
          {trailing ?? <span className="w-8 h-8" aria-hidden />}
        </div>
      )}
    </div>
  );
}

export function MonthGoalsCard({
  monthKey,
  onMinimizedChange,
  collapseSignal = 0,
}: Props) {
  const { t, locale } = useI18n();
  const title = monthGoalsHeading(monthKey, locale, {
    this: t("monthGoalsThis"),
    next: t("monthGoalsNext"),
    last: t("monthGoalsLast"),
    named: t("monthGoalsNamed"),
  });
  const [bundle, setBundle] = useState<MonthGoalsBundle>(() =>
    loadMonthGoals(monthKey)
  );
  const [prompt, setPrompt] = useState<PromptState>(null);
  const [draftText, setDraftText] = useState("");
  const [composing, setComposing] = useState(false);
  const [composeFrom, setComposeFrom] = useState<MonthGoal | null>(null);
  const [slideCompose, setSlideCompose] = useState(false);
  const [pageIndex, setPageIndex] = useState(0);
  const carouselRef = useRef<HTMLDivElement>(null);
  const draftRef = useRef<HTMLInputElement>(null);
  const focusDraftAfter = useRef(false);
  const lastCollapse = useRef(0);

  useEffect(() => {
    const next = loadMonthGoals(monthKey);
    setBundle(next);
    onMinimizedChange?.(next.minimized);
    setPrompt(null);
    setComposing(false);
    setComposeFrom(null);
    setSlideCompose(false);
    setDraftText("");
  }, [monthKey, onMinimizedChange]);

  const persist = useCallback(
    (next: MonthGoalsBundle) => {
      setBundle(next);
      saveMonthGoals(monthKey, next);
      onMinimizedChange?.(next.minimized);
      if (next.minimized && isTutorialActive()) {
        emitTutorial("goals-minimized");
      }
    },
    [monthKey, onMinimizedChange]
  );

  useEffect(() => {
    if (!collapseSignal || collapseSignal === lastCollapse.current) return;
    lastCollapse.current = collapseSignal;
    setBundle((prev) => {
      if (prev.minimized) return prev;
      const next = { ...prev, minimized: true };
      saveMonthGoals(monthKey, next);
      onMinimizedChange?.(true);
      if (isTutorialActive()) emitTutorial("goals-minimized");
      return next;
    });
  }, [collapseSignal, monthKey, onMinimizedChange]);

  const goals = bundle.goals;
  const completedCount = goals.filter((g) => g.completed).length;
  const active = goals.find((g) => !g.completed) ?? null;
  const showCarousel = goals.length >= 2 && !composing && !prompt;
  const drafting = !prompt && (composing || goals.length === 0);
  /** Once there is any history, always reserve the + column (prevents Enter shift). */
  const reserveTrail =
    completedCount >= 1 || goals.length >= 2 || !!composeFrom || (composing && goals.length >= 1);
  const showPager =
    !prompt &&
    (goals.length >= 2 || (!!composeFrom && drafting && goals.length >= 1));

  useLayoutEffect(() => {
    if (!showCarousel || !carouselRef.current) return;
    const idx = goals.findIndex((g) => !g.completed);
    const target = idx >= 0 ? idx : Math.max(0, goals.length - 1);
    const el = carouselRef.current;
    el.scrollTo({ left: target * el.clientWidth, behavior: "auto" });
    setPageIndex(target);
  }, [monthKey, showCarousel, goals]);

  useEffect(() => {
    if (!composing || !focusDraftAfter.current) return;
    // Wait until slide reveals the draft panel.
    if (composeFrom && !slideCompose) return;
    focusDraftAfter.current = false;
    const id = window.setTimeout(() => {
      draftRef.current?.focus({ preventScroll: true });
    }, composeFrom ? 320 : 50);
    return () => clearTimeout(id);
  }, [composing, composeFrom, slideCompose]);

  const startCompose = (from?: MonthGoal | null) => {
    setComposeFrom(from ?? null);
    setComposing(true);
    setDraftText("");
    focusDraftAfter.current = true;
    if (bundle.minimized) persist({ ...bundle, minimized: false });
    if (from) {
      setSlideCompose(false);
      setPageIndex(goals.length);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setSlideCompose(true));
      });
    } else {
      setSlideCompose(false);
    }
  };

  const commitDraft = () => {
    const text = draftText.trim();
    if (!text) {
      // Empty Enter / dismiss: leave compose without shifting layout quirks.
      setComposing(false);
      setSlideCompose(false);
      setComposeFrom(null);
      void hideKeyboard();
      return;
    }
    const completed = goals.filter((g) => g.completed);
    const nextGoal: MonthGoal = {
      id: crypto.randomUUID(),
      text,
      completed: false,
    };
    persist({
      ...bundle,
      goals: [...completed, nextGoal],
      minimized: false,
    });
    setComposing(false);
    setSlideCompose(false);
    setComposeFrom(null);
    setDraftText("");
    void hideKeyboard();
  };

  const onCheckActive = (goal: MonthGoal) => {
    if (goal.completed || !goal.text.trim()) return;
    setPrompt({ goalId: goal.id });
  };

  const confirmComplete = (setNew: boolean) => {
    if (!prompt) return;
    const now = new Date().toISOString();
    const marked = goals.map((g) =>
      g.id === prompt.goalId
        ? { ...g, completed: true, completedAt: now }
        : g
    );
    const justDone = marked.find((g) => g.id === prompt.goalId) ?? null;
    persist({ ...bundle, goals: marked, minimized: false });
    setPrompt(null);
    if (setNew) startCompose(justDone);
  };

  const updateGoalText = (id: string, text: string) => {
    persist({
      ...bundle,
      goals: goals.map((g) => (g.id === id ? { ...g, text } : g)),
    });
  };

  const toggleMinimized = () => {
    persist({ ...bundle, minimized: !bundle.minimized });
  };

  const onCarouselScroll = () => {
    const el = carouselRef.current;
    if (!el || el.clientWidth <= 0) return;
    const idx = Math.round(el.scrollLeft / el.clientWidth);
    setPageIndex(Math.max(0, Math.min(goals.length - 1, idx)));
  };

  if (bundle.minimized) {
    return (
      <button
        type="button"
        data-tutorial="month-goals"
        onClick={toggleMinimized}
        className="w-full rounded-2xl bg-card/95 backdrop-blur-sm shadow-card border border-border/50 px-4 py-2.5 flex items-center justify-between gap-2 text-left"
      >
        <div className="min-w-0">
          <p className="text-sm font-semibold">{title}</p>
          <p className="text-xs text-muted-foreground truncate">
            {t("goalsCompletedCount").replace("{n}", String(completedCount))}
          </p>
        </div>
        <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
      </button>
    );
  }

  const checkbox = (done: boolean, onClick?: () => void) => (
    <button
      type="button"
      disabled={done || !onClick}
      onClick={onClick}
      aria-label={done ? "Completed" : "Mark complete"}
      className="w-8 h-8 flex items-center justify-center touch-manipulation"
    >
      <span
        className={cn(
          "w-5 h-5 rounded-full border-2 flex items-center justify-center",
          done ? "bg-accent border-accent" : "border-muted-foreground/30"
        )}
      >
        {done && (
          <Check className="w-3 h-3 text-accent-foreground" strokeWidth={3} />
        )}
      </span>
    </button>
  );

  const renderGoalRow = (goal: MonthGoal, opts?: { showPlus?: boolean }) => (
    <GoalRowShell
      reserveTrail={reserveTrail}
      leading={checkbox(goal.completed, goal.completed ? undefined : () => onCheckActive(goal))}
      trailing={
        opts?.showPlus && goal.completed ? (
          <button
            type="button"
            onClick={() => startCompose(goal)}
            aria-label={t("add")}
            className="w-8 h-8 rounded-full bg-accent text-accent-foreground flex items-center justify-center touch-manipulation"
          >
            <Plus className="w-3.5 h-3.5" strokeWidth={2.5} />
          </button>
        ) : undefined
      }
    >
      {goal.completed ? (
        <p className="text-sm line-through text-muted-foreground truncate">{goal.text}</p>
      ) : (
        <input
          value={goal.text}
          onChange={(e) => updateGoalText(goal.id, e.target.value)}
          placeholder={t("monthGoalPlaceholder")}
          enterKeyHint="done"
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void hideKeyboard();
              (e.target as HTMLInputElement).blur();
            }
          }}
          className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground/50"
        />
      )}
    </GoalRowShell>
  );

  const draftRow = (
    <GoalRowShell
      reserveTrail={reserveTrail}
      leading={
        <span className="w-8 h-8 flex items-center justify-center">
          <span className="w-5 h-5 rounded-full border-2 border-muted-foreground/30" />
        </span>
      }
    >
      <input
        ref={draftRef}
        value={draftText}
        onChange={(e) => setDraftText(e.target.value)}
        onBlur={() => {
          // Do NOT cancel empty compose on blur — iOS fires blur when the keyboard
          // opens, which previously unmounted the draft (invisible checkbox/field).
          if (draftText.trim()) commitDraft();
        }}
        enterKeyHint="done"
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commitDraft();
          }
        }}
        placeholder={t("monthGoalPlaceholder")}
        className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground/50"
      />
    </GoalRowShell>
  );

  const body = (
    <div className="flex-1 min-h-0 flex flex-col justify-start gap-1 pt-0.5">
      <div className="min-h-[36px] relative overflow-hidden">
        {prompt ? (
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-center leading-snug">
              {t("setNewGoalPrompt")}
            </p>
            <div className="flex gap-1.5">
              <button
                type="button"
                onClick={() => confirmComplete(true)}
                className="flex-1 rounded-lg bg-accent text-accent-foreground text-xs font-medium py-1.5"
              >
                {t("yes")}
              </button>
              <button
                type="button"
                onClick={() => confirmComplete(false)}
                className="flex-1 rounded-lg bg-secondary text-foreground text-xs font-medium py-1.5"
              >
                {t("no")}
              </button>
            </div>
          </div>
        ) : drafting && composeFrom ? (
          // Full-width panels (not w-1/2 of a 200% flex) — avoids clipped/invisible draft.
          <div className="relative w-full min-h-[36px]">
            <div
              className={cn(
                "w-full transition-transform duration-300 ease-out",
                slideCompose ? "-translate-x-full absolute inset-x-0 top-0" : "relative"
              )}
            >
              {renderGoalRow(composeFrom, { showPlus: true })}
            </div>
            <div
              className={cn(
                "w-full transition-transform duration-300 ease-out",
                slideCompose
                  ? "relative translate-x-0"
                  : "absolute inset-x-0 top-0 translate-x-full"
              )}
            >
              {draftRow}
            </div>
          </div>
        ) : drafting ? (
          draftRow
        ) : showCarousel ? (
          <div
            ref={carouselRef}
            onScroll={onCarouselScroll}
            className="flex overflow-x-auto snap-x snap-mandatory scrollbar-none items-center"
            style={{ WebkitOverflowScrolling: "touch" }}
          >
            {goals.map((g) => (
              <div key={g.id} className="w-full shrink-0 snap-center">
                {renderGoalRow(g, {
                  showPlus: g.completed && !goals.some((x) => !x.completed),
                })}
              </div>
            ))}
          </div>
        ) : active ? (
          renderGoalRow(active)
        ) : goals.length > 0 ? (
          renderGoalRow(goals[goals.length - 1], { showPlus: true })
        ) : null}
      </div>

      {showPager && (
        <PageDots
          count={drafting && composeFrom ? goals.length + 1 : goals.length}
          active={
            drafting && composeFrom
              ? slideCompose
                ? goals.length
                : Math.max(0, goals.findIndex((g) => g.id === composeFrom.id))
              : pageIndex
          }
        />
      )}
    </div>
  );

  return (
    <div
      className="w-full h-full rounded-2xl bg-card/95 backdrop-blur-sm shadow-card border border-border/50 flex flex-col overflow-hidden"
      data-kb-ignore
      data-tutorial="month-goals"
    >
      <div className="flex items-center justify-between px-3 pt-1.5 pb-0.5 shrink-0">
        <p className="text-sm font-semibold">{title}</p>
        <button
          type="button"
          onClick={toggleMinimized}
          className="p-1 text-muted-foreground hover:text-foreground touch-manipulation"
          aria-label="Minimize"
        >
          <ChevronUp className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 min-h-0 px-3 pb-1.5 flex flex-col">{body}</div>
    </div>
  );
}
