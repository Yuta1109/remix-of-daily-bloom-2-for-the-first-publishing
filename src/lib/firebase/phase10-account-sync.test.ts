import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import {
  SIGNED_OUT,
  authStateFromProviders,
} from "@/lib/firebase/auth-types";
import {
  CLOUD_OWNER_KEY,
  prepareCloudSession,
  readCloudOwner,
  stashStorageKey,
} from "@/lib/firebase/cloud-session";
import { disableCloudSync, resetSyncModuleForTests } from "@/lib/firebase/sync";
import {
  canRunManualSync,
  deriveCloudSyncStatus,
  MANUAL_SYNC_COOLDOWN_MS,
} from "@/lib/firebase/sync-status";
import { shouldUploadLocalFirst, type CloudSnapshot } from "@/lib/firebase/v3-merge";
import { createTask } from "@/lib/v3/repository";
import { emptyData } from "@/lib/v3/schema";
import { loadEssencesData, resetEssencesDataCache, saveEssencesData } from "@/lib/v3/storage";
import { STORAGE_KEY } from "@/lib/v3/types";

function emptyCloud(): CloudSnapshot {
  return { collections: {} };
}

describe("Phase 10 auth + account switch", () => {
  beforeEach(() => {
    localStorage.clear();
    resetEssencesDataCache();
    resetSyncModuleForTests();
    saveEssencesData(emptyData());
  });

  it("1. signed-out is the default Google account state", () => {
    expect(SIGNED_OUT.status).toBe("signed_out");
    expect(SIGNED_OUT.user).toBeNull();
    expect(deriveCloudSyncStatus({
      signedIn: false,
      syncing: false,
      online: true,
      error: false,
      pending: false,
      lastSyncedAt: null,
    })).toBe("local_only");
  });

  it("2. signed-in maps uid / email / displayName / photoURL without using email as id", () => {
    const state = authStateFromProviders("firebase-uid-1", ["google.com"], {
      email: "person@example.com",
      displayName: "Person",
      photoURL: "https://example.com/photo.png",
    });
    expect(state.status).toBe("signed_in");
    expect(state.user?.uid).toBe("firebase-uid-1");
    expect(state.user?.email).toBe("person@example.com");
    expect(state.user?.displayName).toBe("Person");
    expect(state.user?.photoURL).toBe("https://example.com/photo.png");
    expect(state.user?.uid).not.toBe(state.user?.email);
  });

  it("3. sign-out keeps local V3 on this device", () => {
    prepareCloudSession("uidA");
    const task = createTask({ title: "Stay on device", date: "2026-09-24" });
    disableCloudSync();
    expect(readCloudOwner()).toBe("uidA");
    expect(loadEssencesData().tasks[task.id]?.title).toBe("Stay on device");
    expect(localStorage.getItem(STORAGE_KEY)).toContain("Stay on device");
  });

  it("4. account switch does not leave User A data in the workspace User B would upload", () => {
    prepareCloudSession("uidA");
    const taskA = createTask({ title: "A secret", date: "2026-09-24" });
    const switched = prepareCloudSession("uidB");
    expect(switched.switched).toBe(true);
    expect(readCloudOwner()).toBe("uidB");
    expect(loadEssencesData().tasks[taskA.id]).toBeUndefined();
    const stashA = JSON.parse(localStorage.getItem(stashStorageKey("uidA")) ?? "{}") as {
      tasks?: Record<string, { title?: string }>;
    };
    expect(stashA.tasks?.[taskA.id]?.title).toBe("A secret");
    expect(shouldUploadLocalFirst({ metaPresent: false, cloud: emptyCloud() })).toBe(
      "upload-local",
    );
    expect(Object.keys(loadEssencesData().tasks)).not.toContain(taskA.id);
  });

  it("5. restoring the same Google uid resumes the previous local workspace", () => {
    prepareCloudSession("uidA");
    const taskA = createTask({ title: "A workspace", date: "2026-09-24" });
    prepareCloudSession("uidB");
    createTask({ title: "B workspace", date: "2026-09-24" });
    const resume = prepareCloudSession("uidA");
    expect(resume.switched).toBe(true);
    expect(loadEssencesData().tasks[taskA.id]?.title).toBe("A workspace");
    expect(Object.values(loadEssencesData().tasks).some((task) => task.title === "B workspace")).toBe(
      false,
    );
    expect(localStorage.getItem(CLOUD_OWNER_KEY)).toBe("uidA");
  });
});

describe("Phase 10 sync status + manual sync", () => {
  it("6. distinguishes local_only / syncing / synced / pending / offline / error", () => {
    const base = {
      signedIn: true,
      syncing: false,
      online: true,
      error: false,
      pending: false,
      lastSyncedAt: "2026-09-24T12:00:00.000Z",
    };
    expect(deriveCloudSyncStatus({ ...base, signedIn: false })).toBe("local_only");
    expect(deriveCloudSyncStatus({ ...base, syncing: true })).toBe("syncing");
    expect(deriveCloudSyncStatus(base)).toBe("synced");
    expect(deriveCloudSyncStatus({ ...base, pending: true, lastSyncedAt: null })).toBe("pending");
    expect(deriveCloudSyncStatus({ ...base, online: false })).toBe("offline");
    expect(deriveCloudSyncStatus({ ...base, error: true })).toBe("error");
  });

  it("7. manual sync is skipped while in-flight or inside the cooldown window", () => {
    expect(
      canRunManualSync({
        now: 10_000,
        lastManualAt: 8_000,
        signedIn: true,
        syncing: false,
      }),
    ).toEqual({ ok: false, reason: "cooldown" });
    expect(
      canRunManualSync({
        now: 10_000,
        lastManualAt: 0,
        signedIn: true,
        syncing: true,
      }),
    ).toEqual({ ok: false, reason: "in_flight" });
    expect(
      canRunManualSync({
        now: 10_000,
        lastManualAt: 10_000 - MANUAL_SYNC_COOLDOWN_MS,
        signedIn: true,
        syncing: false,
      }),
    ).toEqual({ ok: true });
  });

  it("8. retry after error is allowed once cooldown has elapsed", () => {
    expect(
      canRunManualSync({
        now: 20_000,
        lastManualAt: 20_000 - MANUAL_SYNC_COOLDOWN_MS - 1,
        signedIn: true,
        syncing: false,
      }),
    ).toEqual({ ok: true });
    expect(
      deriveCloudSyncStatus({
        signedIn: true,
        syncing: false,
        online: true,
        error: true,
        pending: true,
        lastSyncedAt: null,
      }),
    ).toBe("error");
  });

  it("9. empty cloud still chooses initial upload of the active workspace only", () => {
    expect(shouldUploadLocalFirst({ metaPresent: false, cloud: emptyCloud() })).toBe(
      "upload-local",
    );
  });

  it("10. existing cloud meta chooses restore/merge rather than wiping local", () => {
    expect(
      shouldUploadLocalFirst({
        metaPresent: true,
        cloud: emptyCloud(),
      }),
    ).toBe("merge");
  });
});

describe("Phase 10 User page copy is present for recovery UX", () => {
  it("keeps Japanese recovery copy in i18n", () => {
    const src = readFileSync(path.join(process.cwd(), "src/lib/i18n.tsx"), "utf8");
    expect(src).toContain("Googleでサインイン");
    expect(src).toContain("この端末のデータは削除されません");
    expect(src).toContain("クラウドに保存されています");
    expect(src).toContain("最後に同期した時刻");
    expect(src).toContain("今すぐ同期");
  });
});
