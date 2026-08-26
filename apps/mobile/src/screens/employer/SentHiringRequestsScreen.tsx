/**
 * SentHiringRequestsScreen — the employer's list of hiring requests
 * they've sent to workers, with their current status.
 *
 * Pending requests can be withdrawn. Reached from the available-workers
 * surface and from the "request accepted/declined" push notification.
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
import { Screen, Text, LoadingSpinner, EmptyState, Avatar } from '@/components';
import { useTheme } from '@/theme/useTheme';
import { haptic } from '@/lib/haptics';
import { ApiError } from '@/api/errors';
import {
  hiringRequestsApi,
  type HiringRequest,
  type HiringRequestStatus,
} from '@/api/hiringRequests.api';
import type { AppStackParamList } from '@/navigation/types';

type Nav = NativeStackNavigationProp<AppStackParamList>;

export function SentHiringRequestsScreen() {
  const { theme } = useTheme();
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['hiringRequests', 'sent'],
    queryFn: () => hiringRequestsApi.sent(),
    staleTime: 20_000,
  });

  const withdrawMutation = useMutation({
    mutationFn: (id: string) => hiringRequestsApi.withdraw(id),
    onSuccess: () => {
      haptic('selection');
      void queryClient.invalidateQueries({
        queryKey: ['hiringRequests', 'sent'],
      });
    },
    onError: (err) => {
      haptic('error');
      Alert.alert(
        'Could not withdraw',
        err instanceof ApiError
          ? err.message
          : 'Something went wrong. Please try again.',
      );
    },
  });

  const onWithdraw = (id: string) => {
    Alert.alert(
      'Withdraw this request?',
      'The worker will no longer see this invitation.',
      [
        { text: 'Keep it', style: 'cancel' },
        {
          text: 'Withdraw',
          style: 'destructive',
          onPress: () => withdrawMutation.mutate(id),
        },
      ],
    );
  };

  const requests = query.data?.requests ?? [];

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
            <Text style={{ fontSize: 22, color: '#FFFFFF' }}>←</Text>
          </Pressable>
          <Text
            style={{ fontSize: 17, fontWeight: '600', color: '#FFFFFF', flex: 1 }}
          >
            Requests sent
          </Text>
        </View>
        <Text style={{ fontSize: 13, lineHeight: 19, color: 'rgba(255,255,255,0.85)' }}>
          Hiring invitations you’ve sent to workers.
        </Text>
      </LinearGradient>

      <View style={{ flex: 1, paddingTop: spacing.md }}>
        {query.isLoading ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <LoadingSpinner />
          </View>
        ) : query.isError ? (
          <EmptyState
            title="Could not load requests"
            message="Check your connection and try again."
            cta={{ label: 'Retry', onPress: () => void query.refetch() }}
          />
        ) : requests.length === 0 ? (
          <EmptyState
            icon="send"
            tone="blue"
            eyebrow="NOTHING SENT YET"
            title="No hiring requests sent"
            message="Find a worker on the map or the available-workers list, then send them a request to apply for one of your jobs."
          />
        ) : (
          <FlatList
            data={requests}
            keyExtractor={(r) => r.id}
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
              <SentCard
                request={item}
                withdrawing={
                  withdrawMutation.isPending &&
                  withdrawMutation.variables === item.id
                }
                onWithdraw={() => onWithdraw(item.id)}
                onOpenApplicant={() => {
                  if (item.applicationId) {
                    haptic('selection');
                    navigation.navigate('ApplicantDetail', {
                      applicationId: item.applicationId,
                    });
                  }
                }}
              />
            )}
          />
        )}
      </View>
    </Screen>
  );
}

// ─── Sent card ───────────────────────────────────────────────────────────────

function SentCard({
  request,
  withdrawing,
  onWithdraw,
  onOpenApplicant,
}: {
  request: HiringRequest;
  withdrawing: boolean;
  onWithdraw: () => void;
  onOpenApplicant: () => void;
}) {
  const { theme } = useTheme();
  const isPending = request.status === 'pending';
  const seekerName = request.seeker?.name ?? 'A worker';
  const jobTitle = request.job?.title ?? 'a job';

  return (
    <View
      style={{
        backgroundColor: theme.bg.surface,
        borderRadius: radii.lg,
        borderWidth: 0.5,
        borderColor: theme.border.subtle,
        padding: spacing.md,
        gap: spacing.sm,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
        <Avatar
          name={seekerName}
          photoUrl={request.seeker?.photoUrl ?? null}
          size={44}
          premium={request.seeker?.isVerified}
        />
        <View style={{ flex: 1, gap: 2 }}>
          <Text
            style={{ fontSize: 15, fontWeight: '700', color: theme.text.primary }}
            numberOfLines={1}
          >
            {seekerName}
            {request.seeker?.isVerified ? '  ✓' : ''}
          </Text>
          <Text style={{ fontSize: 12, color: theme.text.tertiary }} numberOfLines={1}>
            Invited for “{jobTitle}”
          </Text>
        </View>
        <SentStatusBadge status={request.status} />
      </View>

      {isPending ? (
        <Pressable
          onPress={onWithdraw}
          disabled={withdrawing}
          accessibilityRole="button"
          style={({ pressed }) => ({
            alignSelf: 'flex-start',
            paddingVertical: 8,
            paddingHorizontal: spacing.lg,
            borderRadius: radii.pill,
            borderWidth: 1,
            borderColor: theme.border.default,
            opacity: withdrawing ? 0.5 : pressed ? 0.85 : 1,
          })}
        >
          <Text style={{ color: theme.text.secondary, fontSize: 13, fontWeight: '700' }}>
            {withdrawing ? 'Withdrawing…' : 'Withdraw'}
          </Text>
        </Pressable>
      ) : request.status === 'accepted' && request.applicationId ? (
        <Pressable
          onPress={onOpenApplicant}
          accessibilityRole="button"
          style={({ pressed }) => ({
            alignSelf: 'flex-start',
            paddingVertical: 8,
            paddingHorizontal: spacing.lg,
            borderRadius: radii.pill,
            backgroundColor: blue[600],
            opacity: pressed ? 0.85 : 1,
          })}
        >
          <Text style={{ color: '#FFFFFF', fontSize: 13, fontWeight: '700' }}>
            View in applicants
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function SentStatusBadge({ status }: { status: HiringRequestStatus }) {
  const { theme } = useTheme();
  const map: Record<
    HiringRequestStatus,
    { label: string; color: string; bg: string }
  > = {
    pending: {
      label: 'Waiting',
      color: theme.status.warning,
      bg: theme.status.warningSubtle,
    },
    accepted: {
      label: 'Accepted',
      color: theme.status.success,
      bg: theme.status.successSubtle,
    },
    declined: {
      label: 'Declined',
      color: theme.text.tertiary,
      bg: theme.bg.canvas,
    },
    withdrawn: {
      label: 'Withdrawn',
      color: theme.text.tertiary,
      bg: theme.bg.canvas,
    },
    expired: {
      label: 'Expired',
      color: theme.text.tertiary,
      bg: theme.bg.canvas,
    },
  };
  const m = map[status];
  return (
    <View
      style={{
        paddingHorizontal: spacing.sm,
        paddingVertical: 3,
        borderRadius: radii.pill,
        backgroundColor: m.bg,
      }}
    >
      <Text style={{ fontSize: 10, fontWeight: '700', color: m.color }}>
        {m.label}
      </Text>
    </View>
  );
}
