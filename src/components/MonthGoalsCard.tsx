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
}

type PromptState = { goalId: string } | null;

export function MonthGoalsCard({ monthKey, onMinimizedChange }: Props) {
  const { t } = useI18n();
  const [bundle, setBundle] = useState<MonthGoalsBundle>(() =>
    loadMonthGoals(monthKey)
  );
  const [prompt, setPrompt] = useState<PromptState>(null);
  const [draftText, setDraftText] = useState("");
  const [composing, setComposing] = useState(false);
  const carouselRef = useRef<HTMLDivElement>(null);
  const draftRef = useRef<HTMLInputElement>(null);
  const focusDraftAfter = useRef(false);

  useEffect(() => {
    const next = loadMonthGoals(monthKey);
    setBundle(next);
    onMinimizedChange?.(next.minimized);
    setPrompt(null);
    setComposing(false);
    setDraftText("");
  }, [monthKey, onMinimizedChange]);

  const persist = useCallback(
    (next: MonthGoalsBundle) => {
      setBundle(next);
      saveMonthGoals(monthKey, next);
      onMinimizedChange?.(next.minimized);
    },
    [monthKey, onMinimizedChange]
  );

  const goals = bundle.goals;
  const completedCount = goals.filter((g) => g.completed).length;
  const active = goals.find((g) => !g.completed) ?? null;
  const showCarousel = goals.length >= 2 && !composing && !prompt;
  // Empty month or explicit compose (+ / after complete→yes).
  const drafting = !prompt && (composing || goals.length === 0);

  useLayoutEffect(() => {
    if (!showCarousel || !carouselRef.current) return;
    const idx = goals.findIndex((g) => !g.completed);
    const target = idx >= 0 ? idx : Math.max(0, goals.length - 1);
    const el = carouselRef.current;
    el.scrollTo({ left: target * el.clientWidth, behavior: "auto" });
  }, [monthKey, showCarousel, goals]);

  useEffect(() => {
    if (!focusDraftAfter.current) return;
    focusDraftAfter.current = false;
    requestAnimationFrame(() => draftRef.current?.focus());
  }, [composing, drafting]);

  const startCompose = () => {
    setComposing(true);
    setDraftText("");
    focusDraftAfter.current = true;
    if (bundle.minimized) persist({ ...bundle, minimized: false });
  };

  const commitDraft = () => {
    const text = draftText.trim();
    if (!text) {
      setComposing(false);
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
    persist({ ...bundle, goals: marked, minimized: false });
    setPrompt(null);
    if (setNew) startCompose();
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
      <div className="flex items-center gap-2.5 min-h-[40px]">
        <button
          type="button"
          disabled={done}
          onClick={() => onCheckActive(goal)}
          aria-label={done ? "Completed" : "Mark complete"}
          className="flex-shrink-0 w-9 h-9 flex items-center justify-center touch-manipulation"
        >
          <span
            className={cn(
              "w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors",
              done ? "bg-accent border-accent" : "border-muted-foreground/30"
            )}
          >
            {done && (
              <Check className="w-3.5 h-3.5 text-accent-foreground" strokeWidth={3} />
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
            onClick={startCompose}
            aria-label={t("add")}
            className="flex-shrink-0 w-9 h-9 rounded-full bg-accent text-accent-foreground flex items-center justify-center touch-manipulation"
          >
            <Plus className="w-4 h-4" strokeWidth={2.5} />
          </button>
        )}
      </div>
    );
  };

  return (
    <div className="w-full h-full rounded-2xl bg-card/95 backdrop-blur-sm shadow-card border border-border/50 flex flex-col overflow-hidden">
      <div className="flex items-center justify-between px-3.5 pt-2 pb-1 shrink-0">
        <p className="text-sm font-semibold">{t("monthGoals")}</p>
        <button
          type="button"
          onClick={toggleMinimized}
          className="p-1.5 text-muted-foreground hover:text-foreground touch-manipulation"
          aria-label="Minimize"
        >
          <ChevronUp className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 min-h-0 px-3.5 pb-2 flex flex-col justify-center">
        {prompt ? (
          <div className="space-y-2">
            <p className="text-sm font-medium text-center leading-snug">
              {t("setNewGoalPrompt")}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => confirmComplete(true)}
                className="flex-1 rounded-xl bg-accent text-accent-foreground text-sm font-medium py-2"
              >
                {t("yes")}
              </button>
              <button
                type="button"
                onClick={() => confirmComplete(false)}
                className="flex-1 rounded-xl bg-secondary text-foreground text-sm font-medium py-2"
              >
                {t("no")}
              </button>
            </div>
          </div>
        ) : drafting ? (
          <div className="flex items-center gap-2.5">
            <span className="flex-shrink-0 w-9 h-9 flex items-center justify-center">
              <span className="w-6 h-6 rounded-full border-2 border-muted-foreground/30" />
            </span>
            <input
              ref={draftRef}
              value={draftText}
              onChange={(e) => setDraftText(e.target.value)}
              onBlur={() => {
                if (draftText.trim()) commitDraft();
                else if (goals.length > 0) setComposing(false);
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
        ) : showCarousel ? (
          <div
            ref={carouselRef}
            className="flex overflow-x-auto snap-x snap-mandatory scrollbar-none h-full items-center"
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
    </div>
  );
}
