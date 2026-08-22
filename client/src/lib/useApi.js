import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Data fetching for pages.
 *
 * Every list/detail page needs the same four things: data, a loading flag, an
 * error, and a retry. Writing that by hand per page is how pages end up with
 * inconsistent empty states and setState-after-unmount warnings, so it lives
 * here once.
 *
 * `fetcher` receives an AbortSignal. Pass it straight to the api client - every
 * GET in lib/api.js accepts one - so a fast navigation cancels the request
 * instead of resolving into an unmounted component.
 *
 * `deps` behaves like a useEffect dependency array. Change it and the request
 * re-runs.
 */
export function useApi(fetcher, deps = [], { enabled = true } = {}) {
  const [state, setState] = useState({
    data: null,
    error: null,
    loading: enabled,
  });

  // `nonce` gives callers a manual retry without changing the real deps.
  const [nonce, setNonce] = useState(0);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  useEffect(() => {
    if (!enabled) {
      setState({ data: null, error: null, loading: false });
      return undefined;
    }

    const controller = new AbortController();
    let active = true;

    setState((prev) => ({ ...prev, loading: true, error: null }));

    Promise.resolve()
      .then(() => fetcherRef.current(controller.signal))
      .then((data) => {
        if (active) setState({ data, error: null, loading: false });
      })
      .catch((error) => {
        if (!active || error?.name === "AbortError") return;
        setState({ data: null, error, loading: false });
      });

    return () => {
      active = false;
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, nonce, ...deps]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  /** Lets a page patch fetched data after a mutation without a full refetch. */
  const setData = useCallback(
    (updater) =>
      setState((prev) => ({
        ...prev,
        data: typeof updater === "function" ? updater(prev.data) : updater,
      })),
    []
  );

  return { ...state, reload, setData };
}

/**
 * One-shot async action (submit, delete, approve).
 *
 * Returns a `run` that swallows nothing - it rethrows so the caller can still
 * branch - but tracks `pending` for button loading states and keeps the last
 * error for inline display.
 */
export function useAction(action) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const run = useCallback(
    async (...args) => {
      setPending(true);
      setError(null);
      try {
        const result = await action(...args);
        return result;
      } catch (err) {
        if (mounted.current) setError(err);
        throw err;
      } finally {
        if (mounted.current) setPending(false);
      }
    },
    [action]
  );

  return { run, pending, error, clearError: useCallback(() => setError(null), []) };
}
