/**
 * Classifies raw localStorage strings from the legacy Capacitor origin.
 * Does not read WebKit, write storage, or touch the canonical document.
 *
 * Origin used by the current Capacitor config (no server.hostname / iosScheme):
 * capacitor://localhost. Device presence of that website data is not proven here.
 */

export const LEGACY_V3_KEY = "essences-app-data-v3";
export const LEGACY_CALENDAR_EVENTS_KEY = "calendar-events";
export const LEGACY_CLOUD_OWNER_KEY = "essences-cloud-owner-v1";
export const LEGACY_ORIGIN = "capacitor://localhost";

export type LegacyReadStatus =
  | "availableWithData"
  | "accessibleButEmpty"
  | "inaccessibleOrigin"
  | "missingLegacyAssets"
  | "malformedData"
  | "unsupportedFormat"
  | "readFailed";

/** Original legacy fields kept verbatim. No timezone conversion. */
export interface LegacyCalendarCandidate {
  source: "v3" | "calendar-events";
  id: string;
  title: string;
  color?: string;
  location?: string;
  note?: string;
  startAt?: string;
  endAt?: string;
  date?: string;
  endDate?: string;
  startTime?: string;
  endTime?: string;
  allDay?: boolean;
  reminders?: unknown;
  recurrence?: unknown;
  excludeDates?: unknown;
  repeatEndDate?: string;
  recurrenceMasterId?: string;
  recurrenceDate?: string;
  liveActivity?: boolean;
  liveActivityLead?: string;
}

export interface LegacyClassification {
  status: LegacyReadStatus;
  records: LegacyCalendarCandidate[];
  candidateCount: number;
  malformedCount: number;
  duplicateCount: number;
  /** Present keys that were not calendar event collections. */
  ignoredCollections: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringField(row: Record<string, unknown>, key: string): string | undefined {
  return typeof row[key] === "string" ? row[key] : undefined;
}

function fromV3(row: Record<string, unknown>): LegacyCalendarCandidate | null {
  if (row.isSample === true) return null;
  const id = stringField(row, "id");
  const title = stringField(row, "title");
  if (!id || title === undefined) return null;
  return {
    source: "v3",
    id,
    title,
    color: stringField(row, "color"),
    location: stringField(row, "location"),
    note: stringField(row, "note"),
    startAt: stringField(row, "startAt"),
    endAt: stringField(row, "endAt"),
    allDay: typeof row.allDay === "boolean" ? row.allDay : undefined,
    reminders: row.reminders,
    recurrence: row.recurrence,
    excludeDates: row.excludeDates,
    repeatEndDate: stringField(row, "repeatEndDate"),
    recurrenceMasterId: stringField(row, "recurrenceMasterId"),
    recurrenceDate: stringField(row, "recurrenceDate"),
    liveActivity: typeof row.liveActivity === "boolean" ? row.liveActivity : undefined,
    liveActivityLead: stringField(row, "liveActivityLead"),
  };
}

function fromCalendarEvents(row: Record<string, unknown>): LegacyCalendarCandidate | null {
  if (row.isSample === true) return null;
  const id = stringField(row, "id");
  const title = stringField(row, "title");
  if (!id || title === undefined) return null;
  return {
    source: "calendar-events",
    id,
    title,
    color: stringField(row, "color"),
    location: stringField(row, "location"),
    note: stringField(row, "notes"),
    date: stringField(row, "date"),
    endDate: stringField(row, "endDate"),
    startTime: stringField(row, "startTime"),
    endTime: stringField(row, "endTime"),
    allDay: typeof row.allDay === "boolean" ? row.allDay : undefined,
    reminders: row.reminders ?? row.reminder,
    recurrence: row.repeat,
    excludeDates: row.excludeDates,
    repeatEndDate: stringField(row, "repeatEndDate"),
    recurrenceMasterId: stringField(row, "recurrenceMasterId"),
    recurrenceDate: stringField(row, "recurrenceDate"),
    liveActivity: typeof row.liveActivity === "boolean" ? row.liveActivity : undefined,
    liveActivityLead: stringField(row, "liveActivityLead"),
  };
}

/**
 * V3 `events` wins on the same id. `calendar-events` supplies ids V3 does not have.
 * Tasks, plans, and notes inside the V3 document are counted as ignored, not events.
 */
export function classifyLegacyStorage(v3Raw: string | null, calendarEventsRaw: string | null): LegacyClassification {
  if (v3Raw === null && calendarEventsRaw === null) {
    return { status: "accessibleButEmpty", records: [], candidateCount: 0, malformedCount: 0, duplicateCount: 0, ignoredCollections: [] };
  }

  let malformed = 0;
  let unsupported = false;
  const records: LegacyCalendarCandidate[] = [];
  const ignored: string[] = [];
  const seen = new Set<string>();
  let duplicates = 0;

  if (v3Raw !== null) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(v3Raw);
    } catch {
      parsed = undefined;
      malformed += 1;
    }
    if (parsed !== undefined) {
      if (!isRecord(parsed) || parsed.schemaVersion !== 3) unsupported = true;
      else {
        for (const key of ["plans", "tasks", "notes", "routines", "collections"]) {
          if (key in parsed) ignored.push(key);
        }
        const events = parsed.events;
        if (events !== undefined && !isRecord(events)) malformed += 1;
        else if (isRecord(events)) {
          for (const row of Object.values(events)) {
            if (!isRecord(row)) {
              malformed += 1;
              continue;
            }
            const candidate = fromV3(row);
            if (!candidate) {
              if (row.isSample !== true) malformed += 1;
              continue;
            }
            if (seen.has(candidate.id)) duplicates += 1;
            else {
              seen.add(candidate.id);
              records.push(candidate);
            }
          }
        }
      }
    }
  }

  if (calendarEventsRaw !== null) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(calendarEventsRaw);
    } catch {
      parsed = undefined;
      malformed += 1;
    }
    if (parsed !== undefined) {
      if (!Array.isArray(parsed)) unsupported = true;
      else {
        for (const row of parsed) {
          if (!isRecord(row)) {
            malformed += 1;
            continue;
          }
          const candidate = fromCalendarEvents(row);
          if (!candidate) {
            if (row.isSample !== true) malformed += 1;
            continue;
          }
          if (seen.has(candidate.id)) {
            duplicates += 1;
            continue;
          }
          seen.add(candidate.id);
          records.push(candidate);
        }
      }
    }
  }

  const status: LegacyReadStatus = malformed > 0
    ? "malformedData"
    : unsupported
      ? "unsupportedFormat"
      : records.length > 0
        ? "availableWithData"
        : "accessibleButEmpty";

  return {
    status,
    records,
    candidateCount: records.length,
    malformedCount: malformed,
    duplicateCount: duplicates,
    ignoredCollections: ignored,
  };
}

export type LegacyOwnerStatus =
  | "matchingOwner"
  | "differentOwner"
  | "missingOwner"
  | "unauthenticated"
  | "invalidOwnerMarker";

/** Compares the stored marker with the signed-in uid. Does not return either value. */
export function classifyLegacyOwner(marker: string | null, signedInUid: string | null): LegacyOwnerStatus {
  if (!signedInUid || !signedInUid.trim()) return "unauthenticated";
  if (marker === null) return "missingOwner";
  const trimmed = marker.trim();
  if (!trimmed) return "invalidOwnerMarker";
  return trimmed === signedInUid ? "matchingOwner" : "differentOwner";
}

export interface LegacyDiagnosticReport {
  status: LegacyReadStatus;
  v3Present: boolean;
  calendarEventsPresent: boolean;
  candidateCount: number;
  duplicateCount: number;
  malformedCount: number;
  owner: LegacyOwnerStatus;
  eligibleForFutureImport: boolean;
  importExecuted: false;
}

export function legacyDiagnosticReport(
  v3Raw: string | null,
  calendarEventsRaw: string | null,
  ownerMarker: string | null,
  signedInUid: string | null,
): LegacyDiagnosticReport {
  const classified = classifyLegacyStorage(v3Raw, calendarEventsRaw);
  const owner = classifyLegacyOwner(ownerMarker, signedInUid);
  return {
    status: classified.status,
    v3Present: v3Raw !== null,
    calendarEventsPresent: calendarEventsRaw !== null,
    candidateCount: classified.candidateCount,
    duplicateCount: classified.duplicateCount,
    malformedCount: classified.malformedCount,
    owner,
    eligibleForFutureImport: classified.status === "availableWithData" && owner === "matchingOwner",
    importExecuted: false,
  };
}
