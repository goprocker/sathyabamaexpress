import { useCallback, useEffect, useState } from "react";

/** localStorage-backed state. Falls back to memory when storage is blocked. */
export function useStoredState<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = window.localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : initial;
    } catch {
      return initial;
    }
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* storage unavailable: keep in-memory value */
    }
  }, [key, value]);

  const update = useCallback((next: T | ((prev: T) => T)) => setValue(next), []);
  return [value, update] as const;
}
