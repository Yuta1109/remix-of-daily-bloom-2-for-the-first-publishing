import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal, flushSync } from "react-dom";
import { useNavigate, useParams } from "react-router-dom";
import { Capacitor } from "@capacitor/core";
import { Keyboard } from "@capacitor/keyboard";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ArrowLeft,
  Bold,
  Underline,
  List,
  ListOrdered,
  Calculator,
  Redo2,
  Upload,
  Undo2,
} from "lucide-react";
import { AiCameraIcon } from "@/components/AiCameraIcon";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { extractTextFromPickedImage, ocrToastKey, textToNoteHtml, type ImageSource } from "@/lib/ocr";
import { ocrDebugLog } from "@/lib/ocr-debug-log";
import { ImagePickSheet } from "@/components/ImagePickSheet";
import { OcrBusyOverlay } from "@/components/OcrBusyOverlay";
import { OcrResultSheet } from "@/components/OcrResultSheet";
import {
  getMemoPage,
  htmlToPlainText,
  loadMemoLibrary,
  normalizeNoteHtml,
  upsertMemoPage,
  type MemoPage,
} from "@/lib/notes-store";
import { shareMemoPage } from "@/lib/share-memo";
import { NoteHtmlView } from "@/components/NoteHtmlView";
import { NoteCalculator } from "@/components/NoteCalculator";
import { setOverlayChrome } from "@/lib/overlay-chrome";
import { hideKeyboard, prepareForOcr } from "@/lib/keyboard-avoidance";

type Align = "left" | "center" | "right";

const NOTE_TOOLBAR_CLEARANCE = 100;

function runFormat(cmd: string, value?: string) {
  document.execCommand(cmd, false, value);
}

export default function MemoDetailPage() {
  const { t, locale } = useI18n();
  const navigate = useNavigate();
  const { memoId = "" } = useParams();
  const editorRef = useRef<HTMLDivElement>(null);
  const viewBodyRef = useRef<HTMLDivElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const pendingFocusRef = useRef<"title" | "body" | null>(null);
  const caretPointRef = useRef<{ x: number; y: number } | null>(null);
  const bodyCaretModeRef = useRef<"start" | "end" | "point">("end");
  const skipHtmlSync = useRef(false);
  const keepKeyboard = useRef(false);
  const calcFromView = useRef(false);
  const draftHtmlRef = useRef("");

  const [page, setPage] = useState<MemoPage | null>(() => getMemoPage(loadMemoLibrary(), memoId) ?? null);
  const [editing, setEditing] = useState(false);
  const [viewRevision, setViewRevision] = useState(0);
  const [calcOpen, setCalcOpen] = useState(false);
  const [pickOpen, setPickOpen] = useState(false);
  const [ocrBusy, setOcrBusy] = useState(false);
  const [ocrFeedback, setOcrFeedback] = useState<{
    message: string;
    kind: "info" | "warning";
  } | null>(null);
  const [kbHeight, setKbHeight] = useState(0);
  const [formats, setFormats] = useState({
    bold: false,
    underline: false,
    ul: false,
    ol: false,
    align: "left" as Align,
  });

  useEffect(() => {
    const found = getMemoPage(loadMemoLibrary(), memoId);
    if (!found) {
      navigate("/notes", { replace: true });
      return;
    }
    setPage(found);
    draftHtmlRef.current = found.html || "";
    setViewRevision((v) => v + 1);
  }, [memoId, navigate]);

  const overlayOpen = calcOpen || pickOpen || ocrBusy || !!ocrFeedback;
  const blockKeyboard = overlayOpen;

  const persist = useCallback(
    (patch: Partial<MemoPage>) => {
      if (!page) return;
      const html = patch.html !== undefined ? normalizeNoteHtml(patch.html) : page.html;
      const lib = upsertMemoPage(loadMemoLibrary(), { ...page, ...patch, html });
      const next = lib.pages.find((p) => p.id === page.id) ?? null;
      if (next) setPage(next);
    },
    [page],
  );

  useEffect(() => {
    if (!editing || !page) return;
    const el = editorRef.current;
    if (!el) return;
    skipHtmlSync.current = true;
    const html = draftHtmlRef.current || page.html || "";
    if (el.innerHTML !== html) el.innerHTML = html;
    queueMicrotask(() => {
      skipHtmlSync.current = false;
    });
  }, [editing, page?.id]);

  useEffect(() => {
    if (!calcOpen) return;
    setOverlayChrome(true);
    return () => setOverlayChrome(false);
  }, [calcOpen]);

  const focusEditor = useCallback((mode: "start" | "end" | "point" = "end") => {
    const el = editorRef.current;
    if (!el) return;
    el.focus();
    const sel = window.getSelection();
    if (!sel) return;

    if (mode === "point" && caretPointRef.current) {
      const { x, y } = caretPointRef.current;
      caretPointRef.current = null;
      const doc = document as Document & {
        caretRangeFromPoint?: (x: number, y: number) => Range | null;
        caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
      };
      const range =
        doc.caretRangeFromPoint?.(x, y) ??
        (() => {
          const pos = doc.caretPositionFromPoint?.(x, y);
          if (!pos) return null;
          const r = document.createRange();
          r.setStart(pos.offsetNode, pos.offset);
          r.collapse(true);
          return r;
        })();
      if (range && el.contains(range.startContainer)) {
        sel.removeAllRanges();
        sel.addRange(range);
        return;
      }
    }

    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(mode === "start");
    sel.removeAllRanges();
    sel.addRange(range);
  }, []);

  const enterEdit = useCallback((focus: "title" | "body", e?: React.MouseEvent) => {
    if (page) draftHtmlRef.current = page.html || "";
    pendingFocusRef.current = focus;
    if (focus === "body") {
      const hasContent = page ? htmlToPlainText(page.html).length > 0 : false;
      if (!hasContent) {
        bodyCaretModeRef.current = "start";
      } else if (e && viewBodyRef.current) {
        const doc = document as Document & {
          caretRangeFromPoint?: (x: number, y: number) => Range | null;
        };
        const range = doc.caretRangeFromPoint?.(e.clientX, e.clientY);
        if (range && viewBodyRef.current.contains(range.startContainer)) {
          caretPointRef.current = { x: e.clientX, y: e.clientY };
          bodyCaretModeRef.current = "point";
        } else {
          bodyCaretModeRef.current = "end";
        }
      } else {
        bodyCaretModeRef.current = "end";
      }
    }
    setEditing(true);
  }, [page]);

  useEffect(() => {
    keepKeyboard.current = editing && !blockKeyboard;
    if (blockKeyboard || !editing) {
      void hideKeyboard();
      if (blockKeyboard) editorRef.current?.blur();
      return;
    }
    const target = pendingFocusRef.current ?? "body";
    pendingFocusRef.current = null;
    const timer = window.setTimeout(() => {
      if (target === "title") {
        const el = titleInputRef.current;
        if (el) {
          el.focus();
          const len = el.value.length;
          el.setSelectionRange(len, len);
        }
      } else {
        focusEditor(bodyCaretModeRef.current);
        bodyCaretModeRef.current = "end";
      }
    }, 40);
    return () => window.clearTimeout(timer);
  }, [editing, blockKeyboard, focusEditor]);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    let cancelled = false;
    const show = Keyboard.addListener("keyboardDidShow", (info) => {
      if (!cancelled) setKbHeight(info.keyboardHeight ?? 0);
    });
    const willShow = Keyboard.addListener("keyboardWillShow", (info) => {
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
      void willShow.then((h) => h.remove());
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

  const syncDraftFromEditor = () => {
    const el = editorRef.current;
    if (!el) return;
    draftHtmlRef.current = el.innerHTML;
  };

  const insertAtCaret = (html: string) => {
    const el = editorRef.current;
    if (!el) return;
    setEditing(true);
    el.focus();
    skipHtmlSync.current = true;
    document.execCommand("insertHTML", false, html);
    draftHtmlRef.current = el.innerHTML;
    queueMicrotask(() => {
      skipHtmlSync.current = false;
    });
  };

  const insertAtEnd = (html: string) => {
    const base = normalizeNoteHtml(page?.html || "");
    const next = normalizeNoteHtml(base + html);
    draftHtmlRef.current = next;
    persist({ html: next });
  };

  const handleCalcInsert = (value: string) => {
    if (calcFromView.current) {
      calcFromView.current = false;
      insertAtEnd(value);
      return;
    }
    insertAtCaret(value);
  };

  const exitToView = () => {
    const el = editorRef.current;
    const html = normalizeNoteHtml(el?.innerHTML || draftHtmlRef.current || "");
    draftHtmlRef.current = html;
    if (!page) return;

    if (el) {
      skipHtmlSync.current = true;
      el.innerHTML = "";
    }

    const lib = upsertMemoPage(loadMemoLibrary(), { ...page, html });
    const next = lib.pages.find((p) => p.id === page.id) ?? null;
    if (!next) return;

    keepKeyboard.current = false;
    flushSync(() => {
      setPage(next);
      setViewRevision((v) => v + 1);
      setEditing(false);
    });
  };

  const onOcr = async (source: ImageSource) => {
    if (ocrBusy) return;
    setPickOpen(false);
    setOcrFeedback(null);
    await prepareForOcr();
    if (!editing) setEditing(true);
    editorRef.current?.blur();
    setOcrBusy(true);
    let feedback: { message: string; kind: "info" | "warning" } | null = null;
    try {
      const result = await extractTextFromPickedImage("note", source);
      if (!result.ok) {
        const key = ocrToastKey(
          result.error,
          "configReason" in result ? result.configReason : undefined,
        );
        if (key) feedback = { message: t(key), kind: "info" };
      } else if (!("text" in result) || (!result.text && !result.latex?.length)) {
        feedback = { message: t("ocrEmpty"), kind: "info" };
      } else {
        insertAtCaret(textToNoteHtml(result.text, result.latex || []));
        if (result.lowConfidence) {
          feedback = { message: t("ocrLowConfidence"), kind: "warning" };
        }
      }
    } catch {
      feedback = { message: t("ocrGeneric"), kind: "info" };
    } finally {
      setOcrBusy(false);
    }
    if (feedback) {
      ocrDebugLog("ocr", `feedback kind=${feedback.kind} msg=${feedback.message.slice(0, 80)}`, "info");
      setOcrFeedback(feedback);
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
        syncDraftFromEditor();
      }}
      className={cn(
        "h-11 min-w-11 px-2 rounded-xl flex items-center justify-center",
        active ? "bg-accent text-accent-foreground" : "text-foreground/80",
      )}
    >
      {icon}
    </button>
  );

  const toolbarBottom = kbHeight > 0 ? kbHeight : undefined;
  const editorScrollPad =
    editing && kbHeight > 0
      ? kbHeight + NOTE_TOOLBAR_CLEARANCE
      : editing
        ? NOTE_TOOLBAR_CLEARANCE
        : 0;

  const iconBtn =
    "h-11 w-11 rounded-full flex items-center justify-center text-foreground/80 bg-card shadow-soft border border-border/60 disabled:opacity-40";

  const formatUpdated = (ts: number) =>
    new Date(ts).toLocaleDateString(locale === "ja" ? "ja-JP" : "en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });

  return (
    <div className="page-shell">
      <div className="shrink-0 px-3 pt-1 pb-2">
        {editing ? (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => navigate("/notes")}
              className={iconBtn}
              aria-label={t("memoBackToList")}
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <input
              ref={titleInputRef}
              value={page.title}
              onChange={(e) => persist({ title: e.target.value })}
              placeholder={t("memoTitlePlaceholder")}
              className="flex-1 min-w-0 bg-secondary/70 rounded-full px-4 py-2.5 text-base font-semibold outline-none placeholder:text-muted-foreground/50"
            />
            <div className="shrink-0 flex items-center gap-1 bg-card rounded-full shadow-soft border border-border/70 px-1 py-1">
              <button
                type="button"
                aria-label={t("memoCalculator")}
                onClick={() => {
                  calcFromView.current = false;
                  setCalcOpen(true);
                }}
                className="h-10 w-10 rounded-full flex items-center justify-center text-foreground/80"
              >
                <Calculator className="w-5 h-5" />
              </button>
            </div>
            <button
              type="button"
              onClick={exitToView}
              className="shrink-0 h-10 px-4 rounded-full bg-accent text-accent-foreground text-sm font-semibold shadow-soft"
            >
              {t("memoView")}
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => navigate("/notes")}
              className={iconBtn}
              aria-label={t("memoBackToList")}
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="flex-1" />
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                aria-label={t("memoScan")}
                disabled={ocrBusy}
                onClick={() => {
                  void prepareForOcr();
                  setPickOpen(true);
                }}
                className={iconBtn}
              >
                <AiCameraIcon variant="memo" />
              </button>
              <button
                type="button"
                aria-label={t("memoCalculator")}
                onClick={() => {
                  calcFromView.current = true;
                  setCalcOpen(true);
                }}
                className={iconBtn}
              >
                <Calculator className="w-5 h-5" />
              </button>
              <button
                type="button"
                aria-label={t("memoShare")}
                onClick={() => void shareMemoPage(page)}
                className={iconBtn}
              >
                <Upload className="w-5 h-5" />
              </button>
            </div>
          </div>
        )}
      </div>

      {!editing && (
        <div className="shrink-0 px-6 pb-1 flex justify-center">
          <button
            type="button"
            onClick={() => enterEdit("title")}
            className="text-xl font-bold text-center leading-snug w-full break-words px-2 py-1 text-foreground"
          >
            {page.title.trim() || t("memoUntitled")}
          </button>
        </div>
      )}

      {!editing && (
        <p className="shrink-0 px-4 pb-2 text-xs text-muted-foreground text-left">
          {t("memoLastEdited")}: {formatUpdated(page.updatedAt)}
        </p>
      )}

      <div className="flex-1 min-h-0 px-4" style={{ paddingBottom: editing ? 0 : 8 }}>
        <div
          className={cn(
            "h-full overscroll-contain outline-none text-base leading-relaxed text-foreground",
            editing ? "overflow-y-auto" : "overflow-y-auto scrollbar-none cursor-text",
          )}
        >
          {editing ? (
            <div
              ref={editorRef}
              contentEditable
              suppressContentEditableWarning
              data-placeholder={t("memoBodyPlaceholder")}
              data-kb-ignore=""
              className="note-editor outline-none text-left"
              style={{ minHeight: "100%", paddingBottom: editorScrollPad }}
              onInput={() => {
                if (skipHtmlSync.current) return;
                draftHtmlRef.current = editorRef.current?.innerHTML || "";
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
            <div
              ref={viewBodyRef}
              role="button"
              tabIndex={0}
              onClick={(e) => enterEdit("body", e)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") enterEdit("body");
              }}
              className="w-full text-left cursor-text pt-3 block"
            >
              {htmlToPlainText(page.html) ? (
                <NoteHtmlView key={`view-${viewRevision}`} html={page.html} />
              ) : (
                <p className="text-muted-foreground/40 text-base">{t("memoClickToEdit")}</p>
              )}
            </div>
          )}
        </div>
      </div>

      {editing &&
        createPortal(
          <div
            className="fixed left-0 right-0 z-[60] px-3 pointer-events-none"
            style={{ bottom: toolbarBottom ?? "var(--bottom-nav-offset)" }}
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
        onClose={() => {
          calcFromView.current = false;
          setCalcOpen(false);
        }}
        onInsert={handleCalcInsert}
      />
      <ImagePickSheet
        open={pickOpen}
        onPhotos={() => void onOcr("photos")}
        onCamera={() => void onOcr("camera")}
        onCancel={() => setPickOpen(false)}
      />
      <OcrBusyOverlay open={ocrBusy} />
      <OcrResultSheet
        open={!!ocrFeedback}
        message={ocrFeedback?.message ?? ""}
        kind={ocrFeedback?.kind}
        onClose={() => {
          setOcrFeedback(null);
          if (editing) window.setTimeout(() => focusEditor(), 80);
        }}
      />
    </div>
  );
}
