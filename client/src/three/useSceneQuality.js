import { useEffect, useMemo, useState } from "react";
import { useReducedMotion } from "motion/react";
import { useMediaQuery } from "../lib/useMediaQuery";

/**
 * Decides how much scene the device can afford.
 *
 * The ambient WebGL layer is decoration, so it must never be the reason a page
 * feels slow. Three signals drive the tier:
 *   - WebGL availability at all (fall back to CSS gradients if absent)
 *   - core count / device memory as a rough GPU proxy
 *   - coarse pointer, which correlates well enough with phones
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

/** Fires once the browser is idle, so the canvas never competes with first paint. */
export function useDeferredMount(delay = 180) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let timer;
    const start = () => setReady(true);

    if ("requestIdleCallback" in window) {
      const id = window.requestIdleCallback(start, { timeout: 1200 });
      return () => window.cancelIdleCallback(id);
    }
    timer = window.setTimeout(start, delay);
    return () => window.clearTimeout(timer);
  }, [delay]);

  return ready;
}

export function useSceneQuality() {
  const reduced = useReducedMotion();
  const coarse = useMediaQuery("(pointer: coarse)");
  const narrow = useMediaQuery("(max-width: 767px)");
  const saveData =
    typeof navigator !== "undefined" && navigator.connection?.saveData === true;

  return useMemo(() => {
    const supported = detectWebgl();

    // Heuristic tier. deviceMemory is Chromium-only; absence is treated as mid.
    const cores = navigator.hardwareConcurrency || 4;
    const memory = navigator.deviceMemory ?? 4;
    const weak = cores <= 4 || memory <= 4 || coarse || narrow;

    const tier = !supported || saveData ? "none" : weak ? "low" : "high";

    return {
      /** Mount the canvas at all? */
      enabled: tier !== "none",
      tier,
      reduced: Boolean(reduced),
      /** Cap the pixel ratio - retina at 3x is wasted on a blurred backdrop. */
      dpr: tier === "high" ? [1, 1.75] : [1, 1.25],
      /* Counts are set by legibility, not by what the GPU can survive. 1500
         points and 30 shards both ran at 60fps; they also buried the copy. */
      particles: tier === "high" ? 700 : 300,
      shards: tier === "high" ? 18 : 8,
      /** Reduced motion keeps the scene but freezes it after one frame. */
      animate: tier !== "none" && !reduced,
      /** Only the high tier gets the extra additive bloom sprites. */
      orbs: tier === "high" ? 3 : 2,
    };
  }, [reduced, coarse, narrow, saveData]);
}
