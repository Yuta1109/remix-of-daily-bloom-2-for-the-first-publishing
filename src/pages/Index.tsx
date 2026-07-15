import { useState, useEffect, useCallback } from "react";
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
import type { DayData, Task } from "@/lib/store";

export default function Index() {
  const { t, formatDate } = useI18n();
  const today = getDateKey(new Date());
  const [dayData, setDayData] = useState<DayData>({ tasks: [], reflection: "" });
  const [newTask, setNewTask] = useState("");
  const [showInput, setShowInput] = useState(false);
  const [reusable, setReusable] = useState<ReusableTask[]>([]);
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
    if (!trimmed) return;
    if (dayData.tasks.some((t) => t.text === trimmed && !t.completed)) {
      toast(t("alreadyInToday"));
      return;
    }
    const task: Task = { id: crypto.randomUUID(), text: trimmed, completed: false, date: today };
    persist({ ...dayData, tasks: [...dayData.tasks, task] });
  };

  const addTask = () => {
    addTaskWithText(newTask);
    setNewTask("");
    setShowInput(false);
  };

  const toggleTask = (id: string) => {
    const task = dayData.tasks.find((t) => t.id === id);
    const updated = {
      ...dayData,
      tasks: dayData.tasks.map((t) => (t.id === id ? { ...t, completed: !t.completed } : t)),
    };
    persist(updated);
    if (task && !task.completed) {
      if (getCompletionRate(updated) === 100) toast(t("allTasksComplete"));
    }
  };

  const deleteTask = (id: string) => {
    persist({ ...dayData, tasks: dayData.tasks.filter((t) => t.id !== id) });
  };

  const now = new Date();

  return (
    <div className="page-shell">
      {/* ── Scrollable content area ─────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto scrollbar-none px-3 pt-6">

        {/* Stats card */}
        <div className="bg-card rounded-3xl p-5 shadow-card mb-5 animate-fade-in-up">
          <div className="mb-4">
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

        {/* Quick-add chips */}
        {reusable.length > 0 && (
          <div className="mb-4 animate-fade-in-up" style={{ animationDelay: "0.05s" }}>
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider mb-2 px-1">
              {t("quickAdd")}
            </p>
            <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-none">
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

        {/* Task list header */}
        <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider mb-2 px-1 animate-fade-in-up" style={{ animationDelay: "0.1s" }}>
          {t("todaysTasks")}
        </p>
      </div>

      {/* ── Task list (scrollable) ──────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto scrollbar-app px-3 min-h-0">
        <div className="space-y-0 divide-y divide-border/40">
          {dayData.tasks.map((task) => (
            <TaskItem key={task.id} task={task} onToggle={toggleTask} onDelete={deleteTask} />
          ))}
        </div>

        {dayData.tasks.length === 0 && !showInput && (
          <div className="text-center py-10 text-muted-foreground">
            <p className="text-base font-medium mb-1">{t("startYourDay")}</p>
            <p className="text-sm opacity-60">{t("tapPlusHint")}</p>
          </div>
        )}

        {showInput && (
          <div className="animate-fade-in-up">
            <input
              autoFocus
              value={newTask}
              onChange={(e) => setNewTask(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addTask()}
              onBlur={() => !newTask && setShowInput(false)}
              placeholder={t("whatNeedsDone")}
              className="w-full bg-transparent py-3 px-1 outline-none placeholder:text-muted-foreground/40 border-b border-border"
            />
          </div>
        )}

        {/* Bottom spacer so last item isn't flush against scrollbar end */}
        <div className="h-4" />
      </div>

      {/* FAB */}
      <button
        onClick={() => setShowInput(true)}
        className="fixed bottom-24 right-6 w-14 h-14 rounded-full bg-accent text-accent-foreground shadow-float flex items-center justify-center transition-all hover:scale-110 active:scale-95 z-40"
      >
        <Plus className="w-6 h-6" strokeWidth={2.5} />
      </button>
    </div>
  );
}
