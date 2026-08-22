import { lazy, Suspense } from "react";
import ErrorBoundary from "../components/ErrorBoundary";
import { useDeferredMount, useSceneQuality } from "./useSceneQuality";

/**
 * The fixed ambient backdrop that sits behind every page.
 *
 * Three things matter here:
 *   1. three.js is code-split behind React.lazy, so the first paint never waits
 *      on ~600kb of WebGL (bundle-splitting).
 *   2. The canvas mounts only after the browser goes idle, and only on devices
 *      that can afford it. Everything degrades to the CSS wash below.
 *   3. The CSS wash renders unconditionally, so there is no frame where the
 *      page is a flat void - and no-WebGL browsers still get the art direction.
 */

const Canvas3D = lazy(() => import("./Canvas3D"));

/** Static gradient + blooms. This is the whole look on the no-WebGL path. */
function CssWash() {
  return (
    <div
      aria-hidden="true"
      className="scene-layer"
      style={{
        /* The canvas has alpha, so this wash shows through it and its peaks add
           to the orbs' and the particles'. Same brightness budget as those -
           the violet hotspot used to be 0.32, which on its own already put the
           backdrop past what fg-muted could sit on. */
        background:
          "radial-gradient(120% 90% at 12% -8%, rgba(124,58,237,0.22) 0%, transparent 55%)," +
          "radial-gradient(90% 70% at 92% 8%, rgba(34,211,238,0.12) 0%, transparent 60%)," +
          "radial-gradient(110% 80% at 50% 108%, rgba(225,29,72,0.14) 0%, transparent 62%)," +
          "linear-gradient(180deg, #08081a 0%, #050510 60%, #07071a 100%)",
      }}
    />
  );
}

export default function SceneLayer() {
  const quality = useSceneQuality();
  const idle = useDeferredMount();

  return (
    <>
      <CssWash />

      {quality.enabled && idle ? (
        <div aria-hidden="true" className="scene-layer">
          {/* A lost WebGL context or a failed chunk load just leaves the CSS
              wash in place - it must never blank the page. */}
          <ErrorBoundary fallback={null}>
            <Suspense fallback={null}>
              <Canvas3D quality={quality} />
            </Suspense>
          </ErrorBoundary>
        </div>
      ) : null}

      {/* The scrim bounds how bright the scene is allowed to get behind text,
          the grain and vignette kill gradient banding and pull focus back to
          the centre of the page. Order matters: scrim first so the grain sits
          over it rather than under. */}
      <div aria-hidden="true" className="scene-scrim" />
      <div aria-hidden="true" className="scene-grain" />
      <div aria-hidden="true" className="scene-vignette" />
    </>
  );
}
