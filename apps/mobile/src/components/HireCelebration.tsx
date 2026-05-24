import { useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, View } from 'react-native';
import { Canvas, useFrame } from '@react-three/fiber/native';
import * as THREE from 'three';

import { champagne, coral, jade, radii, spacing } from '@doondo/tokens';
import { Button } from './Button';
import { Text } from './Text';
import { useTheme } from '@/theme/useTheme';
import { useTranslate } from '@/i18n/useTranslate';
import { useFestival } from '@/lib/festivals';

interface Props {
  eyebrow?: string;
  title: string;
  subtitle: string;
  details?: string[];
  primaryLabel: string;
  onPrimary: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
  onClose: () => void;
}

export function HireCelebration({
  eyebrow = 'DOONDO',
  title,
  subtitle,
  details = [],
  primaryLabel,
  onPrimary,
  secondaryLabel,
  onSecondary,
  onClose,
}: Props) {
  const { theme } = useTheme();
  const t = useTranslate();
  // Festival flair — when a hire lands during a festival window, the
  // celebration picks up the festival's emoji + a seasonal line.
  const festival = useFestival();
  const overlayOpacity = useRef(new Animated.Value(0)).current;
  const ringScale = useRef(new Animated.Value(0)).current;
  const ringOpacity = useRef(new Animated.Value(1)).current;
  const copyOpacity = useRef(new Animated.Value(0)).current;
  const actionsOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(overlayOpacity, {
        toValue: 1,
        duration: 260,
        useNativeDriver: true,
      }),
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
      Animated.sequence([
        Animated.delay(320),
        Animated.timing(copyOpacity, {
          toValue: 1,
          duration: 520,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]),
      Animated.sequence([
        Animated.delay(1100),
        Animated.timing(actionsOpacity, {
          toValue: 1,
          duration: 460,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]),
    ]).start();
  }, [actionsOpacity, copyOpacity, overlayOpacity, ringOpacity, ringScale]);

  return (
    <Animated.View
      style={{
        ...ABSOLUTE_FILL,
        backgroundColor: theme.bg.canvas,
        opacity: overlayOpacity,
      }}
    >
      <Pressable
        onPress={onClose}
        style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl }}
      >
        <View style={{ width: 320, height: 320 }}>
          <Canvas
            camera={{ position: [0, 0, 5], fov: 50 }}
            gl={{ antialias: true, alpha: true }}
            style={{ flex: 1, backgroundColor: 'transparent' }}
          >
            <ambientLight intensity={0.5} color="#FFFFFF" />
            <directionalLight position={[2, 4, 5]} intensity={1.15} color="#FFEAD1" />
            <pointLight position={[-2, -2, 3]} intensity={0.85} color={champagne[300]} />
            <HireGem />
          </Canvas>

          <HireParticleBurst />

          <Animated.View
            pointerEvents="none"
            style={{
              position: 'absolute',
              top: 104,
              left: 104,
              width: 112,
              height: 112,
              borderRadius: 56,
              borderWidth: 1.5,
              borderColor: champagne[300],
              opacity: ringOpacity,
              transform: [
                {
                  scale: ringScale.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0.35, 3.4],
                  }),
                },
              ],
            }}
          />
        </View>

        <Animated.View style={{ opacity: copyOpacity, alignItems: 'center', gap: spacing.sm }}>
          <Text variant="caption" tone="tertiary" style={{ letterSpacing: 1.4 }}>
            {eyebrow}
          </Text>
          <Text variant="display" weight="medium" display style={{ textAlign: 'center' }}>
            {title}
          </Text>
          <Text
            variant="body"
            tone="secondary"
            style={{ textAlign: 'center', maxWidth: 310, lineHeight: 21 }}
          >
            {subtitle}
          </Text>

          {festival ? (
            <View
              style={{
                marginTop: spacing.xs,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                paddingHorizontal: 12,
                paddingVertical: 6,
                borderRadius: radii.pill,
                backgroundColor: festival.accentSoft,
              }}
            >
              <Text style={{ fontSize: 15 }}>{festival.emoji}</Text>
              <Text style={{ fontSize: 12, fontWeight: '700', color: festival.accent }}>
                {t('festival.celebration', { festival: festival.name })}
              </Text>
            </View>
          ) : null}

          {details.length > 0 ? (
            <View
              style={{
                marginTop: spacing.sm,
                flexDirection: 'row',
                flexWrap: 'wrap',
                justifyContent: 'center',
                gap: spacing.xs,
              }}
            >
              {details.map((detail) => (
                <View
                  key={detail}
                  style={{
                    paddingHorizontal: 10,
                    paddingVertical: 6,
                    borderRadius: radii.pill,
                    backgroundColor: 'rgba(255,253,247,0.08)',
                    borderWidth: 0.5,
                    borderColor: theme.border.subtle,
                  }}
                >
                  <Text style={{ fontSize: 12, color: theme.text.secondary, fontWeight: '600' }}>
                    {detail}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}
        </Animated.View>

        <Animated.View
          style={{
            opacity: actionsOpacity,
            marginTop: spacing['3xl'],
            width: '100%',
            gap: spacing.sm,
          }}
        >
          <Button label={primaryLabel} onPress={onPrimary} />
          {secondaryLabel && onSecondary ? (
            <Pressable
              onPress={onSecondary}
              style={({ pressed }) => ({
                alignItems: 'center',
                justifyContent: 'center',
                paddingVertical: spacing.md,
                opacity: pressed ? 0.7 : 1,
              })}
            >
              <Text style={{ fontSize: 14, fontWeight: '700', color: theme.brand.hero }}>
                {secondaryLabel}
              </Text>
            </Pressable>
          ) : null}
        </Animated.View>
      </Pressable>
    </Animated.View>
  );
}

function HireGem() {
  const groupRef = useRef<THREE.Group>(null);
  const orbRef = useRef<THREE.Mesh>(null);
  const glowRef = useRef<THREE.Mesh>(null);
  const fadeRef = useRef(0);

  useFrame((_, delta) => {
    fadeRef.current = Math.min(1, fadeRef.current + delta * 1.1);
    const group = groupRef.current;
    const orb = orbRef.current;
    const glow = glowRef.current;
    if (!group || !orb || !glow) return;
    orb.rotation.y += delta * 0.38;
    orb.rotation.x += delta * 0.11;
    glow.rotation.z -= delta * 0.16;
    const target = 0.34 + fadeRef.current * 0.66;
    group.scale.set(target, target, target);
  });

  return (
    <group ref={groupRef} scale={[0.34, 0.34, 0.34]}>
      <mesh ref={glowRef}>
        <torusGeometry args={[1.4, 0.08, 16, 64]} />
        <meshStandardMaterial
          color={champagne[200]}
          emissive={champagne[200]}
          emissiveIntensity={0.9}
          transparent
          opacity={0.7}
        />
      </mesh>
      <mesh ref={orbRef}>
        <icosahedronGeometry args={[0.86, 1]} />
        <meshStandardMaterial
          color={champagne[400]}
          roughness={0.38}
          metalness={0.56}
          flatShading
        />
      </mesh>
    </group>
  );
}

interface ParticleSpec {
  dx: number;
  dy: number;
  color: string;
  size: number;
}

function HireParticleBurst() {
  const palette = [champagne[300], champagne[400], coral[400], jade[300]];
  const particles = useRef<ParticleSpec[]>(
    Array.from({ length: 32 }, (_, i) => {
      const theta = Math.random() * Math.PI * 2;
      const speed = 88 + Math.random() * 88;
      return {
        dx: Math.cos(theta) * speed,
        dy: Math.sin(theta) * speed - Math.random() * 24,
        color: palette[i % palette.length]!,
        size: 4 + Math.random() * 4,
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
      {particles.map((p, index) => (
        <HireParticle key={index} particle={p} />
      ))}
    </View>
  );
}

function HireParticle({ particle }: { particle: ParticleSpec }) {
  const opacity = useRef(new Animated.Value(0)).current;
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.sequence([
        Animated.delay(Math.random() * 120),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 120,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0,
          duration: 980,
          useNativeDriver: true,
        }),
      ]),
      Animated.timing(progress, {
        toValue: 1,
        duration: 1200,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, [opacity, progress]);

  return (
    <Animated.View
      style={{
        position: 'absolute',
        width: particle.size,
        height: particle.size,
        borderRadius: particle.size / 2,
        backgroundColor: particle.color,
        opacity,
        transform: [
          {
            translateX: progress.interpolate({
              inputRange: [0, 1],
              outputRange: [0, particle.dx],
            }),
          },
          {
            translateY: progress.interpolate({
              inputRange: [0, 1],
              outputRange: [0, particle.dy],
            }),
          },
          {
            scale: progress.interpolate({
              inputRange: [0, 0.7, 1],
              outputRange: [0.3, 1, 0.85],
            }),
          },
        ],
      }}
    />
  );
}

const ABSOLUTE_FILL = {
  position: 'absolute' as const,
  top: 0,
  right: 0,
  bottom: 0,
  left: 0,
};
