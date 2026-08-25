import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Capacitor } from "@capacitor/core";
import { Keyboard } from "@capacitor/keyboard";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Underline,
  List,
  ListOrdered,
  Camera,
  Calculator,
  Plus,
  ChevronDown,
  Redo2,
  Trash2,
  Undo2,
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
import { NoteHtmlView } from "@/components/NoteHtmlView";
import { setOverlayChrome } from "@/lib/overlay-chrome";
import { hideKeyboard, prepareForOcr } from "@/lib/keyboard-avoidance";

type Align = "left" | "center" | "right";

function runFormat(cmd: string, value?: string) {
  document.execCommand(cmd, false, value);
}

function previewText(html: string): string {
  const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  return text;
}

export default function NotesPage() {
  const { t } = useI18n();
  const editorRef = useRef<HTMLDivElement>(null);
  const skipHtmlSync = useRef(false);
  const keepKeyboard = useRef(false);
  const [pages, setPages] = useState<MemoPage[]>(() => loadMemoPages());
  const [activeId, setActiveId] = useState(() => getActiveMemoId());
  const [editing, setEditing] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  const [calcOpen, setCalcOpen] = useState(false);
  const [pickOpen, setPickOpen] = useState(false);
  const [ocrBusy, setOcrBusy] = useState(false);
  const [kbHeight, setKbHeight] = useState(0);
  const [formats, setFormats] = useState({
    bold: false,
    underline: false,
    ul: false,
    ol: false,
    align: "left" as Align,
  });

  const page = pages.find((p) => p.id === activeId) ?? pages[0];
  const overlayOpen = listOpen || calcOpen || pickOpen || ocrBusy;
  const blockKeyboard = overlayOpen;

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
    if (!editing) return;
    const el = editorRef.current;
    if (!el || skipHtmlSync.current) return;
    if (el.innerHTML !== (page?.html || "")) el.innerHTML = page?.html || "";
  }, [page?.id, page?.html, editing]);

  useEffect(() => {
    if (!listOpen && !calcOpen) return;
    setOverlayChrome(true);
    return () => setOverlayChrome(false);
  }, [listOpen, calcOpen]);

  const focusEditor = useCallback(() => {
    const el = editorRef.current;
    if (!el) return;
    el.focus();
    const sel = window.getSelection();
    if (sel && sel.rangeCount === 0) {
      const range = document.createRange();
      range.selectNodeContents(el);
      range.collapse(false);
      sel.removeAllRanges();
      sel.addRange(range);
    }
  }, []);

  useEffect(() => {
    keepKeyboard.current = editing && !blockKeyboard;
    if (blockKeyboard || !editing) {
      void hideKeyboard();
      if (blockKeyboard) editorRef.current?.blur();
      return;
    }
    const timer = window.setTimeout(() => focusEditor(), 40);
    return () => window.clearTimeout(timer);
  }, [editing, blockKeyboard, focusEditor]);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    let cancelled = false;
    const show = Keyboard.addListener("keyboardDidShow", (info) => {
      if (!cancelled) setKbHeight(info.keyboardHeight ?? 0);
    });
    const hide = Keyboard.addListener("keyboardDidHide", () => {
      setKbHeight(0);
      if (!keepKeyboard.current) return;
      const active = document.activeElement;
      if (active instanceof HTMLInputElement) return;
      window.setTimeout(() => focusEditor(), 30);
    });
    return () => {
      cancelled = true;
      void show.then((h) => h.remove());
      void hide.then((h) => h.remove());
    };
  }, [focusEditor]);

  const refreshFormats = () => {
    try {
      let align: Align = "left";
      if (document.queryCommandState("justifyCenter")) align = "center";
      else if (document.queryCommandState("justifyRight")) align = "right";
      setFormats({
        bold: document.queryCommandState("bold"),
        underline: document.queryCommandState("underline"),
        ul: document.queryCommandState("insertUnorderedList"),
        ol: document.queryCommandState("insertOrderedList"),
        align,
      });
    } catch {
      /* ignore */
    }
  };

  const persistEditor = () => {
    const el = editorRef.current;
    if (el) persist({ html: el.innerHTML });
  };

  const insertAtCaret = (html: string) => {
    const el = editorRef.current;
    if (!el) return;
    setEditing(true);
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
    await prepareForOcr();
    editorRef.current?.blur();
    setOcrBusy(true);
    let message: string | null = null;
    try {
      const result = await extractTextFromPickedImage("note", source);
      if (!result.ok) {
        const key = ocrToastKey(result.error);
        if (key) message = t(key);
        return;
      }
      if (!("text" in result) || (!result.text && !result.latex?.length)) {
        message = t("ocrEmpty");
        return;
      }
      insertAtCaret(textToNoteHtml(result.text, result.latex || []));
      if (result.lowConfidence) message = t("ocrLowConfidence");
    } catch {
      message = t("ocrGeneric");
    } finally {
      setOcrBusy(false);
    }
    if (message) toast(message);
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
        persistEditor();
      }}
      className={cn(
        "h-10 min-w-10 px-2 rounded-xl flex items-center justify-center",
        active ? "bg-accent text-accent-foreground" : "text-foreground/80",
      )}
    >
      {icon}
    </button>
  );

  const toolbarBottom = kbHeight > 0 ? kbHeight : undefined;

  return (
    <div className="page-shell">
      <div className="shrink-0 px-3 pt-1 pb-2 flex items-center gap-2">
        <div className="flex-1 min-w-0 flex items-center gap-1 bg-secondary/70 rounded-full pl-2 pr-1 py-1">
          {editing && (
            <button
              type="button"
              onClick={() => setListOpen(true)}
              className="p-1.5 rounded-full text-muted-foreground shrink-0"
              aria-label={t("memoPages")}
            >
              <ChevronDown className="w-4 h-4" />
            </button>
          )}
          {editing ? (
            <input
              value={page.title}
              onChange={(e) => persist({ title: e.target.value })}
              placeholder={t("memoTitlePlaceholder")}
              className="flex-1 min-w-0 bg-transparent text-sm font-semibold outline-none placeholder:text-muted-foreground/50"
            />
          ) : (
            <p className="flex-1 min-w-0 px-2 text-sm font-semibold truncate">
              {page.title.trim() || t("memoUntitled")}
            </p>
          )}
          {editing && (
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
          )}
        </div>

        <button
          type="button"
          onClick={() => {
            if (editing) keepKeyboard.current = false;
            setEditing((v) => !v);
          }}
          className="shrink-0 h-9 px-3 rounded-full bg-accent text-accent-foreground text-xs font-semibold shadow-soft"
        >
          {editing ? t("memoView") : t("memoEdit")}
        </button>

        {editing && (
          <div className="shrink-0 flex items-center gap-0.5 bg-card rounded-full shadow-soft border border-border/70 px-1 py-1">
            <button
              type="button"
              aria-label={t("memoScan")}
              disabled={ocrBusy}
              onClick={() => {
                void prepareForOcr();
                editorRef.current?.blur();
                setPickOpen(true);
              }}
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
        )}
      </div>

      <div
        className="flex-1 min-h-0 px-4"
        style={{ paddingBottom: editing ? (kbHeight > 0 ? kbHeight + 108 : 108) : 8 }}
      >
        <div
          className={cn(
            "h-full overscroll-contain outline-none text-base leading-relaxed text-foreground",
            editing ? "overflow-y-auto" : "overflow-y-auto scrollbar-none",
            !editing && "cursor-default",
          )}
        >
          {editing ? (
            <div
              ref={editorRef}
              contentEditable
              suppressContentEditableWarning
              data-placeholder={t("memoBodyPlaceholder")}
              data-kb-ignore=""
              className="note-editor min-h-full outline-none"
              onInput={() => {
                skipHtmlSync.current = true;
                persist({ html: editorRef.current?.innerHTML || "" });
                queueMicrotask(() => {
                  skipHtmlSync.current = false;
                });
              }}
              onKeyUp={refreshFormats}
              onMouseUp={refreshFormats}
              onBlur={() => {
                window.setTimeout(() => {
                  if (!keepKeyboard.current) return;
                  const active = document.activeElement;
                  if (active instanceof HTMLInputElement) return;
                  if (active === editorRef.current) return;
                  focusEditor();
                }, 40);
              }}
            />
          ) : (
            <NoteHtmlView html={page.html} />
          )}
        </div>
      </div>

      {editing &&
        createPortal(
          <div
            className="fixed left-0 right-0 z-[60] px-3 pointer-events-none"
            style={{
              bottom: toolbarBottom ?? "var(--bottom-nav-offset)",
            }}
          >
            <div className="pointer-events-auto bg-card rounded-2xl shadow-soft border border-border/60 px-1 py-1 mb-1">
              <div className="flex items-center justify-between gap-0.5">
                {fmtBtn(t("memoUndo"), false, () => runFormat("undo"), <Undo2 className="w-4 h-4" />)}
                {fmtBtn(t("memoRedo"), false, () => runFormat("redo"), <Redo2 className="w-4 h-4" />)}
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
              <div className="flex items-center justify-center gap-0.5 mt-0.5">
                {fmtBtn(
                  t("memoAlignLeft"),
                  formats.align === "left",
                  () => runFormat("justifyLeft"),
                  <AlignLeft className="w-4 h-4" />,
                )}
                {fmtBtn(
                  t("memoAlignCenter"),
                  formats.align === "center",
                  () => runFormat("justifyCenter"),
                  <AlignCenter className="w-4 h-4" />,
                )}
                {fmtBtn(
                  t("memoAlignRight"),
                  formats.align === "right",
                  () => runFormat("justifyRight"),
                  <AlignRight className="w-4 h-4" />,
                )}
              </div>
            </div>
          </div>,
          document.body,
        )}

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
