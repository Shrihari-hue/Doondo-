/**
 * AdvanceScreen — apply for a small advance against confirmed upcoming
 * work. Bounded at ₹500–₹5,000.
 *
 * V1 hides the actual approval / payout decisions behind a "we'll be
 * in touch" status flow. Seekers see their request history below the
 * form so the loop is visible.
 */
import { useState } from 'react';
import { Alert, Pressable, ScrollView, TextInput, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { spacing, radii } from '@doondo/tokens';
import { Screen, Text, EmptyState, LoadingSpinner } from '@/components';
import { useTheme } from '@/theme/useTheme';
import { haptic } from '@/lib/haptics';
import { SeekerThemeOverride } from '@/theme/SeekerThemeOverride';
import { advancesApi, type PublicAdvance } from '@/api/advances.api';
import type { AppStackParamList } from '@/navigation/types';

type Nav = NativeStackNavigationProp<AppStackParamList>;

const AMOUNT_PRESETS_PAISE = [50_000, 100_000, 200_000, 500_000]; // ₹500 / ₹1k / ₹2k / ₹5k

function formatINR(paise: number): string {
  return `₹${Math.round(paise / 100).toLocaleString('en-IN')}`;
}

function statusCopy(s: PublicAdvance['status']): { label: string; color: string } {
  switch (s) {
    case 'requested':
      return { label: 'Pending review', color: '#92400E' };
    case 'approved':
      return { label: 'Approved · awaiting payout', color: '#065F46' };
    case 'paid':
      return { label: 'Paid', color: '#047857' };
    case 'repaid':
      return { label: 'Repaid', color: '#1F2937' };
    case 'declined':
      return { label: 'Declined', color: '#B91C1C' };
    case 'cancelled':
      return { label: 'Cancelled', color: '#6B7280' };
  }
}

function Inner() {
  const { theme } = useTheme();
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();

  const [amount, setAmount] = useState(AMOUNT_PRESETS_PAISE[1]!); // ₹1,000 default
  const [reason, setReason] = useState('');

  const listQ = useQuery({
    queryKey: ['advances', 'me'],
    queryFn: () => advancesApi.list(),
  });

  const createMut = useMutation({
    mutationFn: () =>
      advancesApi.create({
        amountPaise: amount,
        reason: reason.trim(),
      }),
    onSuccess: () => {
      haptic('success');
      void queryClient.invalidateQueries({ queryKey: ['advances', 'me'] });
      setReason('');
      Alert.alert(
        'Request received',
        "We'll review your request and update you within a working day.",
      );
    },
    onError: (err) =>
      Alert.alert('Could not submit', (err as Error).message ?? 'Try again later.'),
  });

  const cancelMut = useMutation({
    mutationFn: (id: string) => advancesApi.cancel(id),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['advances', 'me'] }),
  });

  const advances = listQ.data?.advances ?? [];

  return (
    <Screen edges={[]}>
      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + spacing.md,
          paddingBottom: spacing['5xl'],
          gap: spacing.lg,
        }}
      >
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing.md,
            paddingHorizontal: spacing.xl,
          }}
        >
          <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
            <Text style={{ fontSize: 22, color: theme.text.primary }}>←</Text>
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 22, fontWeight: '700', color: theme.text.primary }}>
              Cash advance
            </Text>
            <Text style={{ fontSize: 12, color: theme.text.tertiary, marginTop: 2 }}>
              Get a small advance against confirmed upcoming work. Capped at ₹5,000.
            </Text>
          </View>
        </View>

        {/* Form */}
        <View
          style={{
            marginHorizontal: spacing.xl,
            padding: spacing.lg,
            borderRadius: 16,
            borderWidth: 0.5,
            borderColor: theme.border.subtle,
            backgroundColor: theme.bg.surface,
            gap: spacing.md,
          }}
        >
          <Text style={{ fontSize: 13, color: theme.text.secondary }}>How much do you need?</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
            {AMOUNT_PRESETS_PAISE.map((a) => {
              const active = a === amount;
              return (
                <Pressable
                  key={a}
                  onPress={() => {
                    haptic('selection');
                    setAmount(a);
                  }}
                  style={{
                    paddingHorizontal: spacing.lg,
                    paddingVertical: spacing.sm,
                    borderRadius: radii.pill,
                    borderWidth: 0.5,
                    borderColor: active ? theme.brand.hero : theme.border.default,
                    backgroundColor: active ? theme.brand.heroSubtle : 'transparent',
                  }}
                >
                  <Text
                    style={{
                      fontSize: 14,
                      fontWeight: active ? '700' : '400',
                      color: active ? theme.brand.hero : theme.text.primary,
                    }}
                  >
                    {formatINR(a)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <Text style={{ fontSize: 13, color: theme.text.secondary, marginTop: spacing.sm }}>
            Why do you need it? (Optional, helps us review faster)
          </Text>
          <TextInput
            value={reason}
            onChangeText={setReason}
            placeholder="e.g. School fees, hospital bill, family emergency"
            multiline
            numberOfLines={3}
            style={{
              borderWidth: 0.5,
              borderColor: theme.border.default,
              borderRadius: radii.md,
              padding: spacing.sm,
              fontSize: 14,
              color: theme.text.primary,
              minHeight: 72,
              textAlignVertical: 'top',
            }}
          />
          <Pressable
            onPress={() => createMut.mutate()}
            disabled={createMut.isPending}
            style={{
              paddingVertical: spacing.md,
              borderRadius: radii.pill,
              backgroundColor: '#2563EB',
              alignItems: 'center',
              opacity: createMut.isPending ? 0.6 : 1,
              shadowColor: '#1E40AF',
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.25,
              shadowRadius: 6,
              elevation: 4,
            }}
          >
            <Text style={{ color: '#FFFFFF', fontWeight: '700' }}>
              {createMut.isPending ? 'Submitting…' : `Request ${formatINR(amount)}`}
            </Text>
          </Pressable>
          <Text style={{ fontSize: 11, color: theme.text.tertiary, lineHeight: 16 }}>
            Doondo reviews each request manually. We'll text you within a working day. There's no
            interest charge in this preview, but a small processing fee may apply once we
            partner with a lender — we'll always show it before you confirm.
          </Text>
        </View>

        {/* History */}
        <View style={{ paddingHorizontal: spacing.xl, gap: spacing.sm }}>
          <Text
            style={{ fontSize: 11, fontWeight: '700', letterSpacing: 1.6, color: theme.text.tertiary }}
          >
            YOUR REQUESTS
          </Text>
          {listQ.isLoading ? (
            <LoadingSpinner />
          ) : advances.length === 0 ? (
            <EmptyState
              glyph="📝"
              eyebrow="NO REQUESTS YET"
              title="You haven't asked for an advance"
              message="Submit a request above. We typically respond within a working day."
            />
          ) : (
            <View
              style={{
                backgroundColor: theme.bg.surface,
                borderRadius: 16,
                borderWidth: 0.5,
                borderColor: theme.border.subtle,
                overflow: 'hidden',
              }}
            >
              {advances.map((a, i) => {
                const sc = statusCopy(a.status);
                return (
                  <View
                    key={a.id}
                    style={{
                      paddingHorizontal: spacing.lg,
                      paddingVertical: spacing.md,
                      borderBottomWidth: i < advances.length - 1 ? 0.5 : 0,
                      borderBottomColor: theme.border.subtle,
                    }}
                  >
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}
                    >
                      <Text style={{ fontSize: 15, fontWeight: '700', color: theme.text.primary }}>
                        {formatINR(a.amountPaise)}
                      </Text>
                      <Text style={{ fontSize: 12, fontWeight: '600', color: sc.color }}>
                        {sc.label}
                      </Text>
                    </View>
                    {a.reason ? (
                      <Text
                        style={{ fontSize: 12, color: theme.text.secondary, marginTop: 4 }}
                        numberOfLines={2}
                      >
                        {a.reason}
                      </Text>
                    ) : null}
                    {a.opsNote ? (
                      <Text
                        style={{ fontSize: 12, color: theme.text.primary, marginTop: 4, fontStyle: 'italic' }}
                      >
                        Update from Doondo: {a.opsNote}
                      </Text>
                    ) : null}
                    {a.status === 'requested' && (
                      <Pressable
                        onPress={() => cancelMut.mutate(a.id)}
                        style={{ marginTop: 6, alignSelf: 'flex-start' }}
                      >
                        <Text style={{ fontSize: 12, color: '#B91C1C', fontWeight: '600' }}>
                          Cancel request
                        </Text>
                      </Pressable>
                    )}
                  </View>
                );
              })}
            </View>
          )}
        </View>
      </ScrollView>
    </Screen>
  );
}

export function AdvanceScreen() {
  return (
    <SeekerThemeOverride>
      <Inner />
    </SeekerThemeOverride>
  );
}
