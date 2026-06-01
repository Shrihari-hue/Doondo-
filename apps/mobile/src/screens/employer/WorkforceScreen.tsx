/**
 * WorkforceScreen — "My crew": the employer's saved workers for one-tap
 * re-hire, seeded by importing phone contacts.
 *
 * Import flow: read the device address book (expo-contacts, loaded via
 * require() so the bundle still works where it isn't present), send the
 * names + numbers to /crew/import, and the server matches them to
 * existing Doondo workers. Matched workers join the crew; the rest come
 * back as "not on Doondo yet" so the employer can invite them.
 */

import { useState } from 'react';
import { Alert, Pressable, ScrollView, Share, View } from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

import { spacing, radii } from '@doondo/tokens';
import { Screen, Text, Card, Avatar, EmptyState, LoadingSpinner } from '@/components';
import { useTheme } from '@/theme/useTheme';
import { useTranslate } from '@/i18n/useTranslate';
import { haptic } from '@/lib/haptics';
import { crewApi, type ContactInput } from '@/api/crew.api';

/**
 * Read the device contacts as {name, phone} pairs. Returns null when the
 * native module is unavailable, and [] when permission is denied — the
 * caller distinguishes "can't" from "nothing".
 */
async function readContacts(): Promise<ContactInput[] | null> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Contacts: any = require('expo-contacts');
    if (!Contacts?.requestPermissionsAsync) return null;
    const perm = await Contacts.requestPermissionsAsync();
    if (perm.status !== 'granted') return [];
    const { data } = await Contacts.getContactsAsync({
      fields: [Contacts.Fields.PhoneNumbers],
    });
    const out: ContactInput[] = [];
    for (const c of data ?? []) {
      const phone = c.phoneNumbers?.[0]?.number;
      if (phone) out.push({ name: c.name ?? '', phone });
      if (out.length >= 500) break;
    }
    return out;
  } catch {
    return null;
  }
}

export function WorkforceScreen() {
  const { theme } = useTheme();
  const t = useTranslate();
  const queryClient = useQueryClient();
  const [importing, setImporting] = useState(false);

  const query = useQuery({
    queryKey: ['crew'],
    queryFn: () => crewApi.list(),
  });
  const crew = query.data?.workers ?? [];

  const removeMut = useMutation({
    mutationFn: (workerId: string) => crewApi.remove(workerId),
    onSuccess: () => {
      haptic('selection');
      void queryClient.invalidateQueries({ queryKey: ['crew'] });
    },
  });

  async function importContacts() {
    if (importing) return;
    setImporting(true);
    try {
      const contacts = await readContacts();
      if (contacts === null) {
        Alert.alert(t('employer.crew.no_contacts_title'), t('employer.crew.no_contacts_body'));
        return;
      }
      if (contacts.length === 0) {
        Alert.alert(t('employer.crew.permission_title'), t('employer.crew.permission_body'));
        return;
      }
      const result = await crewApi.import(contacts);
      haptic('success');
      void queryClient.invalidateQueries({ queryKey: ['crew'] });
      const addedN = result.added.length;
      const inviteN = result.notOnDoondo.length;
      Alert.alert(
        t('employer.crew.import_done_title', { n: addedN }),
        t('employer.crew.import_done_body', { invite: inviteN }),
        inviteN > 0
          ? [
              { text: t('employer.crew.later'), style: 'cancel' },
              {
                text: t('employer.crew.invite'),
                onPress: () => {
                  void Share.share({ message: t('employer.crew.invite_message') });
                },
              },
            ]
          : undefined,
      );
    } catch {
      haptic('error');
      Alert.alert(t('employer.crew.import_fail'));
    } finally {
      setImporting(false);
    }
  }

  return (
    <Screen edges={['top']}>
      <ScrollView
        contentContainerStyle={{
          padding: spacing.xl,
          paddingTop: spacing['2xl'],
          paddingBottom: spacing['4xl'],
          gap: spacing.lg,
        }}
      >
        <View style={{ gap: spacing.xs }}>
          <Text variant="caption" tone="tertiary" style={{ letterSpacing: 1.2 }}>
            {t('employer.workforce.eyebrow')}
          </Text>
          <Text variant="display" weight="medium" display>
            {t('employer.crew.title')}
          </Text>
        </View>

        <Pressable
          onPress={() => void importContacts()}
          disabled={importing}
          style={{
            paddingVertical: 14,
            borderRadius: radii.pill,
            alignItems: 'center',
            backgroundColor: theme.brand.hero,
            opacity: importing ? 0.6 : 1,
          }}
        >
          <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 15 }}>
            {importing ? t('employer.crew.importing') : t('employer.crew.import_cta')}
          </Text>
        </Pressable>

        {query.isLoading ? (
          <LoadingSpinner />
        ) : crew.length === 0 ? (
          <EmptyState
            glyph="👥"
            tone="hero"
            eyebrow={t('employer.crew.empty_eyebrow')}
            title={t('employer.crew.empty_title')}
            message={t('employer.crew.empty_body')}
          />
        ) : (
          <View style={{ gap: spacing.sm }}>
            {crew.map((w) => (
              <Card key={w.id}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
                  <Avatar name={w.name} photoUrl={w.photoUrl} size={44} premium={w.isVerified} />
                  <View style={{ flex: 1 }}>
                    <Text variant="bodyLarge" weight="medium" numberOfLines={1}>
                      {w.name}
                    </Text>
                    {w.skills.length > 0 && (
                      <Text variant="footnote" tone="secondary" numberOfLines={1}>
                        {w.skills.slice(0, 3).join(' · ')}
                      </Text>
                    )}
                  </View>
                  <Pressable
                    onPress={() => removeMut.mutate(w.id)}
                    hitSlop={10}
                    accessibilityRole="button"
                  >
                    <Text variant="footnote" tone="tertiary">
                      {t('employer.crew.remove')}
                    </Text>
                  </Pressable>
                </View>
              </Card>
            ))}
          </View>
        )}
      </ScrollView>
    </Screen>
  );
}
