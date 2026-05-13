/**
 * MyEarningsScreen — the seeker's earnings ledger.
 *
 * Top: big total card with hero gradient + breakdown (settled vs pending).
 * Below: every transaction in chronological order.
 *
 * No fake data — empty state when there are zero hire credits yet.
 */

import { FlatList, RefreshControl, Pressable, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQuery } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';

import { spacing, radii, blue } from '@doondo/tokens';
import { Screen, Text, LoadingSpinner, EmptyState } from '@/components';
import { useTheme } from '@/theme/useTheme';
import { walletApi, type PublicWalletTransaction } from '@/api/wallet.api';
import { haptic } from '@/lib/haptics';
import { SeekerThemeOverride } from '@/theme/SeekerThemeOverride';
import type { AppStackParamList } from '@/navigation/types';

type Nav = NativeStackNavigationProp<AppStackParamList>;

function MyEarningsInner() {
  const { theme } = useTheme();
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();

  const query = useQuery({
    queryKey: ['wallet', 'me'],
    queryFn: () => walletApi.myEarnings(50),
    staleTime: 30_000,
  });

  const transactions = query.data?.transactions ?? [];
  const summary = query.data?.summary;

  return (
    <Screen edges={[]}>
      {/* Hero with total earned */}
      <LinearGradient
        colors={[blue[700], blue[600], blue[500]]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{
          paddingTop: insets.top + spacing.md,
          paddingHorizontal: spacing.xl,
          paddingBottom: spacing.xl + spacing.lg,
          borderBottomLeftRadius: radii.xl,
          borderBottomRightRadius: radii.xl,
        }}
      >
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing.md,
            marginBottom: spacing.xl,
          }}
        >
          <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
            <Text style={{ fontSize: 22, color: '#FFFFFF' }}>←</Text>
          </Pressable>
          <Text
            style={{ fontSize: 17, fontWeight: '600', color: '#FFFFFF', flex: 1 }}
          >
            My Earnings
          </Text>
        </View>

        <Text
          style={{
            fontSize: 13,
            color: 'rgba(255,255,255,0.8)',
            fontWeight: '500',
            letterSpacing: 0.4,
          }}
        >
          Total earned
        </Text>
        <Text
          style={{
            fontSize: 44,
            lineHeight: 48,
            fontWeight: '700',
            color: '#FFFFFF',
            letterSpacing: -1,
            marginTop: 4,
          }}
        >
          {summary ? formatRupees(summary.totalEarnedPaise) : '—'}
        </Text>

        <View
          style={{
            flexDirection: 'row',
            marginTop: spacing.lg,
            gap: spacing.md,
          }}
        >
          <SummaryBlock
            label="Pending"
            value={summary ? formatRupees(summary.pendingPaise) : '—'}
          />
          <SummaryBlock
            label="Hires"
            value={summary ? String(summary.hireCount) : '—'}
          />
        </View>
      </LinearGradient>

      {/* Transactions */}
      <View
        style={{
          flex: 1,
          paddingTop: spacing.lg,
        }}
      >
        <Text
          style={{
            fontSize: 11,
            fontWeight: '600',
            letterSpacing: 1.6,
            color: theme.text.tertiary,
            paddingHorizontal: spacing.xl,
            marginBottom: spacing.sm,
          }}
        >
          TRANSACTIONS
        </Text>

        {query.isLoading ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <LoadingSpinner />
          </View>
        ) : query.isError ? (
          <EmptyState
            title="Couldn't load earnings"
            message="Check your connection and try again."
            cta={{
              label: 'Retry',
              onPress: () => {
                haptic('selection');
                void query.refetch();
              },
            }}
          />
        ) : transactions.length === 0 ? (
          <EmptyState
            glyph="💰"
            eyebrow="NO EARNINGS YET"
            title="Get hired to start earning"
            message="Every job you're hired for shows up here with the pay you agreed to."
            cta={{
              label: 'Browse jobs',
              onPress: () => navigation.navigate('SeekerTabs', { screen: 'Jobs' } as never),
            }}
          />
        ) : (
          <FlatList
            contentContainerStyle={{
              paddingHorizontal: spacing.xl,
              paddingBottom: spacing['5xl'],
              gap: spacing.sm,
            }}
            data={transactions}
            keyExtractor={(t) => t.id}
            refreshControl={
              <RefreshControl
                refreshing={query.isRefetching}
                onRefresh={() => void query.refetch()}
                tintColor={theme.brand.hero}
              />
            }
            renderItem={({ item }) => <TransactionRow tx={item} />}
          />
        )}
      </View>
    </Screen>
  );
}

// ─── Pieces ──────────────────────────────────────────────────────────────────

function SummaryBlock({ label, value }: { label: string; value: string }) {
  return (
    <View
      style={{
        flex: 1,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm,
        borderRadius: radii.md,
        backgroundColor: 'rgba(255,255,255,0.16)',
        borderWidth: 0.5,
        borderColor: 'rgba(255,255,255,0.32)',
      }}
    >
      <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.78)', fontWeight: '500' }}>
        {label}
      </Text>
      <Text style={{ fontSize: 18, fontWeight: '700', color: '#FFFFFF', marginTop: 2 }}>
        {value}
      </Text>
    </View>
  );
}

function TransactionRow({ tx }: { tx: PublicWalletTransaction }) {
  const { theme } = useTheme();
  const credit = tx.amount > 0;
  return (
    <View
      style={{
        backgroundColor: theme.bg.surface,
        borderRadius: radii.lg,
        borderWidth: 0.5,
        borderColor: theme.border.subtle,
        padding: spacing.md,
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        shadowColor: '#0F172A',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.04,
        shadowRadius: 6,
        elevation: 1,
      }}
    >
      <View
        style={{
          width: 40,
          height: 40,
          borderRadius: 12,
          backgroundColor: credit ? theme.status.successSubtle : theme.status.dangerSubtle,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text style={{ fontSize: 18 }}>{credit ? '↓' : '↑'}</Text>
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text
          style={{ fontSize: 14, fontWeight: '600', color: theme.text.primary }}
          numberOfLines={1}
        >
          {tx.description}
        </Text>
        <Text style={{ fontSize: 11, color: theme.text.tertiary }}>
          {formatDate(tx.createdAt)} ·{' '}
          {tx.status === 'settled'
            ? 'Settled'
            : tx.status === 'pending'
              ? 'Pending'
              : 'Reversed'}
        </Text>
      </View>
      <Text
        style={{
          fontSize: 16,
          fontWeight: '700',
          color: credit ? theme.status.success : theme.status.danger,
        }}
      >
        {credit ? '+' : ''}
        {formatRupees(tx.amount)}
      </Text>
    </View>
  );
}

function formatRupees(paise: number): string {
  const rupees = paise / 100;
  const sign = rupees < 0 ? '-' : '';
  return `${sign}₹${Math.abs(rupees).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function MyEarningsScreen() {
  return (
    <SeekerThemeOverride>
      <MyEarningsInner />
    </SeekerThemeOverride>
  );
}
