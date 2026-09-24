/**
 * V3 persistence + schema-version migration chain.
 *
 * Only this module touches `localStorage` for V3. Everything else goes through
 * `repository.ts`.
 *
 * Existing UI is untouched in this phase: nothing here reads or writes the
 * legacy keys except through the read-only migration layer.
 */

import { hasLegacyData, migrateLegacyInto, readLegacySnapshot } from "./legacy-migration";
import { emptyData, hydrateQuickMemoConversionMetadata, normalizeData } from "./schema";
import { applySidecarSettingsOnce } from "./settings-io";
import { SCHEMA_VERSION, STORAGE_KEY, type EssencesDataV3 } from "./types";

/**
 * Forward migrations. A step at key N upgrades a version-N payload to N+1.
 * V3 is the first versioned schema, so the chain is empty until v4 exists.
 */
export const SCHEMA_MIGRATIONS: Record<number, (data: Record<string, unknown>) => Record<string, unknown>> =
  {};

export type SchemaUpgradeResult =
  | { ok: true; data: Record<string, unknown>; from: number; to: number }
  | { ok: false; reason: "missing-step" | "future-version"; from: number };

function versionOf(raw: unknown): number {
  const v = Number((raw as { schemaVersion?: unknown })?.schemaVersion);
  return Number.isInteger(v) && v > 0 ? v : 0;
}

/**
 * Runs the migration chain up to `SCHEMA_VERSION`.
 *
 * A payload from a NEWER schema is never downgraded or discarded — the caller
 * keeps the raw data untouched so a rollback cannot destroy user data.
 */
export function upgradeSchema(raw: unknown): SchemaUpgradeResult {
  const from = versionOf(raw);
  if (from > SCHEMA_VERSION) return { ok: false, reason: "future-version", from };

  let data = (raw ?? {}) as Record<string, unknown>;
  let version = from === 0 ? SCHEMA_VERSION : from;

  while (version < SCHEMA_VERSION) {
    const step = SCHEMA_MIGRATIONS[version];
    if (!step) return { ok: false, reason: "missing-step", from };
    data = step(data);
    version += 1;
    data.schemaVersion = version;
  }

  return { ok: true, data, from, to: SCHEMA_VERSION };
}

function readRaw(): unknown {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeRaw(data: EssencesDataV3): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    /* quota or private-mode failure — in-memory state stays authoritative */
  }
}

/** In-process cache so repeated reads do not re-parse the whole payload. */
let cache: EssencesDataV3 | null = null;
/** One idempotent leftover-legacy merge per JS session (not a new migration). */
let sessionLegacyCatchup = false;

type AfterSave = (prev: EssencesDataV3 | null, next: EssencesDataV3) => void;
let afterSave: AfterSave | null = null;

/** Cloud sync hook. Domain code must not call Firestore from here. */
export function setEssencesDataAfterSave(listener: AfterSave | null): void {
  afterSave = listener;
}

/**
 * Loads V3 data, running the one-time legacy import on first use.
 * Returns a normalized object even when storage is empty or corrupt.
 */
export function loadEssencesData(): EssencesDataV3 {
  if (cache) return cache;

  const raw = readRaw();

  if (raw === null) {
    const fresh = emptyData();
    if (hasLegacyData()) migrateLegacyInto(fresh, readLegacySnapshot());
    applySidecarSettingsOnce(fresh);
    writeRaw(fresh);
    cache = fresh;
    sessionLegacyCatchup = true;
    return fresh;
  }

  const upgraded = upgradeSchema(raw);
  if (!upgraded.ok) {
    // Newer or unmigratable payload: serve a normalized view, do NOT overwrite.
    cache = normalizeData(raw);
    return cache;
  }

  const data = normalizeData(upgraded.data);
  let dirty = upgraded.from !== SCHEMA_VERSION;

  // V3 created before the ToDo cutover may have no `legacyImport` record.
  // One catch-up merge; deterministic ids prevent duplicates.
  if (!data.legacyImport && hasLegacyData()) {
    migrateLegacyInto(data, readLegacySnapshot());
    dirty = true;
  }

  if (applySidecarSettingsOnce(data)) dirty = true;
  if (hydrateQuickMemoConversionMetadata(data)) dirty = true;
  if (dirty) writeRaw(data);

  cache = data;
  return data;
}

export function saveEssencesData(data: EssencesDataV3): EssencesDataV3 {
  const prev = cache;
  const normalized = normalizeData(data);
  applySidecarSettingsOnce(normalized);
  hydrateQuickMemoConversionMetadata(normalized);
  writeRaw(normalized);
  cache = normalized;
  afterSave?.(prev, normalized);
  return normalized;
}

/**
 * Read-modify-write helper. The mutator receives a structural clone, so a throw
 * mid-update cannot leave partially mutated state in the cache.
 */
export function updateEssencesData<T>(
  mutator: (data: EssencesDataV3) => T,
): { data: EssencesDataV3; result: T } {
  const draft = JSON.parse(JSON.stringify(loadEssencesData())) as EssencesDataV3;
  const result = mutator(draft);
  return { data: saveEssencesData(draft), result };
}

/** Drops the in-process cache. Used by tests and after an external import. */
export function resetEssencesDataCache(): void {
  cache = null;
  sessionLegacyCatchup = false;
}

/**
 * Re-runs the legacy import against current V3 data. Idempotent: deterministic
 * legacy ids mean nothing is duplicated.
 */
export function runLegacyImport(): EssencesDataV3 {
  const { data } = updateEssencesData((draft) => {
    migrateLegacyInto(draft, readLegacySnapshot());
  });
  return data;
}

/**
 * Once per JS session, merge any leftover `mindful-todo-data` / reusable
 * writes that landed after V3 was first created (e.g. ToDo use during 3A).
 * Does not delete legacy keys. Subsequent calls in the same session no-op.
 */
export function ensureLegacyCatchup(): EssencesDataV3 {
  const data = loadEssencesData();
  if (sessionLegacyCatchup) return data;
  sessionLegacyCatchup = true;
  if (!hasLegacyData()) return data;
  return runLegacyImport();
}
