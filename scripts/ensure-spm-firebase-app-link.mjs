/**
 * SwiftPM uses the last path component as local-package identity.
 * `@capacitor/app` → identity "app". CapApp-SPM also lives under ios/App/, and
 * Xcode has repeatedly failed with "Conflicting identity for app" even after
 * excluding `@capacitor-firebase/app`.
 *
 * Fix: materialize @capacitor/app under CapApp-SPM/symlinks/CapacitorApp (a real
 * directory copy, not a symlink — SPM may canonicalize symlinks back to "app")
 * and point Package.swift at that unique basename.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packageSwiftPath = path.join(root, "ios", "App", "CapApp-SPM", "Package.swift");
const linkDir = path.join(root, "ios", "App", "CapApp-SPM", "symlinks");
const uniqueAppDir = path.join(linkDir, "CapacitorApp");
const npmAppDir = path.join(root, "node_modules", "@capacitor", "app");

function materializeCapacitorApp() {
  if (!fs.existsSync(npmAppDir)) {
    throw new Error(`Missing ${npmAppDir}. Run npm ci first.`);
  }
  fs.mkdirSync(linkDir, { recursive: true });
  fs.rmSync(uniqueAppDir, { recursive: true, force: true });
  fs.cpSync(npmAppDir, uniqueAppDir, { recursive: true, dereference: true });
  if (!fs.existsSync(path.join(uniqueAppDir, "Package.swift"))) {
    throw new Error("CapacitorApp copy is missing Package.swift");
  }
  console.log("[spm] Copied @capacitor/app → CapApp-SPM/symlinks/CapacitorApp");
}

function rewritePackageSwift() {
  if (!fs.existsSync(packageSwiftPath)) {
    throw new Error(`Missing ${packageSwiftPath}. Run npx cap sync ios first.`);
  }
  let text = fs.readFileSync(packageSwiftPath, "utf8");
  text = text.replace(/\\\\/g, "/").replace(/\\/g, "/");

  // Never keep a path whose basename is exactly "app".
  text = text.replace(
    /path:\s*"(?:\.\.\/)+node_modules\/@capacitor\/app"/g,
    'path: "symlinks/CapacitorApp"',
  );
  text = text.replace(
    /path:\s*"symlinks\/CapacitorApp"/g,
    'path: "symlinks/CapacitorApp"',
  );

  // Guard: firebase/app must not appear (same basename collision).
  if (text.includes("node_modules/@capacitor-firebase/app")) {
    throw new Error(
      "Package.swift still references @capacitor-firebase/app — remove it from ios.includePlugins",
    );
  }

  // Guard: no package path may end with /app"
  const bad = [...text.matchAll(/path:\s*"([^"]+\/app)"/g)].map((m) => m[1]);
  if (bad.length) {
    throw new Error(
      `Package.swift still has path basename "app": ${bad.join(", ")}. ` +
        "SwiftPM identity collision will fail xcodebuild.",
    );
  }

  if (!text.includes('path: "symlinks/CapacitorApp"')) {
    throw new Error('Package.swift missing path: "symlinks/CapacitorApp"');
  }
  if (!text.includes("CapacitorFirebaseMessaging")) {
    throw new Error("Package.swift missing CapacitorFirebaseMessaging");
  }

  fs.writeFileSync(packageSwiftPath, text);
  console.log("[spm] Package.swift uses symlinks/CapacitorApp (identity ≠ app)");
}

materializeCapacitorApp();
rewritePackageSwift();
console.log("[spm] CapApp-SPM package identities OK.");
