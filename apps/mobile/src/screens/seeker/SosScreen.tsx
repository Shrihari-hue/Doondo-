/**
 * SosScreen — worker-safety SOS.
 *
 * Two modes:
 *   - SETUP: the seeker hasn't picked an emergency contact yet. We show
 *     a two-field form (name + phone) with a "Save contact" CTA. The
 *     contact lives in expo-secure-store only — never sent to Doondo.
 *   - ARMED: the contact exists. We show the contact at the top and a
 *     big red "Press and hold for 2 seconds" SOS button. On release
 *     after 2s, we trigger the SMS composer.
 *
 * Design rules:
 *   - SOS is never silent — we always open the user's SMS app so they
 *     see what's about to be sent and can cancel. This avoids false
 *     alarms and respects the user's agency in a panic moment.
 *   - SOS never wakes anyone at Doondo HQ — we don't have a 24/7 desk.
 *   - The contact is on-device only; if the user uninstalls and
 *     reinstalls, they re-add it. That's the right privacy default.
 */

import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Easing,
  Pressable,
  ScrollView,
  TextInput,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { spacing, radii } from '@doondo/tokens';
import { Screen, Text, LoadingSpinner } from '@/components';
import { useTheme } from '@/theme/useTheme';
import { SeekerThemeOverride } from '@/theme/SeekerThemeOverride';
import { useAuth } from '@/hooks/useAuth';
import { haptic } from '@/lib/haptics';
import { useTranslate } from '@/i18n/useTranslate';
import {
  clearSosContact,
  getSosContact,
  setSosContact,
  triggerSos,
  type SosContact,
} from '@/lib/sos';
import { sosApi } from '@/api/sos.api';
import { getCurrentCoords } from '@/lib/location';
import { useQuery } from '@tanstack/react-query';
import type { AppStackParamList } from '@/navigation/types';

type Nav = NativeStackNavigationProp<AppStackParamList>;
type TFn = (key: string, opts?: Record<string, unknown>) => string;

const HOLD_DURATION_MS = 2000;
const DANGER = '#DC2626';
const DANGER_DARK = '#991B1B';

function SosInner() {
  const { theme } = useTheme();
  const { user } = useAuth();
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const t = useTranslate();

  const [loading, setLoading] = useState(true);
  const [contact, setContact] = useState<SosContact | null>(null);

  // Setup form state — only used when contact === null OR user taps "Edit".
  const [editing, setEditing] = useState(false);
  const [formName, setFormName] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [saving, setSaving] = useState(false);

  // Server-side Trust Circle status — drives the "X/3 contacts" pill
  // and the upsell to add more contacts.
  const trustQuery = useQuery({
    queryKey: ['trustCircle'],
    queryFn: () => sosApi.getTrustCircle(),
    staleTime: 30_000,
  });

  useEffect(() => {
    (async () => {
      const c = await getSosContact();
      setContact(c);
      if (!c) setEditing(true);
      setLoading(false);
    })();
  }, []);

  const onSaveContact = async () => {
    const name = formName.trim();
    const phone = formPhone.trim();
    if (name.length < 2) {
      Alert.alert(t('sos.add_name_title'), t('sos.add_name_body'));
      return;
    }
    if (phone.replace(/[^\d]/g, '').length < 7) {
      Alert.alert(t('sos.add_phone_title'), t('sos.add_phone_body'));
      return;
    }
    setSaving(true);
    haptic('selection');
    try {
      await setSosContact({ name, phone });
      setContact({ name, phone });
      setEditing(false);
      setFormName('');
      setFormPhone('');
      haptic('success');
    } catch {
      Alert.alert(t('sos.couldnt_save'), t('sos.try_again'));
    } finally {
      setSaving(false);
    }
  };

  const onRemoveContact = () => {
    Alert.alert(
      t('sos.remove_confirm_title'),
      t('sos.remove_confirm_body'),
      [
        { text: t('sos.remove_confirm_cancel'), style: 'cancel' },
        {
          text: t('sos.remove_confirm_ok'),
          style: 'destructive',
          onPress: async () => {
            await clearSosContact();
            setContact(null);
            setEditing(true);
            haptic('warning');
          },
        },
      ],
    );
  };

  const onTriggerSos = async () => {
    haptic('warning');

    // Two-pronged fan-out:
    //   1. Server side — push the user's Trust Circle (matched Doondo
    //      users) + 2 nearest verified peers. Best-effort; failures
    //      don't block the on-device SMS path because the SMS still
    //      works when the seeker's phone has no internet.
    //   2. On-device SMS to the legacy on-device contact (if set).
    //      Opens the user's SMS composer so they see what's being
    //      sent and can cancel.
    let reach: { trustContactsPushed: number; peersPushed: number } | null = null;
    let unmatchedFromServer: Array<{ name: string; phone: string }> = [];
    try {
      const coords = await getCurrentCoords().catch(() => null);
      const res = await sosApi.trigger({
        lat: coords?.lat,
        lng: coords?.lng,
      });
      reach = {
        trustContactsPushed: res.reach.trustContactsPushed,
        peersPushed: res.reach.peersPushed,
      };
      unmatchedFromServer = res.unmatchedContacts.map((c) => ({
        name: c.name,
        phone: c.phone,
      }));
    } catch {
      // Network or auth blip — fall through to local SMS. We surface
      // the silent failure in the toast below if BOTH paths fail.
    }

    // On-device SMS — primary path for the legacy contact AND for any
    // Trust Circle contact that didn't match a Doondo user. Loop
    // sequentially so the OS composer can present each in turn.
    const onDeviceTargets: SosContact[] = [];
    if (contact) onDeviceTargets.push(contact);
    for (const c of unmatchedFromServer) {
      if (!onDeviceTargets.find((x) => x.phone === c.phone)) {
        onDeviceTargets.push(c);
      }
    }

    let smsOpened = false;
    for (const target of onDeviceTargets) {
      const r = await triggerSos({
        contact: target,
        senderName: user?.name ?? t('sos.sender_fallback_name'),
      });
      if (r.opened) {
        smsOpened = true;
        break; // Once one composer opens, let the user send/cancel before iterating.
      }
    }

    // Summary toast.
    if (reach) {
      const parts: string[] = [];
      if (reach.trustContactsPushed > 0) {
        parts.push(
          `${reach.trustContactsPushed} trust contact${reach.trustContactsPushed === 1 ? '' : 's'} notified`,
        );
      }
      if (reach.peersPushed > 0) {
        parts.push(
          `${reach.peersPushed} nearby peer${reach.peersPushed === 1 ? '' : 's'} alerted`,
        );
      }
      if (smsOpened) parts.push('SMS draft opened');
      Alert.alert(
        'Alert sent',
        parts.length > 0 ? parts.join(' · ') : 'Help is on the way.',
      );
    } else if (smsOpened) {
      // Server didn't respond but the local SMS did.
      Alert.alert('SMS draft opened', 'Send the message to alert your contact.');
    } else {
      Alert.alert(
        t('sos.couldnt_open_sms_title'),
        t('sos.couldnt_open_sms_default'),
      );
    }
  };

  if (loading) {
    return (
      <Screen>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <LoadingSpinner />
        </View>
      </Screen>
    );
  }

  return (
    <Screen edges={[]}>
      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + spacing.md,
          paddingBottom: insets.bottom + spacing['3xl'],
        }}
        keyboardShouldPersistTaps="handled"
      >
        {/* Top bar */}
        <View
          style={{
            paddingHorizontal: spacing.xl,
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing.md,
            marginBottom: spacing.lg,
          }}
        >
          <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
            <Text style={{ fontSize: 22, color: theme.text.primary }}>←</Text>
          </Pressable>
          <Text
            style={{
              fontSize: 20,
              fontWeight: '700',
              color: theme.text.primary,
              flex: 1,
              letterSpacing: -0.3,
            }}
          >
            {t('sos.header_title')}
          </Text>
        </View>

        {/* Explainer */}
        <View
          style={{
            marginHorizontal: spacing.xl,
            padding: spacing.lg,
            borderRadius: radii.lg,
            backgroundColor: theme.status.warningSubtle,
            borderWidth: 0.5,
            borderColor: theme.border.subtle,
            marginBottom: spacing.xl,
            gap: spacing.xs,
          }}
        >
          <Text style={{ fontSize: 14, fontWeight: '700', color: theme.text.primary }}>
            {t('sos.how_it_works_title')}
          </Text>
          <Text
            style={{
              fontSize: 13,
              lineHeight: 19,
              color: theme.text.secondary,
            }}
          >
            {t('sos.how_it_works_body')}
          </Text>
        </View>

        {/* Trust Circle status — server-side fan-out summary */}
        <Pressable
          onPress={() => {
            haptic('selection');
            navigation.navigate('TrustCircle');
          }}
          style={{
            marginHorizontal: spacing.xl,
            padding: spacing.lg,
            borderRadius: radii.lg,
            backgroundColor: theme.bg.surface,
            borderWidth: 0.5,
            borderColor: theme.border.default,
            marginBottom: spacing.xl,
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing.md,
          }}
        >
          <View
            style={{
              width: 40,
              height: 40,
              borderRadius: 20,
              backgroundColor: theme.brand.heroSubtle,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text style={{ fontSize: 18 }}>🛡️</Text>
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text variant="bodyLarge" weight="medium">
              Trust Circle
            </Text>
            <Text variant="footnote" tone="secondary">
              {trustQuery.data
                ? `${trustQuery.data.trustCircle.length}/3 contacts saved${trustQuery.data.isPeerResponder ? ' · peer responder on' : ''}`
                : 'Up to 3 contacts get pushed when you SOS'}
            </Text>
          </View>
          <Text style={{ fontSize: 13, fontWeight: '600', color: theme.brand.hero }}>
            Manage ›
          </Text>
        </Pressable>

        {/* Contact card */}
        {!editing && contact ? (
          <View style={{ paddingHorizontal: spacing.xl, marginBottom: spacing.xl }}>
            <Text
              style={{
                fontSize: 11,
                fontWeight: '600',
                letterSpacing: 1.6,
                color: theme.text.tertiary,
                marginBottom: spacing.sm,
              }}
            >
              {t('sos.emergency_contact')}
            </Text>
            <View
              style={{
                backgroundColor: theme.bg.surface,
                borderRadius: radii.lg,
                borderWidth: 0.5,
                borderColor: theme.border.subtle,
                padding: spacing.lg,
                flexDirection: 'row',
                alignItems: 'center',
                gap: spacing.md,
              }}
            >
              <View
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 22,
                  backgroundColor: theme.status.successSubtle,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text style={{ fontSize: 20 }}>👤</Text>
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text
                  style={{
                    fontSize: 16,
                    fontWeight: '600',
                    color: theme.text.primary,
                  }}
                  numberOfLines={1}
                >
                  {contact.name}
                </Text>
                <Text
                  style={{ fontSize: 13, color: theme.text.secondary }}
                  numberOfLines={1}
                >
                  {contact.phone}
                </Text>
              </View>
              <Pressable
                onPress={() => {
                  setFormName(contact.name);
                  setFormPhone(contact.phone);
                  setEditing(true);
                  haptic('selection');
                }}
                hitSlop={8}
              >
                <Text
                  style={{
                    fontSize: 13,
                    fontWeight: '600',
                    color: theme.brand.hero,
                  }}
                >
                  {t('sos.edit')}
                </Text>
              </Pressable>
            </View>
            <Pressable
              onPress={onRemoveContact}
              hitSlop={6}
              style={{ marginTop: spacing.sm, alignSelf: 'flex-start' }}
            >
              <Text style={{ fontSize: 12, color: theme.status.danger }}>
                {t('sos.remove_contact')}
              </Text>
            </Pressable>
          </View>
        ) : null}

        {/* Setup form */}
        {editing ? (
          <View style={{ paddingHorizontal: spacing.xl, marginBottom: spacing.xl }}>
            <Text
              style={{
                fontSize: 11,
                fontWeight: '600',
                letterSpacing: 1.6,
                color: theme.text.tertiary,
                marginBottom: spacing.sm,
              }}
            >
              {contact ? t('sos.edit_contact') : t('sos.add_contact')}
            </Text>
            <View
              style={{
                gap: spacing.sm,
                backgroundColor: theme.bg.surface,
                borderRadius: radii.lg,
                borderWidth: 0.5,
                borderColor: theme.border.subtle,
                padding: spacing.lg,
              }}
            >
              <TextInput
                value={formName}
                onChangeText={setFormName}
                placeholder={t('sos.name_placeholder')}
                placeholderTextColor={theme.text.tertiary}
                style={{
                  fontSize: 15,
                  color: theme.text.primary,
                  paddingVertical: spacing.sm,
                  borderBottomWidth: 0.5,
                  borderBottomColor: theme.border.subtle,
                }}
                autoCapitalize="words"
                returnKeyType="next"
              />
              <TextInput
                value={formPhone}
                onChangeText={setFormPhone}
                placeholder={t('sos.phone_placeholder')}
                placeholderTextColor={theme.text.tertiary}
                keyboardType="phone-pad"
                style={{
                  fontSize: 15,
                  color: theme.text.primary,
                  paddingVertical: spacing.sm,
                }}
                returnKeyType="done"
                onSubmitEditing={onSaveContact}
              />
            </View>
            <View
              style={{
                flexDirection: 'row',
                gap: spacing.sm,
                marginTop: spacing.md,
              }}
            >
              {contact ? (
                <Pressable
                  onPress={() => {
                    setEditing(false);
                    setFormName('');
                    setFormPhone('');
                    haptic('light');
                  }}
                  style={({ pressed }) => ({
                    flex: 1,
                    paddingVertical: spacing.md,
                    borderRadius: radii.pill,
                    alignItems: 'center',
                    borderWidth: 1,
                    borderColor: theme.border.default,
                    opacity: pressed ? 0.7 : 1,
                  })}
                >
                  <Text
                    style={{ fontSize: 15, fontWeight: '600', color: theme.text.primary }}
                  >
                    {t('sos.cancel')}
                  </Text>
                </Pressable>
              ) : null}
              <Pressable
                onPress={onSaveContact}
                disabled={saving}
                style={({ pressed }) => ({
                  flex: 1,
                  paddingVertical: spacing.md,
                  borderRadius: radii.pill,
                  alignItems: 'center',
                  backgroundColor: theme.brand.hero,
                  opacity: saving ? 0.5 : pressed ? 0.85 : 1,
                })}
              >
                <Text style={{ fontSize: 15, fontWeight: '700', color: '#FFFFFF' }}>
                  {saving ? t('sos.saving') : t('sos.save')}
                </Text>
              </Pressable>
            </View>
          </View>
        ) : null}

        {/* SOS hold-to-send button */}
        {contact && !editing ? (
          <SosHoldButton onComplete={onTriggerSos} t={t} />
        ) : null}

        {/* Disclaimer */}
        <Text
          style={{
            fontSize: 11,
            color: theme.text.tertiary,
            textAlign: 'center',
            paddingHorizontal: spacing.xl,
            marginTop: spacing.xl,
            lineHeight: 16,
          }}
        >
          {t('sos.disclaimer_pre')}{'\n'}<Text style={{ fontWeight: '700' }}>{t('sos.disclaimer_emergency_number')}</Text>{t('sos.disclaimer_post')}
        </Text>
      </ScrollView>
    </Screen>
  );
}

// ─── SOS hold-to-send button ────────────────────────────────────────────────

function SosHoldButton({ onComplete, t }: { onComplete: () => void; t: TFn }) {
  const progress = useRef(new Animated.Value(0)).current;
  const [pressing, setPressing] = useState(false);
  const fired = useRef(false);

  const startHold = () => {
    fired.current = false;
    setPressing(true);
    haptic('selection');
    Animated.timing(progress, {
      toValue: 1,
      duration: HOLD_DURATION_MS,
      easing: Easing.linear,
      useNativeDriver: false,
    }).start(({ finished }) => {
      if (finished && !fired.current) {
        fired.current = true;
        haptic('success');
        onComplete();
      }
    });
  };

  const cancelHold = () => {
    setPressing(false);
    progress.stopAnimation();
    Animated.timing(progress, {
      toValue: 0,
      duration: 180,
      useNativeDriver: false,
    }).start();
  };

  const progressWidth = progress.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  return (
    <View style={{ alignItems: 'center', marginTop: spacing.lg }}>
      <Pressable
        onPressIn={startHold}
        onPressOut={cancelHold}
        style={({ pressed }) => ({
          width: 220,
          height: 220,
          borderRadius: 110,
          backgroundColor: pressed ? DANGER_DARK : DANGER,
          alignItems: 'center',
          justifyContent: 'center',
          shadowColor: DANGER,
          shadowOpacity: 0.35,
          shadowRadius: 24,
          shadowOffset: { width: 0, height: 8 },
          elevation: 8,
        })}
      >
        <Text
          style={{
            fontSize: 48,
            fontWeight: '900',
            color: '#FFFFFF',
            letterSpacing: 3,
          }}
        >
          {t('sos.sos_label')}
        </Text>
        <Text
          style={{
            fontSize: 12,
            color: 'rgba(255,255,255,0.9)',
            marginTop: 6,
            fontWeight: '600',
            letterSpacing: 0.4,
          }}
        >
          {pressing ? t('sos.sos_pressing') : t('sos.sos_press_and_hold')}
        </Text>
      </Pressable>

      {/* Progress bar */}
      <View
        style={{
          marginTop: spacing.lg,
          width: 220,
          height: 6,
          borderRadius: 3,
          backgroundColor: 'rgba(220,38,38,0.18)',
          overflow: 'hidden',
        }}
      >
        <Animated.View
          style={{
            height: '100%',
            backgroundColor: DANGER,
            width: progressWidth,
          }}
        />
      </View>
      <Text
        style={{
          fontSize: 12,
          color: '#7C2D12',
          marginTop: spacing.sm,
          fontWeight: '500',
        }}
      >
        {t('sos.hold_two_seconds_hint')}
      </Text>
    </View>
  );
}

// ─── Export ──────────────────────────────────────────────────────────────────

export function SosScreen() {
  return (
    <SeekerThemeOverride>
      <SosInner />
    </SeekerThemeOverride>
  );
}
