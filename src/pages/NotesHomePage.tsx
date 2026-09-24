import { useState } from "react";
import { Plus, Search } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { UserButton } from "@/components/UserButton";
import { NotesAddMenu } from "@/components/notes/NotesAddMenu";
import { NotesNameSheet } from "@/components/notes/NotesNameSheet";
import { QuickMemoSheet } from "@/components/notes/QuickMemoSheet";
import { TodoSectionHeader } from "@/components/todo/TodoSectionHeader";
import { useI18n } from "@/lib/i18n";
import { htmlToPlainText } from "@/lib/notes-store";
import {
  collectionPath,
  listedCollections,
  listedNotes,
  listedQuickMemos,
  noteDetailPath,
  NOTES_SEARCH_PATH,
  PAST_MEMOS_COLLECTION_ID,
  quickMemoPath,
} from "@/lib/v3/notes-view";
import { createCollection, createNote, createQuickMemo } from "@/lib/v3/repository";
import type { ImageAttachment } from "@/lib/v3/types";

function previewOf(text: string): string {
  const trimmed = text.replace(/\s+/g, " ").trim();
  if (!trimmed) return "";
  return trimmed.length > 80 ? `${trimmed.slice(0, 80)}…` : trimmed;
}

export default function NotesHomePage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [, setTick] = useState(0);
  const [addOpen, setAddOpen] = useState(false);
  const [quickOpen, setQuickOpen] = useState(false);
  const [collectionOpen, setCollectionOpen] = useState(false);

  const quickMemos = listedQuickMemos();
  const notes = listedNotes();
  const collections = listedCollections();

  const createAndOpenNote = (collectionId?: string) => {
    const note = createNote(collectionId ? { collectionIds: [collectionId] } : {});
    setTick((n) => n + 1);
    navigate(noteDetailPath(note.id));
  };

  return (
    <div className="app-shell-page" data-testid="notes-home">
      <div className="app-shell-header px-4 pb-2">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-[28px] font-bold tracking-tight leading-tight">{t("notesPageTitle")}</h1>
          <div className="flex items-center gap-1">
            <button
              type="button"
              aria-label={t("notesSearchTitle")}
              data-testid="notes-search-open"
              onClick={() => navigate(NOTES_SEARCH_PATH)}
              className="inline-flex items-center justify-center w-9 h-9 rounded-full text-foreground/70"
            >
              <Search className="w-5 h-5" />
            </button>
            <button
              type="button"
              aria-label={t("notesAddMenuTitle")}
              data-testid="notes-add-open"
              onClick={() => setAddOpen(true)}
              className="inline-flex items-center justify-center w-9 h-9 rounded-full text-foreground/70"
            >
              <Plus className="w-5 h-5" />
            </button>
            <UserButton />
          </div>
        </div>
      </div>

      <div className="app-shell-scroll px-4">
        <section aria-labelledby="notes-quick-heading" data-testid="notes-section-quick-memo">
          <TodoSectionHeader id="notes-quick-heading" title={t("notesSectionQuickMemo")} />
          {quickMemos.length === 0 ? (
            <p className="px-1 py-3 text-sm text-muted-foreground">{t("notesQuickMemoEmpty")}</p>
          ) : (
            <ul className="divide-y divide-border/60">
              {quickMemos.map((memo) => (
                <li key={memo.id}>
                  <button
                    type="button"
                    data-testid={`quick-memo-row-${memo.id}`}
                    onClick={() => navigate(quickMemoPath(memo.id))}
                    className="w-full text-left px-1 py-3 min-h-11"
                  >
                    <p className="text-[17px] leading-snug line-clamp-2">
                      {memo.text.trim() || t("notesUntitled")}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="notes-note-heading" data-testid="notes-section-note">
          <TodoSectionHeader id="notes-note-heading" title={t("notesSectionNote")} />
          {notes.length === 0 ? (
            <p className="px-1 py-3 text-sm text-muted-foreground">{t("notesNoteEmpty")}</p>
          ) : (
            <ul className="divide-y divide-border/60">
              {notes.map((note) => (
                <li key={note.id}>
                  <button
                    type="button"
                    data-testid={`note-row-${note.id}`}
                    onClick={() => navigate(noteDetailPath(note.id))}
                    className="w-full text-left px-1 py-3 min-h-11"
                  >
                    <p className="text-[17px] leading-snug">
                      {note.title.trim() || t("notesUntitled")}
                    </p>
                    {previewOf(htmlToPlainText(note.html)) ? (
                      <p className="text-[13px] text-muted-foreground mt-0.5 line-clamp-2">
                        {previewOf(htmlToPlainText(note.html))}
                      </p>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="notes-collections-heading" data-testid="notes-section-collections">
          <TodoSectionHeader id="notes-collections-heading" title={t("notesSectionCollections")} />
          {collections.length === 0 ? (
            <p className="px-1 py-3 text-sm text-muted-foreground">{t("notesCollectionsEmpty")}</p>
          ) : (
            <ul className="divide-y divide-border/60">
              {collections.map((collection) => (
                <li key={collection.id}>
                  <button
                    type="button"
                    data-testid={
                      collection.id === PAST_MEMOS_COLLECTION_ID
                        ? "past-memos-collection-row"
                        : `collection-row-${collection.id}`
                    }
                    onClick={() => navigate(collectionPath(collection.id))}
                    className="w-full text-left px-1 py-3 min-h-11"
                  >
                    <p className="text-[17px] leading-snug">{collection.name}</p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
        <div className="h-16" aria-hidden="true" />
      </div>

      <NotesAddMenu
        open={addOpen}
        onOpenChange={setAddOpen}
        onPick={(kind) => {
          if (kind === "quickMemo") setQuickOpen(true);
          if (kind === "note") createAndOpenNote();
          if (kind === "collection") setCollectionOpen(true);
        }}
      />
      <QuickMemoSheet
        open={quickOpen}
        onOpenChange={setQuickOpen}
        onSubmit={(input: { text: string; image?: ImageAttachment }) => {
          const memo = createQuickMemo(input);
          setTick((n) => n + 1);
          navigate(quickMemoPath(memo.id));
        }}
      />
      <NotesNameSheet
        open={collectionOpen}
        title={t("notesNewCollectionTitle")}
        placeholder={t("notesCollectionNamePlaceholder")}
        onOpenChange={setCollectionOpen}
        onSubmit={(name) => {
          const collection = createCollection({ name });
          setTick((n) => n + 1);
          navigate(collectionPath(collection.id));
        }}
      />
    </div>
  );
}
