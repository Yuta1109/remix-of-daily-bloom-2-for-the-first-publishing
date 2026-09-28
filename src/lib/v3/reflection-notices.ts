/**
 * When a Reflection becomes available.
 *
 * This is notification timing only. It does not read or write
 * ReflectionSession.status, so a sent notice is never treated as a
 * completed reflection.
 */

import { addDays, addMonths, startOfMonth, todayLocalDate, type LocalDate } from "./local-date";
import {
  reflectionPeriod,
  scheduleAfterPeriod,
} from "./reflection";
import type { EssencesDataV3, ReflectionSession, ReflectionType } from "./types";

export const REFLECTION_NOTIF_ID_MIN = 60_000;
export const REFLECTION_NOTIF_ID_MAX = 69_999;

export interface ReflectionNotice {
  /** Stable for one availability instant. A new time is a different key. */
  key: string;
  id: number;
  at: Date;
  type: ReflectionType;
  title: string;
  body: string;
}

export function reflectionNoticeId(key: string): number {
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) hash = (hash * 33 + key.charCodeAt(i)) >>> 0;
  return REFLECTION_NOTIF_ID_MIN + (hash % 1_000);
}

function copyFor(type: ReflectionType, language: string): { title: string; body: string } {
  const ja = language !== "en";
  const title = ja ? "振り返り" : "Reflection";
  const body =
    type === "daily"
      ? ja
        ? "デイリーの振り返りができます"
        : "Daily reflection is ready"
      : type === "weekly"
        ? ja
          ? "ウィークリーの振り返りができます"
          : "Weekly reflection is ready"
        : type === "monthly"
          ? ja
            ? "マンスリーの振り返りができます"
            : "Monthly reflection is ready"
          : ja
            ? "フューチャーの振り返りができます"
            : "Future reflection is ready";
  return { title, body };
}

function sessionFor(
  data: EssencesDataV3,
  type: ReflectionType,
  periodStart: LocalDate,
): ReflectionSession | undefined {
  return Object.values(data.reflections).find(
    (session) => session.type === type && session.targetPeriodStart === periodStart,
  );
}

function noticeFor(
  data: EssencesDataV3,
  type: ReflectionType,
  anchor: LocalDate,
  now: Date,
): ReflectionNotice | null {
  const rule = data.settings.reflectionSchedule[type];
  if (!rule.enabled) return null;
  const period = reflectionPeriod(type, anchor, data.settings.weekStartsOn);
  const existing = sessionFor(data, type, period.start);
  if (existing && (existing.status === "completed" || existing.status === "skipped")) return null;
  const { scheduledAt } = scheduleAfterPeriod(type, period.start, period.end ?? period.start, rule);
  const at = new Date(scheduledAt);
  if (at.getTime() <= now.getTime()) return null;
  const key = `${type}:${period.start}:${scheduledAt}`;
  const copy = copyFor(type, data.settings.language);
  return { key, id: reflectionNoticeId(key), at, type, title: copy.title, body: copy.body };
}

/**
 * The next future availability for each type. Past instants are omitted so a
 * notice is not scheduled again after it was already due.
 */
export function planReflectionNotices(data: EssencesDataV3, now: Date = new Date()): ReflectionNotice[] {
  const today = todayLocalDate(now);
  const notices: ReflectionNotice[] = [];
  const daily =
    noticeFor(data, "daily", today, now) ?? noticeFor(data, "daily", addDays(today, 1), now);
  if (daily) notices.push(daily);

  const weekly = noticeFor(data, "weekly", today, now) ?? noticeFor(data, "weekly", addDays(today, 7), now);
  if (weekly) notices.push(weekly);

  const monthly =
    noticeFor(data, "monthly", today, now) ??
    noticeFor(data, "monthly", addMonths(startOfMonth(today), 1), now);
  if (monthly) notices.push(monthly);

  const year = Number(today.slice(0, 4));
  const future =
    noticeFor(data, "future", `${year}-01-01`, now) ??
    noticeFor(data, "future", `${year + 1}-01-01`, now);
  if (future) notices.push(future);

  const seen = new Set<string>();
  return notices.filter((notice) => {
    if (seen.has(notice.key)) return false;
    seen.add(notice.key);
    return true;
  });
}
