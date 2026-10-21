/**
 * AuctionDetailScreen (employer) — start an urgent auction for a job, or
 * watch bids come in and award one. Awarding sends the worker a 1-hour
 * offer at their bid; cancelling after award is recorded on your profile.
 */
import { useState } from 'react';
import { Alert, Pressable, ScrollView, TextInput, View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { spacing, radii } from '@doondo/tokens';
import { Screen, Text, Card, Button, Avatar, LoadingSpinner } from '@/components';
import { useTheme } from '@/theme/useTheme';
import { haptic } from '@/lib/haptics';
import { auctionsApi } from '@/api/auctions.api';
import type { AppStackParamList } from '@/navigation/types';

type Nav = NativeStackNavigationProp<AppStackParamList>;
type Route = RouteProp<AppStackParamList, 'AuctionDetail'>;
const rs = (p: number) => `₹${Math.round(p / 100).toLocaleString('en-IN')}`;

export function AuctionDetailScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const qc = useQueryClient();
  const [auctionId, setAuctionId] = useState<string | undefined>(route.params.auctionId);
  const [max, setMax] = useState(route.params.suggestedMaxRupees ? String(route.params.suggestedMaxRupees) : '');
  const [duration, setDuration] = useState(30);

  const start = useMutation({
    mutationFn: () => auctionsApi.start(route.params.jobId!, Number(max) * 100, duration),
    onSuccess: (a) => { haptic('success'); setAuctionId(a.id); },
    onError: (e) => Alert.alert("Couldn't start the auction", e instanceof Error ? e.message : undefined),
  });
  const q = useQuery({ queryKey: ['auction', auctionId], queryFn: () => auctionsApi.get(auctionId!), enabled: Boolean(auctionId), refetchInterval: 10_000 });
  const award = useMutation({
    mutationFn: (bidId: string) => auctionsApi.award(auctionId!, bidId),
    onSuccess: (r) => {
      haptic('success');
      void qc.invalidateQueries({ queryKey: ['auction', auctionId] });
      Alert.alert('Offer sent', 'The worker has 1 hour to accept.', [{ text: 'Open', onPress: () => navigation.navigate('ApplicantDetail', { applicationId: r.applicationId }) }, { text: 'OK' }]);
    },
    onError: (e) => Alert.alert("Couldn't award", e instanceof Error ? e.message : undefined),
  });
  const cancel = useMutation({
    mutationFn: () => auctionsApi.cancel(auctionId!),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['auction', auctionId] }); navigation.goBack(); },
  });

  const a = q.data?.auction;
  const minsLeft = a ? Math.max(0, Math.ceil((new Date(a.endsAt).getTime() - Date.now()) / 60000)) : 0;

  return (
    <Screen edges={[]}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + spacing.md, paddingBottom: spacing['5xl'], paddingHorizontal: spacing.xl, gap: spacing.lg }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
          <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
            <Text style={{ fontSize: 22, color: theme.text.primary }}>←</Text>
          </Pressable>
          <Text variant="title" weight="semibold">🔨 Urgent auction</Text>
        </View>

        {!auctionId ? (
          <Card>
            <View style={{ gap: spacing.md }}>
              <Text variant="footnote" tone="secondary">
                Nearby workers with the right skill get a ping and bid their price and arrival time. You pick one; they get a 1-hour offer.
              </Text>
              <Text variant="footnote" weight="medium">Most you'll pay (₹)</Text>
              <TextInput value={max} onChangeText={(v) => setMax(v.replace(/[^0-9]/g, '').slice(0, 6))} keyboardType="number-pad"
                style={{ borderWidth: 1, borderColor: theme.border.default, borderRadius: radii.md, padding: 12, fontSize: 18, color: theme.text.primary }} />
              <Text variant="footnote" weight="medium">Take bids for</Text>
              <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                {[15, 30, 60].map((d) => (
                  <Pressable key={d} onPress={() => setDuration(d)} style={{ flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: radii.md, borderWidth: 1.5, borderColor: duration === d ? theme.brand.hero : theme.border.default }}>
                    <Text variant="footnote" style={{ color: duration === d ? theme.brand.hero : theme.text.secondary }}>{d} min</Text>
                  </Pressable>
                ))}
              </View>
              <Button label={start.isPending ? '…' : 'Start auction'} onPress={() => start.mutate()} disabled={!Number(max) || start.isPending} />
            </View>
          </Card>
        ) : !a ? <LoadingSpinner /> : (
          <>
            <Card>
              <View style={{ gap: 4 }}>
                <Text variant="bodyLarge" weight="semibold">{a.jobTitle}</Text>
                <Text variant="footnote" tone="secondary">
                  Up to {rs(a.maxPaise)} · {a.status === 'live' ? `${minsLeft} min left` : a.status} · {a.bidCount} bid(s)
                </Text>
              </View>
            </Card>
            {(q.data?.bids ?? []).length === 0 ? (
              <Text variant="footnote" tone="secondary">Waiting for bids… nearby workers have been notified.</Text>
            ) : (
              q.data!.bids.map((b) => (
                <Card key={b.id}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
                    <Avatar name={b.name} photoUrl={b.photoUrl} size={40} premium={b.isVerified} />
                    <View style={{ flex: 1 }}>
                      <Text variant="body" weight="semibold">{b.name}</Text>
                      <Text variant="footnote" tone="secondary">{rs(b.amountPaise)} · there in {b.etaMinutes} min{b.status !== 'active' ? ` · ${b.status}` : ''}</Text>
                    </View>
                    {(a.status === 'live' || a.status === 'closed') && b.status === 'active' && (
                      <Pressable onPress={() => Alert.alert('Pick this worker?', `${b.name} · ${rs(b.amountPaise)}`, [
                        { text: 'Cancel', style: 'cancel' }, { text: 'Send offer', onPress: () => award.mutate(b.id) },
                      ])} style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: radii.pill, backgroundColor: theme.brand.hero }}>
                        <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 13 }}>Pick</Text>
                      </Pressable>
                    )}
                  </View>
                </Card>
              ))
            )}
            {a.status !== 'cancelled' && (
              <Pressable onPress={() => Alert.alert('Cancel auction?', a.status === 'awarded' ? 'You already picked a worker. Cancelling now is recorded on your profile and the worker is told.' : 'No one has been picked yet.', [
                { text: 'Keep', style: 'cancel' }, { text: 'Cancel auction', style: 'destructive', onPress: () => cancel.mutate() },
              ])}>
                <Text variant="footnote" tone="tertiary" style={{ textAlign: 'center' }}>Cancel auction</Text>
              </Pressable>
            )}
          </>
        )}
      </ScrollView>
    </Screen>
  );
}
