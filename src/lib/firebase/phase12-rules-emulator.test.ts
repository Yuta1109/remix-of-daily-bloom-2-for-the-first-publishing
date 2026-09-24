import { readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const emulatorReady = !!process.env.FIRESTORE_EMULATOR_HOST;

describe.skipIf(!emulatorReady)("Phase 12 Firestore / Storage emulator rules", () => {
  let env: import("@firebase/rules-unit-testing").RulesTestEnvironment;
  let testing: typeof import("@firebase/rules-unit-testing");
  let firestoreMod: typeof import("firebase/firestore");
  let storageMod: typeof import("firebase/storage");

  const firestoreRules = readFileSync(path.join(process.cwd(), "firestore.rules"), "utf8");
  const storageRules = readFileSync(path.join(process.cwd(), "storage.rules"), "utf8");
  const googleClaims = {
    email: "a@example.com",
    firebase: {
      sign_in_provider: "google.com",
      identities: { "google.com": ["gid-a"] },
    },
  };
  const anonymousClaims = {
    firebase: {
      sign_in_provider: "anonymous",
      identities: {},
    },
  };

  beforeAll(async () => {
    testing = await import("@firebase/rules-unit-testing");
    firestoreMod = await import("firebase/firestore");
    storageMod = await import("firebase/storage");
    env = await testing.initializeTestEnvironment({
      projectId: "demo-essences-rules",
      firestore: {
        host: "127.0.0.1",
        port: Number(process.env.FIRESTORE_EMULATOR_PORT || 8088),
        rules: firestoreRules,
      },
      storage: {
        host: "127.0.0.1",
        port: 9199,
        rules: storageRules,
      },
    });
  });

  afterAll(async () => {
    await env?.cleanup();
  });

  it("A: Google user A can read/write A data", async () => {
    const ctx = env.authenticatedContext("uidA", googleClaims);
    const note = firestoreMod.doc(ctx.firestore(), "users/uidA/notes/n1");
    await testing.assertSucceeds(firestoreMod.setDoc(note, { title: "A" }));
    await testing.assertSucceeds(firestoreMod.getDoc(note));
  });

  it("B: Google user A cannot read/write B data", async () => {
    const ctx = env.authenticatedContext("uidA", googleClaims);
    const note = firestoreMod.doc(ctx.firestore(), "users/uidB/notes/n1");
    await testing.assertFails(firestoreMod.setDoc(note, { title: "leak" }));
    await testing.assertFails(firestoreMod.getDoc(note));
  });

  it("C: unauthenticated cannot access users/*", async () => {
    const ctx = env.unauthenticatedContext();
    const note = firestoreMod.doc(ctx.firestore(), "users/uidA/notes/n1");
    await testing.assertFails(firestoreMod.getDoc(note));
    await testing.assertFails(firestoreMod.setDoc(note, { title: "anon" }));
  });

  it("D: signed-in without Google provider is denied users/*", async () => {
    const ctx = env.authenticatedContext("uidA", anonymousClaims);
    const note = firestoreMod.doc(ctx.firestore(), "users/uidA/notes/n1");
    await testing.assertFails(firestoreMod.setDoc(note, { title: "no-google" }));
    await testing.assertFails(firestoreMod.getDoc(note));
  });

  it("E/F/G: Storage path ownership", async () => {
    const alice = env.authenticatedContext("uidA", googleClaims);
    const ownPath = storageMod.ref(alice.storage(), "users/uidA/notes/n1/image");
    const bobPath = storageMod.ref(alice.storage(), "users/uidB/notes/n1/image");
    await testing.assertSucceeds(storageMod.uploadString(ownPath, "hello"));
    await testing.assertSucceeds(storageMod.getBytes(ownPath));
    await testing.assertFails(storageMod.uploadString(bobPath, "nope"));
    const guest = env.unauthenticatedContext();
    await testing.assertFails(
      storageMod.uploadString(storageMod.ref(guest.storage(), "users/uidA/notes/n1/image"), "x"),
    );
  });
});

describe("Phase 12 emulator gate", () => {
  it("21. default Vitest skips live emulator rules unless FIRESTORE_EMULATOR_HOST is set", () => {
    if (!emulatorReady) {
      expect(emulatorReady).toBe(false);
      return;
    }
    expect(process.env.FIRESTORE_EMULATOR_HOST).toBeTruthy();
  });
});
