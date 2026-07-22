/**
 * Runs ios/scripts/setup_widget.rb with cwd=ios/App (required by the script).
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cwd = path.join(root, "ios", "App");
const script = path.join(root, "ios", "scripts", "setup_widget.rb");

const result = spawnSync("ruby", [script], { cwd, stdio: "inherit", shell: true });
if (result.status !== 0) {
  process.exit(result.status ?? 1);
}
