/**
 * ApplicantCard — redesigned to match Doondo reference.
 *
 * Layout:
 *   Avatar | Name, Job • Exp | location, time | Status badge
 *   View Profile (outline) · Shortlist (blue outline)
 */

import { Pressable, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Feather } from '@expo/vector-icons';

import { spacing, radii } from '@doondo/tokens';
import { Text, Avatar } from '@/components';
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
}

const BLUE = '#2563EB';
const GREEN = '#16A34A';
const GREEN_LIGHT = '#DCFCE7';

export function ApplicantCard({ applicant, showJobTitle = false, blind = false, blindIndex, onLongPress }: Props) {
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

  const cardBg = isLight ? '#FFFFFF' : '#1A1A1A';
  const cardBorder = isLight ? '#E5E7EB' : '#2A2A2A';
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

        {/* Right: status badge + time */}
        <View style={{ alignItems: 'flex-end', gap: 4 }}>
          {isNew && (
            <View
              style={{
                backgroundColor: GREEN_LIGHT,
                borderRadius: 20,
                paddingHorizontal: 10,
                paddingVertical: 3,
              }}
            >
              <Text style={{ fontSize: 11, fontWeight: '700', color: GREEN }}>New</Text>
            </View>
          )}
          {isShortlisted && (
            <View
              style={{
                backgroundColor: '#EFF6FF',
                borderRadius: 20,
                paddingHorizontal: 10,
                paddingVertical: 3,
              }}
            >
              <Text style={{ fontSize: 11, fontWeight: '700', color: BLUE }}>Shortlisted</Text>
            </View>
          )}
          {isHired && (
            <View
              style={{
                backgroundColor: '#F0FDF4',
                borderRadius: 20,
                paddingHorizontal: 10,
                paddingVertical: 3,
              }}
            >
              <Text style={{ fontSize: 11, fontWeight: '700', color: '#15803D' }}>Hired</Text>
            </View>
          )}
          {isScheduled && (
            <View style={{ backgroundColor: '#ECFDF5', borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3,
              flexDirection: 'row', alignItems: 'center', gap: 3 }}>
              <Feather name="calendar" size={9} color="#059669" />
              <Text style={{ fontSize: 10, fontWeight: '700', color: '#059669' }}>Scheduled</Text>
            </View>
          )}
          <Text style={{ fontSize: 11, color: textSecondary }}>
            {timeSince(applicant.timeline.appliedAt, t)}
          </Text>
        </View>
      </View>

      {/* ── Action buttons ── */}
      <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: 2 }}>
        <Pressable
          onPress={() => {
            haptic('selection');
            navigation.navigate('ApplicantDetail', { applicationId: applicant.id });
          }}
          accessibilityRole="button"
          style={({ pressed }) => ({
            flex: 1,
            paddingVertical: 9,
            borderRadius: radii.lg,
            borderWidth: 1,
            borderColor: cardBorder,
            alignItems: 'center',
            opacity: pressed ? 0.75 : 1,
          })}
        >
          <Text style={{ fontSize: 13, fontWeight: '600', color: textPrimary }}>
            View Profile
          </Text>
        </Pressable>

        <Pressable
          onPress={() => {
            haptic('selection');
            // Shortlist action — navigate to detail or trigger shortlist
            navigation.navigate('ApplicantDetail', { applicationId: applicant.id });
          }}
          accessibilityRole="button"
          style={({ pressed }) => ({
            flex: 1,
            paddingVertical: 9,
            borderRadius: radii.lg,
            borderWidth: 1.5,
            borderColor: BLUE,
            alignItems: 'center',
            opacity: pressed ? 0.75 : 1,
          })}
        >
          <Text style={{ fontSize: 13, fontWeight: '700', color: BLUE }}>
            Shortlist
          </Text>
        </Pressable>
      </View>
    </Pressable>
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
