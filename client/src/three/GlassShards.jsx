import { useLayoutEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Color, MathUtils, Matrix4, Quaternion, Vector3 } from "three";

/**
 * Floating glass shards.
 *
 * One InstancedMesh for the whole set - 30 separate meshes would be 30 draw
 * calls for pure decoration. Per-instance transforms are composed on the CPU
 * (cheap at this count) and written into the instance matrix buffer.
 */

const GEOMETRY_COLORS = ["#a855f7", "#7c3aed", "#22d3ee", "#fb3b73", "#4338ca"];

export default function GlassShards({ count = 24, animate = true }) {
  const meshRef = useRef(null);

  // Scratch objects reused every frame so the loop allocates nothing.
  const scratch = useMemo(
    () => ({
      matrix: new Matrix4(),
      position: new Vector3(),
      quaternion: new Quaternion(),
      scale: new Vector3(),
      axis: new Vector3(),
    }),
    []
  );

  const shards = useMemo(
    () =>
      Array.from({ length: count }, () => ({
        /* Behind the focal plane, same reasoning as the particle slab. A shard
           at z = +2 sat ten units from a camera at z = 12, where a 1.15-scale
           octahedron with depthWrite off reads as a dark triangle floating over
           the copy rather than as distant glass. */
        origin: new Vector3(
          MathUtils.randFloatSpread(38),
          MathUtils.randFloatSpread(22),
          MathUtils.randFloat(-26, -5)
        ),
        axis: new Vector3(
          Math.random() - 0.5,
          Math.random() - 0.5,
          Math.random() - 0.5
        ).normalize(),
        spin: MathUtils.randFloat(0.06, 0.24) * (Math.random() < 0.5 ? -1 : 1),
        phase: Math.random() * Math.PI * 2,
        bob: MathUtils.randFloat(0.5, 1.8),
        scale: MathUtils.randFloat(0.32, 1.15),
        color: GEOMETRY_COLORS[Math.floor(Math.random() * GEOMETRY_COLORS.length)],
      })),
    [count]
  );

  // Instance colours are static, so they are written once rather than per frame.
  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const color = new Color();
    shards.forEach((shard, i) => {
      mesh.setColorAt(i, color.set(shard.color));
    });
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [shards]);

  const write = (time) => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const { matrix, position, quaternion, scale, axis } = scratch;

    shards.forEach((shard, i) => {
      position
        .copy(shard.origin)
        .add(
          axis
            .set(
              Math.cos(time * 0.12 + shard.phase) * shard.bob * 0.6,
              Math.sin(time * 0.16 + shard.phase) * shard.bob,
              0
            )
        );
      quaternion.setFromAxisAngle(shard.axis, time * shard.spin + shard.phase);
      scale.setScalar(shard.scale);
      matrix.compose(position, quaternion, scale);
      mesh.setMatrixAt(i, matrix);
    });

    mesh.instanceMatrix.needsUpdate = true;
  };

  // Under reduced motion the shards still exist, they just hold a pose.
  useLayoutEffect(() => {
    write(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shards]);

  const clock = useRef(0);
  useFrame((_, delta) => {
    if (!animate) return;
    clock.current += Math.min(delta, 0.05);
    write(clock.current);
  });

  return (
    <instancedMesh
      ref={meshRef}
      args={[undefined, undefined, count]}
      frustumCulled={false}
    >
      {/* Low-poly faceted solid - the flat faces are what catch the light and
          read as glass. */}
      <octahedronGeometry args={[1, 0]} />
      <meshPhysicalMaterial
        roughness={0.12}
        metalness={0}
        transparent
        opacity={0.22}
        iridescence={1}
        iridescenceIOR={1.42}
        clearcoat={1}
        clearcoatRoughness={0.18}
        flatShading
        depthWrite={false}
      />
    </instancedMesh>
  );
}
