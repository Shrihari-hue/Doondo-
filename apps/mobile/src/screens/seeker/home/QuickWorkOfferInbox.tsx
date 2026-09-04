/**
 * QuickWorkOfferInbox — the worker's incoming Quick Work offer, rendered
 * inline on Home. seeker-plan.md §6 #5 / §10.2 ("IncomingOfferCard").
 *
 * Renders nothing when there's no live offer — this is intentionally NOT
 * a full-screen modal in this pass (seeker-plan.md §10.2 also suggests a
 * modal presentation when the app is foregrounded from a push; that push
 * → modal wiring is Phase 4/Socket.IO territory and isn't built yet, so
 * this inline card is the honest v1: it shows up the moment the worker
 * opens the app or the 5s poll ticks, which is what actually exists today).
 *
 * ACCEPT is the dominant, primary-styled action; DECLINE is secondary —
 * per the brief's explicit instruction (seeker-plan.md §10.1).
 * No optimistic "Accepted!" UI on accept (seeker-plan.md §12) — a brief
 * loading state, then the server's real answer, since another worker may
 * have already won it.
 */

import { useEffect, useState } from 'react';
import { Alert, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { spacing } from '@doondo/tokens';
import { Card, Text, Button, Pill } from '@/components';
import { useTheme } from '@/theme/useTheme';
import { haptic } from '@/lib/haptics';
import { quickWorkApi } from '@/api/quickWork.api';
import { ApiError } from '@/api/errors';
import type { AppStackParamList } from '@/navigation/types';

type Nav = NativeStackNavigationProp<AppStackParamList>;

export function QuickWorkOfferInbox() {
  const { theme } = useTheme();
  const navigation = useNavigation<Nav>();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState<'accept' | 'decline' | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const query = useQuery({
    queryKey: ['quick-work', 'offers', 'incoming'],
    queryFn: () => quickWorkApi.listIncomingOffers(),
    refetchInterval: 5_000,
  });

  const offer = (query.data ?? [])[0];
  if (!offer) return null;

  const secondsLeft = Math.max(0, Math.round((new Date(offer.expiresAt).getTime() - now) / 1000));
  if (secondsLeft <= 0) return null; // next 5s poll will drop it once the server marks it expired

  async function invalidate() {
    await queryClient.invalidateQueries({ queryKey: ['quick-work', 'offers', 'incoming'] });
  }

  async function accept() {
    if (!offer) return;
    setBusy('accept');
    try {
      const request = await quickWorkApi.acceptOffer(offer.id);
      haptic('success');
      await invalidate();
      navigation.navigate('QuickWorkJob', { requestId: request.id });
    } catch (err) {
      if (err instanceof ApiError && err.code === 'QUICK_WORK_ALREADY_TAKEN') {
        haptic('warning');
        Alert.alert('Just missed it', 'This job was taken by another worker a moment ago.');
      } else {
        Alert.alert('Could not accept', err instanceof Error ? err.message : 'Please try again.');
      }
      await invalidate();
    } finally {
      setBusy(null);
    }
  }

  async function decline() {
    if (!offer) return;
    setBusy('decline');
    try {
      await quickWorkApi.declineOffer(offer.id);
      haptic('selection');
      await invalidate();
    } catch {
      await invalidate();
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card style={{ gap: spacing.sm, borderColor: theme.brand.primaryBorder, borderWidth: 1 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Pill label="Quick Work" tone="primary" leading="⚡" />
        <Text variant="footnote" tone={secondsLeft <= 20 ? 'danger' : 'tertiary'} weight="medium">
          {secondsLeft}s to respond
        </Text>
      </View>
      <Text variant="bodyLarge" weight="semibold">
        A nearby customer needs help now
      </Text>
      <Text variant="footnote" tone="secondary">
        {offer.distanceMeters != null ? `${(offer.distanceMeters / 1000).toFixed(1)} km away` : 'Nearby'}
        {offer.etaMinutes != null ? ` · ~${offer.etaMinutes} min` : ''}
      </Text>
      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        <View style={{ flex: 2 }}>
          <Button label={busy === 'accept' ? 'Accepting…' : 'Accept'} onPress={() => void accept()} disabled={busy != null} />
        </View>
        <View style={{ flex: 1 }}>
          <Button label="Decline" variant="ghost" onPress={() => void decline()} disabled={busy != null} />
        </View>
      </View>
    </Card>
  );
}
