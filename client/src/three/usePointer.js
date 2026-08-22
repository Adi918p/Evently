/**
 * Normalised pointer position, shared by the scene.
 *
 * The canvas has pointer-events: none (it must never intercept a click meant
 * for the UI), so R3F's own pointer state stays at zero. One passive window
 * listener writes into this module-level ref instead - no React state, so
 * moving the mouse never triggers a render.
 */

export const pointer = { x: 0, y: 0 };

let listening = false;

const onPointerMove = (event) => {
  const w = window.innerWidth || 1;
  const h = window.innerHeight || 1;
  pointer.x = (event.clientX / w) * 2 - 1;
  pointer.y = -((event.clientY / h) * 2 - 1);
};

const reset = () => {
  pointer.x = 0;
  pointer.y = 0;
};

/** Idempotent: called by the scene on mount, refcounted so it cleans up. */
let refs = 0;

export function trackPointer() {
  refs += 1;
  if (!listening) {
    window.addEventListener("pointermove", onPointerMove, { passive: true });
    window.addEventListener("blur", reset);
    listening = true;
  }
  return () => {
    refs -= 1;
    if (refs <= 0 && listening) {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("blur", reset);
      listening = false;
      reset();
    }
  };
}
