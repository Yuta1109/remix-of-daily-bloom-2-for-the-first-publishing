import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { prepareCloudSession, readCloudOwner, stashStorageKey } from "@/lib/firebase/cloud-session";
import { disableCloudSync, PUSH_DEBOUNCE_MS, resetSyncModuleForTests } from "@/lib/firebase/sync";
import { createTask } from "@/lib/v3/repository";
import { emptyData } from "@/lib/v3/schema";
import { ensureLegacyCatchup, loadEssencesData, resetEssencesDataCache, saveEssencesData } from "@/lib/v3/storage";
import { STORAGE_KEY } from "@/lib/v3/types";
import { ensureLegacyMemoArchive } from "@/lib/v3/legacy-memo-archive";
import { shouldUploadLocalFirst, type CloudSnapshot } from "@/lib/firebase/v3-merge";

function emptyCloud(): CloudSnapshot {
  return { collections: {} };
}

describe("Phase 11 account isolation + startup", () => {
  beforeEach(() => {
    localStorage.clear();
    resetEssencesDataCache();
    resetSyncModuleForTests();
    saveEssencesData(emptyData());
  });

  it("5. A sign-out then B does not upload A's workspace", () => {
    prepareCloudSession("uidA");
    const taskA = createTask({ title: "A-only", date: "2026-09-24" });
    disableCloudSync();
    expect(loadEssencesData().tasks[taskA.id]).toBeTruthy();
    const switched = prepareCloudSession("uidB");
    expect(switched.switched).toBe(true);
    expect(loadEssencesData().tasks[taskA.id]).toBeUndefined();
    expect(shouldUploadLocalFirst({ metaPresent: false, cloud: emptyCloud() })).toBe("upload-local");
    expect(JSON.stringify(loadEssencesData().tasks)).not.toContain("A-only");
  });

  it("6. B sign-out then A restores A's stash, not B", () => {
    prepareCloudSession("uidA");
    const taskA = createTask({ title: "Alice", date: "2026-09-24" });
    prepareCloudSession("uidB");
    const taskB = createTask({ title: "Bob", date: "2026-09-24" });
    disableCloudSync();
    prepareCloudSession("uidA");
    expect(loadEssencesData().tasks[taskA.id]?.title).toBe("Alice");
    expect(loadEssencesData().tasks[taskB.id]).toBeUndefined();
  });

  it("7. local workspaces stay isolated in stashes", () => {
    prepareCloudSession("uidA");
    createTask({ title: "stash-A", date: "2026-09-24" });
    prepareCloudSession("uidB");
    createTask({ title: "stash-B", date: "2026-09-24" });
    const rawA = localStorage.getItem(stashStorageKey("uidA")) ?? "";
    expect(rawA).toContain("stash-A");
    expect(rawA).not.toContain("stash-B");
    expect(JSON.stringify(loadEssencesData().tasks)).toContain("stash-B");
  });

  it("17. signed-in restore keeps the bound uid workspace", () => {
    prepareCloudSession("uidA");
    const task = createTask({ title: "persist", date: "2026-09-24" });
    resetEssencesDataCache();
    expect(readCloudOwner()).toBe("uidA");
    expect(loadEssencesData().tasks[task.id]?.title).toBe("persist");
    const again = prepareCloudSession("uidA");
    expect(again.switched).toBe(false);
    expect(loadEssencesData().tasks[task.id]?.title).toBe("persist");
  });

  it("18. signed-out restart does not swap the local V3 workspace", () => {
    prepareCloudSession("uidA");
    const task = createTask({ title: "still here", date: "2026-09-24" });
    disableCloudSync();
    resetEssencesDataCache();
    expect(loadEssencesData().tasks[task.id]?.title).toBe("still here");
    expect(localStorage.getItem(STORAGE_KEY)).toContain("still here");
  });

  it("19. migration catchup runs before archive without wiping V3", () => {
    const task = createTask({ title: "before-archive", date: "2026-09-24" });
    ensureLegacyCatchup();
    ensureLegacyMemoArchive();
    expect(loadEssencesData().tasks[task.id]?.title).toBe("before-archive");
  });
});

describe("Phase 11 sync debounce", () => {
  it("20. push debounce is longer than the 400ms autosave", () => {
    expect(PUSH_DEBOUNCE_MS).toBeGreaterThanOrEqual(1500);
    expect(PUSH_DEBOUNCE_MS).toBeGreaterThan(400);
  });

  it("21. sync module documents fingerprint skip to avoid duplicate storms", () => {
    const src = readFileSync(path.join(process.cwd(), "src/lib/firebase/sync.ts"), "utf8");
    expect(src).toContain("lastPushedFingerprint");
    expect(src).toContain("PUSH_DEBOUNCE_MS");
  });
});
