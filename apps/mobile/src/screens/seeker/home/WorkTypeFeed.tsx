/**
 * WorkTypeFeed — the Short Term / Long Term / Both job feed on Home.
 *
 * Data strategy: ONE nearby-jobs query, partitioned client-side by job
 * type. Short Term is `gig` + `shift`; Long Term is `full_time`,
 * `part_time` and `contract` (see lib/workTypeRanking.ts). Fetching once and
 * splitting locally means switching work type is instant — no refetch,
 * no spinner, no flash of the wrong feed — which is what "the Home job
 * feed must update immediately" actually requires.
 *
 * Ordering inside each feed is preference-first, then nearest-first, and
 * nothing is ever dropped: a job outside the worker's trades sinks to
 * "More jobs" rather than vanishing. See workTypeRanking.ts.
 *
 * BOTH mode never interleaves. Two labelled blocks, Short Term above
 * Long Term, so the difference between "accept work now" and "apply for
 * a job" never blurs.
 */

import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { spacing } from '@doondo/tokens';
import { Text, SkeletonCard, EmptyState, ErrorPanel } from '@/components';
import { useTheme } from '@/theme/useTheme';
import { haptic } from '@/lib/haptics';
import { jobsApi } from '@/api/jobs.api';
import { applicationsApi } from '@/api/applications.api';
import { ApiError } from '@/api/errors';
import {
  rankFeed,
  isShortTermJob,
  PRIMARY_TRADE_COUNT,
  type RankedFeed,
} from '@/lib/workTypeRanking';
import { ShortTermJobCard, LongTermJobCard } from './SeekerJobCards';
import { PreferredTradesRail } from './PreferredTradesRail';
import { QuickWorkOfferInbox } from './QuickWorkOfferInbox';
import { SEEKER_SECTION_GAP } from '@/screens/seeker/onboarding/layout';
import type { WorkTypeMode } from '@/stores/workType.store';
import type { TFn } from '@/lib/jobFormat';
import type { PublicJob } from '@/api/types';
import type { AppStackParamList } from '@/navigation/types';
import type { Coords } from '@/lib/location';

type Nav = NativeStackNavigationProp<AppStackParamList>;

/** How many cards each section shows before "View all" takes over. */
const SECTION_LIMIT = 5;
/** In BOTH mode each half is shorter, so neither dominates the screen. */
const BOTH_LIMIT = 3;

interface Props {
  mode: WorkTypeMode;
  coords: Coords | null;
  /** The worker's trade slugs, their own order. */
  trades: string[];
  t: TFn;
  gutter: number;
  onEditPreferences: () => void;
  onSelectTrade: (slug: string) => void;
  onSeeAll: () => void;
}

export function WorkTypeFeed({
  mode,
  coords,
  trades,
  t,
  gutter,
  onEditPreferences,
  onSelectTrade,
  onSeeAll,
}: Props) {
  const navigation = useNavigation<Nav>();
  const queryClient = useQueryClient();
  const [applyingId, setApplyingId] = useState<string | null>(null);

  // One query serves both feeds. `limit` is generous because we partition
  // locally — a worker in a long-term-heavy area still needs enough gig
  // rows to fill the Short Term feed, and vice versa.
  const query = useQuery({
    queryKey: ['jobs', 'work-type-feed', coords?.lat, coords?.lng],
    queryFn: () =>
      jobsApi.nearby({ lat: coords!.lat, lng: coords!.lng, radius: 15_000, limit: 60 }),
    enabled: coords !== null,
    staleTime: 60_000,
  });

  // Which jobs this worker has already applied to, so a card can show a
  // receipt instead of inviting a duplicate application.
  const appliedQuery = useQuery({
    queryKey: ['applications', 'me', 'job-ids'],
    queryFn: () => applicationsApi.listMine({ limit: 100 }),
    staleTime: 60_000,
  });

  const appliedIds = useMemo(
    () => new Set((appliedQuery.data?.applications ?? []).map((a) => a.jobId)),
    [appliedQuery.data],
  );

  const applyMutation = useMutation({
    mutationFn: (jobId: string) => applicationsApi.expressInterest(jobId),
    onSuccess: () => {
      haptic('success');
      void queryClient.invalidateQueries({ queryKey: ['applications', 'me'] });
    },
    onError: (err) => {
      haptic('error');
      // An already-existing application isn't a failure worth shouting
      // about — refetching flips the card to its "Applied" receipt.
      if (err instanceof ApiError && err.code === 'APPLICATION_ALREADY_EXISTS') {
        void queryClient.invalidateQueries({ queryKey: ['applications', 'me'] });
      }
    },
    onSettled: () => setApplyingId(null),
  });

  const jobs = query.data?.jobs ?? [];

  const { shortTerm, longTerm } = useMemo(() => {
    const s: PublicJob[] = [];
    const l: PublicJob[] = [];
    for (const job of jobs) (isShortTermJob(job) ? s : l).push(job);
    return { shortTerm: s, longTerm: l };
  }, [jobs]);

  const shortRanked = useMemo(() => rankFeed(shortTerm, trades), [shortTerm, trades]);
  const longRanked = useMemo(() => rankFeed(longTerm, trades), [longTerm, trades]);

  function openJob(job: PublicJob) {
    haptic('selection');
    navigation.navigate('JobDetail', {
      jobId: job.id,
      // Short Term detail opens on the one-tap interest CTA; long-term
      // roles keep the full Apply Now form. Both are pre-existing modes
      // on JobDetailScreen — this just routes to the right one.
      fromMode: isShortTermJob(job) ? 'today' : 'career',
    });
  }

  function applyTo(job: PublicJob) {
    setApplyingId(job.id);
    applyMutation.mutate(job.id);
  }

  const renderShort = (job: PublicJob) => (
    <ShortTermJobCard
      key={job.id}
      job={job}
      t={t}
      onPress={() => openJob(job)}
      onApply={() => applyTo(job)}
      applying={applyingId === job.id}
      applied={appliedIds.has(job.id)}
    />
  );

  const renderLong = (job: PublicJob) => (
    <LongTermJobCard key={job.id} job={job} t={t} onPress={() => openJob(job)} />
  );

  if (query.isLoading || coords === null) {
    return (
      <View style={{ gap: spacing.md }}>
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </View>
    );
  }

  if (query.isError) {
    return <ErrorPanel error={query.error} onRetry={() => void query.refetch()} />;
  }

  // BOTH mode is a summary of two feeds, not a third feed: each half is
  // one short, labelled block in rank order (preferred → other → more),
  // so the two never interleave and each keeps its heading even for a
  // worker who hasn't picked any trades yet.
  if (mode === 'BOTH') {
    return (
      <View style={{ gap: SEEKER_SECTION_GAP }}>
        <QuickWorkOfferInbox />
        <Section
          title={t('work_type.section_short')}
          jobs={flatten(shortRanked)}
          limit={BOTH_LIMIT}
          render={renderShort}
          t={t}
          onSeeAll={onSeeAll}
          emptyTitle={t('work_type.empty_short_title')}
          emptyMessage={t('work_type.empty_short_message')}
          emptyCta={{ label: t('work_type.browse_more'), onPress: onSeeAll }}
        />
        <Section
          title={t('work_type.section_long')}
          jobs={flatten(longRanked)}
          limit={BOTH_LIMIT}
          render={renderLong}
          t={t}
          onSeeAll={onSeeAll}
          emptyTitle={t('work_type.empty_long_title')}
          emptyMessage={t('work_type.empty_long_message')}
          emptyCta={{ label: t('work_type.browse_more'), onPress: onSeeAll }}
        />
      </View>
    );
  }

  return (
    <View style={{ gap: SEEKER_SECTION_GAP }}>
      {mode === 'SHORT_TERM' ? (
        <>
          {/* A live Quick Work offer is the only genuine one-tap ACCEPT in
              Doondo, so it sits above everything else when it exists.
              Renders nothing when there's no offer. */}
          <QuickWorkOfferInbox />

          <PreferredTradesRail
            slugs={trades.slice(0, PRIMARY_TRADE_COUNT)}
            t={t}
            onEdit={onEditPreferences}
            onSelect={onSelectTrade}
            gutter={gutter}
          />

          <Section
            title={t('work_type.nearest_for_you')}
            jobs={shortRanked.preferred}
            limit={SECTION_LIMIT}
            render={renderShort}
            t={t}
            onSeeAll={onSeeAll}
            emptyTitle={
              trades.length === 0
                ? t('work_type.empty_short_title')
                : t('work_type.empty_preferred_title')
            }
            emptyMessage={
              trades.length === 0
                ? t('work_type.empty_short_message')
                : t('work_type.empty_preferred_message')
            }
            emptyCta={
              trades.length === 0
                ? { label: t('work_type.browse_more'), onPress: onSeeAll }
                : { label: t('work_type.edit_preferences'), onPress: onEditPreferences }
            }
          />

          <Section
            title={t('work_type.other_preferences')}
            jobs={shortRanked.otherPreferences}
            limit={SECTION_LIMIT}
            render={renderShort}
            t={t}
            onSeeAll={onSeeAll}
            hideWhenEmpty
          />
          <Section
            title={t('work_type.more_jobs')}
            jobs={shortRanked.more}
            limit={SECTION_LIMIT}
            render={renderShort}
            t={t}
            onSeeAll={onSeeAll}
            hideWhenEmpty
          />
        </>
      ) : null}

      {mode === 'LONG_TERM' ? (
        <>
          <Section
            title={t('work_type.preferred_long_term')}
            jobs={longRanked.preferred}
            limit={SECTION_LIMIT}
            render={renderLong}
            t={t}
            onSeeAll={onSeeAll}
            emptyTitle={t('work_type.empty_long_title')}
            emptyMessage={t('work_type.empty_long_message')}
            emptyCta={{ label: t('work_type.browse_more'), onPress: onSeeAll }}
          />
          <Section
            title={t('work_type.other_long_term')}
            jobs={[...longRanked.otherPreferences, ...longRanked.more]}
            limit={SECTION_LIMIT}
            render={renderLong}
            t={t}
            onSeeAll={onSeeAll}
            hideWhenEmpty
          />
        </>
      ) : null}
    </View>
  );
}

/**
 * Flatten a ranked feed back into one list, preference order preserved:
 * headline trades, then other picked trades, then everything else. Each
 * group is already nearest-first, so the result is too, within its group.
 */
function flatten(feed: RankedFeed): PublicJob[] {
  return [...feed.preferred, ...feed.otherPreferences, ...feed.more];
}

interface SectionProps {
  title: string;
  jobs: PublicJob[];
  limit: number;
  render: (job: PublicJob) => React.ReactNode;
  t: TFn;
  onSeeAll: () => void;
  emptyTitle?: string;
  emptyMessage?: string;
  emptyCta?: { label: string; onPress: () => void };
  /** Skip the whole section (header included) when there's nothing in it. */
  hideWhenEmpty?: boolean;
}

function Section({
  title,
  jobs,
  limit,
  render,
  t,
  onSeeAll,
  emptyTitle,
  emptyMessage,
  emptyCta,
  hideWhenEmpty = false,
}: SectionProps) {
  if (jobs.length === 0 && (hideWhenEmpty || !emptyTitle)) return null;

  return (
    <View style={{ gap: spacing.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Text variant="body" weight="semibold" style={{ flex: 1 }}>
          {title}
        </Text>
        {jobs.length > limit ? (
          // Pressable + hitSlop rather than an onPress on the Text, so the
          // tap target is a real one (design brief §37 touch targets).
          <Pressable onPress={onSeeAll} hitSlop={8} accessibilityRole="button">
            <ViewAllLabel t={t} />
          </Pressable>
        ) : null}
      </View>

      {jobs.length === 0 ? (
        <EmptyState
          icon="map-pin"
          tone="primary"
          title={emptyTitle!}
          message={emptyMessage}
          cta={emptyCta}
        />
      ) : (
        <View style={{ gap: spacing.md }}>{jobs.slice(0, limit).map(render)}</View>
      )}
    </View>
  );
}

/** "View all" in brand blue — the one place this feed uses a link color. */
function ViewAllLabel({ t }: { t: TFn }) {
  const { theme } = useTheme();
  return (
    <Text variant="footnote" weight="medium" style={{ color: theme.brand.primary }}>
      {t('work_type.view_all')}
    </Text>
  );
}
