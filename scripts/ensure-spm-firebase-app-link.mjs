/**
 * SwiftPM derives local-package identity from the path basename, so
 * `@capacitor/app` and `@capacitor-firebase/app` both become identity "app"
 * and xcodebuild fails with "Conflicting identity for app".
 *
 * Capacitor's fix is packageOptions.symlink for one of them. Creating that
 * link can fail with EPERM on Windows, so this script:
 *  1. Creates CapApp-SPM/symlinks/CapacitorFirebaseApp (symlink or junction)
 *  2. Rewrites Package.swift to use that unique basename path
 *  3. Normalizes Windows backslashes to forward slashes for macOS CI
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packageSwiftPath = path.join(root, "ios", "App", "CapApp-SPM", "Package.swift");
const linkDir = path.join(root, "ios", "App", "CapApp-SPM", "symlinks");
const linkPath = path.join(linkDir, "CapacitorFirebaseApp");
const targetPath = path.join(root, "node_modules", "@capacitor-firebase", "app");

function ensureLink() {
  if (!fs.existsSync(targetPath)) {
    throw new Error(`Missing ${targetPath}. Run npm ci first.`);
  }
  fs.mkdirSync(linkDir, { recursive: true });
  try {
    fs.rmSync(linkPath, { recursive: true, force: true });
  } catch {
    /* ignore */
  }

  const types = process.platform === "win32" ? ["junction", "dir"] : ["dir", "junction"];
  let lastErr;
  for (const type of types) {
    try {
      fs.symlinkSync(targetPath, linkPath, type);
      console.log(`[spm] Linked CapApp-SPM/symlinks/CapacitorFirebaseApp (${type})`);
      return;
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr ?? new Error("Failed to create SPM identity symlink");
}

function rewritePackageSwift() {
  if (!fs.existsSync(packageSwiftPath)) {
    throw new Error(`Missing ${packageSwiftPath}. Run npx cap sync ios first.`);
  }
  let text = fs.readFileSync(packageSwiftPath, "utf8");
  // Normalize path separators written by Windows cap sync.
  text = text.replace(/\\\\/g, "/").replace(/\\/g, "/");

  const fromNodeModules = /path:\s*"(?:\.\.\/)+node_modules\/@capacitor-firebase\/app"/g;
  const toSymlink = 'path: "symlinks/CapacitorFirebaseApp"';
  const rewritten = text.replace(fromNodeModules, toSymlink);
  if (rewritten !== text) {
    text = rewritten;
    console.log("[spm] Rewrote CapacitorFirebaseApp path to symlinks/CapacitorFirebaseApp");
  } else if (!text.includes('path: "symlinks/CapacitorFirebaseApp"')) {
    console.warn(
      "[spm] Package.swift did not contain @capacitor-firebase/app path; leaving as-is",
    );
  }

  fs.writeFileSync(packageSwiftPath, text);
  if (!text.includes("CapacitorFirebaseMessaging") || !text.includes("CapacitorFirebaseApp")) {
    throw new Error("Package.swift is missing Firebase SPM packages after rewrite");
  }
  if (text.includes("node_modules/@capacitor-firebase/app")) {
    throw new Error(
      "Package.swift still references node_modules/@capacitor-firebase/app (identity collision)",
    );
  }
}

ensureLink();
rewritePackageSwift();
console.log("[spm] CapApp-SPM package identity conflict avoided.");
