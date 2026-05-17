/**
 * FindFriendsScreen — match the seeker's address book against Doondo
 * users. Privacy-first: phone numbers never leave the device in
 * plaintext; we send SHA-256 hashes only.
 *
 *   1. Request contacts permission via expo-contacts (loaded defensively).
 *   2. Pull phone numbers, normalise, hash → POST /me/find-friends.
 *   3. Render matched users as cards with a tap target that opens their
 *      profile (employer) or a chat (seeker).
 *   4. Surface a referral CTA for contacts not on Doondo yet —
 *      "Invite via WhatsApp" with the user's referral link.
 */
import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, View, Linking } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { spacing, radii } from '@doondo/tokens';
import { Screen, Text, Avatar, EmptyState, LoadingSpinner } from '@/components';
import { useTheme } from '@/theme/useTheme';
import { useAuth } from '@/hooks/useAuth';
import { haptic } from '@/lib/haptics';
import { SeekerThemeOverride } from '@/theme/SeekerThemeOverride';
import {
  findFriendsApi,
  normalisePhone,
  sha256Hex,
  type FoundFriend,
} from '@/api/findFriends.api';
import type { AppStackParamList } from '@/navigation/types';

type Nav = NativeStackNavigationProp<AppStackParamList>;

type LoadState =
  | { kind: 'idle' }
  | { kind: 'permission_denied' }
  | { kind: 'loading' }
  | { kind: 'unsupported'; message: string }
  | { kind: 'ready'; matched: FoundFriend[]; uncheckedNumbers: string[] };

function Inner() {
  const { theme } = useTheme();
  const { user } = useAuth();
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const [state, setState] = useState<LoadState>({ kind: 'idle' });

  useEffect(() => {
    void scan();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function scan() {
    setState({ kind: 'loading' });
    // Defer the require to runtime — Metro can't follow `new Function`,
    // so the bundle succeeds even when expo-contacts isn't installed.
    interface ContactsModule {
      requestPermissionsAsync: () => Promise<{ status: string }>;
      getContactsAsync: (opts: { fields: string[]; pageSize?: number }) => Promise<{
        data: Array<{ phoneNumbers?: Array<{ number?: string }> }>;
      }>;
      Fields: { PhoneNumbers: string };
    }
    let Contacts: ContactsModule | null = null;
    try {
      // eslint-disable-next-line @typescript-eslint/no-implied-eval
      const dynReq = new Function('m', 'return require(m)') as (
        m: string,
      ) => unknown;
      Contacts = dynReq('expo-contacts') as ContactsModule;
    } catch {
      setState({
        kind: 'unsupported',
        message: 'Contacts access needs the expo-contacts package.',
      });
      return;
    }

    try {
      const perm = await Contacts.requestPermissionsAsync();
      if (perm.status !== 'granted') {
        setState({ kind: 'permission_denied' });
        return;
      }
      const { data } = await Contacts.getContactsAsync({
        fields: [Contacts.Fields.PhoneNumbers],
        pageSize: 2000,
      });
      const phones: string[] = [];
      for (const c of data) {
        const nums = c.phoneNumbers ?? [];
        for (const p of nums) {
          if (p.number) phones.push(p.number);
        }
      }
      const normalised = Array.from(
        new Set(phones.map(normalisePhone).filter((n) => n.length >= 7)),
      );
      const hashes = await Promise.all(normalised.map((n) => sha256Hex(n)));
      const { friends } = await findFriendsApi.match(hashes);
      const matchedNums = new Set<string>(); // we don't know which raw nums matched
      setState({
        kind: 'ready',
        matched: friends,
        uncheckedNumbers: normalised.slice(0, 20).filter((n) => !matchedNums.has(n)),
      });
    } catch (err) {
      setState({
        kind: 'unsupported',
        message: (err as Error)?.message ?? 'Could not load contacts.',
      });
    }
  }

  function inviteViaWhatsApp(phone: string) {
    const ref = user?.id ?? '';
    const link = `https://doondo.app/?ref=${ref}`;
    const msg = encodeURIComponent(
      `Join me on Doondo — find work near you. ${link}`,
    );
    void Linking.openURL(`whatsapp://send?phone=${phone}&text=${msg}`).catch(
      () => {
        void Linking.openURL(`sms:${phone}?body=${msg}`).catch(() => undefined);
      },
    );
  }

  function openFriend(f: FoundFriend) {
    haptic('selection');
    if (f.role === 'employer') {
      navigation.navigate('EmployerDetail', { userId: f.id });
    } else {
      // Seekers can't chat each other yet; show a friendly toast.
      Alert.alert(
        f.name,
        `${f.name} is already on Doondo. Worker-to-worker chat is coming soon.`,
      );
    }
  }

  return (
    <Screen edges={[]}>
      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + spacing.md,
          paddingBottom: spacing['5xl'],
          gap: spacing.lg,
        }}
      >
        {/* Header */}
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
              Find friends
            </Text>
            <Text style={{ fontSize: 12, color: theme.text.tertiary, marginTop: 2 }}>
              Match your phone contacts against Doondo. Numbers never leave your device in plaintext.
            </Text>
          </View>
        </View>

        {state.kind === 'loading' && (
          <View style={{ alignItems: 'center', padding: spacing.xl }}>
            <LoadingSpinner />
            <Text style={{ marginTop: spacing.md, fontSize: 13, color: theme.text.secondary }}>
              Scanning your contacts privately…
            </Text>
          </View>
        )}

        {state.kind === 'permission_denied' && (
          <View style={{ paddingHorizontal: spacing.xl }}>
            <EmptyState
              glyph="📵"
              eyebrow="PERMISSION"
              title="Contacts access not granted"
              message="To find friends already on Doondo, allow contacts access in your phone settings, then come back to this screen."
            />
            <Pressable
              onPress={() => void Linking.openSettings()}
              style={{
                alignSelf: 'center',
                marginTop: spacing.lg,
                paddingHorizontal: spacing.lg,
                paddingVertical: spacing.sm,
                borderRadius: radii.pill,
                backgroundColor: '#2563EB',
              }}
            >
              <Text style={{ color: '#FFFFFF', fontWeight: '600' }}>
                Open settings
              </Text>
            </Pressable>
          </View>
        )}

        {state.kind === 'unsupported' && (
          <View style={{ paddingHorizontal: spacing.xl }}>
            <EmptyState
              glyph="⚠️"
              eyebrow="UNAVAILABLE"
              title="Couldn't load contacts"
              message={state.message}
            />
          </View>
        )}

        {state.kind === 'ready' && (
          <>
            <Section title={`ON DOONDO · ${state.matched.length}`}>
              {state.matched.length === 0 ? (
                <Text
                  style={{ color: theme.text.tertiary, fontSize: 13, paddingHorizontal: spacing.lg }}
                >
                  None of your contacts are on Doondo yet. Invite a friend below — you earn ₹100 when they're hired.
                </Text>
              ) : (
                state.matched.map((f) => (
                  <Pressable
                    key={f.id}
                    onPress={() => openFriend(f)}
                    style={({ pressed }) => ({
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: spacing.md,
                      paddingHorizontal: spacing.lg,
                      paddingVertical: spacing.md,
                      borderBottomWidth: 0.5,
                      borderBottomColor: theme.border.subtle,
                      opacity: pressed ? 0.6 : 1,
                    })}
                  >
                    <Avatar
                      size={40}
                      photoUrl={f.photoUrl}
                      name={f.name}
                    />
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 14, fontWeight: '600', color: theme.text.primary }}>
                        {f.name}
                      </Text>
                      <Text style={{ fontSize: 12, color: theme.text.tertiary }}>
                        {f.role === 'employer' ? 'Employer on Doondo' : 'Worker on Doondo'}
                      </Text>
                    </View>
                    <Text style={{ color: theme.brand.hero, fontSize: 12, fontWeight: '600' }}>
                      Open →
                    </Text>
                  </Pressable>
                ))
              )}
            </Section>

            <Section title="INVITE & EARN">
              <Text
                style={{
                  paddingHorizontal: spacing.lg,
                  color: theme.text.secondary,
                  fontSize: 13,
                }}
              >
                Share Doondo with the rest of your contacts. Earn ₹100 each time a worker you refer is hired.
              </Text>
              <View style={{ paddingHorizontal: spacing.lg, gap: spacing.sm }}>
                {state.uncheckedNumbers.slice(0, 8).map((num) => (
                  <Pressable
                    key={num}
                    onPress={() => inviteViaWhatsApp(num)}
                    style={({ pressed }) => ({
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      paddingHorizontal: spacing.md,
                      paddingVertical: spacing.sm,
                      borderRadius: radii.lg,
                      borderWidth: 0.5,
                      borderColor: theme.border.subtle,
                      backgroundColor: pressed ? theme.bg.muted : 'transparent',
                    })}
                  >
                    <Text style={{ fontSize: 14, color: theme.text.primary }}>
                      {num}
                    </Text>
                    <Text style={{ fontSize: 12, fontWeight: '600', color: '#10B981' }}>
                      Invite →
                    </Text>
                  </Pressable>
                ))}
              </View>
            </Section>
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const { theme } = useTheme();
  return (
    <View style={{ gap: spacing.sm, paddingHorizontal: spacing.xl }}>
      <Text style={{ fontSize: 11, fontWeight: '700', letterSpacing: 1.6, color: theme.text.tertiary }}>
        {title}
      </Text>
      <View
        style={{
          backgroundColor: theme.bg.surface,
          borderRadius: 16,
          borderWidth: 0.5,
          borderColor: theme.border.subtle,
          overflow: 'hidden',
          paddingVertical: spacing.sm,
        }}
      >
        {children}
      </View>
    </View>
  );
}

export function FindFriendsScreen() {
  return (
    <SeekerThemeOverride>
      <Inner />
    </SeekerThemeOverride>
  );
}
