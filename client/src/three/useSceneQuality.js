import { useEffect, useMemo, useState } from "react";
import { useReducedMotion } from "motion/react";
import { useMediaQuery } from "../lib/useMediaQuery";

/**
 * Decides how much scene the device can afford.
 *
 * The ambient WebGL layer is decoration, so it must never be the reason a page
 * feels slow. Phones, smaller/low-memory devices, data-saving and reduced-motion
 * sessions use the CSS backdrop. Eligible desktop showcase routes probe WebGL
 * only after the page has had time to paint and fetch its data.
 *
 * prefers-reduced-motion is read through Motion's hook so an OS change mid
 * session takes effect without a reload (reduced-motion rule).
 */

let webglSupport = null;

function detectWebgl() {
  if (webglSupport !== null) return webglSupport;
  if (typeof window === "undefined") return false;
  try {
    const canvas = document.createElement("canvas");
    const gl =
      canvas.getContext("webgl2") ||
      canvas.getContext("webgl") ||
      canvas.getContext("experimental-webgl");
    webglSupport = Boolean(gl);
    // Release the context immediately; we only wanted the answer.
    gl?.getExtension("WEBGL_lose_context")?.loseContext();
  } catch {
    webglSupport = false;
  }
  return webglSupport;
}

/** Wait through initial rendering, then ask for idle time before loading decoration. */
export function useDeferredMount(delay = 1000, enabled = true) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setReady(false);
    if (!enabled) return undefined;
    let idle;
    const timer = window.setTimeout(() => {
      if ("requestIdleCallback" in window) {
        idle = window.requestIdleCallback(() => setReady(true), { timeout: 2000 });
      } else setReady(true);
    }, delay);
    return () => {
      window.clearTimeout(timer);
      if (idle !== undefined) window.cancelIdleCallback(idle);
    };
  }, [delay, enabled]);

  return enabled && ready;
}

export function useSceneQuality(showcase = false) {
  const reduced = useReducedMotion();
  const coarse = useMediaQuery("(pointer: coarse)");
  const narrow = useMediaQuery("(max-width: 1023px)");
  const saveData =
    typeof navigator !== "undefined" && navigator.connection?.saveData === true;

  const cores = typeof navigator !== "undefined" ? navigator.hardwareConcurrency || 4 : 4;
  const memory = typeof navigator !== "undefined" ? navigator.deviceMemory ?? 4 : 4;
  const eligible = showcase && !reduced && !coarse && !narrow && !saveData && cores > 4 && memory > 4;
  const idle = useDeferredMount(1000, eligible);
  const [supported, setSupported] = useState(false);
  useEffect(() => {
    if (idle && eligible) setSupported(detectWebgl());
  }, [idle, eligible]);

  return useMemo(() => {
    const enabled = eligible && idle && supported;
    return {
      enabled,
      tier: enabled ? "high" : "none",
      reduced: Boolean(reduced),
      // A soft decorative scene does not need retina-sized render targets.
      dpr: [1, 1.25],
      particles: 450,
      shards: 12,
      animate: enabled,
      orbs: 3,
    };
  }, [eligible, idle, supported, reduced]);
}
