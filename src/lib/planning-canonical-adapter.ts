/**
 * Read-only Planning view of the canonical document.
 * Does not write UserDefaults and does not replace an existing document.
 */
import {
  deleteLevel,
  effectiveItems,
  emptyDocument,
  setCompleted,
  setEventCompletion,
  type CanonicalDocument,
  type EffectiveItem,
  type PlanningLevel,
} from "./canonical-planning-foundation";

export interface NativePlanningCandidate {
  id: string;
  kind: "task" | "event";
  origin: PlanningLevel;
  originPeriodKey: string;
  title: string;
  isSample?: boolean;
  completed?: boolean;
  parentID?: string;
  /** Native Plan document. Convertible when every bullet is at most one level deep. */
  planDocument?: boolean;
  planBullets?: { id: string; parentID?: string }[];
  /** Native Postpone Box row. Convertible when logicalID is present. */
  postponeBox?: boolean;
  logicalID?: string;
  originPeriodKeyForBox?: string;
}

export interface HandoffPreview {
  samplesExcluded: number;
  collisions: number;
  /** Rows that cannot be stored without dropping user content. */
  blocked: number;
  ready: number;
  writes: 0;
  /** This batch can be stored. It does not mean live Planning is safe to switch. */
  batchConvertible: boolean;
  activationAllowed: boolean;
  activationBlockers: string[];
}

export const LIVE_ACTIVATION_BLOCKERS = [
  "postpone-restore-creates-a-new-node",
  "latest-reflection-remains-editable",
] as const;

/** Classifies in-memory Planning rows. Does not mutate the document. */
export function previewNativeHandoff(document: CanonicalDocument, rows: NativePlanningCandidate[]): HandoffPreview {
  const before = JSON.stringify(document);
  let samplesExcluded = 0;
  let collisions = 0;
  let blocked = 0;
  let ready = 0;
  for (const row of rows) {
    if (row.isSample) {
      samplesExcluded += 1;
      continue;
    }
    if (row.postponeBox && !row.logicalID) {
      blocked += 1;
      continue;
    }
    if (row.planDocument) {
      const bullets = row.planBullets ?? [];
      const tooDeep = bullets.some((bullet) => {
        const parent = bullets.find((item) => item.id === bullet.parentID);
        return Boolean(bullet.parentID && (!parent || parent.parentID));
      });
      if (bullets.length === 0 || tooDeep) {
        blocked += 1;
        continue;
      }
    }
    const taken = row.planDocument
      ? document.plans.some((plan) => plan.id === row.id)
      : row.postponeBox
      ? document.postponeEntries.some((entry) => entry.id === row.id || entry.logicalID === row.logicalID)
      : document.payloads.some((payload) => payload.id === row.id || payload.legacyWebID === row.id);
    if (taken) collisions += 1;
    else ready += 1;
  }
  if (JSON.stringify(document) !== before) throw new Error("preview mutated the document");
  return {
    samplesExcluded,
    collisions,
    blocked,
    ready,
    writes: 0,
    batchConvertible: blocked === 0,
    activationAllowed: false,
    activationBlockers: [...LIVE_ACTIVATION_BLOCKERS],
  };
}

export function effectivePeriod(document: CanonicalDocument, level: PlanningLevel, key: string): EffectiveItem[] {
  return effectiveItems(document, level, key);
}

export function deleteAppearance(document: CanonicalDocument, logicalID: string, level: PlanningLevel, key: string): void {
  deleteLevel(document, logicalID, level, key);
}

export function completeTask(document: CanonicalDocument, logicalID: string, completed: boolean): void {
  setCompleted(document, logicalID, completed);
}

export function completeEventDay(document: CanonicalDocument, logicalID: string, date: string, completed: boolean): boolean {
  return setEventCompletion(document, logicalID, date, completed);
}

export function emptyCanonical(): CanonicalDocument {
  return emptyDocument();
}
