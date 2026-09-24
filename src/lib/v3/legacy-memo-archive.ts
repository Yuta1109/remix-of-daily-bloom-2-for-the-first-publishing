/**
 * One-time archive of pre-V3 memo pages into a single Collection 「過去のメモ」.
 *
 * Independent of ToDo / `mindful-todo-data`. Does not call `notes-store` loaders
 * (those rewrite and delete legacy keys). Legacy memo keys are left in place.
 *
 * Note ids reuse `legacy-note:{pageId}` so this pass cannot duplicate the
 * Phase 1 `convertLegacyMemos` notes.
 */

import { WELCOME_MEMO_ID } from "@/lib/notes-store";
import { nowTimestamp, type Timestamp } from "./local-date";
import { LEGACY_KEYS } from "./legacy-migration";
import type {
  Collection,
  CollectionEntry,
  EssencesDataV3,
  NoteLegacySource,
  NotePage,
} from "./types";
import { loadEssencesData, updateEssencesData } from "./storage";

export const MEMO_V1_KEY = "essences-memos";
export const MEMO_V2_KEY = LEGACY_KEYS.memos;
export const TODO_KEY = LEGACY_KEYS.todo;

export const PAST_MEMOS_COLLECTION_ID = "legacy-collection:essences-past-memos";
export const PAST_MEMOS_COLLECTION_NAME = "過去のメモ";
export const MEMO_ARCHIVE_VERSION = 1;
export const MEMO_ARCHIVE_STATE_KEY = "essences-legacy-memo-archive-v1";

export function archivedNoteId(legacyPageId: string): string {
  return `legacy-note:${legacyPageId}`;
}

export function pastMemoEntryId(legacyPageId: string): string {
  return `legacy-entry:essences-past-memos:${legacyPageId}`;
}

export interface MemoArchiveNoticeState {
  version: number;
  completedAt: string;
  migratedCount: number;
  notice: "pending" | "shown" | "skipped";
}

export interface MemoLibrarySnapshot {
  sources: string[];
  pages: Array<{
    id: string;
    title: string;
    html: string;
    updatedAt: number;
  }>;
  categories: Array<{
    id: string;
    name: string;
    pageIds: string[];
    collapsed?: boolean;
    color?: string;
  }>;
}

export interface MemoArchiveApplyResult {
  ok: true;
  migratedCount: number;
  collectionId: string;
  noteIds: string[];
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function textOf(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function readRaw(key: string): unknown {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function epochToTimestamp(value: unknown, fallback: Timestamp): Timestamp {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return new Date(n).toISOString();
}

function isWelcomePage(id: string): boolean {
  return id === WELCOME_MEMO_ID;
}

function sanitizePage(raw: unknown, index: number): MemoLibrarySnapshot["pages"][number] | null {
  const legacy = asObject(raw);
  const id = textOf(legacy.id) || `#${index}`;
  if (!id || isWelcomePage(id)) return null;
  return {
    id,
    title: textOf(legacy.title),
    html: textOf(legacy.html),
    updatedAt: Number(legacy.updatedAt) || 0,
  };
}

/**
 * Reads memo libraries only. Never touches `mindful-todo-data`.
 * Prefers v2; falls back to v1 `essences-memos` (array of pages) when v2 is absent.
 */
export function readMemoLibrarySnapshot(): MemoLibrarySnapshot {
  const sources: string[] = [];
  const v2 = readRaw(MEMO_V2_KEY);
  if (v2 != null) {
    sources.push(MEMO_V2_KEY);
    const library = asObject(v2);
    const pages = asArray(library.pages)
      .map((entry, index) => sanitizePage(entry, index))
      .filter((p): p is MemoLibrarySnapshot["pages"][number] => !!p);
    const pageIds = new Set(pages.map((p) => p.id));
    const categories = asArray(library.categories).map((entry, index) => {
      const legacy = asObject(entry);
      return {
        id: textOf(legacy.id) || `#${index}`,
        name: textOf(legacy.name),
        pageIds: asArray(legacy.pageIds)
          .map((id) => textOf(id))
          .filter((id) => pageIds.has(id)),
        collapsed: legacy.collapsed === true,
        color: textOf(legacy.color) || undefined,
      };
    });
    return { sources, pages, categories };
  }

  const v1 = readRaw(MEMO_V1_KEY);
  if (Array.isArray(v1) && v1.length > 0) {
    sources.push(MEMO_V1_KEY);
    const pages = v1
      .map((entry, index) => sanitizePage(entry, index))
      .filter((p): p is MemoLibrarySnapshot["pages"][number] => !!p);
    return {
      sources,
      pages,
      categories: [
        {
          id: "essences-memos-v1",
          name: "メモ",
          pageIds: pages.map((p) => p.id),
        },
      ],
    };
  }

  return { sources, pages: [], categories: [] };
}

function categoriesForPage(
  snapshot: MemoLibrarySnapshot,
  pageId: string,
): NoteLegacySource["categories"] {
  return snapshot.categories
    .filter((c) => c.pageIds.includes(pageId))
    .map((c) => ({
      id: c.id,
      name: c.name,
      color: c.color,
      collapsed: c.collapsed,
    }));
}

function orderedPageIds(snapshot: MemoLibrarySnapshot): string[] {
  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const category of snapshot.categories) {
    for (const id of category.pageIds) {
      if (seen.has(id)) continue;
      seen.add(id);
      ordered.push(id);
    }
  }
  for (const page of snapshot.pages) {
    if (seen.has(page.id)) continue;
    seen.add(page.id);
    ordered.push(page.id);
  }
  return ordered;
}

export function applyMemoArchiveInto(
  data: EssencesDataV3,
  snapshot: MemoLibrarySnapshot,
  now: Timestamp = nowTimestamp(),
): MemoArchiveApplyResult {
  const noteIds: string[] = [];
  const ordered = orderedPageIds(snapshot);
  const pagesById = new Map(snapshot.pages.map((p) => [p.id, p]));

  if (!data.collections[PAST_MEMOS_COLLECTION_ID]) {
    const collection: Collection = {
      id: PAST_MEMOS_COLLECTION_ID,
      name: PAST_MEMOS_COLLECTION_NAME,
      createdAt: now,
      updatedAt: now,
    };
    data.collections[PAST_MEMOS_COLLECTION_ID] = collection;
  } else if (data.collections[PAST_MEMOS_COLLECTION_ID].name !== PAST_MEMOS_COLLECTION_NAME) {
    data.collections[PAST_MEMOS_COLLECTION_ID] = {
      ...data.collections[PAST_MEMOS_COLLECTION_ID],
      name: PAST_MEMOS_COLLECTION_NAME,
      updatedAt: now,
    };
  }

  ordered.forEach((legacyId, order) => {
    const page = pagesById.get(legacyId);
    if (!page) return;
    const noteId = archivedNoteId(legacyId);
    noteIds.push(noteId);
    const legacySource: NoteLegacySource = {
      memoId: legacyId,
      categories: categoriesForPage(snapshot, legacyId),
    };
    const updatedAt = epochToTimestamp(page.updatedAt, now);
    const existing = data.notes[noteId];
    if (!existing) {
      const note: NotePage = {
        id: noteId,
        title: page.title,
        html: page.html,
        collectionIds: [PAST_MEMOS_COLLECTION_ID],
        createdAt: updatedAt,
        updatedAt,
        legacySource,
      };
      data.notes[noteId] = note;
    } else {
      const collectionIds = existing.collectionIds.includes(PAST_MEMOS_COLLECTION_ID)
        ? existing.collectionIds
        : [...existing.collectionIds, PAST_MEMOS_COLLECTION_ID];
      data.notes[noteId] = {
        ...existing,
        collectionIds,
        legacySource: existing.legacySource ?? legacySource,
      };
    }

    const entryId = pastMemoEntryId(legacyId);
    if (!data.collectionEntries[entryId]) {
      const entry: CollectionEntry = {
        id: entryId,
        collectionId: PAST_MEMOS_COLLECTION_ID,
        type: "note",
        noteId,
        order,
        createdAt: now,
      };
      data.collectionEntries[entryId] = entry;
    }
  });

  return {
    ok: true,
    migratedCount: noteIds.length,
    collectionId: PAST_MEMOS_COLLECTION_ID,
    noteIds,
  };
}

export function readMemoArchiveState(): MemoArchiveNoticeState | null {
  try {
    const raw = localStorage.getItem(MEMO_ARCHIVE_STATE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as MemoArchiveNoticeState;
    if (!parsed || typeof parsed.version !== "number") return null;
    return parsed;
  } catch {
    return null;
  }
}

export function persistMemoArchiveCompletion(
  result: { ok: boolean; migratedCount: number },
  now: Timestamp = nowTimestamp(),
): MemoArchiveNoticeState | null {
  if (!result.ok) return null;
  const state: MemoArchiveNoticeState = {
    version: MEMO_ARCHIVE_VERSION,
    completedAt: now,
    migratedCount: result.migratedCount,
    notice: result.migratedCount > 0 ? "pending" : "skipped",
  };
  localStorage.setItem(MEMO_ARCHIVE_STATE_KEY, JSON.stringify(state));
  return state;
}

export function memoArchiveNoticeShouldShow(state: MemoArchiveNoticeState | null): boolean {
  return !!state && state.version >= MEMO_ARCHIVE_VERSION && state.notice === "pending";
}

export function markMemoArchiveNoticeShown(): MemoArchiveNoticeState | null {
  const current = readMemoArchiveState();
  if (!current || current.notice !== "pending") return current;
  const next: MemoArchiveNoticeState = { ...current, notice: "shown" };
  localStorage.setItem(MEMO_ARCHIVE_STATE_KEY, JSON.stringify(next));
  return next;
}

export function isMemoArchiveComplete(state: MemoArchiveNoticeState | null = readMemoArchiveState()): boolean {
  return !!state && state.version >= MEMO_ARCHIVE_VERSION;
}

/**
 * Startup entry. Idempotent. Does not mark complete if apply/save throws.
 */
export function ensureLegacyMemoArchive(): MemoArchiveNoticeState | null {
  const existing = readMemoArchiveState();
  if (isMemoArchiveComplete(existing)) return existing;

  try {
    loadEssencesData();
    const snapshot = readMemoLibrarySnapshot();
    const { result } = updateEssencesData((draft) => applyMemoArchiveInto(draft, snapshot));
    return persistMemoArchiveCompletion(result);
  } catch {
    return null;
  }
}
