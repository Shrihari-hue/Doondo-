/**
 * RatingsScreen — list of ratings received by a user.
 *
 * Reads from GET /api/v1/users/:id/ratings, which returns { ratings, summary }.
 * No fake data: if there are no ratings yet, we show a friendly empty state.
 *
 * If `userId` is omitted in route params, defaults to the signed-in user
 * (i.e. "My ratings").
 */

import { FlatList, Pressable, View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { spacing, radii } from '@doondo/tokens';
import { Screen, Text, Card, Avatar, LoadingSpinner, EmptyState, Stars, ErrorPanel } from '@/components';
import { useTheme } from '@/theme/useTheme';
import { useAuth } from '@/hooks/useAuth';
import { useUserRatings } from '@/hooks/useRatings';
import { useTranslate } from '@/i18n/useTranslate';
import { SeekerThemeOverride } from '@/theme/SeekerThemeOverride';
import type { AppStackParamList } from '@/navigation/types';

type Nav = NativeStackNavigationProp<AppStackParamList>;
type RouteParams = RouteProp<AppStackParamList, 'Ratings'>;

function RatingsScreenInner() {
  const { theme } = useTheme();
  const navigation = useNavigation<Nav>();
  const route = useRoute<RouteParams>();
  const { user } = useAuth();
  const t = useTranslate();

  const userId = route.params?.userId ?? user?.id ?? null;
  const isMyRatings = !route.params?.userId;
  const { data, isLoading, isError, refetch } = useUserRatings(userId);

  return (
    <Screen>
      <View
        style={{
          paddingHorizontal: spacing.xl,
          paddingTop: spacing.xl,
          gap: spacing.md,
        }}
      >
        <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
          <Text variant="body" tone="secondary">
            {t('ratings.back')}
          </Text>
        </Pressable>
        <Text variant="display" weight="medium" display>
          {isMyRatings ? t('ratings.my_ratings') : t('ratings.others_ratings')}
        </Text>
        {data?.summary && data.summary.count > 0 && (
          <Stars score={data.summary.avg} count={data.summary.count} />
        )}
      </View>

      {isLoading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <LoadingSpinner />
        </View>
      ) : isError ? (
        <ErrorPanel error={null} onRetry={() => void refetch()} title={t('ratings.error_title')} />
      ) : !data || data.ratings.length === 0 ? (
        <EmptyState
          title={t('ratings.empty_title')}
          message={
            isMyRatings
              ? t('ratings.empty_my_message')
              : t('ratings.empty_other_message')
          }
        />
      ) : (
        <FlatList
          contentContainerStyle={{
            paddingHorizontal: spacing.xl,
            paddingTop: spacing.lg,
            paddingBottom: spacing['4xl'],
            gap: spacing.md,
          }}
          data={data.ratings}
          keyExtractor={(r) => r.id}
          renderItem={({ item }) => (
            <Card>
              <View style={{ flexDirection: 'row', gap: spacing.md }}>
                <Avatar photoUrl={item.reviewerPhotoUrl} name={item.reviewerName} size={44} />
                <View style={{ flex: 1, gap: spacing.xs }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text variant="bodyLarge" weight="medium" numberOfLines={1}>
                      {item.reviewerName}
                    </Text>
                    <Stars score={item.score} showScore={false} size={14} />
                  </View>
                  <Text variant="footnote" tone="tertiary" numberOfLines={1}>
                    {item.jobTitle}
                  </Text>
                  {item.comment && (
                    <Text variant="body" style={{ marginTop: spacing.xs }}>
                      {item.comment}
                    </Text>
                  )}
                  <Text variant="caption" tone="tertiary">
                    {new Date(item.createdAt).toLocaleDateString(undefined, {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })}
                  </Text>
                </View>
              </View>
            </Card>
          )}
        />
      )}
    </Screen>
  );
}

export function RatingsScreen() {
  return (
    <SeekerThemeOverride>
      <RatingsScreenInner />
    </SeekerThemeOverride>
  );
}
