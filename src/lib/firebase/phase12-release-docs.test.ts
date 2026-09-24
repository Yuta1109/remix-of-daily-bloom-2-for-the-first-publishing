import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("Phase 12 release docs", () => {
  it("22. RELEASE_CHECKLIST.md lists code, Firebase, CI, TestFlight, and hygiene gates", () => {
    const text = readFileSync(path.join(process.cwd(), "docs/RELEASE_CHECKLIST.md"), "utf8");
    expect(text).toContain("## Code gate");
    expect(text).toContain("Vitest");
    expect(text).toContain("firestore.rules");
    expect(text).toContain("storage.rules");
    expect(text).toContain("deployed");
    expect(text).toContain("GoogleService-Info.plist");
    expect(text).toContain("TestFlight");
    expect(text).toContain("A/B isolation");
    expect(text).toContain("in git");
    expect(text).toContain("legacy writes audited");
  });

  it("TESTFLIGHT.md separates Windows/CI from physical iPhone checks", () => {
    const text = readFileSync(path.join(process.cwd(), "docs/TESTFLIGHT.md"), "utf8");
    expect(text).toMatch(/Windows \/ CI/i);
    expect(text).toMatch(/physical iPhone|TestFlight on a real/i);
    expect(text).toContain("native Google Sign-In");
    expect(text).toMatch(/not\*\* claimed as verified|not claimed as verified/);
  });
});
