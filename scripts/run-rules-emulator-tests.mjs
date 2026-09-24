/**
 * Runs Firestore + Storage security-rules tests against local emulators.
 * Requires Java + the Firebase CLI (`firebase`). Not used by default `npm test`.
 */
import { spawnSync } from "node:child_process";

const command =
  'firebase emulators:exec --only firestore,storage --project demo-essences-rules "npx vitest run src/lib/firebase/phase12-rules-emulator.test.ts"';

const result = spawnSync(command, { stdio: "inherit", shell: true });

process.exit(result.status === null ? 1 : result.status);
