import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ImagePickSheet } from "@/components/ImagePickSheet";
import { useI18n } from "@/lib/i18n";
import { GlassControl } from "@/components/GlassControl";
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
  const [frame, setFrame] = useState({ top: 0, height: 0 });
  const saving = useRef(false);

  useEffect(() => {
    if (open) {
      setText(initialText);
      setImage(initialImage);
      saving.current = false;
    }
  }, [open, initialText, initialImage]);

  useEffect(() => {
    if (!open) return;
    setOverlayChrome(true);
    const apply = () => {
      const vv = window.visualViewport;
      setFrame({
        top: vv?.offsetTop ?? 0,
        height: vv?.height ?? window.innerHeight,
      });
    };
    apply();
    window.visualViewport?.addEventListener("resize", apply);
    window.visualViewport?.addEventListener("scroll", apply);
    return () => {
      setOverlayChrome(false);
      window.visualViewport?.removeEventListener("resize", apply);
      window.visualViewport?.removeEventListener("scroll", apply);
    };
  }, [open]);

  const submit = () => {
    const trimmed = text.trim();
    if ((!trimmed && !image) || saving.current) return;
    saving.current = true;
    onSubmit({ text: trimmed, image });
    onOpenChange(false);
  };

  const onPick = async (source: ImageSource) => {
    setPickOpen(false);
    const next = await pickLocalImageAttachment(source);
    if (next) setImage(next);
  };

  if (!open) return null;

  return (
    <>
      {createPortal(
        <div
          className="fixed left-0 right-0 z-[70] flex items-center justify-center px-4 py-4"
          style={{ top: frame.top, height: frame.height || "100dvh" }}
        >
          <button
            type="button"
            className="absolute inset-0 bg-black/40"
            aria-label={t("cancel")}
            onClick={() => onOpenChange(false)}
          />
          <div
            data-testid="quick-memo-sheet"
            className="bg-card relative z-10 w-full max-w-md rounded-3xl overflow-hidden flex flex-col min-h-0 shadow-float"
            style={{ maxHeight: "100%" }}
          >
            <div className="overflow-y-auto px-4 pt-4 pb-3 min-h-0">
              <h2 className="text-base font-semibold mb-3">{t("notesAddQuickMemo")}</h2>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={t("notesQuickMemoPlaceholder")}
                rows={5}
                autoFocus={open}
                data-testid="quick-memo-input"
                data-kb-ignore=""
                className="w-full min-w-0 max-w-full box-border rounded-xl bg-secondary/70 px-3 py-3 text-[17px] outline-none resize-none mb-2"
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
              <div className="flex gap-2">
                <GlassControl size="label" className="flex-1" onClick={() => onOpenChange(false)}>
                  {t("cancel")}
                </GlassControl>
                <GlassControl
                  size="label"
                  variant="prominent"
                  className="flex-1"
                  data-testid="quick-memo-save"
                  disabled={!text.trim() && !image}
                  onClick={submit}
                >
                  {t("notesQuickMemoSave")}
                </GlassControl>
              </div>
            </div>
          </div>
        </div>,
        document.body,
      )}
      <ImagePickSheet
        open={pickOpen}
        help={t("notesAttachImageHelp")}
        onPhotos={() => void onPick("photos")}
        onCamera={() => void onPick("camera")}
        onCancel={() => setPickOpen(false)}
      />
    </>
  );
}
