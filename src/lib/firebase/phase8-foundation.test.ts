import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import {
  SIGNED_OUT,
  authStateFromProviders,
  isGoogleLinkedUser,
} from "@/lib/firebase/auth-types";
import { buildUpsertOps, upsertOpKey } from "@/lib/firebase/firebase-firestore";
import {
  documentPath,
  entityPath,
  pathBelongsToUid,
  userRootPath,
} from "@/lib/firebase/firestore-paths";
import {
  chooseReconcileAction,
  laterEntity,
  mergeLocalAndCloud,
  recordTombstones,
  shouldUploadLocalFirst,
  type CloudSnapshot,
} from "@/lib/firebase/v3-merge";
import { V3_RECORD_KEYS, emptyData } from "@/lib/v3/schema";
import { createTask } from "@/lib/v3/repository";
import { loadEssencesData, resetEssencesDataCache, saveEssencesData } from "@/lib/v3/storage";
import { STORAGE_KEY, type PointTransaction, type TaskItem } from "@/lib/v3/types";

function emptyCloud(): CloudSnapshot {
  return { collections: {} };
}

describe("Phase 8 auth mapping", () => {
  it("1. signed-out is the default and anonymous-only is not signed in", () => {
    expect(SIGNED_OUT.status).toBe("signed_out");
    expect(SIGNED_OUT.user).toBeNull();
    expect(authStateFromProviders("anon-uid", ["anonymous"])).toEqual(SIGNED_OUT);
    expect(isGoogleLinkedUser({ uid: "anon-uid", providerIds: ["anonymous"] })).toBe(false);
  });

  it("2. signed-in requires Firebase uid plus google.com, never email as the id", () => {
    const state = authStateFromProviders("firebase-uid-1", ["google.com"], {
      email: "person@example.com",
      displayName: "Person",
    });
    expect(state.status).toBe("signed_in");
    expect(state.user?.uid).toBe("firebase-uid-1");
    expect(state.user?.email).toBe("person@example.com");
    expect(state.user?.uid).not.toBe(state.user?.email);
  });

  it("3. restoring a Google-linked session maps back to signed_in", () => {
    const restored = authStateFromProviders("firebase-uid-1", ["google.com", "anonymous"]);
    expect(restored.status).toBe("signed_in");
    expect(restored.user?.uid).toBe("firebase-uid-1");
  });

  it("4. sign-out mapping is signed_out with no uid", () => {
    const after = authStateFromProviders(null, []);
    expect(after.status).toBe("signed_out");
    expect(after.user).toBeNull();
  });
});

describe("Phase 8 Firestore paths and upsert identity", () => {
  it("5. document paths are under users/{uid}/", () => {
    const uid = "userA";
    expect(userRootPath(uid)).toBe("users/userA");
    expect(documentPath(uid, "tasks", "task-1")).toBe("users/userA/tasks/task-1");
    expect(entityPath(uid, "dailyChallenges", "assign-1")).toBe(
      "users/userA/dailyChallenges/assign-1",
    );
    expect(pathBelongsToUid("users/userA/tasks/task-1", uid)).toBe(true);
  });

  it("6. user A paths cannot address user B data", () => {
    const pathA = documentPath("uidA", "notes", "note-1");
    expect(pathBelongsToUid(pathA, "uidA")).toBe(true);
    expect(pathBelongsToUid(pathA, "uidB")).toBe(false);
    expect(pathA.includes("uidB")).toBe(false);
    expect(userRootPath("uidA")).not.toBe(userRootPath("uidB"));
  });

  it("7. existing entity ids become Firestore document ids", () => {
    localStorage.clear();
    resetEssencesDataCache();
    saveEssencesData(emptyData());
    const task = createTask({ title: "Email professor", date: "2026-09-24" });
    const data = loadEssencesData();
    const ops = buildUpsertOps("uidA", data);
    const taskOp = ops.find((op) => op.collection === "tasks" && op.id === task.id);
    expect(taskOp).toBeTruthy();
    expect(upsertOpKey("uidA", taskOp!)).toBe(`users/uidA/tasks/${task.id}`);
    expect((taskOp!.data as TaskItem).id).toBe(task.id);
  });

  it("8. upsert ops are idempotent (same ids, no duplicates)", () => {
    localStorage.clear();
    resetEssencesDataCache();
    saveEssencesData(emptyData());
    const task = createTask({ title: "Email professor", date: "2026-09-24" });
    const data = loadEssencesData();
    const first = buildUpsertOps("uidA", data);
    const second = buildUpsertOps("uidA", data);
    const keys = (ops: typeof first) => ops.map((op) => `${op.collection}/${op.id}`).sort();
    expect(keys(first)).toEqual(keys(second));
    expect(new Set(keys(first)).size).toBe(first.length);
    expect(first.filter((op) => op.collection === "tasks" && op.id === task.id)).toHaveLength(1);
  });

  it("does not treat ChallengeDefinition catalog as user cloud data", () => {
    expect(V3_RECORD_KEYS.includes("dailyChallenges")).toBe(true);
    expect((V3_RECORD_KEYS as readonly string[]).includes("challengeDefinitions")).toBe(false);
  });

  it("keeps PointTransaction metadata for later trusted verification", () => {
    const data = emptyData();
    const tx: PointTransaction = {
      id: "ptx-1",
      amount: 5,
      reason: "challenge",
      sourceId: "assign-1",
      assignmentId: "assign-1",
      challengeId: "challenge.task_created",
      assignmentDate: "2026-09-24",
      createdAt: "2026-09-24T12:00:00.000Z",
    };
    data.pointTransactions[tx.id] = tx;
    const op = buildUpsertOps("uidA", data).find(
      (item) => item.collection === "pointTransactions" && item.id === "ptx-1",
    );
    expect(op?.data).toMatchObject({
      id: "ptx-1",
      challengeId: "challenge.task_created",
      assignmentId: "assign-1",
      sourceId: "assign-1",
      assignmentDate: "2026-09-24",
      createdAt: "2026-09-24T12:00:00.000Z",
    });
  });
});

describe("Phase 8 local ↔ cloud merge", () => {
  beforeEach(() => {
    localStorage.clear();
    resetEssencesDataCache();
  });

  it("9 / 11. empty cloud chooses initial upload of local V3", () => {
    expect(chooseReconcileAction(false)).toBe("upload-local");
    expect(shouldUploadLocalFirst({ metaPresent: false, cloud: emptyCloud() })).toBe(
      "upload-local",
    );
    expect(STORAGE_KEY).toBe("essences-app-data-v3");
  });

  it("10. existing cloud data chooses merge rather than blind download", () => {
    expect(chooseReconcileAction(true)).toBe("merge");
    expect(
      shouldUploadLocalFirst({
        metaPresent: true,
        cloud: emptyCloud(),
      }),
    ).toBe("merge");
  });

  it("12. empty cloud snapshot must not replace local entities", () => {
    saveEssencesData(emptyData());
    const task = createTask({ title: "Keep me", date: "2026-09-24" });
    const local = loadEssencesData();
    const merged = mergeLocalAndCloud(local, emptyCloud());
    expect(merged.tasks[task.id]?.title).toBe("Keep me");
    expect(Object.keys(merged.tasks)).toEqual([task.id]);
  });

  it("merges by updatedAt without duplicating the same entity id", () => {
    const local = emptyData();
    local.tasks["t1"] = {
      id: "t1",
      title: "local newer",
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
          t1: {
            ...local.tasks.t1,
            title: "cloud older",
            updatedAt: "2026-09-24T11:00:00.000Z",
          },
        },
      },
    };
    const merged = mergeLocalAndCloud(local, cloud);
    expect(Object.keys(merged.tasks)).toEqual(["t1"]);
    expect(merged.tasks.t1.title).toBe("local newer");
  });

  it("takes the later updatedAt when cloud is newer", () => {
    const older = { updatedAt: "2026-09-24T10:00:00.000Z", title: "old" };
    const newer = { updatedAt: "2026-09-24T12:00:00.000Z", title: "new" };
    expect(laterEntity(older, newer)).toEqual(newer);
  });

  it("records tombstones for local deletes", () => {
    const prev = emptyData();
    prev.tasks["gone"] = {
      id: "gone",
      title: "gone",
      date: "2026-09-24",
      allDay: true,
      icon: "circle",
      color: "orange",
      status: "open",
      order: 0,
      createdFrom: "todo",
      createdAt: "2026-09-24T10:00:00.000Z",
      updatedAt: "2026-09-24T10:00:00.000Z",
    };
    const next = emptyData();
    const stones = recordTombstones(prev, next, {}, "2026-09-24T13:00:00.000Z");
    expect(stones.tasks?.gone).toBe("2026-09-24T13:00:00.000Z");
    const merged = mergeLocalAndCloud(next, {
      collections: { tasks: { gone: prev.tasks.gone } },
    }, stones);
    expect(merged.tasks.gone).toBeUndefined();
  });

  it("partial cloud without meta still merges instead of wiping local", () => {
    expect(
      shouldUploadLocalFirst({
        metaPresent: false,
        cloud: { collections: { tasks: { t1: { id: "t1", updatedAt: "2026-09-24T10:00:00.000Z" } } } },
      }),
    ).toBe("merge");
  });
});

describe("Phase 8 security rules text", () => {
  it("scopes users/{uid} to the signed-in Google owner and never opens the tree", () => {
    const rules = readFileSync(path.join(process.cwd(), "firestore.rules"), "utf8");
    expect(rules).toMatch(/request\.auth\.uid == userId/);
    expect(rules).toMatch(/'google\.com' in request\.auth\.token\.firebase\.identities/);
    expect(rules).not.toMatch(/allow read,\s*write:\s*if true/);
    expect(rules).not.toMatch(/match \/users\/\{[^}]+\}[^{]*\{[^}]*allow read,\s*write:\s*if isSignedIn\(\)/s);
  });
});
