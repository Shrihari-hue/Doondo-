/**
 * SettingsScreen — seeker preferences.
 *
 * Sections, top to bottom:
 *   - Language: persistent picker (5 supported). Stores user preference
 *     in expo-secure-store; full i18n string swap arrives in the next pass.
 *   - Notifications: master toggle (writes to expo-secure-store; the push
 *     register hook respects it on next app start). Granular per-kind
 *     toggles land when we have more notification types in production.
 *   - Theme: light / dark / system — uses the existing ThemeProvider.
 *   - Account: sign out + delete account (delete requires backend
 *     endpoint that doesn't exist yet — surfaces a confirmation with
 *     an "Email support to delete" fallback for now).
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

type Nav = NativeStackNavigationProp<AppStackParamList>;

const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'kn', label: 'ಕನ್ನಡ (Kannada)' },
  { code: 'hi', label: 'हिन्दी (Hindi)' },
  { code: 'ta', label: 'தமிழ் (Tamil)' },
  { code: 'te', label: 'తెలుగు (Telugu)' },
] as const;
type LangCode = (typeof LANGUAGES)[number]['code'];

function SettingsInner() {
  const { theme, scheme, setScheme, followSystem, isManual } = useTheme();
  const { logout, user } = useAuth();
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();

  const [language, setLanguage] = useState<LangCode>('en');
  const [notificationsOn, setNotificationsOn] = useState(true);

  // Hydrate persisted preferences on mount.
  useEffect(() => {
    void (async () => {
      const lang = await getSecure('languagePref');
      if (lang && LANGUAGES.some((l) => l.code === lang)) {
        setLanguage(lang as LangCode);
      }
      const notif = await getSecure('notificationsEnabled');
      if (notif === 'false') setNotificationsOn(false);
    })();
  }, []);

  function pickLanguage(code: LangCode) {
    haptic('selection');
    setLanguage(code);
    void setSecure('languagePref', code).catch(() => undefined);
  }

  function toggleNotifications(value: boolean) {
    haptic('selection');
    setNotificationsOn(value);
    void setSecure('notificationsEnabled', String(value)).catch(() => undefined);
  }

  function confirmSignOut() {
    haptic('warning');
    Alert.alert('Sign out?', "You'll need to sign in again to use Doondo.", [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => void logout() },
    ]);
  }

  function confirmDeleteAccount() {
    haptic('warning');
    Alert.alert(
      'Delete your account?',
      "This is permanent — all your applications, ratings, and chats will be erased. We're still building the in-app delete; email support@doondo.app to delete your account today.",
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Email support',
          onPress: () => {
            // expo-linking would mailto: — keeping it light: copy/explain.
            Alert.alert('Email', 'Send a delete request to support@doondo.app from the address on your account.');
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
            Settings
          </Text>
        </View>

        {/* Language */}
        <Section title="LANGUAGE">
          <View style={cardStyle(theme)}>
            {LANGUAGES.map((l, i) => {
              const active = language === l.code;
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
            Saved on this device. Full in-app translation coming soon.
          </Text>
        </Section>

        {/* Notifications */}
        <Section title="NOTIFICATIONS">
          <View style={cardStyle(theme)}>
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
                  Push notifications
                </Text>
                <Text style={{ fontSize: 12, color: theme.text.tertiary }}>
                  Applications, messages, ratings
                </Text>
              </View>
              <Switch
                value={notificationsOn}
                onValueChange={toggleNotifications}
                trackColor={{ false: theme.bg.muted, true: theme.brand.hero }}
              />
            </View>
          </View>
        </Section>

        {/* Theme */}
        <Section title="APPEARANCE">
          <View style={cardStyle(theme)}>
            <ThemeRow
              label="Light"
              active={isManual && scheme === 'light'}
              onPress={() => setScheme('light')}
            />
            <Divider color={theme.border.subtle} />
            <ThemeRow
              label="Dark"
              active={isManual && scheme === 'dark'}
              onPress={() => setScheme('dark')}
            />
            <Divider color={theme.border.subtle} />
            <ThemeRow
              label="Use system setting"
              active={!isManual}
              onPress={followSystem}
            />
          </View>
          <Text style={{ fontSize: 12, color: theme.text.tertiary, marginTop: 6 }}>
            The seeker side keeps its blue palette regardless — this affects
            employer screens and shared modals.
          </Text>
        </Section>

        {/* Account */}
        <Section title="ACCOUNT">
          <View style={cardStyle(theme)}>
            <RowAction
              label="Email"
              value={user?.email ?? ''}
              onPress={() =>
                Alert.alert('Change email', 'Email changes require verification — coming soon.')
              }
            />
            <Divider color={theme.border.subtle} />
            <RowAction label="Sign out" tone="primary" onPress={confirmSignOut} />
            <Divider color={theme.border.subtle} />
            <RowAction label="Delete account" tone="danger" onPress={confirmDeleteAccount} />
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
