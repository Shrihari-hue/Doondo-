/**
 * SettingsScreen — seeker preferences.
 *
 * Sections, top to bottom:
 *   - Language: persistent picker (5 supported). Calls setLocale() on the
 *     LanguageProvider, which persists to secure-store and triggers a
 *     full re-render of the app tree with the new language pack.
 *   - Notifications: master toggle (writes to expo-secure-store; the push
 *     register hook respects it on next app start). Granular per-kind
 *     toggles land when we have more notification types in production.
 *   - Theme: light / dark / system — uses the existing ThemeProvider.
 *   - Account: sign out + delete account (delete requires backend
 *     endpoint that doesn't exist yet — surfaces a confirmation with
 *     an "Email support to delete" fallback for now).
 *
 * All visible strings on this screen route through useTranslate(), which
 * makes it the canonical example of how to localise a screen — copy the
 * pattern when wiring i18n into other screens.
 */

import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, Switch, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { spacing, radii } from '@doondo/tokens';
import { Screen, Text } from '@/components';
import { useTheme } from '@/theme/useTheme';
import { useAuth } from '@/hooks/useAuth';
import { getSecure, setSecure } from '@/lib/secureStore';
import { haptic } from '@/lib/haptics';
import { SeekerThemeOverride } from '@/theme/SeekerThemeOverride';
import type { AppStackParamList } from '@/navigation/types';
import { useLocale } from '@/i18n/LanguageProvider';
import { useTranslate } from '@/i18n/useTranslate';
import { LOCALE_LABELS, SUPPORTED_LOCALES, type SupportedLocale } from '@/i18n';
import {
  useAccessibility,
  TEXT_SCALE_STEPS,
  type TextScale,
} from '@/lib/accessibility';
import {
  notificationPrefsApi,
  DEFAULT_PREFS,
  type NotificationPrefs,
} from '@/api/notificationPrefs.api';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

type Nav = NativeStackNavigationProp<AppStackParamList>;

const LANGUAGES = SUPPORTED_LOCALES.map((code) => ({
  code,
  label: LOCALE_LABELS[code],
}));
type LangCode = SupportedLocale;

function SettingsInner() {
  const { theme, scheme, setScheme, followSystem, isManual } = useTheme();
  const { logout, user } = useAuth();
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const { locale, setLocale } = useLocale();
  const t = useTranslate();
  const access = useAccessibility();
  const queryClient = useQueryClient();

  // Per-type push notification prefs from /me/notification-prefs.
  const prefsQuery = useQuery({
    queryKey: ['notification-prefs'],
    queryFn: () => notificationPrefsApi.get(),
    staleTime: 60 * 1000,
  });
  const prefs: NotificationPrefs = prefsQuery.data?.prefs ?? DEFAULT_PREFS;
  const saveMut = useMutation({
    mutationFn: (patch: Partial<NotificationPrefs>) =>
      notificationPrefsApi.save(patch),
    onMutate: (patch) => {
      // Optimistic update so the switch animates immediately.
      queryClient.setQueryData(['notification-prefs'], (old: { prefs: NotificationPrefs } | undefined) => ({
        prefs: { ...(old?.prefs ?? DEFAULT_PREFS), ...patch },
      }));
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['notification-prefs'] }),
  });

  function toggleType(k: keyof NotificationPrefs) {
    haptic('selection');
    saveMut.mutate({ [k]: !prefs[k] });
  }

  function pickLanguage(code: LangCode) {
    haptic('selection');
    // Fire-and-forget — setLocale() persists + triggers a re-render via
    // the provider context. We don't need to await it before continuing.
    void setLocale(code).catch(() => undefined);
  }

  function confirmSignOut() {
    haptic('warning');
    Alert.alert(
      t('settings.sign_out_confirm_title'),
      t('settings.sign_out_confirm_body'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('settings.sign_out'),
          style: 'destructive',
          onPress: () => void logout(),
        },
      ],
    );
  }

  function confirmDeleteAccount() {
    haptic('warning');
    Alert.alert(
      t('settings.delete_confirm_title'),
      t('settings.delete_confirm_body'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('settings.email_support'),
          onPress: () => {
            Alert.alert(
              t('settings.email_support'),
              t('settings.email_support_body'),
            );
          },
        },
      ],
    );
  }

  return (
    <Screen edges={[]}>
      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + spacing.md,
          paddingHorizontal: spacing.xl,
          paddingBottom: spacing['5xl'],
          gap: spacing.xl,
        }}
      >
        {/* Header */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
          <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
            <Text style={{ fontSize: 22, color: theme.text.primary }}>←</Text>
          </Pressable>
          <Text
            style={{
              fontSize: 22,
              fontWeight: '700',
              color: theme.text.primary,
              flex: 1,
            }}
          >
            {t('settings.title')}
          </Text>
        </View>

        {/* Language */}
        <Section title={t('settings.language').toUpperCase()}>
          <View style={cardStyle(theme)}>
            {LANGUAGES.map((l, i) => {
              const active = locale === l.code;
              return (
                <View key={l.code}>
                  <Pressable
                    onPress={() => pickLanguage(l.code)}
                    style={({ pressed }) => ({
                      flexDirection: 'row',
                      alignItems: 'center',
                      paddingHorizontal: spacing.lg,
                      paddingVertical: spacing.md + 2,
                      opacity: pressed ? 0.6 : 1,
                    })}
                  >
                    <Text
                      style={{
                        flex: 1,
                        fontSize: 15,
                        fontWeight: '500',
                        color: theme.text.primary,
                      }}
                    >
                      {l.label}
                    </Text>
                    {active && (
                      <Text style={{ color: theme.brand.hero, fontSize: 18, fontWeight: '700' }}>
                        ✓
                      </Text>
                    )}
                  </Pressable>
                  {i < LANGUAGES.length - 1 && (
                    <View
                      style={{
                        height: 0.5,
                        backgroundColor: theme.border.subtle,
                        marginLeft: spacing.lg,
                      }}
                    />
                  )}
                </View>
              );
            })}
          </View>
          <Text style={{ fontSize: 12, color: theme.text.tertiary, marginTop: 6 }}>
            {t('settings.language_hint')}
          </Text>
        </Section>

        {/* Notifications — granular per-type toggles */}
        <Section title={t('settings.notifications').toUpperCase()}>
          <View style={cardStyle(theme)}>
            <PrefRow
              label="New jobs"
              hint="Posts that match your skills and location"
              value={prefs.jobs}
              onChange={() => toggleType('jobs')}
            />
            <Divider color={theme.border.subtle} />
            <PrefRow
              label="Application updates"
              hint="Shortlisted, hired, declined"
              value={prefs.applications}
              onChange={() => toggleType('applications')}
            />
            <Divider color={theme.border.subtle} />
            <PrefRow
              label="Messages"
              hint="Chats from employers"
              value={prefs.messages}
              onChange={() => toggleType('messages')}
            />
            <Divider color={theme.border.subtle} />
            <PrefRow
              label="Ratings"
              hint="When an employer rates your work"
              value={prefs.ratings}
              onChange={() => toggleType('ratings')}
            />
            <Divider color={theme.border.subtle} />
            <PrefRow
              label="Referrals"
              hint="When a friend you referred gets hired"
              value={prefs.referrals}
              onChange={() => toggleType('referrals')}
            />
          </View>
          <Text style={{ fontSize: 11, color: theme.text.tertiary, marginTop: 6 }}>
            Turning a category off stops both push and in-app banners for that type.
          </Text>
        </Section>

        {/* Theme */}
        <Section title={t('settings.appearance').toUpperCase()}>
          <View style={cardStyle(theme)}>
            <ThemeRow
              label={t('settings.appearance_light')}
              active={isManual && scheme === 'light'}
              onPress={() => setScheme('light')}
            />
            <Divider color={theme.border.subtle} />
            <ThemeRow
              label={t('settings.appearance_dark')}
              active={isManual && scheme === 'dark'}
              onPress={() => setScheme('dark')}
            />
            <Divider color={theme.border.subtle} />
            <ThemeRow
              label={t('settings.appearance_system')}
              active={!isManual}
              onPress={followSystem}
            />
          </View>
          <Text style={{ fontSize: 12, color: theme.text.tertiary, marginTop: 6 }}>
            {t('settings.appearance_hint')}
          </Text>
        </Section>

        {/* Safety */}
        <Section title={t('settings.safety').toUpperCase()}>
          <View style={cardStyle(theme)}>
            <RowAction
              label={t('settings.sos_label')}
              value={t('settings.sos_value')}
              onPress={() => {
                haptic('selection');
                navigation.navigate('Sos');
              }}
            />
          </View>
          <Text style={{ fontSize: 12, color: theme.text.tertiary, marginTop: 6 }}>
            {t('settings.sos_hint')}
          </Text>
        </Section>

        {/* Accessibility */}
        <Section title="ACCESSIBILITY">
          <View style={cardStyle(theme)}>
            <View
              style={{
                paddingHorizontal: spacing.lg,
                paddingVertical: spacing.md + 2,
                gap: spacing.sm,
              }}
            >
              <Text
                style={{ fontSize: 15, fontWeight: '500', color: theme.text.primary }}
              >
                Text size
              </Text>
              <View style={{ flexDirection: 'row', gap: spacing.xs, flexWrap: 'wrap' }}>
                {TEXT_SCALE_STEPS.map((s) => {
                  const active = access.textScale === s;
                  return (
                    <Pressable
                      key={s}
                      onPress={() => {
                        haptic('selection');
                        void access.setTextScale(s as TextScale);
                      }}
                      style={{
                        paddingHorizontal: spacing.md,
                        paddingVertical: spacing.xs,
                        borderRadius: radii.pill,
                        borderWidth: 0.5,
                        borderColor: active ? theme.brand.hero : theme.border.default,
                        backgroundColor: active ? theme.brand.heroSubtle : 'transparent',
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 12 + (s - 1) * 6,
                          fontWeight: active ? '600' : '400',
                          color: active ? theme.brand.hero : theme.text.secondary,
                        }}
                      >
                        Aa{s !== 1 ? ` ${s.toFixed(2).replace(/0$/, '')}×` : ''}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              <Text style={{ fontSize: 11, color: theme.text.tertiary }}>
                Bigger text across the whole app. Useful if reading small fonts is uncomfortable.
              </Text>
            </View>
            <Divider color={theme.border.subtle} />
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                paddingHorizontal: spacing.lg,
                paddingVertical: spacing.md,
              }}
            >
              <View style={{ flex: 1, gap: 2 }}>
                <Text
                  style={{ fontSize: 15, fontWeight: '500', color: theme.text.primary }}
                >
                  Speak text on tap
                </Text>
                <Text style={{ fontSize: 12, color: theme.text.tertiary }}>
                  Reads job titles, pay, and descriptions aloud.
                </Text>
              </View>
              <Switch
                value={access.ttsEnabled}
                onValueChange={(v) => {
                  haptic('selection');
                  void access.setTtsEnabled(v);
                  if (v) access.speak('Voice mode on');
                }}
                trackColor={{ false: theme.bg.muted, true: theme.brand.hero }}
              />
            </View>
          </View>
        </Section>

        {/* Account */}
        <Section title={t('settings.account').toUpperCase()}>
          <View style={cardStyle(theme)}>
            <RowAction
              label={t('settings.email')}
              value={user?.email ?? ''}
              onPress={() =>
                Alert.alert(
                  t('settings.email_change_title'),
                  t('settings.email_change_body'),
                )
              }
            />
            <Divider color={theme.border.subtle} />
            <RowAction
              label={t('settings.sign_out')}
              tone="primary"
              onPress={confirmSignOut}
            />
            <Divider color={theme.border.subtle} />
            <RowAction
              label={t('settings.delete_account')}
              tone="danger"
              onPress={confirmDeleteAccount}
            />
          </View>
        </Section>

        <Text
          style={{
            textAlign: 'center',
            color: theme.text.tertiary,
            fontSize: 11,
            marginTop: spacing.lg,
          }}
        >
          Doondo · v0.1.0
        </Text>
      </ScrollView>
    </Screen>
  );
}

// ─── Pieces ──────────────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const { theme } = useTheme();
  return (
    <View style={{ gap: spacing.sm }}>
      <Text
        style={{
          fontSize: 11,
          fontWeight: '600',
          letterSpacing: 1.6,
          color: theme.text.tertiary,
        }}
      >
        {title}
      </Text>
      {children}
    </View>
  );
}

function ThemeRow({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  const { theme } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: spacing.lg,
        paddingVertical: spacing.md + 2,
        opacity: pressed ? 0.6 : 1,
      })}
    >
      <Text
        style={{ flex: 1, fontSize: 15, fontWeight: '500', color: theme.text.primary }}
      >
        {label}
      </Text>
      {active && (
        <Text style={{ color: theme.brand.hero, fontSize: 18, fontWeight: '700' }}>✓</Text>
      )}
    </Pressable>
  );
}

function RowAction({
  label,
  value,
  tone,
  onPress,
}: {
  label: string;
  value?: string;
  tone?: 'primary' | 'danger';
  onPress: () => void;
}) {
  const { theme } = useTheme();
  const labelColor =
    tone === 'danger'
      ? theme.status.danger
      : tone === 'primary'
        ? theme.brand.hero
        : theme.text.primary;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        paddingHorizontal: spacing.lg,
        paddingVertical: spacing.md + 2,
        opacity: pressed ? 0.6 : 1,
      })}
    >
      <Text
        style={{
          fontSize: 15,
          fontWeight: tone === 'primary' || tone === 'danger' ? '600' : '500',
          color: labelColor,
        }}
      >
        {label}
      </Text>
      {value ? (
        <Text style={{ fontSize: 12, color: theme.text.tertiary, marginTop: 2 }}>
          {value}
        </Text>
      ) : null}
    </Pressable>
  );
}

function PrefRow({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint: string;
  value: boolean;
  onChange: () => void;
}) {
  const { theme } = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: spacing.lg,
        paddingVertical: spacing.md,
      }}
    >
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ fontSize: 14, fontWeight: '500', color: theme.text.primary }}>
          {label}
        </Text>
        <Text style={{ fontSize: 11, color: theme.text.tertiary }}>{hint}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ false: theme.bg.muted, true: theme.brand.hero }}
      />
    </View>
  );
}

function Divider({ color }: { color: string }) {
  return <View style={{ height: 0.5, backgroundColor: color, marginLeft: spacing.lg }} />;
}

function cardStyle(theme: ReturnType<typeof useTheme>['theme']) {
  return {
    backgroundColor: theme.bg.surface,
    borderRadius: radii.lg,
    borderWidth: 0.5,
    borderColor: theme.border.subtle,
    overflow: 'hidden' as const,
  };
}

export function SettingsScreen() {
  return (
    <SeekerThemeOverride>
      <SettingsInner />
    </SeekerThemeOverride>
  );
}
