import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  applyGoogleSignInKeys,
  plistString,
  SAMPLE_GOOGLE_SERVICE_INFO_PLIST,
} from "../../../scripts/google-signin-plist.mjs";

describe("Phase 10 CI / plist injection", () => {
  it("17. cap:sync still succeeds conceptually when GoogleService-Info.plist is absent", () => {
    const applySrc = readFileSync(
      path.join(process.cwd(), "scripts/apply-google-signin-ios.mjs"),
      "utf8",
    );
    expect(applySrc).toMatch(/process\.exit\(0\)/);
    expect(applySrc).toMatch(/GoogleService-Info\.plist not found/);
    const pkg = JSON.parse(readFileSync(path.join(process.cwd(), "package.json"), "utf8")) as {
      scripts: Record<string, string>;
    };
    expect(pkg.scripts["cap:sync"]).toContain("apply-google-signin-ios.mjs");
    const plistPath = path.join(process.cwd(), "ios/App/App/GoogleService-Info.plist");
    if (!existsSync(plistPath)) {
      const result = spawnSync(process.execPath, ["scripts/apply-google-signin-ios.mjs"], {
        encoding: "utf8",
        cwd: process.cwd(),
      });
      expect(result.status).toBe(0);
      expect(result.stdout).toMatch(/not found/);
    }
  });

  it("18. plist injection understands a real GoogleService-Info.plist shape", () => {
    const clientId = plistString(SAMPLE_GOOGLE_SERVICE_INFO_PLIST, "CLIENT_ID");
    const reversed = plistString(SAMPLE_GOOGLE_SERVICE_INFO_PLIST, "REVERSED_CLIENT_ID");
    expect(clientId).toContain("apps.googleusercontent.com");
    expect(reversed.startsWith("com.googleusercontent.apps.")).toBe(true);
    const info = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>CFBundleURLTypes</key>
	<array>
		<dict>
			<key>CFBundleURLName</key>
			<string>essences</string>
			<key>CFBundleURLSchemes</key>
			<array>
				<string>essences</string>
			</array>
		</dict>
	</array>
</dict>
</plist>
`;
    const next = applyGoogleSignInKeys(info, clientId, reversed);
    expect(next).toContain(`<string>${clientId}</string>`);
    expect(next).toContain("GIDClientID");
    expect(next).toContain(reversed);
    expect(next).toContain("essences");
  });

  it("19. the iOS build does not depend on a git-tracked plist", () => {
    const gitignore = readFileSync(path.join(process.cwd(), ".gitignore"), "utf8");
    expect(gitignore).toMatch(/GoogleService-Info\.plist/);
    const release = readFileSync(
      path.join(process.cwd(), ".github/workflows/ios-release.yml"),
      "utf8",
    );
    const simulator = readFileSync(
      path.join(process.cwd(), ".github/workflows/ios-simulator-build.yml"),
      "utf8",
    );
    expect(release).toContain("GOOGLE_SERVICE_INFO_PLIST");
    expect(simulator).toContain("GOOGLE_SERVICE_INFO_PLIST");
    expect(release).not.toContain("GOOGLE_SERVICE_INFO_PLIST_BASE64");
    expect(release).toMatch(/base64 --decode > ios\/App\/App\/GoogleService-Info.plist/);
  });

  it("workflow jobs still run npm ci, Vite build, cap sync, and plist injection", () => {
    const release = readFileSync(
      path.join(process.cwd(), ".github/workflows/ios-release.yml"),
      "utf8",
    );
    const simulator = readFileSync(
      path.join(process.cwd(), ".github/workflows/ios-simulator-build.yml"),
      "utf8",
    );
    for (const yaml of [release, simulator]) {
      expect(yaml).toContain("npm ci");
      expect(yaml).toContain("npm run build");
      expect(yaml).toContain("npx cap sync ios");
      expect(yaml).toContain("apply-google-signin-ios.mjs");
      expect(yaml).toContain("GoogleService-Info.plist");
    }
    expect(release).toContain("APP_STORE_CONNECT_KEY_ID");
    expect(release).toContain("macos-15");
    expect(simulator).toContain("macos-15");
  });
});
