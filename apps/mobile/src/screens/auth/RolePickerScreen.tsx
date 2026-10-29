import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Image,
  Modal,
  Pressable,
  ScrollView,
  View,
  useWindowDimensions,
} from 'react-native';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { radii, spacing } from '@doondo/tokens';
import { Text } from '@/components';
import { haptic } from '@/lib/haptics';
import type { AuthStackParamList } from '@/navigation/types';
import { useTheme } from '@/theme/useTheme';
import { useTranslate } from '@/i18n/useTranslate';
import { useLocale } from '@/i18n/LanguageProvider';
import { SUPPORTED_LOCALES, type SupportedLocale } from '@/i18n';
import {
  useJobSearchLocationStore,
  type JobSearchPlace,
} from '@/stores/jobSearchLocation.store';

type Nav = NativeStackNavigationProp<AuthStackParamList, 'RolePicker'>;
type TFn = (key: string, opts?: Record<string, unknown>) => string;

// eslint-disable-next-line @typescript-eslint/no-var-requires
const CITY_IMAGE = require('../../../assets/images/welcome-city.jpg');

// ─── Palette (this screen is always dark-on-photo, independent of theme) ────
const INK = '#0E1A14'; // deep green-black used for the fade + dark text
const LIME = '#DCF57E';
const LIME_SOFT = '#F1FBCB';
const WHITE = '#FFFFFF';
const WHITE_DIM = 'rgba(255,255,255,0.72)';
const GLASS = 'rgba(32,34,30,0.62)';
const GLASS_BORDER = 'rgba(255,255,255,0.16)';

/** Cities offered in the picker. Picking one re-centres job search there. */
const CITIES: readonly JobSearchPlace[] = [
  { label: 'Bengaluru', lat: 12.9716, lng: 77.5946 },
  { label: 'Mumbai', lat: 19.076, lng: 72.8777 },
  { label: 'Delhi NCR', lat: 28.6139, lng: 77.209 },
  { label: 'Hyderabad', lat: 17.385, lng: 78.4867 },
  { label: 'Chennai', lat: 13.0827, lng: 80.2707 },
  { label: 'Pune', lat: 18.5204, lng: 73.8567 },
  { label: 'Kolkata', lat: 22.5726, lng: 88.3639 },
  { label: 'Ahmedabad', lat: 23.0225, lng: 72.5714 },
  { label: 'Kochi', lat: 9.9312, lng: 76.2673 },
  { label: 'Jaipur', lat: 26.9124, lng: 75.7873 },
];

/** Illustrative pins floating over the skyline. */
interface PinSpec {
  title: string;
  area: string;
  km: string;
  icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  iconBg: string;
  pin: string;
  /** Card top-left as a fraction of the pin region. */
  x: number;
  y: number;
  avatars: readonly string[];
}

const PINS: readonly PinSpec[] = [
  { title: 'Cafe Crew', area: 'Indiranagar', km: '1.2 km', icon: 'coffee-outline', iconBg: '#FCE7C3', pin: '#F6B73C', x: 0.04, y: 0.0, avatars: ['#C08457', '#8D5A3B', '#A86B4A'] },
  { title: 'Store Assistant', area: 'HSR Layout', km: '2.5 km', icon: 'shopping-outline', iconBg: '#B9F3D2', pin: '#4ADE80', x: 0.53, y: 0.3, avatars: ['#9C6644', '#7F5539', '#B07D62'] },
  { title: 'Delivery Partner', area: 'Koramangala', km: '1.8 km', icon: 'moped-outline', iconBg: '#FFC9C9', pin: '#F87171', x: 0.17, y: 0.58, avatars: ['#A47148', '#80583E', '#C9936B'] },
  { title: 'Office Helper', area: 'Marathahalli', km: '3.4 km', icon: 'laptop', iconBg: '#DCD3FF', pin: '#A78BFA', x: 0.53, y: 1.0, avatars: ['#8B5E3C', '#B5835A', '#6F4E37'] },
];

const CARD_H = 66;
const STEM_H = 34;
const PIN_TOTAL = CARD_H + STEM_H + 16;

export function RolePickerScreen() {
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const t = useTranslate();
  const { locale, setLocale } = useLocale();
  const setPlace = useJobSearchLocationStore((st) => st.setPlace);

  const [seekerChoiceOpen, setSeekerChoiceOpen] = useState(false);
  const [cityOpen, setCityOpen] = useState(false);
  // null = "use my current location" (GPS). Defaults to Bengaluru.
  const [city, setCity] = useState<JobSearchPlace | null>(CITIES[0]!);

  // Pins live between the logo block and the headline block.
  const [headerBottom, setHeaderBottom] = useState(0);
  const [contentTop, setContentTop] = useState(0);
  const pinRegion = Math.max(0, contentTop - headerBottom);
  const pinsToShow =
    pinRegion >= 330 ? PINS : pinRegion >= 236 ? PINS.slice(0, 3) : pinRegion >= 120 ? PINS.slice(0, 2) : [];

  const compactH = height < 740;

  function explore() {
    haptic('medium');
    void setPlace(city);
    setSeekerChoiceOpen(true);
  }

  function pickWorkType(workType: 'solo' | 'team', teamSize?: number) {
    haptic('selection');
    setSeekerChoiceOpen(false);
    navigation.navigate(
      'FirstMatchPreview',
      teamSize != null ? { workType, teamSize } : { workType },
    );
  }

  function cycleLanguage() {
    const supported = SUPPORTED_LOCALES as readonly SupportedLocale[];
    const idx = supported.indexOf(locale);
    void setLocale(supported[(idx + 1) % supported.length]!);
    haptic('selection');
  }

  return (
    <View style={{ flex: 1, backgroundColor: INK }}>
      <StatusBar style="light" />

      {/* Full-bleed skyline, anchored to the top */}
      <Image
        source={CITY_IMAGE}
        resizeMode="cover"
        style={{ position: 'absolute', top: 0, left: 0, width, height: Math.max(height, width * 2.2) }}
      />
      {/* Soft sky wash behind the logo + deep fade into the content */}
      <LinearGradient
        pointerEvents="none"
        colors={['rgba(255,244,220,0.55)', 'rgba(255,244,220,0)', 'rgba(14,26,20,0)', 'rgba(14,26,20,0.85)', INK]}
        locations={[0, 0.2, 0.42, 0.62, 0.74]}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
      />

      {/* Top utilities — language + sign in */}
      <View
        style={{
          paddingTop: insets.top + 6,
          paddingHorizontal: spacing.lg,
          flexDirection: 'row',
          justifyContent: 'space-between',
        }}
      >
        <GlassPill onPress={cycleLanguage}>
          <Feather name="globe" size={14} color={INK} />
          <Text variant="caption" weight="semibold" style={{ color: INK }}>
            {locale.toUpperCase()}
          </Text>
        </GlassPill>
        <GlassPill onPress={() => navigation.navigate('Login')}>
          <Text variant="footnote" weight="semibold" style={{ color: INK }}>
            {t('role_picker.sign_in')}
          </Text>
        </GlassPill>
      </View>

      {/* Logo + tagline */}
      <View
        onLayout={(e) => setHeaderBottom(e.nativeEvent.layout.y + e.nativeEvent.layout.height)}
        style={{ alignItems: 'center', marginTop: compactH ? 2 : 10 }}
      >
        <Wordmark size={compactH ? 40 : 48} />
        <Text
          style={{
            marginTop: 8,
            fontSize: compactH ? 11 : 12,
            letterSpacing: 5,
            color: 'rgba(14,26,20,0.75)',
            fontWeight: '600',
          }}
        >
          {t('role_picker.hero_tagline')}
        </Text>
      </View>

      {/* Floating job pins over the skyline */}
      {contentTop > 0 && headerBottom > 0 && (
        <View
          pointerEvents="none"
          style={{ position: 'absolute', left: 0, right: 0, top: headerBottom + 4, height: pinRegion }}
        >
          {pinsToShow.map((p, i) => {
            const n = pinsToShow.length;
            // Re-space vertically when fewer pins fit.
            const yFrac = n === PINS.length ? p.y : i / Math.max(1, n - 1);
            return (
              <FloatingPin
                key={p.title}
                spec={p}
                delay={i * 450}
                left={p.x * width}
                top={yFrac * Math.max(0, pinRegion - PIN_TOTAL)}
                maxWidth={Math.min(184, width * 0.45)}
              />
            );
          })}
        </View>
      )}

      {/* Bottom content */}
      <View style={{ flex: 1 }} />
      <View
        onLayout={(e) => setContentTop(e.nativeEvent.layout.y)}
        style={{
          paddingHorizontal: spacing.xl,
          paddingBottom: insets.bottom + (compactH ? spacing.sm : spacing.md),
        }}
      >
        <Text
          style={{
            color: WHITE,
            fontSize: compactH ? 34 : 40,
            lineHeight: compactH ? 38 : 44,
            fontWeight: '800',
            letterSpacing: -1.2,
          }}
        >
          {t('role_picker.hero_title_1')}
        </Text>
        <Text
          style={{
            color: LIME,
            fontSize: compactH ? 34 : 40,
            lineHeight: compactH ? 40 : 46,
            fontWeight: '800',
            letterSpacing: -1.2,
          }}
        >
          {t('role_picker.hero_title_2')}
        </Text>
        <Text
          style={{
            color: WHITE_DIM,
            fontSize: compactH ? 14 : 15,
            lineHeight: compactH ? 19 : 21,
            marginTop: spacing.xs,
            maxWidth: 330,
          }}
        >
          {t('role_picker.hero_subtitle')}
        </Text>

        {/* City selector */}
        <Pressable
          onPress={() => {
            haptic('selection');
            setCityOpen(true);
          }}
          accessibilityRole="button"
          style={{
            marginTop: compactH ? spacing.md : spacing.lg,
            height: 50,
            borderRadius: 25,
            borderWidth: 1,
            borderColor: 'rgba(255,255,255,0.22)',
            backgroundColor: 'rgba(255,255,255,0.06)',
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: spacing.lg,
            gap: spacing.sm,
          }}
        >
          <MaterialCommunityIcons name="map-marker" size={20} color={WHITE} />
          <Text style={{ color: WHITE, fontSize: 16, fontWeight: '500' }}>
            {city?.label ?? t('role_picker.city_near_me')}
          </Text>
          <Feather name="chevron-down" size={18} color={WHITE} />
        </Pressable>

        {/* Primary CTA */}
        <Pressable onPress={explore} accessibilityRole="button" style={{ marginTop: spacing.sm }}>
          <LinearGradient
            colors={[LIME, LIME_SOFT]}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={{
              height: 54,
              borderRadius: 27,
              flexDirection: 'row',
              alignItems: 'center',
              paddingLeft: spacing.xl,
              paddingRight: 6,
            }}
          >
            <Text style={{ flex: 1, textAlign: 'center', color: INK, fontSize: 17, fontWeight: '700' }}>
              {t('role_picker.explore_cta')}
            </Text>
            <View
              style={{
                width: 44,
                height: 44,
                borderRadius: 22,
                backgroundColor: '#14261C',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Feather name="arrow-right" size={22} color={WHITE} />
            </View>
          </LinearGradient>
        </Pressable>

        {/* Employers still need a door in */}
        <Pressable
          onPress={() => {
            haptic('medium');
            navigation.navigate('Signup', { role: 'employer' });
          }}
          hitSlop={8}
          style={{ alignSelf: 'center', marginTop: spacing.sm }}
        >
          <Text style={{ color: WHITE_DIM, fontSize: 13 }}>
            {t('role_picker.hire_prompt')}{' '}
            <Text style={{ color: LIME, fontSize: 13, fontWeight: '600' }}>
              {t('role_picker.hire_link')} →
            </Text>
          </Text>
        </Pressable>

        {/* Feature strip */}
        <View
          style={{
            flexDirection: 'row',
            marginTop: compactH ? spacing.md : spacing.lg,
            alignItems: 'center',
          }}
        >
          <Feature icon="zap" a={t('role_picker.feature_realtime_a')} b={t('role_picker.feature_realtime_b')} />
          <Divider />
          <Feature icon="shield" a={t('role_picker.feature_verified_a')} b={t('role_picker.feature_verified_b')} accent />
          <Divider />
          <Feature icon="map-pin" a={t('role_picker.feature_local_a')} b={t('role_picker.feature_local_b')} accent />
        </View>
      </View>

      <CitySheet
        visible={cityOpen}
        selected={city}
        onClose={() => setCityOpen(false)}
        onPick={(c) => {
          haptic('selection');
          setCity(c);
          setCityOpen(false);
        }}
        t={t}
      />

      {seekerChoiceOpen && (
        <SeekerWorkTypeSheet
          onCancel={() => setSeekerChoiceOpen(false)}
          onPick={pickWorkType}
          t={t}
        />
      )}
    </View>
  );
}

// ─── Wordmark: D [pin] N D O ────────────────────────────────────────────────

function Wordmark({ size }: { size: number }) {
  const letter = { fontSize: size, lineHeight: size * 1.1, fontWeight: '900' as const, color: INK, letterSpacing: -1 };
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      <Text style={letter}>D</Text>
      <View style={{ width: size * 0.78, height: size, alignItems: 'center', justifyContent: 'center', marginHorizontal: 1 }}>
        <MaterialCommunityIcons name="map-marker" size={size * 1.02} color="#7ED321" />
        <View
          style={{
            position: 'absolute',
            top: size * 0.24,
            width: size * 0.3,
            height: size * 0.3,
            borderRadius: size,
            backgroundColor: INK,
          }}
        />
      </View>
      <Text style={letter}>ONDO</Text>
    </View>
  );
}

// ─── Floating pin card ──────────────────────────────────────────────────────

function FloatingPin({
  spec,
  left,
  top,
  maxWidth,
  delay,
}: {
  spec: PinSpec;
  left: number;
  top: number;
  maxWidth: number;
  delay: number;
}) {
  const float = useRef(new Animated.Value(0)).current;
  const appear = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(appear, {
      toValue: 1,
      duration: 500,
      delay: 200 + delay,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(float, { toValue: 1, duration: 2200, delay, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(float, { toValue: 0, duration: 2200, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [appear, float, delay]);

  const translateY = Animated.add(
    float.interpolate({ inputRange: [0, 1], outputRange: [0, -5] }),
    appear.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }),
  );

  return (
    <Animated.View
      style={{
        position: 'absolute',
        left,
        top,
        width: maxWidth,
        opacity: appear,
        transform: [{ translateY }],
      }}
    >
      <View
        style={{
          height: CARD_H,
          borderRadius: 18,
          backgroundColor: GLASS,
          borderWidth: 1,
          borderColor: GLASS_BORDER,
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: 10,
          gap: 9,
        }}
      >
        <View
          style={{
            width: 38,
            height: 38,
            borderRadius: 19,
            backgroundColor: spec.iconBg,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <MaterialCommunityIcons name={spec.icon} size={20} color={INK} />
        </View>
        <View style={{ flex: 1 }}>
          <Text numberOfLines={1} style={{ color: WHITE, fontSize: 13, fontWeight: '700' }}>
            {spec.title}
          </Text>
          <Text numberOfLines={1} style={{ color: WHITE_DIM, fontSize: 11 }}>
            {spec.area}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 3 }}>
            {spec.avatars.map((c, i) => (
              <View
                key={i}
                style={{
                  width: 15,
                  height: 15,
                  borderRadius: 8,
                  backgroundColor: c,
                  borderWidth: 1,
                  borderColor: 'rgba(255,255,255,0.9)',
                  marginLeft: i === 0 ? 0 : -5,
                }}
              />
            ))}
            <View style={{ flex: 1 }} />
            <Text style={{ color: WHITE_DIM, fontSize: 11 }}>{spec.km}</Text>
          </View>
        </View>
      </View>
      {/* Stem + glowing dot */}
      <View style={{ alignItems: 'center' }}>
        <View style={{ width: 2, height: STEM_H, backgroundColor: spec.pin, opacity: 0.85 }} />
        <View
          style={{
            width: 16,
            height: 16,
            borderRadius: 8,
            backgroundColor: WHITE,
            borderWidth: 4,
            borderColor: spec.pin,
            marginTop: -2,
            shadowColor: spec.pin,
            shadowOpacity: 0.9,
            shadowRadius: 8,
            shadowOffset: { width: 0, height: 0 },
            elevation: 6,
          }}
        />
      </View>
    </Animated.View>
  );
}

// ─── Small pieces ───────────────────────────────────────────────────────────

function GlassPill({ children, onPress }: { children: React.ReactNode; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={6}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        height: 34,
        paddingHorizontal: 14,
        borderRadius: radii.pill,
        backgroundColor: 'rgba(255,255,255,0.45)',
        borderWidth: 0.5,
        borderColor: 'rgba(255,255,255,0.7)',
      }}
    >
      {children}
    </Pressable>
  );
}

function Feature({
  icon,
  a,
  b,
  accent = false,
}: {
  icon: React.ComponentProps<typeof Feather>['name'];
  a: string;
  b: string;
  accent?: boolean;
}) {
  return (
    <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <Feather name={icon} size={18} color={WHITE} />
      <View style={{ flexShrink: 1 }}>
        <Text style={{ color: accent ? LIME : WHITE, fontSize: 11, lineHeight: 15 }} numberOfLines={1}>
          {a}
        </Text>
        <Text style={{ color: WHITE_DIM, fontSize: 11, lineHeight: 15 }} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.85}>
          {b}
        </Text>
      </View>
    </View>
  );
}

function Divider() {
  return <View style={{ width: 1, height: 32, backgroundColor: 'rgba(255,255,255,0.18)', marginHorizontal: 6 }} />;
}

// ─── City picker sheet ──────────────────────────────────────────────────────

function CitySheet({
  visible,
  selected,
  onClose,
  onPick,
  t,
}: {
  visible: boolean;
  selected: JobSearchPlace | null;
  onClose: () => void;
  onPick: (c: JobSearchPlace | null) => void;
  t: TFn;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable onPress={onClose} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
        <Pressable
          onPress={(e) => e.stopPropagation()}
          style={{
            backgroundColor: '#13211A',
            borderTopLeftRadius: 28,
            borderTopRightRadius: 28,
            paddingTop: spacing.md,
            paddingBottom: insets.bottom + spacing.lg,
            maxHeight: '75%',
            borderWidth: 0.5,
            borderColor: GLASS_BORDER,
          }}
        >
          <View style={{ alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.25)' }} />
          <Text style={{ color: WHITE, fontSize: 20, fontWeight: '700', paddingHorizontal: spacing.xl, marginTop: spacing.md, marginBottom: spacing.sm }}>
            {t('role_picker.city_sheet_title')}
          </Text>
          <ScrollView>
            <CityRow
              label={t('role_picker.city_use_location')}
              icon="crosshairs-gps"
              active={selected === null}
              onPress={() => onPick(null)}
            />
            {CITIES.map((c) => (
              <CityRow
                key={c.label}
                label={c.label}
                icon="map-marker-outline"
                active={selected?.label === c.label}
                onPress={() => onPick(c)}
              />
            ))}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function CityRow({
  label,
  icon,
  active,
  onPress,
}: {
  label: string;
  icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        paddingHorizontal: spacing.xl,
        paddingVertical: 14,
      }}
    >
      <MaterialCommunityIcons name={icon} size={20} color={active ? LIME : WHITE_DIM} />
      <Text style={{ flex: 1, color: active ? LIME : WHITE, fontSize: 16, fontWeight: active ? '600' : '400' }}>
        {label}
      </Text>
      {active && <Feather name="check" size={18} color={LIME} />}
    </Pressable>
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

