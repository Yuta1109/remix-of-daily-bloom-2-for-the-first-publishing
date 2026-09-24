import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { buildUpsertOps } from "@/lib/firebase/firebase-firestore";
import {
  imageStoragePath,
  isInlineImagePayload,
  noteImageStoragePath,
  quickMemoImageStoragePath,
  storagePathBelongsToUid,
  toCloudImage,
} from "@/lib/firebase/image-metadata";
import {
  collectDeletedImagePaths,
  collectPendingUploads,
  flushImageDeletes,
  flushImageUploads,
  hydrateCloudImages,
  setImageSyncAdapterForTests,
} from "@/lib/firebase/image-sync";
import { writePendingImageDeletes } from "@/lib/firebase/cloud-session";
import { persistPickedImageBlob } from "@/lib/note-image-cache";
import {
  convertQuickMemoToNote,
  createNote,
  createQuickMemo,
  deleteNote,
  deleteQuickMemo,
} from "@/lib/v3/repository";
import { emptyData } from "@/lib/v3/schema";
import { loadEssencesData, resetEssencesDataCache, saveEssencesData } from "@/lib/v3/storage";
import type { ImageAttachment } from "@/lib/v3/types";

const NOW = "2026-09-24T12:00:00.000Z";

function localImage(id: string, extras: Partial<ImageAttachment> = {}): ImageAttachment {
  return {
    id,
    localUri: `blob:http://localhost/${id}`,
    createdAt: NOW,
    pendingUpload: true,
    ...extras,
  };
}

describe("Phase 10 Storage metadata + paths", () => {
  beforeEach(() => {
    localStorage.clear();
    resetEssencesDataCache();
    saveEssencesData(emptyData());
    setImageSyncAdapterForTests(null);
  });

  it("11. toCloudImage keeps metadata and drops the local file URI", () => {
    const cloud = toCloudImage(
      localImage("img-1", {
        storagePath: "users/uidA/notes/note-1/image",
        downloadUrl: "https://example.com/n1",
        width: 320,
        height: 240,
        contentType: "image/jpeg",
        uploadedAt: NOW,
      }),
    );
    expect(cloud.localUri).toBe("");
    expect(cloud.storagePath).toBe("users/uidA/notes/note-1/image");
    expect(cloud.downloadUrl).toBe("https://example.com/n1");
    expect(cloud.contentType).toBe("image/jpeg");
    expect(cloud.width).toBe(320);
    expect(cloud.height).toBe(240);
    expect(cloud.pendingUpload).toBeUndefined();
  });

  it("12. image object paths use Firebase UID and never email", () => {
    const email = "person@example.com";
    const notePath = noteImageStoragePath("uidA", "note-1");
    const memoPath = quickMemoImageStoragePath("uidA", "memo-1");
    expect(notePath).toBe("users/uidA/notes/note-1/image");
    expect(memoPath).toBe("users/uidA/quickMemos/memo-1/image");
    expect(notePath.includes(email)).toBe(false);
    expect(memoPath.includes("@")).toBe(false);
    expect(storagePathBelongsToUid(notePath, "uidA")).toBe(true);
    expect(storagePathBelongsToUid(notePath, "uidB")).toBe(false);
    expect(imageStoragePath("uidA", "notes", "note-1")).toBe(notePath);
  });

  it("13. Firestore upserts never carry base64 / data-URL image bytes", () => {
    const note = createNote({
      title: "with image",
      image: localImage("img-note", {
        storagePath: "users/uidA/notes/will-be-replaced/image",
      }),
    });
    const memo = createQuickMemo({
      text: "quick",
      image: localImage("img-memo"),
    });
    const ops = buildUpsertOps("uidA", loadEssencesData());
    const noteOp = ops.find((op) => op.collection === "notes" && op.id === note.id);
    const memoOp = ops.find((op) => op.collection === "quickMemos" && op.id === memo.id);
    const noteImage = (noteOp?.data as { image?: ImageAttachment }).image;
    const memoImage = (memoOp?.data as { image?: ImageAttachment }).image;
    expect(noteImage?.localUri).toBe("");
    expect(memoImage?.localUri).toBe("");
    expect(isInlineImagePayload(JSON.stringify(noteOp?.data))).toBe(false);
    expect(isInlineImagePayload(JSON.stringify(memoOp?.data))).toBe(false);
    expect(JSON.stringify(noteOp?.data)).not.toMatch(/data:image/);
    expect(JSON.stringify(noteOp?.data)).not.toMatch(/base64,/);
  });

  it("14. image upload retries after a failed attempt", async () => {
    const blob = new Blob(["jpeg-bytes"], { type: "image/jpeg" });
    const note = createNote({
      title: "retry",
      image: localImage("img-retry"),
    });
    await persistPickedImageBlob("img-retry", blob);
    let attempts = 0;
    setImageSyncAdapterForTests({
      upload: async ({ storagePath }) => {
        attempts += 1;
        if (attempts === 1) throw new Error("network");
        return { storagePath, downloadUrl: "https://example.com/retry" };
      },
      remove: async () => {},
      downloadUrl: async () => "https://example.com/retry",
    });
    const first = await flushImageUploads("uidA", loadEssencesData());
    expect(first.failed).toBe(true);
    expect(first.uploaded).toBe(0);
    expect(collectPendingUploads("uidA", first.data).some((item) => item.id === note.id)).toBe(
      true,
    );
    const second = await flushImageUploads("uidA", first.data);
    expect(second.failed).toBe(false);
    expect(second.uploaded).toBe(1);
    expect(second.data.notes[note.id]?.image?.storagePath).toBe(
      "users/uidA/notes/" + note.id + "/image",
    );
    expect(second.data.notes[note.id]?.image?.pendingUpload).toBe(false);
  });

  it("15. deleting a note queues and removes its cloud image without failing the note delete", () => {
    const note = createNote({
      title: "gone",
      image: localImage("img-del", {
        storagePath: "users/uidA/notes/pre/image",
        pendingUpload: false,
      }),
    });
    const before = loadEssencesData();
    deleteNote(note.id);
    const after = loadEssencesData();
    expect(after.notes[note.id]).toBeUndefined();
    const paths = collectDeletedImagePaths("uidA", before, after);
    expect(paths.some((item) => item.includes(note.id) || item.endsWith("/image"))).toBe(true);
  });

  it("16. restore mapping hydrates a local URI from Storage metadata", async () => {
    const note = createNote({
      title: "restore",
      image: {
        id: "img-restore",
        localUri: "",
        createdAt: NOW,
        storagePath: "users/uidA/notes/restored/image",
        downloadUrl: "https://example.com/restored",
      },
    });
    setImageSyncAdapterForTests({
      upload: async ({ storagePath }) => ({
        storagePath,
        downloadUrl: "https://example.com/x",
      }),
      remove: async () => {},
      downloadUrl: async () => "https://example.com/restored",
      fetchBlob: async () => new Blob(["restored"], { type: "image/jpeg" }),
    });
    const hydrated = await hydrateCloudImages("uidA", loadEssencesData());
    expect(hydrated.restored).toBeGreaterThan(0);
    const uri = hydrated.data.notes[note.id]?.image?.localUri;
    expect(uri).toMatch(/^blob:/);
    expect(hydrated.data.notes[note.id]?.image?.storagePath).toBe(
      "users/uidA/notes/restored/image",
    );
  });

  it("20. Note image stays linked to the same note id after a cloud metadata round-trip", () => {
    const note = createNote({
      title: "keep",
      image: localImage("img-note-link", {
        storagePath: "users/uidA/notes/keep/image",
        pendingUpload: false,
      }),
    });
    const op = buildUpsertOps("uidA", loadEssencesData()).find(
      (item) => item.collection === "notes" && item.id === note.id,
    );
    expect((op?.data as { id: string; image?: ImageAttachment }).id).toBe(note.id);
    expect((op?.data as { image?: ImageAttachment }).image?.id).toBe("img-note-link");
  });

  it("21. Quick Memo image stays linked after convert-to-note", () => {
    const memo = createQuickMemo({
      text: "photo memo",
      image: localImage("img-memo-link", {
        storagePath: "users/uidA/quickMemos/m1/image",
        pendingUpload: false,
      }),
    });
    const { note } = convertQuickMemoToNote(memo.id);
    expect(note.image?.id).toBe("img-memo-link");
    expect(loadEssencesData().quickMemos[memo.id]?.image?.id).toBe("img-memo-link");
    expect(loadEssencesData().notes[note.id]?.image?.id).toBe("img-memo-link");
  });

  it("deletes a quick memo image path unless a converted note still references it", () => {
    const memo = createQuickMemo({
      text: "x",
      image: localImage("img-shared", {
        storagePath: "users/uidA/quickMemos/shared/image",
        pendingUpload: false,
      }),
    });
    convertQuickMemoToNote(memo.id);
    const before = loadEssencesData();
    deleteQuickMemo(memo.id);
    const paths = collectDeletedImagePaths("uidA", before, loadEssencesData());
    expect(paths).not.toContain("users/uidA/quickMemos/shared/image");
  });
});

describe("Phase 10 Storage rules", () => {
  it("requires Google owner uid and never opens the bucket", () => {
    const rules = readFileSync(path.join(process.cwd(), "storage.rules"), "utf8");
    expect(rules).toMatch(/request\.auth\.uid == userId/);
    expect(rules).toMatch(/'google\.com' in request\.auth\.token\.firebase\.identities/);
    expect(rules).not.toMatch(/allow read,\s*write:\s*if true/);
    expect(rules).not.toMatch(/enforceAppCheck|appCheck/);
  });

  it("flushImageDeletes treats missing objects as success and retries others", async () => {
    const removed: string[] = [];
    setImageSyncAdapterForTests({
      upload: async ({ storagePath }) => ({ storagePath, downloadUrl: "x" }),
      remove: async (_uid, storagePath) => {
        removed.push(storagePath);
        if (storagePath.includes("fail")) throw new Error("keep");
      },
      downloadUrl: async () => "x",
    });
    writePendingImageDeletes("uidA", [
      "users/uidA/notes/ok/image",
      "users/uidA/notes/fail/image",
    ]);
    const remainingFailed = await flushImageDeletes("uidA");
    expect(removed).toEqual([
      "users/uidA/notes/ok/image",
      "users/uidA/notes/fail/image",
    ]);
    expect(remainingFailed).toBe(true);
  });
});
