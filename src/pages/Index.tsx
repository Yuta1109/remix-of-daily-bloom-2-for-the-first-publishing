import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Clock } from "lucide-react";
import { UserButton } from "@/components/UserButton";
import { DailyTaskSheet, type DailyTaskSheetRequest } from "@/components/plan/DailyTaskSheet";
import { TodoAddMenu, type TodoAddKind } from "@/components/todo/TodoAddMenu";
import { TodoRoutineRow } from "@/components/todo/TodoRoutineRow";
import { TodoSectionHeader } from "@/components/todo/TodoSectionHeader";
import { TodoTaskRow } from "@/components/todo/TodoTaskRow";
import { RoutineSheet, type RoutineSheetRequest } from "@/components/todo/RoutineSheet";
import { RepeatSeriesSheet, type RepeatSeriesSheetRequest } from "@/components/todo/RepeatSeriesSheet";
import { TaskHistorySheet } from "@/components/TaskHistorySheet";
import { ImagePickSheet } from "@/components/ImagePickSheet";
import { OcrBusyOverlay } from "@/components/OcrBusyOverlay";
import { OcrResultSheet } from "@/components/OcrResultSheet";
import { useI18n } from "@/lib/i18n";
import { hideKeyboard, prepareForOcr } from "@/lib/keyboard-avoidance";
import { extractTextFromPickedImage, ocrToastKey, type ImageSource } from "@/lib/ocr";
import { ocrDebugLog } from "@/lib/ocr-debug-log";
import { emitTutorial, isTutorialActive } from "@/lib/tutorial";
import { addDays, formatLocalDate, todayLocalDate } from "@/lib/v3/local-date";
import { ensureLegacyCatchup } from "@/lib/v3/storage";
import {
  completeTask,
  createTask,
  createTaskFromTemplate,
  ensureSeriesOccurrencesForRange,
  getListedTasksForDate,
  getOpenTasksForDate,
  getRoutinesForDate,
  getRoutineCompletions,
  getTaskCompletionRate,
  getTaskTemplates,
  getUpcomingListedTasks,
  getSettings,
  isRoutineCompletedOn,
  setRoutineCompletion,
} from "@/lib/v3/repository";
import {
  TODO_UPCOMING_EXPANDED_DAYS,
  upcomingHorizonDays,
} from "@/lib/v3/todo-view";
import type { RoutineCompletion, RoutineItem, TaskItem, TaskTemplate } from "@/lib/v3/types";

/**
 * ToDo — the execution screen ("what to do now").
 *
 * RoutineItem  → habit, ToDo only, completions in RoutineCompletion
 * TaskItem     → one-time instance, shared with Plan Daily and Calendar
 * TaskSeries   → Repeat Log; occurrences materialize as TaskItems
 */
export default function Index() {
  const { t, locale } = useI18n();
  const navigate = useNavigate();
  const today = todayLocalDate();

  const [todayRoutines, setTodayRoutines] = useState<RoutineItem[]>([]);
  const [completions, setCompletions] = useState<RoutineCompletion[]>([]);
  const [listedTasks, setListedTasks] = useState<TaskItem[]>([]);
  const [upcoming, setUpcoming] = useState<{ date: string; tasks: TaskItem[] }[]>([]);
  const [templates, setTemplates] = useState<TaskTemplate[]>([]);
  const [upcomingExpanded, setUpcomingExpanded] = useState(false);

  const [addOpen, setAddOpen] = useState(false);
  const [taskSheet, setTaskSheet] = useState<DailyTaskSheetRequest | null>(null);
  const [routineSheet, setRoutineSheet] = useState<RoutineSheetRequest | null>(null);
  const [repeatSheet, setRepeatSheet] = useState<RepeatSeriesSheetRequest | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [pickOpen, setPickOpen] = useState(false);
  const [ocrBusy, setOcrBusy] = useState(false);
  const [ocrFeedback, setOcrFeedback] = useState<{
    message: string;
    kind: "info" | "warning";
  } | null>(null);

  const reload = useCallback(() => {
    ensureLegacyCatchup();
    const horizon = upcomingHorizonDays(upcomingExpanded);
    ensureSeriesOccurrencesForRange(today, addDays(today, TODO_UPCOMING_EXPANDED_DAYS));
    setTodayRoutines(getRoutinesForDate(today));
    setCompletions(getRoutineCompletions({ date: today }));
    setListedTasks(getListedTasksForDate(today));
    setUpcoming(getUpcomingListedTasks(today, horizon));
    setTemplates(getSettings().showTaskTemplatesOnTodo ? getTaskTemplates() : []);
  }, [today, upcomingExpanded]);

  useEffect(() => {
    reload();
  }, [reload]);

  useEffect(() => {
    const onCleared = () => reload();
    window.addEventListener("essences-tutorial-data-cleared", onCleared);
    return () => window.removeEventListener("essences-tutorial-data-cleared", onCleared);
  }, [reload]);

  useEffect(() => {
    if (pickOpen || ocrBusy) void hideKeyboard();
  }, [pickOpen, ocrBusy]);

  const openTitles = [
    ...listedTasks.filter((item) => item.status !== "completed").map((item) => item.title),
    ...getOpenTasksForDate(today).map((item) => item.title),
  ];

  const addTaskWithText = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return false;
    if (openTitles.includes(trimmed)) {
      toast(t("alreadyInToday"));
      return false;
    }
    const created = createTask({ title: trimmed, date: today, createdFrom: "todo" });
    reload();
    if (isTutorialActive()) emitTutorial("task-added", { id: created.id });
    return true;
  };

  const addTaskFromTemplate = (template: TaskTemplate) => {
    if (openTitles.includes(template.title)) {
      toast(t("alreadyInToday"));
      return;
    }
    const created = createTaskFromTemplate(template.id, today);
    reload();
    if (isTutorialActive()) emitTutorial("task-added", { id: created.id });
  };

  const bringHistoryTasks = (texts: string[]) => {
    const seen = new Set(
      listedTasks.filter((item) => item.status !== "completed").map((item) => item.title),
    );
    let added = 0;
    for (const text of texts) {
      const trimmed = text.trim();
      if (!trimmed || seen.has(trimmed)) continue;
      seen.add(trimmed);
      createTask({ title: trimmed, date: today, createdFrom: "todo" });
      added += 1;
    }
    if (added === 0) {
      toast(t("alreadyInToday"));
      return;
    }
    reload();
    setHistoryOpen(false);
  };

  const addOcrTasks = (texts: string[]) => {
    const seen = new Set(
      listedTasks.filter((item) => item.status !== "completed").map((item) => item.title),
    );
    let added = 0;
    for (const text of texts) {
      const trimmed = text.trim();
      if (!trimmed || seen.has(trimmed)) continue;
      seen.add(trimmed);
      createTask({ title: trimmed, date: today, createdFrom: "todo" });
      added += 1;
    }
    if (added === 0) {
      toast(t("alreadyInToday"));
      return;
    }
    reload();
  };

  const onOcr = async (source: ImageSource) => {
    if (ocrBusy) return;
    setPickOpen(false);
    setOcrFeedback(null);
    await prepareForOcr();
    setOcrBusy(true);
    let feedback: { message: string; kind: "info" | "warning" } | null = null;
    try {
      const result = await extractTextFromPickedImage("tasks", source);
      if (!result.ok && "error" in result) {
        const key = ocrToastKey(
          result.error,
          "configReason" in result ? result.configReason : undefined,
        );
        if (key) feedback = { message: t(key), kind: "info" };
      } else if (!("tasks" in result) || !result.tasks?.length) {
        feedback = { message: t("ocrEmpty"), kind: "info" };
      } else {
        addOcrTasks(result.tasks);
        if (result.lowConfidence) {
          feedback = { message: t("ocrLowConfidence"), kind: "warning" };
        }
      }
    } catch {
      feedback = { message: t("ocrGeneric"), kind: "info" };
    } finally {
      setOcrBusy(false);
    }
    if (feedback) {
      ocrDebugLog("ocr", `feedback kind=${feedback.kind} msg=${feedback.message.slice(0, 80)}`, "info");
      setOcrFeedback(feedback);
    }
  };

  const toggleTask = (task: TaskItem) => {
    const nextCompleted = task.status !== "completed";
    completeTask(task.id, nextCompleted);
    if (nextCompleted && getTaskCompletionRate(today) === 100 && !isTutorialActive()) {
      toast(t("allTasksComplete"));
    }
    reload();
    if (isTutorialActive()) emitTutorial("task-toggled", { id: task.id });
  };

  const openTask = (task: TaskItem) => {
    setTaskSheet({ mode: "edit", taskId: task.id });
    if (isTutorialActive()) emitTutorial("task-selected", { id: task.id });
  };

  const toggleRoutine = (routine: RoutineItem) => {
    const done = isRoutineCompletedOn(routine.id, today);
    setRoutineCompletion(routine.id, today, !done);
    reload();
  };

  const onPickAdd = (kind: TodoAddKind) => {
    if (kind === "task") setTaskSheet({ mode: "create", date: today, createdFrom: "todo" });
    if (kind === "routine") setRoutineSheet({ mode: "create" });
    if (kind === "repeat") setRepeatSheet({ mode: "create" });
  };

  const listedCount = listedTasks.length;
  const completedCount = listedTasks.filter((task) => task.status === "completed").length;
  const completionLabel =
    listedCount === 0 ? undefined : `${completedCount}/${listedCount}`;
  const routineDone = todayRoutines.filter((r) =>
    completions.some((c) => c.routineId === r.id && c.completed),
  ).length;

  return (
    <div className="app-shell-page">
      <div className="app-shell-header px-4 pb-2">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-[28px] font-bold tracking-tight leading-tight">
            {t("todoPageTitle")}
          </h1>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setHistoryOpen(true)}
              aria-label={t("todoTaskHistoryAria")}
              data-testid="todo-history"
              className="inline-flex items-center justify-center w-9 h-9 rounded-full text-foreground/70 hover:text-foreground hover:bg-secondary/70"
            >
              <Clock className="w-5 h-5" strokeWidth={1.75} aria-hidden="true" />
            </button>
            <UserButton />
          </div>
        </div>
      </div>

      <div className="app-shell-scroll px-4 space-y-3" data-tutorial="todo-layout">
        <section
          aria-labelledby="todo-routine-heading"
          className="rounded-2xl bg-card shadow-soft px-3 pb-3"
          data-testid="todo-routine-section"
        >
          <TodoSectionHeader
            id="todo-routine-heading"
            title={t("todoSectionRoutine")}
            accessory={
              todayRoutines.length
                ? t("todoRoutineSummary")
                    .replace("{done}", String(routineDone))
                    .replace("{total}", String(todayRoutines.length))
                : undefined
            }
          />
          {todayRoutines.length ? (
            todayRoutines.map((routine) => (
              <TodoRoutineRow
                key={routine.id}
                routine={routine}
                completed={completions.some((c) => c.routineId === routine.id && c.completed)}
                onToggle={() => toggleRoutine(routine)}
                onEdit={() => setRoutineSheet({ mode: "edit", routineId: routine.id })}
              />
            ))
          ) : (
            <p className="px-1 py-2 text-sm text-muted-foreground">{t("todoRoutineNoneToday")}</p>
          )}
          <button
            type="button"
            onClick={() => navigate("/todo/routines")}
            className="mt-1 px-1 py-2 text-[15px] font-medium text-accent"
            data-testid="todo-routine-list-edit"
          >
            {t("todoRoutineListEdit")}
          </button>
        </section>

        <section
          aria-labelledby="todo-tasks-heading"
          className="rounded-2xl bg-card shadow-soft px-3 pb-3"
          data-testid="todo-task-section"
        >
          <TodoSectionHeader
            id="todo-tasks-heading"
            title={t("todoSectionTasks")}
            accessory={completionLabel}
          />

          {templates.length > 0 ? (
            <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-none">
              {templates.map((template) => (
                <button
                  key={template.id}
                  type="button"
                  onClick={() => addTaskFromTemplate(template)}
                  className="flex-shrink-0 text-sm px-3 py-1.5 rounded-full bg-secondary/60"
                >
                  {template.title}
                </button>
              ))}
            </div>
          ) : null}

          <div data-tutorial="task-list">
            {listedTasks.length ? (
              listedTasks.map((task) => (
                <TodoTaskRow
                  key={task.id}
                  task={task}
                  onToggle={() => toggleTask(task)}
                  onPress={() => openTask(task)}
                />
              ))
            ) : (
              <p className="px-1 py-6 text-sm text-muted-foreground">{t("todoTasksEmpty")}</p>
            )}
          </div>

          <button
            type="button"
            onClick={() => {
              if (isTutorialActive()) {
                setTaskSheet({ mode: "create", date: today, createdFrom: "todo" });
                return;
              }
              setAddOpen(true);
            }}
            className="mt-1 mb-1 px-1 py-2 text-[15px] font-medium text-accent"
            data-tutorial="todo-add"
          >
            + {t("todoAdd")}
          </button>
        </section>

        <section
          aria-labelledby="todo-upcoming-heading"
          className="rounded-2xl bg-card shadow-soft px-3 pb-3"
          data-testid="todo-upcoming-section"
        >
          <TodoSectionHeader id="todo-upcoming-heading" title={t("todoSectionUpcoming")} />
          {upcoming.length ? (
            upcoming.map((group) => (
              <div key={group.date} className="mb-3">
                <p className="px-1 pt-1 pb-0.5 text-[13px] font-semibold text-muted-foreground">
                  {formatLocalDate(group.date, locale, { month: "short", day: "numeric" })}
                </p>
                {group.tasks.map((task) => (
                  <TodoTaskRow
                    key={task.id}
                    task={task}
                    onToggle={() => toggleTask(task)}
                    onPress={() => openTask(task)}
                  />
                ))}
              </div>
            ))
          ) : (
            <p className="px-1 py-2 text-sm text-muted-foreground">{t("todoUpcomingEmpty")}</p>
          )}
          <button
            type="button"
            onClick={() => setUpcomingExpanded((value) => !value)}
            className="px-1 py-2 text-[15px] font-medium text-accent"
          >
            {upcomingExpanded ? t("todoShowLessUpcoming") : t("todoSeeAllUpcoming")}
          </button>
        </section>

        <div className="h-20" aria-hidden="true" />
      </div>

      <TodoAddMenu
        open={addOpen}
        onOpenChange={setAddOpen}
        onPick={onPickAdd}
        onScan={
          isTutorialActive()
            ? undefined
            : () => {
                void prepareForOcr();
                setPickOpen(true);
              }
        }
      />

      <DailyTaskSheet
        request={taskSheet}
        onOpenChange={(open) => {
          if (!open) setTaskSheet(null);
        }}
        onSaved={(task) => {
          reload();
          if (isTutorialActive()) emitTutorial("task-added", { id: task.id });
        }}
        onChanged={reload}
        onEditSeries={(seriesId) => setRepeatSheet({ mode: "edit", seriesId })}
      />
      <RoutineSheet
        request={routineSheet}
        onOpenChange={(open) => {
          if (!open) setRoutineSheet(null);
        }}
        onSaved={() => reload()}
        onChanged={reload}
      />
      <RepeatSeriesSheet
        request={repeatSheet}
        onOpenChange={(open) => {
          if (!open) setRepeatSheet(null);
        }}
        onSaved={() => reload()}
        onChanged={reload}
      />
      <TaskHistorySheet
        open={historyOpen}
        todayKey={today}
        onOpenChange={setHistoryOpen}
        onBringTasks={bringHistoryTasks}
      />
      <ImagePickSheet
        open={pickOpen}
        onPhotos={() => void onOcr("photos")}
        onCamera={() => void onOcr("camera")}
        onCancel={() => setPickOpen(false)}
      />
      <OcrBusyOverlay open={ocrBusy} />
      <OcrResultSheet
        open={!!ocrFeedback}
        message={ocrFeedback?.message ?? ""}
        kind={ocrFeedback?.kind}
        onClose={() => setOcrFeedback(null)}
      />
    </div>
  );
}
