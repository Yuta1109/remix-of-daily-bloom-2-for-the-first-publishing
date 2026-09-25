import { beforeEach, describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { I18nProvider } from "@/lib/i18n";
import { MemoArchiveNotice } from "@/components/MemoArchiveNotice";
import { buildUpsertOps } from "@/lib/firebase/firebase-firestore";
import Notes from "@/pages/Notes";
import {
  MEMO_V2_KEY,
  PAST_MEMOS_COLLECTION_ID,
  archivedNoteId,
  ensureLegacyMemoArchive,
  memoArchiveNoticeShouldShow,
  readMemoArchiveState,
} from "@/lib/v3/legacy-memo-archive";
import {
  listedCollections,
  listedNotes,
  listedQuickMemos,
  searchNotesCatalog,
} from "@/lib/v3/notes-view";
import {
  addNoteToCollection,
  archiveCollection,
  createCollection,
  createNote,
  createQuickMemo,
  createTask,
  deleteNote,
  deleteQuickMemo,
  getCollection,
  getCollectionEntries,
  getNote,
  getQuickMemo,
  reorderCollectionEntries,
  renameCollection,
  updateNote,
  updateQuickMemo,
} from "@/lib/v3/repository";
import { emptyData } from "@/lib/v3/schema";
import { loadEssencesData, resetEssencesDataCache, saveEssencesData } from "@/lib/v3/storage";
import { STORAGE_KEY } from "@/lib/v3/types";

const NOW = "2026-09-24T00:00:00.000Z";
const LEGACY_MEMOS = {
  categories: [
    { id: "c1", name: "仕事", pageIds: ["p2", "p1"], collapsed: false, color: "#C8E8D4" },
  ],
  pages: [
    { id: "p1", title: "会議", html: "<div>メモ本文</div>", updatedAt: 1758412800000 },
    { id: "p2", title: "買い物", html: "<div>あとで</div>", updatedAt: 1758326400000 },
  ],
};

function seedLegacyMemos() {
  localStorage.setItem(MEMO_V2_KEY, JSON.stringify(LEGACY_MEMOS));
}

function renderNotes(path = "/note") {
  return render(
    <I18nProvider>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/note/*" element={<Notes />} />
          <Route path="/notes/*" element={<Notes />} />
        </Routes>
      </MemoryRouter>
    </I18nProvider>,
  );
}

describe("Phase 9 Notes V3 UI", () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem("growth-app-lang", "en");
    resetEssencesDataCache();
    saveEssencesData(emptyData(NOW));
  });

  it("1. shows the migrated 過去のメモ collection in Notes", () => {
    seedLegacyMemos();
    ensureLegacyMemoArchive();
    renderNotes();
    expect(screen.getByTestId("past-memos-collection-row").textContent).toContain("過去のメモ");
    expect(listedCollections().some((c) => c.id === PAST_MEMOS_COLLECTION_ID)).toBe(true);
  });

  it("2. shows migrated notes inside 過去のメモ", () => {
    seedLegacyMemos();
    ensureLegacyMemoArchive();
    renderNotes(`/note/c/${encodeURIComponent(PAST_MEMOS_COLLECTION_ID)}`);
    expect(screen.getByTestId("collection-page")).toBeTruthy();
    expect(screen.getByText("会議")).toBeTruthy();
    expect(screen.getByText("買い物")).toBeTruthy();
  });

  it("3. keeps legacy ID mapping", () => {
    seedLegacyMemos();
    ensureLegacyMemoArchive();
    expect(getNote(archivedNoteId("p1"))?.title).toBe("会議");
    expect(getNote("legacy-note:p1")?.legacySource?.memoId).toBe("p1");
  });

  it("4. does not duplicate migration", () => {
    seedLegacyMemos();
    ensureLegacyMemoArchive();
    ensureLegacyMemoArchive();
    const notes = listedNotes().filter((n) => n.legacySource?.memoId === "p1");
    expect(notes).toHaveLength(1);
    expect(
      listedCollections().filter((c) => c.id === PAST_MEMOS_COLLECTION_ID),
    ).toHaveLength(1);
  });

  it("5. does not show ToDo tasks in Notes", () => {
    localStorage.setItem(
      "mindful-todo-data",
      JSON.stringify({ "2026-09-24": { tasks: [{ id: "t1", text: "ToDoSecretTask", date: "2026-09-24" }] } }),
    );
    createTask({ title: "ToDoSecretTask", date: "2026-09-24" });
    seedLegacyMemos();
    ensureLegacyMemoArchive();
    renderNotes();
    expect(screen.queryByText("ToDoSecretTask")).toBeNull();
    expect(listedNotes().some((n) => n.title === "ToDoSecretTask")).toBe(false);
    expect(listedQuickMemos().some((m) => m.text.includes("ToDoSecretTask"))).toBe(false);
  });

  it("6. creates a Note", () => {
    renderNotes();
    fireEvent.click(screen.getByTestId("notes-add-open"));
    fireEvent.click(screen.getByTestId("notes-add-note"));
    expect(screen.getByTestId("note-detail")).toBeTruthy();
    expect(listedNotes()).toHaveLength(1);
    expect(localStorage.getItem(MEMO_V2_KEY)).toBeNull();
  });

  it("7. edits a Note", () => {
    const note = createNote({ title: "下書き", html: "<div>a</div>" });
    renderNotes(`/note/n/${encodeURIComponent(note.id)}`);
    fireEvent.click(screen.getByText("下書き"));
    const input = screen.getByTestId("note-title-input") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "会議メモ" } });
    expect(getNote(note.id)?.title).toBe("会議メモ");
  });

  it("8. deletes a Note", () => {
    const note = createNote({ title: "消す", html: "<div>x</div>" });
    renderNotes(`/note/n/${encodeURIComponent(note.id)}`);
    fireEvent.click(screen.getByTestId("note-delete"));
    expect(getNote(note.id)).toBeTruthy();
    fireEvent.click(screen.getByTestId("note-delete-confirm-confirm"));
    expect(getNote(note.id)).toBeUndefined();
  });

  it("9. creates a Quick Memo", () => {
    renderNotes();
    fireEvent.click(screen.getByTestId("notes-add-open"));
    fireEvent.click(screen.getByTestId("notes-add-quick-memo"));
    fireEvent.change(screen.getByTestId("quick-memo-input"), { target: { value: "短いメモ" } });
    fireEvent.click(screen.getByTestId("quick-memo-save"));
    expect(listedQuickMemos().some((m) => m.text === "短いメモ")).toBe(true);
    expect(screen.getByTestId("quick-memo-page")).toBeTruthy();
  });

  it("10. edits a Quick Memo", () => {
    const memo = createQuickMemo({ text: "before" });
    renderNotes(`/note/q/${encodeURIComponent(memo.id)}`);
    fireEvent.change(screen.getByTestId("quick-memo-editor"), { target: { value: "after" } });
    expect(getQuickMemo(memo.id)?.text).toBe("after");
  });

  it("11. deletes a Quick Memo", () => {
    const memo = createQuickMemo({ text: "gone" });
    renderNotes(`/note/q/${encodeURIComponent(memo.id)}`);
    fireEvent.click(screen.getByTestId("quick-memo-delete"));
    expect(getQuickMemo(memo.id)).toBeTruthy();
    fireEvent.click(screen.getByTestId("quick-memo-delete-confirm-confirm"));
    expect(getQuickMemo(memo.id)).toBeUndefined();
  });

  it("12. creates a Collection", () => {
    renderNotes();
    fireEvent.click(screen.getByTestId("notes-add-open"));
    fireEvent.click(screen.getByTestId("notes-add-collection"));
    fireEvent.change(screen.getByTestId("notes-name-input"), { target: { value: "旅行" } });
    fireEvent.click(screen.getByTestId("notes-name-submit"));
    expect(listedCollections().some((c) => c.name === "旅行")).toBe(true);
    expect(screen.getByTestId("collection-page")).toBeTruthy();
  });

  it("13. renames a Collection", () => {
    const collection = createCollection({ name: "旧名" });
    renderNotes(`/note/c/${encodeURIComponent(collection.id)}`);
    fireEvent.click(screen.getByTestId("collection-rename-open"));
    fireEvent.change(screen.getByTestId("notes-name-input"), { target: { value: "新名" } });
    fireEvent.click(screen.getByTestId("notes-name-submit"));
    expect(getCollection(collection.id)?.name).toBe("新名");
  });

  it("14. adds a Note to a Collection", () => {
    const collection = createCollection({ name: "箱" });
    const note = createNote({ title: "中のメモ", html: "<div>body</div>" });
    addNoteToCollection(collection.id, note.id);
    expect(getNote(note.id)?.collectionIds).toContain(collection.id);
    renderNotes(`/note/c/${encodeURIComponent(collection.id)}`);
    expect(screen.getByText("中のメモ")).toBeTruthy();
  });

  it("15. reorders Collection entries", () => {
    const collection = createCollection({ name: "順" });
    const a = createNote({ title: "A", html: "<div>a</div>", collectionIds: [collection.id] });
    const b = createNote({ title: "B", html: "<div>b</div>", collectionIds: [collection.id] });
    const before = getCollectionEntries(collection.id);
    expect(before.map((e) => e.noteId)).toEqual([a.id, b.id]);
    reorderCollectionEntries(collection.id, [before[1].id, before[0].id]);
    expect(getCollectionEntries(collection.id).map((e) => e.noteId)).toEqual([b.id, a.id]);
  });

  it("16. archives a Collection", () => {
    const collection = createCollection({ name: "一時" });
    archiveCollection(collection.id);
    expect(getCollection(collection.id)?.archivedAt).toBeTruthy();
    expect(listedCollections().some((c) => c.id === collection.id)).toBe(false);
  });

  it("17. searches Notes", () => {
    createNote({ title: "検索対象ノート", html: "<div>中身</div>" });
    expect(searchNotesCatalog("検索対象").some((h) => h.kind === "note")).toBe(true);
    renderNotes("/note/search?q=検索対象");
    expect(screen.getByText("検索対象ノート")).toBeTruthy();
  });

  it("18. searches Quick Memos", () => {
    createQuickMemo({ text: "買い物を忘れない" });
    expect(searchNotesCatalog("忘れない").some((h) => h.kind === "quickMemo")).toBe(true);
    renderNotes("/note/search?q=忘れない");
    expect(screen.getByTestId(/search-hit-quickMemo-/)).toBeTruthy();
  });

  it("19. serves the /note route", () => {
    renderNotes("/note");
    expect(screen.getByTestId("notes-home")).toBeTruthy();
  });

  it("20. keeps /notes as a compatible alias", () => {
    renderNotes("/notes");
    expect(screen.getByTestId("notes-home")).toBeTruthy();
  });

  it("21. maps an old Note deep link to the V3 note", () => {
    seedLegacyMemos();
    ensureLegacyMemoArchive();
    renderNotes("/notes/p1");
    expect(screen.getByTestId("note-detail")).toBeTruthy();
    expect(screen.getByText("会議")).toBeTruthy();
  });

  it("22. opens 過去のメモ from the migration notice", () => {
    seedLegacyMemos();
    ensureLegacyMemoArchive();
    render(
      <I18nProvider>
        <MemoryRouter initialEntries={["/note"]}>
          <Routes>
            <Route path="/note/*" element={<Notes />} />
          </Routes>
          <MemoArchiveNotice />
        </MemoryRouter>
      </I18nProvider>,
    );
    expect(screen.getByTestId("memo-archive-notice")).toBeTruthy();
    fireEvent.click(screen.getByTestId("memo-archive-notice-open"));
    expect(readMemoArchiveState()?.notice).toBe("shown");
    expect(screen.getByTestId("collection-page")).toBeTruthy();
    expect(screen.getByText("会議")).toBeTruthy();
  });

  it("23. shows the migration notice only once", () => {
    seedLegacyMemos();
    ensureLegacyMemoArchive();
    expect(memoArchiveNoticeShouldShow(readMemoArchiveState())).toBe(true);
    const first = render(
      <I18nProvider>
        <MemoryRouter>
          <MemoArchiveNotice />
        </MemoryRouter>
      </I18nProvider>,
    );
    fireEvent.click(screen.getByTestId("memo-archive-notice-ok"));
    expect(readMemoArchiveState()?.notice).toBe("shown");
    first.unmount();
    render(
      <I18nProvider>
        <MemoryRouter>
          <MemoArchiveNotice />
        </MemoryRouter>
      </I18nProvider>,
    );
    expect(screen.queryByTestId("memo-archive-notice")).toBeNull();
  });

  it("24. new Note saves participate in V3 cloud upserts", () => {
    const note = createNote({ title: "sync-note", html: "<div>n</div>" });
    const ops = buildUpsertOps("uid-1", loadEssencesData());
    expect(ops.some((op) => op.collection === "notes" && op.id === note.id)).toBe(true);
  });

  it("25. Quick Memo saves participate in V3 cloud upserts", () => {
    const memo = createQuickMemo({ text: "sync-quick" });
    const ops = buildUpsertOps("uid-1", loadEssencesData());
    expect(ops.some((op) => op.collection === "quickMemos" && op.id === memo.id)).toBe(true);
  });

  it("26. Collection saves participate in V3 cloud upserts", () => {
    const collection = createCollection({ name: "sync-col" });
    const ops = buildUpsertOps("uid-1", loadEssencesData());
    expect(ops.some((op) => op.collection === "collections" && op.id === collection.id)).toBe(true);
  });

  it("does not write new notes to legacy memo storage", () => {
    createNote({ title: "v3 only" });
    createQuickMemo({ text: "v3 quick" });
    createCollection({ name: "v3 col" });
    expect(localStorage.getItem(MEMO_V2_KEY)).toBeNull();
    expect(localStorage.getItem("essences-memos")).toBeNull();
    expect(localStorage.getItem(STORAGE_KEY)).toContain("v3 only");
  });

  it("rejects inline data-URL image attachments", () => {
    expect(() =>
      createNote({
        title: "img",
        image: { id: "i1", localUri: "data:image/jpeg;base64,AAAA", createdAt: NOW },
      }),
    ).toThrow(/inline data/);
  });

  it("delete helpers remove notes and quick memos from V3", () => {
    const note = createNote({ title: "x" });
    const memo = createQuickMemo({ text: "y" });
    updateNote(note.id, { title: "z" });
    updateQuickMemo(memo.id, { text: "w" });
    deleteNote(note.id);
    deleteQuickMemo(memo.id);
    expect(getNote(note.id)).toBeUndefined();
    expect(getQuickMemo(memo.id)).toBeUndefined();
  });
});
