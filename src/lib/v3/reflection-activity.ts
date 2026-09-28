/**
 * Activity shown at the start of a Reflection.
 *
 * Every number is derived from tasks, challenge assignments, the point
 * ledger, and completed reflection sessions. Nothing here is stored as a
 * second stats record.
 */

import { addDays, eachLocalDate, toLocalDate, type LocalDate } from "./local-date";
import { isListedTaskStatus } from "./plan-rules";
import type { EssencesDataV3, TaskItem } from "./types";

export interface ReflectionActivity {
  /** 0–100. Average of the ToDo rate and the challenge rate when both exist. */
  score: number;
  /** Average per-day ToDo completion. Days with no listed tasks are skipped. */
  todoRate: number;
  /** Average per-day challenge completion. Null when the period has no assignments. */
  challengeRate: number | null;
  streak: number;
  reflectionsCompleted: number;
  /** Positive ledger amounts in the period, excluding this session's own award. */
  pointsEarned: number;
}

/**
 * Reflection award. 100 points of score → 10 ledger points.
 * Rounded to an integer, the same shape as the rest of the ledger.
 */
export function reflectionPointsForScore(score: number): number {
  const clamped = Math.min(100, Math.max(0, score));
  return Math.round((clamped / 100) * 10);
}

function listedOn(data: EssencesDataV3, date: LocalDate): TaskItem[] {
  return Object.values(data.tasks).filter(
    (task) => task.date === date && isListedTaskStatus(task.status) && !task.inPostponeBox,
  );
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function streakEnding(data: EssencesDataV3, end: LocalDate): number {
  let streak = 0;
  for (let i = 0; i < 365; i += 1) {
    const key = addDays(end, -i);
    const tasks = listedOn(data, key);
    const complete = tasks.length > 0 && tasks.every((task) => task.status === "completed");
    if (complete) streak += 1;
    else if (i === 0) continue;
    else break;
  }
  return streak;
}

export function reflectionActivityFromData(
  data: EssencesDataV3,
  from: LocalDate,
  to: LocalDate,
  excludeSessionId?: string,
): ReflectionActivity {
  const todoRates: number[] = [];
  for (const day of eachLocalDate(from, to)) {
    const tasks = listedOn(data, day);
    if (tasks.length === 0) continue;
    const done = tasks.filter((task) => task.status === "completed").length;
    todoRates.push(Math.round((done / tasks.length) * 100));
  }

  const challengeByDay = new Map<LocalDate, { total: number; done: number }>();
  for (const assignment of Object.values(data.dailyChallenges)) {
    if (assignment.date < from || assignment.date > to) continue;
    const row = challengeByDay.get(assignment.date) ?? { total: 0, done: 0 };
    row.total += 1;
    if (assignment.status === "completed") row.done += 1;
    challengeByDay.set(assignment.date, row);
  }
  const challengeRates = [...challengeByDay.values()].map((row) =>
    Math.round((row.done / row.total) * 100),
  );

  const todoRate = average(todoRates);
  const challengeRate = challengeRates.length === 0 ? null : average(challengeRates);
  const parts: number[] = [];
  if (todoRates.length > 0) parts.push(todoRate);
  if (challengeRate != null) parts.push(challengeRate);
  const score = parts.length === 0 ? 0 : average(parts);

  let reflectionsCompleted = 0;
  for (const session of Object.values(data.reflections)) {
    if (session.status !== "completed" || !session.completedAt) continue;
    if (excludeSessionId && session.id === excludeSessionId) continue;
    const day = toLocalDate(new Date(session.completedAt));
    if (day >= from && day <= to) reflectionsCompleted += 1;
  }

  let pointsEarned = 0;
  for (const tx of Object.values(data.pointTransactions)) {
    if (tx.amount <= 0) continue;
    if (excludeSessionId && tx.reason === "reflection" && tx.sourceId === excludeSessionId) continue;
    const day = toLocalDate(new Date(tx.createdAt));
    if (day >= from && day <= to) pointsEarned += tx.amount;
  }

  return {
    score,
    todoRate,
    challengeRate,
    streak: streakEnding(data, to),
    reflectionsCompleted,
    pointsEarned,
  };
}
