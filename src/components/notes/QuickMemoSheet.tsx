import { useEffect, useState } from "react";
import { Drawer as DrawerPrimitive } from "vaul";
import { ImagePickSheet } from "@/components/ImagePickSheet";
import { useI18n } from "@/lib/i18n";
import { pickLocalImageAttachment, noteImageSrc } from "@/lib/note-image";
import { setOverlayChrome } from "@/lib/overlay-chrome";
import type { ImageSource } from "@/lib/ocr";
import type { ImageAttachment } from "@/lib/v3/types";

interface Props {
  open: boolean;
  initialText?: string;
  initialImage?: ImageAttachment;
  onOpenChange: (open: boolean) => void;
  onSubmit: (input: { text: string; image?: ImageAttachment }) => void;
}

export function QuickMemoSheet({
  open,
  initialText = "",
  initialImage,
  onOpenChange,
  onSubmit,
}: Props) {
  const { t } = useI18n();
  const [text, setText] = useState(initialText);
  const [image, setImage] = useState<ImageAttachment | undefined>(initialImage);
  const [pickOpen, setPickOpen] = useState(false);

  useEffect(() => {
    if (open) {
      setText(initialText);
      setImage(initialImage);
    }
  }, [open, initialText, initialImage]);

  useEffect(() => {
    if (!open) return;
    setOverlayChrome(true);
    const apply = () => {
      const h = window.visualViewport?.height ?? window.innerHeight;
      document.documentElement.style.setProperty("--vvh", `${Math.round(h)}px`);
    };
    apply();
    window.visualViewport?.addEventListener("resize", apply);
    return () => {
      setOverlayChrome(false);
      window.visualViewport?.removeEventListener("resize", apply);
    };
  }, [open]);

  const submit = () => {
    const trimmed = text.trim();
    if (!trimmed && !image) return;
    onSubmit({ text: trimmed, image });
    onOpenChange(false);
  };

  const onPick = async (source: ImageSource) => {
    setPickOpen(false);
    const next = await pickLocalImageAttachment(source);
    if (next) setImage(next);
  };

  return (
    <>
      <DrawerPrimitive.Root open={open} onOpenChange={onOpenChange} shouldScaleBackground={false}>
        <DrawerPrimitive.Portal>
          <DrawerPrimitive.Overlay className="fixed inset-0 z-50 bg-black/20" />
          <DrawerPrimitive.Content
            data-kb-shell="translate"
            data-testid="quick-memo-sheet"
            className="sheet-form fixed inset-x-0 bottom-0 z-50 flex flex-col rounded-t-2xl border bg-background outline-none px-4 pt-3"
            style={{
              paddingBottom: "max(16px, env(safe-area-inset-bottom))",
              maxHeight: "calc(var(--vvh, 100dvh) - env(safe-area-inset-top, 0px))",
            }}
            aria-describedby={undefined}
          >
            <div className="mx-auto mb-2 h-1.5 w-10 rounded-full bg-muted shrink-0" />
            <DrawerPrimitive.Title className="text-base font-semibold mb-3">
              {t("notesAddQuickMemo")}
            </DrawerPrimitive.Title>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={t("notesQuickMemoPlaceholder")}
              rows={5}
              autoFocus={open}
              data-testid="quick-memo-input"
              className="w-full rounded-xl bg-secondary/70 px-3 py-3 text-[17px] outline-none resize-none mb-2"
            />
            {image && noteImageSrc(image) ? (
              <div className="mb-2">
                <img src={noteImageSrc(image)} alt="" className="max-h-32 max-w-full object-contain" />
                <button
                  type="button"
                  className="mt-1 text-[13px] text-muted-foreground"
                  onClick={() => setImage(undefined)}
                >
                  {t("notesRemoveImage")}
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="mb-2 text-left text-[15px] text-accent min-h-11"
                onClick={() => setPickOpen(true)}
              >
                {t("notesAttachImage")}
              </button>
            )}
            <div className="flex gap-2 pb-2">
              <button
                type="button"
                className="flex-1 min-h-11 rounded-xl text-[15px] text-muted-foreground"
                onClick={() => onOpenChange(false)}
              >
                {t("cancel")}
              </button>
              <button
                type="button"
                data-testid="quick-memo-save"
                className="flex-1 min-h-11 rounded-xl bg-accent text-accent-foreground text-[15px] font-medium disabled:opacity-40"
                disabled={!text.trim() && !image}
                onClick={submit}
              >
                {t("notesQuickMemoSave")}
              </button>
            </div>
          </DrawerPrimitive.Content>
        </DrawerPrimitive.Portal>
      </DrawerPrimitive.Root>
      <ImagePickSheet
        open={pickOpen}
        onPhotos={() => void onPick("photos")}
        onCamera={() => void onPick("camera")}
        onCancel={() => setPickOpen(false)}
      />
    </>
  );
}
