/**
 * ApplicantCard — redesigned to match Doondo reference.
 *
 * Layout:
 *   Avatar | Name, Job • Exp | location, time | Status badge
 *   View Profile (outline) · Shortlist (blue outline)
 */

import { Animated, Pressable, View } from 'react-native';
import { useEffect, useRef } from 'react';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Feather } from '@expo/vector-icons';

import { spacing, radii } from '@doondo/tokens';
import { Text, Avatar, AnimatedPressable } from '@/components';
import { useTheme } from '@/theme/useTheme';
import { haptic } from '@/lib/haptics';
import { useTranslate } from '@/i18n/useTranslate';
import type { ApplicantEntry } from '@/api/applications.api';
import type { ApplicationStatus } from '@/api/types';
import type { AppStackParamList } from '@/navigation/types';

type Nav = NativeStackNavigationProp<AppStackParamList>;
type TFn = (key: string, opts?: Record<string, unknown>) => string;

interface Props {
  applicant: ApplicantEntry;
  showJobTitle?: boolean;
  blind?: boolean;
  blindIndex?: number;
  onLongPress?: () => void;
  /** 0–100 fit score to show as a colored badge */
  fitScore?: number;
}

const BLUE = '#2563EB';
const GREEN = '#16A34A';
const GREEN_LIGHT = '#DCFCE7';

export function ApplicantCard({ applicant, showJobTitle = false, blind = false, blindIndex, onLongPress, fitScore }: Props) {
  const navigation = useNavigation<Nav>();
  const { scheme } = useTheme();
  const isLight = scheme !== 'dark';
  const t = useTranslate();

  const masked = blind && applicant.status === 'pending';
  const displayName = masked
    ? t('employer.blind_review.candidate_n', { n: blindIndex ?? 1 })
    : (applicant.seeker?.name ?? 'Applicant');

  const isNew = applicant.status === 'pending';
  const isShortlisted = applicant.status === 'shortlisted';
  const isHired = applicant.status === 'hired';
  const isScheduled = (applicant as any).interview?.status === 'scheduled';

  const cardBg = isLight ? '#FFFFFF' : '#0D0D0D';
  const cardBorder = isLight ? '#E5E7EB' : '#1E1E1E';
  const textPrimary = isLight ? '#1F2937' : '#F9FAFB';
  const textSecondary = isLight ? '#6B7280' : '#9CA3AF';

  const location =
    applicant.seeker?.location?.area ??
    applicant.seeker?.location?.city ??
    'Bengaluru';

  const experience = (applicant.seeker as any)?.yearsOfExperience
    ? `${(applicant.seeker as any).yearsOfExperience} yrs exp`
    : null;

  return (
    <Pressable
      onLongPress={onLongPress}
      delayLongPress={350}
      style={({ pressed }) => ({
        backgroundColor: cardBg,
        borderWidth: 1,
        borderColor: cardBorder,
        borderRadius: radii.lg,
        padding: spacing.md,
        gap: spacing.sm,
        shadowColor: '#000',
        shadowOpacity: 0.05,
        shadowRadius: 4,
        shadowOffset: { width: 0, height: 1 },
        elevation: 1,
        opacity: pressed && onLongPress ? 0.85 : 1,
      })}
    >
      {/* ── Top row: Avatar + Info + Status badge ── */}
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md }}>
        <Avatar
          name={masked ? '·' : (applicant.seeker?.name ?? 'A')}
          photoUrl={masked ? null : (applicant.seeker?.photoUrl ?? null)}
          size={50}
          premium={applicant.seeker?.isVerified}
        />

        <View style={{ flex: 1, gap: 3 }}>
          {/* Name */}
          <Text
            style={{ fontSize: 15, fontWeight: '700', color: textPrimary }}
            numberOfLines={1}
          >
            {displayName}
          </Text>

          {/* Job title + exp */}
          <Text style={{ fontSize: 13, color: textSecondary }} numberOfLines={1}>
            {[
              showJobTitle && applicant.job?.title ? applicant.job.title : null,
              experience,
            ]
              .filter(Boolean)
              .join(' • ') || (applicant.seeker?.skills?.[0] ?? '')}
          </Text>

          {/* Location */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 2 }}>
            <Feather name="map-pin" size={11} color={textSecondary} />
            <Text style={{ fontSize: 12, color: textSecondary }}>{location}</Text>
          </View>
        </View>

        {/* Right: fit score badge + time */}
        <View style={{ alignItems: 'flex-end', gap: 4 }}>
          {fitScore !== undefined && (
            <View style={{
              paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20,
              backgroundColor:
                fitScore >= 80 ? (isLight ? '#F0FDF4' : '#052E16') :
                fitScore >= 55 ? (isLight ? '#FFFBEB' : '#2A1A00') :
                                 (isLight ? '#FEF2F2' : '#3B0A0A'),
              borderWidth: 0.5,
              borderColor:
                fitScore >= 80 ? (isLight ? '#86EFAC' : '#166534') :
                fitScore >= 55 ? (isLight ? '#FDE68A' : '#78350F') :
                                 (isLight ? '#FCA5A5' : '#7F1D1D'),
            }}>
              <Text style={{
                fontSize: 11, fontWeight: '700',
                color:
                  fitScore >= 80 ? '#15803D' :
                  fitScore >= 55 ? '#B45309' : '#DC2626',
              }}>
                {fitScore}% match
              </Text>
            </View>
          )}
          <Text style={{ fontSize: 11, color: textSecondary }}>
            {timeSince(applicant.timeline.appliedAt, t)}
          </Text>
        </View>
      </View>

      {/* ── Pipeline progress strip ── */}
      <PipelineStrip status={applicant.status} isScheduled={isScheduled} isLight={isLight} />

      {/* ── Action buttons ── */}
      <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: 2 }}>
        <AnimatedPressable
          onPress={() => {
            haptic('selection');
            navigation.navigate('ApplicantDetail', { applicationId: applicant.id });
          }}
          accessibilityRole="button"
          style={{
            flex: 1,
            paddingVertical: 9,
            borderRadius: radii.lg,
            borderWidth: 1,
            borderColor: cardBorder,
            alignItems: 'center',
          }}
        >
          <Text style={{ fontSize: 13, fontWeight: '600', color: textPrimary }}>
            View Profile
          </Text>
        </AnimatedPressable>

        <AnimatedPressable
          onPress={() => {
            haptic('selection');
            navigation.navigate('ApplicantDetail', { applicationId: applicant.id });
          }}
          accessibilityRole="button"
          style={{
            flex: 1,
            paddingVertical: 9,
            borderRadius: radii.lg,
            borderWidth: 1.5,
            borderColor: BLUE,
            alignItems: 'center',
          }}
        >
          <Text style={{ fontSize: 13, fontWeight: '700', color: BLUE }}>
            Shortlist
          </Text>
        </AnimatedPressable>
      </View>
    </Pressable>
  );
}

type PipelineStatus = 'pending' | 'shortlisted' | 'hired' | 'rejected' | string;

const PIPELINE_STEPS = [
  { key: 'pending',    label: 'Applied' },
  { key: 'shortlisted', label: 'Shortlisted' },
  { key: 'interview',  label: 'Interview' },
  { key: 'hired',      label: 'Hired' },
] as const;

function stepIndex(status: PipelineStatus, isScheduled: boolean): number {
  if (status === 'hired') return 3;
  if (isScheduled || status === 'interview') return 2;
  if (status === 'shortlisted') return 1;
  return 0;
}

function PipelineStrip({
  status,
  isScheduled,
  isLight,
}: {
  status: PipelineStatus;
  isScheduled: boolean;
  isLight: boolean;
}) {
  const active = stepIndex(status, isScheduled);
  const isRejected = status === 'rejected';

  // Pulse animation for the active dot
  const pulseScale = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.spring(pulseScale, { toValue: 1.4, useNativeDriver: true, speed: 4, bounciness: 8 }),
        Animated.spring(pulseScale, { toValue: 1.0, useNativeDriver: true, speed: 4, bounciness: 8 }),
      ]),
      { iterations: 2 },
    );
    anim.start();
    return () => anim.stop();
  }, [status]);

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
      {PIPELINE_STEPS.map((step, i) => {
        const isDone = i <= active && !isRejected;
        const isCurrent = i === active && !isRejected;
        const dotColor = isRejected ? '#EF4444' : isDone ? BLUE : (isLight ? '#D1D5DB' : '#374151');
        const labelColor = isRejected && isCurrent ? '#EF4444' : isCurrent ? BLUE : (isLight ? '#9CA3AF' : '#6B7280');

        return (
          <View key={step.key} style={{ flex: 1, alignItems: 'center', gap: 3 }}>
            {/* Dot + connecting line */}
            <View style={{ flexDirection: 'row', alignItems: 'center', width: '100%' }}>
              {i > 0 && (
                <View style={{
                  flex: 1, height: 1.5,
                  backgroundColor: i <= active && !isRejected ? BLUE : (isLight ? '#E5E7EB' : '#374151'),
                }} />
              )}
              {isCurrent ? (
                <Animated.View style={{
                  width: 10, height: 10, borderRadius: 5,
                  backgroundColor: isRejected ? '#EF4444' : BLUE,
                  transform: [{ scale: pulseScale }],
                }} />
              ) : (
                <View style={{
                  width: 7, height: 7, borderRadius: 4,
                  backgroundColor: dotColor,
                }} />
              )}
              {i < PIPELINE_STEPS.length - 1 && (
                <View style={{
                  flex: 1, height: 1.5,
                  backgroundColor: i < active && !isRejected ? BLUE : (isLight ? '#E5E7EB' : '#374151'),
                }} />
              )}
            </View>
            {/* Label */}
            <Text style={{ fontSize: 9, fontWeight: isCurrent ? '700' : '400', color: labelColor }}>
              {isRejected && isCurrent ? 'Rejected' : step.label}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

function timeSince(iso: string, t: TFn): string {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60_000);
  if (m < 1) return 'Just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `Today, ${new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  const d = Math.floor(h / 24);
  if (d === 1) return `Yesterday, ${new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  return new Date(iso).toLocaleDateString();
}
