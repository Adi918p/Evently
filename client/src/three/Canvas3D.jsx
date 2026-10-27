import { Canvas, useThree } from "@react-three/fiber";
import { useEffect, useState } from "react";
import AmbientScene from "./AmbientScene";

/**
 * Isolated so React.lazy can split three.js and R3F into their own chunk.
 *
 * Render the decoration at most 30 frames/second while visible, leaving the
 * browser/GPU time for input and scrolling. Hidden tabs stop the timer entirely.
 */
function SceneFrames({ animate }) {
  const invalidate = useThree(state => state.invalidate);
  useEffect(() => {
    invalidate();
    if (!animate) return undefined;
    const timer = window.setInterval(invalidate, 1000 / 30);
    return () => window.clearInterval(timer);
  }, [animate, invalidate]);
  return null;
}

export default function Canvas3D({ quality }) {
  const [visible, setVisible] = useState(() => document.visibilityState !== "hidden");
  useEffect(() => {
    const changed = () => setVisible(document.visibilityState !== "hidden");
    document.addEventListener("visibilitychange", changed);
    return () => document.removeEventListener("visibilitychange", changed);
  }, []);
  const animate = quality.animate && visible;
  return (
    <Canvas
      dpr={quality.dpr}
      frameloop="demand"
      gl={{
        antialias: false,
        alpha: true,
        powerPreference: "low-power",
        // No depth buffer readback or stencil needed for a decorative scene.
        stencil: false,
        failIfMajorPerformanceCaveat: true,
      }}
      camera={{ position: [0, 0, 12], fov: 62, near: 0.1, far: 90 }}
      style={{ pointerEvents: "none" }}
    >
      <SceneFrames animate={animate} />
      <AmbientScene quality={{ ...quality, animate }} />
    </Canvas>
  );
}
