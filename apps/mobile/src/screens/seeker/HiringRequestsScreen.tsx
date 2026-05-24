/**
 * HiringRequestsScreen — the worker's inbox of hiring requests.
 *
 * Employers who found this worker on the map / Find-workers list can
 * invite them to apply for a specific job. Pending requests show
 * Accept / Decline; accepting drops the worker into that job's pipeline.
 *
 * Reached from a push notification (`deeplink: { screen: 'HiringRequests' }`).
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
import { SeekerThemeOverride } from '@/theme/SeekerThemeOverride';
import { haptic } from '@/lib/haptics';
import { ApiError } from '@/api/errors';
import {
  hiringRequestsApi,
  type HiringRequest,
  type HiringRequestStatus,
} from '@/api/hiringRequests.api';
import type { AppStackParamList } from '@/navigation/types';

type Nav = NativeStackNavigationProp<AppStackParamList>;

function HiringRequestsInner() {
  const { theme } = useTheme();
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['hiringRequests', 'received'],
    queryFn: () => hiringRequestsApi.received(),
    staleTime: 20_000,
  });

  const respondMutation = useMutation({
    mutationFn: ({
      id,
      action,
    }: {
      id: string;
      action: 'accept' | 'decline';
    }) =>
      action === 'accept'
        ? hiringRequestsApi.accept(id)
        : hiringRequestsApi.decline(id),
    onSuccess: (_data, variables) => {
      haptic(variables.action === 'accept' ? 'success' : 'selection');
      void queryClient.invalidateQueries({
        queryKey: ['hiringRequests', 'received'],
      });
      if (variables.action === 'accept') {
        void queryClient.invalidateQueries({ queryKey: ['applications'] });
      }
    },
    onError: (err) => {
      haptic('error');
      Alert.alert(
        'Could not respond',
        err instanceof ApiError
          ? err.message
          : 'Something went wrong. Please try again.',
      );
    },
  });

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
            Hiring requests
          </Text>
        </View>
        <Text style={{ fontSize: 13, lineHeight: 19, color: 'rgba(255,255,255,0.85)' }}>
          Employers who want to hire you for a job.
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
            glyph="✉️"
            eyebrow="ALL CLEAR"
            title="No hiring requests yet"
            message="When an employer invites you to a job, it shows up here. Keep your availability on so employers can find you."
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
                tintColor={theme.brand.hero}
              />
            }
            renderItem={({ item }) => (
              <RequestCard
                request={item}
                pending={
                  respondMutation.isPending &&
                  respondMutation.variables?.id === item.id
                }
                onAccept={() =>
                  respondMutation.mutate({ id: item.id, action: 'accept' })
                }
                onDecline={() =>
                  respondMutation.mutate({ id: item.id, action: 'decline' })
                }
              />
            )}
          />
        )}
      </View>
    </Screen>
  );
}

// ─── Request card ────────────────────────────────────────────────────────────

function RequestCard({
  request,
  pending,
  onAccept,
  onDecline,
}: {
  request: HiringRequest;
  pending: boolean;
  onAccept: () => void;
  onDecline: () => void;
}) {
  const { theme } = useTheme();
  const isPending = request.status === 'pending';
  const employerName = request.employer?.name ?? 'An employer';
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
          name={employerName}
          photoUrl={request.employer?.photoUrl ?? null}
          size={44}
          premium={request.employer?.isVerified}
        />
        <View style={{ flex: 1, gap: 2 }}>
          <Text
            style={{ fontSize: 15, fontWeight: '700', color: theme.text.primary }}
            numberOfLines={1}
          >
            {employerName}
            {request.employer?.isVerified ? '  ✓' : ''}
          </Text>
          <Text style={{ fontSize: 12, color: theme.text.tertiary }} numberOfLines={1}>
            Wants to hire you for “{jobTitle}”
          </Text>
        </View>
        <StatusBadge status={request.status} />
      </View>

      {request.message ? (
        <Text
          style={{
            fontSize: 13,
            color: theme.text.secondary,
            lineHeight: 18,
            fontStyle: 'italic',
          }}
        >
          “{request.message}”
        </Text>
      ) : null}

      {isPending ? (
        <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: 2 }}>
          <Pressable
            onPress={onAccept}
            disabled={pending}
            accessibilityRole="button"
            style={({ pressed }) => ({
              flex: 1,
              backgroundColor: blue[600],
              paddingVertical: 11,
              borderRadius: radii.pill,
              alignItems: 'center',
              opacity: pending ? 0.5 : pressed ? 0.85 : 1,
            })}
          >
            <Text style={{ color: '#FFFFFF', fontSize: 14, fontWeight: '700' }}>
              Accept
            </Text>
          </Pressable>
          <Pressable
            onPress={onDecline}
            disabled={pending}
            accessibilityRole="button"
            style={({ pressed }) => ({
              paddingVertical: 11,
              paddingHorizontal: spacing.lg,
              borderRadius: radii.pill,
              alignItems: 'center',
              borderWidth: 1,
              borderColor: theme.border.default,
              opacity: pending ? 0.5 : pressed ? 0.85 : 1,
            })}
          >
            <Text style={{ color: theme.text.secondary, fontSize: 14, fontWeight: '700' }}>
              Decline
            </Text>
          </Pressable>
        </View>
      ) : request.status === 'accepted' ? (
        <Text style={{ fontSize: 12, color: theme.status.success }}>
          You accepted — you’re now in this employer’s applicants.
        </Text>
      ) : null}
    </View>
  );
}

function StatusBadge({ status }: { status: HiringRequestStatus }) {
  const { theme } = useTheme();
  const map: Record<
    HiringRequestStatus,
    { label: string; color: string; bg: string }
  > = {
    pending: {
      label: 'New',
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

export function HiringRequestsScreen() {
  return (
    <SeekerThemeOverride>
      <HiringRequestsInner />
    </SeekerThemeOverride>
  );
}
