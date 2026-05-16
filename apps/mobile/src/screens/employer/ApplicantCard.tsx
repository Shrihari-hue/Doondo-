/**
 * ApplicantCard — shared card used in both ApplicantsScreen (cross-job)
 * and JobApplicantsScreen (per-job). Compact: avatar + name + status pill
 * + skills + time-since-applied. Tap → ApplicantDetail.
 */

import { Pressable, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { spacing } from '@doondo/tokens';
import { Text, Pill, Card, Avatar } from '@/components';
import type { ApplicantEntry } from '@/api/applications.api';
import type { ApplicationStatus } from '@/api/types';
import type { AppStackParamList } from '@/navigation/types';

type Nav = NativeStackNavigationProp<AppStackParamList>;

interface Props {
  applicant: ApplicantEntry;
  /** Show the job title above the seeker (used in cross-job list). */
  showJobTitle?: boolean;
}

export function ApplicantCard({ applicant, showJobTitle = false }: Props) {
  const navigation = useNavigation<Nav>();

  return (
    <Pressable
      onPress={() =>
        navigation.navigate('ApplicantDetail', { applicationId: applicant.id })
      }
    >
      <Card premium={applicant.seeker?.isVerified}>
        <View style={{ gap: spacing.sm }}>
          {showJobTitle && applicant.job && (
            <Text variant="footnote" tone="tertiary" numberOfLines={1}>
              for {applicant.job.title}
            </Text>
          )}

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
            <Avatar
              name={applicant.seeker?.name ?? 'Applicant'}
              photoUrl={applicant.seeker?.photoUrl ?? null}
              size={48}
              premium={applicant.seeker?.isVerified}
            />
            <View style={{ flex: 1, gap: 2 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
                <Text
                  variant="bodyLarge"
                  weight="medium"
                  numberOfLines={1}
                  style={{ flexShrink: 1 }}
                >
                  {applicant.seeker?.name ?? 'Anonymous'}
                </Text>
                {applicant.seeker?.isVerified && (
                  <Pill label="Verified" tone="premium" leading="★" />
                )}
                {applicant.teamSizeSnapshot && applicant.teamSizeSnapshot >= 2 ? (
                  <Pill
                    label={`Team of ${applicant.teamSizeSnapshot}`}
                    tone="info"
                    leading="👥"
                  />
                ) : null}
              </View>
              <Text variant="footnote" tone="secondary" numberOfLines={1}>
                {applicant.seeker?.location?.area ?? applicant.seeker?.location?.city ?? '—'}
                {' · '}
                {timeSince(applicant.timeline.appliedAt)}
              </Text>
            </View>
            <StatusPill status={applicant.status} />
          </View>

          {(applicant.seeker?.skills.length ?? 0) > 0 && (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
              {applicant.seeker!.skills.slice(0, 4).map((s) => (
                <Pill key={s} label={s} tone="neutral" />
              ))}
            </View>
          )}
        </View>
      </Card>
    </Pressable>
  );
}

function StatusPill({ status }: { status: ApplicationStatus }) {
  const map: Record<
    ApplicationStatus,
    { label: string; tone: 'neutral' | 'success' | 'info' | 'premium' | 'warning' }
  > = {
    pending: { label: 'New', tone: 'info' },
    viewed: { label: 'Viewed', tone: 'neutral' },
    shortlisted: { label: 'Shortlisted', tone: 'success' },
    rejected: { label: 'Rejected', tone: 'neutral' },
    hired: { label: 'Hired', tone: 'premium' },
    withdrawn: { label: 'Withdrawn', tone: 'neutral' },
  };
  const { label, tone } = map[status];
  return <Pill label={label} tone={tone} />;
}

function timeSince(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}
