import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { I18nProvider } from "@/lib/i18n";
import { AuthProvider } from "@/lib/firebase/AuthProvider";
import { MemoArchiveNotice } from "@/components/MemoArchiveNotice";
import { FIREBASE_AUTH_AUTHORIZED_DOMAIN } from "@/lib/firebase/firebase-config";
import { buildUpsertOps } from "@/lib/firebase/firebase-firestore";
import { emptyData } from "@/lib/v3/schema";
import {
  MEMO_ARCHIVE_STATE_KEY,
  MEMO_ARCHIVE_VERSION,
  MEMO_V1_KEY,
  MEMO_V2_KEY,
  PAST_MEMOS_COLLECTION_ID,
  PAST_MEMOS_COLLECTION_NAME,
  TODO_KEY,
  applyMemoArchiveInto,
  archivedNoteId,
  ensureLegacyMemoArchive,
  isMemoArchiveComplete,
  memoArchiveNoticeShouldShow,
  persistMemoArchiveCompletion,
  readMemoArchiveState,
  readMemoLibrarySnapshot,
} from "@/lib/v3/legacy-memo-archive";
import { WELCOME_MEMO_ID } from "@/lib/notes-store";
import { loadEssencesData, resetEssencesDataCache, saveEssencesData } from "@/lib/v3/storage";
import { STORAGE_KEY } from "@/lib/v3/types";
import User from "@/pages/User";

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

function seedMemos() {
  localStorage.setItem(MEMO_V2_KEY, JSON.stringify(LEGACY_MEMOS));
}

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem("growth-app-lang", "en");
  resetEssencesDataCache();
});

describe("Phase 8.1 legacy memo archive", () => {
  it("1 / 8. maps legacy memo pages to V3 notes with title and html", () => {
    const data = emptyData(NOW);
    const result = applyMemoArchiveInto(data, readMemoLibrarySnapshotFrom(LEGACY_MEMOS), NOW);
    const note = data.notes[archivedNoteId("p1")];
    expect(result.migratedCount).toBe(2);
    expect(note.title).toBe("会議");
    expect(note.html).toBe("<div>メモ本文</div>");
    expect(note.legacySource?.memoId).toBe("p1");
    expect(note.createdAt).toBe(new Date(1758412800000).toISOString());
  });

  it("2. puts every migrated note in the 過去のメモ collection", () => {
    const data = emptyData(NOW);
    applyMemoArchiveInto(data, readMemoLibrarySnapshotFrom(LEGACY_MEMOS), NOW);
    expect(data.collections[PAST_MEMOS_COLLECTION_ID]?.name).toBe(PAST_MEMOS_COLLECTION_NAME);
    const entries = Object.values(data.collectionEntries).filter(
      (e) => e.collectionId === PAST_MEMOS_COLLECTION_ID,
    );
    expect(entries.map((e) => e.noteId)).toEqual([archivedNoteId("p2"), archivedNoteId("p1")]);
    expect(data.notes[archivedNoteId("p1")].collectionIds).toContain(PAST_MEMOS_COLLECTION_ID);
  });

  it("3. ToDo data is not a migration source", () => {
    localStorage.setItem(
      TODO_KEY,
      JSON.stringify({ "2026-09-24": { tasks: [{ id: "t1", text: "買い物", date: "2026-09-24" }] } }),
    );
    seedMemos();
    const spy = vi.spyOn(Storage.prototype, "getItem");
    const snapshot = readMemoLibrarySnapshot();
    const keys = spy.mock.calls.map((call) => call[0]);
    spy.mockRestore();
    expect(snapshot.pages.map((p) => p.id).sort()).toEqual(["p1", "p2"]);
    expect(keys).toContain(MEMO_V2_KEY);
    expect(keys).not.toContain(TODO_KEY);
    expect(keys).not.toContain("mindful-todo-data");

    const data = emptyData(NOW);
    applyMemoArchiveInto(data, snapshot, NOW);
    expect(Object.keys(data.tasks)).toHaveLength(0);
    expect(localStorage.getItem(TODO_KEY)).toBeTruthy();
  });

  it("4 / 12. is idempotent across repeats and app restart", () => {
    seedMemos();
    saveEssencesData(emptyData(NOW));
    const first = ensureLegacyMemoArchive();
    const ids = Object.keys(loadEssencesData().notes).sort();
    resetEssencesDataCache();
    const second = ensureLegacyMemoArchive();
    expect(Object.keys(loadEssencesData().notes).sort()).toEqual(ids);
    expect(first?.version).toBe(MEMO_ARCHIVE_VERSION);
    expect(second?.version).toBe(MEMO_ARCHIVE_VERSION);
    expect(
      Object.values(loadEssencesData().collectionEntries).filter(
        (e) => e.collectionId === PAST_MEMOS_COLLECTION_ID,
      ),
    ).toHaveLength(2);
  });

  it("5. uses deterministic legacy-note ids", () => {
    expect(archivedNoteId("p1")).toBe("legacy-note:p1");
    const data = emptyData(NOW);
    applyMemoArchiveInto(data, readMemoLibrarySnapshotFrom(LEGACY_MEMOS), NOW);
    expect(data.notes["legacy-note:p1"]).toBeTruthy();
    expect(data.collectionEntries["legacy-entry:essences-past-memos:p1"]?.noteId).toBe(
      "legacy-note:p1",
    );
  });

  it("6. stores the migration version only after success", () => {
    seedMemos();
    saveEssencesData(emptyData(NOW));
    expect(readMemoArchiveState()).toBeNull();
    const state = ensureLegacyMemoArchive();
    expect(state?.version).toBe(1);
    expect(JSON.parse(localStorage.getItem(MEMO_ARCHIVE_STATE_KEY) as string).version).toBe(1);
  });

  it("7. does not write a completion marker on failure", () => {
    expect(persistMemoArchiveCompletion({ ok: false, migratedCount: 4 })).toBeNull();
    expect(readMemoArchiveState()).toBeNull();
    expect(isMemoArchiveComplete()).toBe(false);
  });

  it("9. migrated notes are included in Firestore upsert ops after archive", () => {
    seedMemos();
    saveEssencesData(emptyData(NOW));
    ensureLegacyMemoArchive();
    const ops = buildUpsertOps("uidA", loadEssencesData());
    expect(ops.some((op) => op.collection === "notes" && op.id === "legacy-note:p1")).toBe(true);
    expect(ops.some((op) => op.collection === "collections" && op.id === PAST_MEMOS_COLLECTION_ID)).toBe(
      true,
    );
    expect(ops.some((op) => op.collection === "collectionEntries")).toBe(true);
    expect(localStorage.getItem(STORAGE_KEY)).toBeTruthy();
  });

  it("10. shows the notice once, then never again", () => {
    seedMemos();
    saveEssencesData(emptyData(NOW));
    const state = ensureLegacyMemoArchive();
    expect(memoArchiveNoticeShouldShow(state)).toBe(true);
    const first = render(
      <I18nProvider>
        <MemoryRouter>
          <MemoArchiveNotice />
        </MemoryRouter>
      </I18nProvider>,
    );
    expect(screen.getByTestId("memo-archive-notice")).toBeTruthy();
    expect(screen.getByText("Notes have been redesigned")).toBeTruthy();
    fireEvent.click(screen.getByTestId("memo-archive-notice-ok"));
    expect(readMemoArchiveState()?.notice).toBe("shown");
    expect(memoArchiveNoticeShouldShow(readMemoArchiveState())).toBe(false);
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

  it("11. does not show a notice when there are no user memos", () => {
    saveEssencesData(emptyData(NOW));
    const state = ensureLegacyMemoArchive();
    expect(state?.migratedCount).toBe(0);
    expect(state?.notice).toBe("skipped");
    expect(memoArchiveNoticeShouldShow(state)).toBe(false);
    render(
      <I18nProvider>
        <MemoryRouter>
          <MemoArchiveNotice />
        </MemoryRouter>
      </I18nProvider>,
    );
    expect(screen.queryByTestId("memo-archive-notice")).toBeNull();
  });

  it("skips the onboarding welcome memo and can read v1 essences-memos", () => {
    localStorage.setItem(
      MEMO_V1_KEY,
      JSON.stringify([
        { id: WELCOME_MEMO_ID, title: "welcome", html: "<div>x</div>", updatedAt: 1 },
        { id: "old-1", title: "古い", html: "<p>残す</p>", updatedAt: 2 },
      ]),
    );
    const snapshot = readMemoLibrarySnapshot();
    expect(snapshot.pages.map((p) => p.id)).toEqual(["old-1"]);
    const data = emptyData(NOW);
    applyMemoArchiveInto(data, snapshot, NOW);
    expect(data.notes[archivedNoteId(WELCOME_MEMO_ID)]).toBeUndefined();
    expect(data.notes[archivedNoteId("old-1")]?.title).toBe("古い");
  });

  it("does not delete the legacy memo library", () => {
    seedMemos();
    saveEssencesData(emptyData(NOW));
    ensureLegacyMemoArchive();
    expect(JSON.parse(localStorage.getItem(MEMO_V2_KEY) as string).pages).toHaveLength(2);
  });
});

describe("Phase 8.1 Google Sign-In remains optional", () => {
  it("does not require Google Sign-In on the User page", () => {
    saveEssencesData(emptyData(NOW));
    render(
      <I18nProvider>
        <AuthProvider>
          <MemoryRouter>
            <User />
          </MemoryRouter>
        </AuthProvider>
      </I18nProvider>,
    );
    expect(screen.getByText(/Signing in with Google saves your data/i)).toBeTruthy();
    expect(screen.getByTestId("user-auth-status").textContent).toMatch(/Signed out/i);
    expect(FIREBASE_AUTH_AUTHORIZED_DOMAIN).toBe("localhost");
    expect(FIREBASE_AUTH_AUTHORIZED_DOMAIN.includes(":")).toBe(false);
  });
});

function readMemoLibrarySnapshotFrom(raw: unknown) {
  localStorage.setItem(MEMO_V2_KEY, JSON.stringify(raw));
  return readMemoLibrarySnapshot();
}
