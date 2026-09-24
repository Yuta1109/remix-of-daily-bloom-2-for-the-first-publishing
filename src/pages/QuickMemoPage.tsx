import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Trash2 } from "lucide-react";
import { ImagePickSheet } from "@/components/ImagePickSheet";
import { DailyTaskSheet, type DailyTaskSheetRequest } from "@/components/plan/DailyTaskSheet";
import { PlanItemSheet, type PlanSheetRequest } from "@/components/plan/PlanItemSheet";
import { QuickMemoEventConvertSheet } from "@/components/notes/QuickMemoEventConvertSheet";
import { useI18n } from "@/lib/i18n";
import { pickLocalImageAttachment, noteImageSrc } from "@/lib/note-image";
import type { ImageSource } from "@/lib/ocr";
import { NOTES_HOME_PATH, noteDetailPath } from "@/lib/v3/notes-view";
import {
  convertQuickMemoToNote,
  deleteQuickMemo,
  getQuickMemo,
  getQuickMemoConversion,
  getSettings,
  updateQuickMemo,
} from "@/lib/v3/repository";
import {
  endOfWeek,
  startOfWeek,
  toLocalMonth,
  todayLocalDate,
  localMonthEnd,
  localMonthStart,
} from "@/lib/v3/local-date";
import type { PlanLevel } from "@/lib/v3/types";

function firstLine(text: string): string {
  return text.trim().split("\n")[0]?.trim() ?? "";
}

export default function QuickMemoPage() {
  const { t, locale } = useI18n();
  const navigate = useNavigate();
  const { quickMemoId = "" } = useParams();
  const id = decodeURIComponent(quickMemoId);
  const [, setTick] = useState(0);
  const [pickOpen, setPickOpen] = useState(false);
  const [taskRequest, setTaskRequest] = useState<DailyTaskSheetRequest | null>(null);
  const [planRequest, setPlanRequest] = useState<PlanSheetRequest | null>(null);
  const [eventOpen, setEventOpen] = useState(false);
  const [planLevelOpen, setPlanLevelOpen] = useState(false);
  const memo = getQuickMemo(id);
  const weeklyOn = getSettings().weeklyPlanningEnabled;
  const convertedTask = getQuickMemoConversion(id, "task");
  const convertedPlan = getQuickMemoConversion(id, "plan");
  const convertedEvent = getQuickMemoConversion(id, "event");
  const convertedNote = getQuickMemoConversion(id, "note");

  useEffect(() => {
    if (!memo) navigate(NOTES_HOME_PATH, { replace: true });
  }, [memo, navigate]);

  if (!memo) return null;

  const formatTs = (iso: string) =>
    new Date(iso).toLocaleString(locale === "ja" ? "ja-JP" : "en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });

  const onPick = async (source: ImageSource) => {
    setPickOpen(false);
    const image = await pickLocalImageAttachment(source);
    if (!image) return;
    updateQuickMemo(id, { image });
    setTick((n) => n + 1);
  };

  const draft = {
    title: firstLine(memo.text),
    note: memo.text.trim() || undefined,
  };

  const openTaskConvert = () => {
    setTaskRequest({
      mode: "create",
      date: todayLocalDate(),
      createdFrom: "quickMemo",
      quickMemoId: id,
      draft,
    });
  };

  const openPlanLevel = (level: PlanLevel) => {
    const today = todayLocalDate();
    const weekStartsOn = getSettings().weekStartsOn;
    setPlanLevelOpen(false);
    setPlanRequest({
      mode: "create",
      level,
      createdFrom: "quickMemo",
      quickMemoId: id,
      draft,
      periodStart:
        level === "monthly"
          ? localMonthStart(toLocalMonth(today))
          : level === "weekly"
            ? startOfWeek(today, weekStartsOn)
            : undefined,
      periodEnd:
        level === "monthly"
          ? localMonthEnd(toLocalMonth(today))
          : level === "weekly"
            ? endOfWeek(today, weekStartsOn)
            : undefined,
    });
  };

  return (
    <div className="app-shell-page" data-testid="quick-memo-page">
      <div className="app-shell-header px-4 pb-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label={t("notesBack")}
            onClick={() => navigate(NOTES_HOME_PATH)}
            className="inline-flex items-center justify-center w-9 h-9 rounded-full"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="flex-1 text-lg font-semibold">{t("notesSectionQuickMemo")}</h1>
          <button
            type="button"
            aria-label={t("notesDelete")}
            data-testid="quick-memo-delete"
            onClick={() => {
              deleteQuickMemo(id);
              navigate(NOTES_HOME_PATH, { replace: true });
            }}
            className="inline-flex items-center justify-center w-9 h-9 rounded-full text-foreground/70"
          >
            <Trash2 className="w-5 h-5" />
          </button>
        </div>
      </div>
      <div className="app-shell-scroll px-4">
        <textarea
          value={memo.text}
          data-testid="quick-memo-editor"
          onChange={(e) => {
            updateQuickMemo(id, { text: e.target.value });
            setTick((n) => n + 1);
          }}
          placeholder={t("notesQuickMemoPlaceholder")}
          className="w-full min-h-[160px] bg-transparent outline-none text-[17px] leading-relaxed resize-none py-2"
        />
        {memo.image && noteImageSrc(memo.image) ? (
          <div className="mb-3">
            <img src={noteImageSrc(memo.image)} alt="" className="max-h-48 rounded-lg object-cover" />
            <button
              type="button"
              className="mt-1 text-[13px] text-muted-foreground min-h-11"
              onClick={() => {
                updateQuickMemo(id, { image: undefined });
                setTick((n) => n + 1);
              }}
            >
              {t("notesRemoveImage")}
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="text-[15px] text-accent min-h-11"
            onClick={() => setPickOpen(true)}
          >
            {t("notesAttachImage")}
          </button>
        )}
        <p className="text-[12px] text-muted-foreground mt-4">
          {t("notesCreatedAt")}: {formatTs(memo.createdAt)}
        </p>
        <p className="text-[12px] text-muted-foreground">
          {t("notesUpdatedAt")}: {formatTs(memo.updatedAt)}
        </p>

        <div className="mt-4 space-y-1" data-testid="quick-memo-convert-menu">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t("notesConvertMenu")}
          </p>
          <button
            type="button"
            data-testid="quick-memo-convert-task"
            className="block w-full text-left text-[15px] text-accent min-h-11"
            onClick={openTaskConvert}
          >
            {convertedTask ? t("notesConvertedToTask") : t("notesConvertToTask")}
          </button>
          <button
            type="button"
            data-testid="quick-memo-convert-plan"
            className="block w-full text-left text-[15px] text-accent min-h-11"
            onClick={() => setPlanLevelOpen(true)}
          >
            {convertedPlan ? t("notesConvertedToPlan") : t("notesConvertToPlan")}
          </button>
          <button
            type="button"
            data-testid="quick-memo-convert-event"
            className="block w-full text-left text-[15px] text-accent min-h-11"
            onClick={() => setEventOpen(true)}
          >
            {convertedEvent ? t("notesConvertedToEvent") : t("notesConvertToEvent")}
          </button>
          <button
            type="button"
            data-testid="quick-memo-convert-note"
            className="block w-full text-left text-[15px] text-accent min-h-11"
            onClick={() => {
              const { note } = convertQuickMemoToNote(id);
              setTick((n) => n + 1);
              navigate(noteDetailPath(note.id), { replace: true });
            }}
          >
            {convertedNote ? t("notesConvertedToNote") : t("notesConvertToNote")}
          </button>
        </div>
      </div>
      <ImagePickSheet
        open={pickOpen}
        onPhotos={() => void onPick("photos")}
        onCamera={() => void onPick("camera")}
        onCancel={() => setPickOpen(false)}
      />
      <DailyTaskSheet
        request={taskRequest}
        onOpenChange={(open) => {
          if (!open) setTaskRequest(null);
        }}
        onSaved={() => setTick((n) => n + 1)}
        onChanged={() => setTick((n) => n + 1)}
      />
      <PlanItemSheet
        request={planRequest}
        onOpenChange={(open) => {
          if (!open) setPlanRequest(null);
        }}
        onSaved={() => setTick((n) => n + 1)}
        onChanged={() => setTick((n) => n + 1)}
      />
      <QuickMemoEventConvertSheet
        request={eventOpen ? { quickMemoId: id } : null}
        onOpenChange={setEventOpen}
        onSaved={() => setTick((n) => n + 1)}
      />
      {planLevelOpen && (
        <div className="fixed inset-0 z-[70] flex items-end justify-center">
          <button
            type="button"
            className="absolute inset-0 bg-black/40"
            aria-label={t("notesBack")}
            onClick={() => setPlanLevelOpen(false)}
          />
          <div className="relative z-10 w-full max-w-md bg-background rounded-t-3xl p-4 space-y-2">
            <p className="text-sm font-semibold">{t("notesConvertPlanLevel")}</p>
            {(["future", "monthly", "weekly"] as const).map((level) => {
              const disabled = level === "weekly" && !weeklyOn;
              return (
                <button
                  key={level}
                  type="button"
                  disabled={disabled}
                  data-testid={`quick-memo-plan-level-${level}`}
                  onClick={() => openPlanLevel(level)}
                  className="w-full min-h-11 rounded-xl bg-secondary/60 text-sm disabled:opacity-40"
                >
                  {level === "future"
                    ? t("planFuture")
                    : level === "monthly"
                      ? t("planMonthly")
                      : t("planWeekly")}
                  {disabled ? ` · ${t("notesConvertWeeklyOff")}` : ""}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
