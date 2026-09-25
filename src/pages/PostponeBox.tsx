import { useState } from "react";
import { ChevronLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useI18n } from "@/lib/i18n";
import { todayLocalDate, type LocalDate } from "@/lib/v3/local-date";
import {
  assignPostponeBoxPlan,
  assignPostponeBoxTask,
  getPostponeBoxItems,
} from "@/lib/v3/repository";
import type { PlanItem, TaskItem } from "@/lib/v3/types";

/**
 * Undated holding area for postponed Tasks / Plans.
 * Does not change Future / Monthly / Weekly / Daily layout.
 */
export default function PostponeBox() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [, setTick] = useState(0);
  const items = getPostponeBoxItems();

  return (
    <div className="app-shell-page">
      <div className="app-shell-header px-4 pb-2">
        <button
          type="button"
          onClick={() => navigate("/plan")}
          className="flex items-center gap-1.5 text-sm text-muted-foreground mb-2"
        >
          <ChevronLeft className="w-4 h-4" />
          {t("back")}
        </button>
        <h1 className="text-[28px] font-bold tracking-tight">{t("postponeBox")}</h1>
      </div>
      <div className="app-shell-scroll px-4 pb-8 space-y-3">
        {items.tasks.length === 0 && items.plans.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("postponeBoxEmpty")}</p>
        ) : null}
        {items.tasks.map((task) => (
          <BoxTaskRow key={task.id} task={task} onAssigned={() => setTick((n) => n + 1)} />
        ))}
        {items.plans.map((plan) => (
          <BoxPlanRow key={plan.id} plan={plan} onAssigned={() => setTick((n) => n + 1)} />
        ))}
      </div>
    </div>
  );
}

function BoxTaskRow({ task, onAssigned }: { task: TaskItem; onAssigned: () => void }) {
  const { t, formatDateStr } = useI18n();
  const [date, setDate] = useState<LocalDate>(task.date || todayLocalDate());
  return (
    <div className="rounded-2xl bg-card shadow-soft px-4 py-3" data-testid="postpone-box-task">
      <p className="text-sm font-medium">{task.title}</p>
      <p className="text-xs text-muted-foreground mt-0.5">
        {formatDateStr(task.date, { month: "short", day: "numeric" })}
      </p>
      <div className="mt-2 flex items-center gap-2">
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="flex-1 rounded-xl bg-secondary/50 px-3 py-2 text-sm"
        />
        <button
          type="button"
          onClick={() => {
            assignPostponeBoxTask(task.id, date);
            onAssigned();
          }}
          className="text-sm font-semibold text-accent px-3 py-2 rounded-xl bg-accent/10"
        >
          {t("postponeBoxAssign")}
        </button>
      </div>
    </div>
  );
}

function BoxPlanRow({ plan, onAssigned }: { plan: PlanItem; onAssigned: () => void }) {
  const { t } = useI18n();
  const [date, setDate] = useState<LocalDate>(plan.periodStart ?? todayLocalDate());
  return (
    <div className="rounded-2xl bg-card shadow-soft px-4 py-3" data-testid="postpone-box-plan">
      <p className="text-sm font-medium">{plan.title}</p>
      <p className="text-xs text-muted-foreground mt-0.5">{plan.level}</p>
      <div className="mt-2 flex items-center gap-2">
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="flex-1 rounded-xl bg-secondary/50 px-3 py-2 text-sm"
        />
        <button
          type="button"
          onClick={() => {
            if (plan.level === "future") {
              assignPostponeBoxPlan(plan.id, { futureTarget: { type: "date", value: date } });
            } else {
              assignPostponeBoxPlan(plan.id, { periodStart: date });
            }
            onAssigned();
          }}
          className="text-sm font-semibold text-accent px-3 py-2 rounded-xl bg-accent/10"
        >
          {t("postponeBoxAssign")}
        </button>
      </div>
    </div>
  );
}
