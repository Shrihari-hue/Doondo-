/**
 * EarningsScreen — the seeker's "Earnings" tab.
 *
 * A money home that surfaces the worker's three financial features as
 * rich, glanceable cards instead of a plain list:
 *   - My earnings      → this-month total, taps into the MyEarnings ledger
 *   - Cash advance     → advance availability / open-request status
 *   - Worker insurance → cover status + validity
 *
 * Below the cards sits a promo card linking out to the wider set of
 * insurance + financial tools.
 *
 * Card values are live: this-month earnings come from the wallet API,
 * the advance line reflects any open advance request, and the insurance
 * line shows the real subscription status. Each query degrades to a
 * neutral placeholder while loading or if the request fails — the screen
 * never blocks on the network.
 *
 * Royal-blue seeker palette throughout (SeekerThemeOverride). Added as
 * part of the 6-tab navigation redesign — see Doondo-Profile-Redesign-Spec.md
 * at the repo root.
 */
import { Pressable, ScrollView, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { LinearGradient } from 'expo-linear-gradient';

import { spacing, blue } from '@doondo/tokens';
import { Screen, Text, NotificationsBell } from '@/components';
import { useTheme } from '@/theme/useTheme';
import { haptic } from '@/lib/haptics';
import { useTranslate } from '@/i18n/useTranslate';
import { SeekerThemeOverride } from '@/theme/SeekerThemeOverride';
import { walletApi } from '@/api/wallet.api';
import { advancesApi } from '@/api/advances.api';
import { insuranceApi } from '@/api/insurance.api';
import type { AppStackParamList } from '@/navigation/types';

type Nav = NativeStackNavigationProp<AppStackParamList>;

/** Advance statuses that count as an open, in-flight request. */
const OPEN_ADVANCE_STATUSES = ['requested', 'approved', 'paid'] as const;

type ValueTone = 'primary' | 'success' | 'tertiary' | 'hero';

/** ₹ with Indian digit grouping, rupees only (no paise). */
function formatINR(paise: number): string {
  return `₹${Math.round(paise / 100).toLocaleString('en-IN')}`;
}

/** "25 Jun 2025" — used for the insurance validity line. */
function formatDate(date: Date): string {
  return date.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function Inner() {
  const { theme } = useTheme();
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const t = useTranslate();

  // ── Live data ──────────────────────────────────────────────────────────
  const walletQuery = useQuery({
    queryKey: ['wallet', 'me'],
    queryFn: () => walletApi.myEarnings(50),
    staleTime: 30_000,
  });
  const advancesQuery = useQuery({
    queryKey: ['advances', 'me'],
    queryFn: () => advancesApi.list(),
    staleTime: 30_000,
  });
  const insuranceQuery = useQuery({
    queryKey: ['insurance', 'status'],
    queryFn: () => insuranceApi.status(),
    staleTime: 60_000,
  });

  // ── My earnings — sum of positive transactions created this month ───────
  const now = new Date();
  const isThisMonth = (iso: string) => {
    const d = new Date(iso);
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  };
  const thisMonthPaise = (walletQuery.data?.transactions ?? [])
    .filter((tx) => tx.amount > 0 && isThisMonth(tx.createdAt))
    .reduce((sum, tx) => sum + tx.amount, 0);

  const earningsTop =
    walletQuery.isLoading || walletQuery.isError ? '—' : formatINR(thisMonthPaise);

  // ── Cash advance — reflect any open request from the advances API ───────
  const openAdvance = (advancesQuery.data?.advances ?? []).find((a) =>
    (OPEN_ADVANCE_STATUSES as readonly string[]).includes(a.status),
  );

  let advanceTop: string;
  let advanceTopTone: ValueTone;
  let advanceBottom: string;
  let advanceBottomTone: ValueTone;
  if (advancesQuery.isLoading || advancesQuery.isError) {
    advanceTop = '—';
    advanceTopTone = 'tertiary';
    advanceBottom = '';
    advanceBottomTone = 'tertiary';
  } else if (openAdvance) {
    advanceTop = formatINR(openAdvance.amountPaise);
    advanceTopTone = 'primary';
    advanceBottom = t(`advance.status_${openAdvance.status}`);
    advanceBottomTone = openAdvance.status === 'paid' ? 'success' : 'tertiary';
  } else {
    // No open request — the card is a plain entry point, no figures invented.
    advanceTop = `${t('earnings_hub.advance_cta')} →`;
    advanceTopTone = 'hero';
    advanceBottom = '';
    advanceBottomTone = 'tertiary';
  }

  // ── Worker insurance — real subscription status from the API ────────────
  const sub = insuranceQuery.data?.subscription;
  const insuranceActive = sub?.status === 'active';
  // Real "active since" date — startedAt is the server's own field.
  const activeSince = sub?.startedAt ?? sub?.createdAt ?? null;

  let insuranceTop: string;
  let insuranceTopTone: ValueTone;
  let insuranceBottom: string;
  let insuranceBottomTone: ValueTone;
  if (insuranceQuery.isLoading || insuranceQuery.isError) {
    insuranceTop = '—';
    insuranceTopTone = 'tertiary';
    insuranceBottom = '';
    insuranceBottomTone = 'tertiary';
  } else if (insuranceActive) {
    insuranceTop = t('earnings_hub.insurance_active');
    insuranceTopTone = 'success';
    insuranceBottom = activeSince
      ? t('earnings_hub.insurance_since', {
          date: formatDate(new Date(activeSince)),
        })
      : '';
    insuranceBottomTone = 'tertiary';
  } else {
    insuranceTop = t('earnings_hub.insurance_inactive');
    insuranceTopTone = 'tertiary';
    insuranceBottom = `${t('earnings_hub.insurance_cta')} →`;
    insuranceBottomTone = 'hero';
  }

  return (
    <Screen edges={[]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingTop: insets.top + spacing.md,
          paddingBottom: spacing['5xl'],
          gap: spacing.lg,
        }}
      >
        {/* ── Header ─────────────────────────────────────────────────── */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: spacing.xl,
          }}
        >
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 26, fontWeight: '700', color: theme.text.primary }}>
              {t('earnings_hub.title')}
            </Text>
            <Text style={{ fontSize: 13, color: theme.text.tertiary, marginTop: 2 }}>
              {t('earnings_hub.subtitle')}
            </Text>
          </View>
          <NotificationsBell onPress={() => navigation.navigate('Notifications')} />
        </View>

        {/* ── Money cards ────────────────────────────────────────────── */}
        <MoneyCard
          glyph="💰"
          tint={theme.brand.heroSubtle}
          label={t('earnings_hub.ledger')}
          hint={t('earnings_hub.ledger_hint')}
          topValue={earningsTop}
          topTone="primary"
          bottomValue={t('earnings_hub.ledger_caption')}
          bottomTone="success"
          onPress={() => navigation.navigate('MyEarnings')}
        />
        <MoneyCard
          glyph="🏦"
          tint={theme.status.successSubtle}
          label={t('earnings_hub.advance')}
          hint={t('earnings_hub.advance_hint')}
          topValue={advanceTop}
          topTone={advanceTopTone}
          bottomValue={advanceBottom}
          bottomTone={advanceBottomTone}
          onPress={() => navigation.navigate('Advance')}
        />
        <MoneyCard
          glyph="🛡️"
          tint={theme.brand.heroSubtle}
          label={t('earnings_hub.insurance')}
          hint={t('earnings_hub.insurance_hint')}
          topValue={insuranceTop}
          topTone={insuranceTopTone}
          bottomValue={insuranceBottom}
          bottomTone={insuranceBottomTone}
          onPress={() => navigation.navigate('Insurance')}
        />

        {/* ── Promo card ─────────────────────────────────────────────── */}
        <PromoCard
          title={t('earnings_hub.promo_title')}
          body={t('earnings_hub.promo_body')}
          cta={t('earnings_hub.promo_cta')}
          onPress={() => navigation.navigate('Insurance')}
        />
      </ScrollView>
    </Screen>
  );
}

// ─── Money card ──────────────────────────────────────────────────────────────

interface MoneyCardProps {
  glyph: string;
  /** Background tint for the icon tile. */
  tint: string;
  label: string;
  hint: string;
  topValue: string;
  topTone: ValueTone;
  bottomValue: string;
  bottomTone: ValueTone;
  onPress: () => void;
}

function MoneyCard({
  glyph,
  tint,
  label,
  hint,
  topValue,
  topTone,
  bottomValue,
  bottomTone,
  onPress,
}: MoneyCardProps) {
  const { theme } = useTheme();

  const toneColor: Record<ValueTone, string> = {
    primary: theme.text.primary,
    success: theme.status.success,
    tertiary: theme.text.tertiary,
    hero: theme.brand.hero,
  };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label}. ${hint}`}
      onPress={() => {
        haptic('selection');
        onPress();
      }}
      style={{ marginHorizontal: spacing.xl }}
    >
      {({ pressed }) => (
        // The row layout + card paint live on this static View. Keeping
        // `flexDirection: 'row'` on the Pressable style function let RN
        // collapse the card to a column on some builds — that stacked the
        // value (e.g. "—") below the label instead of beside it.
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing.md,
            padding: spacing.lg,
            minHeight: 84,
            backgroundColor: theme.bg.surface,
            borderRadius: 18,
            borderWidth: 0.5,
            borderColor: theme.border.subtle,
            // Soft lift off the blue-tinted canvas.
            shadowColor: '#0F172A',
            shadowOpacity: 0.06,
            shadowRadius: 12,
            shadowOffset: { width: 0, height: 4 },
            elevation: 2,
            opacity: pressed ? 0.85 : 1,
            transform: [{ scale: pressed ? 0.99 : 1 }],
          }}
        >
          {/* Icon tile */}
          <View
            style={{
              width: 46,
              height: 46,
              borderRadius: 13,
              backgroundColor: tint,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text style={{ fontSize: 20 }}>{glyph}</Text>
          </View>

          {/* Label + hint */}
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 15, fontWeight: '600', color: theme.text.primary }}>
              {label}
            </Text>
            <Text style={{ fontSize: 12, color: theme.text.tertiary, marginTop: 2 }}>
              {hint}
            </Text>
          </View>

          {/* Value column */}
          <View style={{ alignItems: 'flex-end', maxWidth: 132 }}>
            <Text
              numberOfLines={1}
              style={{ fontSize: 16, fontWeight: '700', color: toneColor[topTone] }}
            >
              {topValue}
            </Text>
            {bottomValue !== '' && (
              <Text
                numberOfLines={1}
                style={{
                  fontSize: 12,
                  fontWeight: bottomTone === 'hero' ? '600' : '400',
                  color: toneColor[bottomTone],
                  marginTop: 2,
                }}
              >
                {bottomValue}
              </Text>
            )}
          </View>
        </View>
      )}
    </Pressable>
  );
}

// ─── Promo card ──────────────────────────────────────────────────────────────

interface PromoCardProps {
  title: string;
  body: string;
  cta: string;
  onPress: () => void;
}

function PromoCard({ title, body, cta, onPress }: PromoCardProps) {
  const { theme } = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title.replace(/\n/g, ' ')} ${body}`}
      onPress={() => {
        haptic('selection');
        onPress();
      }}
      style={({ pressed }) => ({
        marginHorizontal: spacing.xl,
        borderRadius: 22,
        overflow: 'hidden',
        opacity: pressed ? 0.92 : 1,
        transform: [{ scale: pressed ? 0.99 : 1 }],
      })}
    >
      <LinearGradient
        colors={[blue[500], blue[600], blue[800]]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          padding: spacing.xl,
          gap: spacing.md,
        }}
      >
        {/* Copy + CTA */}
        <View style={{ flex: 1 }}>
          <Text
            style={{
              fontSize: 20,
              fontWeight: '700',
              color: '#FFFFFF',
              lineHeight: 25,
            }}
          >
            {title}
          </Text>
          <Text
            style={{
              fontSize: 13,
              color: 'rgba(255,255,255,0.82)',
              marginTop: 6,
              lineHeight: 18,
            }}
          >
            {body}
          </Text>
          <View
            style={{
              alignSelf: 'flex-start',
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
              marginTop: spacing.md,
              paddingHorizontal: spacing.lg,
              paddingVertical: 10,
              borderRadius: 999,
              backgroundColor: '#FFFFFF',
            }}
          >
            <Text
              style={{ fontSize: 13, fontWeight: '700', color: theme.brand.hero }}
            >
              {cta}
            </Text>
            <Text style={{ fontSize: 13, fontWeight: '700', color: theme.brand.hero }}>
              →
            </Text>
          </View>
        </View>

        {/* Protection illustration — layered emoji */}
        <PromoArt />
      </LinearGradient>
    </Pressable>
  );
}

/** A small umbrella / shield / coins cluster — the "protection" motif. */
function PromoArt() {
  return (
    <View
      style={{
        width: 104,
        height: 104,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {/* soft glow disc */}
      <View
        style={{
          position: 'absolute',
          width: 96,
          height: 96,
          borderRadius: 48,
          backgroundColor: 'rgba(255,255,255,0.14)',
        }}
      />
      <Text style={{ fontSize: 56, marginBottom: 14 }}>☂️</Text>
      <Text style={{ position: 'absolute', bottom: 8, left: 6, fontSize: 32 }}>
        🛡️
      </Text>
      <Text style={{ position: 'absolute', bottom: 4, right: 4, fontSize: 30 }}>
        🪙
      </Text>
    </View>
  );
}

export function EarningsScreen() {
  return (
    <SeekerThemeOverride>
      <Inner />
    </SeekerThemeOverride>
  );
}
