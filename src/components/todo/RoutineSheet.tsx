import { useEffect, useRef, useState } from "react";
import { Drawer as DrawerPrimitive } from "vaul";
import { X } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { setOverlayChrome } from "@/lib/overlay-chrome";
import { PlanIconPicker } from "@/components/plan/PlanIconPicker";
import { PlanColorPicker } from "@/components/plan/PlanColorPicker";
import { DEFAULT_COLOR, DEFAULT_ROUTINE_ICON } from "@/lib/v3/schema";
import {
  createRoutine,
  deactivateRoutine,
  getRoutine,
  updateRoutine,
} from "@/lib/v3/repository";
import { todayLocalDate, weekdayOf, type LocalDate, type Weekday } from "@/lib/v3/local-date";
import type { RoutineFrequency, RoutineItem } from "@/lib/v3/types";

export interface RoutineSheetRequest {
  mode: "create" | "edit";
  routineId?: string;
}

interface Props {
  request: RoutineSheetRequest | null;
  onOpenChange: (open: boolean) => void;
  onSaved: (routine: RoutineItem) => void;
  onChanged: () => void;
}

const WEEKDAYS: Weekday[] = [0, 1, 2, 3, 4, 5, 6];
const WEEKDAY_KEYS = [
  "todoWeekdaySun",
  "todoWeekdayMon",
  "todoWeekdayTue",
  "todoWeekdayWed",
  "todoWeekdayThu",
  "todoWeekdayFri",
  "todoWeekdaySat",
] as const;

/**
 * Routine editor. Frequency is daily or weekly weekdays only.
 * Monthly / yearly cadences belong to TaskSeries — not this sheet.
 */
export function RoutineSheet({ request, onOpenChange, onSaved, onChanged }: Props) {
  const { t } = useI18n();

  const [title, setTitle] = useState("");
  const [iconId, setIconId] = useState(DEFAULT_ROUTINE_ICON);
  const [colorId, setColorId] = useState(DEFAULT_COLOR);
  const [freqType, setFreqType] = useState<"daily" | "weekly">("daily");
  const [weekdays, setWeekdays] = useState<Weekday[]>([]);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [defaultTime, setDefaultTime] = useState("");
  const [active, setActive] = useState(true);
  const [titleError, setTitleError] = useState(false);
  const [confirmOff, setConfirmOff] = useState(false);
  const [editItem, setEditItem] = useState<RoutineItem | null>(null);
  const submittingRef = useRef(false);

  const open = !!request;
  const [activeRequest, setActiveRequest] = useState<RoutineSheetRequest | null>(null);
  useEffect(() => {
    if (request) setActiveRequest(request);
  }, [request]);

  useEffect(() => {
    if (!request) return;
    const today = todayLocalDate();
    if (request.mode === "edit" && request.routineId) {
      const item = getRoutine(request.routineId) ?? null;
      setEditItem(item);
      setTitle(item?.title ?? "");
      setIconId(item?.icon ?? DEFAULT_ROUTINE_ICON);
      setColorId(item?.color ?? DEFAULT_COLOR);
      if (item?.frequency.type === "weekly") {
        setFreqType("weekly");
        setWeekdays(item.frequency.weekdays);
      } else {
        setFreqType("daily");
        setWeekdays([]);
      }
      setStartDate(item?.startDate ?? today);
      setEndDate(item?.endDate ?? "");
      setDefaultTime(item?.defaultTime ?? "");
      setActive(item?.active ?? true);
    } else {
      setEditItem(null);
      setTitle("");
      setIconId(DEFAULT_ROUTINE_ICON);
      setColorId(DEFAULT_COLOR);
      setFreqType("daily");
      setWeekdays([weekdayOf(today)]);
      setStartDate(today);
      setEndDate("");
      setDefaultTime("");
      setActive(true);
    }
    setTitleError(false);
    setConfirmOff(false);
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

  const frequency = (): RoutineFrequency => {
    if (freqType === "weekly") {
      const selected = weekdays.length ? weekdays : [weekdayOf(startDate || todayLocalDate())];
      return { type: "weekly", weekdays: [...selected].sort((a, b) => a - b) as Weekday[] };
    }
    return { type: "daily" };
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
      icon: iconId,
      color: colorId,
      frequency: frequency(),
      startDate: startDate as LocalDate,
      endDate: endDate ? (endDate as LocalDate) : undefined,
      defaultTime: defaultTime || undefined,
      active,
    };
    const saved =
      isEdit && editItem
        ? updateRoutine(editItem.id, payload)
        : createRoutine(payload);
    onSaved(saved);
    close();
  };

  const runDeactivate = () => {
    if (!editItem) return;
    deactivateRoutine(editItem.id);
    setConfirmOff(false);
    onChanged();
    close();
  };

  const toggleWeekday = (day: Weekday) => {
    setWeekdays((prev) => {
      if (prev.includes(day)) {
        const next = prev.filter((d) => d !== day);
        return next.length ? next : prev;
      }
      return [...prev, day].sort((a, b) => a - b) as Weekday[];
    });
  };

  const confirmOverlay = confirmOff ? (
    <div
      className="absolute inset-0 z-[60] flex items-end justify-center p-3"
      data-vaul-no-drag=""
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="absolute inset-0 bg-black/40" onClick={() => setConfirmOff(false)} />
      <div className="relative z-10 w-full max-w-md rounded-2xl bg-card shadow-float overflow-hidden pointer-events-auto">
        <div className="px-4 pt-4 pb-2">
          <p className="text-sm font-semibold leading-snug">{t("todoRoutineDeactivateConfirm")}</p>
        </div>
        <div className="px-3 pb-3 space-y-2">
          <button
            type="button"
            onClick={runDeactivate}
            className="w-full rounded-xl bg-destructive/10 px-4 py-3.5 text-sm font-semibold text-destructive hover:bg-destructive/15"
          >
            {t("todoRoutineDeactivate")}
          </button>
          <button
            type="button"
            onClick={() => setConfirmOff(false)}
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
              {isEdit ? t("todoEditRoutineTitle") : t("todoCreateRoutineTitle")}
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
                placeholder={t("todoRoutineTitlePlaceholder")}
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
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                {t("todoRoutineFrequency")}
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  aria-pressed={freqType === "daily"}
                  onClick={() => setFreqType("daily")}
                  className={cn(
                    "flex-1 rounded-xl px-3 py-2.5 text-sm font-medium",
                    freqType === "daily" ? "bg-accent text-accent-foreground" : "bg-secondary/60",
                  )}
                >
                  {t("todoRoutineEveryDay")}
                </button>
                <button
                  type="button"
                  aria-pressed={freqType === "weekly"}
                  onClick={() => {
                    setFreqType("weekly");
                    if (!weekdays.length) setWeekdays([weekdayOf(startDate || todayLocalDate())]);
                  }}
                  className={cn(
                    "flex-1 rounded-xl px-3 py-2.5 text-sm font-medium",
                    freqType === "weekly" ? "bg-accent text-accent-foreground" : "bg-secondary/60",
                  )}
                >
                  {t("todoRoutineEveryWeek")}
                </button>
              </div>
              {freqType === "weekly" ? (
                <div className="flex gap-1 mt-3">
                  {WEEKDAYS.map((day) => {
                    const selected = weekdays.includes(day);
                    return (
                      <button
                        key={day}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => toggleWeekday(day)}
                        className={cn(
                          "flex-1 rounded-lg py-2 text-[11px] font-semibold",
                          selected ? "bg-accent text-accent-foreground" : "bg-secondary/60 text-muted-foreground",
                        )}
                      >
                        {t(WEEKDAY_KEYS[day])}
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </div>

            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5 block">
                {t("todoRoutineStartDate")}
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
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
              <label className="flex items-center justify-between gap-3 bg-secondary/50 rounded-xl px-4 py-3">
                <span className="text-sm font-medium">{t("todoRoutineActive")}</span>
                <input
                  type="checkbox"
                  checked={active}
                  onChange={(e) => setActive(e.target.checked)}
                  className="w-4 h-4 accent-[hsl(var(--accent))]"
                />
              </label>
            ) : null}

            {isEdit ? (
              <button
                type="button"
                onClick={() => setConfirmOff(true)}
                className="w-full rounded-xl px-3 py-2.5 text-sm font-medium text-destructive bg-destructive/10 hover:bg-destructive/15"
              >
                {t("todoRoutineDeactivate")}
              </button>
            ) : null}
          </div>

          <div className="px-4 pb-4 pt-2 shrink-0 border-t border-border/50">
            <button
              type="button"
              onClick={handleSave}
              className="w-full rounded-xl bg-accent text-accent-foreground px-4 py-3.5 text-sm font-semibold hover:opacity-90 transition-opacity"
            >
              {isEdit ? t("save") : t("todoAddRoutineCta")}
            </button>
          </div>

          {confirmOverlay}
        </DrawerPrimitive.Content>
      </DrawerPrimitive.Portal>
    </DrawerPrimitive.Root>
  );
}
