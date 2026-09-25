import { beforeEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { AuthProvider } from "@/lib/firebase/AuthProvider";
import { I18nProvider } from "@/lib/i18n";
import NotesHomePage from "@/pages/NotesHomePage";
import { ImagePickSheet } from "@/components/ImagePickSheet";
import { deleteNoteImageBlob, persistPickedImageBlob } from "@/lib/note-image-cache";
import {
  NOTES_HOME_COLLECTION_LIMIT,
  NOTES_HOME_NOTE_LIMIT,
  NOTES_HOME_QUICK_MEMO_LIMIT,
  listedCollections,
  searchCollections,
  searchNotePages,
  searchQuickMemos,
} from "@/lib/v3/notes-view";
import {
  addNoteToCollection,
  createCollection,
  createNote,
  createQuickMemo,
  getCollectionEntries,
} from "@/lib/v3/repository";
import { emptyData } from "@/lib/v3/schema";
import { resetEssencesDataCache, saveEssencesData } from "@/lib/v3/storage";

const NOW = "2026-09-25T00:00:00.000Z";

describe("Phase 14-B Notes", () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem("growth-app-lang", "en");
    resetEssencesDataCache();
    saveEssencesData(emptyData(NOW));
  });

  it("limits home rows and keeps independent search", () => {
    for (let i = 0; i < 6; i++) createQuickMemo({ text: `qm-${i}` });
    for (let i = 0; i < 6; i++) createNote({ title: `note-${i}` });
    for (let i = 0; i < 12; i++) createCollection({ name: `col-${i}` });
    render(
      <I18nProvider>
        <MemoryRouter>
          <NotesHomePage />
        </MemoryRouter>
      </I18nProvider>,
    );
    expect(screen.getAllByTestId(/quick-memo-row-/)).toHaveLength(NOTES_HOME_QUICK_MEMO_LIMIT);
    expect(screen.getAllByTestId(/note-row-/)).toHaveLength(NOTES_HOME_NOTE_LIMIT);
    expect(screen.getAllByTestId(/collection-row-/)).toHaveLength(NOTES_HOME_COLLECTION_LIMIT);
    expect(screen.getByTestId("notes-see-all-quick")).toBeTruthy();
    expect(searchQuickMemos("qm-5")).toHaveLength(1);
    expect(searchNotePages("note-5")).toHaveLength(1);
    expect(searchCollections("col-11")).toHaveLength(1);
    expect(searchQuickMemos("note-1")).toHaveLength(0);
  });

  it("adds a note to a collection through CollectionEntry", () => {
    const note = createNote({ title: "inside" });
    const collection = createCollection({ name: "box" });
    const entry = addNoteToCollection(collection.id, note.id);
    expect(entry.type).toBe("note");
    expect(entry.noteId).toBe(note.id);
    expect(getCollectionEntries(collection.id).some((e) => e.noteId === note.id)).toBe(true);
    expect(listedCollections().some((c) => c.id === collection.id)).toBe(true);
  });

  it("uses photo wording on the image picker", () => {
    render(
      <I18nProvider>
        <ImagePickSheet open onPhotos={() => {}} onCamera={() => {}} onCancel={() => {}} />
      </I18nProvider>,
    );
    expect(screen.getByText("Add a photo")).toBeTruthy();
    expect(screen.queryByText("AI image recognition")).toBeNull();
  });

  it("replaces a cached image without keeping the previous object url", async () => {
    const first = new Blob(["one"], { type: "image/jpeg" });
    const second = new Blob(["two"], { type: "image/jpeg" });
    const url1 = await persistPickedImageBlob("img-1", first);
    const url2 = await persistPickedImageBlob("img-1", second);
    expect(url2).not.toBe(url1);
    await deleteNoteImageBlob("img-1");
  });
});

describe("Phase 14-B settings copy", () => {
  it("shows Future plan reflection wording and version 1.2.0", async () => {
    const { default: Settings } = await import("@/pages/Settings");
    localStorage.clear();
    localStorage.setItem("growth-app-lang", "en");
    resetEssencesDataCache();
    saveEssencesData(emptyData(NOW));
    render(
      <I18nProvider>
        <AuthProvider>
          <MemoryRouter>
            <Settings />
          </MemoryRouter>
        </AuthProvider>
      </I18nProvider>,
    );
    expect(screen.getByText("Future plan reflection")).toBeTruthy();
    expect(screen.getByText("Monthly plan reflection")).toBeTruthy();
    expect(screen.getByText(/1\.2\.0/)).toBeTruthy();
    expect(screen.queryByTestId("settings-open-account")).toBeNull();
  });
});
