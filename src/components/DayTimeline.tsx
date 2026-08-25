import { useEffect, useMemo, useRef, useState } from "react";
import { Hand } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { colorHslFor, type CalendarEvent } from "@/lib/events-store";
import { markWeekSwipeHintSeen, weekSwipeHintSeen } from "@/lib/calendar-prefs";
import {
  placeTimedEvents,
  timedSliceOnDate,
  timelineWindow,
} from "@/lib/week-timeline";

const PX_PER_MIN = 1.15;

type Props = {
  date: string;
  events: CalendarEvent[];
  onOpenEvent: (id: string, date: string) => void;
};

export function DayTimeline({ date, events, onOpenEvent }: Props) {
  const { t, locale } = useI18n();
  const [hint, setHint] = useState(() => !weekSwipeHintSeen());
  const scrollerRef = useRef<HTMLDivElement>(null);

  const allDay = events.filter((e) => e.allDay);
  const slices = useMemo(
    () =>
      events
        .filter((e) => !e.allDay)
        .map((event) => {
          const slice = timedSliceOnDate(event, date);
          return slice ? { event, ...slice } : null;
        })
        .filter((x): x is NonNullable<typeof x> => !!x),
    [events, date],
  );

  const placed = useMemo(() => placeTimedEvents(slices), [slices]);
  const win = useMemo(() => timelineWindow(slices), [slices]);
  const maxCols = Math.max(1, ...placed.map((p) => p.cols), 1);
  const needsSwipe = maxCols > 2;
  const visibleCols = Math.min(2, maxCols);
  const height = Math.max(120, (win.end - win.start) * PX_PER_MIN);
  const ticks: number[] = [];
  for (let m = win.start; m <= win.end; m += 30) ticks.push(m);

  const fmt = (min: number) => {
    const h = Math.floor(min / 60);
    const mm = min % 60;
    return `${h}:${String(mm).padStart(2, "0")}`;
  };

  useEffect(() => {
    if (!needsSwipe) setHint(false);
  }, [needsSwipe]);

  const dismissHint = () => {
    setHint(false);
    markWeekSwipeHintSeen();
  };

  return (
    <div className="flex flex-col min-h-0 flex-1">
      {allDay.length > 0 && (
        <div className="shrink-0 px-3 pb-2 space-y-1">
          {allDay.map((e) => (
            <button
              key={e.id}
              type="button"
              onClick={() => onOpenEvent(e.id, date)}
              className="w-full text-left rounded-xl px-3 py-2 text-sm font-medium truncate"
              style={{
                backgroundColor: `hsl(${colorHslFor(e.color)} / 0.16)`,
                color: `hsl(${colorHslFor(e.color)})`,
              }}
            >
              {e.title}
            </button>
          ))}
        </div>
      )}

      {slices.length === 0 && allDay.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-10">{t("noEventsOnDay")}</p>
      ) : slices.length === 0 ? null : (
        <div className="relative flex-1 min-h-0 overflow-y-auto overscroll-contain px-2">
          <div className="flex" style={{ minHeight: height }}>
            <div className="w-12 shrink-0 relative">
              {ticks.map((m) => (
                <div
                  key={m}
                  className="absolute left-0 right-1 flex items-center gap-1"
                  style={{ top: (m - win.start) * PX_PER_MIN - 8 }}
                >
                  <span className="text-[10px] tabular-nums text-muted-foreground w-8 text-right">
                    {fmt(m)}
                  </span>
                  <span className="w-1.5 h-1.5 rounded-full border border-muted-foreground/50 bg-background shrink-0" />
                </div>
              ))}
              <div
                className="absolute top-1 bottom-1 w-px bg-border"
                style={{ left: "2.55rem" }}
              />
            </div>

            <div
              ref={scrollerRef}
              className={cn("flex-1 min-w-0 relative", needsSwipe && "overflow-x-auto snap-x snap-mandatory")}
              onScroll={() => {
                if (hint && (scrollerRef.current?.scrollLeft || 0) > 12) dismissHint();
              }}
              style={{ height }}
            >
              <div
                className="relative h-full"
                style={{
                  width: needsSwipe ? `${(maxCols / visibleCols) * 100}%` : "100%",
                  minWidth: "100%",
                }}
              >
                {placed.map((p) => {
                  const top = (p.startMin - win.start) * PX_PER_MIN;
                  const h = Math.max(28, (p.endMin - p.startMin) * PX_PER_MIN - 4);
                  const widthPct = 100 / p.cols;
                  const leftPct = (p.col / p.cols) * 100;
                  return (
                    <button
                      key={p.event.id}
                      type="button"
                      onClick={() => onOpenEvent(p.event.id, date)}
                      className="absolute rounded-xl bg-card shadow-soft border border-border/60 px-2 py-1.5 text-left overflow-hidden"
                      style={{
                        top,
                        height: h,
                        left: `calc(${leftPct}% + 4px)`,
                        width: `calc(${widthPct}% - 8px)`,
                      }}
                    >
                      <div
                        className="text-[11px] font-semibold tabular-nums truncate"
                        style={{ color: `hsl(${colorHslFor(p.event.color)})` }}
                      >
                        {fmt(p.startMin)} – {fmt(p.endMin)}
                      </div>
                      <div className="text-xs font-medium text-foreground leading-tight line-clamp-2 break-words">
                        {p.event.title}
                      </div>
                      {p.event.notes && h > 52 ? (
                        <div className="text-[10px] text-muted-foreground mt-0.5 line-clamp-2 break-words">
                          {p.event.notes}
                        </div>
                      ) : null}
                    </button>
                  );
                })}
              </div>

              {hint && needsSwipe && (
                <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none">
                  <div className="bg-foreground/80 text-background rounded-2xl px-4 py-3 text-xs font-medium flex items-center gap-2 shadow-float week-swipe-hint">
                    <Hand className="w-4 h-4 week-swipe-hand" />
                    {locale === "ja" ? "横にスワイプして予定を見る" : "Swipe sideways for more events"}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
