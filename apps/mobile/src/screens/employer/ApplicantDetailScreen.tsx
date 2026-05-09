/**
 * ApplicantDetailScreen — modal with full applicant context + actions.
 *
 * Shows the seeker's avatar, skills, location, cover note (if any), and
 * the job they applied to. Action row at the bottom drives the state
 * machine: Mark viewed → Shortlist → Hire / Reject. Buttons disable
 * once they're no longer valid.
 *
 * Hire reuses the cinematic ApplyCelebration flow shape — a champagne
 * burst with "You hired {name}." So the human moment is mirrored on
 * both sides of the marketplace.
 */

import { useEffect, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { spacing } from '@doondo/tokens';
import { Screen, Text, Pill, Card, Button, Avatar, SkeletonCard, EmptyState } from '@/components';
import { useTheme } from '@/theme/useTheme';
import { applicationsApi, type ApplicantEntry } from '@/api/applications.api';
import { haptic } from '@/lib/haptics';
import { ApplyCelebration } from '../seeker/apply-moment/ApplyCelebration';
import type { AppStackParamList } from '@/navigation/types';
import type { ApplicationStatus } from '@/api/types';

type Nav = NativeStackNavigationProp<AppStackParamList, 'ApplicantDetail'>;
type Route = RouteProp<AppStackParamList, 'ApplicantDetail'>;

export function ApplicantDetailScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const queryClient = useQueryClient();
  const [showHired, setShowHired] = useState(false);

  // We keep the applicant detail in cache (seeded from list views) when
  // possible, but always refetch to ensure fresh status.
  const query = useQuery({
    queryKey: ['applicants', 'detail', route.params.applicationId],
    queryFn: async () => {
      // Reuse the list endpoint — applicant detail isn't a separate route
      // yet (it'd be a one-applicant fetch). The flat /applications/:id
      // endpoint already exists for seeker side, but it filters by
      // seekerId. For Phase 3 v1, we read from the cross-employer list
      // and pluck the matching one.
      const { applications } = await applicationsApi.listForEmployer({ limit: 100 });
      const found = applications.find((a) => a.id === route.params.applicationId);
      if (!found) throw new Error('Applicant not found');
      return found;
    },
  });

  // Auto-mark as viewed the first time the employer opens this card.
  useEffect(() => {
    if (query.data && query.data.status === 'pending') {
      void applicationsApi
        .markViewed(query.data.id)
        .then(() =>
          queryClient.invalidateQueries({ queryKey: ['applicants', 'detail', query.data!.id] }),
        )
        .catch(() => undefined);
    }
  }, [query.data?.id, query.data?.status, queryClient]);

  const transition = useMutation({
    mutationFn: async (next: 'shortlisted' | 'rejected' | 'hired') => {
      const id = query.data!.id;
      if (next === 'shortlisted') return applicationsApi.shortlist(id);
      if (next === 'rejected') return applicationsApi.reject(id);
      return applicationsApi.hire(id);
    },
    onSuccess: (_, variables) => {
      haptic('success');
      void queryClient.invalidateQueries({ queryKey: ['applicants'] });
      void queryClient.invalidateQueries({ queryKey: ['jobs', 'mine'] });
      if (variables === 'hired') {
        setShowHired(true);
      } else {
        navigation.goBack();
      }
    },
    onError: () => haptic('error'),
  });

  if (query.isLoading) {
    // Skeleton arrangement that mirrors the loaded layout silhouette —
    // identity header → job-context block → skills/note rows.
    return (
      <Screen>
        <ScrollView
          contentContainerStyle={{
            padding: spacing.xl,
            paddingTop: spacing['3xl'],
            gap: spacing.lg,
          }}
        >
          <SkeletonCard lines={3} />
          <SkeletonCard lines={2} />
          <SkeletonCard lines={4} />
        </ScrollView>
      </Screen>
    );
  }

  if (query.isError || !query.data) {
    return (
      <Screen>
        <View style={{ flex: 1, justifyContent: 'center' }}>
          <EmptyState
            glyph="✕"
            tone="warning"
            eyebrow="UNAVAILABLE"
            title="Couldn't load this applicant"
            message="They may have withdrawn, or your connection dropped."
            cta={{ label: 'Close', onPress: () => navigation.goBack() }}
          />
        </View>
      </Screen>
    );
  }

  const applicant = query.data;

  return (
    <Screen>
      {showHired && (
        <ApplyCelebration
          onClose={() => {
            setShowHired(false);
            navigation.goBack();
          }}
        />
      )}
      <ScrollView
        contentContainerStyle={{
          padding: spacing.xl,
          paddingTop: spacing['3xl'],
          paddingBottom: spacing['7xl'],
          gap: spacing['2xl'],
        }}
      >
        <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
          <Text variant="footnote" tone="secondary">
            ← Back
          </Text>
        </Pressable>

        {/* Identity */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.lg }}>
          <Avatar
            name={applicant.seeker?.name ?? 'Applicant'}
            photoUrl={applicant.seeker?.photoUrl}
            size={92}
            premium={applicant.seeker?.isVerified}
          />
          <View style={{ flex: 1, gap: spacing.xs }}>
            <Text variant="caption" tone="tertiary" style={{ letterSpacing: 1.2 }}>
              {(applicant.status === 'pending' ? 'NEW APPLICANT' : applicant.status.toUpperCase())}
            </Text>
            <Text variant="display" weight="medium" display>
              {applicant.seeker?.name ?? 'Applicant'}
            </Text>
            {applicant.seeker?.location && (
              <Text variant="footnote" tone="secondary">
                {[applicant.seeker.location.area, applicant.seeker.location.city]
                  .filter(Boolean)
                  .join(', ') || '—'}
              </Text>
            )}
          </View>
        </View>

        {/* Job context */}
        {applicant.job && (
          <Card>
            <View style={{ gap: spacing.xs }}>
              <Text
                variant="footnote"
                weight="medium"
                tone="secondary"
                style={{ letterSpacing: 1.0 }}
              >
                APPLIED TO
              </Text>
              <Text variant="bodyLarge" weight="medium">
                {applicant.job.title}
              </Text>
            </View>
          </Card>
        )}

        {/* Skills */}
        {(applicant.seeker?.skills.length ?? 0) > 0 && (
          <View style={{ gap: spacing.sm }}>
            <Text
              variant="footnote"
              weight="medium"
              tone="secondary"
              style={{ letterSpacing: 1.0 }}
            >
              SKILLS
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
              {applicant.seeker!.skills.map((s) => (
                <Pill key={s} label={s} tone="neutral" />
              ))}
            </View>
          </View>
        )}

        {/* Cover note */}
        {applicant.coverNote && (
          <View style={{ gap: spacing.sm }}>
            <Text
              variant="footnote"
              weight="medium"
              tone="secondary"
              style={{ letterSpacing: 1.0 }}
            >
              COVER NOTE
            </Text>
            <Card>
              <Text variant="body">{applicant.coverNote}</Text>
            </Card>
          </View>
        )}

        {/* Actions */}
        <ActionPanel applicant={applicant} onAction={(t) => transition.mutate(t)} pending={transition.isPending} />
      </ScrollView>
    </Screen>
  );
}

function ActionPanel({
  applicant,
  onAction,
  pending,
}: {
  applicant: ApplicantEntry;
  onAction: (t: 'shortlisted' | 'rejected' | 'hired') => void;
  pending: boolean;
}) {
  const { theme } = useTheme();
  const status = applicant.status;
  const terminal = status === 'rejected' || status === 'hired' || status === 'withdrawn';

  if (terminal) {
    return (
      <Card>
        <View style={{ gap: spacing.xs, alignItems: 'center' }}>
          <Text variant="bodyLarge" weight="medium">
            {status === 'hired'
              ? 'You hired them.'
              : status === 'rejected'
                ? 'You declined this applicant.'
                : 'They withdrew their application.'}
          </Text>
        </View>
      </Card>
    );
  }

  const canShortlist = status === 'pending' || status === 'viewed';
  const canHire = status === 'shortlisted';

  return (
    <View style={{ gap: spacing.sm }}>
      {canHire ? (
        <Button
          label={pending ? 'Hiring…' : 'Hire'}
          onPress={() => onAction('hired')}
          disabled={pending}
        />
      ) : canShortlist ? (
        <Button
          label={pending ? 'Saving…' : 'Shortlist'}
          onPress={() => onAction('shortlisted')}
          disabled={pending}
        />
      ) : null}
      <Button
        label={pending ? 'Saving…' : 'Decline'}
        variant="secondary"
        onPress={() => onAction('rejected')}
        disabled={pending}
      />
    </View>
  );
}
