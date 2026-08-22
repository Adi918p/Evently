import { useEffect, useState } from "react";

/**
 * Subscribes to a media query and re-renders when it changes.
 *
 * For anything CSS can express, use CSS - a `hidden md:block` costs nothing and
 * needs no listener. This is for the cases where a breakpoint has to change what
 * React renders, not just how it looks: a component that binds scroll listeners,
 * measures a node, or drives a transform has to actually stop doing that below
 * the breakpoint, and a class name cannot switch that off.
 *
 * The initialiser reads the query rather than defaulting to false, so the first
 * paint is already correct instead of matching and then correcting itself. The
 * effect re-reads it too, because a change between render and effect would
 * otherwise be missed.
 *
 * `window.matchMedia` is guarded for the same reason it is in the WebGL probe:
 * this module gets imported by code that may run before a DOM exists.
 */
export function useMediaQuery(query) {
  const [matches, setMatches] = useState(() => {
    if (typeof window === "undefined" || !window.matchMedia) return false;
    return window.matchMedia(query).matches;
  });

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return undefined;
    const mql = window.matchMedia(query);
    const onChange = (event) => setMatches(event.matches);
    setMatches(mql.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);

  return matches;
}

export default useMediaQuery;
