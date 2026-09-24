#!/usr/bin/env node
/**
 * Phase 13 release preflight. Checks operational files and git tracking.
 * Never prints secret values, plist contents, or .env contents.
 *
 * exit 0  — ready (warnings allowed)
 * exit 1  — blocker
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const EXPECTED_PROJECT = "todolist-app-project-4fd37";
const EXPECTED_BUNDLE = "com.confast.essences";

const errors = [];
const warnings = [];

function exists(fileRel) {
  return fs.existsSync(path.join(ROOT, fileRel));
}

function read(fileRel) {
  return fs.readFileSync(path.join(ROOT, fileRel), "utf8");
}

function mustExist(fileRel) {
  if (!exists(fileRel)) errors.push(`missing required file: ${fileRel}`);
}

const REQUIRED_FILES = [
  "package.json",
  "package-lock.json",
  "capacitor.config.ts",
  "firebase.json",
  ".firebaserc",
  "firestore.rules",
  "storage.rules",
  ".github/workflows/ios-release.yml",
  ".github/workflows/ios-simulator-build.yml",
  "docs/TESTFLIGHT.md",
  "docs/RELEASE_CHECKLIST.md",
  "scripts/google-signin-plist.mjs",
  "scripts/apply-google-signin-ios.mjs",
  "scripts/build-firebase-web-config.mjs",
  "scripts/release-preflight.mjs",
];

for (const f of REQUIRED_FILES) mustExist(f);

if (exists("package.json")) {
  try {
    const pkg = JSON.parse(read("package.json"));
    if (!pkg.scripts?.["cap:sync"]?.includes("apply-google-signin-ios.mjs")) {
      errors.push("package.json cap:sync must run apply-google-signin-ios.mjs");
    }
  } catch {
    errors.push("package.json is not valid JSON");
  }
}

if (exists(".firebaserc")) {
  try {
    const rc = JSON.parse(read(".firebaserc"));
    const id = rc?.projects?.default;
    if (id !== EXPECTED_PROJECT) {
      errors.push(`.firebaserc default project is ${id || "(empty)"}, expected ${EXPECTED_PROJECT}`);
    }
  } catch {
    errors.push(".firebaserc is not valid JSON");
  }
}

if (exists("firebase.json")) {
  try {
    const fb = JSON.parse(read("firebase.json"));
    if (fb?.firestore?.rules !== "firestore.rules") {
      errors.push("firebase.json firestore.rules path is not firestore.rules");
    }
    if (fb?.storage?.rules !== "storage.rules") {
      errors.push("firebase.json storage.rules path is not storage.rules");
    }
  } catch {
    errors.push("firebase.json is not valid JSON");
  }
}

if (exists("capacitor.config.ts")) {
  const cap = read("capacitor.config.ts");
  if (!cap.includes(EXPECTED_BUNDLE)) {
    errors.push(`capacitor.config.ts does not contain bundle id ${EXPECTED_BUNDLE}`);
  }
}

if (exists("firestore.rules") && !read("firestore.rules").includes("service cloud.firestore")) {
  errors.push("firestore.rules does not look like a Firestore rules file");
}
if (exists("storage.rules") && !read("storage.rules").includes("service firebase.storage")) {
  errors.push("storage.rules does not look like a Storage rules file");
}

const RELEASE_SECRETS = [
  "GOOGLE_SERVICE_INFO_PLIST",
  "FIREBASE_WEB_CONFIG",
  "APPLE_TEAM_ID",
  "APP_STORE_CONNECT_KEY_ID",
  "APP_STORE_CONNECT_ISSUER_ID",
  "APP_STORE_CONNECT_PRIVATE_KEY",
];

function extractSecretNames(yaml) {
  const names = new Set();
  const re = /secrets\.([A-Z][A-Z0-9_]*)/g;
  let m;
  while ((m = re.exec(yaml))) names.add(m[1]);
  return names;
}

function lintWorkflow(fileRel, { requireDispatch, requireReleaseSecrets, expectedOrder }) {
  if (!exists(fileRel)) return;
  const text = read(fileRel);
  if (!/^name:\s+\S/m.test(text)) errors.push(`${fileRel}: missing name:`);
  if (!/^on:/m.test(text)) errors.push(`${fileRel}: missing on:`);
  if (!/^jobs:/m.test(text)) errors.push(`${fileRel}: missing jobs:`);
  if (!/runs-on:\s+\S/.test(text)) errors.push(`${fileRel}: missing runs-on`);
  if (requireDispatch && !/workflow_dispatch/.test(text)) {
    errors.push(`${fileRel}: missing workflow_dispatch`);
  }
  const secrets = extractSecretNames(text);
  if (requireReleaseSecrets) {
    for (const name of RELEASE_SECRETS) {
      if (!secrets.has(name)) errors.push(`${fileRel}: missing secrets.${name}`);
    }
  }
  if (expectedOrder) {
    let last = -1;
    for (const token of expectedOrder) {
      const idx = text.indexOf(token);
      if (idx < 0) {
        errors.push(`${fileRel}: missing step token ${JSON.stringify(token)}`);
        continue;
      }
      if (idx < last) {
        errors.push(`${fileRel}: step order error around ${JSON.stringify(token)}`);
      }
      last = idx;
    }
  }
  if (/\t/.test(text)) {
    warnings.push(`${fileRel}: contains tab characters (prefer spaces in GitHub Actions YAML)`);
  }
}

lintWorkflow(".github/workflows/ios-release.yml", {
  requireDispatch: true,
  requireReleaseSecrets: true,
  expectedOrder: [
    "actions/checkout@v4",
    "actions/setup-node@v4",
    "npm ci",
    "Write GoogleService-Info.plist from secret",
    "scripts/build-firebase-web-config.mjs",
    "npm run build",
    "npx cap sync ios",
    "scripts/apply-google-signin-ios.mjs",
    "xcodebuild archive",
    "xcodebuild -exportArchive",
    "altool --upload-app",
  ],
});

lintWorkflow(".github/workflows/ios-simulator-build.yml", {
  requireDispatch: true,
  requireReleaseSecrets: false,
  expectedOrder: [
    "actions/checkout@v4",
    "actions/setup-node@v4",
    "npm ci",
    "npm run build",
    "npx cap sync ios",
    "CODE_SIGNING_ALLOWED=NO",
  ],
});

if (exists(".github/workflows/ios-release.yml")) {
  const release = read(".github/workflows/ios-release.yml");
  if (!release.includes(EXPECTED_PROJECT)) {
    errors.push("ios-release.yml does not verify Firebase project id in the Vite bundle");
  }
  if (!release.includes("node-version: \"22\"") && !release.includes("node-version: '22'")) {
    errors.push("ios-release.yml Node version is not 22");
  }
}

if (exists("ios/App/App.xcodeproj/project.pbxproj")) {
  const pbx = read("ios/App/App.xcodeproj/project.pbxproj");
  if (!pbx.includes(`PRODUCT_BUNDLE_IDENTIFIER = ${EXPECTED_BUNDLE};`)) {
    errors.push(`App pbxproj bundle id is not ${EXPECTED_BUNDLE}`);
  }
  if (!/CURRENT_PROJECT_VERSION = \d+;/.test(pbx)) {
    errors.push("App pbxproj missing CURRENT_PROJECT_VERSION");
  }
  if (!/MARKETING_VERSION = /.test(pbx)) {
    errors.push("App pbxproj missing MARKETING_VERSION");
  }
  warnings.push(
    "CFBundleVersion (CURRENT_PROJECT_VERSION) is static in pbxproj. If that build already exists on App Store Connect, increment it before the next TestFlight upload.",
  );
}

const git = spawnSync("git", ["-C", ROOT, "ls-files", "-z"], {
  encoding: "buffer",
  maxBuffer: 32 * 1024 * 1024,
});

if (git.status !== 0) {
  errors.push("git ls-files failed (cannot audit tracked secrets)");
} else {
  const tracked = git.stdout
    .toString("utf8")
    .split("\0")
    .filter(Boolean)
    .map((p) => p.replace(/\\/g, "/"));

  const forbidden = [];
  let functionsNm = 0;
  for (const file of tracked) {
    if (file.startsWith("functions/node_modules/") || file === "functions/node_modules") {
      functionsNm += 1;
      continue;
    }
    const base = file.split("/").pop() || file;
    if (
      base === "GoogleService-Info.plist" ||
      file.endsWith("/GoogleService-Info.plist") ||
      base === ".env.local" ||
      base === ".env" ||
      /\.p8$/i.test(base) ||
      /firebase-adminsdk/i.test(base) ||
      /serviceAccount/i.test(file) ||
      /service-account/i.test(file) ||
      base === "credentials.json" ||
      base === "google-services.json"
    ) {
      forbidden.push(file);
    }
  }

  if (forbidden.length) {
    errors.push(`secret-like files are git-tracked: ${forbidden.join(", ")}`);
  }

  if (!tracked.includes("storage.rules")) {
    warnings.push(
      "storage.rules exists on disk but is not git-tracked. Add it before commit/push so clones can deploy Storage rules.",
    );
  }

  if (functionsNm > 0) {
    warnings.push(
      `functions/node_modules is git-tracked (${functionsNm} paths). Do not stage working-tree changes to it.`,
    );
  }
}

if (exists(".gitignore")) {
  const gi = read(".gitignore");
  if (!gi.includes("GoogleService-Info.plist")) {
    errors.push(".gitignore does not mention GoogleService-Info.plist");
  }
  if (!gi.includes(".env")) {
    errors.push(".gitignore does not mention .env");
  }
}

for (const msg of warnings) console.log(`WARN: ${msg}`);
for (const msg of errors) console.error(`BLOCKER: ${msg}`);

if (errors.length) {
  console.error(`release-preflight: ${errors.length} blocker(s)`);
  process.exit(1);
}

console.log("release-preflight: ready");
process.exit(0);
