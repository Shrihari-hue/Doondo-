/**
 * ProfileCompletionOrb — a small 3D progress indicator.
 *
 * What it shows:
 *   - A small icosahedron orb tinted by completion %:
 *       0–33%   → coral (warmth, "you're starting")
 *       34–66%  → coral→champagne mix
 *       67–99%  → champagne (closer)
 *       100%    → champagne with brighter ring + slow shimmer
 *   - A thin ring around it whose ARC LENGTH matches the percentage
 *     (built from a TorusGeometry with a partial `arc` argument).
 *   - Slow rotation + subtle float, matching the role-picker orbs so
 *     this feels like the same world.
 *
 * Sized to fit inside a Card. ~120pt square works nicely.
 */

import { useRef } from 'react';
import { View } from 'react-native';
import { Canvas, useFrame } from '@react-three/fiber/native';
import * as THREE from 'three';

import { coral, champagne } from '@doondo/tokens';

interface Props {
  completion: number; // 0..100
  size?: number;
}

export function ProfileCompletionOrb({ completion, size = 120 }: Props) {
  return (
    <View style={{ width: size, height: size }}>
      <Canvas
        camera={{ position: [0, 0, 4], fov: 45 }}
        gl={{ antialias: true, alpha: true }}
        style={{ flex: 1, backgroundColor: 'transparent' }}
      >
        <ambientLight intensity={0.4} color="#FFFFFF" />
        <directionalLight position={[2, 3, 4]} intensity={0.9} color="#FFEAD1" />
        <pointLight position={[-2, -1, 3]} intensity={0.5} color={champagne[300]} />
        <Orb completion={completion} />
        <ProgressRing completion={completion} />
      </Canvas>
    </View>
  );
}

function Orb({ completion }: { completion: number }) {
  const groupRef = useRef<THREE.Group>(null);
  const orbRef = useRef<THREE.Mesh>(null);

  useFrame((state, delta) => {
    const group = groupRef.current;
    const orb = orbRef.current;
    if (!group || !orb) return;
    orb.rotation.y += delta * 0.3;
    orb.rotation.x += delta * 0.08;
    group.position.y = Math.sin(state.clock.elapsedTime * 0.7) * 0.05;
  });

  // Color blend: coral → champagne by completion.
  const t = completion / 100;
  const blended = new THREE.Color(coral[500]).lerp(new THREE.Color(champagne[400]), t);

  return (
    <group ref={groupRef}>
      <mesh ref={orbRef}>
        <icosahedronGeometry args={[0.85, 1]} />
        <meshStandardMaterial color={blended} roughness={0.45} metalness={0.3} flatShading />
      </mesh>
    </group>
  );
}

function ProgressRing({ completion }: { completion: number }) {
  const ringRef = useRef<THREE.Mesh>(null);
  // Arc length 0..2π based on completion.
  const arc = Math.max(0.001, (completion / 100) * Math.PI * 2);

  useFrame((_, delta) => {
    if (!ringRef.current) return;
    ringRef.current.rotation.z += delta * 0.4;
  });

  return (
    <mesh ref={ringRef} rotation={[Math.PI / 2, 0, 0]}>
      <torusGeometry args={[1.2, 0.025, 12, 96, arc]} />
      <meshBasicMaterial color={champagne[300]} transparent opacity={0.85} />
    </mesh>
  );
}
