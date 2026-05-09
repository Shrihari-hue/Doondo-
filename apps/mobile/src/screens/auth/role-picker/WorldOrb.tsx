/**
 * WorldOrb — a single 3D form rendered inside react-three-fiber.
 *
 * Geometry: a low-poly icosahedron (the "world") wrapped in a thin
 * champagne torus (the "ring"). Both deliberately simple — premium feel
 * comes from the warm lighting + slow motion, not from polygon count.
 *
 * Behaviour:
 *   - Idle    → orb rotates slowly, ring rotates the other way for parallax,
 *               whole group floats up/down on a sin curve.
 *   - Selected → scales to 1.15, ring brightens to 0.9 alpha.
 *   - Dimmed  → scales to 0.78, ring fades to 0.18 alpha.
 *
 * Scale and ring opacity are lerped per frame for buttery transitions.
 *
 * Runs on every device Expo supports — geometry is light enough that even
 * mid-tier Androids hit 60fps.
 */

import { useRef } from 'react';
import { useFrame } from '@react-three/fiber/native';
import * as THREE from 'three';

interface Props {
  /** World position. The screen is split into left (-1.5) and right (+1.5). */
  position: [number, number, number];
  /** True when this orb is the chosen role. */
  selected: boolean;
  /** True when the OTHER orb is selected — fade this one out. */
  dimmed: boolean;
  /** The orb's main color. Coral for seeker, jade for employer. */
  baseColor: string;
  /** Ring color — champagne for both, by design. */
  ringColor: string;
}

const FLOAT_AMPLITUDE = 0.06;
const FLOAT_SPEED = 0.7;
const ORB_ROTATION_SPEED_Y = 0.2;
const ORB_ROTATION_SPEED_X = 0.05;
const RING_TILT_SPEED = 0.3;
const RING_ROLL_SPEED = 0.15;
const SCALE_LERP = 0.08;
const ALPHA_LERP = 0.12;

export function WorldOrb({ position, selected, dimmed, baseColor, ringColor }: Props) {
  const groupRef = useRef<THREE.Group>(null);
  const orbRef = useRef<THREE.Mesh>(null);
  const ringRef = useRef<THREE.Mesh>(null);
  const ringMaterialRef = useRef<THREE.MeshBasicMaterial>(null);

  useFrame((state, delta) => {
    const group = groupRef.current;
    const orb = orbRef.current;
    const ring = ringRef.current;
    const ringMat = ringMaterialRef.current;
    if (!group || !orb || !ring || !ringMat) return;

    const t = state.clock.elapsedTime;

    // Float — vertical bob around the configured y position.
    group.position.y = position[1] + Math.sin(t * FLOAT_SPEED) * FLOAT_AMPLITUDE;

    // Slow constant rotation on the orb.
    orb.rotation.y += delta * ORB_ROTATION_SPEED_Y;
    orb.rotation.x += delta * ORB_ROTATION_SPEED_X;

    // Counter-rotation on the ring for a subtle parallax effect.
    ring.rotation.x = t * RING_TILT_SPEED;
    ring.rotation.z = t * RING_ROLL_SPEED;

    // Scale toward target.
    const targetScale = selected ? 1.15 : dimmed ? 0.78 : 1.0;
    const nextScale = THREE.MathUtils.lerp(group.scale.x, targetScale, SCALE_LERP);
    group.scale.set(nextScale, nextScale, nextScale);

    // Ring alpha — bright when selected, dim otherwise.
    const targetAlpha = selected ? 0.9 : dimmed ? 0.18 : 0.5;
    ringMat.opacity = THREE.MathUtils.lerp(ringMat.opacity, targetAlpha, ALPHA_LERP);
  });

  return (
    <group ref={groupRef} position={position}>
      {/* The thin champagne ring. */}
      <mesh ref={ringRef}>
        <torusGeometry args={[1.18, 0.014, 12, 96]} />
        <meshBasicMaterial ref={ringMaterialRef} color={ringColor} transparent opacity={0.5} />
      </mesh>
      {/* The faceted orb itself. flatShading gives the gem-like facet pop. */}
      <mesh ref={orbRef}>
        <icosahedronGeometry args={[0.85, 1]} />
        <meshStandardMaterial color={baseColor} roughness={0.5} metalness={0.18} flatShading />
      </mesh>
    </group>
  );
}
