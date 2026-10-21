/**
 * AuctionsScreen (worker) — urgent jobs nearby taking bids right now.
 * Bid your price (up to the employer's ceiling) and how fast you can get
 * there. Employers who cancelled after picking someone are flagged.
 */
import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, TextInput, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Location from 'expo-location';
import { spacing, radii } from '@doondo/tokens';
import { Screen, Text, Card, Button, LoadingSpinner, EmptyState } from '@/components';
import { useTheme } from '@/theme/useTheme';
import { useTranslate } from '@/i18n/useTranslate';
import { haptic } from '@/lib/haptics';
import { auctionsApi, type Auction } from '@/api/auctions.api';

const rs = (p: number) => `₹${Math.round(p / 100).toLocaleString('en-IN')}`;
const ETAS = [15, 30, 45, 60];

function minsLeft(iso: string): number {
  return Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 60000));
}

function AuctionCard({ a, onBid }: { a: Auction; onBid: (amount: number, eta: number) => void }) {
  const { theme } = useTheme();
  const t = useTranslate();
  const [amount, setAmount] = useState(String(Math.round((a.myBid?.amountPaise ?? a.maxPaise) / 100)));
  const [eta, setEta] = useState(a.myBid?.etaMinutes ?? 30);
  return (
    <Card>
      <View style={{ gap: spacing.sm }}>
        <Text variant="bodyLarge" weight="semibold">{a.jobTitle}</Text>
        <Text variant="footnote" tone="secondary">
          {a.employerName}{a.distanceMeters != null ? ` · ${(a.distanceMeters / 1000).toFixed(1)} km` : ''} · {t('auctions.ends_in', { n: minsLeft(a.endsAt) })}
        </Text>
        {a.employerLateCancels > 0 && (
          <Text variant="caption" tone="warning">⚠️ {t('auctions.late_cancels', { n: a.employerLateCancels })}</Text>
        )}
        <Text variant="footnote">
          {t('auctions.up_to', { max: rs(a.maxPaise) })} · {t('auctions.bids', { n: a.bidCount })}{a.lowestBidPaise ? ` · ${t('auctions.lowest', { v: rs(a.lowestBidPaise) })}` : ''}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
          <Text variant="footnote" tone="secondary">₹</Text>
          <TextInput value={amount} onChangeText={(v) => setAmount(v.replace(/[^0-9]/g, '').slice(0, 6))} keyboardType="number-pad"
            style={{ width: 90, borderWidth: 1, borderColor: theme.border.default, borderRadius: radii.md, paddingHorizontal: 10, paddingVertical: 8, color: theme.text.primary }} />
          {ETAS.map((e) => (
            <Pressable key={e} onPress={() => setEta(e)}
              style={{ paddingHorizontal: 8, paddingVertical: 6, borderRadius: radii.pill, borderWidth: 1.5,
                borderColor: eta === e ? theme.brand.hero : theme.border.default }}>
              <Text variant="caption" style={{ color: eta === e ? theme.brand.hero : theme.text.secondary }}>{e}m</Text>
            </Pressable>
          ))}
        </View>
        <Button label={a.myBid ? t('auctions.update_bid') : t('auctions.place_bid')} onPress={() => onBid(Number(amount) * 100, eta)} disabled={!Number(amount)} />
        {a.myBid ? <Text variant="caption" tone="success">{t('auctions.your_bid', { v: rs(a.myBid.amountPaise), eta: a.myBid.etaMinutes })}</Text> : null}
      </View>
    </Card>
  );
}

export function AuctionsScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const t = useTranslate();
  const qc = useQueryClient();
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [locFailed, setLocFailed] = useState(false);
  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') { setLocFailed(true); return; }
      const p = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setCoords({ lat: p.coords.latitude, lng: p.coords.longitude });
    })().catch(() => setLocFailed(true));
  }, []);
  const q = useQuery({
    queryKey: ['auctions', 'nearby', coords?.lat.toFixed(2), coords?.lng.toFixed(2)],
    queryFn: () => auctionsApi.nearby(coords!.lat, coords!.lng),
    enabled: Boolean(coords),
    refetchInterval: 30_000,
  });
  const bid = useMutation({
    mutationFn: (v: { id: string; amount: number; eta: number }) => auctionsApi.bid(v.id, v.amount, v.eta),
    onSuccess: () => { haptic('success'); void qc.invalidateQueries({ queryKey: ['auctions'] }); },
    onError: (e) => Alert.alert(t('auctions.bid_failed'), e instanceof Error ? e.message : undefined),
  });
  return (
    <Screen edges={[]}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + spacing.md, paddingBottom: spacing['5xl'], paddingHorizontal: spacing.xl, gap: spacing.lg }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
          <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
            <Text style={{ fontSize: 22, color: theme.text.primary }}>←</Text>
          </Pressable>
          <Text variant="title" weight="semibold">{t('auctions.title')}</Text>
        </View>
        <Text variant="footnote" tone="secondary">{t('auctions.intro')}</Text>
        {locFailed ? <Text variant="footnote" tone="warning">{t('auctions.location_needed')}</Text>
          : !coords || q.isLoading ? <LoadingSpinner />
          : (q.data?.length ?? 0) === 0 ? <EmptyState glyph="🔨" title={t('auctions.empty_title')} message={t('auctions.empty_message')} />
          : q.data!.map((a) => <AuctionCard key={a.id} a={a} onBid={(amount, eta) => bid.mutate({ id: a.id, amount, eta })} />)}
      </ScrollView>
    </Screen>
  );
}
