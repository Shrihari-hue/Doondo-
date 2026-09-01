/**
 * SendHiringRequestScreen — the employer picks one of their active jobs
 * and an optional note to invite a specific worker.
 *
 * Reached from the worker map / available-workers list ("Send hiring
 * request"). On send, the worker gets a notification and the request
 * lands in their inbox; if they accept, they drop straight into the
 * chosen job's applicant pipeline.
 */

import { useMemo, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  TextInput,
  View,
} from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';

import { spacing, radii, blue } from '@doondo/tokens';
import { Screen, Text, LoadingSpinner, EmptyState } from '@/components';
import { useTheme } from '@/theme/useTheme';
import { haptic } from '@/lib/haptics';
import { jobsApi } from '@/api/jobs.api';
import { hiringRequestsApi } from '@/api/hiringRequests.api';
import { ApiError } from '@/api/errors';
import type { AppStackParamList } from '@/navigation/types';
import type { PublicJob } from '@/api/types';

type Nav = NativeStackNavigationProp<AppStackParamList>;
type Route = RouteProp<AppStackParamList, 'SendHiringRequest'>;

const MAX_MESSAGE = 240;

export function SendHiringRequestScreen() {
  const { theme } = useTheme();
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const insets = useSafeAreaInsets();
  const { seekerId, seekerName } = route.params;

  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [message, setMessage] = useState('');

  const jobsQuery = useQuery({
    queryKey: ['jobs', 'mine', 'active'],
    queryFn: () => jobsApi.listMine({ status: 'active', limit: 50 }),
    staleTime: 30_000,
  });

  const jobs = useMemo(() => jobsQuery.data?.jobs ?? [], [jobsQuery.data]);

  const sendMutation = useMutation({
    mutationFn: () =>
      hiringRequestsApi.send({
        seekerId,
        jobId: selectedJobId as string,
        message: message.trim() || null,
      }),
    onSuccess: () => {
      haptic('success');
      Alert.alert(
        'Hiring request sent',
        `${seekerName} will see your invitation and can accept or decline it.`,
        [{ text: 'Done', onPress: () => navigation.goBack() }],
      );
    },
    onError: (err) => {
      haptic('error');
      Alert.alert(
        'Could not send',
        err instanceof ApiError
          ? err.message
          : 'Something went wrong. Please try again.',
      );
    },
  });

  const canSend = selectedJobId !== null && !sendMutation.isPending;

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
            Hire {seekerName}
          </Text>
        </View>
        <Text style={{ fontSize: 13, lineHeight: 19, color: 'rgba(255,255,255,0.85)' }}>
          Pick the job you want to invite them to.
        </Text>
      </LinearGradient>

      {jobsQuery.isLoading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <LoadingSpinner />
        </View>
      ) : jobsQuery.isError ? (
        <EmptyState
          title="Could not load your jobs"
          message="Check your connection and try again."
          cta={{ label: 'Retry', onPress: () => void jobsQuery.refetch() }}
        />
      ) : jobs.length === 0 ? (
        <EmptyState
          icon="briefcase"
          tone="blue"
          title="No active jobs"
          message="Post a job first — then you can invite workers to apply for it."
          cta={{
            label: 'Post a job',
            onPress: () => {
              haptic('selection');
              navigation.navigate('PostJob');
            },
          }}
        />
      ) : (
        <>
          <ScrollView
            contentContainerStyle={{
              padding: spacing.xl,
              paddingBottom: spacing['5xl'],
              gap: spacing.sm,
            }}
          >
            <Text
              style={{
                fontSize: 11,
                fontWeight: '600',
                letterSpacing: 1.4,
                color: theme.text.tertiary,
                marginBottom: spacing.xs,
              }}
            >
              CHOOSE A JOB
            </Text>
            {jobs.map((job) => (
              <JobOption
                key={job.id}
                job={job}
                selected={selectedJobId === job.id}
                onPress={() => {
                  haptic('selection');
                  setSelectedJobId(job.id);
                }}
              />
            ))}

            <Text
              style={{
                fontSize: 11,
                fontWeight: '600',
                letterSpacing: 1.4,
                color: theme.text.tertiary,
                marginTop: spacing.lg,
                marginBottom: spacing.xs,
              }}
            >
              ADD A NOTE (OPTIONAL)
            </Text>
            <View
              style={{
                backgroundColor: theme.bg.surface,
                borderRadius: radii.lg,
                borderWidth: 0.5,
                borderColor: theme.border.default,
                padding: spacing.md,
              }}
            >
              <TextInput
                value={message}
                onChangeText={(text) => setMessage(text.slice(0, MAX_MESSAGE))}
                placeholder="e.g. Can you start this weekend?"
                placeholderTextColor={theme.text.tertiary}
                multiline
                style={{
                  fontSize: 14,
                  color: theme.text.primary,
                  minHeight: 64,
                  textAlignVertical: 'top',
                }}
              />
              <Text
                style={{
                  fontSize: 11,
                  color: theme.text.tertiary,
                  textAlign: 'right',
                  marginTop: spacing.xs,
                }}
              >
                {message.length}/{MAX_MESSAGE}
              </Text>
            </View>
          </ScrollView>

          {/* Sticky send button */}
          <View
            style={{
              paddingHorizontal: spacing.xl,
              paddingTop: spacing.sm,
              paddingBottom: insets.bottom + spacing.md,
              borderTopWidth: 0.5,
              borderTopColor: theme.border.subtle,
              backgroundColor: theme.bg.surface,
            }}
          >
            <Pressable
              onPress={() => canSend && sendMutation.mutate()}
              disabled={!canSend}
              accessibilityRole="button"
              style={({ pressed }) => ({
                backgroundColor: blue[600],
                paddingVertical: 14,
                borderRadius: radii.pill,
                alignItems: 'center',
                opacity: !canSend ? 0.45 : pressed ? 0.85 : 1,
              })}
            >
              <Text style={{ color: theme.text.onBrand, fontSize: 15, fontWeight: '700' }}>
                {sendMutation.isPending ? 'Sending…' : 'Send hiring request'}
              </Text>
            </Pressable>
          </View>
        </>
      )}
    </Screen>
  );
}

// ─── Job option row ──────────────────────────────────────────────────────────

function JobOption({
  job,
  selected,
  onPress,
}: {
  job: PublicJob;
  selected: boolean;
  onPress: () => void;
}) {
  const { theme } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        backgroundColor: theme.bg.surface,
        borderRadius: radii.lg,
        borderWidth: selected ? 1.5 : 0.5,
        borderColor: selected ? blue[500] : theme.border.subtle,
        padding: spacing.md,
        opacity: pressed ? 0.8 : 1,
      })}
    >
      <View
        style={{
          width: 22,
          height: 22,
          borderRadius: 11,
          borderWidth: 2,
          borderColor: selected ? blue[500] : theme.border.default,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {selected && (
          <View
            style={{
              width: 10,
              height: 10,
              borderRadius: 5,
              backgroundColor: blue[500],
            }}
          />
        )}
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text
          style={{ fontSize: 15, fontWeight: '600', color: theme.text.primary }}
          numberOfLines={1}
        >
          {job.title}
        </Text>
        <Text style={{ fontSize: 12, color: theme.text.tertiary }} numberOfLines={1}>
          {formatPay(job.pay)}
          {job.location.area ? ` · ${job.location.area}` : ''}
        </Text>
      </View>
    </Pressable>
  );
}

function formatPay(pay: PublicJob['pay']): string {
  const rupees = Math.round(pay.amount / 100);
  const period: Record<PublicJob['pay']['period'], string> = {
    hour: '/hr',
    day: '/day',
    week: '/wk',
    month: '/mo',
    fixed: '',
  };
  return `₹${rupees.toLocaleString('en-IN')}${period[pay.period]}`;
}
