import { useMemo, useState } from "react";
import { ChevronLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { ConfirmMessage } from "@/components/notes/ConfirmMessage";
import { GlassControl } from "@/components/GlassControl";
import { DailyTaskSheet, type DailyTaskSheetRequest } from "@/components/plan/DailyTaskSheet";
import { PlanItemSheet, type PlanSheetRequest } from "@/components/plan/PlanItemSheet";
import { useI18n, type TranslationKeys } from "@/lib/i18n";
import {
  deletePostponeItem,
  groupPostponeItems,
  incorporatePostponeItem,
  postponeGroupParents,
  postponeGroupShape,
  postponeIncorporateChoices,
  type ReplanRef,
} from "@/lib/v3/replan";
import { getPlanItem, getPostponeBoxItems } from "@/lib/v3/repository";
import type { PlanItem } from "@/lib/v3/types";

const LEVEL_KEY: Record<PlanItem["level"] | "daily", TranslationKeys> = {
  future: "planFuture",
  monthly: "planMonthly",
  weekly: "planWeekly",
  daily: "planDaily",
};

function keyOf(ref: ReplanRef): string {
  return `${ref.kind}:${ref.id}`;
}

/**
 * Postpone Box is a Replan subpage. Items stay here without a date until
 * they are edited, deleted, grouped, or attached to an existing plan.
 */
export default function PostponeBox() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [refreshTick, setRefreshTick] = useState(0);
  const [selected, setSelected] = useState<string[]>([]);
  const [incorporateKey, setIncorporateKey] = useState<string | null>(null);
  const [incorporateParent, setIncorporateParent] = useState("");
  const [groupTitle, setGroupTitle] = useState("");
  const [groupParent, setGroupParent] = useState("");
  const [deleteRef, setDeleteRef] = useState<ReplanRef | null>(null);
  const [planRequest, setPlanRequest] = useState<PlanSheetRequest | null>(null);
  const [taskRequest, setTaskRequest] = useState<DailyTaskSheetRequest | null>(null);

  const refresh = () => setRefreshTick((value) => value + 1);

  const items = useMemo(
    () => getPostponeBoxItems(),
    // refreshTick reloads after edit, delete, group, and incorporate.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [refreshTick],
  );
  const rows: { ref: ReplanRef; title: string; level: PlanItem["level"] | "daily"; parentTitle: string }[] = [
    ...items.plans.map((plan) => ({
      ref: { kind: "plan" as const, id: plan.id },
      title: plan.title,
      level: plan.level,
      parentTitle: plan.parentPlanId ? getPlanItem(plan.parentPlanId)?.title ?? "" : "",
    })),
    ...items.tasks.map((task) => ({
      ref: { kind: "task" as const, id: task.id },
      title: task.title,
      level: "daily" as const,
      parentTitle: task.parentPlanId ? getPlanItem(task.parentPlanId)?.title ?? "" : "",
    })),
  ];

  const selectedRefs = rows.map((row) => row.ref).filter((ref) => selected.includes(keyOf(ref)));
  const shape = postponeGroupShape(selectedRefs);
  const groupParents = shape
    ? postponeGroupParents(shape.parent).filter(
        (plan) => !selectedRefs.some((ref) => ref.kind === "plan" && ref.id === plan.id),
      )
    : [];

  const toggle = (ref: ReplanRef) => {
    const key = keyOf(ref);
    setSelected((current) => (current.includes(key) ? current.filter((item) => item !== key) : [...current, key]));
  };

  const openEdit = (ref: ReplanRef) => {
    if (ref.kind === "task") {
      setTaskRequest({ mode: "edit", taskId: ref.id });
      return;
    }
    const plan = getPlanItem(ref.id);
    if (!plan) return;
    setPlanRequest({ mode: "edit", level: plan.level, planId: plan.id });
  };

  return (
    <div className="app-shell-page">
      <div className="app-shell-header px-4 pb-2">
        <div className="flex items-center gap-2 min-h-11">
          <GlassControl nativeGlass={{ role: "back" }} onClick={() => navigate("/plan/replan")} aria-label={t("back")}>
            <ChevronLeft className="w-5 h-5" aria-hidden="true" />
          </GlassControl>
          <div className="min-w-0">
            <h1 className="text-[28px] font-bold tracking-tight">{t("postponeBox")}</h1>
            <p className="text-sm text-muted-foreground">{t("postponeNoDate")}</p>
          </div>
        </div>
      </div>
      <div className="app-shell-scroll px-4 pb-8 space-y-3">
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("postponeBoxEmpty")}</p>
        ) : null}
        {rows.map((row) => {
          const key = keyOf(row.ref);
          const choices = incorporateKey === key ? postponeIncorporateChoices(row.ref) : [];
          return (
            <div
              key={key}
              className="rounded-2xl bg-card shadow-soft px-4 py-3"
              data-testid={row.ref.kind === "task" ? "postpone-box-task" : "postpone-box-plan"}
            >
              <label className="flex items-start gap-3">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={selected.includes(key)}
                  onChange={() => toggle(row.ref)}
                  aria-label={row.title}
                />
                <span className="min-w-0">
                  <span className="block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                    {t(LEVEL_KEY[row.level])}
                  </span>
                  <span className="block text-sm font-medium truncate">{row.title}</span>
                  {row.parentTitle ? (
                    <span className="block text-xs text-muted-foreground truncate">{row.parentTitle}</span>
                  ) : null}
                </span>
              </label>
              <div className="mt-2 flex flex-wrap gap-2">
                <button type="button" className="text-sm font-medium px-2 py-1" onClick={() => openEdit(row.ref)}>
                  {t("postponeEdit")}
                </button>
                <button
                  type="button"
                  className="text-sm font-medium px-2 py-1 text-destructive"
                  onClick={() => setDeleteRef(row.ref)}
                >
                  {t("postponeDelete")}
                </button>
                <button
                  type="button"
                  className="text-sm font-medium px-2 py-1"
                  onClick={() => {
                    setIncorporateKey(key);
                    setIncorporateParent("");
                  }}
                >
                  {t("postponeIncorporate")}
                </button>
              </div>
              {incorporateKey === key ? (
                <div className="mt-2 space-y-2">
                  <select
                    data-testid="postpone-incorporate-target"
                    className="w-full rounded-xl bg-secondary/60 px-3 py-2 text-sm"
                    value={incorporateParent}
                    onChange={(event) => setIncorporateParent(event.target.value)}
                  >
                    <option value="">{t("postponeIncorporateRoot")}</option>
                    {choices.map((plan) => (
                      <option key={plan.id} value={plan.id}>
                        {plan.title}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    data-testid="postpone-incorporate-apply"
                    className="text-sm font-semibold"
                    onClick={() => {
                      incorporatePostponeItem(row.ref, incorporateParent || undefined);
                      setIncorporateKey(null);
                      setSelected((current) => current.filter((item) => item !== key));
                      refresh();
                    }}
                  >
                    {t("postponeIncorporateApply")}
                  </button>
                </div>
              ) : null}
            </div>
          );
        })}

        {selected.length >= 2 ? (
          <section className="rounded-2xl bg-card shadow-soft px-4 py-3 space-y-2" data-testid="postpone-group">
            <h2 className="text-sm font-semibold">{t("postponeGroup")}</h2>
            {shape ? (
              <>
                <input
                  data-testid="postpone-group-title"
                  value={groupTitle}
                  onChange={(event) => setGroupTitle(event.target.value)}
                  placeholder={t("postponeGroupTitle")}
                  className="w-full rounded-xl bg-secondary/60 px-3 py-2 text-sm"
                />
                {groupParents.length > 0 ? (
                  <select
                    data-testid="postpone-group-parent"
                    className="w-full rounded-xl bg-secondary/60 px-3 py-2 text-sm"
                    value={groupParent}
                    onChange={(event) => setGroupParent(event.target.value)}
                  >
                    <option value="">{t("postponeGroupTitle")}</option>
                    {groupParents.map((plan) => (
                      <option key={plan.id} value={plan.id}>
                        {plan.title}
                      </option>
                    ))}
                  </select>
                ) : null}
                <button
                  type="button"
                  data-testid="postpone-group-apply"
                  disabled={!groupParent && !groupTitle.trim()}
                  className="text-sm font-semibold disabled:opacity-40"
                  onClick={() => {
                    groupPostponeItems(
                      selectedRefs,
                      groupParent ? { parentId: groupParent } : { title: groupTitle },
                    );
                    setSelected([]);
                    setGroupTitle("");
                    setGroupParent("");
                    refresh();
                  }}
                >
                  {t("postponeGroupApply")}
                </button>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">{t("postponeGroupMixed")}</p>
            )}
          </section>
        ) : null}
      </div>

      <ConfirmMessage
        open={!!deleteRef}
        message={t("postponeDeleteConfirm")}
        confirmLabel={t("postponeDelete")}
        cancelLabel={t("cancel")}
        testId="postpone-delete-confirm"
        onCancel={() => setDeleteRef(null)}
        onConfirm={() => {
          if (!deleteRef) return;
          deletePostponeItem(deleteRef);
          setSelected((current) => current.filter((item) => item !== keyOf(deleteRef)));
          setDeleteRef(null);
          refresh();
        }}
      />
      <PlanItemSheet
        request={planRequest}
        onOpenChange={(open) => !open && setPlanRequest(null)}
        onSaved={refresh}
        onChanged={refresh}
      />
      <DailyTaskSheet
        request={taskRequest}
        onOpenChange={(open) => !open && setTaskRequest(null)}
        onSaved={refresh}
        onChanged={refresh}
      />
    </div>
  );
}
