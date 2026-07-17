import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { Check, ChevronDown, ChevronUp, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";
import {
  loadMonthGoals,
  saveMonthGoals,
  type MonthGoal,
  type MonthGoalsBundle,
} from "@/lib/month-goals";
import { hideKeyboard } from "@/lib/keyboard-avoidance";

interface Props {
  monthKey: string;
  onMinimizedChange?: (minimized: boolean) => void;
  /** Increment to force-minimize (calendar scroll / event sheets). */
  collapseSignal?: number;
}

type PromptState = { goalId: string } | null;

function PageDots({
  count,
  active,
}: {
  count: number;
  active: number;
}) {
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

export function MonthGoalsCard({
  monthKey,
  onMinimizedChange,
  collapseSignal = 0,
}: Props) {
  const { t } = useI18n();
  const [bundle, setBundle] = useState<MonthGoalsBundle>(() =>
    loadMonthGoals(monthKey)
  );
  const [prompt, setPrompt] = useState<PromptState>(null);
  const [draftText, setDraftText] = useState("");
  const [composing, setComposing] = useState(false);
  const [slideCompose, setSlideCompose] = useState(false);
  const [pageIndex, setPageIndex] = useState(0);
  const carouselRef = useRef<HTMLDivElement>(null);
  const draftRef = useRef<HTMLInputElement>(null);
  const focusDraftAfter = useRef(false);
  const lastCollapse = useRef(0);
  const slideFromGoalRef = useRef<MonthGoal | null>(null);

  useEffect(() => {
    const next = loadMonthGoals(monthKey);
    setBundle(next);
    onMinimizedChange?.(next.minimized);
    setPrompt(null);
    setComposing(false);
    setSlideCompose(false);
    setDraftText("");
    slideFromGoalRef.current = null;
  }, [monthKey, onMinimizedChange]);

  const persist = useCallback(
    (next: MonthGoalsBundle) => {
      setBundle(next);
      saveMonthGoals(monthKey, next);
      onMinimizedChange?.(next.minimized);
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
      return next;
    });
  }, [collapseSignal, monthKey, onMinimizedChange]);

  const goals = bundle.goals;
  const completedCount = goals.filter((g) => g.completed).length;
  const active = goals.find((g) => !g.completed) ?? null;
  const showCarousel = goals.length >= 2 && !composing && !prompt;
  const drafting = !prompt && (composing || goals.length === 0);
  const fromGoal = slideFromGoalRef.current;
  /** Page control when 2+ goals, or while sliding in a new goal after history. */
  const showPager =
    !prompt && (goals.length >= 2 || (!!fromGoal && drafting && goals.length >= 1));

  useLayoutEffect(() => {
    if (!showCarousel || !carouselRef.current) return;
    const idx = goals.findIndex((g) => !g.completed);
    const target = idx >= 0 ? idx : Math.max(0, goals.length - 1);
    const el = carouselRef.current;
    el.scrollTo({ left: target * el.clientWidth, behavior: "auto" });
    setPageIndex(target);
  }, [monthKey, showCarousel, goals]);

  useEffect(() => {
    if (!focusDraftAfter.current) return;
    focusDraftAfter.current = false;
    const t = window.setTimeout(() => draftRef.current?.focus(), 220);
    return () => clearTimeout(t);
  }, [composing, drafting, slideCompose]);

  const startCompose = (from?: MonthGoal | null) => {
    slideFromGoalRef.current = from ?? null;
    setComposing(true);
    setDraftText("");
    focusDraftAfter.current = true;
    if (bundle.minimized) persist({ ...bundle, minimized: false });
    if (from) {
      setSlideCompose(false);
      setPageIndex(goals.length); // new page after existing goals
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
      setComposing(false);
      setSlideCompose(false);
      slideFromGoalRef.current = null;
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
    slideFromGoalRef.current = null;
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
        onClick={toggleMinimized}
        className="w-full rounded-2xl bg-card/95 backdrop-blur-sm shadow-card border border-border/50 px-4 py-2.5 flex items-center justify-between gap-2 text-left"
      >
        <div className="min-w-0">
          <p className="text-sm font-semibold">{t("monthGoals")}</p>
          <p className="text-xs text-muted-foreground truncate">
            {t("goalsCompletedCount").replace("{n}", String(completedCount))}
          </p>
        </div>
        <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
      </button>
    );
  }

  const renderGoalRow = (goal: MonthGoal, opts?: { showPlus?: boolean }) => {
    const done = goal.completed;
    return (
      <div className="flex items-center gap-2 min-h-[36px]">
        <button
          type="button"
          disabled={done}
          onClick={() => onCheckActive(goal)}
          aria-label={done ? "Completed" : "Mark complete"}
          className="flex-shrink-0 w-8 h-8 flex items-center justify-center touch-manipulation"
        >
          <span
            className={cn(
              "w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors",
              done ? "bg-accent border-accent" : "border-muted-foreground/30"
            )}
          >
            {done && (
              <Check className="w-3 h-3 text-accent-foreground" strokeWidth={3} />
            )}
          </span>
        </button>

        {done ? (
          <p className="flex-1 min-w-0 text-sm line-through text-muted-foreground truncate">
            {goal.text}
          </p>
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
            className="flex-1 min-w-0 bg-transparent text-sm outline-none placeholder:text-muted-foreground/50"
          />
        )}

        {opts?.showPlus && done && (
          <button
            type="button"
            onClick={() => startCompose(goal)}
            aria-label={t("add")}
            className="flex-shrink-0 w-8 h-8 rounded-full bg-accent text-accent-foreground flex items-center justify-center touch-manipulation"
          >
            <Plus className="w-3.5 h-3.5" strokeWidth={2.5} />
          </button>
        )}
      </div>
    );
  };

  const draftRow = (
    <div className="flex items-center gap-2 min-h-[36px]">
      <span className="flex-shrink-0 w-8 h-8 flex items-center justify-center">
        <span className="w-5 h-5 rounded-full border-2 border-muted-foreground/30" />
      </span>
      <input
        ref={draftRef}
        value={draftText}
        onChange={(e) => setDraftText(e.target.value)}
        onBlur={() => {
          if (draftText.trim()) commitDraft();
          else if (goals.length > 0) {
            setComposing(false);
            setSlideCompose(false);
            slideFromGoalRef.current = null;
          }
        }}
        enterKeyHint="done"
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commitDraft();
          }
        }}
        placeholder={t("monthGoalPlaceholder")}
        className="flex-1 min-w-0 bg-transparent text-sm outline-none placeholder:text-muted-foreground/50"
      />
    </div>
  );

  /** Fixed body layout so rows don't jump when focusing / paging. */
  const body = (
    <div className="flex-1 min-h-0 flex flex-col justify-start gap-1 pt-0.5">
      <div className="min-h-[36px] flex flex-col justify-center">
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
        ) : drafting && fromGoal ? (
          <div className="overflow-hidden w-full">
            <div
              className="flex w-[200%] transition-transform duration-300 ease-out"
              style={{
                transform: slideCompose ? "translateX(-50%)" : "translateX(0%)",
              }}
            >
              <div className="w-1/2 shrink-0 pr-1">
                {renderGoalRow(fromGoal, { showPlus: true })}
              </div>
              <div className="w-1/2 shrink-0 pl-1">{draftRow}</div>
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

      {/* Same slot as carousel pager — keeps rows from shifting when editing. */}
      {showPager && (
        <PageDots
          count={drafting && fromGoal ? goals.length + 1 : goals.length}
          active={
            drafting && fromGoal
              ? slideCompose
                ? goals.length
                : Math.max(0, goals.findIndex((g) => g.id === fromGoal.id))
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
    >
      <div className="flex items-center justify-between px-3 pt-1.5 pb-0.5 shrink-0">
        <p className="text-sm font-semibold">{t("monthGoals")}</p>
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
