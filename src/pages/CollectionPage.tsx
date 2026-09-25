import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import { NotesNameSheet } from "@/components/notes/NotesNameSheet";
import { ConfirmMessage } from "@/components/notes/ConfirmMessage";
import { useI18n } from "@/lib/i18n";
import { tickHaptic } from "@/lib/haptics";
import {
  autoScrollIfNeeded,
  computeStableInsertIndex,
  measureInScrollContainer,
  pointerYInScrollContainer,
  type DragMeasurement,
} from "@/lib/list-drag";
import {
  NOTES_HOME_PATH,
  collectionEntryViews,
  listedNotes,
  noteDetailPath,
} from "@/lib/v3/notes-view";
import {
  addNoteToCollection,
  archiveCollection,
  createNote,
  getCollection,
  reorderCollectionEntries,
  renameCollection,
} from "@/lib/v3/repository";

const LONG_PRESS_MS = 420;
const DRAG_THRESHOLD = 10;

export default function CollectionPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { collectionId = "" } = useParams();
  const id = decodeURIComponent(collectionId);
  const [, setTick] = useState(0);
  const [renameOpen, setRenameOpen] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [addExisting, setAddExisting] = useState(false);
  const collection = getCollection(id);
  const entries = collectionEntryViews(id);
  const entryIdsKey = entries.map((e) => e.entry.id).join("\0");

  useEffect(() => {
    if (!collection) navigate(NOTES_HOME_PATH, { replace: true });
  }, [collection, navigate]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const rowRefs = useRef(new Map<string, HTMLButtonElement>());
  const pressTimer = useRef<number | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [orderedIds, setOrderedIds] = useState<string[]>([]);
  const metricsRef = useRef<DragMeasurement[]>([]);
  const startY = useRef(0);
  const armed = useRef(false);

  useEffect(() => {
    setOrderedIds((prev) => {
      const next = entryIdsKey ? entryIdsKey.split("\0") : [];
      if (prev.length === next.length && prev.every((id, i) => id === next[i])) return prev;
      return next;
    });
  }, [entryIdsKey]);

  const goHome = () => navigate(NOTES_HOME_PATH);

  const clearPress = () => {
    if (pressTimer.current != null) {
      window.clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
    armed.current = false;
  };

  const onPointerDown = (entryId: string, clientY: number) => {
    clearPress();
    startY.current = clientY;
    pressTimer.current = window.setTimeout(() => {
      armed.current = true;
      tickHaptic();
      const root = scrollRef.current;
      if (!root) return;
      metricsRef.current = orderedIds.flatMap((oid) => {
        const el = rowRefs.current.get(oid);
        return el ? [measureInScrollContainer(el, root, oid)] : [];
      });
      setDragId(entryId);
    }, LONG_PRESS_MS);
  };

  const onPointerMove = useCallback(
    (clientY: number) => {
      if (!armed.current && Math.abs(clientY - startY.current) > DRAG_THRESHOLD) {
        clearPress();
      }
      if (!dragId || !scrollRef.current) return;
      if (Math.abs(clientY - startY.current) < DRAG_THRESHOLD) return;
      autoScrollIfNeeded(scrollRef.current, clientY);
      const y = pointerYInScrollContainer(clientY, scrollRef.current);
      const from = orderedIds.indexOf(dragId);
      const insert = computeStableInsertIndex(y, metricsRef.current, dragId, from);
      if (insert === from || insert < 0) return;
      const next = [...orderedIds];
      const [moved] = next.splice(from, 1);
      next.splice(insert, 0, moved);
      setOrderedIds(next);
    },
    [dragId, orderedIds],
  );

  const onPointerUp = () => {
    const wasDragging = !!dragId;
    clearPress();
    if (wasDragging) {
      reorderCollectionEntries(id, orderedIds);
      setTick((n) => n + 1);
    }
    setDragId(null);
  };

  if (!collection) return null;

  const viewsById = new Map(entries.map((e) => [e.entry.id, e]));

  return (
    <div className="app-shell-page" data-testid="collection-page">
      <div className="app-shell-header px-4 pb-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label={t("notesBack")}
            onClick={goHome}
            className="inline-flex items-center justify-center w-9 h-9 rounded-full"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <button
            type="button"
            data-testid="collection-rename-open"
            onClick={() => setRenameOpen(true)}
            className="flex-1 text-left min-h-11"
          >
            <h1 className="text-lg font-semibold truncate">{collection.name}</h1>
          </button>
          <button
            type="button"
            aria-label={t("notesAddNote")}
            data-testid="collection-add-note"
            onClick={() => {
              const note = createNote({ collectionIds: [id] });
              setTick((n) => n + 1);
              navigate(noteDetailPath(note.id));
            }}
            className="inline-flex items-center justify-center w-9 h-9 rounded-full"
          >
            <Plus className="w-5 h-5" />
          </button>
          <button
            type="button"
            aria-label={t("notesArchiveCollection")}
            data-testid="collection-archive"
            onClick={() => setConfirmArchive(true)}
            className="inline-flex items-center justify-center w-9 h-9 rounded-full text-foreground/70"
          >
            <Trash2 className="w-5 h-5" />
          </button>
        </div>
      </div>
      <div
        ref={scrollRef}
        className="app-shell-scroll px-4"
        onPointerMove={(e) => onPointerMove(e.clientY)}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <button
          type="button"
          data-testid="collection-add-existing-note"
          className="mb-3 text-sm text-accent min-h-11"
          onClick={() => setAddExisting(true)}
        >
          {t("notesAddExistingNote")}
        </button>
        {addExisting && (
          <ul className="mb-3 rounded-2xl bg-card divide-y divide-border/60" data-testid="collection-existing-notes">
            {listedNotes()
              .filter((note) => !entries.some((e) => e.entry.noteId === note.id))
              .map((note) => (
                <li key={note.id}>
                  <button
                    type="button"
                    className="w-full text-left px-3 py-3 min-h-11"
                    onClick={() => {
                      addNoteToCollection(id, note.id);
                      setTick((n) => n + 1);
                      setAddExisting(false);
                    }}
                  >
                    {note.title.trim() || t("notesUntitled")}
                  </button>
                </li>
              ))}
          </ul>
        )}
        {orderedIds.length === 0 ? (
          <p className="px-1 py-6 text-sm text-muted-foreground">{t("notesCollectionEmpty")}</p>
        ) : (
          <ul className="divide-y divide-border/60" data-testid="collection-entry-list">
            {orderedIds.map((entryId) => {
              const view = viewsById.get(entryId);
              if (!view) return null;
              return (
                <li key={entryId}>
                  <button
                    type="button"
                    data-testid={`collection-entry-${entryId}`}
                    ref={(el) => {
                      if (el) rowRefs.current.set(entryId, el);
                      else rowRefs.current.delete(entryId);
                    }}
                    onPointerDown={(e) => onPointerDown(entryId, e.clientY)}
                    onClick={() => {
                      if (dragId) return;
                      if (view.href) navigate(view.href);
                    }}
                    className="w-full text-left px-1 py-3 min-h-11"
                  >
                    <p className="text-[13px] text-muted-foreground">
                      {view.kind === "note"
                        ? t("notesSectionNote")
                        : view.kind === "quickMemo"
                          ? t("notesSectionQuickMemo")
                          : t("notesEntryPlan")}
                    </p>
                    <p className="text-[17px] leading-snug">
                      {view.title.trim() || t("notesUntitled")}
                    </p>
                    {view.preview ? (
                      <p className="text-[13px] text-muted-foreground mt-0.5 line-clamp-2">
                        {view.preview}
                      </p>
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <NotesNameSheet
        open={renameOpen}
        title={t("notesRename")}
        initialValue={collection.name}
        confirmLabel={t("notesRename")}
        onOpenChange={setRenameOpen}
        onSubmit={(name) => {
          renameCollection(id, name);
          setTick((n) => n + 1);
        }}
      />
      <ConfirmMessage
        open={confirmArchive}
        testId="collection-delete-confirm"
        message={t("notesArchiveCollectionConfirm")}
        confirmLabel={t("notesArchiveCollection")}
        cancelLabel={t("notesCancel")}
        onCancel={() => setConfirmArchive(false)}
        onConfirm={() => {
          archiveCollection(id);
          navigate(NOTES_HOME_PATH, { replace: true });
        }}
      />
    </div>
  );
}
