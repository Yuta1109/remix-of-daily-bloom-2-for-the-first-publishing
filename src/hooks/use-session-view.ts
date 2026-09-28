import { useCallback, useState, type SetStateAction } from "react";
import {
  recallSessionView,
  rememberSessionView,
  type SessionArea,
} from "@/lib/session-nav";

/**
 * useState that survives leaving the route, for this session only.
 * A saved value that fails `accept` is ignored so a deleted record cannot
 * reopen a broken screen.
 */
export function useSessionView<T>(
  area: SessionArea,
  key: string,
  initial: T,
  accept?: (value: T) => boolean,
): [T, (action: SetStateAction<T>) => void] {
  const [value, setValue] = useState<T>(() => {
    const saved = recallSessionView<T>(area, key);
    if (saved === undefined) return initial;
    if (accept && !accept(saved)) return initial;
    return saved;
  });

  const set = useCallback((action: SetStateAction<T>) => {
    setValue((prev) => {
      const next = typeof action === "function" ? (action as (current: T) => T)(prev) : action;
      rememberSessionView(area, key, next);
      return next;
    });
  }, [area, key]);

  return [value, set];
}
