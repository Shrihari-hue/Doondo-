/**
 * HiredNearbyRail — "Hired near you today" social-proof signal.
 *
 * Reads the anonymised feed of recent hires within ~10km of the
 * caller's home location and renders a horizontally-scrolling rail
 * of small cards. Each card surfaces just the first name + trade +
 * area — never full names, never coords — and serves the single
 * job of telling a doubtful worker that the platform actually
 * works.
 *
 * Self-hiding rules:
 *   - Hides entirely when the API returns no entries (e.g. a worker
 *     in a city Doondo hasn't seeded yet). Empty cells are noise.
 *   - Stays mounted during refetch so the rail doesn't flicker.
 *
 * Tap-through:
 *   - Cards are decorative (read-only). They don't link anywhere —
 *     the trust signal is the message, and routing to the hired
 *     worker's profile would be a privacy issue.
 */

import { ScrollView, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';

import { spacing, radii } from '@doondo/tokens';
import { Text } from '@/components';
import { useTheme } from '@/theme/useTheme';
import { useTranslate } from '@/i18n/useTranslate';
import { hiredNearbyApi } from '@/api/hiredNearby.api';

type TFn = (key: string, opts?: Record<string, unknown>) => string;

export function HiredNearbyRail() {
  const { theme } = useTheme();
  const t = useTranslate();

  const query = useQuery({
    queryKey: ['hired-nearby', 'me'],
    queryFn: () => hiredNearbyApi.list(8),
    staleTime: 5 * 60 * 1000,
  });

  const entries = query.data?.entries ?? [];
  if (entries.length === 0) return null;

  return (
    <View style={{ gap: spacing.sm }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'baseline',
          justifyContent: 'space-between',
        }}
      >
        <Text
          variant="caption"
          weight="medium"
          tone="secondary"
          style={{ letterSpacing: 1.2 }}
        >
          {t('hired_nearby.header')}
        </Text>
        <Text variant="caption" tone="tertiary">
          {entries.length}
        </Text>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: spacing.sm, paddingRight: spacing.sm }}
      >
        {entries.map((entry) => (
          <View
            key={entry.applicationId}
            style={{
              width: 220,
              padding: spacing.md,
              borderRadius: radii.lg,
              backgroundColor: theme.bg.surface,
              borderWidth: 0.5,
              borderColor: theme.border.default,
              gap: spacing.xs,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <View
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: 3,
                  backgroundColor: theme.status.success,
                }}
              />
              <Text variant="caption" tone="tertiary" style={{ letterSpacing: 0.6 }}>
                {formatRelative(entry.hiredAt, t)}
              </Text>
            </View>
            <Text variant="bodyLarge" weight="medium" numberOfLines={1}>
              {entry.hiredFirstName}
            </Text>
            <Text variant="footnote" tone="secondary" numberOfLines={2}>
              {entry.area
                ? t('hired_nearby.hired_as_in', {
                    title: entry.jobTitle,
                    area: entry.area,
                  })
                : t('hired_nearby.hired_as', { title: entry.jobTitle })}
            </Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

/**
 * "12 min ago" / "2 hr ago" / "yesterday" formatter. We deliberately
 * stay coarse because precision past the hour mark doesn't add value
 * and makes the rail feel mechanical.
 */
function formatRelative(iso: string, t: TFn): string {
  const then = new Date(iso).getTime();
  const diffMin = Math.max(1, Math.round((Date.now() - then) / 60_000));
  if (diffMin < 60) return t('hired_nearby.min_ago', { n: diffMin });
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return t('hired_nearby.hr_ago', { n: diffHr });
  return t('hired_nearby.yesterday');
}
