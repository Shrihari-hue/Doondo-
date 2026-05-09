/**
 * ApplyCelebration — the cinematic moment after a successful apply.
 *
 * What you see (in order, ~2.4s total):
 *   0.00s  champagne pulse ring expands from center, fades
 *   0.10s  ~28 particles spray outward — each tiny gold/coral/jade dot
 *          with its own velocity. Pure 2D Animated.View — no three.js
 *          tear-down race on dismiss.
 *   0.20s  central gem orb (3D) fades in, slowly rotates
 *   0.40s  "Application sent" text fades in below the orb
 *   1.40s  "Continue" button fades in
 *
 * Earlier version had the particle burst in three.js too. That hit a
 * known r3f cleanup bug ("Cannot delete property '_r3f' of undefined")
 * when the Canvas unmounted — the parent group was reconciled before
 * its children, so child cleanup tried to detach from a freed parent.
 * The 2D burst sidesteps the entire r3f reconciler for the particles
 * while keeping the 3D gem in the centre for premium feel.
 */

import { useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, View } from 'react-native';
import { Canvas, useFrame } from '@react-three/fiber/native';
import * as THREE from 'three';

import { coral, jade, champagne, spacing } from '@doondo/tokens';
import { Text, Button } from '@/components';
import { useTheme } from '@/theme/useTheme';

interface Props {
  /** Called when the user taps the CTA or anywhere outside the orb. */
  onClose: () => void;
}

export function ApplyCelebration({ onClose }: Props) {
  const { theme } = useTheme();

  // Animated values for layered fades.
  const ringScale = useRef(new Animated.Value(0)).current;
  const ringOpacity = useRef(new Animated.Value(1)).current;
  const titleOpacity = useRef(new Animated.Value(0)).current;
  const ctaOpacity = useRef(new Animated.Value(0)).current;
  const overlayOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      // Backdrop fades up
      Animated.timing(overlayOpacity, {
        toValue: 1,
        duration: 250,
        useNativeDriver: true,
      }),
      // Ring expands and fades
      Animated.timing(ringScale, {
        toValue: 1,
        duration: 900,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(ringOpacity, {
        toValue: 0,
        duration: 900,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
      // Title fades in late
      Animated.sequence([
        Animated.delay(400),
        Animated.timing(titleOpacity, {
          toValue: 1,
          duration: 500,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]),
      // CTA fades in last
      Animated.sequence([
        Animated.delay(1400),
        Animated.timing(ctaOpacity, {
          toValue: 1,
          duration: 500,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]),
    ]).start();
  }, [overlayOpacity, ringScale, ringOpacity, titleOpacity, ctaOpacity]);

  return (
    <Animated.View
      // Full-screen backdrop. Tapping anywhere dismisses gracefully.
      style={{
        ...StyleSheetAbsolute,
        backgroundColor: theme.bg.canvas,
        opacity: overlayOpacity,
      }}
    >
      <Pressable
        onPress={onClose}
        style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}
      >
        {/* Stage — gem (3D) + particles (2D) + pulse ring (2D) */}
        <View style={{ width: 320, height: 320 }}>
          <Canvas
            camera={{ position: [0, 0, 5], fov: 50 }}
            gl={{ antialias: true, alpha: true }}
            style={{ flex: 1, backgroundColor: 'transparent' }}
          >
            <ambientLight intensity={0.4} color="#FFFFFF" />
            <directionalLight position={[3, 4, 5]} intensity={1.0} color="#FFEAD1" />
            <pointLight position={[-2, -2, 3]} intensity={0.8} color={champagne[300]} />
            <CelebrationGem />
          </Canvas>

          {/* 2D particle burst overlay — sidesteps r3f cleanup */}
          <ParticleBurst2D />

          {/* Expanding champagne pulse ring */}
          <Animated.View
            pointerEvents="none"
            style={{
              position: 'absolute',
              top: 110,
              left: 110,
              width: 100,
              height: 100,
              borderRadius: 50,
              borderWidth: 1.5,
              borderColor: champagne[300],
              opacity: ringOpacity,
              transform: [
                {
                  scale: ringScale.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0.4, 3.6],
                  }),
                },
              ],
            }}
          />
        </View>

        {/* Title */}
        <Animated.View style={{ opacity: titleOpacity, alignItems: 'center', gap: spacing.xs }}>
          <Text variant="caption" tone="tertiary" style={{ letterSpacing: 1.4 }}>
            DOONDO
          </Text>
          <Text variant="display" weight="medium" display style={{ textAlign: 'center' }}>
            Application sent.
          </Text>
          <Text
            variant="body"
            tone="secondary"
            style={{ textAlign: 'center', maxWidth: 280, marginTop: spacing.xs }}
          >
            They'll see your name nearby. Watch your status update in Applications.
          </Text>
        </Animated.View>

        {/* CTA */}
        <Animated.View
          style={{
            opacity: ctaOpacity,
            marginTop: spacing['3xl'],
            paddingHorizontal: spacing.xl,
            alignSelf: 'stretch',
          }}
        >
          <Button label="Continue" onPress={onClose} />
        </Animated.View>
      </Pressable>
    </Animated.View>
  );
}

// ─── 3D pieces ───────────────────────────────────────────────────────────────

/**
 * The faceted gem at the center — same icosahedron + flat shading recipe
 * as the role-picker orb but tinted champagne to read as a "trophy".
 */
function CelebrationGem() {
  const groupRef = useRef<THREE.Group>(null);
  const orbRef = useRef<THREE.Mesh>(null);
  const fadeRef = useRef(0);

  useFrame((_, delta) => {
    fadeRef.current = Math.min(1, fadeRef.current + delta * 1.2);
    const group = groupRef.current;
    const orb = orbRef.current;
    if (!group || !orb) return;
    // Slow rotation
    orb.rotation.y += delta * 0.4;
    orb.rotation.x += delta * 0.1;
    // Scale-in pop
    const target = 0.35 + fadeRef.current * 0.65;
    group.scale.set(target, target, target);
  });

  return (
    <group ref={groupRef} scale={[0.35, 0.35, 0.35]}>
      <mesh ref={orbRef}>
        <icosahedronGeometry args={[0.85, 1]} />
        <meshStandardMaterial
          color={champagne[400]}
          roughness={0.4}
          metalness={0.5}
          flatShading
        />
      </mesh>
    </group>
  );
}

// ─── 2D particle burst ───────────────────────────────────────────────────────

interface Particle2D {
  /** Final offset from center, after the 1.6s spray. */
  dx: number;
  dy: number;
  color: string;
  size: number;
}

/**
 * 28 dots spray radially from the center of the stage and fade as they
 * travel. Done with native-driven Animated values so it stays at 60fps
 * and never goes through the r3f reconciler — the source of the apply-
 * dismiss crash.
 */
function ParticleBurst2D() {
  const palette = [champagne[300], champagne[400], coral[400], jade[300]];

  // Generate once per mount. Math.random is fine — particles are
  // visible only for the first 1.6s and never redraw.
  const particles = useRef<Particle2D[]>(
    Array.from({ length: 28 }, (_, i) => {
      const theta = Math.random() * Math.PI * 2;
      const speed = 70 + Math.random() * 80; // pixels of travel
      return {
        dx: Math.cos(theta) * speed,
        dy: Math.sin(theta) * speed - Math.random() * 18, // slight upward bias
        color: palette[i % palette.length]!,
        size: 4 + Math.random() * 3,
      };
    }),
  ).current;

  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {particles.map((p, i) => (
        <Particle key={i} {...p} />
      ))}
    </View>
  );
}

function Particle({ dx, dy, color, size }: Particle2D) {
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(progress, {
      toValue: 1,
      duration: 1600,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [progress]);

  const translateX = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, dx],
  });
  const translateY = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, dy],
  });
  const opacity = progress.interpolate({
    inputRange: [0, 0.2, 1],
    outputRange: [0, 1, 0],
  });
  const scale = progress.interpolate({
    inputRange: [0, 0.3, 1],
    outputRange: [0.4, 1, 0.2],
  });

  return (
    <Animated.View
      style={{
        position: 'absolute',
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: color,
        opacity,
        transform: [{ translateX }, { translateY }, { scale }],
      }}
    />
  );
}

// React Native doesn't expose StyleSheet.absoluteFillObject as a named const
// in all setups, so inline the equivalent.
const StyleSheetAbsolute = {
  position: 'absolute' as const,
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
};
