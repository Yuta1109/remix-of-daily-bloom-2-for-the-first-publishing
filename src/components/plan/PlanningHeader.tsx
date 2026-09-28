import type { ReactNode } from "react";
import { UserButton } from "@/components/UserButton";
import { CycleNav, type CycleId } from "@/components/plan/CycleNav";
import { ReflectionAnnouncement } from "@/components/plan/ReflectionAnnouncement";
import { useI18n } from "@/lib/i18n";

/**
 * Planning chrome. The title matches Progress, ToDo, and Note.
 * The cycle bar is a separate Liquid Glass layer, fixed above the scrolling
 * page so the rounded content frame can pass underneath it.
 */
export function PlanningShell({
  current,
  trailing,
  children,
}: {
  current: CycleId;
  trailing?: ReactNode;
  children?: ReactNode;
}) {
  const { t } = useI18n();
  return (
    <div className="app-shell-page">
      <div className="app-shell-header px-4 pb-1">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-[28px] font-bold tracking-tight leading-tight">
            {t("planningPageTitle")}
          </h1>
          <div className="flex items-center gap-2">
            {trailing}
            <UserButton />
          </div>
        </div>
        <div className="empty:hidden mt-1 flex justify-end">
          <ReflectionAnnouncement />
        </div>
      </div>
      <div className="app-shell-scroll">
        <div className="sticky top-0 z-30 px-3 pt-1">
          <CycleNav current={current} />
        </div>
        <div
          data-testid="planning-frame"
          className="mx-3 mt-2 rounded-[1.75rem] border border-foreground/10 bg-card/70 px-3 py-4"
        >
          {children}
        </div>
      </div>
    </div>
  );
}
