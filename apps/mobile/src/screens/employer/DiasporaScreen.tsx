/**
 * DiasporaScreen — "Hiring from abroad". For employers living outside
 * India who hire help (caregiver, driver, cook) for family here. Name a
 * local contact who gets an SMS whenever the worker checks in or out.
 */
import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, Switch, TextInput, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Localization from 'expo-localization';
import { spacing, radii } from '@doondo/tokens';
import { Screen, Text, Card, Button, LoadingSpinner } from '@/components';
import { useTheme } from '@/theme/useTheme';
import { haptic } from '@/lib/haptics';
import { diasporaApi } from '@/api/diaspora.api';

const COUNTRIES = ['UAE', 'Saudi Arabia', 'USA', 'UK', 'Canada', 'Singapore', 'Australia', 'Qatar', 'Kuwait', 'Other'];

export function DiasporaScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['diaspora'], queryFn: diasporaApi.get });
  const [enabled, setEnabled] = useState(false);
  const [country, setCountry] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [relation, setRelation] = useState('');
  useEffect(() => {
    const s = q.data;
    if (!s) return;
    setEnabled(s.enabled);
    setCountry(s.country);
    setName(s.localContact?.name ?? '');
    setPhone(s.localContact?.phone ?? '');
    setRelation(s.localContact?.relation ?? '');
  }, [q.data]);
  const save = useMutation({
    mutationFn: () =>
      diasporaApi.save({
        enabled,
        country,
        timezone: Localization.getCalendars()[0]?.timeZone ?? null,
        localContact: phone ? { name: name || null, phone, relation: relation || null } : null,
      }),
    onSuccess: (s) => { haptic('success'); qc.setQueryData(['diaspora'], s); Alert.alert('Saved', s.enabled && s.localContact?.phone ? `${s.localContact.name ?? 'Your contact'} will get an SMS when your worker arrives and leaves.` : 'Settings saved.'); },
    onError: (e) => Alert.alert("Couldn't save", e instanceof Error ? e.message : 'Check the phone number (e.g. +91 98765 43210).'),
  });
  const input = { borderWidth: 1, borderColor: theme.border.default, borderRadius: radii.md, padding: 12, fontSize: 15, color: theme.text.primary } as const;

  return (
    <Screen edges={[]}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + spacing.md, paddingBottom: spacing['5xl'], paddingHorizontal: spacing.xl, gap: spacing.lg }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
          <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
            <Text style={{ fontSize: 22, color: theme.text.primary }}>←</Text>
          </Pressable>
          <Text variant="title" weight="semibold">🌍 Hiring from abroad</Text>
        </View>
        {q.isLoading ? <LoadingSpinner /> : (
          <>
            <Card>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text variant="body" weight="medium">I live outside India</Text>
                  <Text variant="footnote" tone="secondary">For families hiring help for parents or relatives in India.</Text>
                </View>
                <Switch value={enabled} onValueChange={setEnabled} trackColor={{ true: theme.brand.hero, false: theme.border.default }} thumbColor="#FFFFFF" />
              </View>
            </Card>
            {enabled && (
              <>
                <Text variant="footnote" weight="medium">Where do you live?</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
                  {COUNTRIES.map((c) => (
                    <Pressable key={c} onPress={() => setCountry(c)} style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: radii.pill, borderWidth: 1.5, borderColor: country === c ? theme.brand.hero : theme.border.default }}>
                      <Text variant="footnote" style={{ color: country === c ? theme.brand.hero : theme.text.secondary }}>{c}</Text>
                    </Pressable>
                  ))}
                </View>
                <Card>
                  <View style={{ gap: spacing.sm }}>
                    <Text variant="body" weight="medium">Local contact in India</Text>
                    <Text variant="footnote" tone="secondary">Gets an SMS when your worker checks in and out. They don't need the Doondo app.</Text>
                    <TextInput value={name} onChangeText={setName} placeholder="Name (e.g. Amma)" placeholderTextColor={theme.text.tertiary} maxLength={80} style={input} />
                    <TextInput value={relation} onChangeText={setRelation} placeholder="Relation (e.g. Mother)" placeholderTextColor={theme.text.tertiary} maxLength={40} style={input} />
                    <TextInput value={phone} onChangeText={(v) => setPhone(v.replace(/[^0-9+ ]/g, '').slice(0, 16))} placeholder="+91 98765 43210" keyboardType="phone-pad" placeholderTextColor={theme.text.tertiary} style={input} />
                  </View>
                </Card>
                <Text variant="caption" tone="tertiary">
                  Payments still go through UPI or cash in India (paying by foreign card isn't supported yet). Your local contact can pay from Run Payroll's "Paid cash" option.
                </Text>
              </>
            )}
            <Button label={save.isPending ? 'Saving…' : 'Save'} onPress={() => save.mutate()} disabled={save.isPending} />
          </>
        )}
      </ScrollView>
    </Screen>
  );
}
