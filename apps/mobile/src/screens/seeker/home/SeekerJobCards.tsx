/**
 * The two job cards, and the reason they look different.
 *
 * A Short Term card is a decision you make in three seconds: how far,
 * how much, what kind of work, is it urgent — then one tap. A Long Term
 * card is an employment decision: who is the employer, what does it pay
 * a month, what type of role, when was it posted.
 *
 * They therefore share nothing but the design tokens and their internal
 * padding, so a column of mixed cards still lines up on both edges
 * (design/layout.md §6 and §9).
 *
 * On the verb: Short Term's button says "Apply", not "Accept". It fires
 * `expressInterest` — a genuine one-tap application — but the employer
 * still chooses the worker. The one place Doondo says "Accept" is a
 * Quick Work offer, where one tap really does mean the job is yours;
 * that lives in QuickWorkOfferInbox, at the top of this same feed.
 */

import { memo } from 'react';
import { Pressable, View } from 'react-native';

import { spacing, radii } from '@doondo/tokens';
import { Text, Pill } from '@/components';
import { useTheme } from '@/theme/useTheme';
import {
  formatPayPrimary,
  formatPaySuffix,
  formatDistance,
  formatType,
  pickJobIcon,
  type TFn,
} from '@/lib/jobFormat';
import type { PublicJob } from '@/api/types';

/** "Just now" / "5h ago" / "3d ago" — the posted-time line on a role. */
export function formatPostedAgo(iso: string, t: TFn): string {
  const ms = Date.now() - new Date(iso).getTime();
  const hours = Math.floor(ms / 3_600_000);
  if (hours < 1) return t('work_type.posted_just_now');
  if (hours < 24) return t('work_type.posted_hours', { n: hours });
  return t('work_type.posted_days', { n: Math.floor(hours / 24) });
}

interface ShortTermProps {
  job: PublicJob;
  t: TFn;
  /** Opens the full detail sheet. */
  onPress: () => void;
  /** One-tap express-interest application. */
  onApply: () => void;
  /** True while this card's request is in flight. */
  applying?: boolean;
  /** Set once the worker has applied — the button becomes a receipt. */
  applied?: boolean;
}

export const ShortTermJobCard = memo(function ShortTermJobCard({
  job,
  t,
  onPress,
  onApply,
  applying = false,
  applied = false,
}: ShortTermProps) {
  const { theme } = useTheme();
  const distance = job.distanceMeters != null ? formatDistance(job.distanceMeters, t) : null;
  const place = job.location.area ?? job.location.city;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${job.title}${distance ? `, ${distance}` : ''}, ${formatPayPrimary(job.pay)}`}
      style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}
    >
      <View
        style={{
          backgroundColor: theme.bg.surface,
          borderRadius: radii.xl,
          borderWidth: 0.5,
          borderColor: theme.border.default,
          padding: spacing.lg,
          gap: spacing.md,
        }}
      >
        {/* Row 1 — glyph | title + distance | urgency */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
          <View
            style={{
              width: 44,
              height: 44,
              borderRadius: radii.md,
              backgroundColor: theme.bg.muted,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text variant="bodyLarge">{pickJobIcon(job)}</Text>
          </View>

          <View style={{ flex: 1, gap: 2 }}>
            <Text variant="body" weight="semibold" numberOfLines={1}>
              {job.title}
            </Text>
            <Text variant="caption" tone="secondary" numberOfLines={1}>
              {[distance, place].filter(Boolean).join(' · ')}
            </Text>
          </View>

          {job.urgent ? <Pill label={t('work_type.urgent')} tone="danger" /> : null}
        </View>

        {/* Row 2 — the three numbers that decide it, equal columns
            (design/layout.md §9). */}
        <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
          <Fact label={t('work_type.pay')} value={formatPayPrimary(job.pay)} emphasis />
          <Fact label={t('work_type.rate')} value={formatPaySuffix(job.pay, t)} />
          <Fact label={t('work_type.type')} value={formatType(job.type, t)} />
        </View>

        {/* Row 3 — the action. Full width, never hidden behind a menu. */}
        <Pressable
          onPress={onApply}
          disabled={applying || applied}
          accessibilityRole="button"
          accessibilityState={{ disabled: applying || applied }}
          accessibilityLabel={applied ? t('work_type.applied') : t('work_type.apply')}
          style={({ pressed }) => ({
            backgroundColor: applied ? theme.bg.muted : theme.brand.primary,
            borderRadius: radii.button,
            paddingVertical: spacing.md,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: pressed || applying ? 0.8 : 1,
          })}
        >
          <Text variant="body" weight="semibold" tone={applied ? 'secondary' : 'onBrand'}>
            {applied
              ? t('work_type.applied')
              : applying
                ? t('work_type.applying')
                : t('work_type.apply')}
          </Text>
        </Pressable>
      </View>
    </Pressable>
  );
});

interface LongTermProps {
  job: PublicJob;
  t: TFn;
  onPress: () => void;
}

export const LongTermJobCard = memo(function LongTermJobCard({ job, t, onPress }: LongTermProps) {
  const { theme } = useTheme();
  const distance = job.distanceMeters != null ? formatDistance(job.distanceMeters, t) : null;
  const employerName = job.employer?.companyName ?? job.employer?.name ?? null;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${job.title}${employerName ? `, ${employerName}` : ''}, ${formatPayPrimary(job.pay)} ${formatPaySuffix(job.pay, t)}`}
      style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}
    >
      <View
        style={{
          backgroundColor: theme.bg.surface,
          borderRadius: radii.xl,
          borderWidth: 0.5,
          borderColor: theme.border.default,
          padding: spacing.lg,
          gap: spacing.md,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
          <View
            style={{
              width: 44,
              height: 44,
              borderRadius: radii.md,
              backgroundColor: theme.bg.muted,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text variant="bodyLarge">{pickJobIcon(job)}</Text>
          </View>

          <View style={{ flex: 1, gap: 2 }}>
            <Text variant="body" weight="semibold" numberOfLines={1}>
              {job.title}
            </Text>
            <Text variant="caption" tone="secondary" numberOfLines={1}>
              {employerName ?? job.location.city}
            </Text>
          </View>

          <Text variant="caption" tone="tertiary">
            {formatPostedAgo(job.createdAt, t)}
          </Text>
        </View>

        {/* Salary headlines a regular role the way it does on a payslip. */}
        <View style={{ gap: spacing.xs }}>
          <Text variant="bodyLarge" weight="semibold">
            {formatPayPrimary(job.pay)}
            <Text variant="footnote" tone="secondary">
              {' '}
              {formatPaySuffix(job.pay, t)}
            </Text>
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' }}>
            <Pill label={formatType(job.type, t)} tone="info" />
            {job.recurring ? <Pill label={t('work_type.recurring')} tone="neutral" /> : null}
            {[job.location.city, distance].filter(Boolean).length > 0 ? (
              <Text variant="caption" tone="tertiary">
                {[job.location.city, distance].filter(Boolean).join(' · ')}
              </Text>
            ) : null}
          </View>
        </View>

        <Pressable
          onPress={onPress}
          accessibilityRole="button"
          accessibilityLabel={t('work_type.apply')}
          style={({ pressed }) => ({
            backgroundColor: theme.brand.primary,
            borderRadius: radii.button,
            paddingVertical: spacing.md,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: pressed ? 0.8 : 1,
          })}
        >
          <Text variant="body" weight="semibold" tone="onBrand">
            {t('work_type.apply')}
          </Text>
        </Pressable>
      </View>
    </Pressable>
  );
});

/** One of the three equal-width fact columns on a Short Term card. */
function Fact({ label, value, emphasis = false }: { label: string; value: string; emphasis?: boolean }) {
  return (
    <View style={{ flex: 1, gap: 2 }}>
      <Text variant="caption" tone="tertiary" numberOfLines={1}>
        {label}
      </Text>
      <Text
        variant={emphasis ? 'body' : 'footnote'}
        weight={emphasis ? 'semibold' : 'medium'}
        numberOfLines={1}
      >
        {value}
      </Text>
    </View>
  );
}
