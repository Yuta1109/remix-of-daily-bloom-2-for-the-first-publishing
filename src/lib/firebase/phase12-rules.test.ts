import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { buildUpsertOps } from "@/lib/firebase/firebase-firestore";
import { isInlineImagePayload, toCloudImage } from "@/lib/firebase/image-metadata";
import { createNote } from "@/lib/v3/repository";
import { emptyData } from "@/lib/v3/schema";
import { resetEssencesDataCache, saveEssencesData } from "@/lib/v3/storage";
import type { ImageAttachment } from "@/lib/v3/types";

function firestoreRules(): string {
  return readFileSync(path.join(process.cwd(), "firestore.rules"), "utf8");
}

function storageRules(): string {
  return readFileSync(path.join(process.cwd(), "storage.rules"), "utf8");
}

describe("Phase 12 rules static audit", () => {
  it("3–5. Firestore users/* require uid equality + Google; never if true", () => {
    const rules = firestoreRules();
    expect(rules).toContain("request.auth.uid == userId");
    expect(rules).toContain("ownsUserTree(userId)");
    expect(rules).toMatch(/match \/geminiQuota\/\{modelId\}[\s\S]*allow read, write: if false/);
    expect(rules).toMatch(/match \/ocrRequests\/\{id\}[\s\S]*allow read, write: if false/);
    expect(rules).not.toMatch(/allow read,\s*write:\s*if true/);
    expect(rules).not.toMatch(/allow read:\s*if true/);
    expect(rules).not.toMatch(/allow write:\s*if true/);
    expect(rules).not.toMatch(/match \/users\/\{userId\}[\s\S]*allow read, write: if isSignedIn\(\)/);
  });

  it("3–5. Storage only allows users/{userId}/... ownership", () => {
    const rules = storageRules();
    expect(rules).toContain("match /users/{userId}/{allPaths=**}");
    expect(rules).toContain("request.auth.uid == userId");
    expect(rules).not.toMatch(/allow read,\s*write:\s*if true/);
    expect(rules).not.toContain("match /{allPaths=**}");
  });
});

describe("Phase 12 image payload never reaches Firestore ops", () => {
  beforeEach(() => {
    localStorage.clear();
    resetEssencesDataCache();
    saveEssencesData(emptyData());
  });

  it("strips data URLs / base64 from cloud image metadata", () => {
    const image: ImageAttachment = {
      id: "img-1",
      localUri: "data:image/png;base64,AAAA",
      createdAt: "2026-09-24T12:00:00.000Z",
      pendingUpload: true,
      storagePath: "users/uidA/notes/n1/image",
    };
    expect(isInlineImagePayload(image.localUri)).toBe(true);
    const cloud = toCloudImage(image);
    expect(cloud.localUri).toBe("");
    expect(JSON.stringify(cloud)).not.toContain("data:");
    expect(JSON.stringify(cloud)).not.toContain("AAAA");
  });

  it("buildUpsertOps does not serialize inline image bytes", () => {
    const note = createNote({ title: "Photo" });
    const data = emptyData();
    data.notes[note.id] = {
      ...note,
      image: {
        id: "img-inline",
        localUri: "data:image/jpeg;base64,/9j/huge",
        createdAt: note.createdAt,
        storagePath: `users/uidA/notes/${note.id}/image`,
        downloadUrl: "https://example.com/n",
      },
    };
    const ops = buildUpsertOps("uidA", data);
    const serialized = JSON.stringify(ops);
    expect(serialized).not.toContain("data:image");
    expect(serialized).not.toContain("/9j/huge");
    expect(serialized).toContain(`users/uidA/notes/${note.id}/image`);
  });
});
