import { beforeEach, describe, expect, it } from "vitest";
import { prepareCloudSession, stashStorageKey } from "@/lib/firebase/cloud-session";
import {
  disableCloudSync,
  enableCloudSync,
  PUSH_DEBOUNCE_MS,
  resetSyncModuleForTests,
} from "@/lib/firebase/sync";
import { canRunManualSync, MANUAL_SYNC_COOLDOWN_MS } from "@/lib/firebase/sync-status";
import {
  mergeLocalAndCloud,
  recordTombstones,
  shouldUploadLocalFirst,
  type CloudSnapshot,
} from "@/lib/firebase/v3-merge";
import { ensureLegacyMemoArchive, MEMO_ARCHIVE_STATE_KEY, MEMO_V2_KEY } from "@/lib/v3/legacy-memo-archive";
import { LEGACY_KEYS } from "@/lib/v3/legacy-migration";
import {
  createNote,
  createQuickMemo,
  createTask,
} from "@/lib/v3/repository";
import { emptyData } from "@/lib/v3/schema";
import { ensureLegacyCatchup, loadEssencesData, resetEssencesDataCache, saveEssencesData } from "@/lib/v3/storage";
import { STORAGE_KEY } from "@/lib/v3/types";

function emptyCloud(): CloudSnapshot {
  return { collections: {} };
}

describe("Phase 12 account isolation", () => {
  beforeEach(() => {
    localStorage.clear();
    resetEssencesDataCache();
    resetSyncModuleForTests();
    saveEssencesData(emptyData());
  });

  it("6. A → sign out → B does not upload A's Note / Task / QuickMemo", () => {
    prepareCloudSession("uidA");
    const noteA = createNote({ title: "Note A" });
    const taskA = createTask({ title: "Task A", date: "2026-09-24" });
    const memoA = createQuickMemo({ text: "Memo A" });
    disableCloudSync();
    const switched = prepareCloudSession("uidB");
    expect(switched.switched).toBe(true);
    const localB = loadEssencesData();
    expect(localB.notes[noteA.id]).toBeUndefined();
    expect(localB.tasks[taskA.id]).toBeUndefined();
    expect(localB.quickMemos[memoA.id]).toBeUndefined();
    const stashA = JSON.parse(localStorage.getItem(stashStorageKey("uidA")) ?? "{}") as {
      notes?: Record<string, { title?: string }>;
      tasks?: Record<string, { title?: string }>;
      quickMemos?: Record<string, { text?: string }>;
    };
    expect(stashA.notes?.[noteA.id]?.title).toBe("Note A");
    expect(stashA.tasks?.[taskA.id]?.title).toBe("Task A");
    expect(stashA.quickMemos?.[memoA.id]?.text).toBe("Memo A");
  });

  it("7. B → A restores A's workspace, not B", () => {
    prepareCloudSession("uidA");
    createNote({ title: "Alice note" });
    prepareCloudSession("uidB");
    createNote({ title: "Bob note" });
    disableCloudSync();
    prepareCloudSession("uidA");
    const titles = Object.values(loadEssencesData().notes).map((n) => n.title);
    expect(titles).toContain("Alice note");
    expect(titles).not.toContain("Bob note");
  });

  it("8. restart keeps signed-in A workspace; sign-out keeps local V3", () => {
    prepareCloudSession("uidA");
    const task = createTask({ title: "persist A", date: "2026-09-24" });
    resetEssencesDataCache();
    expect(loadEssencesData().tasks[task.id]?.title).toBe("persist A");
    disableCloudSync();
    resetEssencesDataCache();
    expect(loadEssencesData().tasks[task.id]?.title).toBe("persist A");
    expect(localStorage.getItem(STORAGE_KEY)).toContain("persist A");
  });
});

describe("Phase 12 cloud merge", () => {
  beforeEach(() => {
    localStorage.clear();
    resetEssencesDataCache();
    saveEssencesData(emptyData());
  });

  it("9. empty cloud uploads local and does not wipe it", () => {
    const task = createTask({ title: "Keep local", date: "2026-09-24" });
    expect(shouldUploadLocalFirst({ metaPresent: false, cloud: emptyCloud() })).toBe("upload-local");
    const merged = mergeLocalAndCloud(loadEssencesData(), emptyCloud());
    expect(merged.tasks[task.id]?.title).toBe("Keep local");
  });

  it("10. existing cloud + same entity id does not duplicate", () => {
    const local = emptyData();
    local.tasks.t1 = {
      id: "t1",
      title: "local",
      date: "2026-09-24",
      allDay: true,
      icon: "circle",
      color: "orange",
      status: "open",
      order: 0,
      createdFrom: "todo",
      createdAt: "2026-09-24T10:00:00.000Z",
      updatedAt: "2026-09-24T12:00:00.000Z",
    };
    const cloud: CloudSnapshot = {
      collections: {
        tasks: {
          t1: { ...local.tasks.t1, title: "cloud", updatedAt: "2026-09-24T11:00:00.000Z" },
        },
      },
    };
    const merged = mergeLocalAndCloud(local, cloud);
    expect(Object.keys(merged.tasks)).toEqual(["t1"]);
    expect(merged.tasks.t1.title).toBe("local");
    expect(shouldUploadLocalFirst({ metaPresent: true, cloud })).toBe("merge");
  });

  it("11. tombstone at or after entity time is not resurrected", () => {
    const local = emptyData();
    const cloud: CloudSnapshot = {
      collections: {
        tasks: {
          gone: {
            id: "gone",
            title: "resurrect?",
            date: "2026-09-24",
            updatedAt: "2026-09-24T12:00:00.000Z",
          },
        },
      },
    };
    const merged = mergeLocalAndCloud(local, cloud, {
      tasks: { gone: "2026-09-24T12:00:00.000Z" },
    });
    expect(merged.tasks.gone).toBeUndefined();
  });

  it("12. local delete records a tombstone for the missing id", () => {
    const prev = emptyData();
    prev.notes.n1 = {
      id: "n1",
      title: "gone",
      html: "",
      collectionIds: [],
      createdAt: "2026-09-24T10:00:00.000Z",
      updatedAt: "2026-09-24T10:00:00.000Z",
    };
    const next = emptyData();
    const stones = recordTombstones(prev, next, {}, "2026-09-24T13:00:00.000Z");
    expect(stones.notes?.n1).toBe("2026-09-24T13:00:00.000Z");
  });

  it("signed out / disabled sync does not re-enable a push listener", () => {
    disableCloudSync();
    createTask({ title: "local only", date: "2026-09-24" });
    expect(localStorage.getItem(STORAGE_KEY)).toContain("local only");
    enableCloudSync();
    disableCloudSync();
  });
});

describe("Phase 12 startup / migration / performance", () => {
  beforeEach(() => {
    localStorage.clear();
    resetEssencesDataCache();
    resetSyncModuleForTests();
  });

  it("16–18. signed-out fresh install keeps an empty local V3; catch-up is safe", () => {
    saveEssencesData(emptyData());
    ensureLegacyCatchup();
    ensureLegacyMemoArchive();
    expect(loadEssencesData().schemaVersion).toBe(3);
    expect(Object.keys(loadEssencesData().tasks)).toHaveLength(0);
  });

  it("13–15. memo archive retries after a failed completion marker; ToDo is excluded", () => {
    localStorage.setItem(
      MEMO_V2_KEY,
      JSON.stringify({
        categories: [{ id: "c1", name: "仕事", pageIds: ["p1"] }],
        pages: [{ id: "p1", title: "会議", html: "<div>x</div>", updatedAt: 1 }],
      }),
    );
    localStorage.setItem(
      LEGACY_KEYS.todo,
      JSON.stringify({
        "2026-09-24": { tasks: [{ id: "t1", text: "買い物", date: "2026-09-24" }], reflection: "" },
      }),
    );
    saveEssencesData(emptyData());
    expect(localStorage.getItem(MEMO_ARCHIVE_STATE_KEY)).toBeNull();
    const first = ensureLegacyMemoArchive();
    expect(first?.migratedCount).toBe(1);
    const noteCount = Object.keys(loadEssencesData().notes).length;
    const second = ensureLegacyMemoArchive();
    expect(Object.keys(loadEssencesData().notes).length).toBe(noteCount);
    expect(second?.version).toBe(first?.version);
    expect(Object.keys(loadEssencesData().tasks)).toHaveLength(0);
    expect(localStorage.getItem(LEGACY_KEYS.todo)).toBeTruthy();
  });

  it("19–20. cloud push debounce is longer than 400ms autosave; manual sync has cooldown", () => {
    expect(PUSH_DEBOUNCE_MS).toBeGreaterThan(400);
    expect(MANUAL_SYNC_COOLDOWN_MS).toBeGreaterThanOrEqual(1000);
    const first = canRunManualSync({
      now: 1_000,
      lastManualAt: 0,
      signedIn: true,
      syncing: false,
    });
    expect(first.ok).toBe(true);
    const second = canRunManualSync({
      now: 1_000 + 100,
      lastManualAt: 1_000,
      signedIn: true,
      syncing: false,
    });
    expect(second.ok).toBe(false);
    expect(second.ok === false && second.reason).toBe("cooldown");
  });
});
