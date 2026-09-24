/**
 * Pure challenge auto-complete rules.
 *
 * Evaluates a `ChallengeDefinition.condition` against V3 snapshots. The UI
 * never calls this directly; `repository.evaluateDailyChallenges` / activity
 * writes reuse it so completion stays idempotent and recomputable.
 */

import { todayLocalDate, type LocalDate } from "./local-date";
import { isListedTaskStatus } from "./plan-rules";
import type { ChallengeDefinition } from "./challenge-definitions";
import type {
  ActivityRecord,
  ActivityType,
  ReflectionSession,
  RoutineCompletion,
  RoutineItem,
  TaskItem,
} from "./types";

export interface ChallengeEvalContext {
  activities: ActivityRecord[];
  tasks: TaskItem[];
  routines: RoutineItem[];
  routineCompletions: RoutineCompletion[];
  reflections: ReflectionSession[];
  routineOccursOn: (routine: RoutineItem, date: LocalDate) => boolean;
}

export function countActivitiesOn(
  activities: ActivityRecord[],
  type: ActivityType,
  date: LocalDate,
): number {
  let count = 0;
  for (const record of activities) {
    if (record.type === type && record.localDate === date) count += 1;
  }
  return count;
}

export function listedTasksOn(tasks: TaskItem[], date: LocalDate): TaskItem[] {
  return tasks.filter((t) => t.date === date && isListedTaskStatus(t.status));
}

export function taskCompletionPercent(tasks: TaskItem[], date: LocalDate): number {
  const listed = listedTasksOn(tasks, date);
  if (listed.length === 0) return 0;
  const done = listed.filter((t) => t.status === "completed").length;
  return Math.round((done / listed.length) * 100);
}

export function isChallengeSatisfied(
  definition: ChallengeDefinition,
  date: LocalDate,
  ctx: ChallengeEvalContext,
): boolean {
  const condition = definition.condition;
  switch (condition.type) {
    case "activityCount":
      return countActivitiesOn(ctx.activities, condition.activity, date) >= condition.count;
    case "routineAllCompleted": {
      const scheduled = ctx.routines.filter((r) => ctx.routineOccursOn(r, date));
      if (scheduled.length === 0) return false;
      const completions = ctx.routineCompletions.filter((c) => c.date === date);
      return scheduled.every((r) =>
        completions.some((c) => c.routineId === r.id && c.completed),
      );
    }
    case "reflectionCompleted":
      return ctx.reflections.some(
        (s) =>
          s.type === condition.reflection &&
          s.status === "completed" &&
          !!s.completedAt &&
          todayLocalDate(new Date(s.completedAt)) === date,
      );
    case "taskCompletionRate": {
      const listed = listedTasksOn(ctx.tasks, date);
      if (listed.length === 0) return false;
      return taskCompletionPercent(ctx.tasks, date) >= condition.percent;
    }
    case "dueTaskHandled": {
      const listed = listedTasksOn(ctx.tasks, date);
      return listed.some((t) => t.status === "completed");
    }
    case "none":
      return false;
    default:
      return false;
  }
}
