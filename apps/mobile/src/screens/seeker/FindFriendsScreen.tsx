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
import * as Contacts from 'expo-contacts';
import { Feather } from '@expo/vector-icons';

import { spacing, radii } from '@doondo/tokens';
import { Screen, Text, Avatar, EmptyState, LoadingSpinner } from '@/components';
import { useTheme } from '@/theme/useTheme';
import { useAuth } from '@/hooks/useAuth';
import { haptic } from '@/lib/haptics';
import { useTranslate } from '@/i18n/useTranslate';
import { SeekerThemeOverride } from '@/theme/SeekerThemeOverride';
import {
  findFriendsApi,
  phoneVariants,
  sha256Hex,
  type FoundFriend,
} from '@/api/findFriends.api';
import type { AppStackParamList } from '@/navigation/types';

type Nav = NativeStackNavigationProp<AppStackParamList>;
type TFn = (key: string, opts?: Record<string, unknown>) => string;

interface InviteContact {
  /** The contact's saved display name, or the number when nameless. */
  name: string;
  /** Dialable number (digits as saved). */
  number: string;
}

type LoadState =
  | { kind: 'idle' }
  | { kind: 'permission_denied' }
  | { kind: 'loading' }
  | { kind: 'unsupported'; message: string }
  | { kind: 'ready'; matched: FoundFriend[]; inviteContacts: InviteContact[] };

function Inner() {
  const { theme } = useTheme();
  const { user } = useAuth();
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const t = useTranslate();
  const [state, setState] = useState<LoadState>({ kind: 'idle' });

  useEffect(() => {
    void scan();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function scan() {
    setState({ kind: 'loading' });

    try {
      const perm = await Contacts.requestPermissionsAsync();
      if (perm.status !== 'granted') {
        setState({ kind: 'permission_denied' });
        return;
      }
      const { data } = await Contacts.getContactsAsync({
        fields: [Contacts.Fields.PhoneNumbers, Contacts.Fields.Name],
        pageSize: 2000,
      });

      // Keep the contact's NAME with each number, and hash several
      // normalisations per number (digits-as-saved, last-10, 91+last-10)
      // so "+91 …" address-book formatting still matches a 10-digit
      // Doondo account. hash → contact lets us turn a server match back
      // into "which contact is this".
      interface ContactEntry {
        name: string;
        number: string;
        hashes: string[];
      }
      const entries: ContactEntry[] = [];
      const seenNumbers = new Set<string>();
      for (const c of data) {
        const displayName = (c.name ?? '').trim();
        for (const p of c.phoneNumbers ?? []) {
          if (!p.number) continue;
          const variants = phoneVariants(p.number);
          if (variants.length === 0) continue;
          const canonical = variants[variants.length - 1]!; // last-10-based key
          if (seenNumbers.has(canonical)) continue;
          seenNumbers.add(canonical);
          entries.push({
            name: displayName || variants[0]!,
            number: variants[0]!,
            hashes: await Promise.all(variants.map((v) => sha256Hex(v))),
          });
          if (entries.length >= 600) break; // stay under the server's hash cap
        }
        if (entries.length >= 600) break;
      }

      const hashToEntry = new Map<string, ContactEntry>();
      for (const e of entries) {
        for (const h of e.hashes) {
          if (!hashToEntry.has(h)) hashToEntry.set(h, e);
        }
      }

      const { friends } = await findFriendsApi.match([...hashToEntry.keys()]);

      // Contacts that matched a Doondo user drop out of the invite list.
      const matchedEntries = new Set<ContactEntry>();
      for (const f of friends) {
        const entry = f.matchedHash ? hashToEntry.get(f.matchedHash) : undefined;
        if (entry) matchedEntries.add(entry);
      }
      const inviteContacts = entries
        .filter((e) => !matchedEntries.has(e))
        .slice(0, 20)
        .map((e) => ({ name: e.name, number: e.number }));

      setState({ kind: 'ready', matched: friends, inviteContacts });
    } catch (err) {
      setState({
        kind: 'unsupported',
        message: (err as Error)?.message ?? t('find_friends.unsupported_default'),
      });
    }
  }

  function inviteViaWhatsApp(phone: string) {
    const ref = user?.id ?? '';
    const link = `https://doondo.app/?ref=${ref}`;
    const msg = encodeURIComponent(
      t('find_friends.whatsapp_text', { link }),
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
        t('find_friends.seeker_alert_body', { name: f.name }),
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
          <Pressable
            onPress={() => navigation.goBack()}
            hitSlop={12}
            accessibilityRole="button"
            style={{
              width: 40,
              height: 40,
              borderRadius: 20,
              borderWidth: 0.5,
              borderColor: theme.border.default,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Feather name="chevron-left" size={20} color={theme.text.primary} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 22, fontWeight: '700', color: theme.text.primary }}>
              {t('find_friends.title')}
            </Text>
            <Text style={{ fontSize: 12, color: theme.text.tertiary, marginTop: 2 }}>
              {t('find_friends.subtitle')}
            </Text>
          </View>
        </View>

        {state.kind === 'loading' && (
          <View style={{ alignItems: 'center', padding: spacing.xl }}>
            <LoadingSpinner />
            <Text style={{ marginTop: spacing.md, fontSize: 13, color: theme.text.secondary }}>
              {t('find_friends.scanning')}
            </Text>
          </View>
        )}

        {state.kind === 'permission_denied' && (
          <View style={{ paddingHorizontal: spacing.xl }}>
            <EmptyState
              icon="user-x"
              eyebrow={t('find_friends.permission_eyebrow')}
              title={t('find_friends.permission_title')}
              message={t('find_friends.permission_message')}
            />
            <Pressable
              onPress={() => void Linking.openSettings()}
              style={({ pressed }) => ({
                alignSelf: 'center',
                marginTop: spacing.lg,
                paddingHorizontal: spacing.lg,
                paddingVertical: spacing.sm,
                borderRadius: radii.pill,
                backgroundColor: theme.brand.hero,
                opacity: pressed ? 0.85 : 1,
              })}
            >
              <Text style={{ color: '#FFFFFF', fontWeight: '600' }}>
                {t('find_friends.open_settings')}
              </Text>
            </Pressable>
          </View>
        )}

        {state.kind === 'unsupported' && (
          <View style={{ paddingHorizontal: spacing.xl }}>
            <EmptyState
              icon="alert-triangle"
              tone="warning"
              eyebrow={t('find_friends.unsupported_eyebrow')}
              title={t('find_friends.unsupported_title')}
              message={state.message}
            />
          </View>
        )}

        {state.kind === 'ready' && (
          <>
            <Section title={t('find_friends.on_doondo_section', { n: state.matched.length })}>
              {state.matched.length === 0 ? (
                <Text
                  style={{ color: theme.text.tertiary, fontSize: 13, paddingHorizontal: spacing.lg }}
                >
                  {t('find_friends.on_doondo_empty')}
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
                        {f.role === 'employer' ? t('find_friends.role_employer') : t('find_friends.role_seeker')}
                      </Text>
                    </View>
                    <Feather name="chevron-right" size={16} color={theme.brand.hero} />
                  </Pressable>
                ))
              )}
            </Section>

            <Section title={t('find_friends.invite_section')}>
              <Text
                style={{
                  paddingHorizontal: spacing.lg,
                  color: theme.text.secondary,
                  fontSize: 13,
                }}
              >
                {t('find_friends.invite_blurb')}
              </Text>
              <View style={{ paddingHorizontal: spacing.lg, gap: spacing.sm }}>
                {state.inviteContacts.slice(0, 8).map((c) => (
                  <Pressable
                    key={c.number}
                    onPress={() => inviteViaWhatsApp(c.number)}
                    style={({ pressed }) => ({
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: spacing.md,
                      paddingHorizontal: spacing.md,
                      paddingVertical: spacing.sm,
                      borderRadius: radii.lg,
                      borderWidth: 0.5,
                      borderColor: theme.border.subtle,
                      backgroundColor: pressed ? theme.bg.muted : 'transparent',
                    })}
                  >
                    <View style={{ flex: 1 }}>
                      <Text
                        style={{ fontSize: 14, fontWeight: '600', color: theme.text.primary }}
                        numberOfLines={1}
                      >
                        {c.name}
                      </Text>
                      {c.name !== c.number ? (
                        <Text style={{ fontSize: 12, color: theme.text.tertiary }}>
                          {c.number}
                        </Text>
                      ) : null}
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <Feather name="share-2" size={13} color={theme.status.success} />
                      <Text style={{ fontSize: 12, fontWeight: '600', color: theme.status.success }}>
                        {t('find_friends.invite_arrow')}
                      </Text>
                    </View>
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
          borderRadius: radii.lg,
          borderWidth: 0.5,
          borderColor: theme.border.subtle,
          overflow: 'hidden',
          paddingVertical: spacing.sm,
          shadowColor: '#0F172A',
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.05,
          shadowRadius: 10,
          elevation: 2,
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
