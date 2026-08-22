import { Canvas } from "@react-three/fiber";
import { AdaptiveDpr, PerformanceMonitor } from "@react-three/drei";
import { useState } from "react";
import AmbientScene from "./AmbientScene";

/**
 * Isolated so React.lazy can split three.js, R3F and drei into their own chunk.
 *
 * The canvas is decorative: pointer events off, hidden from assistive tech by
 * its wrapper, and the frameloop switches to "demand" under reduced motion so
 * the scene renders exactly one frame and then stops burning GPU.
 */
export default function Canvas3D({ quality }) {
  const [degraded, setDegraded] = useState(false);

  return (
    <Canvas
      dpr={quality.dpr}
      frameloop={quality.animate ? "always" : "demand"}
      gl={{
        antialias: quality.tier === "high",
        alpha: true,
        powerPreference: "high-performance",
        // No depth buffer readback or stencil needed for a decorative scene.
        stencil: false,
        failIfMajorPerformanceCaveat: true,
      }}
      camera={{ position: [0, 0, 12], fov: 62, near: 0.1, far: 90 }}
      style={{ pointerEvents: "none" }}
    >
      {/* Drops resolution instead of frames when the GPU falls behind. */}
      <PerformanceMonitor onDecline={() => setDegraded(true)} />
      <AdaptiveDpr pixelated />

      <AmbientScene
        quality={
          degraded
            ? { ...quality, particles: Math.round(quality.particles * 0.45), shards: Math.min(quality.shards, 10) }
            : quality
        }
      />
    </Canvas>
  );
}
