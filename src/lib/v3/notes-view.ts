/**
 * Read models for the Notes tab. Always reads V3 via repository / loadEssencesData.
 * Does not touch `essences-memo-library-v2`, `essences-memos`, or `mindful-todo-data`.
 */

import { htmlToPlainText, WELCOME_MEMO_ID } from "@/lib/notes-store";
import {
  PAST_MEMOS_COLLECTION_ID,
  archivedNoteId,
} from "./legacy-memo-archive";
import {
  getCollection,
  getCollectionEntries,
  getCollections,
  getNote,
  getNotes,
  getPlanItem,
  getQuickMemo,
  getQuickMemos,
} from "./repository";
import { loadEssencesData } from "./storage";
import type { Collection, CollectionEntry, NotePage, QuickMemo } from "./types";

export const NOTES_HOME_PATH = "/note";
export const NOTES_SEARCH_PATH = "/note/search";
export const NOTES_HOME_QUICK_MEMO_LIMIT = 4;
export const NOTES_HOME_NOTE_LIMIT = 4;
export const NOTES_HOME_COLLECTION_LIMIT = 10;

export function notesQuickListPath(): string {
  return "/note/list/quick";
}
export function notesNoteListPath(): string {
  return "/note/list/notes";
}
export function notesCollectionListPath(): string {
  return "/note/list/collections";
}
export function notesQuickSearchPath(): string {
  return "/note/search/quick";
}
export function notesNoteSearchPath(): string {
  return "/note/search/notes";
}
export function notesCollectionSearchPath(): string {
  return "/note/search/collections";
}

export function noteDetailPath(id: string): string {
  return `/note/n/${encodeURIComponent(id)}`;
}

export function quickMemoPath(id: string): string {
  return `/note/q/${encodeURIComponent(id)}`;
}

export function collectionPath(id: string): string {
  return `/note/c/${encodeURIComponent(id)}`;
}

export function pastMemosPath(): string {
  return collectionPath(PAST_MEMOS_COLLECTION_ID);
}

export function isWelcomeV3Note(note: NotePage): boolean {
  return (
    note.legacySource?.memoId === WELCOME_MEMO_ID ||
    note.id === archivedNoteId(WELCOME_MEMO_ID)
  );
}

export function listedNotes(): NotePage[] {
  return getNotes().filter((note) => !isWelcomeV3Note(note));
}

export function listedQuickMemos(): QuickMemo[] {
  return getQuickMemos("inbox");
}

export function listedCollections(): Collection[] {
  const collections = getCollections().filter((c) => !c.archivedAt);
  const past = collections.find((c) => c.id === PAST_MEMOS_COLLECTION_ID);
  const rest = collections.filter((c) => c.id !== PAST_MEMOS_COLLECTION_ID);
  const pastEntries = past ? getCollectionEntries(past.id) : [];
  const withPast = past && pastEntries.length > 0 ? [past] : [];
  const planCollections: Collection[] = [];
  const other: Collection[] = [];
  for (const collection of rest) {
    const hasPlan = getCollectionEntries(collection.id).some((e) => e.type === "migratedPlan");
    if (hasPlan) planCollections.push(collection);
    else other.push(collection);
  }
  return [...withPast, ...planCollections, ...other];
}

export type NotesSearchHit = {
  kind: "note" | "quickMemo";
  id: string;
  title: string;
  preview: string;
};

export function searchQuickMemos(query: string): QuickMemo[] {
  const q = query.trim().toLowerCase();
  const memos = listedQuickMemos();
  if (!q) return memos;
  return memos.filter((memo) => memo.text.toLowerCase().includes(q));
}

export function searchNotePages(query: string): NotePage[] {
  const q = query.trim().toLowerCase();
  const notes = listedNotes();
  if (!q) return notes;
  return notes.filter((note) => {
    const title = note.title.toLowerCase();
    const preview = htmlToPlainText(note.html).toLowerCase();
    return title.includes(q) || preview.includes(q);
  });
}

export function searchCollections(query: string): Collection[] {
  const q = query.trim().toLowerCase();
  const collections = listedCollections();
  if (!q) return collections;
  return collections.filter((collection) => collection.name.toLowerCase().includes(q));
}

export function searchNotesCatalog(query: string): NotesSearchHit[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const hits: NotesSearchHit[] = [];
  for (const note of listedNotes()) {
    const title = note.title;
    const preview = htmlToPlainText(note.html);
    if (title.toLowerCase().includes(q) || preview.toLowerCase().includes(q)) {
      hits.push({ kind: "note", id: note.id, title, preview });
    }
  }
  for (const memo of listedQuickMemos()) {
    const text = memo.text;
    if (text.toLowerCase().includes(q)) {
      hits.push({
        kind: "quickMemo",
        id: memo.id,
        title: text.slice(0, 40),
        preview: text,
      });
    }
  }
  return hits;
}

export type NotesRouteTarget =
  | { kind: "note"; id: string }
  | { kind: "quickMemo"; id: string }
  | { kind: "collection"; id: string }
  | { kind: "home" };

export function resolveNotesParam(raw: string): NotesRouteTarget {
  const id = decodeURIComponent(raw || "").trim();
  if (!id) return { kind: "home" };
  const data = loadEssencesData();
  if (data.notes[id] && !isWelcomeV3Note(data.notes[id])) return { kind: "note", id };
  const archived = archivedNoteId(id);
  if (data.notes[archived]) return { kind: "note", id: archived };
  if (data.notes[id]) return { kind: "note", id };
  if (data.quickMemos[id]) return { kind: "quickMemo", id };
  if (data.collections[id]) return { kind: "collection", id };
  return { kind: "home" };
}

export function pathForNotesTarget(target: NotesRouteTarget): string {
  if (target.kind === "note") return noteDetailPath(target.id);
  if (target.kind === "quickMemo") return quickMemoPath(target.id);
  if (target.kind === "collection") return collectionPath(target.id);
  return NOTES_HOME_PATH;
}

export function resolveNoteParam(raw: string): NotePage | undefined {
  const target = resolveNotesParam(raw);
  if (target.kind !== "note") return undefined;
  return getNote(target.id);
}

export type CollectionEntryView = {
  entry: CollectionEntry;
  title: string;
  preview: string;
  href: string | null;
  kind: CollectionEntry["type"];
};

export function collectionEntryViews(collectionId: string): CollectionEntryView[] {
  return getCollectionEntries(collectionId).map((entry) => {
    if (entry.type === "note" && entry.noteId) {
      const note = getNote(entry.noteId);
      return {
        entry,
        kind: "note" as const,
        title: note?.title?.trim() || "",
        preview: note ? htmlToPlainText(note.html) : "",
        href: note ? noteDetailPath(note.id) : null,
      };
    }
    if (entry.type === "quickMemo" && entry.quickMemoId) {
      const memo = getQuickMemo(entry.quickMemoId);
      return {
        entry,
        kind: "quickMemo" as const,
        title: memo?.text?.trim() || "",
        preview: memo?.text ?? "",
        href: memo ? quickMemoPath(memo.id) : null,
      };
    }
    const plan = entry.migratedPlanRootId ? getPlanItem(entry.migratedPlanRootId) : undefined;
    return {
      entry,
      kind: "migratedPlan" as const,
      title: plan?.title?.trim() || "Plan",
      preview: "",
      href: null,
    };
  });
}

export { htmlToPlainText, PAST_MEMOS_COLLECTION_ID, getCollection };
