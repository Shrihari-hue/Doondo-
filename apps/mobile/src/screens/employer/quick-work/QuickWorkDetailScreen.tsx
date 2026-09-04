/**
 * QuickWorkDetailScreen — a single Quick Work request's live status.
 *
 * Stands in for §7's Matching/Worker-Found/Tracking/In-Progress/Completed
 * screens until Phase 3 (matching) and Phase 5 (execution) land — rather
 * than build fake "Finding a worker…" animations against a status the
 * backend can't yet produce, this shows the REAL status (posted today;
 * matching/offered/accepted/... once those phases exist) and polls for
 * changes. Once Phase 4 wires Socket.IO client-side, this becomes
 * push-driven instead of polling.
 */

import { useCallback, useState } from 'react';
import { Alert, Image, Linking, Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Feather } from '@expo/vector-icons';

import { spacing } from '@doondo/tokens';
import { Screen, Text, Button, Card, Pill, SectionHeader, LoadingSpinner, ErrorPanel } from '@/components';
import { useTheme } from '@/theme/useTheme';
import { haptic } from '@/lib/haptics';
import { quickWorkApi, type QuickWorkStatus } from '@/api/quickWork.api';
import { paymentsApi } from '@/api/payments.api';
import { chatApi } from '@/api/chat.api';
import type { AppStackParamList } from '@/navigation/types';

type Nav = NativeStackNavigationProp<AppStackParamList>;
type Route = RouteProp<AppStackParamList, 'QuickWorkDetail'>;

const STATUS_LABEL: Record<QuickWorkStatus, string> = {
  draft: 'Draft',
  posted: 'Posted — waiting to match',
  matching: 'Finding a worker…',
  offered: 'Offer sent to nearby workers',
  accepted: 'Worker on the way',
  arriving: 'Worker arriving',
  arrived: 'Worker has arrived',
  in_progress: 'Work in progress',
  completed: 'Work completed',
  payment_pending: 'Payment pending',
  paid: 'Paid',
  rated: 'Rated',
  cancelled: 'Cancelled',
  expired: 'Expired — no worker found in time',
  no_worker_found: 'No worker found nearby',
  disputed: 'Under dispute',
};

const STATUS_TONE: Record<QuickWorkStatus, 'neutral' | 'success' | 'warning' | 'danger' | 'info'> = {
  draft: 'neutral',
  posted: 'info',
  matching: 'info',
  offered: 'info',
  accepted: 'success',
  arriving: 'success',
  arrived: 'success',
  in_progress: 'success',
  completed: 'success',
  payment_pending: 'warning',
  paid: 'success',
  rated: 'success',
  cancelled: 'neutral',
  expired: 'warning',
  no_worker_found: 'warning',
  disputed: 'danger',
};

const CANCELLABLE: QuickWorkStatus[] = ['draft', 'posted', 'matching', 'offered', 'accepted', 'arriving', 'arrived'];

export function QuickWorkDetailScreen() {
  const { theme } = useTheme();
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const { requestId } = route.params;
  const queryClient = useQueryClient();
  const [paying, setPaying] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [ratingScore, setRatingScore] = useState(0);
  const [submittingRating, setSubmittingRating] = useState(false);
  const [approvingPrice, setApprovingPrice] = useState(false);

  const query = useQuery({
    queryKey: ['quick-work', 'request', requestId],
    queryFn: () => quickWorkApi.getById(requestId),
    refetchInterval: 5_000,
  });

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ['quick-work', 'request', requestId] });
  }

  async function onChat() {
    try {
      const { conversationId } = await chatApi.ensureFromQuickWork(requestId);
      navigation.navigate('Conversation', { conversationId });
    } catch (err) {
      Alert.alert('Could not open chat', err instanceof Error ? err.message : 'Try again.');
    }
  }

  async function onRetryMatching() {
    setRetrying(true);
    try {
      await quickWorkApi.retryMatching(requestId);
      haptic('selection');
      await refresh();
    } catch (err) {
      Alert.alert('Could not retry', err instanceof Error ? err.message : 'Try again.');
    } finally {
      setRetrying(false);
    }
  }

  async function onPay() {
    setPaying(true);
    try {
      const { intent } = await paymentsApi.create({ quickWorkRequestId: requestId });
      // Same UPI-intent pattern the existing Jobs payment flow already
      // uses — open the UPI deep link, then the employer confirms.
      const { Linking } = await import('react-native');
      await Linking.openURL(intent.upiUri);
      Alert.alert('Paid via UPI?', 'Confirm once the payment has gone through.', [
        { text: 'Not yet', style: 'cancel' },
        {
          text: "I've paid",
          onPress: async () => {
            try {
              await paymentsApi.markPaid(intent.id);
              haptic('success');
              await refresh();
            } catch (err) {
              Alert.alert('Could not confirm payment', err instanceof Error ? err.message : 'Try again.');
            }
          },
        },
      ]);
    } catch (err) {
      Alert.alert('Could not start payment', err instanceof Error ? err.message : 'Try again.');
    } finally {
      setPaying(false);
    }
  }

  async function onApprovePrice() {
    setApprovingPrice(true);
    try {
      await quickWorkApi.approvePrice(requestId);
      haptic('success');
      await refresh();
    } catch (err) {
      Alert.alert('Could not approve', err instanceof Error ? err.message : 'Try again.');
    } finally {
      setApprovingPrice(false);
    }
  }

  // Deliberately not Alert.prompt — it's iOS-only at runtime (see the
  // QuickWorkJobScreen rating picker's own note on this) and Android is
  // this app's primary platform. A fixed reason + confirm keeps this
  // working identically on both.
  function onDisputePrice() {
    Alert.alert('Dispute this amount?', "This pauses payment until the price is sorted out with support.", [
      { text: 'Never mind', style: 'cancel' },
      {
        text: 'Raise dispute',
        style: 'destructive',
        onPress: async () => {
          try {
            await quickWorkApi.raiseDispute(requestId, 'Employer disputes the final price before paying.');
            haptic('selection');
            await refresh();
          } catch (err) {
            Alert.alert('Could not raise dispute', err instanceof Error ? err.message : 'Try again.');
          }
        },
      },
    ]);
  }

  async function onSubmitRating() {
    if (ratingScore < 1) return;
    setSubmittingRating(true);
    try {
      const { ratingsApi } = await import('@/api/ratings.api');
      await ratingsApi.create({ quickWorkRequestId: requestId, score: ratingScore });
      haptic('success');
      await refresh();
      Alert.alert('Thanks!', 'Your rating was submitted.');
    } catch (err) {
      Alert.alert('Could not submit rating', err instanceof Error ? err.message : 'Try again.');
    } finally {
      setSubmittingRating(false);
    }
  }

  const cancel = useCallback(() => {
    Alert.alert('Cancel this request?', 'The worker (if matched) will be notified.', [
      { text: 'Keep it', style: 'cancel' },
      {
        text: 'Cancel request',
        style: 'destructive',
        onPress: async () => {
          try {
            await quickWorkApi.cancel(requestId, 'Cancelled by employer');
            await refresh();
          } catch (err) {
            Alert.alert('Could not cancel', err instanceof Error ? err.message : 'Try again.');
          }
        },
      },
    ]);
  }, [requestId, queryClient]);

  if (query.isLoading) return <LoadingSpinner fullScreen />;
  if (query.isError || !query.data) {
    return (
      <Screen>
        <View style={{ padding: spacing.xl }}>
          <ErrorPanel error={query.error} onRetry={() => void query.refetch()} />
        </View>
      </Screen>
    );
  }

  const request = query.data;
  const canCancel = CANCELLABLE.includes(request.status);

  return (
    <Screen edges={['top', 'bottom']}>
      <ScrollView
        contentContainerStyle={{ padding: spacing.xl, gap: spacing.md }}
        refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={() => void query.refetch()} />}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text variant="title" weight="semibold">
            {request.title || 'Quick Work request'}
          </Text>
          <Text onPress={() => navigation.goBack()} style={{ fontSize: 22, color: theme.text.primary }}>
            ×
          </Text>
        </View>

        <Pill label={STATUS_LABEL[request.status]} tone={STATUS_TONE[request.status]} />

        <Card style={{ gap: spacing.sm }}>
          <SectionHeader title="Details" />
          {request.description ? <Text tone="secondary">{request.description}</Text> : null}
          {request.address || request.city ? (
            <Text variant="footnote" tone="tertiary">
              📍 {[request.address, request.city].filter(Boolean).join(', ')}
            </Text>
          ) : null}
          <Text variant="footnote" tone="tertiary">
            {request.isImmediate
              ? 'Requested for right now'
              : request.scheduledAt
                ? `Scheduled for ${new Date(request.scheduledAt).toLocaleString()}`
                : 'Timing not set'}
          </Text>
          {request.budgetMin != null || request.budgetMax != null ? (
            <Text variant="footnote" tone="tertiary">
              Budget: ₹{(request.budgetMin ?? 0) / 100} – ₹{(request.budgetMax ?? 0) / 100}
            </Text>
          ) : null}
          {request.photos.length > 0 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }}>
              {request.photos.map((url) => (
                <Image key={url} source={{ uri: url }} style={{ width: 72, height: 72, borderRadius: 8 }} />
              ))}
            </ScrollView>
          ) : null}
          {request.videos.length > 0 ? (
            <Pressable onPress={() => void Linking.openURL(request.videos[0]!)}>
              <Pill label="🎬 View attached video" tone="info" />
            </Pressable>
          ) : null}
          {request.voiceNoteUrl ? (
            <Pressable onPress={() => void Linking.openURL(request.voiceNoteUrl!)}>
              <Pill label="🎤 Play voice note" tone="info" />
            </Pressable>
          ) : null}
        </Card>

        {request.noShowBy ? (
          <Card style={{ gap: spacing.xs, borderColor: theme.status.warningBorder }}>
            <Text weight="semibold" tone="warning">
              {request.noShowBy === 'worker' ? 'Worker running late' : 'Customer unavailable'}
            </Text>
            <Text variant="footnote" tone="secondary">
              {request.noShowReason}
            </Text>
          </Card>
        ) : null}

        {request.status === 'posted' && !request.isImmediate ? (
          <Card style={{ alignItems: 'center', gap: spacing.sm }}>
            <Text variant="footnote" tone="secondary" style={{ textAlign: 'center' }}>
              This is scheduled — we'll start matching you with a worker closer to the time.
            </Text>
          </Card>
        ) : null}

        {request.status === 'matching' || (request.status === 'posted' && request.isImmediate) ? (
          <Card style={{ alignItems: 'center', gap: spacing.sm }}>
            <LoadingSpinner size="small" />
            <Text variant="footnote" tone="secondary" style={{ textAlign: 'center' }}>
              We're finding nearby workers for this request.
            </Text>
          </Card>
        ) : null}

        {request.status === 'no_worker_found' ? (
          <Button label={retrying ? 'Retrying…' : 'Widen search & retry'} onPress={() => void onRetryMatching()} disabled={retrying} />
        ) : null}

        {request.matchedWorkerId ? (
          <Button
            label="Chat with worker"
            variant="secondary"
            icon={<Feather name="message-circle" size={16} color={theme.text.primary} />}
            onPress={() => void onChat()}
          />
        ) : null}

        {request.status === 'completed' || request.status === 'payment_pending' ? (
          <Card style={{ gap: spacing.sm }}>
            <SectionHeader title="Completion" />
            {request.completionNotes ? <Text tone="secondary">{request.completionNotes}</Text> : null}
            {request.completionPhotoUrl ? (
              <Image source={{ uri: request.completionPhotoUrl }} style={{ width: '100%', height: 160, borderRadius: 10 }} />
            ) : null}
            <Text weight="semibold">Amount due: ₹{((request.finalPrice ?? 0) / 100).toFixed(0)}</Text>
            {request.priceApprovedAt ? (
              <>
                <Pill label="✓ Price approved" tone="success" />
                <Button label={paying ? 'Opening UPI…' : 'Pay now'} onPress={() => void onPay()} disabled={paying} />
              </>
            ) : (
              <>
                <Text variant="footnote" tone="tertiary">
                  Review the price before paying — this can't be undone once you've paid.
                </Text>
                <Button
                  label={approvingPrice ? 'Approving…' : 'Approve price & continue'}
                  onPress={() => void onApprovePrice()}
                  disabled={approvingPrice}
                />
                <Button label="This doesn't look right" variant="secondary" onPress={onDisputePrice} />
              </>
            )}
          </Card>
        ) : null}

        {request.status === 'paid' ? (
          <Card style={{ gap: spacing.md, alignItems: 'center' }}>
            <SectionHeader title="Rate the worker" />
            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              {[1, 2, 3, 4, 5].map((n) => (
                <Pressable key={n} onPress={() => { haptic('selection'); setRatingScore(n); }} hitSlop={6}>
                  <Feather name="star" size={32} color={n <= ratingScore ? theme.premium.gold : theme.border.default} />
                </Pressable>
              ))}
            </View>
            <Button
              label={submittingRating ? 'Submitting…' : 'Submit rating'}
              onPress={() => void onSubmitRating()}
              disabled={ratingScore < 1 || submittingRating}
            />
          </Card>
        ) : null}

        {canCancel ? <Button label="Cancel request" variant="danger" onPress={cancel} /> : null}
      </ScrollView>
    </Screen>
  );
}
