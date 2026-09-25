import { useState } from "react";
import { ChevronLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { PlanIconGlyph } from "@/components/plan/plan-icon-registry";
import { RoutineSheet, type RoutineSheetRequest } from "@/components/todo/RoutineSheet";
import { getThemeAccentOption, type ThemeAccentId } from "@/lib/theme-accent";
import { useI18n, type TranslationKeys } from "@/lib/i18n";
import { addDays, todayLocalDate, type Weekday } from "@/lib/v3/local-date";
import {
  getRoutineCompletions,
  getRoutines,
  isRoutineCompletedOn,
  routineOccursOn,
} from "@/lib/v3/repository";
import type { RoutineItem } from "@/lib/v3/types";

const WEEKDAY_KEYS: TranslationKeys[] = [
  "todoWeekdaySun",
  "todoWeekdayMon",
  "todoWeekdayTue",
  "todoWeekdayWed",
  "todoWeekdayThu",
  "todoWeekdayFri",
  "todoWeekdaySat",
];

export default function RoutineList() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const today = todayLocalDate();
  const [, setTick] = useState(0);
  const [sheet, setSheet] = useState<RoutineSheetRequest | null>(null);
  const routines = getRoutines(true);

  return (
    <div className="app-shell-page">
      <div className="app-shell-header px-4 pb-2">
        <button
          type="button"
          onClick={() => navigate("/todo")}
          className="flex items-center gap-1.5 text-sm text-muted-foreground mb-2"
        >
          <ChevronLeft className="w-4 h-4" />
          {t("back")}
        </button>
        <h1 className="text-[28px] font-bold tracking-tight">{t("todoRoutineListTitle")}</h1>
      </div>
      <div className="app-shell-scroll px-4 pb-8">
        {routines.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("todoRoutineNoneToday")}</p>
        ) : (
          <ul className="space-y-2">
            {routines.map((routine) => (
              <li key={routine.id}>
                <RoutineListRow
                  routine={routine}
                  today={today}
                  onEdit={() => setSheet({ mode: "edit", routineId: routine.id })}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
      <RoutineSheet
        request={sheet}
        onOpenChange={(open) => {
          if (!open) setSheet(null);
        }}
        onSaved={() => setTick((n) => n + 1)}
        onChanged={() => setTick((n) => n + 1)}
      />
    </div>
  );
}

function RoutineListRow({
  routine,
  today,
  onEdit,
}: {
  routine: RoutineItem;
  today: string;
  onEdit: () => void;
}) {
  const { t } = useI18n();
  const accent = getThemeAccentOption(routine.color as ThemeAccentId);
  const weekdays =
    routine.frequency.type === "daily"
      ? t("todoRoutineEveryDay")
      : routine.frequency.weekdays
          .slice()
          .sort((a, b) => a - b)
          .map((day) => t(WEEKDAY_KEYS[day as Weekday]))
          .join(" ");
  const dueToday = routineOccursOn(routine, today);
  const doneToday = dueToday && isRoutineCompletedOn(routine.id, today);
  let scheduled = 0;
  let done = 0;
  for (let i = 0; i < 7; i++) {
    const date = addDays(today, -i);
    if (!routineOccursOn(routine, date)) continue;
    scheduled += 1;
    if (getRoutineCompletions({ date, routineId: routine.id }).some((c) => c.completed)) {
      done += 1;
    }
  }

  return (
    <button
      type="button"
      onClick={onEdit}
      className="w-full rounded-2xl bg-card shadow-soft px-4 py-3 text-left flex items-start gap-3"
      data-testid="routine-list-row"
    >
      <span
        className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
        style={{
          backgroundColor: `hsl(${accent.accent} / 0.16)`,
          color: `hsl(${accent.accent})`,
        }}
      >
        <PlanIconGlyph iconId={routine.icon} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[16px] font-medium truncate">{routine.title}</span>
        <span className="block text-xs text-muted-foreground mt-0.5">{weekdays}</span>
        {routine.defaultTime ? (
          <span className="block text-xs text-muted-foreground">{routine.defaultTime}</span>
        ) : null}
      </span>
      <span className="text-xs text-muted-foreground shrink-0 text-right">
        <span className="block">{doneToday ? "✓" : dueToday ? "○" : "–"}</span>
        <span className="block tabular-nums mt-1">
          {t("todoRoutineSummary").replace("{done}", String(done)).replace("{total}", String(scheduled))}
        </span>
      </span>
    </button>
  );
}
