import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("Phase 13 release preflight", () => {
  it("preflight script exits 0 and does not print secret values", () => {
    const result = spawnSync(process.execPath, ["scripts/release-preflight.mjs"], {
      encoding: "utf8",
      cwd: process.cwd(),
    });
    const out = `${result.stdout || ""}\n${result.stderr || ""}`;
    expect(result.status, out).toBe(0);
    expect(out).toMatch(/release-preflight: ready/);
    expect(out).not.toMatch(/BEGIN PRIVATE KEY/);
    expect(out).not.toMatch(/AIzaSy/);
    expect(out).not.toMatch(/-----BEGIN/);
  });

  it("TESTFLIGHT.md is a runbook with Smoke Test and pass/fail slots", () => {
    const text = readFileSync(path.join(process.cwd(), "docs/TESTFLIGHT.md"), "utf8");
    expect(text).toContain("## A. Firebase preparation");
    expect(text).toContain("## B. GitHub preparation");
    expect(text).toContain("## C. Build");
    expect(text).toContain("## D. TestFlight install");
    expect(text).toContain("## E. Test scenarios");
    expect(text).toContain("Smoke Test");
    expect(text).toContain("TestFlight-only");
    expect(text).toContain("native Google Sign-In");
    expect(text).toContain("[ ] pass / [ ] fail");
    expect(text).toContain("GitHub");
    expect(text).toContain("Run workflow");
    expect(text).toContain("GOOGLE_SERVICE_INFO_PLIST");
    expect(text).toContain("FIREBASE_WEB_CONFIG");
    expect(text).toContain("APP_STORE_CONNECT_KEY_ID");
    expect(text).toContain("Store / Ads / Subscription");
  });

  it("RELEASE_CHECKLIST.md has blocker classes, deploy command, and dispatch steps", () => {
    const text = readFileSync(path.join(process.cwd(), "docs/RELEASE_CHECKLIST.md"), "utf8");
    expect(text).toContain("## Code gate");
    expect(text).toContain("BLOCKER");
    expect(text).toContain("NON-BLOCKER");
    expect(text).toContain("firebase deploy --only firestore:rules,storage");
    expect(text).toContain("workflow_dispatch");
    expect(text).toContain("Run workflow");
    expect(text).toContain("legacy writes audited");
    expect(text).toContain("apply-google-signin-ios.mjs");
    expect(text).toContain("CURRENT_PROJECT_VERSION");
  });

  it("ios-release.yml is workflow_dispatch only and simulator stays unsigned", () => {
    const release = readFileSync(
      path.join(process.cwd(), ".github/workflows/ios-release.yml"),
      "utf8",
    );
    const simulator = readFileSync(
      path.join(process.cwd(), ".github/workflows/ios-simulator-build.yml"),
      "utf8",
    );
    expect(release).toMatch(/^\s*on:\s*$/m);
    expect(release).toContain("workflow_dispatch");
    expect(release).not.toMatch(/^\s+push:/m);
    expect(simulator).toContain("workflow_dispatch");
    expect(simulator).toContain("CODE_SIGNING_ALLOWED=NO");
    expect(simulator).not.toContain("altool --upload-app");
  });
});
