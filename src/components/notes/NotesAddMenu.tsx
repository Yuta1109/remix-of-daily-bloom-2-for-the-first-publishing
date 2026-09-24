import { useEffect, type ReactNode } from "react";
import { FolderPlus, StickyNote, Zap } from "lucide-react";
import { Drawer as DrawerPrimitive } from "vaul";
import { useI18n } from "@/lib/i18n";
import { setOverlayChrome } from "@/lib/overlay-chrome";

export type NotesAddKind = "quickMemo" | "note" | "collection";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPick: (kind: NotesAddKind) => void;
}

export function NotesAddMenu({ open, onOpenChange, onPick }: Props) {
  const { t } = useI18n();

  useEffect(() => {
    if (!open) return;
    setOverlayChrome(true);
    return () => setOverlayChrome(false);
  }, [open]);

  const pick = (kind: NotesAddKind) => {
    onOpenChange(false);
    onPick(kind);
  };

  return (
    <DrawerPrimitive.Root open={open} onOpenChange={onOpenChange} shouldScaleBackground={false}>
      <DrawerPrimitive.Portal>
        <DrawerPrimitive.Overlay className="fixed inset-0 z-50 bg-black/20 backdrop-blur-[1px]" />
        <DrawerPrimitive.Content
          className="fixed inset-x-0 bottom-0 z-50 flex flex-col rounded-t-2xl border bg-background outline-none"
          style={{ paddingBottom: "max(16px, env(safe-area-inset-bottom))" }}
          aria-describedby={undefined}
        >
          <div className="mx-auto mt-2.5 mb-1 h-1.5 w-10 rounded-full bg-muted shrink-0" />
          <DrawerPrimitive.Title className="px-5 pt-2 pb-3 text-base font-semibold">
            {t("notesAddMenuTitle")}
          </DrawerPrimitive.Title>
          <div className="px-3 pb-2 space-y-1">
            <AddRow
              icon={<Zap className="w-5 h-5" aria-hidden="true" />}
              title={t("notesAddQuickMemo")}
              hint={t("notesAddQuickMemoHint")}
              onClick={() => pick("quickMemo")}
              testId="notes-add-quick-memo"
            />
            <AddRow
              icon={<StickyNote className="w-5 h-5" aria-hidden="true" />}
              title={t("notesAddNote")}
              hint={t("notesAddNoteHint")}
              onClick={() => pick("note")}
              testId="notes-add-note"
            />
            <AddRow
              icon={<FolderPlus className="w-5 h-5" aria-hidden="true" />}
              title={t("notesAddCollection")}
              hint={t("notesAddCollectionHint")}
              onClick={() => pick("collection")}
              testId="notes-add-collection"
            />
          </div>
        </DrawerPrimitive.Content>
      </DrawerPrimitive.Portal>
    </DrawerPrimitive.Root>
  );
}

function AddRow({
  icon,
  title,
  hint,
  onClick,
  testId,
}: {
  icon: ReactNode;
  title: string;
  hint: string;
  onClick: () => void;
  testId: string;
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      onClick={onClick}
      className="w-full flex items-start gap-3 rounded-xl px-3 py-3 text-left hover:bg-secondary/60 min-h-11"
    >
      <span className="mt-0.5 text-foreground/70">{icon}</span>
      <span className="min-w-0">
        <span className="block text-[17px] font-medium">{title}</span>
        <span className="block text-xs text-muted-foreground mt-0.5">{hint}</span>
      </span>
    </button>
  );
}
