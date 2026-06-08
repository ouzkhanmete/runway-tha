import { useCallback, useEffect, useState } from "react";

/** Pure: read a single param from a URL search string like `"?appId=1&w=48"`. */
export function readParam(search: string, key: string): string | undefined {
  return new URLSearchParams(search).get(key) ?? undefined;
}

/**
 * Pure: build the next relative URL (`pathname` + search) that sets `key` to
 * `value`. An `undefined`/empty value removes the param entirely.
 */
export function buildParamUrl(
  search: string,
  pathname: string,
  key: string,
  value: string | undefined,
): string {
  const params = new URLSearchParams(search);
  if (value === undefined || value === "") params.delete(key);
  else params.set(key, value);
  const qs = params.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}

/**
 * Two-way binds a single URL query parameter to React state, making the URL the
 * source of truth. The value is read on mount and on back/forward navigation
 * (`popstate`); writing pushes (or replaces) a history entry so the value survives
 * a page refresh and is shareable. Pass `{ replace: true }` to avoid adding a
 * history entry (e.g. when applying a default rather than a user choice).
 */
export function useQueryParam(
  key: string,
): [string | undefined, (value: string | undefined, opts?: { replace?: boolean }) => void] {
  const read = useCallback(() => readParam(window.location.search, key), [key]);

  const [value, setValue] = useState<string | undefined>(read);

  useEffect(() => {
    const onPop = () => setValue(read());
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [read]);

  const set = useCallback(
    (next: string | undefined, opts?: { replace?: boolean }) => {
      const url = buildParamUrl(window.location.search, window.location.pathname, key, next);
      if (opts?.replace) window.history.replaceState(null, "", url);
      else window.history.pushState(null, "", url);
      setValue(next);
    },
    [key],
  );

  return [value, set];
}
