import { useState, useEffect, useCallback, type KeyboardEvent } from "react";
import { Plus, Flame, Target, Calendar } from "lucide-react";
import { toast } from "sonner";
import { TaskItem } from "@/components/TaskItem";
import {
  getDayData,
  saveDayData,
  getDateKey,
  getStreak,
  getCompletionRate,
  getAllData,
} from "@/lib/store";
import { loadReusable, type ReusableTask } from "@/lib/reusable-tasks";
import { useI18n } from "@/lib/i18n";
import { InsetScrollArea } from "@/components/InsetScrollArea";
import { hideKeyboard, scrollInputAboveKeyboard } from "@/lib/keyboard-avoidance";
import { emitTutorial, isTutorialActive } from "@/lib/tutorial";
import type { DayData, Task } from "@/lib/store";

export default function Index() {
  const { t, formatDate } = useI18n();
  const today = getDateKey(new Date());
  const [dayData, setDayData] = useState<DayData>({ tasks: [], reflection: "" });
  const [newTask, setNewTask] = useState("");
  const [reusable, setReusable] = useState<ReusableTask[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const streak = getStreak();
  const completion = getCompletionRate(dayData);
  const totalActiveDays = Object.values(getAllData()).filter((d) => d.tasks.length > 0).length;

  useEffect(() => {
    setDayData(getDayData(today));
    setReusable(loadReusable());
  }, [today]);

  const persist = useCallback(
    (updated: DayData) => {
      setDayData(updated);
      saveDayData(today, updated);
    },
    [today]
  );

  const addTaskWithText = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return false;
    if (dayData.tasks.some((t) => t.text === trimmed && !t.completed)) {
      toast(t("alreadyInToday"));
      return false;
    }
    const task: Task = { id: crypto.randomUUID(), text: trimmed, completed: false, date: today };
    persist({ ...dayData, tasks: [...dayData.tasks, task] });
    if (isTutorialActive()) emitTutorial("task-added", { id: task.id });
    return true;
  };

  const finishNewTask = () => {
    if (!newTask.trim()) return;
    addTaskWithText(newTask);
    setNewTask("");
    void hideKeyboard();
  };

  const onAddKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    finishNewTask();
  };

  const toggleTask = (id: string) => {
    const task = dayData.tasks.find((t) => t.id === id);
    const updated = {
      ...dayData,
      tasks: dayData.tasks.map((t) => (t.id === id ? { ...t, completed: !t.completed } : t)),
    };
    persist(updated);
    if (task && !task.completed && getCompletionRate(updated) === 100) {
      toast(t("allTasksComplete"));
    }
  };

  const deleteTask = (id: string) => {
    persist({ ...dayData, tasks: dayData.tasks.filter((t) => t.id !== id) });
    if (selectedId === id) setSelectedId(null);
  };

  const editTask = (id: string, text: string) => {
    persist({
      ...dayData,
      tasks: dayData.tasks.map((t) => (t.id === id ? { ...t, text } : t)),
    });
  };

  const now = new Date();

  return (
    <div className="page-shell px-3" onClick={() => setSelectedId(null)}>
      <div className="shrink-0 pb-2" onClick={(e) => e.stopPropagation()}>
        <div
          className="bg-card rounded-3xl p-4 shadow-card animate-fade-in-up"
          data-tutorial="today-stats"
        >
          <div className="mb-3">
            <p className="text-muted-foreground text-xs font-medium uppercase tracking-wider">
              {formatDate(now, { weekday: "long" })}
            </p>
            <h1 className="text-2xl font-bold tracking-tight mt-0.5">
              {formatDate(now, { month: "long", day: "numeric" })}
            </h1>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-secondary/60 rounded-2xl p-3 text-center">
              <div className="flex items-center justify-center text-streak mb-0.5">
                <Flame className="w-4 h-4" />
              </div>
              <p className="text-xl font-bold">{streak}</p>
              <p className="text-[10px] text-muted-foreground font-medium">{t("streak")}</p>
            </div>
            <div className="bg-secondary/60 rounded-2xl p-3 text-center">
              <div className="flex items-center justify-center text-accent mb-0.5">
                <Target className="w-4 h-4" />
              </div>
              <p className="text-xl font-bold">{completion}%</p>
              <p className="text-[10px] text-muted-foreground font-medium">{t("todayLabel")}</p>
            </div>
            <div className="bg-secondary/60 rounded-2xl p-3 text-center">
              <div className="flex items-center justify-center text-success mb-0.5">
                <Calendar className="w-4 h-4" />
              </div>
              <p className="text-xl font-bold">{totalActiveDays}</p>
              <p className="text-[10px] text-muted-foreground font-medium">{t("days")}</p>
            </div>
          </div>
        </div>

        {reusable.length > 0 && (
          <div className="mt-3 animate-fade-in-up" style={{ animationDelay: "0.05s" }}>
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider mb-2 px-1">
              {t("quickAdd")}
            </p>
            <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
              {reusable.map((r) => (
                <button
                  key={r.id}
                  onClick={() => addTaskWithText(r.text)}
                  className="flex-shrink-0 flex items-center gap-1 bg-secondary/60 hover:bg-secondary text-sm px-3 py-1.5 rounded-full transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" strokeWidth={2.5} />
                  {r.text}
                </button>
              ))}
            </div>
          </div>
        )}

        <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider mt-3 mb-0.5 px-1">
          {t("todaysTasks")}
        </p>
      </div>

      <div className="flex-1 min-h-0" onClick={(e) => e.stopPropagation()}>
        <div className="h-full bg-card rounded-2xl shadow-soft flex flex-col overflow-hidden">
          <InsetScrollArea contentClassName="px-3 py-3" inset={16}>
            {dayData.tasks.length > 0 ? (
              <div className="space-y-2">
                {dayData.tasks.map((task) => (
                  <TaskItem
                    key={task.id}
                    task={task}
                    selected={selectedId === task.id}
                    onSelect={setSelectedId}
                    onToggle={toggleTask}
                    onDelete={deleteTask}
                    onEdit={editTask}
                  />
                ))}
              </div>
            ) : (
              <div className="text-center py-10 text-muted-foreground">
                <p className="text-base font-medium mb-1">{t("startYourDay")}</p>
                <p className="text-sm opacity-60">{t("tapPlusHint")}</p>
              </div>
            )}
          </InsetScrollArea>
        </div>
      </div>

      {/* Fixed add row (like Settings reusable tasks), clear of the tab bar. */}
      <div
        className="shrink-0 pt-2.5 pb-3"
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="flex items-center gap-2"
          data-tutorial="quick-add"
        >
          <input
            value={newTask}
            onChange={(e) => setNewTask(e.target.value)}
            onFocus={(e) => scrollInputAboveKeyboard(e.currentTarget)}
            enterKeyHint="done"
            onKeyDown={onAddKeyDown}
            placeholder={t("whatNeedsDone")}
            className="flex-1 bg-card rounded-xl px-4 py-2.5 text-base outline-none shadow-soft placeholder:text-muted-foreground/50"
          />
          <button
            type="button"
            onClick={finishNewTask}
            className="bg-accent text-accent-foreground rounded-xl px-4 py-2.5 text-sm font-medium flex items-center gap-1 hover:opacity-90 transition-opacity"
          >
            <Plus className="w-4 h-4" strokeWidth={2.5} />
            {t("add")}
          </button>
        </div>
      </div>
    </div>
  );
}
