import { useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import {
  addDays,
  addMonths,
  endOfWeek,
  localMonthEnd,
  localMonthStart,
  startOfWeek,
  todayLocalDate,
  toLocalMonth,
  weekdayOf,
  weeksOverlappingMonth,
  type LocalDate,
  type LocalMonth,
} from "@/lib/v3/local-date";
import { reflectionPeriod } from "@/lib/v3/reflection";
import {
  createReflectionSession,
  findReflectionForPeriod,
  getSettings,
  getUserProfile,
  listedTaskAchievement,
} from "@/lib/v3/repository";
import type { ReflectionType } from "@/lib/v3/types";

function PeriodPopup({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const { t } = useI18n();
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center px-6" data-testid="period-popup">
      <button type="button" className="absolute inset-0 bg-black/40" aria-label={t("cancel")} onClick={onClose} />
      <div className="liquid-glass liquid-glass-surface relative z-10 w-full max-w-[320px] overflow-hidden text-left">
        <p className="px-4 pt-3 pb-2 text-[13px] font-semibold text-center">{title}</p>
        <div className="px-3 pb-3 max-h-[70vh] overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}

function ChoiceButton({
  label,
  hint,
  selected,
  current,
  currentLabel,
  onClick,
}: {
  label: string;
  hint?: string;
  selected?: boolean;
  current?: boolean;
  currentLabel?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full rounded-xl px-3 py-2.5 text-left",
        selected ? "bg-foreground/10" : "hover:bg-foreground/5",
      )}
    >
      <span className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium">{label}</span>
        {current && currentLabel ? (
          <span className="text-[11px] font-semibold text-accent">{currentLabel}</span>
        ) : null}
      </span>
      {hint ? <span className="block text-xs text-muted-foreground mt-0.5">{hint}</span> : null}
    </button>
  );
}

export function DailyPeriodButton({
  date,
  onChange,
}: {
  date: LocalDate;
  onChange: (date: LocalDate) => void;
}) {
  const { t, formatDateStr } = useI18n();
  const today = todayLocalDate();
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(() => toLocalMonth(date));
  const weekStartsOn = getSettings().weekStartsOn;
  const label = formatDateStr(date, { month: "long", day: "numeric", year: "numeric" });
  const relative =
    date === today
      ? t("todayLabel")
      : date === addDays(today, 1)
        ? t("planTomorrow")
        : date === addDays(today, -1)
          ? t("planYesterday")
          : formatDateStr(date, { weekday: "long" });

  const openPicker = () => {
    setMonth(toLocalMonth(date));
    setOpen(true);
  };

  const start = localMonthStart(month);
  const end = localMonthEnd(month);
  const pad = (weekdayOf(start) - weekStartsOn + 7) % 7;
  const cells: Array<LocalDate | null> = Array.from({ length: pad }, () => null);
  let cursor = start;
  while (cursor <= end) {
    cells.push(cursor);
    cursor = addDays(cursor, 1);
  }
  const weekdayLabels = Array.from({ length: 7 }, (_, index) => {
    const day = addDays(startOfWeek(today, weekStartsOn), index);
    return formatDateStr(day, { weekday: "narrow" });
  });

  return (
    <div className="mb-3">
      <button
        type="button"
        data-testid="period-trigger"
        onClick={openPicker}
        className="text-left"
      >
        <span className="block text-lg font-semibold tracking-tight">{label}</span>
        <span className="block text-sm text-muted-foreground mt-0.5">
          {date === today ? t("todayLabel") : relative}
        </span>
      </button>
      {open && (
        <PeriodPopup title={label} onClose={() => setOpen(false)}>
          <div className="flex items-center justify-between mb-2">
            <button
              type="button"
              className="text-sm px-2 py-1"
              onClick={() => setMonth(toLocalMonth(addMonths(localMonthStart(month), -1)))}
            >
              {t("planPrevPeriod")}
            </button>
            <span className="text-sm font-medium">
              {formatDateStr(start, { month: "long", year: "numeric" })}
            </span>
            <button
              type="button"
              className="text-sm px-2 py-1"
              onClick={() => setMonth(toLocalMonth(addMonths(localMonthStart(month), 1)))}
            >
              {t("planNextPeriod")}
            </button>
          </div>
          <div className="grid grid-cols-7 gap-1 mb-1">
            {weekdayLabels.map((name, index) => (
              <span key={`${name}-${index}`} className="text-center text-[10px] text-muted-foreground">
                {name}
              </span>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {cells.map((day, index) =>
              day ? (
                <button
                  key={day}
                  type="button"
                  data-date={day}
                  data-today={day === today ? "true" : "false"}
                  aria-current={day === date ? "date" : undefined}
                  onClick={() => {
                    onChange(day);
                    setOpen(false);
                  }}
                  className={cn(
                    "h-9 rounded-full text-sm",
                    day === date && "bg-foreground text-background",
                    day === today && day !== date && "text-accent font-semibold",
                  )}
                >
                  {Number(day.slice(8))}
                </button>
              ) : (
                <span key={`pad-${index}`} />
              ),
            )}
          </div>
          <button
            type="button"
            className="mt-3 w-full text-sm font-semibold text-accent py-2"
            onClick={() => {
              onChange(today);
              setOpen(false);
            }}
          >
            {t("todayLabel")}
          </button>
        </PeriodPopup>
      )}
    </div>
  );
}

export function WeeklyPeriodButton({
  weekStart,
  onChange,
}: {
  weekStart: LocalDate;
  onChange: (weekStart: LocalDate) => void;
}) {
  const { t, formatDateStr } = useI18n();
  const today = todayLocalDate();
  const weekStartsOn = getSettings().weekStartsOn;
  const thisWeek = startOfWeek(today, weekStartsOn);
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(() => toLocalMonth(weekStart));
  const labelWeeks = weeksOverlappingMonth(localMonthStart(toLocalMonth(weekStart)), weekStartsOn);
  const weeks = weeksOverlappingMonth(localMonthStart(month), weekStartsOn);
  const index = Math.max(0, labelWeeks.findIndex((week) => week.start === weekStart));
  const range = `${formatDateStr(weekStart, { month: "short", day: "numeric" })} – ${formatDateStr(endOfWeek(weekStart, weekStartsOn), { month: "short", day: "numeric" })}`;
  const numberLabel = t("planWeekNumber").replace("{n}", String(index + 1));
  const label = weekStart === thisWeek ? `${t("planThisWeek")} · ${range}` : `${numberLabel} · ${range}`;

  return (
    <div className="mb-3">
      <button type="button" data-testid="period-trigger" onClick={() => { setMonth(toLocalMonth(weekStart)); setOpen(true); }} className="text-left">
        <span className="block text-lg font-semibold tracking-tight">{label}</span>
      </button>
      {open && (
        <PeriodPopup title={formatDateStr(localMonthStart(month), { month: "long", year: "numeric" })} onClose={() => setOpen(false)}>
          <div className="flex items-center justify-between mb-2">
            <button type="button" className="text-sm px-2 py-1" onClick={() => setMonth(toLocalMonth(addMonths(localMonthStart(month), -1)))}>
              {t("planPrevPeriod")}
            </button>
            <button type="button" className="text-sm px-2 py-1" onClick={() => setMonth(toLocalMonth(addMonths(localMonthStart(month), 1)))}>
              {t("planNextPeriod")}
            </button>
          </div>
          <div className="space-y-1">
            {weeks.map((week, weekIndex) => (
              <ChoiceButton
                key={week.start}
                label={t("planWeekNumber").replace("{n}", String(weekIndex + 1))}
                hint={`${formatDateStr(week.start, { month: "short", day: "numeric" })} – ${formatDateStr(week.end, { month: "short", day: "numeric" })}`}
                selected={week.start === weekStart}
                current={week.start === thisWeek}
                currentLabel={t("planThisWeek")}
                onClick={() => {
                  onChange(week.start);
                  setOpen(false);
                }}
              />
            ))}
          </div>
        </PeriodPopup>
      )}
    </div>
  );
}

export function MonthlyPeriodButton({
  month,
  onChange,
}: {
  month: LocalMonth;
  onChange: (month: LocalMonth) => void;
}) {
  const { t, formatDateStr, locale } = useI18n();
  const todayMonth = toLocalMonth(todayLocalDate());
  const [open, setOpen] = useState(false);
  const [year, setYear] = useState(() => Number(month.slice(0, 4)));
  const monthName = formatDateStr(localMonthStart(month), { month: "long", year: "numeric" });
  const label = month === todayMonth ? `${t("planThisMonth")} · ${monthName}` : monthName;

  return (
    <div className="mb-3">
      <button type="button" data-testid="period-trigger" onClick={() => { setYear(Number(month.slice(0, 4))); setOpen(true); }} className="text-left">
        <span className="block text-lg font-semibold tracking-tight">{label}</span>
      </button>
      {open && (
        <PeriodPopup title={String(year)} onClose={() => setOpen(false)}>
          <div className="flex items-center justify-between mb-2">
            <button type="button" className="text-sm px-2 py-1" onClick={() => setYear((value) => value - 1)}>{t("planPrevPeriod")}</button>
            <span className="text-sm font-medium">{year}</span>
            <button type="button" className="text-sm px-2 py-1" onClick={() => setYear((value) => value + 1)}>{t("planNextPeriod")}</button>
          </div>
          <div className="grid grid-cols-3 gap-1">
            {Array.from({ length: 12 }, (_, index) => {
              const key = `${year}-${String(index + 1).padStart(2, "0")}`;
              const name = new Date(`${key}-01T00:00:00`).toLocaleDateString(locale === "ja" ? "ja-JP" : "en-US", { month: "short" });
              return (
                <ChoiceButton
                  key={key}
                  label={name}
                  selected={key === month}
                  current={key === todayMonth}
                  currentLabel={t("planThisMonth")}
                  onClick={() => {
                    onChange(key);
                    setOpen(false);
                  }}
                />
              );
            })}
          </div>
        </PeriodPopup>
      )}
    </div>
  );
}

function planningStartYear(): number {
  const created = getUserProfile().createdAt;
  const year = Number(new Date(created).getFullYear());
  return Number.isFinite(year) ? year : Number(todayLocalDate().slice(0, 4));
}

export function YearPeriodButton({
  year,
  onChange,
}: {
  year: number;
  onChange: (year: number) => void;
}) {
  const { t } = useI18n();
  const thisYear = Number(todayLocalDate().slice(0, 4));
  const [open, setOpen] = useState(false);
  const start = planningStartYear();
  const end = Math.max(start, thisYear + 5);
  const years = Array.from({ length: end - start + 1 }, (_, index) => start + index);
  const label = year === thisYear ? `${t("planThisYear")} · ${year}` : String(year);

  return (
    <div className="mb-3">
      <button type="button" data-testid="period-trigger" onClick={() => setOpen(true)} className="text-left">
        <span className="block text-lg font-semibold tracking-tight">{label}</span>
      </button>
      {open && (
        <PeriodPopup title={t("planFuture")} onClose={() => setOpen(false)}>
          <div className="space-y-1">
            {years.map((value) => (
              <ChoiceButton
                key={value}
                label={String(value)}
                selected={value === year}
                current={value === thisYear}
                currentLabel={t("planThisYear")}
                onClick={() => {
                  onChange(value);
                  setOpen(false);
                }}
              />
            ))}
          </div>
        </PeriodPopup>
      )}
    </div>
  );
}

/** Reflection state and task achievement for the period already on screen. */
export function PeriodFacts({
  type,
  anchorDate,
  from,
  to,
}: {
  type: ReflectionType;
  anchorDate: LocalDate;
  from: LocalDate;
  to: LocalDate;
}) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const weekStartsOn = getSettings().weekStartsOn;
  const period = reflectionPeriod(type, anchorDate, weekStartsOn);
  const session = findReflectionForPeriod(type, period.start);
  const done = session?.status === "completed";
  const achievement = listedTaskAchievement(from, to);
  const score = t("planPeriodTasks")
    .replace("{completed}", String(achievement.completed))
    .replace("{total}", String(achievement.total));

  return (
    <div className="flex items-center justify-between gap-3 mb-3 px-0.5">
      <p className="text-sm text-muted-foreground" data-testid="period-achievement">
        {score}
      </p>
      {done ? (
        <p className="text-sm font-medium" data-testid="period-reflection">
          {t("planReflected")}
        </p>
      ) : (
        <button
          type="button"
          data-testid="period-reflection"
          className="text-sm font-medium text-accent"
          onClick={() => {
            const next = createReflectionSession({ type, anchorDate });
            navigate(`/plan/reflection/${next.id}`);
          }}
        >
          {t("reflectionEntry")}
        </button>
      )}
    </div>
  );
}
