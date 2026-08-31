/**
 * EmployerDetailScreen — the public "About this employer" page.
 *
 * Reached two ways:
 *   1. From a JobDetail screen via the "About employer" link.
 *   2. From a chat thread header tap.
 *
 * The trust card a seeker pulls up before deciding to apply. Renders:
 *   - Hero: company name + business type + verified badge + rating
 *   - Stats strip: Jobs · Hires · Member since
 *   - Recent active jobs (tap → JobDetail)
 *
 * No edit affordances here — that lives on the employer's own EmployerProfile
 * tab. This screen is read-only and public.
 */

import { Alert, FlatList, Pressable, RefreshControl, View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';

import { spacing, radii, blue } from '@doondo/tokens';
import { Screen, Text, LoadingSpinner, EmptyState, Avatar, Stars } from '@/components';
import { useTheme } from '@/theme/useTheme';
import { SeekerThemeOverride } from '@/theme/SeekerThemeOverride';
import { employersApi, type EmployerProfile } from '@/api/employers.api';
import { ratingsApi, type TagSummary, type TagSummaryEntry } from '@/api/ratings.api';
import { wageFlagsApi } from '@/api/wageFlags.api';
import { employerInterestApi } from '@/api/employerInterest.api';
import { favoritesApi } from '@/api/favorites.api';
import { haptic } from '@/lib/haptics';
import { useTranslate } from '@/i18n/useTranslate';
import type { AppStackParamList } from '@/navigation/types';
import type { PublicJob } from '@/api/types';

type Nav = NativeStackNavigationProp<AppStackParamList>;
type Route = RouteProp<AppStackParamList, 'EmployerDetail'>;
type TFn = (key: string, opts?: Record<string, unknown>) => string;

function EmployerDetailInner() {
  const { theme } = useTheme();
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const insets = useSafeAreaInsets();
  const t = useTranslate();
  const { userId } = route.params;

  const query = useQuery({
    queryKey: ['employer', userId],
    queryFn: () => employersApi.getProfile(userId),
    staleTime: 60_000,
  });

  // Aggregated structured-tag signal — "Workers say…" badges. Independent
  // of the main profile query so a slow ratings aggregation never blocks
  // the page render. Re-runs when the employer id changes.
  const tagSummaryQuery = useQuery({
    queryKey: ['employer', userId, 'tagSummary'],
    queryFn: () => ratingsApi.tagSummary(userId, 'employer'),
    staleTime: 60_000,
  });

  // Wage Strike Alerts (#46) — aggregate-only signal, withheld below a
  // volume threshold server-side. Independent query, same reasoning as
  // tagSummaryQuery above.
  const wageFlagsQuery = useQuery({
    queryKey: ['employer', userId, 'wageFlagsSummary'],
    queryFn: () => wageFlagsApi.summaryForEmployer(userId),
    staleTime: 60_000,
  });

  const onJobPress = (jobId: string) => {
    haptic('selection');
    navigation.navigate('JobDetail', { jobId });
  };

  if (query.isLoading) {
    return (
      <Screen>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <LoadingSpinner />
        </View>
      </Screen>
    );
  }

  if (query.isError || !query.data) {
    return (
      <Screen>
        <EmptyState
          title={t('employer_detail.error_title')}
          message={t('employer_detail.error_message')}
          cta={{
            label: t('employer_detail.retry'),
            onPress: () => {
              haptic('selection');
              void query.refetch();
            },
          }}
        />
      </Screen>
    );
  }

  const profile = query.data;
  const { employer, stats, recentJobs } = profile;
  const displayName = employer.companyName ?? employer.name;

  return (
    <Screen edges={[]}>
      <FlatList
        data={recentJobs}
        keyExtractor={(j) => j.id}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={query.isRefetching}
            onRefresh={() => void query.refetch()}
            tintColor={theme.brand.accent}
          />
        }
        ListHeaderComponent={
          <View>
            <Header
              profile={profile}
              insets={insets}
              displayName={displayName}
              onBack={() => navigation.goBack()}
              t={t}
            />
            <ResponsivenessBanner stats={profile.stats} />
            {wageFlagsQuery.data?.summary.hasSignal && (
              <WageSignalBanner summary={wageFlagsQuery.data.summary} />
            )}
            {tagSummaryQuery.data && (
              <TagSummaryPanel summary={tagSummaryQuery.data} />
            )}
            <InterestButton employerId={userId} employerName={displayName} />
            <FavoriteEmployerButton employerId={userId} />
          </View>
        }
        ListEmptyComponent={
          <EmptyState
            glyph="📭"
            eyebrow={t('employer_detail.no_active_eyebrow')}
            title={t('employer_detail.no_active_title')}
            message={t('employer_detail.no_active_message', { name: displayName })}
          />
        }
        contentContainerStyle={{
          paddingBottom: spacing['5xl'],
        }}
        ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
        renderItem={({ item }) => (
          <View style={{ paddingHorizontal: spacing.xl }}>
            <JobRow job={item} onPress={() => onJobPress(item.id)} t={t} />
          </View>
        )}
        ListFooterComponent={
          stats.jobsCount > stats.activeJobsCount ? (
            <Text
              style={{
                fontSize: 11,
                color: theme.text.tertiary,
                textAlign: 'center',
                marginTop: spacing.lg,
                paddingHorizontal: spacing.xl,
              }}
            >
              {t('employer_detail.older_jobs_footer', {
                count: stats.jobsCount - stats.activeJobsCount,
                n: stats.jobsCount - stats.activeJobsCount,
              })}
            </Text>
          ) : null
        }
      />
    </Screen>
  );
}

// ─── Responsiveness (anti-ghost) banner ─────────────────────────────────────

/**
 * Surfaces the employer's anti-ghost track record.
 *
 * The backend stamps `flaggedAsGhostedAt` on applications this employer
 * left unanswered past the SLA window. We render a banner only when the
 * signal is meaningful:
 *   - `ghostRate` is null below 5 applications → no banner (too little data).
 *   - ghostRate >= 0.25 → amber "slow to respond" warning.
 *   - ghostRate <= 0.05 with real volume → quiet green "responsive" affirmation.
 *   - in between → no banner (unremarkable, don't add noise).
 *
 * This is the seeker-facing half of the anti-ghost feature: the sweep
 * flags, and this is where a worker SEES the flag before they apply.
 */
function ResponsivenessBanner({
  stats,
}: {
  stats: import('@/api/employers.api').EmployerStats;
}) {
  const { theme } = useTheme();
  const t = useTranslate();
  if (stats.ghostRate === null) return null;

  const slow = stats.ghostRate >= 0.25;
  const responsive = stats.ghostRate <= 0.05;
  if (!slow && !responsive) return null;

  const pct = Math.round(stats.ghostRate * 100);

  return (
    <View
      style={{
        marginHorizontal: spacing.xl,
        marginTop: spacing.lg,
        marginBottom: spacing.xs,
        padding: spacing.md,
        borderRadius: radii.lg,
        borderWidth: 0.5,
        borderColor: slow ? theme.status.warningBorder : theme.status.successBorder,
        backgroundColor: slow
          ? theme.status.warningSubtle
          : theme.status.successSubtle,
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
      }}
    >
      <Text style={{ fontSize: 16 }}>{slow ? '🐌' : '⚡'}</Text>
      <View style={{ flex: 1, gap: 2 }}>
        <Text
          variant="footnote"
          weight="medium"
          style={{ color: slow ? theme.status.warning : theme.status.success }}
        >
          {slow
            ? t('employer_signals.slow_title')
            : t('employer_signals.responsive_title')}
        </Text>
        <Text variant="caption" tone="secondary">
          {slow
            ? t('employer_signals.slow_body', { pct })
            : t('employer_signals.responsive_body')}
        </Text>
      </View>
    </View>
  );
}

// ─── Wage Strike Alerts (#46) ───────────────────────────────────────────────

/**
 * Aggregate-only wage-issue signal. Deliberately non-accusatory copy —
 * "workers report", never "this employer does X" — and the underlying
 * query already withholds any signal below MIN_SIGNAL_FLAGS server-side,
 * so by the time this renders there's real volume behind it. Individual
 * reports are never shown; this is the entire public surface.
 */
function WageSignalBanner({
  summary,
}: {
  summary: Extract<import('@/api/wageFlags.api').WageFlagSummary, { hasSignal: true }>;
}) {
  const { theme } = useTheme();
  const t = useTranslate();
  const top = summary.reasons[0];
  if (!top) return null;

  return (
    <View
      style={{
        marginHorizontal: spacing.xl,
        marginTop: spacing.lg,
        marginBottom: spacing.xs,
        padding: spacing.md,
        borderRadius: radii.lg,
        borderWidth: 0.5,
        borderColor: theme.status.warningBorder,
        backgroundColor: theme.status.warningSubtle,
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
      }}
    >
      <Text style={{ fontSize: 16 }}>💰</Text>
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="footnote" weight="medium" style={{ color: theme.status.warning }}>
          {t('employer_signals.wage_flag_title', { n: summary.totalFlags })}
        </Text>
        <Text variant="caption" tone="secondary">
          {t(`employer_signals.wage_flag_reason_${top.reason}`, { pct: Math.round(top.ratio * 100) })}
        </Text>
      </View>
    </View>
  );
}

// ─── Workers say… (tag summary) ────────────────────────────────────────────

/**
 * Renders the aggregated structured-tag signal from prior reviews.
 *
 * Visual rules:
 *   - Up to 6 positive tags shown as green chips with the ratio
 *     ("Paid on time · 92%"). Empty tags are filtered out so a
 *     no-review employer doesn't show a wall of zeroes.
 *   - Negative tags (paid late, felt unsafe) get a warning chip when
 *     their ratio exceeds 25%. Below that threshold they're hidden —
 *     one disgruntled reviewer shouldn't define an employer.
 *   - When the employer has zero reviews, the panel renders a quiet
 *     "Not enough reviews yet" line so the missing data is acknowledged.
 *   - The whole panel is hidden if there aren't enough reviews to
 *     compute meaningful ratios (< 3).
 */
function TagSummaryPanel({ summary }: { summary: TagSummary }) {
  const { theme } = useTheme();
  const t = useTranslate();

  // Volume gate — below 3 reviews ratios are too noisy to surface.
  if (summary.totalReviews < 3) return null;

  const positive = summary.tags
    .filter((t) => t.polarity === 'positive' && t.count > 0)
    .sort((a, b) => b.ratio - a.ratio)
    .slice(0, 6);
  const negative = summary.tags
    .filter((t) => t.polarity === 'negative' && t.ratio >= 0.25)
    .sort((a, b) => b.ratio - a.ratio)
    .slice(0, 3);

  if (positive.length === 0 && negative.length === 0) return null;

  return (
    <View
      style={{
        marginHorizontal: spacing.xl,
        marginTop: spacing.lg,
        marginBottom: spacing.md,
        padding: spacing.lg,
        borderRadius: radii.lg,
        borderWidth: 0.5,
        borderColor: theme.border.default,
        backgroundColor: theme.bg.surface,
        gap: spacing.md,
      }}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'baseline',
          justifyContent: 'space-between',
        }}
      >
        <Text variant="caption" tone="tertiary" style={{ letterSpacing: 1.2 }}>
          {t('employer_signals.workers_say')}
        </Text>
        <Text variant="caption" tone="tertiary">
          {t(
            summary.totalReviews === 1
              ? 'employer_signals.reviews_one'
              : 'employer_signals.reviews_other',
            { count: summary.totalReviews },
          )}
        </Text>
      </View>

      {positive.length > 0 && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
          {positive.map((tag) => (
            <TagChip key={tag.slug} tag={tag} variant="positive" />
          ))}
        </View>
      )}

      {negative.length > 0 && (
        <View style={{ gap: spacing.xs }}>
          <Text variant="caption" tone="tertiary" style={{ letterSpacing: 1.0 }}>
            HEADS UP
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
            {negative.map((tag) => (
              <TagChip key={tag.slug} tag={tag} variant="negative" />
            ))}
          </View>
        </View>
      )}
    </View>
  );
}

function TagChip({
  tag,
  variant,
}: {
  tag: TagSummaryEntry;
  variant: 'positive' | 'negative';
}) {
  const { theme } = useTheme();
  const t = useTranslate();
  const bg =
    variant === 'positive' ? theme.status.successSubtle : theme.status.warningSubtle;
  const border =
    variant === 'positive' ? theme.status.successBorder : theme.status.warningBorder;
  const color =
    variant === 'positive' ? theme.status.success : theme.status.warning;
  const pct = Math.round(tag.ratio * 100);
  return (
    <View
      style={{
        paddingVertical: spacing.xs,
        paddingHorizontal: spacing.md,
        borderRadius: radii.pill,
        borderWidth: 0.5,
        borderColor: border,
        backgroundColor: bg,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
      }}
    >
      <Text variant="footnote" weight="medium" style={{ color }}>
        {t(`review_tags.${tag.slug}`)}
      </Text>
      <Text variant="caption" weight="medium" style={{ color, opacity: 0.85 }}>
        · {pct}%
      </Text>
    </View>
  );
}

// ─── Header ──────────────────────────────────────────────────────────────────

function Header({
  profile,
  insets,
  displayName,
  onBack,
  t,
}: {
  profile: EmployerProfile;
  insets: { top: number };
  displayName: string;
  onBack: () => void;
  t: TFn;
}) {
  const { theme } = useTheme();
  const { employer, stats } = profile;
  const memberSince = formatMemberSince(employer.createdAt);
  const subtitle = [
    employer.businessType ? prettyBusinessType(employer.businessType) : null,
    employer.employerLocation?.city ?? employer.location?.city ?? null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <View>
      <LinearGradient
        colors={[blue[700], blue[600], blue[500]]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{
          paddingTop: insets.top + spacing.md,
          paddingHorizontal: spacing.xl,
          paddingBottom: spacing.xl + spacing.lg,
          borderBottomLeftRadius: radii.xl,
          borderBottomRightRadius: radii.xl,
        }}
      >
        {/* Top row — back + title */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing.md,
            marginBottom: spacing.xl,
          }}
        >
          <Pressable onPress={onBack} hitSlop={12}>
            <Text style={{ fontSize: 22, color: '#FFFFFF' }}>←</Text>
          </Pressable>
          <Text
            style={{ fontSize: 17, fontWeight: '600', color: '#FFFFFF', flex: 1 }}
            numberOfLines={1}
          >
            {t('employer_detail.header_title')}
          </Text>
        </View>

        {/* Avatar + identity */}
        <View style={{ flexDirection: 'row', gap: spacing.lg, alignItems: 'center' }}>
          <Avatar
            photoUrl={employer.photoUrl ?? null}
            name={displayName}
            size={72}
          />
          <View style={{ flex: 1, gap: 4 }}>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: spacing.xs,
                flexWrap: 'wrap',
              }}
            >
              <Text
                style={{
                  fontSize: 22,
                  fontWeight: '700',
                  color: '#FFFFFF',
                  letterSpacing: -0.5,
                }}
                numberOfLines={2}
              >
                {displayName}
              </Text>
              {employer.isVerified && (
                <View
                  style={{
                    paddingHorizontal: 8,
                    paddingVertical: 2,
                    borderRadius: radii.pill,
                    backgroundColor: 'rgba(255,255,255,0.22)',
                    borderWidth: 0.5,
                    borderColor: 'rgba(255,255,255,0.45)',
                  }}
                >
                  <Text style={{ fontSize: 10, color: '#FFFFFF', fontWeight: '700' }}>
                    {t('employer_detail.verified_badge')}
                  </Text>
                </View>
              )}
            </View>
            {subtitle ? (
              <Text
                style={{ color: 'rgba(255,255,255,0.85)', fontSize: 13 }}
                numberOfLines={1}
              >
                {subtitle}
              </Text>
            ) : null}
            {employer.rating ? (
              <View style={{ marginTop: 2 }}>
                <Stars
                  score={employer.rating.avg}
                  count={employer.rating.count}
                  compact
                  style={{ color: '#FFFFFF' }}
                />
              </View>
            ) : (
              <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12 }}>
                {t('employer_detail.no_ratings')}
              </Text>
            )}
          </View>
        </View>
      </LinearGradient>

      {/* Stats strip — overlaps hero bottom */}
      <View
        style={{
          flexDirection: 'row',
          marginTop: -spacing.lg,
          marginHorizontal: spacing.xl,
          backgroundColor: theme.bg.surface,
          borderRadius: radii.lg,
          borderWidth: 0.5,
          borderColor: theme.border.subtle,
          shadowColor: '#0F172A',
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.08,
          shadowRadius: 12,
          elevation: 3,
        }}
      >
        <Stat label={t('employer_detail.stat_jobs')} value={stats.jobsCount} />
        <Divider />
        <Stat label={t('employer_detail.stat_hires')} value={stats.hiresCount} />
        <Divider />
        <Stat label={t('employer_detail.stat_member')} value={memberSince} />
      </View>

      {/* Bio */}
      {profile.employer.bio ? (
        <View
          style={{
            paddingHorizontal: spacing.xl,
            paddingTop: spacing.xl,
          }}
        >
          <Text
            style={{
              fontSize: 11,
              fontWeight: '600',
              letterSpacing: 1.6,
              color: theme.text.tertiary,
              marginBottom: spacing.sm,
            }}
          >
            {t('employer_detail.section_about')}
          </Text>
          <Text style={{ fontSize: 14, lineHeight: 21, color: theme.text.secondary }}>
            {profile.employer.bio}
          </Text>
        </View>
      ) : null}

      {/* Section label */}
      <View
        style={{
          paddingHorizontal: spacing.xl,
          paddingTop: spacing.xl,
          paddingBottom: spacing.sm,
        }}
      >
        <Text
          style={{
            fontSize: 11,
            fontWeight: '600',
            letterSpacing: 1.6,
            color: theme.text.tertiary,
          }}
        >
          {t('employer_detail.active_jobs_section', { n: stats.activeJobsCount })}
        </Text>
      </View>
    </View>
  );
}

// ─── Pieces ──────────────────────────────────────────────────────────────────

function Stat({ label, value }: { label: string; value: string | number }) {
  const { theme } = useTheme();
  return (
    <View
      style={{
        flex: 1,
        paddingVertical: spacing.md,
        paddingHorizontal: spacing.sm,
        alignItems: 'center',
      }}
    >
      <Text
        style={{
          fontSize: 18,
          fontWeight: '700',
          color: theme.text.primary,
          letterSpacing: -0.3,
        }}
      >
        {value}
      </Text>
      <Text
        style={{
          fontSize: 10,
          color: theme.text.tertiary,
          marginTop: 2,
          fontWeight: '500',
          letterSpacing: 0.3,
        }}
        numberOfLines={1}
      >
        {label}
      </Text>
    </View>
  );
}

function Divider() {
  const { theme } = useTheme();
  return (
    <View
      style={{
        width: 0.5,
        marginVertical: spacing.sm,
        backgroundColor: theme.border.subtle,
      }}
    />
  );
}

function JobRow({ job, onPress, t }: { job: PublicJob; onPress: () => void; t: TFn }) {
  const { theme } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        backgroundColor: theme.bg.surface,
        borderRadius: radii.lg,
        borderWidth: 0.5,
        borderColor: theme.border.subtle,
        padding: spacing.md,
        opacity: pressed ? 0.7 : 1,
        shadowColor: '#0F172A',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.04,
        shadowRadius: 6,
        elevation: 1,
      })}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
        <View style={{ flex: 1, gap: 4 }}>
          <Text
            style={{
              fontSize: 15,
              fontWeight: '600',
              color: theme.text.primary,
            }}
            numberOfLines={1}
          >
            {job.title}
          </Text>
          <Text style={{ fontSize: 12, color: theme.text.tertiary }} numberOfLines={1}>
            {formatPay(job.pay, t)} · {job.location.area ?? job.location.city}
          </Text>
        </View>
        <Text style={{ fontSize: 18, color: theme.text.tertiary }}>›</Text>
      </View>
    </Pressable>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatMemberSince(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
}

function prettyBusinessType(t: string): string {
  // 'restaurant' → 'Restaurant'
  return t.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatPay(pay: PublicJob['pay'], t: TFn): string {
  const rupees = Math.round(pay.amount / 100);
  const periodLabel: Record<PublicJob['pay']['period'], string> = {
    hour: t('job.pay_period.suffix_hour'),
    day: t('job.pay_period.suffix_day'),
    week: t('job.pay_period.suffix_week'),
    month: t('job.pay_period.suffix_month'),
    fixed: t('job.pay_period.suffix_fixed'),
  };
  return `₹${rupees.toLocaleString('en-IN')}${periodLabel[pay.period]}`;
}

// ─── Express interest ───────────────────────────────────────────────────────

/**
 * Lets the worker raise a standing "I'd like to work for you" signal —
 * the inbound half of two-way discovery. Works even when the employer
 * has no live job posted; the employer sees it in their Find-workers
 * "Interested in you" list.
 */
/**
 * A heart toggle letting the worker favourite this employer. Favouriting
 * boosts the employer's reputation signal ("N workers favourited you") and
 * marks them as one the worker wants to hear from.
 */
function FavoriteEmployerButton({ employerId }: { employerId: string }) {
  const { theme } = useTheme();
  const t = useTranslate();
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ['employer-favorite', employerId],
    queryFn: () => favoritesApi.status(employerId),
  });
  const favorited = query.data?.favorited ?? false;

  const mutation = useMutation({
    mutationFn: () => favoritesApi.set(employerId, !favorited),
    onSuccess: () => {
      haptic('selection');
      void queryClient.invalidateQueries({ queryKey: ['employer-favorite', employerId] });
    },
  });

  return (
    <Pressable
      onPress={() => mutation.mutate()}
      disabled={mutation.isPending}
      accessibilityRole="button"
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        paddingVertical: 10,
        borderRadius: 999,
        borderWidth: 0.5,
        borderColor: favorited ? theme.brand.primary : theme.border.default,
        backgroundColor: favorited ? theme.brand.primarySubtle : 'transparent',
      }}
    >
      <Text style={{ fontSize: 15 }}>{favorited ? '♥' : '♡'}</Text>
      <Text variant="footnote" weight="medium" style={{ color: favorited ? theme.brand.primary : theme.text.secondary }}>
        {favorited ? t('employer_detail.favorited') : t('employer_detail.favorite')}
      </Text>
    </Pressable>
  );
}

function InterestButton({
  employerId,
  employerName,
}: {
  employerId: string;
  employerName: string;
}) {
  const { theme } = useTheme();
  const queryClient = useQueryClient();

  const mineQuery = useQuery({
    queryKey: ['employerInterest', 'mine', employerId],
    queryFn: () => employerInterestApi.mine(employerId),
    staleTime: 30_000,
  });
  const interest = mineQuery.data?.interest ?? null;
  const hasInterest = interest !== null && interest.status !== 'archived';

  const invalidate = () =>
    queryClient.invalidateQueries({
      queryKey: ['employerInterest', 'mine', employerId],
    });

  const expressMutation = useMutation({
    mutationFn: () => employerInterestApi.express(employerId),
    onSuccess: () => {
      haptic('success');
      void invalidate();
    },
    onError: () => {
      haptic('error');
      Alert.alert('Could not send', 'Please try again.');
    },
  });

  const withdrawMutation = useMutation({
    mutationFn: () => employerInterestApi.withdraw(employerId),
    onSuccess: () => {
      haptic('selection');
      void invalidate();
    },
    onError: () => {
      haptic('error');
      Alert.alert('Could not update', 'Please try again.');
    },
  });

  const busy = expressMutation.isPending || withdrawMutation.isPending;

  // Don't flash a button before we know the current state.
  if (mineQuery.isLoading) return null;

  return (
    <View style={{ paddingHorizontal: spacing.xl, paddingTop: spacing.lg }}>
      {hasInterest ? (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing.sm,
            padding: spacing.md,
            borderRadius: radii.lg,
            borderWidth: 0.5,
            borderColor: theme.status.successBorder,
            backgroundColor: theme.status.successSubtle,
          }}
        >
          <Text style={{ fontSize: 16 }}>✓</Text>
          <Text
            variant="footnote"
            weight="medium"
            style={{ flex: 1, color: theme.status.success }}
          >
            {employerName} knows you’re interested.
          </Text>
          <Pressable
            onPress={() => withdrawMutation.mutate()}
            disabled={busy}
            hitSlop={8}
            accessibilityRole="button"
          >
            <Text
              variant="footnote"
              weight="medium"
              style={{ color: theme.text.tertiary, opacity: busy ? 0.5 : 1 }}
            >
              Undo
            </Text>
          </Pressable>
        </View>
      ) : (
        <Pressable
          onPress={() => expressMutation.mutate()}
          disabled={busy}
          accessibilityRole="button"
          style={({ pressed }) => ({
            backgroundColor: theme.brand.accent,
            paddingVertical: 14,
            borderRadius: radii.pill,
            alignItems: 'center',
            opacity: busy ? 0.5 : pressed ? 0.85 : 1,
          })}
        >
          <Text style={{ color: '#FFFDF7', fontSize: 15, fontWeight: '700' }}>
            {expressMutation.isPending
              ? 'Sending…'
              : 'I’m interested in working here'}
          </Text>
        </Pressable>
      )}
    </View>
  );
}

// ─── Export ──────────────────────────────────────────────────────────────────

export function EmployerDetailScreen() {
  return (
    <SeekerThemeOverride>
      <EmployerDetailInner />
    </SeekerThemeOverride>
  );
}
