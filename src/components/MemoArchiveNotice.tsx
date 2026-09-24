import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useI18n } from "@/lib/i18n";
import {
  markMemoArchiveNoticeShown,
  memoArchiveNoticeShouldShow,
  readMemoArchiveState,
} from "@/lib/v3/legacy-memo-archive";
import { pastMemosPath } from "@/lib/v3/notes-view";

/**
 * One-time post-migration notice. Shown only after a successful archive of
 * at least one legacy memo. Closing persists so it does not repeat.
 */
export function MemoArchiveNotice() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [open, setOpen] = useState(() => memoArchiveNoticeShouldShow(readMemoArchiveState()));

  if (!open) return null;

  const dismiss = () => {
    markMemoArchiveNoticeShown();
    setOpen(false);
  };

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) dismiss();
      }}
    >
      <AlertDialogContent data-testid="memo-archive-notice">
        <AlertDialogHeader>
          <AlertDialogTitle>{t("memoArchiveNoticeTitle")}</AlertDialogTitle>
          <AlertDialogDescription className="whitespace-pre-line">
            {t("memoArchiveNoticeBody")}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel data-testid="memo-archive-notice-ok" onClick={dismiss}>
            {t("memoArchiveNoticeOk")}
          </AlertDialogCancel>
          <AlertDialogAction
            data-testid="memo-archive-notice-open"
            onClick={() => {
              dismiss();
              navigate(pastMemosPath());
            }}
          >
            {t("memoArchiveNoticeReview")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
