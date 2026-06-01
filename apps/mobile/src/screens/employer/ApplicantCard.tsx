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
import { useTranslate } from '@/i18n/useTranslate';
import type { ApplicantEntry } from '@/api/applications.api';
import type { ApplicationStatus } from '@/api/types';
import type { AppStackParamList } from '@/navigation/types';

type Nav = NativeStackNavigationProp<AppStackParamList>;
type TFn = (key: string, opts?: Record<string, unknown>) => string;

interface Props {
  applicant: ApplicantEntry;
  /** Show the job title above the seeker (used in cross-job list). */
  showJobTitle?: boolean;
  /**
   * Blind first-pass review. When true AND the applicant is still
   * unreviewed (pending), the photo and name are masked so the first cut
   * is made on skills + score, not on appearance or name. The mask lifts
   * the moment the employer advances the candidate (shortlists, etc.) —
   * once you've chosen to look closer, the identity is shown.
   */
  blind?: boolean;
  /** 1-based position among masked candidates → "Candidate 3". */
  blindIndex?: number;
}

export function ApplicantCard({
  applicant,
  showJobTitle = false,
  blind = false,
  blindIndex,
}: Props) {
  const navigation = useNavigation<Nav>();
  const t = useTranslate();

  // Mask only while the candidate is still in the first-pass (pending).
  const masked = blind && applicant.status === 'pending';
  const displayName = masked
    ? t('employer.blind_review.candidate_n', { n: blindIndex ?? 1 })
    : (applicant.seeker?.name ?? t('employer.applicant_card.anon'));

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
              {t('employer.applicant_card.for_job', { title: applicant.job.title })}
            </Text>
          )}

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
            <Avatar
              name={masked ? '·' : (applicant.seeker?.name ?? t('employer.applicant_card.fallback_name'))}
              photoUrl={masked ? null : (applicant.seeker?.photoUrl ?? null)}
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
                  {displayName}
                </Text>
                {applicant.seeker?.isVerified && (
                  <Pill label={t('employer.applicant_card.verified')} tone="premium" leading="★" />
                )}
                {applicant.teamSizeSnapshot && applicant.teamSizeSnapshot >= 2 ? (
                  <Pill
                    label={t('employer.applicant_card.team_of', { n: applicant.teamSizeSnapshot })}
                    tone="info"
                    leading="👥"
                  />
                ) : null}
              </View>
              <Text variant="footnote" tone="secondary" numberOfLines={1}>
                {masked
                  ? timeSince(applicant.timeline.appliedAt, t)
                  : `${applicant.seeker?.location?.area ?? applicant.seeker?.location?.city ?? '—'} · ${timeSince(applicant.timeline.appliedAt, t)}`}
              </Text>
            </View>
            <StatusPill status={applicant.status} t={t} />
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

function StatusPill({ status, t }: { status: ApplicationStatus; t: TFn }) {
  const map: Record<
    ApplicationStatus,
    { label: string; tone: 'neutral' | 'success' | 'info' | 'premium' | 'warning' }
  > = {
    pending: { label: t('employer.applicant_card.status_pending'), tone: 'info' },
    viewed: { label: t('employer.applicant_card.status_viewed'), tone: 'neutral' },
    shortlisted: { label: t('employer.applicant_card.status_shortlisted'), tone: 'success' },
    rejected: { label: t('employer.applicant_card.status_rejected'), tone: 'neutral' },
    hired: { label: t('employer.applicant_card.status_hired'), tone: 'premium' },
    withdrawn: { label: t('employer.applicant_card.status_withdrawn'), tone: 'neutral' },
  };
  const { label, tone } = map[status];
  return <Pill label={label} tone={tone} />;
}

function timeSince(iso: string, t: TFn): string {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60_000);
  if (m < 1) return t('employer.applicant_card.time_just_now');
  if (m < 60) return t('employer.applicant_card.time_minutes_ago', { n: m });
  const h = Math.floor(m / 60);
  if (h < 24) return t('employer.applicant_card.time_hours_ago', { n: h });
  const d = Math.floor(h / 24);
  if (d < 7) return t('employer.applicant_card.time_days_ago', { n: d });
  return new Date(iso).toLocaleDateString();
}
