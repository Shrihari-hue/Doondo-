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
import {
  clearSosContact,
  getSosContact,
  setSosContact,
  triggerSos,
  type SosContact,
} from '@/lib/sos';
import type { AppStackParamList } from '@/navigation/types';

type Nav = NativeStackNavigationProp<AppStackParamList>;

const HOLD_DURATION_MS = 2000;
const DANGER = '#DC2626';
const DANGER_DARK = '#991B1B';

function SosInner() {
  const { theme } = useTheme();
  const { user } = useAuth();
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();

  const [loading, setLoading] = useState(true);
  const [contact, setContact] = useState<SosContact | null>(null);

  // Setup form state — only used when contact === null OR user taps "Edit".
  const [editing, setEditing] = useState(false);
  const [formName, setFormName] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [saving, setSaving] = useState(false);

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
      Alert.alert('Add a name', "Please enter the contact's name.");
      return;
    }
    if (phone.replace(/[^\d]/g, '').length < 7) {
      Alert.alert('Add a valid phone', 'Please enter a real phone number.');
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
      Alert.alert('Could not save', 'Try again.');
    } finally {
      setSaving(false);
    }
  };

  const onRemoveContact = () => {
    Alert.alert(
      'Remove contact?',
      "We'll clear the saved name and number from this device. SOS will be disabled until you add a new one.",
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
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
    if (!contact) return;
    haptic('warning');
    const result = await triggerSos({
      contact,
      senderName: user?.name ?? 'A Doondo user',
    });
    if (!result.opened) {
      Alert.alert(
        "Couldn't open SMS",
        result.reason ?? 'Please try calling your contact directly.',
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
            Safety SOS
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
            How it works
          </Text>
          <Text
            style={{
              fontSize: 13,
              lineHeight: 19,
              color: theme.text.secondary,
            }}
          >
            If you ever feel unsafe at work, hold the SOS button for 2 seconds.
            Doondo will open your phone&apos;s SMS app pre-filled with your
            location and a help message to your emergency contact. You decide
            whether to send.
          </Text>
        </View>

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
              EMERGENCY CONTACT
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
                  Edit
                </Text>
              </Pressable>
            </View>
            <Pressable
              onPress={onRemoveContact}
              hitSlop={6}
              style={{ marginTop: spacing.sm, alignSelf: 'flex-start' }}
            >
              <Text style={{ fontSize: 12, color: theme.status.danger }}>
                Remove contact
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
              {contact ? 'EDIT CONTACT' : 'ADD EMERGENCY CONTACT'}
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
                placeholder="Contact name (e.g. Amma, Brother)"
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
                placeholder="Phone number (e.g. 9876543210)"
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
                    Cancel
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
                  {saving ? 'Saving…' : 'Save contact'}
                </Text>
              </Pressable>
            </View>
          </View>
        ) : null}

        {/* SOS hold-to-send button */}
        {contact && !editing ? (
          <SosHoldButton onComplete={onTriggerSos} />
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
          Doondo does not send the SMS for you. Your phone&apos;s SMS app opens
          with the message ready — you choose whether to send. For
          life-threatening emergencies, dial{'\n'}<Text style={{ fontWeight: '700' }}>112</Text> directly.
        </Text>
      </ScrollView>
    </Screen>
  );
}

// ─── SOS hold-to-send button ────────────────────────────────────────────────

function SosHoldButton({ onComplete }: { onComplete: () => void }) {
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
          SOS
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
          {pressing ? 'KEEP HOLDING…' : 'PRESS AND HOLD'}
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
        Hold for 2 seconds to open SMS
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
