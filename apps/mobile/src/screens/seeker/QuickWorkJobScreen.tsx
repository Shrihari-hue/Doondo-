/**
 * QuickWorkJobScreen — the worker's accepted-job execution screen.
 * seeker-plan.md §13-18: Accepted → Navigate → Arriving → Arrived →
 * Start → In Progress → Complete → Earnings → Rate.
 *
 * Reached from QuickWorkOfferInbox's Accept action, or from a
 * notification tap while a job is already active.
 */

import { useState } from 'react';
import { Alert, Image, Linking, Pressable, ScrollView, View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Feather } from '@expo/vector-icons';

import { spacing } from '@doondo/tokens';
import { Screen, Text, Button, Card, TextField, Pill, SectionHeader, LoadingSpinner, ErrorPanel } from '@/components';
import { useTheme } from '@/theme/useTheme';
import { haptic } from '@/lib/haptics';
import { quickWorkApi, type QuickWorkStatus } from '@/api/quickWork.api';
import { chatApi } from '@/api/chat.api';
import { getCurrentCoords } from '@/lib/location';
import type { AppStackParamList } from '@/navigation/types';

type Nav = NativeStackNavigationProp<AppStackParamList>;
type Route = RouteProp<AppStackParamList, 'QuickWorkJob'>;

const STATUS_LABEL: Record<QuickWorkStatus, string> = {
  draft: 'Draft', posted: 'Posted', matching: 'Matching', offered: 'Offered',
  accepted: 'Accepted — head over when ready', arriving: "You're on the way", arrived: 'You have arrived',
  in_progress: 'Work in progress', completed: 'Completed', payment_pending: 'Waiting for payment',
  paid: 'Paid — rate the customer', rated: 'Rated', cancelled: 'Cancelled', expired: 'Expired',
  no_worker_found: 'No worker found', disputed: 'Under dispute',
};

export function QuickWorkJobScreen() {
  const { theme } = useTheme();
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const { requestId } = route.params;
  const queryClient = useQueryClient();

  const [busy, setBusy] = useState(false);
  const [notes, setNotes] = useState('');
  const [finalPrice, setFinalPrice] = useState('');
  const [ratingScore, setRatingScore] = useState(0);
  const [submittingRating, setSubmittingRating] = useState(false);

  const query = useQuery({
    queryKey: ['quick-work', 'request', requestId],
    queryFn: () => quickWorkApi.getById(requestId),
    refetchInterval: 8_000,
  });

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ['quick-work', 'request', requestId] });
  }

  async function onNavigate() {
    if (!query.data?.location) return;
    const { lat, lng } = query.data.location;
    haptic('selection');
    void Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`);
  }

  async function onArriving() {
    setBusy(true);
    try {
      const coords = await getCurrentCoords();
      await quickWorkApi.markArriving(requestId, coords ? { lat: coords.lat, lng: coords.lng } : undefined);
      haptic('success');
      await refresh();
    } catch (err) {
      Alert.alert('Could not update', err instanceof Error ? err.message : 'Try again.');
    } finally {
      setBusy(false);
    }
  }

  async function onArrived() {
    setBusy(true);
    try {
      await quickWorkApi.markArrived(requestId);
      haptic('success');
      await refresh();
    } catch (err) {
      Alert.alert('Could not update', err instanceof Error ? err.message : 'Try again.');
    } finally {
      setBusy(false);
    }
  }

  async function onStart() {
    setBusy(true);
    try {
      await quickWorkApi.startWork(requestId);
      haptic('success');
      await refresh();
    } catch (err) {
      Alert.alert('Could not start', err instanceof Error ? err.message : 'Try again.');
    } finally {
      setBusy(false);
    }
  }

  async function onComplete() {
    setBusy(true);
    try {
      const price = finalPrice.trim() ? Math.round(Number(finalPrice) * 100) : null;
      await quickWorkApi.completeWork(requestId, { completionNotes: notes.trim() || null, finalPrice: price });
      haptic('success');
      await refresh();
      Alert.alert('Job completed', "You'll be paid once the customer confirms.");
    } catch (err) {
      Alert.alert('Could not complete', err instanceof Error ? err.message : 'Try again.');
    } finally {
      setBusy(false);
    }
  }

  async function onChat() {
    try {
      const { conversationId } = await chatApi.ensureFromQuickWork(requestId);
      navigation.navigate('Conversation', { conversationId });
    } catch (err) {
      Alert.alert('Could not open chat', err instanceof Error ? err.message : 'Try again.');
    }
  }

  async function onReportNoShow() {
    Alert.alert('Customer not available?', "This lets the customer know you're on site but couldn't reach them.", [
      { text: 'Not yet', style: 'cancel' },
      {
        text: 'Report unavailable',
        style: 'destructive',
        onPress: async () => {
          try {
            await quickWorkApi.reportNoShow(requestId, "Worker on site, customer isn't responding.");
            haptic('selection');
            await refresh();
          } catch (err) {
            Alert.alert('Could not report', err instanceof Error ? err.message : 'Try again.');
          }
        },
      },
    ]);
  }

  async function onCancel() {
    Alert.alert('Cancel this job?', 'The customer will be notified.', [
      { text: 'Keep it', style: 'cancel' },
      {
        text: 'Cancel job',
        style: 'destructive',
        onPress: async () => {
          try {
            await quickWorkApi.cancel(requestId, 'Cancelled by worker');
            await refresh();
          } catch (err) {
            Alert.alert('Could not cancel', err instanceof Error ? err.message : 'Try again.');
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

  return (
    <Screen edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={{ padding: spacing.xl, gap: spacing.md }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text variant="title" weight="semibold">
            {request.title || 'Quick Work job'}
          </Text>
          <Text onPress={() => navigation.goBack()} style={{ fontSize: 22, color: theme.text.primary }}>
            ×
          </Text>
        </View>

        <Pill label={STATUS_LABEL[request.status]} tone="primary" />

        <Card style={{ gap: spacing.sm }}>
          <SectionHeader title="Job details" />
          {request.description ? <Text tone="secondary">{request.description}</Text> : null}
          {request.address || request.city ? (
            <Text variant="footnote" tone="tertiary">📍 {[request.address, request.city].filter(Boolean).join(', ')}</Text>
          ) : null}
          {request.estimatedPrice != null || request.budgetMax != null ? (
            <Text variant="footnote" tone="tertiary">
              Expected: ₹{((request.estimatedPrice ?? request.budgetMax ?? 0) / 100).toFixed(0)}
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
              {request.noShowBy === 'worker' ? "You're flagged as running late" : 'Customer marked unavailable'}
            </Text>
            <Text variant="footnote" tone="secondary">
              {request.noShowReason}
            </Text>
          </Card>
        ) : null}

        <Button label="Chat with customer" variant="secondary" icon={<Feather name="message-circle" size={16} color={theme.text.primary} />} onPress={() => void onChat()} />

        {request.status === 'accepted' ? (
          <>
            <Button label="Navigate" variant="secondary" icon={<Feather name="navigation" size={16} color={theme.text.primary} />} onPress={() => void onNavigate()} />
            <Button label={busy ? 'Updating…' : "I'm on my way"} onPress={() => void onArriving()} disabled={busy} />
          </>
        ) : null}

        {request.status === 'arriving' ? (
          <>
            <Text variant="footnote" tone="secondary">
              {request.arrivingEtaMinutes != null ? `ETA ~${request.arrivingEtaMinutes} min` : 'On the way'}
            </Text>
            <Button label={busy ? 'Updating…' : "I've arrived"} onPress={() => void onArrived()} disabled={busy} />
          </>
        ) : null}

        {request.status === 'arrived' ? (
          <>
            <Button label={busy ? 'Starting…' : 'Start work'} onPress={() => void onStart()} disabled={busy} />
            {!request.noShowBy ? (
              <Button label="Customer isn't responding" variant="secondary" onPress={() => void onReportNoShow()} />
            ) : null}
          </>
        ) : null}

        {request.status === 'in_progress' ? (
          <>
            <TextField label="Notes (optional)" placeholder="What did you do?" value={notes} onChangeText={setNotes} multiline numberOfLines={3} />
            <TextField label="Final price ₹ (optional — defaults to estimate)" placeholder="0" keyboardType="numeric" value={finalPrice} onChangeText={setFinalPrice} />
            <Button label={busy ? 'Completing…' : 'Complete job'} onPress={() => void onComplete()} disabled={busy} />
          </>
        ) : null}

        {request.status === 'payment_pending' ? (
          <Card style={{ alignItems: 'center', gap: spacing.sm }}>
            <LoadingSpinner size="small" />
            <Text variant="footnote" tone="secondary" style={{ textAlign: 'center' }}>
              {request.priceApprovedAt
                ? `Waiting for the customer to pay ₹${((request.finalPrice ?? 0) / 100).toFixed(0)}.`
                : `Waiting for the customer to approve the ₹${((request.finalPrice ?? 0) / 100).toFixed(0)} price.`}
            </Text>
          </Card>
        ) : null}

        {request.status === 'paid' ? (
          <Card style={{ gap: spacing.md, alignItems: 'center' }}>
            <SectionHeader title="Rate the customer" />
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

        {['accepted', 'arriving', 'arrived'].includes(request.status) ? (
          <Button label="Cancel job" variant="danger" onPress={() => void onCancel()} />
        ) : null}
      </ScrollView>
    </Screen>
  );
}
