import { useEffect, useState } from "react";
import { Drawer as DrawerPrimitive } from "vaul";
import { useI18n } from "@/lib/i18n";
import { setOverlayChrome } from "@/lib/overlay-chrome";
import { addDays, endOfWeek, startOfWeek, todayLocalDate, type LocalDate } from "@/lib/v3/local-date";
import { getSettings } from "@/lib/v3/repository";
import type { FutureTarget, ReflectionType } from "@/lib/v3/types";

export type PostponeResult =
  | { kind: "date"; date: LocalDate }
  | { kind: "future"; target: FutureTarget }
  | { kind: "box" };

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  type: ReflectionType;
  onConfirm: (result: PostponeResult) => void;
  fromSomeday?: boolean;
}

export function ReflectionPostponeSheet({
  open,
  onOpenChange,
  type,
  onConfirm,
  fromSomeday = false,
}: Props) {
  const { t, formatDateStr } = useI18n();
  const today = todayLocalDate();
  const weekStartsOn = getSettings().weekStartsOn;
  const [date, setDate] = useState(addDays(today, 1));
  const [month, setMonth] = useState(today.slice(0, 7));
  const [futureMode, setFutureMode] = useState<"month" | "date" | "someday">("month");

  useEffect(() => {
    if (!open) return;
    setOverlayChrome(true);
    return () => setOverlayChrome(false);
  }, [open]);

  const weekChoices = [0, 1, 2, 3].map((i) => {
    const start = addDays(startOfWeek(today, weekStartsOn), i * 7);
    return { start, end: endOfWeek(start, weekStartsOn) };
  });

  return (
    <DrawerPrimitive.Root open={open} onOpenChange={onOpenChange} shouldScaleBackground={false}>
      <DrawerPrimitive.Portal>
        <DrawerPrimitive.Overlay className="fixed inset-0 z-50 bg-black/20 backdrop-blur-[1px]" />
        <DrawerPrimitive.Content className="fixed inset-x-0 bottom-0 z-50 flex flex-col rounded-t-2xl border bg-background max-h-[78vh] outline-none">
          <div className="mx-auto mt-2.5 h-1.5 w-10 rounded-full bg-muted shrink-0" />
          <div className="px-5 pt-3 pb-2">
            <DrawerPrimitive.Title className="text-base font-semibold">
              {t("reflectionPostponeTo")}
            </DrawerPrimitive.Title>
          </div>
          <div className="px-4 pb-6 space-y-2 overflow-y-auto">
            <Choice
              label={t("postponeToBox")}
              onClick={() => onConfirm({ kind: "box" })}
            />
            {type === "daily" ? (
              <>
                <Choice
                  label={t("reflectionTomorrow")}
                  onClick={() => onConfirm({ kind: "date", date: addDays(today, 1) })}
                />
                <Choice
                  label={t("reflectionThisWeek")}
                  onClick={() => onConfirm({ kind: "date", date: endOfWeek(today, weekStartsOn) })}
                />
                <Choice
                  label={t("reflectionNextWeek")}
                  onClick={() =>
                    onConfirm({
                      kind: "date",
                      date: addDays(startOfWeek(today, weekStartsOn), 7),
                    })
                  }
                />
                <label className="block px-1 pt-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {t("reflectionChooseDate")}
                </label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full rounded-xl bg-secondary/50 px-3 py-3 text-sm"
                />
                <Choice
                  label={formatDateStr(date, { month: "long", day: "numeric" })}
                  onClick={() => onConfirm({ kind: "date", date })}
                />
              </>
            ) : null}

            {type === "weekly" ? (
              <>
                {weekChoices.map((w) => (
                  <Choice
                    key={w.start}
                    label={`${formatDateStr(w.start, { month: "short", day: "numeric" })} – ${formatDateStr(w.end, { month: "short", day: "numeric" })}`}
                    onClick={() => onConfirm({ kind: "date", date: w.start })}
                  />
                ))}
                <label className="block px-1 pt-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {t("reflectionChooseWeek")}
                </label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full rounded-xl bg-secondary/50 px-3 py-3 text-sm"
                />
                <Choice
                  label={formatDateStr(startOfWeek(date, weekStartsOn), {
                    month: "long",
                    day: "numeric",
                  })}
                  onClick={() =>
                    onConfirm({ kind: "date", date: startOfWeek(date, weekStartsOn) })
                  }
                />
              </>
            ) : null}

            {type === "monthly" ? (
              <>
                <label className="block px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {t("reflectionChooseMonth")}
                </label>
                <input
                  type="month"
                  value={month}
                  onChange={(e) => setMonth(e.target.value)}
                  className="w-full rounded-xl bg-secondary/50 px-3 py-3 text-sm"
                />
                <Choice
                  label={month}
                  onClick={() => onConfirm({ kind: "date", date: `${month}-01` })}
                />
              </>
            ) : null}

            {type === "future" ? (
              <>
                {fromSomeday && futureMode !== "someday" ? (
                  <p className="px-1 pb-1 text-sm text-muted-foreground">
                    {t("reflectionSomedayKeepChildren")}
                  </p>
                ) : null}
                <div className="flex gap-2 pb-2">
                  {(["month", "date", "someday"] as const).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setFutureMode(mode)}
                      className={`flex-1 min-h-11 rounded-xl text-sm font-medium ${
                        futureMode === mode ? "bg-accent/10 text-foreground" : "bg-secondary/40 text-muted-foreground"
                      }`}
                    >
                      {mode === "month"
                        ? t("planTargetMonth")
                        : mode === "date"
                          ? t("planTargetDate")
                          : t("planTargetSomeday")}
                    </button>
                  ))}
                </div>
                {futureMode === "month" ? (
                  <>
                    <input
                      type="month"
                      value={month}
                      onChange={(e) => setMonth(e.target.value)}
                      className="w-full rounded-xl bg-secondary/50 px-3 py-3 text-sm"
                    />
                    <Choice
                      label={month}
                      onClick={() => onConfirm({ kind: "future", target: { type: "month", value: month } })}
                    />
                  </>
                ) : null}
                {futureMode === "date" ? (
                  <>
                    <input
                      type="date"
                      value={date}
                      onChange={(e) => setDate(e.target.value)}
                      className="w-full rounded-xl bg-secondary/50 px-3 py-3 text-sm"
                    />
                    <Choice
                      label={formatDateStr(date, { month: "long", day: "numeric" })}
                      onClick={() => onConfirm({ kind: "future", target: { type: "date", value: date } })}
                    />
                  </>
                ) : null}
                {futureMode === "someday" ? (
                  <Choice
                    label={t("planTargetSomeday")}
                    onClick={() => onConfirm({ kind: "future", target: { type: "someday" } })}
                  />
                ) : null}
              </>
            ) : null}
          </div>
        </DrawerPrimitive.Content>
      </DrawerPrimitive.Portal>
    </DrawerPrimitive.Root>
  );
}

function Choice({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full min-h-11 rounded-xl bg-secondary/50 px-4 py-3 text-left text-sm font-medium"
    >
      {label}
    </button>
  );
}
