import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Image,
  Pressable,
  ScrollView,
  View,
  useWindowDimensions,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { radii, spacing } from '@doondo/tokens';
import { Screen, Text, DoondoMark } from '@/components';
import { haptic } from '@/lib/haptics';
import {
  getNotificationPermissionStatus,
  requestPushPermissionFromLanding,
} from '@/lib/push';
import type { UserRole } from '@/api/types';
import type { AuthStackParamList } from '@/navigation/types';
import { useTheme } from '@/theme/useTheme';
import { useTranslate } from '@/i18n/useTranslate';
import { useLocale } from '@/i18n/LanguageProvider';
import { SUPPORTED_LOCALES, type SupportedLocale } from '@/i18n';

type Nav = NativeStackNavigationProp<AuthStackParamList, 'RolePicker'>;
type Choice = Exclude<UserRole, 'admin'>;
type TFn = (key: string, opts?: Record<string, unknown>) => string;

// eslint-disable-next-line @typescript-eslint/no-var-requires
const FIND_WORK_IMAGE = require('../../../assets/images/find-work-card.jpeg');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const HIRE_WORKERS_IMAGE = require('../../../assets/images/hire-workers-card.jpeg');

// Language toggle on the role picker now cycles through all 5 supported
// locales, persisting via the LanguageProvider so the rest of the app
// stays in sync. The legacy `lang: 'en' | 'hi'` COPY object was replaced
// with i18next-backed t() calls; full translations live in role_picker.* in
// each src/i18n/locales/<code>.json.

export function RolePickerScreen() {
  const navigation = useNavigation<Nav>();
  const { theme, scheme, setScheme } = useTheme();
  const { width } = useWindowDimensions();
  const t = useTranslate();
  const { locale, setLocale } = useLocale();

  const isLight = scheme === 'light';
  const stacked = width < 1120;
  const compact = width < 820;
  // On phones / narrow tablets, the shell must hug the viewport.
  // On wide screens we cap it so the layout doesn't go full-bleed.
  // Subtracting outer padding (xl on either side = 32px on web, 16 on
  // phones) keeps content from clipping at the screen edge.
  const shellWidth = useMemo(() => {
    const outerPad = compact ? spacing.md * 2 : spacing.xl * 2;
    if (width > 1480) return 1360;
    if (width > 1240) return 1240;
    return Math.max(280, width - outerPad);
  }, [width, compact]);

  // For employers, go straight to Signup. For seekers, surface the
  // Solo/Team sub-choice as a bottom sheet first so the choice persists
  // through to the seeker's profile from day one.
  const [seekerChoiceOpen, setSeekerChoiceOpen] = useState(false);

  // Notification permission status for the bell-icon UX. Drives the
  // toast/banner that appears after the user taps the bell.
  const [pushStatus, setPushStatus] = useState<
    'unknown' | 'granted' | 'denied' | 'unsupported' | null
  >(null);
  const [pushBanner, setPushBanner] = useState<string | null>(null);

  async function onTapBell() {
    haptic('selection');
    const before = await getNotificationPermissionStatus();
    if (before === 'granted') {
      setPushStatus('granted');
      setPushBanner(t('role_picker.push_all_set'));
    } else if (before === 'unsupported') {
      setPushStatus('unsupported');
      setPushBanner(t('role_picker.push_dev_build'));
    } else {
      const result = await requestPushPermissionFromLanding();
      setPushStatus(result);
      setPushBanner(
        result === 'granted'
          ? t('role_picker.push_granted')
          : result === 'denied'
            ? t('role_picker.push_denied')
            : t('role_picker.push_dev_build'),
      );
    }
    setTimeout(() => setPushBanner(null), 3500);
  }

  function go(role: Choice) {
    haptic('medium');
    if (role === 'seeker') {
      setSeekerChoiceOpen(true);
      return;
    }
    navigation.navigate('Signup', { role });
  }

  function pickWorkType(workType: 'solo' | 'team', teamSize?: number) {
    haptic('selection');
    setSeekerChoiceOpen(false);
    // "60-second first match" — show seekers real jobs before asking
    // them to sign up. workType + teamSize ride along so Signup still
    // gets the right presets once the seeker continues from preview.
    navigation.navigate(
      'FirstMatchPreview',
      teamSize != null ? { workType, teamSize } : { workType },
    );
  }

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={{
          alignItems: 'center',
          paddingHorizontal: compact ? spacing.md : spacing.xl,
          paddingTop: compact ? spacing.md : spacing.xl,
          paddingBottom: spacing['3xl'],
        }}
      >
        <View
          style={{
            width: '100%',
            maxWidth: shellWidth,
            borderRadius: compact ? 28 : 40,
            overflow: 'hidden',
            backgroundColor: theme.bg.canvas,
            borderWidth: 0.5,
            borderColor: isLight ? theme.border.default : theme.premium.hairline,
          }}
        >
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              inset: 0,
              backgroundColor: theme.bg.canvas,
            }}
          />

          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              top: -120,
              left: -120,
              width: compact ? 280 : 420,
              height: compact ? 280 : 420,
              borderRadius: 999,
              backgroundColor: isLight ? 'rgba(211, 165, 86, 0.10)' : 'rgba(113, 74, 255, 0.08)',
            }}
          />

          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              right: -140,
              bottom: 120,
              width: compact ? 340 : 460,
              height: compact ? 340 : 460,
              borderRadius: 999,
              backgroundColor: isLight ? 'rgba(14, 110, 84, 0.08)' : 'rgba(211, 165, 86, 0.08)',
            }}
          />

          <View
            style={{
              paddingHorizontal: compact ? spacing.lg : spacing['2xl'],
              paddingTop: compact ? spacing.lg : spacing.xl,
              paddingBottom: compact ? spacing.xl : spacing['2xl'],
            }}
          >
            <TopBar
              locale={locale}
              signInLabel={t('role_picker.sign_in')}
              pushOn={pushStatus === 'granted'}
              onToggleLanguage={() => {
                // Cycle through all 5 supported locales.
                const supported = SUPPORTED_LOCALES as readonly SupportedLocale[];
                const idx = supported.indexOf(locale);
                const next = supported[(idx + 1) % supported.length]!;
                void setLocale(next);
                haptic('selection');
              }}
              onToggleTheme={() => {
                setScheme(isLight ? 'dark' : 'light');
                haptic('selection');
              }}
              onTapBell={onTapBell}
              onSignIn={() => navigation.navigate('Login')}
            />

            {pushBanner && (
              <View
                style={{
                  marginHorizontal: compact ? spacing.lg : spacing.xl,
                  marginTop: spacing.sm,
                  paddingVertical: spacing.sm,
                  paddingHorizontal: spacing.md,
                  borderRadius: radii.md,
                  backgroundColor: theme.brand.heroSubtle,
                  borderWidth: 0.5,
                  borderColor: theme.brand.heroBorder,
                }}
              >
                <Text variant="footnote" weight="medium" tone="hero">
                  {pushBanner}
                </Text>
              </View>
            )}

            <View
              style={{
                alignItems: 'center',
                gap: compact ? spacing.xs : spacing.sm,
                paddingTop: compact ? spacing.lg : spacing['2xl'],
                paddingBottom: compact ? spacing.lg : spacing['2xl'],
              }}
            >
              <View
                style={{
                  borderRadius: radii.pill,
                  paddingHorizontal: spacing.lg,
                  paddingVertical: spacing.sm,
                  borderWidth: 0.5,
                  borderColor: isLight ? 'rgba(211, 165, 86, 0.35)' : 'rgba(141, 109, 255, 0.35)',
                  backgroundColor: isLight ? 'rgba(255,255,255,0.72)' : 'rgba(19,16,35,0.72)',
                  // Cap pill width so the longer eyebrow tagline wraps
                  // gracefully into two centred lines instead of pushing
                  // the pill all the way to the screen edges.
                  maxWidth: '92%',
                }}
              >
                <Text
                  variant="footnote"
                  weight="medium"
                  style={{
                    // Lower letter-spacing than the original ALL-CAPS chip
                    // so the longer copy fits without feeling stretched.
                    letterSpacing: 0.8,
                    textAlign: 'center',
                    color: isLight ? '#A97215' : '#B08CFF',
                  }}
                >
                  {t('role_picker.eyebrow')}
                </Text>
              </View>

              <Text
                variant={compact ? 'titleLarge' : 'displayLarge'}
                weight="medium"
                display
                style={{
                  textAlign: 'center',
                  color: theme.text.primary,
                  maxWidth: 700,
                }}
              >
                {t('role_picker.title')}
              </Text>

              <Text
                variant={compact ? 'body' : 'title'}
                tone="secondary"
                style={{
                  textAlign: 'center',
                  maxWidth: 620,
                  lineHeight: compact ? 22 : 34,
                  paddingHorizontal: compact ? spacing.md : 0,
                }}
              >
                {t('role_picker.subtitle')}
              </Text>
            </View>

            <View
              style={{
                // Always side-by-side. On phones each card gets ~half the
                // shell width with a tight gap so both fit on one screen.
                flexDirection: 'row',
                gap: compact ? spacing.sm : spacing.xl,
                alignItems: 'stretch',
              }}
            >
              <JourneyCard
                accent={isLight ? '#2F774B' : '#7C5CFF'}
                image={FIND_WORK_IMAGE}
                badge={t('role_picker.seeker_badge')}
                body={t('role_picker.seeker_body')}
                cta={t('role_picker.seeker_cta')}
                onPress={() => go('seeker')}
              />

              <JourneyCard
                accent={isLight ? '#D29A17' : '#E3AE31'}
                image={HIRE_WORKERS_IMAGE}
                badge={t('role_picker.employer_badge')}
                body={t('role_picker.employer_body')}
                cta={t('role_picker.employer_cta')}
                onPress={() => go('employer')}
              />
            </View>

            <HowItWorks compact={compact} t={t} />

            <ActivityTicker compact={compact} t={t} />

            <BrandFooter compact={compact} t={t} />
          </View>
        </View>
      </ScrollView>

      {seekerChoiceOpen && (
        <SeekerWorkTypeSheet
          onCancel={() => setSeekerChoiceOpen(false)}
          onPick={pickWorkType}
          t={t}
        />
      )}
    </Screen>
  );
}

// ─── Solo/Team picker (bottom sheet) ────────────────────────────────────────

interface SeekerWorkTypeSheetProps {
  onCancel: () => void;
  onPick: (workType: 'solo' | 'team', teamSize?: number) => void;
}

function SeekerWorkTypeSheet({ onCancel, onPick, t }: SeekerWorkTypeSheetProps & { t: TFn }) {
  const { theme } = useTheme();
  const [mode, setMode] = useState<'solo' | 'team'>('solo');
  const [teamSize, setTeamSize] = useState(2);

  return (
    <Pressable
      onPress={onCancel}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'flex-end',
      }}
    >
      {/* eat clicks inside */}
      <Pressable
        onPress={(e) => e.stopPropagation()}
        style={{
          backgroundColor: theme.bg.surface,
          borderTopLeftRadius: 28,
          borderTopRightRadius: 28,
          paddingTop: spacing.lg,
          paddingHorizontal: spacing.xl,
          paddingBottom: spacing['3xl'],
          gap: spacing.lg,
          borderWidth: 0.5,
          borderColor: theme.border.default,
        }}
      >
        {/* Drag handle */}
        <View
          style={{
            alignSelf: 'center',
            width: 36,
            height: 4,
            borderRadius: 2,
            backgroundColor: theme.border.default,
          }}
        />

        <View style={{ gap: spacing.xs }}>
          <Text variant="caption" tone="tertiary" style={{ letterSpacing: 1.2 }}>
            {t('role_picker.sheet_eyebrow')}
          </Text>
          <Text variant="display" weight="medium" display>
            {t('role_picker.sheet_title')}
          </Text>
          <Text variant="footnote" tone="secondary">
            {t('role_picker.sheet_subtitle')}
          </Text>
        </View>

        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          <ChoiceCard
            title={t('role_picker.sheet_solo')}
            sub={t('role_picker.sheet_solo_sub')}
            active={mode === 'solo'}
            onPress={() => setMode('solo')}
          />
          <ChoiceCard
            title={t('role_picker.sheet_team')}
            sub={t('role_picker.sheet_team_sub')}
            active={mode === 'team'}
            onPress={() => setMode('team')}
          />
        </View>

        {mode === 'team' && (
          <View style={{ gap: spacing.sm }}>
            <Text variant="footnote" weight="medium" tone="secondary" style={{ letterSpacing: 1.0 }}>
              {t('role_picker.sheet_team_label')}
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
              {[2, 3, 4, 5, 6, 8, 10, 15, 20].map((n) => {
                const active = teamSize === n;
                return (
                  <Pressable
                    key={n}
                    onPress={() => setTeamSize(n)}
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
                      variant="footnote"
                      weight={active ? 'medium' : 'regular'}
                      style={{ color: active ? theme.brand.hero : theme.text.secondary }}
                    >
                      {n}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <Text variant="caption" tone="tertiary">
              {t('role_picker.sheet_team_more')}
            </Text>
          </View>
        )}

        <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs }}>
          <Pressable
            onPress={onCancel}
            style={{
              flex: 1,
              paddingVertical: spacing.md,
              borderRadius: radii.lg,
              borderWidth: 0.5,
              borderColor: theme.border.default,
              alignItems: 'center',
            }}
          >
            <Text variant="bodyLarge" weight="medium" tone="secondary">
              {t('role_picker.sheet_cancel')}
            </Text>
          </Pressable>
          <Pressable
            onPress={() =>
              onPick(mode, mode === 'team' ? teamSize : undefined)
            }
            style={{
              flex: 2,
              paddingVertical: spacing.md,
              borderRadius: radii.lg,
              backgroundColor: theme.brand.hero,
              alignItems: 'center',
            }}
          >
            <Text variant="bodyLarge" weight="medium" style={{ color: '#FFFDF7' }}>
              {t('role_picker.sheet_continue')}
            </Text>
          </Pressable>
        </View>
      </Pressable>
    </Pressable>
  );
}

function ChoiceCard({
  title,
  sub,
  active,
  onPress,
}: {
  title: string;
  sub: string;
  active: boolean;
  onPress: () => void;
}) {
  const { theme } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={{
        flex: 1,
        paddingVertical: spacing.lg,
        paddingHorizontal: spacing.md,
        borderRadius: radii.lg,
        borderWidth: active ? 1.2 : 0.5,
        borderColor: active ? theme.brand.hero : theme.border.default,
        backgroundColor: active ? theme.brand.heroSubtle : theme.bg.muted,
        gap: 4,
        alignItems: 'flex-start',
      }}
    >
      <Text
        variant="bodyLarge"
        weight="medium"
        style={{ color: active ? theme.brand.hero : theme.text.primary }}
      >
        {title}
      </Text>
      <Text variant="footnote" tone="secondary">
        {sub}
      </Text>
    </Pressable>
  );
}

function TopBar({
  locale,
  signInLabel,
  pushOn,
  onToggleLanguage,
  onToggleTheme,
  onTapBell,
  onSignIn,
}: {
  locale: SupportedLocale;
  signInLabel: string;
  pushOn: boolean;
  onToggleLanguage: () => void;
  onToggleTheme: () => void;
  onTapBell: () => void;
  onSignIn: () => void;
}) {
  const { theme, scheme } = useTheme();
  const { width } = useWindowDimensions();
  const isLight = scheme === 'light';
  const compact = width < 820;
  const tight = width < 420;       // phones — drop the wordmark to save horizontal space
  const logoSize = compact ? 40 : 48;
  const utilSize = compact ? 40 : 48;

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: compact ? spacing.sm : spacing.md,
      }}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: compact ? spacing.sm : spacing.md,
          flexShrink: 1,
        }}
      >
        {/* Brand mark — chunky D + 3 motion bars. Replaces the previous
            tinted "D" placeholder. The mark's color follows the theme so
            it reads cleanly on both dark canvas and light canvas. */}
        <View
          style={{
            width: logoSize,
            height: logoSize,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <DoondoMark
            size={Math.round(logoSize * 0.78)}
            color={isLight ? '#A97215' : '#B08CFF'}
          />
        </View>
        {!tight && (
          <Text
            variant={compact ? 'body' : 'titleLarge'}
            weight="medium"
            style={{
              letterSpacing: compact ? 3 : 6,
              color: theme.text.primary,
            }}
            numberOfLines={1}
          >
            DOONDO
          </Text>
        )}
      </View>

      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: compact ? spacing.xs : spacing.sm,
        }}
      >
        <UtilityButton
          icon="globe"
          label={tight ? undefined : locale.toUpperCase()}
          size={utilSize}
          onPress={onToggleLanguage}
        />
        <UtilityButton
          icon={pushOn ? 'bell' : 'bell-off'}
          size={utilSize}
          onPress={onTapBell}
        />
        <UtilityButton
          icon={isLight ? 'sun' : 'moon'}
          size={utilSize}
          onPress={onToggleTheme}
        />
        <Pressable
          onPress={onSignIn}
          style={{
            minHeight: utilSize,
            borderRadius: radii.pill,
            paddingHorizontal: compact ? spacing.md : spacing.xl,
            justifyContent: 'center',
            alignItems: 'center',
            borderWidth: 0.5,
            borderColor: theme.border.default,
            backgroundColor: theme.bg.surface,
          }}
        >
          <Text variant={compact ? 'footnote' : 'bodyLarge'} weight="medium">
            {signInLabel}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

function UtilityButton({
  icon,
  onPress,
  label,
  size = 48,
}: {
  icon: React.ComponentProps<typeof Feather>['name'];
  onPress: () => void;
  label?: string;
  size?: number;
}) {
  const { theme } = useTheme();

  return (
    <Pressable
      onPress={onPress}
      style={{
        minWidth: size,
        height: size,
        borderRadius: 24,
        paddingHorizontal: label ? spacing.md : 0,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: spacing.xs,
        borderWidth: 0.5,
        borderColor: theme.border.default,
        backgroundColor: theme.bg.surface,
      }}
    >
      <Feather name={icon} size={18} color={theme.text.primary} />
      {label ? (
        <Text variant="caption" weight="medium">
          {label}
        </Text>
      ) : null}
    </Pressable>
  );
}

function JourneyCard({
  image,
  onPress,
}: {
  // Kept for desktop API compatibility but no longer rendered — the JPEG
  // contains the full card design (badge, headline, feature list, CTA strip).
  accent?: string;
  image: number;
  badge?: string;
  body?: string;
  items?: ReadonlyArray<readonly [string, string]>;
  cta?: string;
  onPress: () => void;
}) {
  const { theme, scheme } = useTheme();
  const { width } = useWindowDimensions();
  const compact = width < 820;
  const isLight = scheme === 'light';

  // The JPEGs are designed at ~2:3 portrait (1024×1536 ish). Honor that
  // ratio so the full card renders without cropping any edge content
  // (icon, badge, headline, items, CTA strip, footer tagline).
  const imageAspect = 2 / 3;
  const cardRadius = compact ? 24 : 36;

  return (
    <Pressable
      onPress={onPress}
      style={{
        flex: 1,
        // alignSelf flex-start means the card is sized by its content
        // (the image's natural aspect ratio) instead of stretching to
        // match the row's height — that way the full JPEG always shows.
        alignSelf: 'flex-start',
        aspectRatio: imageAspect,
        borderRadius: cardRadius,
        overflow: 'hidden',
        backgroundColor: theme.bg.surface,
        borderWidth: 0.5,
        borderColor: isLight ? theme.border.default : theme.premium.hairline,
        shadowColor: isLight ? '#B99968' : '#000000',
        shadowOpacity: isLight ? 0.12 : 0.24,
        shadowRadius: 28,
        shadowOffset: { width: 0, height: 16 },
        elevation: 6,
      }}
    >
      <Image
        source={image}
        resizeMode="cover"
        style={{
          width: '100%',
          height: '100%',
          backgroundColor: theme.bg.surface,
        }}
      />
    </Pressable>
  );
}

// ─── How it works (3 mini steps) ────────────────────────────────────────────

function HowItWorks({ compact, t }: { compact: boolean; t: TFn }) {
  const { theme, scheme } = useTheme();
  const isLight = scheme === 'light';
  const steps: ReadonlyArray<readonly [string, string]> = [
    [t('role_picker.how_step1_title'), t('role_picker.how_step1_body')],
    [t('role_picker.how_step2_title'), t('role_picker.how_step2_body')],
    [t('role_picker.how_step3_title'), t('role_picker.how_step3_body')],
  ];

  return (
    <View
      style={{
        marginTop: compact ? spacing.xl : spacing['3xl'],
        gap: compact ? spacing.md : spacing.lg,
      }}
    >
      <View style={{ alignItems: 'center', gap: spacing.xs }}>
        <Text
          variant="footnote"
          weight="medium"
          style={{
            letterSpacing: 1.4,
            color: isLight ? '#A97215' : '#B08CFF',
          }}
        >
          {t('role_picker.how_eyebrow')}
        </Text>
      </View>

      <View
        style={{
          flexDirection: 'row',
          gap: compact ? spacing.xs : spacing.md,
        }}
      >
        {steps.map(([title, sub], idx) => (
          <View
            key={title}
            style={{
              flex: 1,
              borderRadius: compact ? 14 : 18,
              borderWidth: 0.5,
              borderColor: isLight ? theme.border.default : theme.premium.hairline,
              backgroundColor: theme.bg.surface,
              padding: compact ? spacing.sm : spacing.lg,
              gap: compact ? spacing.xs : spacing.sm,
              alignItems: 'flex-start',
            }}
          >
            <View
              style={{
                width: compact ? 28 : 36,
                height: compact ? 28 : 36,
                borderRadius: compact ? 14 : 18,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: isLight
                  ? 'rgba(211, 165, 86, 0.16)'
                  : 'rgba(141, 109, 255, 0.16)',
                borderWidth: 0.5,
                borderColor: theme.premium.hairline,
              }}
            >
              <Text
                variant="caption"
                weight="medium"
                style={{
                  fontSize: compact ? 11 : 13,
                  color: isLight ? '#A97215' : '#B08CFF',
                }}
              >
                0{idx + 1}
              </Text>
            </View>
            <Text
              variant={compact ? 'footnote' : 'bodyLarge'}
              weight="medium"
              numberOfLines={2}
              style={{ color: theme.text.primary }}
            >
              {title}
            </Text>
            {!compact && (
              <Text variant="footnote" tone="secondary" numberOfLines={2}>
                {sub}
              </Text>
            )}
          </View>
        ))}
      </View>
    </View>
  );
}

// ─── Activity ticker (slow horizontal scroll) ───────────────────────────────

/**
 * Live-feeling activity strip. Items are seeded for v1; Phase 5 swaps in
 * real recent activity from /api/v1/activity/recent (derived from
 * application transitions and new job posts).
 *
 * The marquee uses a single Animated.Value translating the text strip
 * leftward, then jumping back. Two copies of the items are rendered
 * back-to-back so the loop wraps without a visible jump.
 */
const TICKER_ITEMS: readonly string[] = [
  'Priya was hired in Indiranagar · 12 min ago',
  'Aarti accepted a salon gig in HSR · just now',
  '7 new jobs in Koramangala this morning',
  'Rahul shortlisted for a delivery role · 3 min ago',
  'A bakery in 12th Main posted a new shift',
  'Dev was hired as an electrician in Domlur',
];

function ActivityTicker({ compact, t }: { compact: boolean; t: TFn }) {
  const { theme, scheme } = useTheme();
  const isLight = scheme === 'light';
  const translate = useRef(new Animated.Value(0)).current;
  const [textWidth, setTextWidth] = useState(0);

  // Once we know the on-screen width of one strip of items, animate
  // the parent leftward by that amount in a 28s loop. Two copies of
  // the strip are rendered side by side; when the first scrolls fully
  // off-screen we reset, and the second is now in position 0 — visually
  // seamless.
  useEffect(() => {
    if (textWidth === 0) return;
    translate.setValue(0);
    const loop = Animated.loop(
      Animated.timing(translate, {
        toValue: -textWidth,
        duration: 28000,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [textWidth, translate]);

  const accent = isLight ? '#A97215' : '#B08CFF';

  // Render one strip. The first copy reports its width via onLayout so
  // we know how far to translate; the second copy renders identically
  // but has unique keys to satisfy React's reconciliation.
  const renderStrip = (idPrefix: string, measure: boolean) => (
    <View
      onLayout={
        measure
          ? (e) => {
              if (textWidth === 0) setTextWidth(e.nativeEvent.layout.width);
            }
          : undefined
      }
      style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.lg }}
    >
      {TICKER_ITEMS.map((item, i) => (
        <View
          key={`${idPrefix}-${i}`}
          style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.lg }}
        >
          <View
            style={{
              width: 4,
              height: 4,
              borderRadius: 2,
              backgroundColor: accent,
              opacity: 0.7,
            }}
          />
          <Text
            variant="footnote"
            tone="secondary"
            style={{ fontSize: compact ? 12 : 13 }}
          >
            {item}
          </Text>
        </View>
      ))}
    </View>
  );

  return (
    <View
      style={{
        marginTop: compact ? spacing.lg : spacing['2xl'],
        marginHorizontal: -(compact ? spacing.lg : spacing['2xl']),
        paddingVertical: compact ? spacing.sm : spacing.md,
        borderTopWidth: 0.5,
        borderBottomWidth: 0.5,
        borderColor: isLight ? theme.border.default : theme.premium.hairline,
        backgroundColor: theme.bg.muted,
        overflow: 'hidden',
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
        <View
          style={{
            paddingHorizontal: compact ? spacing.md : spacing.lg,
            paddingVertical: 4,
            borderRadius: radii.pill,
            backgroundColor: isLight
              ? 'rgba(211, 165, 86, 0.16)'
              : 'rgba(141, 109, 255, 0.18)',
            borderWidth: 0.5,
            borderColor: theme.premium.hairline,
            marginLeft: compact ? spacing.lg : spacing['2xl'],
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <View
            style={{
              width: 6,
              height: 6,
              borderRadius: 3,
              backgroundColor: '#22C55E',
            }}
          />
          <Text
            variant="caption"
            weight="medium"
            style={{
              letterSpacing: 1.0,
              fontSize: compact ? 10 : 11,
              color: accent,
            }}
          >
            {t('role_picker.ticker_live')}
          </Text>
        </View>

        <View style={{ flex: 1, overflow: 'hidden' }}>
          <Animated.View
            style={{
              flexDirection: 'row',
              transform: [{ translateX: translate }],
            }}
          >
            {renderStrip('a', true)}
            {/* second copy back-to-back, separated by the same gap so
                the loop wraps without a visible seam */}
            <View style={{ width: spacing.lg }} />
            {renderStrip('b', false)}
          </Animated.View>
        </View>
      </View>
    </View>
  );
}

// ─── Brand sign-off footer ──────────────────────────────────────────────────

/**
 * Closing signature for the landing screen. The page ENDS here on
 * purpose — empty space below would feel unfinished. Premium products
 * always sign off cleanly: wordmark, tagline, place + version, legal.
 *
 * Legal links are inert for v1 (the routes don't exist yet); Phase 7
 * will hook them up to actual Terms / Privacy / Help screens. For now
 * they exist mostly so app-store reviewers can see them at submission.
 */
function BrandFooter({ compact, t }: { compact: boolean; t: TFn }) {
  const { theme, scheme } = useTheme();
  const isLight = scheme === 'light';
  const version =
    (Constants.expoConfig?.version as string | undefined) ?? '0.1.0';

  return (
    <View
      style={{
        marginTop: compact ? spacing['2xl'] : spacing['3xl'],
        alignItems: 'center',
        gap: compact ? spacing.sm : spacing.md,
        paddingTop: compact ? spacing.lg : spacing.xl,
        paddingBottom: compact ? spacing.lg : spacing.xl,
        borderTopWidth: 0.5,
        borderTopColor: isLight ? theme.border.default : theme.premium.hairline,
      }}
    >
      {/* Brand lockup — mark + wordmark together. Anchors the footer with
          a real visual signature instead of plain text. */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: compact ? 12 : 16,
        }}
      >
        <DoondoMark size={compact ? 28 : 36} />
        <Text
          variant="titleLarge"
          weight="medium"
          style={{
            letterSpacing: compact ? 5 : 8,
            color: theme.text.primary,
            fontSize: compact ? 22 : 28,
          }}
        >
          DOONDO
        </Text>
      </View>

      {/* Tagline — quiet, italic-ish via letterspacing.
          Note: this string is also used as a brand line and shows up on
          screenshots / app-store copy. Emoji renders the same on iOS +
          Android. */}
      <Text
        variant="footnote"
        tone="secondary"
        style={{
          letterSpacing: 0.6,
          textAlign: 'center',
        }}
      >
        {t('role_picker.footer_tagline')}
      </Text>

      {/* Meta line — place + flag, year, version */}
      <Text
        variant="caption"
        tone="tertiary"
        style={{
          letterSpacing: 1.0,
          textAlign: 'center',
        }}
      >
        {t('role_picker.footer_meta', { version })}
      </Text>

      {/* Legal links */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.sm,
          marginTop: spacing.xs,
        }}
      >
        <FooterLink label={t('role_picker.footer_terms')} />
        <FooterDot />
        <FooterLink label={t('role_picker.footer_privacy')} />
        <FooterDot />
        <FooterLink label={t('role_picker.footer_support')} />
      </View>
    </View>
  );
}

function FooterLink({ label, onPress }: { label: string; onPress?: () => void }) {
  const { theme } = useTheme();
  return (
    <Pressable onPress={onPress} hitSlop={8}>
      <Text
        variant="caption"
        weight="medium"
        style={{
          color: theme.text.secondary,
          letterSpacing: 0.4,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function FooterDot() {
  const { theme } = useTheme();
  return (
    <View
      style={{
        width: 3,
        height: 3,
        borderRadius: 1.5,
        backgroundColor: theme.text.tertiary,
        opacity: 0.5,
      }}
    />
  );
}
