import { useEffect, useRef, useState } from "react";
import { Drawer as DrawerPrimitive } from "vaul";
import { X } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { setOverlayChrome } from "@/lib/overlay-chrome";
import { isTutorialActive } from "@/lib/tutorial";
import { PlanIconPicker } from "@/components/plan/PlanIconPicker";
import { PlanColorPicker } from "@/components/plan/PlanColorPicker";
import { TaskCompletionControl } from "@/components/TaskCompletionControl";
import { getThemeAccentOption, type ThemeAccentId } from "@/lib/theme-accent";
import { DEFAULT_COLOR, DEFAULT_TASK_ICON } from "@/lib/v3/schema";
import {
  RepositoryError,
  archiveTask,
  breakdownWeeklyToTask,
  completeTask,
  convertQuickMemoToTask,
  createTask,
  getPlanItem,
  getPlanItemsForPeriod,
  getTask,
  getTaskSeriesById,
  moveTaskToDate,
  stopTaskSeries,
  updateTask,
} from "@/lib/v3/repository";
import { describeRecurrence } from "@/lib/v3/task-recurrence";
import type { LocalDate } from "@/lib/v3/local-date";
import type { CreatedFromTask, PlanItem, TaskItem } from "@/lib/v3/types";

export interface DailyTaskSheetRequest {
  mode: "create" | "edit";
  /** Create: the pre-filled date of the Daily view (never silently today). */
  date?: LocalDate;
  /** Edit mode only. */
  taskId?: string;
  /** Set when creating from Weekly → Daily Breakdown. */
  parentPlanId?: string;
  /**
   * Breakdown stays open after each save so several Daily Tasks can be
   * created from the same Weekly Plan without restarting the flow.
   */
  repeatable?: boolean;
  /** Create only. Calendar passes `"calendar"`; Daily / breakdown default to `"plan"`. ToDo passes `"todo"`. */
  createdFrom?: CreatedFromTask;
  /** Prefill when converting a Quick Memo. */
  draft?: { title?: string; note?: string; icon?: string; color?: string };
  /** When set, save uses convertQuickMemoToTask (idempotent, keeps the memo). */
  quickMemoId?: string;
}

interface Props {
  request: DailyTaskSheetRequest | null;
  onOpenChange: (open: boolean) => void;
  onSaved: (task: TaskItem) => void;
  onChanged: () => void;
  /** Opens the Repeat Log editor for this occurrence's TaskSeries. */
  onEditSeries?: (seriesId: string) => void;
}

/**
 * Create / edit sheet for Daily TaskItems. Writes go only through the V3
 * repository — this component holds form state, not persisted task state.
 */
export function DailyTaskSheet({
  request,
  onOpenChange,
  onSaved,
  onChanged,
  onEditSeries,
}: Props) {
  const { t, formatDateStr, locale } = useI18n();

  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [iconId, setIconId] = useState(DEFAULT_TASK_ICON);
  const [colorId, setColorId] = useState(DEFAULT_COLOR);
  const [date, setDate] = useState("");
  const [allDay, setAllDay] = useState(true);
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [parentPlanId, setParentPlanId] = useState<string | undefined>(undefined);
  const [titleError, setTitleError] = useState(false);
  const [duplicateError, setDuplicateError] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmStopRepeat, setConfirmStopRepeat] = useState(false);

  const [editItem, setEditItem] = useState<TaskItem | null>(null);
  const [parentItem, setParentItem] = useState<PlanItem | null>(null);
  const [weeklyChoices, setWeeklyChoices] = useState<PlanItem[]>([]);
  const submittingRef = useRef(false);
  const parentLockedRef = useRef(false);

  const open = !!request;
  const [activeRequest, setActiveRequest] = useState<DailyTaskSheetRequest | null>(null);
  useEffect(() => {
    if (request) setActiveRequest(request);
  }, [request]);

  useEffect(() => {
    if (!request) return;

    if (request.mode === "edit" && request.taskId) {
      const item = getTask(request.taskId) ?? null;
      setEditItem(item);
      setParentItem(item?.parentPlanId ? getPlanItem(item.parentPlanId) ?? null : null);
      parentLockedRef.current = false;
      setTitle(item?.title ?? "");
      setNote(item?.note ?? "");
      setIconId(item?.icon ?? DEFAULT_TASK_ICON);
      setColorId(item?.color ?? DEFAULT_COLOR);
      setDate(item?.date ?? "");
      setAllDay(item?.allDay ?? true);
      setStartTime(item?.startTime ?? "");
      setEndTime(item?.endTime ?? "");
      setParentPlanId(item?.parentPlanId);
    } else {
      const parent = request.parentPlanId ? getPlanItem(request.parentPlanId) ?? null : null;
      setEditItem(null);
      setParentItem(parent);
      parentLockedRef.current = !!request.parentPlanId;
      setTitle(request.draft?.title ?? "");
      setNote(request.draft?.note ?? "");
      setIconId(request.draft?.icon ?? parent?.icon ?? DEFAULT_TASK_ICON);
      setColorId(request.draft?.color ?? parent?.color ?? DEFAULT_COLOR);
      setDate(request.date ?? "");
      setAllDay(true);
      setStartTime("");
      setEndTime("");
      setParentPlanId(request.parentPlanId);
    }
    setTitleError(false);
    setDuplicateError(false);
    setConfirmDelete(false);
    setConfirmStopRepeat(false);
    submittingRef.current = false;
  }, [request]);

  useEffect(() => {
    if (!open || !date) {
      setWeeklyChoices([]);
      return;
    }
    setWeeklyChoices(getPlanItemsForPeriod("weekly", date, date));
  }, [open, date]);

  useEffect(() => {
    if (!open) return;
    setOverlayChrome(true);
    return () => setOverlayChrome(false);
  }, [open]);

  if (!activeRequest) return null;

  const isEdit = activeRequest.mode === "edit";
  const isCompleted = editItem?.status === "completed";
  const repeatable = !isEdit && !!activeRequest.repeatable;
  const series = editItem?.seriesId ? getTaskSeriesById(editItem.seriesId) : undefined;
  const close = () => onOpenChange(false);

  const handleSave = () => {
    if (submittingRef.current) return;
    const trimmed = title.trim();
    if (!trimmed) {
      setTitleError(true);
      return;
    }
    if (!date) {
      setTitleError(true);
      return;
    }
    submittingRef.current = true;

    try {
      const times = allDay
        ? { allDay: true, startTime: undefined, endTime: undefined }
        : {
            allDay: false,
            startTime: startTime || undefined,
            endTime: endTime || undefined,
          };

      if (isEdit && editItem) {
        if (date !== editItem.date) {
          moveTaskToDate(editItem.id, date);
        }
        const saved = updateTask(editItem.id, {
          title: trimmed,
          note: note.trim() || undefined,
          icon: iconId,
          color: colorId,
          ...times,
          parentPlanId,
        });
        onSaved(saved);
        close();
      } else {
        const input = {
          title: trimmed,
          note: note.trim() || undefined,
          date,
          icon: iconId,
          color: colorId,
          createdFrom: activeRequest.createdFrom ?? ("plan" as const),
          ...times,
        };
        const saved = activeRequest.quickMemoId
          ? convertQuickMemoToTask(activeRequest.quickMemoId, input).task
          : parentPlanId
            ? breakdownWeeklyToTask(parentPlanId, input)
            : createTask(input);
        onSaved(saved);
        if (repeatable) {
          setTitle("");
          setNote("");
          setTitleError(false);
          setDuplicateError(false);
          submittingRef.current = false;
        } else {
          close();
        }
      }
    } catch (err) {
      submittingRef.current = false;
      if (err instanceof RepositoryError) {
        if (
          err.code === "task-duplicate-child" ||
          err.code === "task-duplicate-on-target-date"
        ) {
          setDuplicateError(true);
        } else {
          setTitleError(true);
        }
      } else {
        throw err;
      }
    }
  };

  const toggleComplete = () => {
    if (!editItem) return;
    const saved = completeTask(editItem.id, !isCompleted);
    setEditItem(saved);
    onChanged();
  };

  const runDelete = () => {
    if (!editItem) return;
    archiveTask(editItem.id);
    setConfirmDelete(false);
    onChanged();
    close();
  };

  const runStopRepeat = () => {
    if (!editItem?.seriesId) return;
    stopTaskSeries(editItem.seriesId);
    setConfirmStopRepeat(false);
    onChanged();
    close();
  };

  const confirmOverlay = confirmDelete || confirmStopRepeat ? (
    <div
      className="absolute inset-0 z-[60] flex items-end justify-center p-3"
      data-vaul-no-drag=""
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="absolute inset-0 bg-black/40" onClick={() => { setConfirmDelete(false); setConfirmStopRepeat(false); }} />
      <div className="relative z-10 w-full max-w-md rounded-2xl bg-card shadow-float overflow-hidden pointer-events-auto">
        <div className="px-4 pt-4 pb-2">
          <p className="text-sm font-semibold leading-snug">
            {confirmStopRepeat ? t("todoStopRepeatConfirm") : t("planTaskDeleteConfirm")}
          </p>
        </div>
        <div className="px-3 pb-3 space-y-2">
          <button
            type="button"
            onClick={confirmStopRepeat ? runStopRepeat : runDelete}
            className="w-full rounded-xl bg-destructive/10 px-4 py-3.5 text-sm font-semibold text-destructive hover:bg-destructive/15"
          >
            {confirmStopRepeat ? t("todoStopRepeat") : t("planTaskDelete")}
          </button>
          <button
            type="button"
            onClick={() => {
              setConfirmDelete(false);
              setConfirmStopRepeat(false);
            }}
            className="w-full rounded-xl px-4 py-3 text-sm font-medium text-muted-foreground hover:bg-secondary/60"
          >
            {t("cancel")}
          </button>
        </div>
      </div>
    </div>
  ) : null;

  return (
    <DrawerPrimitive.Root open={open} onOpenChange={onOpenChange} shouldScaleBackground={false}>
      <DrawerPrimitive.Portal>
        <DrawerPrimitive.Overlay
          className={cn(
            "fixed inset-0 bg-black/20 backdrop-blur-[1px]",
            isTutorialActive() ? "z-[120]" : "z-50",
          )}
        />
        <DrawerPrimitive.Content
          className={cn(
            "fixed inset-x-0 bottom-0 flex flex-col rounded-t-2xl border bg-background min-h-0 overflow-hidden outline-none",
            isTutorialActive() ? "z-[120]" : "z-50",
          )}
          style={{ maxHeight: "92dvh" }}
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <div className="mx-auto mt-2.5 mb-0.5 h-1.5 w-10 rounded-full bg-muted shrink-0 touch-none" />

          <div className="flex items-center justify-between px-4 pt-2 pb-3 border-b border-border/50 shrink-0">
            <DrawerPrimitive.Title className="text-base font-semibold">
              {isEdit ? t("planEditTaskTitle") : t("planCreateTaskTitle")}
            </DrawerPrimitive.Title>
            <button
              type="button"
              onClick={close}
              aria-label={t("cancel")}
              className="p-1.5 -mr-1 rounded-full text-muted-foreground hover:bg-secondary/70"
            >
              <X className="w-5 h-5" aria-hidden="true" />
            </button>
          </div>

          <div
            className="flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-5"
            data-vaul-no-drag=""
            onPointerDown={(e) => e.stopPropagation()}
          >
            {parentLockedRef.current && parentItem && (
              <p className="text-xs text-muted-foreground">
                {t("planParentPrefix")}: <span className="text-foreground">{parentItem.title}</span>
              </p>
            )}

            {isEdit && series ? (
              <div className="rounded-xl bg-secondary/50 px-4 py-3 space-y-2">
                <p className="text-sm">
                  {t("todoRepeatFromOccurrence").replace(
                    "{rule}",
                    describeRecurrence(series.recurrence, locale),
                  )}
                </p>
                <div className="flex gap-2">
                  {onEditSeries ? (
                    <button
                      type="button"
                      onClick={() => {
                        close();
                        onEditSeries(series.id);
                      }}
                      className="flex-1 rounded-xl px-3 py-2 text-sm font-medium bg-background"
                    >
                      {t("todoEditRepeat")}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => setConfirmStopRepeat(true)}
                    className="flex-1 rounded-xl px-3 py-2 text-sm font-medium text-destructive bg-destructive/10"
                  >
                    {t("todoStopRepeat")}
                  </button>
                </div>
              </div>
            ) : null}

            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5 block">
                {t("planTitleLabel")}
              </label>
              <input
                autoFocus={!isEdit}
                value={title}
                onChange={(e) => {
                  setTitle(e.target.value);
                  if (titleError) setTitleError(false);
                  if (duplicateError) setDuplicateError(false);
                }}
                placeholder={t("planTitlePlaceholder")}
                className={cn(
                  "w-full bg-secondary/50 rounded-xl px-4 py-3 text-base outline-none placeholder:text-muted-foreground/50",
                  (titleError || duplicateError) && "ring-2 ring-destructive",
                )}
              />
              {titleError && (
                <p className="text-xs text-destructive mt-1">{t("planTitleRequired")}</p>
              )}
              {duplicateError && (
                <p className="text-xs text-destructive mt-1">{t("planDuplicateTask")}</p>
              )}
            </div>

            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5 block">
                {t("planNoteLabel")}
              </label>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={t("planNotePlaceholder")}
                rows={2}
                className="w-full bg-secondary/50 rounded-xl px-4 py-3 text-sm outline-none placeholder:text-muted-foreground/50 resize-none"
              />
            </div>

            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5 block">
                {t("planTargetDate")}
              </label>
              <input
                type="date"
                value={date}
                onChange={(e) => {
                  setDate(e.target.value);
                  if (duplicateError) setDuplicateError(false);
                }}
                className="w-full bg-secondary/50 rounded-xl px-4 py-3 text-base outline-none"
              />
            </div>

            <div>
              <label className="flex items-center justify-between gap-3 bg-secondary/50 rounded-xl px-4 py-3">
                <span className="text-sm font-medium">{t("planAllDay")}</span>
                <input
                  type="checkbox"
                  checked={allDay}
                  onChange={(e) => setAllDay(e.target.checked)}
                  className="w-4 h-4 accent-[hsl(var(--accent))]"
                />
              </label>
              {!allDay && (
                <div className="grid grid-cols-2 gap-2 mt-2">
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">
                      {t("planStartTime")}
                    </label>
                    <input
                      type="time"
                      value={startTime}
                      onChange={(e) => setStartTime(e.target.value)}
                      className="w-full bg-secondary/50 rounded-xl px-3 py-2.5 text-sm outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">
                      {t("planEndTime")}
                    </label>
                    <input
                      type="time"
                      value={endTime}
                      onChange={(e) => setEndTime(e.target.value)}
                      className="w-full bg-secondary/50 rounded-xl px-3 py-2.5 text-sm outline-none"
                    />
                  </div>
                </div>
              )}
            </div>

            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5 block">
                {t("planIconLabel")}
              </label>
              <PlanIconPicker value={iconId} onChange={setIconId} />
            </div>

            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5 block">
                {t("planColorLabel")}
              </label>
              <PlanColorPicker value={colorId} onChange={setColorId} />
            </div>

            {!parentLockedRef.current && (
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5 block">
                  {t("planParentWeeklyOptional")}
                </label>
                <select
                  value={parentPlanId ?? ""}
                  onChange={(e) => {
                    const next = e.target.value || undefined;
                    setParentPlanId(next);
                    setParentItem(next ? getPlanItem(next) ?? null : null);
                    if (duplicateError) setDuplicateError(false);
                  }}
                  className="w-full bg-secondary/50 rounded-xl px-4 py-3 text-sm outline-none"
                >
                  <option value="">{t("planParentNone")}</option>
                  {weeklyChoices.map((plan) => (
                    <option key={plan.id} value={plan.id}>
                      {plan.title}
                    </option>
                  ))}
                  {parentPlanId &&
                    !weeklyChoices.some((p) => p.id === parentPlanId) &&
                    parentItem && (
                      <option value={parentItem.id}>{parentItem.title}</option>
                    )}
                </select>
              </div>
            )}

            {isEdit && (
              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setConfirmDelete(true)}
                  className="flex-1 rounded-xl px-3 py-2.5 text-sm font-medium text-destructive bg-destructive/10 hover:bg-destructive/15"
                >
                  {t("planTaskDelete")}
                </button>
                <TaskCompletionControl
                  completed={isCompleted}
                  color={`hsl(${getThemeAccentOption(colorId as ThemeAccentId).accent})`}
                  label={isCompleted ? t("planCompleted") : t("planComplete")}
                  onToggle={toggleComplete}
                />
              </div>
            )}
          </div>

          <div className="px-4 pb-4 pt-2 shrink-0 border-t border-border/50">
            {date && (
              <p className="text-xs text-muted-foreground mb-2 text-center">
                {formatDateStr(date, { month: "long", day: "numeric", year: "numeric" })}
              </p>
            )}
            <button
              type="button"
              onClick={handleSave}
              className="w-full rounded-xl bg-accent text-accent-foreground px-4 py-3.5 text-sm font-semibold hover:opacity-90 transition-opacity"
            >
              {isEdit ? t("save") : t("planDailyAddCta")}
            </button>
          </div>

          {confirmOverlay}
        </DrawerPrimitive.Content>
      </DrawerPrimitive.Portal>
    </DrawerPrimitive.Root>
  );
}
