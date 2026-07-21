/**
 * Avoid SwiftPM identity "app" entirely.
 *
 * CapApp-SPM lives under ios/App/, and any local package path ending in `/app`
 * (node_modules/@capacitor/app or @capacitor-firebase/app) collides as identity
 * "app". Capacitor's symlink workaround is unreliable on CI/Xcode 26.
 *
 * Fix: do NOT add @capacitor/app as a path package. Copy AppPlugin.swift into
 * CapApp-SPM as a local target `VendoredAppPlugin` instead.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const capAppSpm = path.join(root, "ios", "App", "CapApp-SPM");
const packageSwiftPath = path.join(capAppSpm, "Package.swift");
const vendorDir = path.join(capAppSpm, "Sources", "VendoredAppPlugin");
const vendorFile = path.join(vendorDir, "AppPlugin.swift");
const npmAppPlugin = path.join(
  root,
  "node_modules",
  "@capacitor",
  "app",
  "ios",
  "Sources",
  "AppPlugin",
  "AppPlugin.swift",
);

function vendorAppPluginSource() {
  if (!fs.existsSync(npmAppPlugin)) {
    throw new Error(`Missing ${npmAppPlugin}. Run npm ci first.`);
  }
  fs.mkdirSync(vendorDir, { recursive: true });
  fs.copyFileSync(npmAppPlugin, vendorFile);
  console.log("[spm] Vendored AppPlugin.swift → CapApp-SPM/Sources/VendoredAppPlugin/");
}

function rewritePackageSwift() {
  if (!fs.existsSync(packageSwiftPath)) {
    throw new Error(`Missing ${packageSwiftPath}. Run npx cap sync ios first.`);
  }

  let text = fs.readFileSync(packageSwiftPath, "utf8");
  text = text.replace(/\\\\/g, "/").replace(/\\/g, "/");

  // Drop any external CapacitorApp package path (basename "app" → SPM collision).
  text = text.replace(
    /\n\s*\.package\(name:\s*"CapacitorApp",\s*path:\s*"[^"]+"\),?/g,
    "",
  );
  text = text.replace(
    /\n\s*\.product\(name:\s*"CapacitorApp",\s*package:\s*"CapacitorApp"\),?/g,
    "",
  );

  // Ensure VendoredAppPlugin local target exists.
  if (!text.includes('name: "VendoredAppPlugin"')) {
    text = text.replace(
      /targets:\s*\[\s*\n\s*\.target\(\s*\n\s*name:\s*"CapApp-SPM",/,
      `targets: [
        .target(
            name: "VendoredAppPlugin",
            dependencies: [
                .product(name: "Capacitor", package: "capacitor-swift-pm"),
                .product(name: "Cordova", package: "capacitor-swift-pm")
            ],
            path: "Sources/VendoredAppPlugin"
        ),
        .target(
            name: "CapApp-SPM",`,
    );
  }

  // Ensure CapApp-SPM depends on VendoredAppPlugin (not just that the string appears).
  const capAppDependsOnVendor =
    /\.target\(\s*\n\s*name:\s*"CapApp-SPM",\s*\n\s*dependencies:\s*\[[^\]]*"VendoredAppPlugin"/s.test(
      text,
    );
  if (!capAppDependsOnVendor) {
    text = text.replace(
      /(\.target\(\s*\n\s*name:\s*"CapApp-SPM",\s*\n\s*dependencies:\s*\[)/,
      `$1
                "VendoredAppPlugin",`,
    );
  }

  // Clean leftover empty commas / double commas from removals.
  text = text.replace(/,(\s*\n\s*\])/g, "$1");
  text = text.replace(/,(\s*,)/g, ",");

  if (!text.includes("CapacitorFirebaseMessaging")) {
    throw new Error("Package.swift missing CapacitorFirebaseMessaging");
  }
  if (text.includes("node_modules/@capacitor/app") || text.includes("node_modules/@capacitor-firebase/app")) {
    throw new Error("Package.swift still references a package path ending in /app");
  }
  if ([...text.matchAll(/path:\s*"([^"]+\/app)"/g)].length) {
    throw new Error('Package.swift still has path basename "app"');
  }
  if (!text.includes("VendoredAppPlugin")) {
    throw new Error("Package.swift missing VendoredAppPlugin target");
  }
  if (!fs.existsSync(vendorFile)) {
    throw new Error("Vendored AppPlugin.swift missing on disk");
  }

  fs.writeFileSync(packageSwiftPath, text);
  console.log("[spm] Package.swift uses VendoredAppPlugin (no external /app package)");
}

vendorAppPluginSource();
rewritePackageSwift();
console.log("[spm] CapApp-SPM package identities OK.");
