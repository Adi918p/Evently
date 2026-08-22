import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { AdditiveBlending, Color, MathUtils } from "three";
import Particles from "./Particles";
import GlassShards from "./GlassShards";
import { pointer, trackPointer } from "./usePointer";

/* ==========================================================================
   Soft light orbs
   --------------------------------------------------------------------------
   Additive quads with a radial falloff. Cheaper and steadier than a bloom
   post-process pass, and they give the scene its "club lighting" wash.
   ========================================================================== */

const orbVertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const orbFragment = /* glsl */ `
  uniform vec3 uColor;
  uniform float uIntensity;
  varying vec2 vUv;

  void main() {
    float d = length(vUv - 0.5) * 2.0;
    // Squared falloff reads much more like real light than a linear ramp.
    float glow = pow(clamp(1.0 - d, 0.0, 1.0), 2.6);
    gl_FragColor = vec4(uColor, glow * uIntensity);
  }
`;

function Orb({ color, position, size, speed, phase, intensity = 0.5 }) {
  const groupRef = useRef(null);
  const uniforms = useMemo(
    () => ({
      uColor: { value: new Color(color) },
      uIntensity: { value: intensity },
    }),
    [color, intensity]
  );

  useFrame(({ clock }) => {
    if (!groupRef.current) return;
    const t = clock.elapsedTime * speed + phase;
    groupRef.current.position.x = position[0] + Math.sin(t) * 3.2;
    groupRef.current.position.y = position[1] + Math.cos(t * 0.8) * 2.4;
  });

  return (
    <mesh ref={groupRef} position={position} frustumCulled={false}>
      <planeGeometry args={[size, size]} />
      <shaderMaterial
        uniforms={uniforms}
        vertexShader={orbVertex}
        fragmentShader={orbFragment}
        transparent
        depthWrite={false}
        depthTest={false}
        blending={AdditiveBlending}
      />
    </mesh>
  );
}

/* Intensities are a shared brightness budget, not per-orb taste. Each orb is
   additive, so the three of them plus a particle plus the CSS wash can all land
   on the same pixel; the sum of the peaks is what has to stay dark enough for
   text to sit over it. These are ~70% of the first pass for that reason. */
const ORBS = [
  {
    color: "#7c3aed",
    position: [-11, 5, -14],
    size: 30,
    speed: 0.12,
    phase: 0,
    intensity: 0.3,
  },
  {
    color: "#22d3ee",
    position: [13, -5, -17],
    size: 26,
    speed: 0.09,
    phase: 2.1,
    intensity: 0.22,
  },
  {
    color: "#e11d48",
    position: [3, 9, -20],
    size: 22,
    speed: 0.15,
    phase: 4.4,
    intensity: 0.2,
  },
];

/* ==========================================================================
   Parallax rig
   --------------------------------------------------------------------------
   The camera drifts toward the pointer and with page scroll instead of the
   content moving, so nothing in the DOM reflows (layout-shift-avoid). The
   travel is deliberately tiny - parallax should be felt, not noticed
   (parallax-subtle).
   ========================================================================== */

function ParallaxRig({ children, animate }) {
  const groupRef = useRef(null);
  const scroll = useRef(0);
  const { camera } = useThree();

  useEffect(() => trackPointer(), []);

  useFrame((state, delta) => {
    if (!animate || !groupRef.current) return;
    const step = 1 - Math.pow(0.001, Math.min(delta, 0.05));

    camera.position.x = MathUtils.lerp(camera.position.x, pointer.x * 1.15, step);
    camera.position.y = MathUtils.lerp(camera.position.y, pointer.y * 0.75, step);
    camera.lookAt(0, 0, -8);

    // Read scroll straight off the document; no listener, no throttling needed
    // because we only sample once per frame.
    const max = Math.max(
      document.documentElement.scrollHeight - window.innerHeight,
      1
    );
    scroll.current = MathUtils.clamp(window.scrollY / max, 0, 1);
    groupRef.current.position.y = MathUtils.lerp(
      groupRef.current.position.y,
      scroll.current * 6,
      step
    );
    groupRef.current.rotation.z = MathUtils.lerp(
      groupRef.current.rotation.z,
      scroll.current * 0.16,
      step
    );
  });

  return <group ref={groupRef}>{children}</group>;
}

/* ==========================================================================
   Scene
   ========================================================================== */

export default function AmbientScene({ quality }) {
  const { animate, particles, shards, orbs, tier } = quality;

  return (
    <>
      {/* Exponential fog fades the far shards into the page background so the
          canvas edge is never visible. */}
      <fogExp2 attach="fog" args={["#050510", 0.036]} />

      <ambientLight intensity={0.7} />
      {/* One dominant overhead source - the same light direction the CSS glass
          recipe assumes, so 3D and DOM surfaces agree. */}
      <directionalLight position={[4, 12, 6]} intensity={2.4} color="#e9d5ff" />
      <pointLight position={[-14, -6, -4]} intensity={140} color="#22d3ee" />
      <pointLight position={[12, 8, -6]} intensity={120} color="#fb3b73" />

      <ParallaxRig animate={animate}>
        {ORBS.slice(0, orbs).map((orb) => (
          <Orb key={orb.color} {...orb} />
        ))}

        <GlassShards count={shards} animate={animate} />

        <Particles
          count={particles}
          animate={animate}
          drift={tier === "high" ? 1 : 0.6}
          /* Peak sprite alpha. Additive blending compounds, so this is the knob
             that decides whether overlapping motes stay a haze or clip to
             white. Budgeted with the orbs and the CSS wash: all three peaking
             on one pixel has to stay dark enough for fg-muted to hold 4.5:1
             under the .scene-scrim. */
          opacity={0.32}
        />
      </ParallaxRig>
    </>
  );
}
