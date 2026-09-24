import { useEffect, useRef, useState } from "react";
import { Drawer as DrawerPrimitive } from "vaul";
import { X } from "lucide-react";
import { useI18n, type TranslationKeys } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { setOverlayChrome } from "@/lib/overlay-chrome";
import { PlanIconPicker } from "@/components/plan/PlanIconPicker";
import { PlanColorPicker } from "@/components/plan/PlanColorPicker";
import { DEFAULT_COLOR, DEFAULT_PLAN_ICON } from "@/lib/v3/schema";
import {
  RepositoryError,
  archivePlanItem,
  breakdownPlanItem,
  convertQuickMemoToPlan,
  createPlanItem,
  getPlanItem,
  updatePlanItem,
} from "@/lib/v3/repository";
import type { FutureTarget, PlanItem, PlanLevel } from "@/lib/v3/types";
import type { LocalDate } from "@/lib/v3/local-date";

/** What the sheet is being opened for. `null` closes it. */
export interface PlanSheetRequest {
  mode: "create" | "edit";
  level: PlanLevel;
  /** Edit mode only. */
  planId?: string;
  /** Create mode: set when creating a Breakdown child. */
  parentPlanId?: string;
  /** Create mode, monthly/weekly: the fixed target period. */
  periodStart?: LocalDate;
  periodEnd?: LocalDate;
  /** Display label for `periodStart`/`periodEnd` (e.g. "September 2026"). */
  periodLabel?: string;
  /** Create mode, weekly-via-Monthly-breakdown only: candidate weeks. */
  weekChoices?: { start: LocalDate; end: LocalDate }[];
  /** Prefill when converting a Quick Memo. */
  draft?: { title?: string; note?: string; icon?: string; color?: string };
  createdFrom?: PlanItem["createdFrom"];
  /** When set, save uses convertQuickMemoToPlan (idempotent, keeps the memo). */
  quickMemoId?: string;
}

interface Props {
  request: PlanSheetRequest | null;
  onOpenChange: (open: boolean) => void;
  onSaved: (item: PlanItem) => void;
  /** User tapped "Create Monthly/Weekly Plan →" while editing (Weekly has none). */
  onBreakdown?: (parent: PlanItem) => void;
  /** After a stop / archive / complete-toggle so the list can refresh. */
  onChanged: () => void;
}

const CREATE_TITLE_KEY: Record<PlanLevel, TranslationKeys> = {
  future: "planCreateFutureTitle",
  monthly: "planCreateMonthlyTitle",
  weekly: "planCreateWeeklyTitle",
};

type FutureTargetType = FutureTarget["type"];

function weekRangeLabel(
  week: { start: LocalDate; end: LocalDate },
  formatDateStr: (iso: string, options?: Intl.DateTimeFormatOptions) => string,
): string {
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  return `${formatDateStr(week.start, opts)} – ${formatDateStr(week.end, opts)}`;
}

/**
 * Reusable create / edit / breakdown sheet for Future, Monthly, and Weekly
 * plan items. Domain writes go exclusively through the V3 repository —
 * this component only manages its own UI state.
 */
export function PlanItemSheet({ request, onOpenChange, onSaved, onBreakdown, onChanged }: Props) {
  const { t, formatDateStr } = useI18n();

  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [iconId, setIconId] = useState(DEFAULT_PLAN_ICON);
  const [colorId, setColorId] = useState(DEFAULT_COLOR);
  const [targetType, setTargetType] = useState<FutureTargetType>("someday");
  const [targetMonth, setTargetMonth] = useState("");
  const [targetDate, setTargetDate] = useState("");
  const [weekIndex, setWeekIndex] = useState(0);
  const [titleError, setTitleError] = useState(false);
  const [duplicateError, setDuplicateError] = useState(false);
  const [confirmAction, setConfirmAction] = useState<"stop" | "archive" | null>(null);

  const [editItem, setEditItem] = useState<PlanItem | null>(null);
  const [parentItem, setParentItem] = useState<PlanItem | null>(null);
  const submittingRef = useRef(false);

  const open = !!request;

  // Keeps rendering the last request's content while `open` transitions to
  // false, so Vaul's closing animation has something to animate instead of
  // the sheet vanishing the instant the parent clears `request`.
  const [activeRequest, setActiveRequest] = useState<PlanSheetRequest | null>(null);
  useEffect(() => {
    if (request) setActiveRequest(request);
  }, [request]);

  useEffect(() => {
    if (!request) return;

    if (request.mode === "edit" && request.planId) {
      const item = getPlanItem(request.planId) ?? null;
      setEditItem(item);
      setParentItem(item?.parentPlanId ? getPlanItem(item.parentPlanId) ?? null : null);
      setTitle(item?.title ?? "");
      setNote(item?.note ?? "");
      setIconId(item?.icon ?? DEFAULT_PLAN_ICON);
      setColorId(item?.color ?? DEFAULT_COLOR);
      setTargetType(item?.futureTarget?.type ?? "someday");
      setTargetMonth(item?.futureTarget?.type === "month" ? item.futureTarget.value ?? "" : "");
      setTargetDate(item?.futureTarget?.type === "date" ? item.futureTarget.value ?? "" : "");
    } else {
      setEditItem(null);
      const parent = request.parentPlanId ? getPlanItem(request.parentPlanId) ?? null : null;
      setParentItem(parent);
      setTitle(request.draft?.title ?? "");
      setNote(request.draft?.note ?? "");
      setIconId(request.draft?.icon ?? parent?.icon ?? DEFAULT_PLAN_ICON);
      setColorId(request.draft?.color ?? parent?.color ?? DEFAULT_COLOR);
      setTargetType("someday");
      setTargetMonth("");
      setTargetDate("");
      setWeekIndex(0);
    }
    setTitleError(false);
    setDuplicateError(false);
    setConfirmAction(null);
    submittingRef.current = false;
  }, [request]);

  useEffect(() => {
    if (!open) return;
    setOverlayChrome(true);
    return () => setOverlayChrome(false);
  }, [open]);

  if (!activeRequest) return null;

  const level =
    activeRequest.mode === "edit" ? editItem?.level ?? activeRequest.level : activeRequest.level;
  const isEdit = activeRequest.mode === "edit";
  const isCompleted = editItem?.status === "completed";
  const isStopped = editItem?.status === "stopped";
  const weekChoices = activeRequest.mode === "create" ? activeRequest.weekChoices : undefined;

  const close = () => onOpenChange(false);

  const handleSave = () => {
    if (submittingRef.current) return;
    const trimmed = title.trim();
    if (!trimmed) {
      setTitleError(true);
      return;
    }
    submittingRef.current = true;

    const futureTarget: FutureTarget | undefined =
      level === "future"
        ? targetType === "someday"
          ? { type: "someday" }
          : targetType === "month"
            ? { type: "month", value: targetMonth || undefined }
            : { type: "date", value: targetDate || undefined }
        : undefined;

    try {
      if (isEdit && editItem) {
        const saved = updatePlanItem(editItem.id, {
          title: trimmed,
          note: note.trim() || undefined,
          icon: iconId,
          color: colorId,
          ...(level === "future" ? { futureTarget } : {}),
        });
        onSaved(saved);
      } else {

        const chosenWeek = weekChoices?.[weekIndex];
        const periodStart = chosenWeek ? chosenWeek.start : activeRequest.periodStart;
        const periodEnd = chosenWeek ? chosenWeek.end : activeRequest.periodEnd;

        const input = {
          title: trimmed,
          note: note.trim() || undefined,
          icon: iconId,
          color: colorId,
          periodStart,
          periodEnd,
          futureTarget,
        };

        const saved = activeRequest.quickMemoId
          ? convertQuickMemoToPlan(activeRequest.quickMemoId, { ...input, level }).plan
          : activeRequest.parentPlanId
            ? breakdownPlanItem(activeRequest.parentPlanId, input)
            : createPlanItem({
                ...input,
                level,
                createdFrom: activeRequest.createdFrom ?? "plan",
              });
        onSaved(saved);
      }
      close();
      // `submittingRef` deliberately stays true: the repository call above is
      // synchronous, so a same-tick double tap (e.g. a double-click event)
      // would otherwise pass this guard twice before either the close
      // animation or a state re-render can disable the button. It only
      // resets when a fresh `request` opens the sheet again (see the effect
      // above), which is what makes this guard against duplicate creation.
    } catch (err) {
      // A real failure (e.g. a RepositoryError) should allow the user to fix
      // the form and retry, so the guard resets here specifically.
      submittingRef.current = false;
      if (err instanceof RepositoryError) {
        if (err.code === "plan-duplicate-child") setDuplicateError(true);
        else setTitleError(true);
      } else throw err;
    }
  };

  const toggleComplete = () => {
    if (!editItem) return;
    const saved = updatePlanItem(editItem.id, {
      status: isCompleted ? "active" : "completed",
    });
    setEditItem(saved);
    onChanged();
  };

  const runConfirm = () => {
    if (!editItem || !confirmAction) return;
    if (confirmAction === "archive") {
      archivePlanItem(editItem.id);
    } else {
      updatePlanItem(editItem.id, { status: "stopped" });
    }
    setConfirmAction(null);
    onChanged();
    close();
  };

  const canBreakdown =
    isEdit && !!editItem && (level === "future" || level === "monthly" || level === "weekly");
  const breakdownLabelKey: TranslationKeys =
    level === "future"
      ? "planBreakdownToMonthly"
      : level === "monthly"
        ? "planBreakdownToWeekly"
        : "planBreakdownToDaily";

  const confirmOverlay = confirmAction ? (
    <div
      className="absolute inset-0 z-[60] flex items-end justify-center p-3"
      data-vaul-no-drag=""
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="absolute inset-0 bg-black/40" onClick={() => setConfirmAction(null)} />
      <div className="relative z-10 w-full max-w-md rounded-2xl bg-card shadow-float overflow-hidden pointer-events-auto">
        <div className="px-4 pt-4 pb-2">
          <p className="text-sm font-semibold leading-snug">
            {t(confirmAction === "stop" ? "planStopConfirm" : "planArchiveConfirm")}
          </p>
        </div>
        <div className="px-3 pb-3 space-y-2">
          <button
            type="button"
            onClick={runConfirm}
            className="w-full rounded-xl bg-secondary/80 px-4 py-3.5 text-sm font-semibold text-foreground hover:bg-secondary"
          >
            {t(confirmAction === "stop" ? "planStop" : "planArchive")}
          </button>
          <button
            type="button"
            onClick={() => setConfirmAction(null)}
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
              {isEdit ? t("planEditTitle") : t(CREATE_TITLE_KEY[level])}
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
            {parentItem && (
              <p className="text-xs text-muted-foreground">
                {t("planParentPrefix")}: <span className="text-foreground">{parentItem.title}</span>
              </p>
            )}

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
                <p className="text-xs text-destructive mt-1">{t("planDuplicateChild")}</p>
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

            {level === "future" && (
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5 block">
                  {t("planTargetLabel")}
                </label>
                <div className="flex gap-2 mb-2">
                  {(["someday", "month", "date"] as FutureTargetType[]).map((typeOption) => (
                    <button
                      key={typeOption}
                      type="button"
                      onClick={() => setTargetType(typeOption)}
                      className={cn(
                        "flex-1 rounded-xl px-3 py-2 text-sm font-medium transition-colors",
                        targetType === typeOption
                          ? "bg-accent text-accent-foreground"
                          : "bg-secondary/60 text-foreground/70",
                      )}
                    >
                      {t(
                        typeOption === "someday"
                          ? "planTargetSomeday"
                          : typeOption === "month"
                            ? "planTargetMonth"
                            : "planTargetDate",
                      )}
                    </button>
                  ))}
                </div>
                {targetType === "month" && (
                  <input
                    type="month"
                    value={targetMonth}
                    onChange={(e) => setTargetMonth(e.target.value)}
                    className="w-full bg-secondary/50 rounded-xl px-4 py-3 text-base outline-none"
                  />
                )}
                {targetType === "date" && (
                  <input
                    type="date"
                    value={targetDate}
                    onChange={(e) => setTargetDate(e.target.value)}
                    className="w-full bg-secondary/50 rounded-xl px-4 py-3 text-base outline-none"
                  />
                )}
              </div>
            )}

            {!isEdit && level !== "future" && weekChoices && weekChoices.length > 0 && (
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5 block">
                  {t("planSelectWeek")}
                </label>
                <div className="flex flex-wrap gap-2">
                  {weekChoices.map((week, index) => (
                    <button
                      key={week.start}
                      type="button"
                      onClick={() => setWeekIndex(index)}
                      className={cn(
                        "rounded-xl px-3 py-2 text-sm font-medium transition-colors",
                        weekIndex === index
                          ? "bg-accent text-accent-foreground"
                          : "bg-secondary/60 text-foreground/70",
                      )}
                    >
                      {weekRangeLabel(week, formatDateStr)}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {!isEdit && level !== "future" && !weekChoices && activeRequest.periodLabel && (
              <p className="text-sm text-muted-foreground">{activeRequest.periodLabel}</p>
            )}

            {isEdit && level === "monthly" && editItem?.periodStart && (
              <p className="text-sm text-muted-foreground">
                {formatDateStr(editItem.periodStart, { month: "long", year: "numeric" })}
              </p>
            )}

            {isEdit && level === "weekly" && editItem?.periodStart && editItem?.periodEnd && (
              <p className="text-sm text-muted-foreground">
                {weekRangeLabel(
                  { start: editItem.periodStart, end: editItem.periodEnd },
                  formatDateStr,
                )}
              </p>
            )}

            {canBreakdown && (
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5 block">
                  {t("planBreakdownSectionTitle")}
                </label>
                <button
                  type="button"
                  onClick={() => editItem && onBreakdown?.(editItem)}
                  className="w-full flex items-center justify-between gap-2 bg-secondary/50 rounded-xl px-4 py-3 text-sm font-medium hover:bg-secondary transition-colors"
                >
                  <span>{t(breakdownLabelKey)}</span>
                  <span aria-hidden="true">→</span>
                </button>
              </div>
            )}

            {isEdit && (
              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={toggleComplete}
                  className={cn(
                    "flex-1 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
                    isCompleted
                      ? "bg-accent/15 text-accent"
                      : "bg-secondary/60 text-foreground/80 hover:bg-secondary",
                  )}
                >
                  {isCompleted ? t("planCompleted") : t("planComplete")}
                </button>
                <button
                  type="button"
                  disabled={isStopped}
                  onClick={() => setConfirmAction("stop")}
                  className="flex-1 rounded-xl px-3 py-2.5 text-sm font-medium text-muted-foreground bg-secondary/60 hover:bg-secondary disabled:opacity-40"
                >
                  {t("planStop")}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmAction("archive")}
                  className="flex-1 rounded-xl px-3 py-2.5 text-sm font-medium text-destructive bg-destructive/10 hover:bg-destructive/15"
                >
                  {t("planArchive")}
                </button>
              </div>
            )}
          </div>

          <div className="px-4 pb-4 pt-2 shrink-0 border-t border-border/50">
            <button
              type="button"
              onClick={handleSave}
              className="w-full rounded-xl bg-accent text-accent-foreground px-4 py-3.5 text-sm font-semibold hover:opacity-90 transition-opacity"
            >
              {t("save")}
            </button>
          </div>

          {confirmOverlay}
        </DrawerPrimitive.Content>
      </DrawerPrimitive.Portal>
    </DrawerPrimitive.Root>
  );
}
