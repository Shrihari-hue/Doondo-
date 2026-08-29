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
 * Visual language:
 *   - Section labels render in champagne / amber with a small leading icon
 *     (globe, bell, paintbrush, shield, lock, person, account). This gives
 *     the screen the same editorial polish as the rest of Doondo —
 *     section "headers" feel like signage rather than plain caps text.
 *   - Notification rows lead with a small soft-tinted icon avatar so the
 *     category is parseable at a glance.
 *   - Safety + App Lock sit side-by-side in a two-column row (they're
 *     both single-control sections, so giving each its own row would
 *     waste vertical space).
 *
 * All visible strings on this screen route through useTranslate(), which
 * makes it the canonical example of how to localise a screen — copy the
 * pattern when wiring i18n into other screens.
 */

import type { ComponentProps } from 'react';
import { Alert, Pressable, ScrollView, Switch, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';

import { spacing, radii, fontFamily } from '@doondo/tokens';
import { Screen, Text } from '@/components';
import { useTheme } from '@/theme/useTheme';
import { useAuth } from '@/hooks/useAuth';
import { useAppLockStore } from '@/stores/appLock.store';
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
type FeatherName = ComponentProps<typeof Feather>['name'];

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
  const lockEnabled = useAppLockStore((s) => s.enabled);
  const lockAvailable = useAppLockStore((s) => s.available);
  const setLockEnabled = useAppLockStore((s) => s.setEnabled);

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

  function toggleType(k: Exclude<keyof NotificationPrefs, 'quietHours'>) {
    haptic('selection');
    saveMut.mutate({ [k]: !prefs[k] });
  }

  function toggleQuietHours() {
    haptic('selection');
    saveMut.mutate({ quietHours: prefs.quietHours ? null : { start: 22, end: 7 } });
  }

  function setQuietHour(edge: 'start' | 'end', hour: number) {
    haptic('selection');
    const current = prefs.quietHours ?? { start: 22, end: 7 };
    saveMut.mutate({ quietHours: { ...current, [edge]: hour } });
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
    <Screen edges={['top']}>
      <ScrollView
        contentContainerStyle={{
          paddingTop: spacing.md,
          paddingHorizontal: spacing.xl,
          paddingBottom: insets.bottom + spacing['5xl'],
          gap: spacing.xl,
        }}
      >
        {/* Header — chip-style back button + display-font title */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing.md,
            marginBottom: spacing.xs,
          }}
        >
          <Pressable
            onPress={() => navigation.goBack()}
            hitSlop={12}
            style={({ pressed }) => ({
              width: 44,
              height: 44,
              borderRadius: radii.md,
              backgroundColor: theme.bg.surface,
              borderWidth: 0.5,
              borderColor: theme.border.subtle,
              alignItems: 'center',
              justifyContent: 'center',
              shadowColor: '#000',
              shadowOpacity: 0.04,
              shadowRadius: 8,
              shadowOffset: { width: 0, height: 2 },
              opacity: pressed ? 0.6 : 1,
            })}
            accessibilityRole="button"
            accessibilityLabel="Back"
          >
            <Feather name="arrow-left" size={20} color={theme.text.primary} />
          </Pressable>
          <Text
            style={{
              fontFamily: fontFamily.display,
              fontSize: 30,
              fontWeight: '700',
              color: theme.text.primary,
              flex: 1,
              letterSpacing: -0.5,
            }}
          >
            {t('settings.title')}
          </Text>
        </View>

        {/* Language */}
        <Section icon="globe" title={t('settings.language').toUpperCase()}>
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
                        fontWeight: active ? '600' : '500',
                        color: theme.text.primary,
                      }}
                    >
                      {l.label}
                    </Text>
                    {active && (
                      <Feather
                        name="check"
                        size={18}
                        color={theme.brand.hero}
                      />
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
          <Hint icon="shield" theme={theme}>
            {t('settings.language_hint')}
          </Hint>
        </Section>

        {/* Notifications — granular per-type toggles */}
        <Section icon="bell" title={t('settings.notifications').toUpperCase()}>
          <View style={cardStyle(theme)}>
            <PrefRow
              icon="briefcase"
              label="New jobs"
              hint="Posts that match your skills and location"
              value={prefs.jobs}
              onChange={() => toggleType('jobs')}
            />
            <Divider color={theme.border.subtle} />
            <PrefRow
              icon="download"
              label="Application updates"
              hint="Shortlisted, hired, declined"
              value={prefs.applications}
              onChange={() => toggleType('applications')}
            />
            <Divider color={theme.border.subtle} />
            <PrefRow
              icon="message-circle"
              label="Messages"
              hint="Chats from employers"
              value={prefs.messages}
              onChange={() => toggleType('messages')}
            />
            <Divider color={theme.border.subtle} />
            <PrefRow
              icon="star"
              label="Ratings"
              hint="When an employer rates your work"
              value={prefs.ratings}
              onChange={() => toggleType('ratings')}
            />
            <Divider color={theme.border.subtle} />
            <PrefRow
              icon="user-plus"
              label="Referrals"
              hint="When a friend you referred gets hired"
              value={prefs.referrals}
              onChange={() => toggleType('referrals')}
            />
            <Divider color={theme.border.subtle} />
            <PrefRow
              icon="moon"
              label="Quiet hours"
              hint="Only SOS alerts land during this window"
              value={prefs.quietHours !== null}
              onChange={toggleQuietHours}
            />
            {prefs.quietHours && (
              <View style={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.md, gap: spacing.sm }}>
                <View style={{ gap: 4 }}>
                  <Text style={{ fontSize: 11, fontWeight: '600', color: theme.text.tertiary }}>FROM</Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
                    {QUIET_START_HOURS.map((h) => (
                      <HourChip
                        key={h}
                        hour={h}
                        active={prefs.quietHours!.start === h}
                        onPress={() => setQuietHour('start', h)}
                      />
                    ))}
                  </View>
                </View>
                <View style={{ gap: 4 }}>
                  <Text style={{ fontSize: 11, fontWeight: '600', color: theme.text.tertiary }}>UNTIL</Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
                    {QUIET_END_HOURS.map((h) => (
                      <HourChip
                        key={h}
                        hour={h}
                        active={prefs.quietHours!.end === h}
                        onPress={() => setQuietHour('end', h)}
                      />
                    ))}
                  </View>
                </View>
              </View>
            )}
          </View>
          <Hint icon="info" theme={theme}>
            Turning a category off stops both push and in-app banners for that type. Quiet
            hours hold back everything except SOS alerts, which always land.
          </Hint>
        </Section>

        {/* Theme */}
        <Section icon="edit-2" title={t('settings.appearance').toUpperCase()}>
          <View style={cardStyle(theme)}>
            <ThemeRow
              icon="sun"
              label={t('settings.appearance_light')}
              active={isManual && scheme === 'light'}
              onPress={() => setScheme('light')}
            />
            <Divider color={theme.border.subtle} />
            <ThemeRow
              icon="moon"
              label={t('settings.appearance_dark')}
              active={isManual && scheme === 'dark'}
              onPress={() => setScheme('dark')}
            />
            <Divider color={theme.border.subtle} />
            <ThemeRow
              icon="settings"
              label={t('settings.appearance_system')}
              active={!isManual}
              onPress={followSystem}
            />
          </View>
          <Hint icon="star" theme={theme}>
            {t('settings.appearance_hint')}
          </Hint>
        </Section>

        {/* Safety + App Lock — two columns; both are single-control sections */}
        <View style={{ flexDirection: 'row', gap: spacing.md }}>
          {/* Safety */}
          <View style={{ flex: 1, gap: spacing.sm }}>
            <SectionLabel icon="shield" title={t('settings.safety').toUpperCase()} />
            <Pressable
              onPress={() => {
                haptic('selection');
                navigation.navigate('Sos');
              }}
              style={({ pressed }) => ({
                ...cardStyle(theme),
                padding: spacing.lg,
                gap: spacing.xs,
                opacity: pressed ? 0.7 : 1,
              })}
            >
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                }}
              >
                <Text
                  style={{
                    flex: 1,
                    fontSize: 15,
                    fontWeight: '600',
                    color: theme.text.primary,
                  }}
                >
                  {t('settings.sos_label')}
                </Text>
                <Feather
                  name="chevron-right"
                  size={18}
                  color={theme.text.tertiary}
                />
              </View>
              <Text style={{ fontSize: 12, color: theme.text.secondary }}>
                {t('settings.sos_value')}
              </Text>
              <View
                style={{
                  height: 0.5,
                  backgroundColor: theme.border.subtle,
                  marginVertical: spacing.xs,
                }}
              />
              <View style={{ flexDirection: 'row', gap: spacing.xs }}>
                <Feather
                  name="shield"
                  size={11}
                  color={theme.text.tertiary}
                  style={{ marginTop: 2 }}
                />
                <Text
                  style={{
                    flex: 1,
                    fontSize: 11,
                    color: theme.text.tertiary,
                    lineHeight: 15,
                  }}
                >
                  {t('settings.sos_hint')}
                </Text>
              </View>
            </Pressable>
          </View>

          {/* App lock */}
          <View style={{ flex: 1, gap: spacing.sm }}>
            <SectionLabel
              icon="lock"
              title={t('app_lock.settings_section').toUpperCase()}
            />
            <View style={[cardStyle(theme), { padding: spacing.lg, gap: spacing.xs }]}>
              {lockAvailable ? (
                <>
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                    }}
                  >
                    <Text
                      style={{
                        flex: 1,
                        fontSize: 15,
                        fontWeight: '600',
                        color: theme.text.primary,
                      }}
                    >
                      {t('app_lock.settings_toggle')}
                    </Text>
                    <Switch
                      value={lockEnabled}
                      onValueChange={() => {
                        haptic('selection');
                        void setLockEnabled(!lockEnabled);
                      }}
                      trackColor={{ false: theme.bg.muted, true: theme.brand.hero }}
                    />
                  </View>
                  <Text
                    style={{
                      fontSize: 11,
                      color: theme.text.tertiary,
                      lineHeight: 15,
                    }}
                  >
                    {t('app_lock.settings_toggle_desc')}
                  </Text>
                </>
              ) : (
                <Text variant="footnote" tone="tertiary">
                  {t('app_lock.settings_unavailable')}
                </Text>
              )}
            </View>
          </View>
        </View>

        {/* Accessibility */}
        <Section icon="user" title="ACCESSIBILITY">
          <View style={cardStyle(theme)}>
            <View
              style={{
                paddingHorizontal: spacing.lg,
                paddingVertical: spacing.md + 2,
                gap: spacing.sm,
              }}
            >
              <Text
                style={{ fontSize: 15, fontWeight: '600', color: theme.text.primary }}
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
                        paddingVertical: spacing.xs + 2,
                        borderRadius: radii.pill,
                        borderWidth: active ? 1 : 0.5,
                        borderColor: active ? theme.brand.hero : theme.border.default,
                        backgroundColor: active ? theme.brand.heroSubtle : 'transparent',
                        minWidth: 56,
                        alignItems: 'center',
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 13,
                          fontWeight: active ? '600' : '500',
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
                  style={{ fontSize: 15, fontWeight: '600', color: theme.text.primary }}
                >
                  Speak text on tap
                </Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Feather
                    name="volume-2"
                    size={11}
                    color={theme.text.tertiary}
                  />
                  <Text style={{ fontSize: 12, color: theme.text.tertiary }}>
                    Reads job titles, pay, and descriptions aloud.
                  </Text>
                </View>
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
        <Section icon="user" title={t('settings.account').toUpperCase()}>
          <View style={cardStyle(theme)}>
            <RowAction
              label={t('settings.email')}
              value={user?.email ?? ''}
              chevron
              onPress={() =>
                Alert.alert(
                  t('settings.email_change_title'),
                  t('settings.email_change_body'),
                )
              }
            />
            <Divider color={theme.border.subtle} />
            <RowAction
              icon="log-out"
              label={t('settings.sign_out')}
              tone="primary"
              onPress={confirmSignOut}
            />
          </View>
          {/* Delete account is destructive + irreversible — give it its own
              card with breathing room so it's harder to mistap right after
              Sign out. */}
          <View style={[cardStyle(theme), { marginTop: spacing.md }]}>
            <RowAction
              icon="trash-2"
              label={t('settings.delete_account')}
              tone="danger"
              chevron
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

/**
 * Small icon-prefixed amber label that sits above each settings card.
 * The amber tone gives the screen its editorial feel — it's the same
 * accent we use on the section "signage" elsewhere in the seeker tree.
 */
function SectionLabel({ icon, title }: { icon: FeatherName; title: string }) {
  const { theme } = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
      }}
    >
      <Feather name={icon} size={12} color={theme.accent.amber} />
      <Text
        style={{
          fontSize: 11,
          fontWeight: '600',
          letterSpacing: 1.6,
          color: theme.accent.amber,
        }}
      >
        {title}
      </Text>
    </View>
  );
}

function Section({
  icon,
  title,
  children,
}: {
  icon: FeatherName;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View style={{ gap: spacing.sm }}>
      <SectionLabel icon={icon} title={title} />
      {children}
    </View>
  );
}

/**
 * Below-card explanatory text with a tiny leading icon. Used for the
 * little "Saved on this device", "Turning a category off…" footnotes.
 */
function Hint({
  icon,
  theme,
  children,
}: {
  icon: FeatherName;
  theme: ReturnType<typeof useTheme>['theme'];
  children: React.ReactNode;
}) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 6,
        marginTop: 4,
        paddingHorizontal: 2,
      }}
    >
      <Feather
        name={icon}
        size={11}
        color={theme.text.tertiary}
        style={{ marginTop: 3 }}
      />
      <Text style={{ flex: 1, fontSize: 11, color: theme.text.tertiary, lineHeight: 15 }}>
        {children}
      </Text>
    </View>
  );
}

function ThemeRow({
  icon,
  label,
  active,
  onPress,
}: {
  icon: FeatherName;
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  const { theme } = useTheme();
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: spacing.lg,
        paddingVertical: spacing.md + 2,
        backgroundColor: active ? theme.brand.heroSubtle : 'transparent',
        opacity: pressed ? 0.6 : 1,
        gap: spacing.md,
      })}
    >
      <Feather
        name={icon}
        size={16}
        color={active ? theme.brand.hero : theme.text.secondary}
      />
      <Text
        style={{
          flex: 1,
          fontSize: 15,
          fontWeight: active ? '600' : '500',
          color: active ? theme.brand.hero : theme.text.primary,
        }}
      >
        {label}
      </Text>
      {/* Always-visible radio indicator so the selected option is obvious
          even when the row isn't tinted (e.g. on the seeker blue palette). */}
      <View
        style={{
          width: 18,
          height: 18,
          borderRadius: 9,
          borderWidth: 1.5,
          borderColor: active ? theme.brand.hero : theme.border.default,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {active && (
          <View
            style={{
              width: 9,
              height: 9,
              borderRadius: 5,
              backgroundColor: theme.brand.hero,
            }}
          />
        )}
      </View>
    </Pressable>
  );
}

function RowAction({
  icon,
  label,
  value,
  tone,
  chevron,
  onPress,
}: {
  icon?: FeatherName;
  label: string;
  value?: string;
  tone?: 'primary' | 'danger';
  /** Show a right-aligned chevron — use for rows that navigate. */
  chevron?: boolean;
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
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: spacing.lg,
        paddingVertical: spacing.md + 2,
        opacity: pressed ? 0.6 : 1,
        gap: spacing.sm,
      })}
    >
      {icon && (
        <Feather name={icon} size={16} color={labelColor} />
      )}
      <View style={{ flex: 1 }}>
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
      </View>
      {chevron && (
        <Feather
          name="chevron-right"
          size={18}
          color={tone === 'danger' ? theme.status.danger : theme.text.tertiary}
        />
      )}
    </Pressable>
  );
}

/**
 * Per-category notification toggle. Leads with a tinted icon avatar so
 * each row is parseable at a glance — the eye finds the category by
 * the icon shape, not by re-reading the label.
 */
const QUIET_START_HOURS = [20, 21, 22, 23];
const QUIET_END_HOURS = [5, 6, 7, 8];

function formatHour(h: number): string {
  const period = h < 12 ? 'AM' : 'PM';
  const twelve = h % 12 === 0 ? 12 : h % 12;
  return `${twelve} ${period}`;
}

function HourChip({ hour, active, onPress }: { hour: number; active: boolean; onPress: () => void }) {
  const { theme } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={{
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 999,
        borderWidth: active ? 1.5 : 1,
        borderColor: active ? theme.brand.hero : theme.border.subtle,
        backgroundColor: active ? theme.brand.heroSubtle : 'transparent',
      }}
    >
      <Text style={{ fontSize: 12, fontWeight: active ? '700' : '500', color: active ? theme.brand.hero : theme.text.secondary }}>
        {formatHour(hour)}
      </Text>
    </Pressable>
  );
}

function PrefRow({
  icon,
  label,
  hint,
  value,
  onChange,
}: {
  icon: FeatherName;
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
        gap: spacing.md,
      }}
    >
      <View
        style={{
          width: 32,
          height: 32,
          borderRadius: radii.sm,
          backgroundColor: theme.brand.heroSubtle,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Feather name={icon} size={16} color={theme.brand.hero} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ fontSize: 14, fontWeight: '600', color: theme.text.primary }}>
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
