import { useEffect, useRef, useState } from "react";
import { Drawer as DrawerPrimitive } from "vaul";
import { X } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { setOverlayChrome } from "@/lib/overlay-chrome";
import { PlanIconPicker } from "@/components/plan/PlanIconPicker";
import { PlanColorPicker } from "@/components/plan/PlanColorPicker";
import { DEFAULT_COLOR, DEFAULT_TASK_ICON } from "@/lib/v3/schema";
import {
  createTaskSeries,
  ensureSeriesOccurrencesForRange,
  getTaskSeriesById,
  stopTaskSeries,
  updateTaskSeries,
} from "@/lib/v3/repository";
import {
  addDays,
  parseLocalDate,
  todayLocalDate,
  weekdayOf,
  weekdayOccurrenceInMonth,
  type LocalDate,
  type Weekday,
} from "@/lib/v3/local-date";
import { describeRecurrence, nextSeriesOccurrence } from "@/lib/v3/task-recurrence";
import { TODO_UPCOMING_EXPANDED_DAYS } from "@/lib/v3/todo-view";
import type { TaskRecurrence, TaskSeries } from "@/lib/v3/types";

export interface RepeatSeriesSheetRequest {
  mode: "create" | "edit";
  seriesId?: string;
}

interface Props {
  request: RepeatSeriesSheetRequest | null;
  onOpenChange: (open: boolean) => void;
  onSaved: (series: TaskSeries) => void;
  onChanged: () => void;
}

type RecurrenceKind = TaskRecurrence["type"];

const WEEKDAY_KEYS = [
  "todoWeekdaySun",
  "todoWeekdayMon",
  "todoWeekdayTue",
  "todoWeekdayWed",
  "todoWeekdayThu",
  "todoWeekdayFri",
  "todoWeekdaySat",
] as const;

const WEEK_OPTIONS: Array<{ value: 1 | 2 | 3 | 4 | 5 | -1; key: "todoRepeatWeek1" | "todoRepeatWeek2" | "todoRepeatWeek3" | "todoRepeatWeek4" | "todoRepeatWeek5" | "todoRepeatWeekLast" }> = [
  { value: 1, key: "todoRepeatWeek1" },
  { value: 2, key: "todoRepeatWeek2" },
  { value: 3, key: "todoRepeatWeek3" },
  { value: 4, key: "todoRepeatWeek4" },
  { value: 5, key: "todoRepeatWeek5" },
  { value: -1, key: "todoRepeatWeekLast" },
];

/**
 * Repeat Log editor. Uses V3 TaskRecurrence only (monthlyDay / yearlyDate /
 * monthlyWeekday). Daily and weekly habits belong to RoutineSheet.
 */
export function RepeatSeriesSheet({ request, onOpenChange, onSaved, onChanged }: Props) {
  const { t, locale } = useI18n();

  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [iconId, setIconId] = useState(DEFAULT_TASK_ICON);
  const [colorId, setColorId] = useState(DEFAULT_COLOR);
  const [kind, setKind] = useState<RecurrenceKind>("monthlyDay");
  const [day, setDay] = useState(15);
  const [month, setMonth] = useState(1);
  const [week, setWeek] = useState<1 | 2 | 3 | 4 | 5 | -1>(2);
  const [weekday, setWeekday] = useState<Weekday>(1);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [defaultTime, setDefaultTime] = useState("");
  const [titleError, setTitleError] = useState(false);
  const [confirmStop, setConfirmStop] = useState(false);
  const [editItem, setEditItem] = useState<TaskSeries | null>(null);
  const submittingRef = useRef(false);

  const open = !!request;
  const [activeRequest, setActiveRequest] = useState<RepeatSeriesSheetRequest | null>(null);
  useEffect(() => {
    if (request) setActiveRequest(request);
  }, [request]);

  useEffect(() => {
    if (!request) return;
    const today = todayLocalDate();
    if (request.mode === "edit" && request.seriesId) {
      const item = getTaskSeriesById(request.seriesId) ?? null;
      setEditItem(item);
      setTitle(item?.title ?? "");
      setNote(item?.note ?? "");
      setIconId(item?.icon ?? DEFAULT_TASK_ICON);
      setColorId(item?.color ?? DEFAULT_COLOR);
      applyRecurrence(item?.recurrence, item?.startDate ?? today);
      setStartDate(item?.startDate ?? today);
      setEndDate(item?.endDate ?? "");
      setDefaultTime(item?.defaultTime ?? "");
    } else {
      setEditItem(null);
      setTitle("");
      setNote("");
      setIconId(DEFAULT_TASK_ICON);
      setColorId(DEFAULT_COLOR);
      applyRecurrence(undefined, today);
      setStartDate(today);
      setEndDate("");
      setDefaultTime("");
    }
    setTitleError(false);
    setConfirmStop(false);
    submittingRef.current = false;
  }, [request]);

  useEffect(() => {
    if (!open) return;
    setOverlayChrome(true);
    return () => setOverlayChrome(false);
  }, [open]);

  if (!activeRequest) return null;

  const isEdit = activeRequest.mode === "edit";
  const close = () => onOpenChange(false);

  const recurrence = (): TaskRecurrence => {
    if (kind === "yearlyDate") return { type: "yearlyDate", month, day };
    if (kind === "monthlyWeekday") return { type: "monthlyWeekday", week, weekday };
    return { type: "monthlyDay", day };
  };

  const handleSave = () => {
    if (submittingRef.current) return;
    const trimmed = title.trim();
    if (!trimmed || !startDate) {
      setTitleError(true);
      return;
    }
    submittingRef.current = true;
    const payload = {
      title: trimmed,
      note: note.trim() || undefined,
      icon: iconId,
      color: colorId,
      recurrence: recurrence(),
      startDate: startDate as LocalDate,
      endDate: endDate ? (endDate as LocalDate) : undefined,
      defaultTime: defaultTime || undefined,
    };
    const saved =
      isEdit && editItem
        ? updateTaskSeries(editItem.id, payload)
        : createTaskSeries(payload);

    const today = todayLocalDate();
    const from = saved.startDate < today ? today : saved.startDate;
    const next = nextSeriesOccurrence(saved, from);
    ensureSeriesOccurrencesForRange(from, addDays(today, TODO_UPCOMING_EXPANDED_DAYS));
    if (next) {
      ensureSeriesOccurrencesForRange(next, next);
    }

    onSaved(saved);
    close();
  };

  const runStop = () => {
    if (!editItem) return;
    stopTaskSeries(editItem.id);
    setConfirmStop(false);
    onChanged();
    close();
  };

  const confirmOverlay = confirmStop ? (
    <div
      className="absolute inset-0 z-[60] flex items-end justify-center p-3"
      data-vaul-no-drag=""
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="absolute inset-0 bg-black/40" onClick={() => setConfirmStop(false)} />
      <div className="relative z-10 w-full max-w-md rounded-2xl bg-card shadow-float overflow-hidden pointer-events-auto">
        <div className="px-4 pt-4 pb-2">
          <p className="text-sm font-semibold leading-snug">{t("todoStopRepeatConfirm")}</p>
        </div>
        <div className="px-3 pb-3 space-y-2">
          <button
            type="button"
            onClick={runStop}
            className="w-full rounded-xl bg-destructive/10 px-4 py-3.5 text-sm font-semibold text-destructive hover:bg-destructive/15"
          >
            {t("todoStopRepeat")}
          </button>
          <button
            type="button"
            onClick={() => setConfirmStop(false)}
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
        <DrawerPrimitive.Overlay className="fixed inset-0 z-50 bg-black/20 backdrop-blur-[1px]" />
        <DrawerPrimitive.Content
          className="fixed inset-x-0 bottom-0 z-50 flex flex-col rounded-t-2xl border bg-background min-h-0 overflow-hidden outline-none"
          style={{ maxHeight: "92dvh" }}
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <div className="mx-auto mt-2.5 mb-0.5 h-1.5 w-10 rounded-full bg-muted shrink-0 touch-none" />
          <div className="flex items-center justify-between px-4 pt-2 pb-3 border-b border-border/50 shrink-0">
            <DrawerPrimitive.Title className="text-base font-semibold">
              {isEdit ? t("todoEditRepeatTitle") : t("todoCreateRepeatTitle")}
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
                }}
                placeholder={t("todoRepeatTitlePlaceholder")}
                className={cn(
                  "w-full bg-secondary/50 rounded-xl px-4 py-3 text-base outline-none placeholder:text-muted-foreground/50",
                  titleError && "ring-2 ring-destructive",
                )}
              />
              {titleError ? (
                <p className="text-xs text-destructive mt-1">{t("planTitleRequired")}</p>
              ) : null}
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
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                {t("todoRepeatRule")}
              </p>
              <div className="space-y-2">
                <KindButton
                  selected={kind === "monthlyDay"}
                  label={t("todoRepeatMonthlyDay")}
                  onClick={() => setKind("monthlyDay")}
                />
                <KindButton
                  selected={kind === "yearlyDate"}
                  label={t("todoRepeatYearlyDate")}
                  onClick={() => setKind("yearlyDate")}
                />
                <KindButton
                  selected={kind === "monthlyWeekday"}
                  label={t("todoRepeatMonthlyWeekday")}
                  onClick={() => setKind("monthlyWeekday")}
                />
              </div>

              {kind === "monthlyDay" ? (
                <label className="block mt-3">
                  <span className="text-xs text-muted-foreground mb-1 block">{t("todoRepeatDay")}</span>
                  <input
                    type="number"
                    min={1}
                    max={31}
                    value={day}
                    onChange={(e) => setDay(clampDay(Number(e.target.value)))}
                    className="w-full bg-secondary/50 rounded-xl px-4 py-3 text-base outline-none"
                  />
                </label>
              ) : null}

              {kind === "yearlyDate" ? (
                <div className="grid grid-cols-2 gap-2 mt-3">
                  <label>
                    <span className="text-xs text-muted-foreground mb-1 block">{t("todoRepeatMonth")}</span>
                    <input
                      type="number"
                      min={1}
                      max={12}
                      value={month}
                      onChange={(e) => setMonth(clampMonth(Number(e.target.value)))}
                      className="w-full bg-secondary/50 rounded-xl px-4 py-3 text-base outline-none"
                    />
                  </label>
                  <label>
                    <span className="text-xs text-muted-foreground mb-1 block">{t("todoRepeatDay")}</span>
                    <input
                      type="number"
                      min={1}
                      max={31}
                      value={day}
                      onChange={(e) => setDay(clampDay(Number(e.target.value)))}
                      className="w-full bg-secondary/50 rounded-xl px-4 py-3 text-base outline-none"
                    />
                  </label>
                </div>
              ) : null}

              {kind === "monthlyWeekday" ? (
                <div className="grid grid-cols-2 gap-2 mt-3">
                  <label>
                    <span className="text-xs text-muted-foreground mb-1 block">{t("todoRepeatWeek")}</span>
                    <select
                      value={week}
                      onChange={(e) => setWeek(Number(e.target.value) as 1 | 2 | 3 | 4 | 5 | -1)}
                      className="w-full bg-secondary/50 rounded-xl px-3 py-3 text-sm outline-none"
                    >
                      {WEEK_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {t(option.key)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span className="text-xs text-muted-foreground mb-1 block">{t("todoRepeatWeekday")}</span>
                    <select
                      value={weekday}
                      onChange={(e) => setWeekday(Number(e.target.value) as Weekday)}
                      className="w-full bg-secondary/50 rounded-xl px-3 py-3 text-sm outline-none"
                    >
                      {WEEKDAY_KEYS.map((key, index) => (
                        <option key={key} value={index}>
                          {t(key)}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              ) : null}

              <p className="text-xs text-muted-foreground mt-3">
                {describeRecurrence(recurrence(), locale)}
              </p>
            </div>

            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5 block">
                {t("todoRoutineStartDate")}
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => {
                  const next = e.target.value;
                  setStartDate(next);
                  if (next) applyRecurrence(recurrence(), next as LocalDate);
                }}
                className="w-full bg-secondary/50 rounded-xl px-4 py-3 text-base outline-none"
              />
            </div>

            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5 block">
                {t("todoRoutineEndDate")}
              </label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full bg-secondary/50 rounded-xl px-4 py-3 text-base outline-none"
              />
            </div>

            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5 block">
                {t("todoRoutineDefaultTime")}
              </label>
              <input
                type="time"
                value={defaultTime}
                onChange={(e) => setDefaultTime(e.target.value)}
                className="w-full bg-secondary/50 rounded-xl px-4 py-3 text-base outline-none"
              />
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

            {isEdit ? (
              <button
                type="button"
                onClick={() => setConfirmStop(true)}
                className="w-full rounded-xl px-3 py-2.5 text-sm font-medium text-destructive bg-destructive/10 hover:bg-destructive/15"
              >
                {t("todoStopRepeat")}
              </button>
            ) : null}
          </div>

          <div className="px-4 pb-4 pt-2 shrink-0 border-t border-border/50">
            <button
              type="button"
              onClick={handleSave}
              className="w-full rounded-xl bg-accent text-accent-foreground px-4 py-3.5 text-sm font-semibold hover:opacity-90 transition-opacity"
            >
              {isEdit ? t("save") : t("todoAddRepeat")}
            </button>
          </div>

          {confirmOverlay}
        </DrawerPrimitive.Content>
      </DrawerPrimitive.Portal>
    </DrawerPrimitive.Root>
  );

  function applyRecurrence(rule: TaskRecurrence | undefined, date: LocalDate) {
    const parsed = parseLocalDate(date);
    if (!rule) {
      setKind("monthlyDay");
      setDay(parsed.getDate());
      setMonth(parsed.getMonth() + 1);
      setWeekday(weekdayOf(date));
      const nth = weekdayOccurrenceInMonth(date);
      setWeek(nth >= 5 ? 5 : (nth as 1 | 2 | 3 | 4));
      return;
    }
    setKind(rule.type);
    if (rule.type === "monthlyDay") {
      setDay(rule.day);
      setMonth(parsed.getMonth() + 1);
    } else if (rule.type === "yearlyDate") {
      setMonth(rule.month);
      setDay(rule.day);
    } else {
      setWeek(rule.week);
      setWeekday(rule.weekday);
      setDay(parsed.getDate());
      setMonth(parsed.getMonth() + 1);
    }
  }
}

function KindButton({
  selected,
  label,
  onClick,
}: {
  selected: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        "w-full text-left rounded-xl px-4 py-2.5 text-sm font-medium",
        selected ? "bg-accent text-accent-foreground" : "bg-secondary/60",
      )}
    >
      {label}
    </button>
  );
}

function clampDay(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.min(31, Math.max(1, Math.round(value)));
}

function clampMonth(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.min(12, Math.max(1, Math.round(value)));
}
