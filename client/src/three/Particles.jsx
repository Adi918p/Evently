import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { AdditiveBlending, Color, MathUtils } from "three";

/**
 * Drifting dust field.
 *
 * Points + a single BufferGeometry, so the whole field is one draw call
 * regardless of count. Motion happens in the vertex shader - the CPU only
 * updates a time uniform each frame, which keeps this well inside the frame
 * budget.
 *
 * Everything here is tuned around one constraint: this is a backdrop for text.
 * The first pass put the slab at z -26..+6 with the camera at z 12, so points
 * six units from the lens picked up a 300/6 = 50x size multiplier and rendered
 * as blown-out bokeh discs across the copy. Three things keep that from
 * happening now - the slab starts well behind the focal plane, point size is
 * clamped, and alpha falls off at both ends of the depth range.
 */

/* Additive blending means colour accumulates, so pure white is the one hue that
 * cannot be layered - two overlapping white motes clip. The lightest entry is a
 * lavender-white instead, which still reads as a highlight against #050510. */
const PALETTE = ["#a855f7", "#22d3ee", "#fb3b73", "#c4b5fd", "#e9d5ff"];

/** Camera-space depth the slab is allowed to occupy, given a camera at z = 12. */
const NEAR_Z = -6;
const FAR_Z = -34;

const vertexShader = /* glsl */ `
  attribute float aSize;
  attribute float aPhase;
  attribute vec3 aColor;

  uniform float uTime;
  uniform float uPixelRatio;
  uniform float uDrift;

  varying vec3 vColor;
  varying float vTwinkle;
  varying float vDepthFade;

  void main() {
    vColor = aColor;

    vec3 pos = position;

    // Slow vertical rise plus a lateral sway; each point has its own phase so
    // the field never pulses in unison.
    pos.y += sin(uTime * 0.18 + aPhase) * 1.4 * uDrift;
    pos.x += cos(uTime * 0.13 + aPhase * 1.7) * 1.1 * uDrift;
    pos.z += sin(uTime * 0.11 + aPhase * 0.9) * 0.8 * uDrift;

    vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mvPosition;

    float depth = max(-mvPosition.z, 1.0);

    // Size attenuation by depth, matched to the pixel ratio so points are the
    // same visual size on every display. The 60.0 numerator is calibrated
    // against the slab's depth range: it puts common motes at 1-7 CSS px and
    // the rare large ones at 4-15. The min() is a guard - if the parallax rig
    // or a drift offset ever pushes a point toward the lens it dims and stays
    // small instead of becoming a foreground object.
    gl_PointSize = min(aSize * uPixelRatio * (60.0 / depth), 20.0 * uPixelRatio);

    // Fade at both ends of the range rather than popping: near points would be
    // the brightest thing on screen, far ones just add haze the fog already
    // handles.
    vDepthFade = smoothstep(14.0, 24.0, depth) * (1.0 - smoothstep(40.0, 50.0, depth));

    vTwinkle = 0.55 + 0.45 * sin(uTime * 0.9 + aPhase * 3.0);
  }
`;

const fragmentShader = /* glsl */ `
  uniform float uOpacity;

  varying vec3 vColor;
  varying float vTwinkle;
  varying float vDepthFade;

  void main() {
    // Soft round sprite; square points read as digital noise.
    float d = length(gl_PointCoord - vec2(0.5));
    if (d > 0.5) discard;
    float alpha = smoothstep(0.5, 0.05, d) * vTwinkle * vDepthFade * uOpacity;
    if (alpha < 0.004) discard;
    gl_FragColor = vec4(vColor, alpha);
  }
`;

export default function Particles({
  count = 620,
  animate = true,
  drift = 1,
  opacity = 0.5,
}) {
  const materialRef = useRef(null);

  const { positions, sizes, phases, colors } = useMemo(() => {
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    const phases = new Float32Array(count);
    const color = new Color();

    for (let i = 0; i < count; i += 1) {
      // A wide, deep slab that starts behind the focal plane. The camera looks
      // into it rather than sitting inside it.
      positions[i * 3] = MathUtils.randFloatSpread(52);
      positions[i * 3 + 1] = MathUtils.randFloatSpread(34);
      positions[i * 3 + 2] = MathUtils.randFloat(FAR_Z, NEAR_Z);

      color.set(PALETTE[Math.floor(Math.random() * PALETTE.length)]);
      colors[i * 3] = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;

      // A few noticeably larger motes give the field depth. Kept to 1 in 20 and
      // well under the old 5-9 range, which is what produced the wall of bokeh.
      sizes[i] =
        Math.random() < 0.05
          ? MathUtils.randFloat(2.6, 4.2)
          : MathUtils.randFloat(0.8, 1.9);
      phases[i] = Math.random() * Math.PI * 2;
    }

    return { positions, sizes, phases, colors };
  }, [count]);

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uPixelRatio: { value: Math.min(window.devicePixelRatio || 1, 2) },
      uDrift: { value: drift },
      uOpacity: { value: opacity },
    }),
    [drift, opacity]
  );

  useFrame((_, delta) => {
    if (!animate || !materialRef.current) return;
    // Clamp delta so a backgrounded tab does not fast-forward the field.
    materialRef.current.uniforms.uTime.value += Math.min(delta, 0.05);
  });

  return (
    <points frustumCulled={false}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        <bufferAttribute attach="attributes-aColor" args={[colors, 3]} />
        <bufferAttribute attach="attributes-aSize" args={[sizes, 1]} />
        <bufferAttribute attach="attributes-aPhase" args={[phases, 1]} />
      </bufferGeometry>
      <shaderMaterial
        ref={materialRef}
        uniforms={uniforms}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        transparent
        depthWrite={false}
        blending={AdditiveBlending}
      />
    </points>
  );
}
