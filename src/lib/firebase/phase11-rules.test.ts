import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function firestoreRules(): string {
  return readFileSync(path.join(process.cwd(), "firestore.rules"), "utf8");
}

function storageRules(): string {
  return readFileSync(path.join(process.cwd(), "storage.rules"), "utf8");
}

describe("Phase 11 Firestore / Storage ownership rules", () => {
  it("15. Firestore: owner A can match A, never an open tree, never unauthenticated users/*", () => {
    const rules = firestoreRules();
    expect(rules).toMatch(/function isOwner\(userId\)/);
    expect(rules).toMatch(/request\.auth\.uid == userId/);
    expect(rules).toMatch(/'google\.com' in request\.auth\.token\.firebase\.identities/);
    expect(rules).toMatch(/match \/users\/\{userId\}/);
    expect(rules).toMatch(/allow read, write: if false;/);
    expect(rules).toMatch(/ownsUserTree\(userId\)/);
    expect(rules).not.toMatch(/allow read,\s*write:\s*if true/);
    expect(rules).not.toMatch(/allow read:\s*if true/);
    expect(rules).not.toMatch(/allow write:\s*if true/);
  });

  it("16. Storage: only users/{uid}/... with the same ownership functions", () => {
    const rules = storageRules();
    expect(rules).toMatch(/match \/users\/\{userId\}\/\{allPaths=\*\*\}/);
    expect(rules).toMatch(/ownsUserTree\(userId\)/);
    expect(rules).toMatch(/request\.auth\.uid == userId/);
    expect(rules).not.toMatch(/allow read,\s*write:\s*if true/);
    expect(rules).not.toMatch(/match \/\{allPaths=\*\*\}/);
  });

  it("wrong uid cannot satisfy isOwner (documented by uid equality)", () => {
    const rules = firestoreRules();
    expect(rules).toContain("request.auth.uid == userId");
    expect(rules).not.toContain("request.auth != null; allow read, write");
  });
});
