import { useEffect, useMemo, useState } from "react";
import { Drawer as DrawerPrimitive } from "vaul";
import { Plus } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import {
  getCompletionRate,
  getDaysWithTasksInRange,
  getHistoryMonthKeys,
  getWeeksInMonth,
  weekIndexForDate,
  type Task,
} from "@/lib/store";
import { setOverlayChrome } from "@/lib/overlay-chrome";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  todayKey: string;
  onOpenChange: (open: boolean) => void;
  onBringTasks: (texts: string[]) => void;
}

function monthLabel(monthKey: string, locale: "en" | "ja"): string {
  const [y, m] = monthKey.split("-").map(Number);
  const d = new Date(y, (m || 1) - 1, 1);
  return d.toLocaleDateString(locale === "ja" ? "ja-JP" : "en-US", {
    year: "numeric",
    month: "long",
  });
}

function defaultMonthWeek(todayKey: string): { monthKey: string; week: number } {
  const months = getHistoryMonthKeys(todayKey);
  const monthKey = months[0];
  const yesterday = new Date(`${todayKey}T00:00:00`);
  yesterday.setDate(yesterday.getDate() - 1);
  const y = yesterday.getFullYear();
  const m = String(yesterday.getMonth() + 1).padStart(2, "0");
  const d = String(yesterday.getDate()).padStart(2, "0");
  const ymd = `${y}-${m}-${d}`;
  if (ymd.startsWith(monthKey)) {
    return { monthKey, week: weekIndexForDate(monthKey, ymd) };
  }
  const weeks = getWeeksInMonth(monthKey);
  return { monthKey, week: weeks[weeks.length - 1]?.week ?? 1 };
}

export function TaskHistorySheet({ open, todayKey, onOpenChange, onBringTasks }: Props) {
  const { t, locale, formatDateStr } = useI18n();
  const months = useMemo(() => getHistoryMonthKeys(todayKey), [todayKey]);
  const initial = useMemo(() => defaultMonthWeek(todayKey), [todayKey]);
  const [monthKey, setMonthKey] = useState(initial.monthKey);
  const [week, setWeek] = useState(initial.week);

  useEffect(() => {
    if (!open) return;
    const next = defaultMonthWeek(todayKey);
    setMonthKey(next.monthKey);
    setWeek(next.week);
  }, [open, todayKey]);

  const weeks = useMemo(() => getWeeksInMonth(monthKey), [monthKey]);
  const selectedWeek = weeks.find((w) => w.week === week) ?? weeks[0];

  const days = useMemo(
    () =>
      open && selectedWeek
        ? getDaysWithTasksInRange(selectedWeek.startKey, selectedWeek.endKey, todayKey)
        : [],
    [open, selectedWeek, todayKey],
  );

  useEffect(() => {
    if (!open) return;
    setOverlayChrome(true);
    return () => setOverlayChrome(false);
  }, [open]);

  return (
    <DrawerPrimitive.Root open={open} onOpenChange={onOpenChange} shouldScaleBackground={false}>
      <DrawerPrimitive.Portal>
        <DrawerPrimitive.Overlay className="fixed inset-0 z-50 bg-black/20 backdrop-blur-[1px]" />
        <DrawerPrimitive.Content
          className="fixed inset-x-0 bottom-0 z-50 flex flex-col rounded-t-2xl border bg-background min-h-0 overflow-hidden outline-none"
          style={{ maxHeight: "88dvh", height: "88dvh" }}
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <div className="mx-auto mt-2.5 mb-0.5 h-1.5 w-10 rounded-full bg-muted shrink-0 touch-none" />
          <div className="px-4 pt-2 pb-3 shrink-0">
            <DrawerPrimitive.Title className="text-base font-semibold">
              {t("taskHistory")}
            </DrawerPrimitive.Title>
            <p className="text-xs text-muted-foreground mt-1">{t("taskHistoryHint")}</p>
            <div className="flex gap-1.5 overflow-x-auto mt-3 pb-0.5 -mx-0.5 px-0.5">
              {months.map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => {
                    setMonthKey(key);
                    const nextWeeks = getWeeksInMonth(key);
                    setWeek(nextWeeks[0]?.week ?? 1);
                  }}
                  className={cn(
                    "shrink-0 rounded-full px-3 py-1.5 text-xs font-medium",
                    monthKey === key ? "bg-accent text-accent-foreground" : "bg-secondary text-foreground",
                  )}
                >
                  {monthLabel(key, locale)}
                </button>
              ))}
            </div>
            <div className="flex gap-1.5 overflow-x-auto mt-2 pb-0.5">
              {weeks.map((item) => (
                <button
                  key={item.week}
                  type="button"
                  onClick={() => setWeek(item.week)}
                  className={cn(
                    "shrink-0 rounded-full px-3 py-1.5 text-xs font-medium",
                    week === item.week ? "bg-accent text-accent-foreground" : "bg-secondary text-foreground",
                  )}
                >
                  {locale === "ja" ? `第${item.week}週` : `Week ${item.week}`}
                </button>
              ))}
            </div>
          </div>
          <div
            className="event-sheet-scroll min-h-0 overflow-y-scroll overscroll-contain px-4 py-3"
            style={{ flex: "1 1 0%" }}
            data-vaul-no-drag=""
            onPointerDown={(e) => e.stopPropagation()}
          >
            {days.length === 0 ? (
              <p className="text-sm text-muted-foreground py-10 text-center">
                {t("taskHistoryEmpty")}
              </p>
            ) : (
              <div className="space-y-4">
                {days.map(({ date, data }) => (
                  <DayBlock
                    key={date}
                    date={date}
                    dateLabel={formatDateStr(date, {
                      weekday: "short",
                      month: "long",
                      day: "numeric",
                    })}
                    score={getCompletionRate(data)}
                    tasks={data.tasks}
                    bringLabel={t("bringToToday")}
                    bringAllLabel={t("bringDayToToday")}
                    scoreLabel={t("historyScore")}
                    onBringOne={(text) => onBringTasks([text])}
                    onBringAll={() => onBringTasks(data.tasks.map((task) => task.text))}
                  />
                ))}
              </div>
            )}
            <div className="h-4" />
          </div>
        </DrawerPrimitive.Content>
      </DrawerPrimitive.Portal>
    </DrawerPrimitive.Root>
  );
}

function DayBlock({
  date,
  dateLabel,
  score,
  tasks,
  bringLabel,
  bringAllLabel,
  scoreLabel,
  onBringOne,
  onBringAll,
}: {
  date: string;
  dateLabel: string;
  score: number;
  tasks: Task[];
  bringLabel: string;
  bringAllLabel: string;
  scoreLabel: string;
  onBringOne: (text: string) => void;
  onBringAll: () => void;
}) {
  return (
    <section className="rounded-2xl bg-secondary/50 p-3" data-date={date}>
      <div className="flex items-start justify-between gap-2 mb-2">
        <div>
          <p className="text-sm font-semibold">{dateLabel}</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            {scoreLabel} {score}%
          </p>
        </div>
        <button
          type="button"
          onClick={onBringAll}
          className="shrink-0 text-[11px] font-medium text-accent px-2 py-1 rounded-lg bg-background/80"
        >
          {bringAllLabel}
        </button>
      </div>
      <ul className="space-y-1.5">
        {tasks.map((task) => (
          <li
            key={task.id}
            className="flex items-center gap-2 rounded-xl bg-background/80 px-2.5 py-2"
          >
            <span
              className={`flex-1 text-sm leading-snug ${
                task.completed ? "text-muted-foreground line-through" : ""
              }`}
            >
              {task.text}
            </span>
            <button
              type="button"
              onClick={() => onBringOne(task.text)}
              className="shrink-0 inline-flex items-center gap-0.5 text-[11px] font-medium text-accent"
            >
              <Plus className="w-3.5 h-3.5" strokeWidth={2.5} />
              {bringLabel}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
