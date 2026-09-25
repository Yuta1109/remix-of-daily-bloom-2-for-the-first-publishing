/**
 * PointTransaction series for Progress graphs.
 *
 * Balance is never stored. Daily earned and cumulative running totals are
 * derived from the ledger using local calendar dates of `createdAt`.
 */

import { eachLocalDate, toLocalDate, type LocalDate } from "./local-date";
import type { PointTransaction } from "./types";

export interface DailyPointPoint {
  date: LocalDate;
  earned: number;
  cumulative: number;
}

export function localDateOfTransaction(tx: PointTransaction): LocalDate {
  return toLocalDate(new Date(tx.createdAt));
}

export function pointSeriesFromTransactions(
  transactions: Iterable<PointTransaction>,
  today: LocalDate,
): DailyPointPoint[] {
  const earnedByDate = new Map<LocalDate, number>();
  let earliest: LocalDate | undefined;
  for (const tx of transactions) {
    const date = localDateOfTransaction(tx);
    earnedByDate.set(date, (earnedByDate.get(date) ?? 0) + tx.amount);
    if (!earliest || date < earliest) earliest = date;
  }
  if (!earliest) return [];
  const start = earliest < today ? earliest : today;
  const end = today < earliest ? earliest : today;
  let cumulative = 0;
  return eachLocalDate(start, end).map((date) => {
    const earned = earnedByDate.get(date) ?? 0;
    cumulative += earned;
    return { date, earned, cumulative };
  });
}
