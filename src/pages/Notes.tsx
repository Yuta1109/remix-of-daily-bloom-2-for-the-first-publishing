import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  Bold,
  Underline,
  List,
  ListOrdered,
  Camera,
  Calculator,
  Plus,
  ChevronDown,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { extractTextFromPickedImage, ocrToastKey, textToNoteHtml, type ImageSource } from "@/lib/ocr";
import { ImagePickSheet } from "@/components/ImagePickSheet";
import { OcrBusyOverlay } from "@/components/OcrBusyOverlay";
import {
  addMemoPage,
  deleteMemoPage,
  getActiveMemoId,
  loadMemoPages,
  setActiveMemoId,
  upsertMemoPage,
  type MemoPage,
} from "@/lib/notes-store";
import { NoteCalculator } from "@/components/NoteCalculator";
import { setOverlayChrome } from "@/lib/overlay-chrome";

function runFormat(cmd: string) {
  document.execCommand(cmd, false);
}

function previewText(html: string): string {
  const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  return text;
}

export default function NotesPage() {
  const { t } = useI18n();
  const editorRef = useRef<HTMLDivElement>(null);
  const skipHtmlSync = useRef(false);
  const [pages, setPages] = useState<MemoPage[]>(() => loadMemoPages());
  const [activeId, setActiveId] = useState(() => getActiveMemoId());
  const [listOpen, setListOpen] = useState(false);
  const [calcOpen, setCalcOpen] = useState(false);
  const [pickOpen, setPickOpen] = useState(false);
  const [ocrBusy, setOcrBusy] = useState(false);
  const [formats, setFormats] = useState({ bold: false, underline: false, ul: false, ol: false });

  const page = pages.find((p) => p.id === activeId) ?? pages[0];

  const persist = useCallback(
    (patch: Partial<MemoPage>) => {
      setPages((cur) => {
        const current = cur.find((p) => p.id === activeId) ?? cur[0];
        if (!current) return cur;
        return upsertMemoPage({ ...current, ...patch });
      });
    },
    [activeId],
  );

  useEffect(() => {
    const el = editorRef.current;
    if (!el || skipHtmlSync.current) return;
    if (el.innerHTML !== (page?.html || "")) el.innerHTML = page?.html || "";
  }, [page?.id, page?.html]);

  useEffect(() => {
    if (!listOpen && !calcOpen) return;
    setOverlayChrome(true);
    return () => setOverlayChrome(false);
  }, [listOpen, calcOpen]);

  const refreshFormats = () => {
    try {
      setFormats({
        bold: document.queryCommandState("bold"),
        underline: document.queryCommandState("underline"),
        ul: document.queryCommandState("insertUnorderedList"),
        ol: document.queryCommandState("insertOrderedList"),
      });
    } catch {
      /* ignore */
    }
  };

  const insertAtCaret = (html: string) => {
    const el = editorRef.current;
    if (!el) return;
    el.focus();
    skipHtmlSync.current = true;
    document.execCommand("insertHTML", false, html);
    persist({ html: el.innerHTML });
    queueMicrotask(() => {
      skipHtmlSync.current = false;
    });
  };

  const onOcr = async (source: ImageSource) => {
    if (ocrBusy) return;
    setPickOpen(false);
    setOcrBusy(true);
    try {
      const result = await extractTextFromPickedImage("note", source);
      if (!result.ok) {
        const key = ocrToastKey(result.error);
        if (key) toast(t(key as "ocrQuota"));
        return;
      }
      if (!("text" in result) || !result.text) {
        toast(t("ocrUnreadable"));
        return;
      }
      insertAtCaret(textToNoteHtml(result.text));
    } catch {
      toast(t("ocrGeneric"));
    } finally {
      setOcrBusy(false);
    }
  };

  if (!page) return null;

  const fmtBtn = (label: string, active: boolean, onClick: () => void, icon: ReactNode) => (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => {
        onClick();
        editorRef.current?.focus();
        refreshFormats();
        const el = editorRef.current;
        if (el) persist({ html: el.innerHTML });
      }}
      className={cn(
        "flex-1 h-11 rounded-xl flex items-center justify-center",
        active ? "bg-accent text-accent-foreground" : "text-foreground/80",
      )}
    >
      {icon}
    </button>
  );

  return (
    <div className="page-shell">
      <div className="shrink-0 px-3 pt-1 pb-2 flex items-center gap-2">
        <div className="flex-1 min-w-0 flex items-center gap-1 bg-secondary/70 rounded-full pl-2 pr-1 py-1">
          <button
            type="button"
            onClick={() => setListOpen(true)}
            className="p-1.5 rounded-full text-muted-foreground shrink-0"
            aria-label={t("memoPages")}
          >
            <ChevronDown className="w-4 h-4" />
          </button>
          <input
            value={page.title}
            onChange={(e) => persist({ title: e.target.value })}
            placeholder={t("memoTitlePlaceholder")}
            className="flex-1 min-w-0 bg-transparent text-sm font-semibold outline-none placeholder:text-muted-foreground/50"
          />
          <button
            type="button"
            onClick={() => {
              const { pages: next, created } = addMemoPage();
              setPages(next);
              setActiveId(created.id);
            }}
            className="p-1.5 rounded-full text-accent shrink-0"
            aria-label={t("memoNew")}
          >
            <Plus className="w-4 h-4" strokeWidth={2.5} />
          </button>
        </div>

        <div className="shrink-0 flex items-center gap-0.5 bg-card rounded-full shadow-soft border border-border/70 px-1 py-1">
          <button
            type="button"
            aria-label={t("memoScan")}
            disabled={ocrBusy}
            onClick={() => setPickOpen(true)}
            className="h-9 w-9 rounded-full flex items-center justify-center text-foreground/80 disabled:opacity-40"
          >
            <Camera className="w-4 h-4" />
          </button>
          <button
            type="button"
            aria-label={t("memoCalculator")}
            onClick={() => setCalcOpen(true)}
            className="h-9 w-9 rounded-full flex items-center justify-center text-foreground/80"
          >
            <Calculator className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-0 px-4">
        <div
          ref={editorRef}
          contentEditable
          suppressContentEditableWarning
          data-placeholder={t("memoBodyPlaceholder")}
          className="note-editor h-full overflow-y-auto overscroll-contain outline-none text-base leading-relaxed text-foreground"
          onInput={() => {
            skipHtmlSync.current = true;
            persist({ html: editorRef.current?.innerHTML || "" });
            queueMicrotask(() => {
              skipHtmlSync.current = false;
            });
          }}
          onKeyUp={refreshFormats}
          onMouseUp={refreshFormats}
        />
      </div>

      <div className="shrink-0 px-3 pt-1 pb-2">
        <div className="bg-card rounded-2xl shadow-soft border border-border/60 flex items-center px-1 py-0.5">
          {fmtBtn(t("memoBold"), formats.bold, () => runFormat("bold"), <Bold className="w-4 h-4" />)}
          {fmtBtn(
            t("memoUnderline"),
            formats.underline,
            () => runFormat("underline"),
            <Underline className="w-4 h-4" />,
          )}
          {fmtBtn(t("memoBullets"), formats.ul, () => runFormat("insertUnorderedList"), <List className="w-4 h-4" />)}
          {fmtBtn(
            t("memoNumbers"),
            formats.ol,
            () => runFormat("insertOrderedList"),
            <ListOrdered className="w-4 h-4" />,
          )}
        </div>
      </div>

      <NoteCalculator
        open={calcOpen}
        onClose={() => setCalcOpen(false)}
        onInsert={(value) => insertAtCaret(value)}
      />
      <ImagePickSheet
        open={pickOpen}
        onPhotos={() => void onOcr("photos")}
        onCamera={() => void onOcr("camera")}
        onCancel={() => setPickOpen(false)}
      />
      <OcrBusyOverlay open={ocrBusy} />

      {listOpen &&
        createPortal(
          <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center p-4">
            <button
              type="button"
              className="absolute inset-0 bg-black/30"
              onClick={() => setListOpen(false)}
              aria-label={t("cancel")}
            />
            <div className="relative z-10 w-full max-w-md max-h-[80dvh] min-h-0 bg-background rounded-3xl shadow-float flex flex-col overflow-hidden">
              <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-border/50 shrink-0">
                <h2 className="text-base font-semibold">{t("memoPages")}</h2>
                <button
                  type="button"
                  onClick={() => setListOpen(false)}
                  className="p-2 text-muted-foreground"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div
                className="event-sheet-scroll min-h-0 overflow-y-scroll overscroll-contain px-3 py-3 space-y-1"
                style={{ flex: "1 1 0%" }}
                onPointerDown={(e) => e.stopPropagation()}
              >
                {pages.map((p) => {
                  const preview = previewText(p.html);
                  return (
                    <div key={p.id} className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          setActiveMemoId(p.id);
                          setActiveId(p.id);
                          setListOpen(false);
                        }}
                        className={cn(
                          "flex-1 min-w-0 text-left rounded-xl px-3 py-2.5",
                          p.id === page.id ? "bg-accent/10 text-accent" : "bg-secondary/50",
                        )}
                      >
                        <p className="text-sm font-medium truncate">
                          {p.title.trim() || t("memoUntitled")}
                        </p>
                        {preview ? (
                          <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                            {preview}
                          </p>
                        ) : null}
                      </button>
                      {pages.length > 1 && (
                        <button
                          type="button"
                          onClick={() => {
                            const next = deleteMemoPage(p.id);
                            setPages(next);
                            setActiveId(getActiveMemoId());
                          }}
                          className="p-2 rounded-xl text-muted-foreground shrink-0"
                          aria-label={t("deleteEvent")}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  );
                })}
                <div className="h-3" />
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
