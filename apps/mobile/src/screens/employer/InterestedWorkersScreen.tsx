/**
 * InterestedWorkersScreen — the employer's inbound list of workers who
 * expressed interest in working for them (the inbound half of two-way
 * discovery).
 *
 * Each worker can be invited straight to a job ("Send hiring request")
 * or cleared from the list ("Archive"). Reached from the available-
 * workers surface and from the "a worker is interested" notification.
 */

import {
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';

import { spacing, radii, blue } from '@doondo/tokens';
import {
  Screen,
  Text,
  LoadingSpinner,
  EmptyState,
  Avatar,
  Stars,
} from '@/components';
import { useTheme } from '@/theme/useTheme';
import { haptic } from '@/lib/haptics';
import { prettifySkill } from '@/lib/trades';
import { ApiError } from '@/api/errors';
import {
  employerInterestApi,
  type EmployerInterest,
} from '@/api/employerInterest.api';
import type { AppStackParamList } from '@/navigation/types';

type Nav = NativeStackNavigationProp<AppStackParamList>;

export function InterestedWorkersScreen() {
  const { theme } = useTheme();
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['interestedWorkers'],
    queryFn: () => employerInterestApi.listForEmployer(),
    staleTime: 20_000,
  });

  const archiveMutation = useMutation({
    mutationFn: (id: string) => employerInterestApi.archive(id),
    onSuccess: () => {
      haptic('selection');
      void queryClient.invalidateQueries({ queryKey: ['interestedWorkers'] });
    },
    onError: (err) => {
      haptic('error');
      Alert.alert(
        'Could not archive',
        err instanceof ApiError ? err.message : 'Please try again.',
      );
    },
  });

  const markViewed = (interest: EmployerInterest) => {
    if (interest.status === 'pending') {
      void employerInterestApi.markViewed(interest.id).then(() => {
        void queryClient.invalidateQueries({ queryKey: ['interestedWorkers'] });
      });
    }
  };

  const onSendRequest = (interest: EmployerInterest) => {
    if (!interest.seeker) return;
    haptic('selection');
    markViewed(interest);
    navigation.navigate('SendHiringRequest', {
      seekerId: interest.seeker.id,
      seekerName: interest.seeker.name,
    });
  };

  const interests = (query.data?.interests ?? []).filter(
    (i) => i.status !== 'archived',
  );

  return (
    <Screen edges={[]}>
      <LinearGradient
        colors={[blue[700], blue[600], blue[500]]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{
          paddingTop: insets.top + spacing.md,
          paddingHorizontal: spacing.xl,
          paddingBottom: spacing.xl,
          borderBottomLeftRadius: radii.xl,
          borderBottomRightRadius: radii.xl,
        }}
      >
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing.md,
            marginBottom: spacing.sm,
          }}
        >
          <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
            <Text style={{ fontSize: 22, color: theme.text.onBrand }}>←</Text>
          </Pressable>
          <Text
            style={{ fontSize: 17, fontWeight: '600', color: theme.text.onBrand, flex: 1 }}
          >
            Interested in you
          </Text>
        </View>
        <Text style={{ fontSize: 13, lineHeight: 19, color: 'rgba(255,255,255,0.85)' }}>
          Workers who’d like to work for you — invite them to a job.
        </Text>
      </LinearGradient>

      <View style={{ flex: 1, paddingTop: spacing.md }}>
        {query.isLoading ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <LoadingSpinner />
          </View>
        ) : query.isError ? (
          <EmptyState
            title="Could not load"
            message="Check your connection and try again."
            cta={{ label: 'Retry', onPress: () => void query.refetch() }}
          />
        ) : interests.length === 0 ? (
          <EmptyState
            icon="users"
            eyebrow="NOBODY YET"
            title="No interested workers yet"
            message="When a worker visits your profile and expresses interest, they show up here for you to invite."
          />
        ) : (
          <FlatList
            data={interests}
            keyExtractor={(i) => i.id}
            contentContainerStyle={{
              paddingHorizontal: spacing.xl,
              paddingBottom: insets.bottom + spacing['5xl'],
              gap: spacing.sm,
            }}
            refreshControl={
              <RefreshControl
                refreshing={query.isRefetching}
                onRefresh={() => void query.refetch()}
                tintColor={blue[600]}
              />
            }
            renderItem={({ item }) => (
              <InterestCard
                interest={item}
                archiving={
                  archiveMutation.isPending &&
                  archiveMutation.variables === item.id
                }
                onSendRequest={() => onSendRequest(item)}
                onArchive={() => archiveMutation.mutate(item.id)}
              />
            )}
          />
        )}
      </View>
    </Screen>
  );
}

// ─── Interest card ───────────────────────────────────────────────────────────

function InterestCard({
  interest,
  archiving,
  onSendRequest,
  onArchive,
}: {
  interest: EmployerInterest;
  archiving: boolean;
  onSendRequest: () => void;
  onArchive: () => void;
}) {
  const { theme } = useTheme();
  const seeker = interest.seeker;
  const name = seeker?.name ?? 'A worker';
  const skills = seeker?.skills ?? [];
  const isNew = interest.status === 'pending';

  return (
    <View
      style={{
        backgroundColor: theme.bg.surface,
        borderRadius: radii.lg,
        borderWidth: 0.5,
        borderColor: isNew ? blue[500] : theme.border.subtle,
        padding: spacing.md,
        gap: spacing.sm,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
        <Avatar
          name={name}
          photoUrl={seeker?.photoUrl ?? null}
          size={44}
          premium={seeker?.isVerified}
        />
        <View style={{ flex: 1, gap: 2 }}>
          <Text
            style={{ fontSize: 15, fontWeight: '700', color: theme.text.primary }}
            numberOfLines={1}
          >
            {name}
            {seeker?.isVerified ? '  ✓' : ''}
          </Text>
          {seeker?.rating ? (
            <Stars
              score={seeker.rating.avg}
              count={seeker.rating.count}
              compact
            />
          ) : (
            <Text style={{ fontSize: 12, color: theme.text.tertiary }}>
              No ratings yet
            </Text>
          )}
        </View>
        {isNew && (
          <View
            style={{
              paddingHorizontal: spacing.sm,
              paddingVertical: 3,
              borderRadius: radii.pill,
              backgroundColor: theme.status.warningSubtle,
            }}
          >
            <Text
              style={{ fontSize: 10, fontWeight: '700', color: theme.status.warning }}
            >
              New
            </Text>
          </View>
        )}
      </View>

      {skills.length > 0 && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
          {skills.slice(0, 5).map((slug) => (
            <View
              key={slug}
              style={{
                paddingHorizontal: spacing.sm,
                paddingVertical: 3,
                borderRadius: radii.pill,
                backgroundColor: theme.bg.canvas,
                borderWidth: 0.5,
                borderColor: theme.border.subtle,
              }}
            >
              <Text style={{ fontSize: 11, fontWeight: '600', color: theme.text.secondary }}>
                {prettifySkill(slug)}
              </Text>
            </View>
          ))}
        </View>
      )}

      {interest.message ? (
        <Text
          style={{
            fontSize: 13,
            color: theme.text.secondary,
            lineHeight: 18,
            fontStyle: 'italic',
          }}
        >
          “{interest.message}”
        </Text>
      ) : null}

      <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: 2 }}>
        <Pressable
          onPress={onSendRequest}
          accessibilityRole="button"
          style={({ pressed }) => ({
            flex: 1,
            backgroundColor: blue[600],
            paddingVertical: 11,
            borderRadius: radii.pill,
            alignItems: 'center',
            opacity: pressed ? 0.85 : 1,
          })}
        >
          <Text style={{ color: theme.text.onBrand, fontSize: 14, fontWeight: '700' }}>
            Send hiring request
          </Text>
        </Pressable>
        <Pressable
          onPress={onArchive}
          disabled={archiving}
          accessibilityRole="button"
          style={({ pressed }) => ({
            paddingVertical: 11,
            paddingHorizontal: spacing.lg,
            borderRadius: radii.pill,
            alignItems: 'center',
            borderWidth: 1,
            borderColor: theme.border.default,
            opacity: archiving ? 0.5 : pressed ? 0.85 : 1,
          })}
        >
          <Text style={{ color: theme.text.secondary, fontSize: 14, fontWeight: '700' }}>
            {archiving ? '…' : 'Archive'}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
